import { Store } from '@tauri-apps/plugin-store';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { watch } from '@tauri-apps/plugin-fs';
import { warn as logWarn } from '@tauri-apps/plugin-log';

import { reloadStore } from '../ipc/commands';
import { emitConfigChanged, onConfigChanged } from '../ipc/events';
import {
    defaults,
    LEGACY_LAYOUT_LANGUAGE_KEY,
    LEGACY_LAYOUT_SOURCE_KEY,
    type ConfigKey,
    type ConfigValue,
} from './defaults';

/**
 * Reactive configuration store.
 *
 * One bulk `entries()` IPC at boot replaces the legacy pattern of one
 * `store.get` per `useConfig` hook (30+ serialized round-trips per window).
 * Reads are synchronous and fine-grained: components re-render only for the
 * keys they actually read. Writes update the snapshot immediately, persist
 * through a debounced batch, and broadcast `<key>_changed` for cross-window
 * sync (same event naming as the legacy frontend).
 */

const PERSIST_DEBOUNCE_MS = 500;

let store: Store | null = null;
let readyPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// Deliberately non-reactive bookkeeping — no UI reads it.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const pendingWrites = new Map<string, unknown>();

const snapshot = $state<Record<string, unknown>>({});

export async function initConfigStore(): Promise<void> {
    if (readyPromise) {
        return readyPromise;
    }
    readyPromise = (async () => {
        const dir = await appConfigDir();
        const path = await join(dir, 'config.json');
        store = await Store.load(path);
        await refreshSnapshot();
        migrateLegacyKeys();
        // Watching config changes is best-effort: a failing watcher must not
        // prevent the whole UI from booting (legacy invariant).
        try {
            await watch(path, () => {
                void onConfigFileChanged();
            });
        } catch (e) {
            void logWarn(`Failed to watch config file: ${e}`).catch(() => {});
        }
    })();
    return readyPromise;
}

/** The raw plugin-store handle (non-null after initConfigStore resolved). */
export function getStoreInstance(): Store | null {
    return store;
}

async function onConfigFileChanged(): Promise<void> {
    // Own writes also fire the watcher; both paths converge on this bulk
    // refresh, after which the backend re-applies hotkeys/tray when one of
    // its keys changed (cheap no-op otherwise).
    try {
        if (store) {
            await store.reload();
        }
        await refreshSnapshot();
        await reloadStore();
    } catch (e) {
        void logWarn(`Config refresh failed: ${e}`).catch(() => {});
    }
}

export async function refreshSnapshot(): Promise<void> {
    if (!store) {
        return;
    }
    const entries = await store.entries();
    for (const [key, value] of entries) {
        snapshot[key] = value;
    }
}

// ── Reads ────────────────────────────────────────────────────────────────

/** Reactive read of a catalog key; falls back to the default when unset. */
export function cfg<K extends ConfigKey>(key: K): ConfigValue<K> {
    const value = snapshot[key];
    if (value === undefined || value === null) {
        return defaults[key] as ConfigValue<K>;
    }
    return value as ConfigValue<K>;
}

/** Reactive read of an uncataloged key (e.g. a service instance config). */
export function cfgRaw(key: string): unknown {
    return snapshot[key];
}

export function hasConfig(key: string): boolean {
    return snapshot[key] !== undefined && snapshot[key] !== null;
}

// ── Writes ───────────────────────────────────────────────────────────────

export function setConfig<K extends ConfigKey>(key: K, value: ConfigValue<K>): void {
    setConfigRaw(key, value);
}

export function setConfigRaw(key: string, value: unknown): void {
    // `undefined` must never reach the store or the UI (legacy invariant:
    // it used to null stored keys and leak "prefix.undefined" into labels).
    if (value === undefined || value === null) {
        return;
    }
    snapshot[key] = value;
    pendingWrites.set(key, value);
    schedulePersist();
}

function schedulePersist(): void {
    if (persistTimer) {
        clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
        persistTimer = null;
        void persistPending().catch((e) => {
            void logWarn(`Failed to persist config: ${e}`).catch(() => {});
        });
    }, PERSIST_DEBOUNCE_MS);
}

async function persistPending(): Promise<void> {
    if (!store || pendingWrites.size === 0) {
        return;
    }
    const writes = [...pendingWrites.entries()];
    pendingWrites.clear();
    for (const [key, value] of writes) {
        await store.set(key, value);
    }
    await store.save();
    await Promise.all(writes.map(([key, value]) => emitConfigChanged(key, value)));
}

/**
 * Immediate write for values that must be on disk before the window can
 * disappear (hotkey bindings, service instance configs saved from modals).
 * Cancels any pending debounced write for the key.
 */
export async function writeThrough(key: string, value: unknown): Promise<void> {
    if (value === undefined || value === null) {
        return;
    }
    snapshot[key] = value;
    pendingWrites.delete(key);
    if (pendingWrites.size === 0 && persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    if (store) {
        await store.set(key, value);
        await store.save();
    }
    await emitConfigChanged(key, value);
}

/** Remove an uncataloged key entirely (e.g. a deleted service instance). */
export async function deleteConfigKey(key: string): Promise<void> {
    delete snapshot[key];
    if (store) {
        await store.delete(key);
        await store.save();
    }
}

// ── Cross-window live sync ───────────────────────────────────────────────

/**
 * Register `<key>_changed` listeners for the keys this window reads so live
 * edits from other windows merge into the snapshot. Listeners attach once,
 * in parallel, right after boot.
 */
export async function trackConfigKeys(keys: readonly string[]): Promise<void> {
    await Promise.all(
        keys.map((key) =>
            onConfigChanged(key, (value) => {
                if (value !== undefined && value !== null) {
                    snapshot[key] = value;
                }
            })
        )
    );
}

// ── Legacy migration ─────────────────────────────────────────────────────

/** Merge the legacy `hide_source`/`hide_language` pair into `translate_layout`. */
export function migrateLegacyKeys(): void {
    if (hasConfig('translate_layout')) {
        return;
    }
    const hideSource = cfgRaw(LEGACY_LAYOUT_SOURCE_KEY) === true;
    const hideLanguage = cfgRaw(LEGACY_LAYOUT_LANGUAGE_KEY) === true;
    if (cfgRaw(LEGACY_LAYOUT_SOURCE_KEY) === undefined && cfgRaw(LEGACY_LAYOUT_LANGUAGE_KEY) === undefined) {
        return;
    }
    const layout =
        hideSource && hideLanguage ? 'compact' : hideSource ? 'hide_source' : hideLanguage ? 'hide_language' : 'full';
    setConfig('translate_layout', layout);
}

// ── Test hook ────────────────────────────────────────────────────────────

export function __resetConfigStoreForTests(): void {
    for (const key of Object.keys(snapshot)) {
        delete snapshot[key];
    }
    pendingWrites.clear();
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    store = null;
    readyPromise = null;
}
