use super::*;

impl Planner {
    pub(super) fn near_food(&mut self, allow_smile: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let max_depth = if few { 14 } else { 10 };
        self.profiled_food_search(FoodSearch {
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

    pub(super) fn route_food(&mut self, allow_smile: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let stone_maze = self.stone_maze_level();
        self.profiled_food_search(FoodSearch {
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

    pub(super) fn pressure_food(&mut self, allow_smile: bool, urgent: bool) -> Option<i32> {
        let few = self.few();
        let arrow_level = self.arrow_level();
        let start = self.start_state();
        let stone_maze = self.stone_maze_level();
        let deep_stall = stone_maze && self.idle >= 70;
        self.profiled_food_search(FoodSearch {
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

    fn profiled_food_search(&mut self, mut cfg: FoodSearch) -> Option<i32> {
        self.apply_search_profile(&mut cfg);
        self.food_search(cfg)
    }

    fn apply_search_profile(&self, cfg: &mut FoodSearch) {
        if self.search_profile <= 0 {
            return;
        }
        let (depth_num, depth_den, depth_extra, scan_num, scan_den, check_num, check_den) =
            match (self.search_profile, cfg.route_kind) {
                (1, RouteKind::Near) => (1, 1, 2, 4, 3, 1, 1),
                (1, RouteKind::Route) => (6, 5, 8, 3, 2, 4, 3),
                (1, RouteKind::Pressure) => (6, 5, 8, 3, 2, 4, 3),
                (_, RouteKind::Near) => (1, 1, 3, 3, 2, 1, 1),
                (_, RouteKind::Route) => (4, 3, 10, 2, 1, 5, 3),
                (_, RouteKind::Pressure) => (3, 2, 12, 5, 2, 2, 1),
            };
        cfg.max_depth = scale_limit(cfg.max_depth, depth_num, depth_den, depth_extra, 210);
        cfg.scan_limit = scale_limit(cfg.scan_limit, scan_num, scan_den, 0, 24_000);
        if cfg.check_limit < INF / 2 {
            cfg.check_limit = scale_limit(cfg.check_limit, check_num, check_den, 0, 220);
        }
    }

    pub(super) fn food_search(&mut self, cfg: FoodSearch) -> Option<i32> {
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

    pub(super) fn route_prefix_state(&mut self, mut ns: State, cfg: &FoodSearch) -> Option<State> {
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
        if self.stone_maze_level() && self.idle >= 36 && ns.dist >= 4 && ns.ate == 0 && exits <= 2 {
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

    pub(super) fn score_food_candidate(&mut self, ns: &State, cfg: &FoodSearch) -> Option<i64> {
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
        let strict_space = if self.maze_confined() {
            self.reach_space_strict(ns)
        } else {
            info.space
        };
        if self.maze_confined()
            && !few
            && body_len >= 24
            && exits <= 2
            && strict_space < body_len + 10
            && !(cfg.urgent && self.idle >= 50)
        {
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
            let scale = if self.maze_confined() { 900 } else { 24 };
            (3 - exits).max(0) as i64 * self.items.clamp(0, 75) as i64 * scale
        } else {
            0
        };
        let confined_pocket_debt = if self.maze_confined() && !few && body_len < 80 {
            let want = body_len + if body_len >= 45 { 54 } else { 38 };
            let short = (want - strict_space).max(0) as i64;
            short * 1_150 + if short > 0 && exits <= 2 { 18_000 } else { 0 }
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
                - confined_pocket_debt
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
}
