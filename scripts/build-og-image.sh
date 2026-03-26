#!/usr/bin/env bash
# build-og-image.sh
# Converts OG image SVGs → PNGs in public/
# Run from the repo root: bash scripts/build-og-image.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/public"

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
echo ""

# ── Convert function ─────────────────────────────────────────────────────────
convert() {
  local SRC="$1"
  local OUT="$2"

  if [ ! -f "$SRC" ]; then
    echo "  ✗ Source not found: $SRC"
    exit 1
  fi

  echo "  Converting $(basename "$SRC") → $(basename "$OUT")"

  INKSCAPE_LOG=$(mktemp)
  inkscape "$SRC" \
    --export-type=png \
    --export-filename="$OUT" \
    --export-width=1200 \
    --export-height=630 >"$INKSCAPE_LOG" 2>&1 || {
      echo ""
      echo "  ✗ Inkscape failed:"
      cat "$INKSCAPE_LOG"
      rm -f "$INKSCAPE_LOG"
      exit 1
    }
  rm -f "$INKSCAPE_LOG"
  echo "  ✓ $(du -h "$OUT" | cut -f1)  $OUT"
}

# ── Run both conversions ─────────────────────────────────────────────────────
convert "$REPO_ROOT/public/og-image.svg"     "$OUT_DIR/og-image.png"
convert "$REPO_ROOT/public/og-image-app.svg" "$OUT_DIR/og-image-app.png"

echo ""
echo "  Done."
