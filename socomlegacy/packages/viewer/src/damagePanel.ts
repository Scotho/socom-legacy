import { PAD_GLYPH } from '@s2u/scene';
import { controllerConfigs } from './controllerConfigs';
import { PAD_BUTTON, type Input, type PadButton } from './gamepad';
import { textWidth } from './hudFont';
import type { DamageReport, DamageReportLine } from './netPage';
import { cutLine, SCORE_LAYOUT, type DamageBoardCell, type DamageBoardReport, type DamageBoardRow } from './scoreboard';
import { plainBotText } from './botPresentation';
import { WEAPON_SELECT_KEY_READING, type InputDevice } from './weaponSelect';
import { DAMAGE_LIFE_POINTS_ADAPTATION } from './net/damagePoints';

/**
 * WM-13, the DAMAGE REPORT PANEL -- a BROWSER ADAPTATION (product track): the original has no damage report, and nothing
 * here changes what the game does. The owner approved it (look 2F, his rulings of 2026-11-15, NOTES-2.md "# 2F"):
 *
 * - WHERE: the result window (the round's result in, no round screen up yet: `./netPage` `ENGINE_READ_S`, every room
 *   kind) with the round's report -- WM-DATA-WIN (WM.R24, "B, every win"): in a classic room from a win's decision (the
 *   room's report then, `DAMAGE_REPORT_AT_WIN_REASONS`) through the hold to the same end -- and a respawn room's
 *   respawn wait (`respawnReady` until the page's own spawn) with the life's -- `NetPage.damageWindow`.
 * - In both, SELECT shows today's board; pressing the device's own inventory binding while SELECT is held toggles the
 *   panel in the board's place, and again back to the board; SELECT let go closes it. Nothing is drawn over a round
 *   screen, and a live round is today's (`damagePanelGate`, `damagePanelView`).
 * - The panel is the board's own panel (`./scoreboard` `scoreboardLayout`'s frame) with these rows (`damagePanelRows`).
 *
 * Pure: no HUD value is imported (`./hud` reads this module), so the colours it repeats are pinned equal by its test.
 */

/** Which report the window shows: the round's (the result window) or the life's (a respawn room's respawn wait). */
export type DamageWindowKind = 'round' | 'life';

/**
 * The gate's state across frames: `panel` the panel shown in the board's place; `owned` the binding's press taken by the
 * panel, held on (a taken press is never handed to WEAPON EXCHANGE or the R2 inventory before it is let go); `was` the
 * binding's level last frame (its press is the rising edge).
 */
export interface DamagePanelState { readonly panel: boolean; readonly owned: boolean; readonly was: boolean }
export const DAMAGE_PANEL_CLOSED: DamagePanelState = { panel: false, owned: false, was: false };

/** One frame's input to the gate: the window, a round screen up, SELECT (Tab) held, the inventory binding (I) held. */
export interface DamagePanelInput { window: DamageWindowKind | null; roundScreen: boolean; select: boolean; binding: boolean }

/**
 * The input gate (WM-13, an adaptation): with the window open, no round screen up and SELECT held, the binding's press
 * toggles the panel and is consumed -- the caller takes the binding off WEAPON EXCHANGE (dead) and the R2 inventory
 * (alive) for as long as it is held. Anywhere else the binding is today's (`consumed` false) and the panel is closed.
 */
export function damagePanelGate(state: DamagePanelState, input: DamagePanelInput): { state: DamagePanelState; consumed: boolean } {
  const press = input.binding && !state.was;
  const open = input.window !== null && !input.roundScreen && input.select;
  let panel = open && state.panel, owned = state.owned && input.binding;
  if (open && press) { panel = !state.panel; owned = true; }
  return { state: { panel, owned, was: input.binding }, consumed: owned };
}

/** The hint's two words: on the board, how to reach the panel; on the panel, how to go back. */
export type DamageHint = 'toReport' | 'toBoard';

/** What the HUD draws for the gate's state: the panel in the board's place, and which hint; the board itself is SELECT's. */
export function damagePanelView(state: DamagePanelState, input: Omit<DamagePanelInput, 'binding'>): { panel: boolean; hint: DamageHint | null } {
  if (input.window === null || input.roundScreen || !input.select) return { panel: false, hint: null };
  return { panel: state.panel, hint: state.panel ? 'toBoard' : 'toReport' };
}

/**
 * DAMAGE_HINT_KEYS_ADAPTATION (WM-13): the keyboard's names in the hint -- Tab (`./scoreboardKeys`, the board's hold) and
 * I (`./weaponSelect` `WEAPON_SELECT_KEY_READING`, the inventory's key), in the prompts' key-cap convention.
 */
export const DAMAGE_HINT_KEYS_ADAPTATION = { select: '[TAB]', binding: '[I]' } as const;

/**
 * The hint's text (`DAMAGE_PANEL_WORDS_ADAPTATION`): "<SELECT> + <binding>  DMG" on the board, "<SELECT>  SCOREBOARD" on the
 * panel. A pad (and the touch layer, a pad wearing the pad's button names) draws the disc font's own glyphs
 * (`font_special_01`, `@s2u/scene` `PAD_GLYPH`: SELECT 0xa4, R2 0xbe, R1 0xbd), the binding the device's own Inventory
 * button (R1 on a preset that puts Inventory there, as `./respawnPrompt` reads it); the keyboard its key caps.
 */
export function damageHintText(hint: DamageHint, device: InputDevice, inventoryButton?: 'R2' | 'R1'): string {
  const inv = inventoryButton ?? (controllerConfigs.record().buttons.Inventory === 'R1' ? 'R1' : 'R2');
  const [select, binding] = device === 'keyboard' ? [DAMAGE_HINT_KEYS_ADAPTATION.select, DAMAGE_HINT_KEYS_ADAPTATION.binding]
    : [String.fromCharCode(PAD_GLYPH.SELECT), String.fromCharCode(inv === 'R1' ? PAD_GLYPH.R1 : PAD_GLYPH.R2)];
  return hint === 'toReport' ? `${select} + ${binding}  ${DAMAGE_PANEL_WORDS_ADAPTATION.toReport}` : `${select}  ${DAMAGE_PANEL_WORDS_ADAPTATION.toBoard}`;
}

/**
 * DAMAGE_PANEL_WORDS_ADAPTATION (look 2F): every word the panel and its hint draw. The figure is "DMG" -- never the word
 * for the body's health. The hint to the panel says "DMG" too (the controller approved it, 2026-11-15: look 2F's
 * "DAMAGE REPORT" made the long hint 179 wide, "DMG" 110, clear of the message window above the panel).
 */
export const DAMAGE_PANEL_WORDS_ADAPTATION = {
  dealt: 'YOU DEALT', taken: 'YOU TOOK', hits: 'HITS', dmg: 'DMG', kill: 'KILL', killedYou: 'KILLED YOU',
  toReport: 'DMG', toBoard: 'SCOREBOARD',
} as const;


/**
 * DAMAGE_PANEL_COLUMNS_ADAPTATION (look 2F; `megaMockDamage2F`'s capture, RESULT-2F-3B2.md): the report laid into the
 * board's own rows and slots -- the name at the board's name pen (223, `SCORE_LAYOUT.rows.nameX`) cut as the board cuts a
 * name (look 2F's cut, NCW-7's `pingNameWidth` at its capture: 4 before the PING column's left edge, the wider of
 * "PING" at the title scale and "999" at the row scale; 145 wide -- the slot's HITS header would give 146), HITS in the slot NCW-7's
 * PING column held (388.5), DMG in the original KILLS slot (455), the thin bar between DMG and the mark, the KILL /
 * KILLED YOU mark right-aligned at 622 (2 inside the stripes' right end, 624).
 */
export const DAMAGE_PANEL_COLUMNS_ADAPTATION = {
  name: SCORE_LAYOUT.rows.nameX,
  nameWidth: 388.5 - Math.max(textWidth('PING', SCORE_LAYOUT.title.scale), textWidth('999', SCORE_LAYOUT.rows.scale)) / 2 - 4
    - SCORE_LAYOUT.rows.nameX,
  hits: 388.5, dmg: SCORE_LAYOUT.columns[0].x,
  bar: { x0: 475, x1: 545, h: 5, up: 7 }, mark: 622,
} as const;

type Rgba4 = readonly [number, number, number, number];
/**
 * DAMAGE_PANEL_COLOURS_ADAPTATION (look 2F): the rows' ink the board's (`SCORE_LAYOUT.rowRgb` at `rowAlpha`); the marks
 * and the bars the message window's green (`./matchMessages` `MESSAGE_COLOURS[3]`, dealt) and red (`[5]`, taken) at
 * alpha 100; a bar's track the voice box's black at alpha 50 (`./hud` `HUD_COLOURS.voiceBox`). Repeated here, pinned
 * equal by the test (this module imports no HUD value).
 */
export const DAMAGE_PANEL_COLOURS_ADAPTATION: { ink: Rgba4; good: Rgba4; bad: Rgba4; track: Rgba4 } = {
  ink: [SCORE_LAYOUT.rowRgb[0] / 128, SCORE_LAYOUT.rowRgb[1] / 128, SCORE_LAYOUT.rowRgb[2] / 128, SCORE_LAYOUT.rowAlpha],
  good: [64 / 128, 128 / 128, 64 / 128, 100 / 128],
  bad: [128 / 128, 64 / 128, 64 / 128, 100 / 128],
  track: [0, 0, 0, 50 / 128],
};

/**
 * DMG's figure for a line: the room's DMG points as they come, in whole points (intake item 2, option (C), merged on
 * the owner's pick (INTAKE 144, as the main controller read it)): the room books each hit's `damagePoints` -- a life is
 * `DAMAGE_LIFE_POINTS_ADAPTATION`, a kill from full 100 -- so the page draws it unscaled (v0.4.23 scaled the room's raw
 * part health x 100 here: one head shot read 800).
 */
const points = (health: number): string => String(Math.round(health));

/**
 * The report as the board draws it (`./scoreboard` `ScoreboardInfo.damage`): YOU DEALT in the SEALs' block, YOU TOOK in the
 * TERRORISTS', a row per opponent in the report's order (the room's: the most health first), at most the board's 8 a
 * block, each with its hits, its DMG, the thin bar (its share of the most taken or dealt, at least a life) and, where the
 * page saw the kill, KILL / KILLED YOU. A departed player (a negative id, no name) draws no name. Null (no report yet):
 * the titles and headers over empty blocks.
 */
export function damagePanelRows(report: DamageReport | null): DamageBoardReport {
  const C = DAMAGE_PANEL_COLUMNS_ADAPTATION, S = SCORE_LAYOUT, P = DAMAGE_PANEL_COLOURS_ADAPTATION, W = DAMAGE_PANEL_WORDS_ADAPTATION;
  const dealt = report?.dealt ?? [], taken = report?.taken ?? [];
  const most = Math.max(DAMAGE_LIFE_POINTS_ADAPTATION, ...dealt.map((l) => l.health), ...taken.map((l) => l.health));
  const block = (lines: readonly DamageReportLine[], colour: Rgba4, mark: string): DamageBoardRow[] => lines.slice(0, S.rows.max).map((l) => {
    const name = l.name === null ? '' : cutLine(plainBotText(l.name), S.rows.scale, C.nameWidth);
    const cells: DamageBoardCell[] = [
      ...(name.trim() ? [{ text: name, x: C.name, align: 'left' as const, rgba: P.ink }] : []),
      { text: String(l.hits), x: C.hits, align: 'centre', rgba: P.ink },
      { text: points(l.health), x: C.dmg, align: 'centre', rgba: P.ink },
      ...(l.kill === true ? [{ text: mark, x: C.mark, align: 'right' as const, rgba: colour }] : []),
    ];
    return { cells, meters: [{ x0: C.bar.x0, x1: C.bar.x1, up: C.bar.up, h: C.bar.h, share: l.health / most, rgba: colour, track: P.track }] };
  });
  return {
    titles: [W.dealt, W.taken],
    headers: [{ text: W.hits, x: C.hits }, { text: W.dmg, x: C.dmg }],
    rows: [block(dealt, P.good, W.kill), block(taken, P.bad, W.killedYou)],
  };
}

/** What the seat's call reads of the page (`./netPage` `NetPage`): the window and whether a round screen is up. */
export interface DamagePanelPage {
  damageWindow(): { kind: DamageWindowKind; report: DamageReport | null } | null;
  screenUp(): boolean;
}
/**
 * What the seat's call sets on the HUD (`./hud` `Hud.setDamagePanel`) and reads of it: its drawn state (`Hud.state()`), so
 * the binding is taken only while the board or the panel is drawn -- its `scoreboard` rect (none under the tactical map,
 * `hudPass`'s `model.scoreboard && !tacOpen`) and no START menu up. A HUD without `state` is taken as drawn.
 */
export interface DamagePanelHud {
  setDamagePanel(panel: { report: DamageBoardReport | null; hint: string | null } | null): void;
  state?(): { rects: { scoreboard?: unknown }; model: { startMenu?: boolean } };
  /** The message window's post (`Hud.postMessage`), read only by the capture spec's stage (`stageDamagePost`). */
  postMessage?(text: string): void;
}
/** The review's F4: the board (or the panel in its place) is drawn, and no START menu is up. */
function boardDrawn(hud: DamagePanelHud): boolean {
  if (!hud.state) return true;
  const st = hud.state();
  return st.rects.scoreboard !== undefined && st.model.startMenu !== true;
}

/**
 * DAMAGE_WINDOW_STAGE_ADAPTATION (WM-13; a playtest / test instrument, a development build only -- never in a release or
 * demo build, where the literal `import.meta.env.DEV` folds it away): a window and report the capture spec
 * (`e2e/zz-damage-panel-hint.spec.ts`) stands in for the page's `damageWindow` on the test room, which plays no round to its
 * result. The gate, the keys, the board and the HUD are the build's own; nothing the game does reads it. Undefined: the page's.
 */
let stagedWindow: { kind: DamageWindowKind; report: DamageReport | null } | null | undefined;
let stagedDevice: InputDevice | undefined;
/**
 * The capture spec's stage (`DAMAGE_WINDOW_STAGE_ADAPTATION`): a window, null for none, undefined to let go -- and the
 * device the hint names (a development build's page names the keyboard; a capture for the owner shows the pad's glyphs).
 * Whether it took.
 */
export function stageDamageWindow(w: { kind: DamageWindowKind; report: DamageReport | null } | null | undefined, device?: InputDevice): boolean {
  if (!import.meta.env.DEV) return false;
  stagedWindow = w;
  stagedDevice = w === undefined ? undefined : device;
  return true;
}
/**
 * DAMAGE_WINDOW_STAGE_ADAPTATION's posts (a development build only): message-window lines the capture spec hands to the
 * HUD's own `postMessage` at the seat's next frame -- the game's real post path (its wrap at `MESSAGE_WRAP_WIDTH`, its
 * scale), which the HUD test hook's `setHud({ message })` is not. Whether it took.
 */
let stagedPosts: string[] = [];
export function stageDamagePost(lines: readonly string[]): boolean {
  if (!import.meta.env.DEV) return false;
  stagedPosts.push(...lines);
  return true;
}

/** The window the seat reads: the stage in a development build when one is set, else the page's. */
function windowOf(page: DamagePanelPage | null): { kind: DamageWindowKind; report: DamageReport | null } | null {
  if (import.meta.env.DEV && stagedWindow !== undefined) return stagedWindow;
  return page?.damageWindow() ?? null;
}

/**
 * The review's F2: the page left -- the window's blur, the document hidden -- sends no keyup for a held I, so each such
 * loss counts here and every seat drops its key record and its taken state at its next read (`seatOf`). Listened for once,
 * lazily, wherever there is a window.
 */
let focusLosses = 0;
let listening = false;
function listenForFocusLoss(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('blur', () => { focusLosses++; });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') focusLosses++; });
  }
}

/**
 * Each HUD's gate state, the keyboard's I held, the pad's binding last frame and the focus losses it has seen -- one seat
 * a HUD, so a page's call site is one line.
 */
interface Seat { state: DamagePanelState; key: boolean; pad: boolean; losses: number }
const seats = new WeakMap<DamagePanelHud, Seat>();
const seatOf = (hud: DamagePanelHud): Seat => {
  listenForFocusLoss();
  let s = seats.get(hud);
  if (!s) seats.set(hud, s = { state: DAMAGE_PANEL_CLOSED, key: false, pad: false, losses: focusLosses });
  if (s.losses !== focusLosses) {
    // F2: the I let go and its share of the taken state with it, the panel closed. The pad's share stays while the pad's
    // binding is still held (the re-check: a taken press is never handed over before it is let go), and its level is
    // kept, so a pad still held makes no fresh press.
    s.losses = focusLosses; s.key = false; s.state = { panel: false, owned: s.state.owned && s.pad, was: s.pad };
  }
  return s;
};

/** The pad button a preset puts Inventory on (`./controllerConfigs`; `./gamepad` `PAD_BUTTON`'s names), or null. */
function inventoryButton(): PadButton | null {
  const b = controllerConfigs.record().buttons.Inventory;
  return b !== null && b !== undefined && b in PAD_BUTTON ? b as PadButton : null;
}

/**
 * WM-13: a page's one call a frame (`./main` `padFrame`, `./matchMount` `padFrame`), after the pad's buttons (`down`) are
 * read and before WEAPON EXCHANGE's edges and the R2 inventory see them. Steps the gate on the merged lanes (SELECT:
 * `input.scoreboard` or `select`, the keyboard's Tab; the binding: `input.inventory`, the device's own Inventory through
 * the active map, or the keyboard's I), sets the HUD's panel, and while the binding is the panel's takes it off: the
 * preset's Inventory button out of `down`, and the input returned with `inventory` false. Otherwise `input` itself.
 */
export function damagePanelFrame(
  hud: DamagePanelHud, page: DamagePanelPage | null, down: Set<PadButton>, input: Input, select: boolean, device: InputDevice,
): Input {
  const seat = seatOf(hud);
  if (import.meta.env.DEV && stagedPosts.length > 0 && hud.postMessage) {   // DAMAGE_WINDOW_STAGE_ADAPTATION's posts
    const lines = stagedPosts; stagedPosts = [];
    for (const t of lines) hud.postMessage(t);
  }
  const window = windowOf(page), roundScreen = page?.screenUp() ?? false, sel = input.scoreboard || select;
  const held = sel && window !== null && !roundScreen ? boardDrawn(hud) : sel;   // F4: only while the board is drawn
  const r = damagePanelGate(seat.state, { window: window?.kind ?? null, roundScreen, select: held, binding: input.inventory || seat.key });
  seat.state = r.state; seat.pad = input.inventory;
  const view = damagePanelView(r.state, { window: window?.kind ?? null, roundScreen, select: held });
  const named = import.meta.env.DEV && stagedDevice !== undefined ? stagedDevice : device;   // DAMAGE_WINDOW_STAGE_ADAPTATION
  hud.setDamagePanel(view.hint ? { report: view.panel ? damagePanelRows(window?.report ?? null) : null, hint: damageHintText(view.hint, named) } : null);
  if (!r.consumed) return input;
  const b = inventoryButton();
  if (b) down.delete(b);
  return { ...input, inventory: false };
}

/**
 * WM-13: the keyboard's I in a page's keydown / keyup (`./main`'s, ahead of WEAPON EXCHANGE's and the R2 inventory's
 * `key`): true when the panel takes it -- a press with Tab (`select`) held in the window toggles the panel, and the key
 * is the panel's (its repeats too) till let go. A release is never taken.
 */
export function damagePanelKey(hud: DamagePanelHud, page: DamagePanelPage | null, code: string, pressed: boolean, select: boolean): boolean {
  if (code !== WEAPON_SELECT_KEY_READING.code) return false;
  const seat = seatOf(hud);
  seat.key = pressed;
  const window = windowOf(page), roundScreen = page?.screenUp() ?? false;
  const held = select && window !== null && !roundScreen ? boardDrawn(hud) : select;   // F4
  const r = damagePanelGate(seat.state, { window: window?.kind ?? null, roundScreen, select: held, binding: pressed || seat.pad });
  seat.state = r.state;
  return pressed && r.consumed;
}
