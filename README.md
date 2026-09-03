# pan

> A lean translation desktop app - selection / input / OCR translate, on Tauri 2 + Svelte 5.

[![CI](https://github.com/NIyueeE/pan-desktop/actions/workflows/package.yml/badge.svg)](https://github.com/NIyueeE/pan-desktop/actions/workflows/package.yml)
[![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

An opinionated, batteries-included starting point for new Rust binary projects —
featuring a strict lint policy and an automated, layered check pipeline
(pre-commit / pre-push / CI).

## Features

- **Latest stable toolchain** — `rust-toolchain.toml` declares `channel = "stable"`,
  so rustup always resolves the newest stable release on every machine, with
  `clippy` and `rustfmt` bundled as required components.
- **Strict lints** — clippy `all` + `pedantic` at `deny` with `-D warnings`
  (see [Lint policy](docs/lint-policy.md)).
- **Layered check gates** — fast gates before every commit, heavyweight gates
  before every push, CI enforcing the same chain (see [Checks](docs/checks.md)).
- **Tag-driven releases** — tauri bundles for macOS / Windows / Linux on every
  push; installers attach to the GitHub Release on a tag push
  (see [Release](docs/release.md)).
- **Rust 2024 edition**.

## Quick start

```bash
git clone https://github.com/NIyueeE/pan-desktop.git
cd pan-desktop

bun install      # js dependencies (Bun + Node.js >= 22 required)

# one-time setup per clone: activate hooks + install missing tools
just setup   # (or manually: git config core.hooksPath githooks)

bun run tauri dev

# run the full check chain any time — identical to hooks + CI
just check
```

## Documentation

| Document                                   | Content                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| [docs/checks.md](docs/checks.md)           | the fourteen gates, layered hooks, CI                 |
| [docs/lint-policy.md](docs/lint-policy.md) | every lint and its level, waiver rules                |
| [docs/release.md](docs/release.md)         | tagging → multi-platform installers                   |
| [docs/structure.md](docs/structure.md)     | what every file in this repo is for                   |
| [HANDOFF.md](HANDOFF.md)                   | agent handoff: current state, decisions, open threads |
| [CONTRIBUTING.md](CONTRIBUTING.md)         | how to contribute                                     |
| [SECURITY.md](SECURITY.md)                 | reporting vulnerabilities                             |
| [AGENTS.md](AGENTS.md)                     | rules for AI coding agents (and humans)               |

Each document has a `*.zh.md` 简体中文 counterpart.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Distributed under the GPL-3.0-only license, inherited from the
[pot-desktop](https://github.com/pot-app/pot-desktop) lineage this project
grew out of. See [`LICENSE`](LICENSE) for details.

© 2026 NIyueeE (100502009+NIyueeE@users.noreply.github.com)
