// help.js — entry for the Help surface (/help/).
//
// The help page is static content authored directly in help/index.html — one
// <main> per language (data-lang="he" | "en"); there is no app logic and no
// reactive store. This module (1) bundles the page frame CSS, (2) resolves the
// clinician language (docs/I18N_SPEC.md L-7), stamps <html lang/dir> and
// reveals the matching <main>, (3) registers the shared <clinician-nav> so
// the top bar renders, and (4) adopts the clinician design vocabulary
// (c-card etc.) at the document level. Excluded from unit coverage like the
// other surface roots — the e2e suite exercises the boot path.

// Styles bundled by Vite; the build injects a hashed <link> into
// help/index.html automatically.
import './help.css';

import { adoptClinicianStyles } from '../../clinician/styles/clinician-styles.js';
import { bootLang, t } from '../../clinician/i18n/index.js';

adoptClinicianStyles();

const lang = await bootLang({ titleKey: 'help.title' });
await import('../../clinician/components/clinician-nav.js');

for (const main of document.querySelectorAll('main[data-lang]')) {
  main.hidden = main.dataset.lang !== lang;
}
const nav = document.querySelector('clinician-nav');
if (nav) nav.subtitle = t('help.subtitle');
