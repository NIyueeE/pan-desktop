/**
 * Central registry of fake Tauri backends shared by all frontend tests.
 *
 * IMPORTANT: this module must stay dependency-free (no imports). It is
 * dynamically imported from inside `vi.mock()` factories in setup.js, which
 * are hoisted before test-file imports run.
 */

// ---------------------------------------------------------------------------
// In-memory config store (mirrors tauri-plugin-store behaviour)
// ---------------------------------------------------------------------------
export const fakeConfigFile = new Map();
export const storeInstances = [];

export function createFakeStore() {
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

// ---------------------------------------------------------------------------
// Fake event bus (mirrors @tauri-apps/api/event)
// ---------------------------------------------------------------------------
export const eventListeners = new Map();

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

export function fakeInvoke(cmd, args) {
    invokeCalls.push([cmd, args]);
    const handler = invokeHandlers.get(cmd);
    if (handler) {
        // Match real invoke: a throwing handler rejects the promise instead
        // of throwing synchronously.
        return Promise.resolve().then(() => handler(args));
    }
    // Default, harmless responses for the commands the app issues.
    switch (cmd) {
        case 'get_text':
            return Promise.resolve('');
        case 'get_base64':
            return Promise.resolve('');
        case 'font_list':
            return Promise.resolve(['Arial', 'Noto Sans']);
        default:
            return Promise.resolve();
    }
}

// ---------------------------------------------------------------------------
// Window label used by getCurrentWebviewWindow()
// ---------------------------------------------------------------------------
export const windowState = { label: 'config' };
export function setCurrentWindowLabel(label) {
    windowState.label = label;
}

// Track global-shortcut plugin interactions (hotkey page tests)
export const globalShortcutCalls = [];

export function resetTauriState() {
    fakeConfigFile.clear();
    eventListeners.clear();
    invokeHandlers.clear();
    invokeCalls.length = 0;
    globalShortcutCalls.length = 0;
    storeInstances.length = 0;
    windowState.label = 'config';
}
