// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { padInput, stanceLane } from '../src/gamepad';
import { PadBinding } from '../src/padBinding';
import { GamePad, PAD_SELECTION_KEY } from '../src/setupPad';
import { SETUP_KEY, STANCE_MODE_KEY, defaultController } from '../src/startupSettings';

/**
 * OBF-12 (the owner, 2026-10-30: "I had reassigned the right analog stick R3 i think to be prone, and after resetting to
 * defaults, it persisted despite the ui for prone saying disabled"). The button mapping screen's machine
 * (`../src/padBinding`) writes the pad's profile; the match reads the pad through its own `GamePad` (`../src/matchMount`
 * L923, `../src/main` L1401), made once when the match mounts. The modern overlay draws the console -- its mapping screen
 * among it -- over a running match (`../src/modern/overlay`), so a reset there must reach that reader at once, in the
 * profile it reads, whichever way the device is chosen. R3's default is the game's Reload (`../src/gamepad`, R3 row:
 * controller.rdr), never prone. A browser adaptation's wiring (OT.R28): settings, nothing of the game.
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[] }
const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
const pad = (index = 0, id = XBOX): Pad => ({ index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (p: Pad, ...down: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const R3 = 11;
const saveProfile = (p: Pad, c: Partial<ReturnType<typeof defaultController>>): void => {
  localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c }));
};

// STM-1 (STM.R1a): the Crouch and Prone binds act, and take their buttons, in SEPARATE only -- these pin OBF-12's re-read
// of the profile through them, so they run in SEPARATE (COMBINED's are `stanceModes.test.ts`'s).
beforeEach(() => { localStorage.clear(); localStorage.setItem(STANCE_MODE_KEY, 'separate'); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

/** A match mounted with Prone on R3, and the mapping screen's machine opened over it (the overlay's). */
function mounted(selection?: string) {
  const p = pad();
  const src = { getGamepads: () => [p] };
  if (selection) localStorage.setItem(PAD_SELECTION_KEY, selection);
  saveProfile(p, { prone: R3 });
  const match = new GamePad({ waitForRest: false });
  match.poll(src);
  press(p, R3);
  match.poll(src);
  expect(match.prone, 'the bind holds before the reset').toBe(true);
  press(p);
  match.poll(src);
  const screen = new PadBinding({ pads: src, now: () => 0, holdMs: 0 });
  screen.poll();
  expect(screen.prone()).toBe(R3);
  /** The match's next frame with `down` held: its prone bind and the game's input. */
  const frame = (...down: number[]) => { press(p, ...down); const read = match.poll(src); return { prone: match.prone, input: padInput(read) }; };
  return { p, src, match, screen, frame };
}

describe('OBF-12: a reset on the mapping screen reaches the match\'s pad reader at once', () => {
  it('Restore defaults while a match is mounted: R3 no longer goes prone; it reloads (its default)', () => {
    const r = mounted();
    r.screen.restoreDefaults();
    // STM-1's review F1 (d): a restore in SEPARATE clones again -- Prone back on Triangle's button (3), no longer R3.
    expect(r.screen.prone(), 'the screen says Prone on the Triangle button').toBe(3);
    const f = r.frame(R3);
    expect(f.prone, 'R3 must not set prone after Restore defaults').toBe(false);
    expect(f.input.reload, 'R3 is the game\'s Reload again (no longer masked by the bind)').toBe(true);
  });
  // STM review fold F3: the match's reader, mounted before the restore, takes the re-clone through OBF-12's re-read --
  // Triangle's button is Prone's at once (STM.R1, F1 (d)), and Triangle's own logical press is taken from the game.
  it('Restore defaults in SEPARATE: the running match reads the re-clone -- Triangle\'s button goes prone, no stance from Triangle', () => {
    const r = mounted();
    r.screen.restoreDefaults();
    const f = r.frame(3);
    expect(f.prone, 'Triangle\'s physical button is the cloned Prone').toBe(true);
    expect(stanceLane(f.input), 'OT.R107: the stance lane only -- Triangle\'s own press is taken from the game while Prone is bound').toBe(false);
    r.frame();
    expect(r.frame(R3).prone).toBe(false);
  });
  it('Restore defaults with the device chosen by key, the match on the same pad', () => {
    const r = mounted('0:' + XBOX);
    r.screen.restoreDefaults();
    expect(r.frame(R3).prone).toBe(false);
  });
  it('Square on the Prone row (setProne(-1)) reaches the match', () => {
    const r = mounted();
    r.screen.setProne(defaultController().prone);
    expect(r.frame(R3).prone).toBe(false);
  });
  it('a new bind made over the match is read at once too', () => {
    const r = mounted();
    r.screen.setCrouch(10);
    expect(r.frame(10).input.crouch || r.match.crouch).toBe(true);
  });
  it('the dead zone reset reaches the match', () => {
    const r = mounted();
    r.screen.setDeadZone(0.3);
    r.p.axes[0] = 0.25;
    expect(r.frame().input.moveX).toBe(0);
    r.screen.setDeadZone(defaultController().deadZone);
    r.p.axes[0] = 0.25;
    expect(r.frame().input.moveX).toBeGreaterThan(0);
  });
  it('a device chosen on the screen over a match is the one the match reads', () => {
    const a = pad(0, 'Pad A'), b = pad(1, 'Pad B');
    const src = { getGamepads: () => [a, b] };
    saveProfile(b, { prone: R3 });
    const match = new GamePad({ waitForRest: false });
    match.poll(src);
    const screen = new PadBinding({ pads: src, now: () => 0, holdMs: 0 });
    screen.select('1:Pad B');
    press(b, R3);
    match.poll(src);
    expect(match.prone, 'the match follows the device chosen').toBe(true);
  });
  it('a held prone flag does not outlive its bind (no latch)', () => {
    const r = mounted();
    r.frame(R3);
    r.screen.restoreDefaults();
    expect(r.frame(R3).prone).toBe(false);
    expect(r.frame().prone).toBe(false);
  });
});

describe('OBF-12 review fold 1: a write storage refuses is kept for this visit, never undone by the next poll', () => {
  it('setItem throws (quota full): Restore defaults and a new bind stay on the screen (kept for this visit)', () => {
    const r = mounted();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    r.screen.restoreDefaults();
    r.screen.poll();
    // STM-1 review F1 (d): this file runs in SEPARATE, where Restore clones Prone onto Triangle's button (3); the clone's
    // save is refused as the reset's is, and the in-memory config keeps it -- the next poll still undoes neither.
    expect(r.screen.prone(), 'the reset (with its SEPARATE re-clone) is not undone by the next poll of the screen').toBe(3);
    r.screen.setProne(10);
    r.screen.poll();
    expect(r.screen.prone(), 'a bind is not undone either').toBe(10);
  });
  it('storage unreachable (reads null, writes throw): a bind made on the screen is kept for the visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const p = pad();
    const screen = new PadBinding({ pads: { getGamepads: () => [p] }, now: () => 0, holdMs: 0 });
    screen.poll();
    screen.setProne(R3);
    screen.poll();
    expect(screen.prone()).toBe(R3);
    screen.restoreDefaults();
    screen.setDeadZone(0.3);
    screen.poll();
    expect({ prone: screen.prone(), dead: screen.deadZone() }).toEqual({ prone: -1, dead: 0.3 });
  });
});

describe('OBF-12 review fold 3: a chosen pad back at another index is still the chosen one', () => {
  it('the chosen Bluetooth pad returns at another index beside a second pad: its profile, not the other pad profile', () => {
    const other = pad(0, 'Pad A'), chosen = pad(1, XBOX);
    saveProfile(chosen, { prone: R3 });
    localStorage.setItem(PAD_SELECTION_KEY, '1:' + XBOX);
    const pads = [other, chosen];
    const src = { getGamepads: () => pads };
    const match = new GamePad({ waitForRest: false });
    match.poll(src);
    const back = pad(2, XBOX);                       // dropped and returned at index 2
    pads[1] = back;
    press(back, R3);
    match.poll(src);
    expect(match.input.raw?.id, 'the chosen pad, not the first standard one').toBe(XBOX);
    expect(match.prone).toBe(true);
  });
  it('two identical pads: nothing is guessed (Automatic)', () => {
    localStorage.setItem(PAD_SELECTION_KEY, '5:' + XBOX);
    const a = pad(0, XBOX), b = pad(1, XBOX);
    const match = new GamePad({ waitForRest: false });
    match.poll({ getGamepads: () => [a, b] });
    expect(match.input.selection).toBe('auto');
  });
});

describe('OBF-12 batch review: two identical pads connected never reload defaults each frame', () => {
  it('the mapping screen: a bind made with two identical pads stays, and the next edit keeps it', () => {
    const a = pad(0), b = pad(1);
    const screen = new PadBinding({ pads: { getGamepads: () => [a, b] }, now: () => 0, holdMs: 0 });
    screen.select('0:' + XBOX);
    screen.poll();
    screen.setProne(R3);
    screen.poll();
    expect(screen.prone(), 'the bind is not undone by the next frame').toBe(R3);
    screen.setDeadZone(0.3);
    screen.poll();
    expect({ prone: screen.prone(), dead: screen.deadZone() }).toEqual({ prone: R3, dead: 0.3 });
    expect(JSON.parse(localStorage.getItem(profileKey(a))!)).toMatchObject({ prone: R3, deadZone: 0.3 });
  });
  it('the match: a second identical pad plugged in does not reset the first to defaults', () => {
    const a = pad(0);
    saveProfile(a, { prone: R3 });
    const pads = [a];
    const src = { getGamepads: () => pads };
    const match = new GamePad({ waitForRest: false });
    match.poll(src);
    pads.push(pad(1));
    match.poll(src);
    press(a, R3);
    match.poll(src);
    expect(match.prone, 'the first pad keeps its profile').toBe(true);
  });
});
