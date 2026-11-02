import { describe, expect, it } from "vitest";
import { WHATS_NEW, startDialog, entryHref, newestEntry, unseenEntries, type WhatsNewEntry } from "../src/whatsNew";

const entries: WhatsNewEntry[] = [
  { at: "2026-10-01T10:00Z", text: "old", section: "holders" },
  { at: "2026-11-02T19:00Z", text: "newest", section: "segments" },
  { at: "2026-11-02T18:00Z", text: "same day" },
];

describe("what's new", () => {
  it("finds the newest entry whatever the order", () => {
    expect(newestEntry(entries)).toBe("2026-11-02T19:00Z");
    expect(newestEntry([])).toBeUndefined();
  });

  it("shows only entries after the last one seen, newest first", () => {
    expect(unseenEntries("2026-10-01T10:00Z", entries).map((e) => e.text)).toEqual(["newest", "same day"]);
    expect(unseenEntries("2026-11-02T18:00Z", entries).map((e) => e.text)).toEqual(["newest"]);
    expect(unseenEntries("2026-11-02T19:00Z", entries)).toEqual([]);
  });

  it("welcomes a first-time visitor and shows a returning one what they haven't seen", () => {
    expect(startDialog(null, false, entries)).toEqual({ kind: "welcome" });
    expect(startDialog(null, true, entries)).toMatchObject({ kind: "news", entries: { length: 3 } });
    expect(startDialog("2026-11-02T18:00Z", true, entries)).toMatchObject({ kind: "news", entries: [{ text: "newest" }] });
    expect(startDialog("2026-11-02T19:00Z", true, entries)).toBeNull();
  });

  it("links to the section on the features page", () => {
    expect(entryHref(entries[0])).toBe("#features/holders");
    expect(entryHref(entries[2])).toBe("#features");
  });

  it("has valid, unique times and real feature sections", () => {
    const sections = ["holders", "segments", "symbols", "print", "labels", "preview", "export", "layout"];
    for (const e of WHATS_NEW) {
      expect(Number.isNaN(Date.parse(e.at))).toBe(false);
      if (e.section) expect(sections).toContain(e.section);
    }
    expect(new Set(WHATS_NEW.map((e) => e.at)).size).toBe(WHATS_NEW.length);
  });
});
