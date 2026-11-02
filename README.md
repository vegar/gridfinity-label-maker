# Gridfinity Labels

A browser-based, visual label maker for Gridfinity bins. Type your text, see the
label in 3D, and download a print-ready file. Everything runs in the browser;
there is no server.

**Try it at <https://labels.vi-kan.net>**

![Gridfinity Labels: label list, properties and a 3D preview of the labels](public/features/app.webp)

Inspired by [label.alch.shop](https://label.alch.shop), with label geometry from
[gflabel](https://github.com/ndevenish/gflabel).

## What it does

- Three label holders, chosen per label, all sized to fit the pockets of
  [Gridfinity Extended](https://github.com/ostat/gridfinity_extended_openscad) bins:
  - **Cullenect** ([Cullen J Webb's swappable label system](https://makerworld.com/en/models/446624), v2),
    1U to 3U wide (36, 78 or 120 × 11 mm), with optional snap-fit channels on 1U labels.
  - **Cullenect legacy** (v1.1), 36.4 × 11 × 1 mm with three snap-fit channels, for 1U bins only.
  - **Pred** ([pred's bins with printable labels](https://www.printables.com/model/592545)),
    37.8, 79.8 or 121.8 × 11 × 0.8 mm with a tab and hole at each end. 11 mm tall rather than
    gflabel's 11.5, to fit Gridfinity Extended's 11.35 mm pocket. With raised text, the face sits
    0.4 mm below a rim, as in gflabel.
- One or more lines of text, auto-shrunk to fit, left/center/right aligned, Open Sans regular or bold.
- **Flush** (text inlaid level with the surface, for multi-colour printing) or **raised** text.
- **Screw symbol** in the style of label.alch.shop: the drive seen from above (hex, Phillips,
  Pozidriv, Torx, slot, square, cross, triangle, security pin, or a hex bolt head) next to a
  separate side view of the head type (countersunk, socket, pan, round, wafer). Show both views or
  just one, pick the **regular** or gflabel's threaded **Cullenect** side view, and add
  self-tapping, flanged, partly threaded or flipped.
- **Nut symbol**: hex nut or lock nut (from above, from the side, or both), square nut or T-nut.
- More symbols ported from gflabel: a bolt drawn to length (with a broken shaft when too long),
  washer, lock washer and threaded insert.
- **Text and symbols in any order**: a label is a row of segments, each a piece of text or a
  symbol (text, symbol, text, ...). Segments marked **Grow** share the spare width; without
  any, the row is packed together with a set **gap** between segments (1 mm by default).
  Each text has its own alignment, weight and max letter height, and each symbol its own height
  and alignment, so you can mix small bold text with tall regular text.
- **Multiple labels** in one session: add, remove and switch between labels. **Clone** a label
  with a list of new texts (one per line) to make many matching labels at once. **Add label**
  makes a blank label that keeps the size, print style and colours of the one you were editing.
  Labels are kept in the browser between visits.
- Live 3D preview with label, text and symbol colours.
- **Printer bed view**: pick your printer (or type a bed size) and see the labels laid out on its
  plates, with more plates when they don't all fit.
- **3MF export** of all labels at once, laid out on your printer's plates. For a Bambu Lab printer the file is a Bambu Studio project with every plate, the printer's system presets and a filament per colour; for other printers it's a zip with one 3MF per plate when they need more than one. Each label is its own object,
  with the label, the text and the symbols as parts, so you can assign a filament to each in
  Bambu Studio, OrcaSlicer or PrusaSlicer; Bambu Studio and OrcaSlicer get one filament slot per
  colour, shared by all labels. STL export as a zip with a folder per label and one file per part.

## Printing tips

- Print face up. For flush text, a 0.2 mm text depth equals one layer at 0.2 mm layer height.
- With a 0.4 mm nozzle, keep letters at least about 4.4 mm tall. The app warns when text is
  shrunk below that.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # geometry and export tests
npm run build   # static site in dist/
```

Stack: TypeScript, React, Vite, [manifold-3d](https://github.com/elalish/manifold) (WASM) for solid
geometry, [opentype.js](https://opentype.js.org) for fonts, [three.js](https://threejs.org) for
the preview and [fflate](https://github.com/101arrowz/fflate) for zipping 3MF files. The geometry
and export code in `src/` (`bases.ts`, `cullenect.ts`, `pred.ts`, `symbols.ts`, `text.ts`,
`label.ts`, `export.ts`, `preview.ts`) has no React dependency; the UI lives in `App.tsx`, `components/` and the `use*.ts` hooks.

### Deploying

`.github/workflows/ci.yml` tests and builds every push and pull request, and deploys `main`
to GitHub Pages. To turn deployment on, set **Settings → Pages → Source** to **GitHub Actions**.
The site is served at <https://labels.vi-kan.net>. The build uses a relative base (`base: "./"`
in `vite.config.ts`), so the same build works on a custom domain and on the plain Pages path.
A custom domain needs a DNS `CNAME` record pointing at `<user>.github.io`, the domain under
**Settings → Pages → Custom domain** (with Actions deployment a `CNAME` file in the build is
ignored), and **Enforce HTTPS** ticked once GitHub has issued the certificate.

## Roadmap

- More label holders from gflabel (modern, predbox, tailorbox)

## Licence

MIT, see [`LICENSE`](LICENSE). The label geometry and symbols ported from gflabel are BSD-3-Clause,
and Open Sans is under the SIL Open Font License; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
