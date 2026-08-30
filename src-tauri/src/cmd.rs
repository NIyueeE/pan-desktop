use crate::APP;
use crate::StringWrapper;
use crate::config::{StoreWrapper, get};
use crate::error::Error;
use log::{error, info, warn};
use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

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
pub fn reload_store() {
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
        let _ = app_handle.global_shortcut().unregister_all();
        if let Err(e) = crate::hotkey::register_shortcut("all") {
            warn!("Failed to re-register global shortcuts after config reload: {e}");
        }
    }
    if tray_changed {
        crate::tray::update_tray(app_handle.clone(), String::new(), String::new());
    }
}

#[tauri::command]
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

#[tauri::command]
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
pub fn copy_img(app_handle: tauri::AppHandle, width: usize, height: usize) -> Result<(), Error> {
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
pub fn set_proxy() -> bool {
    let host = match get("proxy_host") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => return false,
    };
    let port = match get("proxy_port") {
        Some(v) => v.as_i64().unwrap(),
        None => return false,
    };
    let no_proxy = match get("no_proxy") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => return false,
    };
    let proxy = format!("http://{host}:{port}");

    // SAFETY: executed once at startup / from the config page before spawning workers.
    unsafe {
        std::env::set_var("http_proxy", &proxy);
        std::env::set_var("https_proxy", &proxy);
        std::env::set_var("all_proxy", &proxy);
        std::env::set_var("no_proxy", &no_proxy);
    }
    true
}

#[tauri::command]
pub fn unset_proxy() -> bool {
    // SAFETY: executed from the config page before spawning workers.
    unsafe {
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");
        std::env::remove_var("all_proxy");
        std::env::remove_var("no_proxy");
    }
    true
}

#[tauri::command]
pub fn font_list() -> Result<Vec<String>, Error> {
    use font_kit::source::SystemSource;
    let source = SystemSource::new();

    Ok(source.all_families()?)
}

#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}
