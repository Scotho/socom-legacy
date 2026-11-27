// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OptionGlobals, ValveStore } from '@s2u/ui';
import { TOUCHPAD_BUTTON } from '../src/controllerInput';
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
import { controllerConfigs } from '../src/controllerConfigs';
import { setCodModernChosen } from '../src/controllerModern';

/**
 * LATER 1175 (X7; the owner, 2026-11-18: "approved, assign" to "should the touchpad (the Crouch bind) close menus the way
 * Triangle does?", then "it should be any bound control to crouch not just touch pad"; widens OT.R107): in SEPARATE with
 * Triangle's stance off (Prone bound), the button bound to Crouch -- the touchpad by SEP-SHOW's default, or any button the
 * player remapped it to, read from the live profile -- holds the logical Triangle for every reader but the stance lane, as
 * the Prone bind's does: the START menu, WEAPON EXCHANGE, the ARMORY, the Chat menu, the R2 inventory and the spectator's
 * jump read it as Triangle; in play the press still only crouches. A browser adaptation of SEPARATE (STM.R1, OT.R67).
 */

type Pad = { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pad = (): Pad => ({ index: 0, id: 'Pad 0', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) });
const set = (p: Pad, down: Record<number, number>): void => { p.buttons.forEach((b, i) => { b.value = down[i] ?? 0; b.pressed = b.value > 0; }); };
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const TRIANGLE = PAD_BUTTON.Triangle, START = PAD_BUTTON.Start, L3 = PAD_BUTTON.L3;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

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

/** The match's pad frame (`./matchMount` `padFrame`'s order): the match's reader, the START menu, then the game's lanes. */
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

const CROUCH_BINDS = [['the touchpad (SEP-SHOW\'s default, 17)', TOUCHPAD_BUTTON], ['remapped to button 16', 16], ['remapped to L3 (10)', L3]] as const;

describe('LATER 1175: in SEPARATE the Crouch bind\'s button serves Triangle\'s action in menus, never the stance', () => {
  for (const [name, crouch] of CROUCH_BINDS) {
    it(`Crouch on ${name}: its release closes the START menu, and the press is no game crouch under it`, () => {
      const p = pad();
      saveProfile(p, { prone: TRIANGLE, crouch });
      const m = match(p, 'separate');
      m.frame({ [START]: 1 }); m.frame();
      expect(m.menu.isOpen()).toBe(true);
      const f = m.frame({ [crouch]: 1 });
      expect(f.down.has('Triangle'), 'the Crouch button is the logical Triangle for the menus').toBe(true);
      expect(f.game.crouch, 'the menu holds the pad: no crouch reaches the game').toBe(false);
      m.frame();
      expect(m.menu.isOpen(), 'the Crouch button let go closes the menu').toBe(false);
      expect(m.calls, 'no stance under the menu').toEqual([]);
    });

    it(`Crouch on ${name}: WEAPON EXCHANGE, the ARMORY, Chat and the spectator read Triangle; in play it only crouches`, () => {
      const p = pad();
      saveProfile(p, { prone: TRIANGLE, crouch });
      const m = match(p, 'separate');
      const f = m.frame({ [crouch]: 1 });
      expect(f.down.has('Triangle'), 'padButtonsDown: the readers of the menus and the spectator jump').toBe(true);
      expect(menuInputOfPad('Triangle')).toBe('back');
      expect(f.pad.stance, 'Triangle\'s lane is held (the R2 inventory\'s close, the spectator\'s jump)').toBe(true);
      expect(stanceLane(f.pad), 'the stance lane takes no Triangle from it').toBe(false);
      for (let i = 0; i < 3; i++) m.frame({ [crouch]: 1 });
      m.frame();
      expect(m.calls.length, 'a crouch').toBeGreaterThan(0);
      expect(m.calls.every((c) => c === 'crouch'), `only crouch, never Triangle's stance: ${m.calls.join(',')}`).toBe(true);
    });

    it(`Crouch on ${name}: the R2 inventory closes on it unchosen, and takes it (no crouch after)`, () => {
      const p = pad();
      saveProfile(p, { prone: TRIANGLE, crouch });
      setControllerStanceMode('separate');
      const src = { getGamepads: () => [p] };
      const gp = new GamePad({ waitForRest: false });
      gp.poll(src);
      let now = 0;
      const host: InventoryHost = { kit: () => ({ count: 5, current: 0, takeable: (s) => s !== 4 }), alive: () => true, canChange: () => true, take: () => true, icon: () => null, info: () => null, clock: () => now };
      const inv = new InventoryMenu(host);
      let before: Input = noInput();
      const step = (down: Record<number, number> = {}): Input => {
        now += 1 / 60;
        set(p, down);
        const input = padInput(gp.poll(src));
        if (gp.crouch) input.crouch = true;
        if (gp.prone) input.prone = true;
        const game = inv.frame(before, input, 1 / 60);
        before = input;
        return game;
      };
      step({ [PAD_BUTTON.R2]: 1 }); step();
      for (let i = 0; i < 40 && inv.visual().state !== 3; i++) step();
      expect(inv.isOpen()).toBe(true);
      const g = step({ [crouch]: 1 });
      expect(inv.isOpen(), 'closed as Triangle closes it').toBe(false);
      expect([g.crouch, g.stance], 'taken: no crouch, no stance').toEqual([false, false]);
    });
  }

  it('Prone unbound in SEPARATE (Triangle keeps its stance): the Crouch button is no Triangle', () => {
    const p = pad();
    saveProfile(p, { crouch: TOUCHPAD_BUTTON });
    const m = match(p, 'separate');
    const f = m.frame({ [TOUCHPAD_BUTTON]: 1 });
    expect(f.down.has('Triangle')).toBe(false);
  });

  it('COMBINED: the Crouch bind is unread, the touchpad is no Triangle', () => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE, crouch: TOUCHPAD_BUTTON });
    const m = match(p, 'pop');
    expect(m.frame({ [TOUCHPAD_BUTTON]: 1 }).down.has('Triangle')).toBe(false);
  });

  it('the front end\'s reader: a Crouch on a free button (the touchpad) is Triangle; on one with its own action (L3) it keeps that alone', () => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE, crouch: TOUCHPAD_BUTTON });
    const src = { getGamepads: () => [p] };
    const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
    setControllerStanceMode('separate');
    menus.poll(src);
    set(p, { [TOUCHPAD_BUTTON]: 1 });
    expect([...padButtonsDown(menus.poll(src))]).toEqual(['Triangle']);
    saveProfile(p, { prone: TRIANGLE, crouch: L3 });
    const menus2 = new GamePad({ releaseCrouch: false, waitForRest: false });
    menus2.poll(src);
    set(p, { [L3]: 1 });
    const down = padButtonsDown(menus2.poll(src));
    expect(down.has('L3')).toBe(true);
    expect(down.has('Triangle'), 'a button with its own job keeps it alone').toBe(false);
  });

  // The fresh review's finding 1: under COD Modern, Triangle is also SwapWeapon1; a Triangle held by the Crouch button
  // alone is Triangle's back-out only (`triangleFromProneOnly`, `./gamepad` `padInput`), so the crouch swaps no weapon.
  for (const [name, crouch] of CROUCH_BINDS) {
    it(`COD Modern, Crouch on ${name}: in play a crouch, no weapon swap, no stance`, () => {
      setCodModernChosen(true);
      controllerConfigs.store((n) => (n === 'SelectedControllerConfig' ? 1 : 0));
      try {
        const p = pad();
        saveProfile(p, { prone: PAD_BUTTON.R3, crouch });
        setControllerStanceMode('separate');
        const src = { getGamepads: () => [p] };
        const gp = new GamePad({ waitForRest: false });
        gp.poll(src);
        set(p, { [crouch]: 1 });
        const logical = gp.poll(src);
        const input = mergeInput(padInput(logical), { ...noInput(), crouch: gp.crouch, prone: gp.prone });
        expect(logical!.triangleFromProneOnly).toBe(true);
        expect(input.crouch).toBe(true);
        expect(input.swap1, 'no SwapWeapon1 from the Crouch-held Triangle').toBe(false);
        expect(stanceLane(input)).toBe(false);
      } finally { controllerConfigs.reset(); setCodModernChosen(false); }
    });
  }
});
