import { info, error } from '@tauri-apps/plugin-log';

import { initStore, store } from './utils/store';
import { uploadBackup } from './utils/webdav';

// Auto backup scheduler running in the always-alive daemon window.
const CHECK_INTERVAL = 10 * 60 * 1000; // evaluate every 10 minutes
const AUTO_INTERVAL = 60 * 60 * 1000; // upload at most once per hour

const AUTO_BACKUP_DELAY = 20 * 1000;

async function maybeAutoBackup() {
    try {
        await store.reload();
        const enabled = await store.get('webdav_auto_sync');
        const url = await store.get('webdav_url');
        if (!enabled || !url) {
            return;
        }
        const lastSync = (await store.get('webdav_last_sync')) || 0;
        if (Date.now() - Number(lastSync) < AUTO_INTERVAL) {
            return;
        }
        const username = (await store.get('webdav_username')) || '';
        const password = (await store.get('webdav_password')) || '';
        let filename = await store.get('webdav_filename');
        filename = filename || undefined;
        await uploadBackup(store, url, username, password, filename);
        const now = Date.now();
        await store.set('webdav_last_sync', now);
        await store.save();
        info(`WebDAV auto backup finished at ${now}`);
    } catch (e) {
        void error(`WebDAV auto backup failed: ${e}`);
    }
}

async function start() {
    try {
        await initStore();
    } catch (e) {
        void error(`Daemon failed to initialize store: ${e}`);
        return;
    }
    setTimeout(maybeAutoBackup, AUTO_BACKUP_DELAY);
    setInterval(maybeAutoBackup, CHECK_INTERVAL);
}

void start();
