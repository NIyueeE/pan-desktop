use crate::{error::Error, APP};
use dirs::config_dir;
use log::{info, warn};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Manager, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

pub struct StoreWrapper(pub Mutex<Store<Wry>>);

pub fn init_config(app: &mut tauri::App) {
    let config_path = config_dir().unwrap();
    let config_path = config_path.join(app.config().tauri.bundle.identifier.clone());
    let config_path = config_path.join("config.json");
    info!("Load config from: {:?}", config_path);
    let mut store = StoreBuilder::new(app.handle(), config_path).build();

    match store.load() {
        Ok(_) => info!("Config loaded"),
        Err(e) => {
            warn!("Config load error: {:?}", e);
            info!("Config not found, creating new config");
        }
    }
    app.manage(StoreWrapper(Mutex::new(store)));
    let _ = check_service_available();
}

fn sanitize_service_list(key: &str, builtin: &[&str], default: &[&str]) {
    if let Some(value) = get(key) {
        let Ok(list) = serde_json::from_value::<Vec<String>>(value) else {
            return;
        };
        let mut new_list: Vec<String> = list
            .into_iter()
            .filter(|service| {
                let name = service.split('@').next().unwrap_or_default();
                builtin.contains(&name)
            })
            .collect();
        if new_list.is_empty() {
            new_list = default.iter().map(|s| s.to_string()).collect();
        }
        set(key, new_list);
    }
}

pub fn check_service_available() -> Result<(), Error> {
    // 翻译服务仅保留自定义 openai_chat_completions 服务
    sanitize_service_list("translate_service_list", &["openai"], &["openai"]);
    // OCR 翻译仅保留本地识别服务
    sanitize_service_list(
        "recognize_service_list",
        &["system", "tesseract"],
        &["system", "tesseract"],
    );
    Ok(())
}

pub fn get(key: &str) -> Option<Value> {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    match store.get(key) {
        Some(value) => Some(value.clone()),
        None => None,
    }
}

pub fn set<T: serde::ser::Serialize>(key: &str, value: T) {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let mut store = state.0.lock().unwrap();
    store.insert(key.to_string(), json!(value)).unwrap();
    store.save().unwrap();
}

pub fn is_first_run() -> bool {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    store.is_empty()
}
