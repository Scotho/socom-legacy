import type { HudQuad, HudTri } from './hud';
import { textWidth } from './hudFont';
import type { Input, PadFlag } from './gamepad';
import { ARROW_TEXTURE, drawWeaponSelect, PANEL_TEXTURE, type WeaponSelectItem, type WeaponSelectLayout } from './weaponSelect';

/**
 * The alive R2 inventory (the owner, 2026-10-04: "the quick menu select just never shows"; research 94 §4.3, research
 * 188 §1.2 L2): SOCOM II's `CWeaponSel` at `CHUD+0x1a50` -- the open `FUN_00219c80` state 0 (L71614-71621) ->
 * `FUN_0021c6f0` (L72800), the tick `FUN_0021bda0` (L72552-72727) -- which the viewer stood in for with one R2 press a
 * step and no menu (`GrenadeThrower.cycleInventory`) until this module. What the game does, as read:
 *
 * - **Open** (`FUN_00219c80` L71617-71621, `FUN_0021c6f0` L72815-72838): a press of `Inventory` (R2 under `Default`,
 *   result 4), the local body alive (`+0xe1` bit 4) and its kit free to change (`FUN_005a8cb0`, `FUN_005c4fd0`; else the
 *   refusal sound `FUN_003419c0`). The highlight starts on the slot in the hand (`FUN_005be040` -> `+0xc54`). The
 *   open's two other refusals, posture `+0x174` 9 and `+0xeb8` set (L72823-72826), are not read here and not modelled.
 * - **Inside** (`FUN_0021bda0`), each read `== 1`, the frame the button goes down (`FUN_002d9ff0`, research 188 §1.2),
 *   first match wins: d-pad **Up** (`+5`) the next slot that may be taken up (`FUN_0021abf0`, wrapping over
 *   `FUN_005be030`'s count, skipping what `FUN_005bdc30` refuses), **Down** (`+6`) the previous (`FUN_0021ae50`);
 *   **L1** (`+0xd`) puts the highlighted slot on L1 (`ctrl+0x224`), refused when it is L2's (`+0x228`), **L2** (`+0xe`)
 *   the converse (L72629-72660); **Triangle** (`+7`) closes it with no change (L72661-72679). Otherwise the idle count
 *   `DAT_0040c100` gains the frame's time and a fresh **Cross** (result 0) or **R2** (result 4) takes the highlighted
 *   slot up (`FUN_005c4b10`) when `FUN_005a8cb0` passes, and closes; a take refused leaves it open (L72691-72705);
 *   with neither, the menu closes unchosen once the count passes 5 s (L72681-72714). Any of the five resets the count
 *   (L72722-72724). A death closes it (L72571-72587).
 * - **Drawn** (research 212; checked on the capture of 2026-10-05): a column x 0..160, y 168..354 above the weapon box
 *   -- `newweapnbkrnd.tif` fading in to the box's 0.6 -- with three rows of item icons (the highlighted one full, its
 *   neighbours at 40 of 128), two arrows, and under the highlighted icon its name, rounds, magazines and QUICK tag; the
 *   class's states 1-7 move them frame by frame (`MenuVisual`, `tickVisual`). The closed menu's change flash (`+0x3b0`,
 *   research 212 §7) is not drawn here.
 *
 * - **The game meanwhile** (`FUN_0021c6f0` L72835: `FUN_00597740(ctrl, 1, 0)` sets the controller's mode byte
 *   `ctrl+0x221` to 1): the player update runs its Action block (L453192), Jump (action 5, L453208-453217), the d-pad
 *   zoom (L453315-453323) and the Triangle stance block (L453331-453430) only while that byte is 0. It goes back to 0
 *   at the end of the close (`FUN_0021aaa0` L72009), which also clears the pad's Cross, Circle and Triangle states
 *   (`FUN_002da160` slots 9, 7, 6; L72015-72017). So Triangle closes the menu **with no stance change** and Square does
 *   not jump while it is open; the owner's tap/hold rule (R5, research 180 §1.9) is how the stance decides when it does
 *   run, not a way through the open menu. The page holds those lanes from the game (`INVENTORY_LANES`), each until it
 *   is let go -- a held Triangle neither crouches nor goes prone after the close, and its release is no tap.
 * - **A new body**: the SEAL factory `FUN_00599690` (L455422) builds the controller and calls `FUN_00598280` on it
 *   (L455434), which sets L1 to slot 0 and L2 to slot 1 -- a new body has the default shoulders (`spawned`). A respawn
 *   or a round's restart re-makes the body around its controller (`FUN_00599b60` -> `FUN_00599f00`, no
 *   `FUN_00598280`), so the shoulders stand (`respawned`; the capture, research 212 §12).
 *
 * The menu reads the merged lanes, so a touch INV, zoom and action button drive it as the pad's R2, d-pad and Cross do.
 * Silent: the menu's sounds (`.TCM_SELECT`, `.TCM_SLIDE`, the refusal) are not wired.
 */

/** A button the menu reads: the d-pad's Up / Down, L1, L2, Triangle, Cross and R2. */
export type InventoryButton = 'up' | 'down' | 'l1' | 'l2' | 'triangle' | 'cross' | 'r2';

/** The merged lane each button rides (`./gamepad` `PAD_LAYOUT`: Up `zoom`, Down `zoomOut`, L1 `swap1` ...). */
export const INVENTORY_BUTTON_LANE: Readonly<Record<InventoryButton, PadFlag>> = {
  up: 'zoom', down: 'zoomOut', l1: 'swap1', l2: 'swap2', triangle: 'stance', cross: 'action', r2: 'inventory',
};

/**
 * The lanes the open menu takes from the game: its own buttons, Triangle's stance among them, and Square's jump -- the
 * blocks `ctrl+0x221` = 1 stops (L453192, L453208, L453315-453323, L453331). Held through the menu, each stays the
 * menu's until it is let go (`FUN_0021aaa0` clears the pad's Cross and Triangle at the close, L72015-72017), so the
 * Cross that confirms is no climb, the Triangle that closes no crouch and the R2 no second open.
 */
export const INVENTORY_LANES: readonly PadFlag[] = ['zoom', 'zoomOut', 'swap1', 'swap2', 'action', 'inventory', 'stance', 'jump'];

/** The idle close (`FUN_0021bda0` L72705: `5.0 < DAT_0040c100`), seconds without a step. */
export const INVENTORY_IDLE_CLOSE = 5.0;

/** The shoulders' slots (`ctrl+0x224` L1, `+0x228` L2): `FUN_00598280` (L454785-454786) sets 0 and 1. */
export interface Binds { l1: number; l2: number }
export const DEFAULT_BINDS: Readonly<Binds> = { l1: 0, l2: 1 };

/** What the menu sees of the kit. */
export interface InventoryKit {
  /** The kit's slot count (`FUN_005be030`). */
  count: number;
  /** Whether a slot may be taken up (`FUN_005bdc30`; `./equipment` `slotSelectable` and the count left). */
  takeable(slot: number): boolean;
  /** The slot in the hand (`FUN_005be040`). */
  current: number;
}

/** The menu's state: open or not, the highlighted slot (`+0xc54`), the idle count (`DAT_0040c100`). */
export interface InventoryState { open: boolean; slot: number; idle: number }

export interface InventoryHost {
  kit(): InventoryKit;
  /** The body alive (`+0xe1` bit 4). */
  alive(): boolean;
  /** The kit free to change now (`FUN_005a8cb0`; at the open `FUN_005c4fd0` too). */
  canChange(): boolean;
  /** Take a slot up (`FUN_005c4b10`); false when the page refuses it. */
  take(slot: number): boolean;
  /** A slot's item icon (`FUN_005be110` -> the record's `IconTextureName`), lower case, or null. */
  icon(slot: number): string | null;
  /** A slot's words (`FUN_002193d0`): its record's id and DisplayName, the magazine's rounds, Ammo_Capacity, MAGS; null for none. */
  info(slot: number): SlotInfo | null;
  /** Seconds. */
  clock(): number;
}

/** What a frame or a key did. */
export type InventoryEvent =
  | { kind: 'opened' } | { kind: 'stepped'; slot: number; dir: 1 | -1 } | { kind: 'assigned'; button: 'l1' | 'l2'; slot: number }
  | { kind: 'refused' } | { kind: 'took'; slot: number } | { kind: 'closed' };

/**
 * `FUN_0021abf0` / `FUN_0021ae50`: from `from`, the next (`dir` +1) or previous (-1) slot `FUN_005bdc30` lets be taken
 * up, wrapping over the kit's count; `from` itself when no other may (the game's loop would not end there).
 */
export function stepSlot(kit: InventoryKit, from: number, dir: 1 | -1): number {
  const n = Math.max(1, kit.count);
  for (let k = 1; k <= n; k++) {
    const slot = (((from + dir * k) % n) + n) % n;
    if (kit.takeable(slot)) return slot;
  }
  return from;
}

/**
 * INVENTORY_MENU_KEYS_READING: the keys of a development build (OT.R29: a player's build has the pad only) -- `I` as
 * R2 (WEAPON EXCHANGE's key, `WEAPON_SELECT_KEY_READING`, free alive), the Up / Down arrows the d-pad, Enter Cross,
 * Backspace Triangle, Page Up / Page Down L1 / L2 (the front end's `MENU_KEYS_READING`). The walk keeps W A S D. The
 * viewer's choice: the game has only its pad.
 */
export const INVENTORY_MENU_KEYS_READING: Readonly<Record<string, InventoryButton>> = {
  KeyI: 'r2', ArrowUp: 'up', ArrowDown: 'down', Enter: 'cross', Backspace: 'triangle', PageUp: 'l1', PageDown: 'l2',
};

// ---- The draw (research 212) ---------------------------------------------------------------------------------------

/**
 * The column on the 640x448 frame (research 212 §2): x 0..160 (`DAT_0040c108` = 0xa0, Init L73037), y 168..354 --
 * `DAT_003e4aa0` and `DAT_003e4a90`, which the static initializer at 0x3fe500 writes as the weapon box's top
 * (`DAT_003e2ff8` = 364) less 196 and less 10; the backdrop's caps are 5 tall (Init L73167-73172). The capture of
 * 2026-10-05 measures x 0-159, y 168-353, 10 px above the box.
 */
export const INVENTORY_COLUMN = { x: 0, w: 160, top: 168, bottom: 354, cap: 5 } as const;

/**
 * The rows: the highlighted row's x 10 (`+0xc6c`, the open's goal, L72846) and y 230 (`DAT_003e4a98` = the column's
 * bottom less 124, the same initializer), the neighbours 60 above and below (`+0xc70` = 60.0, L72779).
 */
export const INVENTORY_ROWS = { x: 10, y: 230, pitch: 60 } as const;

/** The icon's inset from its row: `+0xc64` / `+0xc68` = 4.0 (the constructor, L73264-73265). */
export const INVENTORY_ICON_INSET = 4;

/** The rows' slide: 475 px/s (states 1, 6, 7; L72750, L72213, L71654), twice that for a step's scroll (L72323, L72404). */
export const INVENTORY_SLIDE_RATE = 475;

/** The icon's height as it unfolds and folds (`+0xca0` = 35.0, L72843 and L72265; `+0xc94` its half). */
const UNFOLD = 35;

/**
 * The backdrop's fade (`FUN_00219c80` L71670-71684): min(2t, 1) x `DAT_003e3000` (76.8, `.data`), t from the press,
 * stopping at 0.5 s -- the weapon box's own 0.6 (`./hud` `HUD_COLOURS.panel`).
 */
export const INVENTORY_FADE = { seconds: 0.5, alpha: 76.8 } as const;

/** The icons' alpha: the highlighted 128, the others 40 (L72923-72927, L71931-71935); a scroll crosses them by 87 (L72459). */
export const INVENTORY_ICON_ALPHA = { highlighted: 128, other: 40 } as const;

/**
 * The arrows' grey (`FUN_003590e0`, on `ARROW_TINT_SCALE_READING`'s scale): 50 from the Init (L73083-73086); a step
 * lights the side stepped toward 100 and the other 60 (L72085-72086, L72154-72155); the lit one falls to the other's at
 * 500/s, then both pulse 60..120 at 250/s (`FUN_0021bb50` L72495-72545).
 */
export const INVENTORY_ARROW = { grey: 50, lit: 100, unlit: 60, low: 60, high: 120, pulseRate: 250, settleRate: 500 } as const;

/**
 * INVENTORY_ARROW_ALPHA_READING: the arrows' alpha through the polygon class's vtable +0x34, read as its alpha as every
 * 2D object's is (research 212 §3.3, C4): 70 idle (Init L73081-73082, after a scroll L71923, L71978), 128 on the side
 * stepped toward (L72084, L72153), 100 once its grey has fallen to the other's (L72503). The capture shows the arrows dim
 * and pulsing, not the values.
 */
export const INVENTORY_ARROW_ALPHA_READING = { idle: 70, lit: 128, settled: 100 } as const;

/**
 * The words (`FUN_002193d0` L71389-71460, `FUN_002196f0` L71464-71520): the pen at the highlighted row + (4, 48), the
 * rounds and the tag right-aligned to x 148, the magazines and the tag a line of 14 lower, all at the HUD font's 0.9.
 */
export const INVENTORY_WORDS = { dx: 4, dy: 48, right: 148, line: 14, scale: 0.9 } as const;

/** The words' colour: `DAT_00408e40..4c` as `CHUD`'s Init leaves them (L57244-57247), the HUD's text (Init L73109-73140). */
export const INVENTORY_TEXT_RGBA = [128, 128, 128, 80] as const;

/**
 * The shoulder tags: HUDCLOC 60525 / 60526 (`FUN_00361b40(0xec6d / 0xec6e)`, L71487, L71503), "QUICK 1" / "QUICK 2" on
 * the disc (`test/inventoryMenuDisc.test.ts`), in the Init's (55, 140, 130) at alpha 80 (L73093-73104) -- the capture's
 * cyan.
 */
export const INVENTORY_TAG = { l1: 'QUICK 1', l2: 'QUICK 2', rgba: [55, 140, 130, 80] } as const;

/** The magazines' line: HUDCLOC 60483 "1 MAG" and 60482 "$1s MAGS" (L71441, L71444). */
export const magsText = (n: number): string | null => (n <= 0 ? null : n === 1 ? '1 MAG' : `${n} MAGS`);

/** The Designator's record (item 11): its name alone, no rounds or magazines (L71451-71456). */
const DESIGNATOR = 11;

/**
 * The class's state (`+0xc58`) and the fields its draw reads, frame by frame as `FUN_00219c80` runs them: 0 closed,
 * 1 unfolding, 2 spreading, 3 open, 4 scrolling up, 5 scrolling down, 6 converging, 7 folding. The rows are the four
 * icons `+0x20` (previous), `+0xa0` (highlighted), `+0x120` (next), `+0x1a0` (incoming): their slots `+0x220..+0x22c`,
 * places `+0xc74..+0xc90`, shown and alpha.
 */
export interface MenuVisual {
  state: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  slots: [number, number, number, number];
  x: [number, number, number, number];
  y: [number, number, number, number];
  shown: [boolean, boolean, boolean, boolean];
  alpha: [number, number, number, number];
  /** `+0xc6c` / `+0xc70`: the goal, or (states 4-6) the offsets. */
  goalX: number; goalY: number;
  /** `+0xc98`, `+0xc9c`, `+0xca0`, `+0xc94`: the start x, the highlighted icon's height now, its full height, its centre. */
  startX: number; height: number; fullHeight: number; centre: number;
  /** `DAT_003dc620`: the backdrop's fade clock (-1 stopped) and the alpha it last set. */
  fade: number; backdropAlpha: number;
  backdrop: boolean; arrows: boolean; words: boolean;
  /** The arrows (up, down): grey, alpha; the shared pulse `+0xcbc` and its direction `+0xcc0`. */
  arrowGrey: [number, number]; arrowAlpha: [number, number]; pulse: number; rising: boolean;
}

/** The class after its Init (L73037-73215) and constructor (L73228-73282): nothing shown. */
export function closedVisual(): MenuVisual {
  return {
    state: 0, slots: [0, 0, 0, 0], x: [0, 0, 0, 0], y: [0, 0, 0, 0], shown: [false, false, false, false], alpha: [40, 128, 40, 40],
    goalX: 0, goalY: 0, startX: 0, height: 0, fullHeight: 0, centre: 0, fade: -1, backdropAlpha: 0,
    backdrop: false, arrows: false, words: false,
    arrowGrey: [INVENTORY_ARROW.grey, INVENTORY_ARROW.grey], arrowAlpha: [INVENTORY_ARROW_ALPHA_READING.idle, INVENTORY_ARROW_ALPHA_READING.idle],
    pulse: INVENTORY_ARROW.grey, rising: true,
  };
}

const copy = (v: MenuVisual): MenuVisual => ({
  ...v, slots: [...v.slots], x: [...v.x], y: [...v.y], shown: [...v.shown], alpha: [...v.alpha],
  arrowGrey: [...v.arrowGrey], arrowAlpha: [...v.arrowAlpha],
});

/** `from` moved toward `to` by `step`, landing on it (the class's every slide). */
const toward = (from: number, to: number, step: number): number =>
  from < to ? Math.min(to, from + step) : from > to ? Math.max(to, from - step) : from;

/** `FUN_0021c6f0` (L72840-72930): open on `slot`, its neighbours `prev` and `next`; the arrows keep their state. */
export function openVisual(was: MenuVisual, slot: number, prev: number, next: number): MenuVisual {
  const v = copy(was);
  v.state = 1;
  v.slots = [prev, slot, next, v.slots[3]];
  v.height = 0; v.fullHeight = UNFOLD; v.centre = UNFOLD / 2;
  v.goalY = INVENTORY_ROWS.y; v.goalX = INVENTORY_ROWS.x;
  v.x[1] = 0; v.y[1] = INVENTORY_ROWS.y; v.startX = 0;
  v.backdrop = true; v.words = false; v.arrows = false;
  v.shown = [false, true, false, false];
  v.alpha = [INVENTORY_ICON_ALPHA.other, INVENTORY_ICON_ALPHA.highlighted, INVENTORY_ICON_ALPHA.other, INVENTORY_ICON_ALPHA.other];
  v.fade = 0;
  return v;
}

/** `FUN_0021abf0` (Up, `dir` +1) / `FUN_0021ae50` (Down, -1): the scroll's start, `incoming` the slot beyond. */
export function stepVisual(was: MenuVisual, dir: 1 | -1, incoming: number): MenuVisual {
  const v = copy(was);
  const far = dir === 1 ? 2 : 0;                                    // the incoming icon waits under the far neighbour
  v.state = dir === 1 ? 4 : 5;
  v.slots[3] = incoming;
  v.x[3] = v.x[far]; v.y[3] = v.y[far];
  v.goalX = 0; v.goalY = v.y[2] - v.y[1];
  v.shown[3] = true;
  const lit = dir === 1 ? 0 : 1;
  v.arrowAlpha[lit] = INVENTORY_ARROW_ALPHA_READING.lit;
  v.arrowGrey = lit === 0 ? [INVENTORY_ARROW.lit, INVENTORY_ARROW.unlit] : [INVENTORY_ARROW.unlit, INVENTORY_ARROW.lit];
  v.pulse = INVENTORY_ARROW.grey; v.rising = true;
  v.words = false;
  return v;
}

/** The close (the block at L72661-72679, L72705-72721, L72571-72587): state 6; the column, arrows and words at once. */
export function closeVisual(was: MenuVisual): MenuVisual {
  if (was.state === 0 || was.state >= 6) return was;
  let v = copy(was);
  if (v.state === 4 || v.state === 5) v = rotate(v, v.state === 4 ? 1 : -1);
  if (v.state === 1 || v.state === 2) {                             // closed before the spread: the rows as they stand
    v.x = [v.x[1], v.x[1], v.x[1], v.x[3]]; v.y = [v.y[1], v.y[1], v.y[1], v.y[3]];
  }
  v.state = 6;
  v.backdrop = false; v.arrows = false; v.words = false;
  return v;
}

/** `FUN_0021a700` (after Up) / `FUN_0021a8d0` (after Down): the rows renamed, the incoming icon hidden, state 3. */
function rotate(was: MenuVisual, dir: 1 | -1): MenuVisual {
  const v = copy(was);
  const pitch = INVENTORY_ROWS.pitch, mid = INVENTORY_ROWS.y;
  v.slots = dir === 1 ? [v.slots[1], v.slots[2], v.slots[3], v.slots[3]] : [v.slots[3], v.slots[0], v.slots[1], v.slots[3]];
  v.x = [INVENTORY_ROWS.x, INVENTORY_ROWS.x, INVENTORY_ROWS.x, v.x[3]];
  v.y = [mid - pitch, mid, mid + pitch, v.y[3]];
  v.shown = [true, true, true, false];
  v.alpha = [INVENTORY_ICON_ALPHA.other, INVENTORY_ICON_ALPHA.highlighted, INVENTORY_ICON_ALPHA.other, INVENTORY_ICON_ALPHA.other];
  v.arrowAlpha = [INVENTORY_ARROW_ALPHA_READING.idle, INVENTORY_ARROW_ALPHA_READING.idle];
  v.words = true;
  v.state = 3;
  return v;
}

/** `FUN_0021bb50` (state 3's last call, L72474-72550): the lit arrow settles, else both pulse. */
function arrowsTick(v: MenuVisual, dt: number): void {
  const [up, down] = v.arrowGrey, A = INVENTORY_ARROW;
  if (up !== down) {
    const i = up > down ? 0 : 1, other = v.arrowGrey[1 - i]!;
    const grey = v.arrowGrey[i]! - dt * A.settleRate;
    if (grey < other) {
      v.arrowGrey[i] = other;
      v.arrowAlpha[i] = INVENTORY_ARROW_ALPHA_READING.settled;
      v.rising = true;
      v.pulse = other;
    } else v.arrowGrey[i] = grey;
    return;
  }
  if (!v.rising) {
    v.pulse -= dt * A.pulseRate;
    if (v.pulse < A.low) { v.rising = true; v.pulse = A.low; }
  } else {
    v.pulse += dt * A.pulseRate;
    if (v.pulse > A.high) { v.rising = false; v.pulse = A.high; }
  }
  v.arrowGrey = [v.pulse, v.pulse];
}

/** The backdrop's fade, run every frame after the state's own work (L71670-71684). */
function fadeTick(v: MenuVisual, dt: number): void {
  if (v.fade < 0) return;
  v.fade += dt;
  v.backdropAlpha = (v.fade < INVENTORY_FADE.seconds ? v.fade / INVENTORY_FADE.seconds : 1) * INVENTORY_FADE.alpha;
  if (v.fade >= INVENTORY_FADE.seconds) v.fade = -1;
}

/**
 * What runs after a press changed the state in its own frame: the open's frame runs only the fade (L71620 then
 * L71670); a step's also `FUN_0021bb50` (`FUN_0021bda0` ends on it, L72725); a close's nothing more that draws.
 */
export function pressedTick(was: MenuVisual, dt: number, stepped: boolean): MenuVisual {
  const v = copy(was);
  if (stepped) arrowsTick(v, dt);
  fadeTick(v, dt);
  return v;
}

/** One frame of `FUN_00219c80` (L71602-71690) with no press: the state's work, then the fade. */
export function tickVisual(was: MenuVisual, dt: number): MenuVisual {
  let v = copy(was);
  const step = dt * INVENTORY_SLIDE_RATE, fast = 2 * step, P = INVENTORY_ROWS.pitch;
  const heightAt = (x: number): number => v.fullHeight * ((x - v.startX) / v.goalX - v.startX);
  switch (v.state) {
    case 1:                                                         // FUN_0021c4e0 L72734-72798
      v.x[1] = toward(v.x[1], v.goalX, step);
      v.y[1] = toward(v.y[1], v.goalY, step);
      v.height = heightAt(v.x[1]);
      if (v.x[1] === v.goalX && v.y[1] === v.goalY) {
        v.state = 2;
        v.x = [v.x[1], v.x[1], v.x[1], v.x[3]]; v.y = [v.y[1], v.y[1], v.y[1], v.y[3]];
        v.shown[0] = v.shown[2] = true;
      }
      break;
    case 2:                                                         // L71626-71633, FUN_0021a5c0 L71849-71888
      v.y[0] = v.y[1] - P; v.y[2] = v.y[1] + P;
      v.arrows = true; v.words = true;
      v.state = 3;
      break;
    case 3:
      arrowsTick(v, dt);
      break;
    case 4: {                                                       // FUN_0021b820 L72392-72472: the rows rise
      const startNext = v.y[3];                                     // +0xc90: where the next row started
      v.y[1] = toward(v.y[1], startNext - 2 * P, fast);
      v.y[2] = toward(v.y[2], startNext - P, fast);
      const f = (startNext - P - v.y[2]) / P + 1;
      v.alpha[1] = (1 - f) * 87 + 40; v.alpha[2] = f * 87 + 40;
      if (v.y[2] === startNext - P) v = rotate(v, 1);
      break;
    }
    case 5: {                                                       // FUN_0021b500 L72311-72390: the rows come down
      const startPrev = v.y[3];                                     // +0xc90: where the previous row started
      v.y[0] = toward(v.y[0], startPrev + P, fast);
      v.y[1] = toward(v.y[1], startPrev + 2 * P, fast);
      const f = (startPrev + P - v.y[0]) / P;
      v.alpha[0] = (1 - f) * 87 + 40; v.alpha[1] = f * 87 + 40;
      if (v.y[0] === startPrev + P) v = rotate(v, -1);
      break;
    }
    case 6:                                                         // FUN_0021b140 L72201-72280: the neighbours converge
      v.x[0] = toward(v.x[0], v.x[1], step); v.y[0] = toward(v.y[0], v.y[1], step);
      v.x[2] = toward(v.x[2], v.x[1], step); v.y[2] = toward(v.y[2], v.y[1], step);
      if (v.x[0] === v.x[1] && v.y[0] === v.y[1]) {
        v.fullHeight = UNFOLD; v.height = UNFOLD; v.centre = UNFOLD / 2;
        v.goalY = v.y[1]; v.goalX = v.x[1]; v.startX = 0;
        v.state = 7;
        v.shown[0] = v.shown[2] = false;
      }
      break;
    case 7:                                                         // L71647-71668: the middle folds, then FUN_0021aaa0
      v.x[1] = toward(v.x[1], v.startX, step);
      v.height = heightAt(v.x[1]);
      if (v.x[1] === v.startX) {
        v = { ...closedVisual(), arrowGrey: v.arrowGrey, arrowAlpha: v.arrowAlpha, pulse: v.pulse, rising: v.rising,
          fade: v.fade, backdropAlpha: v.backdropAlpha };
      }
      break;
    default:
      break;
  }
  fadeTick(v, dt);
  return v;
}

/** What the menu writes for a slot (`FUN_002193d0`): its record's id and DisplayName, the magazine's rounds, Ammo_Capacity, MAGS. */
export interface SlotInfo { id: number; name: string; rounds: number; capacity: number; mags: number }

/**
 * INVENTORY_THROWABLE_COUNT_READING: a throwable's or a charge's words -- the count left over the record's
 * Ammo_Capacity, no MAGS (its one magazine less one). The capture shows "3/3" and no MAGS line on the full HE and M67.
 * MLS-EQ read the independent slot rings and selected-magazine decrement (research 361 §1-2, reading pending review;
 * FUN_005bdec0 D:L474690-474711, FUN_005c1970 D:L477023-477042); the existing constant remains for its source ledger.
 */
export const INVENTORY_THROWABLE_COUNT_READING = 'left / Ammo_Capacity, no MAGS' as const;

/** What the layout needs from outside: the binds, each slot's icon and words, the bitmaps' sizes (for the folds and the arrows). */
export interface InventoryLook {
  binds: Readonly<Binds>;
  icon(slot: number): string | null;
  info(slot: number): SlotInfo | null;
  size(texture: string): { width: number; height: number } | null;
}

/**
 * The menu on the 640x448 frame, pure, in the class's draw order (its list, Init L73061-73147, walked forward by
 * `FUN_00364e70` L262113): the backdrop's middle, the icons (previous, incoming, next, highlighted), the arrows, the two
 * tags, the name, the rounds, the magazines, the backdrop's top and bottom caps.
 */
export function inventoryLayout(v: MenuVisual, look: InventoryLook): WeaponSelectLayout {
  if (v.state === 0) return { items: [] };
  const items: WeaponSelectItem[] = [];
  const C = INVENTORY_COLUMN, inset = INVENTORY_ICON_INSET;
  const panel = (index: number, y0: number, y1: number, src: readonly [number, number, number, number]): void => {
    if (!v.backdrop) return;
    items.push({ kind: 'sprite', part: 'inventoryPanel', texture: PANEL_TEXTURE, x: C.x, y: y0, w: C.w, h: y1 - y0,
      turn: 0, flipU: false, flipV: false, rgb: [128, 128, 128], alpha: v.backdropAlpha, index, src });
  };
  panel(0, C.top + C.cap, C.bottom - C.cap, [0, 0.5, 1, 0.5]);
  // The icons, each at its row + the inset at its own size (`FUN_00364680`); the highlighted one unfolding or folding
  // (states 1, 7) squeezed to its height about the row's centre line (`FUN_00219940` L71523-71558).
  for (const i of [0, 3, 2, 1] as const) {
    if (!v.shown[i]) continue;
    const texture = look.icon(v.slots[i]);
    const size = texture ? look.size(texture) : null;
    if (!texture || !size) continue;
    let x = Math.trunc(v.x[i] + inset), y = Math.trunc(v.y[i] + inset), h = size.height;
    if (i === 1 && (v.state === 1 || v.state === 7)) {
      const mid = v.y[1] + v.centre;
      let top = mid - v.height / 2;
      if (mid - 1 < top) top = mid - 1;
      let bottom = Math.max(mid - 1, v.height * 0.5 + mid - 1 - 1);
      if (size.height < bottom - top) bottom = top + size.height;
      x = Math.trunc(v.x[1] + inset);
      y = Math.trunc(top + inset);
      h = Math.trunc(bottom + inset) - y;
      if (h <= 0) continue;
    }
    items.push({ kind: 'sprite', part: 'inventoryIcon', texture, x, y, w: size.width, h, turn: 0, flipU: false, flipV: false,
      rgb: [128, 128, 128], alpha: v.alpha[i], index: i });
  }
  // The arrows (`FUN_0021a5c0` L71858-71875): centred on the column, the up one's top on the column's, the down one
  // its half turn with its bottom on the column's.
  if (v.arrows) {
    const size = look.size(ARROW_TEXTURE) ?? { width: 32, height: 32 };
    const x = (size.width + C.w) / 2 - size.width;
    items.push({ kind: 'sprite', part: 'inventoryArrow', texture: ARROW_TEXTURE, x, y: C.top, w: size.width, h: size.height,
      turn: 0, flipU: false, flipV: false, rgb: [v.arrowGrey[0], v.arrowGrey[0], v.arrowGrey[0]], alpha: v.arrowAlpha[0], index: 0 });
    items.push({ kind: 'sprite', part: 'inventoryArrow', texture: ARROW_TEXTURE, x, y: C.bottom - size.height, w: size.width,
      h: size.height, turn: Math.PI, flipU: false, flipV: false, rgb: [v.arrowGrey[1], v.arrowGrey[1], v.arrowGrey[1]],
      alpha: v.arrowAlpha[1], index: 1 });
  }
  if (v.words) {
    const W = INVENTORY_WORDS, slot = v.slots[1], px = v.x[1] + W.dx, py = v.y[1] + W.dy;
    const text = (part: WeaponSelectItem['part'], line: string, x: number, y: number, rgba: readonly number[]): void => {
      items.push({ kind: 'text', part, text: line, x, y, scale: W.scale, align: 'left', rgb: [rgba[0]!, rgba[1]!, rgba[2]!], alpha: rgba[3]! });
    };
    const right = (line: string): number => Math.trunc(W.right - textWidth(line, W.scale));
    // The tags (`FUN_002196f0`): the highlighted slot's shoulder, only while the two shoulders differ (L71482).
    const { l1, l2 } = look.binds;
    if (l1 !== l2) {
      for (const [bind, word] of [[l1, INVENTORY_TAG.l1], [l2, INVENTORY_TAG.l2]] as const) {
        if (bind === slot) text('inventoryBind', word, right(word), Math.trunc(v.y[1] + W.dy + W.line), INVENTORY_TAG.rgba);
      }
    }
    const info = look.info(slot);
    if (info) {
      text('inventoryName', info.name.toUpperCase(), px, py, INVENTORY_TEXT_RGBA);
      if (info.id !== DESIGNATOR) {
        if (info.capacity > 0) { const r = `${info.rounds}/${info.capacity}`; text('inventoryRounds', r, right(r), Math.trunc(py), INVENTORY_TEXT_RGBA); }
        const mags = magsText(info.mags);
        if (mags) text('inventoryMags', mags, px, py + W.line, INVENTORY_TEXT_RGBA);
      }
    }
  }
  panel(1, C.top, C.top + C.cap, [0, 0, 1, 0.078125]);
  panel(2, C.bottom - C.cap, C.bottom, [0, 0.921875, 1, 1]);
  return { items };
}

// ---- The menu ------------------------------------------------------------------------------------------------------

/** The menu held for the page: its state, the shoulders' slots, the lanes it holds from the game, the class's draw state. */
export class InventoryMenu {
  private s: InventoryState = { open: false, slot: 0, idle: 0 };
  private b: Binds = { ...DEFAULT_BINDS };
  private v: MenuVisual = closedVisual();
  private readonly held = new Set<PadFlag>();
  private readonly openedFns: (() => void)[] = [];

  constructor(private readonly host: InventoryHost) {}

  isOpen(): boolean { return this.s.open; }
  /**
   * Called as the menu opens, inside the frame that opens it and before the game reads that frame: the page forgets
   * the stance presses under way there (the pad's `StanceButton`, the keyboard's and the touch C's), since the masked
   * lane would read as a release -- a tap -- where the original runs no stance block at all (`ctrl+0x221` = 1, L453331).
   */
  onOpened(fn: () => void): void { this.openedFns.push(fn); }
  state(): InventoryState { return { ...this.s }; }
  /** The shoulders' slots: L1 and L2 take these up (`FUN_00594cf0` 0x595728, 0x5957d4). */
  binds(): Binds { return { ...this.b }; }
  /** The class's draw state now (`MenuVisual`). */
  visual(): MenuVisual { return this.v; }
  /** Closed at once with no change and nothing left drawn (a new map, the walk left); the arrows keep their pulse. */
  close(): void {
    this.shut();
    const v = this.v;
    this.v = { ...closedVisual(), arrowGrey: [...v.arrowGrey], arrowAlpha: [...v.arrowAlpha], pulse: v.pulse, rising: v.rising };
  }
  /**
   * A new body: the SEAL factory `FUN_00599690` (L455422) builds its controller and calls the constructor
   * `FUN_00598280` (L455434), which puts slot 0 on L1 and slot 1 on L2 (L454785-454786); the menu closes.
   */
  spawned(): void { this.close(); this.b = { ...DEFAULT_BINDS }; }
  /**
   * A respawn or a round's restart: `CZSealBody_ReCreate` (`FUN_00599b60`) re-makes the body around the controller it
   * keeps (`+0xc0`, handed to `FUN_00599f00`); no `FUN_00598280` runs, so the shoulders stand (the capture: QUICK 2 on
   * the M67 through the round restarts after it; research 212 §12). The menu closes.
   */
  respawned(): void { this.close(); }

  /** The behaviour's close; the draw closes over its own frames (`closeVisual`). */
  private shut(): void { this.s = { ...this.s, open: false, idle: 0 }; }

  /**
   * One frame's presses (each a just-pressed edge) and its real length (PAR-34: the idle count's, `frame`'s `real`):
   * closed, R2 opens; open, the tick (`FUN_0021bda0`).
   * The opening frame runs no tick (state 0 -> 1), so the R2 that opened it is never its confirm, and no button is read
   * until the open has played out (states 1-2) nor while a step scrolls (4-5): only state 3 reads. A take the page
   * refuses (`take` false: the shoulder gate, `FUN_005a8cb0` -- airborne, an action under way) leaves the menu open,
   * as the original's refused confirm does (L72691-72705: no `FUN_005c4b10`, no close).
   */
  press(buttons: ReadonlySet<InventoryButton>, dt: number): InventoryEvent[] {
    const host = this.host;
    if (!this.s.open) {
      if (!buttons.has('r2')) return [];
      if (!host.alive() || !host.canChange()) return [{ kind: 'refused' }];
      this.s = { open: true, slot: host.kit().current, idle: 0 };
      for (const fn of this.openedFns) fn();
      return [{ kind: 'opened' }];
    }
    if (!host.alive()) { this.shut(); return [{ kind: 'closed' }]; }
    // Only state 3 reads the pad (`FUN_0021bda0`): the open's states 1-2 and a step's scroll, 4-5, run their motion
    // alone (`FUN_00219c80` L71623-71640), so a button there is lost and the idle count stands (L72683).
    if (this.v.state !== 3) return [];
    const kit = host.kit();
    if (buttons.has('up') || buttons.has('down')) {
      const dir = buttons.has('up') ? 1 : -1;
      const slot = stepSlot(kit, this.s.slot, dir);
      this.s = { ...this.s, slot, idle: 0 };
      return [{ kind: 'stepped', slot, dir }];
    }
    if (buttons.has('l1') || buttons.has('l2')) {
      const button = buttons.has('l1') ? 'l1' : 'l2', other = button === 'l1' ? 'l2' : 'l1';
      this.s = { ...this.s, idle: 0 };
      if (this.b[other] === this.s.slot) return [{ kind: 'refused' }];
      this.b = { ...this.b, [button]: this.s.slot };
      return [{ kind: 'assigned', button, slot: this.s.slot }];
    }
    if (buttons.has('triangle')) { this.shut(); return [{ kind: 'closed' }]; }
    this.s = { ...this.s, idle: this.s.idle + dt };
    if ((buttons.has('cross') || buttons.has('r2')) && host.canChange()) {
      const slot = this.s.slot;
      if (host.take(slot)) { this.shut(); return [{ kind: 'took', slot }, { kind: 'closed' }]; }
    }
    if (this.s.idle > INVENTORY_IDLE_CLOSE) { this.shut(); return [{ kind: 'closed' }]; }
    return [];
  }

  /** The draw's frame after the behaviour's (`FUN_00219c80`'s order): an event's own setup, else the state's tick. */
  private drawFrame(events: readonly InventoryEvent[], dt: number): void {
    const kit = this.host.kit();
    const opened = events.some((e) => e.kind === 'opened');
    const stepped = events.find((e): e is Extract<InventoryEvent, { kind: 'stepped' }> => e.kind === 'stepped');
    if (opened) {
      const slot = this.s.slot;
      this.v = pressedTick(openVisual(this.v, slot, stepSlot(kit, slot, -1), stepSlot(kit, slot, 1)), dt, false);
    } else if (stepped) {
      this.v = pressedTick(stepVisual(this.v, stepped.dir, stepSlot(kit, stepped.slot, stepped.dir)), dt, true);
    } else if (events.some((e) => e.kind === 'closed')) {
      this.v = pressedTick(closeVisual(this.v), dt, false);
    } else {
      this.v = tickVisual(this.v, dt);
    }
  }

  /**
   * One frame of the merged lanes (`before` the last frame's, `after` this one's): the menu's presses read off the lanes'
   * edges, the tick run, the draw's frame run, and the input the game is to read returned -- the menu's lanes masked
   * while it holds them.
   *
   * PAR-34 (research 252 s3; ACT.R8): `real` is the frame's real seconds (`./frameTime`), which the idle count takes
   * (`press`; `INVENTORY_IDLE_CLOSE`, a timed rule), so the menu closes after 5 s idle of real time at any frame rate. The
   * slide and the fade are the menu's animations and keep the clamped step `dt`. `real` defaults to `dt`.
   */
  frame(before: Input, after: Input, dt: number, real = dt): Input {
    const buttons = new Set<InventoryButton>();
    for (const [button, lane] of Object.entries(INVENTORY_BUTTON_LANE) as [InventoryButton, PadFlag][]) {
      if (after[lane] && !before[lane]) buttons.add(button);
    }
    const wasOpen = this.s.open;
    const events = this.press(buttons, real);
    this.drawFrame(events, dt);
    if (wasOpen || this.s.open || events.some((e) => e.kind === 'opened')) {
      for (const lane of INVENTORY_LANES) if (after[lane]) this.held.add(lane);
    }
    for (const lane of [...this.held]) if (!after[lane]) this.held.delete(lane);
    if (!this.held.size) return after;
    const game = { ...after };
    for (const lane of this.held) game[lane] = false;
    if (game.stancePressure !== undefined && !game.stance) game.stancePressure = 0;
    return game;
  }

  /** A key's `code` (a development build's, `INVENTORY_MENU_KEYS_READING`): closed only `I`; true when the menu took it. */
  key(code: string): boolean {
    const button = Object.hasOwn(INVENTORY_MENU_KEYS_READING, code) ? INVENTORY_MENU_KEYS_READING[code]! : null;
    if (!button || (!this.s.open && button !== 'r2')) return false;
    const wasOpen = this.s.open;
    const events = this.press(new Set([button]), 0);
    if (events.length) this.drawFrame(events, 0);
    return wasOpen || events.some((e) => e.kind === 'opened');
  }

  /**
   * The menu's draw list on the 640x448 frame (`inventoryLayout`). `sizes`, the loaded bitmaps by name: without them
   * (the debug hook's list of parts) every bitmap is taken as 32x32.
   */
  layout(sizes?: Record<string, { width: number; height: number }>): WeaponSelectLayout {
    return inventoryLayout(this.v, {
      binds: this.b, icon: (slot) => this.host.icon(slot), info: (slot) => this.host.info(slot),
      size: (texture) => (sizes ? sizes[texture] ?? null : { width: 32, height: 32 }),
    });
  }

  /** The HUD overlay's quads (`hud.setOverlay`), on WEAPON EXCHANGE's layer, anchored left as the weapon box is. */
  draw(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): { quads: HudQuad[]; tris: HudTri[] } {
    return drawWeaponSelect(frame, this.layout(sizes), sizes, { anchor: 'left' });
  }
}
