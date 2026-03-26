#!/usr/bin/env bash
# build-og-image.sh
# Converts landing/og-image.svg → public/assets/og-image.png
# Run from the repo root: bash scripts/build-og-image.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="$REPO_ROOT/landing/og-image.svg"
OUT_DIR="$REPO_ROOT/public/assets"
OUT="$OUT_DIR/og-image.png"

# ── Check Inkscape ──────────────────────────────────────────────────────────
if ! command -v inkscape &> /dev/null; then
  echo ""
  echo "  ✗ Inkscape not found."
  echo ""
  echo "  Install on Pop!_OS / Ubuntu:"
  echo "    sudo apt update && sudo apt install inkscape"
  echo ""
  echo "  Or via Flatpak:"
  echo "    flatpak install flathub org.inkscape.Inkscape"
  echo "    (then replace 'inkscape' with 'flatpak run org.inkscape.Inkscape' in this script)"
  echo ""
  exit 1
fi

INKSCAPE_VERSION=$(inkscape --version 2>&1 | head -1)
echo "  ✓ Found: $INKSCAPE_VERSION"

# ── Check source file ───────────────────────────────────────────────────────
if [ ! -f "$SRC" ]; then
  echo ""
  echo "  ✗ Source file not found: $SRC"
  echo "  Make sure og-image.svg is in the landing/ directory."
  echo ""
  exit 1
fi

# ── Ensure output directory exists ─────────────────────────────────────────
mkdir -p "$OUT_DIR"

# ── Convert ─────────────────────────────────────────────────────────────────
echo "  Converting $SRC"
echo "  → $OUT"
echo ""

INKSCAPE_LOG=$(mktemp)
inkscape "$SRC" \
  --export-type=png \
  --export-filename="$OUT" \
  --export-width=1200 \
  --export-height=630 >"$INKSCAPE_LOG" 2>&1 || { echo ""; echo "  ✗ Inkscape failed:"; cat "$INKSCAPE_LOG"; rm -f "$INKSCAPE_LOG"; exit 1; }
rm -f "$INKSCAPE_LOG"

echo ""
echo "  ✓ Done: $OUT"
echo "  Size: $(du -h "$OUT" | cut -f1)"
