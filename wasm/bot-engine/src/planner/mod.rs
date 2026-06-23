use std::collections::VecDeque;

use crate::{host_now_ms, BIT_WORDS, BOARD_LEN, DIRS, ENEMY_LEN, INF, MAX_DANGER_TICKS};

mod board;
mod core;
mod doors;
mod fallback;
mod food;
mod movement;
mod smile;
mod space;

#[cfg(test)]
mod tests;

#[derive(Clone, Copy)]
struct BoardBits {
    words: [u64; BIT_WORDS],
}

impl Default for BoardBits {
    fn default() -> Self {
        Self {
            words: [0; BIT_WORDS],
        }
    }
}

impl BoardBits {
    fn insert(&mut self, off: i32) -> bool {
        let Some((word, mask)) = bit_pos(off) else {
            return false;
        };
        let was_clear = self.words[word] & mask == 0;
        self.words[word] |= mask;
        was_clear
    }

    fn remove(&mut self, off: i32) {
        if let Some((word, mask)) = bit_pos(off) {
            self.words[word] &= !mask;
        }
    }

    fn contains(&self, off: i32) -> bool {
        bit_pos(off)
            .map(|(word, mask)| self.words[word] & mask != 0)
            .unwrap_or(false)
    }
}

#[derive(Clone, Copy, Default)]
struct VisitBits {
    dirs: [BoardBits; 4],
}

impl VisitBits {
    fn insert(&mut self, off: i32, sc: i32) -> bool {
        self.dirs[dir_slot(sc)].insert(off)
    }
}

fn bit_pos(off: i32) -> Option<(usize, u64)> {
    if !(0..BOARD_LEN as i32).contains(&off) {
        return None;
    }
    let bit = off as usize;
    Some((bit / 64, 1u64 << (bit % 64)))
}

struct BodyTrace {
    cells: Vec<i32>,
    start: usize,
}

impl Clone for BodyTrace {
    fn clone(&self) -> Self {
        Self {
            cells: self.cells[self.start..].to_vec(),
            start: 0,
        }
    }
}

impl BodyTrace {
    fn new(cells: Vec<i32>) -> Self {
        Self { cells, start: 0 }
    }

    fn len(&self) -> usize {
        self.cells.len().saturating_sub(self.start)
    }

    fn tail(&self) -> Option<i32> {
        self.cells.get(self.start).copied()
    }

    fn prev_head(&self) -> Option<i32> {
        if self.len() >= 2 {
            self.cells.get(self.cells.len().saturating_sub(2)).copied()
        } else {
            self.tail()
        }
    }

    fn push(&mut self, off: i32) {
        self.cells.push(off);
    }

    fn pop_tail(&mut self) -> Option<i32> {
        let old = self.tail()?;
        self.start += 1;
        if self.start > 64 && self.start * 2 > self.cells.len() {
            self.cells.drain(0..self.start);
            self.start = 0;
        }
        Some(old)
    }
}

struct SeenKeys {
    slots: Vec<u64>,
    filled: usize,
}

impl SeenKeys {
    fn with_capacity(capacity: usize) -> Self {
        let size = capacity.saturating_mul(2).next_power_of_two().max(16);
        Self {
            slots: vec![0; size],
            filled: 0,
        }
    }

    fn insert(&mut self, key: u64) -> bool {
        if self.filled * 3 >= self.slots.len() * 2 {
            self.grow();
        }
        self.insert_stored(key.wrapping_add(1))
    }

    fn insert_stored(&mut self, stored: u64) -> bool {
        let mask = self.slots.len() - 1;
        let mut idx = hash_key(stored) & mask;
        loop {
            let slot = self.slots[idx];
            if slot == stored {
                return false;
            }
            if slot == 0 {
                self.slots[idx] = stored;
                self.filled += 1;
                return true;
            }
            idx = (idx + 1) & mask;
        }
    }

    fn grow(&mut self) {
        let new_len = self.slots.len() * 2;
        let old = ::core::mem::replace(&mut self.slots, vec![0; new_len]);
        self.filled = 0;
        for stored in old {
            if stored != 0 {
                self.insert_stored(stored);
            }
        }
    }
}

fn hash_key(mut key: u64) -> usize {
    key ^= key >> 33;
    key = key.wrapping_mul(0xff51afd7ed558ccd);
    key ^= key >> 33;
    key = key.wrapping_mul(0xc4ceb9fe1a85ec53);
    (key ^ (key >> 33)) as usize
}

#[derive(Clone)]
struct State {
    head: i32,
    body: BodyTrace,
    body_bits: BoardBits,
    dir: i32,
    overlay: CellOverlay,
    first: i32,
    dist: i32,
    ate: i32,
    points: i32,
    smiles: i32,
    stones: i32,
    chokes: i32,
    repeats: i32,
}

#[derive(Clone, Copy, Default)]
struct CellOverlay {
    empty: BoardBits,
    stones: BoardBits,
}

impl CellOverlay {
    fn set_empty(&mut self, off: i32) {
        self.stones.remove(off);
        self.empty.insert(off);
    }

    fn set_stone(&mut self, off: i32) {
        self.empty.remove(off);
        self.stones.insert(off);
    }

    fn get(&self, off: i32) -> Option<u16> {
        if self.stones.contains(off) {
            Some(10)
        } else if self.empty.contains(off) {
            Some(32)
        } else {
            None
        }
    }
}

#[derive(Clone, Copy, Default)]
struct SpaceInfo {
    space: i32,
    tail_reach: bool,
}

#[derive(Clone, Copy, Default)]
struct EscapeInfo {
    ok: bool,
    depth: i32,
    space: i32,
    tail_reach: bool,
    exits: i32,
}

#[derive(Clone, Copy, Default)]
struct ForcedInfo {
    steps: i32,
    end_exits: i32,
    dead: bool,
    ate: i32,
}

#[derive(Clone, Copy)]
struct Door {
    cells: [i32; 2],
    before: [i32; 2],
    after: [i32; 2],
}

#[derive(Clone, Copy, Default)]
struct DoorInfo {
    total: i32,
    usable: i32,
    blocked: i32,
    single_lane: i32,
}

#[derive(Clone, Copy, Default)]
struct ClusterInfo {
    foods: i32,
    smiles: i32,
    score: i64,
    nearest: i32,
}

pub(crate) struct Planner {
    board: [u16; BOARD_LEN],
    body: Vec<i32>,
    body_bits: BoardBits,
    enemy: [i32; ENEMY_LEN],
    trail: Vec<i32>,
    level: i32,
    items: i32,
    idle: i32,
    dir: i32,
    urgent: bool,
    pub(crate) force_risk: bool,
    pub(crate) bonus: i32,
    pub(crate) search_profile: i32,
    deadline: f64,
    clock_checks: u32,
    danger_masks: [BoardBits; MAX_DANGER_TICKS + 1],
    danger_len: usize,
    doors: Vec<Door>,
    door_bits: BoardBits,
}

struct FoodSearch {
    start: State,
    allow_smile: bool,
    max_depth: i32,
    scan_limit: i32,
    check_limit: i32,
    route_kind: RouteKind,
    arrow_level: bool,
    urgent: bool,
}

#[derive(Clone, Copy)]
enum RouteKind {
    Near,
    Route,
    Pressure,
}

fn keep_best_i32(items: &mut Vec<(State, i32)>, keep: usize) {
    if items.len() > keep {
        items.select_nth_unstable_by(keep, |a, b| b.1.cmp(&a.1));
        items.truncate(keep);
    }
    items.sort_unstable_by(|a, b| b.1.cmp(&a.1));
}

fn offset(row: i32, col: i32) -> i32 {
    (row - 1) * 160 + (col - 1) * 2
}

fn is_food(c: u16) -> bool {
    c == 3 || c == 5
}

fn is_arrow(c: u16) -> bool {
    c == 24 || c == 26 || c == 27
}

fn open(c: u16) -> bool {
    c == 32 || c == 1 || is_food(c)
}

fn room_door_level(level: i32) -> bool {
    matches!((level - 1).rem_euclid(16), 2 | 10)
}

fn door_detect_level(level: i32) -> bool {
    // Advice #2: reserve narrow gaps as doors on the line and wall-gap mazes too,
    // not just the room/door grid. The detector below matches 2-wide chokepoints;
    // the line maze's wall segments leave several of those, and reserving a return
    // lane through them keeps the snake from sealing a region behind itself.
    room_door_level(level) || matches!((level - 1).rem_euclid(16), 1 | 4 | 9 | 12)
}

fn static_open_cell(board: &[u16; BOARD_LEN], body_bits: BoardBits, o: i32) -> bool {
    (0..BOARD_LEN as i32).contains(&o) && (body_bits.contains(o) || open(board[o as usize]))
}

fn static_wall_cell(board: &[u16; BOARD_LEN], body_bits: BoardBits, o: i32) -> bool {
    (0..BOARD_LEN as i32).contains(&o) && !static_open_cell(board, body_bits, o)
}

fn detect_doors(
    board: &[u16; BOARD_LEN],
    body_bits: BoardBits,
    level: i32,
) -> (Vec<Door>, BoardBits) {
    if !door_detect_level(level) {
        return (Vec::new(), BoardBits::default());
    }
    let mut doors = Vec::new();
    let mut bits = BoardBits::default();

    for row in 2..=24 {
        for col in 2..=77 {
            let a = offset(row, col);
            let b = offset(row, col + 1);
            if static_open_cell(board, body_bits, a)
                && static_open_cell(board, body_bits, b)
                && static_wall_cell(board, body_bits, offset(row, col - 1))
                && static_wall_cell(board, body_bits, offset(row, col + 2))
                && static_open_cell(board, body_bits, a - 160)
                && static_open_cell(board, body_bits, b - 160)
                && static_open_cell(board, body_bits, a + 160)
                && static_open_cell(board, body_bits, b + 160)
            {
                doors.push(Door {
                    cells: [a, b],
                    before: [a - 160, b - 160],
                    after: [a + 160, b + 160],
                });
                bits.insert(a);
                bits.insert(b);
            }
        }
    }

    for row in 2..=23 {
        for col in 2..=79 {
            let a = offset(row, col);
            let b = offset(row + 1, col);
            if static_open_cell(board, body_bits, a)
                && static_open_cell(board, body_bits, b)
                && static_wall_cell(board, body_bits, offset(row - 1, col))
                && static_wall_cell(board, body_bits, offset(row + 2, col))
                && static_open_cell(board, body_bits, a - 2)
                && static_open_cell(board, body_bits, b - 2)
                && static_open_cell(board, body_bits, a + 2)
                && static_open_cell(board, body_bits, b + 2)
            {
                doors.push(Door {
                    cells: [a, b],
                    before: [a - 2, b - 2],
                    after: [a + 2, b + 2],
                });
                bits.insert(a);
                bits.insert(b);
            }
        }
    }

    (doors, bits)
}

fn step(sc: i32) -> i32 {
    match sc {
        72 => -160,
        80 => 160,
        75 => -2,
        77 => 2,
        _ => 0,
    }
}

fn opp(sc: i32) -> i32 {
    match sc {
        72 => 80,
        80 => 72,
        75 => 77,
        77 => 75,
        _ => 0,
    }
}

fn dir_idx(sc: i32) -> u64 {
    match sc {
        72 => 0,
        80 => 1,
        75 => 2,
        77 => 3,
        _ => 0,
    }
}

fn dir_slot(sc: i32) -> usize {
    dir_idx(sc) as usize
}

fn state_key(st: &State) -> u64 {
    let head = (st.head.max(0) as u64) >> 1;
    let first = (st.body.tail().unwrap_or(0).max(0) as u64) >> 1;
    let near_tail = (st.body.prev_head().unwrap_or(0).max(0) as u64) >> 1;
    ((((head * 4 + dir_idx(st.dir)) * 2000 + first) * 2000 + near_tail) * 16000)
        + st.body.len() as u64
}

fn pack_decision(tier: i32, sc: i32) -> i32 {
    if sc == 0 {
        0
    } else {
        tier.saturating_mul(256) + sc
    }
}

fn decision_sc(packed: i32) -> i32 {
    if packed == 0 {
        0
    } else {
        packed & 0xff
    }
}

fn replace_decision_sc(packed: i32, sc: i32) -> i32 {
    if packed == 0 || sc == 0 {
        0
    } else {
        pack_decision(packed / 256, sc)
    }
}

fn scale_limit(value: i32, num: i32, den: i32, extra: i32, cap: i32) -> i32 {
    let den = den.max(1);
    let scaled = value.saturating_mul(num).saturating_add(den - 1) / den + extra;
    scaled.min(cap).max(value)
}

#[cfg(test)]
fn cmp_i64_desc(a: i64, b: i64) -> std::cmp::Ordering {
    b.cmp(&a)
}
