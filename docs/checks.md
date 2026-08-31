# Checks

> English | [简体中文](checks.zh.md)

Fast gates run before every commit, heavyweight gates before every push, and CI
runs the whole chain on every push / pull request via `just check`.

## Tools

The gates use four external tools; `just setup` installs any that are missing
(and activates the git hooks):

```bash
cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
```

`cargo fmt` and `cargo clippy` come with the toolchain declared in
`rust-toolchain.toml`.

## On every commit — `githooks/pre-commit`

| # | Gate | Command | Purpose |
|---|------|---------|---------|
| 1 | fmt | `cargo fmt --all -- --check` | code style |
| 2 | machete | `cargo machete` | unused dependencies |
| 3 | docs | `githooks/check-docs` | docs ↔ code alignment |
| 4 | clippy | `cargo clippy --all-targets --all-features -- -D warnings` | strict lints |

## On every push — `githooks/pre-push`

| # | Gate | Command | Purpose |
|---|------|---------|---------|
| 5 | audit | `cargo audit` | RustSec security advisories |
| 6 | deny | `cargo deny check` | licenses / bans / advisories policy |
| 7 | outdated | `cargo outdated --root-deps-only` | outdated direct dependencies |
| 8 | test | `cargo test --quiet` | test suite |

## One-shot run

```bash
just check   # identical to hooks + CI
```

## When a gate blocks you

Fix the code first. A waiver is the last resort: code-level only
(`#[expect(...)]` preferred over `#[allow]`), minimal scope, with a reason
comment. Never weaken `[lints]`, the hooks, or CI. See
[Lint policy](lint-policy.md) and [AGENTS.md](../AGENTS.md).
