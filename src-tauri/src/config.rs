use crate::APP;
use dirs::config_dir;
use log::info;
use serde_json::{Value, json};
use std::sync::Mutex;
use tauri::{Manager, Wry};
use tauri_plugin_store::{Store, StoreBuilder};

pub struct StoreWrapper(pub Mutex<std::sync::Arc<Store<Wry>>>);

pub fn init_config(app: &tauri::App) {
    let config_path = config_dir().unwrap();
    let config_path = config_path.join(app.config().identifier.clone());
    let config_path = config_path.join("config.json");
    info!("Load config from: {}", config_path.display());
    let store = StoreBuilder::new(app.handle(), config_path)
        .build()
        .unwrap();
    app.manage(StoreWrapper(Mutex::new(store)));
    check_service_available();
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
            new_list = default
                .iter()
                .map(std::string::ToString::to_string)
                .collect();
        }
        set(key, new_list);
    }
}

pub fn check_service_available() {
    // 翻译服务仅保留自定义 openai_chat_completions 服务
    sanitize_service_list("translate_service_list", &["openai"], &["openai"]);
    // OCR 翻译仅保留本地识别服务
    sanitize_service_list(
        "recognize_service_list",
        &["system", "tesseract"],
        &["system", "tesseract"],
    );
}

pub fn get(key: &str) -> Option<Value> {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    store.get(key)
}

pub fn set<T: serde::ser::Serialize>(key: &str, value: T) {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    store.set(key.to_string(), json!(value));
    store.save().unwrap();
}

pub fn is_first_run() -> bool {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    store.is_empty()
}
