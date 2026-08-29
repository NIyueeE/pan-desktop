/**
 * Central registry of fake Tauri backends shared by all frontend tests.
 *
 * Every `@tauri-apps/*` module the app imports is mocked here so the real
 * React components can run inside jsdom against an in-memory store, a fake
 * invoke command table and a fake event bus.
 */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory config store (mirrors tauri-plugin-store behaviour)
// ---------------------------------------------------------------------------
export const fakeConfigFile = new Map();

function createFakeStore() {
    return {
        __file: 'config.json',
        async get(key) {
            return fakeConfigFile.has(key) ? JSON.parse(JSON.stringify(fakeConfigFile.get(key))) : null;
        },
        async set(key, value) {
            fakeConfigFile.set(key, JSON.parse(JSON.stringify(value)));
        },
        async delete(key) {
            fakeConfigFile.delete(key);
        },
        async has(key) {
            return fakeConfigFile.has(key);
        },
        async keys() {
            return [...fakeConfigFile.keys()];
        },
        async entries() {
            return [...fakeConfigFile.entries()].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]);
        },
        async save() {},
        async reload() {},
        async reset() {
            fakeConfigFile.clear();
        },
    };
}

export const storeInstances = [];

// ---------------------------------------------------------------------------
// Fake event bus (mirrors @tauri-apps/api/event)
// ---------------------------------------------------------------------------
const eventListeners = new Map();

export function emitTestEvent(event, payload) {
    for (const cb of eventListeners.get(event) ?? []) {
        cb({ event, payload, id: Math.floor(Math.random() * 1e9) });
    }
}

export function listenerCount(event) {
    return (eventListeners.get(event) ?? []).length;
}

// ---------------------------------------------------------------------------
// Fake invoke command table — tests can override any command's result
// ---------------------------------------------------------------------------
export const invokeHandlers = new Map();
export const invokeCalls = [];

export function setInvokeHandler(cmd, handler) {
    invokeHandlers.set(cmd, handler);
}

// ---------------------------------------------------------------------------
// Window label used by getCurrentWebviewWindow()
// ---------------------------------------------------------------------------
export let currentWindowLabel = 'config';
export function setCurrentWindowLabel(label) {
    currentWindowLabel = label;
}

// Track global-shortcut plugin interactions (hotkey page tests)
export const globalShortcutCalls = [];

export function resetTauriMocks() {
    fakeConfigFile.clear();
    eventListeners.clear();
    invokeHandlers.clear();
    invokeCalls.length = 0;
    globalShortcutCalls.length = 0;
    storeInstances.length = 0;
    currentWindowLabel = 'config';
}

// ---------------------------------------------------------------------------
// vi.mock module factories
// ---------------------------------------------------------------------------
export const tauriMocks = {
    '@tauri-apps/api/core': () => ({
        invoke: vi.fn((cmd, args) => {
            invokeCalls.push([cmd, args]);
            const handler = invokeHandlers.get(cmd);
            if (handler) {
                return Promise.resolve(handler(args));
            }
            // Default, harmless responses for the commands the app issues.
            switch (cmd) {
                case 'get_text':
                    return Promise.resolve('');
                case 'get_base64':
                    return Promise.resolve('');
                case 'font_list':
                    return Promise.resolve(['Arial', 'Noto Sans']);
                case 'reload_store':
                case 'set_proxy':
                case 'unset_proxy':
                case 'update_tray':
                case 'open_devtools':
                    return Promise.resolve();
                default:
                    return Promise.resolve();
            }
        }),
        convertFileSrc: vi.fn((p) => p),
        transformCallback: vi.fn(),
    }),
    '@tauri-apps/api/event': () => ({
        listen: vi.fn((event, cb) => {
            if (!eventListeners.has(event)) {
                eventListeners.set(event, []);
            }
            eventListeners.get(event).push(cb);
            return Promise.resolve(() => {
                const list = eventListeners.get(event) ?? [];
                const i = list.indexOf(cb);
                if (i >= 0) {
                    list.splice(i, 1);
                }
            });
        }),
        emit: vi.fn((event, payload) => {
            emitTestEvent(event, payload);
            return Promise.resolve();
        }),
        emitTo: vi.fn(() => Promise.resolve()),
        once: vi.fn(() => Promise.resolve(() => {})),
    }),
    '@tauri-apps/api/webviewWindow': () => {
        const makeWindow = (label) => ({
            label,
            show: vi.fn(() => Promise.resolve()),
            hide: vi.fn(() => Promise.resolve()),
            close: vi.fn(() => Promise.resolve()),
            setFocus: vi.fn(() => Promise.resolve()),
            setAlwaysOnTop: vi.fn(() => Promise.resolve()),
            setSkipTaskbar: vi.fn(() => Promise.resolve()),
            setSize: vi.fn(() => Promise.resolve()),
            setPosition: vi.fn(() => Promise.resolve()),
            center: vi.fn(() => Promise.resolve()),
            innerWidth: vi.fn(() => Promise.resolve(800)),
            onResized: vi.fn(() => Promise.resolve(() => {})),
            onMoved: vi.fn(() => Promise.resolve(() => {})),
            listen: vi.fn(() => Promise.resolve(() => {})),
        });
        const cache = new Map();
        return {
            getCurrentWebviewWindow: vi.fn(() => {
                if (!cache.has(currentWindowLabel)) {
                    cache.set(currentWindowLabel, makeWindow(currentWindowLabel));
                }
                return cache.get(currentWindowLabel);
            }),
            WebviewWindow: vi.fn(),
            getAllWebviewWindows: vi.fn(() => Promise.resolve([])),
        };
    },
    '@tauri-apps/api/window': () => ({
        currentMonitor: vi.fn(() => Promise.resolve({ scaleFactor: 1, size: { width: 1920, height: 1080 } })),
        Window: vi.fn(),
    }),
    '@tauri-apps/api/path': () => ({
        appConfigDir: vi.fn(() => Promise.resolve('/fake/config/dir/')),
        join: vi.fn((...parts) => Promise.resolve(parts.join('').replace(/\/+$/, ''))),
        resolve: vi.fn((...parts) => Promise.resolve(parts.join('/'))),
    }),
    '@tauri-apps/api/app': () => ({
        getVersion: vi.fn(() => Promise.resolve('4.1.2')),
        getName: vi.fn(() => Promise.resolve('pot')),
        getTauriVersion: vi.fn(() => Promise.resolve('2.11.0')),
    }),
    '@tauri-apps/plugin-store': () => ({
        Store: {
            load: vi.fn(() => {
                const s = createFakeStore();
                storeInstances.push(s);
                return Promise.resolve(s);
            }),
        },
        StoreBuilder: vi.fn(),
    }),
    '@tauri-apps/plugin-fs': () => ({
        watch: vi.fn(() => Promise.resolve(() => {})),
        readDir: vi.fn(() => Promise.resolve([])),
        exists: vi.fn(() => Promise.resolve(false)),
    }),
    '@tauri-apps/plugin-log': () => ({
        info: vi.fn(() => Promise.resolve()),
        warn: vi.fn(() => Promise.resolve()),
        error: vi.fn(() => Promise.resolve()),
        debug: vi.fn(() => Promise.resolve()),
        attachConsole: vi.fn(() => Promise.resolve(() => {})),
    }),
    '@tauri-apps/plugin-os': () => ({
        type: vi.fn(() => Promise.resolve('Windows_NT')),
        arch: vi.fn(() => Promise.resolve('x86_64')),
        version: vi.fn(() => Promise.resolve('10')),
        platform: vi.fn(() => Promise.resolve('windows')),
        family: vi.fn(() => Promise.resolve('windows')),
    }),
    '@tauri-apps/plugin-global-shortcut': () => ({
        isRegistered: vi.fn((shortcut) => {
            globalShortcutCalls.push(['isRegistered', shortcut]);
            return Promise.resolve(globalShortcutCalls.some(([op, s]) => op === 'register' && s === shortcut));
        }),
        register: vi.fn((shortcut) => {
            globalShortcutCalls.push(['register', shortcut]);
            return Promise.resolve();
        }),
        unregister: vi.fn((shortcut) => {
            globalShortcutCalls.push(['unregister', shortcut]);
            return Promise.resolve();
        }),
        unregisterAll: vi.fn(() => Promise.resolve()),
    }),
    '@tauri-apps/plugin-autostart': () => ({
        enable: vi.fn(() => Promise.resolve()),
        disable: vi.fn(() => Promise.resolve()),
        isEnabled: vi.fn(() => Promise.resolve(false)),
    }),
    '@tauri-apps/plugin-clipboard-manager': () => ({
        writeText: vi.fn(() => Promise.resolve()),
        readText: vi.fn(() => Promise.resolve('')),
    }),
    '@tauri-apps/plugin-shell': () => ({
        open: vi.fn(() => Promise.resolve()),
    }),
    '@tauri-apps/plugin-notification': () => ({
        sendNotification: vi.fn(),
        isPermissionGranted: vi.fn(() => Promise.resolve(true)),
        requestPermission: vi.fn(() => Promise.resolve('granted')),
    }),
    '@tauri-apps/plugin-http': () => ({
        fetch: vi.fn(() => Promise.reject(new Error('network disabled in tests (override httpFetchMock)'))),
    }),
};
