# Release

> English | [简体中文](release.zh.md)

Cutting a release is a single tag push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` then builds the binary for three targets and
attaches the archives to the GitHub Release:

| Runner | Target |
|--------|--------|
| ubuntu-latest | x86_64-unknown-linux-gnu |
| macos-latest | aarch64-apple-darwin |
| windows-latest | x86_64-pc-windows-msvc |

Each archive contains the binary plus `LICENSE`, `LICENSE-MIT`,
`LICENSE-APACHE`, and `README.md`.

## Notes

- Keep `version` in `Cargo.toml` in sync with the tag before pushing it
  (manually, or automate with a tool like release-plz).
- The workflow needs `contents: write` — already declared in the file.
- Re-running a failed build: delete and re-push the tag
  (`git push origin :v0.1.0`), or re-run the workflow from the Actions tab.
