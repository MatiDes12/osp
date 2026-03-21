#!/bin/bash
# Downloads go2rtc binaries for all target platforms into src-tauri/binaries/
# Run before building the Tauri app: bash scripts/download-go2rtc.sh

set -e

VERSION="v1.9.9"
BINARIES_DIR="src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

BASE_URL="https://github.com/AlexxIT/go2rtc/releases/download/${VERSION}"

download() {
  local url=$1
  local dest=$2
  echo "Downloading $dest..."
  curl -fsSL "$url" -o "$dest"
  chmod +x "$dest"
}

# ── Windows (x86_64) ──────────────────────────────────────────────────────────
download "${BASE_URL}/go2rtc_win64.exe" \
  "${BINARIES_DIR}/go2rtc-x86_64-pc-windows-msvc.exe"

# ── macOS (Apple Silicon) ─────────────────────────────────────────────────────
download "${BASE_URL}/go2rtc_mac_arm64" \
  "${BINARIES_DIR}/go2rtc-aarch64-apple-darwin"

# ── macOS (Intel) ─────────────────────────────────────────────────────────────
download "${BASE_URL}/go2rtc_mac_amd64" \
  "${BINARIES_DIR}/go2rtc-x86_64-apple-darwin"

# ── Linux (x86_64) ────────────────────────────────────────────────────────────
download "${BASE_URL}/go2rtc_linux_amd64" \
  "${BINARIES_DIR}/go2rtc-x86_64-unknown-linux-gnu"

echo "✅ go2rtc binaries downloaded to $BINARIES_DIR"
