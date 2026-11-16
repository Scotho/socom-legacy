/**
 * The paint brushes' cursor (the owner, 2026-11-15: "another cursor ... to indicate we are painting"; a browser
 * adaptation, FG.R2): a ring and a dot in the paint's colour, outlined dark so it reads on any surface; its hotspot the
 * dot. The collision brush's (`./geometry/editor`) and the AI cells' (`./aiPaint`).
 */
export const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
/**
 * The texture sampler's cursor (the owner, 2026-11-16: "it changes the cursor icon to a sample icon"): an eyedropper,
 * outlined dark, its hotspot the tip (lower left).
 */
export const sampleCursor = (): string => {
  const path = 'M15.5 3.5a2.1 2.1 0 0 1 3 3L16 9l1 1-1.5 1.5-1-1-6.8 6.8a2 2 0 0 1-1 .55L4 19l.7-2.7a2 2 0 0 1 .55-1L12 8.5l-1-1L12.5 6l1 1z';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='${path}' fill='white' stroke='black' stroke-width='3' stroke-linejoin='round'/><path d='${path}' fill='white' stroke='white' stroke-width='0.5' stroke-linejoin='round'/><path d='M4 19l.7-2.7 2 2z' fill='black'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 19, crosshair`;
};
export const brushCursor = (c: number): string => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='8' fill='none' stroke='black' stroke-width='4'/><circle cx='12' cy='12' r='8' fill='none' stroke='${hexOf(c)}' stroke-width='2'/><circle cx='12' cy='12' r='2.5' fill='${hexOf(c)}' stroke='black' stroke-width='1'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
};
