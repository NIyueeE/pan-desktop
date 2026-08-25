import { Store } from '@tauri-apps/plugin-store';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { watch } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { warn as logWarn } from '@tauri-apps/plugin-log';

export let store = null;

export async function initStore() {
    const appConfigDirPath = await appConfigDir();
    const appConfigPath = await join(appConfigDirPath, 'config.json');
    store = await Store.load(appConfigPath);
    // Watching config changes is best-effort: a failing watcher must not
    // prevent the whole UI from booting.
    try {
        await watch(appConfigPath, async () => {
            await store.reload();
            await invoke('reload_store');
        });
    } catch (e) {
        void logWarn(`Failed to watch config file: ${e}`).catch(() => {});
    }
}
