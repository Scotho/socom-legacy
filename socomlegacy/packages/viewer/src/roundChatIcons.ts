import type { Rgba } from '@s2u/gs';

/**
 * V21.R15a ROUND-CHAT (RC-4; a browser adaptation beside OT.R48 -- the original sends no open line in a round, research
 * 266 §3.1, §3.9): the two icons a round line carries beside its sender's name, and the three name colours.
 *
 * - The SKULL beside a dead sender is the disc's own: the HUD's dead voice channel's icon, `action_dead_zone.tif` (64 x
 *   64, `HUD_TXR.ZED` on every map; drawn by the original's voice element for the dead zone, research 170 R170.9, 227;
 *   the port already reads it, `./hudAssets` `HUD_LIBRARIES.HUD`). A skull and crossbones in the HUD icons' frame.
 * - The EYE beside a spectator is DRAWN: the owner asked for "a new eyeball icon" (H452, 2026-11-13, seat 8a) and no eye
 *   icon is on the disc -- every texture library's names were read (RC-4, 2026-11-13: of the eye-like names,
 *   `eyepiece.tif` in `RUN/UI/UI_TXR.ZED` is a scope's ring and `brown_eye.tif` / `blue_eye.tif` in the maps' `FLIB_TXR`
 *   are character eyeball textures, no icon). It is made here, at load, in the HUD icons' own style: the frame, the black
 *   field and the art colour are taken from the disc's spectators channel icon, `action_tune_spectators.tif` (the
 *   original's icon for the spectators, a group of figures), and an eye is drawn in its field. No pixel of the original's
 *   art is changed; the eye is ours, labelled so.
 */
export const ROUND_CHAT_SKULL_BITMAP = 'action_dead_zone.tif';
/** The disc icon the drawn eye takes its frame and colours from (`roundChatEyeIcon`). */
export const ROUND_CHAT_EYE_FRAME_BITMAP = 'action_tune_spectators.tif';

/**
 * ROUND_CHAT_NAME_COLOURS_ADAPTATION (V21.R15a; PROVISIONAL until the owner has seen them in a picture -- H452's "still
 * yours to see"), on the HUD's 0-128 scale (128 = full, as `./matchMessages` `MESSAGE_COLOURS`):
 * - `terrorist`: the original's own message red, `MESSAGE_COLOURS[5]` (128, 64, 64) -- readable over the game already;
 * - `spectator`: the scoreboard's spectators' name colour, `./scoreboard` `SPECTATOR_RGB_READING` (115, 115, 115);
 * - `seal`: no readable SEAL blue exists in the original (the scoreboard's bar (32, 32, 64) and the message window's
 *   (64, 64, 96) are too dark for a name over the game), so a lighter blue on the same hue's side, proposed.
 */
export const ROUND_CHAT_NAME_COLOURS_ADAPTATION = {
  seal: [72, 100, 128],
  terrorist: [128, 64, 64],
  spectator: [115, 115, 115],
} as const satisfies Record<'seal' | 'terrorist' | 'spectator', readonly [number, number, number]>;

/**
 * The HUD's two round-chat icons out of a map's HUD bitmaps (`./loadMap`'s `readHud`, the HUD's `setBitmaps`): the skull
 * as the disc draws it, the eye drawn in the spectators icon's frame; null where the map's read lacks one (the line then
 * draws no icon, `./hud`'s slot). For `./matchMessages` `setRoundChatIcons`.
 */
export function roundChatIconsFrom(bitmaps: Readonly<Record<string, Rgba>> | null | undefined): { skull: Rgba | null; eye: Rgba | null } {
  const frame = bitmaps?.[ROUND_CHAT_EYE_FRAME_BITMAP];
  return { skull: bitmaps?.[ROUND_CHAT_SKULL_BITMAP] ?? null, eye: frame ? roundChatEyeIcon(frame) : null };
}

/** The HUD icons' frame width, px, as `action_tune_spectators.tif` and `action_dead_zone.tif` draw it (3 px at 64). */
const FRAME_PX = 3;

/**
 * The spectators' EYE icon (see above): `frame`'s size, its outer `FRAME_PX` ring kept, its field cleared to the field's
 * own colour (its centre pixel), and an eye drawn in the brightest colour of `frame`'s art -- an almond outline, the
 * iris's ring and a filled pupil, coverage-blended (4 x 4 samples a pixel). Pure: the same frame gives the same icon.
 */
export function roundChatEyeIcon(frame: Rgba): Rgba {
  const { width: w, height: h } = frame;
  const src = frame.data;
  const data = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number): number => (y * w + x) * 4;
  const c = at(w >> 1, h >> 1);
  const field = [src[c]!, src[c + 1]!, src[c + 2]!, src[c + 3]!];
  // The art's colour: the brightest pixel of the frame bitmap's field.
  let art = [255, 255, 255];
  let best = -1;
  for (let y = FRAME_PX; y < h - FRAME_PX; y++) for (let x = FRAME_PX; x < w - FRAME_PX; x++) {
    const i = at(x, y), lum = src[i]! + src[i + 1]! + src[i + 2]!;
    if (lum > best) { best = lum; art = [src[i]!, src[i + 1]!, src[i + 2]!]; }
  }
  const s = w / 64;                                         // drawn on the 64 px grid, scaled to the frame's size
  const cx = w / 2, cy = h / 2;
  const halfW = 24 * s, halfH = 13 * s, line = 2.6 * s;     // the almond: two arcs meeting at the corners
  const irisR = 9.5 * s, irisLine = 2.4 * s, pupilR = 4.5 * s;
  /** How much of the eye's ink is at (px, py), 0 or 1 (one sample). */
  const ink = (px: number, py: number): boolean => {
    const dx = (px - cx) / halfW;
    if (Math.abs(dx) <= 1) {
      const lid = halfH * (1 - dx * dx);                    // the lid's height above and below the middle at px
      const dy = Math.abs(py - cy);
      if (Math.abs(dy - lid) <= line / 2) return true;      // the two lids
    }
    const r = Math.hypot(px - cx, py - cy);
    if (r <= pupilR) return true;                           // the pupil
    if (Math.abs(r - irisR) <= irisLine / 2) {
      const dxi = (px - cx) / halfW;                        // the iris clipped by the lids
      return Math.abs(dxi) <= 1 && Math.abs(py - cy) <= halfH * (1 - dxi * dxi);
    }
    return false;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    if (x < FRAME_PX || y < FRAME_PX || x >= w - FRAME_PX || y >= h - FRAME_PX) {
      data[i] = src[i]!; data[i + 1] = src[i + 1]!; data[i + 2] = src[i + 2]!; data[i + 3] = src[i + 3]!;
      continue;
    }
    let hits = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (ink(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
    const k = hits / 16;
    data[i] = Math.round(field[0]! + (art[0]! - field[0]!) * k);
    data[i + 1] = Math.round(field[1]! + (art[1]! - field[1]!) * k);
    data[i + 2] = Math.round(field[2]! + (art[2]! - field[2]!) * k);
    data[i + 3] = field[3]!;
  }
  return { width: w, height: h, data } as Rgba;
}
