/**
 * Dev-only Tauri IPC mock for browser previews (`/preview.html`).
 *
 * Nothing in production imports this module — `vite build` only bundles the
 * four real window entries (see vite.config.ts). It exists so the real window
 * components can run in a plain browser and be screenshot-driven without a
 * running Tauri backend (see scripts/preview-shot.mjs).
 *
 * State can be driven per-load through query parameters:
 *   label=translate        window label (translate|config|screenshot)
 *   lang=en|zh_CN|zh_TW    app_language config value
 *   theme=light|dark       app_theme config value
 *   text=...               payload returned by the `get_text` command
 *   translation=...        canned translation returned by the mocked HTTP API
 *   config={"key":...}     extra config.json seed (URL-encoded JSON)
 * The page also exposes `window.__PAN_PREVIEW__` for live interaction
 * (emitText / setConfig / log / clipboard) from the screenshot driver.
 */

interface PreviewParams {
    label: string;
    language: string;
    theme: string;
    text: string;
    translation: string;
    width: number;
    height: number;
    config: Record<string, unknown>;
}

function readParams(): PreviewParams {
    const params = new URLSearchParams(window.location.search);
    const extraConfig: Record<string, unknown> = {};
    const rawConfig = params.get('config');
    if (rawConfig) {
        try {
            Object.assign(extraConfig, JSON.parse(rawConfig) as Record<string, unknown>);
        } catch {
            // malformed preview config: fall back to defaults
        }
    }
    const size = (params.get('size') ?? '350x420').split('x');
    return {
        label: params.get('label') ?? 'translate',
        language: params.get('lang') ?? 'en',
        theme: params.get('theme') ?? 'light',
        text: params.get('text') ?? '[INPUT_TRANSLATE]',
        translation: params.get('translation') ?? 'Hello preview',
        width: Number.parseInt(size[0] ?? '350', 10),
        height: Number.parseInt(size[1] ?? '420', 10),
        config: extraConfig,
    };
}

const preview = readParams();

// ── In-memory backend state ─────────────────────────────────────────────

const configStore: Record<string, unknown> = {
    app_language: preview.language,
    app_theme: preview.theme,
    translate_service_list: ['openai'],
    ...preview.config,
};

const clipboard: string[] = [];
const logs: string[] = [];

interface EventListenerEntry {
    event: string;
    id: number;
    callback: (evt: { event: string; id: number; payload: unknown }) => void;
}
const eventListeners: EventListenerEntry[] = [];

let nextResourceId = 10;
let nextCallbackId = 100;

const httpBodies = new Map<number, { status: number; body: Uint8Array }>();
const httpPulls = new Map<number, number>();

// ── IPC plumbing ────────────────────────────────────────────────────────

type Callback = (...args: unknown[]) => void;
const callbackStore = new Map<number, Callback>();

function transformCallback(callback: Callback): number {
    const id = ++nextCallbackId;
    callbackStore.set(id, callback);
    return id;
}

type InvokeArgs = Record<string, unknown>;

function num(args: InvokeArgs, key: string): number {
    return typeof args[key] === 'number' ? (args[key] as number) : 0;
}

function str(args: InvokeArgs, key: string): string {
    return typeof args[key] === 'string' ? (args[key] as string) : '';
}

const storeRids = new Map<number, Record<string, unknown>>();

const handlers: Record<string, (args: InvokeArgs) => unknown> = {
    // ── config store (plugin-store) ──────────────────────────────────────
    'plugin:store|load': () => {
        const rid = ++nextResourceId;
        storeRids.set(rid, configStore);
        return rid;
    },
    'plugin:store|get_store': () => ++nextResourceId,
    'plugin:store|entries': () => Object.entries(configStore),
    'plugin:store|get': (args) => {
        const key = str(args, 'key');
        return [configStore[key] ?? null, Object.hasOwn(configStore, key)];
    },
    'plugin:store|set': (args) => {
        configStore[str(args, 'key')] = args['value'];
        return null;
    },
    'plugin:store|save': () => null,
    'plugin:store|reload': () => null,
    'plugin:store|reset': () => {
        for (const key of Object.keys(configStore)) {
            delete configStore[key];
        }
        return null;
    },
    'plugin:store|delete': (args) => {
        delete configStore[str(args, 'key')];
        return null;
    },
    'plugin:store|has': (args) => Object.hasOwn(configStore, str(args, 'key')),
    'plugin:store|keys': () => Object.keys(configStore),
    'plugin:store|values': () => Object.values(configStore),

    // ── path / fs / os / app ─────────────────────────────────────────────
    'plugin:path|resolve_directory': () => 'C:\\Users\\Administrator\\AppData\\Roaming\\com.pan.desktop\\',
    'plugin:path|join': (args) => {
        const segments = Array.isArray(args['paths']) ? args['paths'].map(String) : [];
        return segments.filter((part) => part !== '').join('/');
    },
    'plugin:fs|watch': () => ++nextResourceId,
    'plugin:os|locale': () => 'en-US',
    'plugin:os|hostname': () => 'preview',
    'plugin:app|version': () => '4.2.0',

    // ── events ───────────────────────────────────────────────────────────
    'plugin:event|listen': (args) => {
        const cb = callbackStore.get(num(args, 'handler'));
        const id = ++nextResourceId;
        if (cb) {
            eventListeners.push({
                event: str(args, 'event'),
                id,
                callback: cb as (evt: { event: string; id: number; payload: unknown }) => void,
            });
        }
        return id;
    },
    'plugin:event|unlisten': (args) => {
        const id = num(args, 'id');
        const index = eventListeners.findIndex((entry) => entry.id === id);
        if (index >= 0) {
            eventListeners.splice(index, 1);
        }
        return null;
    },
    'plugin:event|emit': (args) => {
        const event = str(args, 'event');
        const payload = args['payload'];
        for (const entry of [...eventListeners]) {
            if (entry.event === event) {
                entry.callback({ event, id: entry.id, payload });
            }
        }
        return null;
    },
    'plugin:event|emit_to': (args) => {
        const event = str(args, 'event');
        const payload = args['payload'];
        for (const entry of [...eventListeners]) {
            if (entry.event === event) {
                entry.callback({ event, id: entry.id, payload });
            }
        }
        return null;
    },

    // ── backend commands (src/lib/ipc/commands.ts) ───────────────────────
    get_text: () => preview.text,
    reload_store: () => null,
    get_base64: () => '',
    set_proxy: () => true,
    unset_proxy: () => true,
    font_list: () => [],
    open_devtools: () => null,
    register_shortcut_by_frontend: () => null,
    unregister_shortcut_by_frontend: () => null,
    system_ocr: () => '',
    screenshot: () => null,
    cut_image: () => null,
    copy_img: () => null,
    lang_detect: () => 'en',
    update_tray: () => null,

    // ── plugins with side effects we only need to record ─────────────────
    'plugin:log|log': (args) => {
        logs.push(str(args, 'message'));
        return null;
    },
    'plugin:clipboard-manager|write_text': (args) => {
        clipboard.push(str(args, 'value'));
        return null;
    },
    'plugin:notification|notify': () => null,

    // ── plugin-http: canned OpenAI-compatible chat completion ────────────
    'plugin:http|fetch': () => {
        const rid = ++nextResourceId;
        httpBodies.set(rid, { status: 200, body: encodeBody(preview.translation) });
        return rid;
    },
    'plugin:http|fetch_send': (args) => {
        const rid = num(args, 'rid');
        const canned = httpBodies.get(rid) ?? { status: 200, body: encodeBody('') };
        const responseRid = ++nextResourceId;
        httpBodies.set(responseRid, canned);
        return {
            status: canned.status,
            statusText: 'OK',
            url: 'https://api.preview.invalid/v1/chat/completions',
            headers: { 'content-type': 'application/json' },
            rid: responseRid,
        };
    },
    'plugin:http|fetch_read_body': (args) => {
        const rid = num(args, 'rid');
        const canned = httpBodies.get(rid);
        // plugin-http treats the final byte as the stream-close signal; the
        // backend sends the payload once, afterwards only the close signal.
        const pull = httpPulls.get(rid) ?? 0;
        httpPulls.set(rid, pull + 1);
        if (pull === 0) {
            // Marker byte 0 = more data follows; the backend closes with [1].
            return [...(canned?.body ?? []), 0];
        }
        return [1];
    },
    'plugin:http|fetch_cancel': () => null,
    'plugin:http|fetch_cancel_body': () => null,
};

function encodeBody(translation: string): Uint8Array {
    const payload = {
        choices: [{ message: { role: 'assistant', content: translation } }],
    };
    return new TextEncoder().encode(JSON.stringify(payload));
}

const WINDOW_GETTERS: InvokeArgs = {
    'plugin:window|is_visible': true,
    'plugin:window|is_focused': true,
    'plugin:window|scale_factor': 1,
    'plugin:window|current_monitor': {
        name: '\\\\.\\DISPLAY1',
        size: { width: 2560, height: 1600 },
        position: { x: 0, y: 0 },
        workArea: { position: { x: 0, y: 0 }, size: { width: 2560, height: 1528 } },
        scaleFactor: 1,
    },
    'plugin:window|outer_position': { x: 100, y: 100 },
    'plugin:window|inner_position': { x: 100, y: 100 },
    'plugin:window|outer_size': { width: preview.width, height: preview.height },
    'plugin:window|inner_size': { width: preview.width, height: preview.height },
    'plugin:window|title': 'pan',
};

function invoke(cmd: string, args: InvokeArgs): Promise<unknown> {
    const handler = handlers[cmd];
    if (handler) {
        return Promise.resolve(handler(args));
    }
    if (cmd.startsWith('plugin:window|') || cmd.startsWith('plugin:webview|')) {
        if (cmd in WINDOW_GETTERS) {
            return Promise.resolve(WINDOW_GETTERS[cmd]);
        }
        // setters (show/hide/close/set_focus/set_always_on_top/...): succeed
        return Promise.resolve(null);
    }
    logs.push(`[mock] unhandled invoke: ${cmd}`);
    return Promise.resolve(null);
}

interface TauriInternals {
    invoke: (cmd: string, args: InvokeArgs, options?: unknown) => Promise<unknown>;
    transformCallback: (callback: Callback, once?: boolean) => number;
    unregisterCallback: (id: number, once?: boolean) => void;
    metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string };
    };
}

(window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
    invoke,
    transformCallback,
    unregisterCallback: (id: number) => callbackStore.delete(id),
    metadata: {
        currentWindow: { label: preview.label },
        currentWebview: { label: preview.label },
    },
} satisfies TauriInternals;

// plugin-os reads injected boot-time globals instead of invoking commands.
(window as unknown as Record<string, unknown>)['__TAURI_OS_PLUGIN_INTERNALS__'] = {
    eol: '\n',
    platform: 'windows',
    version: '10.0.26100',
    family: 'windows',
    os_type: 'windows',
    arch: 'x86_64',
    exe_extension: 'exe',
};

// ── Driver handle: live interaction without a page reload ───────────────

(window as unknown as Record<string, unknown>)['__PAN_PREVIEW__'] = {
    params: preview,
    log: logs,
    clipboard,
    config: configStore,
    /** Deliver a `new_text` event to the window (what hotkeys do natively). */
    emitText: (text: string) => {
        for (const entry of [...eventListeners]) {
            if (entry.event === 'new_text') {
                entry.callback({ event: 'new_text', id: entry.id, payload: text });
            }
        }
    },
    /** Update a config key in-place and broadcast `<key>_changed`. */
    setConfig: (key: string, value: unknown) => {
        configStore[key] = value;
        const event = `${key.replaceAll('.', '_').replaceAll('@', ':')}_changed`;
        for (const entry of [...eventListeners]) {
            if (entry.event === event) {
                entry.callback({ event, id: entry.id, payload: value });
            }
        }
    },
};
