import type { Rgba } from '@s2u/gs';
import { MESSAGE_SCALE } from './hudLayout';
import type { BannerLine, Hud } from './hud';
import { sideNameRgb } from './killFeed';
import type { RoundChatSender, ServerEvent } from './net/protocol';
import { ROUND_CHAT_EYE_FRAME_BITMAP, ROUND_CHAT_NAME_COLOURS_ADAPTATION, ROUND_CHAT_SKULL_BITMAP } from './roundChatIcons';

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

/*
 * RC-3 ROUND-CHAT (V21.R15a, H452; the plan `docs/plans/2026-11-13-round-chat.md`): a BROWSER ADAPTATION beside OT.R48.
 * The original sends no open line in a round (research 266 §3.1, §3.9); the server relays one under the round's rule
 * (RC.R1) with the sender's side and life (`chat`'s `round`, RC.R2), and the page draws it on the HUD's message window
 * as `[icon] NAME: text` or `[icon] NAME (team): text` -- the name in its side's colour, the body in the window's colour
 * 0 (colour 3, the team's green, on a team line), a skull beside a dead player and an eyeball beside a spectator --
 * unless IN-GAME TEXT MESSAGES is OFF (`EnableExternalWhispers` 0, the owner's answer (e) in H452). Nothing of the game's
 * own lines changes.
 */

/**
 * ROUND_CHAT_NAME_COLOURS_ADAPTATION -- the sender's name by his side, on the GS's 0..128 (128 as 1) as `MESSAGE_COLOURS`:
 * RC-4's, with their sources (`./roundChatIcons`; the Terrorists' the original's message red, the spectators' the
 * scoreboard's reading, the SEALs' a proposed lighter blue), PROVISIONAL until the owner has seen them in a picture
 * (H452). Re-exported here for the line's builder.
 */
export { ROUND_CHAT_NAME_COLOURS_ADAPTATION };

/**
 * ROUND_CHAT_BODY_COLOUR_ADAPTATION: the body's colour in `MESSAGE_COLOURS` -- a plain line the window's colour 0 (the
 * colour the kill feed's and the round's own lines draw in, `BannerLine` with no `rgb`), a team line colour 3 (64, 128,
 * 64), the colour the HUD draws a teammate's tactical order in (`./matchChat` `commandLine`), as the brief's team green.
 */
export const ROUND_CHAT_BODY_COLOUR_ADAPTATION = { plain: 0, team: 3 } as const;

/**
 * ROUND_CHAT_ICON_BITMAPS_ADAPTATION: the HUD's names for the two icons (the seam RC-4 fills, `setRoundChatIcons`):
 * drawn only once the HUD holds a bitmap under the name; until then the slot draws nothing and takes no room.
 */
export const ROUND_CHAT_ICON_BITMAPS_ADAPTATION = { skull: 'round_chat_skull', eye: 'round_chat_eye' } as const;

/** The icon beside a round line's sender: an eyeball beside a spectator (no side), a skull beside a dead player, else none. */
export function roundChatIcon(sender: RoundChatSender): 'skull' | 'eye' | null {
  if (sender.side === null) return 'eye';
  return sender.dead ? 'skull' : null;
}

const by128 = (c: readonly number[]): [number, number, number] => [c[0]! / 128, c[1]! / 128, c[2]! / 128];

/**
 * ROUND_CHAT_LOOK_ADAPTATION (V21.R15a, H452; a browser adaptation, PROVISIONAL until the owner picks from the look sheet,
 * `e2e/zz-round-chat-look.spec.ts`): which of the sheet's options a round line draws in -- the one value to switch. Each
 * as the sheet draws it (the body in the window's colour 0, or 3 on a team line, in every option):
 * - `A` -- the original first: `NAME (All): text` / `NAME (Team): text`, the whole line in the body's colour (the game
 *   lobby's forms and colours), the disc's dead voice channel icon beside a dead sender and its spectators channel icon
 *   beside a spectator (`./roundChatIcons` `ROUND_CHAT_SKULL_BITMAP`, `ROUND_CHAT_EYE_FRAME_BITMAP`);
 * - `B` -- RC-4's (the build's until a pick): `NAME: text` / `NAME (team): text`, the name in its side's colour
 *   (`ROUND_CHAT_NAME_COLOURS_ADAPTATION`), the disc's skull, the drawn eye;
 * - `B2` -- B with the name colours that pass 4.5:1 on the bright frame (`ROUND_CHAT_B2_NAME_COLOURS_ADAPTATION`);
 * - `C1` -- A's forms, colours and icons, only the name tinted by side (B's colours);
 * - `C2` -- no icons: `(dead) ` or `(watching) ` before the name in colour 0, `NAME: text` / `NAME (Team): text`, the
 *   name tinted by side (B's colours);
 * - `B3` -- B with the SEAL and Terrorist names in the kill feed's side colours (`./killFeed`
 *   `SIDE_NAME_COLOURS_ADAPTATION`, the Forge's `SIDE_COLOUR`), the spectators' B's grey: WM-DATA-FEED's option 1 (the
 *   owner's look 3B2, INTAKE 47, "colors that more closely resemble what we use for seal/terrorsit elsewhere"), the build's.
 * RC-4's pastels (`B`) and the 4.5:1 set (`B2`) stay one constant away: set this switch back to 'B' or 'B2'.
 */
export type RoundChatLook = 'A' | 'B' | 'B2' | 'B3' | 'C1' | 'C2';
export const ROUND_CHAT_LOOK_ADAPTATION: RoundChatLook = 'B3';

/** The look sheet's B2 names (GS 128 as 1): the nearest SEAL blue and Terrorist red passing 4.5:1; the spectators' as B. */
export const ROUND_CHAT_B2_NAME_COLOURS_ADAPTATION = {
  seal: [92, 116, 128],
  terrorist: [128, 108, 108],
  spectator: ROUND_CHAT_NAME_COLOURS_ADAPTATION.spectator,
} as const satisfies Record<'seal' | 'terrorist' | 'spectator', readonly [number, number, number]>;

/**
 * The sender's name colour in `look` (0..1, the window's pieces' scale; `null` a spectator): B3 the kill feed's side colours
 * (`./killFeed` `sideNameRgb`, 1 the screen's 255) and B's grey for a spectator; B2 its own set; every other look B's.
 */
export function roundChatNameRgb(side: 'seal' | 'terrorist' | null, look: RoundChatLook = ROUND_CHAT_LOOK_ADAPTATION): [number, number, number] {
  if (look === 'B3' && side !== null) return sideNameRgb(side);
  return by128((look === 'B2' ? ROUND_CHAT_B2_NAME_COLOURS_ADAPTATION : ROUND_CHAT_NAME_COLOURS_ADAPTATION)[side ?? 'spectator']);
}

/** A round line as the message window draws it (`BannerLine`'s `segments` and `icon`), at the window's scale, in `look`. */
export function roundChatLine(
  ev: { name: string; text: string; team?: true; round: RoundChatSender }, look: RoundChatLook = ROUND_CHAT_LOOK_ADAPTATION,
): BannerLine {
  const body = by128(MESSAGE_COLOURS[ev.team ? ROUND_CHAT_BODY_COLOUR_ADAPTATION.team : ROUND_CHAT_BODY_COLOUR_ADAPTATION.plain]!);
  const lobbyForms = look === 'A' || look === 'C1';
  const name = look === 'A' ? body : roundChatNameRgb(ev.round.side, look);
  const form = lobbyForms ? (ev.team ? ' (Team)' : ' (All)') : ev.team ? (look === 'C2' ? ' (Team)' : ' (team)') : '';
  const rest = `${form}: ${ev.text}`;
  const state = look !== 'C2' ? '' : ev.round.side === null ? '(watching) ' : ev.round.dead ? '(dead) ' : '';
  const kind = look === 'C2' ? null : roundChatIcon(ev.round);
  const icon = kind === null ? null
    : lobbyForms ? (kind === 'skull' ? ROUND_CHAT_SKULL_BITMAP : ROUND_CHAT_EYE_FRAME_BITMAP)
    : ROUND_CHAT_ICON_BITMAPS_ADAPTATION[kind];
  return {
    text: `${state}${ev.name}${rest}`, scale: MESSAGE_SCALE, rgb: body,
    segments: [...(state ? [{ text: state, rgb: by128(MESSAGE_COLOURS[0]!) }] : []), { text: ev.name, rgb: name }, { text: rest, rgb: body }],
    ...(icon ? { icon } : {}),
  };
}

/**
 * The round line's post on a HUD (`NetPageDeps.roundChat`): drawn while IN-GAME TEXT MESSAGES is on (`external`, the
 * `./roundChat` `externalWhispers` of the session's option), else not at all; a line without `round` is not one.
 */
export function roundChatPost(d: { hud: Pick<Hud, 'postMessage'>; external(): boolean }): (ev: Extract<ServerEvent, { type: 'chat' }>) => void {
  return (ev) => {
    if (!ev.round || !d.external()) return;
    d.hud.postMessage([roundChatLine({ name: ev.name, text: ev.text, round: ev.round, ...(ev.team ? { team: ev.team } : {}) })]);
  };
}

/**
 * The icons' seam (RC-4 fills it, from the disc or drawn): each bitmap given handed to the HUD under its name
 * (`Hud.addBitmaps`, as the round screens' are, `./roundScreens` `handRoundScreenBitmaps`); a null one is not handed.
 */
export function setRoundChatIcons(hud: Pick<Hud, 'addBitmaps'>, icons: { skull: Rgba | null; eye: Rgba | null }): void {
  const got: Record<string, Rgba> = {};
  if (icons.skull) got[ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull] = icons.skull;
  if (icons.eye) got[ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye] = icons.eye;
  if (Object.keys(got).length > 0) hud.addBitmaps(got);
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
