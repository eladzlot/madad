// help.js — entry for the Help surface (/help/).
//
// The help page is static Hebrew/RTL content authored directly in
// help/index.html; there is no app logic and no reactive store. This module
// exists only to (1) bundle the page frame CSS, (2) register the shared
// <clinician-nav> web component so the top bar renders, and (3) adopt the
// clinician design vocabulary (c-card etc.) at the document level for the
// static content. Excluded from unit coverage like the other surface roots —
// the e2e suite exercises the boot path.

// Styles bundled by Vite; the build injects a hashed <link> into
// help/index.html automatically.
import './help.css';

import { adoptClinicianStyles } from '../../clinician/styles/clinician-styles.js';
import '../../clinician/components/clinician-nav.js';

adoptClinicianStyles();
