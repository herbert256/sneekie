use super::*;

impl Planner {
    pub(super) fn arrow_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 5 | 6 | 13 | 14)
    }

    pub(super) fn open_board_level(&self) -> bool {
        // The arrow levels and the two empty levels (modes 0|8) have no maze walls:
        // the board is wide open, so there is almost never a reason to eat a -50
        // smiley -- the snake can route around one with room to spare. Smiley
        // discipline is tightened hard here so a pickup that should be free is not
        // paid for with points.
        self.arrow_level() || matches!((self.level - 1).rem_euclid(16), 0 | 8)
    }

    pub(super) fn stone_maze_level(&self) -> bool {
        // lay1400 (modes 3|11) is a full stone field; lay1750 (modes 7|15) is the bar
        // maze with a regular stone pattern. Both place pushable stones, so both need
        // the dig-distance gradient and stone-tuned search. Without 7|15 here the bot
        // treated food walled behind L8's stones as unreachable and orbited -- L8 was
        // the worst-stall level in testing (1.8% pickup rate, 261-move idle streaks).
        matches!((self.level - 1).rem_euclid(16), 3 | 7 | 11 | 15)
    }

    pub(super) fn line_maze_level(&self) -> bool {
        matches!((self.level - 1).rem_euclid(16), 1 | 9)
    }

    pub(super) fn wall_gap_level(&self) -> bool {
        // lay1670 (modes 4|12): nine vertical walls on columns 8,16,...,72, each
        // with a 3-cell gap. sub2130 crawls every gap downward -- it seals the top
        // cell of an empty gap each tick and opens the one below.
        matches!((self.level - 1).rem_euclid(16), 4 | 12)
    }

    pub(super) fn wall_gap_top(&self, col: i32) -> Option<i32> {
        // The row of the topmost gap cell in a wall column: the first non-pillar
        // cell that sits directly under a pillar. That cell is the one sub2130
        // seals next, so it is the closing edge of the moving gap.
        let pillar = |c: u16| matches!(c, 179 | 193 | 194);
        (5..=20).find(|&row| {
            !pillar(self.base_cell(offset(row, col)))
                && pillar(self.base_cell(offset(row - 1, col)))
        })
    }

    pub(super) fn maze_confined(&self) -> bool {
        // The cramped non-stone mazes -- line segments, the room/door grid, and the
        // wall-gap walls. They partition the board into pockets joined by narrow
        // gaps, which is where the snake coils itself to death. (Stone fields are
        // excluded: their failure is the opposite, orbiting without digging; arrow
        // and empty boards are open and rarely seal.)
        self.line_maze_level() || room_door_level(self.level) || self.wall_gap_level()
    }

    pub(super) fn start_state(&self) -> State {
        State {
            head: *self.body.last().unwrap_or(&0),
            body: BodyTrace::new(self.body.clone()),
            body_bits: self.body_bits,
            dir: self.dir,
            overlay: CellOverlay::default(),
            first: 0,
            dist: 0,
            ate: 0,
            points: 0,
            smiles: 0,
            stones: 0,
            chokes: 0,
            repeats: 0,
            trace: 0,
        }
    }

    pub(super) fn base_cell(&self, o: i32) -> u16 {
        if (0..BOARD_LEN as i32).contains(&o) {
            self.board[o as usize]
        } else {
            0
        }
    }

    pub(super) fn cell(&self, st: &State, o: i32) -> u16 {
        st.overlay.get(o).unwrap_or_else(|| self.base_cell(o))
    }

    pub(super) fn danger(&self, o: i32, dist: i32) -> bool {
        if !(0..BOARD_LEN as i32).contains(&o) {
            return true;
        }
        let max = self.danger_len.saturating_sub(1);
        let a = (dist.max(0) as usize).min(max);
        let b = (a + 1).min(max);
        self.danger_masks[a].contains(o) || self.danger_masks[b].contains(o)
    }

    pub(super) fn build_danger_masks(&self) -> ([BoardBits; MAX_DANGER_TICKS + 1], usize) {
        // The arrows are deterministic (sub1830/sub1970 in game.js), so project
        // them exactly for the full horizon -- the cost is a couple of inserts
        // per lane per tick. This is what lets a route TIME a lane crossing
        // instead of treating anything past a few ticks as frozen.
        let horizon = if self.arrow_level() { 28 } else { 1 };
        let len = horizon.min(MAX_DANGER_TICKS) + 1;
        let mut masks = [BoardBits::default(); MAX_DANGER_TICKS + 1];
        for o in (0..BOARD_LEN as i32).step_by(2) {
            if is_arrow(self.base_cell(o)) {
                masks[0].insert(o);
            }
        }
        match (self.level - 1).rem_euclid(16) {
            5 | 13 => self.project_up_arrows(&mut masks),
            6 | 14 => self.project_horizontal_arrows(&mut masks),
            4 | 12 => self.project_wall_gaps(&mut masks),
            _ => {}
        }
        (masks, len)
    }

    pub(super) fn project_wall_gaps(&self, masks: &mut [BoardBits]) {
        // Each wall's gap crawls down one row per (empty) tick, sealing its top
        // cell. Mark only that single closing edge as danger so the snake threads
        // the middle/bottom of a gap rather than diving at a mouth about to seal.
        // Just one of the three gap cells is flagged, so the walls stay passable --
        // marking more over-restricts traversal and starves the snake.
        for i in 1..=9 {
            let col = 8 * i;
            if let Some(top) = self.wall_gap_top(col) {
                masks[1].insert(offset(top, col));
            }
        }
    }

    fn arrow_blocked(&self, o: i32) -> bool {
        // sub1830/sub1970 only advance an arrow when the next cell's char code
        // is <= 100: walls AND the snake's own glyphs (186/205/219...) stall it
        // in place. The VRAM snapshot still holds the current body glyphs, so
        // base_cell covers both. A stalled arrow is where death actually waits;
        // assuming it flew past is exactly the wrong prediction.
        self.base_cell(o) > 100
    }

    pub(super) fn project_up_arrows(&self, masks: &mut [BoardBits]) {
        for col in (2..=78).step_by(2) {
            let mut row = self.enemy_value(col, 1);
            if !(4..=21).contains(&row) {
                row = self.scan_arrow_col(col, 24).unwrap_or(0);
            }
            if row == 0 {
                continue;
            }
            for mask in masks.iter_mut().skip(1) {
                // Exact sub1830 step: wrap 4 -> 21 first, then move up one row
                // unless the cell above stalls the arrow.
                if row <= 4 {
                    row = 21;
                }
                if !self.arrow_blocked(offset(row - 1, col)) {
                    row -= 1;
                }
                mask.insert(offset(row, col));
            }
        }
    }

    pub(super) fn project_horizontal_arrows(&self, masks: &mut [BoardBits]) {
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
                // Exact sub1970 steps: wrap first (79 -> 1 rightward, 2 -> 80
                // leftward), then advance unless the next cell stalls the arrow.
                if right != 0 {
                    if right >= 79 {
                        right = 1;
                    }
                    if !self.arrow_blocked(offset(row, right + 1)) {
                        right += 1;
                    }
                    mask.insert(offset(row, right));
                }
                if left != 0 {
                    if left <= 2 {
                        left = 80;
                    }
                    if !self.arrow_blocked(offset(row, left - 1)) {
                        left -= 1;
                    }
                    mask.insert(offset(row, left));
                }
            }
        }
    }

    pub(super) fn enemy_value(&self, i: i32, j: i32) -> i32 {
        let idx = i * 4 + j;
        if (0..self.enemy.len() as i32).contains(&idx) {
            self.enemy[idx as usize]
        } else {
            0
        }
    }

    pub(super) fn scan_arrow_col(&self, col: i32, arrow: u16) -> Option<i32> {
        (4..=20).find(|&row| self.base_cell(offset(row, col)) == arrow)
    }

    pub(super) fn scan_arrow_row(&self, row: i32, arrow: u16) -> Option<i32> {
        (2..=79).find(|&col| self.base_cell(offset(row, col)) == arrow)
    }
}
