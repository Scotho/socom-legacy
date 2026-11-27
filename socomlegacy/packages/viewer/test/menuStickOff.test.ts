// @vitest-environment node
import { OptionGlobals, ValveStore } from '@s2u/ui';
import { describe, expect, it, vi } from 'vitest';
import { noInput, type Input, type PadButton } from '../src/gamepad';
import { InventoryMenu, type InventoryHost } from '../src/inventoryMenu';
import { mountTaunts, type MatchTauntsDeps } from '../src/matchTaunts';
import type { SoundData } from '../src/soundData';
import { createStartMenuPage, sessionStartMenuOptions, StartMenu, START_MENU_LOCKOUT_SECONDS, START_MENU_REPEAT_SECONDS } from '../src/startMenu';
import type { TauntData } from '../src/tauntData';

/**
 * WM-STICK (OT.R130): with `MENU_STICK_ADAPTATION` off, today's behaviour exactly -- the START menu, the Circle pop-up
 * and the quick select read the d-pad only, and the soldier stops while the Circle pop-up is open.
 */
vi.mock('../src/menuStick', async (importOriginal) => ({ ...await importOriginal<typeof import('../src/menuStick')>(), MENU_STICK_ADAPTATION: false }));

const stick = (x: number, y: number): Input => ({ ...noInput(), moveX: x, moveY: y });
const UP = stick(0, 1), DOWN = stick(0, -1), REST = noInput();

describe('MENU_STICK_ADAPTATION off: today\'s menus', () => {
  it('the START menu: the stick moves nothing', () => {
    const globals = new OptionGlobals(), valves = new ValveStore();
    const menu = new StartMenu({
      options: sessionStartMenuOptions(() => globals, () => valves), page: createStartMenuPage(),
      seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }), caption: () => null, title: () => 'FROSTFIRE',
      sound: () => {}, allowed: () => true,
    });
    const pad = (held: PadButton[], input: Input, dt = 0.05) => menu.pad(new Set(held), input, dt);
    for (let t = 0; t <= START_MENU_LOCKOUT_SECONDS + 0.1; t += 0.05) pad([], REST);
    pad(['Start'], REST); pad([], REST, START_MENU_REPEAT_SECONDS + 0.01);
    for (const s of [DOWN, REST, UP, REST, DOWN]) pad([], s);
    expect(menu.state()).toMatchObject({ open: true, cursor: 0 });
  });

  it('the Circle pop-up: the stick moves nothing, and the soldier stops while it is open, moving or not', () => {
    let now = 0;
    const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false };
    const net = { client: { id: 2, send: () => {} }, gate: () => gate, isBot: () => false };
    const deps: MatchTauntsDeps = {
      net: () => net as never, hud: { postMessage: () => {} }, audio: { play: () => true as never, playStream: () => 'played' },
      custom: () => [null, null, null, null, null], otherMenu: () => false, release: () => {}, clock: () => now,
    };
    const t = mountTaunts(deps);
    t.setData({ taunts: { defaults: ['A', 'B', 'C', 'D', 'E'], captions: {}, vocals: { seal: [[]], terrorist: [[]] } } as unknown as TauntData } as unknown as SoundData);
    const at = (time: number, held: PadButton[], input: Input = REST) => { now = time; return t.pad(new Set(held), input); };
    at(0, ['Circle'], UP);
    let r = at(0.05, [], UP);
    expect(r.owns).toBe(true);
    expect([r.walk, r.input.moveY]).toEqual([false, 0]);
    r = at(0.1, [], { ...UP, lookX: 0.7, lookY: -0.4 });            // and no look: the right stick the menu's, as today
    expect([r.walk, r.input.moveY, r.input.lookX, r.input.lookY]).toEqual([false, 0, 0, 0]);
    at(0.5, []); at(1.0, []);
    r = at(1.5, [], DOWN);
    expect(t.state().root).toBe(0);
    expect([r.walk, r.input.moveY]).toEqual([false, 0]);
  });

  it('the quick select: the stick steps nothing and the soldier keeps it, open or not', () => {
    let now = 0;
    const host: InventoryHost = {
      kit: () => ({ count: 5, current: 0, takeable: (s) => s !== 4 }), alive: () => true, canChange: () => true, take: () => true,
      icon: () => null, info: () => null, clock: () => now,
    };
    const menu = new InventoryMenu(host);
    let last: Input = noInput();
    const at = (time: number, lanes: Partial<Input> = {}): Input => { now = time; const a = { ...noInput(), ...lanes }; const g = menu.frame(last, a, 1 / 60); last = a; return g; };
    at(0, { inventory: true });
    let t = 0;
    for (let i = 0; i < 40 && menu.visual().state !== 3; i++) { t += 1 / 60; at(t); }
    at(t + 0.5);
    const g = at(t + 0.6, { moveY: 1 });
    expect(menu.state().slot).toBe(0);
    expect(g.moveY).toBe(1);
  });
});
