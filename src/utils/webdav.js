import { fetch } from '@tauri-apps/plugin-http';
import { appVersion } from './env';
import {
    BUILTIN_RECOGNIZE_SERVICES,
    BUILTIN_TRANSLATE_SERVICES,
    DEFAULT_RECOGNIZE_SERVICE_LIST,
    DEFAULT_TRANSLATE_SERVICE_LIST,
} from './service_instance';

/**
 * Minimal WebDAV client for config backup/sync.
 *
 * Uses @tauri-apps/plugin-http so requests bypass CORS and are not
 * restricted by the webview sandbox.
 */

export const DEFAULT_BACKUP_FILENAME = 'pan-config.json';
export const DEFAULT_TIMEOUT_MS = 30_000;

// Service lists from an older build (e.g. upstream pot) may reference removed
// services; they must never reach the render tree (it would crash the config
// window).
const SERVICE_LIST_KEYS = {
    translate_service_list: {
        builtin: BUILTIN_TRANSLATE_SERVICES,
        fallback: DEFAULT_TRANSLATE_SERVICE_LIST,
    },
    recognize_service_list: {
        builtin: BUILTIN_RECOGNIZE_SERVICES,
        fallback: DEFAULT_RECOGNIZE_SERVICE_LIST,
    },
};

/**
 * Drop service-list entries whose service is no longer built-in and replace
 * corrupted (non-array) values with the defaults.
 * @param {Object} data raw backup payload data
 * @returns {Object} sanitized copy
 */
export function sanitizeRestoredData(data) {
    const result = { ...data };
    for (const [key, { builtin, fallback }] of Object.entries(SERVICE_LIST_KEYS)) {
        const value = result[key];
        if (value === undefined) {
            continue;
        }
        if (!Array.isArray(value)) {
            result[key] = [...fallback];
            continue;
        }
        const cleaned = value.filter((entry) => typeof entry === 'string' && builtin.includes(entry.split('@')[0]));
        result[key] = cleaned.length > 0 ? cleaned : [...fallback];
    }
    return result;
}

const normalizeBase = (url) =>
    String(url ?? '')
        .trim()
        .replace(/\/+$/, '');

const assertHttpUrl = (url) => {
    if (!/^https?:\/\//i.test(normalizeBase(url))) {
        throw new Error('Invalid WebDAV URL');
    }
};

const timeoutSignal = (timeoutMs) => {
    try {
        return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    } catch {
        return undefined;
    }
};

// btoa() throws on non-Latin1 characters; encode UTF-8 explicitly so
// usernames/passwords with e.g. Chinese characters work.
const basicAuthToken = (username, password) => {
    const raw = `${username ?? ''}:${password ?? ''}`;
    if (typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(raw);
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(raw)));
};

const requestInit = (username, password, extra = {}, options = {}) => {
    const init = {
        ...extra,
        signal: timeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    };
    if ((username ?? '') !== '' || (password ?? '') !== '') {
        init.headers = { ...init.headers, Authorization: `Basic ${basicAuthToken(username, password)}` };
    }
    return init;
};

/**
 * Encode a user-provided filename into server path segments.
 * Subfolders are allowed ("backup/pan.json"); "." / ".." segments and any
 * backslash are rejected to prevent path traversal.
 */
export const encodeBackupPath = (filename) => {
    const raw = String(filename ?? '').trim() || DEFAULT_BACKUP_FILENAME;
    if (raw.includes('\\')) {
        throw new Error('Invalid backup file name');
    }
    const segments = raw
        .split('/')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
        throw new Error('Invalid backup file name');
    }
    return segments.map(encodeURIComponent).join('/');
};

export const backupFileUrl = (url, filename) => `${normalizeBase(url)}/${encodeBackupPath(filename)}`;

// Some servers answer PUT into a missing directory with 404/409; create the
// parent directories level by level (errors ignored, best effort like upstream).
const mkcolParents = async (base, fileUrl, username, password, options) => {
    const root = normalizeBase(base);
    const segments = fileUrl.slice(root.length + 1).split('/');
    segments.pop(); // drop the filename itself
    let cursor = root;
    for (const segment of segments) {
        cursor = `${cursor}/${segment}`;
        try {
            await fetch(cursor, { ...requestInit(username, password, { method: 'MKCOL' }, options) });
        } catch {
            // best effort: 405 (exists), auto-created servers, read-only dirs…
        }
    }
};

/**
 * Check that the WebDAV server is reachable (PROPFIND Depth 0 on base URL).
 */
export async function testConnection(url, username, password, options = {}) {
    assertHttpUrl(url);
    const response = await fetch(
        normalizeBase(url),
        requestInit(username, password, { method: 'PROPFIND', headers: { Depth: '0' } }, options)
    );
    // 207 Multi-Status is the WebDAV success code; accept other 2xx too.
    if (response.status === 207 || response.ok) {
        return true;
    }
    throw new Error(`WebDAV server responded with ${response.status}`);
}

async function putDocument(fileUrl, body, username, password, options) {
    return fetch(
        fileUrl,
        requestInit(
            username,
            password,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body,
            },
            options
        )
    );
}

/**
 * Upload the whole store as a single JSON document.
 * @returns {Promise<void>}
 */
export async function uploadBackup(store, url, username, password, filename, options = {}) {
    assertHttpUrl(url);
    // Pick up changes other windows persisted since this store was loaded.
    if (typeof store.reload === 'function') {
        try {
            await store.reload();
        } catch {
            // best effort: keep backing up the in-memory state
        }
    }
    // entries() resolves to Array<[key, value]>
    const data = Object.fromEntries(await store.entries());
    const payload = JSON.stringify({
        app: 'pan',
        type: 'config-backup',
        version: appVersion,
        timestamp: Date.now(),
        data,
    });
    const fileUrl = backupFileUrl(url, filename);
    let response = await putDocument(fileUrl, payload, username, password, options);
    if (response.status === 404 || response.status === 409) {
        await mkcolParents(url, fileUrl, username, password, options);
        response = await putDocument(fileUrl, payload, username, password, options);
    }
    if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`Upload failed with ${response.status}`);
    }
}

/**
 * Download and validate a backup document.
 * @returns {Promise<{timestamp:number, version:string, data:Object}>}
 */
export async function downloadBackup(url, username, password, filename, options = {}) {
    assertHttpUrl(url);
    const response = await fetch(
        backupFileUrl(url, filename),
        requestInit(username, password, { method: 'GET' }, options)
    );
    if (response.status === 404) {
        throw new Error('No backup found on the server');
    }
    if (!response.ok) {
        throw new Error(`Download failed with ${response.status}`);
    }
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error('The remote file is not valid JSON');
    }
    if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        payload.type !== 'config-backup' ||
        typeof payload.data !== 'object' ||
        payload.data === null ||
        Array.isArray(payload.data)
    ) {
        // Validation is type-based only: backups created by the upstream pot
        // build (app: 'pot') still restore fine, they just carry extra keys.
        throw new Error('The remote file is not a valid pan backup');
    }
    return payload;
}

/**
 * Replace the local store with a downloaded backup (full-replace semantics:
 * keys absent from the backup are removed). The store is saved only after all
 * writes succeed; on failure the in-memory state is reloaded from disk before
 * the error propagates.
 */
export async function applyBackup(store, payload) {
    const data = sanitizeRestoredData(payload.data);
    const entries = Object.entries(data);
    try {
        for (const [key, value] of entries) {
            await store.set(key, value);
        }
        for (const key of await store.keys()) {
            if (!(key in data)) {
                await store.delete(key);
            }
        }
        await store.save();
    } catch (e) {
        try {
            await store.reload();
        } catch {
            // nothing else we can do; surface the original error
        }
        throw e;
    }
}
