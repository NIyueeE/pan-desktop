# AGENTS.md — Repository Rules

This file governs AI coding agents (and, equally, human contributors) working
in this repository. Read it fully before making any change; when resuming an
interrupted session, treat it as a fresh entry and redo the §1 self-check.
If this file contradicts the actual code, the code wins — and §3 requires
fixing the docs in the same change.

## 1. Entering the repository: routine self-check (every time)

Before touching anything, verify three things:

1. **pre-commit is enabled** — `git config core.hooksPath` must print
   `githooks`. If empty, run (prefer `just setup`, which also installs missing
   tools):

   ```bash
   git config core.hooksPath githooks
   ```

2. **hook dependencies are installed** — four external tools must be on PATH:

   ```bash
   command -v cargo-machete cargo-audit cargo-outdated cargo-deny
   ```

   Install whatever is missing (with `--locked`):

   ```bash
   cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
   ```

   Note: `cargo fmt` and `cargo clippy` are guaranteed by the components
   declared in `rust-toolchain.toml`; rustup installs them with the toolchain.

3. **toolchain** — `rust-toolchain.toml` declares `channel = "stable"`; rustup
   resolves the latest stable automatically. Never hardcode a version number
   and never bypass this file.

When in doubt about environment health, run `githooks/pre-commit` end to end
as a smoke test (the first run fetches the RustSec database; slowness is
normal).

## 2. Lint errors: waiver discipline

Principle: **fix the code first; a waiver is the last resort, and only
code-level.**

- Never "make errors disappear" by editing `Cargo.toml` `[lints]`,
  `githooks/pre-commit`, or any check command.
- When a waiver is truly needed, relax **in code only**:
  - prefer `#[expect(clippy::lint_name)]` (it starts producing a compile
    warning once the lint stops firing, preventing stale allows), fall back to
    `#[allow(clippy::lint_name)]`;
  - minimal scope: a single statement or one function; never function groups,
    module-level `#![allow(...)]`, or crate-level relaxation;
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
- The chain has two layers: **fast gates** (`githooks/pre-commit`: fmt /
  machete / docs / clippy) run on commit, **heavy gates**
  (`githooks/pre-push`: audit / deny / outdated / test) run on push; CI runs
  the whole chain via `just check`. All three are "the checks" and bound by
  this discipline.

## 3. Before every commit: docs ↔ code alignment (every commit)

- Verify the docs still tell the truth about the code:
  - lint tables in docs/lint-policy.md / docs/lint-policy.zh.md ↔
    `[lints]` in `Cargo.toml`;
  - gate tables in docs/checks.md / docs/checks.zh.md ↔ the actual commands in
    both hooks (`githooks/pre-commit` and `githooks/pre-push`);
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
  pre-commit chain. It only covers greppable invariants (hook commands ↔
  docs/checks, lint names ↔ docs/lint-policy, edition, channel, just recipes,
  README docs index, CI entry, CHANGELOG extraction). **Semantic alignment**
  (outdated prose, runnable examples, consistent tone) cannot be mechanized —
  it stays with the agent or a human reviewer.

## 4. Commit message convention

- **English only**, regardless of the author's language.
- Conventional Commits prefixes: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`, `ci:`, `perf:`.
- Subject line: imperative mood ("add", not "added"), ≤ 72 characters, no
  trailing period.
- Body (optional): explain **why**, wrap long lines; breaking changes append
  `!` to the type and carry a `BREAKING CHANGE:` footer.
- Every commit must pass the pre-commit gate — it runs automatically; do not
  use `--no-verify`.

## 5. Releases: changelog-driven, automated

- `CHANGELOG.md` is the **single source of release notes**, maintained in
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and
  following [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
- During development, record notable changes under `## [Unreleased]`.
- Before tagging, move that content into a dated section:
  `## [x.y.z] - YYYY-MM-DD` (the git tag is the same version with a `v`
  prefix, e.g. `v0.2.0`).
- Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:
  1. extracts the section matching the tag from `CHANGELOG.md` and uses it as
     the release notes,
  2. creates the GitHub Release,
  3. builds and attaches archives for three targets (x86_64-linux-gnu,
     aarch64-macOS, x86_64-windows-msvc).
- A missing or empty changelog section **fails the release**. Fix: add the
  section, delete and re-push the tag. Never hand-edit release notes on
  GitHub; the changelog is the source.

## 6. Deriving a new project from this template

- Click **Use this template**, then follow the rename checklist in
  docs/using-this-template.md. The three traps that break automation if
  missed:
  1. `Cargo.toml` — `name` / `repository`;
  2. `tests/cli.rs` — `env!("CARGO_BIN_EXE_rust-template")`;
  3. `.github/workflows/release.yml` — `bin: rust-template`.
- After renaming: `just setup` → `just check` → first commit (the pre-commit
  gate runs automatically and `just check` is the safety net for anything
  missed).
- Start the project changelog in `CHANGELOG.md` under `## [Unreleased]` (§5).

## 7. Day-to-day operations

- commit → fast gates; push → heavy gates; PR or push to `main` → CI runs the
  identical chain; branch protection on `main` requires the
  `full check chain` check, forbids force-pushes, and auto-deletes merged
  branches.
- Formatting: `just fmt` auto-fixes; `just check` rehearses the whole chain
  before committing.
- Maintenance: Dependabot opens weekly updates for GitHub Actions and cargo
  dependencies; they merge only with CI green.
- Security reports go through GitHub's private vulnerability reporting
  (SECURITY.md), never public issues.

## 8. Documentation map

| Question | Where |
|----------|-------|
| How to derive and rename a new project | docs/using-this-template.md |
| What each gate runs, how to handle a block | docs/checks.md |
| Lint levels and waiver rules | docs/lint-policy.md |
| Release mechanics | docs/release.md |
| What every file in this repo is for | docs/structure.md |

Every page has a `*.zh.md` counterpart; §3 governs their sync.

## 9. One-line summary

> Self-check the environment on entry; when a check blocks you, fix the code —
> waive only as a last resort, locally, with a named reason; keep docs and
> code in the same commit; write commit messages in English; let releases
> speak through CHANGELOG.md.
