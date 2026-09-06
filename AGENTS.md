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
  commit, **heavy gates** (`githooks/pre-push`) run on push; the `check` job
  in `.github/workflows/ci.yml` runs the same chain on CI. All three are "the
  checks" and bound by this discipline. Gate tables:
  [docs/checks.md](docs/checks.md).

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

## 5. Testing: the feedback loop

> Principle: reproduce first, fix second, verify last. Tests come **before**
> code changes and **before** manual verification; every fix lands with a
> regression test (docs/config-only changes excepted).

1. **Understand the symptom** — which window, which service, what is
   observable (`Cannot read properties of undefined`, `languages.undefined`
   leaking into a dropdown, a hotkey that registers but does nothing, …).
2. **Build or reuse a reproduction test** next to the code, reusing
   `src/test/setup.ts` + `src/test/tauri-state.ts`. Seed through
   `fakeConfigFile` → `await initConfigStore()` → `render(Component)`;
   never seed via `setConfig()` (writes are debounced).
3. **Minimal fix** — touch the smallest surface; unrelated cleanup goes in
   its own commit.
4. **Full gate** — `bun run check` must exit 0 before committing.
5. **Prove the net catches it** — revert the fix (`git stash push <file>`),
   watch the new test fail, restore. A regression test that never fails is
   not a test.
6. **Mocks must be honest** — a mock returns what the real plugin returns, or
   tests stay green while the real machine fails.

The testing infrastructure quick facts (UndefinedSweep, unmount discipline,
bits-ui scroll-lock leakage) live in
[docs/invariants.md](docs/invariants.md).

## 6. Releases: tag-driven, automated

- **Releases are tag-driven.** Pushing a `VX.Y.Z` tag triggers
  `.github/workflows/release.yml`, which extracts the release notes, creates
  the GitHub Release and attaches the installers for all six targets. The
  check chain alone runs on every `main` push (ci.yml); platform verification
  without releasing is the Test build workflow (§7).
- Tag naming convention: **`VX.Y.Z`** with a capital `V` (e.g. `V4.3.0`);
  release.yml accepts `v*` as well.
- `CHANGELOG` (no extension) is the **single source of release notes**:
  release.yml extracts the `# X.Y.Z` section matching the pushed tag. A
  missing or empty section **fails the release** — write the section before
  tagging. Never hand-edit release notes on GitHub; the changelog is the
  source.
- **Version bump ritual** (a dedicated `chore(release): vX.Y.Z — …` commit):
    1. `package.json`, `src-tauri/tauri.conf.json` (+ `Cargo.toml` /
       `Cargo.lock` if touched) agree on `X.Y.Z` — release.yml's upload job
       overwrites them from the pushed tag anyway; `tauri.conf.json` is the
       effective installer-version source;
    2. `CHANGELOG` gains a top `# X.Y.Z` section;
    3. `com.pan.desktop.metainfo.xml` gains a `<release version="X.Y.Z" …>`
       entry (Linux package-manager metadata — without it users never see the
       new version);
    4. push `main` first, wait for CI, then push the tag.
- **Tag-push policy: no casual release pushes.** Agents never create or push
  release tags on their own initiative — an explicit human request, version
  agreement, a `CHANGELOG` section, and a green `just check` must all hold.
  Re-tagging is allowed only to fix a failed release (delete the tag, fix,
  re-push).

## 7. CD test builds: per-commit, per-platform artifacts

- `.github/workflows/test-build.yml` builds **test installers** for chosen
  platforms at an arbitrary commit without creating a release: dispatch it
  from the Actions tab, choose a `ref` (commit SHA, branch, or tag) and
  `targets` (`linux`, `macos`, `windows`), or
  `gh workflow run test-build.yml -f ref=<sha> -f targets=windows`.
- Artifacts are ephemeral (7-day retention) and are never a Release — do not
  hand out release links for them, and do not reference them in the
  changelog.
- Typical uses: verifying that a commit compiles and packages on a platform
  before tagging, and reproducing platform-specific issues on an exact
  commit.

## 8. Day-to-day operations

- commit → fast gates; push to `main` → heavy gates + CI (check chain);
  tag push → release (deliberate, §6); platform verification → Test build
  dispatch (§7). The remote keeps **only `main`** — push with
  `git push pan HEAD:main`; do not recreate feature branches there.
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

## 9. Working discipline (daily rules)

- **Stage with eyes open.** Review `git status` and stage selectively
  (`git add -p`); never blanket `git add -A`. One commit = one logical
  change.
- **main stays releasable.** CI red on main is the top priority — fix it
  before starting new work; experiments go to a branch.
- **No drive-by dependency upgrades.** Upgrades are Dependabot's job (or a
  dedicated commit); never bundle them into feature work — keep bisect clean.
- **CHANGELOG as you go.** A user-visible change and its `CHANGELOG` entry
  land in the same commit; never backfill at release time (§6).
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

## 10. Platform invariants: read before touching those paths

The codebase's load-bearing rules — the config-store two-channel discipline,
service-list sanitization, the legacy-pot-backup red line, Svelte 5
reactivity traps, async-command / hotkey-starvation, focus and WebView2
rules — are collected in
[docs/invariants.md](docs/invariants.md). They are "fix the code, never the
rule" cases; read the page before working on the related paths.

Windows hotkey / focus / IME problems have their own symptom → root-cause
map and dual-layer logging method:
[docs/windows-troubleshooting.md](docs/windows-troubleshooting.md); pull the
log from `%LOCALAPPDATA%\com.pan.desktop\logs\pan.log` (local timestamps).

## 11. Documentation map

| Question                                       | Where                           |
| ---------------------------------------------- | ------------------------------- |
| What each gate runs, how to handle a block     | docs/checks.md                  |
| Lint levels and waiver rules                   | docs/lint-policy.md             |
| Release mechanics, test builds                 | docs/release.md                 |
| What every file in this repo is for            | docs/structure.md               |
| Configuring services, WebDAV backup & sync     | docs/usage.md                   |
| Load-bearing platform invariants               | docs/invariants.md              |
| Windows hotkey / focus / IME debugging         | docs/windows-troubleshooting.md |
| Rewrite design decisions                       | docs/rewrite/design.md          |
| Legacy IPC / config contract to keep           | docs/rewrite/contract.md        |
| Current working state, decisions, open threads | HANDOFF.md                      |

Every `docs/*.md` page has a `*.zh.md` counterpart; §3 governs their sync.

## 12. One-line summary

> Self-check the environment on entry; when a check blocks you, fix the code —
> waive only as a last resort, locally, with a named reason; keep docs and
> code in the same commit; tests come before fixes; write commit messages in
> english; commits are free, release tags are deliberate; prove every claim
> with real output; end sessions clean; secrets never enter the repo.
