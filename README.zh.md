<!--
  入口 README —— 详细内容在 docs/(模块化,双语)。
  占位符统一写成 {{像这样}} 的形式,发布前替换。
  README.md 与 README.zh.md 需保持同步。
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
  `deny`(见 [Lint 策略](docs/lint-policy.zh.md))。
- **分层检查门** —— 快门在每次提交前运行,重门在每次推送前运行,CI 强制同一套
  链(见 [检查](docs/checks.zh.md))。
- **一个标签即发布** —— 打 `v*` 标签自动构建多平台二进制(见
  [发布](docs/release.zh.md))。
- **Rust 2024 edition**。

## 快速开始

```bash
git clone https://github.com/NIyueeE/rust-template.git
cd rust-template

# 每个 clone 一次:激活 hook + 安装缺失工具
just setup   # (或手动:git config core.hooksPath githooks)

cargo run {{运行参数}}

# 随时手动跑整条检查链 —— 与 hook + CI 完全一致
just check
```

## 文档

| 文档 | 内容 |
|------|------|
| [docs/checks.zh.md](docs/checks.zh.md) | 八道检查门、分层 hook、CI |
| [docs/lint-policy.zh.md](docs/lint-policy.zh.md) | 每条 lint 与级别、放行规则 |
| [docs/release.zh.md](docs/release.zh.md) | 打标签 → 多平台二进制发布 |
| [docs/structure.zh.md](docs/structure.zh.md) | 仓库里每个文件的用途 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 如何参与贡献 |
| [SECURITY.md](SECURITY.md) | 漏洞报告 |
| [AGENTS.md](AGENTS.md) | AI 编码代理(以及人类)的守则 |

每篇文档都有对应的 English 版本(同目录下去掉 `.zh` 后缀)。

## 计划

- [ ] {{计划一}}
- [ ] {{计划二}}

## 参与贡献

{{贡献指南}}

## 许可证

基于 MIT OR Apache-2.0 许可证分发,详情见 [`LICENSE`](LICENSE)。

© 2026 {{作者姓名}}({{作者邮箱}})
