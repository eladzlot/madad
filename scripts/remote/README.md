# Remote deployment — operator runbook

Everything the operator does by hand for the trial instance
(`docs/REMOTE_SPEC.md`). Nothing here is exposed to therapists or patients.

## One-time bring-up (spec §12.5 stage 8)

```bash
npx wrangler login                                   # interactive, once per machine
npx wrangler pages project create madad-remote --production-branch remote
npx wrangler d1 create madad-remote                  # paste database_id into wrangler.toml
npx wrangler d1 migrations apply madad-remote --remote

# Secrets (never in git)
openssl rand -base64 48 | npx wrangler pages secret put HMAC_SECRET --project-name madad-remote
openssl rand -base64 24 | npx wrangler pages secret put IP_SALT     --project-name madad-remote
echo "<cloudflare api token with Email Sending>" | npx wrangler pages secret put EMAIL_API_TOKEN --project-name madad-remote

# Email: onboard the sending domain, then set CF_ACCOUNT_ID / EMAIL_FROM in wrangler.toml [vars]
npx wrangler email sending enable ezmadad.com
```

Then in the dashboard: custom domain for the Pages project (spec §10.1),
a DMARC record on the sending domain, and the WAF rate-limiting rule below.

**WAF rate limit (per IP, spec §7):** Security → WAF → Rate limiting rules →
`(http.request.uri.path starts_with "/api/v1/")`, 60 requests / 1 minute
per IP, action Block for 10 minutes. The per-uid caps live in the Functions.

## Minting uids for a course

```bash
# therapists.csv:  email,course,count[,label]
node scripts/remote/mint-uids.mjs therapists.csv --out minted/2026-10-course-a
npx wrangler d1 execute madad-remote --remote --file=minted/2026-10-course-a/registry.sql
```

`minted/<batch>/handouts/<email>.csv` is what each therapist receives (their
uids, with an empty column they fill in privately). `summary.csv` is the
operator's record. **Keep `minted/` out of git** (it is gitignored).

## Routine operations

| Task | Command |
|---|---|
| See who submitted today | `npx wrangler d1 execute madad-remote --remote --command "SELECT uid, created_at FROM sessions WHERE created_at >= date('now') ORDER BY created_at"` |
| Link usage (spec §10.3) | `… --command "SELECT kind, ok, COUNT(*) FROM access_log WHERE ts >= date('now','-7 days') GROUP BY kind, ok"` |
| Delete a patient's data on request (D-6) | `… --command "DELETE FROM sessions WHERE uid = 'ABCDEFGH'"` (uid without hyphen) |
| Retire a uid | `… --command "DELETE FROM registry WHERE uid = 'ABCDEFGH'"` (after deleting its sessions) |
| Revoke every outstanding therapist link | rotate `HMAC_SECRET` (`wrangler pages secret put`); fresh links arrive on the next submission or via the form |
| Backup | `npx wrangler d1 export madad-remote --remote --output backup-$(date +%F).sql` (also D1 Time Travel) |
| Restore drill | `npx wrangler d1 create madad-remote-drill && npx wrangler d1 execute madad-remote-drill --remote --file backup.sql` |

## Local full-stack run

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
