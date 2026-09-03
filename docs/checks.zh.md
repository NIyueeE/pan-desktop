# 检查

> [English](checks.md) | 简体中文

快门在每次提交前运行,重门在每次推送前运行;[package.yml](../.github/workflows/package.yml)
的 `lint` job 在每次推送 / PR 时演练同一条链。

## 工具

检查链依赖四个外部 cargo 工具;`just setup` 会安装缺失项(并激活 git hook):

```bash
cargo install cargo-machete cargo-audit cargo-outdated cargo-deny --locked
```

`cargo fmt` 与 `cargo clippy` 由 `rust-toolchain.toml` 声明的工具链自带。JS 侧检查
走仓库内置的 Bun + Node 工具链(`bunx prettier`、`bunx eslint`、`bunx svelte-check`、
`bunx vitest`)——先跑一次 `bun install`,`bunx` 才能解析到本地二进制。

## 每次提交前 —— `githooks/pre-commit`

| #   | 检查门                                                | 命令                                                                             | 用途                        |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| 1   | prettier --check                                      | `bunx prettier --check .`                                                        | markdown / ts / svelte 格式 |
| 2   | cargo fmt --check                                     | `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | rust 格式                   |
| 3   | secret scan (githooks/check-secrets)                  | `githooks/check-secrets`                                                         | 暂存区密钥扫描              |
| 4   | cargo machete (unused dependencies)                   | `(cd src-tauri && cargo machete)`                                                | 未使用依赖                  |
| 5   | docs alignment (githooks/check-docs)                  | `githooks/check-docs`                                                            | 文档 ↔ 代码对齐             |
| 6   | cargo clippy (strict lints from src-tauri/Cargo.toml) | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 严格 lint                   |

必须携带密钥形状字符串的行(例如密钥格式说明)用 `security-scan:allow`
标记并附原因;`check-secrets` 会跳过这类行。

## 每次推送前 —— `githooks/pre-push`

| #   | 检查门                                           | 命令                                                            | 用途                               |
| --- | ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------- |
| 7   | eslint (zero warnings)                           | `bunx eslint . --max-warnings=0`                                | js/ts/svelte lint                  |
| 8   | svelte-check (fail on warnings)                  | `bunx svelte-check --tsconfig tsconfig.json --fail-on-warnings` | 类型 + 模板检查                    |
| 9   | webdav client tests                              | `bun scripts/test-webdav.ts`                                    | webdav 客户端套件(含旧版 pot 备份) |
| 10  | frontend unit tests                              | `bunx vitest run`                                               | svelte 组件与单元测试              |
| 11  | cargo test                                       | `cargo test --manifest-path src-tauri/Cargo.toml --quiet`       | rust 单元测试                      |
| 12  | cargo audit (security advisories)                | `(cd src-tauri && cargo audit)`                                 | RustSec 安全通告                   |
| 13  | cargo deny (licenses / bans / advisories policy) | `(cd src-tauri && cargo deny check)`                            | 依赖策略                           |
| 14  | cargo outdated (root dependencies)               | `(cd src-tauri && cargo outdated --root-deps-only)`             | 直接依赖过期检查                   |

## 一次性运行

```bash
just check   # 与 hook + CI 完全一致
```

## CI

[package.yml](../.github/workflows/package.yml) 在 `lint` job 中运行同一条链
(`bun run format` / `lint` / `typecheck` / `test:ui` / `build` /
`cargo check` / `cargo test`),并在每次推送时构建安装包。

## 被检查门拦住时

先修代码。放行是最后手段:只允许代码级、最小作用域、必须带原因注释。
永远不要削弱 `[lints]`、hook 或 CI。见
[Lint 策略](lint-policy.zh.md)与 [AGENTS.md](../AGENTS.md)。
