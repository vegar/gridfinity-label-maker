import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { modelBody, parseModel, prepareModel, type PreparedModel } from "./model";
// The designer's own file, unchanged, bundled with their permission (see THIRD_PARTY_NOTICES.md).
import stlUrl from "./models/edgelabel-v12.stl?inline";

/**
 * Jerraris's GEN2 EdgeLabel face plate, "label-v12.stl": 57 × 27 × 4.5 mm.
 * The face is the flat front, 55.6 × 26 mm, with a 45° slant on the right
 * end, so it's 57 mm wide along the top edge and 28 mm along the bottom; the
 * back has the clips. The text area sits against the top left corner,
 * 1.5 mm in from the edges and clear of the slant.
 */
export const EDGELABEL_AREA = { width: 35, height: 16, x: -8.8, y: 3.5 };

/** The SHA-256 of the bundled file, so earlier uploads of it can be moved over. */
export const EDGELABEL_HASH = "d1b12cda84e13349b343f5fed8428beff8d4de5720d647a437ea8acf66bf55b5";

let prepared: PreparedModel | undefined;

function decode(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** The face plate laid flat, face up, centred on the text area. */
export function edgeLabelModel(): PreparedModel {
  prepared ??= prepareModel(parseModel(decode(stlUrl)), false, EDGELABEL_AREA);
  return prepared;
}

export function edgeLabelBody(wasm: ManifoldToplevel): Manifold {
  return modelBody(wasm, edgeLabelModel());
}
