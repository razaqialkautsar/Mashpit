//! Error helper. Panics use the format `"Mashpit: <Code>: <detail>"` (SMART_CONTRACT_SPEC §6).

use near_sdk::env;

/// Abort the call with a coded error message.
pub fn fail(code: &str, detail: &str) -> ! {
    env::panic_str(&format!("Mashpit: {code}: {detail}"))
}

/// `require!` with a coded error message.
pub fn ensure(cond: bool, code: &str, detail: &str) {
    if !cond {
        fail(code, detail);
    }
}
