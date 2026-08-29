import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { resetTauriState } from './tauri-state';

// i18n is normally initialised transitively via App.jsx; tests render Config
// directly, so initialise it here.
import '../i18n';

export { resetTauriState } from './tauri-state';

// All @tauri-apps modules the app imports are mocked with static paths (the
// calls are hoisted); shared state lives in ./tauri-state and is pulled in
// lazily via dynamic import inside each factory.

vi.mock('@tauri-apps/api/core', async () => {
    const { fakeInvoke } = await import('./tauri-state');
    return {
        invoke: (cmd, args) => fakeInvoke(cmd, args),
        convertFileSrc: (p) => p,
        transformCallback: () => 1,
    };
});

vi.mock('@tauri-apps/api/event', async () => {
    const state = await import('./tauri-state');
    return {
        listen: (event, cb) => {
            if (!state.eventListeners.has(event)) {
                state.eventListeners.set(event, []);
            }
            state.eventListeners.get(event).push(cb);
            return Promise.resolve(() => {
                const list = state.eventListeners.get(event) ?? [];
                const i = list.indexOf(cb);
                if (i >= 0) {
                    list.splice(i, 1);
                }
            });
        },
        emit: (event, payload) => {
            state.emitTestEvent(event, payload);
            return Promise.resolve();
        },
        emitTo: () => Promise.resolve(),
        once: () => Promise.resolve(() => {}),
    };
});

vi.mock('@tauri-apps/api/webviewWindow', async () => {
    const state = await import('./tauri-state');
    const makeWindow = (label) => ({
        label,
        show: () => Promise.resolve(),
        hide: () => Promise.resolve(),
        close: () => Promise.resolve(),
        setFocus: () => Promise.resolve(),
        setAlwaysOnTop: () => Promise.resolve(),
        setSkipTaskbar: () => Promise.resolve(),
        setSize: () => Promise.resolve(),
        setPosition: () => Promise.resolve(),
        center: () => Promise.resolve(),
        innerWidth: () => Promise.resolve(800),
        onResized: () => Promise.resolve(() => {}),
        onMoved: () => Promise.resolve(() => {}),
        listen: () => Promise.resolve(() => {}),
    });
    const cache = new Map();
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
    const monitor = { scaleFactor: 1, size: { width: 1920, height: 1080 } };
    return {
        currentMonitor: () => Promise.resolve(monitor),
        Window: class {},
    };
});

vi.mock('@tauri-apps/api/path', async () => {
    return {
        appConfigDir: () => Promise.resolve('/fake/config/dir/'),
        join: (...parts) => Promise.resolve(parts.join('').replace(/\/+$/, '')),
        resolve: (...parts) => Promise.resolve(parts.join('/')),
    };
});

vi.mock('@tauri-apps/api/app', () => ({
    getVersion: () => Promise.resolve('4.1.2'),
    getName: () => Promise.resolve('pot'),
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
    type: () => Promise.resolve('Windows_NT'),
    arch: () => Promise.resolve('x86_64'),
    version: () => Promise.resolve('10'),
    platform: () => Promise.resolve('windows'),
    family: () => Promise.resolve('windows'),
}));

vi.mock('@tauri-apps/plugin-global-shortcut', async () => {
    const state = await import('./tauri-state');
    return {
        isRegistered: (shortcut) => {
            state.globalShortcutCalls.push(['isRegistered', shortcut]);
            return Promise.resolve(state.globalShortcutCalls.some(([op, s]) => op === 'register' && s === shortcut));
        },
        register: (shortcut) => {
            state.globalShortcutCalls.push(['register', shortcut]);
            return Promise.resolve();
        },
        unregister: (shortcut) => {
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

// react-beautiful-dnd's development-only mount validation throws inside jsdom
// when config-dependent children render a frame later; dragging itself is not
// under test, so a passthrough keeps rendering behaviour realistic.
vi.mock('react-beautiful-dnd', async () => {
    return {
        DragDropContext: ({ children }) => children,
        Droppable: ({ children }) =>
            children({
                innerRef: () => {},
                droppableProps: { 'data-rbd-droppable-id': 'droppable' },
                placeholder: null,
            }),
        Draggable: ({ children, draggableId, index }) =>
            children(
                {
                    innerRef: () => {},
                    draggableProps: { 'data-rbd-draggable-id': draggableId },
                    dragHandleProps: { 'data-rbd-drag-handle-draggable-id': draggableId, tabIndex: 0 },
                },
                { isDragging: false, index }
            ),
        DroppableProvided: {},
    };
});

beforeEach(() => {
    resetTauriState();
});

afterEach(() => {
    cleanup();
});

// jsdom lacks several browser APIs that NextUI / react-beautiful-dnd rely on.
if (!window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
    });
}
if (!window.ResizeObserver) {
    window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}
if (!window.confirm) {
    window.confirm = () => true;
}
