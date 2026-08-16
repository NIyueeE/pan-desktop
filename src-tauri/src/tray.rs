use crate::config::{get, set};
use crate::window::{config_window, input_translate, ocr_translate};
use log::info;
use tauri::CustomMenuItem;
use tauri::GlobalShortcutManager;
use tauri::SystemTrayEvent;
use tauri::SystemTrayMenu;
use tauri::SystemTrayMenuItem;
use tauri::SystemTraySubmenu;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn update_tray(app_handle: tauri::AppHandle, mut language: String, mut copy_mode: String) {
    let tray_handle = app_handle.tray_handle();

    if language.is_empty() {
        language = match get("app_language") {
            Some(v) => v.as_str().unwrap().to_string(),
            None => {
                set("app_language", "en");
                "en".to_string()
            }
        };
    }
    if copy_mode.is_empty() {
        copy_mode = match get("translate_auto_copy") {
            Some(v) => v.as_str().unwrap().to_string(),
            None => {
                set("translate_auto_copy", "disable");
                "disable".to_string()
            }
        };
    }

    info!(
        "Update tray with language: {}, copy mode: {}",
        language, copy_mode
    );
    let (
        input_translate,
        ocr_translate,
        auto_copy,
        source,
        target,
        source_target,
        disable,
        config,
        quit,
    ) = tray_labels(&language);
    tray_handle
        .set_menu(
            SystemTrayMenu::new()
                .add_item(CustomMenuItem::new("input_translate", input_translate))
                .add_item(CustomMenuItem::new("ocr_translate", ocr_translate))
                .add_submenu(SystemTraySubmenu::new(
                    auto_copy,
                    SystemTrayMenu::new()
                        .add_item(CustomMenuItem::new("copy_source", source))
                        .add_item(CustomMenuItem::new("copy_target", target))
                        .add_item(CustomMenuItem::new("copy_source_target", source_target))
                        .add_native_item(SystemTrayMenuItem::Separator)
                        .add_item(CustomMenuItem::new("copy_disable", disable)),
                ))
                .add_native_item(SystemTrayMenuItem::Separator)
                .add_item(CustomMenuItem::new("config", config))
                .add_native_item(SystemTrayMenuItem::Separator)
                .add_item(CustomMenuItem::new("quit", quit)),
        )
        .unwrap();
    #[cfg(not(target_os = "linux"))]
    tray_handle
        .set_tooltip(&format!("pot {}", app_handle.package_info().version))
        .unwrap();

    match copy_mode.as_str() {
        "source" => tray_handle
            .get_item("copy_source")
            .set_selected(true)
            .unwrap(),
        "target" => tray_handle
            .get_item("copy_target")
            .set_selected(true)
            .unwrap(),
        "source_target" => tray_handle
            .get_item("copy_source_target")
            .set_selected(true)
            .unwrap(),
        "disable" => tray_handle
            .get_item("copy_disable")
            .set_selected(true)
            .unwrap(),
        _ => {}
    }
}

type TrayLabels = (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
);

fn tray_labels(language: &str) -> TrayLabels {
    match language {
        "zh_cn" => (
            "输入翻译",
            "截图翻译",
            "自动复制",
            "原文",
            "译文",
            "原文+译文",
            "关闭",
            "偏好设置",
            "退出",
        ),
        "zh_tw" => (
            "輸入翻譯",
            "截圖翻譯",
            "自動複製",
            "原文",
            "譯文",
            "原文+譯文",
            "關閉",
            "偏好設定",
            "退出",
        ),
        "ja" => (
            "入力翻訳",
            "OCR翻訳",
            "自動コピー",
            "原文",
            "訳文",
            "原文+訳文",
            "オフ",
            "設定",
            "終了",
        ),
        "ko" => (
            "입력 번역",
            "OCR 번역",
            "자동 복사",
            "원문",
            "번역문",
            "원문+번역문",
            "끄기",
            "설정",
            "종료",
        ),
        "fr" => (
            "Traduction saisie",
            "Traduction OCR",
            "Copie auto",
            "Source",
            "Cible",
            "Source+Cible",
            "Désactiver",
            "Paramètres",
            "Quitter",
        ),
        "de" => (
            "Eingabe übersetzen",
            "OCR übersetzen",
            "Automatisch kopieren",
            "Quelle",
            "Ziel",
            "Quelle+Ziel",
            "Deaktivieren",
            "Einstellungen",
            "Beenden",
        ),
        "ru" => (
            "Перевод ввода",
            "OCR-перевод",
            "Автокопирование",
            "Источник",
            "Перевод",
            "Источник+Перевод",
            "Отключить",
            "Настройки",
            "Выход",
        ),
        "pt_br" => (
            "Traduzir entrada",
            "Traduzir OCR",
            "Cópia automática",
            "Original",
            "Tradução",
            "Original+Tradução",
            "Desativar",
            "Configurações",
            "Sair",
        ),
        "fa" => (
            "ترجمه ورودی",
            "ترجمه OCR",
            "کپی خودکار",
            "متن اصلی",
            "ترجمه",
            "متن اصلی+ترجمه",
            "غیرفعال",
            "تنظیمات",
            "خروج",
        ),
        "uk" => (
            "Переклад вводу",
            "OCR-переклад",
            "Автокопіювання",
            "Оригінал",
            "Переклад",
            "Оригінал+Переклад",
            "Вимкнути",
            "Налаштування",
            "Вийти",
        ),
        _ => (
            "Input Translate",
            "OCR Translate",
            "Auto Copy",
            "Source",
            "Target",
            "Source+Target",
            "Disable",
            "Config",
            "Quit",
        ),
    }
}

pub fn tray_event_handler<'a>(app: &'a AppHandle, event: SystemTrayEvent) {
    match event {
        #[cfg(target_os = "windows")]
        SystemTrayEvent::LeftClick { .. } => on_tray_click(),
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "input_translate" => input_translate(),
            "copy_source" => on_auto_copy_click(app, "source"),
            "copy_target" => on_auto_copy_click(app, "target"),
            "copy_source_target" => on_auto_copy_click(app, "source_target"),
            "copy_disable" => on_auto_copy_click(app, "disable"),
            "ocr_translate" => ocr_translate(),
            "config" => config_window(),
            "quit" => on_quit_click(app),
            _ => {}
        },
        _ => {}
    }
}

#[cfg(target_os = "windows")]
fn on_tray_click() {
    let event = match get("tray_click_event") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => {
            set("tray_click_event", "config");
            "config".to_string()
        }
    };
    match event.as_str() {
        "config" => config_window(),
        "translate" => input_translate(),
        "ocr_translate" => ocr_translate(),
        "disable" => {}
        _ => config_window(),
    }
}

fn on_auto_copy_click(app: &AppHandle, mode: &str) {
    info!("Set copy mode to: {}", mode);
    set("translate_auto_copy", mode);
    app.emit_all("translate_auto_copy_changed", mode).unwrap();
    update_tray(app.app_handle(), "".to_string(), mode.to_string());
}

fn on_quit_click(app: &AppHandle) {
    app.global_shortcut_manager().unregister_all().unwrap();
    info!("============== Quit App ==============");
    app.exit(0);
}
