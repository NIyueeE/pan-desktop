<!--
  模板 README —— 占位符统一写成 {{像这样}} 的形式。
  发布前请替换所有 {{占位符}},然后删除本注释。
  英文版在 README.md,两个文件的内容需保持同步。
-->

# rust-template

> {{一句话简介}}

[![CI](https://github.com/NIyueeE/rust-template/actions/workflows/ci.yml/badge.svg)](https://github.com/NIyueeE/rust-template/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

{{简介段落}} 一个 Rust 项目模板:严格的 lint 策略 + 分层自动化检查(pre-commit / pre-push / CI)。

## 特性

- **最新 stable 工具链** —— `rust-toolchain.toml` 声明 `channel = "stable"`,
  任何人 clone 后 rustup 都会自动解析当时的最新 stable 版本,并自带
  `clippy` 与 `rustfmt` 组件。
- **严格 lint** —— `unsafe_code = "forbid"`,clippy `all` + `pedantic` 均为
  `deny`,另加 `unwrap_used` / `expect_used` / `dbg_macro` 禁用(见
  [Lint 策略](#lint-策略))。
- **分层检查门** —— 快门(格式、未用依赖、文档与代码对齐、严格 clippy)在每次
  提交前运行;重门(安全审计、依赖策略、依赖新旧、测试)在每次推送前运行;CI 通过
  `just check` 强制执行同一套链。
- **Rust 2024 edition**。

## 环境要求

- [rustup](https://rustup.rs) —— stable 工具链会自动解析安装
- [just](https://github.com/casey/just) —— 可选,用于 `just setup` / `just check`
- 检查门依赖的外部工具:

  ```bash
  cargo install cargo-machete cargo-audit cargo-outdated cargo-deny
  ```

## 快速开始

```bash
git clone https://github.com/NIyueeE/rust-template.git
cd rust-template

# 每个 clone 一次:激活 hook + 安装缺失工具
just setup   # (或手动:git config core.hooksPath githooks)

cargo run {{运行参数}}
```

## 检查

快门在每次提交前运行,重门在每次推送前运行;CI 在每次推送 / PR 时通过
`just check` 执行整条链。

### 每次提交 —— `githooks/pre-commit`

| # | 检查 | 命令 | 用途 |
|---|------|------|------|
| 1 | fmt | `cargo fmt --all -- --check` | 代码格式 |
| 2 | machete | `cargo machete` | 未使用的依赖 |
| 3 | docs | `githooks/check-docs` | 文档与代码对齐 |
| 4 | clippy | `cargo clippy --all-targets --all-features -- -D warnings` | 严格 lint |

### 每次推送 —— `githooks/pre-push`

| # | 检查 | 命令 | 用途 |
|---|------|------|------|
| 5 | audit | `cargo audit` | RustSec 安全通告 |
| 6 | deny | `cargo deny check` | 许可证 / 禁用项 / 通告策略 |
| 7 | outdated | `cargo outdated --root-deps-only` | 直接依赖是否过期 |
| 8 | test | `cargo test --quiet` | 测试套件 |

## Lint 策略

声明在 `Cargo.toml` 的 `[lints]` 表中:

| Lint | 级别 |
|------|------|
| `unsafe_code` | forbid |
| `missing_docs` | warn |
| clippy `all` | deny |
| clippy `pedantic` | deny |
| clippy `unwrap_used` / `expect_used` / `dbg_macro` | deny |
| clippy `todo` | warn |

hook 额外传入 `-D warnings`,因此上述所有警告(包括 `missing_docs` 和
`todo`)在提交时都会升级为硬错误。

## 项目结构

```
.
├── .github/
│   ├── dependabot.yml    # 每周自动升级 actions + cargo 依赖
│   └── workflows/
│       ├── ci.yml        # CI:推送 / PR 时运行 `just check`
│       └── release.yml   # 打 v* 标签 → 三个目标的可执行发布
├── Cargo.toml            # 清单 + 严格 [lints] + 包元数据
├── rust-toolchain.toml   # stable 通道 + clippy/rustfmt 组件
├── justfile              # just setup / just check
├── deny.toml             # cargo-deny 策略(许可证 / 禁用项 / 通告)
├── githooks/
│   ├── pre-commit        # 快门:fmt、machete、docs、clippy
│   ├── pre-push          # 重门:audit、deny、outdated、test
│   └── check-docs        # 文档与代码对齐检查
├── tests/
│   └── cli.rs            # 模板二进制冒烟测试
├── LICENSE               # MIT OR Apache-2.0(指引文件)
├── LICENSE-MIT
├── LICENSE-APACHE
├── SECURITY.md
├── CONTRIBUTING.md
├── AGENTS.md
├── .editorconfig
└── src/
    └── main.rs
```

## 计划

- [ ] {{计划一}}
- [ ] {{计划二}}

## 参与贡献

{{贡献指南}}

## 许可证

基于 MIT OR Apache-2.0 许可证分发,详情见 [`LICENSE`](LICENSE)。

© 2026 {{作者姓名}}({{作者邮箱}})
