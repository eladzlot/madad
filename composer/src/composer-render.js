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

// Styles are now loaded via `import './composer.css'` in composer.js — Vite
// handles bundling and cache-busting. injectStyles() is kept as a no-op for
// backward compatibility with any test harness that calls it explicitly.
export function injectStyles() { /* no-op — CSS is bundled via Vite */ }
