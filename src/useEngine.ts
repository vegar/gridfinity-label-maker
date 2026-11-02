import { useEffect, useMemo, useRef, useState } from "react";
import opentype, { type Font } from "opentype.js";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "./manifold";
import { isText, textFont, type Fonts, type LabelOptions, type Weight } from "./label";
import { DEFAULT_FONT, fontFile, fontKey, type FontFamily } from "./fonts";

export interface Engine {
  wasm: ManifoldToplevel;
  fonts: Fonts;
  /** Whether every font the label's text uses has loaded. */
  hasFonts: (label: LabelOptions) => boolean;
}

export type EngineStatus = { engine: Engine; error?: undefined } | { engine?: undefined; error?: string };

async function loadFont(family: FontFamily, weight: Weight): Promise<Font> {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${fontFile(family, weight)}`);
  if (!res.ok) throw new Error(`${fontFile(family, weight)}: ${res.status}`);
  return opentype.parse(await res.arrayBuffer());
}

/** The fonts a label's text uses, as family and weight. */
function labelFonts(label: LabelOptions): [FontFamily, Weight][] {
  return label.segments.filter(isText).map((seg) => [textFont(label, seg), seg.weight]);
}

/**
 * Load the geometry kernel and Open Sans once, and any other font the labels
 * use the first time one does, so only the fonts in use are downloaded.
 */
export function useEngine(labels: LabelOptions[]): EngineStatus {
  const [wasm, setWasm] = useState<ManifoldToplevel>();
  const [fonts, setFonts] = useState(() => new Map<string, Font>());
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    loadManifold(wasmUrl)
      .then((w) => !cancelled && setWasm(w))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Every family and weight in use, plus the default, which the engine waits for.
  const wanted = new Set([fontKey(DEFAULT_FONT, "regular"), fontKey(DEFAULT_FONT, "bold")]);
  const wantedFonts: [FontFamily, Weight][] = [
    [DEFAULT_FONT, "regular"],
    [DEFAULT_FONT, "bold"],
    ...labels.flatMap(labelFonts),
  ];
  for (const [family, weight] of wantedFonts) wanted.add(fontKey(family, weight));
  const wantedKey = [...wanted].sort().join(",");

  // Fonts asked for so far; each is fetched once.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const [family, weight] of wantedFonts) {
      const key = fontKey(family, weight);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      loadFont(family, weight)
        .then((font) => setFonts((old) => new Map(old).set(key, font)))
        .catch((err) => {
          requested.current.delete(key);
          setError(String(err));
        });
    }
    // wantedKey names everything in wantedFonts.
  }, [wantedKey]);

  const engine = useMemo((): Engine | undefined => {
    const ready = fonts.has(fontKey(DEFAULT_FONT, "regular")) && fonts.has(fontKey(DEFAULT_FONT, "bold"));
    if (!wasm || !ready) return undefined;
    return {
      wasm,
      fonts: (family, weight) => {
        const font = fonts.get(fontKey(family, weight));
        if (!font) throw new Error(`Font ${family} ${weight} has not loaded yet`);
        return font;
      },
      hasFonts: (label) => labelFonts(label).every(([family, weight]) => fonts.has(fontKey(family, weight))),
    };
  }, [wasm, fonts]);

  if (error) return { error };
  return engine ? { engine } : {};
}
