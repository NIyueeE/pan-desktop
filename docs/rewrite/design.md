# Svelte 5 Rewrite — Target Design

Status: draft v1 (simplification table finalized after `contract.md` lands).

## Goals (in priority order)

1. **Cold-start latency** for hotkey-triggered windows (translate, screenshot).
2. **Simplified controls** — fewer options, correct widget per option cardinality.
3. **Backend + config.json compatibility** — no breaking change to IPC shapes or config keys the backend reads.
4. Full quality gates on **bun**.

## Stack (verified compatible on npm, 2026-08)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Svelte 5.57 (runes) | fine-grained signals, no VDOM |
| Build | Vite 8 + @sveltejs/vite-plugin-svelte 7.3 | MPA, one HTML entry per window |
| Language | TypeScript ~5.9 (svelte-check 4.7 supports ^5\|\|^6; TS 7 NOT yet) | strict |
| Styling | Tailwind CSS 4.3 via @tailwindcss/vite | no tailwind.config, no postcss.config |
| Primitives | bits-ui 2.19 | Select / Dialog / Tooltip / Popover only |
| DnD | svelte-dnd-action 0.9.79 | replaces archived react-beautiful-dnd |
| Icons | @lucide/svelte | tree-shaken per-icon |
| i18n | i18next 26 | lazy per-locale dynamic import |
| Toasts | svelte-sonner 1.2 | tiny |
| OCR | tesseract.js 7 | dynamic import at recognize time |
| Tests | vitest 4 + @testing-library/svelte 5 + jest-dom 7 + jsdom 30 | ported mock infra |
| Lint/format | eslint 10 + eslint-plugin-svelte 3 + typescript-eslint; prettier 3.9 + prettier-plugin-svelte 4; svelte-check | |
| Pkg mgr | bun 1.4 | `bun install`, lockfile `bun.lock` |

Kept as-is (they are the backend binding, not legacy frontend code): all `@tauri-apps/*` packages (versions unchanged, matching Tauri 2.11 backend).

## Entries — one HTML per window (perf)

| Entry | Loads | Old behavior |
|---|---|---|
| `translate.html` | translate window only | all windows parsed one shared bundle |
| `config.html` | config window only | |
| `screenshot.html` | overlay only | |
| `daemon.html` | plain TS scheduler, no Svelte runtime | already separate |

`index.html` is deleted. Backend `window.rs::build_window` switches from hardcoded `index.html` to `format!("{label}.html")`. `tauri.conf.json` `frontendDist` stays `../dist`.

## Directory layout

```
src/
  lib/
    ipc/commands.ts        # typed invoke wrappers (one per backend command)
    ipc/events.ts          # typed listen/emit helpers (new_text, success, <key>_changed)
    config/defaults.ts     # ALL config keys: type, default, backend-read flags
    config/store.svelte.ts # reactive snapshot store (see below)
    i18n/index.ts          # i18next init, lazy locale loading
    i18n/locales/*.json    # carried over from legacy (data, not legacy code)
    services/translate/openai.ts        # URL normalize + SSE parser + prompt templates
    services/recognize/{system,tesseract,openai}.ts
    services/types.ts      # TranslateService / RecognizeService interfaces
    utils/{env,language,lang_detect,service_instance,webdav,format}.ts
    ui/                    # shared Svelte components (SettingRow, Card, …)
  windows/
    translate/main.ts + App.svelte + components/
    config/main.ts + App.svelte + pages/ + components/
    screenshot/main.ts + App.svelte
    daemon/main.ts
  test/
    tauri-state.ts         # ported mock state (framework-agnostic)
    tauri-mocks.ts         # vi.mock factories for @tauri-apps/*
    setup.ts
  app.css                  # Tailwind 4 @theme tokens + dark palette
```

## Reactive config store (the core perf piece)

`src/lib/config/store.svelte.ts`:

- Boot: `Store.load(configDir/config.json)` (plugin returns the shared instance), then **one** `store.entries()` call → `$state` snapshot `values: Record<string, unknown>`. Legacy did one `store.get` IPC *per key per hook* (30+ serialized round-trips per window).
- `cfg<T>(key, default)` — synchronous reactive read from the snapshot; defaults live in `defaults.ts` (single source of truth).
- `setCfg(key, value)` — updates snapshot immediately (UI never waits), then debounced 500 ms `store.set` + `store.save` + `emit('<key>_changed', v)` (same event naming as legacy: `.`→`_`, `@`→`:`).
- `trackConfigKeys([...keys])` — registers `<key>_changed` listeners once per window (parallel `Promise.all` at boot) so live edits from other windows merge in. Static per-window key lists; no per-hook listeners.
- fs watcher on `config.json` (plugin-fs `watch`, feature already enabled): `store.reload()` + re-`entries()` + `invoke('reload_store')` — one bulk refresh replaces legacy per-key sync on restore.

## Window behavior contracts (must not regress)

- **translate close-on-blur**: 300 ms delay + `isFocused()` re-check before close + 800 ms programmatic-focus grace (`focus.ts` ported verbatim). One `set_focus` per interaction, never on window creation.
- **translate window persistence**: position (`mouse` flip logic lives in Rust) / size, `tauri://move` + `tauri://resize` debounced 100 ms writes.
- **new_text flow**: `invoke('get_text')` once after config settles (once-guard) + `new_text` event listener; `[INPUT_TRANSLATE]` / `[IMAGE_TRANSLATE]` markers preserved.
- **OCR flow**: `get_base64` → recognize service → `sourceText` update (same shapes).
- **screenshot**: fullscreen overlay, region select → `cut_image(l,t,w,h)` → `success` event → `image_translate`.
- **hotkeys**: `register_shortcut_by_frontend(name, shortcut)`; empty string clears; conflict → keep old binding; page shows per-row error.
- **WebDAV backup/restore**: validation checks ONLY `type: 'config-backup'`; legacy pot backups (`app: 'pot'`) must always restore (regression-tested).
- **daemon auto-backup**: every 10 min check, ≥1 h between uploads, first run +20 s. Reads `webdav_auto_sync`, `webdav_url`, `webdav_username`, `webdav_password`, `webdav_filename`, writes `webdav_last_sync`.
- **osType**: plugin-os v2 lowercase → normalized to legacy names (`Windows_NT`/`Darwin`/`Linux`) in `utils/env.ts`; `public/logo/*.svg` names unchanged.
- **HTTP**: every cross-origin request goes through `@tauri-apps/plugin-http` `fetch` (never `window.fetch`).

## i18n

- All 21 locale JSONs carried over (legacy shipped 19; `ta_IN`/`tk_TM` were present but never wired — now wired via lazy loader).
- Load `en_US` + current language only; fallback chains preserved (`zh_tw↔zh_cn`, `pt_pt↔pt_br`, default `en`).
- Namespaces unchanged (`common`, `config`, `services`, `translate`, `languages`, …) so keys and JSON stay diff-compatible.

## Theme

Hand-rolled (drops `next-themes`): `app_theme` (`system|light|dark`) → `.dark` class on `<html>` + `matchMedia('(prefers-color-scheme: dark)')` listener. Palette tokens (background/content1/content2/primary/default-*) defined as Tailwind 4 `@theme` CSS vars matching the NextUI look so window visuals stay familiar.

## Simplified controls

Per-option decisions live in `contract.md` §5 once finalized; principles applied:

- One multi-state option → one Select/segmented control (never a group of switches).
- Options that only matter in one mode are shown/hidden by that mode instead of being always visible.
- Niche options with no backend reader and no sane tuning value get removed outright (config key stays, default applies).
- Single confirmation buttons; no nested OK/OK flows.

## Test plan

| Suite | Ported from | Focus |
|---|---|---|
| `config-store.test.ts` | new | snapshot boot, debounced save, `_changed` merge, undefined-guard |
| `TranslateWindow.test.ts` | TranslateWindow.test.jsx | `languages.undefined` sweep, new_text flow |
| `focus.test.ts` | focus.test.js | blur grace bookkeeping (verbatim port) |
| `ServicePage.test.ts` | ServicePage.test.jsx | sanitize degradation, modals list all builtins, VLM endpoint present |
| `HotkeyPage.test.ts` | HotkeyPage.test.jsx | focus retention, OK apply, clear, conflict reject/restore |
| `AboutPage.test.ts` | AboutPage.test.jsx | brand pins (fork GitHub link only) |
| `env.test.ts` | env.test.js | osType map + `public/logo/*.svg` existence (negative assertions) |
| `openai.test.ts` | openai.test.js + new | URL completion, Bearer, `$lang` substitution, default prompt fallback, SSE line-buffer parser |
| `scripts/test-webdav.ts` | test-webdav.mjs | 17 sections incl. "Legacy pot backups still restore", run by `bun` |

## Backend changes (minimal, perf-motivated)

1. `window.rs`: per-window URL `{label}.html`.
2. `tauri.conf.json`: drop `--disable-web-security` from the daemon window (Windows override `tauri.windows.conf.json` already carries the correct `--disable-features` args; aligns with the AGENTS.md red line and makes base config platform-honest).
3. Audit `#[tauri::command(async)]` coverage on heavy commands (screenshot/system_ocr/cut_image/get_base64); add where missing and safe.
4. No IPC shape changes; no config-key removals.

## Gates

`bun run check` = `format` (prettier+cargo fmt) + `lint` (eslint+cargo clippy `-D warnings`) + `svelte-check` + `test` (webdav + vitest + cargo test) + `build` (vite) + `cargo check`. CI (`package.yml`) switches pnpm→bun (setup-bun), same job DAG.
