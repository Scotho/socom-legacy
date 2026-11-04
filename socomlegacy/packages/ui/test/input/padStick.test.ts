import { describe, expect, it } from 'vitest';
import { DIALOG_BUTTONS } from '../../src/dialog';
import { PAD, STICK } from '../../src/widgets/pad';
import {
  MenuPad, MenuStick, PAD2_ID_BY_SLOT, PAD2_NAMES, PAD_SLOTS, STICK_FIRE, STICK_REARM, nextPadState, type PadSlotName,
} from '../../src/input/index';

// Web research 116 §1 and §7, transcribed: the pad reader's state machine `FUN_002d9ff0` (D:L179128-179186), the slot
// order (D:L179819-179862), the flush `FUN_002dba60` (D:L179891-179936), and the stick's arming and direction in
// `FUN_00368650` (D:L263829-263849) and `FUN_0036a060` (D:L264743-264799). Expected values worked from those lines.

const snap = (down: PadSlotName[] = [], stickX = 0, stickY = 0) => ({ down: new Set(down), stickX, stickY });

describe('the pad reader (FUN_002d9ff0, R116.1)', () => {
  it('every transition of the state byte, pressed and released', () => {
    // [state, down] -> next: 0 up, 1 pressed this frame, 2 held, 3 released this frame; 7 stands for "anything else".
    const rows: [number, boolean, number][] = [
      [0, true, 1], [1, true, 2], [2, true, 2], [3, true, 1], [7, true, 2],
      [0, false, 0], [1, false, 3], [2, false, 3], [3, false, 0], [7, false, 0],
    ];
    for (const [s, d, n] of rows) expect([s, d, nextPadState(s, d)]).toEqual([s, d, n]);
  });

  it('a held button is 1 for exactly one read, then 2; let go, 3 for one read, then 0', () => {
    const p = new MenuPad();
    const seen: number[] = [];
    for (const down of [true, true, true, false, false, true]) { p.read(snap(down ? ['DOWN'] : [])); seen.push(p.state('DOWN')); }
    expect(seen).toEqual([1, 2, 2, 3, 0, 1]);
  });

  it("the slot order is GetButton's codes, and libpad2's ids per slot name the same buttons (the cross-check of §1.2)", () => {
    for (const [word, code] of Object.entries(DIALOG_BUTTONS)) expect(PAD_SLOTS[code]).toBe(word);
    expect(PAD_SLOTS.slice(14)).toEqual(['R3', 'L3']);                   // no binding word names them
    expect(PAD2_ID_BY_SLOT.map((id) => PAD2_NAMES[id])).toEqual([...PAD_SLOTS]);
  });

  it('the record a control reads: the 14 bindable bytes by code, the stick answer beside them', () => {
    const p = new MenuPad();
    p.read(snap(['CROSS', 'L3']));
    const r = p.record(STICK.UP);
    expect(r.bytes).toHaveLength(14);
    expect(r.bytes[9]).toBe(PAD.FALLING);
    expect(r.stick).toBe(STICK.UP);
  });

  it("the flush at the menu state's init (R116.13): a button held through it is never seen pressed", () => {
    const p = new MenuPad();
    p.read(snap(['CROSS']));
    p.read(snap(['CROSS']));
    expect(p.state('CROSS')).toBe(PAD.DOWN);
    p.flush(snap(['CROSS']));                                            // zeroed, then one read: 1
    expect(p.state('CROSS')).toBe(PAD.FALLING);
    p.read(snap(['CROSS']));                                             // the state's first frame: 2, not a press
    expect(p.state('CROSS')).toBe(PAD.DOWN);
    p.flush(snap([]));
    expect(p.states.every((s) => s === PAD.UP)).toBe(true);
  });
});

describe('the stick in menus (R116.10, §7)', () => {
  it('the thresholds are the float literals 0.6 and 0.2', () => {
    expect([STICK_FIRE, STICK_REARM]).toEqual([Math.fround(0.6), Math.fround(0.2)]);
  });

  it('a flick fires once on the dispatch it passes 0.6, then not while held, and again only after coming back within 0.2', () => {
    const s = new MenuStick();
    const seq: [number, number][] = [[0, 0], [0, -0.5], [0, -0.7], [0, -1], [0, -0.3], [0, -0.7], [0, -0.1], [0, 0], [0, -0.9]];
    const got = seq.map(([x, y]) => { s.arm(x, y); return s.direction(); });
    // centred and armed: 0; within 0.6: 0; past 0.6 from an armed last: DOWN; held: the flag cleared, 0; back to 0.3:
    // still disarmed (the last was beyond 0.2), 0; pushed again: 0; within 0.2, still disarmed: CENTRED (5); centred
    // with the last within 0.2: armed, 0; then DOWN.
    expect(got).toEqual([0, 0, STICK.DOWN, 0, 0, 0, STICK.CENTRED, 0, STICK.DOWN]);
  });

  it('the four directions in the game signs (x positive left, y positive up), and the diagonal ties: down-right is DOWN', () => {
    const at = (x: number, y: number): number => { const s = new MenuStick(); s.arm(x, y); return s.direction(); };
    expect([at(0, 1), at(0, -1), at(1, 0), at(-1, 0)]).toEqual([STICK.UP, STICK.DOWN, STICK.LEFT, STICK.RIGHT]);
    expect(at(0.8, 0.8)).toBe(STICK.LEFT);                               // up-left: x == y > 0
    expect(at(-0.8, 0.8)).toBe(STICK.UP);                                // up-right: x == -y < 0
    expect(at(0.8, -0.8)).toBe(STICK.LEFT);                              // down-left: x == -y > 0
    expect(at(-0.8, -0.8)).toBe(STICK.DOWN);                             // down-right: x == y < 0
  });

  it('the flag starts set (DAT_003e0368 is 1 in the ELF): the first dispatch past 0.6 fires', () => {
    const s = new MenuStick();
    expect(s.armed).toBe(true);
    s.arm(0, 0.61);
    expect(s.direction()).toBe(STICK.UP);
  });
});
