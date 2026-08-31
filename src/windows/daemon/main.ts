import { error as logError, info } from '@tauri-apps/plugin-log';

import { cfgRaw, getStoreInstance, initConfigStore, refreshSnapshot } from '../../lib/config/store.svelte';
import { initEnv } from '../../lib/utils/env.svelte';
import { uploadBackup } from '../../lib/utils/webdav';

// Auto backup scheduler running in the always-alive daemon window.
const CHECK_INTERVAL = 10 * 60 * 1000; // evaluate every 10 minutes
const AUTO_INTERVAL = 60 * 60 * 1000; // upload at most once per hour
const AUTO_BACKUP_DELAY = 20 * 1000;

async function maybeAutoBackup(): Promise<void> {
    try {
        await refreshSnapshot();
        if (cfgRaw('webdav_auto_sync') !== true) {
            return;
        }
        const url = cfgRaw('webdav_url');
        if (typeof url !== 'string' || url === '') {
            return;
        }
        const lastSync = Number(cfgRaw('webdav_last_sync') ?? 0);
        if (Date.now() - lastSync < AUTO_INTERVAL) {
            return;
        }
        const store = getStoreInstance();
        if (!store) {
            return;
        }
        const username = String(cfgRaw('webdav_username') ?? '');
        const password = String(cfgRaw('webdav_password') ?? '');
        const rawFilename = cfgRaw('webdav_filename');
        const filename = typeof rawFilename === 'string' && rawFilename !== '' ? rawFilename : undefined;
        await uploadBackup(store, url, username, password, filename);
        const now = Date.now();
        await store.set('webdav_last_sync', now);
        await store.save();
        void info(`WebDAV auto backup finished at ${now}`);
    } catch (e) {
        void logError(`WebDAV auto backup failed: ${e}`);
    }
}

async function start(): Promise<void> {
    try {
        await initConfigStore();
        await initEnv();
    } catch (e) {
        void logError(`Daemon failed to initialize: ${e}`);
        return;
    }
    setTimeout(() => void maybeAutoBackup(), AUTO_BACKUP_DELAY);
    setInterval(() => void maybeAutoBackup(), CHECK_INTERVAL);
}

void start();
