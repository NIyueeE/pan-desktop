// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cmd;
mod config;
mod error;
mod hotkey;
mod lang_detect;
mod screenshot;
mod system_ocr;
mod tray;
mod window;

use cmd::{
    copy_img, cut_image, font_list, get_base64, get_text, open_devtools, reload_store, set_proxy,
    unset_proxy,
};
use config::{get, init_config, is_first_run};
use hotkey::{register_shortcut, register_shortcut_by_frontend};
use lang_detect::lang_detect;
use log::info;
use once_cell::sync::OnceCell;
use screenshot::screenshot;
use std::sync::Mutex;
use system_ocr::system_ocr;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;
use tray::{init_tray, update_tray};

// Global AppHandle
pub static APP: OnceCell<tauri::AppHandle> = OnceCell::new();

// Text to be translated
pub struct StringWrapper(pub Mutex<String>);

#[allow(clippy::large_stack_frames)]
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, cwd| {
            let _ = app
                .notification()
                .builder()
                .title("The program is already running. Please do not start it again!")
                .body(cwd)
                .show();
        }))
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            info!("============== Start App ==============");
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let trusted =
                    macos_accessibility_client::accessibility::application_is_trusted_with_prompt();
                info!("MacOS Accessibility Trusted: {}", trusted);
            }
            // Global AppHandle
            APP.get_or_init(|| app.handle().clone());
            // Init Config
            info!("Init Config Store");
            init_config(app);
            // Check First Run
            if is_first_run() {
                // Open Config Window
                info!("First Run, opening config window");
                window::config_window();
            }
            app.manage(StringWrapper(Mutex::new(String::new())));
            // Init Tray
            init_tray(app)?;
            // Update Tray Menu
            update_tray(app.handle().clone(), String::new(), String::new());
            // Register Global Shortcut (仅保留划词翻译 / 输入翻译 / OCR 翻译)
            match register_shortcut("all") {
                Ok(()) => {}
                Err(e) => {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Failed to register global shortcut")
                        .body(e)
                        .show();
                }
            }
            if let Some(v) = get("proxy_enable")
                && v.as_bool().unwrap()
                && get("proxy_host").is_some_and(|host| !host.as_str().unwrap().is_empty())
            {
                let _ = set_proxy();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reload_store,
            get_text,
            cut_image,
            get_base64,
            copy_img,
            system_ocr,
            set_proxy,
            unset_proxy,
            open_devtools,
            register_shortcut_by_frontend,
            update_tray,
            screenshot,
            lang_detect,
            font_list
        ])
        .on_window_event(|window, event| {
            // Native-level focus tracing for the translate window: tao emits
            // Focused on WM_NCACTIVATE/WM_SETFOCUS/WM_KILLFOCUS, so these lines
            // show real Win32 activation changes and — compared with the
            // webview-side `Focus`/`Blur ignored` logs — whether a focus churn
            // originates natively or inside the webview.
            if window.label() == "translate"
                && let tauri::WindowEvent::Focused(focused) = event
            {
                info!("[native] translate window focused: {focused}");
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 窗口关闭不退出 (only intercept close-to-tray; explicit app.exit keeps working)
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
