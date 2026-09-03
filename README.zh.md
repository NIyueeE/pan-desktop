# pan

> 一个精简的划词 / 输入 / OCR 翻译桌面应用,Tauri 2 + Svelte 5。

[![CI](https://github.com/NIyueeE/pan-desktop/actions/workflows/package.yml/badge.svg)](https://github.com/NIyueeE/pan-desktop/actions/workflows/package.yml)
[![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

从 rust-agents-template 派生的精简翻译桌面应用——划词 / 输入 / OCR 翻译,
OpenAI 兼容后端,严格 lint + 分层检查(pre-commit / pre-push / CI)。

## 特性

- **最新 stable 工具链** —— `rust-toolchain.toml` 声明 `channel = "stable"`,
  任何人 clone 后 rustup 都会自动解析当时的最新 stable 版本,并自带
  `clippy` 与 `rustfmt` 组件。
- **严格 lint** —— clippy `all` + `pedantic` 均 `deny`,hook 追加
  `-D warnings`(见 [Lint 策略](docs/lint-policy.zh.md))。
- **分层检查门** —— 快门在每次提交前运行,重门在每次推送前运行,CI 强制同一套
  链(见 [检查](docs/checks.zh.md))。
- **标签驱动的发布** —— 每次推送都构建 macOS / Windows / Linux 的 tauri
  安装包;推送标签时产物挂到 GitHub Release(见 [发布](docs/release.zh.md))。
- **Rust 2024 Edition**。

## 快速开始

```bash
git clone https://github.com/NIyueeE/pan-desktop.git
cd pan-desktop

bun install      # js 依赖(需要 Bun + Node.js >= 22)

# 每个 clone 一次:激活 hook + 安装缺失工具
just setup   # (或手动:git config core.hooksPath githooks)

bun run tauri dev

# 随时手动跑整条检查链 —— 与 hook + CI 完全一致
just check
```

## 文档

| 文档                                             | 内容                                  |
| ------------------------------------------------ | ------------------------------------- |
| [docs/checks.zh.md](docs/checks.zh.md)           | 十四道检查门、分层 hook、CI           |
| [docs/lint-policy.zh.md](docs/lint-policy.zh.md) | 每条 lint 与级别、放行规则            |
| [docs/release.zh.md](docs/release.zh.md)         | 打标签 → 多平台安装包                 |
| [docs/structure.zh.md](docs/structure.zh.md)     | 仓库里每个文件的用途                  |
| [HANDOFF.md](HANDOFF.md)                         | 交接文档:当前工作状态、决策与开放事项 |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | 如何参与贡献                          |
| [SECURITY.md](SECURITY.md)                       | 漏洞报告                              |
| [AGENTS.md](AGENTS.md)                           | AI 编码代理(以及人类)的守则           |

每篇文档都有对应的 English 版本(同目录下去掉 `.zh` 后缀)。

## 参与贡献

欢迎 PR——参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

以 GPL-3.0-only 许可证分发,继承自本项目所从出的
[pot-desktop](https://github.com/pot-app/pot-desktop) 血统。详情见
[`LICENSE`](LICENSE)。

© 2026 NIyueeE(100502009+NIyueeE@users.noreply.github.com)
