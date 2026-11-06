// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput, TOUCHPAD_BUTTON } from '../src/controllerInput';
import { noInput, padInput, stanceLane, type Input } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { StanceButton } from '../src/stanceButton';
import { SETUP_KEY, controllerStanceMode, defaultController, setControllerStanceMode, type ControllerConfig } from '../src/startupSettings';

/**
 * PS2P (the owner, 2026-11-01, via seat 5d: "if you think feasible to auto-detect pressure sensitive controllers, and when
 * we do, default to the new separate mode we have with the two states bound, pull it in. Keep our separate logic"):
 * a pressure pad in SEPARATE feeds SEPARATE's own Crouch and Prone binds from its one button's pressure, as two separate
 * buttons would -- the original's press (`FUN_00594cf0` D:L453331-453425, `DAT_0066b410`, research 373 §1, research 180
 * §1.9): a press whose pressure reaches 0.3 is the full press (Prone, at once); one whose peak stays under it is the light
 * press, taken when its pressure first falls below the peak (Crouch). No stance decision of its own: B193's lanes
 * (`playerLanes`, `StanceButton.lanes`, `WalkMode.crouch`) decide. COMBINED is B193's, pressure or not.
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[]; stanceCancelled?: boolean }
const DS3_ID = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const DUALSENSE_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const pad = (id = DS3_ID, n = 17): Pad => ({ index: 0, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, value: 0 })) });
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const TRIANGLE = 3;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/**
 * The match's chain over one pad: the reader (`ControllerInput.poll`, the match's: `releaseCrouch`, no wait for rest),
 * the page's binds into the frame's input (`main.ts` `padFrame`: `gamePad.crouch`, `gamePad.prone`), then B193's lanes.
 * Each frame sets Triangle's pressure (`pressed` above zero, as the WebHID reader's adapter order and browsers report it).
 */
function chain(p: Pad) {
  const input = new ControllerInput();
  input.waitForRest = false;
  const calls: string[] = [];
  const l: LaneParts = {
    walk: {
      mode: () => 'walk', isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand', stanceMode: () => controllerStanceMode(),
      jump: () => true, crouch: () => { calls.push('crouch'); return true; }, setStance: (s) => { calls.push(`stance:${s}`); return true; },
    },
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes: () => {}, fire: { reload: () => true } },
    stanceButton: new StanceButton(),
    shoulder: () => {},
  };
  let before: Input = noInput();
  const src = { getGamepads: () => [p] };
  const frame = (triangle: number, o: { cancelled?: boolean; pressed?: boolean; touchpad?: boolean } = {}): Input => {
    p.buttons[TRIANGLE] = { pressed: o.pressed ?? triangle > 0, value: triangle };
    if (p.buttons.length > TOUCHPAD_BUTTON) p.buttons[TOUCHPAD_BUTTON] = { pressed: !!o.touchpad, value: o.touchpad ? 1 : 0 };
    p.stanceCancelled = o.cancelled;
    const i = padInput(input.poll(src));
    if (input.crouch) i.crouch = true;
    if (input.prone) i.prone = true;
    playerLanes(l, before, i, 1 / 60, { walking: true, menu: false });
    before = i;
    return i;
  };
  const run = (...values: number[]): string[] => { for (const v of values) frame(v); return calls.filter((c) => c === 'crouch' || c.startsWith('stance:')); };
  return { input, frame, run, calls };
}

/** SEPARATE with a pressure pad as the auto default leaves it: Prone cloned from Triangle, Crouch on the same button. */
function separatePressurePad(c: Partial<ControllerConfig> = {}): Pad {
  const p = pad();
  saveProfile(p, { prone: TRIANGLE, crouch: TRIANGLE, nativePressure: true, ...c });
  setControllerStanceMode('separate');
  return p;
}

describe('PS2P: SEPARATE with a pressure pad feeds its Crouch and Prone binds from the press (FUN_00594cf0 D:L453331-453425)', () => {
  it('a light press (0.2) then release: exactly one crouch, no prone', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0, 0.2, 0, 0, 0)).toEqual(['crouch']);
  });

  it('0.2, 0.5, 0: exactly one prone and no crouch -- the full press acts at once, at 0.3 or more', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0, 0.2)).toEqual([]);
    expect(r.run(0.5)).toEqual(['stance:prone']);              // the frame it reaches 0.3, not the release
    expect(r.run(0, 0, 0)).toEqual(['stance:prone']);
  });

  it('a firm press held: one prone, however long; the next press needs the button at rest first', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0, 0.8, 0.9, 1, 1, 1, 0.6, 0.1)).toEqual(['stance:prone']);
    // MOVE-S6 (`STANCE_PRESS_REARM_READING`): the release frame (+7 = 3) does not re-arm, an idle frame after it does.
    expect(r.run(0, 0.25, 0, 0)).toEqual(['stance:prone']);
    expect(r.run(0, 0, 0.25, 0, 0)).toEqual(['stance:prone', 'crouch']);
  });

  it('the light press is taken when its pressure first falls below its peak (D:L453336-453345), not only at zero', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0, 0.1, 0.2, 0.15)).toEqual([]);              // decided at 0.15: the crouch bind's one-frame press
    expect(r.run(0.1)).toEqual(['crouch']);                    // ... released the next frame (`WalkMode.crouch` on the release)
    expect(r.run(0.25, 0.5, 0)).toEqual(['crouch']);           // spent until the button rests: no prone from the same press
    expect(r.run(0, 0.5)).toEqual(['crouch', 'stance:prone']);
  });

  it('a press already down at the first read is no press (the match\'s flush): it acts only after a rest', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0.2, 0.2, 0)).toEqual([]);
    expect(r.run(0, 0.2, 0, 0)).toEqual(['crouch']);       // MOVE-S6: the release frame, then an idle one
  });

  it('a cancelled frame (the WebHID stall, the overlay\'s synthetic neutral) is no release: no crouch, and the press is spent', () => {
    const r = chain(separatePressurePad());
    r.run(0, 0.2);
    r.frame(0, { cancelled: true });
    expect(r.run(0.2, 0, 0)).toEqual([]);                      // the press under way at the cancel is spent until a rest
    expect(r.run(0.2, 0, 0)).toEqual(['crouch']);
  });

  it('Triangle\'s own stance does nothing in SEPARATE (Prone bound: STM.R1\'s triangleOff) -- only the binds act', () => {
    const r = chain(separatePressurePad());
    const i = r.frame(0.8);
    expect(stanceLane(i), 'OT.R107: the Prone button is Triangle\'s action, never the stance lane').toBe(false);
  });

  it('an explicit digital preference (`nativePressure: false`) keeps the pad digital: a shared bind is read as Prone alone', () => {
    const r = chain(separatePressurePad({ nativePressure: false }));
    expect(r.run(0, 0.2, 0, 0)).toEqual(['stance:prone']);
  });
});

describe('PS2P: COMBINED with a pressure pad is B193\'s, unchanged (the pop and the timed tap and hold)', () => {
  // The same presses on the same pad, once with pressure values and once with the browser's 0 / 1: the lanes see the same.
  const script: [number, boolean][] = [[0, false], [0.2, true], [0.2, true], [0, false], [0, false], ...Array.from({ length: 40 }, (): [number, boolean] => [0.6, true]), [0, false], [0, false], [0.1, false], [0, false]];
  const play = (pressure: boolean): string[] => {
    const p = pad();
    saveProfile(p, { prone: TRIANGLE, crouch: TRIANGLE, ...(pressure ? { nativePressure: true } : {}) });
    setControllerStanceMode('pop');
    const r = chain(p);
    const stance: boolean[] = [];
    for (const [v, down] of script) stance.push(r.frame(pressure ? v : down ? 1 : 0, { pressed: down }).stance);
    return [...r.calls.filter((c) => c === 'crouch' || c.startsWith('stance:')), stance.join('')];
  };

  it('the stance lanes act alike with and without pressure values, and the binds are not read', () => {
    const digital = play(false);
    expect(digital.slice(0, -1)).toEqual(['stance:crouch', 'stance:prone']);   // the tap, then the 0.4 s hold
    expect(play(true)).toEqual(digital);
  });

  it('the light value under the browser\'s digital threshold is no stance press in COMBINED (B193\'s buttonDown)', () => {
    const p = pad();
    saveProfile(p, { nativePressure: true });
    setControllerStanceMode('pop');
    const r = chain(p);
    expect(r.frame(0.2, { pressed: false }).stance).toBe(false);
    expect(r.run(0, 0, 0)).toEqual([]);
  });
});

describe('PS2P: the `!nativePressure` gate is gone -- SEPARATE\'s binds and SEP-SHOW\'s touchpad Crouch act on a pressure profile', () => {
  it('a DualSense profile marked native pressure: the touchpad Crouch still crouches in SEPARATE', () => {
    const p = pad(DUALSENSE_ID, 18);
    saveProfile(p, { prone: TRIANGLE, crouch: TOUCHPAD_BUTTON, nativePressure: true });
    setControllerStanceMode('separate');
    const r = chain(p);
    r.frame(0); r.frame(0, { touchpad: true });
    expect(r.input.crouch).toBe(true);
    r.frame(0);
    expect(r.calls).toContain('crouch');
  });

  it('with Crouch on the touchpad, Triangle\'s light press crouches too and its firm press goes prone', () => {
    const p = pad(DUALSENSE_ID, 18);
    saveProfile(p, { prone: TRIANGLE, crouch: TOUCHPAD_BUTTON, nativePressure: true });
    setControllerStanceMode('separate');
    const r = chain(p);
    expect(r.run(0, 0.2, 0, 0, 0.5, 0, 0)).toEqual(['crouch', 'stance:prone']);
  });
});

// Phil's `StanceButton` pressure cases (PR #625, himynameisphil; `test/pressureStance.test.ts` on his branch), dropped with
// `updatePressure` by PS2P and kept here (the reconciliation, 2026-11-02) on SEPARATE's path, where the press is read now.
describe('PS2P: Phil\'s pressure cases on SEPARATE\'s path (PR #625)', () => {
  it('a light press never becomes a timed hold: two seconds under 0.3, then let go -- one crouch, no prone', () => {
    const r = chain(separatePressurePad());
    expect(r.run(0, ...Array<number>(120).fill(0.2), 0, 0)).toEqual(['crouch']);
  });

  it('changing the Stance mode cannot retrigger a held press: held from COMBINED into SEPARATE, it acts only after a rest', () => {
    const p = separatePressurePad();
    setControllerStanceMode('pop');
    const r = chain(p);
    r.frame(0); r.frame(0.8);
    setControllerStanceMode('separate');
    expect(r.run(0.8, 0.8, 0)).toEqual([]);
    expect(r.run(0.5, 0)).toEqual([]);              // MOVE-S6 (`STANCE_PRESS_REARM_READING`): the release frame alone does not re-arm
    expect(r.run(0, 0.5)).toEqual(['stance:prone']); // the release frame (above), then an idle one
  });
});
