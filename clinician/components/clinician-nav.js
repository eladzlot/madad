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

// Future עזרה/אודות pages: add a row here and they appear on every surface.
const PAGES = [
  { id: 'composer', label: 'מחולל קישורים', href: '../composer/' },
  { id: 'aggregate', label: 'סיכום מטופל', href: '../aggregate/' },
];

// Brand → landing. Cross-origin landing origin injected at build time; empty ⇒
// the relative '../landing/' that resolves under any single-origin base path.
const LANDING_HREF = __LANDING_ORIGIN__ ? `${__LANDING_ORIGIN__}/` : '../landing/';

export class ClinicianNav extends LitElement {
  static properties = {
    page: { type: String }, // id of the current page — marked active
    subtitle: { type: String }, // page-note shown on wide screens
  };

  static styles = css`
    :host {
      display: block;
      background: var(--clin-header-bg, #1b3148);
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

    .nav-group {
      display: flex;
      align-items: baseline;
      gap: var(--space-lg, 24px);
    }

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
      border-block-end-color: var(--color-accent, #2bb3c0);
    }

    .link:focus-visible,
    .brand:focus-visible {
      outline: 2px solid var(--color-accent, #2bb3c0);
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
  `;

  render() {
    return html`
      <header>
        <div class="inner">
          <div class="nav-group">
            <a class="brand" href=${LANDING_HREF}>מדד</a>
            <nav aria-label="עמודי מטפלים">
              ${PAGES.map(
                (p) => html`
                  <a
                    class="link"
                    href=${p.href}
                    aria-current=${p.id === this.page ? 'page' : nothing}
                  >${p.label}</a>
                `
              )}
            </nav>
          </div>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : nothing}
        </div>
      </header>
    `;
  }
}

customElements.define('clinician-nav', ClinicianNav);
