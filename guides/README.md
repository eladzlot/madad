# Guides

Documentation for the people who *use* Madad: therapists, course staff, and
the committees that approve it. Developer specs live in [`docs/`](../docs/);
the in-app help page is [`help/`](../help/) (served at `/help/`).

## Tracks

| Track | Audience | Form | Status |
|---|---|---|---|
| [Therapist guide](therapist/GUIDE.he.md) | therapists in the course | illustrated handout, Markdown → PDF | written (Hebrew) |
| [Intro video](video/intro/) | therapists in the course (phone and projector) | ~90 s narrated phone capture, unlisted YouTube | spec and script revised; blocked on two app fixes (see `SPEC.md` §12) |
| Detailed walkthrough | therapists, course staff | longer video or step-by-step doc: optional questionnaires, preview, pins, item map, table, export, expired links, PDF fallback | planned |
| Security & privacy guide | ethics committee, IT, MOH reviewers | prose document: what is stored, where, for how long, who can read it | planned — source is `docs/REMOTE_SPEC.md` and the security section of `docs/HANDOVER.md` |

The short video and the guide cover the same happy path; the walkthrough is
where everything the video deliberately leaves out goes (see the "Excluded"
list in [`video/intro/SPEC.md`](video/intro/SPEC.md)).

## Conventions

- **One folder per track**, holding its source, its images, and a `data/`
  folder with whatever regenerates them. Outputs (PDF, MP4) are built, not
  committed.
- **Language in the filename**: `GUIDE.he.md`. Hebrew is the source of truth.
  A translation is a sibling (`GUIDE.en.md`); screenshots are locale-specific,
  so a translated guide will need its own capture run (`shots.mjs` takes the
  locale from the browser context) and its own image folder. Nothing is
  translated yet.
- **Synthetic data only.** Every screenshot is captured from a local build
  with the API mocked, using the made-up patient `K7M3-9QR7`. Nothing is
  captured from ctrmadad.com.
- **The guide is the factual source** for the video and any other track. When
  the UI changes, update the guide first, regenerate its images, then the rest.

## Therapist guide — rebuilding

Screenshots (from the repo root, on branch `remote`, which the guide
describes):

```bash
npm run build && npx vite preview --port 4173 --strictPort --base=/ &
node guides/therapist/data/shots.mjs [only-prefix]   # → guides/therapist/images/
```

`shots.mjs` also writes the per-device intermediates (`*-phone.png`, the
desktop singles) that it composes into the `-pair` and `-row` images. Only
the images the guide references are committed.

The summary screenshots read `data/sessions.json`, which is extracted from
mock report PDFs built from `data/scenario.json`:

```bash
npx vite-node scripts/generate-test-pdfs.mjs guides/therapist/data/scenario.json --out guides/therapist/data/pdfs
node guides/therapist/data/extract.mjs               # pdfs/ → sessions.json
```

Build those PDFs on `main`, not `remote` — the trial branding leaks into the
report footer otherwise.

PDF handout (needs the CTR document template at `~/projects/ctr-templates`,
or `CTR=<path>`):

```bash
guides/therapist/data/build-pdf.sh                    # → guides/therapist/GUIDE.he.pdf
```
