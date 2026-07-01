use super::*;

impl Planner {
    pub(super) fn move_state(&self, st: &State, sc: i32, allow_smile: bool) -> Option<State> {
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
            trace: st.trace,
        })
    }

    pub(super) fn legal(&self, st: &State, allow_smile: bool) -> Vec<State> {
        let mut out = Vec::with_capacity(4);
        self.legal_into(st, allow_smile, &mut out);
        out
    }

    pub(super) fn legal_into(&self, st: &State, allow_smile: bool, out: &mut Vec<State>) {
        out.clear();
        for &(sc, _) in &DIRS {
            if let Some(ns) = self.move_state(st, sc, allow_smile) {
                out.push(ns);
            }
        }
    }

    pub(super) fn can_move(&self, st: &State, sc: i32, allow_smile: bool) -> bool {
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

    pub(super) fn legal_count(&self, st: &State, allow_smile: bool) -> i32 {
        DIRS.iter()
            .filter(|&&(sc, _)| self.can_move(st, sc, allow_smile))
            .count() as i32
    }

    pub(super) fn single_legal_next(&self, st: &State, allow_smile: bool) -> (i32, Option<State>) {
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

    pub(super) fn forced_path(&self, start: &State, allow_smile: bool, limit: i32) -> ForcedInfo {
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

    pub(super) fn space_info(&mut self, st: &State, limited: bool) -> SpaceInfo {
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

    pub(super) fn reach_space_strict(&self, st: &State) -> i32 {
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

    pub(super) fn avoid_self_seal(&mut self, chosen: i32) -> i32 {
        // Advice #3, hardened into the return-path rule: never voluntarily step
        // into a pocket too small to hold the body when a roomier legal move
        // exists. Measured with the strict (body-solid) flood so a coil's adjacent
        // tail cannot fake the breathing room away. Runs on every level and in the
        // endgame, and when no clean move keeps the room it spends a -50 smiley
        // rather than entomb the snake. Still deliberately margin-gated so it does
        // not fight normal play.
        let st = self.start_state();
        let body_len = st.body.len() as i32;
        if body_len < 12 {
            return chosen;
        }
        // Open boards rarely seal; only guard genuinely huge bodies there.
        if self.open_board_level() && body_len < 48 {
            return chosen;
        }
        let Some(chosen_state) = self.move_state(&st, chosen, true) else {
            return chosen;
        };
        // Eating the final item ends the level, so a seal behind it is irrelevant.
        if self.items <= 1 && is_food(self.cell(&st, st.head + step(chosen))) {
            return chosen;
        }
        // A committed dig legitimately has no tail path until it breaks through
        // the stone field -- never yank the snake out of a stone push.
        if chosen_state.stones > st.stones {
            return chosen;
        }
        let chosen_space = self.reach_space_strict(&chosen_state);
        let chosen_tail = self.space_info(&chosen_state, false).tail_reach;
        let cramped_limit = if self.maze_confined() && body_len >= 24 {
            body_len + 24
        } else if body_len >= 24 {
            body_len + 16
        } else {
            body_len
        };
        // On the confined mazes a coil can seal itself while the tail still looks
        // reachable (the tail-passable flood over-counts), so cramped strict space
        // alone is a threat there. Elsewhere -- stone mazes, open boards, digs,
        // healthy tail-following -- small strict space with the tail still in
        // reach is normal play, so the threat also requires losing the tail.
        let seal_threat = if self.maze_confined() {
            chosen_space < cramped_limit || (body_len >= 36 && !chosen_tail)
        } else {
            !chosen_tail && (chosen_space < cramped_limit || body_len >= 36)
        };
        if !seal_threat {
            return chosen;
        }
        let desperate = self.urgent && self.idle >= 50;

        struct SealCand {
            sc: i32,
            space: i32,
            tail: bool,
        }
        let mut clean_best: Option<SealCand> = None;
        let mut smile_best: Option<SealCand> = None;
        for &(sc, _) in &DIRS {
            if sc == chosen {
                continue;
            }
            let Some(ns) = self.move_state(&st, sc, true) else {
                continue;
            };
            let space = self.reach_space_strict(&ns);
            let tail = self.space_info(&ns, false).tail_reach;
            let lands_on_smile = self.cell(&st, st.head + step(sc)) == 1;
            let slot = if lands_on_smile {
                &mut smile_best
            } else {
                &mut clean_best
            };
            let better = match slot {
                Some(cur) => (tail, space) > (cur.tail, cur.space),
                None => true,
            };
            if better {
                *slot = Some(SealCand { sc, space, tail });
            }
        }

        let maze_confined = self.maze_confined();
        let cautious = desperate || self.few();
        let qualifies = |cand: &SealCand| -> bool {
            if cand.space < 6 || cand.space <= chosen_space {
                return false;
            }
            if cautious {
                // Desperate stall-breaks and endgame squeezes must be able to
                // commit: only fire on a near-certain seal.
                return chosen_space < body_len && cand.space >= chosen_space * 2;
            }
            cand.space >= chosen_space * 2
                || (maze_confined
                    && body_len >= 24
                    && cand.space >= chosen_space + 10
                    && cand.space >= body_len + 8)
                || (body_len >= 24
                    && cand.space >= chosen_space + 24
                    && cand.space >= body_len + 12)
                || (body_len >= 36
                    && !chosen_tail
                    && cand.tail
                    && cand.space >= (body_len / 2 + 8).min(64))
        };

        if let Some(c) = &clean_best {
            if qualifies(c) {
                return c.sc;
            }
        }
        // No clean move keeps the room: spend a smiley rather than entomb. The
        // -50 (plus one growth) is far cheaper than unwinding the whole body.
        // Not on the open arrow boards: nothing walls the snake in there, and
        // the danger masks make tail-reach flicker, so a smiley fallback would
        // nibble the board bare instead of saving anything.
        if self.open_board_level() {
            return chosen;
        }
        if let Some(c) = &smile_best {
            if (c.tail || c.space >= body_len + 24)
                && c.space > chosen_space
                && ((c.tail && !chosen_tail)
                    || c.space >= chosen_space * 2
                    || c.space >= chosen_space + 24)
            {
                return c.sc;
            }
        }
        chosen
    }

    pub(super) fn avoid_forced_dead_end(&mut self, chosen: i32) -> i32 {
        // A food/pressure route can be locally legal and still funnel the head
        // into a short no-exit corridor once the body advances behind it. Catch
        // that just before returning the move, using body-solid reachable space
        // so a receding tail cannot make the pocket look larger than it is.
        let st = self.start_state();
        let Some(chosen_state) = self.move_state(&st, chosen, true) else {
            return chosen;
        };
        let body_len = chosen_state.body.len() as i32;
        let chosen_exits = self.legal_count(&chosen_state, true);
        let chosen_forced =
            self.forced_path(&chosen_state, true, if self.maze_confined() { 32 } else { 24 });
        // A forced corridor whose pickups finish the level is the point of the
        // endgame squeeze -- clearing the board ends the run before any dead end.
        if chosen_state.ate + chosen_forced.ate >= self.items {
            return chosen;
        }
        let chosen_strict = self.reach_space_strict(&chosen_state);
        let chosen_bad = chosen_forced.dead
            || (chosen_exits <= 1
                && chosen_strict
                    < body_len
                        + if self.maze_confined() {
                            20
                        } else if self.stone_maze_level() {
                            14
                        } else {
                            10
                        });
        if !chosen_bad {
            return chosen;
        }

        let mut best = chosen;
        let mut best_score = i64::MIN;
        for &(sc, _) in &DIRS {
            if sc == chosen {
                continue;
            }
            let Some(ns) = self.move_state(&st, sc, true) else {
                continue;
            };
            let c = self.cell(&st, st.head + step(sc));
            let exits = self.legal_count(&ns, true);
            if exits == 0 {
                continue;
            }
            let forced = self.forced_path(&ns, true, if self.maze_confined() { 32 } else { 24 });
            if forced.dead && forced.steps <= chosen_forced.steps + 3 {
                continue;
            }
            let strict = self.reach_space_strict(&ns);
            let info = self.space_info(&ns, false);
            let return_risk = self.return_path_risk(&ns, info, exits, 1);
            let score = strict as i64 * 160
                + info.space as i64 * 12
                + exits as i64 * 5_500
                + forced.end_exits as i64 * 2_000
                + if info.tail_reach { 40_000 } else { 0 }
                + if is_food(c) { 5_000 } else { 0 }
                - if forced.dead { 36_000 } else { 0 }
                - if return_risk { 22_000 } else { 0 }
                - if c == 1 { 16_000 } else { 0 }
                - ns.stones as i64 * 30
                + if ns.first == st.dir { 80 } else { 0 };
            if score > best_score {
                best_score = score;
                best = sc;
            }
        }
        best
    }

    pub(super) fn avoid_wasteful_smile(&mut self, chosen: i32) -> i32 {
        // Advice #9: a smiley is -50 points AND it grows the snake AND eating it
        // spawns another, so on the walled/stone mazes the snake used to bleed its
        // score negative nibbling smileys while real food was reachable a step
        // around them (L2/L3 ran to -200/-690 in testing). When the chosen move
        // lands on a smiley but plain food is reachable without crossing one, steer
        // to the best clean move heading toward that food instead. Deliberately
        // narrow: it never fires when no clean food is reachable (then a bridge may
        // be the only way on), so it leaves the strategic smiley bridge intact.
        let st = self.start_state();
        if self.cell(&st, st.head + step(chosen)) != 1 {
            return chosen; // not a smiley move at all
        }
        if self.food_distance_no_smile(&st, 1200) >= INF {
            return chosen; // no clean food to reach -- a bridge may be justified
        }
        let chosen_tail = self
            .move_state(&st, chosen, true)
            .map(|ns| self.space_info(&ns, false).tail_reach)
            .unwrap_or(false);
        let mut best = chosen;
        let mut best_key = (i32::MAX, i32::MIN); // minimize clean-food distance, then maximize strict space
        for &(sc, _) in &DIRS {
            // allow_smile = false, so move_state already rejects any smiley landing.
            let Some(ns) = self.move_state(&st, sc, false) else {
                continue;
            };
            let exits = self.legal_count(&ns, true);
            if exits == 0 {
                continue;
            }
            let forced = self.forced_path(&ns, true, 12);
            if exits <= 1 && forced.dead {
                continue;
            }
            // Never steer off a tail-preserving smiley onto a clean move that
            // loses the way back to the tail -- that trades -50 for a possible
            // entombment, the wrong side of the return-path rule.
            if chosen_tail && !self.space_info(&ns, false).tail_reach {
                continue;
            }
            let fd = self.food_distance_no_smile(&ns, 1200);
            let sp = self.reach_space_strict(&ns);
            if fd < best_key.0 || (fd == best_key.0 && sp > best_key.1) {
                best_key = (fd, sp);
                best = sc;
            }
        }
        best
    }

    pub(super) fn survival_depth(&mut self, start: &State, limit: i32) -> i32 {
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

    pub(super) fn escape_proof(
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
}
