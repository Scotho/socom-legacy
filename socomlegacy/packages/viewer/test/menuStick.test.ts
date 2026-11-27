// @vitest-environment node
import { OptionGlobals, ValveStore } from '@s2u/ui';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noInput, PAD_FLAGS, type Input, type PadButton } from '../src/gamepad';
import { InventoryMenu, type InventoryHost, type InventoryKit } from '../src/inventoryMenu';
import { mountTaunts, type MatchTauntsDeps } from '../src/matchTaunts';
import type { SoundData } from '../src/soundData';
import { createStartMenuPage, sessionStartMenuOptions, StartMenu, START_MENU_LOCKOUT_SECONDS, START_MENU_REPEAT_SECONDS, START_MENU_TYPE } from '../src/startMenu';
import type { TauntData } from '../src/tauntData';

/**
 * WM-STICK (OT.R130, the weekend plan's WM.R5 / WM-10): the left stick moves the selection wherever the d-pad does --
 * the round's START menu and the Circle pop-up -- one step a flick, no held repeat (research 340
 * R340.5, the feel EXCHANGE-STICK borrows); on the Circle pop-up, the guard: moving at the open,
 * the stick stays the soldier's and the menu takes the d-pad alone until he has stood still 100 ms (the owner's value,
 * OT.R130); standing at the open, the stick is the menu's at once. A browser adaptation; the guard on the Circle pop-up
 * is an owner-ruled departure from the original (the capture r0004: the original does not walk with it open).
 * The quick select takes no stick (X6, the owner 2026-11-18: the original's d-pad-only selection, `FUN_0021bda0`).
 * The stick is the frame's move pair (`Input.moveX` / `moveY`, up positive), as the pages hand it to the menus.
 */

/** The move pair pushed: `y` up positive (`Input.moveY`), `x` right positive. */
const stick = (x: number, y: number): Input => ({ ...noInput(), moveX: x, moveY: y });
const UP = stick(0, 1), DOWN = stick(0, -1), LEFT = stick(-1, 0), REST = noInput();

describe('the round\'s START menu takes the stick (OT.R130 (1); no guard)', () => {
  function rig() {
    const globals = new OptionGlobals(), valves = new ValveStore();
    const menu = new StartMenu({
      options: sessionStartMenuOptions(() => globals, () => valves), page: createStartMenuPage(),
      seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }), caption: () => null, title: () => 'FROSTFIRE',
      sound: () => {}, allowed: () => true,
    });
    const pad = (held: PadButton[], input: Input, dt = 0.05) => menu.pad(new Set(held), input, dt);
    for (let t = 0; t <= START_MENU_LOCKOUT_SECONDS + 0.1; t += 0.05) pad([], REST);
    pad(['Start'], REST); pad([], REST);
    pad([], REST, START_MENU_REPEAT_SECONDS + 0.01);             // the cursor's gate open
    return { menu, pad };
  }

  it('a flick down moves the cursor as the d-pad\'s Down does; held, no repeat; let go and flicked again, the next row', () => {
    const d = rig();
    const dpad = rig();
    dpad.pad(['Down'], REST, 0.01);
    const once = dpad.menu.state().cursor;
    expect(once).not.toBe(0);
    d.pad([], DOWN, 0.01);
    expect(d.menu.state().cursor).toBe(once);
    for (let i = 0; i < 40; i++) d.pad([], DOWN, 0.05);            // 2 s held: the gate open many times over
    expect(d.menu.state().cursor).toBe(once);
    d.pad([], REST); d.pad([], DOWN);
    dpad.pad([], REST, START_MENU_REPEAT_SECONDS + 0.01); dpad.pad(['Down'], REST, 0.01);
    expect(d.menu.state().cursor).toBe(dpad.menu.state().cursor);
    d.pad([], REST, START_MENU_REPEAT_SECONDS + 0.01); d.pad([], UP);   // past the cursor's gate, as a d-pad press must be
    expect(d.menu.state().cursor).toBe(once);
    expect(d.pad([], UP).input.moveY).toBe(0);                   // open, the game takes none of it (as today)
  });

  it('under ABORT\'s confirm a flick left is the d-pad\'s Left: YES', () => {
    const d = rig();
    for (let i = 0; i < 12 && d.menu.state().cursor !== START_MENU_TYPE.abort; i++) { d.pad([], REST, START_MENU_REPEAT_SECONDS + 0.01); d.pad(['Down'], REST, 0.01); d.pad([], REST, 0.01); }
    d.pad(['Cross'], REST); d.pad([], REST, START_MENU_REPEAT_SECONDS + 0.01);
    expect(d.menu.state().confirm).toEqual({ choice: 2, yes: false });
    d.pad([], LEFT);
    expect(d.menu.state().confirm).toEqual({ choice: 2, yes: true });
  });
});

const DATA = { defaults: ['A', 'B', 'C', 'D', 'E'], captions: {}, vocals: { seal: [[]], terrorist: [[]] } } as unknown as TauntData;

/** The Circle pop-up's part on a living seat, its clock set absolutely (`at`). */
function circle() {
  let now = 0;
  const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false };
  const net = { client: { id: 2, send: () => {} }, gate: () => gate, isBot: () => false };
  const deps: MatchTauntsDeps = {
    net: () => net as never, hud: { postMessage: () => {} },
    audio: { play: () => true as never, playStream: () => 'played' },
    custom: () => [null, null, null, null, null], otherMenu: () => false, release: () => {}, clock: () => now,
  };
  const t = mountTaunts(deps);
  t.setData({ taunts: DATA } as unknown as SoundData);
  const at = (time: number, held: PadButton[], input: Input = REST) => { now = time; return t.pad(new Set(held), input); };
  return { t, at };
}

describe('the Circle pop-up: the stick and its guard (OT.R130)', () => {
  it('standing still at the open: the stick moves the selection at once, one step a flick; the soldier does not move', () => {
    const c = circle();
    c.at(0, ['Circle']); c.at(0.05, []);
    expect(c.t.state()).toMatchObject({ open: true, root: 0 });
    const r = c.at(0.5, [], DOWN);
    expect(c.t.state().root).toBe(1);
    expect(r.owns).toBe(true);
    expect(r.walk).toBe(false);
    expect([r.input.moveX, r.input.moveY]).toEqual([0, 0]);
    c.at(1.0, [], DOWN);                                          // held: no repeat
    expect(c.t.state().root).toBe(1);
    c.at(1.05, []); c.at(1.3, [], DOWN);
    expect(c.t.state().root).toBe(2);
  });

  it('moving at the open: the stick keeps the soldier walking, the d-pad moves the selection; the stick is the menu\'s after 100 ms still, not at 99', () => {
    const c = circle();
    c.at(0, ['Circle'], UP);
    let r = c.at(0.05, [], UP);
    expect(c.t.state()).toMatchObject({ open: true, root: 0 });
    expect(r.owns).toBe(true);
    expect(r.walk).toBe(true);
    expect(r.input.moveY).toBe(1);                               // still walking
    c.at(0.3, []);                                                // 50 ms still, then a fresh flick down
    r = c.at(0.35, [], DOWN);
    expect(c.t.state().root).toBe(0);
    expect([r.walk, r.input.moveY]).toEqual([true, -1]);
    c.at(0.7, ['Down'], DOWN);                                    // the d-pad is the menu's
    expect(c.t.state().root).toBe(1);
    c.at(0.75, [], DOWN);
    c.at(1.0, []); c.at(1.05, []);
    r = c.at(1.099, [], DOWN);                                    // 99 ms still: the stick still the soldier's
    expect(c.t.state().root).toBe(1);
    expect([r.walk, r.input.moveY]).toEqual([true, -1]);
    c.at(2.0, []);
    r = c.at(2.1, []);                                            // 100 ms still: the stick the menu's
    expect(r.walk).toBe(false);
    r = c.at(2.15, [], DOWN);
    expect(c.t.state().root).toBe(2);
    expect([r.walk, r.input.moveY]).toEqual([false, 0]);
    expect(c.t.walking()).toBe(false);
  });

  it('closed, the stick is the game\'s as before', () => {
    const c = circle();
    const r = c.at(0.5, [], DOWN);
    expect([r.owns, r.walk, r.input.moveY]).toEqual([false, false, -1]);
  });

  // The controller's ruling under OT.R130 (2026-11-15), the owner's to overturn: walking under the guard, the right
  // stick looks as with no pop-up open; standing still at the open, the right stick stays as the pop-up has it (none).
  // A departure: the original blocks both sticks while the pop-up is open (rig read, r0004, 3 of 3, 2026-11-15); the
  // standing-still case below is the original's behaviour as well as today's.
  it('walking under the guard: the right stick\'s look reaches the game as with the pop-up closed', () => {
    const LOOK: Input = { ...UP, lookX: 0.7, lookY: -0.4, lookZone: 0.2 };
    // Every pad flag pressed with the look (review F1): none may pass the menu while it owns the pad.
    const PRESSED: Input = { ...LOOK, ...Object.fromEntries(PAD_FLAGS.map(f => [f, true])) } as Input;
    const closed = circle().at(0.5, [], LOOK);
    expect([closed.owns, closed.input.lookX, closed.input.lookY, closed.input.lookZone]).toEqual([false, 0.7, -0.4, 0.2]);
    const c = circle();
    c.at(0, ['Circle'], UP);
    const r = c.at(0.05, [], PRESSED);
    expect([r.owns, r.walk]).toEqual([true, true]);
    expect([r.input.lookX, r.input.lookY, r.input.lookZone]).toEqual([closed.input.lookX, closed.input.lookY, closed.input.lookZone]);
    expect(PAD_FLAGS.filter(f => r.input[f])).toEqual([]);   // no button past the menu, every flag pressed
  });

  it('standing still at the open: the right stick reaches nothing (today\'s)', () => {
    const c = circle();
    c.at(0, ['Circle']); c.at(0.05, []);
    const r = c.at(0.5, [], { ...REST, lookX: 0.7, lookY: -0.4 });
    expect([r.owns, r.walk, r.input.lookX, r.input.lookY]).toEqual([true, false, 0, 0]);
  });
});

/** mp_seal1's kit: five slots, slot 4 never taken up. */
const KIT: InventoryKit = { count: 5, current: 0, takeable: (s) => s !== 4 };

/** The quick select, its clock set absolutely (`at`): one frame of the merged lanes. */
function quick() {
  let now = 0;
  const host: InventoryHost = {
    kit: () => KIT, alive: () => true, canChange: () => true, take: () => true, icon: () => null, info: () => null, clock: () => now,
  };
  const menu = new InventoryMenu(host);
  let last: Input = noInput(), prev = 0;
  const at = (time: number, lanes: Partial<Input> = {}): Input => {
    const dt = Math.max(time - prev, 0);
    now = time; prev = time;
    const after = { ...noInput(), ...lanes };
    const game = menu.frame(last, after, dt);
    last = after;
    return game;
  };
  /** Frames of 1/60 s with `lanes` held until the class reads again (its state 3); the time after. */
  const settle = (from: number, lanes: Partial<Input> = {}): number => {
    let t = from;
    for (let i = 0; i < 40 && menu.visual().state !== 3; i++) { t += 1 / 60; at(t, lanes); }
    return t;
  };
  return { menu, at, settle };
}

describe('the quick select takes no stick (X6; the owner 2026-11-18, narrowing OT.R130): the d-pad selects, as the original', () => {
  // The original's quick select (`FUN_0021bda0` D:L72552-72729) reads button presses only -- the d-pad's Up / Down, L1,
  // L2, Triangle, Cross and R2 -- with no analog read; the owner, 2026-11-18 (seat redotcom-9a): "let's maybe not allow
  // analog stick selections on that ui". The stick is the soldier's while it is open, standing or moving.
  it('standing still at the open: a stick push moves the soldier and steps no slot; the d-pad (the zoom lanes) steps', () => {
    const q = quick();
    q.at(0, { inventory: true }); q.at(0.02);
    const t = q.settle(0.02);
    expect(q.menu.state().slot).toBe(0);
    q.at(t + 0.2);                                                // well past 100 ms still: no guard hands it over
    let g = q.at(t + 0.21, { moveY: 1 });
    expect(q.menu.state().slot).toBe(0);
    expect(g.moveY).toBe(1);
    g = q.at(t + 0.22, { moveY: -1 });
    expect(q.menu.state().slot).toBe(0);
    expect(g.moveY).toBe(-1);
    g = q.at(t + 0.23, { zoomOut: true });                        // the d-pad's Down (the zoom-out lane): the previous slot
    expect(q.menu.state().slot).toBe(3);
    expect(g.zoomOut).toBe(false);                                // the zoom takes none of it (as before)
    expect('holdsStick' in q.menu).toBe(false);                   // nothing left to hand the camera
  });

  it('moving at the open, a moment still, then pushing again: walking, never stepping (the reported stuck walk)', () => {
    const q = quick();
    q.at(0, { inventory: true, moveY: 1 });
    const t = q.settle(0, { moveY: 1 });
    q.at(t + 0.01); q.at(t + 0.3);                                // the thumb off the stick to the d-pad, 290 ms
    const g = q.at(t + 0.31, { moveY: 1, moveX: 0.5 });
    expect(q.menu.state().slot).toBe(0);
    expect([g.moveY, g.moveX]).toEqual([1, 0.5]);
  });

  it('closed, the stick neither opens it nor zooms: the soldier\'s, as before', () => {
    const q = quick();
    const g = q.at(0.5, { moveY: 1 });
    expect(q.menu.isOpen()).toBe(false);
    expect([g.moveY, g.zoom, g.zoomOut]).toEqual([1, false, false]);
  });

  it('the source: the quick select reads no menuStick reader or guard', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/inventoryMenu.ts'), 'utf8');
    for (const n of ['MenuStickReader', 'MenuStickGuard', 'withoutStick', 'MENU_STICK_ADAPTATION']) expect(src, n).not.toContain(n);
  });
});

describe('the guard forgets a menu closed outside its own frame (the review\'s F1)', () => {
  it('the Circle pop-up opened still, closed by reset (the START menu\'s open) or setData, reopened running: the stick the soldier\'s', () => {
    for (const close of ['reset', 'setData'] as const) {
      const c = circle();
      c.at(0, ['Circle']); c.at(0.05, []);                      // opened standing: the stick the menu's
      expect(c.t.isOpen()).toBe(true);
      if (close === 'reset') c.t.reset(); else c.t.setData({ taunts: DATA } as unknown as SoundData);
      expect(c.t.isOpen()).toBe(false);
      c.at(1.0, ['Circle'], UP);
      const r = c.at(1.05, [], UP);                             // reopened running
      expect(c.t.isOpen(), close).toBe(true);
      expect([r.walk, r.input.moveY], close).toEqual([true, 1]);
      expect(c.t.state().root, close).toBe(0);
    }
  });

  it('the Circle pop-up opened moving, reset, reopened standing: the stick the menu\'s at once', () => {
    const c = circle();
    c.at(0, ['Circle'], UP);
    expect(c.at(0.05, [], UP).walk).toBe(true);
    c.t.reset();
    c.at(1.0, ['Circle']); c.at(1.05, []);
    const r = c.at(1.1, [], DOWN);
    expect(c.t.state().root).toBe(1);
    expect([r.walk, r.input.moveY]).toEqual([false, 0]);
  });
});

describe('the guard\'s stand: 100 ms still from the first still frame, no moving frame between (OT.R130; the review\'s F2)', () => {
  it('the Circle pop-up: still from t0, at t0 + 99 ms the stick is not the menu\'s, at t0 + 100 ms it is', () => {
    const c = circle();
    c.at(0, ['Circle'], UP);
    expect(c.at(0.05, [], UP).walk).toBe(true);
    expect(c.at(2.0, []).walk).toBe(true);                    // t0: the first still frame
    expect(c.at(2.099, []).walk).toBe(true);                  // 99 ms still: the soldier's
    expect(c.t.walking()).toBe(true);
    expect(c.at(2.1, []).walk).toBe(false);                   // 100 ms still: the menu's
    expect(c.t.walking()).toBe(false);
    c.at(2.15, [], DOWN);
    expect(c.t.state().root).toBe(1);
  });
});
