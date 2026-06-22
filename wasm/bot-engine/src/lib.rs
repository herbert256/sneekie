use std::collections::VecDeque;

const BOARD_LEN: usize = 4000;
const BODY_CAP: usize = 15001;
const ENEMY_LEN: usize = 81 * 4;
const DIRS: [(i32, i32); 4] = [(72, -160), (80, 160), (75, -2), (77, 2)];
const MAX_DANGER_TICKS: usize = 7;
const BIT_WORDS: usize = (BOARD_LEN + 63) / 64;
const INF: i32 = 1_000_000;

static mut BOARD: [u16; BOARD_LEN] = [0; BOARD_LEN];
static mut BODY: [i32; BODY_CAP] = [0; BODY_CAP];
static mut ENEMY: [i32; ENEMY_LEN] = [0; ENEMY_LEN];

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
pub extern "C" fn decide(
    level: i32,
    items: i32,
    body_len: i32,
    idle: i32,
    looping: i32,
    budget_ms: f64,
) -> i32 {
    let body_len = body_len.clamp(2, BODY_CAP as i32) as usize;
    let mut board = [0u16; BOARD_LEN];
    let mut body = Vec::with_capacity(body_len);
    let mut enemy = [0i32; ENEMY_LEN];

    unsafe {
        let board_src = core::ptr::addr_of!(BOARD).cast::<u16>();
        let body_src = core::ptr::addr_of!(BODY).cast::<i32>();
        let enemy_src = core::ptr::addr_of!(ENEMY).cast::<i32>();
        for (i, dest) in board.iter_mut().enumerate() {
            *dest = *board_src.add(i);
        }
        for i in 0..body_len {
            body.push(*body_src.add(i));
        }
        for (i, dest) in enemy.iter_mut().enumerate() {
            *dest = *enemy_src.add(i);
        }
    }

    let urgent = idle >= 18 || looping != 0;
    let deadline = host_now_ms() + budget_ms.max(1.0);
    let mut planner = Planner::new(board, body, enemy, level, items, urgent, deadline);
    planner.decide()
}

#[derive(Clone)]
struct State {
    head: i32,
    body: BodyTrace,
    body_bits: BoardBits,
    dir: i32,
    cells: Vec<(i32, u16)>,
    first: i32,
    dist: i32,
    ate: i32,
    points: i32,
    smiles: i32,
    stones: i32,
    chokes: i32,
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

struct Planner {
    board: [u16; BOARD_LEN],
    body: Vec<i32>,
    body_bits: BoardBits,
    enemy: [i32; ENEMY_LEN],
    level: i32,
    items: i32,
    dir: i32,
    urgent: bool,
    deadline: f64,
    clock_checks: u32,
    danger_masks: [BoardBits; MAX_DANGER_TICKS + 1],
    danger_len: usize,
}

impl Planner {
    fn new(
        board: [u16; BOARD_LEN],
        body: Vec<i32>,
        enemy: [i32; ENEMY_LEN],
        level: i32,
        items: i32,
        urgent: bool,
        deadline: f64,
    ) -> Self {
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
        let mut planner = Self {
            board,
            body,
            body_bits,
            enemy,
            level,
            items,
            dir,
            urgent,
            deadline,
            clock_checks: 0,
            danger_masks: [BoardBits::default(); MAX_DANGER_TICKS + 1],
            danger_len: 1,
        };
        let (danger_masks, danger_len) = planner.build_danger_masks();
        planner.danger_masks = danger_masks;
        planner.danger_len = danger_len;
        planner
    }

    fn decide(&mut self) -> i32 {
        let breathe_first = self.needs_breathing();
        let proved = if breathe_first {
            self.near_food(false)
                .or_else(|| self.breathing_move())
                .or_else(|| self.near_food(true))
                .or_else(|| self.route_food(false))
                .or_else(|| self.route_food(true))
                .or_else(|| self.pressure_food(true, self.urgent))
                .or_else(|| self.pressure_food(false, self.urgent))
        } else {
            self.near_food(false)
                .or_else(|| self.route_food(false))
                .or_else(|| self.pressure_food(false, self.urgent))
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
        proved
            .or_else(|| {
                if self.urgent {
                    self.pressure_step()
                } else {
                    None
                }
            })
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

    fn needs_breathing(&mut self) -> bool {
        let st = self.start_state();
        let body_len = st.body.len() as i32;
        let exits = self.legal_count(&st, true);
        if exits <= 1 {
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

    fn smile_cost(&self, kind: RouteKind, urgent: bool) -> i64 {
        match kind {
            RouteKind::Near => 8_500,
            RouteKind::Route => 10_500,
            RouteKind::Pressure => {
                if urgent {
                    5_800
                } else {
                    8_000
                }
            }
        }
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

    fn arrow_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 5 | 6 | 13 | 14)
    }

    fn start_state(&self) -> State {
        State {
            head: *self.body.last().unwrap_or(&0),
            body: BodyTrace::new(self.body.clone()),
            body_bits: self.body_bits,
            dir: self.dir,
            cells: Vec::new(),
            first: 0,
            dist: 0,
            ate: 0,
            points: 0,
            smiles: 0,
            stones: 0,
            chokes: 0,
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
        st.cells
            .iter()
            .rev()
            .find_map(|&(off, val)| if off == o { Some(val) } else { None })
            .unwrap_or_else(|| self.base_cell(o))
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
            _ => {}
        }
        (masks, len)
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
        let mut cells = st.cells.clone();
        let mut stones = st.stones;

        if c == 1 && !allow_smile {
            return None;
        }
        if c == 10 {
            let nn = n + d;
            if st.body_bits.contains(nn) || self.cell(st, nn) != 32 {
                return None;
            }
            cells.push((n, 32));
            cells.push((nn, 10));
            stones += 1;
            c = 32;
        } else if !open(c) {
            return None;
        }

        let grow = c == 1 || is_food(c);
        let mut body = st.body.clone();
        let mut body_bits = st.body_bits;
        if !grow {
            if let Some(old) = body.pop_tail() {
                body_bits.remove(old);
                cells.push((old, 32));
            }
        }
        body.push(n);
        body_bits.insert(n);
        if grow {
            cells.push((n, 32));
        }
        Some(State {
            head: n,
            body,
            body_bits,
            dir: sc,
            cells,
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
        })
    }

    fn legal(&self, st: &State, allow_smile: bool) -> Vec<State> {
        DIRS.iter()
            .filter_map(|&(sc, _)| self.move_state(st, sc, allow_smile))
            .collect()
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

    fn forced_path(&self, start: &State, allow_smile: bool, limit: i32) -> ForcedInfo {
        let mut st = start.clone();
        let mut steps = 0;
        let mut ate = 0;
        loop {
            let legal = self.legal(&st, allow_smile);
            let exits = legal.len() as i32;
            if exits != 1 || steps >= limit {
                return ForcedInfo {
                    steps,
                    end_exits: exits,
                    dead: exits == 0,
                    ate,
                };
            }
            let ns = legal.into_iter().next().unwrap();
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

    fn survival_depth(&mut self, start: &State, limit: i32) -> i32 {
        let keep = if self.urgent || self.few() { 128 } else { 96 };
        let mut frontier = vec![start.clone()];
        let mut seen = SeenKeys::with_capacity((keep * limit.max(1) as usize).saturating_mul(4));
        seen.insert(state_key(start));
        let mut best = 0;
        for depth in 1..=limit {
            if self.time_up() {
                return best;
            }
            let mut next = Vec::new();
            for st in &frontier {
                if self.time_up() {
                    return best;
                }
                for ns in self.legal(st, true) {
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
            next.sort_by(|a, b| b.1.cmp(&a.1));
            frontier = next.into_iter().take(keep).map(|x| x.0).collect();
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
        for depth in 1..=limit {
            if self.time_up() {
                return best;
            }
            let mut next = Vec::new();
            for st in &frontier {
                if self.time_up() {
                    return best;
                }
                for ns in self.legal(st, allow_smile) {
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
            next.sort_by(|a, b| b.1.cmp(&a.1));
            frontier = next.into_iter().take(keep).map(|x| x.0).collect();
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
        self.food_search(FoodSearch {
            start,
            allow_smile,
            max_depth: if few { 145 } else { 98 },
            scan_limit: if few || self.urgent { 7000 } else { 3500 },
            check_limit: if few { 72 } else { 46 },
            route_kind: RouteKind::Route,
            arrow_level,
            urgent: false,
        })
    }

    fn pressure_food(&mut self, allow_smile: bool, urgent: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        self.food_search(FoodSearch {
            start,
            allow_smile,
            max_depth: if few {
                if urgent {
                    155
                } else {
                    125
                }
            } else if urgent {
                110
            } else {
                85
            },
            scan_limit: if urgent || few { 9000 } else { 5000 },
            check_limit: if urgent { 70 } else { 44 },
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
                    if !cfg.urgent || body_len >= 58 || !roomy_no_tail {
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
        Some(
            base + rollout + smile_return_credit
                - return_debt
                - ns.smiles as i64 * self.smile_cost(cfg.route_kind, cfg.urgent)
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
                + escape.exits as i64 * 280,
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
                let score = live as i64 * 8_400
                    + info.space as i64 * 28
                    + exits as i64 * 4_200
                    + escape.space as i64 * 10
                    + forced.end_exits as i64 * 2_200
                    + food_pull
                    + if info.tail_reach { 46_000 } else { 0 }
                    + if escape.tail_reach { 18_000 } else { 0 }
                    + if is_food(c) { 3_000 } else { 0 }
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
                    - if return_risk && !escape.tail_reach {
                        16_000
                    } else {
                        0
                    }
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
                    let return_debt = if return_open { 0 } else { 20_000 };
                    let new_smiles = ns.smiles - start.smiles;
                    let smile_return_credit =
                        if new_smiles > 0 && !info.tail_reach && escape.tail_reach {
                            new_smiles as i64 * if urgent { 2_800 } else { 1_900 }
                        } else {
                            0
                        };
                    let smile_growth_cost = if new_smiles > 0 {
                        new_smiles as i64 * if urgent { 5_200 } else { 8_500 }
                    } else {
                        0
                    };
                    let gain = ns.points as i64 * 180 - (ns.dist - start.dist) as i64 * 360
                        + info.space as i64 * 8
                        + exits as i64 * 1_500
                        + if info.tail_reach { 12_000 } else { 0 }
                        + if escape.tail_reach { 10_000 } else { 0 }
                        + smile_return_credit
                        - return_debt
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

    fn survival_move(&mut self) -> Option<i32> {
        let st = self.start_state();
        let few = self.few();
        for allow_smile in [false] {
            let mut best = None;
            let mut best_score = i64::MIN;
            for ns in self.legal(&st, allow_smile) {
                let c = self.cell(&st, st.head + step(ns.first));
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
                let score = info.space as i64 * 26
                    + exits as i64 * 1_000
                    + if is_food(c) { 2_500 } else { 0 }
                    + if info.tail_reach { 5_000 } else { 0 }
                    + if escape.tail_reach { 18_000 } else { 0 }
                    + if escape.ok { 4_500 } else { 0 }
                    + escape.space as i64 * 5
                    + forced.end_exits as i64 * 900
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
                    };
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

    fn pressure_step(&mut self) -> Option<i32> {
        let st = self.start_state();
        let few = self.few();
        for allow_smile in [false] {
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
                let dist = if is_food(c) {
                    0
                } else {
                    self.food_distance(&ns, 420)
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
                let score = -(dist as i64) * 1_700
                    + info.space as i64 * 10
                    + exits as i64 * 1_650
                    + if info.tail_reach { 8_000 } else { 0 }
                    + if escape.tail_reach { 15_000 } else { 0 }
                    + if escape.ok { 4_000 } else { 0 }
                    + escape.space as i64 * 4
                    + if is_food(c) { 26_000 } else { 0 }
                    + forced.end_exits as i64 * 1_100
                    - if exits <= 1 {
                        8_000 + forced.steps as i64 * 540
                    } else {
                        0
                    }
                    - if c == 1 {
                        if return_room {
                            3_000
                        } else {
                            8_000
                        }
                    } else {
                        0
                    }
                    - ns.stones as i64 * 75
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
                    };
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
                let dist = if is_food(c) {
                    0
                } else {
                    self.food_distance(&ns, 180)
                };
                let score = info.space as i64 * 14
                    + exits as i64 * 2_400
                    + if info.tail_reach { 9_000 } else { 0 }
                    + if dist < INF {
                        (20 - dist).max(0) as i64 * 180
                    } else {
                        0
                    }
                    + if is_food(c) { 6_000 } else { 0 }
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
        Planner::new(board, body, [0; ENEMY_LEN], 26, 12, false, 1_000_000.0)
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
    fn projects_future_up_arrow_danger() {
        let mut board = empty_board();
        let mut enemy = [0; ENEMY_LEN];
        let col = 10;
        enemy[(col * 4 + 1) as usize] = 8;
        board[offset(8, col) as usize] = 24;
        let body = vec![offset(10, 10), offset(10, 11)];
        let p = Planner::new(board, body, enemy, 30, 20, false, 1_000_000.0);
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
    fn decide_returns_arrow_scancode() {
        let mut board = empty_board();
        let body = vec![offset(10, 10), offset(10, 11)];
        board[offset(10, 13) as usize] = 3;
        let mut p = planner(board, body);
        assert!(matches!(p.decide(), 72 | 80 | 75 | 77));
    }

    #[test]
    fn cmp_desc_orders_high_scores_first() {
        let mut xs = [1, 9, 3];
        xs.sort_by(|a, b| cmp_i64_desc(*a, *b));
        assert_eq!(xs, [9, 3, 1]);
    }
}
