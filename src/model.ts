import { strFromU8, unzipSync } from "fflate";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { knownModel } from "./knownModels";

/**
 * A label body the user brings: their own STL or 3MF of a label for a holder
 * we don't draw ourselves, such as a commercial storage system's. The file
 * only lives in their browser; we read it, find its face, and put the text
 * on that face.
 */

/** A triangle soup or indexed mesh, positions in mm. */
export interface RawMesh {
  positions: Float32Array;
  triangles: Uint32Array;
}

/** A mesh turned so the face is up at z = 0, centered on the face in X/Y. */
export interface PreparedModel {
  positions: Float32Array;
  triangles: Uint32Array;
  /** Outer size in mm. */
  width: number;
  height: number;
  depth: number;
  /** The flat face text can go on, centered on the origin. */
  face: { width: number; height: number };
}

/**
 * Where text may go on a face that isn't a plain rectangle, such as one with
 * a round end. `x` and `y` move its center from the middle of the face.
 */
export interface TextArea {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

/** A model file the user uploaded, as kept in the browser. */
export interface StoredModel {
  /** SHA-256 of the file, hex. Labels refer to their model by it. */
  hash: string;
  name: string;
  bytes: Uint8Array;
  /** Use the other big side as the face. Unset: as known for this file, or the bigger side. */
  flip?: boolean;
}

/** Hex SHA-256 of a file, to tell models apart and recognise known ones. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- parsing

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isAsciiStl(bytes: Uint8Array): boolean {
  const head = strFromU8(bytes.subarray(0, 512)).trimStart();
  if (!head.startsWith("solid")) return false;
  // Some binary STLs start their header with "solid" too; trust the size.
  if (bytes.length >= 84) {
    const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (84 + count * 50 === bytes.length) return false;
  }
  return true;
}

function parseBinaryStl(bytes: Uint8Array): RawMesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (84 + count * 50 > bytes.length) throw new Error("The STL file is cut short.");
  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12;
    for (let i = 0; i < 9; i++) positions[t * 9 + i] = view.getFloat32(at + i * 4, true);
  }
  return { positions, triangles: Uint32Array.from({ length: count * 3 }, (_, i) => i) };
}

function parseAsciiStl(text: string): RawMesh {
  const coords: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m; (m = re.exec(text)); ) coords.push(+m[1], +m[2], +m[3]);
  return { positions: Float32Array.from(coords), triangles: Uint32Array.from({ length: coords.length / 3 }, (_, i) => i) };
}

type Matrix = number[]; // 3MF's 12 numbers: 3x3 rotation, column by column, then translation.
const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseMatrix(attr: string | undefined): Matrix {
  const m = attr?.trim().split(/\s+/).map(Number);
  return m && m.length === 12 && m.every(Number.isFinite) ? m : IDENTITY;
}

/** a then b. */
function compose(a: Matrix, b: Matrix): Matrix {
  const p = (m: Matrix, x: number, y: number, z: number) => [
    m[0] * x + m[3] * y + m[6] * z,
    m[1] * x + m[4] * y + m[7] * z,
    m[2] * x + m[5] * y + m[8] * z,
  ];
  const c0 = p(b, a[0], a[1], a[2]);
  const c1 = p(b, a[3], a[4], a[5]);
  const c2 = p(b, a[6], a[7], a[8]);
  const t = p(b, a[9], a[10], a[11]);
  return [...c0, ...c1, ...c2, t[0] + b[9], t[1] + b[10], t[2] + b[11]];
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1].replace(/^.*:/, "")] = m[2];
  return out;
}

interface ObjectDef {
  mesh?: { vertices: number[]; triangles: number[] };
  components: { path?: string; id: string; transform: Matrix }[];
}

function parseModelXml(xml: string): Map<string, ObjectDef> {
  const objects = new Map<string, ObjectDef>();
  for (const obj of xml.matchAll(/<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g)) {
    const id = attrs(obj[1]).id;
    const body = obj[2];
    const def: ObjectDef = { components: [] };
    if (/<(?:\w+:)?mesh\b/.test(body)) {
      const vertices: number[] = [];
      for (const v of body.matchAll(/<(?:\w+:)?vertex\b([^>]*)\/?>/g)) {
        const a = attrs(v[1]);
        vertices.push(+a.x, +a.y, +a.z);
      }
      const triangles: number[] = [];
      for (const t of body.matchAll(/<(?:\w+:)?triangle\b([^>]*)\/?>/g)) {
        const a = attrs(t[1]);
        triangles.push(+a.v1, +a.v2, +a.v3);
      }
      def.mesh = { vertices, triangles };
    }
    for (const c of body.matchAll(/<(?:\w+:)?component\b([^>]*)\/?>/g)) {
      const a = attrs(c[1]);
      def.components.push({ path: a.path, id: a.objectid, transform: parseMatrix(a.transform) });
    }
    objects.set(id, def);
  }
  return objects;
}

function parse3mf(bytes: Uint8Array): RawMesh {
  const files = unzipSync(bytes);
  const models = new Map<string, Map<string, ObjectDef>>();
  for (const [name, data] of Object.entries(files)) {
    if (name.toLowerCase().endsWith(".model")) models.set("/" + name.replace(/^\/+/, ""), parseModelXml(strFromU8(data)));
  }
  const rootPath = [...models.keys()].find((p) => p.toLowerCase() === "/3d/3dmodel.model") ?? [...models.keys()][0];
  if (!rootPath) throw new Error("The 3MF file has no model in it.");
  const rootXml = strFromU8(files[rootPath.slice(1)]);

  const positions: number[] = [];
  const triangles: number[] = [];
  const add = (path: string, id: string, transform: Matrix, depth: number) => {
    const def = models.get(path)?.get(id);
    if (!def || depth > 8) return;
    if (def.mesh) {
      const base = positions.length / 3;
      const v = def.mesh.vertices;
      for (let i = 0; i < v.length; i += 3) {
        const [x, y, z] = [v[i], v[i + 1], v[i + 2]];
        const m = transform;
        positions.push(
          m[0] * x + m[3] * y + m[6] * z + m[9],
          m[1] * x + m[4] * y + m[7] * z + m[10],
          m[2] * x + m[5] * y + m[8] * z + m[11],
        );
      }
      for (const t of def.mesh.triangles) triangles.push(base + t);
    }
    for (const c of def.components) add(c.path ?? path, c.id, compose(c.transform, transform), depth + 1);
  };
  const items = [...rootXml.matchAll(/<(?:\w+:)?item\b([^>]*)\/?>/g)].map((m) => attrs(m[1]));
  if (items.length) for (const item of items) add(item.path ?? rootPath, item.objectid, parseMatrix(item.transform), 0);
  else for (const id of models.get(rootPath)!.keys()) add(rootPath, id, IDENTITY, 0);
  return { positions: Float32Array.from(positions), triangles: Uint32Array.from(triangles) };
}

/** Read an STL (binary or text) or a 3MF file. */
export function parseModel(bytes: Uint8Array): RawMesh {
  const mesh = isZip(bytes) ? parse3mf(bytes) : isAsciiStl(bytes) ? parseAsciiStl(strFromU8(bytes)) : parseBinaryStl(bytes);
  if (!mesh.triangles.length) throw new Error("No triangles found in the file.");
  return mesh;
}

// ---------------------------------------------------------------- preparing

/** Join corners that STL repeats for every triangle, so the mesh is a closed solid. */
function weld(mesh: RawMesh): RawMesh {
  const index = new Map<string, number>();
  const positions: number[] = [];
  const remap = new Uint32Array(mesh.positions.length / 3);
  const q = (v: number) => Math.round(v * 1e4);
  for (let i = 0; i < remap.length; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    const key = `${q(x)},${q(y)},${q(z)}`;
    let at = index.get(key);
    if (at === undefined) {
      at = positions.length / 3;
      index.set(key, at);
      positions.push(x, y, z);
    }
    remap[i] = at;
  }
  const triangles: number[] = [];
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [remap[mesh.triangles[t]], remap[mesh.triangles[t + 1]], remap[mesh.triangles[t + 2]]];
    if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
  }
  return { positions: Float32Array.from(positions), triangles: Uint32Array.from(triangles) };
}

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}

/** Area and X/Y bounds of the triangles lying flat at height `z`, facing `up` or down. */
function flatAt(mesh: RawMesh, z: number, up: boolean) {
  const p = mesh.positions;
  let area = 0;
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  // Files placed far from the origin lose float32 precision.
  const tol = 2e-3;
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t] * 3, mesh.triangles[t + 1] * 3, mesh.triangles[t + 2] * 3];
    if (Math.abs(p[a + 2] - z) > tol || Math.abs(p[b + 2] - z) > tol || Math.abs(p[c + 2] - z) > tol) continue;
    // z of the cross product: twice the signed area seen from above.
    const cross = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
    if (up ? cross <= 0 : cross >= 0) continue;
    area += Math.abs(cross) / 2;
    for (const v of [a, b, c]) {
      min[0] = Math.min(min[0], p[v]);
      min[1] = Math.min(min[1], p[v + 1]);
      max[0] = Math.max(max[0], p[v]);
      max[1] = Math.max(max[1], p[v + 1]);
    }
  }
  return { area, min, max };
}

/**
 * Turn a label so its long side runs along X, its short side along Y and
 * its thickness along Z, with the face (the bigger flat side, or the other
 * one if `flip`) up at z = 0, centered on the face.
 */
export function prepareModel(raw: RawMesh, flip = false, area?: TextArea): PreparedModel {
  const mesh = weld(raw);
  const { min, max } = bounds(mesh.positions);
  const extent = [0, 1, 2].map((k) => max[k] - min[k]);
  // Axes from longest to shortest become X, Y, Z.
  const order = [0, 1, 2].sort((a, b) => extent[b] - extent[a]);
  const n = mesh.positions.length / 3;
  const turned = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const axis = order[k];
      turned[i * 3 + k] = mesh.positions[i * 3 + axis] - (min[axis] + max[axis]) / 2;
    }
  }
  // Swapping axes mirrors the model when the permutation is odd; mirror Y back.
  const odd = (order[0] === 1 && order[1] === 0) || (order[0] === 0 && order[1] === 2) || (order[0] === 2 && order[1] === 1);
  if (odd) for (let i = 0; i < n; i++) turned[i * 3 + 1] = -turned[i * 3 + 1];

  const [width, height, depth] = order.map((k) => extent[k]);
  let prepared: RawMesh = { positions: turned, triangles: mesh.triangles };
  const top = flatAt(prepared, depth / 2, true);
  const bottom = flatAt(prepared, -depth / 2, false);
  // Face down: turn the label over around X.
  if ((bottom.area > top.area) !== flip) {
    for (let i = 0; i < n; i++) {
      turned[i * 3 + 1] = -turned[i * 3 + 1];
      turned[i * 3 + 2] = -turned[i * 3 + 2];
    }
  }
  const face = flatAt(prepared, depth / 2, true);
  const cx = (face.min[0] + face.max[0]) / 2 + (area?.x ?? 0);
  const cy = (face.min[1] + face.max[1]) / 2 + (area?.y ?? 0);
  for (let i = 0; i < n; i++) {
    turned[i * 3] -= cx;
    turned[i * 3 + 1] -= cy;
    turned[i * 3 + 2] -= depth / 2;
  }
  prepared = { positions: turned, triangles: mesh.triangles };
  return {
    ...prepared,
    width,
    height,
    depth,
    face: area
      ? { width: area.width, height: area.height }
      : { width: face.max[0] - face.min[0], height: face.max[1] - face.min[1] },
  };
}

/** The prepared model as a solid. Throws if it isn't a closed, watertight mesh. */
export function modelBody(wasm: ManifoldToplevel, model: PreparedModel): Manifold {
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: model.positions, triVerts: model.triangles });
  return new wasm.Manifold(mesh);
}

// ---------------------------------------------------------------- the user's models

const models = new Map<string, PreparedModel>();

/** Make an uploaded model available to the label builder. */
export function registerModel(stored: StoredModel): PreparedModel {
  const known = knownModel(stored.hash);
  const flip = stored.flip ?? known?.flip ?? false;
  const prepared = prepareModel(parseModel(stored.bytes), flip, known?.area);
  models.set(stored.hash, prepared);
  return prepared;
}

export function unregisterModel(hash: string) {
  models.delete(hash);
}

export function getModel(hash: string | undefined): PreparedModel | undefined {
  return hash ? models.get(hash) : undefined;
}
