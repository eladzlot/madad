/**
 * build-validator.mjs
 *
 * Generates shared/config/validate-schema.js — a pre-compiled, CSP-safe Ajv
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
const schema = require('../shared/config/QuestionnaireSet.schema.json');

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
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/,
  ucs2length + '\nconst $1 = ucs2length;'
);

// Same for the deep-equal helper Ajv emits for uniqueItems / const / enum on
// non-scalar values (fast-deep-equal via ajv/dist/runtime/equal).
const deepEqual = `function deepEqual(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = a.length; i-- !== 0;) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    for (const key of keys) if (!deepEqual(a[key], b[key])) return false;
    return true;
  }
  return a !== a && b !== b; // NaN === NaN
}`;

code = code.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/equal"\)\.default;/,
  deepEqual + '\nconst $1 = deepEqual;'
);

// Guard: the output ships to the browser as pure ESM. Any require() that
// survives the replacements above would throw "require is not defined" in
// production (caught by dist-smoke, but fail fast here instead).
if (/\brequire\(/.test(code)) {
  const helper = code.match(/require\("[^"]*"\)/)?.[0] ?? 'unknown';
  throw new Error(
    `Generated validator still contains a CommonJS ${helper} call. ` +
    'Add an inline replacement for this Ajv runtime helper in build-validator.mjs.'
  );
}

const outPath = resolve(__dirname, '../shared/config/validate-schema.js');
writeFileSync(outPath, `/* eslint-disable */\n${code}`);

console.log(`✓ validate-schema.js written (${(code.length / 1024).toFixed(1)} KB)`);
