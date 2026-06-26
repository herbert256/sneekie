use super::*;

impl Planner {
    pub(super) fn smile_limit(&self, kind: RouteKind, urgent: bool) -> i32 {
        match kind {
            RouteKind::Near | RouteKind::Route => 1,
            RouteKind::Pressure => {
                if urgent || self.few() {
                    2
                } else {
                    1
                }
            }
        }
    }

    pub(super) fn smile_growth_debt(&self, body_len: i32, urgent: bool) -> i64 {
        let long_body = (body_len - 96).max(0) as i64;
        let very_long_body = (body_len - 118).max(0) as i64;
        let huge_body = (body_len - 150).max(0) as i64;
        let food_pressure = if self.items > 58 {
            900
        } else if self.items > 40 {
            400
        } else {
            0
        };
        food_pressure
            + long_body * if urgent { 75 } else { 115 }
            + very_long_body * if urgent { 180 } else { 260 }
            + huge_body * if urgent { 350 } else { 520 }
    }

    pub(super) fn avoid_extra_smile(&self, body_len: i32) -> bool {
        // On an open board there is room to go around a smiley, so refuse to bridge
        // one well before the body is long -- only a genuinely starving snake (deep
        // idle streak) may still spend one rather than orbit to a restart.
        if self.open_board_level() && !self.few() {
            return body_len >= 20 && !(self.urgent && self.idle >= 70);
        }
        // The cramped non-stone mazes: refuse smiley bridges from a moderate body, so
        // the snake routes around the corridor/room smileys instead of nibbling them
        // all game (L2/L3/L5 ran to 20-38 smileys once the snake survived longer),
        // while a genuinely starving snake can still spend one to break out.
        if self.maze_confined() && !self.few() {
            return body_len >= 30 && !(self.urgent && self.idle >= 96 && self.items <= 18);
        }
        // Long bodies normally never bridge a smiley, but when starving (food walled
        // off behind smileys) allow it -- otherwise the snake just orbits to a restart.
        body_len >= 115 && !self.few() && !(self.urgent && self.idle >= 50)
    }

    pub(super) fn smile_cost(&self, kind: RouteKind, urgent: bool, body_len: i32) -> i64 {
        // Each smiley is -50 points and spawns another, so over-eating them turns a
        // winning board into a falling score (L2/L3 averaged 7-11 smileys a level).
        // Raised ~30% from 8500/10500/5800/8000 so a smiley bridge has to clearly pay
        // off; the strategic-smile credit still rebates a bridge that opens a real food
        // cluster or keeps tail access, and the urgent value stays lowest so a starving
        // snake can still spend one rather than orbit to a restart.
        let base = match kind {
            RouteKind::Near => 11_000,
            RouteKind::Route => 14_000,
            RouteKind::Pressure => {
                if urgent {
                    7_500
                } else {
                    10_500
                }
            }
        };
        // On an open board a smiley is almost never worth -50, so double the cost
        // there; the cramped non-stone mazes get a +70% bump (a bridge is occasionally
        // a real necessity there, so not the full double). The strategic-smile credit
        // can still rebate a genuinely useful bridge, and the urgent/desperate paths
        // keep their own lower thresholds.
        let extra = if self.open_board_level() {
            base
        } else if self.maze_confined() {
            base * 7 / 10
        } else {
            0
        };
        base + extra + self.smile_growth_debt(body_len, urgent)
    }

    pub(super) fn smile_escape_credit(
        &self,
        smiles: i32,
        kind: RouteKind,
        urgent: bool,
        info: SpaceInfo,
        escape: EscapeInfo,
    ) -> i64 {
        if smiles <= 0 || !escape.tail_reach {
            return 0;
        }
        let mut credit = match kind {
            RouteKind::Near => 5_800,
            RouteKind::Route => 8_800,
            RouteKind::Pressure => {
                if urgent {
                    7_400
                } else {
                    6_600
                }
            }
        };
        if !info.tail_reach {
            credit += match kind {
                RouteKind::Near => 1_200,
                RouteKind::Route => 2_000,
                RouteKind::Pressure => {
                    if urgent {
                        2_200
                    } else {
                        1_400
                    }
                }
            };
        }
        if escape.exits >= 3 {
            credit += 1_000;
        }
        smiles as i64 * credit
    }

    pub(super) fn smile_step_credit(
        &self,
        c: u16,
        info: SpaceInfo,
        escape: EscapeInfo,
        return_room: bool,
        return_risk: bool,
        exits: i32,
        forced: ForcedInfo,
    ) -> i64 {
        if c != 1 {
            return 0;
        }
        let mut credit = 0;
        if return_room {
            credit += 5_500;
        }
        if info.tail_reach {
            credit += 4_000;
        }
        if escape.tail_reach {
            credit += 10_000;
        }
        if escape.ok {
            credit += 3_000;
        }
        credit += match exits {
            3.. => 4_500,
            2 => 2_400,
            _ => 0,
        };
        if forced.end_exits >= 2 {
            credit += 1_800;
        }
        if return_risk && !escape.tail_reach {
            credit -= 12_000;
        }
        credit
    }
}
