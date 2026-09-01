#!/usr/bin/env bash
# Fetch the PP-OCRv5 mobile ONNX models (det/cls/rec) bundled as Tauri
# resources into src-tauri/resources/models/paddleocr/. The recognizer
# dictionary (ppocrv5_dict.txt) is committed to the repository and is NOT
# touched. CI runs this before `tauri build`; local dev runs it once.
#
# Source: RapidAI/RapidOCR on ModelScope — the exact conversions the local
# end-to-end test was validated against. ModelScope rate-limits anonymous
# downloaders (a burst of 404s), hence the aggressive retry flags; CI caches
# the fetched assets so one success per script version is enough.
set -euo pipefail

base="https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv5"
dest="src-tauri/resources/models/paddleocr"
mkdir -p "$dest"

fetch() {
    local url="$1" out="$2" expected_min="$3"
    if [ -f "$dest/$out" ] && [ "$(wc -c <"$dest/$out")" -ge "$expected_min" ]; then
        echo "fetch-paddle-models: $out already present."
        return
    fi
    echo "fetch-paddle-models: downloading $out"
    # `--retry-all-errors` matters: ModelScope answers transient rate limits
    # with plain 404s, which curl does not retry by default.
    curl -fsSL --retry 5 --retry-all-errors --retry-delay 10 \
        -H "User-Agent: pan-desktop-ci/1.0" \
        -o "$dest/$out.partial" "$url"
    mv "$dest/$out.partial" "$dest/$out"
    local size
    size="$(wc -c <"$dest/$out")"
    if [ "$size" -lt "$expected_min" ]; then
        echo "fetch-paddle-models: $out is only ${size} bytes (expected >= ${expected_min})" >&2
        rm -f "$dest/$out"
        exit 1
    fi
    # Small stagger between files keeps the anonymous quota happy.
    sleep 3
}

# Sizes are lower bounds guarding against CDN error pages. The textline
# orientation classifier is the file upstream RapidOCR currently ships for
# PP-OCRv5 (the older ch_ppocr_mobile_v2.0_cls_mobile.onnx was renamed away).
fetch "$base/det/ch_PP-OCRv5_det_mobile.onnx" "ch_PP-OCRv5_det_mobile.onnx" 4000000
fetch "$base/rec/ch_PP-OCRv5_rec_mobile.onnx" "ch_PP-OCRv5_rec_mobile.onnx" 15000000
fetch "$base/cls/ch_PP-LCNet_x0_25_textline_ori_cls_mobile.onnx" \
    "ch_PP-LCNet_x0_25_textline_ori_cls_mobile.onnx" 900000

echo "fetch-paddle-models: done."
