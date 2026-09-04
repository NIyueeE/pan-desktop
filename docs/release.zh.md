# 发布

> [English](release.md) | 简体中文

`.github/workflows/package.yml` 是唯一流水线。触发:每次 `main` 推送、
PR,以及**每一次标签推送**:

- **推送 `main`** → `lint` job(完整检查链)+ 全平台验证性构建。不创建
  Release —— 这是打标签前的演练。
- **推送标签** → 同一流水线,外加 `Upload release` 步骤把安装包挂到
  GitHub Release。

标签命名约定:大写 **`VX.Y.Z`**(如 `V4.3.0`)。

## 产物

| 平台                        | Runner             | 产物                          |
| --------------------------- | ------------------ | ----------------------------- |
| macOS(aarch64、x86_64)      | `macos-latest`     | `.dmg`                        |
| Windows(x64、i686、aarch64) | `windows-latest`   | NSIS 安装包                   |
| Linux(x86_64)               | docker 复合 action | `.deb` / `.rpm` / `.AppImage` |

Linux 一侧在 `build-for-linux` docker action 内构建(rust 镜像 + bun +
Node tarball),因为 `bun run tauri build` 同时需要两个运行时和
webkit/gtk 系统库。

Paddle OCR 资产在构建期由 `scripts/fetch-onnxruntime.sh` 与
`scripts/fetch-paddle-models.sh` 拉取并缓存,永不入库。

## 版本号与发布说明

- `change-version` job 从最新标签解析版本号(`git describe --tags`,
  去掉 `v`/`V`;无标签时回退 `package.json`),写回
  `package.json` / `tauri.conf.json` / `Cargo.toml` —— 构建出的安装包使用
  标签的版本号。安装包版本的实际来源是 `src-tauri/tauri.conf.json`。
- 发布说明从 `CHANGELOG` 提取(首个 `# X.Y.Z` 段,awk)生成
  `RELEASE_NOTES.md` 作为 Release 正文。段落缺失或为空会得到空的发布说明
  —— 打标签前先写好该段。

## 发版步骤

1. 版本号仪式,独立成一个 `chore(release): vX.Y.Z — …` 提交:
   `package.json` + `src-tauri/tauri.conf.json`(+ 需要时 `Cargo.toml` /
   `Cargo.lock`)一致,`CHANGELOG` 顶部新增 `# X.Y.Z` 段,
   `com.pan.desktop.metainfo.xml` 增加 `<release>` 条目。
2. `git push pan HEAD:main` —— 等验证性构建跑完(lint 必须绿;用
   `gh run watch` 盯)。
3. `git tag VX.Y.Z && git push pan VX.Y.Z` —— 流水线把全部安装包挂上
   Release。
4. `gh release view VX.Y.Z --repo NIyueeE/pan-desktop --json assets --jq
'.assets[].name'` 核对产物。

重新打标签只允许用于修复失败的发布(删标签、修、重推)。没有明确的人类
请求,代理绝不创建或推送发布标签 —— 见 [AGENTS.md](../AGENTS.md) §8。
