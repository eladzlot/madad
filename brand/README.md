# Madad brand

The Madad mark and everything derived from it. This folder does not feed the
application build; the app's own favicon and share images are separate copies
until they are swapped for the files in `export/`.

## The mark (master, 2026-10-06)

**מדד | Madad**: the Hebrew name on the left and the English on the right. A
quiet bar sits between them, and one accent rule with three even ticks runs
under both. The tagline goes centred under the rule, one language at a time:
מדידה ללא חיכוך / Frictionless measurement.

- The type is Noto Sans Hebrew Bold, the app's own font. The tagline is in the
  regular weight.
- The Hebrew is set 1.17× larger than the Latin. At the same font size its
  letters stand 53 px to the Latin capitals' 62, and מדד would look smaller.
- Colours: ink `#162232`, accent `#1A9FAD`.
- Clear space is half a cap height on every side, built into every file.
- The tagline is for large uses: the landing page, slides, share images and
  video cards. In the app header the mark goes without it.

The geometry is in `logo-core.js`. Earlier directions (Interval, Cadence, Range,
the single-language Baselines and the other tick placements) were dropped on
2026-10-06.

## Files (`export/`)

```sh
node brand/generate.mjs     # rebuilds export/; open export/index.html to see them all
```

All text is outlined, so no file needs a font. PNGs come from Inkscape, the
`.ico` from ImageMagick.

| File | Use |
|---|---|
| `madad.svg`, `-dark`, `-mono-ink`, `-mono-white` | The mark: light grounds, dark grounds, one colour (print), one colour white (photos) |
| `madad-tagline-he*.svg`, `madad-tagline-en*.svg` | With the tagline, in the same four schemes |
| `madad-wordmark-he*.svg`, `madad-wordmark-en*.svg` | One name with the same rule, for a single-language header |
| `madad@2x.png`, `madad-dark@2x.png`, `madad-tagline-*@2x.png` | 1600 px rasters for slides and documents |
| `icon.svg` | The icon: a white מ over the ticked rule on an accent tile; the SVG favicon |
| `icon-maskable.svg`, `icon-mono.svg` | Full-bleed for Android adaptive icons and iOS; one colour without the tile |
| `favicon.ico`, `favicon-16/32/48.png` | Favicons |
| `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Home-screen and web-app-manifest icons |
| `og-he.png`, `og-en.png` (+ `.svg`) | Share images, 1200×630 |

## In the product

`generate.mjs` also writes the files the product uses, so rerunning it keeps
them in step with the master:

| File | Where it shows |
|---|---|
| `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png` | Every page's head |
| `public/brand/madad.svg` | The patient's welcome screen |
| `landing/madad.svg`, `landing/madad-dark.svg` | The landing page's nav and footer, and its mock of the app header |
| The mark inside `public/og-image.svg` and `public/og-image-app.svg` | The share images; then `npm run build:og` |

The clinician header (Link builder, Summary, Help) keeps the name as plain text. The mark was tried there on 2026-10-06 and dropped: at header size the rule read as a stray line, and the mark's height didn't sit with the bar.

The UI copies are the small-size cut. Their clear space is trimmed, and the rule
is heavier (6.5 instead of 4), because at 20–46 px the master's rule is a
hairline.

The share images keep their own messages: the composer's "מדידה בלי חיכוך" and
the patient link's "מלאו שאלון לפני הפגישה". Only the corner mark, between the
`Madad mark` comments, is generated.

The product video (`docs/video/app/`) takes its opening card, end card and
corner mark from these files too (`brand.marks` in its `video.json`).

## Tuning

Open `playground.html` in a browser. It shows the master with live text, and its
controls (accent, ink, weight, tracking, line weight) change it in place. Once
values are settled, copy them into `DEFAULTS` in `logo-core.js` and rerun
`generate.mjs`.
