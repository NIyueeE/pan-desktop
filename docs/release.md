# Release

> English | [简体中文](release.zh.md)

The pipeline follows the template's layering — three workflows, one job each
direction:

| Workflow                                              | Trigger             | What it does                                                       |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| [ci.yml](../.github/workflows/ci.yml)                 | push to `main`, PRs | the check chain only — no installers                               |
| [release.yml](../.github/workflows/release.yml)       | tag push (`V*`)     | release notes + installers for six targets → GitHub Release        |
| [test-build.yml](../.github/workflows/test-build.yml) | manual dispatch     | installers for chosen platforms at any commit, ephemeral artifacts |

## Artifacts (release.yml)

| Platform                     | Runner                  | Bundles                       |
| ---------------------------- | ----------------------- | ----------------------------- |
| macOS (aarch64, x86_64)      | `macos-latest`          | `.dmg`                        |
| Windows (x64, i686, aarch64) | `windows-latest`        | NSIS setup                    |
| Linux (x86_64)               | docker composite action | `.deb` / `.rpm` / `.AppImage` |

Shared build steps live in `.github/actions/build-tauri` (macOS / Windows)
and `.github/actions/build-for-linux` (the docker image with the webkit/gtk
system libraries). Paddle OCR assets are fetched at build time and cached;
they are never committed.

## Version and release notes

- On a tag push the **tag is the version source**: each upload job strips the
  `V`/`v` prefix and writes it into `package.json` /
  `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` before building, so
  the installers carry the tag's version.
- `create-release` extracts the `# X.Y.Z` section matching the tag from
  `CHANGELOG` (no extension — deliberate, see HANDOFF.md) and creates the
  GitHub Release with it. A missing or empty section **fails the release**.

## Cutting a release

1. Version bump ritual in a dedicated `chore(release): vX.Y.Z — …` commit:
   manifests agree on `X.Y.Z`, `CHANGELOG` gains a top `# X.Y.Z` section,
   `com.pan.desktop.metainfo.xml` gains a `<release>` entry.
2. `git push pan HEAD:main` — the `check` job must be green.
3. `git tag VX.Y.Z && git push pan VX.Y.Z` — release.yml attaches all
   installers to the Release.
4. Verify with `gh release view VX.Y.Z --repo NIyueeE/pan-desktop --json
assets --jq '.assets[].name'`.

Re-tagging is allowed only to fix a failed release (delete the tag, fix,
re-push). Agents never create or push release tags without an explicit human
request — see [AGENTS.md](../AGENTS.md) §8.

## Test builds (not releases)

Dispatch [test-build.yml](../.github/workflows/test-build.yml) from the
Actions tab (**Test build → Run workflow**), pick a `ref` (commit SHA,
branch, or tag) and `targets` (`linux`, `macos`, `windows`, comma-separated):

```bash
gh workflow run test-build.yml --repo NIyueeE/pan-desktop \
    -f ref=main -f targets=windows
```

The artifacts (NSIS / DMG / deb+rpm+AppImage) are ephemeral (7-day retention)
and never published as a Release:

```bash
gh run download <run-id> --repo NIyueeE/pan-desktop \
    --name test-build-x86_64-pc-windows-msvc-<sha> -D ./ci-artifacts
```
