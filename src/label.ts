import type { Font } from "opentype.js";
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { baseInfo, type BaseKind } from "./bases";
import { isVariableWidth, renderSymbol, type LabelSymbol } from "./symbols";
import { textBlock, type Align } from "./text";
import { DEFAULT_FONT, type FontFamily } from "./fonts";

export type LabelStyle = "embedded" | "raised";
export type Weight = "regular" | "bold";
/** Looks up a loaded font by family and weight. */
export type Fonts = (family: FontFamily, weight: Weight) => Font;

interface SegmentOptions {
  /** CSS hex colour for this segment. Unset uses the label's default text or symbol colour. */
  color?: string;
  /** Take a share of the spare width. Without any growing segments, the row is packed together. */
  grow?: boolean;
  /** Where the segment sits in its share when it grows. For text, also how its lines line up. */
  align: Align;
  /** Sit under the segment before it, in the same column, instead of beside it. */
  stack?: boolean;
}

/** A piece of text on the label. "\n" starts a new line within it. */
export interface TextSegment extends SegmentOptions {
  kind: "text";
  text: string;
  weight: Weight;
  /** Font for this text. Unset uses the label's default font. */
  font?: FontFamily;
  /** Largest capital-letter height, in mm. Text shrinks below this to fit. */
  maxCapHeight: number;
}

export type SymbolSegment = LabelSymbol &
  SegmentOptions & {
    /** Height in mm. The symbol shrinks below this to fit. */
    size: number;
  };

/** What goes on the label, left to right: text and symbols in any order, some stacked in columns. */
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
  return { kind: "text", text, align, weight, maxCapHeight, ...(like?.font ? { font: like.font } : {}) };
}

/** The font a text segment uses: its own, or the label's default. */
export function textFont(label: Pick<LabelOptions, "font">, segment: TextSegment): FontFamily {
  return segment.font ?? label.font ?? DEFAULT_FONT;
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
  /** Font for text segments that don't set their own. */
  font: FontFamily;
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
  font: DEFAULT_FONT,
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

type Item = { grow: boolean; index: number; column: number } & (
  | { text: true; segment: TextSegment; shape: CrossSection; maxCap: number }
  | { text: false; symbol: SymbolSegment; height: number }
);

/** Where an item lines up across its column, and where its column sits in its share of the row. */
function itemAlign(it: Item): Align {
  return it.text ? it.segment.align : it.symbol.align;
}

/**
 * Lay out the segments in a row across the label's face area. A segment
 * stacked under the one before it shares that segment's column, so a row is
 * a list of columns, each one or more segments high. Symbols keep their size
 * and the text fits in the rest, each text shrinking by the same factor so
 * their sizes stay in proportion. A column too tall for the label shrinks
 * as a whole. Spare width is shared by the growing columns, or left around
 * the row.
 */
function layoutFace(wasm: ManifoldToplevel, fonts: Fonts, opts: LabelOptions) {
  const area = baseInfo(opts.base).area(opts);
  const areaWidth = area.width - 2 * opts.margin;
  const areaHeight = area.height - 2 * opts.margin;
  const gap = Math.max(0, opts.gap);

  // Text at a cap height of 1 mm; empty text takes no room.
  const items: Item[] = [];
  let lastColumn = -1;
  opts.segments.forEach((seg, index) => {
    const grow = !!seg.grow;
    const column = seg.stack && items.length ? lastColumn : lastColumn + 1;
    if (!isText(seg)) items.push({ grow, index, column, text: false, symbol: seg, height: Math.min(seg.size, areaHeight) });
    else {
      const shape = textBlock(wasm, fonts(textFont(opts, seg), seg.weight), seg.text, seg.align);
      if (!shape) return;
      const maxCap = Math.min(seg.maxCapHeight, areaHeight / size(shape).height);
      items.push({ grow, index, column, text: true, segment: seg, shape, maxCap });
    }
    lastColumn = column;
  });
  if (items.length === 0) return { shapes: [] };

  const columns: number[][] = [];
  items.forEach((it, i) => (columns[it.column] ??= []).push(i));
  const hasText = columns.map((col) => col.some((i) => items[i].text));
  const texts = items.filter((it) => it.text);
  const symbols = items.filter((it) => !it.text);
  const gapWidth = gap * (columns.length - 1);
  const symbolGapWidth = gap * columns.slice(1).filter((_, c) => !hasText[c] && !hasText[c + 1]).length;
  /** The widest of `width(i)` in each column, added up. */
  const widest = (width: (i: number) => number) =>
    columns.reduce((w, col) => w + Math.max(0, ...col.map(width)), 0);

  // Every text at its largest size, side by side.
  const naturalText = widest((i) => {
    const it = items[i];
    return it.text ? it.maxCap * size(it.shape).width : 0;
  });

  // Bolts get whatever the text leaves at its full size, but never less
  // than a third of the label, so they don't collapse to a stub.
  const fixedWidth = widest((i) => {
    const it = items[i];
    return it.text || isVariableWidth(it.symbol) ? 0 : size(renderSymbol(wasm, it.symbol, it.height)).width;
  });
  const budget = texts.length
    ? Math.max(areaWidth - fixedWidth - gapWidth - naturalText, areaWidth / 3)
    : areaWidth - fixedWidth - gapWidth;
  const variableCount = columns.filter((col) =>
    col.some((i) => {
      const it = items[i];
      return !it.text && isVariableWidth(it.symbol);
    }),
  ).length;
  const each = variableCount ? budget / variableCount : 0;

  const rendered = items.map((it) => (it.text ? it.shape : centered(renderSymbol(wasm, it.symbol, it.height, each))));

  // Shrink columns that are too tall: a stack higher than the label, or a
  // symbol taller than its height (the Cullenect bolt is).
  const heightFit = items.map(() => 1);
  columns.forEach((col) => {
    const height = col.reduce((h, i) => {
      const it = items[i];
      return h + (it.text ? it.maxCap : 1) * size(rendered[i]).height;
    }, 0);
    const fit = Math.min(1, (areaHeight - gap * (col.length - 1)) / height);
    col.forEach((i) => (heightFit[i] = Math.max(0, fit)));
  });
  /** Scale of each item at full text size, before fitting the width. */
  const scale = items.map((it, i) => (it.text ? it.maxCap : 1) * heightFit[i]);

  // Shrink all symbols alike if they leave too little room for the text.
  const symbolWidth = widest((i) => (items[i].text ? 0 : size(rendered[i]).width * scale[i]));
  const symbolRoom = Math.max((texts.length ? areaWidth * 0.7 : areaWidth) - symbolGapWidth, areaWidth * 0.2);
  const widthFit = symbols.length && symbolWidth > 0 ? Math.min(1, symbolRoom / symbolWidth) : 1;

  // Then the largest text size that fits beside them, down to a floor.
  const rowAt = (textFit: number) =>
    gapWidth + widest((i) => size(rendered[i]).width * scale[i] * (items[i].text ? textFit : widthFit));
  let textFit = 1;
  if (texts.length && rowAt(1) > areaWidth) {
    const natural = widest((i) => (items[i].text ? size(rendered[i]).width * scale[i] : 0));
    let lo = Math.min(1, (areaWidth * 0.1) / natural);
    let hi = 1;
    if (rowAt(lo) < areaWidth) {
      for (let n = 0; n < 40; n++) {
        const mid = (lo + hi) / 2;
        if (rowAt(mid) > areaWidth) hi = mid;
        else lo = mid;
      }
    }
    textFit = lo;
  }
  const shapes = rendered.map((s, i) => s.scale(scale[i] * (items[i].text ? textFit : widthFit)));
  const sizes = shapes.map(size);

  // Stack each column's items top to bottom, centered on the label's middle,
  // each lined up across the column by its own alignment.
  const stacked = shapes.map((s) => s);
  const columnWidths = columns.map((col) => {
    const width = Math.max(...col.map((i) => sizes[i].width));
    const height = col.reduce((h, i) => h + sizes[i].height, 0) + gap * (col.length - 1);
    let y = height / 2;
    for (const i of col) {
      const align = items[i].text ? itemAlign(items[i]) : "center";
      const x = align === "left" ? 0 : align === "right" ? width - sizes[i].width : (width - sizes[i].width) / 2;
      stacked[i] = shapes[i].translate(x + sizes[i].width / 2 - width / 2, y - sizes[i].height / 2);
      y -= sizes[i].height + gap;
    }
    return width;
  });

  // Spare width goes to the growing columns, shared evenly; without any,
  // the row is packed together and placed by `align`.
  const total = columnWidths.reduce((a, b) => a + b, 0) + gapWidth;
  const spare = Math.max(0, areaWidth - total);
  const grows = columns.map((col) => col.some((i) => items[i].grow));
  const growing = grows.filter(Boolean).length;
  const share = growing ? spare / growing : 0;
  const rowWidth = growing ? Math.max(total, areaWidth) : total;
  let x =
    growing || opts.align === "center"
      ? -rowWidth / 2
      : opts.align === "left"
        ? -areaWidth / 2
        : areaWidth / 2 - rowWidth;

  const placed = [...stacked];
  columns.forEach((col, c) => {
    const extra = grows[c] ? share : 0;
    const align = itemAlign(items[col[0]]);
    const pad = align === "left" ? 0 : align === "right" ? extra : extra / 2;
    for (const i of col) placed[i] = stacked[i].translate(x + pad + columnWidths[c] / 2, 0);
    x += columnWidths[c] + extra + gap;
  });

  // Too many segments to fit: shrink the whole row, gaps and all.
  const overflow = Math.min(1, areaWidth / rowWidth);
  const faceShapes = placed.map((s, i) => ({ index: items[i].index, text: items[i].text, shape: s.scale(overflow) }));
  // The smallest letters on the label, to warn when they get hard to read.
  const caps = items.flatMap((it, i) => (it.text ? [{ seg: it.segment, cap: scale[i] * textFit * overflow }] : []));
  const capHeight = caps.length ? Math.min(...caps.map((c) => c.cap)) : undefined;
  const shrunk = caps.some((c) => c.cap < c.seg.maxCapHeight - 1e-3);
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
