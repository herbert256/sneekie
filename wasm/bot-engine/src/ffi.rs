use crate::planner::Planner;
use crate::{host_now_ms, BOARD_LEN, BODY_CAP, ENEMY_LEN, TRAIL_CAP};

static mut BOARD: [u16; BOARD_LEN] = [0; BOARD_LEN];
static mut BODY: [i32; BODY_CAP] = [0; BODY_CAP];
static mut ENEMY: [i32; ENEMY_LEN] = [0; ENEMY_LEN];
static mut TRAIL: [i32; TRAIL_CAP] = [0; TRAIL_CAP];
#[no_mangle]
pub extern "C" fn board_ptr() -> *mut u16 {
    core::ptr::addr_of_mut!(BOARD).cast::<u16>()
}

#[no_mangle]
pub extern "C" fn body_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(BODY).cast::<i32>()
}

#[no_mangle]
pub extern "C" fn enemy_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(ENEMY).cast::<i32>()
}

#[no_mangle]
pub extern "C" fn trail_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(TRAIL).cast::<i32>()
}

fn make_planner(
    level: i32,
    items: i32,
    body_len: i32,
    idle: i32,
    looping: i32,
    trail_len: i32,
    budget_ms: f64,
    force_risk: i32,
    bonus: i32,
) -> Planner {
    let body_len = body_len.clamp(2, BODY_CAP as i32) as usize;
    let trail_len = trail_len.clamp(0, TRAIL_CAP as i32) as usize;
    let mut board = [0u16; BOARD_LEN];
    let mut body = Vec::with_capacity(body_len);
    let mut enemy = [0i32; ENEMY_LEN];
    let mut trail = Vec::with_capacity(trail_len);

    unsafe {
        let board_src = core::ptr::addr_of!(BOARD).cast::<u16>();
        let body_src = core::ptr::addr_of!(BODY).cast::<i32>();
        let enemy_src = core::ptr::addr_of!(ENEMY).cast::<i32>();
        let trail_src = core::ptr::addr_of!(TRAIL).cast::<i32>();
        for (i, dest) in board.iter_mut().enumerate() {
            *dest = *board_src.add(i);
        }
        for i in 0..body_len {
            body.push(*body_src.add(i));
        }
        for (i, dest) in enemy.iter_mut().enumerate() {
            *dest = *enemy_src.add(i);
        }
        for i in 0..trail_len {
            trail.push(*trail_src.add(i));
        }
    }

    let urgent = idle >= 18 || looping != 0;
    let deadline = host_now_ms() + budget_ms.max(1.0);
    let mut planner = Planner::new(
        board, body, enemy, trail, level, items, idle, urgent, deadline,
    );
    planner.force_risk = force_risk != 0;
    planner.bonus = bonus.max(0);
    planner
}

#[no_mangle]
pub extern "C" fn decide(
    level: i32,
    items: i32,
    body_len: i32,
    idle: i32,
    looping: i32,
    trail_len: i32,
    budget_ms: f64,
    force_risk: i32,
    bonus: i32,
) -> i32 {
    make_planner(
        level, items, body_len, idle, looping, trail_len, budget_ms, force_risk, bonus,
    )
    .decide()
}

#[no_mangle]
pub extern "C" fn decide_mode(
    mode: i32,
    level: i32,
    items: i32,
    body_len: i32,
    idle: i32,
    looping: i32,
    trail_len: i32,
    budget_ms: f64,
    force_risk: i32,
    bonus: i32,
) -> i32 {
    make_planner(
        level, items, body_len, idle, looping, trail_len, budget_ms, force_risk, bonus,
    )
    .decide_mode_tagged(mode)
}
