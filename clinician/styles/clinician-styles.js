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
    /* ── Chrome (theme-independent) ─────────────────────────────────────────
       The clinician header and the composer's output rail: dark navy panels
       that hold in both colour schemes. Every chrome colour lives here so a
       deployment can re-hue the whole clinician shell from one block; the
       derived tints below (color-mix) follow automatically.

       The chart's threshold line and its alert ring both live here because
       they answer a constraint the palette as a whole has to satisfy:
       protanopia and deuteranopia (~8% of men) collapse the red-green axis
       and leave blue-yellow, so A PALETTE GETS ONE BLUE-YELLOW AXIS AND EACH
       DISTINCTION ON IT COSTS THE WHOLE THING. The chart asks that axis to
       separate three things at once — the series line, the threshold and the
       alert marker — which is one more than it can carry. The alert is the
       one that gives up its hue: it is the only one of the three that also
       has a shape of its own to fall back on. */
    --clin-header-bg:        #1B3148;
    --clin-rail-bg:          #3A5068;   /* rail panel — a lighter navy than the header */
    --clin-rail-field:       #2A3D52;   /* fields, list rows, secondary buttons on the rail */
    --clin-rail-border:      #304860;
    --clin-rail-text:        #A8CFDF;   /* body text on the rail */
    --clin-rail-text-strong: #C0D4E4;   /* input values, item titles */
    --clin-rail-label:       #bad5e9;   /* section labels, empty-state copy */
    --clin-rail-hint:        #aec8dc;
    --clin-reset-icon:       #B03A10;   /* the ↺ glyph in the catalog toolbar */
    --clin-focus-stroke:     #115e59;   /* chart marker keyboard focus ring */
    --clin-heatmap-ink:      #162232;   /* fixed dark ink over pastel heatmap cells */

    /* The alert marker's ring, achromatic ON PURPOSE. The series line is the
       brand teal and the threshold is warm, which between them already spend
       the blue-yellow axis described above; a red ring then has nowhere to
       sit, and #b91c1c measured ΔE 6.1 from the threshold under deuteranopia.
       Separating the ring by LIGHTNESS instead frees the axis, and it is what
       lets the threshold stay warm — cooling the threshold would have been
       the wrong fix here, because the dark-mode primary is itself a blue. */
    --clin-alert-ring: #162232;

    --clin-card-bg:   #FFFFFF;
    --clin-grid:      #00000014;
    --clin-cutoff:    #B45309;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --clin-reset-icon:    #E07060;
      --clin-search-bg:     #1e2733;   /* lifts the catalog search field off the dark surface */
      --clin-search-border: #3a4656;

      --clin-alert-ring: #e6edf3;

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
    color: var(--color-primary-ink, #00717b);
  }

  .c-btn--ghost {
    background: transparent;
    color: var(--color-text-muted, #5E7080);
  }
  .c-btn--ghost:hover { color: var(--color-no, #8B3A3A); }

  .c-btn--active {
    background: var(--color-selected-bg, #E4F6F8);
    border-color: var(--color-selected-border, #2BB3C0);
    color: var(--color-primary-ink, #00717b);
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
    color: var(--color-primary-ink, #00717b);
    font-weight: var(--font-weight-medium, 500);
  }

  .c-seg button:not([aria-pressed='true']):hover { color: var(--color-text, #162232); }

  .c-seg button:focus-visible {
    outline: 2px solid var(--color-border-focus, #2BB3C0);
    outline-offset: -2px;
  }

  /* ── Value chip — a setting shown as its own value ─────────────────────── */
  /* Used on the dark clinician rail and in the mobile sheet: the closed state
     of a setting IS the setting, so a glance reads "Hebrew, no patient ID"
     without opening anything. An unset chip is dashed — an empty slot asking
     to be filled, the same idiom the idiographic param slots will need. */

  .c-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 30px;
    padding-inline: 11px;
    border: var(--border-width, 1px) solid var(--clin-rail-border, #304860);
    border-radius: var(--radius-pill, 999px);
    background: var(--clin-rail-field, #2A3D52);
    color: var(--clin-rail-text-strong, #C0D4E4);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    line-height: 1;
    cursor: pointer;
    transition: border-color var(--transition-fast, 120ms ease),
                color var(--transition-fast, 120ms ease);
  }

  .c-chip:hover { border-color: var(--color-accent, #2BB3C0); }

  .c-chip[aria-expanded='true'] {
    border-color: var(--color-accent, #2BB3C0);
    color: #ffffff;
  }

  /* No value yet — a dashed outline reads as an empty slot, not a disabled
     control, and the label says what filling it would do. */
  .c-chip--unset {
    background: none;
    border-style: dashed;
    color: var(--clin-rail-hint, #aec8dc);
  }

  .c-chip svg {
    inline-size: 14px;
    block-size: 14px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .c-chip .c-chip-value {
    font-family: ui-monospace, monospace;
    font-size: var(--font-size-xs, 12px);
    direction: ltr;
  }

  .c-chip:focus-visible {
    outline: 2px solid var(--color-border-focus, #2BB3C0);
    outline-offset: 2px;
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
