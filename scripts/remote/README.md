# Remote deployment — operator runbook

Everything the operator does by hand for the trial instance
(`docs/REMOTE_SPEC.md`). Nothing here is exposed to therapists or patients.

## One-time bring-up (spec §12.5 stage 8)

`wrangler login` is interactive — run it in a terminal of your own (an agent
session cannot complete the browser handshake). Everything else below is
scriptable once the login exists.

```bash
npx wrangler login                                   # interactive, once per machine
npx wrangler pages project create madad-remote --production-branch remote
npx wrangler d1 create madad-remote                  # paste database_id into wrangler.toml
npx wrangler d1 migrations apply madad-remote --remote

# Secrets (never in git). Stored encrypted at Cloudflare; these commands are
# the only moment the values exist locally.
openssl rand -base64 48 | npx wrangler pages secret put HMAC_SECRET --project-name madad-remote
openssl rand -base64 24 | npx wrangler pages secret put IP_SALT     --project-name madad-remote

# The email token is PASTED, so take it at the prompt rather than on the
# command line — a piped or echoed token lands in ~/.bash_history and in the
# terminal scrollback. This form prompts and reads stdin without echoing:
npx wrangler pages secret put EMAIL_API_TOKEN --project-name madad-remote
```

`EMAIL_API_TOKEN` is a **scoped** API token, not the global key: My Profile →
API Tokens → Create Token → Custom token → permission **Account · Email
Sending · Edit**, limited to this account. It is the only credential the
Functions hold, and it exists because Pages Functions cannot use the
`send_email` binding (that binding is Workers-only — Pages supports KV, D1,
R2, Durable Objects, Queues, Hyperdrive, Vectorize, Workers AI, Analytics
Engine, service bindings, vars and secrets, and nothing else), so §6's
provider seam talks to the Email Sending REST API instead.

### Onboarding the sending domain

Do this **in the dashboard**: Compute & AI → Email Service → Email Sending →
Onboard Domain → `ezmadad.com` → Add records and onboard. It writes the SPF
and DKIM records into the zone for you.

**Email Sending requires the Workers Paid plan** (\$5/month minimum). Until
the account is upgraded, both the dashboard and the CLI refuse: `wrangler
email sending enable ezmadad.com` fails with `Unauthorized [code: 2036]` on
`/zones/<id>/email/sending/subdomains`, and a plain read
(`email sending dns get`) fails identically, which is what distinguishes a
plan gate from a missing permission. Upgrade first, then onboard.

The plan buys email and nothing else here: D1 usage at trial scale (roughly
a thousand writes a day) sits far inside the free tier either way. Staying on
Cloudflare also keeps the processor list at one — a third-party email vendor
would receive therapist addresses and patient uids, which is a new
sub-processor to disclose (`docs/LEGAL_QUESTIONS.md`).

Then set `CF_ACCOUNT_ID` and `EMAIL_FROM` in `wrangler.toml` `[vars]`
(`moh@ezmadad.com`; the sending domain is `ezmadad.com`, so the `moh`
subdomain needs no separate onboarding).

Then in the dashboard:

- **Custom domain:** Workers & Pages → madad-remote → Custom domains → add
  `moh.ezmadad.com`. The zone is on Cloudflare, so the CNAME is created for
  you and the certificate follows within minutes.
- A DMARC record on ezmadad.com if there is none yet, and the WAF
  rate-limiting rule below (on the zone, scoped to the `moh` host).

**WAF rate limit (per IP, spec §7):** Security → WAF → Rate limiting rules →
`(http.host eq "moh.ezmadad.com" and http.request.uri.path starts_with "/api/v1/")`,
60 requests / 1 minute per IP, action Block for 10 minutes. The per-uid caps
live in the Functions.

## Minting uids for a course

```bash
# therapists.csv:  email,course,count[,label]
node scripts/remote/mint-uids.mjs therapists.csv --out minted/2026-10-course-a
npx wrangler d1 execute madad-remote --remote --file=minted/2026-10-course-a/registry.sql
```

`minted/<batch>/handouts/<email>.csv` is what each therapist receives (their
uids, with an empty column they fill in privately). `summary.csv` is the
operator's record. **Keep `minted/` out of git** (it is gitignored).

## Sending quota — before the wave

Cloudflare starts new accounts on a conservative daily quota and raises it as
sending history builds. At trial scale — 250 therapists, roughly weekly
measurement — expect on the order of 200–360 doorbells a day, which may
exceed a fresh account's default.

1. Read the real number once sending is enabled:
   `GET /accounts/<id>/email/sending/limits` (or the Email Service analytics
   tab). Do not plan against a guess.
2. File the limit-increase request with the actual arithmetic: therapist
   count, cadence, transactional-only, recipients are named professionals in
   a ministry programme, so bounce and complaint risk is near zero. Do this
   **weeks** before the first wave.
3. Ramp: bring up one course before all eight, so reputation builds ahead of
   the volume.
4. Watch the two queries in the table below.

If the quota still binds, the escalation is a daily digest per therapist
(one email listing the day's uids) instead of a per-session doorbell — it
caps volume at the therapist count rather than the patient count, at the
cost of a cron trigger and a rewrite of spec §6.

## Routine operations

| Task | Command |
|---|---|
| See who submitted today | `npx wrangler d1 execute madad-remote --remote --command "SELECT uid, created_at FROM sessions WHERE created_at >= date('now') ORDER BY created_at"` |
| Link usage (spec §10.3) | `… --command "SELECT kind, ok, COUNT(*) FROM access_log WHERE ts >= date('now','-7 days') GROUP BY kind, ok"` |
| Delete a patient's data on request (D-6) | `… --command "DELETE FROM sessions WHERE uid = 'ABCDEFGH'"` (uid without hyphen) |
| Retire a uid | `… --command "DELETE FROM registry WHERE uid = 'ABCDEFGH'"` (after deleting its sessions) |
| **Notifications lost yesterday** | `… --command "SELECT uid, ts FROM access_log WHERE kind='email' AND ok=0 AND ts >= date('now','-1 day')"` — a non-empty result usually means the sending quota, not a bug |
| Emails sent per day (quota headroom) | `… --command "SELECT substr(ts,1,10) AS day, COUNT(*) FROM access_log WHERE kind='email' AND ok=1 GROUP BY day ORDER BY day DESC LIMIT 14"` |
| Revoke every outstanding therapist link | rotate `HMAC_SECRET` (`wrangler pages secret put`); fresh links arrive on the next submission or via the form |
| Backup | `npx wrangler d1 export madad-remote --remote --output backup-$(date +%F).sql` (also D1 Time Travel) |
| Restore drill | `npx wrangler d1 create madad-remote-drill && npx wrangler d1 execute madad-remote-drill --remote --file backup.sql` |

## Local full-stack run

One-time: npm blocks workerd's postinstall (the local Workers runtime) until
you approve it — `npm approve-scripts workerd`, then `npm install` once more.

```bash
cp .dev.vars.example .dev.vars    # fill HMAC_SECRET, IP_SALT (EMAIL_* may stay empty: email logs a failure, submissions still succeed)
npm run dev:remote                # builds, applies migrations to the local D1, serves dist + Functions on :8788
```

Seed the local registry with a test uid:

```bash
npx wrangler d1 execute madad-remote --local --command "INSERT INTO registry VALUES ('E2E00017','you@example.com','dev',NULL,'2026-01-01T00:00:00Z')"
```

Then open `http://localhost:8788/?items=phq9#pid=E2E0-0017`.

Endpoint checks with curl:

```bash
curl -i http://localhost:8788/api/v1/uids/E2E0-0017        # 204
curl -i http://localhost:8788/api/v1/uids/ZZZZ-ZZZZ        # 404
curl -i -X POST http://localhost:8788/api/v1/links -d '{"uid":"E2E0-0017"}'   # 204 always
```
