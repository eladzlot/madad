/**
 * build-validator.mjs
 *
 * Generates src/config/validate-schema.js — a pre-compiled, CSP-safe Ajv
 * standalone validator for QuestionnaireSet.schema.json.
 *
 * Run whenever QuestionnaireSet.schema.json changes:
 *   npm run build:validator
 *
 * Why: Ajv's default ajv.compile() uses new Function() at runtime, which
 * violates a strict Content-Security-Policy (script-src 'self', no unsafe-eval).
 * The standalone output is plain JS with no code generation at runtime.
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const Ajv = require('ajv/dist/2020.js');
const standalone = require('ajv/dist/standalone/index.js');
const schema = require('../src/config/QuestionnaireSet.schema.json');

// optimize: 0 prevents Ajv from emitting `require()` calls for runtime helpers.
// esm: true ensures the output uses ES module syntax (export/import).
const ajv = new Ajv({ allErrors: true, code: { source: true, esm: true, optimize: 0 } });
const validate = ajv.compile(schema);
let code = standalone.default(ajv, validate);

// Ajv still emits a CJS require() for ucs2length even with esm: true.
// Replace it with an inline implementation so the output is pure ESM
// with no runtime dependencies — safe under strict CSP (no eval, no require).
const ucs2length = `function ucs2length(str) {
  let length = 0, len = str.length, pos = 0, value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 0xD800 && value <= 0xDBFF && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 0xFC00) === 0xDC00) pos++;
    }
  }
  return length;
}`;

code = code.replace(
  /const func\d+ = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/,
  ucs2length + '\nconst func1 = ucs2length;'
);

const outPath = resolve(__dirname, '../src/config/validate-schema.js');
writeFileSync(outPath, `/* eslint-disable */\n${code}`);

console.log(`✓ validate-schema.js written (${(code.length / 1024).toFixed(1)} KB)`);
