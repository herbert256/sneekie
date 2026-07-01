use super::*;

impl Planner {
    // Region sweep planner: decompose the static maze into regions joined by
    // corridor cells, then commit to one target region until it is swept clean.
    // This generalizes the hand-built door logic: any walled layout gets a
    // "finish the room you are in, then move to the nearest room with food"
    // discipline, which is how a human clears these mazes without walling off
    // stranded hearts. Only the line and room mazes get a target: wall gaps
    // crawl and stones move, so static regions would lie there, and the open
    // boards are one big region anyway.
    pub(super) fn compute_target_region(&self) -> Option<BoardBits> {
        if !(self.line_maze_level() || room_door_level(self.level)) {
            return None;
        }
        let open = |o: i32| static_open_cell(&self.board, self.body_bits, o);
        // A corridor cell joins regions without belonging to one: exactly two
        // open orthogonal neighbours, opposite each other.
        let corridor = |o: i32| {
            let up = open(o - 160);
            let down = open(o + 160);
            let left = open(o - 2);
            let right = open(o + 2);
            (up && down && !left && !right) || (left && right && !up && !down)
        };
        let head = *self.body.last()?;
        let mut assigned = BoardBits::default();
        let mut regions: Vec<(BoardBits, i32)> = Vec::new();
        let mut head_region: Option<usize> = None;
        for seed in (0..BOARD_LEN as i32).step_by(2) {
            if assigned.contains(seed) || !open(seed) || corridor(seed) {
                continue;
            }
            let mut cells = BoardBits::default();
            let mut foods = 0;
            let mut q = VecDeque::from([seed]);
            cells.insert(seed);
            assigned.insert(seed);
            while let Some(o) = q.pop_front() {
                if is_food(self.base_cell(o)) {
                    foods += 1;
                }
                for &(_, d) in &DIRS {
                    let n = o + d;
                    if !open(n) || corridor(n) || assigned.contains(n) {
                        continue;
                    }
                    assigned.insert(n);
                    cells.insert(n);
                    q.push_back(n);
                }
            }
            if cells.contains(head) {
                head_region = Some(regions.len());
            }
            regions.push((cells, foods));
        }
        // Stay in the head's region while it still holds food.
        if let Some(idx) = head_region {
            if regions[idx].1 > 0 {
                return Some(regions[idx].0);
            }
        }
        // Otherwise commit to the nearest region that still has food, walking
        // the open graph from the head so distance means actual travel.
        let mut seen = BoardBits::default();
        let mut q = VecDeque::from([head]);
        seen.insert(head);
        while let Some(o) = q.pop_front() {
            if let Some((cells, foods)) = regions
                .iter()
                .find(|(cells, foods)| *foods > 0 && cells.contains(o))
            {
                let _ = foods;
                return Some(*cells);
            }
            for &(_, d) in &DIRS {
                let n = o + d;
                if open(n) && seen.insert(n) {
                    q.push_back(n);
                }
            }
        }
        None
    }
}
