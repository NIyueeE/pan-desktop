use crate::APP;
use crate::config::{get, set};
use crate::window::{input_translate, ocr_translate, selection_translate};
use log::{debug, info, warn};
use std::time::{Duration, Instant, SystemTime};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn stored_hotkey(name: &str) -> String {
    get(name).map_or_else(String::new, |v| {
        v.as_str()
            .map_or_else(String::new, std::string::ToString::to_string)
    })
}

fn register<F>(app_handle: &AppHandle, name: &str, handler: F, key: &str) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    let hotkey = if key.is_empty() {
        stored_hotkey(name)
    } else {
        key.to_string()
    };

    if !hotkey.is_empty() {
        let handler =
            move |_app: &AppHandle,
                  _shortcut: &tauri_plugin_global_shortcut::Shortcut,
                  event: tauri_plugin_global_shortcut::ShortcutEvent| {
                if event.state == ShortcutState::Pressed {
                    handler();
                }
            };
        match app_handle
            .global_shortcut()
            .on_shortcut(hotkey.as_str(), handler)
        {
            Ok(()) => {
                info!("Registered global shortcut: {hotkey} for {name}");
            }
            Err(e) => {
                warn!("Failed to register global shortcut: {hotkey} {e:?}");
                return Err(e.to_string());
            }
        }
    }
    Ok(())
}

// Register global shortcuts
pub fn register_shortcut(shortcut: &str) -> Result<(), String> {
    let app_handle = APP.get().unwrap();
    // Attempt every requested shortcut even when some fail, so one conflicting
    // key does not silently disable the others.
    let mut errors: Vec<String> = Vec::new();
    match shortcut {
        "hotkey_selection_translate" => {
            if let Err(e) = register(
                app_handle,
                "hotkey_selection_translate",
                selection_translate,
                "",
            ) {
                errors.push(e);
            }
        }
        "hotkey_input_translate" => {
            if let Err(e) = register(app_handle, "hotkey_input_translate", input_translate, "") {
                errors.push(e);
            }
        }
        "hotkey_ocr_translate" => {
            if let Err(e) = register(app_handle, "hotkey_ocr_translate", ocr_translate, "") {
                errors.push(e);
            }
        }
        "all" => {
            if let Err(e) = register(
                app_handle,
                "hotkey_selection_translate",
                selection_translate,
                "",
            ) {
                errors.push(e);
            }
            if let Err(e) = register(app_handle, "hotkey_input_translate", input_translate, "") {
                errors.push(e);
            }
            if let Err(e) = register(app_handle, "hotkey_ocr_translate", ocr_translate, "") {
                errors.push(e);
            }
        }
        _ => {}
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

// App-global shortcut names; the shortcuts themselves are registered through
// the global-shortcut plugin and are not window-scoped, so they survive
// webview creation/destruction.

const HOTKEY_NAMES: [&str; 3] = [
    "hotkey_selection_translate",
    "hotkey_input_translate",
    "hotkey_ocr_translate",
];

/// Re-register any configured shortcut that the plugin or the OS has
/// silently dropped.
///
/// Global shortcuts occasionally disappear without a trace (another app's
/// low-level keyboard hook, a plugin/OS quirk after a window is destroyed,
/// a partially failed re-register, a session change around sleep/wake). The
/// UI has no way to notice, which made hotkeys feel "sometimes dead". A
/// cheap periodic `is_registered` probe turns that into a self-healing
/// loop: registration hops to the main thread inside the plugin, so probing
/// from this background thread never blocks the event loop.
///
/// The probe interval is deliberately short (15s): the failure mode is
/// "hotkey dead until restart", so detection latency matters more than the
/// trivial cost of a `is_registered` check.
pub fn spawn_shortcut_health_check() {
    std::thread::spawn(|| {
        // Wall time vs monotonic time: the monotonic clock that drives
        // `sleep` is suspended while the machine sleeps, wall time is not.
        // Wall time running ahead of monotonic time therefore means the
        // machine just woke up — the moment session/desktop changes are
        // most likely to have dropped OS-level shortcut registrations.
        let mut wake_samples = (Instant::now(), SystemTime::now());
        loop {
            std::thread::sleep(Duration::from_secs(15));
            let Some(app_handle) = APP.get() else {
                continue;
            };
            let woke = wall_clock_ahead_of_monotonic(&mut wake_samples);
            for name in HOTKEY_NAMES {
                heal_shortcut(app_handle, name, woke);
            }
        }
    });
}

/// True when wall time advanced at least 2s beyond monotonic time since the
/// previous call (i.e. the machine slept in between), refreshing both
/// samples. The 2s grace absorbs NTP slewing so only real suspend gaps trip.
fn wall_clock_ahead_of_monotonic(samples: &mut (Instant, SystemTime)) -> bool {
    let instant_elapsed = samples.0.elapsed();
    let system_elapsed = samples.1.elapsed().unwrap_or_default();
    *samples = (Instant::now(), SystemTime::now());
    system_elapsed > instant_elapsed + Duration::from_secs(2)
}

/// Re-register one shortcut if needed.
///
/// `force` rebuilds the registration even when the plugin still believes it
/// is registered: the plugin's `is_registered` only consults its internal
/// registry and cannot see OS-level loss, so after a wake the key is torn
/// down and re-established unconditionally. If the OS no longer owns the
/// key, the unregister fails harmlessly and the register succeeds; if it
/// still owns it, this is a millisecond-scale unregister/register cycle.
fn heal_shortcut(app_handle: &AppHandle, name: &str, force: bool) {
    let hotkey = stored_hotkey(name);
    if hotkey.is_empty() {
        // Never bound (or intentionally cleared): nothing to heal.
        return;
    }
    if !force && app_handle.global_shortcut().is_registered(hotkey.as_str()) {
        return;
    }
    if force {
        info!("Wake detected, refreshing global shortcut: {hotkey} for {name}");
        let unregistered = app_handle.global_shortcut().unregister(hotkey.as_str());
        if let Err(e) = unregistered {
            // Expected when the OS already dropped the key.
            debug!("Global shortcut unregister during refresh: {e:?}");
        }
    } else {
        warn!("Global shortcut lost, re-registering: {hotkey} for {name}");
    }
    if let Err(e) = register_shortcut(name) {
        warn!("Failed to re-register global shortcut {hotkey}: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::wall_clock_ahead_of_monotonic;
    use std::time::{Duration, Instant, SystemTime};

    #[test]
    fn no_wake_when_clocks_track() {
        let mut samples = (Instant::now(), SystemTime::now());
        std::thread::sleep(Duration::from_millis(20));
        assert!(!wall_clock_ahead_of_monotonic(&mut samples));
    }

    #[test]
    fn wake_detected_when_wall_clock_jumps() {
        // Simulate sleep: push the wall-clock sample back so wall time
        // appears to have run far ahead of the monotonic clock.
        let mut samples = (Instant::now(), SystemTime::now() - Duration::from_secs(60));
        assert!(wall_clock_ahead_of_monotonic(&mut samples));
    }

    #[test]
    fn small_clock_slew_ignored() {
        let mut samples = (
            Instant::now(),
            SystemTime::now() - Duration::from_millis(1500),
        );
        assert!(!wall_clock_ahead_of_monotonic(&mut samples));
    }
}

#[tauri::command]
pub fn register_shortcut_by_frontend(name: &str, shortcut: &str) -> Result<(), String> {
    let app_handle = APP.get().unwrap();
    let global_shortcut = app_handle.global_shortcut();

    let old = stored_hotkey(name);
    if shortcut.is_empty() {
        // Clearing the binding: drop the registered shortcut and persist.
        if !old.is_empty()
            && let Err(e) = global_shortcut.unregister(old.as_str())
        {
            warn!("Failed to unregister global shortcut: {old} {e:?}");
        }
        set(name, "");
        info!("Cleared global shortcut for {name}");
        return Ok(());
    }

    // Already bound to exactly this key (e.g. registered at startup): nothing
    // left to do, and re-registering would fail with AlreadyRegistered.
    if old == shortcut && global_shortcut.is_registered(shortcut) {
        return Ok(());
    }

    // Register the new binding first; if it fails the previous one stays
    // intact so the hotkey is never silently lost.
    match name {
        "hotkey_selection_translate" => register(
            app_handle,
            "hotkey_selection_translate",
            selection_translate,
            shortcut,
        )?,
        "hotkey_input_translate" => register(
            app_handle,
            "hotkey_input_translate",
            input_translate,
            shortcut,
        )?,
        "hotkey_ocr_translate" => {
            register(app_handle, "hotkey_ocr_translate", ocr_translate, shortcut)?;
        }
        _ => return Err(format!("Unknown shortcut name: {name}")),
    }

    // Swap succeeded: release the previous binding for this action.
    if !old.is_empty()
        && let Err(e) = global_shortcut.unregister(old.as_str())
    {
        warn!("Failed to unregister old global shortcut: {old} {e:?}");
    }
    set(name, shortcut);
    Ok(())
}
