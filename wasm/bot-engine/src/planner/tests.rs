use super::*;

fn empty_board() -> [u16; BOARD_LEN] {
    let mut board = [0u16; BOARD_LEN];
    for row in 1..=25 {
        for col in 1..=80 {
            board[offset(row, col) as usize] = 32;
        }
    }
    board
}

fn planner(board: [u16; BOARD_LEN], body: Vec<i32>) -> Planner {
    Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        Vec::new(),
        26,
        12,
        0,
        false,
        1_000_000.0,
    )
}

fn planner_level(board: [u16; BOARD_LEN], body: Vec<i32>, level: i32) -> Planner {
    Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        Vec::new(),
        level,
        12,
        0,
        false,
        1_000_000.0,
    )
}

fn vertical_door_board() -> [u16; BOARD_LEN] {
    let mut board = empty_board();
    for row in 8..=13 {
        board[offset(row, 12) as usize] = 179;
    }
    board[offset(10, 12) as usize] = 32;
    board[offset(11, 12) as usize] = 32;
    board
}

#[test]
fn rejects_instant_reverse() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner(board, body);
    let st = p.start_state();
    assert!(p.move_state(&st, 75, true).is_none());
    assert!(p.move_state(&st, 77, true).is_some());
}

#[test]
fn pushes_stone_when_next_cell_is_empty() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 12) as usize] = 10;
    board[offset(10, 13) as usize] = 32;
    let p = planner(board, body);
    let st = p.start_state();
    let ns = p
        .move_state(&st, 77, true)
        .expect("stone push should be legal");
    assert_eq!(p.cell(&ns, offset(10, 12)), 32);
    assert_eq!(p.cell(&ns, offset(10, 13)), 10);
    assert_eq!(ns.stones, 1);
}

#[test]
fn growth_keeps_tail_on_food() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 12) as usize] = 3;
    let p = planner(board, body);
    let st = p.start_state();
    let ns = p.move_state(&st, 77, false).expect("food should be legal");
    assert_eq!(ns.body.len(), 3);
    assert!(ns.body_bits.contains(offset(10, 10)));
    assert_eq!(ns.points, 10);
}

#[test]
fn empty_move_releases_tail() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner(board, body);
    let st = p.start_state();
    let ns = p
        .move_state(&st, 77, true)
        .expect("empty move should be legal");
    assert_eq!(ns.body.len(), 2);
    assert!(!ns.body_bits.contains(offset(10, 10)));
    assert_eq!(p.cell(&ns, offset(10, 10)), 32);
}

#[test]
fn wall_gap_projection_marks_closing_gap_top() {
    // Advice #7: on the wall-gap level the closing edge of each crawling gap is
    // projected as danger so the snake does not dive into a sealing mouth.
    let mut board = empty_board();
    let col = 16;
    for row in 4..=20 {
        board[offset(row, col) as usize] = 179;
    }
    for row in 9..=11 {
        board[offset(row, col) as usize] = 32; // a 3-cell gap
    }
    let body = vec![offset(2, 2), offset(2, 3)];
    let p = planner_level(board, body, 5); // level 5 -> mode 4 -> wall-gap
    assert!(p.wall_gap_level());
    assert_eq!(p.wall_gap_top(col), Some(9));
    assert!(
        p.danger(offset(9, col), 0),
        "the gap top is the closing edge"
    );
    // A wide-open cell nowhere near a wall is not flagged.
    assert!(!p.danger(offset(10, 40), 0));
}

#[test]
fn projects_future_up_arrow_danger() {
    let mut board = empty_board();
    let mut enemy = [0; ENEMY_LEN];
    let col = 10;
    enemy[(col * 4 + 1) as usize] = 8;
    board[offset(8, col) as usize] = 24;
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = Planner::new(
        board,
        body,
        enemy,
        Vec::new(),
        30,
        20,
        0,
        false,
        1_000_000.0,
    );
    assert!(p.danger(offset(7, col), 0));
    assert!(p.danger(offset(6, col), 1));
}

#[test]
fn escape_proof_finds_open_space() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let ns = p.move_state(&st, 77, true).unwrap();
    let proof = p.escape_proof(&ns, 20, 6, true);
    assert!(proof.ok);
}

#[test]
fn enclosure_risk_rejects_small_closed_region() {
    let mut board = empty_board();
    for row in 8..=12 {
        board[offset(row, 8) as usize] = 179;
        board[offset(row, 12) as usize] = 179;
    }
    for col in 8..=12 {
        board[offset(8, col) as usize] = 196;
        board[offset(12, col) as usize] = 196;
    }
    let body = vec![offset(10, 9), offset(10, 10)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let info = p.space_info(&st, false);
    assert!(p.enclosure_risk(&st, info, 1, 2));
}

#[test]
fn return_path_risk_flags_region_cut_off_from_tail() {
    let mut board = empty_board();
    for row in 8..=12 {
        board[offset(row, 12) as usize] = 179;
        board[offset(row, 16) as usize] = 179;
    }
    for col in 12..=16 {
        board[offset(8, col) as usize] = 196;
        board[offset(12, col) as usize] = 196;
    }
    let body = vec![offset(10, 10), offset(10, 13), offset(10, 14)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let info = p.space_info(&st, false);
    assert!(!info.tail_reach);
    assert!(p.return_path_risk(&st, info, 2, 1));
}

#[test]
fn door_exit_strategy_accepts_one_reserved_lane() {
    let board = vertical_door_board();
    let body = vec![offset(10, 13), offset(10, 14)];
    let p = planner_level(board, body, 27);
    let st = p.start_state();
    let info = p.door_exit_info(&st);
    assert_eq!(p.doors.len(), 1);
    assert_eq!(info.total, 1);
    assert_eq!(info.usable, 1);
    assert_eq!(info.blocked, 0);
    assert!(!p.door_exit_closed(info));
}

#[test]
fn door_exit_strategy_flags_blocked_return_lanes() {
    let board = vertical_door_board();
    let body = vec![
        offset(9, 14),
        offset(10, 13),
        offset(11, 13),
        offset(10, 14),
    ];
    let p = planner_level(board, body, 27);
    let st = p.start_state();
    let info = p.door_exit_info(&st);
    assert_eq!(info.total, 1);
    assert_eq!(info.usable, 0);
    assert_eq!(info.blocked, 1);
    assert!(p.door_exit_closed(info));
    assert!(p.door_exit_debt(info, st.body.len() as i32, 2) > 100_000);
}

#[test]
fn door_regression_debt_protects_reserved_return_lane() {
    let board = vertical_door_board();
    let open_body = vec![offset(10, 13), offset(10, 14)];
    let blocked_body = vec![
        offset(9, 14),
        offset(10, 13),
        offset(11, 13),
        offset(10, 14),
    ];
    let p = planner_level(board, open_body, 27);
    let before = p.door_exit_info(&p.start_state());
    let mut bits = BoardBits::default();
    for off in &blocked_body {
        bits.insert(*off);
    }
    let after_state = State {
        head: offset(10, 14),
        body: BodyTrace::new(blocked_body),
        body_bits: bits,
        dir: 77,
        overlay: CellOverlay::default(),
        first: 77,
        dist: 1,
        ate: 0,
        points: 0,
        smiles: 0,
        stones: 0,
        chokes: 0,
        repeats: 0,
    };
    let after = p.door_exit_info(&after_state);
    assert_eq!(before.usable, 1);
    assert_eq!(after.usable, 0);
    assert!(p.door_regression_debt(before, after, 64, 2, RouteKind::Route, false) > 100_000);
}

#[test]
fn return_gate_debt_penalizes_single_narrow_tail_route() {
    let mut board = empty_board();
    for col in 11..=15 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 16) as usize] = 196;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let ns = p.move_state(&st, 77, true).unwrap();
    let info = p.space_info(&ns, false);
    let exits = p.legal_count(&ns, true);
    assert!(p.return_gate_debt(&ns, info, exits, 1, RouteKind::Route, false) > 20_000);
}

#[test]
fn recent_memory_debt_penalizes_looping_without_progress() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut trail = Vec::new();
    for col in 20..=48 {
        trail.push(offset(5, col));
    }
    trail.push(offset(10, 12));
    let mut p = Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        trail,
        26,
        12,
        0,
        false,
        1_000_000.0,
    );
    let st = p.start_state();
    let ns = p.move_state(&st, 77, true).unwrap();
    let info = p.space_info(&ns, false);
    let exits = p.legal_count(&ns, true);
    let debt = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Route, false, 0);
    let progress_debt = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Route, false, 1);
    assert!(ns.repeats > 0);
    assert!(debt > 0);
    assert!(progress_debt < debt);
}

#[test]
fn force_risk_amplifies_loop_breaker() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut trail = Vec::new();
    for col in 20..=48 {
        trail.push(offset(5, col));
    }
    trail.push(offset(10, 12));
    let mut p = Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        trail,
        26,
        12,
        0,
        false,
        1_000_000.0,
    );
    let st = p.start_state();
    let ns = p.move_state(&st, 77, true).unwrap();
    let info = p.space_info(&ns, false);
    let exits = p.legal_count(&ns, true);
    let normal = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Pressure, true, 0);
    p.force_risk = true;
    let forced = p.recent_memory_debt(&ns, info, false, exits, RouteKind::Pressure, true, 0);
    assert!(ns.repeats > 0);
    assert!(
        forced > normal,
        "force_risk should amplify the loop-breaking debt"
    );
}

#[test]
fn idle_ticks_make_planner_urgent() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        Vec::new(),
        26,
        40,
        18,
        false,
        1_000_000.0,
    );
    assert!(p.urgent);
}

#[test]
fn long_body_blocks_extra_smileys_before_endgame() {
    // Default gate (115) on a stone field (level 4) -- neither a cramped maze nor
    // an open board, so it keeps the long-body threshold.
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner_level(board, body, 4);
    assert!(!p.maze_confined() && !p.open_board_level());
    assert!(!p.avoid_extra_smile(114));
    assert!(p.avoid_extra_smile(115));
}

#[test]
fn cramped_mazes_get_middle_smiley_discipline() {
    // Smiley follow-up: every cramped non-stone maze (line L2, room L3, wall L5)
    // gets a middle level of smiley discipline -- stricter than a stone field,
    // looser than the wide-open arrow boards.
    let line = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 2);
    let room = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 3);
    let wall = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 5);
    let stone = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 4);
    let arrow = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 6);
    assert!(line.maze_confined() && room.maze_confined() && wall.maze_confined());
    assert!(!stone.maze_confined() && !arrow.maze_confined());
    let c = |p: &Planner| p.smile_cost(RouteKind::Route, false, 40);
    assert!(
        c(&stone) < c(&room),
        "a cramped maze costs more than a stone field"
    );
    assert!(c(&room) < c(&arrow), "the open board still costs the most");
    // A mid-length body refuses bridges on the cramped mazes but not on a stone field.
    assert!(line.avoid_extra_smile(60) && room.avoid_extra_smile(60));
    assert!(!stone.avoid_extra_smile(60));
}

#[test]
fn open_levels_are_stingier_with_smileys() {
    // Advice #5: on the wide-open arrow levels a smiley should cost much more
    // than on a walled maze (where one can be a needed bridge), and the snake
    // should refuse to bridge one well before the long-body gate.
    let arrow = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 6);
    let stone = planner_level(empty_board(), vec![offset(10, 10), offset(10, 11)], 4);
    assert!(arrow.open_board_level());
    assert!(!stone.open_board_level());
    assert!(
        arrow.smile_cost(RouteKind::Route, false, 40)
            > stone.smile_cost(RouteKind::Route, false, 40),
        "an open-board smiley must cost more than a maze smiley"
    );
    // A mid-length body refuses smiley bridges on the open board but not yet on
    // the stone maze (where the long-body gate is 115).
    assert!(arrow.avoid_extra_smile(25));
    assert!(!stone.avoid_extra_smile(25));
}

#[test]
fn normal_food_route_rejects_cut_off_tail_return() {
    let mut board = empty_board();
    for row in 8..=12 {
        board[offset(row, 12) as usize] = 179;
        board[offset(row, 16) as usize] = 179;
    }
    for col in 12..=16 {
        board[offset(8, col) as usize] = 196;
        board[offset(12, col) as usize] = 196;
    }
    board[offset(10, 15) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 13), offset(10, 14)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let ns = p
        .move_state(&st, 77, false)
        .expect("food inside the room is reachable");
    let cfg = FoodSearch {
        start: st,
        allow_smile: false,
        max_depth: 10,
        scan_limit: 50,
        check_limit: 10,
        route_kind: RouteKind::Route,
        arrow_level: false,
        urgent: false,
    };
    assert!(p.score_food_candidate(&ns, &cfg).is_none());
}

#[test]
fn wasteful_smiley_is_skipped_when_clean_food_is_reachable() {
    // Advice #9: a smiley straight ahead, but a heart reachable up-and-around
    // without crossing any smiley. The guard must steer off the -50 smiley.
    let mut board = empty_board();
    board[offset(10, 12) as usize] = 1; // smiley immediately to the right
    board[offset(8, 14) as usize] = 3; // heart reachable without the smiley
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner_level(board, body, 2); // line maze -> not open_board_level
    assert!(!p.open_board_level());
    assert!(
        p.food_distance_no_smile(&p.start_state(), 1200) < INF,
        "clean food is reachable without the smiley"
    );
    let out = p.avoid_wasteful_smile(77);
    assert_ne!(out, 77, "should not nibble the smiley when a heart is cleanly reachable");
    assert!(matches!(out, 72 | 80 | 75), "should pick a clean legal direction");
}

#[test]
fn smiley_bridge_kept_when_no_clean_food_reachable() {
    // The mirror case: the ONLY food sits behind the smiley (walled off every
    // other way), so the guard must leave the bridge move alone.
    let mut board = empty_board();
    // Wall a one-wide corridor so the heart past the smiley has no clean route.
    for col in 11..=15 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 16) as usize] = 196;
    board[offset(10, 12) as usize] = 1; // smiley blocks the corridor
    board[offset(10, 14) as usize] = 3; // heart only reachable through the smiley
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner_level(board, body, 2);
    assert!(
        p.food_distance_no_smile(&p.start_state(), 1200) >= INF,
        "no clean route to the walled-off heart"
    );
    assert_eq!(p.avoid_wasteful_smile(77), 77, "the bridge move must be preserved");
}

#[test]
fn strategic_smiley_bridge_can_unlock_clustered_food() {
    let mut board = empty_board();
    board[offset(10, 12) as usize] = 1;
    board[offset(10, 13) as usize] = 3;
    board[offset(9, 13) as usize] = 5;
    board[offset(11, 13) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let cfg = FoodSearch {
        start: st.clone(),
        allow_smile: true,
        max_depth: 12,
        scan_limit: 80,
        check_limit: 10,
        route_kind: RouteKind::Route,
        arrow_level: false,
        urgent: false,
    };
    let ns = p.move_state(&st, 77, true).unwrap();
    let ns = p.route_prefix_state(ns, &cfg).unwrap();
    let ns = p.move_state(&ns, 77, true).unwrap();
    let score = p.score_food_candidate(&ns, &cfg);
    assert!(score.is_some());
    let cluster = p.food_cluster(&ns, 16, 120, true);
    assert!(cluster.foods >= 2);
    assert!(p.cluster_credit(cluster, RouteKind::Route, false) > 0);
}

#[test]
fn normal_food_route_rejects_second_smiley() {
    let mut board = empty_board();
    board[offset(10, 12) as usize] = 1;
    board[offset(10, 13) as usize] = 1;
    board[offset(10, 14) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    let st = p.start_state();
    let cfg = FoodSearch {
        start: st.clone(),
        allow_smile: true,
        max_depth: 10,
        scan_limit: 50,
        check_limit: 10,
        route_kind: RouteKind::Route,
        arrow_level: false,
        urgent: false,
    };
    let ns = p
        .move_state(&st, 77, true)
        .expect("first smiley remains available as a tactical option");
    let ns = p
        .route_prefix_state(ns, &cfg)
        .expect("one smiley is still permitted on a normal route");
    let ns = p
        .move_state(&ns, 77, true)
        .expect("second smiley is physically reachable");
    assert!(p.route_prefix_state(ns, &cfg).is_none());
}

#[test]
fn breathing_move_can_take_smiley_bridge_out_of_a_trap() {
    let mut board = empty_board();
    let body = vec![offset(10, 9), offset(10, 10)];
    board[offset(10, 11) as usize] = 1;

    // Up and down are legal first steps, but each immediately enters a
    // one-way dead pocket. The right move grows through a smiley but keeps
    // the only route into the open area.
    for off in [
        offset(8, 10),
        offset(9, 9),
        offset(9, 11),
        offset(12, 10),
        offset(11, 9),
        offset(11, 11),
    ] {
        board[off as usize] = 196;
    }

    let mut p = planner(board, body);
    assert_eq!(p.breathing_move(), Some(77));
}

#[test]
fn self_seal_guard_overrides_into_a_tiny_pocket() {
    // Advice #3: a long body about to step into a 2-cell dead pocket, when an
    // open direction exists, gets steered to the roomy move instead.
    let mut board = empty_board();
    // Pocket {(10,12),(10,13)} sealed on every side but the body to its left.
    board[offset(9, 12) as usize] = 196;
    board[offset(9, 13) as usize] = 196;
    board[offset(11, 12) as usize] = 196;
    board[offset(11, 13) as usize] = 196;
    board[offset(10, 14) as usize] = 196;
    // A 10-long body lying along row 10, head at (10,11).
    let body: Vec<i32> = (2..=11).map(|c| offset(10, c)).collect();
    let p = planner_level(board, body, 2); // line maze -> maze_confined
    assert!(p.maze_confined());
    // Right (77) seals into the 2-cell pocket; up (72) is wide open.
    let overridden = p.avoid_self_seal(77);
    assert_ne!(overridden, 77, "should refuse to seal into the tiny pocket");
    assert!(
        matches!(overridden, 72 | 80),
        "should pick an open direction"
    );
}

#[test]
fn forced_path_detects_one_way_dead_end() {
    let mut board = empty_board();
    for col in 11..=14 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 15) as usize] = 196;
    let body = vec![offset(10, 10), offset(10, 11)];
    let p = planner(board, body);
    let st = p.start_state();
    let ns = p.move_state(&st, 77, true).unwrap();
    let forced = p.forced_path(&ns, true, 8);
    assert!(forced.dead);
    assert_eq!(forced.end_exits, 0);
    assert!(forced.steps > 0);
}

#[test]
fn survival_move_avoids_dead_corridor_when_branch_exists() {
    let mut board = empty_board();
    for col in 11..=14 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 15) as usize] = 196;
    board[offset(9, 11) as usize] = 32;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    assert_ne!(p.survival_move(), Some(77));
}

#[test]
fn stone_maze_pressure_chases_reachable_food() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 13) as usize] = 3;
    for row in 7..=13 {
        board[offset(row, 9) as usize] = 10;
    }
    let mut p = planner_level(board, body, 28);
    p.urgent = true;
    assert_eq!(p.pressure_step(), Some(77));
}

#[test]
fn dig_distance_tunnels_through_pushable_stone() {
    let mut board = empty_board();
    // A one-wide corridor on row 10: walls seal rows 9 and 11 over the food
    // region and cap the far end, so the only way in is through the stone.
    for col in 12..=16 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 16) as usize] = 196;
    board[offset(10, 13) as usize] = 10; // stone
    board[offset(10, 14) as usize] = 32; // empty behind it -> pushable
    board[offset(10, 15) as usize] = 3; // walled-off heart
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner_level(board, body, 28);
    let st = p.start_state();
    assert!(
        p.food_distance(&st, 2000) >= INF,
        "plain distance treats stones as walls and cannot reach the food"
    );
    let dig = p.dig_distance(&st, 2000);
    assert!(
        dig > 0 && dig < INF,
        "dig distance tunnels through the pushable stone: {dig}"
    );
    // goal_distance falls back to the dig heading in a stone maze.
    assert!(p.goal_distance(&st, 2000) < INF);
}

#[test]
fn survival_move_heads_toward_distant_food() {
    // On an open board the space-maximizing fallback should still drift
    // toward the only food instead of wandering away from it.
    let mut board = empty_board();
    board[offset(10, 40) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    assert_eq!(p.survival_move(), Some(77));
}

#[test]
fn finish_pressure_only_applies_when_few_items_remain_with_bonus() {
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(empty_board(), body);
    p.bonus = 9000;
    assert_eq!(p.finish_dist_penalty(), 0, "many items: no finish pressure");
    p.items = 2;
    assert!(
        p.finish_dist_penalty() > 0,
        "few items + bonus on the clock: finish pressure kicks in"
    );
    p.bonus = 0;
    assert_eq!(
        p.finish_dist_penalty(),
        0,
        "no bonus left: no finish pressure"
    );
}

#[test]
fn tail_chase_engages_only_for_long_snakes() {
    // A short snake leaves the long-game discipline out of the way.
    let short = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(empty_board(), short);
    assert_eq!(p.tail_chase_move(), None);

    // A long body (folded boustrophedon block) gets a real, legal move.
    let mut body = Vec::new();
    for r in 0..5 {
        let row = 5 + r;
        if r % 2 == 0 {
            for col in 5..=22 {
                body.push(offset(row, col));
            }
        } else {
            for col in (5..=22).rev() {
                body.push(offset(row, col));
            }
        }
    }
    assert!(body.len() >= 80);
    let mut p2 = planner(empty_board(), body);
    assert!(matches!(p2.tail_chase_move(), Some(72 | 80 | 75 | 77)));
}

#[test]
fn last_chance_returns_legal_move_instead_of_zero() {
    let board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    assert_eq!(p.last_chance_move(), Some(77));
}

#[test]
fn last_chance_returns_dead_corridor_when_it_is_the_only_move() {
    let mut board = empty_board();
    for col in 11..=14 {
        board[offset(9, col) as usize] = 196;
        board[offset(11, col) as usize] = 196;
    }
    board[offset(10, 15) as usize] = 196;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner(board, body);
    assert_eq!(p.last_chance_move(), Some(77));
}

#[test]
fn open_food_is_preferred_over_a_cornered_heart() {
    // Advice #6: with many items left, the open heart is taken before the one
    // tucked in a tight niche.
    let mut board = empty_board();
    board[offset(10, 14) as usize] = 3; // open heart to the right
                                        // A cornered heart up a one-wide niche (entry only from below).
    board[offset(7, 11) as usize] = 196;
    board[offset(8, 10) as usize] = 196;
    board[offset(8, 12) as usize] = 196;
    board[offset(8, 11) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner_level(board, body, 2);
    assert_eq!(p.decide(), 77, "take the open heart first, defer the niche");
}

#[test]
fn food_cluster_scores_multiple_future_pickups() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 13) as usize] = 3;
    board[offset(9, 13) as usize] = 5;
    board[offset(11, 13) as usize] = 3;
    let p = planner(board, body);
    let st = p.start_state();
    let cluster = p.food_cluster(&st, 12, 120, false);
    assert_eq!(cluster.foods, 3);
    assert!(cluster.score > 0);
    assert!(p.cluster_credit(cluster, RouteKind::Route, false) > 0);
}

#[test]
fn multi_pickup_rollout_rewards_second_food() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 12) as usize] = 3;
    board[offset(10, 14) as usize] = 5;
    let mut p = planner(board, body);
    let st = p.start_state();
    let first = p.move_state(&st, 77, false).unwrap();
    assert!(p.pickup_rollout(&first, 2, false, false) > 0);
}

#[test]
fn endgame_commits_to_the_last_heart() {
    // Advice #8: with only a few items left, decide() should still route to a
    // reachable heart and not stall.
    let mut board = empty_board();
    board[offset(10, 16) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = Planner::new(
        board,
        body,
        [0; ENEMY_LEN],
        Vec::new(),
        26,
        3, // few(): only 3 items remain
        0,
        false,
        1_000_000.0,
    );
    assert!(p.few());
    assert_eq!(
        p.decide(),
        77,
        "endgame should head toward the remaining heart"
    );
}

#[test]
fn walled_level_sweeps_toward_reachable_food() {
    // Advice #1: on a walled level decide() routes to a reachable heart.
    let mut board = empty_board();
    board[offset(10, 16) as usize] = 3;
    let body = vec![offset(10, 10), offset(10, 11)];
    let mut p = planner_level(board, body, 2); // line maze -> not open_board_level
    assert!(!p.open_board_level());
    assert_eq!(p.decide(), 77, "walled-level sweep heads toward the heart");
}

#[test]
fn decide_returns_arrow_scancode() {
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 13) as usize] = 3;
    let mut p = planner(board, body);
    assert!(matches!(p.decide(), 72 | 80 | 75 | 77));
}

#[test]
fn force_risk_keeps_the_wasm_engine_in_charge() {
    // forceRisk must still produce a real move from the engine (it no longer
    // falls back to the weaker JS planner when the bot is stuck).
    let mut board = empty_board();
    let body = vec![offset(10, 10), offset(10, 11)];
    board[offset(10, 13) as usize] = 3;
    let mut p = planner(board, body);
    p.force_risk = true;
    assert!(matches!(p.decide(), 72 | 80 | 75 | 77));
}

#[test]
fn cmp_desc_orders_high_scores_first() {
    let mut xs = [1, 9, 3];
    xs.sort_by(|a, b| cmp_i64_desc(*a, *b));
    assert_eq!(xs, [9, 3, 1]);
}
