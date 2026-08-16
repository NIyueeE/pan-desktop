import { invoke } from '@tauri-apps/api';

// 仅保留本地语言检测（不依赖任何第三方翻译服务）
export default async function detect(text) {
    if (!text || text.trim() === '') {
        return 'en';
    }
    return await invoke('lang_detect', { text });
}
