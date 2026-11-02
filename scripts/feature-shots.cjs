// Screenshots for the features page (src/components/Features.tsx).
// Run against a local build:  npm run build && npx vite preview --port 4173
// then:  node scripts/feature-shots.cjs [http://localhost:4173/]
// Writes PNGs to feature-shots/; convert them to WebP in public/features/.
const { chromium } = require("playwright");
const fs = require("fs");

const URL = process.argv[2] ?? "http://localhost:4173/";
const OUT = "feature-shots";
fs.mkdirSync(OUT, { recursive: true });

const text = (t, extra = {}) => ({ kind: "text", text: t, ...extra });
const screw = (headShape, drive, extra = {}) => ({ kind: "screw", headShape, drives: [drive], ...extra });
const label = (id, segments, extra = {}) => ({ id, segments, ...extra });
const session = (labels, selected = labels[0].id) => ({ labels, selected });

const SETS = {
  screws: session(
    [
      label("a", [screw("countersunk", "phillips"), text("M3 × 8")]),
      label("b", [screw("countersunk", "phillips"), text("M3 × 12")]),
      label("c", [screw("socket", "hex"), text("M3 × 16")]),
      label("d", [screw("socket", "hex"), text("M4 × 20")]),
      label("e", [{ kind: "nut", nutType: "regular", nutView: "both" }, text("M3 nut")]),
      label("f", [{ kind: "insert" }, text("M3 × 5\nheat-set")], { baseColor: "#1d4ed8" }),
    ],
    "c",
  ),
  holders: session(
    [
      label("a", [screw("pan", "torx"), text("Cullenect")], { base: "cullenect", units: 2 }),
      label("b", [screw("pan", "torx"), text("Legacy")], { base: "cullenect-legacy" }),
      label("c", [screw("pan", "torx"), text("Pred")], { base: "pred", units: 2, baseColor: "#e5e7eb", textColor: "#111827", symbolColor: "#111827" }),
    ],
    "a",
  ),
  segments: session([
    label("a", [
      screw("socket", "hex"),
      text("M5", { weight: "bold", maxCapHeight: 7 }),
      text("× 25\nDIN 912", { grow: true, align: "left", maxCapHeight: 4 }),
      { kind: "washer" },
    ], { units: 2, ribs: false }),
  ]),
  stacked: session(
    [
      label("a", [text("NUTS", { maxCapHeight: 6 }), text("WASHERS", { stack: true, maxCapHeight: 3.5 })], { units: 2, ribs: false, baseColor: "#15803d" }),
      label("b", [{ kind: "nut", nutType: "regular", nutView: "top", size: 8 }, text("M4", { maxCapHeight: 6 }), text("BOLTS", { stack: true, maxCapHeight: 3.5 })], { units: 2, ribs: false, baseColor: "#ea580c" }),
      label("c", [text("M5–M6", { maxCapHeight: 5.5 }), text("BOLTS + PINS", { stack: true, maxCapHeight: 3 })], { units: 2, ribs: false, baseColor: "#b91c1c" }),
    ],
    "b",
  ),
  colours: session([
    label("a", [
      screw("countersunk", "torx", { color: "#dc2626" }),
      text("Wood screw", { grow: true }),
      text("4 × 40", { color: "#facc15", weight: "bold" }),
    ], { units: 2, ribs: false, baseColor: "#1f2937" }),
  ]),
  get manyMore() {
    return session(Array.from({ length: 70 }, (_, i) => ({ ...SETS.many.labels[i % SETS.many.labels.length], id: `m${i}` })), "m0");
  },
  symbols: session(
    [
      label("a", [screw("socket", "hex", { style: "cullenect" }), screw("pan", "phillips", { view: "side", tapping: true }), screw("countersunk", "torx", { view: "drive" })], { units: 2, ribs: false }),
      label("b", [{ kind: "bolt", headShape: "socket", length: 20 }, { kind: "bolt", headShape: "countersunk", length: 12, slotted: true }], { units: 2, ribs: false }),
      label("c", [{ kind: "nut", nutType: "regular", nutView: "both" }, { kind: "nut", nutType: "lock", nutView: "side" }, { kind: "nut", nutType: "square" }, { kind: "nut", nutType: "tnut" }], { units: 2, ribs: false }),
      label("d", [{ kind: "washer" }, { kind: "lockwasher" }, { kind: "insert" }, screw("pan", "hex", { hexHead: true, drives: [] })], { units: 2, ribs: false }),
    ],
    "a",
  ),
  many: session(
    Array.from({ length: Number(process.env.MANY ?? 24) }, (_, i) =>
      label(`l${i}`, [screw(i % 2 ? "socket" : "countersunk", i % 3 ? "hex" : "phillips"), text(`M${2 + (i % 4)} × ${6 + 2 * i}`)], {
        units: 1 + (i % 3 === 0 ? 1 : 0),
        ribs: false,
        baseColor: ["#1f2328", "#1d4ed8", "#15803d"][i % 3],
      }),
    ),
  ),
};

async function open(browser, s, size = { width: 1300, height: 820 }, printer) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: "light" });
  await ctx.addInitScript(
    ([s, printer]) => {
      localStorage.setItem("gridfinity-labels:v2", JSON.stringify(s));
      localStorage.setItem("gridfinity-labels:sidebar-width", "380");
      if (printer) localStorage.setItem("gridfinity-labels:printer", JSON.stringify({ id: printer, custom: { width: 256, depth: 256 } }));
    },
    [s, printer],
  );
  const page = await ctx.newPage();
  await page.goto(URL);
  // Keep the downloads out of close-ups of the sidebar; shown separately.
  if (size.height > 1000) await page.addStyleTag({ content: ".export { display: none !important; }" });
  await page.waitForFunction(() => /built in|Smallest/i.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return page;
}

const shot = (el, name) => el.screenshot({ path: `${OUT}/${name}.png` });

(async () => {
  const browser = await chromium.launch();

  // The screw's options with the drive list open.
  let p = await open(browser, SETS.screws, { width: 1300, height: 1400 });
  await p.locator(".outline-row.child .outline-pick").first().click();
  await p.waitForTimeout(500);
  await p.locator('tr:has(th:text-is("Drive")) .icon-select > button, tr:has(td:text-is("Drive")) .icon-select > button').first().click();
  await p.waitForTimeout(400);
  {
    const a = await p.locator(".property-grid").boundingBox();
    const b = await p.locator('.icon-select ul[role="listbox"]').boundingBox();
    const y = Math.min(a.y, b.y), bottom = Math.max(a.y + a.height, b.y + b.height);
    await p.screenshot({ path: `${OUT}/screw-options.png`, clip: { x: a.x - 1, y: y - 1, width: a.width + 2, height: bottom - y + 2 } });
  }
  await p.context().close();

  // The whole app.
  p = await open(browser, SETS.screws);
  await p.screenshot({ path: `${OUT}/app.png` });
  // 3D view of several labels, the selected one lifted.
  await shot(p.locator(".viewer"), "preview");
  // The outline with a segment selected, and its property grid.
  // The add-segment palette.
  await p.locator(".add-menu summary").click();
  await p.waitForTimeout(300);
  await shot(p.locator(".add-menu"), "palette");
  await p.locator(".add-menu summary").click();

  // Clone dialog filled in like a spreadsheet.
  await p.locator(".outline-row").filter({ hasText: "M3 × 12" }).first().hover();
  await p.locator('.outline-row:has-text("M3 × 12") button[title="Clone into a table of copies"]').click();
  await p.waitForTimeout(400);
  const rows = [
    ["Socket", "Hex", "M3 × 25"],
    ["Socket", "Hex", "M3 × 30"],
    ["Countersunk", "Torx", "M4 × 12"],
    ["Countersunk", "Torx", "M4 × 16"],
  ];
  const cols = await p.locator(".clone-grid thead th[scope=col]").allTextContents();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length && c < rows[r].length; c++) {
      const cell = p.locator(`[data-cell="${r + 1}:${c}"]`);
      if ((await cell.count()) === 0) {
        await p.locator(".clone-grid-tools button").click();
        await p.waitForTimeout(100);
      }
      const tag = await cell.evaluate((e) => e.tagName);
      if (tag === "SELECT") await cell.selectOption({ label: rows[r][c] });
      else await cell.fill(rows[r][c]);
    }
  }
  await p.waitForTimeout(300);
  await shot(p.locator(".clone-dialog"), "clone-dialog");
  await p.locator(".clone-dialog button.primary").click();
  await p.waitForTimeout(3000);
  await shot(p.locator(".outline"), "clone-result");
  await p.context().close();

  // Label holders side by side.
  p = await open(browser, SETS.holders);
  await p.evaluate(() => {
    const r = document.querySelectorAll('input[type=range]');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(r[0], "0"); set(r[1], "8");
  });
  await p.waitForTimeout(800);
  await shot(p.locator(".viewer canvas"), "holders");
  await p.context().close();

  // A label of mixed segments.
  p = await open(browser, SETS.segments);
  await shot(p.locator(".viewer canvas"), "segments");
  await shot(p.locator(".outline"), "segments-outline");
  await p.context().close();

  // Stacked segments: a big line over a small one.
  p = await open(browser, SETS.stacked);
  await p.evaluate(() => {
    const r = document.querySelectorAll('input[type=range]');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(r[0], "0"); set(r[1], "6");
  });
  await p.waitForTimeout(800);
  await shot(p.locator(".viewer canvas"), "stacked");
  await p.context().close();

  // Every symbol.
  p = await open(browser, SETS.symbols);
  await p.evaluate(() => {
    const r = document.querySelectorAll('input[type=range]');
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(r[0], "0"); set(r[1], "4");
  });
  await p.waitForTimeout(800);
  await shot(p.locator(".viewer canvas"), "symbols");
  await p.context().close();

  // Per-segment colours.
  p = await open(browser, SETS.colours, { width: 1300, height: 1300 });
  await shot(p.locator(".viewer canvas"), "colours");
  await p.locator(".outline-row.child .outline-pick").first().click();
  await p.waitForTimeout(400);
  await shot(p.locator(".property-grid").first(), "colour-props");
  await p.context().close();

  // Many labels on the print bed.
  p = await open(browser, SETS.many, { width: 1300, height: 820 }, "bbl-h2s");
  await p.getByRole("button", { name: "Print bed" }).click();
  await p.waitForTimeout(2500);
  await shot(p.locator(".viewer canvas"), "print-bed");
  await shot(p.locator(".export"), "export");
  await p.context().close();

  // Bed with the purge corner of a P1S.
  p = await open(browser, SETS.manyMore, { width: 1300, height: 820 }, "bbl-p1s");
  await p.getByRole("button", { name: "Print bed" }).click();
  await p.waitForTimeout(2500);
  await shot(p.locator(".viewer canvas"), "print-bed-p1s");
  await p.context().close();

  await browser.close();
})();
