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

    pub(super) fn avoid_self_seal(&self, chosen: i32) -> i32 {
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
