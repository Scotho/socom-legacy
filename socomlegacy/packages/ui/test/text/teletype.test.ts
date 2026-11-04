import { describe, expect, it } from 'vitest';
import { codesText, engineCodes, newTeletype, ON_TTY_DONE, setTeletypeText, teletypeDraw, teletypeOp, tickTeletype, type TeletypeSpec } from '../../src/index';
import { textFace } from './fixtures';

// Web research 111 §6: the TELETYPE's tick FUN_00377b80 (D:L272245-272532), ops FUN_00378600 (D:L272608-272656), draw
// FUN_00378c00 (D:L272797-272889). Traced by hand: in the fixture face 'A' steps 10, ' ' 6, at SCALE 1.

const f = textFace();
const spec: TeletypeSpec = { interval: 100, maxLength: 0, maxHeight: 100, spacing: 19, pulseRate: 10, noCursor: false, fadeCursor: false, scale: 1 };
const start = (s: string) => { const t = newTeletype(); setTeletypeText(t, engineCodes(s)); return t; };

describe('FUN_00377b80: typing', () => {
  it('the distance grows by dt x INTERVAL x SCALE; a character is appended while the typed width is under it', () => {
    const t = start('AA');
    // dt 0.05: distance 5 > typed 0 -> 'A'; the re-tick with dt 0 finds 10 >= 5.
    expect(tickTeletype(t, f, spec, 0.05)).toEqual({ appended: 1, sound: false, events: [] });
    expect(t.distance).toBeCloseTo(5, 5);
    // dt 0.1: distance 15 > 10 -> the second 'A', with the type sound (not the first character), and ON_TTY_DONE.
    expect(tickTeletype(t, f, spec, 0.1)).toEqual({ appended: 1, sound: true, events: [ON_TTY_DONE] });
    expect(codesText(t.typed)).toBe('AA');
    // All typed: the cursor pulses, sin(phase) x 32 + 96 (the re-tick ran with dt 0: phase 0).
    expect(t.cursorAlpha).toBe(96);
  });

  it('a word that would carry the line past MAXLENGTH starts a new line; the line keeps its space', () => {
    const t = start('AA AA');
    expect(tickTeletype(t, f, { ...spec, maxLength: 25 }, 10).events).toEqual([ON_TTY_DONE]);
    expect(codesText(t.typed)).toBe('AA \nAA');
  });

  it('\\n and #N break the line (the distance restarts at 0.01); #P<n> pauses n seconds', () => {
    const t = start('A#NA');
    tickTeletype(t, f, spec, 10);
    expect(codesText(t.typed)).toBe('A\n');
    expect(t.distance).toBeCloseTo(0.01, 6);
    const p = start('A#P1.5 A');
    tickTeletype(p, f, spec, 10);
    expect(codesText(p.typed)).toBe('A');
    expect(p.pause).toBe(1.5);
    tickTeletype(p, f, spec, 1);
    expect(codesText(p.typed)).toBe('A');
    expect(p.pause).toBeCloseTo(0.5, 6);
    expect(p.cursorAlpha).toBeCloseTo(Math.sin(10) * 32 + 96, 3);   // the phase at PULSERATE 10 rad/s
  });

  it('an empty caption zeroes only the length and the index: the next tick dumps the held caption at once (D:L272281-272309)', () => {
    const t = start('AB');
    teletypeOp(t, f, spec, 'finish');
    setTeletypeText(t, []);
    expect(t.typed).toEqual([]);
    // FUN_00378a10 leaves +0xc0 'AB' in place with +0xd0 = +0xd4 = 0; FUN_00377b80 finds index >= length and a
    // non-NUL byte at the index, so it appends every byte to the NUL in one tick, then the type sound (index > 0).
    expect(tickTeletype(t, f, spec, 0.01)).toEqual({ appended: 2, sound: true, events: [] });
    expect(codesText(t.typed)).toBe('AB');
    // Nothing is left past the index: the next tick appends nothing; the sound follows DAT_003e03a8, not dt.
    expect(tickTeletype(t, f, spec, 0.01)).toEqual({ appended: 0, sound: false, events: [] });
    const u = start('AB');
    teletypeOp(u, f, spec, 'finish');
    setTeletypeText(u, []);
    expect(tickTeletype(u, f, spec, 0, false)).toEqual({ appended: 2, sound: false, events: [] });
    expect(teletypeOp(u, f, spec, 'finish').events).toEqual([]);   // index 2 >= length 0: finish has nothing to type
  });

  it('FADECURSOR: once typed, the cursor fades as (1 - phase) x 128 and holds at 0', () => {
    const t = start('A');
    tickTeletype(t, f, { ...spec, fadeCursor: true }, 10);
    tickTeletype(t, f, { ...spec, fadeCursor: true }, 0.05);
    expect(t.cursorAlpha).toBeCloseTo((1 - 0.5) * 128, 3);
    tickTeletype(t, f, { ...spec, fadeCursor: true }, 1);
    expect(t.cursorAlpha).toBe(0);
  });
});

describe('FUN_00378600: the ops', () => {
  it('finish types everything with the sound off; Continue ends a pause', () => {
    const t = start('A#P9 AAA');
    const r = teletypeOp(t, f, spec, 'finish');
    expect(codesText(t.typed)).toBe('AAAA');
    expect(r.events).toEqual([ON_TTY_DONE]);
    const p = start('A#P9 A');
    tickTeletype(p, f, spec, 10);
    expect(teletypeOp(p, f, spec, 'Continue').result).toBe(true);
    expect(p.pause).toBe(0);
  });
  it('scroll_up adds one while (breaks - scroll) x SPACING passes MAXHEIGHT; scroll_down takes one off', () => {
    const t = start('A\nA\nA');
    teletypeOp(t, f, spec, 'finish');
    teletypeOp(t, f, { ...spec, maxHeight: 20 }, 'scroll_up');
    expect(t.scroll).toBe(1);
    teletypeOp(t, f, { ...spec, maxHeight: 20 }, 'scroll_up');
    expect(t.scroll).toBe(1);   // (2 - 1) x 19 <= 20
    teletypeOp(t, f, spec, 'scroll_down');
    expect(t.scroll).toBe(0);
  });
});

describe('FUN_00378c00: what draws', () => {
  it('whole lines are skipped from the top while the breaks x SPACING pass MAXHEIGHT; the cursor on the last line', () => {
    const t = start('A\nA\nA');
    teletypeOp(t, f, spec, 'finish');
    const d = teletypeDraw(t, f, { ...spec, maxHeight: 20 }, { x: 380, y: 300 }, 390);
    expect(codesText(d.codes)).toBe('A\nA');
    // Row 1 of the shown text: from -5 + 300 + 19 + 1 = 315 up to 314 - 15; x from 390 + 2 for 8.
    expect(d.cursor).toEqual({ x0: 392, x1: 400, y0: 315, y1: 299, alpha: t.cursorAlpha });
    expect(d.clip).toBeNull();
  });
  it('no cursor with NOCURSOR or when the text opens on a space', () => {
    const t = start(' ');
    teletypeOp(t, f, spec, 'finish');
    expect(teletypeDraw(t, f, spec, { x: 0, y: 0 }).cursor).toBeNull();
    const u = start('A');
    teletypeOp(u, f, spec, 'finish');
    expect(teletypeDraw(u, f, { ...spec, noCursor: true }, { x: 0, y: 0 }).cursor).toBeNull();
  });
});
