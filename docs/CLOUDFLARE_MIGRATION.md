# CLOUDFLARE_MIGRATION

> **⚠️ TEMPORARY DOCUMENT — DELETE ON COMPLETION.**
> This is a migration tracker, not permanent documentation. Its final stage
> (Stage 8) removes this file and all GitHub Pages scaffolding. If you are
> reading this after the migration shipped, it should not exist — delete it.

Migration of Madad from GitHub Pages (`eladzlot.github.io/madad/`) to
Cloudflare Pages, splitting the marketing landing onto its own apex domain.

---

## Target end state

| | Landing project | App project |
|---|---|---|
| Cloudflare Pages project | `madad-landing` | `madad-app` |
| Custom domain | apex — `ezmadad.com` | `app.ezmadad.com` |
| Base path | `/` | `/` |
| Serves | `landing/` at root | patient (root) + `composer/` + `aggregate/` |
| Redeploys when | `landing/**` changes | anything else changes |

Both cross-link directions stay live (landing → app sample/composer/aggregate;
app clinician-nav brand → landing), routed through injected cross-origin
constants.

## Domains (confirmed)

- Landing (apex): `https://ezmadad.com`  → `__LANDING_ORIGIN__`
- App (subdomain): `https://app.ezmadad.com`  → `__APP_ORIGIN__`

## Decisions still needed before Stage 0

- [ ] Cloudflare account + API token available.
- [ ] `ezmadad.com` DNS is (or will be) managed by Cloudflare.
- [ ] Decide whether old `eladzlot.github.io/madad/` should redirect to the
      new domains (recommended: yes, keep it as a redirect for a grace period).

## Sequencing principle — freeze-first (revised 2026-07-08)

Rather than keeping GitHub Pages live-and-correct in parallel with Cloudflare
(which forced base-path gymnastics and a parallel-deploy step), we **freeze**
Pages: stop deploying to it. The last-built artifact keeps serving users at
`eladzlot.github.io/madad/` — frozen but functional — while we bring Cloudflare
up. Once Cloudflare is verified in production, Pages is replaced by a redirect.

Consequence: with Pages frozen (never rebuilt), we flip the Vite production base
default to `/` immediately — no need to keep `/madad/` alive. `MADAD_BASE`
survives only as the CI dist-smoke matrix override.

Note: the cross-origin link work (Stage 1, done) is **not** part of this
sequencing question. `ezmadad.com` and `app.ezmadad.com` are separate origins,
so links between them must be absolute regardless of how the cutover is
sequenced. Stage 1 stands; freeze-first only reshapes the deploy stages below.

Each stage is independently committable and independently verifiable.

---

## Stage 0 — Cloudflare prerequisites (no repo changes)

1. Create two Cloudflare Pages projects (Direct Upload / Wrangler type, not
   Git-integrated): `madad-app`, `madad-landing`.
2. Create a scoped API token (Pages: Edit) and note the account ID.
3. Add GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
4. Do **not** attach custom domains yet — that's Stage 6, post-verification.

**Verify:** `wrangler pages project list` shows both projects.

---

## Stage 1 — Cross-origin constants (no behaviour change yet) — ✅ DONE

Two build-time origins, driven by env vars read in `vite.config.js`:

- `APP_ORIGIN`     — the app's origin, consumed by landing's outbound links.
- `LANDING_ORIGIN` — the landing origin, consumed by the clinician-nav brand.

**Correction vs. original sketch:** the empty-default resolves to the existing
**relative** links (`../…`), NOT root-absolute (`/…`). Root-absolute would break
the still-live GitHub Pages deploy at `/madad/` (a `/composer/` link ignores the
`/madad/` base). Relative preserves current behaviour byte-for-byte — for dev,
the test suite, and the frozen GitHub Pages build alike.

Two mechanisms, one per surface:

- **Landing (no JS):** app-bound links in `landing/index.html` are written with
  an `__APP_ORIGIN__` token (`href="__APP_ORIGIN__/composer/"`, etc. — 8 links:
  3× `?configs`, 3× composer, 2× aggregate). A new `crossOriginLinksPlugin` in
  `vite.config.js` (`transformIndexHtml`, runs in **all** modes, unlike
  `cspPlugin`) replaces the token with `process.env.APP_ORIGIN || '..'`. Empty ⇒
  `../composer/` (unchanged); set ⇒ `https://app.ezmadad.com/composer/`. Landing
  asset links (`../fonts/`, `../public/…`, OG) are left as `../` — they move in
  Stage 3.
- **Clinician nav (JS):** `__LANDING_ORIGIN__` injected via Vite/Vitest `define`
  (mirroring `__APP_VERSION__`; declared `readonly` in `eslint.config.js`).
  `clinician-nav.js` computes `LANDING_HREF = __LANDING_ORIGIN__ ?
  \`${__LANDING_ORIGIN__}/\` : '../landing/'`. Empty ⇒ `../landing/` (unchanged);
  set ⇒ `https://ezmadad.com/`.

Files touched: `vite.config.js`, `vitest.config.js`, `eslint.config.js`,
`clinician/components/clinician-nav.js`, `landing/index.html`.

**Verified:** lint clean; 1151 unit tests pass; `npm run e2e` (101 passed) green
under default env — incl. the dist-smoke "landing demo CTA loads a working
questionnaire" test at `/madad/`. Default build reproduces `../` links
byte-for-byte; split build (`APP_ORIGIN=… LANDING_ORIGIN=… MADAD_BASE=/`) emits
the absolute URLs with no `__*__` token leakage in `dist/`.

**For later stages:** the CI deploy (Stage 5) must export `APP_ORIGIN=https://app.ezmadad.com`
and `LANDING_ORIGIN=https://ezmadad.com` for the production builds.

---

## Stage 2 — Freeze GitHub Pages + flip base to `/` — ✅ DONE

Stop deploying to Pages; the last artifact keeps serving users, frozen. With
Pages no longer rebuilt, flip the Vite production base default to root.

**Done:** `deploy.yml` trigger changed `push:[main]` → `workflow_dispatch` (with
un-freeze note); `vite.config.js` prod base default `/madad/` → `/`;
`playwright.config.js` `DIST_BASE` default → `/`. **Verified:** lint + build +
size green at base `/`; `npm run e2e` 101 passed at `/` (incl. all dist-smoke);
`MADAD_BASE=/some/deep/path/` dist-smoke still passes (override intact); built
`dist/index.html` now references `/assets/…` (was `/madad/assets/…`).

1. **Freeze Pages:** disable the push-to-`main` trigger in
   `.github/workflows/deploy.yml` (comment out the `on: push` branches, or make
   it `workflow_dispatch`-only). Do **not** delete the file yet — Stage 8 repoints
   it to the redirect, Stage 9 removes it. `eladzlot.github.io/madad/` keeps
   serving the last build.
2. **Flip the base:** Vite production base default `/madad/` → `/` in
   `vite.config.js`. Keep the `MADAD_BASE` override (CI dist-smoke matrix still
   exercises `/` and `/some/deep/path/`).
3. Update `playwright.config.js` `DIST_BASE` default `/madad/` → `/`.

**Verify:** `npm run ci` green under base `/`; dist-smoke passes at `/`; confirm
the Pages workflow no longer fires on push (check the Actions tab after the next
push, or inspect the trigger).

---

## Stage 3 — Landing-at-root asset paths — ✅ DONE

Landing lives at `/landing/` and reached assets with `../`. At a domain root
`../` points above root and breaks. Audit result — only one ref actually needed
fixing:

- **Favicon** (`../public/favicon.svg`): Vite already rewrites it to the
  base-absolute, hashed `${base}assets/favicon-*.svg`. Depth-independent —
  nothing to do.
- **OG image** (absolute github.io URL): deferred to Stage 7's URL sweep.
- **Fonts** (`@font-face url('../fonts/…')` in an inline `<style>`): Vite does
  **not** rewrite url() inside inline styles, so it stayed relative. Fixed by
  extending `crossOriginLinksPlugin` to capture the resolved `base`
  (`configResolved`) and rewrite `../fonts/` → `${base}fonts/`. Base-absolute ⇒
  depth-independent: resolves at `/landing/` under every base and at a domain
  root. Fonts ship unhashed at `${base}fonts/` via `public/fonts/` (publicDir).

**Verified:** built landing font URL is `/fonts/…` at base `/`,
`/some/deep/path/fonts/…` under the matrix base, and stays `/fonts/…` in the
split (`APP_ORIGIN`) build. Lint clean; `npm run e2e` 101 passed (default base) —
incl. the landing dist-smoke test, which fails on any 404, confirming the font
path resolves. `dist/fonts/*.ttf` present.

Only `vite.config.js` changed (plugin extended). No source-HTML change was
needed for fonts — the token stays `../fonts/` in `landing/index.html`, rewritten
at build.

---

## Stage 4 — Two build artifacts from one source — ✅ DONE

**Shipped shape:**
- App build (`vite.config.js`): landing dropped from `input`; still emits
  `dist/` (patient + composer + aggregate). Keeps `crossOriginLinksPlugin` so
  `npm run dev` still serves a working `/landing/`.
- Landing build (`vite.landing.config.js`, new): `root: 'landing'`, `base: '/'`,
  `publicDir: false`, `outDir: dist-landing/`. Emits `index.html` at the artifact
  root. A `landingAssetsPlugin` copies only `public/fonts/` and
  `public/og-image.png` into it — the app-only `public/` payload (configs,
  composer, og-image-app) stays out. Favicon resolves cross-root and hashes into
  `dist-landing/assets/`.
- Shared plugins extracted to `vite.shared.js` (`cspPlugin`,
  `crossOriginLinksPlugin`) — one source of truth, esp. for CSP.
- `__APP_ORIGIN__` empty-fallback changed `'..'` → `''` (root-absolute): landing
  now lives at a domain root, so the relative `..` would point above root.
- `package.json` build runs both (`vite build && vite build --config
  vite.landing.config.js`); `.gitignore` adds `dist-landing/`.

**E2E restructure** (landing is a separate origin now):
- Shared watchers extracted to `tests/e2e/dist-helpers.js`.
- New `landing-smoke` Playwright project + preview server (`dist-landing/` at
  `:4174`, base `/`); `tests/e2e/landing-smoke.dist.test.js` asserts landing
  renders + fonts/favicon load (no 404) + CSP clean + CTA link well-formed. No
  cross-origin click-through (that link now points at another origin).
- `dist-smoke` matcher narrowed to `dist-smoke.dist.test.js` so the deep-path
  matrix job (`--project=dist-smoke`) never pulls in landing.
- The landing test's old legacy-`configs=`-branch coverage moved to a new patient
  test in `dist-smoke.dist.test.js` (the branch runs in the app, so it belongs
  there).

**Verified:** lint clean; size budget OK (landing gone from `dist/`); `npm run
e2e` 102 passed (dev + app dist-smoke + landing-smoke). `dist-landing/` contains
only `index.html`, `fonts/`, `og-image.png`, `assets/favicon-*.svg`; `dist/` has
no `landing/`. Production split build embeds `https://app.ezmadad.com/*` in
landing and `https://ezmadad.com/` in the app nav.

---

## Stage 5 — Wrangler deploy to Cloudflare (the sole production deploy) — ✅ DONE

**Verified in production** (2026-07-14): repo secrets uploaded; the branch merged
to `main` (fast-forward) fired `deploy-cloudflare.yml` run `29363242654` — full
gate green, both `wrangler pages deploy` steps succeeded. `madad-app.pages.dev`
and `madad-landing.pages.dev` both serve HTTP 200 with the real origins baked in
(app og:url `https://app.ezmadad.com/`; landing og:url `https://ezmadad.com/` and
cross-links → `app.ezmadad.com`).


Pages is frozen (Stage 2), so this is the only live deploy. New workflow
`.github/workflows/deploy-cloudflare.yml` (separate from the frozen `deploy.yml`,
which becomes the redirect in Stage 8):

- Trigger: `push: [main]` + `workflow_dispatch`. Won't fire until the migration
  branch merges (or is manually dispatched).
- Self-contained gate (lint/test/validate/build/size/e2e) — dist-smoke is the
  deploy gate, mirroring the old `deploy.yml`.
- One production build with both origins baked in:
  `MADAD_BASE=/ APP_ORIGIN=https://app.ezmadad.com LANDING_ORIGIN=https://ezmadad.com npm run build`
  → emits `dist/` (nav brand → ezmadad.com) and `dist-landing/` (links →
  app.ezmadad.com).
- Two `cloudflare/wrangler-action@v3` steps: `pages deploy dist
  --project-name=madad-app` and `pages deploy dist-landing
  --project-name=madad-landing`, both `--branch=main`.
- Deploys both every push (path-filtering deferred — deploying the unchanged app
  on a landing-only change is harmless; add later if desired).

**Manual first deploy already done** (local `wrangler login`, `.pages.dev`
origins) — both surfaces render and cross-link on `madad-{app,landing}.pages.dev`.

**Blocked on:** two repo secrets — `CLOUDFLARE_API_TOKEN` (scoped Pages:Edit) and
`CLOUDFLARE_ACCOUNT_ID`. Projects confirmed created (Direct Upload, Git=No):
`madad-app`, `madad-landing`.

**Verify (once secrets set):** `workflow_dispatch` the workflow from the branch;
both deploys succeed; `madad-{app,landing}.pages.dev` serve the real-origin
build (cross-links point at `*.ezmadad.com` — may 404 until Stage 6).

---

## Stage 6 — Attach custom domains (Cloudflare dashboard, no repo changes) — ✅ DONE

1. Attach the apex `ezmadad.com` to `madad-landing`, `app.ezmadad.com` to
   `madad-app`.
2. Configure DNS (Cloudflare-proxied) per the dashboard's instructions.
3. Wait for certificates to issue.

**Verified** (2026-07-14): both domains serve HTTP 200 over HTTPS with valid
edge certs (CN=ezmadad.com / CN=app.ezmadad.com, issued 2026-07-14). Cross-links
resolve end-to-end: landing → `app.ezmadad.com/{composer,aggregate,?configs…}`
(all 200); app-nav brand → `https://ezmadad.com/` (baked into the clinician JS
bundle). PDF branding origin derives from `window.location` in-browser, so it is
`app.ezmadad.com` by construction on the app domain (manual spot-check optional).

**Verify:** both domains serve over HTTPS; cross-links resolve end-to-end
(landing → app and app-nav → landing); PDF generation works on the app domain.

---

## Stage 7 — URL sweep (OG / canonical / PDF fallback) — ✅ DONE

**Done ahead of Stage 6** (reorder from the original sequence): getting these URLs
correct *before* the domains go public means share-previews and the PDF's embedded
origin are never briefly served pointing at the old github.io host. Stage 7 is
independent of the deploy, so moving it earlier is safe.

App surfaces → `https://app.ezmadad.com`, landing → apex `https://ezmadad.com`:
- `index.html` og:image `…/og-image-app.png`, og:url `…/`.
- `aggregate/index.html` og:image `…/og-image.png`, og:url `…/aggregate/`.
- `composer/index.html` og:image `…/og-image.png`, og:url `…/composer/`.
- `landing/index.html` og:image `https://ezmadad.com/og-image.png`, og:url `https://ezmadad.com/`.
- `src/pdf/report.js` server-side fallback origin → `https://app.ezmadad.com/`.
- `composer/src/composer-state.js` comment example origins → app domain.

**Verified:** no `eladzlot.github.io` refs remain in source; lint clean; 1159 unit
tests pass. Post-deploy view-source verification (below) still pending Stage 6.

Split the hardcoded `eladzlot.github.io/madad` references per project:

- OG `og:image` / `og:url` in `landing/index.html` → apex domain.
- OG `og:image` / `og:url` in `index.html`, `composer/index.html`,
  `aggregate/index.html` → app domain.
- `src/pdf/report.js` server-side fallback origin → app domain.
- `composer/src/composer-state.js` comment/example origins → app domain.

**Verify:** view-source each deployed surface; OG tags point at the correct
domain; share-preview (WhatsApp/Twitter) renders; generated PDF's embedded
origin is the app domain.

---

## Stage 8 — Replace the frozen Pages site with a redirect — ✅ CODE READY

**Shipped shape:** new `pages-redirect/` artifact (`index.html` + `404.html`),
`deploy.yml` repointed to publish it (build/test/Node steps dropped —
checkout → `upload-pages-artifact` `pages-redirect/` → `deploy-pages`). Trigger
narrowed to `push:[main]` on `pages-redirect/**` + `deploy.yml` (plus
`workflow_dispatch`). Both HTML files carry an identical client-side shim:
strip the `/madad/` base, map the sub-path onto the new origin
(`landing*` → `ezmadad.com`, else → `app.ezmadad.com`), preserve `search`+`hash`,
`location.replace()`. `index.html` covers `/madad/` (incl. patient `?configs=…`);
`404.html` covers every deep path (`/composer/`, `/aggregate/`, `/landing/`) that
has no backing file. No-JS best-effort: `<meta refresh>` to the app root.

Mapping verified locally (node sim): `/madad/` → app root; `index.html` stripped;
patient `?configs=…&items=…` preserved; `/composer/`,`/aggregate/` → app;
`/landing/` → apex; query+hash preserved. **Live deploy pending push** (it
replaces the frozen app at `/madad/` with the redirect — the URL cutover).

Cloudflare is now verified in production. Turn the frozen Pages site into a
redirect so old `eladzlot.github.io/madad/…` links reach the new domains.

- Repoint `deploy.yml` to publish a tiny **redirect artifact** instead of
  `dist/`: a static `index.html` at `/madad/` and a `404.html`, redirecting
  `/madad/…` → `https://app.ezmadad.com/…` and `/madad/landing/` →
  `https://ezmadad.com/`.
- **Deep-link caveat:** GitHub Pages has no server rewrites, so path+query can't
  be rewritten server-side. Patient links carry `?configs=…&items=…`; preserve
  them with a small JS shim that reconstructs `location.pathname` + `location.search`
  onto the app origin. Patient links are ephemeral (filled once), so best-effort
  is acceptable — decide the fidelity here.
- Alternative: if you'd rather retire the github.io URL outright, skip the
  redirect and let old links lapse after a grace period.

**Verify:** visiting `eladzlot.github.io/madad/` and a sample patient link both
land on the correct Cloudflare page (query string preserved).

---

## Stage 9 — CLEANUP (the completion step — do not skip)

1. After the redirect grace period, delete `.github/workflows/deploy.yml` and any
   remaining Pages plumbing (`pages`/`id-token` permissions, the `github-pages`
   environment, `concurrency: pages`, `upload-pages-artifact` / `deploy-pages`).
2. Disable GitHub Pages in the repo settings (dashboard).
3. Remove now-dead transitional code:
   - the `landing` branch of the pathname regex in `src/pdf/report.js:42`
     (landing is no longer part of the app origin).
   - the `''`-default fallback of the origin constants, if a single-domain
     build is no longer a supported mode.
4. Fold anything worth keeping (the final structure decision, the two-project
   layout) into `docs/CODE_ORGANIZATION.md` §6 and a short note in
   `docs/TODO.md`'s decision log.
5. **Delete this file (`docs/CLOUDFLARE_MIGRATION.md`).**

**Verify:** `grep -rn "github.io/madad\|deploy-pages\|MADAD_BASE" --include=*.js
--include=*.yml --include=*.html .` returns only intended survivors (the
`MADAD_BASE` CI override); `docs/CLOUDFLARE_MIGRATION.md` no longer exists;
`npm run ci` green.

---

## Rollback

The freeze (Stage 2) is a one-line revert: re-enable the `deploy.yml` push
trigger and Pages rebuilds from `main` as before. Before Stage 8, rolling back
means re-enabling that trigger and pausing the Cloudflare deploys — the frozen
site is still the last-known-good `/madad/` build. Keep the freeze (Stage 2),
the redirect (Stage 8), and the cleanup (Stage 9) each as single, easily
revertible commits. After Stage 9, rollback means restoring `deploy.yml` from
git history and re-enabling Pages.
