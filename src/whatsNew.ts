// "What's new": one line per feature, newest first, each pointing at its
// section on the features page. The dialog shows the entries a visitor
// hasn't seen yet, remembered by the time of the newest entry they were shown.
//
// When a feature is added, add a line at the top of WHATS_NEW with the time it
// was merged and the id of its group in Features.tsx (the link goes to
// #features/<section>).

export interface WhatsNewEntry {
  /** When the feature went live, as an ISO date and time (UTC), e.g. "2026-11-02T19:00Z". */
  at: string;
  text: string;
  /** Group id on the features page, e.g. "holders"; leave out to link to the top of the page. */
  section?: string;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    at: "2026-11-02T19:00Z",
    text: "Stack a segment under the one before it, such as a big “NUTS” over a small “WASHERS”.",
    section: "segments",
  },
  {
    at: "2026-11-02T18:53Z",
    text: "Put text on USSA Vault labels, or any other commercial label, by uploading the label file you bought.",
    section: "holders",
  },
];

const STORAGE_KEY = "gridfinity-labels:whats-new";

/** The `at` of the newest entry, for remembering what has been shown. */
export function newestEntry(entries: WhatsNewEntry[] = WHATS_NEW): string | undefined {
  return entries.reduce<string | undefined>((max, e) => (!max || time(e.at) > time(max) ? e.at : max), undefined);
}

/** Entries newer than `lastSeen`, newest first. With nothing seen, every entry is new. */
export function unseenEntries(lastSeen: string | null | undefined, entries: WhatsNewEntry[] = WHATS_NEW) {
  const seen = lastSeen ? time(lastSeen) : NaN;
  return entries
    .filter((e) => Number.isNaN(seen) || time(e.at) > seen)
    .sort((a, b) => time(b.at) - time(a.at));
}

/**
 * What to show at page load. A first-time visitor has nothing to catch up on,
 * so they see nothing and the current entries count as seen; a visitor from
 * before this dialog existed (they have saved labels) sees every entry.
 */
export function entriesToShow(lastSeen: string | null, returning: boolean, entries: WhatsNewEntry[] = WHATS_NEW) {
  if (!lastSeen && !returning) return [];
  return unseenEntries(lastSeen, entries);
}

export function loadLastSeen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastSeen(at: string | undefined = newestEntry()) {
  if (!at) return;
  try {
    localStorage.setItem(STORAGE_KEY, at);
  } catch {
    // Not critical; the dialog will just show again next time.
  }
}

/** The entry's date for display, e.g. "2 November 2026". */
export function entryDate(at: string) {
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** The features page link for an entry. */
export function entryHref(entry: WhatsNewEntry) {
  return entry.section ? `#features/${entry.section}` : "#features";
}

function time(at: string) {
  return Date.parse(at);
}
