#!/usr/bin/env bash
# Fetch the official ONNX Runtime shared library for a Rust build target into
# src-tauri/resources/onnxruntime/, where the Tauri bundler picks it up as a
# resource and the paddle_ocr command loads it at runtime (ort load-dynamic).
#
# Targets without an official shared build (win-x86, macOS x64) are skipped
# with a notice: the paddle command then fails gracefully at runtime and OCR
# fails over to the system engine.
#
# Usage: scripts/fetch-onnxruntime.sh <rust-target>
set -euo pipefail

target="${1:?usage: fetch-onnxruntime.sh <rust-target>}"
version="1.28.2"
dest="src-tauri/resources/onnxruntime"
mkdir -p "$dest"

pkg=""
case "$target" in
    x86_64-unknown-linux-gnu)
        pkg="onnxruntime-linux-x64-${version}.tgz"
        lib="libonnxruntime.so"
        ;;
    x86_64-pc-windows-msvc)
        pkg="onnxruntime-win-x64-${version}.zip"
        lib="onnxruntime.dll"
        ;;
    aarch64-pc-windows-msvc)
        pkg="onnxruntime-win-arm64-${version}.zip"
        lib="onnxruntime.dll"
        ;;
    aarch64-apple-darwin)
        pkg="onnxruntime-osx-arm64-${version}.tgz"
        lib="libonnxruntime.dylib"
        ;;
    *)
        echo "fetch-onnxruntime: no official shared build for ${target}; paddle OCR degrades to system OCR there."
        exit 0
        ;;
esac

if [ -f "${dest}/${lib}" ]; then
    echo "fetch-onnxruntime: ${lib} already present."
    exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

url="https://github.com/microsoft/onnxruntime/releases/download/v${version}/${pkg}"
echo "fetch-onnxruntime: downloading ${url}"
curl -fsSL --retry 3 --retry-delay 5 -o "${tmp}/pkg" "$url"

case "$pkg" in
    *.tgz)
        tar -xzf "${tmp}/pkg" -C "$tmp"
        ;;
    *.zip)
        # Windows runners put GNU tar (which cannot read zip) first on PATH;
        # bsdtar ships as the System32 tar.exe. Fall back to unzip/python.
        if tar --version 2>/dev/null | grep -qi bsdtar; then
            tar -xf "${tmp}/pkg" -C "$tmp"
        elif [ -n "${SYSTEMROOT:-}" ] && [ -f "${SYSTEMROOT}/System32/tar.exe" ]; then
            "${SYSTEMROOT}/System32/tar.exe" -xf "${tmp}/pkg" -C "${tmp}"
        elif command -v unzip >/dev/null 2>&1; then
            unzip -oq "${tmp}/pkg" -d "$tmp"
        else
            python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${tmp}/pkg" "$tmp"
        fi
        ;;
esac

found="$(find "$tmp" -type f -name "${lib}*" | head -1)"
if [ -z "$found" ]; then
    echo "fetch-onnxruntime: ${lib} not found inside ${pkg}" >&2
    exit 1
fi
cp "$found" "${dest}/${lib}"
echo "fetch-onnxruntime: installed ${dest}/${lib}"
