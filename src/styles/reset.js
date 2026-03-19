import { css } from 'lit';

/**
 * Shadow DOM box-sizing reset.
 *
 * The global `* { box-sizing: border-box }` in main.css does not penetrate
 * shadow DOM boundaries. Without this, `width: 100%` + `padding-inline` adds
 * padding on top of 100%, making elements wider than their container and
 * causing horizontal scroll on mobile.
 *
 * Include in every LitElement's `static styles` array as the first entry.
 */
export const resetCSS = css`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  * {
    overflow-wrap: anywhere;
  }
`;
