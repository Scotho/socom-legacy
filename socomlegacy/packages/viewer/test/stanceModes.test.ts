// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput } from '../src/controllerInput';
import { mergeInput, noInput, PAD_BUTTON, padInput, stanceLane, type Input } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { gameReadsButton } from '../src/modern/overlay/binding';
import type { Stance } from '../src/mover';
import { PadBinding, type BindingEvent } from '../src/padBinding';
import { GamePad } from '../src/setupPad';
import { StanceButton, type StanceMode } from '../src/stanceButton';
import { SETUP_KEY, STANCE_MODE_KEY, defaultController, parseController, setControllerStanceMode, type ControllerConfig } from '../src/startupSettings';
import { livePad } from '../src/console/adapters/pad';
import { mountTouch } from '../src/matchTouch';

/**
 * STM-1 (the plan 2026-10-30-stance-modes-and-emulator-harness; STM.R1, the owner, 2026-10-30: "only when SEPARATE is
 * selected should the two separate bindings show for prone and crouch. The original triangle button (prone) gets disabled
 * for this mode and the button bound to is cloned over to PRONE in the separate binds"; STM.R1a, his answers: Crouch
 * unbound, L3 kept for the fire mode; leaving SEPARATE, the binds "Kept, hidden"). The pad's side of the two modes:
 * COMBINED (`'pop'`) neither reads nor masks the Crouch and Prone binds; SEPARATE reads and masks them (`ControllerInput.poll`);
 * entering SEPARATE gives an unbound Prone the physical button Triangle's binding drives and keeps a bound one
 * (`ControllerInput.cloneTriangleToProne`, `PadBinding.enterSeparate`); the pad's Triangle does no stance in SEPARATE
 * while the profile's Prone is bound, and keeps it while Prone is unbound (the review's F1: the gate is the pad reader's,
 * `ControllerInput.poll`, where the mode and the profile are both known; `playerLanes` takes Triangle as given); Restore
 * defaults in SEPARATE clones again. The console's rows are `console/remapStanceModes.test.ts`'s.
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[] }
const pad = (): Pad => ({ index: 0, id: 'Pad 0', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (p: Pad, ...down: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const stored = (p: Pad): ControllerConfig => parseController(localStorage.getItem(profileKey(p)));
const R3 = 11, UP = 12, TRIANGLE = PAD_BUTTON.Triangle;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/** The match's reader (`releaseCrouch`, the binds take their buttons) over one pad, read at once (no wait for rest). */
function reader(p: Pad) {
  const input = new ControllerInput();
  input.waitForRest = false;
  const src = { getGamepads: () => [p] };
  input.poll(src);
  const frame = (...down: number[]) => { press(p, ...down); const read = input.poll(src); return { crouch: input.crouch, prone: input.prone, game: padInput(read) }; };
  return { input, frame };
}

describe('STM.R1a: the Crouch and Prone binds act by mode', () => {
  it('COMBINED: kept in the profile, but neither fed nor masked -- their buttons are the game\'s own', () => {
    const p = pad();
    saveProfile(p, { crouch: UP, prone: R3 });
    setControllerStanceMode('pop');
    const r = reader(p);
    const f = r.frame(R3, UP);
    expect([f.prone, f.crouch]).toEqual([false, false]);
    expect(f.game.reload, 'R3 is the game\'s Reload in COMBINED').toBe(true);
    expect(f.game.zoom, 'd-pad Up is the game\'s zoom in COMBINED').toBe(true);
    expect(r.input.config).toMatchObject({ crouch: UP, prone: R3 });   // kept, hidden (STM.R1a)
  });
  it('SEPARATE: fed, and their buttons taken from the game (as PP-5 had them in both modes)', () => {
    const p = pad();
    saveProfile(p, { crouch: UP, prone: R3 });
    setControllerStanceMode('separate');
    const f = reader(p).frame(R3, UP);
    expect([f.prone, f.crouch]).toEqual([true, true]);
    expect(f.game.reload).toBe(false);
    expect(f.game.zoom).toBe(false);
  });
  it('the mode is read each poll: a change of mode reaches a reader already running', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    setControllerStanceMode('pop');
    const r = reader(p);
    expect(r.frame(R3).prone).toBe(false);
    setControllerStanceMode('separate');
    expect(r.frame(R3).prone).toBe(true);
    setControllerStanceMode('pop');
    const f = r.frame(R3);
    expect(f.prone).toBe(false);
    expect(f.game.reload).toBe(true);
  });
  it('the menus\' reader (releaseCrouch false) never takes a bind\'s button, in either mode', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    for (const mode of ['pop', 'separate'] as const) {
      setControllerStanceMode(mode);
      const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
      const src = { getGamepads: () => [p] };
      menus.poll(src);
      press(p, R3);
      expect(menus.poll(src)!.buttons[R3]!.pressed, mode).toBe(true);
      press(p);
    }
  });
});

describe('STM.R1: entering SEPARATE clones Triangle\'s button to Prone', () => {
  it('an unbound Prone takes the physical button Triangle\'s binding drives, saved; Crouch stays unbound (STM.R1a)', () => {
    const p = pad();
    const r = reader(p);
    expect(r.input.cloneTriangleToProne()).toBe(true);
    expect(r.input.config.prone).toBe(TRIANGLE);
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: -1 });
  });
  it('Triangle rebound: Prone takes the button Triangle is on now, not the button named Triangle', () => {
    const p = pad();
    const bindings = defaultController().bindings;
    bindings[TRIANGLE] = PAD_BUTTON.Square; bindings[PAD_BUTTON.Square] = TRIANGLE;   // Triangle and Square swapped
    saveProfile(p, { bindings });
    const r = reader(p);
    r.input.cloneTriangleToProne();
    expect(stored(p).prone).toBe(PAD_BUTTON.Square);
  });
  it('a Prone already bound is kept (STM.R1a "kept"); a Triangle unbound, or one Crouch holds, gives nothing', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    expect(reader(p).input.cloneTriangleToProne()).toBe(false);
    expect(stored(p).prone).toBe(R3);
    const q = pad();
    q.id = 'Pad unbound';
    const unbound = defaultController().bindings;
    unbound[TRIANGLE] = -1;
    saveProfile(q, { bindings: unbound });
    expect(reader(q).input.cloneTriangleToProne()).toBe(false);
    expect(stored(q).prone).toBe(-1);
    const c = pad();
    c.id = 'Pad crouch';
    saveProfile(c, { crouch: TRIANGLE });
    expect(reader(c).input.cloneTriangleToProne()).toBe(false);
    expect(stored(c)).toMatchObject({ crouch: TRIANGLE, prone: -1 });
  });
  it('no pad read yet (no profile): nothing changes and nothing is saved', () => {
    const input = new ControllerInput();
    expect(input.cloneTriangleToProne()).toBe(false);
    expect(input.config.prone).toBe(-1);
    expect(localStorage.length).toBe(0);
  });
  it('PadBinding.enterSeparate: the mapping screen\'s machine does it and says so (a config change)', () => {
    const p = pad();
    const src = { getGamepads: () => [p] };
    const b = new PadBinding({ pads: src, now: () => 0, holdMs: 0 });
    b.poll();
    const seen: BindingEvent['kind'][] = [];
    b.onChange((e) => { seen.push(e.kind); });
    b.enterSeparate();
    expect(b.prone()).toBe(TRIANGLE);
    expect(b.crouch()).toBe(-1);
    expect(seen).toEqual(['config']);
    b.enterSeparate();                                     // bound now: kept, nothing said
    expect(seen).toEqual(['config']);
  });
  it('OBF-12 with STM.R1: the clone made on the screen reaches the match\'s reader at once; Triangle\'s button is Prone in SEPARATE and Triangle again in COMBINED', () => {
    const p = pad();
    const src = { getGamepads: () => [p] };
    const match = new GamePad({ waitForRest: false });
    match.poll(src);
    const screen = new PadBinding({ pads: src, now: () => 0, holdMs: 0 });
    screen.poll();
    screen.enterSeparate();
    setControllerStanceMode('separate');
    press(p, TRIANGLE);
    let read = match.poll(src);
    expect(match.prone).toBe(true);
    expect(stanceLane(padInput(read)), 'OT.R107: the stance lane takes none of it -- Triangle\'s own press is masked there: its button is Prone\'s').toBe(false);
    setControllerStanceMode('pop');
    read = match.poll(src);
    expect(match.prone).toBe(false);
    expect(padInput(read).stance, 'COMBINED: Triangle is Triangle again').toBe(true);
  });
});

/** The game's lanes (`playerLanes`) over a recording walk in `mode`; what they ask, in order. */
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
  let last: Input = noInput();
  const frame = (flags: Partial<Input>): void => { const next = { ...noInput(), ...flags }; playerLanes(l, last, next, 1 / 60, { walking: true, menu: false }); last = next; };
  return { calls, frame, setIntent: (s: Stance): void => { intent = s; } };
}

/**
 * The match end to end as both pages wire it (`../src/matchMount` `padFrame`, `../src/main`): the pad read through the
 * match's `GamePad`, the game's input made of it with the Crouch and Prone binds set on it, then `playerLanes` in the
 * saved mode. `tapTriangle`: Triangle's physical button down three frames, then up.
 */
function match(p: Pad, mode: StanceMode, o: { wanted?: string; src?: { getGamepads(): Pad[] } } = {}) {
  setControllerStanceMode(mode);
  const src = o.src ?? { getGamepads: () => [p] };
  const gp = new GamePad({ waitForRest: false, ...(o.wanted ? { wanted: o.wanted } : {}) });
  gp.poll(src);
  const r = lanes(mode);
  const frame = (...down: number[]): void => {
    press(p, ...down);
    const input = padInput(gp.poll(src));
    if (gp.crouch) input.crouch = true;
    if (gp.prone) input.prone = true;
    r.frame(input);
  };
  const tapTriangle = (): void => { for (let i = 0; i < 3; i++) frame(TRIANGLE); frame(); };
  return { ...r, gp, frame, tapTriangle };
}

describe('STM.R1 and the review\'s F1: the lanes take the pad\'s Triangle in both modes; the gate is the pad reader\'s', () => {
  it('COMBINED: a Triangle tap crouches (the control)', () => {
    const r = lanes('pop');
    for (let i = 0; i < 3; i++) r.frame({ stance: true });
    r.frame({});
    expect(r.calls).toEqual(['stance:crouch']);
  });
  // The review's F1 (STM-1, PASS WITH FINDINGS): `playerLanes` fed Triangle released in SEPARATE whatever the profile, so a
  // SEPARATE with Prone unbound left the pad no stance at all. The lanes take Triangle as given; `ControllerInput.poll`
  // decides (below).
  it('SEPARATE: a Triangle tap reaches the stance lanes -- from stand a crouch, from prone a crouch (H338, the original\'s tap)', () => {
    const r = lanes('separate');
    for (let i = 0; i < 3; i++) r.frame({ stance: true });
    r.frame({});
    expect(r.calls).toEqual(['stance:crouch']);
    const q = lanes('separate');
    q.setIntent('prone');
    for (let i = 0; i < 3; i++) q.frame({ stance: true });
    q.frame({});
    expect(q.calls).toEqual(['stance:crouch']);
  });
  it('SEPARATE: the Prone and Crouch binds\' lanes act (Prone at once, Crouch at its release)', () => {
    const r = lanes('separate');
    r.frame({ prone: true });
    r.frame({});
    r.frame({ crouch: true });
    r.frame({});
    expect(r.calls).toEqual(['stance:prone', 'crouch']);
  });
});

describe('STM.R1 with the review\'s F1: Triangle\'s stance is off in SEPARATE only while the profile\'s Prone is bound', () => {
  it('SEPARATE, Prone bound elsewhere (R3): Triangle\'s button is taken from the game -- no stance; R3 is Prone', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    setControllerStanceMode('separate');
    const r = reader(p);
    expect(stanceLane(r.frame(TRIANGLE).game), 'OT.R107: Triangle\'s action kept, its stance lane off').toBe(false);
    expect(r.frame(R3).prone).toBe(true);
    const m = match(p, 'separate');                              // the match end to end: no stance asked
    m.tapTriangle();
    expect(m.calls).toEqual([]);
  });
  it('SEPARATE, Prone cloned on Triangle\'s button: that button is Prone -- a press goes prone, never a crouch tap', () => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE });
    const m = match(p, 'separate');
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:prone']);
  });
  it('SEPARATE, Prone unbound (a player who unbound it): Triangle keeps its stance (PAD_STANCE_SEPARATE)', () => {
    const p = pad();
    const m = match(p, 'separate');
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:crouch']);
  });
  // STM review fold (the gap the review named): the hold too, end to end -- prone at the hold's threshold.
  it('SEPARATE, Prone unbound: Triangle\'s hold goes prone end to end (the original\'s hold, PAD_STANCE_SEPARATE)', () => {
    const p = pad();
    const m = match(p, 'separate');
    for (let i = 0; i < 40; i++) m.frame(TRIANGLE);
    m.frame();
    expect(m.calls).toEqual(['stance:prone']);
  });
  it('COMBINED, Prone bound: Triangle is Triangle (the binds unread, STM.R1a)', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    setControllerStanceMode('pop');
    expect(reader(p).frame(TRIANGLE).game.stance).toBe(true);
  });
  it('the menus\' reader (releaseCrouch false) keeps Triangle in SEPARATE with Prone bound', () => {
    const p = pad();
    saveProfile(p, { prone: R3 });
    setControllerStanceMode('separate');
    const menus = new GamePad({ releaseCrouch: false, waitForRest: false });
    const src = { getGamepads: () => [p] };
    menus.poll(src);
    press(p, TRIANGLE);
    expect(padInput(menus.poll(src)).stance).toBe(true);
  });
});

/**
 * STM review fold F1 (the controller's decision, 2026-10-30): the touch walk pad's on-screen Triangle (MP-1 `tw-triangle`)
 * reaches the lanes through `../src/matchMount` `padFrame` (`flushedPad(touch.input, pad)`: `mergeInput`), never through
 * `ControllerInput`, so it has no Prone bind -- by the F1 rule Triangle keeps its stance there: in SEPARATE the original's
 * tap and hold (H338, `PAD_STANCE_SEPARATE`), in COMBINED the prone-pop's. Pins of behaviour at the head.
 */
describe('STM review fold F1: the touch walk pad\'s Triangle keeps its stance in both modes (no Prone bind)', () => {
  function touchMatch(mode: StanceMode) {
    const root = document.createElement('div');
    document.body.append(root);
    const touch = mountTouch(root, {
      stance: () => {}, fire: () => {}, reload: () => {}, cancelAction: () => {}, covered: () => false, build: { zIndex: 1 },
      exchange: { menu: { touchButton: () => false } as never, refresh: () => {}, gate: () => ({ inMatch: true, alive: true, cameraOnSelf: true, spectator: false }), isOpen: () => false, prompt: () => null },
    });
    const triangle = root.querySelector<HTMLElement>(`[id="touch-walk"] button[data-pad="${TRIANGLE}"]`)!;
    const r = lanes(mode);
    const frame = (): void => { r.frame(mergeInput(touch.input, noInput())); touch.endFrame(); };
    const ev = (type: string): void => { triangle.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true })); };
    const done = (): void => { touch.dispose(); root.remove(); };
    return { calls: r.calls, frame, down: () => ev('pointerdown'), up: () => ev('pointerup'), done };
  }
  for (const mode of ['separate', 'pop'] as const) {
    it(`${mode}: the touch Triangle's tap crouches, its hold goes prone`, () => {
      const t = touchMatch(mode);
      t.down(); for (let i = 0; i < 3; i++) t.frame();
      t.up(); t.frame(); t.frame();
      expect(t.calls).toEqual(['stance:crouch']);
      t.done();
      const h = touchMatch(mode);
      h.down(); for (let i = 0; i < 40; i++) h.frame();
      h.up(); h.frame(); h.frame();
      expect(h.calls).toEqual(['stance:prone']);
      h.done();
    });
  }
});

describe('the review\'s F1: no way into SEPARATE leaves the pad without a stance', () => {
  it('(a) a SEPARATE saved before STM.R1 (PP-5) read back, the profile never cloned: Triangle still changes stance', () => {
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    const p = pad();
    const m = match(p, 'separate');
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:crouch']);
    expect(stored(p).prone).toBe(-1);                            // nothing cloned behind the player's back
  });
  it('(b) SEPARATE chosen with no pad read (the Options row, no profile to clone into): the pad connected after has its stance', () => {
    const lp = livePad(() => {}, { source: { getGamepads: () => [] } });
    lp.read();
    lp.enterSeparate!();                                         // nothing to clone into
    setControllerStanceMode('separate');
    expect(localStorage.length).toBe(1);                         // the mode alone
    const m = match(pad(), 'separate');
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:crouch']);
  });
  it('(c) a second pad whose profile was never read while SEPARATE was chosen: its Triangle still changes stance', () => {
    const a = pad(), b = pad();
    b.index = 1; b.id = 'Pad B';
    const first = reader(a);
    first.input.cloneTriangleToProne();                          // pad A: SEPARATE entered with A chosen
    setControllerStanceMode('separate');
    const m = match(b, 'separate', { wanted: '1:Pad B', src: { getGamepads: () => [a, b] } });
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:crouch']);
    expect(stored(a).prone).toBe(TRIANGLE);
    expect(stored(b).prone).toBe(-1);
  });
  it('(d) Restore defaults in SEPARATE clones again: Prone back on Triangle\'s button, so it ends where entering SEPARATE does', () => {
    const p = pad();
    const src = { getGamepads: () => [p] };
    setControllerStanceMode('separate');
    const b = new PadBinding({ pads: src, now: () => 0, holdMs: 0 });
    b.poll();
    b.setProne(R3);
    b.setCrouch(UP);
    b.restoreDefaults();
    expect([b.prone(), b.crouch()]).toEqual([TRIANGLE, -1]);
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: -1 });
    const m = match(p, 'separate');
    m.tapTriangle();
    expect(m.calls).toEqual(['stance:prone']);
  });
  it('(d) Restore defaults in COMBINED does not clone: Prone stays unbound', () => {
    const p = pad();
    setControllerStanceMode('pop');
    const b = new PadBinding({ pads: { getGamepads: () => [p] }, now: () => 0, holdMs: 0 });
    b.poll();
    b.setProne(R3);
    b.restoreDefaults();
    expect(b.prone()).toBe(-1);
    expect(stored(p)).toEqual(defaultController());
  });
});

describe('STM.R1a: the overlay\'s "the game reads it" follows the mode', () => {
  it('a Crouch or Prone bind is a button the game reads in SEPARATE only', () => {
    const TOUCHPAD = 17;
    const config = { ...defaultController(), crouch: TOUCHPAD };
    expect(gameReadsButton(TOUCHPAD, config, 'separate')).toBe(true);
    expect(gameReadsButton(TOUCHPAD, config, 'pop')).toBe(false);
    const prone = { ...defaultController(), prone: TOUCHPAD };
    expect(gameReadsButton(TOUCHPAD, prone, 'separate')).toBe(true);
    expect(gameReadsButton(TOUCHPAD, prone, 'pop')).toBe(false);
    expect(gameReadsButton(TRIANGLE, defaultController(), 'pop')).toBe(true);   // a binding is read in both
  });
});
