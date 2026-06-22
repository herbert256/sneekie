use std::collections::{HashMap, HashSet, VecDeque};

const BOARD_LEN: usize = 4000;
const BODY_CAP: usize = 15001;
const ENEMY_LEN: usize = 81 * 4;
const DIRS: [(i32, i32); 4] = [(72, -160), (80, 160), (75, -2), (77, 2)];
const MAX_DANGER_TICKS: usize = 7;
const INF: i32 = 1_000_000;

static mut BOARD: [u16; BOARD_LEN] = [0; BOARD_LEN];
static mut BODY: [i32; BODY_CAP] = [0; BODY_CAP];
static mut ENEMY: [i32; ENEMY_LEN] = [0; ENEMY_LEN];

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
    let mut board = vec![0u16; BOARD_LEN];
    let mut body = Vec::with_capacity(body_len);
    let mut enemy = vec![0i32; ENEMY_LEN];

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
    body: Vec<i32>,
    body_set: HashSet<i32>,
    dir: i32,
    cells: HashMap<i32, u16>,
    first: i32,
    dist: i32,
    ate: i32,
    points: i32,
    smiles: i32,
    stones: i32,
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

struct Planner {
    board: Vec<u16>,
    body: Vec<i32>,
    body_set: HashSet<i32>,
    enemy: Vec<i32>,
    level: i32,
    items: i32,
    dir: i32,
    urgent: bool,
    deadline: f64,
    clock_checks: u32,
    danger_masks: Vec<HashSet<i32>>,
}

impl Planner {
    fn new(
        board: Vec<u16>,
        body: Vec<i32>,
        enemy: Vec<i32>,
        level: i32,
        items: i32,
        urgent: bool,
        deadline: f64,
    ) -> Self {
        let body_set = body.iter().copied().collect::<HashSet<_>>();
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
            body_set,
            enemy,
            level,
            items,
            dir,
            urgent,
            deadline,
            clock_checks: 0,
            danger_masks: Vec::new(),
        };
        planner.danger_masks = planner.build_danger_masks();
        planner
    }

    fn decide(&mut self) -> i32 {
        let proved = self
            .near_food(false)
            .or_else(|| self.route_food(false))
            .or_else(|| self.near_food(true))
            .or_else(|| self.route_food(true))
            .or_else(|| self.pressure_food(false, self.urgent))
            .or_else(|| self.pressure_food(true, self.urgent));
        proved
            .or_else(|| {
                if self.urgent {
                    self.pressure_step()
                } else {
                    None
                }
            })
            .or_else(|| self.survival_move())
            .unwrap_or(0)
    }

    fn time_up(&mut self) -> bool {
        self.clock_checks = self.clock_checks.wrapping_add(1);
        if self.clock_checks & 0x7f != 0 {
            return false;
        }
        host_now_ms() >= self.deadline
    }

    fn few(&self) -> bool {
        self.items <= 6
    }

    fn arrow_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 5 | 6 | 13 | 14)
    }

    fn start_state(&self) -> State {
        State {
            head: *self.body.last().unwrap_or(&0),
            body: self.body.clone(),
            body_set: self.body_set.clone(),
            dir: self.dir,
            cells: HashMap::new(),
            first: 0,
            dist: 0,
            ate: 0,
            points: 0,
            smiles: 0,
            stones: 0,
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
            .get(&o)
            .copied()
            .unwrap_or_else(|| self.base_cell(o))
    }

    fn danger(&self, o: i32, dist: i32) -> bool {
        if !(0..BOARD_LEN as i32).contains(&o) {
            return true;
        }
        let a = (dist.max(0) as usize).min(self.danger_masks.len().saturating_sub(1));
        let b = (a + 1).min(self.danger_masks.len().saturating_sub(1));
        self.danger_masks[a].contains(&o) || self.danger_masks[b].contains(&o)
    }

    fn build_danger_masks(&self) -> Vec<HashSet<i32>> {
        let horizon = if self.arrow_level() {
            if self.urgent || self.few() {
                6
            } else {
                4
            }
        } else {
            1
        };
        let mut masks = (0..=horizon.min(MAX_DANGER_TICKS))
            .map(|_| HashSet::new())
            .collect::<Vec<_>>();
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
        masks
    }

    fn project_up_arrows(&self, masks: &mut [HashSet<i32>]) {
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

    fn project_horizontal_arrows(&self, masks: &mut [HashSet<i32>]) {
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
        if self.danger(n, st.dist) || st.body_set.contains(&n) {
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
            if st.body_set.contains(&nn) || self.cell(st, nn) != 32 {
                return None;
            }
            cells.insert(n, 32);
            cells.insert(nn, 10);
            stones += 1;
            c = 32;
        } else if !open(c) {
            return None;
        }

        let grow = c == 1 || is_food(c);
        let mut body = st.body.clone();
        let mut body_set = st.body_set.clone();
        if !grow {
            if let Some(old) = body.first().copied() {
                body.remove(0);
                body_set.remove(&old);
                cells.insert(old, 32);
            }
        }
        body.push(n);
        body_set.insert(n);
        if grow {
            cells.insert(n, 32);
        }
        Some(State {
            head: n,
            body,
            body_set,
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
        if self.danger(n, st.dist) || st.body_set.contains(&n) {
            return false;
        }
        let c = self.cell(st, n);
        if c == 1 && !allow_smile {
            return false;
        }
        if c == 10 {
            let nn = n + d;
            return !st.body_set.contains(&nn) && self.cell(st, nn) == 32;
        }
        open(c)
    }

    fn legal_count(&self, st: &State, allow_smile: bool) -> i32 {
        DIRS.iter()
            .filter(|&&(sc, _)| self.can_move(st, sc, allow_smile))
            .count() as i32
    }

    fn space_info(&mut self, st: &State, limited: bool) -> SpaceInfo {
        let tail = st.body.first().copied().unwrap_or(st.head);
        let mut seen = HashSet::from([visit_key(st.head, st.dir)]);
        let mut cells = HashSet::from([st.head]);
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
                if n != tail && (st.body_set.contains(&n) || !open(self.cell(st, n))) {
                    continue;
                }
                let key = visit_key(n, sc);
                if seen.insert(key) {
                    if cells.len() < 1800 {
                        cells.insert(n);
                    }
                    q.push_back((n, sc));
                }
            }
            if tail_reach && cells.len() >= 1800 {
                break;
            }
        }
        SpaceInfo {
            space: cells.len() as i32,
            tail_reach,
        }
    }

    fn survival_depth(&mut self, start: &State, limit: i32) -> i32 {
        let keep = if self.urgent || self.few() { 128 } else { 96 };
        let mut frontier = vec![start.clone()];
        let mut seen = HashSet::from([state_key(start)]);
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
        let mut seen = HashSet::from([state_key(start)]);
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
        let mut seen = HashSet::from([state_key(&cfg.start)]);
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
        if live < self.required_live(cfg.route_kind, cfg.arrow_level, few, cfg.urgent)
            && !(info.tail_reach && exits > 1)
        {
            return None;
        }

        let rollout = self.pickup_rollout(ns, 2, cfg.allow_smile, cfg.urgent);
        let one_exit_cost = if exits == 1 {
            match cfg.route_kind {
                RouteKind::Near => 10_000,
                RouteKind::Route => 20_000,
                RouteKind::Pressure => {
                    if cfg.urgent {
                        4_500
                    } else {
                        10_000
                    }
                }
            }
        } else {
            0
        };
        let base = match cfg.route_kind {
            RouteKind::Near => {
                -ns.dist as i64 * 6_400
                    + if info.tail_reach { 36_000 } else { 0 }
                    + live as i64 * 3_100
                    + exits as i64 * 1_800
                    + info.space as i64 * 9
                    + escape.space as i64 * 5
                    + if escape.tail_reach { 9_500 } else { 0 }
                    + ns.points as i64 * 130
            }
            RouteKind::Route => {
                (if info.tail_reach { 110_000 } else { 0 })
                    + live as i64 * 6_100
                    + exits as i64 * 2_700
                    + info.space as i64 * 18
                    + escape.space as i64 * 9
                    + if escape.tail_reach { 21_000 } else { 0 }
                    + ns.points as i64 * 170
                    - ns.dist as i64 * 230
            }
            RouteKind::Pressure => {
                (if info.tail_reach { 42_000 } else { 0 })
                    + live as i64 * 4_000
                    + exits as i64 * 2_300
                    + info.space as i64 * 14
                    + escape.space as i64 * 7
                    + if escape.tail_reach { 11_000 } else { 0 }
                    + ns.points as i64 * 250
                    - ns.dist as i64 * if cfg.urgent { 95 } else { 170 }
            }
        };
        Some(
            base + rollout
                - ns.smiles as i64 * if cfg.urgent { 520 } else { 1_050 }
                - ns.stones as i64 * 52
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
        let mut seen = HashSet::from([state_key(start)]);
        let scan_limit = if urgent || self.few() { 1400 } else { 900 };
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
                    let gain = ns.points as i64 * 180 - (ns.dist - start.dist) as i64 * 360
                        + info.space as i64 * 8
                        + exits as i64 * 1_500
                        + if info.tail_reach { 12_000 } else { 0 }
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
        if info.space < st.body.len() as i32 + expected_growth + 6 {
            return true;
        }
        if info.space < body_need && !info.tail_reach {
            return true;
        }
        if exits <= 1 && !info.tail_reach && info.space < body_need + 44 {
            return true;
        }
        !info.tail_reach && info.space < st.body.len() as i32 + expected_growth + 78
    }

    fn survival_move(&mut self) -> Option<i32> {
        let st = self.start_state();
        let mut best = None;
        let mut best_score = i64::MIN;
        for ns in self.legal(&st, true) {
            let c = self.cell(&st, st.head + step(ns.first));
            let exits = self.legal_count(&ns, true);
            if exits == 0 {
                continue;
            }
            let info = self.space_info(&ns, false);
            let score = info.space as i64 * 26
                + exits as i64 * 1_000
                + if is_food(c) { 2_500 } else { 0 }
                + if info.tail_reach { 5_000 } else { 0 }
                - if c == 1 { 2_000 } else { 0 }
                - ns.stones as i64 * 38
                + if ns.first == st.dir { 60 } else { 0 }
                - if self.enclosure_risk(&ns, info, exits, 1) {
                    10_000
                } else {
                    0
                };
            if score > best_score {
                best_score = score;
                best = Some(ns.first);
            }
        }
        best
    }

    fn food_distance(&mut self, st: &State, limit: usize) -> i32 {
        let mut seen = HashSet::from([visit_key(st.head, st.dir)]);
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
                if self.danger(n, dist) || st.body_set.contains(&n) {
                    continue;
                }
                let c = self.cell(st, n);
                if is_food(c) {
                    return dist + 1;
                }
                if !open(c) {
                    continue;
                }
                let key = visit_key(n, sc);
                if seen.insert(key) {
                    q.push_back((n, sc, dist + 1));
                }
            }
        }
        INF
    }

    fn pressure_step(&mut self) -> Option<i32> {
        let st = self.start_state();
        let mut best = None;
        let mut best_score = i64::MIN;
        for ns in self.legal(&st, true) {
            let c = self.cell(&st, st.head + step(ns.first));
            let exits = self.legal_count(&ns, true);
            if exits == 0 {
                continue;
            }
            let info = self.space_info(&ns, false);
            let dist = if is_food(c) {
                0
            } else {
                self.food_distance(&ns, 420)
            };
            if dist >= INF {
                continue;
            }
            let score = -(dist as i64) * 1_700
                + info.space as i64 * 10
                + exits as i64 * 1_650
                + if info.tail_reach { 8_000 } else { 0 }
                + if is_food(c) { 26_000 } else { 0 }
                - if c == 1 { 1_500 } else { 0 }
                - ns.stones as i64 * 75
                + if ns.first == st.dir { 80 } else { 0 }
                - if self.enclosure_risk(&ns, info, exits, 1) {
                    9_000
                } else {
                    0
                };
            if score > best_score {
                best_score = score;
                best = Some(ns.first);
            }
        }
        best
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

fn visit_key(o: i32, sc: i32) -> i64 {
    o as i64 * 100 + sc as i64
}

fn state_key(st: &State) -> u64 {
    let head = (st.head.max(0) as u64) >> 1;
    let first = (st.body.first().copied().unwrap_or(0).max(0) as u64) >> 1;
    let near_tail = if st.body.len() >= 2 {
        (st.body[st.body.len() - 2].max(0) as u64) >> 1
    } else {
        first
    };
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

    fn empty_board() -> Vec<u16> {
        let mut board = vec![0u16; BOARD_LEN];
        for row in 1..=25 {
            for col in 1..=80 {
                board[offset(row, col) as usize] = 32;
            }
        }
        board
    }

    fn planner(board: Vec<u16>, body: Vec<i32>) -> Planner {
        Planner::new(board, body, vec![0; ENEMY_LEN], 26, 12, false, 1_000_000.0)
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
        assert!(ns.body_set.contains(&offset(10, 10)));
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
        assert!(!ns.body_set.contains(&offset(10, 10)));
        assert_eq!(p.cell(&ns, offset(10, 10)), 32);
    }

    #[test]
    fn projects_future_up_arrow_danger() {
        let mut board = empty_board();
        let mut enemy = vec![0; ENEMY_LEN];
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
        assert!(matches!(p.decide(), 72 | 80 | 75 | 77 | 0));
    }

    #[test]
    fn cmp_desc_orders_high_scores_first() {
        let mut xs = [1, 9, 3];
        xs.sort_by(|a, b| cmp_i64_desc(*a, *b));
        assert_eq!(xs, [9, 3, 1]);
    }
}
