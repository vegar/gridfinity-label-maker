import { isBaseKind } from "./bases";
import {
  DEFAULT_OPTIONS,
  isText,
  SYMBOL_SIZE,
  symbolSegment,
  TEXT_DEFAULTS,
  textSegment,
  type LabelOptions,
  type Segment,
  type SymbolSegment,
  type TextSegment,
  type Weight,
} from "./label";
import { migrateSymbol, symbolInfo, type LabelSymbol } from "./symbols";
import type { Align } from "./text";

export interface LabelState extends LabelOptions {
  /** Stable key for the label list; not part of the geometry. */
  id: string;
  baseColor: string;
  /** Colour of text segments that don't set their own. */
  textColor: string;
  /** Colour of symbol segments that don't set their own. */
  symbolColor: string;
}

/** The colour a segment prints in: its own, or the label's default for its kind. */
export function segmentColor(label: LabelState, segment: Segment): string {
  return segment.color ?? (isText(segment) ? label.textColor : label.symbolColor);
}

/** Every label being worked on, and the one open in the editor. */
export interface Session {
  labels: LabelState[];
  selected: string;
}

/** A single label, from the first releases. */
const LEGACY_STORAGE_KEY = "gridfinity-labels:v1";
const STORAGE_KEY = "gridfinity-labels:v2";

export const DEFAULT_STATE: Omit<LabelState, "id"> = {
  ...DEFAULT_OPTIONS,
  baseColor: "#1f2328",
  textColor: "#f4f4f0",
  symbolColor: "#f4f4f0",
  segments: [
    symbolSegment({ kind: "screw", headShape: "countersunk", drives: ["phillips"] }),
    textSegment("M3 × 12"),
  ],
};

/** The first release started with this bolt; swap it for the new default. */
const OLD_DEFAULT_SYMBOLS = JSON.stringify([{ kind: "cullbolt", headShape: "socket", drives: ["hex"] }]);

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** How labels were saved before text and symbols became segments. */
interface LegacyFields {
  text?: string;
  symbols?: LabelSymbol[];
  symbolPosition?: "left" | "right";
  /** Letter height, weight and symbol height, before they moved onto each segment. */
  maxCapHeight?: number;
  weight?: Weight;
  symbolSize?: number;
}

/** One text with a row of symbols beside it, as segments in the same order. */
function legacySegments({ text, symbols, symbolPosition }: LegacyFields): Partial<Segment>[] {
  if (!Array.isArray(symbols) || JSON.stringify(symbols) === OLD_DEFAULT_SYMBOLS) {
    symbols = DEFAULT_STATE.segments.filter((s) => !isText(s)).map(({ kind, headShape, drives }) => ({ kind, headShape, drives }));
  }
  // The text used to fill the width the symbols left.
  const textSegments = text?.trim() || !symbols.length ? [{ kind: "text" as const, text: text ?? "", grow: true }] : [];
  return symbolPosition === "right" ? [...textSegments, ...symbols] : [...symbols, ...textSegments];
}

/**
 * Bring a saved segment up to date: migrate old symbols, and fill in the
 * style that used to be one setting for the whole label.
 */
function restoreSegment(seg: Partial<Segment>, label: LegacyFields & { align?: Align }): Segment {
  if (seg.kind === "text") {
    const text = seg as Partial<TextSegment>;
    return {
      ...text,
      kind: "text",
      text: text.text ?? "",
      align: text.align ?? label.align ?? TEXT_DEFAULTS.align,
      weight: text.weight ?? label.weight ?? TEXT_DEFAULTS.weight,
      maxCapHeight: text.maxCapHeight ?? label.maxCapHeight ?? TEXT_DEFAULTS.maxCapHeight,
    };
  }
  const symbol = migrateSymbol(seg as LabelSymbol);
  return {
    ...symbol,
    ...(seg.grow ? { grow: true } : {}),
    align: seg.align ?? "center",
    size: (seg as { size?: number }).size ?? label.symbolSize ?? SYMBOL_SIZE,
  };
}

/** Fill in missing fields and migrate old symbols in a saved label. */
function restoreLabel(saved: Partial<LabelState> & LegacyFields): LabelState {
  const { text, symbols, symbolPosition, maxCapHeight, weight, symbolSize, ...rest } = saved;
  const state: LabelState = { ...DEFAULT_STATE, id: newId(), ...rest };
  // Labels from before there was a choice are Cullenect ones.
  if (!isBaseKind(state.base)) state.base = DEFAULT_STATE.base;
  const segments: Partial<Segment>[] = Array.isArray(saved.segments)
    ? saved.segments
    : legacySegments({ text, symbols, symbolPosition });
  state.segments = segments.map((s) => restoreSegment(s, saved));
  return state;
}

function singleLabel(label: LabelState): Session {
  return { labels: [label], selected: label.id };
}

/**
 * Restore a session from storage. Falls back to the single label saved by
 * earlier versions, and then to one default label.
 */
export function parseSession(saved: string | null, legacy: string | null): Session {
  try {
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Session>;
      const labels = (parsed.labels ?? []).map(restoreLabel);
      if (labels.length) {
        const selected = labels.some((l) => l.id === parsed.selected) ? parsed.selected! : labels[0].id;
        return { labels, selected };
      }
    }
    if (legacy) return singleLabel(restoreLabel(JSON.parse(legacy)));
  } catch {
    // Corrupt storage: start over rather than fail to load.
  }
  return singleLabel({ ...DEFAULT_STATE, id: newId() });
}

export function loadSession(): Session {
  try {
    return parseSession(localStorage.getItem(STORAGE_KEY), localStorage.getItem(LEGACY_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (private windows, blocked site data).
    return parseSession(null, null);
  }
}

/** Whether this browser has labels saved from an earlier visit. */
export function hasSavedSession() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null || localStorage.getItem(LEGACY_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Not critical; the labels just won't be remembered.
  }
}

/**
 * A blank label that keeps the size, print style and colours of `template`,
 * so a batch of labels comes out consistent.
 */
export function blankLabel(template: LabelState): LabelState {
  const { base, units, ribs, model, align, gap, margin, style, textDepth } = template;
  const { baseColor, textColor, symbolColor } = template;
  return {
    ...DEFAULT_STATE,
    id: newId(),
    segments: [textSegment("", template.segments.find(isText))],
    ...{ base, units, ribs, model, align, gap, margin, style, textDepth },
    ...{ baseColor, textColor, symbolColor },
  };
}

/**
 * Copies of label `id`, one per entry of `rows`, with that entry's segments,
 * inserted after it. Everything else is kept. Selects the first copy.
 */
export function cloneLabel(session: Session, id: string, rows: Segment[][]): Session {
  const at = session.labels.findIndex((l) => l.id === id);
  if (at < 0 || !rows.length) return session;
  const source = session.labels[at];
  const copies = rows.map((segments) => ({ ...source, id: newId(), segments }));
  const labels = [...session.labels.slice(0, at + 1), ...copies, ...session.labels.slice(at + 1)];
  return { labels, selected: copies[0].id };
}

/** Insert `label` after the selected one and select it. */
export function addLabel(session: Session, label: LabelState): Session {
  const at = session.labels.findIndex((l) => l.id === session.selected) + 1;
  const labels = [...session.labels.slice(0, at), label, ...session.labels.slice(at)];
  return { labels, selected: label.id };
}

/** Remove a label, selecting its neighbour. The last label can't be removed. */
export function removeLabel(session: Session, id: string): Session {
  const at = session.labels.findIndex((l) => l.id === id);
  if (at < 0 || session.labels.length === 1) return session;
  const labels = session.labels.filter((l) => l.id !== id);
  const selected = session.selected === id ? labels[Math.min(at, labels.length - 1)].id : session.selected;
  return { labels, selected };
}

export function updateLabel(session: Session, id: string, patch: Partial<LabelState>): Session {
  return { ...session, labels: session.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** All the text on the label, on one line, with `lineBreak` between its lines. */
function textLine(state: LabelState, lineBreak: string): string {
  return state.segments
    .filter(isText)
    .map((s) => s.text.trim().replace(/\s*\n\s*/g, lineBreak))
    .filter(Boolean)
    .join(" ");
}

/** A short name for the label list: the text on one line, or its symbols. */
export function labelTitle(state: LabelState): string {
  const text = textLine(state, " · ");
  if (text) return text;
  const symbols = state.segments.filter((s): s is SymbolSegment => !isText(s));
  if (symbols.length === 1) return symbolInfo(symbols[0].kind).name;
  return symbols.length ? `${symbols.length} symbols` : "Blank";
}

/** A file name based on the label text and holder, e.g. "label-M3-12-1u" or "label-M3-12-1u-pred". */
export function fileName(state: LabelState): string {
  const slug = textLine(state, " ")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]+/gu, "")
    .slice(0, 40);
  const base = state.base === "cullenect" ? "" : `-${state.base}`;
  return `label-${slug || "blank"}-${state.units}u${base}`;
}
