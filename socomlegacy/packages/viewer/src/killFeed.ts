import type { BannerLine, BannerSegment } from './hud';
import { layoutText } from './hudFont';
import { devMode } from './source';

/**
 * WM-DATA-FEED: the kill feed in look 3B2 (a BROWSER ADAPTATION, product track; no original -- the original draws its
 * kill lines whole in the message window's colour 0, research 91 §10, `./netPage` `killLine`). The owner (INTAKE 47,
 * verbatim): "3B - but make sure the text is visually centered in the bar, and pick less washed out colors that more
 * closely resemble what we use for seal/terrorsit elsewhere. less pastelle." Look 3B is the mega mock's (call 3,
 * `agent/spc-mega-mock` ec5a404119, `megaMockKillFeed.ts`), built here the production way:
 * - each name in its side's colour (`SIDE_NAME_COLOURS_ADAPTATION`), the rest of the line in colour 0; a name whose side
 *   the page does not know (a seat that left, a spectator) in colour 0;
 * - the line whose subject is the local player or the player he watches (the killer; for a suicide or a fall, the one
 *   who died) carries the orange mark (`KILL_FEED_ORANGE`): a 2 px bar left of the line and a faint wash behind it,
 *   15 px high and centred on the letters' capitals (`killFeedMarkSpan`), drawn by the HUD's message window (`./hud`).
 * The line's text is `killLine`'s exactly, so its width, its wrap and every reader of the text are unchanged.
 */

/**
 * SIDE_NAME_COLOURS_ADAPTATION -- a BROWSER ADAPTATION (product look, the owner's ruling; no original): the side colours
 * of the kill feed's names and round chat's (`./matchMessages` `roundChatNameRgb`, look B3). Source: the owner's look
 * pick, INTAKE 47 ("3B ... pick less washed out colors that more closely resemble what we use for seal/terrorsit
 * elsewhere. less pastelle."), taken as the project's own side colours exactly -- the Forge's (`./forge/pieces`
 * `SIDE_COLOUR`: SEAL 0x5a9cff, Terrorist 0xe0503c), on the screen's 0..255 -- the controller's option 1, ruled despite
 * their contrast on the message window (3.60 / 2.54; the text's drop shadow carries them). Repeated here because the HUD
 * does not import the Forge; a test pins the pair equal to `SIDE_COLOUR`. The original holds no readable side colour that
 * is not pastel (the mock's NOTES-3: the scoreboard's bars (32, 32, 64) / (64, 32, 32) are too dark for a name).
 */
export const SIDE_NAME_COLOURS_ADAPTATION = {
  seal: [90, 156, 255],
  terrorist: [224, 80, 60],
} as const satisfies Record<'seal' | 'terrorist', readonly [number, number, number]>;

/** A side's name colour as the message window's pieces take it (0..1; 1 the screen's 255, as look 3B2 drew it). */
export function sideNameRgb(side: 'seal' | 'terrorist'): [number, number, number] {
  const [r, g, b] = SIDE_NAME_COLOURS_ADAPTATION[side];
  return [r / 255, g / 255, b / 255];
}

/**
 * KILL_FEED_ORANGE (look 3B): the mark's colour, the message window's own orange `./matchMessages` `MESSAGE_COLOURS[4]`
 * (128, 64, 32; `FUN_002b7530`, research 87 §14), GS 0..128 -- repeated here because `./hud` cannot import
 * `./matchMessages` (it imports `./hud`); a test pins the two equal.
 */
export const KILL_FEED_ORANGE = [128, 64, 32] as const;

/**
 * KILL_FEED_MARK_ADAPTATION (look 3B, INTAKE 47): the marked line's bar and wash, in the 640x448 frame's pixels: the bar
 * `bar` wide, `pad` left of the line's first letter; the wash from the bar to `pad` past the line's end; both `height`
 * high -- the window's line pitch (`HUD_LAYOUT.banner.pitch`, 15), so the wash never reaches the lines above or below --
 * at `killFeedMarkSpan` about the baseline. The bar at `barAlpha`, the wash at `washAlpha`, both times the line's fade.
 */
export const KILL_FEED_MARK_ADAPTATION = { bar: 2, pad: 3, height: 15, barAlpha: 1, washAlpha: 0.22 } as const;

/**
 * KILL_FEED_CAP_ROWS (look 3B2, the owner's "visually centered"): the rows of `font_text_01`'s 25-row cell the capitals,
 * the digits and the ascenders ink -- from row 5 to the foot (row 20, `./hudFont`'s letters' foot on the baseline) --
 * read off the disc's atlas (`font_text_01.tif` through `./hudAssets` `readHud` on `RUN/MP2.ZDB`; the dev-disc test in
 * `test/killFeed.test.ts` holds it). "Visually centred" is the cap box centred: the names and the weapons are
 * capitalised, and the few descenders hang below, as type does.
 */
export const KILL_FEED_CAP_ROWS = { top: 5, foot: 20 } as const;

/** The letters' cap box at a scale about the baseline, the 640x448 frame's pixels: `up` above it, `down` below it. */
export function killFeedCapBox(scale: number): { up: number; down: number } {
  const g = layoutText('H', 0, 0, scale).glyphs[0]!, row = g.h / 25;
  return { up: -(g.y + KILL_FEED_CAP_ROWS.top * row), down: g.y + KILL_FEED_CAP_ROWS.foot * row };
}

/**
 * The mark's span about the baseline (look 3B2): `KILL_FEED_MARK_ADAPTATION.height` centred on the cap box, the margins
 * above and below the capitals equal. At the window's 0.9: 13.5 up, 1.5 down (the caps y-12.3..y+0.3, 1.2 clear each way).
 */
export function killFeedMarkSpan(scale: number): { up: number; down: number } {
  const h = KILL_FEED_MARK_ADAPTATION.height, cap = killFeedCapBox(scale);
  const margin = (h - (cap.up + cap.down)) / 2;
  return { up: cap.up + margin, down: h - cap.up - margin };
}

/** One name of a kill line: the text drawn (a bot's marker kept) and the side it is coloured by; null, colour 0. */
export interface KillFeedName { name: string; side: 'seal' | 'terrorist' | null }

/** `./netPage` `killLine`'s `how`. */
export type KillFeedHow = 'weapon' | 'teamkill' | 'suicide' | 'fall' | 'orphan' | (string & {});

const piece = (text: string, side: 'seal' | 'terrorist' | null = null): BannerSegment =>
  side === null ? { text } : { text, rgb: sideNameRgb(side) };

/** Trims the segments' run as `String.trim` / `trimEnd` trims their joined text, dropping the pieces left empty. */
function trimmed(segs: BannerSegment[], start: boolean): BannerSegment[] {
  const out = segs.map((g) => ({ ...g }));
  if (start) for (const g of out) { g.text = g.text.trimStart(); if (g.text) break; }
  for (let i = out.length - 1; i >= 0; i--) { out[i]!.text = out[i]!.text.trimEnd(); if (out[i]!.text) break; }
  return out.filter((g) => g.text.length > 0);
}

/**
 * The kill feed's line (look 3B2): `killLine`'s text in pieces -- the names in their sides' colours, the words and the
 * weapon in colour 0 -- at the window's scale (`scale`), and `marked`, the orange mark. The branches are `killLine`'s
 * (`./netPage`), and a test holds the pieces' text equal to it for every branch.
 */
export function killFeedLine(how: KillFeedHow, killer: KillFeedName | null, victim: KillFeedName, weapon: string | null,
  marked: boolean, scale: number): BannerLine {
  const w = weapon ?? '';
  let segs: BannerSegment[];
  if (how === 'fall') segs = [piece(victim.name, victim.side), piece(' falls to their death')];
  else if (how === 'orphan') segs = trimmed([piece(killer?.name ?? '', killer?.side), piece(' fragged '), piece(victim.name, victim.side), piece(` with ${w}`)], true);
  else if (how === 'suicide' || killer === null || killer.name === victim.name) {
    segs = trimmed([piece(victim.name, victim.side), piece(` commits suicide with ${w}`)], false);
  } else segs = trimmed([piece(killer.name, killer.side), piece(' fragged '), piece(victim.name, victim.side), piece(` with ${w}`)], false);
  const text = segs.map((g) => g.text).join('');
  const [r, g, b] = KILL_FEED_ORANGE;
  return { text, scale, segments: segs, ...(marked ? { feedMark: [r / 128, g / 128, b / 128] as [number, number, number] } : {}) };
}

/** Which seat a kill line is about: the killer, or for a suicide, a world kill or a fall the one who died. */
export function killFeedSubject(how: KillFeedHow, killer: number | null, victim: number): number | null {
  if (how === 'fall' || how === 'suicide' || killer === victim) return victim;
  if (killer === null) return how === 'orphan' ? null : victim;
  return killer;
}

/**
 * KILL_FEED_PREVIEW_HOOK: the window name of WM-DATA-FEED's capture hook (`seatKillFeedPreview`), the one place it is
 * written -- a release build is scanned for it and must not hold it (`test/build_keyboard.test.ts`).
 */
export const KILL_FEED_PREVIEW_HOOK = '__s2uKillFeedPreview';

/**
 * WM-DATA-FEED's capture (a test instrument, no original; `e2e/zz-kill-feed-look.spec.ts`): on a development build
 * opened with `?devmode` (`./source` `devMode`), hangs the window's `KILL_FEED_PREVIEW_HOOK` -- which posts kill lines
 * built by `killFeedLine` onto this HUD's message window -- for the spec to stage the feed. The HUD's constructor calls it
 * under a literal `import.meta.env.DEV`, which every `vite build` folds away, so a release holds neither the call nor the
 * hook.
 */
export function seatKillFeedPreview(hud: { postMessage(lines: BannerLine[]): void; clearPostsForDev(): void }, scale: number): void {
  if (typeof window === 'undefined' || !devMode(window.location?.search ?? '')) return;
  (window as unknown as Record<string, unknown>)[KILL_FEED_PREVIEW_HOOK] = (
    kills: { how: KillFeedHow; killer: KillFeedName | null; victim: KillFeedName; weapon: string | null; marked?: boolean }[],
    clear = false,
  ): boolean => {
    if (clear) hud.clearPostsForDev();
    for (const k of kills) hud.postMessage([killFeedLine(k.how, k.killer, k.victim, k.weapon, k.marked === true, scale)]);
    return true;
  };
}
