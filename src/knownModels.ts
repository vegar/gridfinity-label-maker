import type { TextArea } from "./model";

/**
 * Label files we accept for upload, by the SHA-256 of the original file as
 * it comes from its designer. Only these hashes and a few measurements are
 * shipped, never the models: users bring the file they bought, and it stays
 * in their browser. To support another holder, add its file's hash here.
 *
 * Get a hash with `certutil -hashfile <file> SHA256` on Windows, or
 * `shasum -a 256 <file>` elsewhere.
 */
export interface KnownModel {
  /** The storage system the label is for. */
  system: string;
  /** What the sidebar calls the file. */
  name: string;
  /** The face is the smaller of the two big flat sides. */
  flip?: boolean;
  /** Swap the ends: the label lies the other way round on its face. */
  turnAround?: boolean;
  /** Where text fits, when the face isn't a plain rectangle, after any turning. */
  area?: TextArea;
}

export const KNOWN_MODELS: Record<string, KnownModel> = {
  // USSA Vault drawer label, "Label.stl": 47.9 × 20.6 × 2 mm, with a round
  // end, a bead along both long edges and a ramp at the square end. The face
  // is the wider flat side (r 9.7 mm at the round end), on the bead's side.
  // On the drawer the square end is at the left and the round end sticks out
  // to the right, so the file is turned around. The text area keeps 16 mm
  // of height clear of the round end and stays off the ramp.
  "33113aa7b3be2b55f5b94b3416208f1f019ad11bb70a416814a94afb20b01cf2": {
    system: "USSA Vault",
    name: "Vault label",
    turnAround: true,
    area: { width: 39, height: 16, x: -1.1 },
  },
  // Jerraris GEN2 EdgeLabel face plate, "label-v12.stl" (an earlier version
  // than the current V2602 file, which has another hash): 57 × 27 × 4.5 mm.
  // The face is the flat front, 55.6 × 26 mm, with a 45° slant on the right
  // end, so it's 57 mm wide along the top edge and 28 mm along the bottom;
  // the back has the clips. The text area sits against the top left corner,
  // 1.5 mm in from the edges and clear of the slant.
  "d1b12cda84e13349b343f5fed8428beff8d4de5720d647a437ea8acf66bf55b5": {
    system: "Jerraris EdgeLabel",
    name: "EdgeLabel face plate",
    area: { width: 35, height: 16, x: -8.8, y: 3.5 },
  },
};

/** Storage systems with a supported label file, for messages. */
export const KNOWN_SYSTEMS = [...new Set(Object.values(KNOWN_MODELS).map((m) => m.system))];

export function knownModel(hash: string): KnownModel | undefined {
  return KNOWN_MODELS[hash.toLowerCase()];
}

/**
 * Whether a file may be used. In development any file works, so new
 * holders can be tried before their hash is added.
 */
export function isAllowed(hash: string): boolean {
  return !!knownModel(hash) || !!import.meta.env?.DEV;
}
