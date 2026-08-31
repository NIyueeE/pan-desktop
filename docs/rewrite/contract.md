# Legacy Frontend Contract (verified first-hand, 2026-08)

Source of truth for the Svelte 5 rewrite. Every item here was read directly
from the legacy sources (now removed; recoverable via `git show HEAD:<path>`).
Target design: see `design.md`.

## 1. IPC contract

### Commands (invoke) — `generate_handler!` in `src-tauri/src/main.rs`

| Command | Args | Returns | Caller |
|---|---|---|---|
| `get_text` | – | string | translate window (initial text, once-guard) |
| `reload_store` | – | void | config watcher path (fs watch), after restore/backup |
| `cut_image` | left, top, width, height (u32) | void | screenshot window (async) |
| `get_base64` | – | string | translate window OCR flow (async) |
| `copy_img` | width, height (usize) | void | (available; not called by current UI) |
| `system_ocr` | lang (string) | string | recognize/system service |
| `set_proxy` / `unset_proxy` | – | bool | backend-internal (startup) + available to UI |
| `open_devtools` | – | void | F12 in dev_mode |
| `register_shortcut_by_frontend` | name, shortcut | void (throws string) | hotkey page |
| `update_tray` | language ('' = keep), copyMode ('' = keep) | void | General (language), Translate page (auto_copy) |
| `screenshot` | x, y (monitor origin, i32) | void | screenshot window |
| `lang_detect` | text | string | `utils/lang_detect` |
| `font_list` | – | string[] | General page font selects |

Argument casing: JS camelCase (`copyMode`) ↔ Rust snake_case — unchanged.

### Events

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `new_text` | backend → translate window | string | text or `[INPUT_TRANSLATE]` / `[IMAGE_TRANSLATE]` markers |
| `success` | screenshot window → backend listener | – | region cut finished → `image_translate` |
| `<key>_changed` | any window → all | value | name: key with `.`→`_`, `@`→`:` + `_changed`; emitted by the window that writes |
| `tauri://blur` / `focus` / `move` / `resize` | backend → window | – | close-on-blur + position/size persistence |

### Store plugin

`Store.load(configDir/config.json)` — same instance shared Rust ↔ JS; every
window watches the file (`tauri-plugin-fs` `watch`, cargo feature `watch`) and
runs `store.reload()` + `refresh` + `invoke('reload_store')` on change.

## 2. Config key catalog

BACKEND-READ (must preserve name+shape): `hotkey_selection_translate`,
`hotkey_input_translate`, `hotkey_ocr_translate` (hotkey.rs);
`app_language`, `translate_auto_copy` (tray.rs labels + TRAY_KEYS reload);
`tray_click_event` (tray.rs:267); `proxy_enable`, `proxy_host`, `proxy_port`,
`no_proxy` (main.rs startup, cmd.rs set_proxy); `translate_window_width`,
`translate_window_height`, `translate_window_position`,
`translate_window_position_x/y` (window.rs); `translate_service_list`,
`recognize_service_list` (config.rs sanitize, `service@id` instance keys,
builtin allowlists openai / system,tesseract,openai).

Frontend-only: `app_theme`(system/light/dark), `app_font`, `app_font_size`,
`app_fallback_font`(REMOVED in rewrite), `transparent`, `dev_mode`,
`translate_source_language`(auto), `translate_target_language`(zh_cn),
`translate_second_language`(en), `incremental_translate`,
`dynamic_translate`(1s debounce), `translate_delete_newline`,
`translate_remember_language`, `hide_source`+`hide_language`(→ merged into
`translate_layout`: full/hide_language/hide_source/compact),
`translate_remember_window_size`, `translate_hide_window`,
`translate_close_on_blur`, `translate_always_on_top`,
`recognize_language`(auto), `recognize_delete_newline`,
`webdav_url/username/password/filename/auto_sync/last_sync`.

Service instance configs live under the instance key itself
(`openai@<id>`): translate openai = `instanceName, requestPath, model, apiKey,
stream, promptList[{role,content}], requestArguments(JSON string), enable`;
recognize openai = `instanceName, requestPath, model, apiKey, prompt, enable`;
system/tesseract = `enable` (+ legacy fields ignored).

Proxy note: `proxy_port` is stored as a NUMBER once set (empty string until
then); `set_proxy` does `as_i64`. `proxy_username`/`proxy_password` were dead
disabled inputs — removed in the rewrite.

## 3. Window behavior invariants

- **close-on-blur**: 300 ms delay, `isFocused()` re-check before close, blur
  suppressed within 800 ms of a programmatic focus (`focus.js`:
  `markProgrammaticFocus`/`shouldIgnoreBlur`). Move/focus cancel the pending
  close. Exactly ONE `set_focus` per interaction; never `.focused(true)`.
- **position/size persistence**: `tauri://move`/`resize` debounced 100 ms;
  physical→logical via monitor scale factor; only when the respective options
  are on. Position flip-at-screen-edge logic lives in Rust.
- **translate flow**: `get_text` once after OCR-related config settles →
  `handleNewText`; `new_text` listener. hide_window → hide instead of
  focus; detect language → atom sync → TargetAreas translate.
- **translation staleness**: per-card nanoid guard (`translateID[index]`);
  first setResult unhides the card; auto_copy on index 0 only
  (disable/source/target/source_target); notification when hide_window.
- **dynamic translate**: 1 s debounce while typing.
- **incremental**: append OCR results with a space.
- **screenshot**: fullscreen window → `screenshot(x,y)` → shows
  `convertFileSrc(cacheDir/pan_screenshot.png)` → drag rect (dpi =
  naturalWidth/screen.width) → `cut_image` → `emit('success')` → close.
  Right-click closes. Too-small rect → warn + close.
- **hotkeys**: page captures keydown (Backspace clears, modifier-only ignored,
  `formatHotkeyEvent` maps codes); conflict check `isRegistered` → reject;
  OK applies via `register_shortcut_by_frontend` (Rust unregisters old first —
  never silently lost); blur w/o OK restores draft after 150 ms; clear applies
  immediately.
- **WebDAV**: PROPFIND test (207/2xx), PUT with MKCOL-parent retry on
  404/409, Basic auth UTF-8-safe, 30 s timeout; backup payload
  `{app:'pan', type:'config-backup', version, timestamp, data}`; restore
  validates ONLY `type==='config-backup'` → **legacy pot backups must always
  restore**; full-replace semantics with rollback on failure; service lists
  sanitized after restore.
- **daemon**: auto backup every 10 min check / ≥1 h interval / +20 s initial;
  reads `webdav_auto_sync` + credentials, writes `webdav_last_sync`.

## 4. Simplification decisions (rewrite)

- `hide_source`+`hide_language` → single `translate_layout` select (migrated).
- Removed: `app_fallback_font`, dead `proxy_username`/`proxy_password` inputs.
- Proxy fields render only when proxy is enabled; enable validates host+port.
- One select per multi-state option everywhere (auto_copy, position, theme…).

## 5. Test infra (legacy → port)

`src/test/tauri-state.js` (dependency-free, dynamically imported inside
`vi.mock` factories): `fakeConfigFile` Map, `createFakeStore` (JSON
clone semantics), `eventListeners`/`emitTestEvent`/`listenerCount`,
`invokeHandlers`/`invokeCalls`/`setInvokeHandler`/`fakeInvoke` (throwing
handler rejects; defaults for get_text/get_base64/font_list), `windowState`
(label), `globalShortcutCalls`, `resetTauriState()`.
`setup.js` mocks all `@tauri-apps/*` with literal paths; mocks
react-beautiful-dnd (jsdom invariant). Suites: UndefinedSweep (7 pages × 3
config shapes × first-frame + settled), ServicePage, HotkeyPage,
TranslateWindow, focus.test, AboutPage, env.test (osType map + logo assets),
openai.test.js (OCR request builder), scripts/test-webdav.mjs (12 sections
incl. "Legacy pot backups still restore").

## 6. Backend invariants checklist

- [x] Command names/args unchanged (see §1)
- [x] `<key>_changed` naming unchanged
- [x] `service@id` instance keys + backend sanitize allowlists unchanged
- [x] All BACKEND-READ keys preserved (defaults.ts `BACKEND_READ_KEYS`)
- [x] `config-backup` type-only validation; pot backups restore
- [x] focus/blur bookkeeping semantics ported verbatim (`focus.ts`)
- [x] `--disable-features` browser args stay identical conf ↔ BROWSER_ARGS
- [x] plugin-os lowercase → normalized once in env.svelte.ts
- [x] Cross-origin HTTP only via `@tauri-apps/plugin-http`
- [x] `public/` assets untouched (tesseract v5 worker/core, logo/*.svg,
      icon.png/svg)
