# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
