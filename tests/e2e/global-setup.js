/**
 * tests/e2e/global-setup.js
 *
 * Generates the PDF fixtures the aggregate suite uploads.
 *
 * tests/fixtures/pdfs/ is gitignored — the files are real pdfmake output,
 * rebuilt from the committed scenario in about a second — so a fresh clone
 * and every CI run start without them. Generating here rather than expecting
 * a manual `npm run pdf:fixtures:e2e` keeps `npm run e2e` self-sufficient and
 * keeps the fixtures in step with the current configs and scoring rules.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export default function globalSetup() {
  execFileSync('npm', ['run', '-s', 'pdf:fixtures:e2e'], { cwd: ROOT, stdio: 'inherit' });
}
