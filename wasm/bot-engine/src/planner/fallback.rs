use super::*;

impl Planner {
    pub(super) fn required_live(
        &self,
        kind: RouteKind,
        arrow_level: bool,
        few: bool,
        urgent: bool,
    ) -> i32 {
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

    pub(super) fn breathing_move(&mut self) -> Option<i32> {
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

    pub(super) fn pickup_rollout(
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

    pub(super) fn enclosure_risk(
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

    pub(super) fn tail_chase_move(&mut self) -> Option<i32> {
        // Long-snake endgame discipline. A long body can entomb itself by
        // greedily grabbing whatever space is nearest. When no food grab proved
        // safe, follow the path with the deepest guaranteed survival while
        // keeping the tail reachable -- in practice this trails the tail and
        // fills space safely instead of sealing the body in.
        //
        // Engage it much earlier on the cramped maze levels: there the snake can
        // seal itself into an edge pocket around body 25-30. The open arrow levels
        // clear cleanly, so they keep the higher gate and the lighter survival
        // fallback below it.
        let floor = if self.arrow_level() {
            80
        } else if self.maze_confined() {
            24
        } else {
            52
        };
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

    pub(super) fn survival_move(&mut self) -> Option<i32> {
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

    pub(super) fn food_distance(&mut self, st: &State, limit: usize) -> i32 {
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

    pub(super) fn food_distance_no_smile(&self, st: &State, limit: usize) -> i32 {
        // Like food_distance, but treats a smiley (1) as a wall instead of a
        // passable cell. A finite result means "real food is reachable from here
        // without eating a single -50 smiley." avoid_wasteful_smile uses this to
        // refuse nibbling a smiley while clean food is on offer a step around it.
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
                // A smiley is "open" for normal travel, but crossing it costs -50,
                // so this clean-reach BFS treats it (and stones/walls) as solid.
                if c == 1 || !open(c) {
                    continue;
                }
                if seen.insert(n, sc) {
                    q.push_back((n, sc, dist + 1));
                }
            }
        }
        INF
    }

    pub(super) fn goal_distance(&mut self, st: &State, limit: usize) -> i32 {
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

    pub(super) fn dig_distance(&self, st: &State, limit: usize) -> i32 {
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

    pub(super) fn pressure_step(&mut self) -> Option<i32> {
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
                    2_600
                        + if ns.stones > 0 && progress > 0 {
                            4_000
                        } else {
                            0
                        }
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

    pub(super) fn last_chance_move(&mut self) -> Option<i32> {
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
