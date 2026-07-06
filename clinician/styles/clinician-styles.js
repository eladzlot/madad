// clinician-styles.js — the shared clinician design vocabulary (D-15).
//
// Single source of truth for the styles every clinician surface uses:
// tokens (header navy, card surface, chart neutrals) and control classes
// (buttons, segmented control, card). Kept as a CSS string in a JS module
// because the aggregate's Lit components render in shadow DOM, which a
// plain stylesheet cannot reach:
//
//   • light-DOM surfaces (composer, aggregate page chrome) adopt it once
//     at the document level via adoptClinicianStyles();
//   • shadow-DOM components include it via unsafeCSS(clinicianCss) in
//     their static styles.
//
// @font-face, resets, and page layout stay in each surface's own CSS —
// Chromium ignores @font-face inside constructed stylesheets.
//
// Class names keep the `c-` prefix ("clinician-"): the composer already
// used these names, so it migrated here without churn.

export const clinicianCss = /* css */ `
  :root {
    --clin-header-bg: #1B3148;
    --clin-card-bg:   #FFFFFF;
    --clin-grid:      #00000014;
    --clin-cutoff:    #B45309;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --clin-card-bg: #161b22;
      --clin-grid:    #ffffff1f;
      --clin-cutoff:  #E8A33D;
    }
  }

  /* ── Card — white content panel on the muted page background ──────────── */

  .c-card {
    background: var(--clin-card-bg, #fff);
    border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-sm, none);
    padding: var(--space-md, 16px);
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */

  .c-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs, 4px);
    min-block-size: var(--item-min-touch, 44px);
    padding-inline: var(--space-md, 16px);
    border-radius: var(--radius-sm, 6px);
    font-size: var(--font-size-sm, 14px);
    font-weight: var(--font-weight-medium, 500);
    font-family: inherit;
    cursor: pointer;
    border: var(--border-width, 1px) solid transparent;
    transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease), border-color var(--transition-fast, 120ms ease);
    white-space: nowrap;
  }

  .c-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .c-btn--primary {
    background: var(--color-primary, #1A9FAD);
    color: var(--color-primary-text, #fff);
  }
  .c-btn--primary:not(:disabled):hover { background: var(--color-primary-hover, #148090); }

  .c-btn--secondary {
    background: var(--color-bg, #F2F4F7);
    color: var(--color-text, #162232);
    border-color: var(--color-border, #D5DAE2);
  }
  .c-btn--secondary:not(:disabled):hover {
    border-color: var(--color-primary, #1A9FAD);
    color: var(--color-primary, #1A9FAD);
  }

  .c-btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #5E7080);
  }
  .c-btn--ghost:hover { color: var(--color-no, #8B3A3A); }

  .c-btn--active {
    background: var(--color-selected-bg, #E4F6F8);
    border-color: var(--color-selected-border, #2BB3C0);
    color: var(--color-accent, #2BB3C0);
  }

  .c-btn--copied { background: var(--color-yes, #276749); color: #fff; }

  /* Small button (secondary actions, toolbars) */
  .c-btn--sm {
    min-block-size: 36px;
    padding-inline: var(--space-sm, 8px);
    font-size: var(--font-size-sm, 14px);
  }

  /* ── Segmented control — one-of-N view switcher ────────────────────────── */

  .c-seg {
    display: inline-flex;
    border: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
    border-radius: var(--radius-sm, 6px);
    background: var(--color-bg, #F2F4F7);
    overflow: hidden;
  }

  .c-seg button {
    border: none;
    background: none;
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    color: var(--color-text-muted, #5E7080);
    min-block-size: 36px;
    padding-inline: var(--space-md, 16px);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-fast, 120ms ease), color var(--transition-fast, 120ms ease);
  }

  .c-seg button + button {
    border-inline-start: var(--border-width, 1px) solid var(--color-border, #D5DAE2);
  }

  .c-seg button[aria-pressed='true'] {
    background: var(--color-selected-bg, #E4F6F8);
    color: var(--color-accent, #2BB3C0);
    font-weight: var(--font-weight-medium, 500);
  }

  .c-seg button:not([aria-pressed='true']):hover { color: var(--color-text, #162232); }

  .c-seg button:focus-visible {
    outline: 2px solid var(--color-border-focus, #2BB3C0);
    outline-offset: -2px;
  }
`;

let sheet;

/**
 * Adopt the clinician stylesheet at the document level (light-DOM surfaces).
 * Idempotent. No-ops where constructed stylesheets are unsupported (jsdom).
 */
export function adoptClinicianStyles(doc = document) {
  if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in doc)) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(clinicianCss);
  }
  if (!doc.adoptedStyleSheets.includes(sheet)) {
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
}
