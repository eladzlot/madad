// composer-handlers.js
// User interaction handlers — toggle, copy, share, reset.
// Imported by composer-render.js to attach to DOM elements.

import { state } from './composer-state.js';

// render is injected at init time to avoid a circular dependency
// (render imports handlers; handlers need to call render)
let _render = null;
export function initHandlers(renderFn) { _render = renderFn; }

// ── Selection ─────────────────────────────────────────────────────────────────

export function handleToggle(id, checked) {
  if (checked) {
    if (!state.selected.includes(id)) state.selected.push(id);
  } else {
    state.selected = state.selected.filter(s => s !== id);
  }
  _render();
}

// ── Copy ──────────────────────────────────────────────────────────────────────

export async function handleCopy(btn) {
  const url = state.currentUrl;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    const orig = btn.textContent;
    btn.textContent = '✓ הועתק';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  } catch {
    // Fallback: select text in the URL box
    const urlBox = document.querySelector('.c-url-box');
    if (urlBox) {
      const range = document.createRange();
      range.selectNodeContents(urlBox);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

// ── Share ─────────────────────────────────────────────────────────────────────

export async function handleShare() {
  const url = state.currentUrl;
  if (!url || !navigator.share) return;
  try { await navigator.share({ url, title: 'קישור לשאלון הערכה' }); } catch { /* cancelled */ }
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function handleReset() {
  state.selected = [];
  state.pid = '';
  state.query = '';
  _render();
}
