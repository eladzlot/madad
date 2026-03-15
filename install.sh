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
    return
  fi
  mkdir -p "$(dirname "$dst")"
  mv "$src" "$dst"
  echo "  MOVING    $1 → $2"
}

echo "Installing into: $PROJECT"
echo ""

# ── Docs ───────────────────────────────────────────────────────────────────────
copy "IMPLEMENTATION_SPEC.md"          "docs/IMPLEMENTATION_SPEC.md"
copy "BEHAVIORAL_SPEC.md"              "docs/BEHAVIORAL_SPEC.md"
copy "CONFIG_SCHEMA_SPEC.md"           "docs/CONFIG_SCHEMA_SPEC.md"
copy "DSL_SPEC.md"                     "docs/DSL_SPEC.md"
copy "SEQUENCE_SPEC.md"                "docs/SEQUENCE_SPEC.md"
copy "RENDER_SPEC.md"                  "docs/RENDER_SPEC.md"
copy "COMPOSER_SPEC.md"                "docs/COMPOSER_SPEC.md"
copy "HANDOVER.md"                     "docs/HANDOVER.md"
copy "INSTRUMENTS.md"                  "docs/INSTRUMENTS.md"

# ── Config ─────────────────────────────────────────────────────────────────────
copy "QuestionnaireSet.schema.json"    "src/config/QuestionnaireSet.schema.json"
copy "loader.js"                       "src/config/loader.js"
copy "loader.test.js"                  "src/config/loader.test.js"
copy "config-validation.js"            "src/config/config-validation.js"
copy "config-validation.test.js"       "src/config/config-validation.test.js"

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
copy "router.js"                       "src/router.js"
copy "router.test.js"                  "src/router.test.js"


# ── Components ─────────────────────────────────────────────────────────────────
copy "item-likert.js"                  "src/components/item-likert.js"
copy "item-likert.test.js"             "src/components/item-likert.test.js"
copy "item-binary.js"                  "src/components/item-binary.js"
copy "item-binary.test.js"             "src/components/item-binary.test.js"
copy "item-instructions.js"            "src/components/item-instructions.js"
copy "item-instructions.test.js"       "src/components/item-instructions.test.js"
copy "progress-bar.js"                 "src/components/progress-bar.js"
copy "progress-bar.test.js"            "src/components/progress-bar.test.js"
copy "app-shell.js"                    "src/components/app-shell.js"
copy "app-shell.test.js"               "src/components/app-shell.test.js"
copy "welcome-screen.js"               "src/components/welcome-screen.js"
copy "welcome-screen.test.js"          "src/components/welcome-screen.test.js"
copy "completion-screen.js"            "src/components/completion-screen.js"
copy "completion-screen.test.js"       "src/components/completion-screen.test.js"
copy "results-screen.js"               "src/components/results-screen.js"
copy "results-screen.test.js"          "src/components/results-screen.test.js"

# ── Helpers ────────────────────────────────────────────────────────────────────
copy "gestures.js"                     "src/helpers/gestures.js"
copy "gestures.test.js"                "src/helpers/gestures.test.js"

# ── Styles ─────────────────────────────────────────────────────────────────────
copy "tokens.css"                      "src/styles/tokens.css"
copy "main.css"                        "src/styles/main.css"

# ── PDF ────────────────────────────────────────────────────────────────────────
copy "report.js"                       "src/pdf/report.js"
copy "report.test.js"                  "src/pdf/report.test.js"

# ── App shell ──────────────────────────────────────────────────────────────────
copy "index.html"                      "index.html"
copy "app.js"                          "src/app.js"
copy "controller.js"                   "src/controller.js"
copy "controller.test.js"              "src/controller.test.js"
copy "router.js"                       "src/router.js"
copy "resolve-items.js"                "src/resolve-items.js"
copy "resolve-items.test.js"           "src/resolve-items.test.js"

copy "main.css"                        "src/styles/main.css"

# ── Composer ───────────────────────────────────────────────────────────────────
copy "composer.js"                "composer/src/composer.js"
copy "composer.test.js"           "composer/src/composer.test.js"
copy "composer-handlers.js"       "composer/src/composer-handlers.js"
copy "composer-loader.js"         "composer/src/composer-loader.js"
copy "composer-loader.test.js"    "composer/src/composer-loader.test.js"
copy "composer-render.js"         "composer/src/composer-render.js"
copy "composer-state.js"          "composer/src/composer-state.js"
copy "composer-state.test.js"     "composer/src/composer-state.test.js"
copy "configs.json"               "public/composer/configs.json"

# ── Test setup    ──────────────────────────────────────────────────────────────
copy "vitest.config.js"                "vitest.config.js"
copy "setup.js"                        "tests/setup.js"
copy "setup-dom.js"                    "tests/setup-dom.js"

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

copy "ci.yml"                          ".github/workflows/ci.yml"


echo ""
echo "Done."
