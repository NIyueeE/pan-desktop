import { invoke } from '@tauri-apps/api/core';

// Local language detection only (backend `lingua` crate, no network).
export default async function detect(text: string): Promise<string> {
    if (!text || text.trim() === '') {
        return 'en';
    }
    return await invoke<string>('lang_detect', { text });
}
