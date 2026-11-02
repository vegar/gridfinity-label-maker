import type { Weight } from "./label";

/** Label fonts bundled in public/fonts, each with a regular and a bold file. */
export const FONTS = {
  "open-sans": { name: "Open Sans", file: "OpenSans" },
  "barlow-semi-condensed": { name: "Barlow Semi Condensed", file: "BarlowSemiCondensed" },
  "roboto-condensed": { name: "Roboto Condensed", file: "RobotoCondensed" },
  "atkinson-hyperlegible": { name: "Atkinson Hyperlegible", file: "AtkinsonHyperlegible" },
} as const;

export type FontFamily = keyof typeof FONTS;

/** Labels from before there was a choice used Open Sans, so it stays the default. */
export const DEFAULT_FONT: FontFamily = "open-sans";

export const FONT_FAMILIES = Object.keys(FONTS) as FontFamily[];

export function isFontFamily(value: unknown): value is FontFamily {
  return typeof value === "string" && value in FONTS;
}

export function fontFile(family: FontFamily, weight: Weight): string {
  return `${FONTS[family].file}-${weight === "bold" ? "Bold" : "Regular"}.ttf`;
}

export function fontKey(family: FontFamily, weight: Weight): string {
  return `${family}/${weight}`;
}
