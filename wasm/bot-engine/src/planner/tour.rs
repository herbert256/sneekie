use super::*;

impl Planner {
    // Endgame finisher: with only a few items left, search one complete ordered
    // tour that eats every visible food, simulated end to end with the real
    // move engine. The whole tour becomes the committed route, so the driver
    // replays it to the level clear instead of renegotiating every tick --
    // which is exactly where the old bot orbited and entombed itself (the body
    // is longest on the last pickups).
    pub(super) fn endgame_tour(&mut self) -> Option<i32> {
        if !self.few() || self.items <= 0 {
            return None;
        }
        let start = self.start_state();
        let visible = self.visible_food_count(&start);
        if visible == 0 || visible > 8 {
            return None;
        }
        // On the club-spawning band eating a heart respawns items, so the tour
        // is "eat everything currently visible", not a guaranteed level end.
        let target = visible.min(self.items);
        let mut route = Vec::new();
        for allow_smile in [false, true] {
            route.clear();
            if self.tour_dfs(&start, target, visible, allow_smile, &mut route) {
                let first = *route.first()?;
                self.last_route = route;
                return Some(first);
            }
            if self.time_up() {
                return None;
            }
        }
        None
    }

    fn visible_food_count(&self, st: &State) -> i32 {
        let mut foods = 0;
        for o in (0..BOARD_LEN as i32).step_by(2) {
            if is_food(self.cell(st, o)) {
                foods += 1;
            }
        }
        foods
    }

    fn tour_dfs(
        &mut self,
        st: &State,
        remaining: i32,
        visible: i32,
        allow_smile: bool,
        route: &mut Vec<i32>,
    ) -> bool {
        if remaining <= 0 {
            // Eating the final item ends the level; a tour that cannot end it
            // (items hidden under arrows, spawned clubs) must leave a way out.
            if visible >= self.items {
                return true;
            }
            let info = self.space_info(st, true);
            return info.tail_reach || info.space >= st.body.len() as i32 + 60;
        }
        if route.len() >= 150 || self.time_up() {
            return false;
        }
        let segments = self.tour_segments(st, 3, allow_smile, remaining);
        for (ns, seg) in segments {
            let ate = ns.ate - st.ate;
            let mark = route.len();
            route.extend_from_slice(&seg);
            if self.tour_dfs(&ns, remaining - ate, visible, allow_smile, route) {
                return true;
            }
            route.truncate(mark);
            if self.time_up() {
                return false;
            }
        }
        false
    }

    // The nearest few pickup states reachable from st, each with the move list
    // that gets there. Breadth-first, so candidates come back nearest-first.
    fn tour_segments(
        &mut self,
        st: &State,
        want: usize,
        allow_smile: bool,
        remaining: i32,
    ) -> Vec<(State, Vec<i32>)> {
        let mut arena: Vec<(u32, u8)> = vec![(0, 0)];
        let mut root = st.clone();
        root.trace = 0;
        let mut q = VecDeque::from([root]);
        let mut seen = SeenKeys::with_capacity(1600);
        seen.insert(state_key(st));
        let mut out: Vec<(State, Vec<i32>)> = Vec::new();
        let mut scanned = 0;
        'scan: while let Some(cur) = q.pop_front() {
            if scanned >= 1400 || out.len() >= want || self.time_up() {
                break;
            }
            scanned += 1;
            if cur.dist - st.dist >= 120 {
                continue;
            }
            for &(sc, _) in &DIRS {
                let Some(mut ns) = self.move_state(&cur, sc, allow_smile) else {
                    continue;
                };
                // A tour spends at most one smiley per segment.
                if allow_smile && ns.smiles - st.smiles > 1 {
                    continue;
                }
                if !seen.insert(state_key(&ns)) {
                    continue;
                }
                arena.push((cur.trace, sc as u8));
                ns.trace = (arena.len() - 1) as u32;
                if ns.ate > cur.ate {
                    // A dead-end landing is only acceptable when this pickup
                    // finishes the whole tour (the level ends right there).
                    let ate = ns.ate - st.ate;
                    if remaining - ate > 0 && self.legal_count(&ns, true) == 0 {
                        continue;
                    }
                    let seg = rebuild_route(&arena, ns.trace);
                    out.push((ns, seg));
                    if out.len() >= want {
                        break 'scan;
                    }
                } else {
                    q.push_back(ns);
                }
            }
        }
        out
    }
}
