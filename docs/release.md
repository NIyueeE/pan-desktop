# Release

> English | [简体中文](release.zh.md)

`.github/workflows/package.yml` is the only pipeline. It runs on every push
to `main`, on pull requests, and on **every tag push**:

- **push `main`** → `lint` job (the full check chain) + verification builds
  for all platforms. No Release is created — this is the pre-tag rehearsal.
- **push a tag** → same pipeline, plus the `Upload release` steps attach the
  installers to the GitHub Release.

Tag naming convention: **`VX.Y.Z`** with a capital `V` (e.g. `V4.3.0`).

## Artifacts

| Platform                     | Runner                  | Bundles                       |
| ---------------------------- | ----------------------- | ----------------------------- |
| macOS (aarch64, x86_64)      | `macos-latest`          | `.dmg`                        |
| Windows (x64, i686, aarch64) | `windows-latest`        | NSIS setup                    |
| Linux (x86_64)               | docker composite action | `.deb` / `.rpm` / `.AppImage` |

The Linux leg builds inside the `build-for-linux` docker action (rust image +
bun + Node tarball), because `bun run tauri build` needs both runtimes and the
webkit/gtk system libraries.

Paddle OCR assets are fetched at build time by `scripts/fetch-onnxruntime.sh`
and `scripts/fetch-paddle-models.sh` and cached; they are never committed.

## Version and release notes

- The `change-version` job resolves the version from the latest tag
  (`git describe --tags`, `v`/`V` stripped; falls back to `package.json`) and
  writes it into `package.json` / `tauri.conf.json` / `Cargo.toml` — so the
  built installers carry the tag's version. `src-tauri/tauri.conf.json` is
  the effective installer-version source.
- Release notes are extracted from `CHANGELOG` (the first `# X.Y.Z` section,
  via awk) into `RELEASE_NOTES.md` and used as the release body. A missing or
  empty section produces empty notes — write the section before tagging.

## Cutting a release

1. Version bump ritual in a dedicated `chore(release): vX.Y.Z — …` commit:
   `package.json` + `src-tauri/tauri.conf.json` (+ `Cargo.toml`/`Cargo.lock`
   if touched) agree, `CHANGELOG` gains a top `# X.Y.Z` section,
   `com.pan.desktop.metainfo.xml` gains a `<release>` entry.
2. `git push pan HEAD:main` — wait for the verification build (lint must be
   green; watch with `gh run watch`).
3. `git tag VX.Y.Z && git push pan VX.Y.Z` — the pipeline attaches all
   installers to the Release.
4. Verify with `gh release view VX.Y.Z --repo NIyueeE/pan-desktop --json
assets --jq '.assets[].name'`.

Re-tagging is allowed only to fix a failed release (delete the tag, fix,
re-push). Agents never create or push release tags without an explicit human
request — see [AGENTS.md](../AGENTS.md) §8.
