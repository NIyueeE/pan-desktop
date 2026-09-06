# 发布

> [English](release.md) | 简体中文

流水线分三层 —— 三条 workflow,各管一个方向:

| Workflow                                              | 触发            | 职责                                             |
| ----------------------------------------------------- | --------------- | ------------------------------------------------ |
| [ci.yml](../.github/workflows/ci.yml)                 | 推送 `main`、PR | 只跑检查链 —— 不出安装包                         |
| [release.yml](../.github/workflows/release.yml)       | 标签推送(`V*`)  | 六个 target 的安装包 + 发布说明 → GitHub Release |
| [test-build.yml](../.github/workflows/test-build.yml) | 手动 dispatch   | 任意提交按平台出安装包,临时产物                  |

## 产物(release.yml)

| 平台                        | Runner             | 产物                          |
| --------------------------- | ------------------ | ----------------------------- |
| macOS(aarch64、x86_64)      | `macos-latest`     | `.dmg`                        |
| Windows(x64、i686、aarch64) | `windows-latest`   | NSIS 安装包                   |
| Linux(x86_64)               | docker 复合 action | `.deb` / `.rpm` / `.AppImage` |

共享构建步骤在 `.github/actions/build-tauri`(macOS / Windows)与
`.github/actions/build-for-linux`(带 webkit/gtk 系统库的 docker 镜像)。
Paddle OCR 资产在构建期拉取并缓存,永不入库。

## 版本号与发布说明

- 标签推送时,**标签即版本来源**:每个 upload job 去掉 `V`/`v` 前缀,构建前
  写入 `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`,
  安装包携带标签的版本号。
- `create-release` 从 `CHANGELOG`(无扩展名 —— 刻意为之,见 HANDOFF.md)提取
  与标签匹配的 `# X.Y.Z` 段并创建 GitHub Release。段落缺失或为空
  **发布直接失败**。

## 发版步骤

1. 版本号仪式,独立成一个 `chore(release): vX.Y.Z — …` 提交:三个清单一致,
   `CHANGELOG` 顶部新增 `# X.Y.Z` 段,`com.pan.desktop.metainfo.xml` 增加
   `<release>` 条目。
2. `git push pan HEAD:main` —— `check` job 必须绿。
3. `git tag VX.Y.Z && git push pan VX.Y.Z` —— release.yml 把全部安装包挂上
   Release。
4. `gh release view VX.Y.Z --repo NIyueeE/pan-desktop --json assets --jq
'.assets[].name'` 核对产物。

重新打标签只允许用于修复失败的发布(删标签、修、重推)。没有明确的人类
请求,代理绝不创建或推送发布标签 —— 见 [AGENTS.md](../AGENTS.md) §8。

## 测试构建(非发布)

在 Actions 页 dispatch [test-build.yml](../.github/workflows/test-build.yml)
(**Test build → Run workflow**),选 `ref`(提交 SHA、分支或标签)与
`targets`(`linux`、`macos`、`windows`,逗号分隔):

```bash
gh workflow run test-build.yml --repo NIyueeE/pan-desktop \
    -f ref=main -f targets=windows
```

产物(NSIS / DMG / deb+rpm+AppImage)保留 7 天,永不作为 Release 发布:

```bash
gh run download <run-id> --repo NIyueeE/pan-desktop \
    --name test-build-x86_64-pc-windows-msvc-<sha> -D ./ci-artifacts
```
