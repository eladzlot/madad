// aggregate.js — entry point for the Aggregate surface (סיכום מטופל).
// Clinician-side, read-only, stateless: PDFs are parsed in the browser,
// charts render from the embedded data.json envelopes, closing the tab
// discards everything. See docs/AGGREGATE_SPEC.md.

import './aggregate.css';

const root = document.getElementById('aggregate-app');

function main() {
  root.innerHTML = '<div class="a-loading"><p>טוען...</p></div>';
}

main();
