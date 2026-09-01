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

/// Pure core of the service-list sanitising, unit-testable without a store.
///
/// Returns the cleaned list: unknown services dropped, duplicates removed,
/// non-array / empty values replaced by `default`. `None` means "nothing
/// stored" and must be left untouched (frontend applies its own default).
pub fn sanitized_service_value(
    value: Option<Value>,
    builtin: &[&str],
    default: &[&str],
) -> Option<Vec<String>> {
    let value = value?;
    // A non-array value (corrupted config or bad backup) must not survive —
    // the frontend renders `.map` over it and would crash.
    let Ok(list) = serde_json::from_value::<Vec<String>>(value) else {
        return Some(
            default
                .iter()
                .map(std::string::ToString::to_string)
                .collect(),
        );
    };
    let mut new_list: Vec<String> = list
        .into_iter()
        .filter(|service| {
            let name = service.split('@').next().unwrap_or_default();
            builtin.contains(&name)
        })
        .collect();
    // De-duplicate while keeping order.
    new_list.dedup();
    if new_list.is_empty() {
        new_list = default
            .iter()
            .map(std::string::ToString::to_string)
            .collect();
    }
    Some(new_list)
}

fn sanitize_service_list(key: &str, builtin: &[&str], default: &[&str]) {
    let Some(new_list) = sanitized_service_value(get(key), builtin, default) else {
        return;
    };
    if get(key).is_some_and(|current| current == serde_json::json!(new_list)) {
        return;
    }
    set(key, new_list);
}

pub fn check_service_available() {
    // 翻译服务仅保留自定义 openai_chat_completions 服务
    sanitize_service_list("translate_service_list", &["openai"], &["openai"]);
    // OCR：本地 PaddleOCR（PP-OCRv5，替代 tesseract）/ 系统 OCR，外加可选的
    // OpenAI 兼容 VLM 视觉识别端点。默认 Paddle 优先，失败自动降级系统 OCR。
    sanitize_service_list(
        "recognize_service_list",
        &["system", "paddle", "openai"],
        &["paddle", "system"],
    );
    // 词典：内置 Free Dictionary API（零配置）
    sanitize_service_list(
        "dictionary_service_list",
        &["free_dictionary"],
        &["free_dictionary"],
    );
    // TTS：系统语音 + OpenAI 兼容 /v1/audio/speech
    sanitize_service_list("tts_service_list", &["system", "openai"], &["system"]);
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
    if let Err(e) = store.save() {
        // In-memory state is still updated; a failed disk write (permissions,
        // disk full) must not take the caller (often a command / hotkey
        // handler on the main thread) down.
        log::error!("Failed to save config store: {e:?}");
    }
}

pub fn is_first_run() -> bool {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let store = state.0.lock().unwrap();
    store.is_empty()
}

#[cfg(test)]
mod tests {
    use super::sanitized_service_value;
    use serde_json::{Value, json};

    fn clean(value: Value) -> Vec<String> {
        sanitized_service_value(Some(value), &["openai"], &["openai"]).unwrap()
    }

    #[test]
    fn keeps_builtin_instances() {
        assert_eq!(
            clean(json!(["openai@abc", "openai"])),
            vec!["openai@abc", "openai"]
        );
    }

    #[test]
    fn drops_removed_services() {
        // e.g. restored from a backup created with full pot-desktop
        assert_eq!(
            clean(json!(["openai@1", "deepl@2", "bing@3"])),
            vec!["openai@1"]
        );
    }

    #[test]
    fn replaces_corrupted_value_with_default() {
        assert_eq!(clean(json!("not-an-array")), vec!["openai"]);
        assert_eq!(clean(json!({"oops": 1})), vec!["openai"]);
    }

    #[test]
    fn replaces_empty_and_dedupes() {
        assert_eq!(clean(json!([])), vec!["openai"]);
        assert_eq!(
            clean(json!(["openai", "openai", "openai@x"])),
            vec!["openai", "openai@x"]
        );
    }

    #[test]
    fn missing_key_signals_untouched() {
        assert_eq!(
            sanitized_service_value(None, &["openai"], &["openai"]),
            None
        );
    }
}
