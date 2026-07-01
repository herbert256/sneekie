use crate::planner::{Planner, W_LEN};
use crate::{host_now_ms, BOARD_LEN, BODY_CAP, ENEMY_LEN, TRAIL_CAP};

static mut BOARD: [u16; BOARD_LEN] = [0; BOARD_LEN];
static mut BODY: [i32; BODY_CAP] = [0; BODY_CAP];
static mut ENEMY: [i32; ENEMY_LEN] = [0; ENEMY_LEN];
static mut TRAIL: [i32; TRAIL_CAP] = [0; TRAIL_CAP];
// Optional scoring-weight override, used by the offline tuner. Slot 0 is the
// enable flag; slots 1..=W_LEN carry the weight vector (f64 for JS comfort,
// rounded to i64 on copy). When slot 0 stays zero the compiled-in defaults
// apply, so the live page never needs to touch this buffer.
static mut WEIGHTS: [f64; W_LEN + 1] = [0.0; W_LEN + 1];
// The committed route of the last decision: slot 0 is the length, slots 1..
// the move scancodes (the returned move is the first entry). Length 0 means
// the decision came from a fallback/guard and must not be replayed.
const ROUTE_CAP: usize = 160;
static mut ROUTE: [i32; ROUTE_CAP + 1] = [0; ROUTE_CAP + 1];
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

#[no_mangle]
pub extern "C" fn weights_ptr() -> *mut f64 {
    core::ptr::addr_of_mut!(WEIGHTS).cast::<f64>()
}

#[no_mangle]
pub extern "C" fn weights_len() -> i32 {
    W_LEN as i32
}

#[no_mangle]
pub extern "C" fn route_ptr() -> *mut i32 {
    core::ptr::addr_of_mut!(ROUTE).cast::<i32>()
}

fn publish_route(planner: &Planner, packed: i32) {
    let sc = packed & 0xff;
    let route = &planner.last_route;
    let ok = !route.is_empty() && route[0] == sc;
    let len = if ok { route.len().min(ROUTE_CAP) } else { 0 };
    unsafe {
        let out = core::ptr::addr_of_mut!(ROUTE).cast::<i32>();
        *out = len as i32;
        for (i, mv) in route.iter().take(len).enumerate() {
            *out.add(i + 1) = *mv;
        }
    }
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
    unsafe {
        let w = core::ptr::addr_of!(WEIGHTS).cast::<f64>();
        if *w != 0.0 {
            for (i, dest) in planner.weights.iter_mut().enumerate() {
                *dest = (*w.add(i + 1)).round() as i64;
            }
        }
    }
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
    let mut planner = make_planner(
        level, items, body_len, idle, looping, trail_len, budget_ms, force_risk, bonus,
    );
    let packed = planner.decide();
    publish_route(&planner, packed);
    packed
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
    let mut planner = make_planner(
        level, items, body_len, idle, looping, trail_len, budget_ms, force_risk, bonus,
    );
    let packed = planner.decide_mode_tagged(mode);
    publish_route(&planner, packed);
    packed
}
