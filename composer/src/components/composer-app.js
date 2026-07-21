// <composer-app> — the composer shell (Stage 3 Lit rewrite).
//
// Owns the one reactive store (created in composer.js, handed in as `.store`),
// subscribes once, and re-renders on every notify. Lays out the browse column
// (controls + list) beside the desktop selection-cart, with the mobile-bar
// standing in for the cart on phones. All child events funnel here and turn into
// store mutations or the few real side effects (clipboard, share, open) that
// don't belong in a dumb component.
//
// Contracts preserved from the imperative composer: items-only buildUrl, ↗ open,
// non-blocking pid warning, reset, keyboard reorder, RTL, dark mode via tokens.

import { LitElement, html, css, unsafeCSS, nothing } from 'lit';
import { clinicianCss } from '../../../clinician/styles/clinician-styles.js';
import { resetCSS } from '../ui-reset.js';
import { buildUrl } from '../composer-state.js';
import '../../../clinician/components/clinician-nav.js';
import './catalog-controls.js';
import './catalog-list.js';
import './selection-cart.js';
import './mobile-bar.js';

export class ComposerApp extends LitElement {
  static properties = {
    store: { type: Object },
    _previewModel:   { state: true },
    _previewOpen:    { state: true },
    _previewLiveUrl: { state: true },
  };

  static styles = [resetCSS, unsafeCSS(clinicianCss), css`
    :host { display: flex; flex-direction: column; block-size: 100%; min-block-size: 0; }

    .warnings {
      background: var(--color-no-bg, #FBEAEA);
      border-block-end: var(--border-width, 1px) solid var(--color-no, #8B3A3A);
      padding: var(--space-sm, 8px) var(--space-lg, 24px);
    }
    .warnings p { color: var(--color-no, #8B3A3A); font-size: var(--font-size-sm, 14px); padding-block: 2px; }

    .layout {
      flex: 1;
      min-block-size: 0;
      display: flex;
      inline-size: 100%;
      max-inline-size: 1024px;
      margin-inline: auto;
      overflow: hidden;
    }

    /* Browse column — visually RIGHT in RTL (comes first in DOM) */
    .main {
      flex: 1;
      min-inline-size: 0;
      min-block-size: 0;
      overflow-y: auto;
      padding: 0 var(--space-lg, 24px) 88px;   /* bottom room for the mobile bar */
      background: var(--color-surface, #fff);
    }

    /* Selection cart — visually LEFT in RTL; desktop only */
    .sidebar { display: none; }

    @media (min-width: 768px) {
      .main { padding-block-end: var(--space-lg, 24px); }
      .sidebar {
        display: block;
        inline-size: 300px;
        flex-shrink: 0;
        min-block-size: 0;
        border-inline-start: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
        /* A lighter navy than the header so the output rail reads as its own
           panel. Theme-independent dark chrome (like the header) — the fields
           inside carry their own slate colours, so it holds in dark mode too. */
        background: #3A5068;
      }
      mobile-bar { display: none; }
    }
  `];

  constructor() {
    super();
    this.store = null;
    this._copyTimer = null;
    this._onNotify = () => this.requestUpdate();
    this._unsub = null;
    // Preview: state + a per-session cache of loaded ResolvedConfigs, so
    // reopening a previously previewed entry is instant.
    this._previewModel = null;
    this._previewOpen = false;
    this._previewLiveUrl = null;
    this._configCache = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.store) this._unsub = this.store.subscribe(this._onNotify);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    clearTimeout(this._copyTimer);
  }

  updated(changed) {
    // If the store arrives after the element connects, wire the subscription.
    if (changed.has('store') && this.store && !this._unsub) {
      this._unsub = this.store.subscribe(this._onNotify);
    }
  }

  get _canShare() { return typeof navigator !== 'undefined' && typeof navigator.share === 'function'; }

  // ── side effects ──
  async _copy() {
    const url = this.store.url();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.store.setCopied(true);
      clearTimeout(this._copyTimer);
      this._copyTimer = setTimeout(() => this.store.setCopied(false), 2000);
    } catch { /* clipboard unavailable — the URL box stays selectable */ }
  }
  async _share() {
    const url = this.store.url();
    if (!url || !this._canShare) return;
    try { await navigator.share({ url, title: 'קישור לשאלון הערכה' }); } catch { /* cancelled */ }
  }
  _open() {
    const url = this.store.url();
    if (url) window.open(url, '_blank', 'noopener');
  }

  // ── preview ──
  // Everything the preview needs is loaded lazily on first open: the config
  // loader (which pulls in AJV), the pure model builder, and the dialog
  // component. This keeps them out of the composer's startup bundle.
  async _onPreview(id) {
    try {
      const [{ loadConfig }, { buildPreviewModel }] = await Promise.all([
        import('../../../shared/config/loader.js'),
        import('../preview/preview-model.js'),
        import('./preview-dialog.js'),
      ]);
      let config = this._configCache.get(id);
      if (!config) {
        // A battery's referenced questionnaires arrive via declared dependencies.
        config = await loadConfig([id], { loadDependencies: true });
        this._configCache.set(id, config);
      }
      const model = buildPreviewModel(config, id);
      if (!model) return;
      this._previewModel = model;
      this._previewLiveUrl = buildUrl({ selected: [id] });
      this._previewOpen = true;
    } catch {
      // A failed fetch/validation just leaves the dialog closed — the browse
      // list stays usable. (The full flow surfaces load errors on its own.)
    }
  }

  _closePreview() {
    this._previewOpen = false;
  }

  render() {
    const s = this.store;
    if (!s) return nothing;

    const warnings = s.warnings();
    const selected = s.selected;
    const selectedEntries = s.selectedEntries();
    const url = s.url();

    return html`
      <clinician-nav .page=${'composer'} .subtitle=${'בחר שאלונים, הוסף מזהה מטופל, העתק קישור.'}></clinician-nav>

      ${warnings.length ? html`
        <div class="warnings" role="alert">
          ${warnings.map(w => html`<p>⚠ ${w}</p>`)}
        </div>
      ` : nothing}

      <div
        class="layout"
        @item-toggle=${(e) => s.toggle(e.detail.id)}
        @preview=${(e) => this._onPreview(e.detail.id)}
        @tab-change=${(e) => s.setTab(e.detail.tab)}
        @query-change=${(e) => s.setQuery(e.detail.query)}
        @filter-toggle=${(e) => s.toggleFilter(e.detail.kind, e.detail.value)}
        @show-all=${() => s.showEverything()}
        @focus-list=${() => this.renderRoot.querySelector('catalog-list')?.focusFirst()}
        @focus-search=${() => this.renderRoot.querySelector('catalog-controls')?.focusSearch()}
        @reorder=${(e) => s.reorder(e.detail.from, e.detail.to)}
        @remove=${(e) => s.toggle(e.detail.id)}
        @pid-change=${(e) => s.setPid(e.detail.pid)}
        @copy=${() => this._copy()}
        @share=${() => this._share()}
        @open=${() => this._open()}
        @reset=${() => s.reset()}
      >
        <div class="main">
          <catalog-controls
            .tabs=${s.availableTabs()}
            .activeTab=${s.tab}
            .query=${s.query}
            .domains=${s.availableDomains()}
            .populations=${s.availablePopulations()}
            .filters=${s.filters}
          ></catalog-controls>
          <catalog-list
            .entries=${s.visibleEntries()}
            .selectedIds=${selected}
            .curated=${s.isCurated()}
            .hasBeyond=${s.hasBeyondFeatured()}
            .crossTab=${s.crossTabMatches()}
            .query=${s.query}
            .filtersActive=${s.filtersActive()}
          ></catalog-list>
        </div>

        <div class="sidebar">
          <selection-cart
            .entries=${selectedEntries}
            .url=${url}
            .pid=${s.pid}
            .copied=${s.copied}
            .canShare=${this._canShare}
          ></selection-cart>
        </div>
      </div>

      <mobile-bar
        @reorder=${(e) => s.reorder(e.detail.from, e.detail.to)}
        @remove=${(e) => s.toggle(e.detail.id)}
        @pid-change=${(e) => s.setPid(e.detail.pid)}
        @copy=${() => this._copy()}
        @share=${() => this._share()}
        @open=${() => this._open()}
        @reset=${() => s.reset()}
        .entries=${selectedEntries}
        .url=${url}
        .pid=${s.pid}
        .copied=${s.copied}
        .canShare=${this._canShare}
      ></mobile-bar>

      ${this._previewModel ? html`
        <preview-dialog
          .model=${this._previewModel}
          .liveUrl=${this._previewLiveUrl}
          .open=${this._previewOpen}
          @preview-close=${() => this._closePreview()}
        ></preview-dialog>
      ` : nothing}
    `;
  }
}

customElements.define('composer-app', ComposerApp);
