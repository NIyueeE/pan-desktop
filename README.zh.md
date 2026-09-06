# pan

> 划词 / 输入 / OCR 翻译 —— 一个精简、跨平台的桌面翻译应用,
> 基于 Tauri 2 + Svelte 5。

[![CI](https://github.com/NIyueeE/pan-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/NIyueeE/pan-desktop/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL%20v3-blue.svg)](LICENSE)

[English](README.md) | [简体中文](README.zh.md)

**pan** 是一个开源的翻译桌面应用:划选文字、输入句子或框选屏幕区域,
即刻得到翻译结果。自带 OCR、词典与语音合成;翻译 / 识别 / 朗读后端全部
兼容 OpenAI Chat Completions 协议,整套配置可备份并同步到任意 WebDAV
服务。支持 Windows、macOS 与 Linux。

## 特性

- **三种取词方式** —— 全局热键划词、窗口内输入、屏幕区域 OCR。
- **内置 PaddleOCR PP-OCRv5** —— 简体 / 繁体中文、英文、日文混排识别,
  无需额外安装;自动降级到系统 OCR,再降到可选的 OpenAI 兼容 VLM。
- **OpenAI 兼容后端** —— 翻译、OCR(VLM)、语音合成都接受任何 Chat
  Completions 兼容端点(OpenAI、DeepSeek、自建网关……);提示词支持
  `$text` / `$from` / `$to` / `$detect` 变量。
- **词典与发音** —— 词典卡片带音标、按词性分组的释义与音频;原文与任一
  结果可一键朗读(系统语音或 OpenAI 兼容 TTS)。
- **常驻翻译窗口** —— 启动即预创建,热键唤出无冷启动等待;位置跟随鼠标、
  透明度可调。
- **WebDAV 备份与同步** —— 一键备份 / 恢复全部配置,可开启每小时自动
  备份;上游 pot 的备份可直接恢复。
- **多语言界面** —— 20 多种语言,首次运行自动跟随系统语言。
- **跨平台** —— Windows、macOS、Linux 安装包,每次打标签由 CI 自动构建
  (见 [发布](docs/release.zh.md))。

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

## 开发者工具链

面向贡献者:仓库执行一套严格的、可完整本地复现的质量流水线。

- **最新 stable 工具链** —— `rust-toolchain.toml` 声明 `channel = "stable"`,
  任何人 clone 后 rustup 都会自动解析当时的最新 stable 版本,并自带
  `clippy` 与 `rustfmt` 组件。
- **严格 lint** —— clippy `all` + `pedantic` 均 `deny`,hook 追加
  `-D warnings`(见 [Lint 策略](docs/lint-policy.zh.md))。
- **分层检查门** —— 快门在每次提交前运行,重门在每次推送前运行,CI 强制同一套
  链(见 [检查](docs/checks.zh.md))。
- **分层 CI/CD** —— 每次推送跑检查链,标签推送出安装包,手动 dispatch 出
  按平台测试构建(见 [发布](docs/release.zh.md))。
- **Rust 2024 Edition**。

## 文档

| 文档                                                                     | 内容                                  |
| ------------------------------------------------------------------------ | ------------------------------------- |
| [docs/checks.zh.md](docs/checks.zh.md)                                   | 十四道检查门、分层 hook、CI           |
| [docs/lint-policy.zh.md](docs/lint-policy.zh.md)                         | 每条 lint 与级别、放行规则            |
| [docs/invariants.zh.md](docs/invariants.zh.md)                           | 平台承重不变量 —— 改动相关路径前必读  |
| [docs/release.zh.md](docs/release.zh.md)                                 | 打标签 → 多平台安装包                 |
| [docs/structure.zh.md](docs/structure.zh.md)                             | 仓库里每个文件的用途                  |
| [docs/usage.zh.md](docs/usage.zh.md)                                     | 服务配置、WebDAV 备份与同步           |
| [docs/windows-troubleshooting.zh.md](docs/windows-troubleshooting.zh.md) | windows 热键 / 焦点 / 输入法排查      |
| [HANDOFF.md](HANDOFF.md)                                                 | 交接文档:当前工作状态、决策与开放事项 |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                       | 如何参与贡献                          |
| [SECURITY.md](SECURITY.md)                                               | 漏洞报告                              |
| [AGENTS.md](AGENTS.md)                                                   | AI 编码代理(以及人类)的守则           |

每篇文档都有对应的 English 版本(同目录下去掉 `.zh` 后缀)。

## 参与贡献

欢迎 PR——参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

以 GPL-3.0-only 许可证分发,继承自本项目所从出的
[pot-desktop](https://github.com/pot-app/pot-desktop) 血统。详情见
[`LICENSE`](LICENSE)。

© 2026 NIyueeE(100502009+NIyueeE@users.noreply.github.com)
