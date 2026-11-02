import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { baseInfo } from "./bases";
import type { Manifold } from "manifold-3d";
import { export3mf, toStlZip, type ExportObject, type ExportPart } from "./export";
import { maxEmbeddedDepth, type LabelParts } from "./label";
import type { Engine } from "./useEngine";
import { fileName, loadSession, segmentColor, saveSession, updateLabel, type LabelState, type Session } from "./state";
import { useEngine } from "./useEngine";
import { useLabels } from "./useLabels";
import { MIN_LEGIBLE_CAP_HEIGHT } from "./components/labelOps";
import { PreviewCanvas } from "./components/PreviewCanvas";
import type { PreviewLabel, RowLayout } from "./preview";
import { SidebarResizer, useSidebarWidth } from "./components/SidebarResizer";
import { About } from "./components/About";
import { Features } from "./components/Features";
import { PrinterPicker, usePrinter } from "./components/PrinterPicker";
import { Segmented } from "./components/Segmented";
import { bambuPresets, bedOf, bounds, footprint, packPlates, plateCount, printerName, tooLarge } from "./bed";
import { Sidebar } from "./sidebar/Sidebar";
import { trackDownload, trackHashPage } from "./analytics";

/** The URL hash, kept in sync so links like #about can switch pages. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      trackHashPage(location.hash);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function download(data: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The parts to export for one label: the body, then one part per kind and
 * colour, so segments that print alike stay together. Parts named "text" and
 * "symbols" hold the segments in the label's default colours.
 */
function exportParts(engine: Engine, label: LabelState, built: LabelParts): { parts: ExportPart[]; made: Manifold[] } {
  const groups = new Map<string, { name: string; color: string; manifolds: Manifold[] }>();
  for (const solid of built.segments) {
    const color = segmentColor(label, label.segments[solid.index]);
    const kindName = solid.kind === "text" ? "text" : "symbols";
    const isDefault = color === (solid.kind === "text" ? label.textColor : label.symbolColor);
    const name = isDefault ? kindName : `${kindName}-${color.replace("#", "").toLowerCase()}`;
    const group = groups.get(name) ?? { name, color, manifolds: [] };
    group.manifolds.push(solid.manifold);
    groups.set(name, group);
  }
  // Default-coloured groups first, so the usual parts keep their usual order.
  const ordered = [...groups.values()].sort((a, b) => Number(a.name.includes("-")) - Number(b.name.includes("-")));
  const made: Manifold[] = [];
  const parts: ExportPart[] = [{ name: "label", manifold: built.base, color: label.baseColor }];
  for (const g of ordered) {
    let manifold = g.manifolds[0];
    if (g.manifolds.length > 1) made.push((manifold = engine.wasm.Manifold.compose(g.manifolds)));
    parts.push({ name: g.name, manifold, color: g.color });
  }
  return { parts, made };
}

export function App() {
  const [session, setSession] = useState<Session>(loadSession);
  useEffect(() => saveSession(session), [session]);
  const state = session.labels.find((l) => l.id === session.selected) ?? session.labels[0];
  const update = (patch: Partial<LabelState>) => setSession((s) => updateLabel(s, state.id, patch));

  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  // The about and features pages cover the app instead of replacing it, so the preview keeps its camera.
  const hash = useHash();
  const showAbout = hash === "#about";
  const showFeatures = hash === "#features";

  const { engine, error: engineError } = useEngine();
  const builds = useLabels(engine, session.labels);
  const { parts, error: buildError, ms } = builds.get(state.id) ?? {};

  // Prototype: how far the selected label stands out from the others in the preview.
  const [layout, setLayout] = useState<RowLayout>({ lift: 7, spread: 4.5 });
  const previewLabels = useMemo<PreviewLabel[]>(
    () =>
      session.labels.map((label) => {
        const built = builds.get(label.id)?.parts;
        return {
          id: label.id,
          ...baseInfo(label.base).size(label.units),
          parts: built
            ? [
                { manifold: built.base, color: label.baseColor },
                ...built.segments.map((s) => ({
                  manifold: s.manifold,
                  color: segmentColor(label, label.segments[s.index]),
                })),
              ]
            : [],
        };
      }),
    [session.labels, builds],
  );

  // The printer's bed, to lay the labels out on in the preview and the 3MF.
  const [printer, setPrinter] = usePrinter();
  // Each colour gets its own filament, so more than one means a purge tower.
  const colours = new Set(
    session.labels.flatMap((l) =>
      [l.baseColor, ...l.segments.map((s) => segmentColor(l, s))].map((c) => c.toLowerCase()),
    ),
  );
  const multiColour = colours.size > 1;
  const bed = useMemo(
    () => bedOf(printer, multiColour),
    [printer.id, printer.custom.width, printer.custom.depth, multiColour],
  );
  const [view, setView] = useState<"row" | "bed">("row");
  const footprints = useMemo(
    () =>
      previewLabels.map((l) =>
        l.parts.length ? footprint(bounds(l.parts.map((p) => p.manifold))) : { width: l.width, depth: l.height },
      ),
    [previewLabels],
  );
  const plates = plateCount(packPlates(footprints, bed));
  const oversized = footprints.filter((f) => tooLarge(f, bed)).length;

  // Flush text over the snap-fit channels can only go so deep.
  const maxDepth = state.style === "embedded" ? maxEmbeddedDepth(state) : 1;
  const textDepth = Math.min(state.textDepth, maxDepth);
  useEffect(() => {
    if (state.textDepth > maxDepth) update({ textDepth: maxDepth });
  }, [state.textDepth, maxDepth]);

  // Only warn about text the layout made smaller; small text on purpose is fine.
  const shrunk = !!parts?.shrunk && parts.capHeight! < MIN_LEGIBLE_CAP_HEIGHT;
  const status = engineError
    ? `Could not load the label engine: ${engineError}`
    : buildError
      ? `Could not build this label: ${buildError}`
      : !parts
        ? "Loading…"
        : parts.capHeight
          ? `Smallest letters ${parts.capHeight.toFixed(1)} mm · built in ${ms} ms`
          : parts.segments.length
            ? `Built in ${ms} ms`
            : "No text yet";

  // Every label goes into the export, so wait until all of them are built.
  const withExportObjects = (write: (objects: ExportObject[]) => void) => {
    const made: Manifold[] = [];
    try {
      write(
        session.labels.map((label) => {
          const built = exportParts(engine!, label, builds.get(label.id)!.parts!);
          made.push(...built.made);
          return { name: fileName(label), parts: built.parts };
        }),
      );
    } finally {
      made.forEach((m) => m.delete());
    }
  };
  const canExport = !!engine && session.labels.every((label) => builds.get(label.id)?.parts);
  const count = session.labels.length;
  const exportName = count === 1 ? fileName(state) : `labels-${count}`;
  const labelCount = count === 1 ? "" : plates === 1 ? ` (${count} labels)` : ` (${count} labels, ${plates} plates)`;

  const exportButtons = (
    <>
      <PrinterPicker
        choice={printer}
        onChange={(choice) => {
          setPrinter(choice);
          setView("bed");
        }}
        plates={plates}
        project={!!bambuPresets(printer)}
        tooLarge={oversized}
      />
      <button
        type="button"
        className="primary"
        disabled={!canExport}
        onClick={() =>
          withExportObjects((objects) => {
            const file = export3mf(exportName, objects, bed, bambuPresets(printer));
            download(file.data, file.filename, file.type);
            trackDownload("3mf", count);
          })
        }
      >
        Download 3MF{labelCount}
      </button>
      <button
        type="button"
        disabled={!canExport}
        onClick={() =>
          withExportObjects((objects) => {
            download(toStlZip(objects), `${exportName}-stl.zip`, "application/zip");
            trackDownload("stl", count);
          })
        }
      >
        STL (zip)
      </button>
    </>
  );

  return (
    <main className="app" style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <aside className="panel">
        <header>
          <h1>Gridfinity Labels</h1>
          <p className="sub">Cullenect and pred labels, ready for multi-colour printing.</p>
        </header>

        <Sidebar
          session={session}
          setSession={setSession}
          state={state}
          update={update}
          engine={engine}
          builds={builds}
          textDepth={textDepth}
          maxDepth={maxDepth}
          shrunk={shrunk}
          exportButtons={exportButtons}
        />

        <footer>
          Label geometry from <a href="https://github.com/ndevenish/gflabel">gflabel</a> (BSD-3). Cullenect system by{" "}
          <a href="https://makerworld.com/en/models/446624">Cullen J Webb</a>, pred labels by{" "}
          <a href="https://www.printables.com/model/592545">pred</a>. <a href="#features">Features</a> · <a href="#about">About</a>
        </footer>
      </aside>
      <SidebarResizer width={sidebarWidth} onChange={setSidebarWidth} />
      <section className="viewer">
        <PreviewCanvas
          labels={previewLabels}
          selected={state.id}
          layout={layout}
          bed={view === "bed" ? bed : null}
          onSelect={(id) => setSession((s) => ({ ...s, selected: id }))}
        />
        <div className="status">
          <div className="row-controls">
            <Segmented
              value={view}
              options={[
                { value: "row", label: "Labels" },
                { value: "bed", label: "Print bed" },
              ]}
              onChange={setView}
            />
            <div className="row-sliders">
              <label>
                <span>
                  Lift selected <output>{layout.lift.toFixed(1)} mm</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={layout.lift}
                  onChange={(e) => setLayout((l) => ({ ...l, lift: Number(e.target.value) }))}
                />
              </label>
              {view === "row" && (
                <label>
                  <span>
                    Spread others <output>{layout.spread.toFixed(1)} mm</output>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={0.5}
                    value={layout.spread}
                    onChange={(e) => setLayout((l) => ({ ...l, spread: Number(e.target.value) }))}
                  />
                </label>
              )}
            </div>
          </div>
          <div>
            {view === "bed" && `${plates === 1 ? "1 plate" : `${plates} plates`} on ${printerName(printer)} · `}
            {status}
          </div>
        </div>
      </section>
      {showAbout && <About />}
      {showFeatures && <Features />}
    </main>
  );
}
