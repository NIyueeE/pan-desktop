# Pot (Lite)

> 基于 [pot-app/pot-desktop](https://github.com/pot-app/pot-desktop) 的精简分支。

本分支只保留三个核心翻译入口：

-   **划词翻译**：全局快捷键读取选中文本后翻译
-   **输入翻译**：托盘菜单或全局快捷键打开输入窗口
-   **OCR 翻译**：截图后使用本地 OCR 识别并翻译

翻译服务仅保留 **OpenAI Chat Completions 兼容协议**，这是目前第三方模型服务支持最广的接口格式。只要服务商提供兼容端点，即可通过自定义请求地址、模型名、API Key 和 Prompt 接入。

品牌名 `pot` 暂不修改。

## 功能范围

### 保留

-   划词翻译 / 输入翻译 / OCR 翻译
-   OpenAI Chat Completions 兼容 API
    -   支持自定义 `Base URL` 或完整 `/chat/completions` 地址
    -   支持自定义模型、API Key、System/User/Assistant Prompt
    -   支持流式输出和自定义请求参数
-   本地 OCR：系统 OCR 与 Tesseract
-   自动复制、窗口置顶、窗口位置/大小记忆、代理、开机自启、主题/字体、多语言界面

### 已移除

-   其他内置翻译服务（DeepL、Bing、Google、Ollama 等）
-   其他云端 OCR 服务
-   TTS、收藏/生词本、历史记录、备份
-   插件系统、本地 HTTP 服务、剪贴板监听
-   独立 OCR 识别窗口、应用更新器

## 技术栈

-   Tauri 2.11
-   Rust 2024 Edition（`rust-toolchain.toml` 跟随最新 stable）
-   React 18 + Vite 5
-   pnpm

## 本地开发

### 环境要求

-   Node.js >= 22
-   pnpm >= 9
-   最新 Rust stable（`rustup` 会读取仓库根目录的 `rust-toolchain.toml`）
-   Tauri 2 Linux 系统依赖，例如 Ubuntu/Debian：

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf
```

### 常用命令

```bash
pnpm install

# 开发运行
pnpm tauri dev

# 构建安装包
pnpm tauri build

# 前端构建
pnpm build

# 代码格式检查 / 自动修复
pnpm format
pnpm format:fix

# 严格 lint（ESLint 零警告 + Clippy deny warnings）
pnpm lint
pnpm lint:fix

# 完整检查
pnpm check
```

## OpenAI 兼容服务配置

1. 打开托盘菜单 → 偏好设置 → 服务 → 翻译
2. 编辑默认的 OpenAI 实例
3. 填写服务商的接口地址，以下写法均可：

| 填写内容                                  | 实际请求地址                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `https://api.openai.com`                  | `https://api.openai.com/v1/chat/completions`   |
| `https://api.deepseek.com/v1`             | `https://api.deepseek.com/v1/chat/completions` |
| `https://example.com/api/v1/`             | `https://example.com/api/v1/chat/completions`  |
| `https://example.com/v1/chat/completions` | 原样使用                                       |

4. 填写模型名（如 `gpt-4o-mini`、`deepseek-chat`）和 API Key
5. 保存时会把配置写入 `config.json`

Prompt 中可使用 `$text`、`$from`、`$to`、`$detect` 变量。

## CI/CD

`.github/workflows/package.yml` 会在 PR 上执行格式检查、ESLint、Clippy、前端构建和 `cargo check`；推送 master 或 tag 时分别构建 macOS、Windows、Linux 安装包并上传 Release。

## License

[GPL-3.0-only](./LICENSE)
