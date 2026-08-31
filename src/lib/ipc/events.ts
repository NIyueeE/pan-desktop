import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Event contract with the backend and between windows.
 *
 * - `new_text` (backend → translate window): text to translate, or the
 *   markers `[INPUT_TRANSLATE]` / `[IMAGE_TRANSLATE]`.
 * - `success` (screenshot window internal): region cut finished.
 * - `<key>_changed` (any window → all windows): config key sync. The event
 *   name derives from the key (`.` → `_`, `@` → `:`) plus `_changed`.
 */

export const NEW_TEXT_EVENT = 'new_text';
export const SCREENSHOT_SUCCESS_EVENT = 'success';

export function configChangedEventName(key: string): string {
    return `${key.replaceAll('.', '_').replaceAll('@', ':')}_changed`;
}

export const onNewText = (cb: (text: string) => void): Promise<UnlistenFn> =>
    listen<string>(NEW_TEXT_EVENT, (e) => cb(e.payload));

export const onScreenshotSuccess = (cb: () => void): Promise<UnlistenFn> =>
    listen(SCREENSHOT_SUCCESS_EVENT, () => cb());

export const emitScreenshotSuccess = (): Promise<void> => emit(SCREENSHOT_SUCCESS_EVENT);

export const onConfigChanged = (key: string, cb: (value: unknown) => void): Promise<UnlistenFn> =>
    listen(configChangedEventName(key), (e) => cb(e.payload));

export const emitConfigChanged = (key: string, value: unknown): Promise<void> =>
    emit(configChangedEventName(key), value);
