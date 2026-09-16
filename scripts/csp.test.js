/**
 * scripts/csp.test.js
 *
 * The CSP ships twice: as a build-time <meta> (vite.shared.js cspPlugin) and
 * as an HTTP response header (public/_headers, served by Cloudflare Pages).
 * Browsers enforce both as an intersection, so a directive that is loosened in
 * one file and not the other is still blocked in production — and `vite
 * preview` serves only the meta one, so the dist-smoke suite cannot see the
 * difference. This test is the only place the two are compared.
 *
 * It also pins the blob: allowances that features depend on at runtime, each
 * of which has already broken once: img-src blob: for the aggregate chart
 * export (an SVG blob: URL drawn through <img> to rasterize a PNG), font-src
 * and worker-src blob: for pdfmake.
 */

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { CSP_DIRECTIVES } from '../vite.shared.js';

const headersCsp = () => {
  const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const line = text.split('\n').find(l => l.trim().startsWith('Content-Security-Policy:'));
  expect(line, 'public/_headers must carry a Content-Security-Policy').toBeTruthy();
  return line.slice(line.indexOf(':') + 1).trim();
};

const directiveMap = (csp) => Object.fromEntries(
  csp.split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values.join(' ')];
  })
);

describe('CSP', () => {
  it('serves the same directives from the meta tag and the HTTP header', () => {
    const meta = directiveMap(CSP_DIRECTIVES.join('; '));
    const header = directiveMap(headersCsp());

    // The header carries extras a meta tag cannot (frame-ancestors); every
    // directive the meta tag sets must appear there with identical values.
    for (const [name, values] of Object.entries(meta)) {
      expect(header[name], `public/_headers is missing "${name}"`).toBe(values);
    }
  });

  it('allows the blob: URLs the app loads at runtime', () => {
    for (const csp of [CSP_DIRECTIVES.join('; '), headersCsp()]) {
      const d = directiveMap(csp);
      // No fallback to default-src: it is 'self'-only, which blocks blob:.
      expect(d['img-src'], 'chart export rasterizes an SVG blob: URL via <img>').toContain('blob:');
      expect(d['font-src'], 'pdfmake loads fonts via blob: URLs').toContain('blob:');
      expect(d['worker-src'], 'pdfmake may use blob: workers').toContain('blob:');
    }
  });
});
