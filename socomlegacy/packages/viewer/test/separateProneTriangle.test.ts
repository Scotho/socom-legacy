// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OptionGlobals, ValveStore } from '@s2u/ui';
import { mergeInput, noInput, PAD_BUTTON, padInput, stanceLane, type Input, type PadButton } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import type { Stance } from '../src/mover';
import { GamePad } from '../src/setupPad';
import { StanceButton, type StanceMode } from '../src/stanceButton';
import { createStartMenuPage, sessionStartMenuOptions, StartMenu, START_MENU_LOCKOUT_SECONDS } from '../src/startMenu';
import { SETUP_KEY, defaultController, setControllerStanceMode, type ControllerConfig } from '../src/startupSettings';
import { padButtonsDown } from '../src/weaponExchange';
import { menuInputOfPad } from '../src/weaponSelect';
import { InventoryMenu, type InventoryHost } from '../src/inventoryMenu';
import { applyPadExtras, PadExtrasState, type PadExtras } from '../src/padExtras';

/**
 * OT.R107 (the owner, 2026-11-06: "everywhere that people have assigned prone when in separate mode should also serve the
 * action of triangle"): in SEPARATE with the profile's Prone bound, the match's pad reader (`./controllerInput`
 * `ControllerInput.poll`, `releaseCrouch`) took the logical Triangle from the whole pad (STM.R1), so every in-match reader
 * of Triangle lost it -- the START menu's close on its release (`FUN_002041e0` D:L61669-61671) among them: "only start
 * works to close it now" (the owner, 2026-11-06). The Prone bind's button now drives the logical Triangle for every
 * reader but the stance lane (`stanceLane`, the pad's `stanceOff`), and COMBINED is as it was. A browser adaptation of
 * the SEPARATE mode (itself one: STM.R1, OT.R67).
 */

type Pad = { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pad = (): Pad => ({ index: 0, id: 'Pad 0', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const set = (p: Pad, down: Record<number, number>): void => { p.buttons.forEach((b, i) => { b.value = down[i] ?? 0; b.pressed = b.value > 0; }); };
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const TRIANGLE = PAD_BUTTON.Triangle, CIRCLE = PAD_BUTTON.Circle, START = PAD_BUTTON.Start;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/** The walk's lanes as `stanceModes.test.ts` stubs them: the stance calls recorded. */
function lanes(mode: StanceMode) {
  const calls: string[] = [];
  let intent: Stance = 'stand';
  const l: LaneParts = {
    walk: {
      mode: () => 'walk', isDead: () => false, stance: () => intent, stanceIntent: () => intent, stanceMode: () => mode,
      jump: () => true, crouch: () => { calls.push('crouch'); return true; },
      setStance: (s) => { calls.push(`stance:${s}`); intent = s; return true; },
    },
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes: () => {}, fire: { reload: () => true } },
    stanceButton: new StanceButton(),
    shoulder: () => {},
  };
  let before: Input = noInput();
  const frame = (after: Input, menu = false): void => { playerLanes(l, before, after, 1 / 60, { walking: true, menu }); before = after; };
  return { calls, frame };
}

/**
 * The match's pad frame as `./matchMount` `padFrame` runs it, over one pad: the match's reader (`GamePad`, the binds take
 * their buttons), `down` off the polled pad, the START menu first, then the game's lanes off what it leaves.
 */
function match(p: Pad, mode: StanceMode) {
  setControllerStanceMode(mode);
  const src = { getGamepads: () => [p] };
  const gp = new GamePad({ waitForRest: false });
  gp.poll(src);
  const globals = new OptionGlobals(), valves = new ValveStore();
  const menu = new StartMenu({
    options: sessionStartMenuOptions(() => globals, () => valves), page: createStartMenuPage(),
    seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }), caption: () => null, title: () => 'FROSTFIRE',
    sound: () => {}, allowed: () => true,
  });
  const l = lanes(mode);
  let last: { down: Set<PadButton>; pad: Input; game: Input } = { down: new Set(), pad: noInput(), game: noInput() };
  const frame = (down: Record<number, number> = {}, dt = 1 / 60): typeof last => {
    set(p, down);
    const polled = gp.poll(src);
    const input = padInput(polled);
    if (gp.crouch) input.crouch = true;
    if (gp.prone) input.prone = true;
    const held = padButtonsDown(polled);
    const start = menu.pad(held, mergeInput(input), dt);
    l.frame(start.input, start.owns);
    last = { down: held, pad: input, game: start.input };
    return last;
  };
  for (let t = 0; t <= START_MENU_LOCKOUT_SECONDS + 0.1; t += 0.05) frame({}, 0.05);
  return { menu, frame, calls: l.calls };
}

describe('OT.R107: in SEPARATE the Prone bind\'s button serves Triangle\'s action, never the stance', () => {
  for (const [name, prone] of [['cloned on Triangle\'s button (3)', TRIANGLE], ['bound to Circle (1)', CIRCLE]] as const) {
    it(`Prone ${name}: its release closes the START menu (FUN_002041e0 D:L61669-61671), and the press is no game Prone`, () => {
      const p = pad();
      saveProfile(p, { prone });
      const m = match(p, 'separate');
      m.frame({ [START]: 1 }); m.frame();
      expect(m.menu.isOpen()).toBe(true);
      const f = m.frame({ [prone]: 1 });
      expect(f.down.has('Triangle'), 'the Prone button is the logical Triangle for the menus').toBe(true);
      expect(f.game.prone, 'the menu holds the pad: no Prone reaches the game').toBe(false);
      m.frame();
      expect(m.menu.isOpen(), 'the Prone button let go closes the menu').toBe(false);
      expect(m.calls, 'no stance under the menu').toEqual([]);
    });

    it(`Prone ${name}: WEAPON EXCHANGE reads its press as Triangle's back; the stance lane takes none of it`, () => {
      const p = pad();
      saveProfile(p, { prone });
      const m = match(p, 'separate');
      const f = m.frame({ [prone]: 1 });
      expect(f.down.has('Triangle')).toBe(true);
      expect(menuInputOfPad('Triangle')).toBe('back');
      expect(f.pad.stance, 'Triangle\'s lane is held (the R2 inventory\'s close, the spectator\'s jump read it)').toBe(true);
      expect(stanceLane(f.pad), 'the stance lane takes no Triangle from it').toBe(false);
      for (let i = 0; i < 3; i++) m.frame({ [prone]: 1 });
      m.frame();
      expect(m.calls, 'the press is Prone, never a Triangle crouch tap').toEqual(['stance:prone']);
    });
  }

  it('Prone on Circle: the physical Triangle still serves Triangle\'s action (the Prone button "also" serves it), still no stance', () => {
    const p = pad();
    saveProfile(p, { prone: CIRCLE });
    const m = match(p, 'separate');
    m.frame({ [START]: 1 }); m.frame();
    m.frame({ [TRIANGLE]: 1 }); m.frame();
    expect(m.menu.isOpen()).toBe(false);
    for (let i = 0; i < 3; i++) m.frame({ [TRIANGLE]: 1 });
    m.frame();
    expect(m.calls).toEqual([]);
  });

  it('a pressure pad\'s light press on the Prone button counts as Triangle\'s press (any press, light or full)', () => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE, crouch: TRIANGLE, nativePressure: true });
    const m = match(p, 'separate');
    m.frame({ [START]: 1 }); m.frame();
    const f = m.frame({ [TRIANGLE]: 0.2 });
    expect(f.down.has('Triangle')).toBe(true);
    m.frame();
    expect(m.menu.isOpen()).toBe(false);
  });

  it('COMBINED is as it was: Prone on Circle is unread, Circle is no Triangle; Triangle is Triangle', () => {
    const p = pad();
    saveProfile(p, { prone: CIRCLE });
    const m = match(p, 'pop');
    const c = m.frame({ [CIRCLE]: 1 });
    expect(c.down.has('Triangle')).toBe(false);
    m.frame();
    const t = m.frame({ [TRIANGLE]: 1 });
    expect(t.down.has('Triangle')).toBe(true);
    expect(stanceLane(t.pad)).toBe(true);
  });

  // The fold's review F1 (the controller b6's call): in the front end a Prone button with its own logical action keeps
  // that action alone (the console dispatches every logical button down: R2 and Triangle on one press would do both);
  // only a button no logical action is bound to holds the logical Triangle there. Cloned on Triangle's own button,
  // nothing changes from before OT.R107.
  for (const [name, prone, own] of [['R2', PAD_BUTTON.R2, 'R2'], ['Square', PAD_BUTTON.Square, 'Square']] as const) {
    it(`the front end's reader (releaseCrouch false), Prone on ${name}: one press is ${name} only, never Triangle`, () => {
      const p = pad();
      saveProfile(p, { prone });
      const src = { getGamepads: () => [p] };
      const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
      setControllerStanceMode('separate');
      menus.poll(src);
      set(p, { [prone]: 1 });
      const down = padButtonsDown(menus.poll(src));
      expect(down.has(own)).toBe(true);
      expect(down.has('Triangle'), 'a button with its own job keeps it alone').toBe(false);
      set(p, { [TRIANGLE]: 1 });
      expect(padButtonsDown(menus.poll(src)).has('Triangle'), 'the physical Triangle still').toBe(true);
    });
  }

  it('the front end\'s reader, Prone on a button no action holds (16): the press is Triangle; COMBINED: nothing', () => {
    const p = pad();
    saveProfile(p, { prone: 16 });
    const src = { getGamepads: () => [p] };
    const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
    setControllerStanceMode('separate');
    menus.poll(src);
    set(p, { 16: 1 });
    expect([...padButtonsDown(menus.poll(src))]).toEqual(['Triangle']);
    setControllerStanceMode('pop');
    expect(padButtonsDown(menus.poll(src)).has('Triangle'), 'COMBINED: the bind unread').toBe(false);
  });

  it('the front end\'s reader, Prone cloned on Triangle\'s own button: Triangle, as before OT.R107', () => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE });
    const src = { getGamepads: () => [p] };
    const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
    setControllerStanceMode('separate');
    menus.poll(src);
    set(p, { [TRIANGLE]: 1 });
    expect([...padButtonsDown(menus.poll(src))]).toEqual(['Triangle']);
  });

  it('a touch Triangle merged with a pad\'s Prone-held Triangle keeps its stance (the flag is the pad\'s alone)', () => {
    const padSide: Input = { ...noInput(), stance: true, stanceOff: true };
    expect(stanceLane(mergeInput(padSide))).toBe(false);
    expect(stanceLane(mergeInput(padSide, { ...noInput(), stance: true }))).toBe(true);
    expect(stanceLane(mergeInput(noInput(), { ...noInput(), stance: true }))).toBe(true);
  });
});

/**
 * #702's review (Codex P2, 1): the R2 inventory takes the `crouch` and `prone` lanes (research 94, D:L453331), and the
 * page hands its masked input to `playerLanes` with `menu: false`. A Crouch bind held as R2 opens the menu went
 * true -> false there: `playActions` read a release and `walk.crouch()` toggled the stance as the menu opened. The mask
 * is no let-go (`Input.stanceCancelled` on the frame the menu takes a held stance lane), on that frame or the next.
 */
describe('#702 P2: the R2 inventory\'s take of a held Crouch or Prone is no release', () => {
  function rig() {
    const host: InventoryHost = {
      kit: () => ({ count: 5, current: 0, takeable: () => true }), alive: () => true, canChange: () => true, take: () => true,
      icon: () => null, info: () => null, clock: () => 0,
    };
    const inv = new InventoryMenu(host);
    const l = lanes('separate');
    let merged: Input = noInput();
    const step = (flags: Partial<Input>): void => {
      const now = { ...noInput(), ...flags };
      l.frame(inv.frame(merged, now, 1 / 60));
      merged = now;
    };
    return { inv, calls: l.calls, step };
  }
  it('Crouch held as R2 opens the menu: no walk.crouch() on that frame or the next', () => {
    const r = rig();
    r.step({ crouch: true }); r.step({ crouch: true });
    r.step({ crouch: true, inventory: true });
    expect(r.inv.isOpen()).toBe(true);
    r.step({ crouch: true });
    expect(r.calls, 'the mask is no let-go').toEqual([]);
    r.step({}); r.step({});
    expect(r.calls, 'nor the release under the menu').toEqual([]);
  });
  it('Prone held as R2 opens the menu: the Prone it asked once, nothing at the mask', () => {
    const r = rig();
    r.step({ prone: true });
    r.step({ prone: true, inventory: true });
    r.step({ prone: true }); r.step({});
    expect(r.calls).toEqual(['stance:prone']);
  });
});

/**
 * #702's review (Codex P2, 2): an extra bind (h59U9CLb) whose added action is `stance` is a stance source of its own --
 * the Prone button's `stanceOff` (OT.R107) never turns it into Triangle's action alone.
 */
describe('#702 P2: an extra bind\'s added stance is the stance, with Prone held', () => {
  it('a double bind on L3 adding stance, Prone held (stanceOff): stanceLane is true', () => {
    const extras: PadExtras = { doubles: [{ button: PAD_BUTTON.L3, action: 'stance' }], combos: [] };
    const state = new PadExtrasState();
    state.fresh = false;
    const input: Input = { ...noInput(), stance: true, stanceOff: true, prone: true };
    const pressed: boolean[] = []; pressed[PAD_BUTTON.L3] = true;
    expect(stanceLane(applyPadExtras(extras, input, pressed, state, false))).toBe(true);
  });
  it('a combo adding stance, Prone held: stanceLane is true on its press', () => {
    const extras: PadExtras = { doubles: [], combos: [{ modifier: PAD_BUTTON.L1, button: PAD_BUTTON.R3, action: 'stance' }] };
    const state = new PadExtrasState();
    state.fresh = false;
    const input: Input = { ...noInput(), stance: true, stanceOff: true };
    const held: boolean[] = []; held[PAD_BUTTON.L1] = true;
    applyPadExtras(extras, input, held, state, false);
    const both: boolean[] = []; both[PAD_BUTTON.L1] = true; both[PAD_BUTTON.R3] = true;
    expect(stanceLane(applyPadExtras(extras, input, both, state, false))).toBe(true);
  });
});
