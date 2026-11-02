import type { Font } from "opentype.js";
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { baseInfo, type BaseKind } from "./bases";
import { isVariableWidth, renderSymbol, type LabelSymbol } from "./symbols";
import { textBlock, type Align } from "./text";

export type LabelStyle = "embedded" | "raised";
export type Weight = "regular" | "bold";
export type Fonts = Record<Weight, Font>;

interface SegmentOptions {
  /** CSS hex colour for this segment. Unset uses the label's default text or symbol colour. */
  color?: string;
  /** Take a share of the spare width. Without any growing segments, the row is packed together. */
  grow?: boolean;
  /** Where the segment sits in its share when it grows. For text, also how its lines line up. */
  align: Align;
}

/** A piece of text on the label. "\n" starts a new line within it. */
export interface TextSegment extends SegmentOptions {
  kind: "text";
  text: string;
  weight: Weight;
  /** Largest capital-letter height, in mm. Text shrinks below this to fit. */
  maxCapHeight: number;
}

export type SymbolSegment = LabelSymbol &
  SegmentOptions & {
    /** Height in mm. The symbol shrinks below this to fit. */
    size: number;
  };

/** What goes on the label, left to right: text and symbols in any order. */
export type Segment = TextSegment | SymbolSegment;

export const TEXT_DEFAULTS = { align: "center", weight: "bold", maxCapHeight: 6 } as const satisfies Partial<TextSegment>;
export const SYMBOL_SIZE = 7;

/** A symbol segment, sized and aligned like `like` if given. */
export function symbolSegment(symbol: LabelSymbol, like?: SymbolSegment): SymbolSegment {
  return { ...symbol, align: like?.align ?? "center", size: like?.size ?? SYMBOL_SIZE };
}

/** A text segment, styled like `like` if given. */
export function textSegment(text: string, like?: TextSegment): TextSegment {
  const { align, weight, maxCapHeight } = like ?? TEXT_DEFAULTS;
  return { kind: "text", text, align, weight, maxCapHeight };
}

export function isText(segment: Segment): segment is TextSegment {
  return segment.kind === "text";
}

export interface LabelOptions {
  base: BaseKind;
  units: number;
  /** For an uploaded holder model: the SHA-256 of its file. */
  model?: string;
  ribs: boolean;
  segments: Segment[];
  /** Where the row sits on the label when nothing grows. */
  align: Align;
  /** Space between segments, in mm. */
  gap: number;
  margin: number;
  style: LabelStyle;
  /** Depth of embedded text, or height of raised text, in mm. */
  textDepth: number;
}

export const DEFAULT_OPTIONS: LabelOptions = {
  base: "cullenect",
  units: 1,
  ribs: true,
  segments: [textSegment("M3 × 12")],
  align: "center",
  gap: 1,
  margin: 0.8,
  style: "embedded",
  textDepth: 0.2,
};

/** Deepest flush text that still leaves material over the snap-fit channels or below the face. */
export function maxEmbeddedDepth(opts: Pick<LabelOptions, "base" | "units" | "ribs" | "model">): number {
  return baseInfo(opts.base).maxEmbeddedDepth({ ...opts, raised: false });
}

/** The solid of one segment, so each can get its own colour. */
export interface SegmentSolid {
  /** Index into the label's segments. */
  index: number;
  kind: "text" | "symbol";
  manifold: Manifold;
}

export interface LabelParts {
  base: Manifold;
  /** One per segment with something to print, in segment order. */
  segments: SegmentSolid[];
  /** Height of the smallest capital letters on the label, in mm. */
  capHeight?: number;
  /** True when text came out smaller than its max letter height, to fit. */
  shrunk?: boolean;
}

function size(shape: CrossSection): { width: number; height: number } {
  const { min, max } = shape.bounds();
  return { width: max[0] - min[0], height: max[1] - min[1] };
}

/** Center a shape on the origin. */
function centered(shape: CrossSection): CrossSection {
  const { min, max } = shape.bounds();
  return shape.translate(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2);
}

type Item = { grow: boolean; index: number } & (
  | { text: true; segment: TextSegment; shape: CrossSection; maxCap: number }
  | { text: false; symbol: SymbolSegment; height: number }
);

/**
 * Lay out the segments in a row across the label's face area. Symbols keep
 * their size and the text fits in the rest, each text shrinking by the same
 * factor so their sizes stay in proportion. Spare width is shared by the
 * growing segments, or left around the row.
 */
function layoutFace(wasm: ManifoldToplevel, fonts: Fonts, opts: LabelOptions) {
  const area = baseInfo(opts.base).area(opts);
  const areaWidth = area.width - 2 * opts.margin;
  const areaHeight = area.height - 2 * opts.margin;

  // Text at a cap height of 1 mm; empty text takes no room.
  const items: Item[] = [];
  opts.segments.forEach((seg, index) => {
    const grow = !!seg.grow;
    if (!isText(seg)) items.push({ grow, index, text: false, symbol: seg, height: Math.min(seg.size, areaHeight) });
    else {
      const shape = textBlock(wasm, fonts[seg.weight], seg.text, seg.align);
      if (shape) {
        const maxCap = Math.min(seg.maxCapHeight, areaHeight / size(shape).height);
        items.push({ grow, index, text: true, segment: seg, shape, maxCap });
      }
    }
  });
  if (items.length === 0) return { shapes: [] };

  const texts = items.filter((it) => it.text);
  const symbols = items.filter((it) => !it.text);
  const gap = Math.max(0, opts.gap);
  const gapWidth = gap * (items.length - 1);
  const symbolGapWidth = gap * items.slice(1).filter((it, i) => !it.text && !items[i].text).length;

  // Every text at its largest size, side by side.
  const naturalText = texts.reduce((w, it) => w + it.maxCap * size(it.shape).width, 0);

  // Bolts get whatever the text leaves at its full size, but never less
  // than a third of the label, so they don't collapse to a stub.
  const fixedWidth = symbols
    .filter((it) => !isVariableWidth(it.symbol))
    .reduce((w, it) => w + size(renderSymbol(wasm, it.symbol, it.height)).width, 0);
  const budget = texts.length
    ? Math.max(areaWidth - fixedWidth - gapWidth - naturalText, areaWidth / 3)
    : areaWidth - fixedWidth - gapWidth;
  const variableCount = symbols.filter((it) => isVariableWidth(it.symbol)).length;
  const each = variableCount ? budget / variableCount : 0;

  // Shrink symbols that are too tall (the Cullenect bolt is taller than its
  // height), then all symbols alike if they leave too little room for the text.
  const rendered = items.map((it) => (it.text ? it.shape : centered(renderSymbol(wasm, it.symbol, it.height, each))));
  const tallFit = rendered.map((s, i) => (items[i].text ? 1 : Math.min(1, areaHeight / size(s).height)));
  const symbolWidth = rendered.reduce((w, s, i) => w + (items[i].text ? 0 : size(s).width * tallFit[i]), 0);
  const symbolRoom = Math.max((texts.length ? areaWidth * 0.7 : areaWidth) - symbolGapWidth, areaWidth * 0.2);
  const widthFit = symbols.length ? Math.min(1, symbolRoom / symbolWidth) : 1;

  const textRoom = Math.max(areaWidth - symbolWidth * widthFit - gapWidth, areaWidth * 0.1);
  const textFit = texts.length ? Math.min(1, textRoom / naturalText) : 1;
  const shapes = rendered.map((s, i) => {
    const it = items[i];
    return s.scale(it.text ? it.maxCap * textFit : tallFit[i] * widthFit);
  });

  // Spare width goes to the growing segments, shared evenly; without any,
  // the row is packed together and placed by `align`.
  const widths = shapes.map((s) => size(s).width);
  const total = widths.reduce((a, b) => a + b, 0) + gapWidth;
  const spare = Math.max(0, areaWidth - total);
  const growing = items.filter((it) => it.grow).length;
  const share = growing ? spare / growing : 0;
  const rowWidth = growing ? Math.max(total, areaWidth) : total;
  let x =
    growing || opts.align === "center"
      ? -rowWidth / 2
      : opts.align === "left"
        ? -areaWidth / 2
        : areaWidth / 2 - rowWidth;

  const placed = shapes.map((s, i) => {
    const it = items[i];
    const extra = it.grow ? share : 0;
    const align = it.text ? it.segment.align : it.symbol.align;
    const pad = align === "left" ? 0 : align === "right" ? extra : extra / 2;
    const out = s.translate(x + pad + widths[i] / 2, 0);
    x += widths[i] + extra + gap;
    return out;
  });

  // Too many segments to fit: shrink the whole row, gaps and all.
  const overflow = Math.min(1, areaWidth / rowWidth);
  const faceShapes = placed.map((s, i) => ({ index: items[i].index, text: items[i].text, shape: s.scale(overflow) }));
  // The smallest letters on the label, to warn when they get hard to read.
  const capHeight = texts.length ? Math.min(...texts.map((it) => it.maxCap)) * textFit * overflow : undefined;
  const shrunk = texts.some((it) => it.maxCap * textFit * overflow < it.segment.maxCapHeight - 1e-3);
  return { shapes: faceShapes, capHeight, shrunk };
}

/**
 * Build the label as separate solids (the body and one per segment), so they
 * can be given different colours in the preview and in the exported 3MF.
 */
export function buildLabel(wasm: ManifoldToplevel, fonts: Fonts, opts: LabelOptions): LabelParts {
  let base = baseInfo(opts.base).body(wasm, { ...opts, raised: opts.style === "raised" });
  const face = layoutFace(wasm, fonts, opts);

  const depth = opts.style === "embedded" ? Math.min(opts.textDepth, maxEmbeddedDepth(opts)) : opts.textDepth;
  // Flush: cut the shapes out of the base and fill the holes. Raised: stand them on the face.
  const segments: SegmentSolid[] = face.shapes
    .filter(({ shape }) => !shape.isEmpty())
    .map(({ index, text, shape }) => {
      const extruded = shape.extrude(depth);
      const manifold = opts.style === "raised" ? extruded : extruded.translate(0, 0, -depth);
      return { index, kind: text ? "text" : "symbol", manifold };
    });
  if (opts.style === "embedded" && segments.length) {
    base = base.subtract(wasm.Manifold.union(segments.map((s) => s.manifold)));
  }
  return { base, segments, capHeight: face.capHeight, shrunk: face.shrunk };
}
