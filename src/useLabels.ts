import { useEffect, useMemo, useRef } from "react";
import { buildLabel, type LabelParts } from "./label";
import type { LabelState } from "./state";
import type { Engine } from "./useEngine";

export interface BuildResult {
  parts?: LabelParts;
  error?: string;
  ms?: number;
}

interface Built {
  /** The geometry inputs the parts were built from. */
  key: string;
  result: BuildResult;
}

/** Everything that changes a label's geometry. Colours and the id don't. */
function geometryKey(state: LabelState, models: string): string {
  const { base, units, ribs, font, align, gap, margin, style, textDepth, model } = state;
  const segments = state.segments.map(({ color, ...rest }) => rest);
  // An uploaded model can arrive, go or be turned over after the label was built.
  const loaded = base === "custom" ? models : "";
  return JSON.stringify([base, units, ribs, font, segments, align, gap, margin, style, textDepth, model, loaded]);
}

function build(engine: Engine, state: LabelState): BuildResult {
  const started = performance.now();
  try {
    const parts = buildLabel(engine.wasm, engine.fonts, state);
    return { parts, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { error: String(err) };
  }
}

function free(parts: LabelParts | undefined) {
  parts?.base.delete();
  parts?.segments.forEach((s) => s.manifold.delete());
}

/**
 * Build the geometry of every label, keyed by label id. Only labels whose
 * geometry inputs changed are rebuilt, so editing one label stays fast.
 * `models` names the uploaded models that are loaded, and how they're turned.
 */
export function useLabels(engine: Engine | undefined, labels: LabelState[], models = ""): Map<string, BuildResult> {
  // The latest builds, reused across renders (and across StrictMode's double
  // render, so that doesn't build twice).
  const cache = useRef(new Map<string, Built>());

  const results = useMemo(() => {
    const next = new Map<string, Built>();
    if (engine) {
      for (const label of labels) {
        // Fonts load on first use; build the label once its fonts are in.
        if (!engine.hasFonts(label)) {
          // Keep showing the last build meanwhile; an empty key rebuilds it next time.
          const cached = cache.current.get(label.id);
          next.set(label.id, { key: "", result: cached?.result ?? {} });
          continue;
        }
        const key = geometryKey(label, models);
        const cached = cache.current.get(label.id);
        next.set(label.id, cached?.key === key ? cached : { key, result: build(engine, label) });
      }
    }
    cache.current = next;
    return new Map([...next].map(([id, built]) => [id, built.result]));
  }, [engine, labels, models]);

  // Manifolds live in WASM memory and must be freed by hand. Free builds that
  // were replaced once the new ones are committed, so nothing still renders them.
  const committed = useRef(new Map<string, BuildResult>());
  useEffect(() => {
    const live = new Set([...results.values()].map((r) => r.parts));
    for (const old of committed.current.values()) {
      if (!live.has(old.parts)) free(old.parts);
    }
    committed.current = results;
  }, [results]);

  return results;
}
