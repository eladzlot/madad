# CTR POC — plan

**Status:** implemented on branch `ctr` (2026-08-10), uncommitted pending review.
Step 8 (deploy) is blocked on the Cloudflare project + DNS.
**Goal:** something to show people at CTR. Throwaway. Not maintained.

**Ground rules:** branch `ctr`, cut from `main`. **Zero commits on `main`.** Edit
in place, no flags, no seams, no abstraction. If this becomes real later, it gets
rebuilt properly (see `REMOTE_SPEC.md` §12 for what "properly" looks like — this
plan deliberately ignores it).

---

## What the POC shows

A therapist opens the CTR composer, must enter a patient id, gets a link. The
patient opens it, is never asked for a name, answers only closed-ended
questionnaires, and at the end sees that the results went to the therapist
(marked as a demo) plus the usual PDF. Everything is visibly warm/brown so nobody
confuses it with `app.ezmadad.com`.

---

## Steps

### 1. Branch
`git checkout -b ctr` off current `main`. Never merged back.

### 2. Recolour — `shared/styles/tokens.css`, edited in place
Replace the teal/slate values with a warm terracotta/clay set, both the `:root`
block and the `@media (prefers-color-scheme: dark)` block. One file, ~40 values,
covers the patient app, composer, aggregate, and help — they all pull from it.

Hardcoded leftovers swept so no navy survives against warm content:
`selection-cart.js` (the six slate values), `composer-app.js` (rail `#3A5068`),
`clinician-styles.js` + `clinician-nav.js` + `mobile-bar.js` (header `#1B3148`),
`catalog-controls.js` (dark-mode search field `#1e2733`/`#3a4656` — only visible
in dark mode, caught by screenshot), and the two chart literals in
`aggregate/src/chart/` (`export-svg.js` primary, `trajectory-chart.js` focus
stroke). The PDF is greyscale + semantic red/amber, so it needed no recolour.

### 3. Rebrand
- `public/favicon.svg` — the `מ` mark goes brown.
- `"מדד"` → `"מדד · CTR"` at: `src/components/welcome-screen.js:168`,
  `clinician/components/clinician-nav.js:109`, `src/pdf/report.js:1024`.
- `<title>` in `index.html`, `composer/index.html`, `aggregate/index.html`,
  `help/index.html`.
- `public/robots.txt` with `Disallow: /` so the POC never turns up in search.

### 4. Drop the name field
Delete the `.field` block and `_name` state from
`src/components/welcome-screen.js`; `begin` fires with an empty name.
`src/app.js:224` keeps passing it through. The PDF already treats `name` as
optional.

### 5. Require the id
- `src/app.js` — after `sanitizePid(readPid())`, if empty, show the existing
  error screen (same call as the missing-`items` case) instead of the welcome
  screen.
- `composer/src/components/selection-cart.js` — disable copy/share until the pid
  field is filled.

### 6. Delete the open-question questionnaires
`git rm public/configs/prod/{top3,demographics,anger_log,scq,cpt_abc,cpt_alternative,cpt_exploring,cpt_patterns}.json`
plus the dev-only `all_types_q.json` / `all_types_battery.json`.

Verified: no production battery references any of them, so nothing else breaks.

Then `npm run build:catalog` and commit the regenerated catalog.

Two test files reference deleted prod configs and will fail —
`composer/src/preview/preview-model.test.js` (loads `top3`, `all_types_q`) and
`tests/e2e/composer.e2e.test.js` (previews `top3`). Delete those cases. Two
minutes; not worth doing well on a throwaway branch.

**As built:** the blast radius was wider than two files, because the required id
(step 5) invalidated every e2e that opens a session URL. Resolved by adding
`#pid=TEST-1` to the e2e URL constants, filling the id field in the four
composer tests that read the generated link, repointing the `top3` preview test
at `pqb` (same nested item-level if-nodes), and dropping the `all_types_battery`
block with its now-unused helpers. `npm run ci` is green: lint, 1410 unit tests,
config + catalog validation, build, size, and e2e across chromium,
mobile-safari, dist-smoke, and landing-smoke.

### 7. Demo send-confirmation
`src/components/results-screen.js` gets a line above the PDF buttons:
results were sent to the therapist — **explicitly labelled a demo** so it never
reads as a factual claim that data was transmitted. Nothing is sent; there is no
server, no network call, no code that could send anything.

### 8. Deploy
No workflow file (that would mean touching `main`). Manual, from local:

```bash
npm run build
npx wrangler pages deploy dist --project-name=madad-ctr
```

Needs from you, one time: a Cloudflare Pages project `madad-ctr` and
`ctr.ezmadad.com` pointed at it. I can run `wrangler pages project create`; the
custom domain and DNS need your dashboard.

---

## Not doing

No server, no POST, no D1, no email, no uid, no aggregate fetch mode, no build
flags, no CI, no tests beyond "it builds and runs", no `main` changes, no docs
beyond this file.

## Assumptions — say if any is wrong

1. `scq` goes too (22 scored items lost over one optional free-text field), as
   does `top3` (the only idiographic measure, and `featured`).
2. The demo send-line is worth having — it is the concept being demoed. If you'd
   rather show nothing about sending, step 7 disappears.
3. The composer ships on the CTR origin too, so you can build links live in
   front of people.
