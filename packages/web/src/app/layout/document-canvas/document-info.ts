/** What the canvas measures in the rendered CV, for the status bar. */
export interface DocumentInfo {
  /** Estimate: document height over page height. The exact count comes from the PDF render. */
  readonly pages: number;
  /** First family of the body's font-family, as declared; null before the document loads. */
  readonly font: string | null;
  /** Scale the sheet is shown at, 1 = 100%. */
  readonly scale: number;
}

export function pageCount(contentHeight: number, pageHeight: number): number {
  return Math.max(1, Math.ceil(contentHeight / pageHeight - 0.01));
}

/** "'Source Sans 3', Arial, sans-serif" → "Source Sans 3". */
export function primaryFontFamily(fontFamily: string): string | null {
  const first = fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  return first || null;
}
