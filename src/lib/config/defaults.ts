/**
 * Single source of truth for every config key the frontend reads or writes.
 *
 * The value types here are also the persisted shapes in `config.json`.
 * Keys listed in BACKEND_READ_KEYS are read directly by the Rust side
 * (src-tauri/src/{hotkey,tray,cmd,config,window}.rs) — their names and value
 * shapes must never change.
 */

export const TRANSLATE_LAYOUTS = ['full', 'hide_language', 'hide_source', 'compact'] as const;
export type TranslateLayout = (typeof TRANSLATE_LAYOUTS)[number];

export const APP_THEMES = ['system', 'light', 'dark'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const AUTO_COPY_MODES = ['disable', 'source', 'target', 'source_target'] as const;
export type AutoCopyMode = (typeof AUTO_COPY_MODES)[number];

export const WINDOW_POSITIONS = ['mouse', 'pre_state'] as const;
export type WindowPosition = (typeof WINDOW_POSITIONS)[number];

export const TRAY_CLICK_EVENTS = ['config', 'translate', 'ocr_translate', 'disable'] as const;
export type TrayClickEvent = (typeof TRAY_CLICK_EVENTS)[number];

export interface ConfigSchema {
    // ── General ──────────────────────────────────────────────────────────
    app_language: string;
    app_theme: AppTheme;
    app_font: string;
    app_font_size: number;
    transparent: boolean;
    tray_click_event: TrayClickEvent;
    // ── Hotkeys (registered by the backend, written via command) ────────
    hotkey_selection_translate: string;
    hotkey_input_translate: string;
    hotkey_ocr_translate: string;
    // ── Translate window ─────────────────────────────────────────────────
    translate_source_language: string;
    translate_target_language: string;
    translate_second_language: string;
    translate_auto_copy: AutoCopyMode;
    incremental_translate: boolean;
    dynamic_translate: boolean;
    translate_delete_newline: boolean;
    translate_remember_language: boolean;
    /** Replaces the legacy `hide_source`/`hide_language` switch pair. */
    translate_layout: TranslateLayout;
    translate_window_position: WindowPosition;
    translate_remember_window_size: boolean;
    translate_window_width: number;
    translate_window_height: number;
    translate_window_position_x: number;
    translate_window_position_y: number;
    translate_hide_window: boolean;
    translate_close_on_blur: boolean;
    translate_always_on_top: boolean;
    // ── Recognize ────────────────────────────────────────────────────────
    recognize_language: string;
    recognize_delete_newline: boolean;
    // ── Service instance lists (values sanitized on both sides) ─────────
    translate_service_list: string[];
    recognize_service_list: string[];
    // ── WebDAV sync ──────────────────────────────────────────────────────
    webdav_url: string;
    webdav_username: string;
    webdav_password: string;
    webdav_filename: string;
    webdav_auto_sync: boolean;
    webdav_last_sync: number;
}

export const defaults: ConfigSchema = {
    app_language: 'en',
    app_theme: 'system',
    app_font: 'default',
    app_font_size: 16,
    transparent: true,
    tray_click_event: 'config',
    hotkey_selection_translate: '',
    hotkey_input_translate: '',
    hotkey_ocr_translate: '',
    translate_source_language: 'auto',
    translate_target_language: 'zh_cn',
    translate_second_language: 'en',
    translate_auto_copy: 'disable',
    incremental_translate: false,
    dynamic_translate: false,
    translate_delete_newline: false,
    translate_remember_language: false,
    translate_layout: 'full',
    translate_window_position: 'mouse',
    translate_remember_window_size: false,
    translate_window_width: 350,
    translate_window_height: 420,
    translate_window_position_x: 0,
    translate_window_position_y: 0,
    translate_hide_window: false,
    translate_close_on_blur: true,
    translate_always_on_top: false,
    recognize_language: 'auto',
    recognize_delete_newline: false,
    translate_service_list: ['openai'],
    recognize_service_list: ['system', 'tesseract'],
    webdav_url: '',
    webdav_username: '',
    webdav_password: '',
    webdav_filename: 'pan-config.json',
    webdav_auto_sync: false,
    webdav_last_sync: 0,
};

export type ConfigKey = keyof ConfigSchema;
export type ConfigValue<K extends ConfigKey> = ConfigSchema[K];

/** Keys the Rust side reads directly — must be preserved verbatim. */
export const BACKEND_READ_KEYS = [
    'hotkey_selection_translate',
    'hotkey_input_translate',
    'hotkey_ocr_translate',
    'app_language',
    'translate_auto_copy',
    'tray_click_event',
    'translate_service_list',
    'recognize_service_list',
    'translate_window_position',
    'translate_window_width',
    'translate_window_height',
    'translate_window_position_x',
    'translate_window_position_y',
    'webdav_auto_sync',
    'webdav_url',
    'webdav_username',
    'webdav_password',
    'webdav_filename',
    'webdav_last_sync',
] as const satisfies readonly ConfigKey[];

/**
 * Legacy (pre-Svelte-rewrite) keys that were merged into new options.
 * `translate_layout` replaces the `hide_source` + `hide_language` pair.
 */
export const LEGACY_LAYOUT_SOURCE_KEY = 'hide_source';
export const LEGACY_LAYOUT_LANGUAGE_KEY = 'hide_language';
