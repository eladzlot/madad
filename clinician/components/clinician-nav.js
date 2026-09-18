// clinician-nav.js — the shared top bar for clinician surfaces (D-15).
//
// One navy bar for every clinician-facing page: brand, cross-links between
// the surfaces (the aggregate's public entry point — D-17), and an optional
// page subtitle. The current page is marked with aria-current="page".
//
// Cross-surface links are relative: every clinician surface lives one level
// below the site root (/composer/, /aggregate/), so `../x/` resolves correctly
// under any deploy base path. The brand → landing link is the exception: once
// landing moves to its own domain it becomes cross-origin (`__LANDING_ORIGIN__`).

import { LitElement, html, css, nothing } from 'lit';
import { t, currentLang, switchLang } from '../i18n/index.js';
import { LANGS, LANG_CODES } from '../../shared/i18n/core.js';

// Future אודות pages: add a row here and they appear on every surface.
// Labels are `nav.<id>` keys in clinician/i18n.
const PAGES = [
  { id: 'composer', href: '../composer/' },
  { id: 'aggregate', href: '../aggregate/' },
  { id: 'help', href: '../help/' },
];

// When the current URL carries an explicit ?lang=, cross-surface links keep
// it, so a shared "English composer" link stays English on the next page.
function hrefFor(base) {
  if (typeof window === 'undefined') return base;
  const explicit = new URLSearchParams(window.location.search).get('lang');
  return explicit && explicit === currentLang() ? `${base}?lang=${explicit}` : base;
}

// Brand → landing. Cross-origin landing origin injected at build time; empty ⇒
// the relative '../landing/' that resolves under any single-origin base path.
// Remote deployment: there is no landing page on the trial origin; the brand
// goes to the help page instead.
const LANDING_HREF = '../help/';

export class ClinicianNav extends LitElement {
  static properties = {
    page: { type: String }, // id of the current page — marked active
    subtitle: { type: String }, // page-note shown on wide screens
  };

  static styles = css`
    :host {
      display: block;
      background: var(--clin-header-bg, #21322b);
    }

    .inner {
      max-inline-size: 1024px;
      margin-inline: auto;
      padding: var(--space-md, 16px);
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-lg, 24px);
      flex-wrap: wrap;
    }

    /* Brand, links, subtitle and the language control are siblings of .inner so
       they can be re-ordered per breakpoint. .inner wraps, which is what keeps
       the bar inside the viewport at 320px — 1280px at 400% zoom (WCAG 1.4.10
       Reflow). The app is RTL, so overflow runs off the LEFT edge and is easy
       to miss. */

    .brand {
      font-size: var(--font-size-xl, 28px);
      font-weight: var(--font-weight-bold, 600);
      line-height: var(--line-height-tight, 1.3);
      letter-spacing: -0.02em;
      color: #ffffff;
      text-decoration: none;
    }

    nav {
      display: flex;
      gap: var(--space-md, 16px);
    }

    .link {
      color: rgba(255, 255, 255, 0.65);
      font-size: var(--font-size-md, 16px);
      text-decoration: none;
      padding-block: 2px;
      border-block-end: 2px solid transparent;
      transition: color var(--transition-fast, 120ms ease);
      white-space: nowrap;
    }

    .link:hover { color: #ffffff; }

    .link[aria-current='page'] {
      color: #ffffff;
      font-weight: var(--font-weight-medium, 500);
      border-block-end-color: var(--color-accent, #77b770);
    }

    .link:focus-visible,
    .brand:focus-visible {
      outline: 2px solid var(--color-accent, #77b770);
      outline-offset: 2px;
    }

    .subtitle {
      margin: 0;
      color: rgba(255, 255, 255, 0.6);
      font-size: var(--font-size-sm, 14px);
      display: none;
    }

    @media (min-width: 768px) {
      .subtitle { display: block; }
    }

    /* Below the subtitle breakpoint the bar cannot hold brand + three links +
       the language control on one line, so it wrapped the control onto a line
       of its own where it read as an orphan. Make the two tiers deliberate
       instead: brand and language together, the links beneath them. */
    @media (max-width: 767px) {
      .inner { gap: var(--space-sm, 8px) var(--space-md, 16px); }
      .brand { order: 1; }
      .lang-wrap { order: 2; }
      nav { order: 3; flex-basis: 100%; }
    }

    /* UI language — a select on the bar's trailing edge. The language list is
       open-ended (Russian and Arabic are filed as I18N-8/9), so one control per
       language does not survive contact with the roadmap. */
    /* A select cannot hold markup, so the glyph and caret are drawn around it and
       appearance:none lets the wrapper's fill show through — the same idiom the
       composer's patient-language chip uses. The glyph is a SCREEN, not a globe:
       the composer carries a second language control for the patient's
       questionnaires, and the two were indistinguishable when both were a bare
       language name. Screen = this interface; globe = what the patient receives. */
    .lang-wrap {
      margin-inline-start: auto;
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .lang-glyph {
      position: absolute;
      inset-inline-start: 10px;
      inline-size: 15px;
      block-size: 15px;
      pointer-events: none;
      opacity: 0.85;
      color: #ffffff;
    }

    .lang-caret {
      position: absolute;
      inset-inline-end: 11px;
      font-size: 9px;
      pointer-events: none;
      color: rgba(255, 255, 255, 0.75);
    }

    .lang {
      appearance: none;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.10);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: var(--radius-pill, 999px);
      color: #ffffff;
      font-family: inherit;
      font-size: var(--font-size-sm, 14px);
      line-height: 1;
      padding-inline: 31px 26px;
      padding-block: 7px;
      cursor: pointer;
    }
    .lang:hover { border-color: var(--color-accent, #77b770); }
    .lang:focus-visible {
      outline: 2px solid var(--color-accent, #77b770);
      outline-offset: 2px;
    }
    /* The popup is painted by the platform, not by this bar. */
    .lang option { color: CanvasText; background: Canvas; }
  `;

  _switch(lang) {
    if (lang !== currentLang()) switchLang(lang);
  }

  // A reload is what actually changes the language (I18N-8 / L-11), so the
  // select's own value is transient — it is re-derived on the way back in.

  render() {
    return html`
      <header>
        <div class="inner">
          <a class="brand" href=${LANDING_HREF}>${t('nav.brand')}</a>
          <nav aria-label=${t('nav.aria')}>
            ${PAGES.map(
              (p) => html`
                <a
                  class="link"
                  href=${hrefFor(p.href)}
                  aria-current=${p.id === this.page ? 'page' : nothing}
                >${t(`nav.${p.id}`)}</a>
              `
            )}
          </nav>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : nothing}
          <span class="lang-wrap" title=${t('nav.langAria')}>
            <svg class="lang-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8"/><path d="M12 17v3.5"/>
            </svg>
            <select
              class="lang"
              aria-label=${t('nav.langAria')}
              .value=${currentLang()}
              @change=${(e) => this._switch(e.target.value)}
            >
              ${LANG_CODES.map((code) => html`
                <option value=${code} lang=${code} ?selected=${code === currentLang()}>
                  ${LANGS[code].label}
                </option>
              `)}
            </select>
            <span class="lang-caret" aria-hidden="true">▾</span>
          </span>
        </div>
      </header>
    `;
  }
}

customElements.define('clinician-nav', ClinicianNav);
