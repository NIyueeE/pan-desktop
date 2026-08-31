# 发布

> [English](release.md) | 简体中文

发布只需推送一个标签:

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` 会先创建 GitHub Release,再为三个目标平台构建
二进制,并把压缩包挂到 Release 上:

| Runner | 目标 |
|--------|------|
| ubuntu-latest | x86_64-unknown-linux-gnu |
| macos-latest | aarch64-apple-darwin |
| windows-latest | x86_64-pc-windows-msvc |

每个压缩包内含二进制,以及 `LICENSE`、`LICENSE-MIT`、`LICENSE-APACHE` 和
`README.md`。

## 注意事项

- 推标签前,先把 `Cargo.toml` 的 `version` 与标签对齐(手动改,或用 release-plz
  之类的工具自动化)。
- 该工作流需要 `contents: write` 权限——文件里已声明。
- 构建失败重跑:删除并重推标签(`git push origin :v0.1.0`),或在 Actions 页面
  直接 re-run。
