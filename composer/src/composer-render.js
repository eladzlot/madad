// composer-render.js
// All DOM rendering for the Composer.
// Exports: render, renderPartial, injectStyles.

import { state, buildUrl, pidWarning, matchesQuery } from './composer-state.js';
import { handleToggle, handleCopy, handleShare, handleReset } from './composer-handlers.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Root element ──────────────────────────────────────────────────────────────

let _root = null;
export function initRoot(rootEl) { _root = rootEl; }

// ── Descriptions toggle (stateless — collapsed on load) ───────────────────────

let _showDescriptions = false;

// ── Keyboard navigation ───────────────────────────────────────────────────────

function getVisibleCheckboxes() {
  return Array.from(_root.querySelectorAll('.c-item-checkbox'));
}

function handleListKeydown(e) {
  if (!document.activeElement?.classList.contains('c-item-checkbox')) return;
  const items = getVisibleCheckboxes();
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[idx + 1]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (idx > 0) items[idx - 1].focus();
    else _root.querySelector('.c-search-input')?.focus();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const cb = items[idx];
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    requestAnimationFrame(() => {
      const next = getVisibleCheckboxes()[idx + 1] ?? getVisibleCheckboxes()[idx];
      next?.focus();
    });
  }
}

function handleSearchKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    state.query = '';
    render();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    getVisibleCheckboxes()[0]?.focus();
  }
}

// ── Drag-and-drop reorder ─────────────────────────────────────────────────────

let _dragId = null;

function handleDragStart(e, id) {
  _dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('c-order-item--dragging');
}

function handleDragOver(e, id) {
  if (_dragId === null || _dragId === id) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const from = state.selected.indexOf(_dragId);
  const to   = state.selected.indexOf(id);
  if (from === -1 || to === -1 || from === to) return;
  const next = [...state.selected];
  next.splice(from, 1);
  next.splice(to, 0, _dragId);
  state.selected = next;
  rerenderOrderList();
}

function handleDragEnd() {
  _dragId = null;
  _root.querySelectorAll('.c-order-item--dragging').forEach(el => el.classList.remove('c-order-item--dragging'));
  render();
}

function rerenderOrderList() {
  // Re-render all order lists (picker panel + output sidebar may both exist)
  _root.querySelectorAll('.c-order-list').forEach(ol => {
    ol.innerHTML = '';
    for (const id of state.selected) ol.appendChild(buildOrderItem(id));
  });
}

// ── Full render ───────────────────────────────────────────────────────────────

export function render() {
  const url     = buildUrl();
  state.currentUrl = url;
  const pidWarn = pidWarning(state.pid);
  const warnings = [...state.warnings, ...(pidWarn ? [pidWarn] : [])];

  const prevFocusId = document.activeElement?.id;
  const pidFocused  = document.activeElement?.classList.contains('c-pid-input');

  _root.innerHTML = '';

  // Full-width header above the two-panel layout
  _root.appendChild(renderHeader(warnings));

  const layout = document.createElement('div');
  layout.className = 'c-layout';

  // c-panel--picker: appended first → visually RIGHT in RTL
  // Contains: questionnaire search + list + reset
  const picker = document.createElement('div');
  picker.className = 'c-panel c-panel--picker';
  picker.appendChild(renderPickerSection());

  // c-panel--output: appended second → visually LEFT in RTL
  // Contains: URL, ID, picked list
  const output = document.createElement('div');
  output.className = 'c-panel c-panel--output';
  output.appendChild(renderOutputPanel(url));

  layout.appendChild(picker);
  layout.appendChild(output);
  _root.appendChild(layout);
  _root.appendChild(renderMobileBar(url));

  // Restore focus
  requestAnimationFrame(() => {
    if (pidFocused) {
      const el = _root.querySelector('.c-pid-input');
      if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
    } else if (prevFocusId?.startsWith('chk-')) {
      _root.querySelector(`#${prevFocusId}`)?.focus();
    } else {
      _root.querySelector('.c-search-input')?.focus();
    }
  });
}

// ── Partial render (updates URL box + buttons in place, preserves DOM) ────────

export function renderPartial() {
  const url     = buildUrl();
  state.currentUrl = url;
  const pidWarn = pidWarning(state.pid);
  const warnings = [...state.warnings, ...(pidWarn ? [pidWarn] : [])];

  // Warnings in header
  const existingWarn = _root.querySelector('.c-warnings');
  if (warnings.length) {
    const w = renderWarnings(warnings);
    if (existingWarn) existingWarn.replaceWith(w);
    else _root.querySelector('.c-header')?.insertAdjacentElement('afterend', w);
  } else if (existingWarn) {
    existingWarn.remove();
  }

  // URL boxes
  _root.querySelectorAll('.c-url-box').forEach(box => {
    box.textContent = url ?? 'לא נבחרו שאלונים';
    box.classList.toggle('c-url-box--empty', !url);
  });

  // Buttons that depend on URL
  _root.querySelectorAll(
    '.c-btn[data-action="copy"], .c-btn[data-action="share"], .c-btn[data-action="test"]'
  ).forEach(btn => { btn.disabled = !url; });

  // Mobile count
  const mc = _root.querySelector('.c-mobile-count');
  if (mc) mc.textContent = state.selected.length > 0 ? `${state.selected.length} נבחרו` : '';
}

// ── Header (full-width, above layout) ────────────────────────────────────────

function renderHeader(warnings) {
  const wrap = document.createElement('div');
  wrap.className = 'c-header-wrap';

  const header = document.createElement('header');
  header.className = 'c-header';
  header.innerHTML = `
    <div class="c-brand">
      <span class="c-brand-name">מדד</span>
      <span class="c-brand-sep">|</span>
      <span class="c-brand-page">מחולל קישורים</span>
    </div>
    <p class="c-subtitle">בחר שאלונים, הוסף מזהה מטופל, העתק קישור.</p>
  `;
  wrap.appendChild(header);

  if (warnings.length) wrap.appendChild(renderWarnings(warnings));
  return wrap;
}

function renderWarnings(warnings) {
  const el = document.createElement('div');
  el.className = 'c-warnings';
  el.setAttribute('role', 'alert');
  el.innerHTML = warnings.map(w => `<p class="c-warning-item">⚠ ${escapeHtml(w)}</p>`).join('');
  return el;
}

// ── Picker section (right panel in RTL) ──────────────────────────────────────

function renderPickerSection() {
  const section = document.createElement('div');
  section.className = 'c-picker';
  section.addEventListener('keydown', handleListKeydown);

  // Search row: input + פרטים toggle + איפוס
  const searchRow = document.createElement('div');
  searchRow.className = 'c-search-row';

  const searchInput = document.createElement('input');
  searchInput.className = 'c-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'חיפוש שאלונים…';
  searchInput.value = state.query;
  searchInput.setAttribute('aria-label', 'חיפוש שאלונים');
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGroups(section);
  });
  searchInput.addEventListener('keydown', handleSearchKeydown);
  searchRow.appendChild(searchInput);

  const descBtn = document.createElement('button');
  descBtn.className = `c-btn c-btn--secondary c-btn--sm${_showDescriptions ? ' c-btn--active' : ''}`;
  descBtn.setAttribute('aria-pressed', String(_showDescriptions));
  descBtn.setAttribute('aria-label', 'הצג תיאורים');
  descBtn.innerHTML = '<span class="c-btn-icon c-btn-icon--info" aria-hidden="true">ⓘ</span>פרטים';
  descBtn.type = 'button';
  descBtn.addEventListener('click', () => {
    _showDescriptions = !_showDescriptions;
    descBtn.classList.toggle('c-btn--active', _showDescriptions);
    descBtn.setAttribute('aria-pressed', String(_showDescriptions));
    renderGroups(section);
  });
  searchRow.appendChild(descBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'c-btn c-btn--ghost c-btn--sm';
  resetBtn.dataset.action = 'reset';
  resetBtn.innerHTML = '<span class="c-btn-icon c-btn-icon--reset" aria-hidden="true">↺</span>איפוס';
  resetBtn.addEventListener('click', handleReset);
  searchRow.appendChild(resetBtn);

  section.appendChild(searchRow);
  renderGroups(section);
  return section;
}

export function renderGroups(container) {
  container.querySelectorAll('.c-group, .c-no-results').forEach(el => el.remove());

  const filteredBatteries      = state.batteries.filter(b => !b.hidden && matchesQuery(b, state.query));
  const filteredQuestionnaires = state.questionnaires.filter(q => !q.hidden && matchesQuery(q, state.query));
  const total = state.batteries.filter(b => !b.hidden).length +
                state.questionnaires.filter(q => !q.hidden).length;

  if (total === 0) {
    const p = document.createElement('p');
    p.className = 'c-no-results';
    p.textContent = 'לא נמצאו שאלונים.';
    container.appendChild(p);
    return;
  }

  if (filteredBatteries.length === 0 && filteredQuestionnaires.length === 0) {
    const p = document.createElement('p');
    p.className = 'c-no-results';
    p.textContent = 'אין תוצאות לחיפוש זה.';
    container.appendChild(p);
    return;
  }

  if (filteredBatteries.length > 0)      container.appendChild(renderGroup('סוללות', filteredBatteries, true));
  if (filteredQuestionnaires.length > 0) container.appendChild(renderGroup('שאלונים', filteredQuestionnaires, false));
}

// Legacy exports for e2e tests
export function renderItemGroup(title, items, isBattery) { return renderGroup(title, items, isBattery); }
export function renderSelectionGroups(inner) { renderGroups(inner); }

function renderGroup(title, items, isBattery) {
  const group = document.createElement('div');
  group.className = 'c-group';

  const lbl = document.createElement('div');
  lbl.className = 'c-group-label';
  lbl.textContent = title;
  group.appendChild(lbl);

  const list = document.createElement('ul');
  list.className = 'c-item-list';
  list.setAttribute('role', 'list');

  for (const item of items) {
    const isSelected = state.selected.includes(item.id);
    const li = document.createElement('li');
    li.className = `c-item${isSelected ? ' c-item--selected' : ''}`;

    const checkId = `chk-${item.id}`;
    const label = document.createElement('label');
    label.className = 'c-item-label';
    label.htmlFor = checkId;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'c-item-checkbox';
    cb.id = checkId;
    cb.value = item.id;
    cb.checked = isSelected;
    cb.addEventListener('change', (e) => handleToggle(item.id, e.target.checked));
    label.appendChild(cb);

    const body = document.createElement('span');
    body.className = 'c-item-body';

    const nameRow = document.createElement('span');
    nameRow.className = 'c-item-name-row';
    nameRow.innerHTML = `
      <span class="c-item-name">${escapeHtml(item.title)}</span>
      <span class="c-item-id">${escapeHtml(item.id)}</span>
    `;
    body.appendChild(nameRow);

    if (_showDescriptions && item.description) {
      const desc = document.createElement('span');
      desc.className = 'c-item-desc';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    label.appendChild(body);

    if (isBattery) {
      const badge = document.createElement('span');
      badge.className = 'c-badge';
      badge.textContent = 'סוללה';
      label.appendChild(badge);
    }

    li.appendChild(label);
    list.appendChild(li);
  }

  group.appendChild(list);
  return group;
}

// ── Output panel (left sidebar in RTL) ───────────────────────────────────────
// Sections top-to-bottom: URL + copy, ID input, picked list

function renderOutputPanel(url) {
  const panel = document.createElement('div');
  panel.className = 'c-output';

  // ── URL section ────────────────────────────────────────────────────────────

  const urlSection = document.createElement('div');
  urlSection.className = 'c-output-section';

  const urlLabel = document.createElement('div');
  urlLabel.className = 'c-section-label';
  urlLabel.textContent = 'קישור למטופל';
  urlSection.appendChild(urlLabel);

  const urlBox = document.createElement('div');
  urlBox.className = `c-url-box${url ? '' : ' c-url-box--empty'}`;
  urlBox.setAttribute('aria-label', 'קישור שנוצר');
  urlBox.setAttribute('dir', 'ltr');
  urlBox.textContent = url ?? 'לא נבחרו שאלונים';
  urlSection.appendChild(urlBox);

  // All URL action buttons on one row: Copy (flex:1) | פתח | שתף
  const actionsRow = document.createElement('div');
  actionsRow.className = 'c-btn-row c-btn-row--url';

  const copyBtn = document.createElement('button');
  copyBtn.className = `c-btn c-btn--primary c-btn--grow${state.copied ? ' c-btn--copied' : ''}`;
  copyBtn.dataset.action = 'copy';
  copyBtn.textContent = state.copied ? 'הועתק ✓' : 'העתק קישור';
  copyBtn.disabled = !url;
  copyBtn.addEventListener('click', handleCopy);
  actionsRow.appendChild(copyBtn);

  const testBtn = document.createElement('button');
  testBtn.className = 'c-btn c-btn--secondary c-btn--sm';
  testBtn.dataset.action = 'test';
  testBtn.textContent = '↗';
  testBtn.title = 'פתח קישור';
  testBtn.disabled = !url;
  testBtn.addEventListener('click', () => url && window.open(url, '_blank', 'noopener'));
  actionsRow.appendChild(testBtn);

  if (navigator.share) {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'c-btn c-btn--secondary c-btn--sm';
    shareBtn.dataset.action = 'share';
    shareBtn.textContent = 'שתף';
    shareBtn.disabled = !url;
    shareBtn.addEventListener('click', handleShare);
    actionsRow.appendChild(shareBtn);
  }

  urlSection.appendChild(actionsRow);
  panel.appendChild(urlSection);

  // ── ID section ─────────────────────────────────────────────────────────────

  const idSection = document.createElement('div');
  idSection.className = 'c-output-section';

  const idLabel = document.createElement('label');
  idLabel.className = 'c-section-label';
  idLabel.htmlFor = 'c-pid-input';
  idLabel.textContent = 'מזהה מטופל';
  idSection.appendChild(idLabel);

  const idHint = document.createElement('p');
  idHint.className = 'c-section-hint';
  idHint.textContent = 'אופציונלי — יופיע בדוח PDF בלבד';
  idSection.appendChild(idHint);

  const pidInput = document.createElement('input');
  pidInput.className = 'c-pid-input';
  pidInput.id = 'c-pid-input';
  pidInput.type = 'text';
  pidInput.dir = 'ltr';
  pidInput.placeholder = 'TRC-2025-000123';
  pidInput.value = state.pid;
  pidInput.setAttribute('aria-label', 'מזהה מטופל');
  pidInput.autocomplete = 'off';
  pidInput.spellcheck = false;
  pidInput.addEventListener('input', (e) => { state.pid = e.target.value; renderPartial(); });
  idSection.appendChild(pidInput);

  panel.appendChild(idSection);

  // ── Picked list section ────────────────────────────────────────────────────

  const pickedSection = document.createElement('div');
  pickedSection.className = 'c-output-section';

  const pickedLabel = document.createElement('div');
  pickedLabel.className = 'c-section-label';
  pickedLabel.textContent = 'נבחרו';
  pickedSection.appendChild(pickedLabel);

  if (state.selected.length > 0) {
    const hint = document.createElement('p');
    hint.className = 'c-section-hint';
    hint.textContent = 'גרור לשינוי סדר';
    pickedSection.appendChild(hint);

    const ol = document.createElement('ol');
    ol.className = 'c-order-list';
    for (const id of state.selected) ol.appendChild(buildOrderItem(id));
    pickedSection.appendChild(ol);
  } else {
    const empty = document.createElement('p');
    empty.className = 'c-section-hint';
    empty.textContent = 'טרם נבחרו שאלונים';
    pickedSection.appendChild(empty);
  }

  panel.appendChild(pickedSection);
  return panel;
}

// ── Order item (draggable) ────────────────────────────────────────────────────

function buildOrderItem(id) {
  const entry = state.batteries.find(b => b.id === id) ?? state.questionnaires.find(q => q.id === id);
  const li = document.createElement('li');
  li.className = 'c-order-item';
  li.draggable = true;
  li.dataset.id = id;

  const handle = document.createElement('span');
  handle.className = 'c-drag-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.textContent = '⠿';
  li.appendChild(handle);

  const text = document.createElement('span');
  text.className = 'c-order-item-text';
  text.textContent = entry?.title ?? id;
  li.appendChild(text);

  li.addEventListener('dragstart', (e) => handleDragStart(e, id));
  li.addEventListener('dragover',  (e) => handleDragOver(e, id));
  li.addEventListener('dragend',   () => handleDragEnd());

  return li;
}

// ── Mobile sticky bar ─────────────────────────────────────────────────────────

function renderMobileBar(url) {
  const bar = document.createElement('div');
  bar.className = 'c-mobile-bar';

  const count = document.createElement('span');
  count.className = 'c-mobile-count';
  count.textContent = state.selected.length > 0 ? `${state.selected.length} נבחרו` : '';
  bar.appendChild(count);

  const actions = document.createElement('div');
  actions.className = 'c-mobile-actions';

  // Primary action: share if available (requires HTTPS), otherwise copy.
  const canShare = typeof navigator.share === 'function';
  const primaryBtn = document.createElement('button');
  if (canShare) {
    primaryBtn.className = 'c-btn c-btn--primary c-btn--sm';
    primaryBtn.dataset.action = 'share';
    primaryBtn.textContent = 'שתף';
    primaryBtn.disabled = !url;
    primaryBtn.addEventListener('click', handleShare);
  } else {
    primaryBtn.className = `c-btn c-btn--primary c-btn--sm${state.copied ? ' c-btn--copied' : ''}`;
    primaryBtn.dataset.action = 'copy';
    primaryBtn.textContent = state.copied ? 'הועתק ✓' : 'העתק קישור';
    primaryBtn.disabled = !url;
    primaryBtn.addEventListener('click', handleCopy);
  }
  actions.appendChild(primaryBtn);

  const testBtn = document.createElement('button');
  testBtn.className = 'c-btn c-btn--secondary c-btn--sm';
  testBtn.dataset.action = 'test';
  testBtn.textContent = 'פתח ↗';
  testBtn.disabled = !url;
  testBtn.addEventListener('click', () => url && window.open(url, '_blank', 'noopener'));
  actions.appendChild(testBtn);

  bar.appendChild(actions);
  return bar;
}

// ── Styles ────────────────────────────────────────────────────────────────────

export function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #composer-app {
      flex: 1;
      min-block-size: 0;
      display: flex;
      flex-direction: column;
      background: var(--color-bg);
    }

    /* ── Full-width header ───────────────────────────────────────────────────── */

    .c-header-wrap {
      background: #1B3148;
    }

    .c-header {
      max-width: 1024px;
      margin-inline: auto;
      padding: var(--space-md) var(--space-xl);
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-lg);
    }

    .c-brand {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
    }

    .c-brand-name {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: #ffffff;
      letter-spacing: -0.02em;
      line-height: var(--line-height-tight);
    }

    .c-brand-sep {
      color: rgba(255,255,255,0.35);
      font-weight: var(--font-weight-normal);
    }

    .c-brand-page {
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-medium);
      color: rgba(255,255,255,0.85);
    }

    .c-subtitle {
      color: rgba(255,255,255,0.6);
      font-size: var(--font-size-sm);
      display: none;
    }

    @media (min-width: 768px) {
      .c-subtitle { display: block; }
    }

    /* ── Warnings ────────────────────────────────────────────────────────────── */

    .c-warnings {
      background: var(--color-no-bg);
      border-block-end: var(--border-width) solid var(--color-no);
      padding: var(--space-sm) var(--space-lg);
    }

    .c-warning-item {
      color: var(--color-no);
      font-size: var(--font-size-sm);
      padding-block: 2px;
    }

    /* ── Two-panel layout ────────────────────────────────────────────────────── */
    /*
     * RTL layout: flex row, items appended left-to-right in DOM but displayed
     * right-to-left on screen.
     *   c-panel--picker  (appended first)  → visually on the RIGHT  (the start)
     *   c-panel--output  (appended second) → visually on the LEFT   (the end)
     */

    .c-layout {
      flex: 1;
      min-block-size: 0;
      display: flex;
      align-items: stretch;
      max-width: 1024px;
      margin-inline: auto;
      width: 100%;
      overflow: hidden;
    }

    /* ── Picker panel (visually RIGHT in RTL) ────────────────────────────────── */

    .c-panel--picker {
      flex: 1;
      min-width: 0;
      min-block-size: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding-block-end: 72px; /* room for mobile bar */
    }

    @media (min-width: 768px) {
      .c-panel--picker { padding-block-end: 0; }
    }

    /* ── Output panel (visually LEFT in RTL) ─────────────────────────────────── */

    .c-panel--output {
      display: none;
    }

    @media (min-width: 768px) {
      .c-panel--output {
        display: flex;
        flex-direction: column;
        min-block-size: 0;
        width: 280px;
        flex-shrink: 0;
        border-inline-end: 2px solid var(--color-border);
        background: #3A5068;
        overflow-y: auto;
      }
    }

    /* ── Picker internals ────────────────────────────────────────────────────── */

    .c-picker {
      flex: 1;
      min-block-size: 0;
      padding: var(--space-md) var(--space-lg) var(--space-lg);
      overflow-y: auto;
      background: var(--color-surface);
    }


    .c-search-row {
      display: flex;
      gap: var(--space-sm);
      align-items: center;
      margin-block-end: var(--space-lg);
      position: sticky;
      top: 0;
      background: #F2F4F7;
      padding-block: var(--space-sm);
      z-index: 10;
    }

    .c-search-input {
      flex: 1;
      min-width: 0;
      font-size: var(--font-size-md);
      font-family: inherit;
      padding: var(--space-sm) var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: #FFFFFF;
      color: var(--color-text);
      min-block-size: var(--item-min-touch);
      transition: border-color var(--transition-fast);
    }

    .c-search-input:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    /* ── Groups ──────────────────────────────────────────────────────────────── */

    .c-group { margin-block-end: var(--space-xl); }
    .c-group:last-child { margin-block-end: 0; }

    .c-group-label {
      font-size: 11px;
      font-weight: var(--font-weight-bold);
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--color-text-muted);
      margin-block-end: var(--space-sm);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .c-group-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }

    .c-item-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    /* ── Item cards ──────────────────────────────────────────────────────────── */

    .c-item {
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: #FFFFFF;
      transition: border-color var(--transition-fast), background var(--transition-fast);
    }

    .c-item--selected {
      border-color: var(--color-selected-border);
      background: var(--color-selected-bg);
    }

    .c-item-label {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 9px var(--space-md);
      cursor: pointer;
      min-block-size: var(--item-min-touch);
    }

    .c-item-checkbox {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      accent-color: var(--color-primary);
      cursor: pointer;
    }

    .c-item-checkbox:focus-visible {
      outline: 2px solid var(--color-border-focus);
      outline-offset: 2px;
      border-radius: 3px;
    }

    .c-item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .c-item-name-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }

    .c-item-name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      line-height: var(--line-height-tight);
    }

    .c-item-id {
      font-size: 11px;
      color: var(--color-text-muted);
      font-family: ui-monospace, monospace;
      direction: ltr;
      flex-shrink: 0;
    }

    .c-item-desc {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: var(--line-height);
    }

    .c-badge {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--color-accent);
      background: var(--color-selected-bg);
      border: var(--border-width) solid var(--color-selected-border);
      border-radius: var(--radius-pill);
      padding-inline: var(--space-sm);
      padding-block: 2px;
      white-space: nowrap;
    }

    .c-no-results {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      padding-block: var(--space-lg);
      text-align: center;
    }

    /* ── Output panel internals ──────────────────────────────────────────────── */

    .c-output {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: var(--space-md) var(--space-md) var(--space-lg);
      gap: var(--space-md);
    }

    .c-output-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }

    /* Output panel elements sit on the dark sidebar */
    .c-output .c-url-box {
      background: #2A3D52;
      border-color: #2A3D52;
      color: #A8CFDF;
    }
    .c-output .c-url-box--empty {
      color: rgba(168, 207, 223, 0.6);
    }
    .c-output .c-pid-input {
      background: #2A3D52;
      border-color: #304860;
      color: #C0D4E4;
    }
    .c-output .c-pid-input::placeholder {
      color: rgba(168, 207, 223, 0.5);
    }
    .c-output .c-order-item {
      background: #2A3D52;
      border-color: #304860;
      color: #C0D4E4;
    }
    .c-output .c-section-label {
      color: #7AABBD;
    }
    .c-output .c-section-hint {
      color: #6898B0;
    }
    .c-output .c-btn--secondary {
      background: #2A3D52;
      border-color: #304860;
      color: #A8CFDF;
    }
    .c-output .c-btn--secondary:not(:disabled):hover {
      border-color: #2BB3C0;
      color: #2BB3C0;
    }

    .c-section-label {
      font-size: 11px;
      font-weight: var(--font-weight-bold);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .c-section-hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      margin-block-start: -2px;
    }

    /* ── URL box ─────────────────────────────────────────────────────────────── */

    .c-url-box {
      font-size: 12px;
      font-family: ui-monospace, monospace;
      background: #FFFFFF;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: var(--space-sm) var(--space-md);
      word-break: break-all;
      line-height: 1.6;
      user-select: all;
      text-align: left;
      direction: ltr;
      min-block-size: var(--item-min-touch);
    }

    .c-url-box--empty {
      color: var(--color-text-muted);
      font-family: var(--font-family);
      font-style: italic;
      user-select: none;
      direction: rtl;
      text-align: right;
    }

    /* ── PID input ───────────────────────────────────────────────────────────── */

    .c-pid-input {
      display: block;
      width: 100%;
      font-size: var(--font-size-sm);
      font-family: ui-monospace, monospace;
      padding: var(--space-sm) var(--space-md);
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      background: #FFFFFF;
      color: var(--color-text);
      min-block-size: var(--item-min-touch);
      transition: border-color var(--transition-fast);
    }

    .c-pid-input:focus {
      outline: none;
      border-color: var(--color-border-focus);
    }

    /* ── Buttons ─────────────────────────────────────────────────────────────── */

    .c-btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }

    /* URL action row: copy button grows, icon buttons are fixed-width */
    .c-btn-row--url {
      flex-wrap: nowrap;
    }

    .c-btn--grow {
      flex: 1;
      min-width: 0;
    }

    .c-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: var(--item-min-touch);
      padding-inline: var(--space-md);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      font-family: inherit;
      cursor: pointer;
      border: var(--border-width) solid transparent;
      transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
      white-space: nowrap;
    }

    .c-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .c-btn--primary {
      background: var(--color-primary);
      color: var(--color-primary-text);
    }
    .c-btn--primary:not(:disabled):hover { background: var(--color-primary-hover); }

    .c-btn--secondary {
      background: var(--color-bg);
      color: var(--color-text);
      border-color: var(--color-border);
    }
    .c-btn--secondary:not(:disabled):hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .c-btn--ghost {
      background: transparent;
      color: var(--color-text-muted);
    }
    .c-btn--ghost:hover { color: var(--color-no); }

    .c-btn--active {
      background: var(--color-selected-bg);
      border-color: var(--color-selected-border);
      color: var(--color-accent);
    }

    .c-btn--copied { background: var(--color-yes); color: #fff; }

    /* Small button (secondary actions, search row) */
    .c-btn--sm {
      min-block-size: 36px;
      padding-inline: var(--space-sm);
      font-size: var(--font-size-sm);
    }

    /* ── Order list ──────────────────────────────────────────────────────────── */

    .c-order-list {
      list-style: none;
      counter-reset: order;
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    .c-order-item {
      counter-increment: order;
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      background: #FFFFFF;
      border: var(--border-width) solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      line-height: var(--line-height-tight);
      cursor: grab;
      user-select: none;
      transition: opacity var(--transition-fast);
    }

    .c-order-item:active { cursor: grabbing; }

    .c-order-item--dragging { opacity: 0.4; }

    .c-order-item::before {
      content: counter(order);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-primary-text);
      font-size: 11px;
      font-weight: var(--font-weight-bold);
      flex-shrink: 0;
    }

    .c-drag-handle {
      color: var(--color-text-muted);
      font-size: 14px;
      line-height: 1;
      flex-shrink: 0;
      cursor: grab;
    }

    .c-order-item-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Mobile sticky bar ───────────────────────────────────────────────────── */

    .c-mobile-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      position: fixed;
      inset-block-end: 0;
      inset-inline: 0;
      padding: var(--space-sm) var(--space-lg);
      background: var(--color-surface);
      border-block-start: var(--border-width) solid var(--color-border);
      box-shadow: 0 -2px 12px rgba(0,0,0,0.07);
      z-index: 100;
    }

    .c-mobile-count {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      font-weight: var(--font-weight-medium);
    }

    .c-mobile-actions {
      display: flex;
      gap: var(--space-sm);
      align-items: center;
    }

    @media (min-width: 768px) {
      .c-mobile-bar { display: none; }
    }

    /* ── Button icons ───────────────────────────────────────────────────────── */

    .c-btn-icon {
      font-size: 15px;
      line-height: 1;
      margin-inline-end: 5px;
      display: inline-flex;
      align-items: center;
    }

    /* ⓘ פרטים — teal */
    .c-btn-icon--info {
      color: #1AA0AE;
      font-size: 16px;
    }
    .c-btn[aria-pressed="true"] .c-btn-icon--info {
      color: #0D7A86;
    }

    /* ↺ איפוס — deep terracotta */
    .c-btn-icon--reset {
      color: #B03A10;
      font-size: 16px;
    }

        /* ── Loading / error ─────────────────────────────────────────────────────── */

    .c-loading, .c-error {
      display: flex;
      align-items: center;
      justify-content: center;
      min-block-size: 50dvh;
      flex-direction: column;
      gap: var(--space-md);
      color: var(--color-text-muted);
    }

    .c-error { color: var(--color-no); }

    /* ── Dark mode overrides ─────────────────────────────────────────────────── */
    /* All hardcoded hex values in this file must be overridden here.            */

    @media (prefers-color-scheme: dark) {

      /* Header */
      .c-header-wrap { background: #0D1F30; }

      /* Picker panel background + sticky search row */
      .c-picker { background: var(--color-surface); }
      .c-search-row { background: var(--color-surface); }

      /* Output panel */
      .c-panel--output { background: #0A1520; }

      /* Item cards — dark bg, not white */
      .c-item { background: var(--color-bg); }

      /* Search input */
      .c-search-input { background: var(--color-bg); }

      /* URL box base */
      .c-url-box { background: var(--color-bg); color: var(--color-text); }

      /* PID input base */
      .c-pid-input { background: var(--color-bg); color: var(--color-text); }

      /* Order items base */
      .c-order-item { background: var(--color-bg); }

      /* Output panel overrides — darker inset elements */
      .c-output .c-url-box    { background: #060E18; border-color: #060E18; color: #6AABCC; }
      .c-output .c-url-box--empty { color: rgba(106, 171, 204, 0.45); }
      .c-output .c-pid-input  { background: #060E18; border-color: #1A3048; color: #A8C8DC; }
      .c-output .c-pid-input::placeholder { color: rgba(106, 171, 204, 0.35); }
      .c-output .c-order-item { background: #060E18; border-color: #1A3048; color: #A8C8DC; }
      .c-output .c-section-label { color: #4A7890; }
      .c-output .c-section-hint  { color: #3A6078; }
      .c-output .c-btn--secondary {
        background: #060E18;
        border-color: #1A3048;
        color: #6AABCC;
      }
      .c-output .c-btn--secondary:not(:disabled):hover {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }

      /* Badge */
      .c-badge {
        background: var(--color-selected-bg);
        border-color: var(--color-selected-border);
        color: var(--color-accent);
      }

      /* Buttons */
      .c-btn--secondary {
        background: var(--color-bg);
        border-color: var(--color-border);
        color: var(--color-text);
      }

      /* Icons */
      .c-btn-icon--info  { color: var(--color-accent); }
      .c-btn-icon--reset { color: #E07060; }
    }
  `;
  document.head.appendChild(style);
}
