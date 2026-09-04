# AGENTS.md — Repository Rules

This file governs AI coding agents (and, equally, human contributors) working
in this repository. Read it fully before making any change; when resuming an
interrupted session, treat it as a fresh entry and redo the §1 self-check.
HANDOFF.md records the current working state (decisions, open threads) — read
it right after this file. If this file contradicts the actual code, the code
wins — and §3 requires fixing the docs in the same change.

## 1. Entering the repository: routine self-check (every time)

Before touching anything, verify four things:

1. **pre-commit is enabled** — `git config core.hooksPath` must print
   `githooks`. If empty, run (prefer `just setup`, which also installs missing
   tools):

    ```bash
    git config core.hooksPath githooks
    ```

2. **js dependencies are installed** — `bun install` (the repo locks
   `bun.lock`; `package.json` and `bun.lock` are always committed together).

3. **check tools are on PATH** — bun, node (>= 22), cargo, plus the four
   cargo gate tools:

    ```bash
    command -v bun node cargo cargo-machete cargo-audit cargo-outdated cargo-deny
    ```

    Install whatever is missing (with `--locked`):

    ```bash
    cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
    ```

    Note: `cargo fmt` and `cargo clippy` are guaranteed by the components
    declared in `rust-toolchain.toml`; rustup installs them with the toolchain.

4. **toolchain** — `rust-toolchain.toml` declares `channel = "stable"`; rustup
   resolves the latest stable automatically. Never hardcode a version number
   and never bypass this file.

When in doubt about environment health, run `githooks/pre-commit` end to end
as a smoke test (the first run fetches the RustSec database; slowness is
normal).

## 2. Lint errors: waiver discipline

Principle: **fix the code first; a waiver is the last resort, and only
code-level.**

- Never "make errors disappear" by editing `src-tauri/Cargo.toml` `[lints]`,
  `githooks/pre-commit`, or any check command.
- When a waiver is truly needed, relax **in code only**:
    - Rust: prefer `#[expect(clippy::lint_name)]` (it starts producing a compile
      warning once the lint stops firing, preventing stale allows), fall back to
      `#[allow(clippy::lint_name)]`;
    - JS/TS: a scoped `// eslint-disable-next-line <rule>` with a reason; svelte
      compiler ignores (`<!-- svelte-ignore code -->`) only where the compiler
      demands them, and the ignore code must stand alone in its comment;
    - minimal scope: a single statement or one function; never function groups,
      module-level `#![allow(...)]`, crate-level relaxation, or file-wide
      eslint disables;
    - a one-line reason comment at the waiver point is mandatory (plus a linked
      issue, if any).
- Only two legitimate scenarios:
    1. **genuinely unavoidable** — the business need demands it and no equally
       reasonable alternative exists;
    2. **upstream problems** — false positives, macro/derive-generated code, or
       audit noise from dependencies themselves (e.g. RustSec unmaintained
       notices).
- All other audits and extra checks (machete, audit, deny, outdated,
  docs-sync, and anything added later) follow the **same discipline**: fix if
  fixable; waive only as above when truly unfixable. Never delete, comment
  out, or bypass a check.
- The chain has two layers: **fast gates** (`githooks/pre-commit`) run on
  commit, **heavy gates** (`githooks/pre-push`) run on push; the `lint` job in
  `package.yml` runs the same chain on CI. All three are "the checks" and
  bound by this discipline. Gate tables: [docs/checks.md](docs/checks.md).

## 3. Before every commit: docs ↔ code alignment (every commit)

- Verify the docs still tell the truth about the code:
    - lint tables in docs/lint-policy.md / docs/lint-policy.zh.md ↔ `[lints]` in
      `src-tauri/Cargo.toml`;
    - gate tables in docs/checks.md / docs/checks.zh.md ↔ the `echo "==>"` gate
      labels in both hooks (`githooks/pre-commit`, `githooks/pre-push`);
    - README.md / README.zh.md as landing pages: quick-start commands, docs
      index links, and feature claims still hold;
    - toolchain description ↔ `rust-toolchain.toml`; layout ↔
      docs/structure(.zh).md; command examples; version numbers;
    - source doc comments (`//!` / `///`) ↔ actual behavior.
- Docs are bilingual pairs (`*.md` + `*.zh.md`) and must change together;
  never update one language only.
- Changing lint config or the check chain requires syncing the affected docs
  pages, both READMEs, and this file **in the same commit**.
- The mechanical part is automated in `githooks/check-docs`, wired into the
  pre-commit chain. It only covers greppable invariants (gate labels ↔
  docs/checks, lint names ↔ docs/lint-policy, edition, channel, just recipes,
  README docs index, CI chain greps, secret-scan gate, bilingual pairs).
  **Semantic alignment** (outdated prose, runnable examples, consistent tone)
  cannot be mechanized — it stays with the agent or a human reviewer.

## 4. Commit message convention

- **English only**, regardless of the author's language.
- Conventional Commits prefixes: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`, `ci:`, `perf:` — scope with the area (`hotkey`,
  `webdav`, `ui`, `config`, `translate`, `tauri`, `ci`, `hooks`, `docs`).
- Subject line: imperative mood ("add", not "added"), ≤ 72 characters, no
  trailing period.
- Body (optional): explain **why**, wrap long lines; breaking changes append
  `!` to the type and carry a `BREAKING CHANGE:` footer.
- Every commit must pass the pre-commit gate — it runs automatically; do not
  use `--no-verify`.

## 5. Test-driven feedback workflow (core loop)

> Principle: reproduce first, fix second, verify last. Tests come **before**
> code changes and **before** manual verification; every fix lands with a
> regression test (docs/config-only changes excepted).

1. **Understand the symptom** — which window, which service, what is
   observable (`Cannot read properties of undefined`, `languages.undefined`
   leaking into a dropdown, a hotkey that registers but does nothing, …).
2. **Build or reuse a reproduction test** next to the code
   (`src/windows/<area>/*.test.ts`, `src/lib/<area>/*.test.ts`), reusing
   `src/test/setup.ts` + `src/test/tauri-state.ts`. Seed through
   `fakeConfigFile` → `await initConfigStore()` → `render(Component)`;
   never seed via `setConfig()` (writes are debounced).
    - **UndefinedSweep**: walk the DOM right after `render()` and again after
      settling, to catch config-not-loaded-yet leaks
      (`src/windows/config/ConfigWindow.test.ts` is the model).
3. **Minimal fix** — touch the smallest surface; unrelated cleanup goes in its
   own commit.
4. **Full gate** — `bun run check` must exit 0 before committing.
5. **Prove the net catches it** — revert the fix (`git stash push <file>`),
   watch the new test fail, restore. A regression test that never fails is
   not a test.

## 6. Frontend invariants (do not break these)

- **Two config write channels.** `setConfig()` debounces, batches and
  broadcasts `<key>_changed`; `writeThrough()` persists immediately and
  cancels a pending write for the same key — required whenever the window may
  vanish mid-write (hotkey bindings, service-instance modal save/delete).
  Using `setConfig()` for a hotkey means the hotkey lands after the window
  is gone.
- **`setConfigRaw` rejects `undefined` / `null`.** Never bypass the store to
  `store.set(key, undefined)` — a cleared key leaks `prefix.undefined` through
  `t('prefix.${value}')` into dropdowns.
- **Service lists must be sanitized.** `translate_service_list` /
  `recognize_service_list` may contain keys of removed services (restored
  backups). Every consumer (`ServiceManager`, config modals, target/source
  dropdowns) degrades gracefully instead of crashing;
  `sanitizeServiceInstanceList` is the gate. Builtin names: `openai`
  (translate), `paddle` / `system` / `openai` (recognize).
- **Legacy pot backups must always restore.** Backup validation checks only
  `type: 'config-backup'` — never add an `app` field check. The regression
  case lives in `scripts/test-webdav.ts` ("Legacy pot backups still restore").
- **Svelte 5 reactivity traps.** `$effect` tracks synchronously: reading a
  freshly built array/object inside it re-runs the effect every frame (the
  fresh-array-deps trap). One-shot loading goes through `untrack(...)` or an
  once-guard boolean; non-reactive bookkeeping takes
  `// eslint-disable-next-line svelte/prefer-svelte-reactivity`
  (`src/windows/translate/App.svelte` carries the model comment). Seed
  `$state` from props through a closure function (`seededConfig()`), not a
  bare prop read.
- **Tests must `unmount()`.** `$effect` does not clean up across cases;
  `render()`'s `unmount()` is the only listener/DOM cleanup.
- **i18n.** New keys land in `src/lib/i18n/locales/en_US.json` /
  `zh_CN.json` / `zh_TW.json` (others fall back via `FALLBACK_CHAINS`); a new
  locale file must be registered in `LOCALE_FILES` inside
  `i18n.svelte.ts`. Keys go under `common.*` or a business namespace.
- **plugin-os returns lowercase** (`'windows' | 'macos' | 'linux'`); the
  codebase compares v1 names (`Windows_NT` / `Darwin` / `Linux`). The single
  normalization point is `normalizeOsType()` in `src/lib/utils/env.svelte.ts`.
- **Bun does not run node-shebang bins.** `bun run build` / `test:ui` /
  `tauri build` shell out to `vite` / `vitest` / `svelte-check` / the tauri
  CLI — all need Node.js >= 22 on PATH. `@tauri-apps/cli` stays in
  devDependencies or every `tauri build` dies with "command not found".

## 7. Backend invariants (do not break these)

- **Heavy work never runs on the main thread.** Every Tauri command that can
  exceed ~10 ms (full-screen capture, PNG encode, WinRT OCR `block_on`, file
  IO) must be `#[tauri::command(async)]`. WM_HOTKEY is dispatched by the main
  WndProc; a blocked event loop starves every global hotkey. Background
  WinRT threads must `CoInitializeEx(COINIT_MULTITHREADED)` first (the main
  thread is STA, owned by tao) — `system_ocr.rs` is the model.
- **No `unwrap()` on the hotkey / tray / window paths.** DPI anomalies,
  display enumeration and window-attribute failures are real on Windows and
  they kill the process silently. Use `let _ = ...` plus `log::warn!`.
- **tao `set_focus()` injects synthetic ALT keystrokes** when
  `SetForegroundWindow` is refused — it breaks IME composition and steals
  focus back. Focus the translate window on demand, once, after checking
  `isVisible()` / `isFocused()`; never chain `.focused(true)` on hidden
  window creation.
- **The close-on-blur three-layer protection is load-bearing**: the 800 ms
  programmatic-focus grace (`src/windows/translate/focus.ts`), the
  `isFocused()` recheck before confirming a blur, and drag/focus cancel.
  WebView2 oscillates focus on transparent borderless windows; a bare blur
  timer closes the window under the user's hands.
- **`tauri.windows.conf.json` `additionalBrowserArgs` must stay in sync with
  `BROWSER_ARGS` in `src-tauri/src/window.rs`** (WebView2 shares one process
  across windows). Never add `--disable-web-security` to the daemon window:
  WebView2 then drops the `Origin` header and the IPC layer rejects every
  invoke (white screen, `missing Origin header`).
- **Plugin command "not found" triage order**: ① `generate_handler!`
  registration, ② cargo feature gate (`tauri-plugin-fs` ships `watch`
  behind a non-default feature), ③ capabilities coverage for the window
  label.
- **`tauri-plugin-log` timestamps use `TimezoneStrategy::UseLocal`** — do not
  regress to UTC when touching the logger.

## 8. Releases: tag-driven, automated

- **Releases are tag-driven.** Pushing any tag triggers
  `.github/workflows/package.yml`; every `main` push runs the same pipeline
  as a verification build (no Release). Only tag pushes upload assets.
- Tag naming convention: **`VX.Y.Z`** with a capital `V` (e.g. `V4.3.0`).
- `CHANGELOG` (no extension) is the **single source of release notes**: the
  workflow extracts the first `# X.Y.Z` section via awk into
  `RELEASE_NOTES.md`. A missing or empty section yields empty release notes —
  write the section before tagging.
- **Version bump ritual** (a dedicated `chore(release): vX.Y.Z — …` commit):
    1. `package.json`, `src-tauri/tauri.conf.json` (+ `Cargo.toml` /
       `Cargo.lock` if touched) agree on `X.Y.Z` — CI's `change-version` job
       overwrites them from the latest tag anyway; `tauri.conf.json` is the
       effective installer-version source;
    2. `CHANGELOG` gains a top `# X.Y.Z` section;
    3. `com.pan.desktop.metainfo.xml` gains a `<release version="X.Y.Z" …>`
       entry (Linux package-manager metadata — without it users never see the
       new version);
    4. push `main` first, wait for the verification build, then push the tag.
- **Tag-push policy: no casual release pushes.** Agents never create or push
  release tags on their own initiative — an explicit human request, version
  agreement, a `CHANGELOG` section, and a green `just check` must all hold.
  Re-tagging is allowed only to fix a failed release (delete the tag, fix,
  re-push).

## 9. Day-to-day operations

- commit → fast gates; push to `main` → heavy gates + CI + verification
  builds; tag push → release (deliberate, §8). The remote keeps **only
  `main`** — push with `git push pan HEAD:main`; do not recreate feature
  branches there.
- Formatting: `just fmt` auto-fixes; `just check` rehearses the whole chain.
  Prettier also checks `AGENTS.md`, `README*.md`, `CHANGELOG`, `*.yml` and
  `*.json` — run `bun run format:fix` after touching any of them.
- Dependencies: js side through `bun add` / `bun remove` (never hand-edit
  `package.json` without refreshing `bun.lock`); rust side through
  `cargo add` / `cargo remove` against `src-tauri` (never hand-edit the
  `[dependencies]` tables — hand-written specs drift from `Cargo.lock` and
  trip the dependency gates).
- Maintenance: Dependabot opens weekly updates for GitHub Actions, bun and
  cargo dependencies; they merge only with CI green.
- Security reports go through GitHub's private vulnerability reporting
  (SECURITY.md), never public issues.

## 10. Working discipline (daily rules)

- **Stage with eyes open.** Review `git status` and stage selectively
  (`git add -p`); never blanket `git add -A`. One commit = one logical
  change.
- **main stays releasable.** CI red on main is the top priority — fix it
  before starting new work; experiments go to a branch.
- **No drive-by dependency upgrades.** Upgrades are Dependabot's job (or a
  dedicated commit); never bundle them into feature work — keep bisect clean.
- **CHANGELOG as you go.** A user-visible change and its `CHANGELOG` entry
  land in the same commit; never backfill at release time (§8).
- **Prove it, don't assume it.** Every "it works" claim must be backed by
  real command output from this session; no output, no claim.
- **No corpses.** Commented-out code and `todo!()` stubs get removed, not
  accumulated (the `todo` lint already denies).
- **End-of-session ritual.** A session ends with `just fmt` + `just check`,
  everything committed and pushed — never a dirty tree, never unpushed
  commits.
- **Timebox rabbit holes.** Three failed attempts on the same problem: stop,
  write the findings into HANDOFF.md, and ask the human.
- **Clear → act; ambiguous or irreversible → ask.** Renames, deletions,
  settings changes, and anything touching releases need the human's go.
- **Secrets never enter the repository.** Tokens, keys, and credentials live
  in repo settings / environment only. Enforced mechanically by
  `githooks/check-secrets`; a line that must carry a secret-shaped string
  takes a `security-scan:allow` marker with a reason.

## 11. Windows debugging: start at the handbook

Hotkey, focus, IME and window-lifetime problems on Windows have a
symptom → root-cause map, a dual-layer logging method (native
`on_window_event` + webview events) and a set of source-verified tao /
global-hotkey / plugin conclusions, kept in
[docs/windows-troubleshooting.md](docs/windows-troubleshooting.md). Read it
before guessing; pull the log from
`%LOCALAPPDATA%\com.pan.desktop\logs\pan.log` (local timestamps).

## 12. Documentation map

| Question                                       | Where                           |
| ---------------------------------------------- | ------------------------------- |
| What each gate runs, how to handle a block     | docs/checks.md                  |
| Lint levels and waiver rules                   | docs/lint-policy.md             |
| Release mechanics                              | docs/release.md                 |
| What every file in this repo is for            | docs/structure.md               |
| Windows hotkey / focus / IME debugging         | docs/windows-troubleshooting.md |
| Rewrite design decisions                       | docs/rewrite/design.md          |
| Legacy IPC / config contract to keep           | docs/rewrite/contract.md        |
| Current working state, decisions, open threads | HANDOFF.md                      |

Every `docs/*.md` page has a `*.zh.md` counterpart; §3 governs their sync.

## 13. One-line summary

> Self-check the environment on entry; when a check blocks you, fix the code —
> waive only as a last resort, locally, with a named reason; keep docs and
> code in the same commit; tests come before fixes; write commit messages in
> english; commits are free, release tags are deliberate; prove every claim
> with real output; end sessions clean; secrets never enter the repo.
