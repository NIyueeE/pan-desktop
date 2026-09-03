set -euo pipefail

# The paddle OCR engine ships its ONNX models and per-target ONNX Runtime
# shared library as bundled resources; fetch both before `tauri build` picks
# up the resource globs (targets without an official shared build skip the
# runtime download and degrade to the system OCR at run time). The source
# artifact is a zip and drops the exec bit, hence the explicit `bash`.
bash scripts/fetch-onnxruntime.sh "${INPUT_TARGET}"
bash scripts/fetch-paddle-models.sh

bun install --frozen-lockfile

if [ "${INPUT_TARGET}" = "x86_64-unknown-linux-gnu" ]; then
    bun run tauri build --target "${INPUT_TARGET}"
else
    bun run tauri build --target "${INPUT_TARGET}" -b deb rpm
fi
