use crate::config::{get, set};
use crate::window::{config_window, input_translate, ocr_translate};
use log::info;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub const TRAY_ID: &str = "pan-tray";

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

#[allow(clippy::too_many_lines)]
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

pub fn build_tray_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    language: &str,
    copy_mode: &str,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let labels = tray_labels(language);

    let input_translate = MenuItemBuilder::with_id("input_translate", labels.0).build(manager)?;
    let ocr_translate = MenuItemBuilder::with_id("ocr_translate", labels.1).build(manager)?;
    let copy_source = CheckMenuItemBuilder::with_id("copy_source", labels.3)
        .checked(copy_mode == "source")
        .build(manager)?;
    let copy_target = CheckMenuItemBuilder::with_id("copy_target", labels.4)
        .checked(copy_mode == "target")
        .build(manager)?;
    let copy_source_target = CheckMenuItemBuilder::with_id("copy_source_target", labels.5)
        .checked(copy_mode == "source_target")
        .build(manager)?;
    let copy_disable = CheckMenuItemBuilder::with_id("copy_disable", labels.6)
        .checked(copy_mode == "disable")
        .build(manager)?;

    let auto_copy = SubmenuBuilder::with_id(manager, "auto_copy", labels.2)
        .item(&copy_source)
        .item(&copy_target)
        .item(&copy_source_target)
        .separator()
        .item(&copy_disable)
        .build()?;

    let config = MenuItemBuilder::with_id("config", labels.7).build(manager)?;
    let quit = MenuItemBuilder::with_id("quit", labels.8).build(manager)?;

    MenuBuilder::new(manager)
        .item(&input_translate)
        .item(&ocr_translate)
        .item(&auto_copy)
        .separator()
        .item(&config)
        .separator()
        .item(&quit)
        .build()
}

#[tauri::command]
pub fn update_tray(app_handle: tauri::AppHandle, mut language: String, mut copy_mode: String) {
    if language.is_empty() {
        // In-memory fallback only: persisting a default here would defeat the
        // frontend's first-run system-locale detection of `app_language`.
        language = get("app_language")
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| "en".to_string());
    }
    if copy_mode.is_empty() {
        copy_mode = get("translate_auto_copy").map_or_else(
            || {
                set("translate_auto_copy", "disable");
                "disable".to_string()
            },
            |v| v.as_str().unwrap().to_string(),
        );
    }

    info!("Update tray with language: {language}, copy mode: {copy_mode}");

    if let Some(tray) = app_handle.tray_by_id(TRAY_ID) {
        let menu = build_tray_menu(&app_handle, &language, &copy_mode).unwrap();
        tray.set_menu(Some(menu)).unwrap();
        #[cfg(not(target_os = "linux"))]
        tray.set_tooltip(Some(format!("pan {}", app_handle.package_info().version)))
            .unwrap();
    }
}

pub fn init_tray(app: &tauri::App) -> tauri::Result<()> {
    let language =
        get("app_language").map_or_else(|| "en".to_string(), |v| v.as_str().unwrap().to_string());
    let copy_mode = get("translate_auto_copy").map_or_else(
        || "disable".to_string(),
        |v| v.as_str().unwrap().to_string(),
    );
    let menu = build_tray_menu(app.handle(), &language, &copy_mode)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().unwrap())
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "input_translate" => input_translate(),
            "copy_source" => on_auto_copy_click(app, "source"),
            "copy_target" => on_auto_copy_click(app, "target"),
            "copy_source_target" => on_auto_copy_click(app, "source_target"),
            "copy_disable" => on_auto_copy_click(app, "disable"),
            "ocr_translate" => ocr_translate(),
            "config" => config_window(),
            "quit" => on_quit_click(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                on_tray_click(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[allow(clippy::match_same_arms)]
fn on_tray_click(_app: &AppHandle) {
    let event = get("tray_click_event").map_or_else(
        || {
            set("tray_click_event", "config");
            "config".to_string()
        },
        |v| v.as_str().unwrap().to_string(),
    );
    match event.as_str() {
        "config" => config_window(),
        "translate" => input_translate(),
        "ocr_translate" => ocr_translate(),
        "disable" => {}
        _ => config_window(),
    }
}

fn on_auto_copy_click(app: &AppHandle, mode: &str) {
    info!("Set copy mode to: {mode}");
    set("translate_auto_copy", mode);
    let _ = app.emit("translate_auto_copy_changed", mode);
    update_tray(app.clone(), String::new(), mode.to_string());
}

fn on_quit_click(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
    info!("============== Quit App ==============");
    app.exit(0);
}
