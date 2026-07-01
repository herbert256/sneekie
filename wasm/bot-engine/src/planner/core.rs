use super::*;

impl Planner {
    pub(crate) fn new(
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
            search_profile: 0,
            deadline,
            clock_checks: 0,
            danger_masks: [BoardBits::default(); MAX_DANGER_TICKS + 1],
            danger_len: 1,
            doors,
            door_bits,
            escape_pressed: false,
            weights: W_DEFAULTS,
            last_route: Vec::new(),
            target_region: None,
        };
        let (danger_masks, danger_len) = planner.build_danger_masks();
        planner.danger_masks = danger_masks;
        planner.danger_len = danger_len;
        planner.target_region = planner.compute_target_region();
        let body_len = planner.body.len() as i32;
        if body_len >= 12 {
            let st = planner.start_state();
            let info = planner.space_info(&st, false);
            // Deliberately tight: only a genuinely cut-off snake (no flood path
            // back to the tail AND barely more room than the body itself) lifts
            // the smiley discipline. A padded threshold flickered on constantly
            // on the arrow boards, where danger masks shrink the flood, and the
            // bot nibbled smileys all game.
            planner.escape_pressed = !info.tail_reach && info.space < body_len + 40;
        }
        planner
    }

    pub(crate) fn decide(&mut self) -> i32 {
        decision_sc(self.decide_tagged())
    }

    pub(crate) fn decide_mode_tagged(&mut self, mode: i32) -> i32 {
        self.last_route.clear();
        match mode {
            // Baseline compatibility/debug modes.
            1 => {
                let tagged = self.decide_proved_tagged().unwrap_or(0);
                self.finalize_decision(tagged)
            }
            2 => {
                let tagged = self.decide_fallback_tagged().unwrap_or(0);
                self.finalize_decision(tagged)
            }
            3 => {
                self.search_profile = 2;
                self.urgent = true;
                let tagged = self.decide_forced_tagged();
                self.finalize_decision(tagged)
            }
            // Worker-only modes. They use wider route searches and larger budgets,
            // but keep the same safety gates and fallback ordering as the baseline.
            4 => {
                self.search_profile = 1;
                self.decide_tagged()
            }
            5 => {
                self.search_profile = 2;
                self.urgent = true;
                self.decide_tagged()
            }
            _ => self.decide_tagged(),
        }
    }

    pub(crate) fn decide_tagged(&mut self) -> i32 {
        self.last_route.clear();
        if self.force_risk {
            let tagged = self.decide_forced_tagged();
            return self.finalize_decision(tagged);
        }
        let chosen = self
            .decide_proved_tagged()
            .or_else(|| self.decide_fallback_tagged())
            .unwrap_or(0);
        self.finalize_decision(chosen)
    }

    fn decide_proved_tagged(&mut self) -> Option<i32> {
        let breathe_first = self.needs_breathing();
        if breathe_first {
            self.breathing_move()
                .map(|sc| pack_decision(12, sc))
                .or_else(|| self.near_food(false).map(|sc| pack_decision(10, sc)))
                .or_else(|| self.near_food(true).map(|sc| pack_decision(14, sc)))
                .or_else(|| self.route_food(false).map(|sc| pack_decision(20, sc)))
                .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                .or_else(|| {
                    self.pressure_food(true, self.urgent)
                        .map(|sc| pack_decision(32, sc))
                })
                .or_else(|| {
                    self.pressure_food(false, self.urgent)
                        .map(|sc| pack_decision(30, sc))
                })
        } else if self.urgent && self.idle >= 36 {
            self.pressure_food(false, true)
                .map(|sc| pack_decision(30, sc))
                .or_else(|| {
                    self.pressure_food(true, true)
                        .map(|sc| pack_decision(32, sc))
                })
                .or_else(|| self.pressure_step().map(|sc| pack_decision(60, sc)))
                .or_else(|| self.near_food(false).map(|sc| pack_decision(10, sc)))
                .or_else(|| self.route_food(false).map(|sc| pack_decision(20, sc)))
                .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                .or_else(|| self.near_food(true).map(|sc| pack_decision(14, sc)))
        } else if self.few() {
            // Endgame: only a few hearts remain, usually tucked in tight spots. In
            // testing even the clears orbited near the stuck limit (idle ~100-150)
            // chasing the last one or two while the bonus drained. Best case: one
            // exact tour over everything left, fully simulated, committed as a
            // single route to the level clear. Otherwise lead with the safe
            // routes, and fall through to the committed urgent-pressure search and
            // the dig-aware pressure step so the snake actually goes and finishes
            // the level instead of circling it.
            self.endgame_tour()
                .map(|sc| pack_decision(8, sc))
                .or_else(|| self.route_food(false).map(|sc| pack_decision(20, sc)))
                .or_else(|| self.near_food(false).map(|sc| pack_decision(10, sc)))
                .or_else(|| {
                    self.pressure_food(false, self.urgent)
                        .map(|sc| pack_decision(30, sc))
                })
                .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                .or_else(|| {
                    self.pressure_food(true, true)
                        .map(|sc| pack_decision(32, sc))
                })
                .or_else(|| self.pressure_step().map(|sc| pack_decision(60, sc)))
        } else if !self.open_board_level() {
            // Advice #1: on any walled level, sweep with the space-aware route_food
            // (which weights tail-reachability and open space) rather than the greedy
            // near_food (-distance at -6400/step). Greedy nearest-food strands
            // isolated pickups that later wall off; preferring the considered route
            // clears the board more like a sweep and leaves the free space connected.
            self.route_food(false)
                .map(|sc| pack_decision(20, sc))
                .or_else(|| self.near_food(false).map(|sc| pack_decision(10, sc)))
                .or_else(|| {
                    self.pressure_food(false, self.urgent)
                        .map(|sc| pack_decision(30, sc))
                })
                .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                .or_else(|| {
                    self.pressure_food(true, self.urgent)
                        .map(|sc| pack_decision(32, sc))
                })
                .or_else(|| {
                    if self.urgent {
                        self.near_food(true)
                            .map(|sc| pack_decision(14, sc))
                            .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                            .or_else(|| {
                                self.pressure_food(true, self.urgent)
                                    .map(|sc| pack_decision(32, sc))
                            })
                    } else {
                        None
                    }
                })
        } else {
            self.near_food(false)
                .map(|sc| pack_decision(10, sc))
                .or_else(|| self.route_food(false).map(|sc| pack_decision(20, sc)))
                .or_else(|| {
                    self.pressure_food(false, self.urgent)
                        .map(|sc| pack_decision(30, sc))
                })
                .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                .or_else(|| {
                    self.pressure_food(true, self.urgent)
                        .map(|sc| pack_decision(32, sc))
                })
                .or_else(|| {
                    if self.urgent {
                        self.near_food(true)
                            .map(|sc| pack_decision(14, sc))
                            .or_else(|| self.route_food(true).map(|sc| pack_decision(22, sc)))
                            .or_else(|| {
                                self.pressure_food(true, self.urgent)
                                    .map(|sc| pack_decision(32, sc))
                            })
                    } else {
                        None
                    }
                })
        }
    }

    fn decide_fallback_tagged(&mut self) -> Option<i32> {
        (if self.urgent {
            self.pressure_step().map(|sc| pack_decision(60, sc))
        } else {
            None
        })
        .or_else(|| self.tail_chase_move().map(|sc| pack_decision(70, sc)))
        .or_else(|| self.survival_move().map(|sc| pack_decision(80, sc)))
        .or_else(|| self.last_chance_move().map(|sc| pack_decision(90, sc)))
    }

    pub(super) fn finalize_decision(&mut self, chosen: i32) -> i32 {
        if decision_sc(chosen) == 0 {
            return chosen;
        }
        let mut out = chosen;
        if !self.open_board_level() {
            out = replace_decision_sc(out, self.avoid_forced_dead_end(decision_sc(out)));
        }
        // Advice #9: on the walled/stone mazes, never nibble a -50 smiley when real
        // food is reachable without crossing one. Skipped in the endgame (a squeeze
        // to finish is worth it) and when genuinely starving (a bridge may be the
        // only way out). The open arrow boards already shun smileys, so leave them be.
        let desperate = self.urgent && self.idle >= 50;
        if !self.few() && !desperate && !self.open_board_level() {
            out = replace_decision_sc(out, self.avoid_wasteful_smile(decision_sc(out)));
        }
        // Advice #3 hardened: the return-path rule runs LAST, on every level and in
        // the endgame, so no smiley-discipline guard can undo a seal-avoiding
        // override -- including one that deliberately lands on a smiley.
        out = replace_decision_sc(out, self.avoid_self_seal(decision_sc(out)));
        // Route commitment: the recorded route is only replayable when the move
        // being returned is still its first step -- any guard override, or a
        // decision that came from a fallback mover, drops it.
        if self.last_route.first() != Some(&decision_sc(out)) {
            self.last_route.clear();
        }
        out
    }

    pub(super) fn decide_forced_tagged(&mut self) -> i32 {
        // Break a stall. The driver flips this on after an orbit, and it used to
        // hand control to the weaker JavaScript planner -- so the bot switched to
        // its least capable brain exactly when it was stuck. Keep the full
        // engine: lead with the most aggressive food grab (smileys allowed) and
        // the dig-aware pressure step, then fall back through survival moves.
        // recent-memory penalties (the loop breaker) stay active throughout.
        let st = self.start_state();
        let bridge_food_only = self.maze_confined()
            && !self.few()
            && self.food_distance_no_smile(&st, 1600) >= INF
            && self.food_distance(&st, 1600) < INF;
        let tail_first =
            self.maze_confined() && self.body.len() as i32 >= 24 && !bridge_food_only;
        (if tail_first {
            self.tail_chase_move().map(|sc| pack_decision(38, sc))
        } else {
            None
        })
        .or_else(|| self.pressure_food(true, true).map(|sc| pack_decision(40, sc)))
            .or_else(|| self.near_food(true).map(|sc| pack_decision(42, sc)))
            .or_else(|| self.route_food(true).map(|sc| pack_decision(44, sc)))
            .or_else(|| self.pressure_step().map(|sc| pack_decision(60, sc)))
            .or_else(|| self.tail_chase_move().map(|sc| pack_decision(70, sc)))
            .or_else(|| self.survival_move().map(|sc| pack_decision(80, sc)))
            .or_else(|| self.last_chance_move().map(|sc| pack_decision(90, sc)))
            .unwrap_or(0)
    }

    pub(super) fn time_up(&mut self) -> bool {
        self.clock_checks = self.clock_checks.wrapping_add(1);
        if self.clock_checks & 0x07 != 0 {
            return false;
        }
        host_now_ms() >= self.deadline
    }

    pub(super) fn few(&self) -> bool {
        self.items <= 10
    }

    pub(super) fn finish_dist_penalty(&self) -> i64 {
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
        let item_factor = (11 - self.items.clamp(1, 10)) as i64; // 1 (10 left) .. 10 (1 left)
        self.bonus as i64 / 100 * item_factor / 6
    }

    pub(super) fn needs_breathing(&mut self) -> bool {
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
        (self.maze_confined()
            && body_len >= 24
            && (exits <= 2 || info.space < body_len + if self.few() { 164 } else { 116 }))
            || (!info.tail_reach && info.space < body_len + if self.few() { 132 } else { 96 })
            || (body_len >= 58 && (exits <= 2 || info.space < body_len + 150))
            || (body_len >= 96 && exits <= 3)
    }

    pub(super) fn return_buffer(&self, body_len: i32, few: bool) -> i32 {
        let base = if body_len >= 120 {
            190
        } else if body_len >= 80 {
            155
        } else if body_len >= 45 {
            124
        } else if body_len >= 36 {
            118
        } else if body_len >= 24 {
            108
        } else {
            96
        };
        base + if few { 32 } else { 0 }
    }

    pub(super) fn return_path_room(
        &self,
        info: SpaceInfo,
        exits: i32,
        body_len: i32,
        few: bool,
    ) -> bool {
        info.tail_reach
            || (exits >= 3 && info.space >= body_len + self.return_buffer(body_len, few) + 72)
    }

    pub(super) fn return_path_risk(
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
}
