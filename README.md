<!--
  Landing-page README — details live in docs/ (modular, bilingual).
  Placeholders are written as {{like_this}}; replace before publishing.
  Keep README.md and README.zh.md in sync.
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
- **Strict lints** — `unsafe_code = "forbid"`, clippy `all` + `pedantic` at `deny`
  (see [Lint policy](docs/lint-policy.md)).
- **Layered check gates** — fast gates before every commit, heavyweight gates
  before every push, CI enforcing the same chain (see [Checks](docs/checks.md)).
- **One-tag releases** — multi-platform binaries built on `v*` tags
  (see [Release](docs/release.md)).
- **Rust 2024 edition**.

## Quick start

```bash
git clone https://github.com/NIyueeE/rust-template.git
cd rust-template

# one-time setup per clone: activate hooks + install missing tools
just setup   # (or manually: git config core.hooksPath githooks)

cargo run {{example_args}}

# run the full check chain any time — identical to hooks + CI
just check
```

## Documentation

| Document | Content |
|----------|---------|
| [docs/checks.md](docs/checks.md) | the eight gates, layered hooks, CI |
| [docs/lint-policy.md](docs/lint-policy.md) | every lint and its level, waiver rules |
| [docs/release.md](docs/release.md) | tagging → multi-platform binaries |
| [docs/structure.md](docs/structure.md) | what every file in this repo is for |
| [CONTRIBUTING.md](CONTRIBUTING.md) | how to contribute |
| [SECURITY.md](SECURITY.md) | reporting vulnerabilities |
| [AGENTS.md](AGENTS.md) | rules for AI coding agents (and humans) |

Each document has a `*.zh.md` 简体中文 counterpart.

## Roadmap

- [ ] {{todo_1}}
- [ ] {{todo_2}}

## Contributing

{{contributing_guidelines}}

## License

Distributed under the MIT OR Apache-2.0 license. See [`LICENSE`](LICENSE) for details.

© 2026 {{author_name}} ({{author_email}})
