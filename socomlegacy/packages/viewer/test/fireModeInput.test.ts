import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OptionGlobals, ValveStore, VALVE_TYPE } from '@s2u/ui';
import { describe, expect, it } from 'vitest';
import {
  FIRE_MODE_DOUBLE_TAP_S_READING, FIRE_MODE_HOLD_REPEAT_S_READING, FireModeInput, fireModeInputFor, fireModeSetting,
  SampledButton, type FireModeSetting,
} from '../src/fireModeInput';
import { playOptionsOf } from '../src/originalOptions';
import { noInput } from '../src/gamepad';
import { applyPadExtras, PadExtrasState, parsePadExtras } from '../src/padExtras';

/**
 * PAR-22 (web research 254; research 230 §4, reading, pending review): the fire-mode button as the original reads it.
 * The sampled states (`FUN_002d9ff0` D:L179137-179169), the tap marker (D:L179172-179184; taken by `FUN_002da1c0`
 * D:L179222-179227), the DEFAULT consumer (`FUN_00594b70` D:L452972-452993), the ALTERNATE first press
 * (`FUN_00594cf0` D:L453465-453472) and the saved setting (`DAT_0044d500`, D:L125173-125183).
 */

/** The source-model frame of research 230 §4.2: 525 lines at 15734 Hz (33.367 ms). */
const DT = 525 / 15734;

/** The frames a sequence of the button's down/up switches on, the consumer running every frame. */
function switches(seq: readonly boolean[], setting: FireModeSetting = 'default', dt = DT): number[] {
  const f = new FireModeInput();
  const out: number[] = [];
  seq.forEach((down, i) => { if (f.step(down, dt, { setting, consumer: true })) out.push(i); });
  return out;
}
const f32bits = (x: number): number => { const v = new DataView(new ArrayBuffer(4)); v.setFloat32(0, x, true); return v.getUint32(0, true); };
const held = (n: number): boolean[] => Array<boolean>(n).fill(true);
const SINGLE = [true, false, false];
const DOUBLE = [true, false, false, true, false];
const HELD_31 = held(31);

describe('PAR-22: the sampled button (FUN_002d9ff0)', () => {
  it('a press reads 1 its first frame, 2 while held, 3 its first frame up, then 0; a press the frame after a release is 1 again', () => {
    const b = new SampledButton();
    const states = [true, true, true, false, false, true, false, true].map((down) => { b.sample(down, DT); return b.state; });
    expect(states).toEqual([1, 2, 2, 3, 0, 1, 3, 1]);
  });

  it('the tap marker: .25 s at a first press, less each later frame\'s time, -1 once spent; a first press while it is live is the double tap (-2), taken once (FUN_002da1c0: -3)', () => {
    const b = new SampledButton();
    b.sample(true, DT);
    expect(b.marker).toBe(FIRE_MODE_DOUBLE_TAP_S_READING);
    b.sample(false, DT);
    expect(b.marker).toBe(Math.fround(Math.fround(0.25) - Math.fround(DT)));
    b.sample(true, DT);
    expect(b.marker).toBe(-2);
    expect(b.takeDoubleTap()).toBe(true);
    expect(b.marker).toBe(-3);
    expect(b.takeDoubleTap()).toBe(false);
    const late = new SampledButton();
    late.sample(true, DT);
    for (let i = 0; i < 8; i++) late.sample(false, DT);
    expect(late.marker).toBe(-1);
    late.sample(true, DT);                              // a press after the window opens a new one
    expect(late.marker).toBe(FIRE_MODE_DOUBLE_TAP_S_READING);
    expect(late.takeDoubleTap()).toBe(false);
  });

  it('the readings are the original\'s floats: .25 the literal 0x3e800000, .4 the ELF\'s word at 0x650670 (0x3ecccccd, .4000000059604645)', () => {
    expect(f32bits(FIRE_MODE_DOUBLE_TAP_S_READING)).toBe(0x3e800000);
    expect(f32bits(FIRE_MODE_HOLD_REPEAT_S_READING)).toBe(0x3ecccccd);
    expect(FIRE_MODE_HOLD_REPEAT_S_READING).toBe(0.4000000059604645);
    expect(FIRE_MODE_HOLD_REPEAT_S_READING).toBe(Math.fround(0.4));
  });
});

describe('PAR-22: DEFAULT (FUN_00594b70) -- research 230 §4.2\'s source-model sequences at dt = 525/15734', () => {
  it('single tap: no switch (the port\'s edge switched once)', () => {
    expect(switches(SINGLE)).toEqual([]);
  });
  it('double tap, the second press three frames after the first: one switch, at the second press (the port\'s edge switched twice)', () => {
    expect(switches(DOUBLE)).toEqual([3]);
  });
  it('held for 31 original ticks: two switches, at frames 12 and 24 -- the held time past .4 s, reset at each switch (the port\'s edge switched once, at frame 0)', () => {
    expect(switches(HELD_31)).toEqual([12, 24]);
  });
  it('the double tap\'s window: a second press 8 frames after the first switches, 9 frames after does not (.25 s less 7 frames is live, less 8 spent)', () => {
    const tapAfter = (n: number): boolean[] => [true, ...Array<boolean>(n - 1).fill(false), true, false];
    expect(switches(tapAfter(8))).toEqual([8]);
    expect(switches(tapAfter(9))).toEqual([]);
  });
  it('the held time counts the frame\'s own seconds: at 0.03 s frames a 30-frame hold switches at frames 14 and 28', () => {
    expect(switches(held(30), 'default', 0.03)).toEqual([14, 28]);
  });
  it('a double tap held on: the tap switches at the second press, then the hold repeats .4 s later (12 frames)', () => {
    expect(switches([true, false, ...held(14)])).toEqual([2, 14]);
  });
});

describe('PAR-22: ALTERNATE and the saved setting (FUN_00594cf0 D:L453465-453472; FUN_00592050; DAT_0044d500)', () => {
  it('ALTERNATE keeps the first press: the same three sequences switch at every first press -- once, twice, once at frame 0', () => {
    expect(switches(SINGLE, 'alternate')).toEqual([0]);
    expect(switches(DOUBLE, 'alternate')).toEqual([0, 3]);
    expect(switches(HELD_31, 'alternate')).toEqual([0]);
  });
  it('the setting is DEFAULT at zero (the global never stored: the original\'s .bss zero) and ALTERNATE at FIREMODESWAP_CONTROLLER 1, read off the options StoreOptions left', () => {
    expect(fireModeSetting(playOptionsOf(null))).toBe('default');
    expect(fireModeSetting(null)).toBe('default');
    const g = new OptionGlobals(), v = new ValveStore();
    v.set('FIREMODESWAP_CONTROLLER', 1, VALVE_TYPE.PERSIST);
    g.store(v);
    expect(fireModeSetting(playOptionsOf(g))).toBe('alternate');
    v.set('FIREMODESWAP_CONTROLLER', 0, VALVE_TYPE.PERSIST);
    g.store(v);
    expect(fireModeSetting(playOptionsOf(g))).toBe('default');
  });
  it('the menu match reads the session\'s options where the setting lives (frontEnd.ts playOptionsOf(session_?.options), matchMount.ts o.options)', () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
    expect(src('frontEnd.ts')).toMatch(/const options = \(\) => playOptionsOf\(session_\?\.options, session_\?\.uiVars \?\? null\);/);   // OT.R72: and the stick tuners
    // Since PAR-36 (a) the read is the shared options part's (`./matchOptions`): the page hands it `o.options`, and it
    // reads that source each frame, else the original's defaults.
    expect(src('matchMount.ts')).toMatch(/const playOptions = matchOptions\(o\.options\);/);
    expect(src('matchOptions.ts')).toMatch(/const current = \(\): PlayOptions => source\?\.\(\) \?\? playOptionsOf\(null\);/);
  });
});

describe("PAR-22: the flush at a game state's start (FUN_002dba60 D:L179891-179936; research 116 R116.13)", () => {
  /** A page's frames: `lanes` runs the lanes (`step`), `hold` is the loading hold (the page flushes, the lanes do not run). */
  function run(frames: readonly ({ down: boolean; hold?: boolean })[], setting: FireModeSetting): number[] {
    const f = new FireModeInput();
    const out: number[] = [];
    frames.forEach((fr, i) => {
      if (fr.hold) { f.flush(fr.down); return; }
      if (f.step(fr.down, DT, { setting, consumer: true })) out.push(i);
    });
    return out;
  }
  const up = { down: false }, down = { down: true }, heldUp = { down: false, hold: true }, heldDown = { down: true, hold: true };

  it("ALTERNATE: a button pressed under the loading hold and held through its release is held, not a first press -- no switch at the release (the lane's flushed edge agrees)", () => {
    expect(run([up, up, heldUp, heldDown, heldDown, down, down, up, down], 'alternate')).toEqual([8]);
  });
  it("the menu match's first frame (its flush, then the lanes the same frame) with the button held: no switch", () => {
    const f = new FireModeInput();
    f.flush(true);
    expect(f.step(true, DT, { setting: 'alternate', consumer: true })).toBe(false);
    expect(f.button.state).toBe(2);
  });
  it('DEFAULT: a press before the hold and one after it are no double tap -- the flush sets every tap marker to -3', () => {
    expect(run([down, up, heldUp, heldUp, down, up], 'default')).toEqual([]);
    const f = new FireModeInput();
    f.step(true, DT, { setting: 'default', consumer: true });
    f.flush(false);
    expect(f.button.marker).toBe(-3);
    expect(f.button.state).toBe(0);
  });
});

describe('PAR-22: eligibility -- what consumes the tap', () => {
  it('the consumer not run (the player update\'s gate shut: off the walk, a menu over the game) takes nothing: a double tap\'s marker waits and switches the first frame the gate opens', () => {
    const f = new FireModeInput();
    const seq = [true, false, false, true, false, false];
    const gate = [true, true, true, false, false, true];
    const out: number[] = [];
    seq.forEach((down, i) => { if (f.step(down, DT, { setting: 'default', consumer: gate[i]! })) out.push(i); });
    expect(out).toEqual([5]);
  });
  it('a held time is kept, neither counted nor reset, while the consumer does not run', () => {
    const f = new FireModeInput();
    const out: number[] = [];
    for (let i = 0; i < 40; i++) if (f.step(true, DT, { setting: 'default', consumer: i < 6 || i >= 20 })) out.push(i);
    expect(out).toEqual([26, 38]);                      // 5 frames counted before the gate shut (1-5), 7 more after (20-26); then 12
  });
  it('a switch the weapon itself refuses (FUN_005c4600\'s own tests, after the take) still consumes the tap and resets the held time', () => {
    const f = new FireModeInput();
    let asked = 0, modes = 0;
    const refuse = (): void => { asked++; };            // the weapon's refusal: nothing changes
    const accept = (): void => { asked++; modes++; };
    const seq = [true, false, true, false, false, false, ...held(25)];
    const at: number[] = [];
    seq.forEach((down, i) => { if (f.step(down, DT, { setting: 'default', consumer: true })) { at.push(i); (i === 30 ? accept : refuse)(); } });
    expect(at).toEqual([2, 18, 30]);                    // the refused tap at 2 not asked again; the refused hold at 18 counted afresh
    expect(asked).toBe(3);
    expect(modes).toBe(1);
  });
  it('one helper a set of lanes: fireModeInputFor keeps a page\'s button and its marker apart from another\'s', () => {
    const a = {}, b = {};
    expect(fireModeInputFor(a)).toBe(fireModeInputFor(a));
    expect(fireModeInputFor(a)).not.toBe(fireModeInputFor(b));
  });
});

describe('h59U9CLb (a browser adaptation, not wired): an extra bound to the fire mode feeds this one button, never a second detector', () => {
  // `../src/padExtras`: the added action ORed into `fireMode` before `FireModeInput.step`. L3 the game's own (research 84
  // §6), a back paddle (18) bound to the fire mode as a double bind.
  const PADDLE = 18;
  const extras = parsePadExtras({ version: 1, doubles: [{ button: PADDLE, action: 'fireMode' }] }, { overlayButton: 16, heldBinds: [] }).extras;
  /** The frames each switches on, the combined lane stepped every frame. */
  function combined(frames: readonly { l3: boolean; paddle: boolean }[]): number[] {
    const f = new FireModeInput(), state = new PadExtrasState();
    const out: number[] = [];
    frames.forEach(({ l3, paddle }, i) => {
      const pressed = Array<boolean>(20).fill(false);
      pressed[10] = l3; pressed[PADDLE] = paddle;
      const input = applyPadExtras(extras, { ...noInput(), fireMode: l3 }, pressed, state, false);
      if (f.step(input.fireMode, DT, { setting: 'default', consumer: true })) out.push(i);
    });
    return out;
  }
  it('the extra and L3 held together still switch at the .4 s hold, frames 12 and 24 as one button held', () => {
    expect(combined(HELD_31.map(() => ({ l3: true, paddle: true })))).toEqual([12, 24]);
    // The paddle pressed again under a held L3 is no new press: still the hold's.
    expect(combined(HELD_31.map((_, i) => ({ l3: true, paddle: i >= 5 && i !== 8 })))).toEqual([12, 24]);
  });
  it('L3 tapped, then the paddle inside .25 s: one double tap -- one button tapped twice, never two switches', () => {
    expect(combined([{ l3: true, paddle: false }, { l3: false, paddle: false }, { l3: false, paddle: false }, { l3: false, paddle: true }, { l3: false, paddle: false }])).toEqual([3]);
    expect(combined([{ l3: true, paddle: false }, { l3: true, paddle: true }, { l3: false, paddle: true }, { l3: false, paddle: false }])).toEqual([]);
  });
});
