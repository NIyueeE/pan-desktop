#!/bin/bash
set -euo pipefail

# Avoid pulling architecture-dependent introspection tooling (e.g. gobject-introspection)
# that is often only a Recommends and breaks i386/armhf cross builds on Debian bookworm.
echo 'APT::Install-Recommends "false";' > /etc/apt/apt.conf.d/99no-recommends

INPUT_TARGET="${1:?target is required}"
export INPUT_TARGET

NODE_VERSION="22.14.0"
NODE_DIST="node-v${NODE_VERSION}-linux-x64"
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz" | tar -Jxf -
export PATH="$(pwd)/${NODE_DIST}/bin:${PATH}"

npm install -g pnpm@9

rustup target add "${INPUT_TARGET}"

if [ "${INPUT_TARGET}" = "x86_64-unknown-linux-gnu" ]; then
    apt-get update
    apt-get install -y \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        patchelf \
        libxdo-dev \
        libxcb1 \
        libxrandr2 \
        libdbus-1-3
elif [ "${INPUT_TARGET}" = "i686-unknown-linux-gnu" ]; then
    dpkg --add-architecture i386
    apt-get update
    apt-get install -y \
        libstdc++6:i386 \
        libgdk-pixbuf2.0-dev:i386 \
        libatomic1:i386 \
        gcc-multilib \
        g++-multilib \
        libwebkit2gtk-4.1-dev:i386 \
        libssl-dev:i386 \
        libgtk-3-dev:i386 \
        librsvg2-dev:i386 \
        patchelf:i386 \
        libxdo-dev:i386 \
        libxcb1:i386 \
        libxrandr2:i386 \
        libdbus-1-3:i386 \
        libayatana-appindicator3-dev:i386
    export PKG_CONFIG_PATH="/usr/lib/i386-linux-gnu/pkgconfig/:${PKG_CONFIG_PATH:-}"
    export PKG_CONFIG_SYSROOT_DIR=/
elif [ "${INPUT_TARGET}" = "aarch64-unknown-linux-gnu" ]; then
    dpkg --add-architecture arm64
    apt-get update
    apt-get install -y \
        g++-aarch64-linux-gnu \
        libc6-dev-arm64-cross \
        libssl-dev:arm64 \
        libwebkit2gtk-4.1-dev:arm64 \
        libgtk-3-dev:arm64 \
        librsvg2-dev:arm64 \
        patchelf:arm64 \
        libxdo-dev:arm64 \
        libxcb1:arm64 \
        libxrandr2:arm64 \
        libdbus-1-3:arm64 \
        libayatana-appindicator3-dev:arm64
    export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
    export CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc
    export CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++
    export PKG_CONFIG_PATH="/usr/lib/aarch64-linux-gnu/pkgconfig"
    export PKG_CONFIG_ALLOW_CROSS=1
elif [ "${INPUT_TARGET}" = "armv7-unknown-linux-gnueabihf" ]; then
    dpkg --add-architecture armhf
    apt-get update
    apt-get install -y \
        g++-arm-linux-gnueabihf \
        libc6-dev-armhf-cross \
        libssl-dev:armhf \
        libwebkit2gtk-4.1-dev:armhf \
        libgtk-3-dev:armhf \
        librsvg2-dev:armhf \
        patchelf:armhf \
        libxdo-dev:armhf \
        libxcb1:armhf \
        libxrandr2:armhf \
        libdbus-1-3:armhf \
        libayatana-appindicator3-dev:armhf
    export CARGO_TARGET_ARMV7_UNKNOWN_LINUX_GNUEABIHF_LINKER=arm-linux-gnueabihf-gcc
    export CC_armv7_unknown_linux_gnueabihf=arm-linux-gnueabihf-gcc
    export CXX_armv7_unknown_linux_gnueabihf=arm-linux-gnueabihf-g++
    export PKG_CONFIG_PATH="/usr/lib/arm-linux-gnueabihf/pkgconfig"
    export PKG_CONFIG_ALLOW_CROSS=1
else
    echo "Unknown target: ${INPUT_TARGET}" >&2
    exit 1
fi

bash .github/actions/build.sh
