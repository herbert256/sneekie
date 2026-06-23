use std::collections::VecDeque;

const BOARD_LEN: usize = 4000;
const BODY_CAP: usize = 15001;
const ENEMY_LEN: usize = 81 * 4;
const TRAIL_CAP: usize = 128;
const DIRS: [(i32, i32); 4] = [(72, -160), (80, 160), (75, -2), (77, 2)];
const MAX_DANGER_TICKS: usize = 7;
const BIT_WORDS: usize = (BOARD_LEN + 63) / 64;
const INF: i32 = 1_000_000;

static mut BOARD: [u16; BOARD_LEN] = [0; BOARD_LEN];
static mut BODY: [i32; BODY_CAP] = [0; BODY_CAP];
static mut ENEMY: [i32; ENEMY_LEN] = [0; ENEMY_LEN];
static mut TRAIL: [i32; TRAIL_CAP] = [0; TRAIL_CAP];

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
        let old = core::mem::replace(&mut self.slots, vec![0; new_len]);
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

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn now_ms() -> f64;
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    0.0
}

#[cfg(target_arch = "wasm32")]
fn host_now_ms() -> f64 {
    unsafe { now_ms() }
}

#[cfg(not(target_arch = "wasm32"))]
fn host_now_ms() -> f64 {
    now_ms()
}

#[no_mangle]
pub extern "C" fn board_ptr() -> *mut u16 {
    core::ptr::addr_of_mut!(BOARD).cast::<u16>()
}

#[no_mangle]
pub extern "C" fn body_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(BODY).cast::<i32>()
}

#[no_mangle]
pub extern "C" fn enemy_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(ENEMY).cast::<i32>()
}

#[no_mangle]
pub extern "C" fn trail_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(TRAIL).cast::<i32>()
}

#[no_mangle]
pub extern "C" fn decide(
    level: i32,
    items: i32,
    body_len: i32,
    idle: i32,
    looping: i32,
    trail_len: i32,
    budget_ms: f64,
    force_risk: i32,
    bonus: i32,
) -> i32 {
    let body_len = body_len.clamp(2, BODY_CAP as i32) as usize;
    let trail_len = trail_len.clamp(0, TRAIL_CAP as i32) as usize;
    let mut board = [0u16; BOARD_LEN];
    let mut body = Vec::with_capacity(body_len);
    let mut enemy = [0i32; ENEMY_LEN];
    let mut trail = Vec::with_capacity(trail_len);

    unsafe {
        let board_src = core::ptr::addr_of!(BOARD).cast::<u16>();
        let body_src = core::ptr::addr_of!(BODY).cast::<i32>();
        let enemy_src = core::ptr::addr_of!(ENEMY).cast::<i32>();
        let trail_src = core::ptr::addr_of!(TRAIL).cast::<i32>();
        for (i, dest) in board.iter_mut().enumerate() {
            *dest = *board_src.add(i);
        }
        for i in 0..body_len {
            body.push(*body_src.add(i));
        }
        for (i, dest) in enemy.iter_mut().enumerate() {
            *dest = *enemy_src.add(i);
        }
        for i in 0..trail_len {
            trail.push(*trail_src.add(i));
        }
    }

    let urgent = idle >= 18 || looping != 0;
    let deadline = host_now_ms() + budget_ms.max(1.0);
    let mut planner = Planner::new(
        board, body, enemy, trail, level, items, idle, urgent, deadline,
    );
    planner.force_risk = force_risk != 0;
    planner.bonus = bonus.max(0);
    planner.decide()
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

struct Planner {
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
    force_risk: bool,
    bonus: i32,
    deadline: f64,
    clock_checks: u32,
    danger_masks: [BoardBits; MAX_DANGER_TICKS + 1],
    danger_len: usize,
    doors: Vec<Door>,
    door_bits: BoardBits,
}

impl Planner {
    fn new(
        board: [u16; BOARD_LEN],
        body: Vec<i32>,
        enemy: [i32; ENEMY_LEN],
        trail: Vec<i32>,
        level: i32,
        items: i32,
        idle: i32,
        urgent: bool,
        deadline: f64,
    ) -> Self {
        let urgent = urgent || idle >= 18;
        let mut body_bits = BoardBits::default();
        for off in body.iter().copied() {
            body_bits.insert(off);
        }
        let dir = if body.len() >= 2 {
            match body[body.len() - 1] - body[body.len() - 2] {
                -160 => 72,
                160 => 80,
                -2 => 75,
                2 => 77,
                _ => 77,
            }
        } else {
            77
        };
        let (doors, door_bits) = detect_doors(&board, body_bits, level);
        let mut planner = Self {
            board,
            body,
            body_bits,
            enemy,
            trail,
            level,
            items,
            idle,
            dir,
            urgent,
            force_risk: false,
            bonus: 0,
            deadline,
            clock_checks: 0,
            danger_masks: [BoardBits::default(); MAX_DANGER_TICKS + 1],
            danger_len: 1,
            doors,
            door_bits,
        };
        let (danger_masks, danger_len) = planner.build_danger_masks();
        planner.danger_masks = danger_masks;
        planner.danger_len = danger_len;
        planner
    }

    fn decide(&mut self) -> i32 {
        if self.force_risk {
            return self.decide_forced();
        }
        let breathe_first = self.needs_breathing();
        let proved = if breathe_first {
            self.near_food(false)
                .or_else(|| self.breathing_move())
                .or_else(|| self.near_food(true))
                .or_else(|| self.route_food(false))
                .or_else(|| self.route_food(true))
                .or_else(|| self.pressure_food(true, self.urgent))
                .or_else(|| self.pressure_food(false, self.urgent))
        } else if self.urgent && self.idle >= 36 {
            self.pressure_food(false, true)
                .or_else(|| self.pressure_food(true, true))
                .or_else(|| self.pressure_step())
                .or_else(|| self.near_food(false))
                .or_else(|| self.route_food(false))
                .or_else(|| self.route_food(true))
                .or_else(|| self.near_food(true))
        } else if self.few() {
            // Endgame: only a few hearts remain, usually tucked in tight spots. In
            // testing even the clears orbited near the stuck limit (idle ~100-150)
            // chasing the last one or two while the bonus drained. Lead with the safe
            // routes, but fall through to the committed urgent-pressure search and the
            // dig-aware pressure step so the snake actually goes and finishes the level
            // instead of circling it.
            self.route_food(false)
                .or_else(|| self.near_food(false))
                .or_else(|| self.pressure_food(false, self.urgent))
                .or_else(|| self.route_food(true))
                .or_else(|| self.pressure_food(true, true))
                .or_else(|| self.pressure_step())
        } else if !self.open_board_level() {
            // Advice #1: on any walled level, sweep with the space-aware route_food
            // (which weights tail-reachability and open space) rather than the greedy
            // near_food (-distance at -6400/step). Greedy nearest-food strands
            // isolated pickups that later wall off; preferring the considered route
            // clears the board more like a sweep and leaves the free space connected.
            self.route_food(false)
                .or_else(|| self.near_food(false))
                .or_else(|| self.pressure_food(false, self.urgent))
                .or_else(|| self.route_food(true))
                .or_else(|| self.pressure_food(true, self.urgent))
                .or_else(|| {
                    if self.urgent {
                        self.near_food(true)
                            .or_else(|| self.route_food(true))
                            .or_else(|| self.pressure_food(true, self.urgent))
                    } else {
                        None
                    }
                })
        } else {
            self.near_food(false)
                .or_else(|| self.route_food(false))
                .or_else(|| self.pressure_food(false, self.urgent))
                .or_else(|| self.route_food(true))
                .or_else(|| self.pressure_food(true, self.urgent))
                .or_else(|| {
                    if self.urgent {
                        self.near_food(true)
                            .or_else(|| self.route_food(true))
                            .or_else(|| self.pressure_food(true, self.urgent))
                    } else {
                        None
                    }
                })
        };
        let chosen = proved
            .or_else(|| {
                if self.urgent {
                    self.pressure_step()
                } else {
                    None
                }
            })
            .or_else(|| self.tail_chase_move())
            .or_else(|| self.survival_move())
            .or_else(|| self.last_chance_move())
            .unwrap_or(0);
        // Advice #3: on the cramped non-stone mazes, refuse a move that boxes the head
        // into a sub-body pocket when a roomier move exists. Skipped in the endgame
        // (few items, finishing is worth a squeeze).
        if chosen != 0 && self.maze_confined() && !self.few() {
            self.avoid_self_seal(chosen)
        } else {
            chosen
        }
    }

    fn decide_forced(&mut self) -> i32 {
        // Break a stall. The driver flips this on after an orbit, and it used to
        // hand control to the weaker JavaScript planner -- so the bot switched to
        // its least capable brain exactly when it was stuck. Keep the full
        // engine: lead with the most aggressive food grab (smileys allowed) and
        // the dig-aware pressure step, then fall back through survival moves.
        // recent-memory penalties (the loop breaker) stay active throughout.
        self.pressure_food(true, true)
            .or_else(|| self.near_food(true))
            .or_else(|| self.route_food(true))
            .or_else(|| self.pressure_step())
            .or_else(|| self.tail_chase_move())
            .or_else(|| self.survival_move())
            .or_else(|| self.last_chance_move())
            .unwrap_or(0)
    }

    fn time_up(&mut self) -> bool {
        self.clock_checks = self.clock_checks.wrapping_add(1);
        if self.clock_checks & 0x07 != 0 {
            return false;
        }
        host_now_ms() >= self.deadline
    }

    fn few(&self) -> bool {
        self.items <= 6
    }

    fn finish_dist_penalty(&self) -> i64 {
        // The bonus drains every move and banks into the score when the level
        // is cleared, so when only a few items remain it pays to take the
        // shortest finishing route rather than dawdle. Add a small per-distance
        // penalty scaled by how much bonus is still on the clock and how close
        // the level is to finishing. Pure tie-break weight -- it never overrides
        // the safety terms, it just stops the bot from banking less bonus by
        // wandering on the last few pickups.
        if !self.few() || self.bonus <= 0 {
            return 0;
        }
        let item_factor = (7 - self.items.clamp(1, 6)) as i64; // 1 (6 left) .. 6 (1 left)
        self.bonus as i64 / 100 * item_factor / 6
    }

    fn needs_breathing(&mut self) -> bool {
        let st = self.start_state();
        let body_len = st.body.len() as i32;
        let exits = self.legal_count(&st, true);
        if exits <= 1 {
            return true;
        }
        let door = self.door_exit_info(&st);
        if self.door_exit_closed(door)
            || (door.total > 0 && door.usable <= 1 && body_len >= 58 && exits <= 2)
        {
            return true;
        }
        let info = self.space_info(&st, true);
        (!info.tail_reach && info.space < body_len + if self.few() { 132 } else { 96 })
            || (body_len >= 58 && (exits <= 2 || info.space < body_len + 150))
            || (body_len >= 96 && exits <= 3)
    }

    fn return_buffer(&self, body_len: i32, few: bool) -> i32 {
        let base = if body_len >= 120 {
            190
        } else if body_len >= 80 {
            155
        } else if body_len >= 45 {
            124
        } else {
            96
        };
        base + if few { 32 } else { 0 }
    }

    fn return_path_room(&self, info: SpaceInfo, exits: i32, body_len: i32, few: bool) -> bool {
        info.tail_reach
            || (exits >= 3 && info.space >= body_len + self.return_buffer(body_len, few) + 72)
    }

    fn return_path_risk(
        &self,
        st: &State,
        info: SpaceInfo,
        exits: i32,
        expected_growth: i32,
    ) -> bool {
        if info.tail_reach {
            return false;
        }
        let body_len = st.body.len() as i32;
        let need = body_len + expected_growth + self.return_buffer(body_len, self.few());
        info.space < need || (exits <= 2 && info.space < need + 34)
    }

    fn smile_limit(&self, kind: RouteKind, urgent: bool) -> i32 {
        match kind {
            RouteKind::Near | RouteKind::Route => 1,
            RouteKind::Pressure => {
                if urgent || self.few() {
                    2
                } else {
                    1
                }
            }
        }
    }

    fn smile_growth_debt(&self, body_len: i32, urgent: bool) -> i64 {
        let long_body = (body_len - 96).max(0) as i64;
        let very_long_body = (body_len - 118).max(0) as i64;
        let huge_body = (body_len - 150).max(0) as i64;
        let food_pressure = if self.items > 58 {
            900
        } else if self.items > 40 {
            400
        } else {
            0
        };
        food_pressure
            + long_body * if urgent { 75 } else { 115 }
            + very_long_body * if urgent { 180 } else { 260 }
            + huge_body * if urgent { 350 } else { 520 }
    }

    fn avoid_extra_smile(&self, body_len: i32) -> bool {
        // On an open board there is room to go around a smiley, so refuse to bridge
        // one well before the body is long -- only a genuinely starving snake (deep
        // idle streak) may still spend one rather than orbit to a restart.
        if self.open_board_level() && !self.few() {
            return body_len >= 20 && !(self.urgent && self.idle >= 70);
        }
        // Long bodies normally never bridge a smiley, but when starving (food walled
        // off behind smileys) allow it -- otherwise the snake just orbits to a restart.
        body_len >= 115 && !self.few() && !(self.urgent && self.idle >= 50)
    }

    fn smile_cost(&self, kind: RouteKind, urgent: bool, body_len: i32) -> i64 {
        // Each smiley is -50 points and spawns another, so over-eating them turns a
        // winning board into a falling score (L2/L3 averaged 7-11 smileys a level).
        // Raised ~30% from 8500/10500/5800/8000 so a smiley bridge has to clearly pay
        // off; the strategic-smile credit still rebates a bridge that opens a real food
        // cluster or keeps tail access, and the urgent value stays lowest so a starving
        // snake can still spend one rather than orbit to a restart.
        let base = match kind {
            RouteKind::Near => 11_000,
            RouteKind::Route => 14_000,
            RouteKind::Pressure => {
                if urgent {
                    7_500
                } else {
                    10_500
                }
            }
        };
        // On an open board a smiley is almost never worth -50, so double the cost
        // there. The strategic-smile credit can still rebate a genuinely useful
        // bridge, and the urgent/desperate paths keep their own lower thresholds.
        let open_extra = if self.open_board_level() { base } else { 0 };
        base + open_extra + self.smile_growth_debt(body_len, urgent)
    }

    fn smile_escape_credit(
        &self,
        smiles: i32,
        kind: RouteKind,
        urgent: bool,
        info: SpaceInfo,
        escape: EscapeInfo,
    ) -> i64 {
        if smiles <= 0 || !escape.tail_reach {
            return 0;
        }
        let mut credit = match kind {
            RouteKind::Near => 5_800,
            RouteKind::Route => 8_800,
            RouteKind::Pressure => {
                if urgent {
                    7_400
                } else {
                    6_600
                }
            }
        };
        if !info.tail_reach {
            credit += match kind {
                RouteKind::Near => 1_200,
                RouteKind::Route => 2_000,
                RouteKind::Pressure => {
                    if urgent {
                        2_200
                    } else {
                        1_400
                    }
                }
            };
        }
        if escape.exits >= 3 {
            credit += 1_000;
        }
        smiles as i64 * credit
    }

    fn smile_step_credit(
        &self,
        c: u16,
        info: SpaceInfo,
        escape: EscapeInfo,
        return_room: bool,
        return_risk: bool,
        exits: i32,
        forced: ForcedInfo,
    ) -> i64 {
        if c != 1 {
            return 0;
        }
        let mut credit = 0;
        if return_room {
            credit += 5_500;
        }
        if info.tail_reach {
            credit += 4_000;
        }
        if escape.tail_reach {
            credit += 10_000;
        }
        if escape.ok {
            credit += 3_000;
        }
        credit += match exits {
            3.. => 4_500,
            2 => 2_400,
            _ => 0,
        };
        if forced.end_exits >= 2 {
            credit += 1_800;
        }
        if return_risk && !escape.tail_reach {
            credit -= 12_000;
        }
        credit
    }

    fn door_path_clear(&self, st: &State, o: i32, tail: i32) -> bool {
        (0..BOARD_LEN as i32).contains(&o)
            && (o == tail || (!st.body_bits.contains(o) && open(self.cell(st, o))))
    }

    fn static_room_cell(&self, st: &State, o: i32) -> bool {
        (0..BOARD_LEN as i32).contains(&o)
            && !self.door_bits.contains(o)
            && (st.body_bits.contains(o) || open(self.cell(st, o)))
    }

    fn current_room_cells(&self, st: &State) -> BoardBits {
        let mut room = BoardBits::default();
        if self.doors.is_empty() {
            return room;
        }
        let mut q = VecDeque::new();
        let push_seed = |room: &mut BoardBits, q: &mut VecDeque<i32>, o: i32| {
            if self.static_room_cell(st, o) && room.insert(o) {
                q.push_back(o);
            }
        };
        if self.door_bits.contains(st.head) {
            for &(_, d) in &DIRS {
                push_seed(&mut room, &mut q, st.head + d);
            }
        } else {
            push_seed(&mut room, &mut q, st.head);
        }
        while let Some(o) = q.pop_front() {
            for &(_, d) in &DIRS {
                let n = o + d;
                if self.static_room_cell(st, n) && room.insert(n) {
                    q.push_back(n);
                }
            }
        }
        room
    }

    fn door_lane_clear(&self, st: &State, door: Door, lane: usize, tail: i32) -> bool {
        self.door_path_clear(st, door.cells[lane], tail)
            && self.door_path_clear(st, door.before[lane], tail)
            && self.door_path_clear(st, door.after[lane], tail)
    }

    fn door_exit_info(&self, st: &State) -> DoorInfo {
        if self.doors.is_empty() {
            return DoorInfo::default();
        }
        let room = self.current_room_cells(st);
        let tail = st.body.tail().unwrap_or(st.head);
        let mut info = DoorInfo::default();
        for &door in &self.doors {
            let touches_room = door.cells.contains(&st.head)
                || door.before.iter().any(|&o| room.contains(o))
                || door.after.iter().any(|&o| room.contains(o));
            if !touches_room {
                continue;
            }
            info.total += 1;
            let lanes = (0..2)
                .filter(|&lane| self.door_lane_clear(st, door, lane, tail))
                .count() as i32;
            if lanes == 0 {
                info.blocked += 1;
            } else {
                info.usable += 1;
                if lanes == 1 {
                    info.single_lane += 1;
                }
            }
        }
        info
    }

    fn door_exit_closed(&self, info: DoorInfo) -> bool {
        info.total > 0 && info.usable == 0
    }

    fn door_exit_debt(&self, info: DoorInfo, body_len: i32, exits: i32) -> i64 {
        if info.total == 0 {
            return 0;
        }
        let size = if body_len >= 90 {
            2
        } else if body_len >= 50 {
            1
        } else {
            0
        };
        let mut debt = info.blocked as i64 * (28_000 + size as i64 * 9_000)
            + info.single_lane as i64 * (4_500 + size as i64 * 2_500);
        if info.usable == 0 {
            debt += 92_000 + body_len as i64 * 620 + if exits <= 2 { 36_000 } else { 0 };
        } else if info.usable == 1 {
            debt += 8_500 + if exits <= 2 { 8_000 } else { 0 };
        }
        debt
    }

    fn door_exit_credit(&self, info: DoorInfo) -> i64 {
        if info.total == 0 {
            0
        } else if info.usable >= 2 {
            12_000 + (info.usable - 2) as i64 * 2_000
        } else if info.usable == 1 {
            3_000
        } else {
            0
        }
    }

    fn door_regression_debt(
        &self,
        before: DoorInfo,
        after: DoorInfo,
        body_len: i32,
        exits: i32,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
        if before.total == 0 || after.total == 0 {
            return 0;
        }
        let size = if body_len >= 90 {
            2
        } else if body_len >= 50 {
            1
        } else {
            0
        };
        let mut debt = 0;
        if before.usable > 0 && after.usable == 0 {
            debt += 118_000 + body_len as i64 * 720 + if exits <= 2 { 34_000 } else { 0 };
        } else if before.usable >= 2 && after.usable == 1 {
            debt += 14_000 + size as i64 * 8_000 + if exits <= 2 { 7_000 } else { 0 };
        }
        if after.blocked > before.blocked {
            debt += (after.blocked - before.blocked) as i64 * (24_000 + size as i64 * 8_000);
        }
        if after.single_lane > before.single_lane {
            debt += (after.single_lane - before.single_lane) as i64 * (5_000 + size as i64 * 2_000);
        }
        match kind {
            RouteKind::Near => debt + debt / 3,
            RouteKind::Route => debt,
            RouteKind::Pressure => {
                if urgent {
                    debt * 2 / 3
                } else {
                    debt * 4 / 5
                }
            }
        }
    }

    fn return_cell_open(&self, st: &State, o: i32, tail: i32, allow_smile: bool) -> bool {
        if !(0..BOARD_LEN as i32).contains(&o) {
            return false;
        }
        if o != tail && st.body_bits.contains(o) {
            return false;
        }
        let c = self.cell(st, o);
        if c == 1 && !allow_smile {
            return false;
        }
        open(c)
    }

    fn open_degree(&self, st: &State, o: i32, tail: i32, allow_smile: bool) -> i32 {
        DIRS.iter()
            .filter(|&&(_, d)| {
                let n = o + d;
                !self.danger(n, st.dist) && self.return_cell_open(st, n, tail, allow_smile)
            })
            .count() as i32
    }

    fn reaches_tail_from(
        &self,
        st: &State,
        start: i32,
        tail: i32,
        allow_smile: bool,
        limit: usize,
    ) -> bool {
        if start == tail {
            return true;
        }
        if !self.return_cell_open(st, start, tail, allow_smile) {
            return false;
        }
        let mut seen = BoardBits::default();
        let mut q = VecDeque::from([start]);
        seen.insert(start);
        let mut scanned = 0usize;
        while let Some(o) = q.pop_front() {
            scanned += 1;
            if scanned >= limit {
                break;
            }
            for &(_, d) in &DIRS {
                let n = o + d;
                if n == tail {
                    return true;
                }
                if self.danger(n, 0) || !self.return_cell_open(st, n, tail, allow_smile) {
                    continue;
                }
                if seen.insert(n) {
                    q.push_back(n);
                }
            }
        }
        false
    }

    fn tail_route_count(
        &self,
        st: &State,
        allow_smile: bool,
        max_routes: i32,
        limit: usize,
    ) -> i32 {
        let tail = st.body.tail().unwrap_or(st.head);
        let mut routes = 0;
        for &(sc, d) in &DIRS {
            if sc == opp(st.dir) {
                continue;
            }
            let n = st.head + d;
            if self.danger(n, st.dist) || !self.return_cell_open(st, n, tail, allow_smile) {
                continue;
            }
            if self.reaches_tail_from(st, n, tail, allow_smile, limit) {
                routes += 1;
                if routes >= max_routes {
                    return routes;
                }
            }
        }
        routes
    }

    fn return_gate_debt(
        &self,
        st: &State,
        info: SpaceInfo,
        exits: i32,
        expected_growth: i32,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
        let body_len = st.body.len() as i32;
        let tail = st.body.tail().unwrap_or(st.head);
        let head_degree = self.open_degree(st, st.head, tail, true);
        let prev_degree = st
            .body
            .prev_head()
            .map(|p| self.open_degree(st, p, tail, true))
            .unwrap_or(head_degree);
        let narrow = exits <= 2 || head_degree <= 2 || prev_degree <= 2;
        let need = body_len + expected_growth + self.return_buffer(body_len, self.few());
        let mut debt = 0;

        if info.tail_reach {
            let tail_routes = self.tail_route_count(st, true, 2, 900);
            if tail_routes == 0 {
                debt += 46_000;
            } else if tail_routes == 1 && narrow {
                debt += 9_000 + body_len as i64 * 115 + if exits <= 2 { 10_000 } else { 0 };
            }
            if tail_routes <= 1 && info.space < need + 72 {
                debt += 12_000;
            }
        } else if narrow {
            debt += 14_000 + body_len as i64 * 140;
        }

        if head_degree <= 1 {
            debt += 18_000;
        }
        if exits <= 1 {
            debt += 11_000;
        }
        if exits <= 2 && info.space < need + if info.tail_reach { 44 } else { 82 } {
            debt += 16_000;
        }

        match kind {
            RouteKind::Near => debt + debt / 4,
            RouteKind::Route => debt,
            RouteKind::Pressure => {
                if urgent {
                    debt * 3 / 5
                } else {
                    debt * 3 / 4
                }
            }
        }
    }

    fn recent_step_heat(&self, o: i32) -> i32 {
        if self.trail.len() < 16 {
            return 0;
        }
        let len = self.trail.len();
        let mut heat = 0;
        for (i, &p) in self.trail.iter().enumerate() {
            if p != o {
                continue;
            }
            let age = len.saturating_sub(1 + i);
            // Slightly flatter decay than before (was 10/7/4/2/1). A clean geometric
            // orbit of 20-40 cells revisits each cell at age ~20-40, which the old curve
            // barely penalized (heat 4). Nudge the medium bands up so loops carry more
            // weight, but stay gentle at 1x: the real orbit-break comes from the force
            // -risk path, which quadruples this debt once the driver flags a stall.
            heat += if age <= 8 {
                10
            } else if age <= 20 {
                8
            } else if age <= 42 {
                6
            } else if age <= 72 {
                3
            } else {
                2
            };
        }
        heat
    }

    fn recent_memory_debt(
        &self,
        st: &State,
        info: SpaceInfo,
        escape_tail: bool,
        exits: i32,
        kind: RouteKind,
        urgent: bool,
        progress: i32,
    ) -> i64 {
        if st.repeats <= 0 || self.trail.len() < 24 {
            return 0;
        }
        let weight = match kind {
            RouteKind::Near => 1_050,
            RouteKind::Route => 760,
            RouteKind::Pressure => {
                if urgent {
                    420
                } else {
                    560
                }
            }
        };
        // When the driver has flagged a stall, lean much harder on the loop
        // breaker so every forced mover walks into fresh cells instead of
        // re-circling the same pocket.
        let weight = if self.force_risk { weight * 4 } else { weight };
        let mut debt = st.repeats as i64 * weight;
        if progress > 0 {
            debt = debt * 3 / 5;
        }
        if info.tail_reach {
            debt = debt * 2 / 3;
        }
        if escape_tail {
            debt = debt * 2 / 3;
        }
        if exits >= 3 {
            debt = debt * 4 / 5;
        }
        let body_len = st.body.len() as i32;
        if info.space >= body_len + self.return_buffer(body_len, self.few()) + 120 {
            debt = debt * 4 / 5;
        }
        let cap = match kind {
            RouteKind::Near => 80_000,
            RouteKind::Route => 64_000,
            RouteKind::Pressure => {
                if urgent {
                    40_000
                } else {
                    52_000
                }
            }
        };
        // The force-risk floor is the real lever and is safe for normal play: it only
        // applies once the driver has flagged a stall, where breaking the loop matters
        // far more than the food route. Raised from 160k so a forced move genuinely
        // walks into fresh cells instead of re-circling the same pocket.
        debt.min(if self.force_risk { cap.max(220_000) } else { cap })
    }

    fn food_cluster(
        &self,
        st: &State,
        max_depth: i32,
        scan_limit: usize,
        allow_smile: bool,
    ) -> ClusterInfo {
        let mut info = ClusterInfo {
            nearest: INF,
            ..ClusterInfo::default()
        };
        let tail = st.body.tail().unwrap_or(st.head);
        let mut seen = VisitBits::default();
        let mut counted = BoardBits::default();
        let mut q = VecDeque::from([(st.head, st.dir, 0i32)]);
        seen.insert(st.head, st.dir);
        let mut scanned = 0usize;
        while let Some((o, dir, dist)) = q.pop_front() {
            scanned += 1;
            if scanned >= scan_limit || dist >= max_depth {
                break;
            }
            for &(sc, d) in &DIRS {
                if sc == opp(dir) {
                    continue;
                }
                let n = o + d;
                let nd = dist + 1;
                if self.danger(n, nd) || !self.return_cell_open(st, n, tail, allow_smile) {
                    continue;
                }
                let c = self.cell(st, n);
                if is_food(c) && counted.insert(n) {
                    info.foods += 1;
                    info.nearest = info.nearest.min(nd);
                    let value = if c == 5 { 230 } else { 145 };
                    info.score += (max_depth + 1 - nd).max(0) as i64 * value
                        + if nd <= 12 { 2_600 } else { 0 };
                } else if c == 1 && counted.insert(n) {
                    info.smiles += 1;
                    if allow_smile {
                        info.score += (max_depth + 1 - nd).max(0) as i64 * 45;
                    }
                }
                if seen.insert(n, sc) {
                    q.push_back((n, sc, nd));
                }
            }
        }
        info
    }

    fn cluster_credit(&self, cluster: ClusterInfo, kind: RouteKind, urgent: bool) -> i64 {
        if cluster.foods <= 0 {
            return 0;
        }
        // Lean a little harder toward dense food regions (per-food weight and caps
        // raised ~25%). Greedy nearest-food strands isolated pickups that later wall
        // off as the body grows; preferring to clear a cluster keeps the board tidier
        // and cuts the self-entombment that follows from chasing scattered food.
        let base = match kind {
            RouteKind::Near => cluster.score / 6 + cluster.foods as i64 * 1_150,
            RouteKind::Route => cluster.score / 4 + cluster.foods as i64 * 2_400,
            RouteKind::Pressure => {
                cluster.score / if urgent { 3 } else { 4 }
                    + cluster.foods as i64 * if urgent { 2_900 } else { 2_050 }
            }
        };
        base.min(match kind {
            RouteKind::Near => 22_000,
            RouteKind::Route => 42_000,
            RouteKind::Pressure => {
                if urgent {
                    50_000
                } else {
                    37_000
                }
            }
        })
    }

    fn strategic_smile_credit(
        &self,
        smiles: i32,
        cluster: ClusterInfo,
        info: SpaceInfo,
        escape: EscapeInfo,
        return_open: bool,
        door: DoorInfo,
        gate_debt: i64,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
        if smiles <= 0 {
            return 0;
        }
        let mut credit = 0;
        if return_open {
            credit += 2_600;
        }
        if info.tail_reach {
            credit += 2_400;
        }
        if escape.tail_reach {
            credit += 3_800;
        }
        if door.usable > 0 {
            credit += 1_800;
        }
        if gate_debt < 18_000 && (return_open || cluster.foods > 0) {
            credit += 2_400;
        }
        if cluster.foods >= 2 {
            credit += (cluster.foods as i64 * 2_300 + cluster.score / 18).min(13_000);
        } else if cluster.foods == 1 && urgent {
            credit += 2_000;
        }
        if urgent {
            credit += 1_600;
        }
        let cap = match kind {
            RouteKind::Near => 9_000,
            RouteKind::Route => 13_500,
            RouteKind::Pressure => {
                if urgent {
                    15_500
                } else {
                    12_000
                }
            }
        };
        (smiles as i64 * credit).min(smiles as i64 * cap)
    }

    fn arrow_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 5 | 6 | 13 | 14)
    }

    fn open_board_level(&self) -> bool {
        // The arrow levels and the two empty levels (modes 0|8) have no maze walls:
        // the board is wide open, so there is almost never a reason to eat a -50
        // smiley -- the snake can route around one with room to spare. Smiley
        // discipline is tightened hard here so a pickup that should be free is not
        // paid for with points.
        self.arrow_level() || matches!((self.level - 1).rem_euclid(16), 0 | 8)
    }

    fn stone_maze_level(&self) -> bool {
        // lay1400 (modes 3|11) is a full stone field; lay1750 (modes 7|15) is the bar
        // maze with a regular stone pattern. Both place pushable stones, so both need
        // the dig-distance gradient and stone-tuned search. Without 7|15 here the bot
        // treated food walled behind L8's stones as unreachable and orbited -- L8 was
        // the worst-stall level in testing (1.8% pickup rate, 261-move idle streaks).
        matches!((self.level - 1).rem_euclid(16), 3 | 7 | 11 | 15)
    }

    fn line_maze_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 1 | 9)
    }

    fn wall_gap_level(&self) -> bool {
        // lay1670 (modes 4|12): nine vertical walls on columns 8,16,...,72, each
        // with a 3-cell gap. sub2130 crawls every gap downward -- it seals the top
        // cell of an empty gap each tick and opens the one below.
        matches!((self.level - 1).rem_euclid(16), 4 | 12)
    }

    fn wall_gap_top(&self, col: i32) -> Option<i32> {
        // The row of the topmost gap cell in a wall column: the first non-pillar
        // cell that sits directly under a pillar. That cell is the one sub2130
        // seals next, so it is the closing edge of the moving gap.
        let pillar = |c: u16| matches!(c, 179 | 193 | 194);
        (5..=20).find(|&row| {
            !pillar(self.base_cell(offset(row, col))) && pillar(self.base_cell(offset(row - 1, col)))
        })
    }

    fn maze_confined(&self) -> bool {
        // The cramped non-stone mazes -- line segments, the room/door grid, and the
        // wall-gap walls. They partition the board into pockets joined by narrow
        // gaps, which is where the snake coils itself to death. (Stone fields are
        // excluded: their failure is the opposite, orbiting without digging; arrow
        // and empty boards are open and rarely seal.)
        self.line_maze_level() || room_door_level(self.level) || self.wall_gap_level()
    }

    fn start_state(&self) -> State {
        State {
            head: *self.body.last().unwrap_or(&0),
            body: BodyTrace::new(self.body.clone()),
            body_bits: self.body_bits,
            dir: self.dir,
            overlay: CellOverlay::default(),
            first: 0,
            dist: 0,
            ate: 0,
            points: 0,
            smiles: 0,
            stones: 0,
            chokes: 0,
            repeats: 0,
        }
    }

    fn base_cell(&self, o: i32) -> u16 {
        if (0..BOARD_LEN as i32).contains(&o) {
            self.board[o as usize]
        } else {
            0
        }
    }

    fn cell(&self, st: &State, o: i32) -> u16 {
        st.overlay.get(o).unwrap_or_else(|| self.base_cell(o))
    }

    fn danger(&self, o: i32, dist: i32) -> bool {
        if !(0..BOARD_LEN as i32).contains(&o) {
            return true;
        }
        let max = self.danger_len.saturating_sub(1);
        let a = (dist.max(0) as usize).min(max);
        let b = (a + 1).min(max);
        self.danger_masks[a].contains(o) || self.danger_masks[b].contains(o)
    }

    fn build_danger_masks(&self) -> ([BoardBits; MAX_DANGER_TICKS + 1], usize) {
        let horizon = if self.arrow_level() {
            if self.urgent || self.few() {
                6
            } else {
                4
            }
        } else {
            1
        };
        let len = horizon.min(MAX_DANGER_TICKS) + 1;
        let mut masks = [BoardBits::default(); MAX_DANGER_TICKS + 1];
        for o in (0..BOARD_LEN as i32).step_by(2) {
            if is_arrow(self.base_cell(o)) {
                masks[0].insert(o);
            }
        }
        match (self.level - 1).rem_euclid(16) {
            5 | 13 => self.project_up_arrows(&mut masks),
            6 | 14 => self.project_horizontal_arrows(&mut masks),
            4 | 12 => self.project_wall_gaps(&mut masks),
            _ => {}
        }
        (masks, len)
    }

    fn project_wall_gaps(&self, masks: &mut [BoardBits]) {
        // Each wall's gap crawls down one row per (empty) tick, sealing its top
        // cell. Mark only that single closing edge as danger so the snake threads
        // the middle/bottom of a gap rather than diving at a mouth about to seal.
        // Just one of the three gap cells is flagged, so the walls stay passable --
        // marking more over-restricts traversal and starves the snake.
        for i in 1..=9 {
            let col = 8 * i;
            if let Some(top) = self.wall_gap_top(col) {
                masks[1].insert(offset(top, col));
            }
        }
    }

    fn project_up_arrows(&self, masks: &mut [BoardBits]) {
        for col in (2..=78).step_by(2) {
            let mut row = self.enemy_value(col, 1);
            if !(4..=21).contains(&row) {
                row = self.scan_arrow_col(col, 24).unwrap_or(0);
            }
            if row == 0 {
                continue;
            }
            for mask in masks.iter_mut().skip(1) {
                row = if row <= 4 { 20 } else { row - 1 };
                mask.insert(offset(row, col));
            }
        }
    }

    fn project_horizontal_arrows(&self, masks: &mut [BoardBits]) {
        for row in 4..=20 {
            let mut right = self.enemy_value(row, 1);
            if !(2..=79).contains(&right) {
                right = self.scan_arrow_row(row, 26).unwrap_or(0);
            }
            let mut left = self.enemy_value(row + 20, 1);
            if !(2..=79).contains(&left) {
                left = self.scan_arrow_row(row, 27).unwrap_or(0);
            }
            for mask in masks.iter_mut().skip(1) {
                if right != 0 {
                    right = if right >= 79 { 2 } else { right + 1 };
                    mask.insert(offset(row, right));
                }
                if left != 0 {
                    left = if left <= 2 { 79 } else { left - 1 };
                    mask.insert(offset(row, left));
                }
            }
        }
    }

    fn enemy_value(&self, i: i32, j: i32) -> i32 {
        let idx = i * 4 + j;
        if (0..self.enemy.len() as i32).contains(&idx) {
            self.enemy[idx as usize]
        } else {
            0
        }
    }

    fn scan_arrow_col(&self, col: i32, arrow: u16) -> Option<i32> {
        (4..=20).find(|&row| self.base_cell(offset(row, col)) == arrow)
    }

    fn scan_arrow_row(&self, row: i32, arrow: u16) -> Option<i32> {
        (2..=79).find(|&col| self.base_cell(offset(row, col)) == arrow)
    }

    fn move_state(&self, st: &State, sc: i32, allow_smile: bool) -> Option<State> {
        if sc == opp(st.dir) {
            return None;
        }
        let d = step(sc);
        let n = st.head + d;
        if self.danger(n, st.dist) || st.body_bits.contains(n) {
            return None;
        }
        let mut c = self.cell(st, n);

        if c == 1 && !allow_smile {
            return None;
        }
        let pushed_stone = if c == 10 {
            let nn = n + d;
            if st.body_bits.contains(nn) || self.cell(st, nn) != 32 {
                return None;
            }
            Some(nn)
        } else if !open(c) {
            return None;
        } else {
            None
        };

        let mut overlay = st.overlay;
        let mut stones = st.stones;
        if c == 10 {
            overlay.set_empty(n);
            overlay.set_stone(pushed_stone.unwrap());
            stones += 1;
            c = 32;
        }

        let grow = c == 1 || is_food(c);
        let mut body = st.body.clone();
        let mut body_bits = st.body_bits;
        if !grow {
            if let Some(old) = body.pop_tail() {
                body_bits.remove(old);
                overlay.set_empty(old);
            }
        }
        body.push(n);
        body_bits.insert(n);
        if grow {
            overlay.set_empty(n);
        }
        Some(State {
            head: n,
            body,
            body_bits,
            dir: sc,
            overlay,
            first: if st.first == 0 { sc } else { st.first },
            dist: st.dist + 1,
            ate: st.ate + if is_food(c) { 1 } else { 0 },
            points: st.points
                + if c == 5 {
                    25
                } else if c == 3 {
                    10
                } else {
                    0
                },
            smiles: st.smiles + if c == 1 { 1 } else { 0 },
            stones,
            chokes: st.chokes,
            repeats: st.repeats + self.recent_step_heat(n),
        })
    }

    fn legal(&self, st: &State, allow_smile: bool) -> Vec<State> {
        let mut out = Vec::with_capacity(4);
        self.legal_into(st, allow_smile, &mut out);
        out
    }

    fn legal_into(&self, st: &State, allow_smile: bool, out: &mut Vec<State>) {
        out.clear();
        for &(sc, _) in &DIRS {
            if let Some(ns) = self.move_state(st, sc, allow_smile) {
                out.push(ns);
            }
        }
    }

    fn can_move(&self, st: &State, sc: i32, allow_smile: bool) -> bool {
        if sc == opp(st.dir) {
            return false;
        }
        let d = step(sc);
        let n = st.head + d;
        if self.danger(n, st.dist) || st.body_bits.contains(n) {
            return false;
        }
        let c = self.cell(st, n);
        if c == 1 && !allow_smile {
            return false;
        }
        if c == 10 {
            let nn = n + d;
            return !st.body_bits.contains(nn) && self.cell(st, nn) == 32;
        }
        open(c)
    }

    fn legal_count(&self, st: &State, allow_smile: bool) -> i32 {
        DIRS.iter()
            .filter(|&&(sc, _)| self.can_move(st, sc, allow_smile))
            .count() as i32
    }

    fn single_legal_next(&self, st: &State, allow_smile: bool) -> (i32, Option<State>) {
        let mut exits = 0;
        let mut only_sc = 0;
        for &(sc, _) in &DIRS {
            if self.can_move(st, sc, allow_smile) {
                exits += 1;
                if exits > 1 {
                    return (exits, None);
                }
                only_sc = sc;
            }
        }
        if exits == 1 {
            (exits, self.move_state(st, only_sc, allow_smile))
        } else {
            (exits, None)
        }
    }

    fn forced_path(&self, start: &State, allow_smile: bool, limit: i32) -> ForcedInfo {
        let mut st = start.clone();
        let mut steps = 0;
        let mut ate = 0;
        loop {
            let (exits, next) = self.single_legal_next(&st, allow_smile);
            if exits != 1 || steps >= limit {
                return ForcedInfo {
                    steps,
                    end_exits: exits,
                    dead: exits == 0,
                    ate,
                };
            }
            let Some(ns) = next else {
                return ForcedInfo {
                    steps,
                    end_exits: 0,
                    dead: true,
                    ate,
                };
            };
            ate += ns.ate - st.ate;
            steps += 1;
            st = ns;
        }
    }

    fn space_info(&mut self, st: &State, limited: bool) -> SpaceInfo {
        let tail = st.body.tail().unwrap_or(st.head);
        let mut seen = VisitBits::default();
        seen.insert(st.head, st.dir);
        let mut cells = BoardBits::default();
        cells.insert(st.head);
        let mut cell_count = 1;
        let mut q = VecDeque::from([(st.head, st.dir)]);
        let mut tail_reach = st.head == tail;
        while let Some((o, dir)) = q.pop_front() {
            if limited && self.time_up() {
                break;
            }
            if o == tail {
                tail_reach = true;
            }
            for &(sc, d) in &DIRS {
                if sc == opp(dir) {
                    continue;
                }
                let n = o + d;
                if self.danger(n, 0) {
                    continue;
                }
                if n != tail && (st.body_bits.contains(n) || !open(self.cell(st, n))) {
                    continue;
                }
                if seen.insert(n, sc) {
                    if cell_count < 1800 && cells.insert(n) {
                        cell_count += 1;
                    }
                    q.push_back((n, sc));
                }
            }
            if tail_reach && cell_count >= 1800 {
                break;
            }
        }
        SpaceInfo {
            space: cell_count,
            tail_reach,
        }
    }

    fn reach_space_strict(&self, st: &State) -> i32 {
        // Reachable free space from the head with the WHOLE body solid -- the tail
        // is NOT treated as passable. space_info lets the flood pass through the
        // tail cell, which over-counts in a tight coil: the head looks roomy while
        // it is sealing itself against its own (receding) tail, which is how the
        // line/room/wall mazes entomb the snake. This stricter count is what
        // avoid_self_seal uses to refuse the sealing move.
        let mut seen = BoardBits::default();
        let mut q = VecDeque::from([st.head]);
        seen.insert(st.head);
        let mut count = 0;
        while let Some(o) = q.pop_front() {
            count += 1;
            if count >= 400 {
                break;
            }
            for &(_, d) in &DIRS {
                let n = o + d;
                if self.danger(n, 0) || st.body_bits.contains(n) || !open(self.cell(st, n)) {
                    continue;
                }
                if seen.insert(n) {
                    q.push_back(n);
                }
            }
        }
        count
    }

    fn avoid_self_seal(&self, chosen: i32) -> i32 {
        // Advice #3: never voluntarily step into a pocket too small to hold the body
        // when a much roomier legal move exists. Measured with the strict (body-solid)
        // flood so a coil's adjacent tail cannot fake the breathing room away. The
        // override target skips a smiley landing, so the guard never trades a self-seal
        // for a -50 smiley. Deliberately narrow -- it only fires on a near-certain
        // self-seal -- so it does not fight normal play.
        let st = self.start_state();
        let body_len = st.body.len() as i32;
        let mut best_sc = chosen;
        let mut best_space = -1;
        let mut chosen_space = i32::MAX;
        for &(sc, _) in &DIRS {
            let Some(ns) = self.move_state(&st, sc, true) else {
                continue;
            };
            let sp = self.reach_space_strict(&ns);
            if sc == chosen {
                chosen_space = sp;
            }
            let lands_on_smile = self.cell(&st, st.head + step(sc)) == 1;
            if !lands_on_smile && sp > best_space {
                best_space = sp;
                best_sc = sc;
            }
        }
        if best_sc != chosen
            && chosen_space < body_len
            && best_space >= 6
            && best_space >= chosen_space * 2
        {
            return best_sc;
        }
        chosen
    }

    fn survival_depth(&mut self, start: &State, limit: i32) -> i32 {
        let keep = if self.urgent || self.few() { 128 } else { 96 };
        let mut frontier = vec![start.clone()];
        let mut seen = SeenKeys::with_capacity((keep * limit.max(1) as usize).saturating_mul(4));
        seen.insert(state_key(start));
        let mut best = 0;
        let mut legal_moves = Vec::with_capacity(4);
        let mut next = Vec::new();
        for depth in 1..=limit {
            if self.time_up() {
                return best;
            }
            next.clear();
            for st in &frontier {
                if self.time_up() {
                    return best;
                }
                self.legal_into(st, true, &mut legal_moves);
                for ns in legal_moves.drain(..) {
                    let key = state_key(&ns);
                    if seen.insert(key) {
                        let exits = self.legal_count(&ns, true);
                        next.push((ns, exits));
                    }
                }
            }
            if next.is_empty() {
                return best;
            }
            best = depth;
            keep_best_i32(&mut next, keep);
            frontier.clear();
            frontier.extend(next.drain(..).map(|x| x.0));
        }
        best
    }

    fn escape_proof(
        &mut self,
        start: &State,
        min_space: i32,
        limit: i32,
        allow_smile: bool,
    ) -> EscapeInfo {
        let keep = if self.urgent || self.few() { 160 } else { 128 };
        let mut frontier = vec![start.clone()];
        let mut seen = SeenKeys::with_capacity((keep * limit.max(1) as usize).saturating_mul(4));
        seen.insert(state_key(start));
        let mut best = EscapeInfo::default();
        let mut legal_moves = Vec::with_capacity(4);
        let mut next = Vec::new();
        for depth in 1..=limit {
            if self.time_up() {
                return best;
            }
            next.clear();
            for st in &frontier {
                if self.time_up() {
                    return best;
                }
                self.legal_into(st, allow_smile, &mut legal_moves);
                for ns in legal_moves.drain(..) {
                    let key = state_key(&ns);
                    if !seen.insert(key) {
                        continue;
                    }
                    let exits = self.legal_count(&ns, true);
                    if exits == 0 {
                        continue;
                    }
                    let info = self.space_info(&ns, true);
                    if info.space > best.space || (info.tail_reach && !best.tail_reach) {
                        best = EscapeInfo {
                            ok: false,
                            depth,
                            space: info.space,
                            tail_reach: info.tail_reach,
                            exits,
                        };
                    }
                    let open_region =
                        exits >= 2 && info.space >= min_space + if depth <= 2 { 34 } else { 16 };
                    let moving_tail = info.tail_reach && info.space >= (min_space + 10).min(180);
                    if open_region || moving_tail {
                        return EscapeInfo {
                            ok: true,
                            depth,
                            space: info.space,
                            tail_reach: info.tail_reach,
                            exits,
                        };
                    }
                    let score = info.space + exits * 55 + if info.tail_reach { 260 } else { 0 }
                        - ns.smiles * 35
                        - ns.stones * 4
                        - if self.enclosure_risk(&ns, info, exits, 2) {
                            260
                        } else {
                            0
                        };
                    next.push((ns, score));
                }
            }
            if next.is_empty() {
                return best;
            }
            keep_best_i32(&mut next, keep);
            frontier.clear();
            frontier.extend(next.drain(..).map(|x| x.0));
        }
        best
    }

    fn near_food(&mut self, allow_smile: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let max_depth = if few { 14 } else { 10 };
        self.food_search(FoodSearch {
            start,
            allow_smile,
            max_depth,
            scan_limit: if few { 520 } else { 360 },
            check_limit: INF,
            route_kind: RouteKind::Near,
            arrow_level,
            urgent: false,
        })
    }

    fn route_food(&mut self, allow_smile: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let stone_maze = self.stone_maze_level();
        self.food_search(FoodSearch {
            start,
            allow_smile,
            max_depth: if few {
                145
            } else if stone_maze && self.urgent {
                122
            } else if stone_maze {
                108
            } else {
                98
            },
            scan_limit: if stone_maze && (few || self.urgent) {
                9000
            } else if few || self.urgent {
                7000
            } else if stone_maze {
                4600
            } else {
                3500
            },
            check_limit: if stone_maze && (few || self.urgent) {
                92
            } else if few {
                72
            } else if stone_maze {
                58
            } else {
                46
            },
            route_kind: RouteKind::Route,
            arrow_level,
            urgent: self.urgent,
        })
    }

    fn pressure_food(&mut self, allow_smile: bool, urgent: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let stone_maze = self.stone_maze_level();
        let deep_stall = stone_maze && self.idle >= 70;
        self.food_search(FoodSearch {
            start,
            allow_smile,
            max_depth: if few {
                if urgent {
                    155
                } else {
                    125
                }
            } else if deep_stall {
                148
            } else if stone_maze && urgent {
                132
            } else if stone_maze {
                104
            } else if urgent {
                110
            } else {
                85
            },
            scan_limit: if deep_stall {
                13000
            } else if stone_maze && (urgent || few) {
                11000
            } else if urgent || few {
                9000
            } else if stone_maze {
                6500
            } else {
                5000
            },
            check_limit: if deep_stall {
                120
            } else if stone_maze && urgent {
                96
            } else if urgent {
                70
            } else if stone_maze {
                58
            } else {
                44
            },
            route_kind: RouteKind::Pressure,
            arrow_level,
            urgent,
        })
    }

    fn food_search(&mut self, cfg: FoodSearch) -> Option<i32> {
        let mut q = VecDeque::from([cfg.start.clone()]);
        let mut seen = SeenKeys::with_capacity(cfg.scan_limit.max(1) as usize);
        seen.insert(state_key(&cfg.start));
        let mut scanned = 0;
        let mut checked = 0;
        let mut best = None;
        let mut best_score = i64::MIN;

        while let Some(st) = q.pop_front() {
            if scanned >= cfg.scan_limit || self.time_up() {
                return best;
            }
            scanned += 1;
            if st.dist >= cfg.max_depth {
                continue;
            }
            for &(sc, _) in &DIRS {
                if self.time_up() {
                    return best;
                }
                let Some(ns) = self.move_state(&st, sc, cfg.allow_smile) else {
                    continue;
                };
                let Some(ns) = self.route_prefix_state(ns, &cfg) else {
                    continue;
                };
                let key = state_key(&ns);
                if !seen.insert(key) {
                    continue;
                }
                if ns.ate > 0 {
                    checked += 1;
                    if let Some(score) = self.score_food_candidate(&ns, &cfg) {
                        if score > best_score {
                            best_score = score;
                            best = Some(ns.first);
                        }
                    }
                    if checked >= cfg.check_limit && best.is_some() {
                        return best;
                    }
                } else {
                    q.push_back(ns);
                }
            }
        }
        best
    }

    fn route_prefix_state(&mut self, mut ns: State, cfg: &FoodSearch) -> Option<State> {
        let exits = self.legal_count(&ns, true);
        if exits == 0 {
            return None;
        }
        if cfg.allow_smile && ns.smiles > self.smile_limit(cfg.route_kind, cfg.urgent) {
            return None;
        }
        if cfg.allow_smile && ns.smiles > 0 && self.avoid_extra_smile(ns.body.len() as i32) {
            return None;
        }
        let few = self.few();
        if exits <= 1 {
            let forced = self.forced_path(
                &ns,
                true,
                match cfg.route_kind {
                    RouteKind::Near => {
                        if few || cfg.urgent {
                            16
                        } else {
                            12
                        }
                    }
                    RouteKind::Route => {
                        if few || cfg.urgent {
                            24
                        } else {
                            18
                        }
                    }
                    RouteKind::Pressure => {
                        if few || cfg.urgent {
                            28
                        } else {
                            20
                        }
                    }
                },
            );
            if forced.dead {
                return None;
            }
            ns.chokes += 1
                + if forced.steps >= 8 { 1 } else { 0 }
                + if forced.end_exits <= 1 { 2 } else { 0 };

            if ns.chokes >= 3 || forced.steps >= 6 {
                let info = self.space_info(&ns, true);
                if self.enclosure_risk(&ns, info, exits, ns.ate + 1) {
                    return None;
                }
                let body_need = ns.body.len() as i32 + ns.ate + if few { 28 } else { 18 };
                if exits <= 1 && info.space < body_need + if info.tail_reach { 86 } else { 118 } {
                    ns.chokes += 4;
                }
            }
        } else if exits == 2 {
            ns.chokes = (ns.chokes - 1).max(0);
            if ns.chokes >= 8 && ns.dist % 4 == 0 {
                let info = self.space_info(&ns, true);
                if self.enclosure_risk(&ns, info, exits, ns.ate + 1) {
                    return None;
                }
            }
        } else {
            ns.chokes = (ns.chokes - 3).max(0);
        }

        if ns.dist >= 4 && (exits <= 2 || ns.dist % 5 == 0 || ns.chokes >= 4) {
            let info = self.space_info(&ns, true);
            if self.return_path_risk(&ns, info, exits, ns.ate + 1) {
                match cfg.route_kind {
                    RouteKind::Near => return None,
                    RouteKind::Route => {
                        if !cfg.urgent || exits <= 2 {
                            return None;
                        }
                        ns.chokes += 5;
                    }
                    RouteKind::Pressure => ns.chokes += if cfg.urgent { 3 } else { 5 },
                }
            } else if !info.tail_reach && exits <= 2 {
                match cfg.route_kind {
                    RouteKind::Near => return None,
                    RouteKind::Route => {
                        if !cfg.urgent {
                            return None;
                        }
                        ns.chokes += 4;
                    }
                    RouteKind::Pressure => ns.chokes += 2,
                }
            }
        }

        if ns.dist >= 2 && !self.doors.is_empty() {
            let start_door = self.door_exit_info(&cfg.start);
            let door = self.door_exit_info(&ns);
            let door_debt = self.door_regression_debt(
                start_door,
                door,
                ns.body.len() as i32,
                exits,
                cfg.route_kind,
                cfg.urgent,
            );
            if start_door.usable > 0 && door.total > 0 && door.usable == 0 {
                match cfg.route_kind {
                    RouteKind::Near | RouteKind::Route => return None,
                    RouteKind::Pressure => {
                        if !cfg.urgent {
                            return None;
                        }
                    }
                }
            }
            ns.chokes += (door_debt / 22_000).min(6) as i32;
        }

        if ns.dist >= 5 && (exits <= 2 || ns.dist % 6 == 0 || ns.chokes >= 4) {
            let info = self.space_info(&ns, true);
            let gate_debt =
                self.return_gate_debt(&ns, info, exits, ns.ate + 1, cfg.route_kind, cfg.urgent);
            let reject = match cfg.route_kind {
                RouteKind::Near => gate_debt > 58_000,
                RouteKind::Route => !cfg.urgent && gate_debt > 74_000,
                RouteKind::Pressure => !cfg.urgent && gate_debt > 112_000,
            };
            if reject {
                return None;
            }
            ns.chokes += (gate_debt / 24_000).min(5) as i32;
        }

        if ns.dist >= 4 && ns.repeats > 0 && (ns.dist % 4 == 0 || ns.repeats >= 22) {
            let info = self.space_info(&ns, true);
            let recent_debt = self.recent_memory_debt(
                &ns,
                info,
                info.tail_reach,
                exits,
                cfg.route_kind,
                cfg.urgent,
                ns.ate,
            );
            let reject = match cfg.route_kind {
                RouteKind::Near => recent_debt > 48_000 && ns.ate == 0 && !info.tail_reach,
                RouteKind::Route => {
                    recent_debt > 56_000 && ns.ate == 0 && !cfg.urgent && !info.tail_reach
                }
                RouteKind::Pressure => false,
            };
            if reject {
                return None;
            }
            ns.chokes += (recent_debt / 18_000).min(4) as i32;
        }
        if self.stone_maze_level()
            && self.idle >= 36
            && ns.dist >= 4
            && ns.ate == 0
            && exits <= 2
        {
            let food_dist = self.food_distance(&ns, 320);
            if food_dist > 24 {
                match cfg.route_kind {
                    RouteKind::Near | RouteKind::Route => return None,
                    RouteKind::Pressure => {
                        if ns.dist >= 8 || food_dist >= INF {
                            return None;
                        }
                        ns.chokes += 6;
                    }
                }
            }
        }
        if (self.line_maze_level() || self.stone_maze_level())
            && ns.dist >= 3
            && ns.ate == 0
            && ns.repeats >= 28
            && exits <= 2
        {
            match cfg.route_kind {
                RouteKind::Near | RouteKind::Route => return None,
                RouteKind::Pressure => {
                    if !cfg.urgent && ns.repeats >= 36 {
                        return None;
                    }
                    ns.chokes += 5;
                }
            }
        }

        let cap = match cfg.route_kind {
            RouteKind::Near => 9,
            RouteKind::Route => 18,
            RouteKind::Pressure => 24,
        } + if cfg.urgent || self.few() { 5 } else { 0 };
        if ns.chokes > cap {
            return None;
        }
        Some(ns)
    }

    fn score_food_candidate(&mut self, ns: &State, cfg: &FoodSearch) -> Option<i64> {
        let exits = self.legal_count(ns, true);
        if exits == 0 {
            return None;
        }
        let info = self.space_info(ns, true);
        let few = self.few();
        let body_len = ns.body.len() as i32;
        let min_space = match cfg.route_kind {
            RouteKind::Near => 170.min(body_len + if few { 20 } else { 10 }),
            RouteKind::Route => 210.min(body_len + if few { 30 } else { 16 }),
            RouteKind::Pressure => 165.min(body_len + if few { 14 } else { 8 }),
        };
        if self.enclosure_risk(ns, info, exits, ns.ate + 2) {
            return None;
        }
        let forced = self.forced_path(ns, true, if cfg.urgent || few { 30 } else { 22 });
        if exits <= 1 && forced.dead {
            return None;
        }
        let spacious = (info.tail_reach && info.space >= min_space)
            || info.space
                >= min_space
                    + match cfg.route_kind {
                        RouteKind::Near => 24,
                        RouteKind::Route => 48,
                        RouteKind::Pressure => 8,
                    };
        if !spacious && !(cfg.urgent && info.tail_reach) {
            return None;
        }

        let survival_limit = match cfg.route_kind {
            RouteKind::Near => {
                if few {
                    18
                } else if cfg.arrow_level {
                    10
                } else {
                    12
                }
            }
            RouteKind::Route => {
                if few || cfg.urgent {
                    32
                } else if cfg.arrow_level {
                    16
                } else {
                    20
                }
            }
            RouteKind::Pressure => {
                if cfg.urgent || few {
                    22
                } else if cfg.arrow_level {
                    14
                } else {
                    18
                }
            }
        };
        let live = self.survival_depth(ns, survival_limit);
        let escape_limit = match cfg.route_kind {
            RouteKind::Near => {
                if few {
                    14
                } else if cfg.arrow_level {
                    8
                } else {
                    10
                }
            }
            RouteKind::Route => {
                if few || cfg.urgent {
                    28
                } else if cfg.arrow_level {
                    14
                } else {
                    18
                }
            }
            RouteKind::Pressure => {
                if cfg.urgent || few {
                    18
                } else if cfg.arrow_level {
                    12
                } else {
                    14
                }
            }
        };
        let escape = self.escape_proof(ns, min_space, escape_limit, cfg.allow_smile);
        if !escape.ok {
            return None;
        }
        let return_open = info.tail_reach || escape.tail_reach;
        let roomy_no_tail = !return_open
            && exits >= 3
            && info.space
                >= body_len
                    + self.return_buffer(body_len, few)
                    + match cfg.route_kind {
                        RouteKind::Near => 88,
                        RouteKind::Route => 128,
                        RouteKind::Pressure => {
                            if cfg.urgent {
                                54
                            } else {
                                86
                            }
                        }
                    };
        if !return_open {
            match cfg.route_kind {
                RouteKind::Near | RouteKind::Route => return None,
                RouteKind::Pressure => {
                    // Long bodies normally refuse a pickup without a guaranteed tail
                    // return; when starving, accept it if the landing room is genuinely
                    // roomy (exits >= 3 + ample space, the roomy_no_tail floor).
                    if !cfg.urgent || !roomy_no_tail || (body_len >= 58 && self.idle < 50) {
                        return None;
                    }
                }
            }
        }
        if live < self.required_live(cfg.route_kind, cfg.arrow_level, few, cfg.urgent)
            && !(return_open && exits > 1)
        {
            return None;
        }

        let door = self.door_exit_info(ns);
        if self.door_exit_closed(door) {
            match cfg.route_kind {
                RouteKind::Near | RouteKind::Route => return None,
                RouteKind::Pressure => {
                    if !cfg.urgent {
                        return None;
                    }
                }
            }
        }
        let door_debt = self.door_exit_debt(door, body_len, exits);
        let start_door = self.door_exit_info(&cfg.start);
        let door_regression = self.door_regression_debt(
            start_door,
            door,
            body_len,
            exits,
            cfg.route_kind,
            cfg.urgent,
        );
        if start_door.usable > 0 && door.total > 0 && door.usable == 0 {
            match cfg.route_kind {
                RouteKind::Near | RouteKind::Route => return None,
                RouteKind::Pressure => {
                    if !cfg.urgent {
                        return None;
                    }
                }
            }
        }
        let gate_debt =
            self.return_gate_debt(ns, info, exits, ns.ate + 2, cfg.route_kind, cfg.urgent);
        if gate_debt
            > match cfg.route_kind {
                RouteKind::Near => 64_000,
                RouteKind::Route => {
                    if cfg.urgent {
                        112_000
                    } else {
                        82_000
                    }
                }
                RouteKind::Pressure => {
                    if cfg.urgent {
                        150_000
                    } else {
                        118_000
                    }
                }
            }
        {
            return None;
        }
        let recent_debt = self.recent_memory_debt(
            ns,
            info,
            escape.tail_reach,
            exits,
            cfg.route_kind,
            cfg.urgent,
            ns.ate,
        );
        let cluster = self.food_cluster(
            ns,
            if self.stone_maze_level() {
                58
            } else if few {
                52
            } else {
                42
            },
            if cfg.urgent || few { 1400 } else { 900 },
            cfg.allow_smile,
        );
        let cluster_credit = self.cluster_credit(cluster, cfg.route_kind, cfg.urgent);
        let rollout = self.pickup_rollout(ns, 2, cfg.allow_smile, cfg.urgent);
        let one_exit_cost = if exits == 1 {
            (match cfg.route_kind {
                RouteKind::Near => 22_000,
                RouteKind::Route => 42_000,
                RouteKind::Pressure => {
                    if cfg.urgent {
                        12_000
                    } else {
                        24_000
                    }
                }
            }) + forced.steps as i64 * 950
                + if forced.end_exits <= 1 { 18_000 } else { 0 }
                - forced.ate as i64 * 2_400
        } else {
            0
        };
        let return_debt = if return_open {
            0
        } else {
            match cfg.route_kind {
                RouteKind::Near => 38_000,
                RouteKind::Route => 86_000,
                RouteKind::Pressure => {
                    if cfg.urgent {
                        20_000
                    } else {
                        44_000
                    }
                }
            }
        };
        let smile_return_credit =
            self.smile_escape_credit(ns.smiles, cfg.route_kind, cfg.urgent, info, escape);
        let smile_strategy_credit = self.strategic_smile_credit(
            ns.smiles,
            cluster,
            info,
            escape,
            return_open,
            door,
            gate_debt,
            cfg.route_kind,
            cfg.urgent,
        );
        let base = match cfg.route_kind {
            RouteKind::Near => {
                -ns.dist as i64 * 6_400
                    + if info.tail_reach { 46_000 } else { 0 }
                    + live as i64 * 3_100
                    + exits as i64 * 1_800
                    + info.space as i64 * 9
                    + escape.space as i64 * 5
                    + if escape.tail_reach { 17_500 } else { 0 }
                    + ns.points as i64 * 130
            }
            RouteKind::Route => {
                (if info.tail_reach { 145_000 } else { 0 })
                    + live as i64 * 6_100
                    + exits as i64 * 2_700
                    + info.space as i64 * 18
                    + escape.space as i64 * 9
                    + if escape.tail_reach { 44_000 } else { 0 }
                    + ns.points as i64 * 170
                    - ns.dist as i64 * 230
            }
            RouteKind::Pressure => {
                (if info.tail_reach { 58_000 } else { 0 })
                    + live as i64 * 4_000
                    + exits as i64 * 2_300
                    + info.space as i64 * 14
                    + escape.space as i64 * 7
                    + if escape.tail_reach { 21_000 } else { 0 }
                    + ns.points as i64 * 250
                    - ns.dist as i64 * if cfg.urgent { 95 } else { 170 }
            }
        };
        // Advice #6: eat the easy (open) food first. While plenty of food is still
        // on the board and the body is short, defer a pickup that lands in a tight
        // cell (few exits) so the snake clears the open hearts first and comes back
        // for the cornered ones once the surrounding area -- and its own body -- has
        // room. Fades as items drop and switches off in the endgame, so the last
        // hearts in tight spots are still taken.
        let corner_defer = if !few && body_len < 60 && exits <= 2 {
            (3 - exits).max(0) as i64 * self.items.clamp(0, 75) as i64 * 24
        } else {
            0
        };
        Some(
            base + rollout
                + cluster_credit
                + smile_return_credit
                + smile_strategy_credit
                + self.door_exit_credit(door)
                - corner_defer
                - return_debt
                - door_debt
                - door_regression
                - gate_debt
                - recent_debt
                - ns.smiles as i64 * self.smile_cost(cfg.route_kind, cfg.urgent, body_len)
                - ns.stones as i64 * 52
                - ns.chokes as i64
                    * match cfg.route_kind {
                        RouteKind::Near => 3_400,
                        RouteKind::Route => 2_200,
                        RouteKind::Pressure => {
                            if cfg.urgent {
                                850
                            } else {
                                1_400
                            }
                        }
                    }
                - one_exit_cost
                - if escape.depth <= 1 { 3_500 } else { 0 }
                + escape.exits as i64 * 280
                - ns.dist as i64 * self.finish_dist_penalty(),
        )
    }

    fn required_live(&self, kind: RouteKind, arrow_level: bool, few: bool, urgent: bool) -> i32 {
        match kind {
            RouteKind::Near => {
                if few {
                    9
                } else if arrow_level {
                    5
                } else {
                    7
                }
            }
            RouteKind::Route => {
                if few || urgent {
                    18
                } else if arrow_level {
                    9
                } else {
                    12
                }
            }
            RouteKind::Pressure => {
                if urgent {
                    4
                } else if arrow_level {
                    6
                } else {
                    7
                }
            }
        }
    }

    fn breathing_move(&mut self) -> Option<i32> {
        let st = self.start_state();
        let body_len = st.body.len() as i32;
        let few = self.few();
        let live_limit = if few || self.urgent { 32 } else { 24 };
        let escape_limit = if few || self.urgent { 20 } else { 16 };
        let min_space = (body_len + if few { 34 } else { 22 }).min(240);

        for allow_smile in [true] {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                if self.time_up() {
                    return best;
                }
                let c = self.cell(&st, st.head + step(ns.first));
                let exits = self.legal_count(&ns, true);
                if exits == 0 {
                    continue;
                }
                let forced = self.forced_path(&ns, true, if few || self.urgent { 28 } else { 22 });
                if exits <= 1 && forced.dead {
                    continue;
                }
                let info = self.space_info(&ns, false);
                if self.enclosure_risk(&ns, info, exits, 2) && !(info.tail_reach && exits >= 2) {
                    continue;
                }
                let live = self.survival_depth(&ns, live_limit);
                let escape = self.escape_proof(&ns, min_space, escape_limit, true);
                if live < 9 && !escape.ok && !(info.tail_reach && exits >= 2) {
                    continue;
                }
                let return_room = self.return_path_room(info, exits, ns.body.len() as i32, few);
                let return_risk = self.return_path_risk(&ns, info, exits, 1);
                let door = self.door_exit_info(&ns);
                let door_debt = self.door_exit_debt(door, ns.body.len() as i32, exits);
                let start_door = self.door_exit_info(&st);
                let door_regression = self.door_regression_debt(
                    start_door,
                    door,
                    ns.body.len() as i32,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let gate_debt =
                    self.return_gate_debt(&ns, info, exits, 1, RouteKind::Pressure, self.urgent);
                let cluster = if c == 1 {
                    self.food_cluster(&ns, 42, 700, true)
                } else {
                    ClusterInfo::default()
                };
                let smile_strategy_credit = self.strategic_smile_credit(
                    ns.smiles,
                    cluster,
                    info,
                    escape,
                    info.tail_reach || escape.tail_reach,
                    door,
                    gate_debt,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let food_dist = if is_food(c) {
                    0
                } else {
                    self.food_distance(&ns, 360)
                };
                let food_pull = if food_dist < INF {
                    (30 - food_dist).max(0) as i64 * 260
                } else {
                    0
                };
                let recent_debt = self.recent_memory_debt(
                    &ns,
                    info,
                    escape.tail_reach,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                    if is_food(c) || food_pull > 0 { 1 } else { 0 },
                );
                let smile_growth_debt = if c == 1 {
                    self.smile_growth_debt(ns.body.len() as i32, self.urgent)
                } else {
                    0
                };
                let score = live as i64 * 8_400
                    + info.space as i64 * 28
                    + exits as i64 * 4_200
                    + escape.space as i64 * 10
                    + forced.end_exits as i64 * 2_200
                    + food_pull
                    + if info.tail_reach { 46_000 } else { 0 }
                    + if escape.tail_reach { 18_000 } else { 0 }
                    + if is_food(c) { 3_000 } else { 0 }
                    + self.cluster_credit(cluster, RouteKind::Pressure, self.urgent)
                    + smile_strategy_credit
                    + self.door_exit_credit(door)
                    + self.smile_step_credit(
                        c,
                        info,
                        escape,
                        return_room,
                        return_risk,
                        exits,
                        forced,
                    )
                    - if exits <= 1 {
                        13_000 + forced.steps as i64 * 650
                    } else {
                        0
                    }
                    - if c == 1 {
                        if return_room {
                            3_500
                        } else {
                            9_500
                        }
                    } else {
                        0
                    }
                    - smile_growth_debt
                    - if return_risk && !escape.tail_reach {
                        16_000
                    } else {
                        0
                    }
                    - door_debt
                    - door_regression
                    - gate_debt
                    - recent_debt
                    - ns.stones as i64 * 62
                    + if ns.first == st.dir { 90 } else { 0 };
                if score > best_score {
                    best_score = score;
                    best = Some(ns.first);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }

    fn pickup_rollout(
        &mut self,
        start: &State,
        pickups_left: i32,
        allow_smile: bool,
        urgent: bool,
    ) -> i64 {
        if pickups_left <= 0 || self.time_up() {
            return 0;
        }
        let mut q = VecDeque::from([start.clone()]);
        let scan_limit = if urgent || self.few() { 1400 } else { 900 };
        let mut seen = SeenKeys::with_capacity(scan_limit);
        seen.insert(state_key(start));
        let max_depth = if self.few() { 52 } else { 38 };
        let mut scanned = 0;
        let mut best = 0i64;
        while let Some(st) = q.pop_front() {
            if scanned >= scan_limit || self.time_up() {
                break;
            }
            scanned += 1;
            if st.dist - start.dist >= max_depth {
                continue;
            }
            for &(sc, _) in &DIRS {
                let Some(ns) = self.move_state(&st, sc, allow_smile) else {
                    continue;
                };
                if !seen.insert(state_key(&ns)) {
                    continue;
                }
                if ns.ate > start.ate {
                    let exits = self.legal_count(&ns, true);
                    if exits == 0 {
                        continue;
                    }
                    let info = self.space_info(&ns, true);
                    let forced = self.forced_path(&ns, true, if urgent { 22 } else { 16 });
                    if exits <= 1 && forced.dead {
                        continue;
                    }
                    if self.enclosure_risk(&ns, info, exits, pickups_left) {
                        continue;
                    }
                    let min_space = (ns.body.len() as i32 + 12).min(180);
                    let escape = self.escape_proof(
                        &ns,
                        min_space,
                        if urgent { 14 } else { 10 },
                        allow_smile,
                    );
                    if !escape.ok {
                        continue;
                    }
                    let return_open = info.tail_reach || escape.tail_reach;
                    if !return_open
                        && !(urgent
                            && exits >= 3
                            && info.space
                                >= ns.body.len() as i32
                                    + self.return_buffer(ns.body.len() as i32, self.few())
                                    + 70)
                    {
                        continue;
                    }
                    let door = self.door_exit_info(&ns);
                    if self.door_exit_closed(door) {
                        continue;
                    }
                    let door_debt = self.door_exit_debt(door, ns.body.len() as i32, exits);
                    let gate_debt = self.return_gate_debt(
                        &ns,
                        info,
                        exits,
                        pickups_left,
                        RouteKind::Pressure,
                        urgent,
                    );
                    if !urgent && gate_debt > 118_000 {
                        continue;
                    }
                    let cluster = self.food_cluster(
                        &ns,
                        if urgent || self.few() { 44 } else { 34 },
                        if urgent || self.few() { 900 } else { 620 },
                        allow_smile,
                    );
                    let return_debt = if return_open { 0 } else { 20_000 };
                    let new_smiles = ns.smiles - start.smiles;
                    let smile_return_credit =
                        if new_smiles > 0 && !info.tail_reach && escape.tail_reach {
                            new_smiles as i64 * if urgent { 2_800 } else { 1_900 }
                        } else {
                            0
                        };
                    let smile_growth_cost = if new_smiles > 0 {
                        new_smiles as i64
                            * (if urgent { 5_200 } else { 8_500 }
                                + self.smile_growth_debt(ns.body.len() as i32, urgent))
                    } else {
                        0
                    };
                    let smile_strategy_credit = self.strategic_smile_credit(
                        new_smiles,
                        cluster,
                        info,
                        escape,
                        return_open,
                        door,
                        gate_debt,
                        RouteKind::Pressure,
                        urgent,
                    );
                    let recent_debt = self.recent_memory_debt(
                        &ns,
                        info,
                        escape.tail_reach,
                        exits,
                        RouteKind::Pressure,
                        urgent,
                        ns.ate - start.ate,
                    );
                    let gain = ns.points as i64 * 180 - (ns.dist - start.dist) as i64 * 360
                        + info.space as i64 * 8
                        + exits as i64 * 1_500
                        + if info.tail_reach { 12_000 } else { 0 }
                        + if escape.tail_reach { 10_000 } else { 0 }
                        + self.cluster_credit(cluster, RouteKind::Pressure, urgent) / 2
                        + smile_return_credit
                        + smile_strategy_credit
                        + self.door_exit_credit(door)
                        - return_debt
                        - door_debt / 2
                        - gate_debt / 2
                        - recent_debt / 2
                        - smile_growth_cost
                        - if exits <= 1 {
                            10_000 + forced.steps as i64 * 520
                        } else {
                            0
                        }
                        + self.pickup_rollout(&ns, pickups_left - 1, allow_smile, urgent) / 2;
                    best = best.max(gain);
                } else {
                    q.push_back(ns);
                }
            }
        }
        best
    }

    fn enclosure_risk(
        &self,
        st: &State,
        info: SpaceInfo,
        exits: i32,
        expected_growth: i32,
    ) -> bool {
        let body_need = st.body.len() as i32 + expected_growth + if self.few() { 24 } else { 14 };
        let body_len = st.body.len() as i32;
        let return_need = body_len + expected_growth + self.return_buffer(body_len, self.few());
        if info.space < st.body.len() as i32 + expected_growth + 6 {
            return true;
        }
        if info.space < body_need && !info.tail_reach {
            return true;
        }
        if exits <= 1 && info.space < body_need + if info.tail_reach { 70 } else { 96 } {
            return true;
        }
        if exits <= 1 && !info.tail_reach && info.space < return_need + 52 {
            return true;
        }
        if exits <= 2 && !info.tail_reach && info.space < return_need + 34 {
            return true;
        }
        !info.tail_reach && info.space < return_need
    }

    fn tail_chase_move(&mut self) -> Option<i32> {
        // Long-snake endgame discipline. A long body can entomb itself by
        // greedily grabbing whatever space is nearest. When no food grab proved
        // safe, follow the path with the deepest guaranteed survival while
        // keeping the tail reachable -- in practice this trails the tail and
        // fills space safely instead of sealing the body in.
        //
        // Engage it earlier on the cramped maze levels: there the snake sealed
        // itself in well before body 80 (L2/L3 entombed at body 40-60). The open
        // arrow levels clear cleanly, so they keep the higher gate and the lighter
        // survival fallback below it.
        let floor = if self.arrow_level() { 80 } else { 52 };
        if (self.body.len() as i32) < floor {
            return None;
        }
        let st = self.start_state();
        let few = self.few();
        let live_limit = if few || self.urgent { 30 } else { 24 };
        for allow_smile in [false, true] {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                let c = self.cell(&st, st.head + step(ns.first));
                if c == 1 && self.avoid_extra_smile(st.body.len() as i32) {
                    continue;
                }
                let exits = self.legal_count(&ns, true);
                if exits == 0 {
                    continue;
                }
                let forced = self.forced_path(&ns, true, 20);
                if exits <= 1 && forced.dead {
                    continue;
                }
                let info = self.space_info(&ns, false);
                if self.enclosure_risk(&ns, info, exits, 1) && !(info.tail_reach && exits >= 2) {
                    continue;
                }
                let live = self.survival_depth(&ns, live_limit);
                let goal = if is_food(c) {
                    0
                } else {
                    self.goal_distance(&ns, 1600)
                };
                let goal_pull = if goal < INF {
                    3_000 - goal.min(180) as i64 * 25
                } else {
                    0
                };
                let recent_debt = self.recent_memory_debt(
                    &ns,
                    info,
                    info.tail_reach,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                    if is_food(c) { 1 } else { 0 },
                );
                let score = live as i64 * 9_000
                    + if info.tail_reach { 30_000 } else { 0 }
                    + info.space as i64 * 14
                    + exits as i64 * 2_000
                    + forced.end_exits as i64 * 1_200
                    + goal_pull
                    + if is_food(c) { 8_000 } else { 0 }
                    - if c == 1 {
                        if self.return_path_room(info, exits, ns.body.len() as i32, few) {
                            4_000
                        } else {
                            9_000
                        }
                    } else {
                        0
                    }
                    - ns.stones as i64 * 30
                    - recent_debt
                    + if ns.first == st.dir { 80 } else { 0 };
                if score > best_score {
                    best_score = score;
                    best = Some(ns.first);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }

    fn survival_move(&mut self) -> Option<i32> {
        let st = self.start_state();
        let few = self.few();
        let current_goal = self.goal_distance(&st, 1600);
        for allow_smile in [false, true] {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                let c = self.cell(&st, st.head + step(ns.first));
                if c == 1 && self.avoid_extra_smile(st.body.len() as i32) {
                    continue;
                }
                let exits = self.legal_count(&ns, true);
                if exits == 0 {
                    continue;
                }
                let info = self.space_info(&ns, false);
                let forced = self.forced_path(&ns, true, 18);
                if exits <= 1 && forced.dead {
                    continue;
                }
                let body_len = ns.body.len() as i32;
                let escape = self.escape_proof(
                    &ns,
                    (body_len + if few { 32 } else { 20 }).min(220),
                    if few || self.urgent { 16 } else { 11 },
                    true,
                );
                let return_room = self.return_path_room(info, exits, body_len, few);
                let return_risk = self.return_path_risk(&ns, info, exits, 1);
                let door = self.door_exit_info(&ns);
                let door_debt = self.door_exit_debt(door, body_len, exits);
                let start_door = self.door_exit_info(&st);
                let door_regression = self.door_regression_debt(
                    start_door,
                    door,
                    body_len,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let gate_debt =
                    self.return_gate_debt(&ns, info, exits, 1, RouteKind::Pressure, self.urgent);
                let cluster = if c == 1 {
                    self.food_cluster(&ns, 36, 520, true)
                } else {
                    ClusterInfo::default()
                };
                let smile_strategy_credit = self.strategic_smile_credit(
                    ns.smiles,
                    cluster,
                    info,
                    escape,
                    info.tail_reach || escape.tail_reach,
                    door,
                    gate_debt,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let recent_debt = self.recent_memory_debt(
                    &ns,
                    info,
                    escape.tail_reach,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                    if is_food(c) { 1 } else { 0 },
                );
                let goal = if is_food(c) {
                    0
                } else {
                    self.goal_distance(&ns, 1600)
                };
                let goal_pull = if goal < INF {
                    let progress = if current_goal < INF {
                        (current_goal - goal).clamp(-12, 12) as i64
                    } else {
                        0
                    };
                    6_000 - goal.min(180) as i64 * 45 + progress * 500
                } else {
                    0
                };
                let score = info.space as i64 * 26
                    + exits as i64 * 1_000
                    + goal_pull
                    + if is_food(c) { 2_500 } else { 0 }
                    + if info.tail_reach { 5_000 } else { 0 }
                    + if escape.tail_reach { 18_000 } else { 0 }
                    + if escape.ok { 4_500 } else { 0 }
                    + escape.space as i64 * 5
                    + forced.end_exits as i64 * 900
                    + self.door_exit_credit(door)
                    + self.cluster_credit(cluster, RouteKind::Pressure, self.urgent) / 2
                    + smile_strategy_credit
                    - if exits <= 1 {
                        7_000 + forced.steps as i64 * 420
                    } else {
                        0
                    }
                    - if c == 1 {
                        if return_room {
                            4_500
                        } else {
                            10_500
                        }
                    } else {
                        0
                    }
                    - ns.stones as i64 * 38
                    + if ns.first == st.dir { 60 } else { 0 }
                    - if self.enclosure_risk(&ns, info, exits, 1) {
                        10_000
                    } else {
                        0
                    }
                    - if return_risk && !escape.tail_reach {
                        28_000
                    } else {
                        0
                    }
                    - door_debt
                    - door_regression
                    - gate_debt
                    - recent_debt;
                if score > best_score {
                    best_score = score;
                    best = Some(ns.first);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }

    fn food_distance(&mut self, st: &State, limit: usize) -> i32 {
        let mut seen = VisitBits::default();
        seen.insert(st.head, st.dir);
        let mut q = VecDeque::from([(st.head, st.dir, 0i32)]);
        while let Some((o, dir, dist)) = q.pop_front() {
            if q.len() >= limit {
                break;
            }
            for &(sc, d) in &DIRS {
                if sc == opp(dir) {
                    continue;
                }
                let n = o + d;
                if self.danger(n, dist) || st.body_bits.contains(n) {
                    continue;
                }
                let c = self.cell(st, n);
                if is_food(c) {
                    return dist + 1;
                }
                if !open(c) {
                    continue;
                }
                if seen.insert(n, sc) {
                    q.push_back((n, sc, dist + 1));
                }
            }
        }
        INF
    }

    fn goal_distance(&mut self, st: &State, limit: usize) -> i32 {
        // Global heading toward the nearest gettable food, with the stone "dig"
        // distance as a fallback so walled-off food still gives a direction.
        // The space-maximizing fallbacks use this so they are never aimless
        // while items remain somewhere on the board.
        let d = self.food_distance(st, limit);
        if d < INF {
            return d;
        }
        if self.stone_maze_level() {
            self.dig_distance(st, limit)
        } else {
            d
        }
    }

    fn dig_distance(&self, st: &State, limit: usize) -> i32 {
        // Heading toward the nearest food when stones wall it off: a step-count
        // BFS that may pass through a stone cell when that stone is pushable
        // (the cell just beyond it, in the travel direction, is empty). This
        // turns "all food unreachable" into a gradient the bot can dig along
        // instead of orbiting an open pocket. It is an approximation -- it
        // reads the static board and does not replay each pushed stone -- but
        // it is a sound pull toward walled-off food.
        let mut seen = VisitBits::default();
        seen.insert(st.head, st.dir);
        let mut q = VecDeque::from([(st.head, st.dir, 0i32)]);
        while let Some((o, dir, dist)) = q.pop_front() {
            if q.len() >= limit {
                break;
            }
            for &(sc, d) in &DIRS {
                if sc == opp(dir) {
                    continue;
                }
                let n = o + d;
                if !(0..BOARD_LEN as i32).contains(&n)
                    || self.danger(n, dist)
                    || st.body_bits.contains(n)
                {
                    continue;
                }
                let c = self.cell(st, n);
                if is_food(c) {
                    return dist + 1;
                }
                if c == 10 {
                    let beyond = n + d;
                    if st.body_bits.contains(beyond) || self.cell(st, beyond) != 32 {
                        continue;
                    }
                } else if !open(c) {
                    continue;
                }
                if seen.insert(n, sc) {
                    q.push_back((n, sc, dist + 1));
                }
            }
        }
        INF
    }

    fn pressure_step(&mut self) -> Option<i32> {
        let st = self.start_state();
        let few = self.few();
        let stone_maze = self.stone_maze_level();
        let deep_stall = stone_maze && self.idle >= 70;
        let dist_limit = if stone_maze {
            if deep_stall {
                1600
            } else if self.urgent || few {
                1200
            } else {
                900
            }
        } else if self.urgent || few {
            620
        } else {
            420
        };
        let current_food = self.food_distance(&st, dist_limit);
        let current_dist = if current_food >= INF && stone_maze {
            self.dig_distance(&st, dist_limit)
        } else {
            current_food
        };
        // When starving, skip the smiley-free pass so a one-smiley bridge into
        // walled-off food can win below; -50 points beats orbiting to a restart.
        let desperate = self.urgent && self.idle >= 50;
        let passes: &[bool] = if desperate { &[true] } else { &[false, true] };
        for &allow_smile in passes {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                let c = self.cell(&st, st.head + step(ns.first));
                let exits = self.legal_count(&ns, true);
                if exits == 0 {
                    continue;
                }
                let info = self.space_info(&ns, false);
                let forced = self.forced_path(&ns, true, 16);
                if exits <= 1 && forced.dead {
                    continue;
                }
                let food_dist = if is_food(c) {
                    0
                } else {
                    self.food_distance(&ns, dist_limit)
                };
                // In a stone maze, fall back to a "dig" heading (through pushable
                // stones) so walled-off food still gives a gradient to follow
                // rather than leaving the bot to orbit an open pocket.
                let (dist, via_dig) = if food_dist >= INF && stone_maze {
                    let dig = self.dig_distance(&ns, dist_limit);
                    (dig, dig < INF)
                } else {
                    (food_dist, false)
                };
                if dist >= INF {
                    continue;
                }
                let body_len = ns.body.len() as i32;
                let escape = self.escape_proof(
                    &ns,
                    (body_len + if few { 28 } else { 18 }).min(200),
                    if self.urgent || few { 14 } else { 10 },
                    true,
                );
                let return_room = self.return_path_room(info, exits, body_len, few);
                let return_risk = self.return_path_risk(&ns, info, exits, 1);
                let roomy_pressure = exits >= 3
                    && info.space
                        >= body_len
                            + self.return_buffer(body_len, few)
                            + if deep_stall {
                                18
                            } else if self.urgent {
                                42
                            } else {
                                72
                            };
                // Advice #4: a committed dig. On a stone field, heading through a
                // pushable stone toward walled-off food AND getting closer to it.
                // When the snake is stalling, let such a move bypass the strict
                // escape gates below -- orbiting an open pocket without ever digging
                // is what made L4/L8 stall out at ~15/40 food. The enclosure check
                // stays, so it commits to digging without committing to a box-in.
                let digging = stone_maze
                    && via_dig
                    && dist < current_dist
                    && (self.urgent || deep_stall)
                    && !self.enclosure_risk(&ns, info, exits, 1);
                if stone_maze
                    && !escape.ok
                    && !escape.tail_reach
                    && !info.tail_reach
                    && !roomy_pressure
                    && !digging
                {
                    continue;
                }
                if stone_maze && return_risk && !escape.tail_reach && !roomy_pressure && !digging {
                    continue;
                }
                let door = self.door_exit_info(&ns);
                let door_debt = self.door_exit_debt(door, body_len, exits);
                let start_door = self.door_exit_info(&st);
                let door_regression = self.door_regression_debt(
                    start_door,
                    door,
                    body_len,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let gate_debt =
                    self.return_gate_debt(&ns, info, exits, 1, RouteKind::Pressure, self.urgent);
                let cluster = self.food_cluster(
                    &ns,
                    if stone_maze { 48 } else { 36 },
                    if stone_maze { 900 } else { 560 },
                    allow_smile,
                );
                let return_open = info.tail_reach || escape.tail_reach;
                let smile_strategy_credit = self.strategic_smile_credit(
                    ns.smiles,
                    cluster,
                    info,
                    escape,
                    return_open,
                    door,
                    gate_debt,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let progress = if current_dist < INF {
                    (current_dist - dist).clamp(-12, 12) as i64
                } else {
                    0
                };
                // Prefer being on a dig heading at all, and reward the actual
                // stone push that gets us closer to walled food.
                let dig_credit = if via_dig {
                    2_600 + if ns.stones > 0 && progress > 0 { 4_000 } else { 0 }
                } else {
                    0
                };
                let recent_debt = self.recent_memory_debt(
                    &ns,
                    info,
                    escape.tail_reach,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                    if is_food(c) || progress > 0 { 1 } else { 0 },
                );
                let dist_weight = if stone_maze {
                    if deep_stall {
                        6_200
                    } else if self.urgent {
                        4_600
                    } else {
                        2_800
                    }
                } else if self.urgent {
                    3_400
                } else {
                    2_200
                };
                let progress_weight = if stone_maze {
                    if deep_stall {
                        8_800
                    } else if self.urgent {
                        5_800
                    } else {
                        3_000
                    }
                } else if self.urgent {
                    4_800
                } else {
                    2_600
                };
                let score = -(dist as i64) * (dist_weight + self.finish_dist_penalty())
                    + progress * progress_weight
                    + dig_credit
                    + info.space as i64 * if stone_maze { 5 } else { 8 }
                    + exits as i64 * if stone_maze { 1_250 } else { 1_650 }
                    + if info.tail_reach { 8_000 } else { 0 }
                    + if escape.tail_reach { 15_000 } else { 0 }
                    + if escape.ok { 4_000 } else { 0 }
                    + escape.space as i64 * 4
                    + self.cluster_credit(cluster, RouteKind::Pressure, self.urgent) / 2
                    + smile_strategy_credit
                    + if is_food(c) {
                        if deep_stall {
                            44_000
                        } else if stone_maze || self.urgent {
                            34_000
                        } else {
                            26_000
                        }
                    } else {
                        0
                    }
                    + forced.end_exits as i64 * 1_100
                    + self.door_exit_credit(door)
                    - if exits <= 1 {
                        8_000 + forced.steps as i64 * 540
                    } else {
                        0
                    }
                    - if c == 1 {
                        let smile_pen = if return_room { 3_000 } else { 8_000 };
                        // A smiley costs -50, and on these levels every pickup
                        // spawns another one, so the board fills with them. Only
                        // spend one to keep moving when genuinely stuck (desperate)
                        // AND it bridges toward REAL reachable food (not the
                        // optimistic dig distance). Otherwise keep the full
                        // penalty -- cluster-worth bridges are handled by the
                        // food search's strategic-smile credit, not here.
                        if desperate && food_dist <= 16 {
                            smile_pen / 4
                        } else {
                            smile_pen
                        }
                    } else {
                        0
                    }
                    - ns.stones as i64
                        * if deep_stall {
                            22
                        } else if stone_maze {
                            34
                        } else {
                            75
                        }
                    + if ns.first == st.dir { 80 } else { 0 }
                    - if self.enclosure_risk(&ns, info, exits, 1) {
                        9_000
                    } else {
                        0
                    }
                    - if return_risk && !escape.tail_reach {
                        24_000
                    } else {
                        0
                    }
                    - door_debt
                    - door_regression
                    - gate_debt
                    - recent_debt;
                if score > best_score {
                    best_score = score;
                    best = Some(ns.first);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }

    fn last_chance_move(&mut self) -> Option<i32> {
        let st = self.start_state();
        let few = self.few();
        for allow_smile in [false, true] {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                let c = self.cell(&st, st.head + step(ns.first));
                let exits = self.legal_count(&ns, true);
                let info = self.space_info(&ns, false);
                let body_len = ns.body.len() as i32;
                let return_room = self.return_path_room(info, exits, body_len, few);
                let return_risk = self.return_path_risk(&ns, info, exits, 1);
                let door = self.door_exit_info(&ns);
                let door_debt = self.door_exit_debt(door, body_len, exits);
                let start_door = self.door_exit_info(&st);
                let door_regression = self.door_regression_debt(
                    start_door,
                    door,
                    body_len,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let gate_debt =
                    self.return_gate_debt(&ns, info, exits, 1, RouteKind::Pressure, self.urgent);
                let cluster = self.food_cluster(&ns, 28, 360, allow_smile);
                let escape = EscapeInfo {
                    ok: false,
                    depth: 0,
                    space: info.space,
                    tail_reach: info.tail_reach,
                    exits,
                };
                let smile_strategy_credit = self.strategic_smile_credit(
                    ns.smiles,
                    cluster,
                    info,
                    escape,
                    info.tail_reach,
                    door,
                    gate_debt,
                    RouteKind::Pressure,
                    self.urgent,
                );
                let dist = if is_food(c) {
                    0
                } else {
                    self.food_distance(&ns, 180)
                };
                let recent_debt = self.recent_memory_debt(
                    &ns,
                    info,
                    info.tail_reach,
                    exits,
                    RouteKind::Pressure,
                    self.urgent,
                    if is_food(c) || dist < 20 { 1 } else { 0 },
                );
                let score = info.space as i64 * 14
                    + exits as i64 * 2_400
                    + if info.tail_reach { 9_000 } else { 0 }
                    + if dist < INF {
                        (20 - dist).max(0) as i64 * 180
                    } else {
                        0
                    }
                    + if is_food(c) { 6_000 } else { 0 }
                    + self.cluster_credit(cluster, RouteKind::Pressure, self.urgent) / 3
                    + smile_strategy_credit
                    + self.door_exit_credit(door)
                    - if c == 1 {
                        if return_room {
                            1_500
                        } else {
                            6_000
                        }
                    } else {
                        0
                    }
                    - ns.stones as i64 * 45
                    - if return_risk { 12_000 } else { 0 }
                    - door_debt
                    - door_regression
                    - gate_debt
                    - recent_debt
                    + if ns.first == st.dir { 80 } else { 0 };
                if score > best_score {
                    best_score = score;
                    best = Some(ns.first);
                }
            }
            if best.is_some() {
                return best;
            }
        }
        None
    }
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

#[cfg(test)]
fn cmp_i64_desc(a: i64, b: i64) -> std::cmp::Ordering {
    b.cmp(&a)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_board() -> [u16; BOARD_LEN] {
        let mut board = [0u16; BOARD_LEN];
        for row in 1..=25 {
            for col in 1..=80 {
                board[offset(row, col) as usize] = 32;
            }
        }
        board
    }

    fn planner(board: [u16; BOARD_LEN], body: Vec<i32>) -> Planner {
        Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            Vec::new(),
            26,
            12,
            0,
            false,
            1_000_000.0,
        )
    }

    fn planner_level(board: [u16; BOARD_LEN], body: Vec<i32>, level: i32) -> Planner {
        Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            Vec::new(),
            level,
            12,
            0,
            false,
            1_000_000.0,
        )
    }

    fn vertical_door_board() -> [u16; BOARD_LEN] {
        let mut board = empty_board();
        for row in 8..=13 {
            board[offset(row, 12) as usize] = 179;
        }
        board[offset(10, 12) as usize] = 32;
        board[offset(11, 12) as usize] = 32;
        board
    }

    #[test]
    fn rejects_instant_reverse() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = planner(board, body);
        let st = p.start_state();
        assert!(p.move_state(&st, 75, true).is_none());
        assert!(p.move_state(&st, 77, true).is_some());
    }

    #[test]
    fn pushes_stone_when_next_cell_is_empty() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 12) as usize] = 10;
        board[offset(10, 13) as usize] = 32;
        let p = planner(board, body);
        let st = p.start_state();
        let ns = p
            .move_state(&st, 77, true)
            .expect("stone push should be legal");
        assert_eq!(p.cell(&ns, offset(10, 12)), 32);
        assert_eq!(p.cell(&ns, offset(10, 13)), 10);
        assert_eq!(ns.stones, 1);
    }

    #[test]
    fn growth_keeps_tail_on_food() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 12) as usize] = 3;
        let p = planner(board, body);
        let st = p.start_state();
        let ns = p.move_state(&st, 77, false).expect("food should be legal");
        assert_eq!(ns.body.len(), 3);
        assert!(ns.body_bits.contains(offset(10, 10)));
        assert_eq!(ns.points, 10);
    }

    #[test]
    fn empty_move_releases_tail() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = planner(board, body);
        let st = p.start_state();
        let ns = p
            .move_state(&st, 77, true)
            .expect("empty move should be legal");
        assert_eq!(ns.body.len(), 2);
        assert!(!ns.body_bits.contains(offset(10, 10)));
        assert_eq!(p.cell(&ns, offset(10, 10)), 32);
    }

    #[test]
    fn wall_gap_projection_marks_closing_gap_top() {
        // Advice #7: on the wall-gap level the closing edge of each crawling gap is
        // projected as danger so the snake does not dive into a sealing mouth.
        let mut board = empty_board();
        let col = 16;
        for row in 4..=20 {
            board[offset(row, col) as usize] = 179;
        }
        for row in 9..=11 {
            board[offset(row, col) as usize] = 32; // a 3-cell gap
        }
        let body = vec![offset(2, 2), offset(2, 3)];
        let p = planner_level(board, body, 5); // level 5 -> mode 4 -> wall-gap
        assert!(p.wall_gap_level());
        assert_eq!(p.wall_gap_top(col), Some(9));
        assert!(p.danger(offset(9, col), 0), "the gap top is the closing edge");
        // A wide-open cell nowhere near a wall is not flagged.
        assert!(!p.danger(offset(10, 40), 0));
    }

    #[test]
    fn projects_future_up_arrow_danger() {
        let mut board = empty_board();
        let mut enemy = [0; ENEMY_LEN];
        let col = 10;
        enemy[(col * 4 + 1) as usize] = 8;
        board[offset(8, col) as usize] = 24;
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = Planner::new(
            board,
            body,
            enemy,
            Vec::new(),
            30,
            20,
            0,
            false,
            1_000_000.0,
        );
        assert!(p.danger(offset(7, col), 0));
        assert!(p.danger(offset(6, col), 1));
    }

    #[test]
    fn escape_proof_finds_open_space() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let ns = p.move_state(&st, 77, true).unwrap();
        let proof = p.escape_proof(&ns, 20, 6, true);
        assert!(proof.ok);
    }

    #[test]
    fn enclosure_risk_rejects_small_closed_region() {
        let mut board = empty_board();
        for row in 8..=12 {
            board[offset(row, 8) as usize] = 179;
            board[offset(row, 12) as usize] = 179;
        }
        for col in 8..=12 {
            board[offset(8, col) as usize] = 196;
            board[offset(12, col) as usize] = 196;
        }
        let body = vec![offset(10, 9), offset(10, 10)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let info = p.space_info(&st, false);
        assert!(p.enclosure_risk(&st, info, 1, 2));
    }

    #[test]
    fn return_path_risk_flags_region_cut_off_from_tail() {
        let mut board = empty_board();
        for row in 8..=12 {
            board[offset(row, 12) as usize] = 179;
            board[offset(row, 16) as usize] = 179;
        }
        for col in 12..=16 {
            board[offset(8, col) as usize] = 196;
            board[offset(12, col) as usize] = 196;
        }
        let body = vec![offset(10, 10), offset(10, 13), offset(10, 14)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let info = p.space_info(&st, false);
        assert!(!info.tail_reach);
        assert!(p.return_path_risk(&st, info, 2, 1));
    }

    #[test]
    fn door_exit_strategy_accepts_one_reserved_lane() {
        let board = vertical_door_board();
        let body = vec![offset(10, 13), offset(10, 14)];
        let p = planner_level(board, body, 27);
        let st = p.start_state();
        let info = p.door_exit_info(&st);
        assert_eq!(p.doors.len(), 1);
        assert_eq!(info.total, 1);
        assert_eq!(info.usable, 1);
        assert_eq!(info.blocked, 0);
        assert!(!p.door_exit_closed(info));
    }

    #[test]
    fn door_exit_strategy_flags_blocked_return_lanes() {
        let board = vertical_door_board();
        let body = vec![
            offset(9, 14),
            offset(10, 13),
            offset(11, 13),
            offset(10, 14),
        ];
        let p = planner_level(board, body, 27);
        let st = p.start_state();
        let info = p.door_exit_info(&st);
        assert_eq!(info.total, 1);
        assert_eq!(info.usable, 0);
        assert_eq!(info.blocked, 1);
        assert!(p.door_exit_closed(info));
        assert!(p.door_exit_debt(info, st.body.len() as i32, 2) > 100_000);
    }

    #[test]
    fn door_regression_debt_protects_reserved_return_lane() {
        let board = vertical_door_board();
        let open_body = vec![offset(10, 13), offset(10, 14)];
        let blocked_body = vec![
            offset(9, 14),
            offset(10, 13),
            offset(11, 13),
            offset(10, 14),
        ];
        let p = planner_level(board, open_body, 27);
        let before = p.door_exit_info(&p.start_state());
        let mut bits = BoardBits::default();
        for off in &blocked_body {
            bits.insert(*off);
        }
        let after_state = State {
            head: offset(10, 14),
            body: BodyTrace::new(blocked_body),
            body_bits: bits,
            dir: 77,
            overlay: CellOverlay::default(),
            first: 77,
            dist: 1,
            ate: 0,
            points: 0,
            smiles: 0,
            stones: 0,
            chokes: 0,
            repeats: 0,
        };
        let after = p.door_exit_info(&after_state);
        assert_eq!(before.usable, 1);
        assert_eq!(after.usable, 0);
        assert!(p.door_regression_debt(before, after, 64, 2, RouteKind::Route, false) > 100_000);
    }

    #[test]
    fn return_gate_debt_penalizes_single_narrow_tail_route() {
        let mut board = empty_board();
        for col in 11..=15 {
            board[offset(9, col) as usize] = 196;
            board[offset(11, col) as usize] = 196;
        }
        board[offset(10, 16) as usize] = 196;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let ns = p.move_state(&st, 77, true).unwrap();
        let info = p.space_info(&ns, false);
        let exits = p.legal_count(&ns, true);
        assert!(p.return_gate_debt(&ns, info, exits, 1, RouteKind::Route, false) > 20_000);
    }

    #[test]
    fn recent_memory_debt_penalizes_looping_without_progress() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut trail = Vec::new();
        for col in 20..=48 {
            trail.push(offset(5, col));
        }
        trail.push(offset(10, 12));
        let mut p = Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            trail,
            26,
            12,
            0,
            false,
            1_000_000.0,
        );
        let st = p.start_state();
        let ns = p.move_state(&st, 77, true).unwrap();
        let info = p.space_info(&ns, false);
        let exits = p.legal_count(&ns, true);
        let debt = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Route, false, 0);
        let progress_debt =
            p.recent_memory_debt(&ns, info, false, exits, RouteKind::Route, false, 1);
        assert!(ns.repeats > 0);
        assert!(debt > 0);
        assert!(progress_debt < debt);
    }

    #[test]
    fn force_risk_amplifies_loop_breaker() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut trail = Vec::new();
        for col in 20..=48 {
            trail.push(offset(5, col));
        }
        trail.push(offset(10, 12));
        let mut p = Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            trail,
            26,
            12,
            0,
            false,
            1_000_000.0,
        );
        let st = p.start_state();
        let ns = p.move_state(&st, 77, true).unwrap();
        let info = p.space_info(&ns, false);
        let exits = p.legal_count(&ns, true);
        let normal = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Pressure, true, 0);
        p.force_risk = true;
        let forced = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Pressure, true, 0);
        assert!(ns.repeats > 0);
        assert!(forced > normal, "force_risk should amplify the loop-breaking debt");
    }

    #[test]
    fn idle_ticks_make_planner_urgent() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            Vec::new(),
            26,
            40,
            18,
            false,
            1_000_000.0,
        );
        assert!(p.urgent);
    }

    #[test]
    fn long_body_blocks_extra_smileys_before_endgame() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            Vec::new(),
            26,
            12,
            0,
            false,
            1_000_000.0,
        );
        assert!(!p.avoid_extra_smile(114));
        assert!(p.avoid_extra_smile(115));
    }

    #[test]
    fn open_levels_are_stingier_with_smileys() {
        // Advice #5: on the wide-open arrow levels a smiley should cost much more
        // than on a walled maze (where one can be a needed bridge), and the snake
        // should refuse to bridge one well before the long-body gate.
        let arrow = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 6);
        let stone = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 4);
        assert!(arrow.open_board_level());
        assert!(!stone.open_board_level());
        assert!(
            arrow.smile_cost(RouteKind::Route, false, 40) > stone.smile_cost(RouteKind::Route, false, 40),
            "an open-board smiley must cost more than a maze smiley"
        );
        // A mid-length body refuses smiley bridges on the open board but not yet on
        // the stone maze (where the long-body gate is 115).
        assert!(arrow.avoid_extra_smile(25));
        assert!(!stone.avoid_extra_smile(25));
    }

    #[test]
    fn normal_food_route_rejects_cut_off_tail_return() {
        let mut board = empty_board();
        for row in 8..=12 {
            board[offset(row, 12) as usize] = 179;
            board[offset(row, 16) as usize] = 179;
        }
        for col in 12..=16 {
            board[offset(8, col) as usize] = 196;
            board[offset(12, col) as usize] = 196;
        }
        board[offset(10, 15) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 13), offset(10, 14)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let ns = p
            .move_state(&st, 77, false)
            .expect("food inside the room is reachable");
        let cfg = FoodSearch {
            start: st,
            allow_smile: false,
            max_depth: 10,
            scan_limit: 50,
            check_limit: 10,
            route_kind: RouteKind::Route,
            arrow_level: false,
            urgent: false,
        };
        assert!(p.score_food_candidate(&ns, &cfg).is_none());
    }

    #[test]
    fn strategic_smiley_bridge_can_unlock_clustered_food() {
        let mut board = empty_board();
        board[offset(10, 12) as usize] = 1;
        board[offset(10, 13) as usize] = 3;
        board[offset(9, 13) as usize] = 5;
        board[offset(11, 13) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let cfg = FoodSearch {
            start: st.clone(),
            allow_smile: true,
            max_depth: 12,
            scan_limit: 80,
            check_limit: 10,
            route_kind: RouteKind::Route,
            arrow_level: false,
            urgent: false,
        };
        let ns = p.move_state(&st, 77, true).unwrap();
        let ns = p.route_prefix_state(ns, &cfg).unwrap();
        let ns = p.move_state(&ns, 77, true).unwrap();
        let score = p.score_food_candidate(&ns, &cfg);
        assert!(score.is_some());
        let cluster = p.food_cluster(&ns, 16, 120, true);
        assert!(cluster.foods >= 2);
        assert!(p.cluster_credit(cluster, RouteKind::Route, false) > 0);
    }

    #[test]
    fn normal_food_route_rejects_second_smiley() {
        let mut board = empty_board();
        board[offset(10, 12) as usize] = 1;
        board[offset(10, 13) as usize] = 1;
        board[offset(10, 14) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        let st = p.start_state();
        let cfg = FoodSearch {
            start: st.clone(),
            allow_smile: true,
            max_depth: 10,
            scan_limit: 50,
            check_limit: 10,
            route_kind: RouteKind::Route,
            arrow_level: false,
            urgent: false,
        };
        let ns = p
            .move_state(&st, 77, true)
            .expect("first smiley remains available as a tactical option");
        let ns = p
            .route_prefix_state(ns, &cfg)
            .expect("one smiley is still permitted on a normal route");
        let ns = p
            .move_state(&ns, 77, true)
            .expect("second smiley is physically reachable");
        assert!(p.route_prefix_state(ns, &cfg).is_none());
    }

    #[test]
    fn breathing_move_can_take_smiley_bridge_out_of_a_trap() {
        let mut board = empty_board();
        let body = vec![offset(10, 9), offset(10, 10)];
        board[offset(10, 11) as usize] = 1;

        // Up and down are legal first steps, but each immediately enters a
        // one-way dead pocket. The right move grows through a smiley but keeps
        // the only route into the open area.
        for off in [
            offset(8, 10),
            offset(9, 9),
            offset(9, 11),
            offset(12, 10),
            offset(11, 9),
            offset(11, 11),
        ] {
            board[off as usize] = 196;
        }

        let mut p = planner(board, body);
        assert_eq!(p.breathing_move(), Some(77));
    }

    #[test]
    fn self_seal_guard_overrides_into_a_tiny_pocket() {
        // Advice #3: a long body about to step into a 2-cell dead pocket, when an
        // open direction exists, gets steered to the roomy move instead.
        let mut board = empty_board();
        // Pocket {(10,12),(10,13)} sealed on every side but the body to its left.
        board[offset(9, 12) as usize] = 196;
        board[offset(9, 13) as usize] = 196;
        board[offset(11, 12) as usize] = 196;
        board[offset(11, 13) as usize] = 196;
        board[offset(10, 14) as usize] = 196;
        // A 10-long body lying along row 10, head at (10,11).
        let body: Vec<i32> = (2..=11).map(|c| offset(10, c)).collect();
        let p = planner_level(board, body, 2); // line maze -> maze_confined
        assert!(p.maze_confined());
        // Right (77) seals into the 2-cell pocket; up (72) is wide open.
        let overridden = p.avoid_self_seal(77);
        assert_ne!(overridden, 77, "should refuse to seal into the tiny pocket");
        assert!(matches!(overridden, 72 | 80), "should pick an open direction");
    }

    #[test]
    fn forced_path_detects_one_way_dead_end() {
        let mut board = empty_board();
        for col in 11..=14 {
            board[offset(9, col) as usize] = 196;
            board[offset(11, col) as usize] = 196;
        }
        board[offset(10, 15) as usize] = 196;
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = planner(board, body);
        let st = p.start_state();
        let ns = p.move_state(&st, 77, true).unwrap();
        let forced = p.forced_path(&ns, true, 8);
        assert!(forced.dead);
        assert_eq!(forced.end_exits, 0);
        assert!(forced.steps > 0);
    }

    #[test]
    fn survival_move_avoids_dead_corridor_when_branch_exists() {
        let mut board = empty_board();
        for col in 11..=14 {
            board[offset(9, col) as usize] = 196;
            board[offset(11, col) as usize] = 196;
        }
        board[offset(10, 15) as usize] = 196;
        board[offset(9, 11) as usize] = 32;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        assert_ne!(p.survival_move(), Some(77));
    }

    #[test]
    fn stone_maze_pressure_chases_reachable_food() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 13) as usize] = 3;
        for row in 7..=13 {
            board[offset(row, 9) as usize] = 10;
        }
        let mut p = planner_level(board, body, 28);
        p.urgent = true;
        assert_eq!(p.pressure_step(), Some(77));
    }

    #[test]
    fn dig_distance_tunnels_through_pushable_stone() {
        let mut board = empty_board();
        // A one-wide corridor on row 10: walls seal rows 9 and 11 over the food
        // region and cap the far end, so the only way in is through the stone.
        for col in 12..=16 {
            board[offset(9, col) as usize] = 196;
            board[offset(11, col) as usize] = 196;
        }
        board[offset(10, 16) as usize] = 196;
        board[offset(10, 13) as usize] = 10; // stone
        board[offset(10, 14) as usize] = 32; // empty behind it -> pushable
        board[offset(10, 15) as usize] = 3; // walled-off heart
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner_level(board, body, 28);
        let st = p.start_state();
        assert!(
            p.food_distance(&st, 2000) >= INF,
            "plain distance treats stones as walls and cannot reach the food"
        );
        let dig = p.dig_distance(&st, 2000);
        assert!(
            dig > 0 && dig < INF,
            "dig distance tunnels through the pushable stone: {dig}"
        );
        // goal_distance falls back to the dig heading in a stone maze.
        assert!(p.goal_distance(&st, 2000) < INF);
    }

    #[test]
    fn survival_move_heads_toward_distant_food() {
        // On an open board the space-maximizing fallback should still drift
        // toward the only food instead of wandering away from it.
        let mut board = empty_board();
        board[offset(10, 40) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        assert_eq!(p.survival_move(), Some(77));
    }

    #[test]
    fn finish_pressure_only_applies_when_few_items_remain_with_bonus() {
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(empty_board(), body);
        p.bonus = 9000;
        assert_eq!(p.finish_dist_penalty(), 0, "many items: no finish pressure");
        p.items = 2;
        assert!(
            p.finish_dist_penalty() > 0,
            "few items + bonus on the clock: finish pressure kicks in"
        );
        p.bonus = 0;
        assert_eq!(p.finish_dist_penalty(), 0, "no bonus left: no finish pressure");
    }

    #[test]
    fn tail_chase_engages_only_for_long_snakes() {
        // A short snake leaves the long-game discipline out of the way.
        let short = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(empty_board(), short);
        assert_eq!(p.tail_chase_move(), None);

        // A long body (folded boustrophedon block) gets a real, legal move.
        let mut body = Vec::new();
        for r in 0..5 {
            let row = 5 + r;
            if r % 2 == 0 {
                for col in 5..=22 {
                    body.push(offset(row, col));
                }
            } else {
                for col in (5..=22).rev() {
                    body.push(offset(row, col));
                }
            }
        }
        assert!(body.len() >= 80);
        let mut p2 = planner(empty_board(), body);
        assert!(matches!(p2.tail_chase_move(), Some(72 | 80 | 75 | 77)));
    }

    #[test]
    fn last_chance_returns_legal_move_instead_of_zero() {
        let board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        assert_eq!(p.last_chance_move(), Some(77));
    }

    #[test]
    fn last_chance_returns_dead_corridor_when_it_is_the_only_move() {
        let mut board = empty_board();
        for col in 11..=14 {
            board[offset(9, col) as usize] = 196;
            board[offset(11, col) as usize] = 196;
        }
        board[offset(10, 15) as usize] = 196;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner(board, body);
        assert_eq!(p.last_chance_move(), Some(77));
    }

    #[test]
    fn open_food_is_preferred_over_a_cornered_heart() {
        // Advice #6: with many items left, the open heart is taken before the one
        // tucked in a tight niche.
        let mut board = empty_board();
        board[offset(10, 14) as usize] = 3; // open heart to the right
        // A cornered heart up a one-wide niche (entry only from below).
        board[offset(7, 11) as usize] = 196;
        board[offset(8, 10) as usize] = 196;
        board[offset(8, 12) as usize] = 196;
        board[offset(8, 11) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner_level(board, body, 2);
        assert_eq!(p.decide(), 77, "take the open heart first, defer the niche");
    }

    #[test]
    fn food_cluster_scores_multiple_future_pickups() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 13) as usize] = 3;
        board[offset(9, 13) as usize] = 5;
        board[offset(11, 13) as usize] = 3;
        let p = planner(board, body);
        let st = p.start_state();
        let cluster = p.food_cluster(&st, 12, 120, false);
        assert_eq!(cluster.foods, 3);
        assert!(cluster.score > 0);
        assert!(p.cluster_credit(cluster, RouteKind::Route, false) > 0);
    }

    #[test]
    fn multi_pickup_rollout_rewards_second_food() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 12) as usize] = 3;
        board[offset(10, 14) as usize] = 5;
        let mut p = planner(board, body);
        let st = p.start_state();
        let first = p.move_state(&st, 77, false).unwrap();
        assert!(p.pickup_rollout(&first, 2, false, false) > 0);
    }

    #[test]
    fn endgame_commits_to_the_last_heart() {
        // Advice #8: with only a few items left, decide() should still route to a
        // reachable heart and not stall.
        let mut board = empty_board();
        board[offset(10, 16) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = Planner::new(
            board,
            body,
            [0; ENEMY_LEN],
            Vec::new(),
            26,
            3, // few(): only 3 items remain
            0,
            false,
            1_000_000.0,
        );
        assert!(p.few());
        assert_eq!(p.decide(), 77, "endgame should head toward the remaining heart");
    }

    #[test]
    fn walled_level_sweeps_toward_reachable_food() {
        // Advice #1: on a walled level decide() routes to a reachable heart.
        let mut board = empty_board();
        board[offset(10, 16) as usize] = 3;
        let body = vec![offset(10, 10), offset(10, 11)];
        let mut p = planner_level(board, body, 2); // line maze -> not open_board_level
        assert!(!p.open_board_level());
        assert_eq!(p.decide(), 77, "walled-level sweep heads toward the heart");
    }

    #[test]
    fn decide_returns_arrow_scancode() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 13) as usize] = 3;
        let mut p = planner(board, body);
        assert!(matches!(p.decide(), 72 | 80 | 75 | 77));
    }

    #[test]
    fn force_risk_keeps_the_wasm_engine_in_charge() {
        // forceRisk must still produce a real move from the engine (it no longer
        // falls back to the weaker JS planner when the bot is stuck).
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 13) as usize] = 3;
        let mut p = planner(board, body);
        p.force_risk = true;
        assert!(matches!(p.decide(), 72 | 80 | 75 | 77));
    }

    #[test]
    fn cmp_desc_orders_high_scores_first() {
        let mut xs = [1, 9, 3];
        xs.sort_by(|a, b| cmp_i64_desc(*a, *b));
        assert_eq!(xs, [9, 3, 1]);
    }
}
