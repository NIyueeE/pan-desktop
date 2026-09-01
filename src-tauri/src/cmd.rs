use crate::APP;
use crate::StringWrapper;
use crate::config::StoreWrapper;
use crate::error::Error;
use log::{error, info, warn};
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn get_text(state: tauri::State<StringWrapper>) -> String {
    return state.0.lock().unwrap().to_string();
}

// Keys that require re-applying global state (hotkeys / tray) when they
// change on disk. `reload_store` is triggered by the config watcher on every
// save, so the re-apply must stay cheap unless one of these really changed.
const HOTKEY_KEYS: [&str; 3] = [
    "hotkey_selection_translate",
    "hotkey_input_translate",
    "hotkey_ocr_translate",
];
const TRAY_KEYS: [&str; 2] = ["app_language", "translate_auto_copy"];

fn snapshot_keys(keys: &[&str]) -> Vec<Option<serde_json::Value>> {
    keys.iter().map(|key| crate::config::get(key)).collect()
}

#[tauri::command]
pub async fn reload_store() {
    // The config watcher triggers this on every save: the store reload and
    // the sanitize rewrite are disk IO that must not run on the main thread,
    // where it would starve the event loop and with it the global hotkeys
    // (AGENTS.md §8). Shortcut re-registration and tray rebuild dispatch to
    // the main thread internally (plugin `run_main_thread!`, tray builder),
    // so calling them from the blocking pool only parks this worker.
    if let Err(e) = tauri::async_runtime::spawn_blocking(reload_store_blocking).await {
        error!("reload_store background task failed: {e:?}");
    }
}

fn reload_store_blocking() {
    let hotkeys_before = snapshot_keys(&HOTKEY_KEYS);
    let tray_before = snapshot_keys(&TRAY_KEYS);
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    if let Err(e) = store.reload() {
        error!("Failed to reload config store: {e:?}");
        return;
    }
    drop(store);
    // The config may have been replaced externally (e.g. WebDAV restore);
    // re-run the builtin-service sanitising so removed services cannot break
    // the UI.
    crate::config::check_service_available();
    let hotkeys_changed = hotkeys_before != snapshot_keys(&HOTKEY_KEYS);
    let tray_changed = tray_before != snapshot_keys(&TRAY_KEYS);
    if !hotkeys_changed && !tray_changed {
        return;
    }
    // Make restored settings effective without a restart: rebuild the tray
    // menu and re-register the global shortcuts from the new config.
    let app_handle = APP.get().unwrap();
    if hotkeys_changed {
        reapply_changed_shortcuts(app_handle, &hotkeys_before);
    }
    if tray_changed {
        crate::tray::update_tray(app_handle.clone(), String::new(), String::new());
    }
}

/// Re-apply only the actions whose binding actually changed.
///
/// The previous `unregister_all` + re-register-on-anything tore down every
/// working shortcut on unrelated config writes and left them silently dead
/// whenever the re-register failed (binding emptied by a restore, system
/// conflict, ...). Per-action handling keeps untouched bindings live and
/// surfaces failures to the user instead of a lone warn line.
fn reapply_changed_shortcuts(app_handle: &tauri::AppHandle, before: &[Option<serde_json::Value>]) {
    let global_shortcut = app_handle.global_shortcut();
    let mut failures: Vec<String> = Vec::new();
    for (name, old) in HOTKEY_KEYS.iter().zip(before) {
        let new = crate::config::get(name);
        let old_key = stored_binding(old.as_ref());
        let new_key = stored_binding(new.as_ref());
        if old_key == new_key {
            continue;
        }
        if new_key.is_empty() {
            // Binding cleared: drop the previous registration.
            if !old_key.is_empty()
                && let Err(e) = global_shortcut.unregister(old_key.as_str())
            {
                warn!("Failed to unregister cleared global shortcut {old_key}: {e:?}");
            }
            continue;
        }
        // Register the new binding first (the previous one stays intact on
        // failure), then release the replaced one.
        if let Err(e) = crate::hotkey::register_shortcut(name) {
            error!("Failed to re-apply global shortcut after config reload: {e}");
            failures.push(format!("{name}: {e}"));
            continue;
        }
        if !old_key.is_empty()
            && old_key != new_key
            && let Err(e) = global_shortcut.unregister(old_key.as_str())
        {
            warn!("Failed to unregister replaced global shortcut {old_key}: {e:?}");
        }
    }
    if !failures.is_empty() {
        let body = failures.join("\n");
        let _ = app_handle
            .notification()
            .builder()
            .title("Failed to update global shortcuts")
            .body(body)
            .show();
    }
}

fn stored_binding(value: Option<&serde_json::Value>) -> String {
    value
        .and_then(serde_json::Value::as_str)
        .map_or_else(String::new, ToString::to_string)
}

#[tauri::command(async)]
pub fn cut_image(left: u32, top: u32, width: u32, height: u32, app_handle: tauri::AppHandle) {
    use dirs::cache_dir;
    use image::GenericImage;
    info!("Cut image: {width}x{height}+{left}+{top}");
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot.png");
    if !app_cache_dir_path.exists() {
        return;
    }
    let mut img = match image::open(&app_cache_dir_path) {
        Ok(v) => v,
        Err(e) => {
            error!("{:?}", e.to_string());
            return;
        }
    };
    let img2 = {
        // Clamp the crop rect to the image bounds; sub_image panics otherwise.
        let left = left.min(img.width().saturating_sub(1));
        let top = top.min(img.height().saturating_sub(1));
        let width = width.min(img.width() - left);
        let height = height.min(img.height() - top);
        if width == 0 || height == 0 {
            error!("Cut image: empty crop rect");
            return;
        }
        img.sub_image(left, top, width, height)
    };
    app_cache_dir_path.pop();
    app_cache_dir_path.push("pan_screenshot_cut.png");
    match img2.to_image().save(&app_cache_dir_path) {
        Ok(()) => {}
        Err(e) => {
            error!("{:?}", e.to_string());
        }
    }
}

#[tauri::command(async)]
pub fn get_base64(app_handle: tauri::AppHandle) -> String {
    use base64::{Engine as _, engine::general_purpose};
    use dirs::cache_dir;
    use std::fs::File;
    use std::io::Read;
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot_cut.png");
    if !app_cache_dir_path.exists() {
        return String::new();
    }
    let mut file = File::open(app_cache_dir_path).unwrap();
    let mut vec = Vec::new();
    match file.read_to_end(&mut vec) {
        Ok(_) => {}
        Err(e) => {
            error!("{:?}", e.to_string());
            return String::new();
        }
    }
    let base64 = general_purpose::STANDARD.encode(&vec);
    base64.replace("\r\n", "")
}

#[tauri::command]
pub async fn copy_img(
    app_handle: tauri::AppHandle,
    width: usize,
    height: usize,
) -> Result<(), Error> {
    // Image decode + clipboard write are slow enough to starve hotkeys when
    // run on the main thread; the Win32 clipboard APIs arboard uses are
    // thread-agnostic, so run them on the blocking pool.
    tauri::async_runtime::spawn_blocking(move || copy_img_inner(&app_handle, width, height))
        .await
        .map_err(Error::from)?
        .map_err(|e| Error::Other(e))
}

fn copy_img_inner(
    app_handle: &tauri::AppHandle,
    width: usize,
    height: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use arboard::{Clipboard, ImageData};
    use dirs::cache_dir;
    use image::ImageReader;
    use std::borrow::Cow;

    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().identifier);
    app_cache_dir_path.push("pan_screenshot_cut.png");
    let data = ImageReader::open(app_cache_dir_path)?.decode()?;

    let img = ImageData {
        width,
        height,
        bytes: Cow::from(data.as_bytes()),
    };
    Clipboard::new()?.set_image(img)?;
    Ok(())
}

#[tauri::command]
pub async fn font_list() -> Result<Vec<String>, Error> {
    // Font family enumeration walks every installed font and can take
    // hundreds of milliseconds: keep it off the main thread (AGENTS.md §8).
    tauri::async_runtime::spawn_blocking(|| {
        use font_kit::source::SystemSource;
        SystemSource::new().all_families()
    })
    .await
    .map_err(Error::from)?
    .map_err(Error::from)
}

#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}
