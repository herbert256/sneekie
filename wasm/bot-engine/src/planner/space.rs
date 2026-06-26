use super::*;

impl Planner {
    pub(super) fn return_cell_open(
        &self,
        st: &State,
        o: i32,
        tail: i32,
        allow_smile: bool,
    ) -> bool {
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

    pub(super) fn open_degree(&self, st: &State, o: i32, tail: i32, allow_smile: bool) -> i32 {
        DIRS.iter()
            .filter(|&&(_, d)| {
                let n = o + d;
                !self.danger(n, st.dist) && self.return_cell_open(st, n, tail, allow_smile)
            })
            .count() as i32
    }

    pub(super) fn reaches_tail_from(
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

    pub(super) fn tail_route_count(
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

    pub(super) fn tail_distance(&self, st: &State, allow_smile: bool, limit: usize) -> i32 {
        let tail = st.body.tail().unwrap_or(st.head);
        if st.head == tail {
            return 0;
        }
        let mut seen = VisitBits::default();
        seen.insert(st.head, st.dir);
        let mut q = VecDeque::from([(st.head, st.dir, 0i32)]);
        let mut scanned = 0usize;
        while let Some((o, dir, dist)) = q.pop_front() {
            scanned += 1;
            if scanned >= limit {
                break;
            }
            for &(sc, d) in &DIRS {
                if sc == opp(dir) {
                    continue;
                }
                let n = o + d;
                if n == tail {
                    return dist + 1;
                }
                if self.danger(n, dist) || !self.return_cell_open(st, n, tail, allow_smile) {
                    continue;
                }
                if seen.insert(n, sc) {
                    q.push_back((n, sc, dist + 1));
                }
            }
        }
        INF
    }

    pub(super) fn return_gate_debt(
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

    pub(super) fn return_discipline_debt(
        &self,
        st: &State,
        info: SpaceInfo,
        exits: i32,
        expected_growth: i32,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
        let body_len = st.body.len() as i32;
        let few = self.few();
        let need = body_len + expected_growth + self.return_buffer(body_len, few);
        let strict_space = if self.maze_confined() {
            self.reach_space_strict(st)
        } else {
            info.space
        };
        let mut debt = 0i64;

        if info.tail_reach {
            let tail_routes = self.tail_route_count(st, true, 3, 1200);
            if tail_routes == 0 {
                debt += 58_000;
            } else if tail_routes == 1 {
                debt += 13_000 + body_len as i64 * 110 + if exits <= 2 { 18_000 } else { 0 };
            }
        } else {
            debt += 34_000 + body_len as i64 * 170;
            if self.maze_confined() {
                debt += 32_000 + body_len as i64 * 210;
            }
            if exits <= 2 {
                debt += 20_000;
            }
        }

        if exits <= 1 {
            debt += 40_000 + body_len as i64 * 130;
        } else if exits == 2 {
            debt += 15_000 + body_len as i64 * 65;
        }

        let space_short = (need + if info.tail_reach { 42 } else { 92 } - info.space).max(0);
        debt += space_short as i64 * if self.maze_confined() { 720 } else { 430 };

        if self.maze_confined() {
            let strict_need =
                body_len + expected_growth + if few { 70 } else if body_len >= 58 { 58 } else { 42 };
            let strict_short = (strict_need - strict_space).max(0);
            debt += strict_short as i64 * 1_350;
            if body_len >= 45 && !info.tail_reach {
                debt += 38_000;
            }
            if body_len >= 58 && exits <= 2 {
                debt += 22_000;
            }
        } else if self.stone_maze_level() && !info.tail_reach && exits <= 2 {
            debt += 20_000;
        }

        match kind {
            RouteKind::Near => debt + debt / 5,
            RouteKind::Route => debt,
            RouteKind::Pressure => {
                if urgent && few {
                    debt * 3 / 5
                } else if urgent && self.maze_confined() {
                    debt
                } else if urgent {
                    debt * 4 / 5
                } else {
                    debt * 9 / 10
                }
            }
        }
    }

    pub(super) fn recent_step_heat(&self, o: i32) -> i32 {
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

    pub(super) fn recent_memory_debt(
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
        debt.min(if self.force_risk {
            cap.max(220_000)
        } else {
            cap
        })
    }

    pub(super) fn food_cluster(
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

    pub(super) fn cluster_credit(
        &self,
        cluster: ClusterInfo,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
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

    pub(super) fn strategic_smile_credit(
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
}
