import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { strToU8 } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "../src/manifold";
import { modelBody, parseModel, prepareModel, registerModel, sha256 } from "../src/model";
import { isAllowed, knownModel } from "../src/knownModels";
import { DEFAULT_OPTIONS, textSegment } from "../src/label";
import { to3mf, toStl } from "../src/export";
import { baseInfo } from "../src/bases";
import { buildByKind } from "./parts";

let wasm: ManifoldToplevel;
const fontData = readFileSync(new URL("../public/fonts/OpenSans-Regular.ttf", import.meta.url));
const font = opentype.parse(fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength));
const fonts = () => font;

beforeAll(async () => {
  wasm = await loadManifold();
});

/**
 * A stand-in label, made up for the tests: a 40 × 12 plate, 2 mm thick, on
 * a wider 44 × 14 flange 1 mm thick, so the flange's underside is the bigger
 * flat side. Stood on its long edge and moved away from the origin, the way
 * files from CAD often come.
 */
function sample(): Manifold {
  const { Manifold } = wasm;
  const flange = Manifold.cube([44, 14, 1], true).translate(0, 0, -0.5);
  const plate = Manifold.cube([40, 12, 1], true).translate(0, 0, 0.5);
  return flange.add(plate).rotate([90, 0, 0]).translate(500, 300, 20);
}

function asciiStl(m: Manifold): Uint8Array {
  const mesh = m.getMesh();
  const p = (i: number) => [0, 1, 2].map((k) => mesh.vertProperties[i * mesh.numProp + k]).join(" ");
  let out = "solid test\n";
  for (let t = 0; t < mesh.triVerts.length; t += 3) {
    out += " facet normal 0 0 0\n  outer loop\n";
    for (let k = 0; k < 3; k++) out += `   vertex ${p(mesh.triVerts[t + k])}\n`;
    out += "  endloop\n endfacet\n";
  }
  return strToU8(out + "endsolid test\n");
}

describe("parseModel", () => {
  it("reads binary STL, text STL and 3MF alike", () => {
    const m = sample();
    const files = [
      toStl(m),
      asciiStl(m),
      to3mf("t", [{ name: "label", parts: [{ name: "label", manifold: m, color: "#000000" }] }], {
        width: 256,
        depth: 256,
      }),
    ];
    const volumes = files.map((bytes) => modelBody(wasm, prepareModel(parseModel(bytes))).volume());
    for (const v of volumes) expect(v).toBeCloseTo(44 * 14 + 40 * 12, 1);
  });

  it("rejects a file without triangles", () => {
    expect(() => parseModel(strToU8("solid empty\nendsolid empty\n"))).toThrow(/No triangles/);
  });
});

describe("prepareModel", () => {
  it("lays the label flat, long side along X, bigger flat side up at z = 0", () => {
    const m = prepareModel(parseModel(toStl(sample())));
    expect(m.width).toBeCloseTo(44, 3);
    expect(m.height).toBeCloseTo(14, 3);
    expect(m.depth).toBeCloseTo(2, 3);
    // The flange's underside is the bigger flat side.
    expect(m.face.width).toBeCloseTo(44, 3);
    const box = modelBody(wasm, m).boundingBox();
    expect(box.max[2]).toBeCloseTo(0, 3);
    expect(box.min[2]).toBeCloseTo(-2, 3);
    expect(box.min[0]).toBeCloseTo(-22, 3);
  });

  it("turns it over to put the text on the other side", () => {
    const m = prepareModel(parseModel(toStl(sample())), true);
    expect(m.face.width).toBeCloseTo(40, 3);
    expect(m.face.height).toBeCloseTo(12, 3);
    const body = modelBody(wasm, m);
    expect(body.status()).toBe("NoError");
    // The narrow plate is now on top: a thin slice just under the face is 40 wide.
    const slice = body.slice(-0.5).bounds();
    expect(slice.max[0] - slice.min[0]).toBeCloseTo(40, 3);
  });

  it("centers on a text area that's off the middle of the face", () => {
    const m = prepareModel(parseModel(toStl(sample())), false, { width: 30, height: 10, x: 3 });
    expect(m.face).toEqual({ width: 30, height: 10 });
    expect(modelBody(wasm, m).boundingBox().min[0]).toBeCloseTo(-25, 3);
  });
});

describe("uploaded label holder", () => {
  it("builds text on the uploaded model's face", async () => {
    const bytes = toStl(sample());
    const hash = await sha256(bytes);
    registerModel({ hash, name: "sample", bytes, flip: true });
    const opts = { ...DEFAULT_OPTIONS, base: "custom" as const, model: hash, segments: [textSegment("M3")] };
    expect(baseInfo("custom").size(opts)).toEqual({ width: expect.closeTo(44, 3), height: expect.closeTo(14, 3) });
    const { base, text } = buildByKind(wasm, fonts, opts);
    expect(base.status()).toBe("NoError");
    const box = text!.boundingBox();
    expect(box.max[2]).toBeCloseTo(0, 3);
    expect(box.max[0] - box.min[0]).toBeLessThan(40);
    expect(box.max[1] - box.min[1]).toBeLessThan(12);
  });

  it("asks for the file when this browser doesn't have it", () => {
    const opts = { ...DEFAULT_OPTIONS, base: "custom" as const, model: "0".repeat(64) };
    expect(() => buildByKind(wasm, fonts, opts)).toThrow(/upload the label model again/);
  });
});

describe("known label files", () => {
  it("knows the USSA Vault label by its hash", () => {
    const vault = knownModel("33113aa7b3be2b55f5b94b3416208f1f019ad11bb70a416814a94afb20b01cf2");
    expect(vault?.system).toBe("USSA Vault");
  });

  it("knows the Jerraris EdgeLabel face plate by its hash", () => {
    const edge = knownModel("d1b12cda84e13349b343f5fed8428beff8d4de5720d647a437ea8acf66bf55b5");
    expect(edge?.system).toBe("Jerraris EdgeLabel");
  });

  it("only takes known files outside development", () => {
    const dev = import.meta.env.DEV;
    try {
      import.meta.env.DEV = false;
      expect(isAllowed("0".repeat(64))).toBe(false);
      expect(isAllowed("33113AA7B3BE2B55F5B94B3416208F1F019AD11BB70A416814A94AFB20B01CF2")).toBe(true);
    } finally {
      import.meta.env.DEV = dev;
    }
  });
});

describe("turning a label around", () => {
  it("swaps its ends and keeps the face up", () => {
    // A wedge-ended stand-in: a 40 × 12 plate with a 4 mm stub at +X only.
    const { Manifold } = wasm;
    const shape = Manifold.cube([40, 12, 2], true).add(Manifold.cube([4, 6, 2], true).translate(22, 0, 0));
    const raw = parseModel(toStl(shape));
    // The stub's end is lighter (480 vs 528 of the 1008 mm³ either side of
    // the face's middle), and turning around moves it to the other side.
    const rightVolume = (m: Manifold) => m.trimByPlane([1, 0, 0], 0).volume();
    const plain = modelBody(wasm, prepareModel(raw));
    const turned = modelBody(wasm, prepareModel(raw, false, undefined, true));
    expect(rightVolume(plain)).toBeCloseTo(480, 1);
    expect(rightVolume(turned)).toBeCloseTo(528, 1);
    expect(turned.boundingBox().max[2]).toBeCloseTo(0, 3);
  });
});
