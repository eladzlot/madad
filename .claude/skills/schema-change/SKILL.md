---
name: schema-change
description: Safely change the config schema (QuestionnaireSet.schema.json) or semantic validation rules. Use whenever a task adds, removes, renames, or re-types a config field, changes an enum, or touches config-validation.js. Enforces the validator regeneration chain and explains the deploy-skew trade-off (one deploy vs two) so the user can decide.
---

# Changing the config schema

The schema ships **inside the JS bundle**; configs are **fetched at runtime**. After a
deploy, a browser can hold a stale bundle with fresh configs (or vice versa) for the
HTTP cache window. Shipping a schema change and the matching config change in one
deploy caused a production outage on 2026-07-14 (`maxPerItem`). This skill exists to
prevent a repeat. Background: `public/configs/CONTRIBUTING.md` §"Schema changes and
deploy skew", `docs/HANDOVER.md` §10.

## Step 1 — Classify the change

**Tolerated (single deploy):** adding or removing an *optional* field. The browser-side
validator treats unknown properties as warnings, not errors, so skewed pairs survive
the cache window. CI stays strict, so schema and configs must still be consistent
within the commit.

**Breaking (deploy strategy decision, Step 4):** renaming a field, changing an enum's
values, making a field required, tightening a constraint (pattern, min/max,
`additionalProperties`) — anything where an old config fails the new schema or a new
config fails the old schema.

State the classification to the user before editing anything. When unsure, treat it as
breaking.

## Step 2 — The regeneration chain (every schema change)

`shared/config/validate-schema.js` is a **generated** pre-compiled AJV validator (CSP:
no runtime `new Function()`). It does not update itself.

1. Edit `shared/config/QuestionnaireSet.schema.json`.
2. `npm run build:validator` — regenerates `validate-schema.js`. Commit the regenerated
   file together with the schema. (`npm test` and `npm run build` also run it, so a
   stale copy shows up as a diff — never hand-edit it.)
3. Update semantic rules in `shared/config/config-validation.js` if the change has
   cross-field implications the JSON Schema can't express, plus its test file.
4. Update `shared/config/QuestionnaireSet.schema.test.js` — add cases for the new
   shape, both accepting and rejecting.
5. Update the authoring docs, which must never lag the schema:
   - `public/configs/LLM_GUIDE.md`
   - `docs/CONFIG_SCHEMA_SPEC.md`
6. Update every config under `public/configs/` that the change affects.

## Step 3 — Verify

```bash
npm test
npm run validate:configs
npm run build && npm run e2e:dist
```

The dist-smoke run matters here: schema/config mismatches surface as runtime load
failures ("לא ניתן לטעון את השאלון") that unit tests can't see.

## Step 4 — Breaking changes: explain the skew risk, let the user pick

A push to main **is** a deploy (`.github/workflows/deploy-cloudflare.yml`). Do not
choose a deploy strategy yourself — lay out the trade-off below and ask the user.

**The risk being managed:** the schema ships inside the JS bundle while configs are
fetched at runtime, so the two can skew. Cloudflare Pages deploys are atomic at the
edge and config fetches revalidate via ETag (`cache: 'no-cache'`), so CDN-side skew is
brief — but any browser tab opened *before* the deploy keeps the old bundle until
reloaded, and a patient mid-questionnaire or a clinician's long-lived composer tab can
sit in that state indefinitely. While skewed, validation fails and the patient sees
"לא ניתן לטעון את השאלון". This is exactly what happened on 2026-07-14.

**Option A — two deploys (no skew, more work):**
1. Deploy 1 ships configs valid under *both* the old and new schema (carry old and new
   field in parallel, or add the field as optional before it becomes required). No
   schema edits in this commit.
2. After deploy 1 is live, wait for stale tabs and caches to plausibly drain (minutes
   for HTTP caches; open tabs only drain on reload — deploying at a quiet hour helps).
3. Deploy 2 ships the schema change with the full Step 2 chain and drops any
   transitional config fields.

**Option B — single deploy (simpler, accepts a skew window):** everything ships in one
push. Anyone holding a pre-deploy tab or cached bundle can hit the load error until
they reload. This can be a reasonable trade when traffic is low, the change ships at a
quiet time, and the user accepts a brief error window — but it is their call, because
they know whether patients currently hold live links.

If configs can't be made valid under both schemas (e.g. an enum value must change
meaning), say so and design an explicit migration with the user instead of forcing it
through.

## Step 5 — Before committing

- Present the diff summary: schema change, regenerated validator, config edits, doc
  edits, and — if the user chose two deploys — which commit belongs to which deploy.
- Never commit or push without explicit user approval; on the two-deploy path, get
  separate approval for each deploy.
