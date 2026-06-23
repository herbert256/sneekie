use super::*;

impl Planner {
    pub(super) fn door_path_clear(&self, st: &State, o: i32, tail: i32) -> bool {
        (0..BOARD_LEN as i32).contains(&o)
            && (o == tail || (!st.body_bits.contains(o) && open(self.cell(st, o))))
    }

    pub(super) fn static_room_cell(&self, st: &State, o: i32) -> bool {
        (0..BOARD_LEN as i32).contains(&o)
            && !self.door_bits.contains(o)
            && (st.body_bits.contains(o) || open(self.cell(st, o)))
    }

    pub(super) fn current_room_cells(&self, st: &State) -> BoardBits {
        let mut room = BoardBits::default();
        if self.doors.is_empty() {
            return room;
        }
        let mut q = VecDeque::new();
        let push_seed = |room: &mut BoardBits, q: &mut VecDeque<i32>, o: i32| {
            if self.static_room_cell(st, o) && room.insert(o) {
                q.push_back(o);
            }
        };
        if self.door_bits.contains(st.head) {
            for &(_, d) in &DIRS {
                push_seed(&mut room, &mut q, st.head + d);
            }
        } else {
            push_seed(&mut room, &mut q, st.head);
        }
        while let Some(o) = q.pop_front() {
            for &(_, d) in &DIRS {
                let n = o + d;
                if self.static_room_cell(st, n) && room.insert(n) {
                    q.push_back(n);
                }
            }
        }
        room
    }

    pub(super) fn door_lane_clear(&self, st: &State, door: Door, lane: usize, tail: i32) -> bool {
        self.door_path_clear(st, door.cells[lane], tail)
            && self.door_path_clear(st, door.before[lane], tail)
            && self.door_path_clear(st, door.after[lane], tail)
    }

    pub(super) fn door_exit_info(&self, st: &State) -> DoorInfo {
        if self.doors.is_empty() {
            return DoorInfo::default();
        }
        let room = self.current_room_cells(st);
        let tail = st.body.tail().unwrap_or(st.head);
        let mut info = DoorInfo::default();
        for &door in &self.doors {
            let touches_room = door.cells.contains(&st.head)
                || door.before.iter().any(|&o| room.contains(o))
                || door.after.iter().any(|&o| room.contains(o));
            if !touches_room {
                continue;
            }
            info.total += 1;
            let lanes = (0..2)
                .filter(|&lane| self.door_lane_clear(st, door, lane, tail))
                .count() as i32;
            if lanes == 0 {
                info.blocked += 1;
            } else {
                info.usable += 1;
                if lanes == 1 {
                    info.single_lane += 1;
                }
            }
        }
        info
    }

    pub(super) fn door_exit_closed(&self, info: DoorInfo) -> bool {
        info.total > 0 && info.usable == 0
    }

    pub(super) fn door_exit_debt(&self, info: DoorInfo, body_len: i32, exits: i32) -> i64 {
        if info.total == 0 {
            return 0;
        }
        let size = if body_len >= 90 {
            2
        } else if body_len >= 50 {
            1
        } else {
            0
        };
        let mut debt = info.blocked as i64 * (28_000 + size as i64 * 9_000)
            + info.single_lane as i64 * (4_500 + size as i64 * 2_500);
        if info.usable == 0 {
            debt += 92_000 + body_len as i64 * 620 + if exits <= 2 { 36_000 } else { 0 };
        } else if info.usable == 1 {
            debt += 8_500 + if exits <= 2 { 8_000 } else { 0 };
        }
        debt
    }

    pub(super) fn door_exit_credit(&self, info: DoorInfo) -> i64 {
        if info.total == 0 {
            0
        } else if info.usable >= 2 {
            12_000 + (info.usable - 2) as i64 * 2_000
        } else if info.usable == 1 {
            3_000
        } else {
            0
        }
    }

    pub(super) fn door_regression_debt(
        &self,
        before: DoorInfo,
        after: DoorInfo,
        body_len: i32,
        exits: i32,
        kind: RouteKind,
        urgent: bool,
    ) -> i64 {
        if before.total == 0 || after.total == 0 {
            return 0;
        }
        let size = if body_len >= 90 {
            2
        } else if body_len >= 50 {
            1
        } else {
            0
        };
        let mut debt = 0;
        if before.usable > 0 && after.usable == 0 {
            debt += 118_000 + body_len as i64 * 720 + if exits <= 2 { 34_000 } else { 0 };
        } else if before.usable >= 2 && after.usable == 1 {
            debt += 14_000 + size as i64 * 8_000 + if exits <= 2 { 7_000 } else { 0 };
        }
        if after.blocked > before.blocked {
            debt += (after.blocked - before.blocked) as i64 * (24_000 + size as i64 * 8_000);
        }
        if after.single_lane > before.single_lane {
            debt += (after.single_lane - before.single_lane) as i64 * (5_000 + size as i64 * 2_000);
        }
        match kind {
            RouteKind::Near => debt + debt / 3,
            RouteKind::Route => debt,
            RouteKind::Pressure => {
                if urgent {
                    debt * 2 / 3
                } else {
                    debt * 4 / 5
                }
            }
        }
    }
}
