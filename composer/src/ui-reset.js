import { css } from 'lit';

/**
 * Shadow-DOM box-sizing reset for the composer's Lit components.
 *
 * The document-level `* { box-sizing: border-box }` in composer.css does not
 * cross shadow boundaries. Without this, `inline-size: 100%` + `padding-inline`
 * overflows the container — e.g. the sidebar PID input spilling past the cart.
 *
 * Include as the first entry in every composer component's `static styles`.
 * (A composer-local copy — eslint forbids composer from importing src/.)
 */
export const resetCSS = css`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  * {
    overflow-wrap: anywhere;
  }

  /* Lists carry a browser-default 40px inline-start padding that the global
     document reset can't reach across the shadow boundary — it was indenting the
     card list and the cart. Zero it here so every component's lists sit flush. */
  ul, ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
`;
