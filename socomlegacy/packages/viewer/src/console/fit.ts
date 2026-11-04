/**
 * The console launcher's scale (the S2U Briefing design system's prototype, `fit()`): the stage is a 1920x1080 console
 * screen drawn in rem (1rem = 16 design px), scaled to the viewport by the root font-size. Above 760 px wide the scale
 * is max(0.8, min(w / 1920, h / 1080)); at or below, the phone rule clamp(w / 560, 0.6, 0.85). Interface size (Options,
 * Display: 100 / 115 / 130 %) multiplies it. A browser adaptation with no original (OT.R28).
 */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;
export const NARROW_PX = 760;
/** Interface size's multipliers, by the option's value index. */
export const UI_SCALES = [1, 1.15, 1.3] as const;

/** The root font-size in px, to two decimals, for a `w` x `h` viewport at Interface size index `ui`. */
export function rootFontPx(w: number, h: number, ui: number): number {
  const m = UI_SCALES[ui] ?? 1;
  const s = w <= NARROW_PX ? Math.max(0.6, Math.min(0.85, w / 560)) : Math.max(0.8, Math.min(w / DESIGN_W, h / DESIGN_H));
  return Number((16 * s * m).toFixed(2));
}

/** Sets `doc`'s root font-size from `win`'s viewport. */
export function fit(doc: Document, win: Pick<Window, 'innerWidth' | 'innerHeight'>, ui: number): void {
  doc.documentElement.style.fontSize = rootFontPx(win.innerWidth, win.innerHeight, ui).toFixed(2) + 'px';
}
