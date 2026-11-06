import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import opentype from "opentype.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { buildByKind } from "./parts";
import { loadManifold } from "../src/manifold";
import { buildLabel, DEFAULT_OPTIONS, maxEmbeddedDepth, textSegment } from "../src/label";
import { export3mf, plateLayout, to3mf, toStl, toStlZip } from "../src/export";
import { bambuPresets, plateOrigin, TOWER_BRIM } from "../src/bed";

const BED = { width: 256, depth: 256 };

let wasm: ManifoldToplevel;
const fontData = readFileSync(new URL("../public/fonts/OpenSans-Regular.ttf", import.meta.url));
const font = opentype.parse(fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength));
const fonts = () => font;

beforeAll(async () => {
  wasm = await loadManifold();
});

describe("buildLabel", () => {
  it("builds a 1U cullenect body of the right size", () => {
    const { base } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [] });
    const box = base.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(36, 3);
    expect(box.max[1] - box.min[1]).toBeCloseTo(11, 3);
    expect(box.min[2]).toBeCloseTo(-1.2, 3);
    expect(box.max[2]).toBeCloseTo(0, 3);
    expect(base.status()).toBe("NoError");
  });

  it("scales width with units", () => {
    const { base } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, units: 3, segments: [] });
    const box = base.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(120, 3);
  });

  it("embeds text flush with the face and keeps the total volume", () => {
    const empty = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [] });
    const { base, text } = buildByKind(wasm, fonts, DEFAULT_OPTIONS);
    expect(text).toBeDefined();
    const tb = text!.boundingBox();
    expect(tb.max[2]).toBeCloseTo(0, 3);
    expect(tb.min[2]).toBeCloseTo(-0.2, 3);
    expect(base.volume() + text!.volume()).toBeCloseTo(empty.base.volume(), 2);
  });

  it("keeps text inside the margins and under the max cap height", () => {
    const { text, capHeight } = buildByKind(wasm, fonts, {
      ...DEFAULT_OPTIONS,
      segments: [textSegment("A very long label that must shrink")],
    });
    const tb = text!.boundingBox();
    expect(tb.min[0]).toBeGreaterThanOrEqual(-18 + 0.8 - 1e-3);
    expect(tb.max[0]).toBeLessThanOrEqual(18 - 0.8 + 1e-3);
    expect(capHeight!).toBeLessThan(6);
  });

  it("stacks a segment under the one before it, each at its own size", () => {
    const big = { ...textSegment("NUTS"), maxCapHeight: 4 };
    const small = { ...textSegment("WASHERS"), maxCapHeight: 2.5, stack: true };
    const parts = buildLabel(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [big, small] });
    const [top, bottom] = parts.segments.map((s) => s.manifold.boundingBox());
    // One column: the second line sits below the first, both centered across it.
    expect(bottom.max[1]).toBeLessThan(top.min[1]);
    expect(top.min[1] - bottom.max[1]).toBeCloseTo(DEFAULT_OPTIONS.gap, 3);
    expect((top.min[0] + top.max[0]) / 2).toBeCloseTo((bottom.min[0] + bottom.max[0]) / 2, 3);
    // Round letters overshoot the cap height a little.
    expect(top.max[1] - top.min[1]).toBeCloseTo(4, 0);
    expect(parts.capHeight).toBeCloseTo(2.5, 1);
    expect(parts.shrunk).toBe(false);
  });

  it("shrinks a stack that is taller than the label", () => {
    const line = { ...textSegment("AB"), maxCapHeight: 6 };
    const parts = buildLabel(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [line, { ...line, stack: true }] });
    const boxes = parts.segments.map((s) => s.manifold.boundingBox());
    expect(Math.max(...boxes.map((b) => b.max[1])) - Math.min(...boxes.map((b) => b.min[1]))).toBeLessThanOrEqual(
      11 - 2 * DEFAULT_OPTIONS.margin + 1e-3,
    );
    expect(parts.shrunk).toBe(true);
  });

  it("ignores stacking on the first segment", () => {
    const plain = buildLabel(wasm, fonts, DEFAULT_OPTIONS);
    const stacked = buildLabel(wasm, fonts, {
      ...DEFAULT_OPTIONS,
      segments: DEFAULT_OPTIONS.segments.map((s) => ({ ...s, stack: true })),
    });
    expect(stacked.segments[0].manifold.boundingBox()).toEqual(plain.segments[0].manifold.boundingBox());
  });

  it("leaves material above the snap-fit channels for deep flush text", () => {
    const { text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, textDepth: 0.6 });
    expect(text!.boundingBox().min[2]).toBeCloseTo(-0.3, 3);
    const noRibs = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, ribs: false, textDepth: 0.6 });
    expect(noRibs.text!.boundingBox().min[2]).toBeCloseTo(-0.6, 3);
  });

  it("uses the label's font, unless a text segment sets its own", () => {
    const calls: string[] = [];
    const tracking = (family: string, weight: string) => {
      calls.push(`${family} ${weight}`);
      return font;
    };
    const own = { ...textSegment("B"), font: "atkinson-hyperlegible" as const };
    buildLabel(wasm, tracking, { ...DEFAULT_OPTIONS, font: "barlow-semi-condensed", segments: [textSegment("A"), own] });
    expect(calls).toEqual(["barlow-semi-condensed bold", "atkinson-hyperlegible bold"]);
  });

  it("raises text above the face", () => {
    const { text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, style: "raised" });
    const tb = text!.boundingBox();
    expect(tb.min[2]).toBeCloseTo(0, 3);
    expect(tb.max[2]).toBeCloseTo(0.2, 3);
  });
});

describe("label holders", () => {
  const blank = { ...DEFAULT_OPTIONS, segments: [] };
  const size = (m: Manifold) => {
    const { min, max } = m.boundingBox();
    return [max[0] - min[0], max[1] - min[1], min[2], max[2]];
  };

  it("builds a Cullenect legacy body with three channels, whatever the width", () => {
    const { base } = buildByKind(wasm, fonts, { ...blank, base: "cullenect-legacy", units: 3 });
    const [w, h, bottom, top] = size(base);
    expect(base.status()).toBe("NoError");
    expect(w).toBeCloseTo(36.4, 3);
    expect(h).toBeCloseTo(11, 3);
    expect(bottom).toBeCloseTo(-1, 3);
    expect(top).toBeCloseTo(0, 3);
    // The plate less three channels of 0.9 × 0.2 + 2 × 0.4 mm² each, the length of the label.
    const plate = wasm.CrossSection.square([36.4, 11], true).offset(0, "Round").area();
    expect(base.volume()).toBeLessThan(plate - 3 * 0.9 * 11);
    expect(base.volume()).toBeGreaterThan(plate - 3 * 1.1 * 11 - 1);
  });

  it("fits Gridfinity Extended's Cullenect legacy pocket", () => {
    // 36.7 × 11.3 mm plus 0.3 mm padding.
    const { base } = buildByKind(wasm, fonts, { ...blank, base: "cullenect-legacy" });
    const [w, h] = size(base);
    expect(w).toBeLessThan(37);
    expect(h).toBeLessThan(11.6);
  });

  it("builds a flat pred body with tabs, 42 mm a unit less 4.2", () => {
    for (const units of [1, 2, 3]) {
      const { base } = buildByKind(wasm, fonts, { ...blank, base: "pred", units });
      const [w, h, bottom, top] = size(base);
      expect(base.status()).toBe("NoError");
      expect(w).toBeCloseTo(units * 42 - 4.2, 3);
      expect(h).toBeCloseTo(11, 3);
      expect(bottom).toBeCloseTo(-0.8, 3);
      expect(top).toBeCloseTo(0, 3);
      // Gridfinity Extended's pred pocket: 42u - 5.8 by 11.35 mm, with 1 × 6.7 mm tabs at the ends.
      const ends = base.trimByPlane([1, 0, 0], (units * 42 - 5.8) / 2);
      expect(size(ends)[1]).toBeLessThan(6.7);
    }
  });

  it("sinks a pred label's face below a rim for raised text", () => {
    const { base, text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, base: "pred", style: "raised" });
    const [, , bottom, top] = size(base);
    expect(bottom).toBeCloseTo(-0.4, 3);
    expect(top).toBeCloseTo(0.4, 3);
    expect(text!.boundingBox().min[2]).toBeCloseTo(0, 3);
    // The face, at z = 0, is the top of the body in the middle.
    const middle = base.trimByPlane([0, 0, 1], -0.1).intersect(wasm.Manifold.cube([4, 4, 2], true));
    expect(middle.boundingBox().max[2]).toBeCloseTo(0, 3);
  });

  it("keeps text clear of a pred label's holes", () => {
    const { text } = buildByKind(wasm, fonts, {
      ...DEFAULT_OPTIONS,
      base: "pred",
      segments: [textSegment("A very long label that must shrink")],
    });
    const tb = text!.boundingBox();
    expect(tb.min[0]).toBeGreaterThanOrEqual(-(37.8 - 5.5) / 2);
    expect(tb.max[0]).toBeLessThanOrEqual((37.8 - 5.5) / 2);
  });

  it("limits flush text to leave material at the back", () => {
    expect(maxEmbeddedDepth({ base: "cullenect-legacy", units: 1, ribs: false })).toBeCloseTo(0.3);
    expect(maxEmbeddedDepth({ base: "pred", units: 1, ribs: true })).toBeCloseTo(0.6);
    const { text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, base: "pred", textDepth: 1 });
    expect(text!.boundingBox().min[2]).toBeCloseTo(-0.6, 3);
  });
});

describe("export", () => {
  it("writes a 3MF with one object per part plus an assembly", () => {
    const { base, text } = buildByKind(wasm, fonts, DEFAULT_OPTIONS);
    const files = unzipSync(
      to3mf(
        "test",
        [
          {
            name: "label",
            parts: [
              { name: "base", manifold: base, color: "#202020" },
              { name: "text", manifold: text!, color: "#ffffff" },
            ],
          },
        ],
        BED,
      ),
    );
    const model = strFromU8(files["3D/3dmodel.model"]);
    expect(model.match(/<object /g)).toHaveLength(3);
    expect(model.match(/<item /g)).toHaveLength(1);
    expect(model).toContain('displaycolor="#FFFFFFFF"');
    expect(files["[Content_Types].xml"]).toBeDefined();
  });

  it("puts every label in the 3MF as its own object", () => {
    const a = buildByKind(wasm, fonts, DEFAULT_OPTIONS);
    const b = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [textSegment("M4")], units: 2 });
    const files = unzipSync(
      to3mf(
        "test",
        [
          {
            name: "a",
            parts: [
              { name: "label", manifold: a.base, color: "#202020" },
              { name: "text", manifold: a.text!, color: "#ffffff" },
            ],
          },
          {
            name: "b",
            parts: [
              { name: "label", manifold: b.base, color: "#202020" },
              { name: "text", manifold: b.text!, color: "#ff0000" },
            ],
          },
        ],
        BED,
      ),
    );
    const model = strFromU8(files["3D/3dmodel.model"]);
    // Parts 2, 3 and assembly 4; parts 5, 6 and assembly 7.
    expect([...model.matchAll(/<item objectid="(\d+)"/g)].map((m) => m[1])).toEqual(["4", "7"]);
    expect(model).toContain(
      '<object id="7" name="b" type="model"><components><component objectid="5"/><component objectid="6"/>',
    );
    expect(model).toContain('pid="1" pindex="3"');

    // Filament slots are shared across labels: same colour, same slot.
    const settings = strFromU8(files["Metadata/model_settings.config"]);
    expect([...settings.matchAll(/<object id="(\d+)">/g)].map((m) => m[1])).toEqual(["4", "7"]);
    const parts = [...settings.matchAll(/<part id="(\d+)"[\s\S]*?key="extruder" value="(\d+)"/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(parts).toEqual([
      ["2", "1"],
      ["3", "2"],
      ["5", "1"],
      ["6", "3"],
    ]);
  });

  it("lays labels out in rows without overlapping", () => {
    const labels = Array.from({ length: 20 }, (_, i) => {
      const { base } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [], units: (i % 3) + 1 });
      return { name: `l${i}`, parts: [{ name: "label", manifold: base, color: "#202020" }] };
    });
    const layout = plateLayout(labels, BED);
    const boxes = labels.map((l, i) => {
      const b = l.parts[0].manifold.boundingBox();
      const [x, y, z] = layout[i].offset;
      expect(layout[i].plate).toBe(0);
      expect(b.min[2] + z).toBeCloseTo(0, 6);
      return { minX: b.min[0] + x, maxX: b.max[0] + x, minY: b.min[1] + y, maxY: b.max[1] + y };
    });
    // The first label is at the back left, and the second next to it in the same row.
    expect(boxes[1].minX).toBeGreaterThan(boxes[0].maxX);
    expect(boxes[1].maxY).toBeCloseTo(boxes[0].maxY, 6);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const overlap = p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
        expect(overlap).toBe(false);
      }
      // Everything stays on a 256 mm plate.
      expect(boxes[i].minX).toBeGreaterThan(0);
      expect(boxes[i].maxX).toBeLessThan(256);
      expect(boxes[i].minY).toBeGreaterThan(0);
      expect(boxes[i].maxY).toBeLessThan(256);
    }
  });

  it("downloads a zip with a 3MF per plate when the labels need several", () => {
    const { base, text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, units: 3 });
    const labels = Array.from({ length: 12 }, (_, i) => ({
      name: `l${i}`,
      parts: [
        { name: "label", manifold: base, color: "#202020" },
        // Only the last label has red text: it keeps slot 3 in its own plate's file.
        { name: "text", manifold: text!, color: i === 11 ? "#ff0000" : "#ffffff" },
      ],
    }));
    // 120 mm labels: one per row, five rows on a 100 mm deep, 130 mm wide plate.
    const bed = { width: 130, depth: 100 };
    expect(plateLayout(labels, bed).map((l) => l.plate)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2]);

    const file = export3mf("labels", labels, bed);
    expect(file.filename).toBe("labels-3-plates.zip");
    const plates = unzipSync(file.data);
    expect(Object.keys(plates).sort()).toEqual(["labels-plate-1.3mf", "labels-plate-2.3mf", "labels-plate-3.3mf"]);
    const b = base.boundingBox();
    for (const name of Object.keys(plates)) {
      const files = unzipSync(plates[name]);
      const model = strFromU8(files["3D/3dmodel.model"]);
      // Every label in each file lies on the bed.
      for (const [, x, y] of model.matchAll(/transform="1 0 0 0 1 0 0 0 1 ([-\d.]+) ([-\d.]+)/g)) {
        expect(b.min[0] + Number(x)).toBeGreaterThan(0);
        expect(b.max[0] + Number(x)).toBeLessThan(130);
        expect(b.min[1] + Number(y)).toBeGreaterThan(0);
        expect(b.max[1] + Number(y)).toBeLessThan(100);
      }
    }
    const last = strFromU8(unzipSync(plates["labels-plate-3.3mf"])["Metadata/model_settings.config"]);
    expect([...last.matchAll(/key="extruder" value="(\d+)"/g)].map((m) => m[1])).toEqual([
      "1",
      "1",
      "2",
      "1",
      "1",
      "3",
    ]);
  });

  it("downloads one Bambu Studio project with every plate for a Bambu printer", () => {
    const { base, text } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, units: 3 });
    const labels = Array.from({ length: 7 }, (_, i) => ({
      name: `l${i}`,
      parts: [
        { name: "label", manifold: base, color: "#202020" },
        { name: "text", manifold: text!, color: "#ffffff" },
      ],
    }));
    const presets = bambuPresets({ id: "bbl-h2s", custom: { width: 0, depth: 0 } })!;
    // A small bed with a tower zone, so the labels need two plates.
    const bed = { width: 130, depth: 100, exclude: [{ x: 60, y: 60, width: 40, depth: 40, kind: "tower" as const }] };
    const layout = plateLayout(labels, bed);
    expect(new Set(layout.map((l) => l.plate)).size).toBe(2);

    const file = export3mf("labels", labels, bed, presets);
    expect(file.filename).toBe("labels.3mf");
    const files = unzipSync(file.data);
    const model = strFromU8(files["3D/3dmodel.model"]);
    expect(model).toMatch(/<metadata name="Application">BambuStudio-/);
    const settings = strFromU8(files["Metadata/model_settings.config"]);
    expect([...settings.matchAll(/<plate>/g)]).toHaveLength(2);
    const project = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
    expect(project.printer_settings_id).toBe(presets.printer);
    expect(project.print_settings_id).toBe(presets.process);
    expect(project.filament_colour).toEqual(["#202020", "#FFFFFF"]);
    // Bambu Studio trims filament_settings_id to this list's length.
    expect(project.filament_diameter).toHaveLength(2);
    expect(project.filament_settings_id).toEqual([presets.filament, presets.filament]);
    expect(project.wipe_tower_x[0]).toBe(String(60 + TOWER_BRIM));

    // Labels on the second plate sit on that plate, to the right of the first.
    const [ox] = plateOrigin(1, 2, bed);
    const xs = [...model.matchAll(/<item [^>]*transform="1 0 0 0 1 0 0 0 1 ([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(7);
    layout.forEach((l, i) => expect(xs[i]).toBeCloseTo(l.offset[0] + (l.plate === 1 ? ox : 0), 3));
  });

  it("downloads a single 3MF when the labels fit on one plate", () => {
    const { base } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [] });
    const file = export3mf(
      "label-M3",
      [{ name: "l", parts: [{ name: "label", manifold: base, color: "#202020" }] }],
      BED,
    );
    expect(file.filename).toBe("label-M3.3mf");
    expect(unzipSync(file.data)["3D/3dmodel.model"]).toBeDefined();
  });

  it("zips STLs in a folder per label, numbering repeated names", () => {
    const { base } = buildByKind(wasm, fonts, { ...DEFAULT_OPTIONS, segments: [] });
    const object = { name: "label-M3", parts: [{ name: "label", manifold: base, color: "#202020" }] };
    const files = unzipSync(toStlZip([object, object]));
    expect(Object.keys(files).sort()).toEqual(["label-M3-2/label.stl", "label-M3/label.stl"]);
  });

  it("writes a binary STL with the right triangle count", () => {
    const { base } = buildByKind(wasm, fonts, DEFAULT_OPTIONS);
    const stl = toStl(base);
    const count = new DataView(stl.buffer).getUint32(80, true);
    expect(count).toBe(base.numTri());
    expect(stl.length).toBe(84 + count * 50);
  });
});
