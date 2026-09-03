# Checks

> English | [简体中文](checks.zh.md)

Fast gates run before every commit, heavyweight gates before every push, and
the `lint` job in [package.yml](../.github/workflows/package.yml) rehearses
the same chain on every push / pull request.

## Tools

The gates use four external cargo tools; `just setup` installs any that are
missing (and activates the git hooks):

```bash
cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
```

`cargo fmt` and `cargo clippy` come with the toolchain declared in
`rust-toolchain.toml`. The JS gates run through the checked-in Bun + Node
toolchain — run `bun install` once so `bunx` resolves the local binaries.

## On every commit — `githooks/pre-commit`

| #   | Gate                                                  | Command                                                                          | Purpose                           |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| 1   | prettier --check                                      | `bunx prettier --check .`                                                        | markdown / ts / svelte formatting |
| 2   | cargo fmt --check                                     | `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | rust formatting                   |
| 3   | secret scan (githooks/check-secrets)                  | `githooks/check-secrets`                                                         | secret scan on staged changes     |
| 4   | cargo machete (unused dependencies)                   | `(cd src-tauri && cargo machete)`                                                | unused dependencies               |
| 5   | docs alignment (githooks/check-docs)                  | `githooks/check-docs`                                                            | docs ↔ code alignment             |
| 6   | cargo clippy (strict lints from src-tauri/Cargo.toml) | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | strict lints                      |

Lines that must carry a secret-shaped string (e.g. key-format documentation)
take a `security-scan:allow` marker with a reason; `check-secrets` skips them.

## On every push — `githooks/pre-push`

| #   | Gate                                             | Command                                                         | Purpose                                        |
| --- | ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------- |
| 7   | eslint (zero warnings)                           | `bunx eslint . --max-warnings=0`                                | js/ts/svelte lint                              |
| 8   | svelte-check (fail on warnings)                  | `bunx svelte-check --tsconfig tsconfig.json --fail-on-warnings` | type + template checking                       |
| 9   | webdav client tests                              | `bun scripts/test-webdav.ts`                                    | webdav client suite (incl. legacy pot backups) |
| 10  | frontend unit tests                              | `bunx vitest run`                                               | svelte component + unit tests                  |
| 11  | cargo test                                       | `cargo test --manifest-path src-tauri/Cargo.toml --quiet`       | rust unit tests                                |
| 12  | cargo audit (security advisories)                | `(cd src-tauri && cargo audit)`                                 | RustSec advisories                             |
| 13  | cargo deny (licenses / bans / advisories policy) | `(cd src-tauri && cargo deny check)`                            | dependency policy                              |
| 14  | cargo outdated (root dependencies)               | `(cd src-tauri && cargo outdated --root-deps-only)`             | outdated direct dependencies                   |

## One-shot run

```bash
just check   # identical to hooks + CI
```

## CI

[package.yml](../.github/workflows/package.yml) runs the same chain in its
`lint` job (`bun run format` / `lint` / `typecheck` / `test:ui` / `build` /
`cargo check` / `cargo test`) and builds the installers on every push.

## When a gate blocks you

Fix the code first. A waiver is the last resort: code-level only, minimal
scope, with a reason comment. Never weaken `[lints]`, the hooks, or CI. See
[Lint policy](lint-policy.md) and [AGENTS.md](../AGENTS.md).
