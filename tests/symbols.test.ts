import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { buildByKind } from "./parts";
import { loadManifold } from "../src/manifold";
import { buildLabel, DEFAULT_OPTIONS, symbolSegment, textSegment, type Segment } from "../src/label";
import { DRIVES, migrateSymbol, renderSymbol, SYMBOLS, type LabelSymbol } from "../src/symbols";

let wasm: ManifoldToplevel;
const fontData = readFileSync(new URL("../public/fonts/OpenSans-Regular.ttf", import.meta.url));
const font = opentype.parse(fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength));
const fonts = () => font;

beforeAll(async () => {
  wasm = await loadManifold();
});

/** Every symbol with every option that applies to it. */
function variants(): LabelSymbol[] {
  const out: LabelSymbol[] = [];
  for (const info of SYMBOLS) {
    out.push(info.defaults);
    for (const headShape of info.headShapes ?? []) out.push({ ...info.defaults, headShape });
    for (const m of info.modifiers ?? []) out.push({ ...info.defaults, [m]: true });
    if (info.drives) for (const d of DRIVES) out.push({ ...info.defaults, drives: [d.value] });
  }
  const screw = SYMBOLS[0].defaults;
  for (const style of ["regular", "cullenect"] as const) {
    for (const view of ["both", "drive", "side"] as const) {
      out.push({ ...screw, style, view }, { ...screw, style, view, hexHead: true }, { ...screw, style, view, flip: true });
      for (const headShape of SYMBOLS[0].headShapes!) out.push({ ...screw, style, view, headShape, partial: true });
    }
  }
  for (const nutType of ["regular", "lock", "square", "tnut"] as const) {
    for (const nutView of ["both", "top", "side"] as const) out.push({ kind: "nut", nutType, nutView });
  }
  return out;
}

describe("renderSymbol", () => {
  it.each(variants().map((v) => [JSON.stringify(v), v] as const))("draws %s", (_, sym) => {
    const shape = renderSymbol(wasm, sym, 8, 30);
    expect(shape.isEmpty()).toBe(false);
    const { min, max } = shape.bounds();
    // Only the Cullenect screw's side view is drawn taller than the row.
    const limit = sym.style === "cullenect" && sym.view !== "drive" ? 8 * 1.6 : 8;
    expect(max[1] - min[1]).toBeLessThanOrEqual(limit * 1.01);
    expect(max[1] - min[1]).toBeGreaterThan(2);
  });

  it("cuts a drive recess into a head", () => {
    const plain = renderSymbol(wasm, { kind: "screw", view: "drive" }, 8).area();
    const torx = renderSymbol(wasm, { kind: "screw", view: "drive", drives: ["torx"] }, 8).area();
    const secure = renderSymbol(wasm, { kind: "screw", view: "drive", drives: ["torx", "security"] }, 8).area();
    expect(torx).toBeLessThan(plain);
    expect(secure).toBeGreaterThan(torx);
  });

  it("draws a screw as a head view beside a separate side view", () => {
    const shape = renderSymbol(wasm, { kind: "screw", headShape: "countersunk", drives: ["phillips"] }, 8);
    const pieces = shape.decompose().map((p) => p.bounds());
    const head = pieces.filter((b) => b.max[0] <= 0);
    const side = pieces.filter((b) => b.min[0] >= 0);
    expect(head.length + side.length).toBe(pieces.length);
    expect(head.length).toBeGreaterThan(0);
    expect(side).toHaveLength(1);
    expect(side[0].max[0] - side[0].min[0]).toBeCloseTo(8 * 1.6, 3);
  });

  it("shows a Cullenect screw's drive in its head, and only when both are shown", () => {
    const area = (sym: LabelSymbol) => renderSymbol(wasm, sym, 8).area();
    const pieces = (sym: LabelSymbol) => renderSymbol(wasm, sym, 8).decompose().length;
    const side: LabelSymbol = { kind: "screw", style: "cullenect", view: "side", headShape: "socket" };
    expect(area({ ...side, drives: ["hex"] })).toBeCloseTo(area(side), 6);
    const both: LabelSymbol = { ...side, view: "both" };
    expect(area({ ...both, drives: ["hex"] })).toBeLessThan(area(both));
    expect(pieces({ ...both, drives: ["hex"] })).toBe(pieces({ ...side, drives: ["hex"] }));
    // A hex head is drawn beside the bolt.
    expect(pieces({ ...both, hexHead: true })).toBe(pieces(side) + 1);
  });

  it("mirrors a flipped screw", () => {
    const sym: LabelSymbol = { kind: "screw", headShape: "socket", drives: ["hex"] };
    const a = renderSymbol(wasm, sym, 8).bounds();
    const b = renderSymbol(wasm, { ...sym, flip: true }, 8).bounds();
    expect(b.min[0]).toBeCloseTo(-a.max[0], 6);
    expect(b.max[0]).toBeCloseTo(-a.min[0], 6);
  });

  it("turns old head, hex head and Cullenect bolt symbols into screws", () => {
    const old = (kind: string, rest: object = {}) => ({ kind, ...rest }) as unknown as LabelSymbol;
    expect(migrateSymbol(old("head", { drives: ["torx"] }))).toEqual({ kind: "screw", view: "drive", drives: ["torx"] });
    expect(migrateSymbol(old("hexhead", { drives: [] }))).toMatchObject({ view: "drive", hexHead: true });
    const bolt = migrateSymbol(old("cullbolt", { headShape: "socket", drives: ["hex"] }));
    expect(bolt).toMatchObject({ kind: "screw", style: "cullenect", view: "both", flip: true, drives: ["hex"] });
    expect(renderSymbol(wasm, bolt, 8).isEmpty()).toBe(false);
  });

  it("turns old nut symbols into nut types", () => {
    const old = (kind: string) => migrateSymbol({ kind } as unknown as LabelSymbol);
    expect(old("nutProfile")).toEqual({ kind: "nut", nutView: "side" });
    expect(old("locknutProfile")).toEqual({ kind: "nut", nutType: "lock", nutView: "side" });
    expect(old("squareNut")).toEqual({ kind: "nut", nutType: "square" });
    expect(old("tnut")).toEqual({ kind: "nut", nutType: "tnut" });
  });

  it("draws a bolt to length, and breaks it when it is too long", () => {
    const short = renderSymbol(wasm, { kind: "bolt", headShape: "socket", length: 12 }, 8, 40).bounds();
    expect(short.max[0] - short.min[0]).toBeCloseTo(12 + 8 / 2.25, 3);
    const long = renderSymbol(wasm, { kind: "bolt", headShape: "socket", length: 60 }, 8, 20);
    expect(long.bounds().max[0] - long.bounds().min[0]).toBeCloseTo(20, 3);
    expect(long.decompose()).toHaveLength(2);
  });
});

describe("labels with symbols", () => {
  const bolt = symbolSegment({ kind: "screw", style: "cullenect", view: "side", headShape: "socket", drives: ["hex"] });
  const text = textSegment;
  const label = (...segments: Segment[]) => ({ ...DEFAULT_OPTIONS, segments });

  const expectInside = (b: { min: number[]; max: number[] }, halfWidth = 18) => {
    expect(b.min[0]).toBeGreaterThanOrEqual(-halfWidth + 0.8 - 1e-3);
    expect(b.max[0]).toBeLessThanOrEqual(halfWidth - 0.8 + 1e-3);
    expect(b.min[1]).toBeGreaterThanOrEqual(-5.5 + 0.8 - 1e-3);
    expect(b.max[1]).toBeLessThanOrEqual(5.5 - 0.8 + 1e-3);
  };

  it("puts symbols and text side by side inside the margins, in order", () => {
    for (const segments of [[bolt, text("M3")], [text("M3"), bolt]]) {
      const { text: t, symbols } = buildByKind(wasm, fonts, label(...segments));
      const tb = t!.boundingBox();
      const sb = symbols!.boundingBox();
      expectInside(tb);
      expectInside(sb);
      if (segments[0] === bolt) expect(sb.max[0]).toBeLessThan(tb.min[0]);
      else expect(tb.max[0]).toBeLessThan(sb.min[0]);
    }
  });

  it("lays out any mix of text and symbols left to right", () => {
    const nut = symbolSegment({ kind: "nut" });
    const { text: t, symbols } = buildByKind(wasm, fonts, { ...label(text("M3"), bolt, text("12"), nut), units: 3 });
    expectInside(t!.boundingBox(), 60);
    expectInside(symbols!.boundingBox(), 60);
    // Text, bolt, text, nut: the text starts first, the nut ends last,
    // and the bolt sits inside the span of the text.
    const [tb, sb] = [t!.boundingBox(), symbols!.boundingBox()];
    expect(tb.min[0]).toBeLessThan(sb.min[0]);
    expect(tb.max[0]).toBeGreaterThan(sb.min[0]);
    expect(sb.max[0]).toBeGreaterThan(tb.max[0]);
  });

  it("packs the row together without growing segments, and spreads it with them", () => {
    const nut = symbolSegment({ kind: "nut" });
    const opts = { ...label(text("M3"), nut), units: 3, gap: 2 };
    const packed = buildByKind(wasm, fonts, opts);
    const [tb, sb] = [packed.text!.boundingBox(), packed.symbols!.boundingBox()];
    expect(sb.min[0] - tb.max[0]).toBeCloseTo(2, 1);
    expect(tb.min[0] + sb.max[0]).toBeCloseTo(0, 3);
    const left = buildByKind(wasm, fonts, { ...opts, align: "left" }).text!.boundingBox();
    expect(left.min[0]).toBeCloseTo(-60 + 0.8, 3);

    // A growing text takes the spare width: the nut goes to the right edge.
    const grown = buildByKind(wasm, fonts, { ...opts, segments: [{ ...text("M3"), grow: true }, nut] });
    expect(grown.symbols!.boundingBox().max[0]).toBeCloseTo(60 - 0.8, 3);
    // Two growing segments share it evenly.
    const both = buildByKind(wasm, fonts, { ...opts, segments: [{ ...text("M3"), grow: true }, { ...nut, grow: true }] });
    const nb = both.symbols!.boundingBox();
    expect(nb.max[0]).toBeLessThan(60 - 0.8 - 5);
    expect(nb.min[0]).toBeGreaterThan(both.text!.boundingBox().max[0] + 5);
  });

  it("sizes each segment on its own", () => {
    const nut = symbolSegment({ kind: "nut" });
    const small = { ...text("M3"), maxCapHeight: 3 };
    const big = { ...text("M3"), maxCapHeight: 6 };
    const opts = { ...label(small, { ...nut, size: 4 }, big, { ...nut, size: 8 }), units: 3 };
    const { text: t, symbols, capHeight, shrunk } = buildByKind(wasm, fonts, opts);
    const parts = (m: typeof t) => m!.decompose().map((p) => p.boundingBox()).sort((a, b) => a.min[0] - b.min[0]);
    const heights = parts(t).map((b) => b.max[1] - b.min[1]);
    // "M3" twice: the second pair of glyphs is twice as tall.
    expect(heights[2] / heights[0]).toBeCloseTo(2, 1);
    const nuts = parts(symbols).map((b) => b.max[0] - b.min[0]);
    expect(nuts[nuts.length - 1] / nuts[0]).toBeCloseTo(2, 1);
    expect(capHeight).toBeCloseTo(3, 3);
    expect(shrunk).toBe(false);
  });

  it("keeps text sizes in proportion when it has to shrink", () => {
    const small = { ...text("A long text"), maxCapHeight: 3 };
    const big = { ...text("Another long one"), maxCapHeight: 6 };
    const { text: t, capHeight, shrunk } = buildByKind(wasm, fonts, label(small, big));
    expectInside(t!.boundingBox());
    expect(capHeight!).toBeLessThan(3);
    expect(shrunk).toBe(true);
  });

  it("places a growing symbol in its share by its own alignment", () => {
    const nut = { ...symbolSegment({ kind: "nut" }), grow: true };
    const at = (align: "left" | "center" | "right") =>
      buildByKind(wasm, fonts, { ...label(text("M3"), { ...nut, align }), units: 3 }).symbols!.boundingBox();
    expect(at("right").max[0]).toBeCloseTo(60 - 0.8, 3);
    const tb = buildByKind(wasm, fonts, { ...label(text("M3"), nut), units: 3 }).text!.boundingBox();
    expect(at("left").min[0] - tb.max[0]).toBeCloseTo(1, 1);
    const c = at("center");
    expect((c.min[0] + c.max[0]) / 2).toBeCloseTo((tb.max[0] + 1 + 60 - 0.8) / 2, 1);
  });

  it("shrinks a row that is too long to fit", () => {
    const many = Array.from({ length: 12 }, () => bolt);
    const { symbols } = buildByKind(wasm, fonts, label(...many, text("M3 × 12")));
    expectInside(symbols!.boundingBox());
  });

  it("inlays symbols flush and keeps the total volume", () => {
    const empty = buildByKind(wasm, fonts, label());
    const { base, text: t, symbols } = buildByKind(wasm, fonts, label(bolt, text("M3")));
    const sb = symbols!.boundingBox();
    expect(sb.max[2]).toBeCloseTo(0, 3);
    expect(sb.min[2]).toBeCloseTo(-0.2, 3);
    expect(base.volume() + t!.volume() + symbols!.volume()).toBeCloseTo(empty.base.volume(), 2);
  });

  it("centers symbols when there is no text", () => {
    const { text: t, symbols } = buildByKind(wasm, fonts, label(bolt, text(" ")));
    expect(t).toBeUndefined();
    const sb = symbols!.boundingBox();
    expect(sb.min[0] + sb.max[0]).toBeCloseTo(0, 3);
  });

  it("gives a bolt the room the text leaves", () => {
    const opts = { ...label(text("M4"), symbolSegment({ kind: "bolt", length: 40 })), units: 3 };
    const sb = buildByKind(wasm, fonts, opts).symbols!.boundingBox();
    expect(sb.max[0] - sb.min[0]).toBeGreaterThan(40);
  });
});

describe("segment solids", () => {
  it("builds one solid per printed segment, in order, skipping empty text", () => {
    const opts = {
      ...DEFAULT_OPTIONS,
      units: 3,
      segments: [textSegment("M3"), symbolSegment({ kind: "nut" }), textSegment(" "), textSegment("12")] as Segment[],
    };
    const { segments } = buildLabel(wasm, fonts, opts);
    expect(segments.map((s) => [s.index, s.kind])).toEqual([
      [0, "text"],
      [1, "symbol"],
      [3, "text"],
    ]);
    // Left to right in segment order.
    const xs = segments.map((s) => s.manifold.boundingBox().min[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});
