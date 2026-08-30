# Pan (Lite)

> 基于 [pot-app/pot-desktop](https://github.com/pot-app/pot-desktop) 的精简分支。

本分支只保留三个核心翻译入口：

-   **划词翻译**：全局快捷键读取选中文本后翻译
-   **输入翻译**：托盘菜单或全局快捷键打开输入窗口
-   **OCR 翻译**：截图后使用本地 OCR 识别并翻译

翻译服务仅保留 **OpenAI Chat Completions 兼容协议**，这是目前第三方模型服务支持最广的接口格式。只要服务商提供兼容端点，即可通过自定义请求地址、模型名、API Key 和 Prompt 接入。

品牌名已由 `pot` 更名为 `pan`（应用标识 `com.pan.desktop`，可执行文件 `pan`；上游 pot 生成的 WebDAV 备份仍可直接恢复）。

## 功能范围

### 保留

-   划词翻译 / 输入翻译 / OCR 翻译
-   OpenAI Chat Completions 兼容 API
    -   支持自定义 `Base URL` 或完整 `/chat/completions` 地址
    -   支持自定义模型、API Key、System/User/Assistant Prompt
    -   支持流式输出和自定义请求参数
-   本地 OCR：系统 OCR 与 Tesseract
-   **WebDAV 备份同步**：一键备份/恢复全部配置，支持自动增量备份（详见下文）
-   自动复制、窗口置顶、窗口位置/大小记忆、代理、开机自启、主题/字体、多语言界面

### 已移除

-   其他内置翻译服务（DeepL、Bing、Google、Ollama 等）
-   其他云端 OCR 服务
-   TTS、收藏/生词本、历史记录
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

# WebDAV 客户端测试
pnpm test:webdav

# 前端组件测试（vitest + jsdom，Tauri API 全 mock）
pnpm test:ui

# Rust 单元测试
pnpm test:rs

# 一次性运行全部测试
pnpm test
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

## WebDAV 备份同步

偏好设置 → **备份** 页面可将全部应用配置（翻译服务、快捷键、界面设置等）备份到任意 WebDAV 网盘（坚果云、Nextcloud、Alist 等）。

1. 填写 WebDAV 地址（如 `https://dav.jianguoyun.com/dav/`）、用户名和应用密码
2. 点击 **测试连接** 验证配置
3. **备份**：把当前 `config.json` 上传为远端的一个 JSON 文件（默认名 `pan-config.json`，可自定义）
4. **恢复备份**：从远端下载并覆盖本地配置（**全量覆盖**：备份中不存在的键会被删除，操作前有确认提示），重启应用后完全生效

开启 **自动备份** 后，常驻后台进程会在应用运行期间每小时最多自动上传一次，同一配置在多台设备间可手动「恢复备份」完成同步。

> 备份内容不包含历史数据库等文件，仅覆盖应用设置；WebDAV 凭据保存在本地配置中，请确保设备安全。

### WebDAV 客户端测试

`scripts/test-webdav.mjs` 用零依赖的 Node 脚本针对内置 mock WebDAV 服务器运行真实客户端代码，覆盖冒烟流程与边界情况（路径穿越、错误口令、畸形远端数据、目录缺失自动建层、2MB 大值、请求超时等）：

```bash
pnpm test:webdav
```

### 前端组件测试（反馈测试流程）

`pnpm test:ui` 使用 Vitest + jsdom 运行真实 React 组件：`src/test/tauri-state.js` + `src/test/setup.js` 把所有 `@tauri-apps/*` 模块 mock 成内存版 store / 事件总线 / invoke 命令表，配置窗口（服务设置、热键设置等页面）可以在无 Tauri 环境下渲染和交互，用于回归验证 Windows 上反馈过的崩溃场景（例如：恢复旧版本备份后服务列表包含已移除的服务）。新增页面或修复 bug 时请同步补充用例。

## CI/CD

`.github/workflows/package.yml` 会在 PR 上执行格式检查、ESLint、Clippy、前端构建和 `cargo check`；推送 main 或 tag 时分别构建 macOS、Windows、Linux 安装包并上传 Release。

-   支持 `workflow_dispatch` 手动触发
-   同一分支的旧构建自动取消（concurrency）
-   pnpm store 与 Rust 依赖缓存（Swatinem/rust-cache），显著缩短构建时间
-   所有任务设有超时上限，避免挂起消耗额度

## License

[GPL-3.0-only](./LICENSE)
