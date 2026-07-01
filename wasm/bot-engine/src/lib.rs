mod ffi;
mod planner;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn now_ms() -> f64;
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    0.0
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn host_now_ms() -> f64 {
    unsafe { now_ms() }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn host_now_ms() -> f64 {
    now_ms()
}

pub(crate) const BOARD_LEN: usize = 4000;
pub(crate) const BODY_CAP: usize = 15001;
pub(crate) const ENEMY_LEN: usize = 81 * 4;
pub(crate) const TRAIL_CAP: usize = 128;
pub(crate) const DIRS: [(i32, i32); 4] = [(72, -160), (80, 160), (75, -2), (77, 2)];
// The arrow enemies are fully deterministic, so the danger masks carry an
// exact per-tick projection of their positions deep enough to time a lane
// crossing (28 ticks covers more than one full vertical wrap cycle).
pub(crate) const MAX_DANGER_TICKS: usize = 30;
pub(crate) const BIT_WORDS: usize = (BOARD_LEN + 63) / 64;
pub(crate) const INF: i32 = 1_000_000;
