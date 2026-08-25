import { fetch } from '@tauri-apps/plugin-http';
import { appVersion } from './env';

/**
 * Minimal WebDAV client for config backup/sync.
 *
 * Uses @tauri-apps/plugin-http so requests bypass CORS and are not
 * restricted by the webview sandbox.
 */

export const DEFAULT_BACKUP_FILENAME = 'pot-config.json';

const normalizeBase = (url) => url.trim().replace(/\/+$/, '');

export const backupFileUrl = (url, filename) =>
    `${normalizeBase(url)}/${encodeURIComponent(filename || DEFAULT_BACKUP_FILENAME).replace(/%2F/gi, '/')}`;

const authHeader = (username, password) => {
    const token = btoa(`${username}:${password}`);
    return `Basic ${token}`;
};

const buildHeaders = (username, password, extra = {}) => {
    const headers = { ...extra };
    if (username !== '' || password !== '') {
        headers.Authorization = authHeader(username, password);
    }
    return headers;
};

/**
 * Check that the WebDAV server is reachable and the target directory exists
 * (PROPFIND Depth 0 on the base URL).
 */
export async function testConnection(url, username, password) {
    if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error('Invalid WebDAV URL');
    }
    const response = await fetch(normalizeBase(url), {
        method: 'PROPFIND',
        headers: buildHeaders(username, password, { Depth: '0' }),
    });
    // 207 Multi-Status is the WebDAV success code; accept 200 too.
    if (response.status === 207 || response.ok) {
        return true;
    }
    throw new Error(`WebDAV server responded with ${response.status}`);
}

/**
 * Upload the whole store as a single JSON document.
 * @returns {Promise<void>}
 */
export async function uploadBackup(store, url, username, password, filename) {
    // entries() resolves to Array<[key, value]>
    const data = Object.fromEntries(await store.entries());
    const payload = {
        app: 'pot',
        type: 'config-backup',
        version: appVersion,
        timestamp: Date.now(),
        data,
    };
    const response = await fetch(backupFileUrl(url, filename), {
        method: 'PUT',
        headers: buildHeaders(username, password, {
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`Upload failed with ${response.status}`);
    }
}

/**
 * Download and validate a backup document.
 * @returns {Promise<{timestamp:number, version:string, data:Object}>}
 */
export async function downloadBackup(url, username, password, filename) {
    const response = await fetch(backupFileUrl(url, filename), {
        method: 'GET',
        headers: buildHeaders(username, password),
    });
    if (response.status === 404) {
        throw new Error('No backup found on the server');
    }
    if (!response.ok) {
        throw new Error(`Download failed with ${response.status}`);
    }
    const payload = await response.json();
    if (!payload || payload.type !== 'config-backup' || typeof payload.data !== 'object') {
        throw new Error('The remote file is not a valid pot backup');
    }
    return payload;
}

/**
 * Write a downloaded backup into the local store and sync the Rust side.
 */
export async function applyBackup(store, payload) {
    for (const [key, value] of Object.entries(payload.data)) {
        await store.set(key, value);
    }
    await store.save();
}
