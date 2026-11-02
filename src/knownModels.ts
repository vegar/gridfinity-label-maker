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
  /** Where text fits, when the face isn't a plain rectangle. */
  area?: TextArea;
}

export const KNOWN_MODELS: Record<string, KnownModel> = {
  // USSA Vault drawer label, "Label.stl": 47.9 × 20.6 × 2 mm, with a round
  // left end (r 9.6 mm), a bead along both long edges at the back to slide
  // into the drawer's rail, and a ramp at the right end. The face is the
  // narrower flat side; the text area keeps 16 mm of height clear of the
  // round end.
  "33113aa7b3be2b55f5b94b3416208f1f019ad11bb70a416814a94afb20b01cf2": {
    system: "USSA Vault",
    name: "Vault label",
    flip: true,
    area: { width: 40, height: 16, x: 2.2 },
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
