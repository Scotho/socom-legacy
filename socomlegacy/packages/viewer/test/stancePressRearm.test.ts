// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { ControllerInput, StancePress } from '../src/controllerInput';
import { noInput, padInput, type Input } from '../src/gamepad';
import { playerLanes, type LaneParts } from '../src/matchLanes';
import { StanceButton, stanceOnTapOriginal } from '../src/stanceButton';
import { SETUP_KEY, controllerStanceMode, defaultController, setControllerStanceMode } from '../src/startupSettings';
import type { Stance } from '../src/walk';

/**
 * MOVE-S6 (B200; simulation track, SEPARATE only; reading, pending review). The original takes a new stance press only
 * once the pad record's press state `+7` has read 0 (`FUN_00594cf0` D:L453332-453333; r0004's twin 0x59a6e0, the same
 * test at 0x59b448-0x59b458): 1 on the press frame, 2 held, 3 on the release frame, then 0 -- so a press needs one idle
 * game frame after the release frame (`STANCE_PRESS_REARM_READING`). Capture (r0004 slot 5, PCSX2 alone, eph-hunt
 * 2026-11-01 probes `r0004-s6-delivery`, 3 trials each): a full Triangle at 500-650 ms, then a light one (0.2) held
 * 100 ms from 50 / 100 / 150 ms after its release -- at 50 ms the byte goes 3 -> 1 with no 0 between and the request
 * `+0x374` stays (2/2 valid trials); at 100 and 150 ms it is taken (3/3 each). The page steps the press on the 30 Hz
 * game frame (`ControllerInput.pressClock`), as the original reads it. S6-PROVEN (2026-11-03): the one-idle-frame
 * probe (`r0004-s6-idle`, 4 trials each) takes the light press about 67 ms after the release 4/4 and refuses it at
 * about 50 ms 4/4 -- the timing boundary, proven within one 30 Hz frame (a [3, 3] prefix of `+7` splits, so the byte
 * alone does not decide it; research 373 section 1).
 */
type Btn = { pressed: boolean; value: number };
interface Pad { index: number; id: string; mapping: string; connected: boolean; axes: number[]; buttons: Btn[]; stanceCancelled?: boolean }
const DS3_ID = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const TRIANGLE = 3;
const FRAME_MS = GAME_FRAME_DT * 1000;
const PAGE_MS = 1000 / 60;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

/** A script of presses on one button: [from ms, to ms, pressure], half-open; at rest elsewhere. */
type Script = [number, number, number][];
const pressure = (script: Script, ms: number): number => script.find(([a, b]) => ms >= a && ms < b)?.[2] ?? 0;
/** The probe's script: the full press at 500-650 ms, the light one `gap` ms after its release, held 100 ms. */
const probe = (gap: number): Script => [[500, 650, 1], [650 + gap, 750 + gap, 0.2]];

function separatePressurePad(): Pad {
  const p: Pad = { index: 0, id: DS3_ID, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  localStorage.setItem(`${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`,
    JSON.stringify({ ...defaultController(), prone: TRIANGLE, crouch: TRIANGLE, nativePressure: true }));
  setControllerStanceMode('separate');
  return p;
}

/**
 * The page's chain over one pressure Triangle, a poll every `step` ms from `phase` (`./main` `padFrame`): the reader on
 * the game-frame clock, the binds into the frame's input, B193's lanes on a request each press toggles as the walk's.
 * `step` = `FRAME_MS`, `phase` 0: the page polled on the game frames themselves, as the probe's frames read the script
 * (the full press first read on the 500 ms frame, its release on the 667 ms frame, the 50 ms light on the 701 ms one).
 */
function page(script: Script, o: { until?: number; phase?: number; step?: number } = {}) {
  const until = o.until ?? 2500, step = o.step ?? FRAME_MS;
  const p = separatePressurePad();
  const input = new ControllerInput();
  input.waitForRest = false;
  let t = o.phase ?? 0;
  input.pressClock = () => t;
  let intent: Stance = 'stand';
  const calls: string[] = [];
  const l: LaneParts = {
    walk: {
      mode: () => 'walk', isDead: () => false, stance: () => intent, stanceIntent: () => intent, stanceMode: () => controllerStanceMode(),
      jump: () => true,
      crouch: () => { calls.push('crouch'); intent = stanceOnTapOriginal(intent); return true; },
      setStance: (s) => { calls.push(`stance:${s}`); intent = s; return true; },
    },
    firearm: { stepZoom: () => 1, switchFireMode: () => 'auto', viewLanes: () => {}, fire: { reload: () => true } },
    stanceButton: new StanceButton(),
    shoulder: () => {},
  };
  let before: Input = noInput();
  const src = { getGamepads: () => [p] };
  for (; t < until; t += step) {
    const v = pressure(script, t);
    p.buttons[TRIANGLE] = { pressed: v > 0, value: v };
    const i = padInput(input.poll(src));
    if (input.crouch) i.crouch = true;
    if (input.prone) i.prone = true;
    playerLanes(l, before, i, step / 1000, { walking: true, menu: false });
    before = i;
  }
  return { calls, intent: () => intent };
}

describe('MOVE-S6: the stance press re-arms only after an idle game frame (FUN_00594cf0 D:L453332-453333)', () => {
  /** The reader stepped once a game frame (30 Hz) on the probe's script: the presses it takes, by kind. */
  const frames = (gap: number): string[] => {
    const press = new StancePress();
    const out: string[] = [];
    for (let k = 0; k * FRAME_MS < 1500; k++) {
      const got = press.step(pressure(probe(gap), k * FRAME_MS));
      if (got) out.push(got);
    }
    return out;
  };

  it('a light press 50 ms after a full press\'s release is not taken (r0004: +7 goes 3 -> 1, the request stays; 2/2)', () => {
    expect(frames(50)).toEqual(['full']);
  });

  it('100 and 150 ms after the release the light press is taken (r0004: the request 2 -> 1; 3/3 each)', () => {
    expect(frames(100)).toEqual(['full', 'light']);
    expect(frames(150)).toEqual(['full', 'light']);
  });

  it('S6-PROVEN: 67 ms after the release (one idle frame) the light press is taken, at 50 ms not (r0004, 4/4 each)', () => {
    // The one-idle-frame probe (eph-hunt 2026-11-01 probes S6-DELIVERY.md "2026-11-03", `r0004-s6-idle`): the light
    // press at 717-817 ms is taken 4/4 (request 2 -> 1, crouched), at 700-800 ms refused 4/4 (request 2, prone). On
    // the capture's frames the 67 ms rest holds the release frame and one idle frame; a re-arm of 2 would refuse it.
    expect(frames(67)).toEqual(['full', 'light']);
    expect(frames(50)).toEqual(['full']);
    expect(page(probe(67)).calls).toEqual(['stance:prone', 'crouch']);
    expect(page(probe(67)).intent()).toBe('crouch');
    expect(page(probe(50)).intent()).toBe('prone');
  });

  it('the page, polled on the capture frames: the same at 50, 100 and 150 ms', () => {
    expect(page(probe(50)).calls).toEqual(['stance:prone']);
    expect(page(probe(100)).calls).toEqual(['stance:prone', 'crouch']);
    expect(page(probe(150)).calls).toEqual(['stance:prone', 'crouch']);
  });

  it('a 60 Hz page: 100 and 150 ms after the release the light press is taken whatever its phase to the game frame', () => {
    // A rest of 100 ms holds at least two 30 Hz frames, the release frame and an idle one, wherever they fall; a 50 ms
    // rest holds one or two, so its press is taken or not by where the frames fall -- the original's too.
    // Phase 0 is the capture's frames: the 50 ms rest holds the release frame alone, and three 60 Hz polls -- the press
    // is stepped on the game frame (`pressClock`), not on the poll.
    expect(page(probe(50), { until: 1500, step: PAGE_MS }).calls).toEqual(['stance:prone']);
    for (let phase = 0; phase < FRAME_MS; phase += 1) {
      expect(page(probe(100), { until: 1500, phase, step: PAGE_MS }).calls).toEqual(['stance:prone', 'crouch']);
      expect(page(probe(150), { until: 1500, phase, step: PAGE_MS }).calls).toEqual(['stance:prone', 'crouch']);
    }
  });

  it('spam-mixed on ONE pressure Triangle ends standing, as the original (research 80 section 6g, S6)', () => {
    // Full at 500 (released 650), light 700-800, full 1100 (released 1250), light 1300-1400: the original takes the two
    // full presses only (the request 2 at about 500, 0 at about 1096; ac's acceptance at bd96f2044, 3/3).
    const r = page([[500, 650, 1], [700, 800, 0.2], [1100, 1250, 1], [1300, 1400, 0.2]]);
    expect(r.calls).toEqual(['stance:prone', 'stance:stand']);
    expect(r.intent()).toBe('stand');
  });
});
