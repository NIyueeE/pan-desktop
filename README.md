<!--
  Template README — placeholders are written as {{like_this}}.
  Replace every {{placeholder}} below before publishing, then delete this comment.
  The Chinese version lives in README.zh.md and must stay in sync.
-->

# rust-template

> {{one_line_description}}

[![CI](https://github.com/NIyueeE/rust-template/actions/workflows/ci.yml/badge.svg)](https://github.com/NIyueeE/rust-template/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

{{intro_paragraph}} A Rust project template featuring a strict lint policy and an
automated, layered check pipeline (pre-commit / pre-push / CI).

## Features

- **Latest stable toolchain** — `rust-toolchain.toml` declares `channel = "stable"`,
  so rustup always resolves the newest stable release on every machine, with
  `clippy` and `rustfmt` bundled as required components.
- **Strict lints** — `unsafe_code = "forbid"`, clippy `all` + `pedantic` at `deny`,
  plus `unwrap_used` / `expect_used` / `dbg_macro` denials (see
  [Lint policy](#lint-policy)).
- **Layered check gates** — fast gates (format, unused deps, docs↔code alignment,
  strict clippy) run before every commit; heavyweight gates (security audit,
  dependency policy, freshness, tests) run before every push; CI enforces the
  same chain.
- **Rust 2024 edition**.

## Prerequisites

- [rustup](https://rustup.rs) — the stable toolchain is resolved automatically
- [just](https://github.com/casey/just) — optional, for `just setup` / `just check`
- External linters used by the check gates:

  ```bash
  cargo install cargo-machete cargo-audit cargo-outdated cargo-deny
  ```

## Getting started

```bash
git clone https://github.com/NIyueeE/rust-template.git
cd rust-template

# one-time setup per clone: activate hooks + install missing tools
just setup   # (or manually: git config core.hooksPath githooks)

cargo run {{example_args}}
```

## Checks

Fast gates run before every commit, heavyweight gates before every push, and CI
runs the whole chain on every push / pull request via `just check`.

### On every commit — `githooks/pre-commit`

| # | Gate | Command | Purpose |
|---|------|---------|---------|
| 1 | fmt | `cargo fmt --all -- --check` | code style |
| 2 | machete | `cargo machete` | unused dependencies |
| 3 | docs | `githooks/check-docs` | README ↔ code alignment |
| 4 | clippy | `cargo clippy --all-targets --all-features -- -D warnings` | strict lints |

### On every push — `githooks/pre-push`

| # | Gate | Command | Purpose |
|---|------|---------|---------|
| 5 | audit | `cargo audit` | RustSec security advisories |
| 6 | deny | `cargo deny check` | licenses / bans / advisories policy |
| 7 | outdated | `cargo outdated --root-deps-only` | outdated direct dependencies |
| 8 | test | `cargo test --quiet` | test suite |

## Lint policy

Declared in the `[lints]` table of `Cargo.toml`:

| Lint | Level |
|------|-------|
| `unsafe_code` | forbid |
| `missing_docs` | warn |
| clippy `all` | deny |
| clippy `pedantic` | deny |
| clippy `unwrap_used` / `expect_used` / `dbg_macro` | deny |
| clippy `todo` | warn |

The hook additionally passes `-D warnings`, so every warning above — including
`missing_docs` and `todo` — becomes a hard error at commit time.

## Project layout

```
.
├── .github/
│   ├── dependabot.yml    # auto-bump actions + cargo deps (weekly)
│   └── workflows/
│       ├── ci.yml        # CI: runs `just check` on push / PR
│       └── release.yml   # tag push (v*) → binaries for 3 targets
├── Cargo.toml            # manifest + strict [lints] + package metadata
├── rust-toolchain.toml   # stable channel + clippy/rustfmt components
├── justfile              # just setup / just check
├── deny.toml             # cargo-deny policy (licenses / bans / advisories)
├── githooks/
│   ├── pre-commit        # fast gates: fmt, machete, docs, clippy
│   ├── pre-push          # heavy gates: audit, deny, outdated, test
│   └── check-docs        # README ↔ code alignment check
├── tests/
│   └── cli.rs            # smoke test for the template binary
├── LICENSE               # MIT OR Apache-2.0 (pointer)
├── LICENSE-MIT
├── LICENSE-APACHE
├── SECURITY.md
├── CONTRIBUTING.md
├── AGENTS.md
├── .editorconfig
└── src/
    └── main.rs
```

## Roadmap

- [ ] {{todo_1}}
- [ ] {{todo_2}}

## Contributing

{{contributing_guidelines}}

## License

Distributed under the MIT OR Apache-2.0 license. See [`LICENSE`](LICENSE) for details.

© 2026 {{author_name}} ({{author_email}})
