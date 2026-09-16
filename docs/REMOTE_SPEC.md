# REMOTE_SPEC

Design document for **Remote tracking** (מעקב) — the server-backed Madad
deployment used by the MOH (Ministry of Health) psychotherapy training
programme. A patient's completed session is sent to a server, the therapist
receives a notification email with a signed link, and views the accumulated
sessions on the existing Aggregate surface — no PDFs to handle.

This document captures *what the system is and why it is that way*.
Status: **approved design, implementation in progress on branch `remote`.**
First drafted 2026-07-15; rewritten 2026-09-14 after the trial firmed up
(8 courses, ~250 therapists in the first wave, a similar wave next year).

Sibling docs: `AGGREGATE_SPEC.md`, `BEHAVIORAL_SPEC.md`,
`IMPLEMENTATION_SPEC.md`, `LEGAL_QUESTIONS.md`.

---

## 1. Purpose and scope

The public Madad (`app.ezmadad.com`) is stateless: the PDF is the only
output, nothing leaves the device. **Remote tracking is a separate
deployment** of the same codebase for the training programme, and on that
deployment the posture is inverted:

- **Post-first.** Every completed session is sent to the server. There is
  no share button. The PDF download remains available as an optional
  action and as the fallback when sending fails.
- **The patient is a uid and nothing else.** No name is collected, no free
  text is ever answered (§5.3). The uid in the link is mandatory; a link
  without a valid, registered uid does not start a session (§3, §4.1).
- **The therapist is an email address** in a registry maintained by the
  operator (§2.1). They get a doorbell email and a 7-day signed link to the
  Aggregate in fetch mode (§4.3, §5.2).

The public app is untouched: it is built from `main`, never from this
branch, and contains none of the code described here (§12).

### 1.1 Governing decisions

| # | Decision | Date |
|---|---|---|
| D-1 | This is a **clinical service**, not research. No IRB path; MOH is the responsible entity. Cloudflare hosting is approved. | 2026-07-15, hosting 2026-09 |
| D-2 | **No identifying information ever reaches the server.** No patient name, no free-text answers, no therapist-chosen identifier. The uid is the only patient key and is meaningless without the therapist's own records. | 2026-07-15 |
| D-3 | Notification emails contain **no clinical content** — the uid, the date and a link, nothing else. A generic alert marker is a v1.1 option, default off (§6). | 2026-07-15 |
| D-4 | Therapist access via **signed expiring links** (capability URLs), not accounts. | 2026-07-15 |
| D-5 | The `uid → therapist email` registry is maintained **manually** by the operator, per course. | 2026-07-15 |
| D-6 | Retention is **indefinite** — acceptable precisely because of D-2. Subject to legal review (`LEGAL_QUESTIONS.md`). | 2026-07-15 |
| D-7 | **Post-first**; no share button; PDF optional. | 2026-09-14 |
| D-8 | **Separate long-lived branch, no build flag.** `main` is the parent; the branch is rebased onto it (§12). | 2026-09-14 |
| D-9 | **Unknown uid refuses at session start**, accepting that the registry check is an enumeration oracle (it already exists at submit; see §7). | 2026-09-14 |
| D-10 | uid format **`XXXX-XXXX`**, human-copyable, ~35 bits of entropy plus a check character; the composer remembers used uids per browser. | 2026-09-14 |
| D-11 | **No text items on this deployment.** Instruments containing `text` or `rated_text` items are excluded by rule; config files are not deleted. | 2026-09-14 |
| D-12 | The mandated measurement set is **one battery config per course**, featured in the catalog; therapists may add instruments. Compliance is a training-side matter, not enforced by the tool. | 2026-09-14 |
| D-13 | Therapist reads are **logged**; link expiry starts at 7 days and is revisited with usage data. | 2026-09-14 |
| D-14 | The API is versioned: everything lives under `/api/v1/`. | 2026-09-14 |

### 1.2 What Remote tracking is not

- Not an EHR. The server stores pseudonymous score trajectories, nothing else.
- Not a messaging system. The email is a doorbell, not a report.
- Not the public product. Private therapists keep the PDF flow; offering
  remote tracking to them is phase 2 (§11).

---

## 2. Architecture

```
Patient app (trial origin)                              Cloudflare (same origin)
──────────────────────────                              ────────────────────────
open link ?items=…#pid=<uid>
  └─ GET /api/v1/uids/<uid>          ─────────────►  Pages Function: registry lookup
       404 → error screen, no session                  (204 / 404, logged, rate-limited)
       204 / network error → welcome screen
complete battery
  └─ buildEnvelope()                                    ┌─ validate envelope + no-text rule (§5.3)
  └─ POST /api/v1/sessions           ─────────────►     ├─ D1: insert session
  └─ results: sent ✓ | failed → PDF fallback            ├─ D1: uid → therapist email
  └─ PDF download (optional)                            └─ email: doorbell + signed link (§6)

Aggregate (trial origin /aggregate/)
────────────────────────────────────
?uid=…&exp=…&sig=…
  └─ GET /api/v1/sessions?…          ─────────────►  verify HMAC + expiry, log read
  └─ store.addEnvelopes()            ◄─────────────  [envelopes] from D1 by uid
     (existing chart pipeline, unchanged)
expired → POST /api/v1/links {uid}   ─────────────►  always 204; fresh link by email
```

**Platform: Cloudflare Pages Functions + D1 + email, on the trial app's own
origin.** Rationale:

- Same origin ⇒ the existing CSP (`connect-src 'self'`) needs **zero
  changes**, and there is no CORS.
- The account, API token and deploy pattern already exist
  (`deploy-cloudflare.yml`). Route files live in `functions/api/v1/` and
  all logic in `server/lib/` — pure handlers `(input, deps) → Response`
  with the D1, email, config and clock dependencies injected, unit-tested
  against in-memory fakes (`server/lib/db-memory.js`). `functions/` holds
  only glue because Pages treats every file under it as a route.
- Portable by design: plain HTTP endpoints, one SQL schema, HMAC tokens.
  Nothing Cloudflare-specific leaks into the contract, so a mandated move is
  a re-deploy, not a re-design.

### 2.1 D1 schema

```sql
CREATE TABLE registry (
  uid             TEXT PRIMARY KEY,   -- §3, normalised (uppercase, no hyphen)
  therapist_email TEXT NOT NULL,
  course          TEXT NOT NULL,      -- training course id, e.g. "2026-cbt-a"
  label           TEXT,               -- operator memo
  created_at      TEXT NOT NULL       -- ISO 8601
);
CREATE INDEX registry_email ON registry(therapist_email);

CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT NOT NULL REFERENCES registry(uid),
  envelope   TEXT NOT NULL,           -- JSON, exactly what the client sent (§5.1)
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_uid ON sessions(uid);

CREATE TABLE access_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL,              -- 'check' | 'submit' | 'read' | 'link' | 'email'
  uid     TEXT,                       -- as supplied, may be unregistered
  ok      INTEGER NOT NULL,           -- 1 success, 0 refused
  ip_hash TEXT,                       -- salted SHA-256 of the client IP
  ts      TEXT NOT NULL
);
CREATE INDEX access_log_uid_ts ON access_log(uid, ts);
```

No `patients` table, no `therapists` table beyond the email column, no
names anywhere. The registry is edited by the operator (D-5) with
`scripts/remote/mint-uids.mjs` + `wrangler d1 execute` (runbook:
`scripts/remote/README.md`); a therapist-facing management UI is out of
scope (§9). `access_log` serves both the security posture (§7) and the usage
questions in §10. Migrations live in `server/db/migrations/`.

---

## 3. Identity model — the uid

- **Format:** `XXXX-XXXX` — 8 symbols of Crockford base32
  (`0-9 A-H J-K M-N P-T V-Z`, no I/L/O/U), displayed with one hyphen. The
  first 7 symbols are random (**35 bits**); the 8th is a check symbol.
  Input is normalised before use: uppercase, hyphens and spaces stripped,
  `I/L→1`, `O→0` per Crockford.
- **Check symbol:** `alphabet[(Σ_{i=1..7} w_i · v_i) mod 32]` with weights
  `w = [1, 3, 5, 7, 9, 11, 13]`. All weights are odd, so every single-symbol
  error is detected; adjacent transpositions are detected unless the two
  symbols differ by exactly 16. Implemented once in `shared/remote/uid.js`
  and used by the composer, the patient app and the server.
- **Why 35 bits and not 128:** therapists copy uids by hand — into the
  composer, onto paper, into their own records. Unguessability comes from
  sparsity plus rate limiting (§7): with ~2,500 registered uids in a space
  of 2³⁵, a guess hits with probability ~1 in 14 million. The composer
  remembers uids used in that browser so each is typed once (§8).
- **Semantics:** one uid = one patient-under-one-therapist. The therapist
  writes down which patient got which uid; that mapping never exists
  server-side (D-2).
- **Minting:** the operator's script (`scripts/remote/mint-uids.mjs`)
  takes `email,course,count` rows and emits SQL inserts plus a
  per-therapist handout (CSV) to send to the course.
- **In URLs and the envelope:** the uid rides where the pid rides today —
  `#pid=<uid>` in the fragment (never in the request line or `Referer`), and
  `envelope.pid`. `envelope.name` is always `null`. **uid == pid** for every
  existing consumer: the PDF, the Aggregate's pid filter, and the E2E
  fixtures all work unchanged.

---

## 4. Endpoints

All under `/api/v1/` on the trial origin. Responses are JSON or 204, with
`Cache-Control: no-store`. Refusals carry a one-word JSON body
(`{ "error": "unknown_uid" | "invalid" | "forbidden" | "too_large" |
"rate_limited" }`) so the client can tell an API refusal from a bare 404 off
a static host — that is what lets the patient app fail open when no API is
deployed (D-9). Nothing else is disclosed. All requests are written to
`access_log`.

### 4.1 `GET /api/v1/uids/<uid>` — session-start check

- Registered → **204**. Unknown or malformed → **404**.
- The patient app calls this before the welcome screen. 404 blocks the
  session with an error ("the link is not valid — ask your therapist for a
  new one"). A **network error or 5xx does not block**: the session
  proceeds and the submit fallback (§4.2) covers it. Honest refusal is
  required: a patient must never answer for twenty minutes and then learn
  the data had nowhere to go.
- This is an enumeration oracle; see §7 for why that is accepted.

### 4.2 `POST /api/v1/sessions` — patient submission

Body: `{ "uid": "…", "envelope": { … } }`

- Normalise and verify the uid exists in `registry`. Unknown → **404** (the
  client shows the PDF fallback).
- `validateEnvelope()` (shared module: the server imports
  `shared/pdf/envelope-schema.js` directly) → **400** on failure.
- **No-text rule, server side** (§5.3): reject with **400** any envelope
  whose instruments or answers include a `text`/`rated_text` item, checked
  against the configs in the same deploy artifact.
- Payload cap 256 KB → **413**. Per-uid daily cap → **429**.
- Insert into `sessions`, send the notification email (§6), → **204**.
  Email failure does not fail the submission (logged; the data is stored).

### 4.3 `GET /api/v1/sessions?uid=…&exp=…&sig=…` — therapist read

- Verify `sig` = HMAC-SHA256(secret, `${uid}.${exp}`) and `exp` (unix
  seconds) is in the future. Failure → **403**, constant-time compare.
- → `{ "sessions": [ { "envelope": …, "createdAt": … }, … ] }` ordered by
  `created_at`.
- Strictly read-only; the token grants access to exactly one uid. Every
  successful read is logged (`kind='read'`) — this is the usage data for
  §10.3.

### 4.4 `POST /api/v1/links` — fresh-link request

Body: `{ "uid": "…" }`

- If registered, email a fresh signed link to the registered therapist.
  **Always → 204**, registered or not: this endpoint must not be an
  additional oracle, and the caller checks their inbox either way.
- Reachable from a small form on `/aggregate/` shown when a link has
  expired ("הקישור פג? הזינו מזהה ונשלח קישור חדש למייל הרשום").

### 4.5 Token design

```
link = /aggregate/?uid=<uid>&exp=<unix>&sig=<base64url(HMAC-SHA256(SECRET, uid + "." + exp))>
```

- **Expiry: 7 days** to start (D-13). Revisited once `access_log` shows how
  long after a submission therapists actually open links.
- Stateless: no token table, no revocation list. The Worker secret
  (`wrangler secret`) is the only state; rotating it invalidates all
  outstanding links at once — that *is* the revocation mechanism, and fresh
  links are one email away (§4.4).
- Scope is a single uid. A therapist-scoped "all my patients" token is a
  phase-2 option (§11) using the same mechanism with `scope=email`.

---

## 5. Data model

### 5.1 Envelope reuse

The wire format **is** the existing envelope
(`shared/pdf/envelope-schema.js`, `schemaVersion` 1). No new schema. The
server stores envelopes opaquely; the Aggregate migrates old versions
forward on read, exactly as it does for PDFs. Remote envelopes always have
`name: null` and `pid: <uid>`. Because §5.3 removes free text at the source,
**the stored envelope is byte-identical to the one embedded in the PDF** —
there is no stripping step and nothing to drift.

### 5.2 Aggregate as the read surface

`aggregate/src/store.js` already consumes `{ envelope, fileName }` objects;
it gains `addEnvelopes(list)` (fileName null, no PDF blob — the detail
panel's "download PDF" affordance is absent for server rows). Charts, pid
filter, heatmap, table, detail panel: unchanged.

When `/aggregate/` loads with `uid`+`exp`+`sig` params it enters **fetch
mode**: it calls §4.3, populates the store, and hides the PDF-drop zone
(mixing sources in one view is v2, §9). A 403 shows the fresh-link form
(§4.4). Without those params it behaves exactly as today.

### 5.3 The no-identifying-data rule (D-2) — no text items

Names are only one leak path; free-text answers are the other. On this
deployment **instruments containing `text` or `rated_text` items do not
exist**, enforced in three places by one shared predicate
(`shared/remote/no-text-rule.js`):

1. **Catalog:** `scripts/build-catalog.mjs` excludes them (and any battery
   depending on them — none in prod today), so the composer cannot offer
   them.
2. **Patient app:** after `loadConfig`, `src/app.js` refuses to start a
   session whose merged config contains such an item (hand-crafted URLs).
   Configs flagged `"dev": true` are exempt so the dev fixtures keep
   working.
3. **Server:** §4.2 rejects envelopes that reference such items.

The config files stay in the repository untouched (they are `main`'s, and
deleting them would conflict on every rebase). `scripts/validate-configs.mjs`
lists the excluded instruments so the set is visible in CI output.

Affected prod instruments as of 2026-09-14: `top3`, `demographics`,
`anger_log`, `scq`, `cpt_abc`, `cpt_alternative`, `cpt_exploring`,
`cpt_patterns`. Consequences accepted: no idiographic measures and no CPT
worksheets on the trial; `scq` is lost over one optional free-text field
(a text-free variant is a content task, not a code task).

### 5.4 Mandated sets

Each course has a battery config `public/configs/prod/<course>_core.json`
(a normal battery, `meta.featured: true`, dependencies declared). The
composer shows it pinned; the therapist may add instruments to the session
(e.g. `pcl5` + `ptci9` bi-weekly, `pdss_sr` when indicated). Nothing in the
tool ties a uid to a course's battery — that coupling was considered and
rejected as unnecessary for the trial (D-12).

---

## 6. Notification email

Sent on an accepted submission via a provider behind one seam
(`server/lib/email.js`): Cloudflare Email Service first; Resend/Postmark
are drop-in alternatives.

**At most one doorbell per uid per `DOORBELL_WINDOW_HOURS` (default 1).**
The patient app re-submits whenever answers change after a completion, so a
single sitting can produce several submissions; without suppression the
therapist receives an email for each and the account's daily sending quota
is spent on duplicates. Suppression loses nothing: a link is valid for days
and always returns every session for its uid, including ones that arrive
after it was sent. Only a *successful* send suppresses, so a failed doorbell
is retried by the next submission. The fresh-link request (§4.4) is never
suppressed — it is the therapist's own explicit ask.

**Every send is logged** to `access_log` as kind `email` with `ok` 1 or 0
(no `ip_hash`: the request that triggered it already logged the caller's IP
at the same timestamp, and a therapist's email event should not carry a
patient's IP). Lost notifications are therefore queryable rather than
console-only — the operator query is in `scripts/remote/README.md`.

**Why REST and not a binding.** Pages Functions cannot bind `send_email` —
that binding is Workers-only, and Pages supports only KV, D1, R2, Durable
Objects, Queues, Hyperdrive, Vectorize, Workers AI, Analytics Engine,
service bindings, vars and secrets. So the seam calls the Email Sending
REST API with a scoped account token (`EMAIL_API_TOKEN`), the single
credential the Functions hold. If the trial ever moves off Pages to a
Worker, the seam collapses to `env.EMAIL.send()` and the token disappears.

**Body contains, exhaustively:** the uid, the completion date, and a signed
link (§4.5). Subject: `מדד — מטופל <uid> השלים שאלון`.

**Never in the email:** scores, instrument names, alerts, patient identity
of any kind (D-3). Instrument names are excluded too — "completed PCL-5"
discloses a trauma context.

v1.1 option, default off: a generic `⚠` marker when the session raised any
alert, with no detail. The tension (email disclosure vs. duty of care for
e.g. PHQ-9 item 9) is recorded deliberately; turning the marker on is a
clinical-governance decision, not a code decision.

---

## 7. Security posture

| Control | Mechanism |
|---|---|
| Transport | HTTPS only (platform-enforced); CSP unchanged (`connect-src 'self'`) |
| Write abuse | Registry check on every request; 256 KB payload cap; `validateEnvelope()` + no-text rule server-side; per-uid daily submission cap (D1 counter); per-IP rate limit on `/api/v1/*` via a Cloudflare WAF rate-limiting rule (documented in `scripts/remote/README.md`) |
| Read access | HMAC-signed, 7-day-expiring, uid-scoped links; constant-time verification; secret in `wrangler secret`, rotation = global revocation |
| Enumeration | Accepted at §4.1 and §4.2 (below); §4.3 uniform 403; §4.4 always 204 |
| Stored data | Pseudonymous by construction (D-2, §5.3); D1 encrypted at rest; Time Travel / backup restore drill required before launch |
| Injected content | Aggregate treats server envelopes as untrusted: same Lit templating + `textContent` discipline as the PDF read path |
| Logging | `access_log` per request and per email send (kind, uid, ok, salted IP hash, timestamp); no clinical content in logs; failed checks are visible so a probe can be spotted, and failed sends so a quota block is visible |
| Sending quota | Doorbell suppressed to one per uid per window (§6), so re-submissions cannot multiply into the account's daily send limit |

**On enumeration (D-9, D-10).** The registry check reveals whether a uid
exists. That oracle is unavoidable if the patient is to get an honest
failure, and it was already present at submit in the original design. What
a confirmed uid buys an attacker: the ability to submit fabricated sessions
for it, and the knowledge that it exists. Reads still require the signed
link; the registry maps to nobody. With ~2,500 uids in 2³⁵, an attacker
needs ~14 million guesses per hit; a WAF rule of tens of requests per
minute per IP makes that years per address, and a distributed guesser
shows up in `access_log` as a wall of failed checks. The user weighed a
12-character format (55 bits) against hand-copy ergonomics and chose 8.

What deliberately does not exist: accounts, passwords, patient-side
authentication, server-side identity, token revocation lists.

---

## 8. Client changes

### 8.1 Patient app

- `src/app.js`: the pid is **required** and must pass `isValidUid()`
  (`shared/remote/uid.js`); missing/invalid → the existing error screen.
  The registry check (`src/remote/api.js` `checkUid`, §4.1) runs in
  parallel with the config load; only a definitive `unknown_uid` refusal
  blocks — a bare 404, 5xx, timeout or network error fails open. Then the
  no-text guard (§5.3). Welcome screen mounts with `collectName=false`.
- Welcome screen shows a one-line disclosure: התוצאות (ללא פרטים מזהים)
  יישלחו למטפל/ת שלך. This is a **requirement**, not a nicety; the help
  page's "nothing leaves the device" copy is rewritten in the same commit.
- `src/controller.js`: on completion, `src/remote/api.js` `submitSession`
  POSTs the envelope (one automatic retry on network/5xx; API refusals are
  not retried). The results screen's status block shows sending / sent ✓ /
  failed with a retry button / refused → "download the PDF and send it to
  your therapist". Re-completing after changing answers sends again;
  revisiting the results screen with unchanged answers does not. No share
  button (`canShare=false`).
- Offline persistence of an unsent envelope (retry on next open) is v1.1.

### 8.2 Composer

- The patient-id field becomes the uid field: label, placeholder
  `XXXX-XXXX`, live format + check-symbol validation; the link is withheld
  until the uid is valid.
- `composer/src/remote/uid-memory.js` remembers uids used in this browser
  (localStorage) and offers them in a `<datalist>`. Local only; nothing
  identifying is stored (a uid is not a person).
- Course batteries appear as featured (§5.4).

### 8.3 Aggregate

Fetch mode (§5.2) in `aggregate/src/remote/fetch-sessions.js`; the
fresh-link form; PDF-download affordance hidden for server rows.

### 8.4 Branding

The trial instance must never be confused with `app.ezmadad.com`.
Decided 2026-09-14 after two rounds (a plum system was rejected as generic
"app purple"; a terracotta POC before it): **muted burgundy on a neutral
ground** — primary `#7A2E3B`, accent `#9A4453`, chrome `#3A1F25` /
`#4E2A32`, warm-grey light background `#F5F4F2`, charcoal dark background
`#161616` with a rose primary `#C9737F`. The wine is used only for chrome,
primary actions, selection and the wordmark; semantic yes/no colours are
unchanged. It lives in two token blocks (`shared/styles/tokens.css`, the
`--clin-*` block in `clinician/styles/clinician-styles.js`) plus the
favicon, the PDF footer link and the chart export line. Wordmark
"מדד · CTR" (working name, to confirm) in the welcome screen, clinician
nav, PDF footer and page titles; `public/robots.txt` with `Disallow: /`.

---

## 9. Out of scope for v1

Revisiting requires updating this document.

- Therapist accounts and self-service uid management (manual registry,
  D-5; the planned second phase — §11).
- Therapist-scoped "all my patients" dashboard/token (§11).
- Mixing server-fetched and PDF-dropped sessions in one Aggregate view.
- Alert marker in email (v1.1 flag, default off — §6).
- Offline retry of an unsent envelope (v1.1).
- Retention tooling / deletion API (indefinite retention, D-6; a manual
  `DELETE FROM sessions WHERE uid=?` on request is the v1 answer).
- Tying a uid to a course's mandated battery (D-12).
- Any storage of free text, ever (this is D-2, not a deferral).

---

## 10. Open questions

1. **Trial name.** Working name "מדד · CTR", to confirm. Settled
   2026-09-15: the origin is **`ctrmadad.com`**, registered into the
   trial's own Cloudflare account. Chosen over a subdomain of ezmadad.com
   because that zone lives in the personal account, and both an apex custom
   domain and the email sender address must belong to the account that runs
   the project. Nothing in the code depends on the host — links and API
   calls derive from the request origin — so the only host-bearing strings
   are the Open Graph metas, the PDF's non-browser fallback origin and the
   sender address. A university name may be added later as a second front
   door; sending would move with it only if they delegate the name rather
   than aliasing it, since a CNAME cannot carry the SPF record a sender
   address needs.
2. **Legal.** The questions for the lawyer are in `LEGAL_QUESTIONS.md`.
   Answers may change retention (D-6), logging (§7) and the disclosure
   wording (§8.1). The design assumes sensitive-tier obligations regardless.
3. **Link expiry and recovery UX.** 7 days is a default, not a finding.
   `access_log` answers: how often therapists open links, how long after a
   submission, and how often the fresh-link form is used.
4. **Alert marker in the email** (§6) — clinical-governance decision before
   the first wave if the courses want it.

---

## 11. Generalization path — private therapists (phase 2)

**Decided 2026-07-15:** v1 ships as specced above (manual registry, course
scope); offering Remote tracking to private therapists is a planned second
phase, additive to v1 — nothing here changes v1's shape, and v1 must not
foreclose it.

### 11.1 What phase 2 adds

- **Self-service onboarding** replaces D-5: a therapist signs up with
  their email and verifies it via a magic link — the §4.5 HMAC-link
  mechanism promoted to authentication (therapist-scoped token in a
  session cookie). No passwords, ever.
- **A therapist dashboard** (`/clinic/`, behind that cookie): mint a uid
  for a new patient (emits the composer URL), list own uids with
  last-submission dates and view links, and **self-service deletion** of
  a uid's sessions — which is also the erasure-request answer, since only
  the therapist can map a uid to a person.
- A `therapists` table; `registry.therapist_email` becomes a foreign key.
  The submission, read and email paths are untouched.
- Patient welcome screen shows the receiving therapist's display name
  ("התוצאות יישלחו אל: …") — informed consent and impersonation resistance
  in one line. Therapist professional identity is not patient PII; D-2 is
  untouched.

### 11.2 What v1 must preserve (the non-foreclosure list)

- Registry keyed by therapist **email** — the identity primitive phase 2
  authenticates.
- The HMAC token mechanism stays scope-parameterised (uid now;
  therapist-email scope later).
- D-2 (pseudonymous-only) is load-bearing for generalization: it is what
  makes serving strangers legally and ethically tenable. Never relax it.
- Deployment portability (§2): phase 2 is a two-deployment story — the
  trial instance wherever MOH dictates, the public instance on Cloudflare.

### 11.3 Gating items (non-technical)

- **Legal:** each private therapist is an independent data controller;
  the operator becomes a processor serving many controllers. Needs
  lawyer-written ToS / processing terms, a database-registration posture,
  and a decision on operating entity before public launch.
- **Verification posture:** who counts as a therapist. Start with manual
  approval + a license-number field; relax only when volume forces it.
- **Duty-of-care wording:** ToS must state explicitly that this is not an
  emergency monitoring service; the §6 alert marker graduates from "v1.1
  option" to "decide before public launch."
- **Email deliverability:** SPF/DKIM/DMARC on the sending domain is a
  launch prerequisite (also for v1 — §12.5).

### 11.4 Cost model

Compute is a non-issue (1,000 therapists × 10 patients × weekly ≈ 40k
requests and emails/month — inside free tiers, email ~\$20/month). The
dominant cost is **support**; passwordless auth, self-service uid
management and honest client-side failure messages exist to minimise it.

---

## 12. Deployment model — one codebase, two deployments, one branch

**Decided 2026-09-14 (D-8), replacing the July build-flag design.** The
public app and the trial app are built from the same codebase, but the
trial is a **separate long-lived branch `remote`**, deployed to its own
Pages project and origin. A build flag was rejected as too risky: a flag
that mis-flips ships submission code to the public app. A branch cannot.

### 12.1 Rules

- **`main` is the parent.** Every instrument, engine, scoring, PDF,
  component and fix lands on `main` as today. Nothing remote-specific is
  ever committed to `main`.
- **`remote` is rebased onto `main`** after every `main` merge
  (`git rebase main`). The branch's CI is the check. History on the branch
  is therefore linear and rewritten; it is never merged back.
- **Seams on `main`, values on the branch.** Where the branch needs to
  change behaviour in a `main` file, the preferred route is a
  behaviour-neutral seam committed to `main` first (a property whose
  default is today's behaviour), with the branch only setting the value.
  Seams introduced for this purpose: `welcome-screen.collectName`,
  `results-screen.status`, `buildCatalog(configs, { exclude })`, and the
  tokenisation of the hardcoded chrome colours so the palette is one file.
- **Prefer new files.** Remote code lives in `src/remote/`,
  `composer/src/remote/`, `aggregate/src/remote/`, `shared/remote/`,
  `server/`, `functions/`, `scripts/remote/`, `wrangler.toml`, and this
  document.

### 12.2 The drift budget

The complete list of `main` files the branch edits. Anything outside this
list diverging between the two deployments is a bug; extending the list
requires updating this section.

| File | Branch change |
|---|---|
| `src/app.js` | uid required + `isValidUid`; uid check; no-text guard; `collectName=false`; disclosure |
| `src/controller.js` | one guarded submit call; status feed; `canShare=false` |
| `src/components/welcome-screen.js`, `clinician/components/clinician-nav.js`, `src/pdf/report.js` | wordmark string; the nav brand links to `../help/` (no landing on the trial) |
| `index.html`, `composer/index.html`, `aggregate/index.html`, `help/index.html` | `<title>`; help privacy copy |
| `composer/src/composer-store.js`, `composer/src/components/selection-cart.js`, `composer/src/components/mobile-bar.js`, `composer/src/components/composer-app.js` | uid validation, link withheld, label/placeholder/datalist, remembered uids |
| `shared/config/loader.js` | one line: carries a file's `dev` flag onto its questionnaires so the runtime no-text guard can exempt fixtures |
| `aggregate/src/aggregate.js`, `aggregate/src/store.js`, `aggregate/src/components/session-detail.js` | fetch mode; `addEnvelopes`; PDF download hidden for server rows |
| `shared/styles/tokens.css`, `public/favicon.svg` | palette, favicon |
| `scripts/validate-configs.mjs`, `scripts/build-catalog.mjs` | no-text rule wiring |
| `public/composer/catalog.json` | regenerated (excluded instruments absent) |
| `public/robots.txt` | new, `Disallow: /` |
| `.github/workflows/ci.yml` | branch added to triggers (`deploy-remote.yml` is branch-only) |
| `docs/HANDOVER.md` | one branch note at the top |
| `tests/e2e/*` | uid in URL constants; composer tests fill the uid; text-instrument cases repointed |
| `*.test.js` beside the files above | expectations updated for the uid, brand string and withheld link |
| `package.json`, `package-lock.json` | `dev:remote`, `deploy:remote` scripts; lint globs; wrangler dev dependency |
| `vitest.config.js`, `eslint.config.js`, `.gitignore` | `server/**` and `functions/**` covered; `.dev.vars`, `.wrangler/`, `minted/` ignored |

### 12.3 Artifacts

| | Public app | Landing | Trial app |
|---|---|---|---|
| Branch | `main` | `main` | `remote` |
| Build | `vite build` | `vite.landing.config.js` | `vite build` (same config) |
| Cloudflare account | personal | personal | **CTR (institutional)** |
| Pages project | `madad-app` | `madad-landing` | `madad-remote` |
| Domain | `app.ezmadad.com` | `ezmadad.com` | `ctrmadad.com` |
| Server side | none | none | Pages Functions (`functions/` + `server/`) + D1 + secrets |
| Landing | — | yes | none (robots disallow; help page only) |

The API is deployed **only** with the trial project; the public origin has
no `/api/*` routes. D1, the HMAC secret and the email key exist only in
`madad-remote`'s configuration.

### 12.4 Testing matrix (CI, every push to `remote`)

| Layer | What |
|---|---|
| Unit | full suite + `shared/remote/*`, `src/remote/*`, `functions/**` handler tests (pure `(request, deps) → Response` with fake db/email) |
| E2E dev | existing suite (uid in URLs) + `remote.e2e.test.js`: Playwright route interception of `/api/v1/*` — happy path, unknown uid at start, submit failure → PDF fallback, aggregate fetch mode, expired link form |
| Dist-smoke | existing project + assertions: uid guard renders; `/api` calls go to the same origin only; no text instrument in the catalog |
| Full stack | manual: `npm run dev:remote` (`wrangler pages dev dist` with a local D1) and `curl` against all four endpoints |

### 12.5 Implementation stages

Tracked in the session plan; summarised here so the order survives.

1. **Branch + documents** — this rewrite, `LEGAL_QUESTIONS.md`.
2. **Seams on `main`** — colour tokenisation, `collectName`, `status`,
   catalog `exclude`; behaviour-neutral, dist-smoke proves it.
3. **Trial identity on the branch** — uid module, mandatory uid, no name,
   disclosure, no-text rule, course batteries, branding, new palette.
4. **Server** — `functions/api/v1/*` + `server/lib/*`, D1 migrations, email
   seam, rate limiting, operator scripts + runbook, `dev:remote`.
5. **Client remote path** — uid check, submit, results status, e2e.
6. **Aggregate fetch mode.**
7. **CI/deploy** — branch CI trigger, `deploy-remote.yml`, secrets.
8. **Bring-up** — Pages project + domain, D1 + migrations, secrets, email
   DNS (SPF/DKIM/DMARC), WAF rate-limit rule, registry seeding for the
   8 courses, backup/restore drill, end-to-end pilot with a test uid.

Stages 2–7 ship dark: until a uid is minted, the trial origin refuses
every link.
