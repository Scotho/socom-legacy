import { afterEach, describe, expect, it } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import {
  DEFAULT_BINDS, INVENTORY_ARROW, INVENTORY_ARROW_ALPHA_READING, INVENTORY_COLUMN, INVENTORY_FADE, INVENTORY_ICON_ALPHA,
  INVENTORY_ICON_INSET, INVENTORY_IDLE_CLOSE, INVENTORY_LANES, INVENTORY_REFUSAL_CLEAR_UPDATES_READING, INVENTORY_MENU_KEYS_READING, INVENTORY_ROWS, INVENTORY_SLIDE_RATE,
  INVENTORY_TAG, INVENTORY_TEXT_RGBA, INVENTORY_WORDS, InventoryMenu, magsText, stepSlot,
  type InventoryHost, type InventoryKit, type SlotInfo,
} from '../src/inventoryMenu';
import { ARROW_TEXTURE, drawWeaponSelect, PANEL_TEXTURE, type WsSprite, type WsText } from '../src/weaponSelect';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import { HUD_COLOURS, HUD_LAYOUT } from '../src/hud';
import { StanceButton } from '../src/stanceButton';
import type { Stance } from '../src/mover';
import { buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, type WeaponRecord, type WorldPoly } from '@s2u/scene';
import { Fire } from '../src/fire';
import { controllerConfigs } from '../src/controllerConfigs';
import { fireInterval, roundsPerPull } from '../src/accuracy';
import { nextEdge } from '../src/weaponRaise';
import { steerInput } from '../src/modern/replays/worldSteer';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The alive R2 inventory, `CWeaponSel` (research 94 §4.3; research 188 §1.2 L2): R2 opens it over the kit's slots on the
 * slot in the hand; d-pad Up / Down step the highlight over the slots that may be taken up; L1 / L2 put the highlighted
 * slot on that shoulder (refused when it is the other's); Triangle closes it with no change; a fresh Cross or R2 takes
 * the slot up and closes it; 5 s without a step closes it unchosen; a death closes it. Every read is a press's edge
 * (`FUN_002d9ff0`: state 1 the frame the button goes down).
 */

/** mp_seal1's kit: M4A1, Mark 23, M67, HE, and 2X in slot 4 (never taken up: `FUN_005bdc30`). */
function seal(over: Partial<InventoryKit> = {}): InventoryKit {
  return { count: 5, current: 0, takeable: (s) => s !== 4, ...over };
}

/** What the menu writes for each slot of mp_seal1's kit (the records' DisplayName, Ammo_Capacity; the rings' state). */
const INFO: Record<number, SlotInfo> = {
  0: { id: 54, name: 'M4A1', rounds: 30, capacity: 30, mags: 5 },
  1: { id: 15, name: 'Mark 23', rounds: 12, capacity: 12, mags: 5 },
  2: { id: 121, name: 'M67', rounds: 3, capacity: 3, mags: 0 },
  3: { id: 126, name: 'HE', rounds: 3, capacity: 3, mags: 0 },
};

function harness(kit: InventoryKit = seal(), opts: { alive?: boolean; canChange?: boolean; refuse?: boolean } = {}) {
  const taken: number[] = [];
  const state = { kit, alive: opts.alive ?? true, canChange: opts.canChange ?? true, refuse: opts.refuse ?? false, now: 0 };
  const host: InventoryHost = {
    kit: () => state.kit, alive: () => state.alive, canChange: () => state.canChange,
    take: (slot) => { if (state.refuse) return false; taken.push(slot); return true; }, icon: (slot) => `icon${slot}.tif`,
    info: (slot) => INFO[slot] ?? null, clock: () => state.now,
  };
  const menu = new InventoryMenu(host);
  let last: Input = noInput();
  /** One frame with these lanes held (the merged pad/touch input), `dt` seconds long; returns the game's input. */
  const frame = (lanes: Partial<Input> = {}, dt = 1 / 60): Input => {
    const now = { ...noInput(), ...lanes };
    const game = menu.frame(last, now, dt);
    last = now;
    state.now += dt;
    return game;
  };
  /** A press and its release, two frames. */
  const tap = (lane: keyof Input): void => { frame({ [lane]: true }); frame(); };
  /** Frames until the class reads buttons again (its state 3: past the open's states 1-2 or a scroll's 4-5). */
  const settle = (): void => { for (let i = 0; i < 12 && menu.visual().state !== 3; i++) frame(); };
  /** R2 tapped and the open played out: the menu reading buttons. */
  const open = (): void => { tap('inventory'); settle(); };
  return { menu, taken, state, frame, tap, settle, open };
}

describe('R2 opens the inventory (FUN_00219c80 state 0, L71617-71621; FUN_0021c6f0 L72800)', () => {
  it('R2 opens the menu alive, on the slot in the hand (FUN_005be040 -> +0xc54)', () => {
    const h = harness(seal({ current: 1 }));
    expect(h.menu.isOpen()).toBe(false);
    h.frame({ inventory: true });
    expect(h.menu.isOpen()).toBe(true);
    expect(h.menu.state().slot).toBe(1);
    expect(h.taken).toEqual([]);                          // opening takes nothing up
  });

  it('does not open dead (the alive bit, +0xe1) nor when the kit may not change (FUN_005a8cb0, FUN_005c4fd0)', () => {
    const dead = harness(seal(), { alive: false });
    dead.frame({ inventory: true });
    expect(dead.menu.isOpen()).toBe(false);
    const busy = harness(seal(), { canChange: false });
    busy.frame({ inventory: true });
    expect(busy.menu.isOpen()).toBe(false);
  });

  it('R2 held from the opening does not confirm: only a fresh press does (research 188 §1.2)', () => {
    const h = harness();
    h.frame({ inventory: true });
    for (let i = 0; i < 30; i++) h.frame({ inventory: true });
    expect(h.menu.isOpen()).toBe(true);
    expect(h.taken).toEqual([]);
  });
});

describe('each button inside does the original\'s action (FUN_0021bda0 L72552-72727)', () => {
  it('d-pad Up steps to the next slot that may be taken up, Down the previous, wrapping (FUN_0021abf0, FUN_0021ae50)', () => {
    const h = harness();
    h.open();
    h.tap('zoom'); h.settle();                                        // the pad's d-pad Up is the `zoom` lane
    expect(h.menu.state().slot).toBe(1);
    h.tap('zoom'); h.settle(); h.tap('zoom'); h.settle();
    expect(h.menu.state().slot).toBe(3);
    h.tap('zoom'); h.settle();                                        // 2X (slot 4) skipped, round to the M4A1
    expect(h.menu.state().slot).toBe(0);
    h.tap('zoomOut'); h.settle();                                     // d-pad Down: back past 2X to the HE
    expect(h.menu.state().slot).toBe(3);
  });

  it('stepSlot walks the kit\'s slots by FUN_005bdc30 and stays put when nothing else may be taken up', () => {
    expect(stepSlot(seal(), 3, 1)).toBe(0);
    expect(stepSlot(seal(), 0, -1)).toBe(3);
    expect(stepSlot(seal({ takeable: (s) => s === 2 }), 2, 1)).toBe(2);
  });

  it('a fresh Cross takes the highlighted slot up and closes (FUN_002c64e0(0), FUN_005c4b10)', () => {
    const h = harness();
    h.open(); h.tap('zoom'); h.settle(); h.tap('zoom'); h.settle();
    h.tap('action');
    expect(h.taken).toEqual([2]);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('a fresh R2 takes the highlighted slot up and closes (FUN_002c64e0(4))', () => {
    const h = harness();
    h.open(); h.tap('zoomOut'); h.settle();
    h.tap('inventory');
    expect(h.taken).toEqual([3]);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('a confirm while the kit may not change takes nothing and leaves the menu up (FUN_005a8cb0)', () => {
    const h = harness();
    h.open();
    h.state.canChange = false;
    h.tap('action');
    expect(h.taken).toEqual([]);
    expect(h.menu.isOpen()).toBe(true);
  });

  it('Triangle closes it unchosen (+7, L72661-72679: state 6, no FUN_005c4b10)', () => {
    const h = harness();
    h.open(); h.tap('zoom'); h.settle();
    h.tap('stance');                                      // the pad's Triangle is the `stance` lane
    expect(h.menu.isOpen()).toBe(false);
    expect(h.taken).toEqual([]);
  });

  it('L1 puts the highlighted slot on L1, L2 on L2; each refused when the slot is the other\'s (L72629-72660)', () => {
    const h = harness();
    expect(h.menu.binds()).toEqual(DEFAULT_BINDS);        // FUN_00598280: slot 0 and slot 1
    h.open(); h.tap('zoom'); h.settle(); h.tap('zoom'); h.settle();     // the M67
    h.tap('swap1');
    expect(h.menu.binds()).toEqual({ l1: 2, l2: 1 });
    expect(h.menu.isOpen()).toBe(true);                   // an assignment does not close
    h.tap('swap2');                                       // the M67 is L1's: refused
    expect(h.menu.binds()).toEqual({ l1: 2, l2: 1 });
    h.tap('zoom'); h.settle();                                        // the HE on L2
    h.tap('swap2');
    expect(h.menu.binds()).toEqual({ l1: 2, l2: 3 });
    expect(h.taken).toEqual([]);
  });

  it('a new body has the shoulders of a new controller again: L1 slot 0, L2 slot 1 (FUN_00599690 L455434 -> FUN_00598280)', () => {
    const h = harness();
    h.open(); h.tap('zoom'); h.settle(); h.tap('zoom'); h.settle();
    h.tap('swap1');
    expect(h.menu.binds()).toEqual({ l1: 2, l2: 1 });
    h.menu.spawned();
    expect(h.menu.binds()).toEqual(DEFAULT_BINDS);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('a respawn or a round restart keeps the shoulders: the body is re-made around its controller (FUN_00599b60, research 212 §12)', () => {
    // The capture (2026-10-05, research 212 §11): QUICK 2 put on the M67 stayed on it through the round restarts that
    // followed. CZSealBody_ReCreate keeps the body's controller (+0xc0) and hands it to PostCreateSeal; no
    // CSealCtrl_ctor (FUN_00598280) runs, so +0x224 / +0x228 stand.
    const h = harness();
    h.open(); h.tap('zoom'); h.settle(); h.tap('zoom'); h.settle();
    h.tap('swap2');
    expect(h.menu.binds()).toEqual({ l1: 0, l2: 2 });
    h.menu.respawned();
    expect(h.menu.isOpen()).toBe(false);
    expect(h.menu.binds()).toEqual({ l1: 0, l2: 2 });
  });

  it('a confirm the take refuses (the shoulder gate: airborne, an action) leaves the menu up and takes nothing (L72691-72705)', () => {
    // FUN_005a8cb0 refusing: bVar2 false, no FUN_005c4b10, no close -- only the 5 s count closes it then.
    const h = harness(seal(), { refuse: true });
    h.open(); h.tap('zoom'); h.settle();
    const events = h.menu.press(new Set(['cross']), 1 / 30);
    expect(events.map((e) => e.kind)).not.toContain('took');
    expect(events.map((e) => e.kind)).not.toContain('closed');
    expect(h.menu.isOpen()).toBe(true);
    expect(h.taken).toEqual([]);
    h.state.refuse = false;
    h.tap('action');
    expect(h.taken).toEqual([1]);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('5 s without a step closes it unchosen; a step or an assignment restarts the count (L72683, L72705, L72722)', () => {
    const h = harness();
    h.open();
    h.frame({}, INVENTORY_IDLE_CLOSE - 0.5);
    h.tap('zoom'); h.settle();                                        // the count starts again
    h.frame({}, INVENTORY_IDLE_CLOSE - 0.5);
    expect(h.menu.isOpen()).toBe(true);
    h.frame({}, 1);
    expect(h.menu.isOpen()).toBe(false);
    expect(h.taken).toEqual([]);
    expect(INVENTORY_IDLE_CLOSE).toBe(5);
  });

  it('a death closes it (the alive bit cleared, L72571-72587)', () => {
    const h = harness();
    h.open();
    h.state.alive = false;
    h.frame();
    expect(h.menu.isOpen()).toBe(false);
    expect(h.taken).toEqual([]);
  });
});

describe('the game keeps what the menu does not read; the menu takes what it does', () => {
  it('open, Up / Down / L1 / L2 / Cross / R2 never reach the zoom, the swap, the action or a second R2', () => {
    const h = harness();
    h.frame({ inventory: true, moveY: 1 });              // WM-STICK (OT.R130): opened walking, the stick stays the walk's
    const game = h.frame({ zoom: true, swap1: true, action: true, moveY: 1, fire: true, leanLeft: true });
    for (const lane of ['zoom', 'swap1', 'action', 'inventory'] as const) expect(game[lane], lane).toBe(false);
    expect(game.moveY).toBe(1);                           // the walk, the trigger and the peek go on
    expect(game.fire).toBe(true);
    expect(game.leanLeft).toBe(true);
    expect(INVENTORY_LANES).toEqual(expect.arrayContaining(['stance', 'jump']));
  });

  it('Triangle closes the menu with no stance change (ctrl+0x221 gates the stance block, L453331; FUN_0021aaa0 clears it, L72017)', () => {
    const h = harness();
    h.open();
    const game = h.frame({ stance: true });
    expect(h.menu.isOpen()).toBe(false);
    expect(game.stance).toBe(false);                      // no crouch from the press that closed it
    for (let i = 0; i < 60; i++) expect(h.frame({ stance: true }).stance).toBe(false);   // held on: no prone either
    expect(h.frame().stance).toBe(false);                 // its release is no tap
    expect(h.frame({ stance: true }).stance).toBe(true);  // a new press is the stance again
  });

  it('OT.R107: the SEPARATE Prone button closes the menu as Triangle and is no Prone, held or let go (the stance block, L453331)', () => {
    const h = harness();
    h.open();
    const game = h.frame({ stance: true, stanceOff: true, prone: true });
    expect(h.menu.isOpen()).toBe(false);
    expect(game.prone, 'the press that closed it is no Prone').toBe(false);
    expect(h.frame({ stance: true, stanceOff: true, prone: true }).prone, 'held on: still the menu\'s').toBe(false);
    h.frame();
    expect(h.frame({ prone: true }).prone, 'a new press is Prone again').toBe(true);
  });

  it('a Triangle down short of the hold as R2 opens the menu is no tap: the host forgets the stance press (no stance block while open)', () => {
    // The opening frame masks the held lane, which a stance machine would read as a release -- a tap, a crouch. The
    // original runs no stance block while ctrl+0x221 = 1 (L453331), so the page forgets the press under way.
    const h = harness();
    const stance = new StanceButton();
    const opened: number[] = [];
    h.menu.onOpened(() => { opened.push(1); stance.reset(); });   // what the page does (`main.ts`)
    const run = (lanes: Partial<Input>): Stance | null => stance.update(h.frame(lanes).stance, 1 / 60, 'stand');
    expect(run({ stance: true })).toBeNull();
    expect(run({ stance: true })).toBeNull();               // held a few frames, well short of the hold
    expect(run({ stance: true, inventory: true })).toBeNull();   // R2: the menu opens, the lane masked -- no tap
    expect(opened).toEqual([1]);
    expect(run({ inventory: true })).toBeNull();
    expect(run({})).toBeNull();                             // Triangle let go while open: still no tap
    expect(h.menu.isOpen()).toBe(true);
  });

  it('Square does not jump while the menu is open (Jump, action 5, gated by ctrl+0x221: L453208-453217)', () => {
    const h = harness();
    h.open();
    expect(h.frame({ jump: true }).jump).toBe(false);
    expect(h.menu.isOpen()).toBe(true);                   // Square is not one of the menu's buttons
    h.frame();
    h.tap('stance');                                      // closed
    expect(h.frame({ jump: true }).jump).toBe(true);
  });

  it('a button that confirmed stays the menu\'s until let go: no climb from the Cross that took the slot', () => {
    const h = harness();
    h.open();
    expect(h.frame({ action: true }).action).toBe(false);   // the confirm
    expect(h.menu.isOpen()).toBe(false);
    expect(h.frame({ action: true }).action).toBe(false);   // still held: still masked
    h.frame();
    expect(h.frame({ action: true }).action).toBe(true);    // a new press is the game's again
  });

  it('closed, every lane is the game\'s untouched', () => {
    const h = harness();
    const game = h.frame({ zoom: true, swap1: true, swap2: true, action: true });
    expect([game.zoom, game.swap1, game.swap2, game.action]).toEqual([true, true, true, true]);
  });

  it('the keyboard (a development build\'s): I opens and confirms, the arrows step, Backspace closes (INVENTORY_MENU_KEYS_READING)', () => {
    const h = harness();
    expect(h.menu.key('KeyW')).toBe(false);               // closed: only I is the menu's
    expect(h.menu.key('KeyI')).toBe(true);
    expect(h.menu.isOpen()).toBe(true);
    h.settle();                                           // the open's frames (states 1-2) read no key
    expect(h.menu.key('ArrowDown')).toBe(true);
    expect(h.menu.state().slot).toBe(3);
    h.settle();
    expect(h.menu.key('KeyW')).toBe(false);               // open: the walk keeps its keys
    expect(h.menu.key('Backspace')).toBe(true);
    expect(h.menu.isOpen()).toBe(false);
    h.menu.key('KeyI'); h.settle(); h.menu.key('Enter');
    expect(h.taken).toEqual([0]);
    expect(INVENTORY_MENU_KEYS_READING.KeyI).toBe('r2');
  });
});


describe('the menu drawn as the original draws it (research 212; the capture of 2026-10-05)', () => {
  const DT = 1 / 30;
  const SIZES = {
    [PANEL_TEXTURE]: { width: 128, height: 64 }, [ARROW_TEXTURE]: { width: 32, height: 32 },
    'icon0.tif': { width: 128, height: 32 }, 'icon1.tif': { width: 64, height: 32 }, 'icon2.tif': { width: 32, height: 32 },
    'icon3.tif': { width: 32, height: 32 }, [FONT_TEXT_01.texture]: { width: 512, height: 128 },
  };
  /** The menu opened on `current` and `frames` 30 Hz frames run after the opening one. */
  const opened = (frames: number, current = 0) => {
    const h = harness(seal({ current }));
    h.frame({ inventory: true }, DT);
    for (let i = 0; i < frames; i++) h.frame({}, DT);
    return h;
  };
  type H = ReturnType<typeof harness>;
  const sprites = (h: H, part: string) =>
    h.menu.layout(SIZES).items.filter((i): i is WsSprite => i.kind === 'sprite' && i.part === part);
  const texts = (h: H, part: string) =>
    h.menu.layout(SIZES).items.filter((i): i is WsText => i.kind === 'text' && i.part === part);
  const icon = (h: H, index: number) => sprites(h, 'inventoryIcon').find((s) => s.index === index);

  it('the column: x 0..160, y 168..354 -- the weapon box\'s top 364 less 10 and 196 (static init 0x3fe500; DAT_0040c108)', () => {
    expect(INVENTORY_COLUMN).toEqual({ x: 0, w: 160, top: 168, bottom: 354, cap: 5 });
    expect(HUD_LAYOUT.ammo.panel.y - INVENTORY_COLUMN.bottom).toBe(10);       // the capture: a 10 px gap, y 354-363
    expect(INVENTORY_ROWS).toEqual({ x: 10, y: 230, pitch: 60 });
    expect(INVENTORY_ICON_INSET).toBe(4);
  });

  it('the backdrop: newweapnbkrnd.tif in three pieces, tint 128, fading to 76.8 over 0.5 s from the press (L71670-71684)', () => {
    const h = opened(0);
    const panel = sprites(h, 'inventoryPanel');
    expect(panel.map((p) => [p.index, p.x, p.y, p.w, p.h])).toEqual([[0, 0, 173, 160, 176], [1, 0, 168, 160, 5], [2, 0, 349, 160, 5]]);
    expect(panel.map((p) => p.src)).toEqual([[0, 0.5, 1, 0.5], [0, 0, 1, 0.078125], [0, 0.921875, 1, 1]]);
    for (const p of panel) { expect(p.texture).toBe(PANEL_TEXTURE); expect(p.rgb).toEqual([128, 128, 128]); }
    expect(panel[0]!.alpha).toBeCloseTo(2 * DT * 76.8, 6);                  // the opening frame's own step
    expect(sprites(opened(13), 'inventoryPanel')[0]!.alpha).toBeCloseTo((14 / 15) * 76.8, 6);
    expect(sprites(opened(14), 'inventoryPanel')[0]!.alpha).toBeCloseTo(76.8, 6);                 // frame 14: t = 0.5
    expect(sprites(opened(40), 'inventoryPanel')[0]!.alpha).toBeCloseTo(76.8, 6);
    expect(INVENTORY_FADE).toEqual({ seconds: 0.5, alpha: 76.8 });
    expect(INVENTORY_FADE.alpha / 128).toBeCloseTo(HUD_COLOURS.panel[3], 6);   // the weapon box's own 0.6
  });

  it('opens over three frames at 30 Hz: unfolded, stacked at the middle row, then spread (states 1, 2; L72734-72798)', () => {
    const f0 = opened(0);
    expect(icon(f0, 1)).toBeUndefined();                                    // height 0 (FUN_00219940)
    expect(sprites(f0, 'inventoryArrow')).toEqual([]);
    const f1 = opened(1);
    expect(icon(f1, 1)).toMatchObject({ texture: 'icon0.tif', x: 14, y: 234, w: 128, h: 32, alpha: 128 });
    expect(icon(f1, 0)).toMatchObject({ texture: 'icon3.tif', x: 14, y: 234, alpha: 40 });   // stacked under it
    expect(icon(f1, 2)).toMatchObject({ texture: 'icon1.tif', x: 14, y: 234, alpha: 40 });
    expect(texts(f1, 'inventoryName')).toEqual([]);
    const f2 = opened(2);
    expect(icon(f2, 0)).toMatchObject({ x: 14, y: 174, alpha: 40 });
    expect(icon(f2, 1)).toMatchObject({ x: 14, y: 234, alpha: 128 });
    expect(icon(f2, 2)).toMatchObject({ x: 14, y: 294, alpha: 40 });
    expect(sprites(f2, 'inventoryArrow')).toHaveLength(2);
    expect(texts(f2, 'inventoryName')).toHaveLength(1);
    expect(INVENTORY_SLIDE_RATE).toBe(475);
    expect(INVENTORY_ICON_ALPHA).toEqual({ highlighted: 128, other: 40 });
  });

  it('draws in the class\'s list order (Init L73061-73147, FUN_00364e70)', () => {
    const items = opened(3).menu.layout(SIZES).items.map((i) => `${i.part}${i.index ?? ''}`);
    expect(items).toEqual(['inventoryPanel0', 'inventoryIcon0', 'inventoryIcon2', 'inventoryIcon1', 'inventoryArrow0',
      'inventoryArrow1', 'inventoryBind', 'inventoryName', 'inventoryRounds', 'inventoryMags', 'inventoryPanel1', 'inventoryPanel2']);
  });

  it('the words under the highlighted icon: the name upper-cased at (14, 278), "%d/%d" right to 148, MAGS at (14, 292) (FUN_002193d0)', () => {
    const h = opened(3);
    expect(texts(h, 'inventoryName')[0]).toMatchObject({ text: 'M4A1', x: 14, y: 278, scale: 0.9, rgb: [128, 128, 128], alpha: 80 });
    const rounds = texts(h, 'inventoryRounds')[0]!;
    expect(rounds).toMatchObject({ text: '30/30', y: 278 });
    expect(rounds.x).toBe(Math.trunc(148 - textWidth('30/30', 0.9)));
    expect(texts(h, 'inventoryMags')[0]).toMatchObject({ text: '5 MAGS', x: 14, y: 292 });
    expect(INVENTORY_WORDS).toEqual({ dx: 4, dy: 48, right: 148, line: 14, scale: 0.9 });
    expect(INVENTORY_TEXT_RGBA).toEqual([128, 128, 128, 80]);
    expect(INVENTORY_TEXT_RGBA[3] / 128).toBeCloseTo(HUD_COLOURS.text[3], 6);  // the HUD's text, as the capture shows
    const grenade = opened(3, 2);                                           // the M67: 3/3, no MAGS (one magazine)
    expect(texts(grenade, 'inventoryName')[0]!.text).toBe('M67');
    expect(texts(grenade, 'inventoryRounds')[0]!.text).toBe('3/3');
    expect(texts(grenade, 'inventoryMags')).toEqual([]);
    const pistol = opened(3, 1);
    expect(texts(pistol, 'inventoryName')[0]!.text).toBe('MARK 23');       // toupper (FUN_001fcd00)
  });

  it('the shoulder tag: "QUICK 1" / "QUICK 2" in teal, right to 148 at y 292, on the highlighted slot only (FUN_002196f0)', () => {
    expect(INVENTORY_TAG).toEqual({ l1: 'QUICK 1', l2: 'QUICK 2', rgba: [55, 140, 130, 80] });
    const tag = texts(opened(3), 'inventoryBind');
    expect(tag).toHaveLength(1);
    expect(tag[0]).toMatchObject({ text: 'QUICK 1', y: 292, rgb: [55, 140, 130], alpha: 80 });
    expect(tag[0]!.x).toBe(Math.trunc(148 - textWidth('QUICK 1', 0.9)));
    expect(texts(opened(3, 1), 'inventoryBind')[0]!.text).toBe('QUICK 2');
    expect(texts(opened(3, 2), 'inventoryBind')).toEqual([]);
  });

  it('an L1 inside rewrites the tag at once, and the tag leaves its old slot (L72641, the capture e02)', () => {
    const h = opened(3);
    h.frame({ zoomOut: true }, DT); h.frame({}, DT); h.frame({}, DT);      // Down: the HE in the middle, untagged
    expect(texts(h, 'inventoryBind')).toEqual([]);
    h.frame({ swap1: true }, DT);
    expect(h.menu.binds()).toEqual({ l1: 3, l2: 1 });
    expect(texts(h, 'inventoryBind').map((t) => t.text)).toEqual(['QUICK 1']);
    h.frame({ zoom: true }, DT); h.frame({}, DT); h.frame({}, DT);         // Up: back to the M4A1, which lost it
    expect(texts(h, 'inventoryBind')).toEqual([]);
  });

  it('the arrows: hud_arrow_off2.tif centred on the column, up at y 168, down turned half a turn at 354 - 32 (FUN_0021a5c0)', () => {
    const [up, down] = sprites(opened(3), 'inventoryArrow');
    expect(up).toMatchObject({ texture: ARROW_TEXTURE, x: 64, y: 168, w: 32, h: 32, turn: 0, index: 0 });
    expect(down).toMatchObject({ texture: ARROW_TEXTURE, x: 64, y: 322, w: 32, h: 32, turn: Math.PI, index: 1 });
    expect(up!.alpha).toBe(INVENTORY_ARROW_ALPHA_READING.idle);
    expect(INVENTORY_ARROW).toEqual({ grey: 50, lit: 100, unlit: 60, low: 60, high: 120, pulseRate: 250, settleRate: 500 });
  });

  it('the arrows\' grey pulses 60..120 at 250/s, both together (FUN_0021bb50 L72522-72545)', () => {
    const greys: number[] = [];
    const h = opened(2);
    for (let i = 0; i < 40; i++) {
      h.frame({}, DT);
      const [u, d] = sprites(h, 'inventoryArrow');
      expect(u!.rgb).toEqual(d!.rgb);
      greys.push(u!.rgb[0]);
    }
    expect(Math.max(...greys)).toBe(120);
    expect(Math.min(...greys.slice(10))).toBe(60);
  });

  it('Up scrolls in two frames: the next row rises to the middle, the incoming one waits below, the words hidden (state 4)', () => {
    const h = opened(3);
    h.frame({ zoom: true }, DT);                                           // Up: FUN_0021abf0
    expect(icon(h, 3)).toMatchObject({ texture: 'icon2.tif', x: 14, y: 294, alpha: 40 });
    expect(texts(h, 'inventoryName')).toEqual([]);
    const [up, down] = sprites(h, 'inventoryArrow');
    expect(up!.alpha).toBe(INVENTORY_ARROW_ALPHA_READING.lit);
    expect(up!.rgb[0]).toBeCloseTo(100 - 500 * DT, 6);                    // FUN_0021bb50 ran in the press's frame
    expect(down!.rgb[0]).toBe(60);
    h.frame({}, DT);                                                       // 31.7 px of 60
    expect(icon(h, 1)!.y).toBe(Math.trunc(230 - 950 * DT + 4));
    expect(icon(h, 2)!.y).toBe(Math.trunc(290 - 950 * DT + 4));
    const f = (950 * DT) / 60;
    expect(icon(h, 1)!.alpha).toBeCloseTo((1 - f) * 87 + 40, 4);
    expect(icon(h, 2)!.alpha).toBeCloseTo(f * 87 + 40, 4);
    h.frame({}, DT);                                                       // arrived: the rows renamed (FUN_0021a700)
    expect(icon(h, 0)).toMatchObject({ texture: 'icon0.tif', y: 174, alpha: 40 });
    expect(icon(h, 1)).toMatchObject({ texture: 'icon1.tif', y: 234, alpha: 128 });
    expect(icon(h, 2)).toMatchObject({ texture: 'icon2.tif', y: 294, alpha: 40 });
    expect(icon(h, 3)).toBeUndefined();
    expect(texts(h, 'inventoryName')[0]!.text).toBe('MARK 23');
    expect(sprites(h, 'inventoryArrow')[0]!.alpha).toBe(INVENTORY_ARROW_ALPHA_READING.idle);
  });

  it('Down scrolls the other way: the previous row comes down to the middle (state 5, FUN_0021a8d0)', () => {
    const h = opened(3);
    h.frame({ zoomOut: true }, DT);
    expect(icon(h, 3)).toMatchObject({ texture: 'icon2.tif', y: 174 });   // the slot before the HE: the M67
    h.frame({}, DT); h.frame({}, DT);
    expect(icon(h, 1)).toMatchObject({ texture: 'icon3.tif', y: 234, alpha: 128 });
    expect(icon(h, 0)).toMatchObject({ texture: 'icon2.tif', y: 174 });
    expect(icon(h, 2)).toMatchObject({ texture: 'icon0.tif', y: 294 });
    expect(texts(h, 'inventoryName')[0]!.text).toBe('HE');
  });

  it('closes over five frames: the column, arrows and words at once, the neighbours converge, the middle folds (states 6, 7)', () => {
    const h = opened(3);
    h.frame({ stance: true }, DT);                                         // Triangle
    expect(h.menu.isOpen()).toBe(false);
    expect(sprites(h, 'inventoryPanel')).toEqual([]);
    expect(sprites(h, 'inventoryArrow')).toEqual([]);
    expect(h.menu.layout(SIZES).items.filter((i) => i.kind === 'text')).toEqual([]);
    const step = INVENTORY_SLIDE_RATE * DT;
    for (let k = 1; k <= 3; k++) {
      h.frame({ stance: true }, DT);
      expect(icon(h, 0)!.y).toBe(Math.trunc(170 + step * k + 4));
      expect(icon(h, 2)!.y).toBe(Math.trunc(290 - step * k + 4));
      expect(icon(h, 1)).toMatchObject({ y: 234, alpha: 128 });
    }
    h.frame({}, DT);                                                       // arrived: the neighbours hidden (state 7)
    expect(icon(h, 0)).toBeUndefined();
    expect(icon(h, 2)).toBeUndefined();
    expect(icon(h, 1)).toMatchObject({ y: 234 });
    h.frame({}, DT);                                                       // folded and gone (FUN_0021aaa0)
    expect(h.menu.layout(SIZES).items).toEqual([]);
  });

  it('a confirm closes as Triangle does (the same state-6 block, L72705-72721)', () => {
    const h = opened(3);
    h.frame({ action: true }, DT);
    expect(h.taken).toEqual([0]);
    expect(sprites(h, 'inventoryPanel')).toEqual([]);
    expect(icon(h, 1)).toMatchObject({ y: 234 });
  });

  it('reads no button while the open plays out (states 1-2) nor while a step scrolls (4-5): FUN_00219c80 runs no tick there', () => {
    // States 1 and 2 call FUN_0021c4e0 and the spread (L71623-71633), states 4 and 5 the scrolls: none reads the pad;
    // only state 3's FUN_0021bda0 does. A Down in the frame after R2 -- certain with the keyboard's I then ArrowDown --
    // is lost, as on the console; the open still spreads and its arrows come up.
    const h = harness();
    h.frame({ inventory: true }, DT);                                      // R2: state 1
    h.frame({ zoomOut: true }, DT);                                        // Down at once: state 1, ignored
    expect(h.menu.state().slot).toBe(0);
    expect(icon(h, 3)).toBeUndefined();                                    // no incoming icon at (4, 4)
    expect(h.menu.key('ArrowDown')).toBe(true);                            // state 2: the key is the menu's, and ignored
    expect(h.menu.state().slot).toBe(0);
    h.frame({}, DT);                                                       // state 2 -> 3: the spread, the arrows
    expect(icon(h, 1)).toMatchObject({ texture: 'icon0.tif', x: 14, y: 234 });
    expect(sprites(h, 'inventoryArrow')).toHaveLength(2);
    h.frame({ zoomOut: true }, DT);                                        // state 3: read -- Down to the HE
    expect(h.menu.state().slot).toBe(3);
    h.frame({ stance: true }, DT);                                         // state 5: Triangle lost too
    expect(h.menu.isOpen()).toBe(true);
    h.frame({}, DT); h.frame({}, DT);                                      // the scroll lands; state 3
    expect(sprites(h, 'inventoryArrow')).toHaveLength(2);
    h.frame({ stance: true }, DT);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('the idle count runs only while buttons are read (state 3): the open frames do not count (L72683)', () => {
    const h = harness();
    h.frame({ inventory: true }, DT);
    h.frame({}, DT); h.frame({}, DT);                                      // states 1, 2
    for (let i = 0; i < 150; i++) h.frame({}, DT);                         // 5.0 s of state 3
    expect(h.menu.isOpen()).toBe(true);
    h.frame({}, DT);
    expect(h.menu.isOpen()).toBe(false);
  });

  it('a new map or the walk left: nothing drawn at once (close)', () => {
    const h = opened(5);
    h.menu.close();
    expect(h.menu.layout(SIZES).items).toEqual([]);
  });

  it('the draw anchors the column to the frame\'s left edge, as the weapon box (hud L(x)), on a wide frame too', () => {
    const h = opened(5);
    const frame = { width: 1600, height: 896 };
    const quads = h.menu.draw(frame, SIZES).quads;
    const panel = quads.find((q) => q.texture === PANEL_TEXTURE)!;
    expect(panel.x - panel.w / 2).toBeCloseTo(0, 6);
    expect(panel.w).toBeCloseTo(320, 6);
    const mid = quads.find((q) => q.texture === 'icon0.tif')!;
    expect(mid.x - mid.w / 2).toBeCloseTo(28, 6);
    expect(drawWeaponSelect(frame, h.menu.layout(SIZES), SIZES).quads[0]!.x).not.toBeCloseTo(panel.x, 3);   // centred: elsewhere
  });

  it('matches the capture: the menu icon is the weapon box\'s moved (-6, -155), as measured on c02 (cross-correlation)', () => {
    // The weapon box's icon at (20, 389) (`HUD_LAYOUT.ammo.icon`), the menu's highlighted icon at (14, 234): the capture's
    // two M4A1 icons correlate best at that shift (research 212 §11).
    const h = opened(3);
    expect(icon(h, 1)!.x - HUD_LAYOUT.ammo.icon.x).toBe(-6);
    expect(icon(h, 1)!.y - HUD_LAYOUT.ammo.icon.y).toBe(-155);
  });
});

/**
 * NET-REFILL N4 (research 312 §4.2; NET_REFILL_MAGS_HIDDEN_READING): the in-game select's MAGS (`FUN_002193d0`,
 * D:L71387 on) reads no network flag -- online the pistol's row still counts its spare magazines, while the ammo box's
 * line is hidden (`FUN_00237760` D:L85181-85192). The row's figures are the page's `Fire.magazineOf` (`./matchThrow`).
 */
describe('NET-REFILL N4: the select\'s MAGS is not hidden online (FUN_002193d0 reads no flag; research 312 §4.2)', () => {
  it('the Mark 23 with the network rule on: the box hides its MAGS, the select\'s row keeps "2 MAGS"', () => {
    const mark23: WeaponRecord = { ...DEFAULT_RIFLE, name: 'Mark 23', id: 15, fireWait: 0.2, magazine: 12, mags: 3 };
    const fire = new Fire({ grid: () => null, aim: () => null }, mark23, undefined, () => 0.5);
    fire.setNetRefill({ respawn: false });
    expect(fire.state().magazine.magsHidden).toBe(true);
    const row = fire.magazineOf(mark23);
    expect(row).toEqual({ rounds: 12, capacity: 12, spare: 2 });
    expect(magsText(row.spare)).toBe('2 MAGS');
  });
});

// Phil's (PS2P), adapted 2026-11-01: the press's pressure is masked with its button until release -- read here at the
// game's input, as `StanceButton`'s pressure branch it drove is dropped (the reader's `StancePress` decides, SEPARATE only).
it('native pressure from Triangle closing inventory stays consumed until release', () => {
  const h = harness();
  h.open();
  const frame = (pressure: number) => h.frame({ stance: pressure > 0, stancePressure: pressure });
  for (const g of [frame(0.8), frame(0.8), frame(0)]) expect([g.stance, g.stancePressure]).toEqual([false, 0]);
  const again = frame(0.8);
  expect([again.stance, again.stancePressure]).toEqual([true, 0.8]);
});

/**
 * Research 451 (SURE SHOT, the refused open): `FUN_0021c6f0` refused -- the kit's gate `FUN_005a8cb0` 0 while the trigger's
 * edge is 1, held (D:L463174-463181; D:L72830-72832) -- runs `FUN_0021aaa0`, which writes the local pad's slots 9, 7, 6
 * (X, Circle, Triangle) to state 0 (D:L72015-72017; `FUN_002da160` D:L179191-179197); the sampler reads a button still
 * down as first-down again (`FUN_002d9ff0` D:L179153-179168) and `FUN_002c60c0` counts only state 2 as held
 * (D:L166671-166684), so the cleared buttons read up, then down: a new press. A dead body never reaches the open
 * (`FUN_00219c80` D:L71617-71620) and clears nothing. The buttons are mapped to lanes through the active config.
 */
describe('research 451: a refused open clears the pad\'s X, Circle and Triangle (FUN_0021aaa0 D:L72015-72017)', () => {
  afterEach(() => { controllerConfigs.reset(); });

  /**
   * One page frame a GAME frame (`GAME_FRAME_DT`, a 30 Hz page): the class's frames are then the original's updates, and
   * `N` below counts game frames (the clear's span is game time, `INVENTORY_REFUSAL_CLEAR_SECONDS`).
   */
  const G = GAME_FRAME_DT;
  /** Game frames of the game's input with `lanes` held, R2's lane (`inventory`) pressed on frame `at`; the game's inputs. */
  const run = (h: ReturnType<typeof harness>, lanes: Partial<Input>, at: number, n: number): Input[] => {
    const out: Input[] = [];
    for (let i = 0; i < n; i++) out.push(h.frame({ ...lanes, ...(i === at ? { inventory: true } : {}) }, G));
    return out;
  };
  /** The trigger's edge machine (`weaponRaise.ts` `nextEdge`, `FUN_00594cf0` D:L453543-453567) over the game's `fire`: the presses. */
  const presses = (games: readonly Input[]): number => {
    let edge: 0 | 1 | 2 | 3 = 0, n = 0;
    for (const g of games) { edge = nextEdge(edge, g.fire); if (edge === 2) n++; }
    return n;
  };
  const N = INVENTORY_REFUSAL_CLEAR_UPDATES_READING;

  it('SURE SHOT (Goldeneye), X held, the gate closed: R1\'s refused open makes fire read up, then down -- one more press', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const games = run(h, { fire: true }, 5, 5 + 1 + N + 5);
    expect(h.menu.isOpen()).toBe(false);
    expect(games.slice(0, 6).every((g) => g.fire), 'held, and the refusal\'s own update as sampled').toBe(true);
    expect(games.slice(6, 6 + N).map((g) => g.fire), 'the cleared update(s)').toEqual(Array(N).fill(false));
    expect(games.slice(6 + N).every((g) => g.fire), 'down again').toBe(true);
    expect(presses(games)).toBe(2);
  });

  it('five R1 presses with X held: six presses of the trigger (the hand-over\'s leg 1, predicted)', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const games: Input[] = [];
    for (let k = 0; k < 5; k++) games.push(...run(h, { fire: true }, 10, 20));
    expect(presses(games)).toBe(6);
  });

  it('R1\'s first-down at update N with X held, the gate closed: the trigger\'s new press (edge 2) is at N+2, each of five', () => {
    // A capture of the original, pending review (research 451 §5, leg 1: SURE SHOT, M4A1 SD on single, X held, R1 x5; per-frame
    // pad stamps): R1 first-down at frame N, X's slot 9 a new first-down (state 1) at N+1 -- never 0 in a sampled frame,
    // 2 -> 1 -> 2 -- and the round at N+2, the same for all five. The port's lane reads X up at N+1 (the class's cleared
    // update: state 1 is not held for FUN_002c60c0) and down at N+2, where `nextEdge` makes the press (3 -> 2). This class
    // sees the game's lanes only: the round itself is the firearm's (`./fire`), driven from the edge, not reached here.
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    let edge: 0 | 1 | 2 | 3 = 0, update = 0;
    const gaps: number[] = [];
    for (let k = 0; k < 5; k++) {
      let r1 = -1;
      for (let i = 0; i < 20; i++, update++) {
        const g = h.frame({ fire: true, ...(i === 10 ? { inventory: true } : {}) }, G);   // one game frame each
        if (i === 10) r1 = update;
        edge = nextEdge(edge, g.fire);
        if (edge === 2 && r1 >= 0) gaps.push(update - r1);
      }
    }
    expect(gaps, 'the R1 -> new press gap, updates').toEqual([2, 2, 2, 2, 2]);
  });

  it('PRECISION SHOOTER (Default): fire is R1 (slot 10), which the clear never writes -- fire does not move', () => {
    const h = harness(seal(), { canChange: false });
    const games = run(h, { fire: true }, 5, 20);
    expect(games.every((g) => g.fire)).toBe(true);
    expect(presses(games)).toBe(1);
  });

  it('PRECISION SHOOTER: X is Action there, so an X held at the refusal is a new Action press', () => {
    const h = harness(seal(), { canChange: false });
    const games = run(h, { fire: true, action: true }, 5, 5 + 1 + N + 2);
    expect(games.slice(6, 6 + N).map((g) => g.action)).toEqual(Array(N).fill(false));
    expect(games[6 + N]!.action).toBe(true);
  });

  it('a dead body\'s refused press clears nothing (D:L71617-71620: the open is never reached)', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { alive: false, canChange: false });
    const games = run(h, { fire: true, action: true, jump: true, stance: true }, 5, 20);
    for (const lane of ['fire', 'action', 'jump', 'stance'] as const) expect(games.every((g) => g[lane]), lane).toBe(true);
    expect(presses(games)).toBe(1);
  });

  it('the gate open: the menu opens and clears nothing of fire (the open\'s own masks are INVENTORY_LANES\')', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness();
    const games = run(h, { fire: true }, 5, 20);
    expect(h.menu.isOpen()).toBe(true);
    expect(games.every((g) => g.fire)).toBe(true);
  });

  it('SURE SHOT: Circle held at the refusal is a new Action and Jump press', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const games = run(h, { action: true, jump: true }, 5, 5 + 1 + N + 2);
    expect(games[5]!.action && games[5]!.jump).toBe(true);
    for (const lane of ['action', 'jump'] as const) {
      expect(games.slice(6, 6 + N).map((g) => g[lane]), lane).toEqual(Array(N).fill(false));
      expect(games[6 + N]![lane], lane).toBe(true);
    }
  });

  it('Triangle held at the refusal: at one update no reader sees its clear -- no stance press, no cancel, no tap (D:L453331-453334)', () => {
    // The controller first (the constant's 1): the sampler sets Triangle's byte to 1 before the stance block reads it, so the
    // block never re-arms (it arms only on the byte at 0). The HUD first would make it 2 updates AND the stance re-press.
    expect(N, 'the stance lane is out of the clear only while the constant is 1 (research 451 §2, §3)').toBe(1);
    for (const name of ['Goldeneye', 'Default'] as const) {
      controllerConfigs.select(name);
      const h = harness(seal(), { canChange: false });
      const games = run(h, { stance: true, stancePressure: 0.8 }, 5, 5 + 1 + N + 2);
      for (const g of games) expect([g.stance, g.stancePressure, !!g.stanceCancelled], name).toEqual([true, 0.8, false]);
    }
  });

  it('a main-thread stall before the next update keeps the clear: the host clock 3x the frame\'s real seconds, still a new press', () => {
    // The 0d3b220872 review: the clock (performance.now() inside the callback) and `real` (the rAF timestamp delta) are two
    // time bases, so a stall between them must not drop the clear -- that R1 would fire nothing, the reported bug.
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const games = run(h, { fire: true }, 5, 6);
    h.state.now += 2 * G;    // with the frame's own G: the clock moves 3 G while the next frame's `real` is G
    for (let i = 0; i < 6; i++) games.push(h.frame({ fire: true }, G));
    expect(games[6]!.fire, 'the cleared update').toBe(false);
    expect(games.slice(7).every((g) => g.fire), 'down again').toBe(true);
    expect(presses(games)).toBe(2);
  });

  it('a cleared button let go inside the clear stays up: nothing more', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    for (let i = 0; i < 5; i++) h.frame({ fire: true });
    h.frame({ fire: true, inventory: true });
    const games = [h.frame(), h.frame(), h.frame()];
    expect(games.every((g) => !g.fire)).toBe(true);
  });

  /**
   * The class's game `fire` fed into the real firearm (`./fire`), as a page that takes the trigger from the menu's output
   * would (`trigger` on the lane's change, then `update(dt)`), at `fps` page frames a second: X held, R1 tapped five times
   * (three page frames down), spaced ~34 game frames as the capture's. The rounds, and each new round's GAME frame (the
   * firearm's own steps, `GAME_FRAME_DT`) counted from the first step that reads R1's first-down. Single shot.
   */
  const firing = (fps: number, phase: number): { rounds: number; gaps: number[] } => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const eye: [number, number, number] = [0, 20, 0];
    // `fire.test.ts`'s `world([wallAt(-30)])`: a wall across x at z -30 for the round to meet.
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
      [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, { ...DEFAULT_RIFLE, magazine: 1000 }, undefined, () => 0.5);
    fire.setGun({ trigger: () => {}, roundsPerPull: () => 1, interval: (w) => w, round: (d) => d });
    let rounds = 0, steps = 0, acc = 0, r1Step = -1;
    const gaps: number[] = [];
    fire.subscribe((e) => { if (e.type === 'round') { rounds++; if (r1Step >= 0) { gaps.push(steps - r1Step); r1Step = -1; } } });
    const dt = fps === 30 ? GAME_FRAME_DT : 1 / fps, spacing = Math.round(34 * GAME_FRAME_DT * fps);
    let held = false;
    const page = (r1: boolean, first: boolean): void => {
      if (first) r1Step = steps + 1;                     // the first step at or after R1's page frame reads its first-down
      const g = h.frame({ fire: true, ...(r1 ? { inventory: true } : {}) }, dt);
      if (g.fire !== held) { held = g.fire; if (held) fire.pull(); else fire.release(); }
      acc += dt;
      const n = Math.floor((acc + 1e-9) / GAME_FRAME_DT); steps += n; acc -= n * GAME_FRAME_DT;   // the firearm's own steps
      fire.update(dt);
    };
    for (let i = 0; i < spacing + phase; i++) page(false, false);
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < spacing; i++) page(i < 3, i === 0);
    }
    return { rounds, gaps };
  };

  it.each([30, 60, 120, 144])('%s Hz page, the real firearm: five refused R1 taps with X held fire 6 rounds, each new one 2 or 3 GAME frames after R1', (fps) => {
    // The capture of the original (research 451 §5, leg 1, reviewed): 6 rounds; slot 9 2 -> 1 -> 2, the round at N+2 of the
    // 30 Hz game frames. The firearm steps its pad once a GAME frame (`fireCore.ts` `update`, `padStep` per GAME_FRAME_DT),
    // so the cleared lane must read up across a whole game step, not one page frame. Every phase of the page against the kit.
    const phases = Array.from({ length: Math.ceil(fps / 30) + 1 }, (_, phase) => firing(fps, phase));
    expect(phases.map((p) => p.rounds), 'rounds, each phase').toEqual(phases.map(() => 6));
    // The gap: the original's 2, or 3 -- research 451 §2's named residue, the firearm's pad (`padStep`) re-entering at state 1
    // where the original's X goes 2 -> 1 -> 2: one GAME frame late whenever the kit step that reads R1 falls in R1's own page
    // frame (every one at 30 Hz). Never fewer than the original's, never a second game frame more.
    for (const p of phases) expect(p.gaps.every((g) => g === 2 || g === 3), `R1 -> round, game frames: ${p.gaps}`).toBe(true);
    if (fps === 30) expect(phases.map((p) => p.gaps), 'one page frame a game frame: the residue every tap').toEqual(phases.map(() => [3, 3, 3, 3, 3]));
  });

  /**
   * LATER 1345 (research 451 §5, "the round is one frame late in the port"; the side finding of LATER 1412's pin review).
   * The original's clear writes X's slot to 0 while X is down (`FUN_0021aaa0` D:L72015-72017, `FUN_002da160`
   * D:L179191-179197) and the sampler steps it on (`FUN_002d9ff0` D:L179153-179168): 2 -> 1 -> 2, never 0 in a sampled
   * frame, so `FUN_002c60c0`'s held (state 2 only, D:L166671-166684) reads false for exactly ONE update and the round
   * leaves at N+2 (PC 4's capture, r0004, `D:/s2u-records/SURESHOT-PC4/`, legs 1-2; a capture, pending review).
   *
   * The harness: the class's game `fire` into the real firearm as the pages' feed hands it (a let-go and a press on the
   * lane's change, then `update(dt)`), X held, at `fps`. Each of the firearm's game steps (`GAME_FRAME_DT`) is recorded:
   * `up`, the trigger physically let go at the step; `held`, the pad's held answer the step reads (`Fire.padHeldRead`); and
   * whether a round left on it. `r1`: per R1 first-down, the first step at or after its page frame -- the capture's N.
   * `xTap`: X itself let go from that page frame until a step has read it up (the shortest re-tap the game reads; no R1).
   * `weapon`: a record fired through `./accuracy`'s single-shot gate; without one, `firing`'s gun (one round a pull).
   *
   * Expected failures (the controller's ruling, 2026-11-24: no fix in v0.4.32; `tools/test/itFailsRegister.test.ts`, LATER
   * 1345). No lane can carry it: the firearm steps its own pad from a boolean (`fireCore.ts` `update`, `padStep`), which
   * passes through state 1 on the way back down, and the class cannot see the firearm's step phase. The route for v0.4.33
   * is the original's own: the pad written to 0 with the trigger held, in `fireCore.ts` (research 451 §5).
   */
  const drive = (fps: number, frames: number, r1Down: (f: number) => boolean, xTap: (f: number) => boolean = () => false, weapon?: WeaponRecord) => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const eye: [number, number, number] = [0, 20, 0];
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
      [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, weapon ?? { ...DEFAULT_RIFLE, magazine: 1000 }, undefined, () => 0.5);
    fire.setGun(weapon
      ? { trigger: () => {}, roundsPerPull: () => roundsPerPull(1), interval: (w) => fireInterval(w, 1), round: (d) => d }
      : { trigger: () => {}, roundsPerPull: () => 1, interval: (w) => w, round: (d) => d });
    const steps: { up: boolean; held: boolean; round: boolean }[] = [], r1: number[] = [];
    let rounds = 0, fired = false, acc = 0, trigger = false, letGo = false;
    fire.subscribe((e) => { if (e.type === 'round') { rounds++; fired = true; } });
    const dt = fps === 30 ? G : 1 / fps;
    for (let f = 0; f < frames; f++) {
      const down = r1Down(f);
      if (down && !(f > 0 && r1Down(f - 1))) r1.push(steps.length);
      if (xTap(f)) letGo = true;
      const g = h.frame({ fire: !letGo, ...(down ? { inventory: true } : {}) }, dt);
      if (g.fire !== trigger) { trigger = g.fire; if (trigger) fire.pull(); else fire.release(); }   // the pages' feed
      acc += dt;
      const n = Math.floor((acc + 1e-9) / G); acc -= n * G;               // the firearm's own steps this page frame
      expect(n, 'at most one game step a page frame (30 Hz and up)').toBeLessThanOrEqual(1);
      const held = fire.padHeldRead(dt);
      fired = false;
      fire.update(dt);
      expect(fired && n === 0, 'a round leaves only at a game step').toBe(false);
      if (n > 0) { steps.push({ up: !trigger, held, round: fired }); letGo = false; }
    }
    return { steps, r1, rounds };
  };
  /** The capture's leg 1 at `fps`: five R1 taps (three page frames down) ~34 game frames apart, the first `phase` page frames late. */
  const leg1 = (fps: number, phase: number): ReturnType<typeof drive> => {
    const spacing = Math.round(34 * G * fps);
    return drive(fps, 6 * spacing + phase, (f) => f >= spacing + phase && (f - phase) % spacing < 3);
  };
  /** Every phase of the page against the kit's steps, and one more. */
  const phasesOf = (fps: number): number[] => Array.from({ length: Math.ceil(fps / 30) + 1 }, (_, phase) => phase);

  it.fails.each([30, 60, 120, 144])('GAP (LATER 1345), the residue: %s Hz page, X held, a refused R1 at update N -- the round leaves at N+2 (the original\'s), every tap, every phase; flips with the original\'s pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33', (fps) => {
    for (const phase of phasesOf(fps)) {
      const d = leg1(fps, phase);
      expect(d.rounds, `phase ${phase}: rounds`).toBe(6);
      const gaps = d.r1.map((n) => d.steps.findIndex((s, i) => i >= n && s.round) - n);
      expect(gaps, `phase ${phase}: R1 -> round, game updates`).toEqual([2, 2, 2, 2, 2]);
    }
  });

  it.fails.each([30, 60, 120, 144])('GAP (LATER 1345), the span: %s Hz page -- per refused R1 the trigger reads not held for exactly ONE game update (the constant), let go across no second; flips with the original\'s pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33', (fps) => {
    expect(N, 'INVENTORY_REFUSAL_CLEAR_UPDATES_READING').toBe(1);
    for (const phase of phasesOf(fps)) {
      const d = leg1(fps, phase);
      const per = (key: 'up' | 'held', want: boolean): number[] =>
        d.r1.map((n, k) => d.steps.slice(n, d.r1[k + 1] ?? d.steps.length).filter((s) => s[key] === want).length);
      // The original's held answer over a clear: 2 -> 1 -> 2, one update not held (state 1), research 451 §5.
      expect(per('held', false), `phase ${phase}: updates the pad reads not held, per R1`).toEqual([N, N, N, N, N]);
      // The clear's own span, whatever carries it: the trigger is never let go across a second game update (60 Hz: three
      // page frames of 1/60 s span `GAME_FRAME_DT`, and in one phase hold two of the firearm's steps).
      expect(per('up', true).every((n) => n <= N), `phase ${phase}: updates the trigger is let go, per R1: ${per('up', true)}`).toBe(true);
    }
  });

  it.fails('GAP (LATER 1345), 60 Hz, R1 tapped 10 a second with X held: every phase fires what X re-tapped at its best phase fires (the bad phase fires 0); flips with the original\'s pad write (FUN_0021aaa0) in fireCore.ts, v0.4.33', () => {
    // FireWait 0.12 on single (`./accuracy` `fireInterval`: x 1.2), three seconds; a tap every 6 page frames, one frame down.
    // A CONSISTENCY bound, not a parity figure: the expected count is the port's own X re-tapped at its best phase (rapid
    // R1 taps of the original are unmeasured, research 451 §5); it holds the 60 Hz swallow as a gap.
    const fps = 60, frames = 3 * fps, every = 6;
    const record: WeaponRecord = { ...DEFAULT_RIFLE, fireWait: 0.12, magazine: 100000 };
    const at = (phase: number) => (f: number): boolean => f >= phase && (f - phase) % every === 0;
    const phases = Array.from({ length: every }, (_, phase) => phase);
    const best = Math.max(...phases.map((p) => drive(fps, frames, () => false, at(p), record).rounds));
    expect(best, 'X re-tapped fires').toBeGreaterThan(1);
    expect(phases.map((p) => drive(fps, frames, at(p), undefined, record).rounds), 'rounds, each phase of R1').toEqual(phases.map(() => best));
  });

  it('a lane no cleared button holds is untouched (SURE SHOT: the peek, the zoom, R1 itself)', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const games = run(h, { fire: true, leanLeft: true, zoom: true, reload: true }, 5, 10);
    for (const lane of ['leanLeft', 'zoom', 'reload'] as const) expect(games.every((g) => g[lane]), lane).toBe(true);
  });
});

/**
 * LATER 1412 (the owner's aim: SURE SHOT's R1 re-fire kept, but never faster than the weapon). The original's gate is a
 * decompile reading (research 451 §1.8-9): the refused open's clear (`FUN_0021aaa0`) writes X back to a new press, whose
 * round still passes the kit's frame gate -- no round while the kit's timer `kit+0x81c` is above 0 (`FUN_005c0ae0`
 * D:L476446-476448), the timer set at each round (D:L475517). Rapid R1 taps were never captured of the original (the
 * capture, research 451 §5 leg 1, spaces its five ~34 game frames apart): this pins the port's routing, not a measured
 * rate. The port routes the same way: the menu's clear only shapes the game's `fire` lane; rounds leave only in the
 * firearm's game steps (`fireCore.ts` `update`) when the pad reads held and the wait has run out, each round setting the
 * wait to `fireInterval` (`./accuracy`: FireWait x 1.2 single, x 0.8 burst and automatic). The harness is the research 451
 * block's `firing` (the class's game `fire` into the real firearm), with the mode's real gun and the taps' spacing as
 * parameters. No "never more than X re-tapped" bound: under the original's own clear (a pad write while held, LATER
 * 1345) a cleared X costs one not-held update where an X re-tap costs two, so the original out-fires that baseline; a
 * pin stricter than the original would lock in a departure (the controller's ruling). The owner's aim proper is the
 * weapon's own wait (every gap) and the total it allows.
 */
describe('LATER 1412: SURE SHOT\'s R1 re-fire never faster than the weapon (the normal fire gate)', () => {
  afterEach(() => { controllerConfigs.reset(); });

  /** An M16A2-like record: FireWait 0.12 (`DEFAULT_RIFLE`'s, the M4A1's), the magazine deep enough never to run dry. */
  const RECORD: WeaponRecord = { ...DEFAULT_RIFLE, fireWait: 0.12, magazine: 100000 };
  const MODES = [[1, 'single'], [2, 'burst'], [3, 'automatic']] as const;
  const SECONDS = 3;

  /**
   * `SECONDS` of page frames at `fps`, X held, a tap every 1 / `rate` s from page frame `phase` (each tap's start at least
   * two page frames after the last: one down, one up). `r1`: the tap is R1 (the inventory, refused) held one page frame, X
   * held throughout; otherwise X itself let go at the tap's page frame and held again once a firearm step has read it up
   * (the shortest re-tap the game reads). Each round's game step, and the rounds of each pull of the firearm's trigger.
   */
  const run = (mode: 1 | 2 | 3, fps: number, rate: number, phase: number, r1: boolean): { steps: number[]; perPull: number[]; T: number } => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const eye: [number, number, number] = [0, 20, 0];
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
      [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, RECORD, undefined, () => 0.5);
    fire.setGun({ trigger: () => {}, roundsPerPull: () => roundsPerPull(mode), interval: (w) => fireInterval(w, mode), round: (d) => d });
    const dt = fps === 30 ? GAME_FRAME_DT : 1 / fps, frames = Math.round(SECONDS * fps);
    const starts = new Set<number>();
    for (let k = 0, last = -2; ; k++) {
      const s = Math.max(phase + Math.round((k * fps) / rate), last + 2);
      if (s >= frames) break;
      starts.add(s); last = s;
    }
    const steps: number[] = [], perPull: number[] = [];
    let step = 0, acc = 0, held = false, letGo = false;
    fire.subscribe((e) => { if (e.type === 'round') { steps.push(step); perPull[perPull.length - 1]!++; } });
    for (let f = 0; f < frames; f++) {
      if (!r1 && starts.has(f)) letGo = true;
      const x = r1 || !letGo;
      const g = h.frame({ fire: x, ...(r1 && starts.has(f) ? { inventory: true } : {}) }, dt);
      // perPull opens at each page-level rising edge; the firearm clears its pull only when a game step reads up, so a
      // re-press inside one step splits across two entries -- the burst check can only under-count (never fail falsely).
      if (g.fire !== held) { held = g.fire; if (held) { perPull.push(0); fire.pull(); } else fire.release(); }
      acc += dt;
      const n = Math.floor((acc + 1e-9) / GAME_FRAME_DT); acc -= n * GAME_FRAME_DT;
      expect(n, 'at most one game step a page frame (30 and 60 Hz)').toBeLessThanOrEqual(1);
      step += n;
      fire.update(dt);
      if (letGo && n > 0) letGo = false;                  // a step has read X up: held again from the next page frame
    }
    return { steps, perPull, T: frames * dt };
  };

  for (const fps of [30, 60]) {
    for (const [mode, name] of MODES) {
      // A tap needs a page frame down and one up, so 20 a second is held to 15 at 30 Hz (`last + 2` below); true at 60 Hz.
      it.each([5, 10, 20])(`${fps} Hz page, ${name}: R1 tapped %s a second (at most a tap every 2 page frames) with X held -- every gap at least the weapon's wait, never above its total`, (rate) => {
        const interval = fireInterval(RECORD.fireWait, mode);
        const minGap = Math.ceil(interval / GAME_FRAME_DT - 1e-9);
        const phases = Array.from({ length: (2 * fps) / 30 + 2 }, (_, p) => p);
        for (const phase of phases) {
          const sure = run(mode, fps, rate, phase, true);
          const at = `phase ${phase}`;
          const gaps = sure.steps.slice(1).map((s, i) => s - sure.steps[i]!);
          expect(gaps.every((g) => g >= minGap), `${at}: gaps ${gaps} against ${minGap} game frames`).toBe(true);
          expect(sure.steps.length, `${at}: rounds against 1 + floor(T / interval)`).toBeLessThanOrEqual(1 + Math.floor(sure.T / interval + 1e-9));
          if (mode === 2) expect(Math.max(...sure.perPull), `${at}: a burst's rounds a pull`).toBeLessThanOrEqual(3);
          // Not vacuous: at 5 a second, on single, the R1 re-presses do fire again (a held X alone fires one round). Faster
          // taps may be absorbed (at 20 a second fire never reads held two game steps running, R1 or X): fewer, never more.
          if (mode === 1 && rate === 5) expect(sure.steps.length, `${at}: SURE SHOT's re-fire kept`).toBeGreaterThan(1);
        }
      });
    }
  }
});

/**
 * Research 451 §4: the walking pages' trigger fed from the R2 inventory's game lane. `./main` and `./matchMount` handed the
 * firearm its trigger from the merged lanes before `InventoryMenu.frame`, so a refused open's clear reached nothing that
 * fires. The page now takes the game's `fire` -- the merged lane less the clear, `InventoryMenu.clears` read before
 * `frame` -- so the trigger stays where it was in the page frame (ahead of the menu's gate, `press`'s `canChange`) and only
 * the clear changes what it is fed. No page frame changes order. The two wirings below are the pages' own, run on the
 * class and the real firearm (`./fire`); the pages' text is pinned at the end (no mount-level harness reaches them).
 */
describe('research 451 §4: the walking trigger is the inventory\'s game lane (main.ts, matchMount.ts)', () => {
  afterEach(() => { controllerConfigs.reset(); });

  /** A page's walking pad frames with the real firearm: `wiring` 'merged' (was) or 'game' (now); each page frame's trigger call and rounds. */
  const page = (wiring: 'merged' | 'game', config: 'Default' | 'Reverse' | 'Config4' | 'Goldeneye', canChange: boolean, perPull: number, fps: number) => {
    controllerConfigs.select(config);
    const h = harness(seal(), { canChange });
    const eye: [number, number, number] = [0, 20, 0];
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [wall],
      [{ modelName: wall.modelName, path: `${wall.path}0`, first: 0, count: 1 }]);
    const fire = new Fire({ grid: () => grid, aim: () => ({ eye, far: [0, 20, -1000] }) }, { ...DEFAULT_RIFLE, magazine: 1000 }, undefined, () => 0.5);
    fire.setGun({ trigger: () => {}, roundsPerPull: () => perPull, interval: (w) => w, round: (d) => d });
    let rounds = 0;
    fire.subscribe((e) => { if (e.type === 'round') rounds++; });
    let padMerged: Input = noInput();
    const calls: string[] = [], shots: number[] = [], games: Input[] = [], inputs: Input[] = [], held: boolean[] = [], cleared: boolean[] = [];
    const dt = 1 / fps;
    /**
     * The hands (`matchThrow.ts` `hands().trigger`, :830-858), which `matchFirearm.ts`:910 asks first: a throwable up, a
     * press pulls the pin and a let-go throws it (`grenade.pull` / `release`); the launcher up, a press is a rocket
     * (`launch`; its raise and NoFire waits not modelled: none run in these scripts). Their counts, `throws` / `rockets`.
     */
    let pin = false, throws = 0, rockets = 0;
    const handsTake = (hand: 'grenade' | 'launcher', down: boolean): void => {
      if (hand === 'launcher') { if (down) rockets++; return; }
      if (down) pin = true;
      else if (pin) { pin = false; throws++; }
    };
    let hand: 'grenade' | 'launcher' | undefined;
    /** The trigger as the pages' `trigger` / `firearm.trigger` hand it to the real firearm, each call recorded (`by`: its source). */
    const pull = (down: boolean, by: string): string => {
      if (hand) {                                                     // matchFirearm.ts:910: the hands' (a throwable's, the launcher's)
        if (!down && fire.triggerHeld()) fire.release();              // :904: a let-go frees the firearm's hold first
        handsTake(hand, down);
      } else if (down) fire.pull(); else fire.release();
      return `${by}${down}`;
    };
    /**
     * One page frame with `lanes` held: the trigger fed as the wiring does, the inventory's frame, the firearm's update.
     * `off`: the clear's reach is off this frame (a lock, a turret, the mouse captured: main.ts's `reach`). `mouse`: the
     * camera's `onFire` between the last frame and this one (`./camera`: down only while captured), both wirings alike.
     * `hand`: a throwable (`grenade.equipped()`) or the launcher (`rocket.up()`) in the hands this frame: the trigger theirs.
     */
    const step = (lanes: Partial<Input> & { off?: boolean; mouse?: boolean; hand?: 'grenade' | 'launcher' }): void => {
      const { off = false, mouse, hand: up, ...pad } = lanes;
      hand = up;
      let call = mouse === undefined ? '' : `${pull(mouse, 'mouse:')} `;
      const input = { ...noInput(), ...pad };
      if (wiring === 'merged') { if (input.fire !== padMerged.fire) call += pull(input.fire, ''); }
      const reach = !off && !hand, clearing = reach && h.menu.clears('fire', input);   // the pages' `reach`: no throwable or launcher up
      if (wiring === 'game') {   // main.ts's three lines: `triggerFeed` every frame, on the reach its edge, off it the old line
        const fed = h.menu.triggerFeed(padMerged, input, reach);
        if (reach) { if (fed !== null) call += pull(fed, ''); }
        else if (input.fire !== padMerged.fire) call += pull(input.fire, '');
      }
      const game = h.frame(pad, dt);
      if (reach) expect(game.fire, 'clears() before frame is frame\'s own game fire').toBe(input.fire && !clearing);
      const before = rounds;
      fire.update(dt);
      calls.push(call); shots.push(rounds - before); games.push(game); inputs.push(input); held.push(fire.triggerHeld()); cleared.push(clearing);
      padMerged = input;
    };
    return { step, calls, shots, games, inputs, held, cleared, rounds: () => rounds, throws: () => throws, rockets: () => rockets };
  };
  /** The scripts, page frames of lanes: a hold, taps, and with R2 (`inventory`) pressed into a held trigger. */
  const hold = (n: number): Partial<Input>[] => [...Array(5).fill({}), ...Array(n).fill({ fire: true }), ...Array(10).fill({})];
  /** Taps three game frames down, spaced 0.4 s, at `fps`: each held past the kit's second read. */
  const taps = (n: number, fps: number): Partial<Input>[] => Array.from({ length: n }, (_, i) => (i % Math.ceil(0.4 * fps) < Math.ceil(3 * GAME_FRAME_DT * fps) ? { fire: true } : {}));
  const refusedR2 = (n: number): Partial<Input>[] => Array.from({ length: n }, (_, i) => ({ fire: i >= 2 && i < n - 4, ...(i % 15 === 7 ? { inventory: true } : {}) }));
  const run = (p: ReturnType<typeof page>, script: Partial<Input>[]): void => { for (const l of script) p.step(l); };

  it.each([
    ['Default', 1], ['Default', 3], ['Default', Infinity], ['Reverse', Infinity], ['Config4', 1], ['Goldeneye', 1], ['Goldeneye', Infinity],
  ] as const)('the inventory closed and idle (%s, %s a pull): the game fire is the merged lane every frame; the trigger press for press as before', (config, perPull) => {
    for (const fps of [30, 60, 144]) {
      for (const script of [hold(90), taps(4 * fps, fps)]) {
        const was = page('merged', config, true, perPull, fps), now = page('game', config, true, perPull, fps);
        run(was, script); run(now, script);
        expect(now.games.map((g) => g.fire), `${fps} Hz: game fire === merged fire`).toEqual(now.inputs.map((i) => i.fire));
        expect(now.calls, `${fps} Hz: the trigger's calls, frame for frame`).toEqual(was.calls);
        expect(now.shots, `${fps} Hz: the rounds, frame for frame`).toEqual(was.shots);
        expect(now.rounds()).toBeGreaterThan(0);
      }
    }
  });

  it('a plain press: the trigger\'s first-down on the same page frame as before, the first round at the kit\'s second read (fire.test.ts:2514)', () => {
    const was = page('merged', 'Default', true, 1, 30), now = page('game', 'Default', true, 1, 30);
    run(was, hold(10)); run(now, hold(10));
    expect(now.calls.indexOf('true')).toBe(5);                     // the press's own page frame
    expect(was.calls.indexOf('true')).toBe(5);
    expect(now.shots.indexOf(1), 'read 1 state 1, read 2 held: one game frame after the press').toBe(6);
    expect(was.shots.indexOf(1)).toBe(6);
  });

  it.each(['Default', 'Reverse', 'Config4'] as const)('%s: R1 held, R2 refused -- the trigger unchanged (fire is R1, slot 10: the clear never writes it)', (config) => {
    for (const fps of [30, 60, 144]) for (const perPull of [1, 3, Infinity]) {
      const was = page('merged', config, false, perPull, fps), now = page('game', config, false, perPull, fps);
      run(was, refusedR2(100)); run(now, refusedR2(100));
      expect(now.calls).toEqual(was.calls);
      expect(now.shots).toEqual(was.shots);
    }
  });

  it('SURE SHOT, X held, R1 refused: the clear now reaches the gun -- a let-go and a new press per refusal, one round each on single', () => {
    const was = page('merged', 'Goldeneye', false, 1, 30), now = page('game', 'Goldeneye', false, 1, 30);
    const script = refusedR2(100);                                // R1 (`inventory`) six times into a held X
    run(was, script); run(now, script);
    const refusals = script.filter((l, i) => l.inventory && l.fire && script[i + 1]?.fire && script[i + 2]?.fire).length;
    expect(was.rounds(), 'was: one press, one round').toBe(1);
    expect(now.rounds(), 'now: one more per refusal').toBe(1 + refusals);
    expect(now.calls.filter((c) => c === 'true').length).toBe(1 + refusals);
  });

  /**
   * The blast radius (research 451 §6): seeded random pads -- the trigger, R2 / R1 (`inventory`), the menu's Cross, Up and
   * Triangle -- with the gate open and closed, every config, single, burst and auto, 30, 60 and 144 Hz. Every reader of
   * the trigger reads `firearm.trigger`'s calls or what they set (`Fire.triggerHeld`: the network's trigger, `main.ts`
   * `net?.trigger` / `net?.frame`; the raise's pad, the rounds): outside a clear's frames (and the one after), the calls
   * and the held trigger are the old wiring's frame for frame; under the three configs whose fire is R1 nothing differs.
   */
  it('the blast radius: the trigger fed as before on every frame outside a refused open\'s clear of fire; R1-fire configs on every frame', () => {
    let seed = 451;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const config of ['Default', 'Reverse', 'Config4', 'Goldeneye'] as const) for (const canChange of [false, true]) for (const fps of [30, 60, 144]) for (const perPull of [1, 3, Infinity]) {
      const script: Partial<Input>[] = [];
      let fire = false;
      for (let i = 0; i < 400; i++) {
        if (rnd() < 0.08) fire = !fire;
        script.push({ fire, ...(rnd() < 0.04 ? { inventory: true } : {}), ...(rnd() < 0.05 ? { action: true } : {}), ...(rnd() < 0.03 ? { zoom: true } : {}), ...(rnd() < 0.02 ? { stance: true } : {}) });
      }
      const was = page('merged', config, canChange, perPull, fps), now = page('game', config, canChange, perPull, fps);
      run(was, script); run(now, script);
      const tag = `${config} gate ${canChange} ${fps} Hz ${perPull}`;
      if (config !== 'Goldeneye' || canChange) {
        expect(now.cleared.some(Boolean), `${tag}: no clear of fire`).toBe(false);
        expect(now.calls, tag).toEqual(was.calls);
        expect(now.shots, tag).toEqual(was.shots);
        continue;
      }
      expect(now.cleared.some(Boolean), `${tag}: the script reaches a clear`).toBe(true);
      for (let i = 0; i < script.length; i++) {
        if (now.cleared[i] || (i > 0 && now.cleared[i - 1])) continue;
        expect([now.calls[i], now.held[i]], `${tag}, frame ${i}`).toEqual([was.calls[i], was.held[i]]);
      }
    }
  });

  /** A seeded script under SURE SHOT's gate closed: X (`fire`) toggled, R1 (`inventory`) pressed, the reach off at random runs. */
  const seeded = (seed: number, n: number, offRate: number): (Partial<Input> & { off?: boolean })[] => {
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const out: (Partial<Input> & { off?: boolean })[] = [];
    let fire = false, off = false;
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.08) fire = !fire;
      if (rnd() < offRate) off = !off;
      out.push({ fire, off, ...(rnd() < 0.06 ? { inventory: true } : {}) });
    }
    return out;
  };

  /**
   * Research 451 §6, the turret, a lock, the dead, a captured mouse: off the clear's reach the page runs the old line, and
   * `triggerFeed`'s own answer there is the old feed -- the merged lane's edge -- whatever the clear holds. So every call
   * made on such a frame is the old wiring's call, frame for frame, even inside a refused open's clear; a turret (called
   * only while it is held: `matchActions.ts`:601) sees nothing of the clear.
   */
  it('off the reach (a turret held, a lock, the dead, the mouse captured): every trigger call is the old line\'s, frame for frame, inside a clear too', () => {
    for (const fps of [30, 60, 144]) for (const perPull of [1, 3, Infinity]) for (const [seed, rate] of [[7, 0.05], [451, 0.2], [1340, 0.5]] as const) {
      const script = seeded(seed, 600, rate);
      const was = page('merged', 'Goldeneye', false, perPull, fps), now = page('game', 'Goldeneye', false, perPull, fps);
      run(was, script); run(now, script);
      const tag = `${fps} Hz ${perPull} seed ${seed}`;
      let offInClear = 0;
      for (let i = 0; i < script.length; i++) {
        if (!script[i]!.off) continue;
        expect(now.calls[i], `${tag}, frame ${i}`).toBe(was.calls[i]);
        if (now.games[i]!.fire !== now.inputs[i]!.fire) offInClear++;   // the inventory's own clear running, off the reach
      }
      expect(offInClear, `${tag}: the script runs a clear off the reach`).toBeGreaterThan(0);
    }
  });

  it('the seam: triggerFeed off the reach is the merged lane\'s edge exactly (after.fire against before.fire), a clear pending or not', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    for (let i = 0; i < 3; i++) h.frame({ fire: true });
    h.frame({ fire: true, inventory: true });                       // refused: X's clear pending
    expect(h.menu.clears('fire', { ...noInput(), fire: true })).toBe(true);
    for (const b of [false, true]) for (const a of [false, true]) {
      expect(h.menu.triggerFeed({ ...noInput(), fire: b }, { ...noInput(), fire: a }, false), `${b} -> ${a}`).toBe(a !== b ? a : null);
    }
  });

  it('MOUNTED (a turret: the walk locked, `acts.turrets.mounted()` set): a refused R1 on SURE SHOT with X held -- no clear reaches the trigger, one press and one round as before', () => {
    for (const fps of [30, 60, 144]) for (const perPull of [1, 3, Infinity]) {
      const script = refusedR2(100).map((l) => ({ ...l, off: true }));
      const was = page('merged', 'Goldeneye', false, perPull, fps), now = page('game', 'Goldeneye', false, perPull, fps);
      run(was, script); run(now, script);
      expect(now.games.some((g, i) => g.fire !== now.inputs[i]!.fire), 'the inventory\'s clear ran').toBe(true);
      expect(now.calls).toEqual(was.calls);
      expect(now.calls.filter((c) => c === 'true').length).toBe(1);
      expect(now.shots).toEqual(was.shots);
      expect(now.held).toEqual(was.held);
    }
  });

  /**
   * Research 451 §4, §6: the throwables and the launcher, LEFT OUT (unread). `matchFirearm.ts`:910 hands every trigger edge
   * to the hands first (`matchThrow.ts`:830-858): a throwable up, a let-go then a press is a throw and a new pin; the
   * launcher up, a second rocket. Whether the original's clear reaches either is not read, so a throwable or the launcher
   * in the hands puts the page off the reach (`!grenade.equipped() && !rocket.up()`, main.ts's and matchMount.ts's `reach`)
   * and the old line runs: the hands get the old wiring's calls, frame for frame.
   */
  it.each(['grenade', 'launcher'] as const)('SURE SHOT, a %s in the hands, X held, R1 refused: no throw or rocket more than before, the same trigger calls', (up) => {
    for (const fps of [30, 60, 144]) {
      const script = refusedR2(100).map((l) => ({ ...l, hand: up }));    // X held 2..95, R1 every 15 frames: refused
      const was = page('merged', 'Goldeneye', false, 1, fps), now = page('game', 'Goldeneye', false, 1, fps);
      run(was, script); run(now, script);
      const tag = `${up} ${fps} Hz`;
      expect(now.games.some((g, i) => g.fire !== now.inputs[i]!.fire), `${tag}: the inventory's clear ran`).toBe(true);
      expect(now.calls, tag).toEqual(was.calls);
      expect([now.throws(), now.rockets()], tag).toEqual([was.throws(), was.rockets()]);
      expect([was.throws(), was.rockets()], `${tag}: one pin held to the let-go, or one rocket`).toEqual(up === 'grenade' ? [1, 0] : [0, 1]);
      expect(now.rounds(), `${tag}: the firearm fires nothing`).toBe(0);
    }
  });

  /**
   * The reach toggling inside a clear's game frame (the review's item 2): a turret, a lock, a capture or a throwable taken
   * up or put down on the page frames a clear spans (144 Hz: five). The trigger's level, frame for frame: never held with
   * X up; the clear's let-go and re-press where the reach is on at both; the residue §4 names where the reach turns off
   * after the let-go and stays off past the clear's end -- let go with X held -- recovered by the next X press.
   */
  describe('the reach toggled inside a clear (144 Hz, X held from frame 4, R1 refused at frame 10)', () => {
    const fps = 144, R = 10;
    /** The script: X held 4..`xUp`-1 and again from `xDown`; `offAt` the frames off the reach. */
    const script = (offAt: (i: number) => boolean, xUp = 80, xDown = 100):(Partial<Input> & { off?: boolean })[] =>
      Array.from({ length: 100 }, (_, i) => ({ fire: i >= 4 && (i < xUp || i >= xDown), off: offAt(i), ...(i === R ? { inventory: true } : {}) }));
    /** The frames the clear holds `fire` (on the reach throughout). */
    const clearFrames = (): number[] => { const p = page('game', 'Goldeneye', false, 1, fps); run(p, script(() => false)); return p.cleared.flatMap((c, i) => (c ? [i] : [])); };
    const levels = (s: (Partial<Input> & { off?: boolean })[]): boolean[] => { const p = page('game', 'Goldeneye', false, 1, fps); run(p, s); return p.held; };
    /** `true` on frames `from`..`to`-1, else false. */
    const span = (...runs: [number, number][]): boolean[] => Array.from({ length: 100 }, (_, i) => runs.some(([a, b]) => i >= a && i < b));

    it('the clear spans frames 11-15 here (the frame after the refusal, its game frame of dt)', () => {
      expect(clearFrames()).toEqual([11, 12, 13, 14, 15]);
      expect(levels(script(() => false)), 'on throughout: the let-go at 11, the re-press at 16').toEqual(span([4, 11], [16, 80]));
    });
    it('on -> off -> on (off 12-13): let go at 11, re-pressed at 16 as on throughout', () => {
      expect(levels(script((i) => i === 12 || i === 13))).toEqual(span([4, 11], [16, 80]));
    });
    it('on -> off -> on -> off -> on (off 12, 14): the same', () => {
      expect(levels(script((i) => i === 12 || i === 14))).toEqual(span([4, 11], [16, 80]));
    });
    it('off -> on (off 10-12): held through the off frames, let go at 13, re-pressed at 16', () => {
      expect(levels(script((i) => i >= 10 && i <= 12))).toEqual(span([4, 13], [16, 80]));
    });
    it('off throughout the clear (10-15): the old line -- held, no let-go', () => {
      expect(levels(script((i) => i >= 10 && i <= 15))).toEqual(span([4, 80]));
    });
    it('on -> off past the clear\'s end (off 12-29): the residue -- let go with X held -- till X\'s next press (up 40, down 45)', () => {
      expect(levels(script((i) => i >= 12 && i <= 29, 40, 45))).toEqual(span([4, 11], [45, 100]));
      expect(levels(script((i) => i >= 12 && i <= 50, 40, 45)), 'the next press off the reach too').toEqual(span([4, 11], [45, 100]));
    });
    it('seeded: the reach toggled at random over refused R1s -- never held with X up, and held after every X press outside a clear', () => {
      for (const seed of [11, 451, 1340]) {
        const s = seeded(seed, 800, 0.3);
        const p = page('game', 'Goldeneye', false, 1, fps);
        run(p, s);
        for (let i = 0; i < s.length; i++) {
          if (!s[i]!.fire) expect(p.held[i], `seed ${seed} frame ${i}: X up, the trigger up`).toBe(false);
          const pressed = !!s[i]!.fire && !(i > 0 && s[i - 1]!.fire);
          if (pressed && !p.cleared[i]) expect(p.held[i], `seed ${seed} frame ${i}: X's press holds it`).toBe(true);
        }
      }
    });
  });

  /**
   * The mouse (`./camera`): its trigger goes down only while the pointer is captured (camera.ts:1196-1197) and is let go
   * when the capture ends (camera.ts:1322-1324), and a captured mouse puts the pages off the reach (`!fly.isLocked()`). So
   * on every frame the mouse can hold the trigger the page runs the old line, and the clear never lets go of it.
   */
  it('the mouse held with X (captured), a refused R1, X let go inside the clear: the calls, the level and the rounds frame for frame as before', () => {
    for (const fps of [30, 60, 144]) for (const perPull of [1, 3, Infinity]) {
      const clearFrames = Math.ceil(GAME_FRAME_DT * fps);
      const script: (Partial<Input> & { off?: boolean; mouse?: boolean })[] = [];
      for (let i = 0; i < 60; i++) {
        const xDown = i >= 4 && i < 12 + Math.floor((clearFrames - 1) / 2);   // R1 at 10; the clear from 11: X let go inside it (30 Hz: its one frame, then up)
        script.push({ off: true, fire: xDown, ...(i === 2 ? { mouse: true } : i === 50 ? { mouse: false } : {}), ...(i === 10 ? { inventory: true } : {}) });
      }
      const was = page('merged', 'Goldeneye', false, perPull, fps), now = page('game', 'Goldeneye', false, perPull, fps);
      run(was, script); run(now, script);
      const tag = `${fps} Hz ${perPull}`;
      expect(now.games.some((g, i) => g.fire !== now.inputs[i]!.fire), `${tag}: the clear ran`).toBe(true);
      expect(now.calls, tag).toEqual(was.calls);
      expect(now.held, tag).toEqual(was.held);
      expect(now.shots, tag).toEqual(was.shots);
    }
  });

  it('the mouse, random: on every frame the mouse holds the trigger (captured: off the reach) the calls are the old wiring\'s', () => {
    for (const fps of [30, 60, 144]) for (const seed of [3, 97, 451]) {
      let s = seed;
      const rnd = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
      const script: (Partial<Input> & { off?: boolean; mouse?: boolean })[] = [];
      let fire = false, captured = false, mouse = false, mouseFrames = 0;
      const held: boolean[] = [];
      for (let i = 0; i < 600; i++) {
        let ev: boolean | undefined;
        if (rnd() < 0.04) { captured = !captured; if (!captured && mouse) { mouse = false; ev = false; } }   // camera.ts:1324: the capture's end lets go
        else if (captured && rnd() < 0.08) { mouse = !mouse; ev = mouse; }                                  // camera.ts:1197: down only captured
        if (rnd() < 0.08) fire = !fire;
        script.push({ fire, off: captured, ...(ev === undefined ? {} : { mouse: ev }), ...(rnd() < 0.06 ? { inventory: true } : {}) });
        held.push(mouse);
        if (mouse) mouseFrames++;
      }
      const was = page('merged', 'Goldeneye', false, 1, fps), now = page('game', 'Goldeneye', false, 1, fps);
      run(was, script); run(now, script);
      expect(mouseFrames).toBeGreaterThan(0);
      for (let i = 0; i < script.length; i++) {
        if (!held[i]) continue;
        expect(script[i]!.off, `frame ${i}: a held mouse is captured`).toBe(true);
        expect(now.calls[i], `${fps} Hz seed ${seed}, frame ${i}`).toBe(was.calls[i]);
      }
    }
  });

  it('a spectator or the dead (the walk locked, `alive` false): off the reach, and the refused R2 clears nothing at all (D:L71617-71620)', () => {
    for (const config of ['Default', 'Goldeneye'] as const) {
      const script = refusedR2(100);
      const run2 = (wiring: 'merged' | 'game') => {
        controllerConfigs.select(config);
        const h = harness(seal(), { alive: false, canChange: false });
        let before: Input = noInput();
        const calls: (boolean | null)[] = [], games: Input[] = [];
        for (const pad of script) {
          const input = { ...noInput(), ...pad };
          calls.push(wiring === 'game' ? h.menu.triggerFeed(before, input, false) : input.fire !== before.fire ? input.fire : null);
          expect(h.menu.clears('fire', input)).toBe(false);
          games.push(h.frame(pad));
          before = input;
        }
        return { calls, games };
      };
      const was = run2('merged'), now = run2('game');
      expect(now.calls).toEqual(was.calls);
      expect(now.games.map((g) => g.fire)).toEqual(script.map((l) => !!l.fire));
    }
  });

  it('a close inside the clear (the loading hold\'s flush, a screen\'s opening, a spawn) ends it: the next edge is the merged lane\'s, as before', () => {
    controllerConfigs.select('Goldeneye');
    const h = harness(seal(), { canChange: false });
    const x = { ...noInput(), fire: true };
    for (let i = 0; i < 3; i++) { h.menu.triggerFeed(x, x, true); h.frame({ fire: true }, 1 / 144); }
    expect(h.menu.triggerFeed(x, { ...x, inventory: true }, true)).toBe(null);
    h.frame({ fire: true, inventory: true }, 1 / 144);                 // refused: the clear pending
    expect(h.menu.triggerFeed({ ...x, inventory: true }, x, true), 'the clear\'s let-go').toBe(false);
    h.menu.close();
    expect(h.menu.triggerFeed(x, x, true), 'after the close: X held is no edge').toBe(null);
  });

  it('the replay viewer: its steer lane writes no trigger and no R1 (worldSteer.ts steerInput), so a refused R1 is the live pad\'s alone', () => {
    const full = { moveX: 1, moveY: -1, lift: 1, boost: true, lookX: 1, lookY: -1 };
    for (const fire of [false, true]) for (const inventory of [false, true]) {
      const out = steerInput({ ...noInput(), fire, inventory }, full);
      expect([out.fire, out.inventory]).toEqual([fire, inventory]);
    }
    const main = src('main.ts');
    expect(main).toMatch(/let playOn = REPLAY_WORLD \? false : /);   // framed as the replay's world: a watcher, no play
  });

  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
  /** The reach both pages compute: the walk unlocked and alive, no turret held, the mouse not captured (then the hands, per page). */
  const REACH_GUARD = '!walk.isLocked() && !walk.isDead() && acts.turrets.mounted() === null && !fly.isLocked()';
  it('main.ts: the trigger fed by triggerFeed on the reach (walking, no menu, unlocked, alive, no turret, the mouse free, no throwable or launcher up), the old line off it, ahead of inventory.frame', () => {
    const main = src('main.ts');
    const body = main.slice(main.indexOf('function padFrame('));
    const at = (needle: string): number => { const i = body.indexOf(needle); expect(i, needle).toBeGreaterThan(0); return i; };
    const reach = at(`const reach = walking && !menu && ${REACH_GUARD}\n    && !grenade.equipped() && !rocket.up();`);
    expect(main).toContain('const { grenade, rocket, throwPose, whiteOut, inventory } = throws;');   // the hands' own (`throws.hands`)
    expect(at("const walking = playOn && walk.mode() === 'walk';")).toBeLessThan(reach);
    const fed = at('const fed = inventory.triggerFeed(padMerged, input, reach);');
    const onReach = at('if (reach) { if (fed !== null) trigger(fed); }');
    const old = at('else if (playOn && !menu && input.fire !== padMerged.fire) trigger(input.fire);');
    const menu = at('else if (menu && padMerged.fire) trigger(false);');
    const frame = at('const game = menu || !walking ? input : inventory.frame(padMerged, input, dt, frameTime.real());');
    expect([reach < fed, fed < onReach, onReach < old, old < menu, menu < frame]).toEqual([true, true, true, true, true]);
    expect(body.slice(onReach, old).split('\n').length, 'the reach\'s branch and the old line one if-else chain').toBe(2);
  });

  it('matchMount.ts: the same reach and feed; off it the old triggerLane line, ahead of the inventory\'s frame', () => {
    const mount = src('matchMount.ts');
    const body = mount.slice(mount.indexOf('const padFrame = '));
    const at = (needle: string): number => { const i = body.indexOf(needle); expect(i, needle).toBeGreaterThan(0); return i; };
    const reach = at(`const reach = !menu && walking && ${REACH_GUARD}\n      && !throws.grenade.equipped() && !throws.rocket.up();`);
    const fed = at('const fed = throws.inventory.triggerFeed(padMerged, input, reach);');
    const old = at('if (!reach) firearm.triggerLane(padMerged, input);');
    const onReach = at('else if (fed !== null) firearm.trigger(fed);');
    const frame = at('const game = menu || !walking ? input : throws.inventory.frame(padMerged, input, dt, frameTime.real());');
    expect([at("const walking = walk.mode() === 'walk';") < reach, reach < fed, fed < old, old < onReach, onReach < frame]).toEqual([true, true, true, true, true]);
  });
});
