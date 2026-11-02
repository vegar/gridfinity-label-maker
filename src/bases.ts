import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { cullenectBody, cullenectLegacyBody, HEIGHT, LEGACY_WIDTH, widthForUnits } from "./cullenect";
import { PRED_DEPTH, PRED_HEIGHT, predArea, predBody, predWidthForUnits } from "./pred";
import { getModel, modelBody } from "./model";

/** The label holder the label is made for. */
export type BaseKind = "cullenect" | "cullenect-legacy" | "pred" | "custom";

export const BASE_KINDS: BaseKind[] = ["cullenect", "cullenect-legacy", "pred", "custom"];

export interface BaseOptions {
  base: BaseKind;
  units: number;
  /** Snap-fit channels on a 1U Cullenect v2 label. */
  ribs: boolean;
  /** Raised text gets a recessed face on bases that have one (pred). */
  raised: boolean;
  /** The uploaded model a "custom" label is made from, by its hash. */
  model?: string;
}

/** What a holder's size depends on. */
export type SizeOptions = Pick<BaseOptions, "units" | "model">;

interface Size {
  width: number;
  height: number;
}

interface BaseInfo {
  name: string;
  /** Only made in one width, whatever the bin. */
  oneSize: boolean;
  size(opts: SizeOptions): Size;
  /** The part of the face text and symbols may use, before margins. */
  area(opts: SizeOptions): Size;
  /** Deepest flush text that leaves material over anything cut in the back. */
  maxEmbeddedDepth(opts: BaseOptions): number;
  body(wasm: ManifoldToplevel, opts: BaseOptions): Manifold;
}

const cullenect: BaseInfo = {
  name: "Cullenect",
  oneSize: false,
  size: ({ units }) => ({ width: widthForUnits(units), height: HEIGHT }),
  area: ({ units }) => ({ width: widthForUnits(units), height: HEIGHT }),
  // The channels' ceiling is 0.4 mm below the face.
  maxEmbeddedDepth: (opts) => (opts.ribs && opts.units === 1 ? 0.3 : 0.8),
  body: (wasm, opts) => cullenectBody(wasm, { units: opts.units, ribs: opts.ribs }),
};

const cullenectLegacy: BaseInfo = {
  name: "Cullenect legacy",
  oneSize: true,
  size: () => ({ width: LEGACY_WIDTH, height: HEIGHT }),
  area: () => ({ width: LEGACY_WIDTH, height: HEIGHT }),
  maxEmbeddedDepth: () => 0.3,
  body: (wasm) => cullenectLegacyBody(wasm),
};

const pred: BaseInfo = {
  name: "Pred",
  oneSize: false,
  size: ({ units }) => ({ width: predWidthForUnits(units), height: PRED_HEIGHT }),
  area: ({ units }) => predArea(units),
  maxEmbeddedDepth: () => PRED_DEPTH - 0.2,
  body: (wasm, opts) => predBody(wasm, { units: opts.units, recessed: opts.raised }),
};

/** Stand-in size until the uploaded model is loaded. */
const NO_MODEL: Size = { width: 36, height: 11 };

/**
 * A label the user uploads, for holders we don't draw ourselves, such as
 * USSA's Vault. Only known files are accepted (see knownModels.ts), and
 * they're only used in the user's browser, never shipped with the site.
 */
const custom: BaseInfo = {
  name: "Upload a label file",
  oneSize: true,
  size: ({ model }) => {
    const m = getModel(model);
    return m ? { width: m.width, height: m.height } : NO_MODEL;
  },
  area: ({ model }) => getModel(model)?.face ?? NO_MODEL,
  // The back may have clips or slots we know nothing about; stay in the front half.
  maxEmbeddedDepth: (opts) => Math.max(0.2, Math.min(1, (getModel(opts.model)?.depth ?? 0.4) / 2)),
  body: (wasm, opts) => {
    const m = getModel(opts.model);
    if (!m) throw new Error(opts.model ? "upload the label model again; this browser doesn't have it" : "upload a label model first");
    return modelBody(wasm, m);
  },
};

const BASES: Record<BaseKind, BaseInfo> = {
  cullenect,
  "cullenect-legacy": cullenectLegacy,
  pred,
  custom,
};

export function baseInfo(kind: BaseKind): BaseInfo {
  return BASES[kind] ?? cullenect;
}

export function isBaseKind(value: unknown): value is BaseKind {
  return BASE_KINDS.includes(value as BaseKind);
}
