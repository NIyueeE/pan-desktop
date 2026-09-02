import { fetch } from '@tauri-apps/plugin-http';

import { appEnv } from './env.svelte';
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
 *
 * COMPATIBILITY RED LINE: backup validation is type-based only
 * (`type === 'config-backup'`). Backups created by the upstream pot build
 * (`app: 'pot'`) must always keep restoring.
 */

export const DEFAULT_BACKUP_FILENAME = 'pan-config.json';
export const DEFAULT_TIMEOUT_MS = 30_000;

// Service lists from an older build (e.g. upstream pot) may reference removed
// services; they must never reach the render tree (it would crash the config
// window).
const SERVICE_LIST_KEYS: Record<string, { builtin: readonly string[]; fallback: string[] }> = {
    translate_service_list: {
        builtin: BUILTIN_TRANSLATE_SERVICES,
        fallback: DEFAULT_TRANSLATE_SERVICE_LIST,
    },
    recognize_service_list: {
        builtin: BUILTIN_RECOGNIZE_SERVICES,
        fallback: DEFAULT_RECOGNIZE_SERVICE_LIST,
    },
};

type BackupData = Record<string, unknown>;

/** Drop service-list entries whose service is no longer built-in and replace
 * corrupted (non-array) values with the defaults. */
export function sanitizeRestoredData(data: BackupData): BackupData {
    const result: BackupData = { ...data };
    for (const [key, { builtin, fallback }] of Object.entries(SERVICE_LIST_KEYS)) {
        const value = result[key];
        if (value === undefined) {
            continue;
        }
        if (!Array.isArray(value)) {
            result[key] = [...fallback];
            continue;
        }
        const cleaned = value.filter(
            (entry): entry is string => typeof entry === 'string' && builtin.includes(entry.split('@')[0] ?? '')
        );
        result[key] = cleaned.length > 0 ? cleaned : [...fallback];
    }
    return result;
}

const normalizeBase = (url: unknown): string =>
    String(url ?? '')
        .trim()
        .replace(/\/+$/, '');

const assertHttpUrl = (url: unknown): void => {
    if (!/^https?:\/\//i.test(normalizeBase(url))) {
        throw new Error('Invalid WebDAV URL');
    }
};

const timeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
    try {
        return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    } catch {
        return undefined;
    }
};

// btoa() throws on non-Latin1 characters; encode UTF-8 explicitly so
// usernames/passwords with e.g. Chinese characters work.
const basicAuthToken = (username: unknown, password: unknown): string => {
    const raw = `${username ?? ''}:${password ?? ''}`;
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
};

interface RequestOptions {
    timeoutMs?: number;
}

const requestInit = (
    username: unknown,
    password: unknown,
    extra: RequestInit = {},
    options: RequestOptions = {}
): RequestInit => {
    const init: RequestInit = {
        ...extra,
        signal: timeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    };
    if ((username ?? '') !== '' || (password ?? '') !== '') {
        init.headers = {
            ...(init.headers as Record<string, string>),
            Authorization: `Basic ${basicAuthToken(username, password)}`,
        };
    }
    return init;
};

/** Encode a user-provided filename into server path segments. Subfolders are
 * allowed ("backup/pan.json"); "." / ".." segments and any backslash are
 * rejected to prevent path traversal. */
export const encodeBackupPath = (filename: unknown): string => {
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

export const backupFileUrl = (url: unknown, filename: unknown): string =>
    `${normalizeBase(url)}/${encodeBackupPath(filename)}`;

// Some servers answer PUT into a missing directory with 404/409; create the
// parent directories level by level (errors ignored, best effort like upstream).
const mkcolParents = async (
    base: string,
    fileUrl: string,
    username: unknown,
    password: unknown,
    options: RequestOptions
): Promise<void> => {
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

/** Check that the WebDAV server is reachable (PROPFIND Depth 0 on base URL). */
export async function testConnection(
    url: string,
    username: string,
    password: string,
    options: RequestOptions = {}
): Promise<boolean> {
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

async function putDocument(
    fileUrl: string,
    body: string,
    username: string,
    password: string,
    options: RequestOptions
): Promise<Response> {
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

/** Minimal store surface needed here (mirrors tauri-plugin-store JS API). */
export interface BackupStore {
    reload(): Promise<void>;
    entries(): Promise<Array<[string, unknown]>>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
    save(): Promise<void>;
}

/** Upload the whole store as a single JSON document. */
export async function uploadBackup(
    store: BackupStore,
    url: string,
    username: string,
    password: string,
    filename?: string,
    options: RequestOptions = {}
): Promise<void> {
    assertHttpUrl(url);
    // Pick up changes other windows persisted since this store was loaded.
    try {
        await store.reload();
    } catch {
        // best effort: keep backing up the in-memory state
    }
    const data = Object.fromEntries(await store.entries());
    const payload = JSON.stringify({
        app: 'pan',
        type: 'config-backup',
        version: appEnv.appVersion,
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

export interface BackupPayload {
    type: string;
    timestamp: number;
    version: string;
    data: BackupData;
}

/** Download and validate a backup document. */
export async function downloadBackup(
    url: string,
    username: string,
    password: string,
    filename?: string,
    options: RequestOptions = {}
): Promise<BackupPayload> {
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
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new Error('The remote file is not valid JSON');
    }
    if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        (payload as BackupPayload).type !== 'config-backup' ||
        typeof (payload as BackupPayload).data !== 'object' ||
        (payload as BackupPayload).data === null ||
        Array.isArray((payload as BackupPayload).data)
    ) {
        // Validation is type-based only: backups created by the upstream pot
        // build (app: 'pot') still restore fine, they just carry extra keys.
        throw new Error('The remote file is not a valid pan backup');
    }
    return payload as BackupPayload;
}

/** Replace the local store with a downloaded backup (full-replace semantics:
 * keys absent from the backup are removed). The store is saved only after all
 * writes succeed; on failure the in-memory state is reloaded from disk before
 * the error propagates. */
export async function applyBackup(store: BackupStore, payload: BackupPayload): Promise<void> {
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
