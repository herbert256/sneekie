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
        };
        let (danger_masks, danger_len) = planner.build_danger_masks();
        planner.danger_masks = danger_masks;
        planner.danger_len = danger_len;
        planner
    }

    pub(crate) fn decide(&mut self) -> i32 {
        decision_sc(self.decide_tagged())
    }

    pub(crate) fn decide_mode_tagged(&mut self, mode: i32) -> i32 {
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
        if self.force_risk {
            return self.decide_forced_tagged();
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
            self.near_food(false)
                .map(|sc| pack_decision(10, sc))
                .or_else(|| self.breathing_move().map(|sc| pack_decision(12, sc)))
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
            // chasing the last one or two while the bonus drained. Lead with the safe
            // routes, but fall through to the committed urgent-pressure search and the
            // dig-aware pressure step so the snake actually goes and finishes the level
            // instead of circling it.
            self.route_food(false)
                .map(|sc| pack_decision(20, sc))
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

    fn finalize_decision(&mut self, chosen: i32) -> i32 {
        let sc = decision_sc(chosen);
        // Advice #3: on the cramped non-stone mazes, refuse a move that boxes the head
        // into a sub-body pocket when a roomier move exists. Skipped in the endgame
        // (few items, finishing is worth a squeeze).
        if sc != 0 && self.maze_confined() && !self.few() {
            replace_decision_sc(chosen, self.avoid_self_seal(sc))
        } else {
            chosen
        }
    }

    pub(super) fn decide_forced_tagged(&mut self) -> i32 {
        // Break a stall. The driver flips this on after an orbit, and it used to
        // hand control to the weaker JavaScript planner -- so the bot switched to
        // its least capable brain exactly when it was stuck. Keep the full
        // engine: lead with the most aggressive food grab (smileys allowed) and
        // the dig-aware pressure step, then fall back through survival moves.
        // recent-memory penalties (the loop breaker) stay active throughout.
        self.pressure_food(true, true)
            .map(|sc| pack_decision(40, sc))
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
        self.items <= 6
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
        let item_factor = (7 - self.items.clamp(1, 6)) as i64; // 1 (6 left) .. 6 (1 left)
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
        (!info.tail_reach && info.space < body_len + if self.few() { 132 } else { 96 })
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
