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
        // Calls are recorded so tests can assert window lifecycle behaviour
        // (resident hide vs destroy, boot-time show gating).
        show: () => {
            state.windowState.calls.push('show');
            state.windowState.visible = true;
            return Promise.resolve();
        },
        isVisible: () => Promise.resolve(state.windowState.visible),
        isFocused: () => Promise.resolve(state.windowState.focused),
        isMaximized: () => Promise.resolve(false),
        hide: () => {
            state.windowState.calls.push('hide');
            state.windowState.visible = false;
            return Promise.resolve();
        },
        close: () => {
            state.windowState.calls.push('close');
            return Promise.resolve();
        },
        setFocus: () => {
            state.windowState.calls.push('setFocus');
            state.windowState.focused = true;
            return Promise.resolve();
        },
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
    locale: () => Promise.resolve(null),
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
    // Belt-and-suspenders for the afterEach body-style reset below: a dialog
    // opened by a test's final synchronous action schedules its afterTick
    // microtask, which can land after afterEach already ran and re-apply
    // `pointer-events: none` to body. Start every test from a clean body.
    document.body.removeAttribute('style');
});

afterEach(() => {
    cleanup();
    // bits-ui's Dialog scroll lock writes `pointer-events: none` (plus padding
    // / overflow / --scrollbar-width) onto document.body via an afterTick
    // microtask and restores it through a real 24ms setTimeout. Under load the
    // restore timer can fire long after the next test started, leaking the
    // lock style across the test boundary; `pointer-events` is inherited, so
    // user-event then rejects every pointer interaction with
    // "Unable to perform pointer interaction as the element has
    // `pointer-events: none`" (CI flake: the ServicePage "Add Builtin
    // Service" click). Drop any leftover body inline style so no lock state
    // survives a test, regardless of bits-ui's internal restore timing.
    document.body.removeAttribute('style');
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
