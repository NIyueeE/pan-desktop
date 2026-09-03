# Task runner for the pan repo.
# `just` (no arguments) lists all recipes.

default:
    @just --list

# One-time setup per clone: activate git hooks, verify the toolchain, install missing cargo check tools.
setup:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(git rev-parse --show-toplevel)"
    git config core.hooksPath githooks
    echo "hooksPath -> githooks"
    for tool in bun node cargo; do
        command -v "$tool" >/dev/null 2>&1 || { echo "missing: $tool (see README)"; exit 1; }
        echo "ok:      $tool"
    done
    for tool in cargo-machete cargo-audit cargo-outdated cargo-deny; do
        if command -v "$tool" >/dev/null 2>&1; then
            echo "ok:      $tool"
        else
            echo "install: $tool"
            cargo install "$tool" --locked
        fi
    done
    echo "setup complete"

# Auto-fix formatting across the repo (prettier + cargo fmt).
fmt:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(git rev-parse --show-toplevel)"
    bunx prettier --write .
    cargo fmt --manifest-path src-tauri/Cargo.toml --all

# Run the test suite (webdav client, frontend units, rust units).
test:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(git rev-parse --show-toplevel)"
    bun scripts/test-webdav.ts
    bunx vitest run
    cargo test --manifest-path src-tauri/Cargo.toml

# Run the full check chain (identical to hooks: fast gates + heavy gates).
check:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(git rev-parse --show-toplevel)"
    githooks/pre-commit
    githooks/pre-push
