/**
 * Central registry of fake Tauri backends shared by all frontend tests.
 *
 * IMPORTANT: this module must stay dependency-free (no imports). It is
 * dynamically imported from inside `vi.mock()` factories in setup.ts, which
 * are hoisted before test-file imports run.
 */

// ---------------------------------------------------------------------------
// In-memory config store (mirrors tauri-plugin-store behaviour)
// ---------------------------------------------------------------------------
export const fakeConfigFile = new Map<string, unknown>();
export const storeInstances: object[] = [];

export function createFakeStore(): {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    has: (key: string) => Promise<boolean>;
    keys: () => Promise<string[]>;
    entries: () => Promise<Array<[string, unknown]>>;
    save: () => Promise<void>;
    reload: () => Promise<void>;
    reset: () => Promise<void>;
} {
    const clone = (value: unknown): unknown =>
        value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    return {
        async get(key: string) {
            return fakeConfigFile.has(key) ? clone(fakeConfigFile.get(key)) : null;
        },
        async set(key: string, value: unknown) {
            fakeConfigFile.set(key, clone(value));
        },
        async delete(key: string) {
            fakeConfigFile.delete(key);
        },
        async has(key: string) {
            return fakeConfigFile.has(key);
        },
        async keys() {
            return [...fakeConfigFile.keys()];
        },
        async entries() {
            return [...fakeConfigFile.entries()].map(([k, v]) => [k, clone(v)] as [string, unknown]);
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
export const eventListeners = new Map<string, Array<(e: { event: string; payload: unknown; id: number }) => void>>();

export function emitTestEvent(event: string, payload: unknown): void {
    for (const cb of eventListeners.get(event) ?? []) {
        cb({ event, payload, id: Math.floor(Math.random() * 1e9) });
    }
}

export function listenerCount(event: string): number {
    return (eventListeners.get(event) ?? []).length;
}

// ---------------------------------------------------------------------------
// Fake invoke command table — tests can override any command's result
// ---------------------------------------------------------------------------
export const invokeHandlers = new Map<string, (args: unknown) => unknown>();
export const invokeCalls: Array<[string, unknown]> = [];

export function setInvokeHandler(cmd: string, handler: (args: unknown) => unknown): void {
    invokeHandlers.set(cmd, handler);
}

export function fakeInvoke(cmd: string, args?: unknown): Promise<unknown> {
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
export const windowState = { label: 'config' as string };
export function setCurrentWindowLabel(label: string): void {
    windowState.label = label;
}

// Track global-shortcut plugin interactions (hotkey page tests)
export const globalShortcutCalls: Array<{ op: string; args: unknown }> = [];

export function resetTauriState(): void {
    fakeConfigFile.clear();
    eventListeners.clear();
    invokeHandlers.clear();
    invokeCalls.length = 0;
    globalShortcutCalls.length = 0;
    storeInstances.length = 0;
    windowState.label = 'config';
}
