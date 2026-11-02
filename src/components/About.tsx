import { useState, type ReactNode } from "react";
import { Segmented } from "./Segmented";

interface Resource {
  name: string;
  url: string;
  note: ReactNode;
}

const INSPIRATION: Resource[] = [
  {
    name: "label.alch.shop",
    url: "https://label.alch.shop",
    note: "The idea: a visual label maker that runs in the browser. The screw symbol (drive and head drawn side by side) follows its look.",
  },
  {
    name: "gflabel",
    url: "https://github.com/ndevenish/gflabel",
    note: "Nicholas Devenish's label generator. The Cullenect and pred label bodies and the fastener symbols are ported from it (BSD-3 licence).",
  },
  {
    name: "Gridfinity",
    url: "https://gridfinity.xyz",
    note: "Zack Freedman's modular storage system that the labels are for.",
  },
];

const HOLDERS: Resource[] = [
  {
    name: "Cullenect labels",
    url: "https://makerworld.com/en/models/446624",
    note: "Cullen J Webb's swappable label system. Both v2 and the legacy v1.1 label are supported.",
  },
  {
    name: "pred's Gridfinity bins",
    url: "https://www.printables.com/model/592545",
    note: "Parametric bins with printable labels held by a tab and hole at each end.",
  },
  {
    name: "Gridfinity Extended",
    url: "https://github.com/ostat/gridfinity_extended_openscad",
    note: "ostat's OpenSCAD bins. Label sizes are checked against its label pockets.",
  },
];

const LIBRARIES: Resource[] = [
  { name: "manifold-3d", url: "https://github.com/elalish/manifold", note: "Solid geometry, compiled to WebAssembly." },
  { name: "opentype.js", url: "https://opentype.js.org", note: "Reads fonts and turns text into outlines." },
  { name: "three.js", url: "https://threejs.org", note: "The 3D preview." },
  { name: "fflate", url: "https://github.com/101arrowz/fflate", note: "Zips the 3MF and STL files." },
  { name: "React", url: "https://react.dev", note: "The user interface." },
  { name: "Open Sans", url: "https://fonts.google.com/specimen/Open+Sans", note: "The label font (SIL Open Font License)." },
];

const CHOICES: { title: string; text: ReactNode }[] = [
  {
    title: "Browser only",
    text: "Everything, including the geometry, runs in your browser. There is no server, and your labels are saved in the browser between visits.",
  },
  {
    title: "Sized for Gridfinity Extended",
    text: "Label dimensions follow gflabel, but are checked against the label pockets in Gridfinity Extended bins, since that is where they are used.",
  },
  {
    title: "Pred labels are 11 mm tall",
    text: "gflabel makes pred labels 11.5 mm tall, but Gridfinity Extended's default pred pocket is only 11.35 mm (a 14 mm label less the 2.65 mm lip). 11 mm fits both, with the same clearance as a Cullenect label.",
  },
  {
    title: "Pred details",
    text: "With raised text, the face sits 0.4 mm below a rim, as in gflabel. gflabel's 0.2 mm edge fillets are left out.",
  },
  {
    title: "Cullenect channels on 1U only",
    text: "As in gflabel, the snap-fit channels on the back are offered only on 1U Cullenect v2 labels. The legacy v1.1 label comes in one size, for 1U bins.",
  },
  {
    title: "Screw drawn as two views",
    text: "Like label.alch.shop, a screw is the drive seen from above next to a side view of the head, rather than gflabel's drive drawn on top of the bolt. Each fastener is one symbol with options, instead of many separate symbols.",
  },
  {
    title: "A label is a row of segments",
    text: "Text and symbols can come in any order. Segments marked Grow share the spare width; without any, the row is packed together with a fixed gap (1 mm by default). Each text has its own alignment, weight and letter height, and each symbol its own height, so small bold text can sit next to tall regular text.",
  },
  {
    title: "Flush text for multi-colour",
    text: "Flush text is inlaid level with the surface, so a 0.2 mm depth is one layer of a second colour. The app warns when letters shrink below about 4.4 mm, the smallest that prints cleanly with a 0.4 mm nozzle.",
  },
  {
    title: "One 3MF for all labels",
    text: "Each label is its own object, with the label, text and symbols as separate parts. Labels are laid out in rows like lines of text, from the back left, with a 5 mm gap and a 5 mm edge, centred on your printer's plate. A short label fills the gap at the end of an earlier row.",
  },
  {
    title: "More than one plate",
    text: "Labels that don't fit go on the next plate. For a Bambu Lab printer the download is a Bambu Studio project: every plate in one file, set up with the printer's system presets (0.4 nozzle, 0.20mm Standard, Bambu PLA Basic in each label colour) and the purge tower where the bed view shows it. Other slicers centre a 3MF that isn't their own project on the plate as a whole, so for other printers the download is a zip with one 3MF per plate, with no printer settings; a colour keeps the same filament slot in every file.",
  },
  {
    title: "Printers and plates",
    text: "Print areas and keep-clear zones (the purge corner on P1 and X1, the strips only one nozzle of an H2D, H2C or X2D reaches) come from the printer profiles in Bambu Studio and OrcaSlicer. Labels are kept clear of those zones. With more than one colour, the purge tower's default spot (Bambu Studio's x 165, y 250, or the left edge on A1 printers) is kept clear too. The plates in the bed view are drawn here rather than taken from the slicers, whose models are AGPL.",
  },
  {
    title: "Colours in Bambu Studio and OrcaSlicer",
    text: "These slicers ignore the colours in a standard 3MF, so the file also carries their own settings file with one filament slot per colour, shared by all labels.",
  },
  {
    title: "3D preview",
    text: "All labels are shown, the first one furthest back. The selected label is lifted 7 mm and the others spread 4.5 mm apart, so it stands out without the row getting too long.",
  },
];

function ResourceList({ items }: { items: Resource[] }) {
  return (
    <ul className="resources">
      {items.map((r) => (
        <li key={r.url}>
          <a href={r.url}>{r.name}</a>
          <span>{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

type Tab = "credits" | "choices";

/**
 * Credits and the reasons behind some design choices: two columns side by
 * side on wide screens, tabs on narrow ones.
 */
export function About() {
  const [tab, setTab] = useState<Tab>("credits");
  return (
    <div className="about">
      <article>
        <a className="back" href="#">
          ← Back to the label maker
        </a>
        <h1>About Gridfinity Labels</h1>
        <div className="about-tabs">
          <Segmented<Tab>
            value={tab}
            options={[
              { value: "credits", label: "Inspiration and reference" },
              { value: "choices", label: "Choices we made" },
            ]}
            onChange={setTab}
          />
        </div>
        <p>
          A browser-based label maker for Gridfinity bins: type your text, see the label in 3D, and download a file
          ready for multi-colour printing.
        </p>

        <div className="about-columns" data-tab={tab}>
          <section className="credits">
            <h2>Inspiration and reference</h2>
            <ResourceList items={INSPIRATION} />

            <h2>Label holders</h2>
            <ResourceList items={HOLDERS} />

            <h2>Built with</h2>
            <ResourceList items={LIBRARIES} />
          </section>

          <section className="choices">
            <h2>Choices we made</h2>
            <dl>
              {CHOICES.map((c) => (
                <div key={c.title}>
                  <dt>{c.title}</dt>
                  <dd>{c.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <p className="sub">
          Source code on <a href="https://github.com/vegar/gridfinity-label-maker">GitHub</a>.
        </p>
      </article>
    </div>
  );
}
