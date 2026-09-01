/**
 * Single source of truth for every config key the frontend reads or writes.
 *
 * The value types here are also the persisted shapes in `config.json`.
 * Several keys are read directly by the Rust side
 * (src-tauri/src/{hotkey,tray,cmd,config,window}.rs — hotkey bindings, tray
 * language, window geometry, …) — their names and value shapes must never
 * change.
 */

export const TRANSLATE_LAYOUTS = ['full', 'hide_language', 'hide_source', 'compact'] as const;
export type TranslateLayout = (typeof TRANSLATE_LAYOUTS)[number];

export type AppTheme = 'system' | 'light' | 'dark';

export const AUTO_COPY_MODES = ['disable', 'source', 'target', 'source_target'] as const;
export type AutoCopyMode = (typeof AUTO_COPY_MODES)[number];

type WindowPosition = 'mouse' | 'pre_state';

type TrayClickEvent = 'config' | 'translate' | 'ocr_translate' | 'disable';

export interface ConfigSchema {
    // ── General ──────────────────────────────────────────────────────────
    app_language: string;
    app_theme: AppTheme;
    app_font: string;
    app_font_size: number;
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
    /** Window opacity in percent (100 = opaque). Replaces legacy `transparent`. */
    translate_opacity: number;
    translate_window_width: number;
    translate_window_height: number;
    translate_window_position_x: number;
    translate_window_position_y: number;
    translate_hide_window: boolean;
    translate_close_on_blur: boolean;
    /** Keep the translate window alive hidden between invocations. */
    translate_keep_alive: boolean;
    translate_always_on_top: boolean;
    // ── Recognize ────────────────────────────────────────────────────────
    recognize_language: string;
    recognize_delete_newline: boolean;
    // ── Service instance lists (values sanitized on both sides) ─────────
    translate_service_list: string[];
    recognize_service_list: string[];
    dictionary_service_list: string[];
    /** Master switch for the dictionary card in the translate window. */
    dictionary_enabled: boolean;
    tts_service_list: string[];
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
    translate_opacity: 85,
    translate_window_width: 350,
    translate_window_height: 420,
    translate_window_position_x: 0,
    translate_window_position_y: 0,
    translate_hide_window: false,
    translate_close_on_blur: true,
    translate_keep_alive: true,
    translate_always_on_top: false,
    recognize_language: 'auto',
    recognize_delete_newline: false,
    translate_service_list: ['openai'],
    recognize_service_list: ['paddle', 'system'],
    dictionary_service_list: ['free_dictionary'],
    dictionary_enabled: true,
    tts_service_list: ['system'],
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
 * `translate_layout` replaces the `hide_source` + `hide_language` pair;
 * `translate_opacity` replaces the `transparent` boolean (true → the 85%
 * default, false → fully opaque).
 */
export const LEGACY_LAYOUT_SOURCE_KEY = 'hide_source';
export const LEGACY_LAYOUT_LANGUAGE_KEY = 'hide_language';
export const LEGACY_TRANSPARENT_KEY = 'transparent';
