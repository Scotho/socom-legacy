import { MESSAGE_SCALE, type BannerLine, type Hud } from './hud';

/**
 * MATCH-GAPS (web research 222 §9): a line the player's own SEAL posts on the HUD's message window, as the game posts
 * one -- `FUN_002b6530(scale, window, text, colour, centred, fade)` (research 87 §14) onto the `Hud`'s window
 * (`Hud.postMessage`: the main window 0x4366a0, `messages.rdr`'s place, its 7 s fade). The claymore's refusal is the
 * one such post the front end's match lacked (research 222 §4 row 14).
 */

/**
 * The message window's colours (`FUN_002b7530` L158316, `colour & 0xff`; research 87 §14): 0 (128, 128, 128), 1 (128,
 * 128, 64), 2 (64, 64, 96), 3 (64, 128, 64), 4 (128, 64, 32), 5 (128, 64, 64) -- the GS's 128 being 1 -- all alpha 100.
 */
export const MESSAGE_COLOURS: readonly (readonly [number, number, number])[] = [
  [128, 128, 128], [128, 128, 64], [64, 64, 96], [64, 128, 64], [128, 64, 32], [128, 64, 64],
];

/** The six as a Forge message step's Colour choice names them (a browser adaptation: names only, the colours the game's). */
export const MESSAGE_COLOUR_NAMES: readonly string[] = ['White', 'Yellow', 'Slate blue', 'Green', 'Orange', 'Red'];

/** The claymore's refusal posts in colour 2 (`FUN_005be9a0` D:L475331: `FUN_002b6530(..., 0x65f880, 2, 0, 0)`). */
export const CLAYMORE_REFUSAL_COLOUR = 2;

/**
 * CLAYMORE_REFUSAL_SCALE_READING: the refusal's scale -- the window's own (`MESSAGE_SCALE`). Read at the source (PAR-96,
 * 2026-10-16; reading, pending review): the decompiled call (`FUN_005be9a0` D:L475331, the PMN's D:L475363) drops
 * `FUN_002b6530`'s float first argument (`$f12`), and the disassembly before it has `mtc1 $zero, $f12` (0x5beb30; the
 * PMN's 0x5bec44) -- the 0.0 the `+0x8` timer is compared with (D:L475330) -- and no write of `$f12` up to the call
 * (`jal 0x2b6530` at 0x5beb5c, 0x5bec70): a scale of 0.0, which takes the window's scale (D:L157983-157987). The name is
 * kept until a rename. Was: "the decompiled call ... shows ... not the float scale ..., so it is taken as the window's
 * own ... Settled by the disassembly before the call at 0x5be9a0's post or a capture of the refusal." [reading]
 */
export const CLAYMORE_REFUSAL_SCALE_READING = MESSAGE_SCALE;

/** One posted line in the window's colour `colour` (`MESSAGE_COLOURS`) at `scale`, as the `Hud` draws it (`BannerLine`). */
export function messageLine(text: string, colour: number, scale: number): BannerLine {
  const [r, g, b] = MESSAGE_COLOURS[colour & 0xff] ?? MESSAGE_COLOURS[0]!;
  return { text, scale, rgb: [r / 128, g / 128, b / 128] };
}

/**
 * The claymore's refusal (`GrenadeThrower`'s `refuse`, its text `CLAYMORE_RULES.maxPlacedMessage`, 0x65f880) posted on
 * the HUD's message window in colour 2. Not centred in the original (its fifth argument 0); the `Hud` centres every
 * line of its window (research 222 §9, kept).
 */
export function refusalLine(hud: Pick<Hud, 'postMessage'>): (text: string) => void {
  return (text) => { hud.postMessage([messageLine(text, CLAYMORE_REFUSAL_COLOUR, CLAYMORE_REFUSAL_SCALE_READING)]); };
}

/**
 * A Forge switch's script's message (`./forge/placedAccess`): the window's own post as before, or -- with a `colour`
 * (FORGE_MESSAGE_COLOUR_ADAPTATION, the owner, 2026-11-10: "specify the color of that message") -- a line in that one of
 * the window's six colours (`MESSAGE_COLOURS`) at the window's scale.
 */
export function postScriptMessage(hud: Pick<Hud, 'postMessage'>, text: string, colour?: number): void {
  if (colour === undefined) hud.postMessage(text);
  else hud.postMessage([messageLine(text, colour, MESSAGE_SCALE)]);
}
