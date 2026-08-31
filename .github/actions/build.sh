set -euo pipefail

bun install --frozen-lockfile

if [ "${INPUT_TARGET}" = "x86_64-unknown-linux-gnu" ]; then
    bun run tauri build --target "${INPUT_TARGET}"
else
    bun run tauri build --target "${INPUT_TARGET}" -b deb rpm
fi
