use crate::APP;
use crate::config::{get, set};
use crate::window::{input_translate, ocr_translate, selection_translate};
use log::{info, warn};
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
