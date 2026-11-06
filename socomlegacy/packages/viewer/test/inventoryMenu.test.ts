import { describe, expect, it } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import {
  DEFAULT_BINDS, INVENTORY_ARROW, INVENTORY_ARROW_ALPHA_READING, INVENTORY_COLUMN, INVENTORY_FADE, INVENTORY_ICON_ALPHA,
  INVENTORY_ICON_INSET, INVENTORY_IDLE_CLOSE, INVENTORY_LANES, INVENTORY_MENU_KEYS_READING, INVENTORY_ROWS, INVENTORY_SLIDE_RATE,
  INVENTORY_TAG, INVENTORY_TEXT_RGBA, INVENTORY_WORDS, InventoryMenu, magsText, stepSlot,
  type InventoryHost, type InventoryKit, type SlotInfo,
} from '../src/inventoryMenu';
import { ARROW_TEXTURE, drawWeaponSelect, PANEL_TEXTURE, type WsSprite, type WsText } from '../src/weaponSelect';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import { HUD_COLOURS, HUD_LAYOUT } from '../src/hud';
import { StanceButton } from '../src/stanceButton';
import type { Stance } from '../src/mover';
import { DEFAULT_RIFLE, type WeaponRecord } from '@s2u/scene';
import { Fire } from '../src/fire';

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
    h.frame({ inventory: true });
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
