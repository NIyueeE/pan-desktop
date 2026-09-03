# Lint policy

> English | [简体中文](lint-policy.zh.md)

Declared in the `[lints]` tables of `src-tauri/Cargo.toml`:

| Lint                       | Level | Note                                                             |
| -------------------------- | ----- | ---------------------------------------------------------------- |
| `unsafe_code`              | allow | tauri plugins and Win32/WinRT interop need it                    |
| `missing_docs`             | allow | desktop app crate, not a library                                 |
| clippy `all`               | deny  |                                                                  |
| clippy `pedantic`          | deny  | the strict variant, chosen over a warn baseline                  |
| clippy `nursery`           | warn  | escalated to error by the hook's `-D warnings`                   |
| `needless_pass_by_value`   | allow | tauri command signatures take handles by value by design         |
| `cast_possible_truncation` | allow | window geometry and WinRT bindings rely on well-understood casts |
| `cast_possible_wrap`       | allow | same                                                             |
| `cast_precision_loss`      | allow | same                                                             |
| `cast_sign_loss`           | allow | same                                                             |
| `too_many_lines`           | allow | the localized tray label table is intentionally explicit         |
| `match_same_arms`          | allow | localized tables and their fallbacks read better unmerged        |
| `dbg_macro`                | deny  |                                                                  |
| `todo`                     | deny  |                                                                  |
| `unimplemented`            | deny  |                                                                  |
| `print_stdout`             | deny  | logging goes through `tauri-plugin-log`                          |

The pre-commit hook additionally passes `-D warnings`, so every warning above —
including `nursery` — becomes a hard error at commit time.

## JS/TS side

- **eslint** — flat config (js recommended + typescript-eslint + svelte
  recommended), run with `--max-warnings=0`: zero warnings is the gate.
- **svelte-check** — `--fail-on-warnings`: any new warning fails the gate.
- **prettier** — `printWidth: 120`, `singleQuote: true`, `tabWidth: 4`,
  `trailingComma: "es5"`, `prettier-plugin-svelte` for `*.svelte`; markdown,
  yaml and json are checked too.

## Waivers

**Fix code first; a waiver is the last resort, and only code-level.**

- Never "make errors disappear" by editing `[lints]`, the hooks, or CI.
- Rust: `#[expect(clippy::lint_name)]` (preferred — it starts warning once the
  lint stops firing) or `#[allow(clippy::lint_name)]`, at statement or
  single-function scope, with a one-line reason comment. Never module-level
  `#![allow(...)]` or crate-level relaxation.
- JS/TS: a scoped `// eslint-disable-next-line <rule>` (or the svelte compiler
  required `<!-- svelte-ignore code -->`, alone on its comment) with a reason;
  never a file-wide disable.
- Legitimate scenarios only: (1) genuinely unavoidable usage, (2) upstream
  false positives (macros, generated code, dependency audit noise).

The same discipline applies to every other gate (machete, audit, deny,
outdated, docs-sync, and anything added later). Full rules: [AGENTS.md](../AGENTS.md).
