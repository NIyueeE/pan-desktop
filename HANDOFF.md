# HANDOFF.md — working state for agents

Agent-facing handoff notes. AGENTS.md owns the **rules**; this file owns the
**state**: where the project stands, which decisions were made and why, and
what is still open. Update this file (in the same commit) whenever you change
something the next session needs to know.

## Quick orientation

- What this repo is: **pan** (`com.pan.desktop`, binary `pan`) — a lean
  translation desktop app derived from the `rust-agents-template`, keeping
  selection / input / OCR translation only, with an OpenAI Chat Completions
  compatible backend. Lineage: [pot-app/pot-desktop](https://github.com/pot-app/pot-desktop)
  (GPL-3.0 inherited; upstream pot WebDAV backups must keep restoring).
- Read order: AGENTS.md (rules) → this file (state) → docs/ (topic pages) →
  docs/rewrite/ (design + legacy contract).
- Local loop: `bun install` → `just setup` (once) → `just check` → commit/push.
- Tests: `just test` (webdav suite + vitest + cargo test).

## Current state (2026-09-05)

- Version **4.3.0** (`package.json` / `src-tauri/tauri.conf.json` / `CHANGELOG`
  top section `# 4.3.0`).
- The repository history was **rebuilt on the rust-agents-template lineage**:
  the template's own history is the ancestor, and the app "grew" on top of it
  in documented steps. The pre-rebuild history (pot upstream + early fork
  commits) and all tags (`0.0.1` … `V4.3.0`, `updater`) were retired; a full
  bundle backup exists outside the repo.
- Stack: Tauri 2.11 (Rust 2024 edition, MSRV 1.97) + Svelte 5 (runes) +
  TypeScript strict + Vite 8 (four window entries) + Tailwind 4 + vitest 4;
  Bun as package manager / script entry, Node >= 22 as the bin runtime.
- Gates: pre-commit fast gates and pre-push heavy gates live in `githooks/`;
  `package.yml`'s `lint` job runs the same chain on CI and every push builds
  the installers (release upload only on tags).
- OCR: PaddleOCR PP-OCRv5 (ONNX via `ort`, models fetched at build time by
  `scripts/fetch-paddle-models.sh`) → system OCR → optional OpenAI-compatible
  VLM, degrading in order.

## Decision log (why things are the way they are)

- **GPL-3.0-only**, inherited from the pot-desktop lineage — do not relicense.
- **`CHANGELOG` stays extension-less** and `package.yml` untouched: the
  release-notes awk extraction and the `# X.Y.Z` section format are coupled to
  CI. This is the one deliberate divergence from the template's
  Keep-a-Changelog `CHANGELOG.md` convention.
- **Bilingual docs** (`*.md` + `*.zh.md`) — user preference; mechanically
  enforced by `check-docs` for top-level docs pages.
- clippy `pedantic` at `deny` plus `-D warnings` — the strict variant was
  chosen over a warn baseline; `nursery` stays warn (escalated by `-D
warnings`) because nursery noise fluctuates between rustc releases.
- cargo-deny runs **alongside** cargo audit on purpose; do not deduplicate.
- Paddle is the default OCR with graceful degradation; the ONNX runtime and
  models are build-time fetched, never committed (only `ppocrv5_dict.txt` is
  versioned, so the CTC decode test runs in plain `cargo test`).
- The browser preview harness (`preview.html` + `src/preview/` +
  `scripts/preview-shot.mjs`) is dev-only: the vite build still emits exactly
  the four window entries.
- README roadmap: none — open items live in this file.

## Open threads

- cargo-deny license allow-list: validated against the current dependency
  graph on 2026-09-05; a new dependency with a license outside the list needs
  a deliberate row (with a comment) rather than a waiver.
- Packaging legs beyond Linux were only exercised through CI; local machines
  cannot cross-build MSVC/macOS targets (`ring` blocks `cargo check
--target x86_64-pc-windows-msvc` — don't try, watch the CI jobs).
- Consider tag-protection rulesets (restrict `V*` creation) if the repo gains
  collaborators.
- cargo-nextest: revisit when the suite grows past ~10 test binaries; for now
  plain `cargo test` is fine.

## Gotchas

- Renaming the package can leave a stale `src-tauri/target/` cache that makes
  `cargo test` fail with `Os { code: 2, NotFound }` (cached test binary points
  at the old bin path). `cargo clean -p <name>` — or touching the test —
  fixes it locally; fresh checkouts and CI are unaffected.
- Changing deps must go through `bun add` / `cargo add` so the lockfile
  refreshes in the same commit; CI fails with "lockfile out of sync"
  otherwise. `package.json` + `bun.lock` always commit together.
- bits-ui Dialog scroll-lock can leak `pointer-events: none` onto
  `document.body` across vitest cases (the recovery timer is real-time); the
  test setup scrubs body inline styles around every case. If a "ghost
  pointer-events" failure appears, suspect cross-test leakage, not the
  component.
- `HotKey already registered` at startup = an old instance is still running —
  exit it from the tray before testing a new build.
- The log file on Windows is `%LOCALAPPDATA%\com.pan.desktop\logs\pan.log`
  (not %APPDATA%), with local timestamps.
