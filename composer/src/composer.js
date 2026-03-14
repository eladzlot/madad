// Composer — clinician-facing URL builder.
// Served at /composer/. No framework dependency — plain JS + DOM.
//
// Flow:
//   1. Fetch /composer/configs.json (manifest)
//   2. Load all listed configs via loadConfig() — failures are partial (warn, continue)
//   3. Render selection UI: batteries first, then questionnaires
//   4. Build ?configs=...&items=...&pid=... URL live on every change
//   5. Copy / Share buttons deliver the URL to the clinician

import { loadConfig } from '/src/config/loader.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MANIFEST_URL = '/composer/configs.json';
const PID_PATTERN  = /^[a-zA-Z0-9\u0590-\u05FF_-]*$/;

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  batteries:      [],       // [{ id, title, sourceUrl }]
  questionnaires: [],       // [{ id, title, sourceUrl }]
  sourceByItem:   new Map(),// id → sourceUrl
  selected:       [],       // string[] in selection order
  pid:            '',
  query:          '',       // search string
  currentUrl:     null,     // kept in sync by render/renderPartial
  warnings:       [],       // string[]
};

// ── Root ─────────────────────────────────────────────────────────────────────

const root = document.getElementById('composer-app');

// ── Manifest + config loading ─────────────────────────────────────────────────

async function loadManifest() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`שגיאה בטעינת המניפסט: HTTP ${res.status}`);
  return res.json();
}

async function loadAllConfigs(manifest) {
  const results = await Promise.allSettled(
    manifest.configs.map(entry =>
      loadConfig([entry.url]).then(config => ({ entry, config }))
    )
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      const url = result.reason?.url ?? '(לא ידוע)';
      state.warnings.push(`לא ניתן לטעון: ${url}`);
      continue;
    }

    const { entry, config } = result.value;

    for (const b of config.batteries) {
      state.batteries.push({ id: b.id, title: b.title, description: b.description ?? '', sourceUrl: entry.url });
      state.sourceByItem.set(b.id, entry.url);
    }
    for (const q of config.questionnaires) {
      state.questionnaires.push({ id: q.id, title: q.title, description: q.description ?? '', sourceUrl: entry.url });
      state.sourceByItem.set(q.id, entry.url);
    }
  }
}

// ── URL generation ────────────────────────────────────────────────────────────

function buildUrl() {
  if (state.selected.length === 0) return null;

  const neededSources = new Set(
    state.selected.map(id => state.sourceByItem.get(id)).filter(Boolean)
  );

  const params = new URLSearchParams();
  params.set('configs', [...neededSources].join(','));
  params.set('items',   state.selected.join(','));
  if (state.pid.trim()) params.set('pid', state.pid.trim());

  return `${window.location.origin}/?${params.toString()}`;
}

// ── Search ────────────────────────────────────────────────────────────────────

function matchesQuery(item, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    item.id.toLowerCase().includes(q) ||
    item.title.toLowerCase().includes(q) ||
    (item.description && item.description.toLowerCase().includes(q))
  );
}



function pidWarning(pid) {
  if (!pid) return null;
  if (!PID_PATTERN.test(pid)) {
    return 'המזהה מכיל תווים לא מומלצים. השתמש באותיות, ספרות, מקף או קו תחתון.';
  }
  return null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) { return String(str).replace(/"/g, '&quot;'); }

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const url      = buildUrl();
  state.currentUrl = url;
  const pidWarn  = pidWarning(state.pid);
  const warnings = [...state.warnings, ...(pidWarn ? [pidWarn] : [])];

  const focusedClass = document.activeElement?.classList;
  const pidFocused    = focusedClass?.contains('c-pid-input');
  const searchFocused = focusedClass?.contains('c-search-input');

  root.innerHTML = '';
  root.appendChild(renderHeader());
  if (warnings.length) root.appendChild(renderWarnings(warnings));
  root.appendChild(renderUrlSection(url));
  root.appendChild(renderPidSection(pidFocused));
  root.appendChild(renderSelectionSection());
  if (state.selected.length > 0) root.appendChild(renderOrderSection());

  // Restore search focus after full re-render (e.g. after checkbox toggle)
  if (searchFocused) {
    requestAnimationFrame(() => root.querySelector('.c-search-input')?.focus());
  }
}

function renderHeader() {
  const el = document.createElement('header');
  el.className = 'c-header';
  el.innerHTML = `
    <div class="content-column">
      <h1 class="c-title">מחולל קישורים</h1>
      <p class="c-subtitle">בחר שאלונים, הוסף מזהה מטופל, העתק קישור.</p>
    </div>
  `;
  return el;
}

function renderWarnings(warnings) {
  const el = document.createElement('div');
  el.className = 'c-warnings';
  el.setAttribute('role', 'alert');
  const inner = document.createElement('div');
  inner.className = 'content-column';
  inner.innerHTML = warnings.map(w => `<p class="c-warning-item">⚠ ${escapeHtml(w)}</p>`).join('');
  el.appendChild(inner);
  return el;
}

function renderUrlSection(url) {
  const section = document.createElement('section');
  section.className = 'c-section';

  const inner = document.createElement('div');
  inner.className = 'content-column';
  inner.innerHTML = `<h2 class="c-section-label">קישור למטופל</h2>`;

  // URL display box
  const urlBox = document.createElement('div');
  urlBox.className = `c-url-box${url ? '' : ' c-url-box--empty'}`;
  urlBox.setAttribute('aria-label', 'קישור שנוצר');
  urlBox.setAttribute('dir', 'ltr');
  urlBox.textContent = url ?? 'לא נבחרו שאלונים';
  inner.appendChild(urlBox);

  // Button row
  const btnRow = document.createElement('div');
  btnRow.className = 'c-btn-row';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'c-btn c-btn--primary';
  copyBtn.dataset.action = 'copy';
  copyBtn.textContent = 'העתק קישור';
  copyBtn.disabled = !url;
  copyBtn.addEventListener('click', () => handleCopy(state.currentUrl, copyBtn));
  btnRow.appendChild(copyBtn);

  if (navigator.share) {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'c-btn c-btn--secondary';
    shareBtn.dataset.action = 'share';
    shareBtn.textContent = 'שתף';
    shareBtn.disabled = !url;
    shareBtn.addEventListener('click', () => handleShare(state.currentUrl));
    btnRow.appendChild(shareBtn);
  }

  const resetBtn = document.createElement('button');
  resetBtn.className = 'c-btn c-btn--ghost';
  resetBtn.dataset.action = 'reset';
  resetBtn.textContent = 'איפוס';
  resetBtn.addEventListener('click', handleReset);
  btnRow.appendChild(resetBtn);

  inner.appendChild(btnRow);
  section.appendChild(inner);
  return section;
}

function renderPidSection(preserveFocus) {
  const section = document.createElement('section');
  section.className = 'c-section';

  const inner = document.createElement('div');
  inner.className = 'content-column';
  inner.innerHTML = `
    <h2 class="c-section-label">מזהה מטופל <span class="c-optional">(אופציונלי)</span></h2>
    <input
      class="c-pid-input"
      type="text"
      dir="ltr"
      placeholder="TRC-2025-000123"
      value="${escapeAttr(state.pid)}"
      aria-label="מזהה מטופל"
      autocomplete="off"
      spellcheck="false"
    />
    <p class="c-hint">אותיות, ספרות, מקף וקו תחתון. יופיע בדוח PDF בלבד.</p>
  `;

  section.appendChild(inner);

  const input = inner.querySelector('.c-pid-input');
  input.addEventListener('input', (e) => {
    state.pid = e.target.value;
    // Re-render without clobbering focus — update only the affected parts
    renderPartial();
  });

  // Restore focus if it was on the PID field before re-render
  if (preserveFocus) {
    requestAnimationFrame(() => {
      const newInput = root.querySelector('.c-pid-input');
      if (newInput) {
        newInput.focus();
        const len = newInput.value.length;
        newInput.setSelectionRange(len, len);
      }
    });
  }

  return section;
}

// Partial re-render: only update URL box and order list, preserving input focus
function renderPartial() {
  const url     = buildUrl();
  state.currentUrl = url;
  const pidWarn = pidWarning(state.pid);
  const warnings = [...state.warnings, ...(pidWarn ? [pidWarn] : [])];

  // Update warnings
  const existingWarn = root.querySelector('.c-warnings');
  if (warnings.length) {
    const newWarn = renderWarnings(warnings);
    if (existingWarn) existingWarn.replaceWith(newWarn);
    else root.querySelector('.c-header').insertAdjacentElement('afterend', newWarn);
  } else if (existingWarn) {
    existingWarn.remove();
  }

  // Update URL box
  const urlBox = root.querySelector('.c-url-box');
  if (urlBox) {
    urlBox.textContent = url ?? 'לא נבחרו שאלונים';
    urlBox.classList.toggle('c-url-box--empty', !url);
  }

  // Update copy/share button disabled state
  root.querySelectorAll('.c-btn[data-action="copy"], .c-btn[data-action="share"]').forEach(btn => {
    btn.disabled = !url;
  });
}

function renderSelectionSection() {
  const section = document.createElement('section');
  section.className = 'c-section';

  const inner = document.createElement('div');
  inner.className = 'content-column';
  inner.innerHTML = `<h2 class="c-section-label">בחירת שאלונים</h2>`;

  // Search field
  const searchWrap = document.createElement('div');
  searchWrap.className = 'c-search-wrap';
  searchWrap.innerHTML = `
    <input
      class="c-search-input"
      type="search"
      placeholder="חיפוש לפי שם, ראשי תיבות או תיאור…"
      value="${escapeAttr(state.query)}"
      aria-label="חיפוש שאלונים"
      autocomplete="off"
      spellcheck="false"
    />
  `;
  inner.appendChild(searchWrap);

  const searchInput = searchWrap.querySelector('.c-search-input');
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    // Partial re-render: only replace the item groups and result count
    renderSelectionGroups(inner);
  });

  renderSelectionGroups(inner);
  section.appendChild(inner);
  return section;
}

function renderSelectionGroups(inner) {
  // Remove existing groups and empty state
  inner.querySelectorAll('.c-group, .c-empty, .c-no-results').forEach(el => el.remove());

  const filteredBatteries      = state.batteries.filter(b => matchesQuery(b, state.query));
  const filteredQuestionnaires = state.questionnaires.filter(q => matchesQuery(q, state.query));
  const total = state.batteries.length + state.questionnaires.length;
  const hasAny = filteredBatteries.length > 0 || filteredQuestionnaires.length > 0;

  if (total === 0) {
    const empty = document.createElement('p');
    empty.className = 'c-empty';
    empty.textContent = 'לא נמצאו שאלונים.';
    inner.appendChild(empty);
    return;
  }

  if (!hasAny) {
    const empty = document.createElement('p');
    empty.className = 'c-no-results';
    empty.textContent = 'אין תוצאות לחיפוש זה.';
    inner.appendChild(empty);
    return;
  }

  if (filteredBatteries.length > 0) {
    inner.appendChild(renderItemGroup('סוללות — מקבצים מוגדרים מראש', filteredBatteries, true));
  }
  if (filteredQuestionnaires.length > 0) {
    inner.appendChild(renderItemGroup('שאלונים בודדים', filteredQuestionnaires, false));
  }
}

function renderItemGroup(title, items, isBattery) {
  const group = document.createElement('div');
  group.className = 'c-group';

  const groupLabel = document.createElement('h3');
  groupLabel.className = 'c-group-label';
  groupLabel.textContent = title;
  group.appendChild(groupLabel);

  const list = document.createElement('ul');
  list.className = 'c-item-list';
  list.setAttribute('role', 'list');

  for (const item of items) {
    const isSelected = state.selected.includes(item.id);
    const li = document.createElement('li');
    li.className = `c-item${isSelected ? ' c-item--selected' : ''}`;

    const checkId = `chk-${item.id}`;
    li.innerHTML = `
      <label class="c-item-label" for="${checkId}">
        <input
          class="c-item-checkbox"
          type="checkbox"
          id="${checkId}"
          value="${escapeAttr(item.id)}"
          ${isSelected ? 'checked' : ''}
        />
        <span class="c-item-body">
          <span class="c-item-name">${escapeHtml(item.title)}</span>
          <span class="c-item-id">${escapeHtml(item.id)}</span>
          ${item.description ? `<span class="c-item-desc">${escapeHtml(item.description)}</span>` : ''}
        </span>
        ${isBattery ? `<span class="c-badge">סוללה</span>` : ''}
      </label>
    `;

    li.querySelector('input').addEventListener('change', (e) => {
      handleToggle(item.id, e.target.checked);
    });

    list.appendChild(li);
  }

  group.appendChild(list);
  return group;
}

function renderOrderSection() {
  const section = document.createElement('section');
  section.className = 'c-section';

  const inner = document.createElement('div');
  inner.className = 'content-column';
  inner.innerHTML = `<h2 class="c-section-label">סדר המפגש</h2>`;

  const ol = document.createElement('ol');
  ol.className = 'c-order-list';

  for (const id of state.selected) {
    const entry =
      state.batteries.find(b => b.id === id) ??
      state.questionnaires.find(q => q.id === id);
    const li = document.createElement('li');
    li.className = 'c-order-item';
    li.textContent = entry?.title ?? id;
    ol.appendChild(li);
  }

  inner.appendChild(ol);
  section.appendChild(inner);
  return section;
}

// ── Event handlers ────────────────────────────────────────────────────────────

function handleToggle(id, checked) {
  if (checked) {
    if (!state.selected.includes(id)) state.selected.push(id);
  } else {
    state.selected = state.selected.filter(s => s !== id);
  }
  render();
}

async function handleCopy(url, btn) {
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    const orig = btn.textContent;
    btn.textContent = '✓ הועתק';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  } catch {
    // Fallback: select text in the URL box
    const urlBox = root.querySelector('.c-url-box');
    if (urlBox) {
      const range = document.createRange();
      range.selectNodeContents(urlBox);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

async function handleShare(url) {
  if (!url || !navigator.share) return;
  try { await navigator.share({ url, title: 'קישור לשאלון הערכה' }); } catch { /* cancelled */ }
}

function handleReset() {
  state.selected = [];
  state.pid = '';
  state.query = '';
  render();
}

// ── Styles ────────────────────────────────────────────────────────────────────

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #composer-app { min-block-size: 100dvh; }

    .c-header {
      border-block-end: var(--border-width) solid var(--color-border);
      background: var(--color-surface);
    }
    .c-title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      line-height: var(--line-height-tight);
      margin-block-end: var(--space-xs);
    }
    .c-subtitle { color: var(--color-text-muted); font-size: var(--font-size-sm); }

    .c-warnings {
      background: var(--color-no-bg);
      border-block-end: var(--border-width) solid var(--color-no);
    }
    .c-warning-item { color: var(--color-no); font-size: var(--font-size-sm); padding-block: var(--space-xs); }

    .c-section { border-block-end: var(--border-width) solid var(--color-border); }
    .c-section-label {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
      margin-block-end: var(--space-md);
    }

    /* URL */
    .c-url-box {
      font-size: var(--font-size-sm);
      font-family: ui-monospace, monospace;
      background: var(--color-surface);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: var(--space-sm) var(--space-md);
      word-break: break-all;
      min-block-size: var(--item-min-touch);
      display: flex;
      align-items: center;
      margin-block-end: var(--space-sm);
      user-select: all;
      text-align: left;
    }
    .c-url-box--empty {
      color: var(--color-text-muted);
      font-family: var(--font-family);
      font-style: italic;
      user-select: none;
    }

    .c-btn-row { display: flex; flex-wrap: wrap; gap: var(--space-sm); }

    /* Buttons */
    .c-btn {
      display: inline-flex; align-items: center; justify-content: center;
      min-block-size: var(--item-min-touch);
      padding-inline: var(--space-lg);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      font-family: inherit;
      cursor: pointer;
      border: var(--border-width) solid transparent;
      transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
    }
    .c-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .c-btn--primary  { background: var(--color-primary); color: var(--color-primary-text); }
    .c-btn--primary:not(:disabled):hover  { background: var(--color-primary-hover); }
    .c-btn--secondary { background: var(--color-surface); color: var(--color-text); border-color: var(--color-border); }
    .c-btn--secondary:not(:disabled):hover { border-color: var(--color-primary); color: var(--color-primary); }
    .c-btn--ghost { background: transparent; color: var(--color-text-muted); }
    .c-btn--ghost:hover { color: var(--color-no); }

    /* PID */
    .c-pid-input {
      display: block; width: 100%; max-width: 320px;
      font-size: var(--font-size-md);
      font-family: ui-monospace, monospace;
      padding: var(--space-sm) var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg); color: var(--color-text);
      min-block-size: var(--item-min-touch);
      margin-block-end: var(--space-sm);
      transition: border-color var(--transition-fast);
    }
    .c-pid-input:focus { outline: none; border-color: var(--color-border-focus); }
    .c-hint { font-size: var(--font-size-sm); color: var(--color-text-muted); }
    .c-optional { font-weight: var(--font-weight-normal); color: var(--color-text-muted); font-size: var(--font-size-sm); }

    /* Search */
    .c-search-wrap { margin-block-end: var(--space-md); }
    .c-search-input {
      display: block; width: 100%;
      font-size: var(--font-size-md);
      font-family: inherit;
      padding: var(--space-sm) var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg); color: var(--color-text);
      min-block-size: var(--item-min-touch);
      transition: border-color var(--transition-fast);
    }
    .c-search-input:focus { outline: none; border-color: var(--color-border-focus); }
    .c-no-results { color: var(--color-text-muted); font-size: var(--font-size-sm); padding-block: var(--space-md); }

    /* Item body with id + description */
    .c-item-label { align-items: flex-start; padding-block: var(--space-md); }
    .c-item-checkbox { margin-block-start: 3px; }
    .c-item-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .c-item-name { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
    .c-item-id {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      font-family: ui-monospace, monospace;
      direction: ltr; text-align: right;
    }
    .c-item-desc { font-size: var(--font-size-sm); color: var(--color-text-muted); }
    .c-group { margin-block-end: var(--space-lg); }
    .c-group:last-child { margin-block-end: 0; }
    .c-group-label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-block-end: var(--space-sm);
    }
    .c-item-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-xs); }
    .c-item {
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-bg);
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }
    .c-item--selected { border-color: var(--color-selected-border); background: var(--color-selected-bg); }
    .c-item-label {
      display: flex; align-items: center; gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      cursor: pointer;
      min-block-size: var(--item-min-touch);
    }
    .c-item-checkbox { flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--color-primary); cursor: pointer; }
    .c-badge {
      font-size: var(--font-size-sm); color: var(--color-primary);
      background: var(--color-selected-bg);
      border: var(--border-width) solid var(--color-selected-border);
      border-radius: var(--radius-sm);
      padding-inline: var(--space-sm); padding-block: 2px;
      white-space: nowrap;
    }

    /* Order */
    .c-order-list { list-style: none; counter-reset: order; display: flex; flex-direction: column; gap: var(--space-xs); }
    .c-order-item {
      counter-increment: order;
      display: flex; align-items: center; gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      background: var(--color-surface);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
    }
    .c-order-item::before {
      content: counter(order);
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--color-primary); color: var(--color-primary-text);
      font-size: 12px; font-weight: var(--font-weight-bold); flex-shrink: 0;
    }

    .c-empty { color: var(--color-text-muted); font-size: var(--font-size-sm); padding-block: var(--space-lg); text-align: center; }
    .c-loading, .c-error {
      display: flex; align-items: center; justify-content: center;
      min-block-size: 50dvh; flex-direction: column; gap: var(--space-md);
      color: var(--color-text-muted);
    }
    .c-error { color: var(--color-no); }
  `;
  document.head.appendChild(style);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  injectStyles();
  root.innerHTML = `<div class="c-loading"><p>טוען...</p></div>`;

  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    root.innerHTML = `<div class="c-error"><p>שגיאה בטעינת הגדרות המחולל.</p><pre style="font-size:12px">${escapeHtml(err.message)}</pre></div>`;
    return;
  }

  await loadAllConfigs(manifest);
  render();
}

main();
