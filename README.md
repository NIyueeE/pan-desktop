# pan

> Selection / input / OCR translation — a lean, cross-platform desktop app
> built on Tauri 2 + Svelte 5.

[![CI](https://github.com/NIyueeE/pan-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/NIyueeE/pan-desktop/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

**pan** is an open-source translation desktop app: select a word, type a
sentence, or box a region of the screen, and read the translation instantly.
It bundles its own OCR, dictionary, and text-to-speech; every translate /
recognize / speak backend speaks the OpenAI Chat Completions protocol, and
the whole configuration can be backed up and synced to any WebDAV service.
Runs on Windows, macOS, and Linux.

## Features

- **Three ways to grab text** — selection via a global hotkey, typing into
  the window, or OCR of a screen region.
- **Bundled PaddleOCR PP-OCRv5** — recognizes mixed simplified / traditional
  Chinese, English, and Japanese with nothing to install; degrades to the
  system OCR, then to an optional OpenAI-compatible VLM.
- **OpenAI-compatible backends** — translation, OCR (VLM), and TTS all
  accept any Chat Completions-compatible endpoint (OpenAI, DeepSeek,
  self-hosted gateways, …); prompts support `$text` / `$from` / `$to` /
  `$detect` variables.
- **Dictionary & pronunciation** — dictionary cards with phonetics, exam
  tags, POS definitions, WordNet senses, and word forms; one-click reading
  of the source or any result (system voice or OpenAI-compatible TTS).
- **Always-on translation window** — pre-created at launch, revealed by the
  hotkey with no cold start; mouse-following position and adjustable
  opacity.
- **WebDAV backup & sync** — one-click backup / restore of the full
  configuration, optional hourly auto-backup; backups from upstream pot
  restore unchanged.
- **Multilingual UI** — 20+ languages, following the OS language on first
  launch.
- **Cross-platform** — Windows, macOS, and Linux installers, built by CI on
  every tag (see [Release](docs/release.md)).

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

## Developer tooling

For contributors: the repository enforces a strict, fully reproducible
quality pipeline.

- **Latest stable toolchain** — `rust-toolchain.toml` declares `channel = "stable"`,
  so rustup always resolves the newest stable release on every machine, with
  `clippy` and `rustfmt` bundled as required components.
- **Strict lints** — clippy `all` + `pedantic` at `deny` with `-D warnings`
  (see [Lint policy](docs/lint-policy.md)).
- **Layered check gates** — fast gates before every commit, heavyweight gates
  before every push, CI enforcing the same chain (see [Checks](docs/checks.md)).
- **Layered CI/CD** — the check chain on every push, installers on tag
  pushes, per-platform test builds on manual dispatch
  (see [Release](docs/release.md)).
- **Rust 2024 edition**.

## Documentation

| Document                                                           | Content                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [docs/checks.md](docs/checks.md)                                   | the fourteen gates, layered hooks, CI                 |
| [docs/lint-policy.md](docs/lint-policy.md)                         | every lint and its level, waiver rules                |
| [docs/invariants.md](docs/invariants.md)                           | load-bearing platform rules — read before touching    |
| [docs/release.md](docs/release.md)                                 | tagging → multi-platform installers                   |
| [docs/structure.md](docs/structure.md)                             | what every file in this repo is for                   |
| [docs/usage.md](docs/usage.md)                                     | configuring services, WebDAV backup & sync            |
| [docs/windows-troubleshooting.md](docs/windows-troubleshooting.md) | windows hotkey / focus / IME debugging                |
| [HANDOFF.md](HANDOFF.md)                                           | agent handoff: current state, decisions, open threads |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                 | how to contribute                                     |
| [SECURITY.md](SECURITY.md)                                         | reporting vulnerabilities                             |
| [AGENTS.md](AGENTS.md)                                             | rules for AI coding agents (and humans)               |

Each document has a `*.zh.md` 简体中文 counterpart.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Distributed under the GPL-3.0-only license, inherited from the
[pot-desktop](https://github.com/pot-app/pot-desktop) lineage this project
grew out of. See [`LICENSE`](LICENSE) for details.

© 2026 NIyueeE (100502009+NIyueeE@users.noreply.github.com)
