import type { ReactNode } from "react";

interface Feature {
  title: string;
  text: ReactNode;
}

interface Figure {
  /** File name in public/features/. */
  src: string;
  alt: string;
  caption: ReactNode;
  /** Pixel width of the image at 1×, so it isn't blown up past its sharp size. */
  width?: number;
  /** Spans the whole page width below the group's text, for screenshots with small print. */
  wide?: boolean;
}

interface Group {
  id: string;
  title: string;
  intro?: ReactNode;
  features: Feature[];
  figures?: Figure[];
}

/** Screenshots live in public/, next to the built page, so they work under any base path. */
const image = (src: string) => `${import.meta.env.BASE_URL}features/${src}`;

const GROUPS: Group[] = [
  {
    id: "holders",
    title: "Label holders",
    intro:
      "Pick the holder under Properties when the label itself is selected in the outline.",
    figures: [
      {
        src: "holders.webp",
        alt: "A 2U Cullenect label, a legacy Cullenect label and a 2U pred label with tabs and holes at each end",
        caption: "From the back: Cullenect 2U, Cullenect legacy and pred 2U.",
      },
    ],
    features: [
      {
        title: "Cullenect",
        text: "The current (v2) Cullenect label, for 1U, 2U or 3U bins. 1U labels can have the snap-fit channels on the back.",
      },
      {
        title: "Cullenect legacy",
        text: "The older v1.1 Cullenect label. It comes in one size, for 1U bins.",
      },
      {
        title: "Pred",
        text: "Labels for pred's bins, held by a tab and hole at each end, for 1U, 2U or 3U bins.",
      },
      {
        title: "Size",
        text: "The label's width and height are shown next to the holder, worked out from the holder and bin width.",
      },
    ],
  },
  {
    id: "segments",
    title: "Text and symbols",
    intro:
      "A label is a row of segments. Each segment is either text or a symbol, in any order.",
    figures: [
      {
        src: "segments.webp",
        alt: "A label with a socket screw, a large bold M5, smaller two-line text, and a washer at the far right",
        caption:
          "Four segments: a screw, bold “M5”, smaller two-line text set to Grow and aligned left, and a washer pushed to the end.",
      },
      {
        src: "segments-outline.webp",
        alt: "The outline listing the label's four segments",
        caption: "The same label in the outline, one line per segment.",
        width: 339,
      },
      {
        src: "palette.webp",
        alt: "The add segment palette: text, screw, bolt, nut, washer, lock washer and threaded insert",
        caption: "“+ Add segment” opens the palette.",
        width: 309,
      },
    ],
    features: [
      {
        title: "Add, move and remove",
        text: "“+ Add segment” under the selected label opens a palette of text and every symbol. The arrows on a segment move it left or right, and ✕ removes it. A new segment copies the style of the last one of its kind.",
      },
      {
        title: "Change a segment's type",
        text: "The Type dropdown turns a segment into text or another symbol, keeping its Grow and colour settings.",
      },
      {
        title: "Text",
        text: "Each text has its own alignment (left, centre, right), weight (regular or bold) and maximum letter height. Press Enter for a second line. Text that doesn't fit is shrunk, and the app warns if letters get too small to print cleanly.",
      },
      {
        title: "Symbol height",
        text: "Each symbol has its own height, from 3 to 9.4 mm.",
      },
      {
        title: "Grow",
        text: "Segments marked Grow share the spare width between them; Align then sets where each sits in its share. With nothing growing, the row is packed together and Row position places it left, centred or right.",
      },
      {
        title: "Gap",
        text: "The space between segments, set on the label (1 mm by default).",
      },
    ],
  },
  {
    id: "symbols",
    title: "Fastener symbols",
    intro:
      "Every option shows a small drawing of the symbol with that option applied.",
    figures: [
      {
        src: "symbols.webp",
        alt: "Four labels showing every kind of fastener symbol",
        caption:
          "From the back: a Cullenect-style screw, a self-tapping screw seen from the side and a Torx drive on its own; two bolts drawn to length; hex, lock, square and T-nuts; a washer, lock washer, threaded insert and hex head bolt.",
      },
      {
        src: "screw-options.webp",
        alt: "The screw's properties with the drive list open, each drive drawn next to its name",
        caption: "Every choice is drawn, so you can see it before you pick it.",
        width: 341,
      },
    ],
    features: [
      {
        title: "Screw",
        text: "Drawn as the drive seen from above next to a side view of the head. Choose Regular or Cullenect style, and show the drive and side, the drive only or the side only. Pick the drive (hex, Phillips, Pozidriv, Torx, slot, square, cross, triangle, Phillips/slot, none, or a hex head bolt), add a security pin, and pick the head (pan, socket, countersunk, round, wafer).",
      },
      {
        title: "Screw modifiers",
        text: "Self-tapping, partly threaded, flanged, or flipped.",
      },
      {
        title: "Bolt (length)",
        text: "A side view drawn to the length you set (1 to 200 mm), with a choice of head. It can be self-tapping, slotted, flanged or flipped.",
      },
      {
        title: "Nut",
        text: "Hex, lock, square or T-nut. Hex and lock nuts can show the top, the side, or both.",
      },
      {
        title: "Washer, lock washer and threaded insert",
        text: "Simple symbols to sit next to the size.",
      },
    ],
  },
  {
    id: "print",
    title: "Print style and colours",
    figures: [
      {
        src: "colours.webp",
        alt: "A dark label with a red screw, white text and the size in yellow",
        caption:
          "One label, four colours: the screw and the size each have their own colour.",
      },
      {
        src: "colour-props.webp",
        alt: "The segment properties with Own colour ticked and set to red",
        caption: "Tick Own colour and pick one.",
        width: 339,
      },
    ],
    features: [
      {
        title: "Flush or raised",
        text: "Flush text is inlaid level with the face, so a 0.2 mm depth is one layer of a second colour. Raised text stands up from the face by the height you set. On a pred label, raised text sits on a recessed face.",
      },
      {
        title: "Depth limits",
        text: "Flush text can only go as deep as the holder allows, for example above the snap-fit channels. The depth is limited for you.",
      },
      {
        title: "Label colours",
        text: "Each label has a colour for the label body, a default colour for text and a default colour for symbols.",
      },
      {
        title: "Per-segment colour",
        text: "Tick Own colour on a segment to give just that segment a different colour, such as one red symbol on an otherwise white label.",
      },
    ],
  },
  {
    id: "labels",
    title: "Many labels",
    figures: [
      {
        src: "clone-dialog.webp",
        alt: "The clone dialog: a table with columns for screw head, screw drive and text, the original in the first row and four copies below",
        caption:
          "Cloning “M3 × 12”: change the head, drive and text per row. Changed cells are tinted.",
        width: 860,
        wide: true,
      },
      {
        src: "clone-result.webp",
        alt: "The outline with the four new labels inserted after the original",
        caption: "The copies are added right after the original.",
        width: 339,
      },
    ],
    features: [
      {
        title: "Outline",
        text: "Every label is listed under Structure, with its width and colours on a swatch. Click a label to edit it; its segments open below it. “+ Add label” adds a blank label with the same holder, size, print style and colours.",
      },
      {
        title: "Clone into a table of copies",
        text: (
          <>
            The ⧉ button on a label opens a spreadsheet: one row per copy, one
            column per text and per main symbol choice (head, drive, length, nut
            type). Enter adds a row, rows can be pasted from a spreadsheet, and
            | makes a line break. The first row is the original, which can be
            edited too. Everything else is copied, so a whole set of M2 to M6
            labels takes a minute.
          </>
        ),
      },
      {
        title: "Remove",
        text: "✕ on a label removes it. The last label always stays.",
      },
      {
        title: "Saved in the browser",
        text: "Your labels, printer and sidebar width are kept in this browser between visits. Nothing is sent to a server.",
      },
    ],
  },
  {
    id: "preview",
    title: "3D preview",
    figures: [
      {
        src: "preview.webp",
        alt: "Six labels in the 3D view, with the third one lifted above the others, and the lift and spread sliders below",
        caption: "The selected label (M3 × 16) is lifted out of the row.",
        width: 469,
      },
    ],
    features: [
      {
        title: "All labels at once",
        text: "Every label is shown, the first one furthest back. Drag to turn the view, scroll or pinch to zoom.",
      },
      {
        title: "Click to select",
        text: "Click a label in the 3D view to select it in the outline.",
      },
      {
        title: "Lift and spread",
        text: "The Lift selected slider raises the selected label above the rest, and Spread others sets the space between the other labels.",
      },
      {
        title: "Print bed view",
        text: "Switch from Labels to Print bed to see the labels laid out on your printer's plates, as they will be in the 3MF, with keep-clear zones and the purge tower spot.",
      },
      {
        title: "Status",
        text: "Under the view: the smallest letter height on the selected label, how long it took to build, and the plate count in the bed view.",
      },
    ],
  },
  {
    id: "export",
    title: "Printer and export",
    figures: [
      {
        src: "print-bed.webp",
        alt: "24 labels laid out in rows on a Bambu Lab H2S plate, with the purge tower drawn at the back",
        caption: "24 labels on a Bambu Lab H2S, kept clear of the purge tower.",
      },
      {
        src: "print-bed-p1s.webp",
        alt: "70 labels on two Bambu Lab P1S plates; the purge corner at the front left is hatched",
        caption:
          "70 labels need two plates on a P1S. The hatched corner is kept clear for purging.",
      },
      {
        src: "export.webp",
        alt: "The printer picker set to Bambu Lab H2S, with Download 3MF (24 labels) and STL (zip) buttons",
        caption: "The printer picker sits above the downloads.",
        width: 379,
      },
    ],
    features: [
      {
        title: "Printer picker",
        text: "Choose a Bambu Lab, Prusa, Creality or Voron printer, or type in a custom bed size. The picker says how many plates the labels need, and warns if a label is larger than the plate.",
      },
      {
        title: "Download 3MF",
        text: "Every label in one download, each its own object with the label, text and symbols as separate coloured parts. For a Bambu Lab printer it is a Bambu Studio project with all plates and the printer's presets; for other printers, one 3MF per plate in a zip. Each colour gets its own filament slot, shared by all labels.",
      },
      {
        title: "STL (zip)",
        text: "A zip with a folder per label and one STL per part, for slicers that don't read 3MF.",
      },
    ],
  },
  {
    id: "layout",
    title: "Layout",
    features: [
      {
        title: "Outline and property grid",
        text: "The sidebar lists labels and segments at the top and the properties of what is selected below, grouped into categories.",
      },
      {
        title: "Resizable sidebar",
        text: "Drag the edge between the sidebar and the view to make it wider or narrower, or use the arrow keys on it. Double-click or Home resets it.",
      },
      {
        title: "Phones and tablets",
        text: "On narrow screens the 3D view sits on top with the sidebar below it, and the view's controls wrap.",
      },
    ],
  },
];

function figure(f: Figure) {
  return (
    <figure key={f.src}>
      <img
        src={image(f.src)}
        alt={f.alt}
        loading="lazy"
        style={f.width ? { maxWidth: f.width } : undefined}
      />
      <figcaption>{f.caption}</figcaption>
    </figure>
  );
}

/** Every feature of the app, grouped by where it is found. */
export function Features() {
  return (
    <div className="about features">
      <article>
        <a className="back" href="#">
          ← Back to the label maker
        </a>
        <h1>Features</h1>
        <p>
          Everything the label maker can do, grouped by where you find it. For
          credits and the reasons behind some choices, see{" "}
          <a href="#about">About</a>.
        </p>

        <nav className="feature-toc" aria-label="Contents">
          {GROUPS.map((g) => (
            <a
              key={g.id}
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`features-${g.id}`)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {g.title}
            </a>
          ))}
        </nav>

        <figure className="feature-hero">
          <img
            src={image("app.webp")}
            alt="The label maker with six labels: the outline and properties on the left, the labels in 3D on the right"
          />
          <figcaption>
            Labels and their properties on the left, every label in 3D on the
            right.
          </figcaption>
        </figure>

        {GROUPS.map((g) => (
          <section
            key={g.id}
            id={`features-${g.id}`}
            className={g.figures ? "feature-group" : "feature-group text-only"}
          >
            <div className="feature-text">
              <h2>{g.title}</h2>
              {g.intro && <p className="sub">{g.intro}</p>}
              <dl>
                {g.features.map((f) => (
                  <div key={f.title}>
                    <dt>{f.title}</dt>
                    <dd>{f.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {g.figures?.some((f) => !f.wide) && (
              <div className="feature-figures">
                {g.figures.filter((f) => !f.wide).map(figure)}
              </div>
            )}
            {g.figures?.some((f) => f.wide) && (
              <div className="feature-figures wide">
                {g.figures.filter((f) => f.wide).map(figure)}
              </div>
            )}
          </section>
        ))}

        <p className="sub">
          Source code on{" "}
          <a href="https://github.com/vegar/gridfinity-label-maker">GitHub</a>.
        </p>
      </article>
    </div>
  );
}
