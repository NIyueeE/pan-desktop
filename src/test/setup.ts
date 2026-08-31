import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';

import { resetTauriState } from './tauri-state';
import { __resetConfigStoreForTests } from '../lib/config/store.svelte';
import { initI18n } from '../lib/i18n/i18n.svelte';
import { initEnv } from '../lib/utils/env.svelte';

export { resetTauriState } from './tauri-state';

// The legacy frontend initialised i18n transitively via App; the rewrite
// initialises it in bootWindow, which tests do not run. Initialise the real
// en bundle here so t() resolves like production.
await initI18n('en');
// Same for the environment (plugin-os mocked above → osType 'Windows_NT').
await initEnv();

// All @tauri-apps modules the app imports are mocked with static paths (the
// calls are hoisted); shared state lives in ./tauri-state and is pulled in
// lazily via dynamic import inside each factory.

vi.mock('@tauri-apps/api/core', async () => {
    const { fakeInvoke } = await import('./tauri-state');
    return {
        invoke: (cmd: string, args?: unknown) => fakeInvoke(cmd, args),
        convertFileSrc: (p: string) => p,
        transformCallback: () => 1,
    };
});

vi.mock('@tauri-apps/api/event', async () => {
    const state = await import('./tauri-state');
    type Listener = (e: { event: string; payload: unknown; id: number }) => void;
    return {
        listen: (event: string, cb: Listener) => {
            if (!state.eventListeners.has(event)) {
                state.eventListeners.set(event, []);
            }
            state.eventListeners.get(event)?.push(cb);
            return Promise.resolve(() => {
                const list = state.eventListeners.get(event) ?? [];
                const i = list.indexOf(cb);
                if (i >= 0) {
                    list.splice(i, 1);
                }
            });
        },
        emit: (event: string, payload: unknown) => {
            state.emitTestEvent(event, payload);
            return Promise.resolve();
        },
        emitTo: () => Promise.resolve(),
        once: () => Promise.resolve(() => {}),
    };
});

vi.mock('@tauri-apps/api/webviewWindow', async () => {
    const state = await import('./tauri-state');
    const makeWindow = (label: string) => ({
        label,
        show: () => Promise.resolve(),
        isVisible: () => Promise.resolve(true),
        isFocused: () => Promise.resolve(true),
        isMaximized: () => Promise.resolve(false),
        hide: () => Promise.resolve(),
        close: () => Promise.resolve(),
        setFocus: () => Promise.resolve(),
        setAlwaysOnTop: () => Promise.resolve(),
        setSkipTaskbar: () => Promise.resolve(),
        setSize: () => Promise.resolve(),
        setPosition: () => Promise.resolve(),
        setResizable: () => Promise.resolve(),
        center: () => Promise.resolve(),
        innerWidth: () => Promise.resolve(800),
        outerPosition: () => Promise.resolve({ toLogical: () => ({ x: 10, y: 10 }) }),
        outerSize: () => Promise.resolve({ toLogical: () => ({ width: 350, height: 420 }) }),
        currentMonitor: () => Promise.resolve({ scaleFactor: 1 }),
        listen: () => Promise.resolve(() => {}),
    });
    const cache = new Map<string, ReturnType<typeof makeWindow>>();
    return {
        getCurrentWebviewWindow: () => {
            if (!cache.has(state.windowState.label)) {
                cache.set(state.windowState.label, makeWindow(state.windowState.label));
            }
            return cache.get(state.windowState.label);
        },
        WebviewWindow: class {},
        getAllWebviewWindows: () => Promise.resolve([]),
    };
});

vi.mock('@tauri-apps/api/window', async () => {
    const monitor = { scaleFactor: 1, size: { width: 1920, height: 1080 }, position: { x: 0, y: 0 } };
    return {
        currentMonitor: () => Promise.resolve(monitor),
        Window: class {},
    };
});

vi.mock('@tauri-apps/api/path', async () => {
    return {
        appConfigDir: () => Promise.resolve('/fake/config/dir/'),
        join: (...parts: string[]) => Promise.resolve(parts.join('').replace(/\/+$/, '')),
        resolve: (...parts: string[]) => Promise.resolve(parts.join('/')),
    };
});

vi.mock('@tauri-apps/api/app', () => ({
    getVersion: () => Promise.resolve('4.1.3'),
    getName: () => Promise.resolve('pan'),
    getTauriVersion: () => Promise.resolve('2.11.0'),
}));

vi.mock('@tauri-apps/plugin-store', async () => {
    const state = await import('./tauri-state');
    return {
        Store: {
            load: () => {
                const s = state.createFakeStore();
                state.storeInstances.push(s);
                return Promise.resolve(s);
            },
        },
        StoreBuilder: class {},
    };
});

vi.mock('@tauri-apps/plugin-fs', () => ({
    watch: () => Promise.resolve(() => {}),
    readDir: () => Promise.resolve([]),
    exists: () => Promise.resolve(false),
}));

vi.mock('@tauri-apps/plugin-log', () => ({
    info: () => Promise.resolve(),
    warn: () => Promise.resolve(),
    error: () => Promise.resolve(),
    debug: () => Promise.resolve(),
    attachConsole: () => Promise.resolve(() => {}),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
    // Real plugin-os v2 values (lowercase); lib/utils/env.svelte.ts normalises
    // them to the canonical 'Windows_NT' | 'Darwin' | 'Linux' used across the
    // app. The mock must match the real plugin exactly (AGENTS §8.4).
    type: () => Promise.resolve('windows'),
    arch: () => Promise.resolve('x86_64'),
    version: () => Promise.resolve('10'),
    platform: () => Promise.resolve('windows'),
    family: () => Promise.resolve('unix'),
}));

vi.mock('@tauri-apps/plugin-global-shortcut', async () => {
    const state = await import('./tauri-state');
    return {
        isRegistered: (shortcut: string) => {
            state.globalShortcutCalls.push(['isRegistered', shortcut]);
            return Promise.resolve(state.globalShortcutCalls.some(([op, s]) => op === 'register' && s === shortcut));
        },
        register: (shortcut: string) => {
            state.globalShortcutCalls.push(['register', shortcut]);
            return Promise.resolve();
        },
        unregister: (shortcut: string) => {
            state.globalShortcutCalls.push(['unregister', shortcut]);
            return Promise.resolve();
        },
        unregisterAll: () => Promise.resolve(),
    };
});

vi.mock('@tauri-apps/plugin-autostart', () => ({
    enable: () => Promise.resolve(),
    disable: () => Promise.resolve(),
    isEnabled: () => Promise.resolve(false),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
    open: () => Promise.resolve(),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
    sendNotification: () => {},
    isPermissionGranted: () => Promise.resolve(true),
    requestPermission: () => Promise.resolve('granted'),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: () => Promise.reject(new Error('network disabled in tests (override with setInvokeHandler/http mock)')),
}));

beforeEach(() => {
    resetTauriState();
    __resetConfigStoreForTests();
});

afterEach(() => {
    cleanup();
});

// jsdom lacks several browser APIs that headless UI primitives rely on.
if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
    })) as unknown as typeof window.matchMedia;
}
if (!window.ResizeObserver) {
    window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}
if (!window.confirm) {
    window.confirm = () => true;
}
