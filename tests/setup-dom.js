// Setup file for happy-dom environment (component tests).
// Runs before any test file imports, so suppressions take effect before Lit loads.

// Suppress Lit dev-mode warning — Lit checks this set before emitting.
globalThis.litIssuedWarnings ??= new Set();
globalThis.litIssuedWarnings.add('dev-mode');

// Suppress @open-wc DEP0151 — a known bug in their dependency tree.
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.code !== 'DEP0151') console.warn(w); });
