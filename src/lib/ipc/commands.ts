import { invoke } from '@tauri-apps/api/core';

/**
 * Typed wrappers over the backend Tauri commands.
 * The command names and argument shapes are the backend contract — see
 * src-tauri/src/main.rs `generate_handler!`. Do not rename without changing
 * the Rust side.
 */

export const getText = () => invoke<string>('get_text');

export const reloadStore = () => invoke<void>('reload_store');

export interface CropRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const cutImage = (rect: CropRect): Promise<void> =>
    invoke<void>('cut_image', { left: rect.left, top: rect.top, width: rect.width, height: rect.height });

export const getBase64 = () => invoke<string>('get_base64');

export const fontList = () => invoke<string[]>('font_list');

export const openDevtools = () => invoke<void>('open_devtools');

export type ShortcutName = 'hotkey_selection_translate' | 'hotkey_input_translate' | 'hotkey_ocr_translate';

export const registerShortcut = (name: ShortcutName, shortcut: string) =>
    invoke<void>('register_shortcut_by_frontend', { name, shortcut });

export const systemOcr = (lang: string) => invoke<string>('system_ocr', { lang });

export const screenshot = (x: number, y: number) => invoke<void>('screenshot', { x, y });

export const langDetect = (text: string) => invoke<string>('lang_detect', { text });

export const updateTray = (language = '', copyMode = '') => invoke<void>('update_tray', { language, copyMode });
