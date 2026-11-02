import { describe, expect, it } from "vitest";
import {
  addLabel,
  blankLabel,
  cloneLabel,
  DEFAULT_STATE,
  fileName,
  labelTitle,
  parseSession,
  removeLabel,
  segmentColor,
  updateLabel,
  type LabelState,
  type Session,
} from "../src/state";
import { symbolSegment, textSegment } from "../src/label";
import type { LabelSymbol } from "../src/symbols";

const text = (t: string) => textSegment(t);
const nut = symbolSegment({ kind: "nut" });
const texts = (l: LabelState) => l.segments.filter((s) => s.kind === "text").map((s) => (s as { text: string }).text);
const label = (id: string, patch: Partial<LabelState> = {}): LabelState => ({ ...DEFAULT_STATE, id, ...patch });
const session = (...ids: string[]): Session => ({ labels: ids.map((id) => label(id)), selected: ids[0] });

describe("parseSession", () => {
  it("starts with one default label", () => {
    const s = parseSession(null, null);
    expect(s.labels).toHaveLength(1);
    expect(s.selected).toBe(s.labels[0].id);
    expect(s.labels[0].segments).toEqual(DEFAULT_STATE.segments);
  });

  it("migrates the single label saved by earlier versions", () => {
    const s = parseSession(null, JSON.stringify({ text: "M4", units: 2 }));
    expect(s.labels).toHaveLength(1);
    expect(s.labels[0]).toMatchObject({ units: 2 });
    expect(s.labels[0].segments.at(-1)).toMatchObject({ weight: "bold", maxCapHeight: 6, align: "center" });
    expect(texts(s.labels[0])).toEqual(["M4"]);
    expect(s.labels[0].id).toBeTruthy();
  });

  it("restores saved labels and the selection", () => {
    const saved = JSON.stringify({ labels: [{ id: "a", segments: [text("A")] }, { id: "b", segments: [text("B")] }], selected: "b" });
    const s = parseSession(saved, JSON.stringify({ text: "old" }));
    expect(s.labels.map(texts)).toEqual([["A"], ["B"]]);
    expect(s.selected).toBe("b");
  });

  it("turns a saved text with symbols beside it into segments in the same order", () => {
    const screw = { kind: "screw", drives: ["hex"] };
    const nut = { kind: "nut" };
    const saved = JSON.stringify({
      labels: [
        {
          id: "a",
          text: "M3",
          symbols: [screw, nut],
          symbolPosition: "left",
          ...{ weight: "regular", maxCapHeight: 5, symbolSize: 6, align: "left" },
        },
        { id: "b", text: "M3", symbols: [screw], symbolPosition: "right" },
        { id: "c", text: "", symbols: [nut] },
        { id: "d", text: "M5", symbols: [] },
        { id: "e", text: "M6", symbols: [{ kind: "squareNut" }] },
      ],
      selected: "a",
    });
    const [a, b, c, d, e] = parseSession(saved, null).labels;
    // The text grows to fill the width, like it used to.
    // Letter height, weight and symbol height move from the label onto its segments.
    const grown = (t: string) => ({ ...text(t), grow: true });
    const sym = symbolSegment;
    expect(a.segments).toEqual([
      { ...sym(screw as LabelSymbol), size: 6 },
      { ...sym(nut as LabelSymbol), size: 6 },
      { ...grown("M3"), weight: "regular", maxCapHeight: 5, align: "left" },
    ]);
    expect(b.segments).toEqual([grown("M3"), sym(screw as LabelSymbol)]);
    expect(c.segments).toEqual([sym(nut as LabelSymbol)]);
    expect(d.segments).toEqual([grown("M5")]);
    expect(e.segments).toEqual([sym({ kind: "nut", nutType: "square" }), grown("M6")]);
    expect(a).not.toHaveProperty("text");
    expect(a).not.toHaveProperty("symbols");
    expect(a).not.toHaveProperty("symbolPosition");
    for (const key of ["weight", "maxCapHeight", "symbolSize"]) expect(a).not.toHaveProperty(key);
  });

  it("moves the label-wide text and symbol settings onto saved segments", () => {
    const saved = JSON.stringify({
      labels: [
        {
          id: "a",
          segments: [{ kind: "text", text: "M3", grow: true }, { kind: "nut" }],
          ...{ weight: "regular", maxCapHeight: 4, symbolSize: 5, align: "right" },
        },
      ],
      selected: "a",
    });
    const [a] = parseSession(saved, null).labels;
    expect(a.segments).toEqual([
      { kind: "text", text: "M3", grow: true, weight: "regular", maxCapHeight: 4, align: "right" },
      { kind: "nut", align: "center", size: 5 },
    ]);
    expect(a.align).toBe("right");
  });

  it("makes labels saved before the holder choice Cullenect ones", () => {
    const saved = JSON.stringify({ labels: [{ id: "a" }, { id: "b", base: "pred" }, { id: "c", base: "bogus" }] });
    expect(parseSession(saved, null).labels.map((l) => l.base)).toEqual(["cullenect", "pred", "cullenect"]);
  });

  it("selects the first label when the saved selection is gone", () => {
    const s = parseSession(JSON.stringify({ labels: [{ id: "a" }], selected: "zz" }), null);
    expect(s.selected).toBe("a");
  });

  it("survives corrupt storage", () => {
    expect(parseSession("{nope", null).labels).toHaveLength(1);
  });
});

describe("label list", () => {
  it("adds a blank label after the selected one, keeping its print settings", () => {
    const s = session("a", "b");
    s.labels[0] = label("a", { units: 3, style: "raised", baseColor: "#ff0000", segments: [text("Keep me")] });
    const next = addLabel(s, blankLabel(s.labels[0]));
    expect(next.labels.map((l) => l.id)).toEqual(["a", next.selected, "b"]);
    expect(next.labels[1]).toMatchObject({ units: 3, style: "raised", baseColor: "#ff0000", segments: [text("")] });
  });

  it("clones a label once per row of segments, keeping everything else", () => {
    const segments = [nut, text("M3 × 12"), text("DIN 912")];
    const s = updateLabel(session("a", "b"), "a", { units: 3, style: "raised", baseColor: "#ff0000", segments });
    const next = cloneLabel(s, "a", [
      [nut, text("M3 × 16"), text("DIN 912")],
      [nut, text("M3 × 20"), text("ISO 7380")],
    ]);
    expect(next.labels.map(texts)).toEqual([
      ["M3 × 12", "DIN 912"],
      ["M3 × 16", "DIN 912"],
      ["M3 × 20", "ISO 7380"],
      texts(label("b")),
    ]);
    expect(next.labels[2]).toMatchObject({ units: 3, style: "raised", baseColor: "#ff0000" });
    expect(new Set(next.labels.map((l) => l.id)).size).toBe(4);
    expect(next.selected).toBe(next.labels[1].id);
    expect(cloneLabel(s, "a", [])).toBe(s);
  });

  it("removes a label and selects its neighbour", () => {
    const s = { ...session("a", "b", "c"), selected: "b" };
    expect(removeLabel(s, "b")).toMatchObject({ selected: "c" });
    expect(removeLabel({ ...s, selected: "c" }, "c")).toMatchObject({ selected: "b" });
    expect(removeLabel(s, "a").selected).toBe("b");
  });

  it("names files by text, width and holder", () => {
    const segments = [text("M3 12")];
    expect(fileName(label("a", { segments }))).toBe("label-M3-12-1u");
    expect(fileName(label("a", { segments, base: "pred", units: 2 }))).toBe("label-M3-12-2u-pred");
  });

  it("gives a blank label the same holder", () => {
    expect(blankLabel(label("a", { base: "cullenect-legacy" })).base).toBe("cullenect-legacy");
  });

  it("keeps the last label", () => {
    const s = session("a");
    expect(removeLabel(s, "a")).toBe(s);
  });

  it("names labels by their text", () => {
    expect(labelTitle(label("a", { segments: [text("M3\n12 mm")] }))).toBe("M3 · 12 mm");
    expect(labelTitle(label("a", { segments: [text("M3"), nut, text("DIN 934")] }))).toBe("M3 DIN 934");
    expect(labelTitle(label("a", { segments: [nut, text(" ")] }))).toBe("Nut");
    expect(labelTitle(label("a", { segments: [nut, symbolSegment({ kind: "washer" })] }))).toBe("2 symbols");
    expect(labelTitle(label("a", { segments: [] }))).toBe("Blank");
  });
});

describe("segment colours", () => {
  const l = label("a", { textColor: "#ffffff", symbolColor: "#00ff00" });

  it("uses the label's default for the segment's kind", () => {
    expect(segmentColor(l, text("M3"))).toBe("#ffffff");
    expect(segmentColor(l, nut)).toBe("#00ff00");
  });

  it("uses the segment's own colour when it has one", () => {
    expect(segmentColor(l, { ...text("M3"), color: "#ff0000" })).toBe("#ff0000");
    expect(segmentColor(l, { ...nut, color: "#0000ff" })).toBe("#0000ff");
  });

  it("keeps a segment's colour when saved and restored", () => {
    const saved = JSON.stringify(session("a"));
    const withColour = JSON.parse(saved) as Session;
    withColour.labels[0].segments = [{ ...text("M3"), color: "#ff0000" }, { ...nut, color: "#0000ff" }, text("12")];
    const restored = parseSession(JSON.stringify(withColour), null).labels[0];
    expect(restored.segments.map((s) => s.color)).toEqual(["#ff0000", "#0000ff", undefined]);
  });
});

describe("fonts", () => {
  it("gives labels saved before the font choice Open Sans", () => {
    const saved = JSON.stringify({ labels: [{ id: "a" }, { id: "b", font: "barlow-semi-condensed" }, { id: "c", font: "comic" }] });
    expect(parseSession(saved, null).labels.map((l) => l.font)).toEqual(["open-sans", "barlow-semi-condensed", "open-sans"]);
  });

  it("keeps a text segment's own font, and drops unknown ones", () => {
    const s = JSON.parse(JSON.stringify(session("a"))) as Session;
    s.labels[0].segments = [{ ...text("M3"), font: "roboto-condensed" }, { ...text("12"), font: "comic" as never }, text("x")];
    const restored = parseSession(JSON.stringify(s), null).labels[0];
    expect(restored.segments.map((seg) => (seg.kind === "text" ? seg.font : "-"))).toEqual(["roboto-condensed", undefined, undefined]);
  });

  it("keeps the default font for a blank label", () => {
    expect(blankLabel(label("a", { font: "atkinson-hyperlegible" })).font).toBe("atkinson-hyperlegible");
  });
});
