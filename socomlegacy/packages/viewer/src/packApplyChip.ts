import { setHudChipDrawer, hudChipDrawer, WHITE, type HudChipDrawer, type HudQuad } from './hud';
import { FONT_TEXT_01, layoutText, textWidth } from './hudFont';
import { packApplyWords, type PackApplyProgress } from './packApplyOverlay';
import { SCORE_LAYOUT } from './scoreboard';
import { START_MENU_BAR, START_MENU_CONFIRM_LAYOUT, START_MENU_LAYOUT } from './startMenu';

/**
 * WM-PACKS-CHIP (the owner's picks of MEGA-MOCK call 8: "texture pack menu 8b is my pref", "texture pack chip without
 * size warning"): the loading chip a texture pack's apply shows -- a small corner chip, "LOADING HD TEXTURES" over
 * "1,326 of 3,900" and a thin bar -- drawn by the match's HUD on its layer 1 from the HUD's own primitives (the START
 * menu's confirm boxes and title colour, `./startMenu`; the scoreboard's row text and header green, `./scoreboard`;
 * `font_text_01` with its drop shadow), and by the page's DOM overlay (`./packApplyOverlay`) out of a match.
 */
export const PACK_APPLY_CHIP_ADAPTATION =
  'A browser adaptation with no original (product track): a corner chip -- "LOADING HD TEXTURES" (a GX per-map pack: "LOADING TEXTURES"), the count "n of N" and a thin bar -- while a texture pack applies, drawn by the match\'s HUD on layer 1 clear of the compass ring and by the page\'s DOM overlay out of a match; it stores nothing, reads no stored key and never pauses the simulation.' as const;

/** The chip's title: the owner's 8B words for the HD pack; for any other (a GX per-map pack) without "HD". */
export const PACK_APPLY_CHIP_TEXT = { hd: 'LOADING HD TEXTURES', other: 'LOADING TEXTURES' } as const;

/** Which pack applies: the HD pack, or a GX per-map pack (`gx`, the default where a page does not say). */
export type PackApplyKind = 'hd' | 'gx';
/** What the HUD's chip draws: the apply's progress and which pack it is. */
export interface PackApplyChip { progress: PackApplyProgress; kind: PackApplyKind }

/** "1,326 of 3,900": the count with thousands separators. */
export function packApplyCount(applied: number, total: number): string {
  const n = (v: number): string => String(Math.max(0, Math.trunc(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n(applied)} of ${n(total)}`;
}

/** The chip's two lines: the title, and the count (none before the pack names a texture here) or a refusal's words. */
export function packApplyChipWords(p: PackApplyProgress, kind: PackApplyKind): { title: string; line: string } {
  const title = kind === 'hd' ? PACK_APPLY_CHIP_TEXT.hd : PACK_APPLY_CHIP_TEXT.other;
  if (p.refused) return { title, line: packApplyWords(p) };
  return { title, line: p.total > 0 ? packApplyCount(p.applied, p.total) : '' };
}

/**
 * The chip on the 640 x 448 frame, anchored to the frame's right edge (x scaled by the frame's height, as the HUD's
 * right-hand elements are). Its whole box, bar and glyph cells included, ends at y 38: 4 above the compass ring's top
 * (`./hud` `HUD_LAYOUT.compass`, centred on (565, 90), 96 high: y 42-138). The mock's chip (y 8-46) met the ring.
 */
export const PACK_APPLY_CHIP_LAYOUT = {
  x0: 446, y0: 2, x1: 632, y1: 38, inset: 2, padX: 8, lineYs: [15, 28] as const, scale: 0.8, bar: { y0: 31, h: 3 },
} as const;

type Rgb = readonly [number, number, number];
type Sizes = Record<string, { width: number; height: number }>;

/** A line cut to `max` wide at `scale`, ended with "..." when cut. */
function fitLine(line: string, scale: number, max: number): string {
  if (textWidth(line, scale) <= max) return line;
  let s = line;
  while (s.length > 0 && textWidth(`${s}...`, scale) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/**
 * The chip's quads on a frame (layer 1, element `packChip`): the START confirm's frame and inside boxes, the title in
 * the START menu title's gold, the count in the scoreboard's row grey, the bar's back in the START bar's peak colour and
 * its fill in the scoreboard's header green by applied of total (none on a refusal). Nothing without a progress, nor
 * once done, nor without the HUD's white texel and font.
 */
export function drawPackApplyChip(frame: { width: number; height: number }, sizes: Sizes, chip: PackApplyChip | null): HudQuad[] {
  if (!chip) return [];
  const p = chip.progress;
  if (p.done && !p.refused) return [];
  if (!sizes[WHITE] || !sizes[FONT_TEXT_01.texture]) return [];
  const L = PACK_APPLY_CHIP_LAYOUT, C = START_MENU_CONFIRM_LAYOUT, T = START_MENU_LAYOUT, S = SCORE_LAYOUT;
  const s = frame.height / 448;
  const X = (x: number): number => frame.width - (640 - x) * s, Y = (y: number): number => y * s;
  const quads: HudQuad[] = [];
  const quad = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number], uv: [number, number, number, number] = [0, 0, 1, 1]): void => {
    if (rgba[3] <= 0 || x1 <= x0) return;
    quads.push({ element: 'packChip', texture, x: (X(x0) + X(x1)) / 2, y: (Y(y0) + Y(y1)) / 2, w: (x1 - x0) * s, h: (y1 - y0) * s, turn: 0, u0: uv[0], v0: uv[1], u1: uv[2], v1: uv[3], rgba, layer: 1 });
  };
  /** A box in 640 x 448 units, its colour on the 0..255 scale the START menu's boxes use, alpha on the GS's 0..128. */
  const box = (x0: number, y0: number, x1: number, y1: number, rgb: Rgb, alpha: number): void =>
    quad(WHITE, x0, y0, x1, y1, [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, alpha / 128]);
  /** A line of `font_text_01` from `x` (colour on the GS's 0..128), with the face's drop shadow. */
  const text = (line: string, x: number, y: number, rgb: Rgb, alpha: number): void => {
    if (!line.trim()) return;
    const { glyphs } = layoutText(line, x, y, L.scale);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    const shadow = Math.min(alpha, Math.trunc(FONT_TEXT_01.dropShadow.opacity * 128)) / 128;
    for (const g of glyphs) {
      if (g.texture) continue;
      const uv: [number, number, number, number] = [g.u0, g.v0, g.u1, g.v1];
      const sx = g.x + dx * L.scale, sy = g.y + dy * L.scale;
      quad(FONT_TEXT_01.texture, sx, sy, sx + g.w, sy + g.h, [0, 0, 0, shadow], uv);
      quad(FONT_TEXT_01.texture, g.x, g.y, g.x + g.w, g.y + g.h, [rgb[0] / 128, rgb[1] / 128, rgb[2] / 128, alpha / 128], uv);
    }
  };
  const words = packApplyChipWords(p, chip.kind), room = L.x1 - L.x0 - 2 * L.padX;
  box(L.x0, L.y0, L.x1, L.y1, C.frame.rgb, C.frame.alpha);
  box(L.x0 + L.inset, L.y0 + L.inset, L.x1 - L.inset, L.y1 - L.inset, C.inside.rgb, C.inside.alpha);
  text(fitLine(words.title, L.scale, room), L.x0 + L.padX, L.lineYs[0], T.title.rgb, T.title.alpha);
  text(fitLine(words.line, L.scale, room), L.x0 + L.padX, L.lineYs[1], S.rowRgb, Math.round(S.rowAlpha * 128));
  const bx0 = L.x0 + L.padX, bx1 = L.x1 - L.padX, share = !p.refused && p.total > 0 ? Math.min(1, p.applied / p.total) : 0;
  box(bx0, L.bar.y0, bx1, L.bar.y0 + L.bar.h, START_MENU_BAR.peak, C.box.alpha);
  box(bx0, L.bar.y0, bx0 + (bx1 - bx0) * share, L.bar.y0 + L.bar.h, S.left.headerRgb, 128);
  return quads;
}

/**
 * The feeds the HUD reads: the page's overlay's `hudChip` (`./packApplyOverlay`), set by each page that mounts a match
 * (`./main`, `./matchMount`). Feeding installs the chip's drawer on the HUD's hook (`./hud` `setHudChipDrawer`, which
 * `Hud.render` calls -- hud.ts imports nothing of this module at runtime, an import cycle otherwise). WM-PACKS-CHIP
 * review F3: the feeds stack -- the latest one with a chip to draw draws (a prepared match's hidden overlay gives none,
 * so the shown one's draws); its off removes only its own entry, so an earlier mount's feed draws again, and the last
 * off clears the drawer if it is still the chip's. A page with no feed draws no chip.
 */
const feeds: (() => PackApplyChip | null)[] = [];
const drawChip: HudChipDrawer = (frame, sizes) => drawPackApplyChip(frame, sizes, packApplyChipNow());
export function feedPackApplyChip(source: () => PackApplyChip | null): () => void {
  const entry = (): PackApplyChip | null => source();   // its own entry: the same source fed twice is two entries
  feeds.push(entry);
  setHudChipDrawer(drawChip);
  return () => {
    const i = feeds.lastIndexOf(entry);
    if (i < 0) return;
    feeds.splice(i, 1);
    if (feeds.length === 0 && hudChipDrawer() === drawChip) setHudChipDrawer(null);
  };
}
/** The chip the HUD draws now: the latest feed's that has one; null with no feed, or when every page's overlay draws its own. */
export function packApplyChipNow(): PackApplyChip | null {
  for (let i = feeds.length - 1; i >= 0; i--) {
    let chip: PackApplyChip | null = null;
    try { chip = feeds[i]!() ?? null; } catch { chip = null; }
    if (chip) return chip;
  }
  return null;
}
