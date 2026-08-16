use crate::APP;
use crate::config::{get, set};
use crate::window::{input_translate, ocr_translate, selection_translate};
use log::{info, warn};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn register<F>(app_handle: &AppHandle, name: &str, handler: F, key: &str) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    let hotkey = if key.is_empty() {
        get(name).map_or_else(
            || {
                set(name, "");
                String::new()
            },
            |v| v.as_str().unwrap().to_string(),
        )
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
    match shortcut {
        "hotkey_selection_translate" => register(
            app_handle,
            "hotkey_selection_translate",
            selection_translate,
            "",
        )?,
        "hotkey_input_translate" => {
            register(app_handle, "hotkey_input_translate", input_translate, "")?;
        }
        "hotkey_ocr_translate" => register(app_handle, "hotkey_ocr_translate", ocr_translate, "")?,
        "all" => {
            register(
                app_handle,
                "hotkey_selection_translate",
                selection_translate,
                "",
            )?;
            register(app_handle, "hotkey_input_translate", input_translate, "")?;
            register(app_handle, "hotkey_ocr_translate", ocr_translate, "")?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub fn register_shortcut_by_frontend(name: &str, shortcut: &str) -> Result<(), String> {
    let app_handle = APP.get().unwrap();
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
        _ => {}
    }
    Ok(())
}
