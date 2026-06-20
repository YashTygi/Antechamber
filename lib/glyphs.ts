/**
 * Hand-tuned line glyphs (16×16, 1.5px stroke, currentColor) — replaces all
 * emoji. Shared by the React popup (via popup/icons.tsx) and the injected
 * content script (via the `icon()` string helper).
 */
export const GLYPH_PATHS = {
  check: '<path d="M3.5 8.4l3 3 6-7"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  arrowLeft: '<path d="M10.5 3.5L6 8l4.5 4.5"/><path d="M6 8h7"/>',
  undo: '<path d="M6 5.5L3.5 8 6 10.5"/><path d="M3.5 8h6.5a3 3 0 0 1 0 6H8.5"/>',
  refresh: '<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2"/><path d="M12.7 3.4v2.6h-2.6"/>',
  dot: '<circle cx="8" cy="8" r="2.4" fill="currentColor" stroke="none"/>',
} as const;

export type GlyphName = keyof typeof GLYPH_PATHS;

/** Full inline-SVG string for use in injected DOM (content script). */
export function icon(name: GlyphName, size = 16): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH_PATHS[name]}</svg>`
  );
}
