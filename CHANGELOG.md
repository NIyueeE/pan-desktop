# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- HANDOFF.md: agent-facing working-state and handoff notes
- `just test` recipe: runs cargo-nextest when installed, falls back to
  `cargo test` (nextest evaluated; see HANDOFF.md)
- GitHub Actions pinned to commit SHAs with version comments
  (supply-chain hardening)
- Pre-commit secret scan gate (`githooks/check-secrets`): staged changes are
  scanned for credential-shaped strings; waiver marker `security-scan:allow`
- AGENTS.md §9 working discipline: staging, main-branch, dependency-upgrade,
  changelog, verification, session-end, timebox, ask-vs-act, and secrets
  rules

### Changed

- Template renamed to **rust-agents-template**: package name, binary name,
  workflows, and repository URL all follow
- README roadmap section removed; open items tracked in HANDOFF.md

## [0.2.0] - 2026-08-31

### Added

- Template derivation guide: docs/using-this-template.md rename checklist
- Issue templates (bug report, feature request) and pull request template

### Fixed

- Release workflow creates the GitHub Release before uploading binaries
  (upload-rust-binary-action only uploads; the first run failed with
  "release not found")

### Changed

- Release notes are extracted automatically from this changelog; a missing
  version section fails the release
- AGENTS.md rewritten in english and expanded: commit message convention,
  changelog-driven release process, derivation and day-to-day rules

## [0.1.0] - 2026-08-31

### Added

- Strict lints: clippy `all` + `pedantic` at `deny`, `unsafe_code` forbidden,
  `unwrap_used` / `expect_used` / `dbg_macro` denied
- Layered git hooks: pre-commit (fmt / machete / docs / clippy) and pre-push
  (audit / deny / outdated / test)
- `githooks/check-docs`: docs ↔ code alignment gate
- `justfile` with `setup`, `check`, and `fmt` recipes
- CI running the full check chain; tag-driven multi-platform release workflow
  with notes extracted from this changelog
- Dependabot updates (GitHub Actions + cargo), issue and PR templates
- MIT OR Apache-2.0 dual license, bilingual README, modular docs, AGENTS.md
