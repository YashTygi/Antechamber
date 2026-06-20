import { GLYPH_PATHS, type GlyphName } from '@/lib/glyphs';

export function Icon({ name, size = 16 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: GLYPH_PATHS[name] }}
    />
  );
}

/** The brand monogram: an inked "threshold" (a doorway you step through). */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="6" fill="var(--reward-soft)" stroke="var(--reward-mid)" strokeWidth="1" />
      <path d="M7 17 V12 a5 5 0 0 1 10 0 V17" fill="none" stroke="var(--reward)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 17.2 H18" stroke="var(--reward)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
