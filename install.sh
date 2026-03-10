#!/usr/bin/env bash
# Usage: ./install.sh [project_root]
# Copies generated files from ~/Downloads into the project.
# Defaults to the current directory if no argument given.

set -euo pipefail

PROJECT="${1:-.}"

copy() {
  local src="$HOME/Downloads/$1"
  local dst="$PROJECT/$2"
  if [[ ! -f "$src" ]]; then
    echo "  SKIP  $1 (not found in ~/Downloads)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  mv "$src" "$dst"
  echo "  OK    $1 → $2"
}

echo "Installing into: $PROJECT"
echo ""

# ── Docs ───────────────────────────────────────────────────────────────────────
copy "IMPLEMENTATION_SPEC.md"          "docs/IMPLEMENTATION_SPEC.md"
copy "BEHAVIORAL_SPEC.md"              "docs/BEHAVIORAL_SPEC.md"
copy "CONFIG_SCHEMA_SPEC.md"           "docs/CONFIG_SCHEMA_SPEC.md"
copy "DSL_SPEC.md"                     "docs/DSL_SPEC.md"
copy "SEQUENCE_SPEC.md"                     "docs/DSL_SPEC.md"

# ── Config ─────────────────────────────────────────────────────────────────────
copy "QuestionnaireSet.schema.json"    "src/config/QuestionnaireSet.schema.json"
copy "loader.js"                       "src/config/loader.js"
copy "loader.test.js"                  "src/config/loader.test.js"

# ── Engine ─────────────────────────────────────────────────────────────────────
copy "dsl.js"                          "src/engine/dsl.js"
copy "dsl.test.js"                     "src/engine/dsl.test.js"
copy "scoring.js"                      "src/engine/scoring.js"
copy "scoring.test.js"                 "src/engine/scoring.test.js"
copy "alerts.js"                       "src/engine/alerts.js"
copy "alerts.test.js"                  "src/engine/alerts.test.js"
copy "sequence-runner.js"              "src/engine/sequence-runner.js"
copy "sequence-runner.test.js"         "src/engine/sequence-runner.test.js"
copy "orchestrator.js"                 "src/engine/orchestrator.js"
copy "orchestrator.test.js"            "src/engine/orchestrator.test.js"
copy "engine.js"                       "src/engine/engine.js"
copy "engine.test.js"                  "src/engine/engine.test.js"
copy "render-likert.js"                "src/engine/render-likert.js"
copy "render-binary.js"                "src/engine/render-binary.js"
copy "render-instructions.js"          "src/engine/render-instructions.js"

# ── PDF ────────────────────────────────────────────────────────────────────────
copy "report.js"                       "src/pdf/report.js"

# ── App shell ──────────────────────────────────────────────────────────────────
copy "app.js"                          "src/app.js"
copy "router.js"                       "src/router.js"
copy "main.css"                        "src/styles/main.css"

# ── Composer ───────────────────────────────────────────────────────────────────
copy "composer-index.html"             "composer/index.html"
copy "composer-main.js"                "composer/src/main.js"

# ── Test fixtures ──────────────────────────────────────────────────────────────
copy "fixture-phq9.json"               "tests/fixtures/phq9.json"
copy "fixture-gad7.json"               "tests/fixtures/gad7.json"
copy "fixture-pcl5.json"               "tests/fixtures/pcl5.json"
copy "fixture-ocir.json"               "tests/fixtures/ocir.json"

# ── E2E tests ──────────────────────────────────────────────────────────────────
copy "e2e-patient-flow.test.js"        "tests/e2e/patient-flow.test.js"
copy "e2e-composer.test.js"            "tests/e2e/composer.test.js"

# ── Scripts ────────────────────────────────────────────────────────────────────
copy "validate-configs.mjs"            "scripts/validate-configs.mjs"
copy "check-size.mjs"                  "scripts/check-size.mjs"

# ── Config data ────────────────────────────────────────────────────────────────
copy "standard.json"                   "public/configs/prod/standard.json"
copy "QuestionnaireSet.schema.test.js" "src/config/QuestionnaireSet.schema.test.js"

echo ""
echo "Done."
