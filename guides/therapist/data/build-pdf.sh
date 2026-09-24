#!/usr/bin/env bash
# Builds GUIDE.he.pdf with the CTR document template
# (~/projects/ctr-templates). Usage: data/build-pdf.sh  (from anywhere)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTR="${CTR:-$HOME/projects/ctr-templates}"
for src in GUIDE.he.md; do
  make -s -C "$CTR" doc BIB= SRC="$HERE/$src" OUT="$HERE/${src%.md}.pdf" \
    PANDOC="pandoc --resource-path=$HERE --lua-filter=$HERE/data/ctr-guide.lua"
done
