import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { parseUiLayout } from '@s2u/scene';
import {
  breakLines, cursorAlpha, startTeletype, stepTeletype, teletypeDone, teletypeLines, teletypeSpec, textUnits, wrappedLines, wrappedSpec,
  type TeletypeSpec,
} from '../src/armoryText';

/**
 * The ARMORY's running texts (web sprint 5 S3 part 2; research 95 §2.4, §3.8): the TELETYPE that types WEAPON DATA
 * (`FUN_00377b80`, `FUN_00378c00`) and the WRAPPEDTEXT box of WEAPON TIPS, over the dialog's own numbers.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'OBJECTS', [
      // dlg_equipment_mp.rdr's two, as the disc has them (research 95 §2.4, §2.5).
      obj('NAME', ['WepDescription'], 'TYPE', ['TELETYPE'], 'XPOS', ['380'], 'YPOS', ['298'], 'SPEC', [
        'PULSERATE', ['10'], 'MAXLENGTH', ['230'], 'MAXHEIGHT', ['100'], 'AUTOSCROLL', [], 'CAPTION', [' '], 'SCALE', ['0.9'], 'INTERVAL', ['1330'], 'SPACING', ['19'],
      ]),
      obj('NAME', ['WepInstText'], 'TYPE', ['WRAPPEDTEXT'], 'XPOS', ['25'], 'YPOS', ['310'], 'OPACITY', ['1'], 'SPEC', [
        'WIDTH', ['175'], 'HEIGHT', ['95'], 'SCALE', ['0.9'], 'SPACING', ['19'], 'CAPTION', [' '],
      ]),
      obj('NAME', ['Bare'], 'TYPE', ['TELETYPE'], 'XPOS', ['0'], 'YPOS', ['0'], 'SPEC', ['NOCURSOR', [], 'FADECURSOR', []]),
    ],
  ],
]]);
const tele = layout.objects[0]!, tips = layout.objects[1]!, bare = layout.objects[2]!;
/** Every character 9 px of pen at the dialog's scale. */
const nine = (): number => 9;

describe('the TELETYPE (WepDescription)', () => {
  it('reads the dialog\'s numbers, with the engine\'s defaults for the rest (FUN_00378b00)', () => {
    expect(teletypeSpec(tele)).toEqual({ interval: 1330, maxLength: 230, maxHeight: 100, spacing: 19, pulseRate: 10, scale: 0.9, cursor: true, fadeCursor: false });
    // MAXLENGTH 0 means 100000, PULSERATE 0 means 1, MAXHEIGHT defaults to -1; NOCURSOR clears the cursor.
    expect(teletypeSpec(bare)).toMatchObject({ maxLength: 100000, pulseRate: 1, maxHeight: -1, cursor: false, fadeCursor: true, scale: 1 });
  });

  it('reads \\n and #N as breaks and #P<n> as a pause, as the tick does', () => {
    expect(textUnits('AB#NC\nD#P2 E')).toEqual([{ ch: 'A' }, { ch: 'B' }, { br: true }, { ch: 'C' }, { br: true }, { ch: 'D' }, { pause: 2 }, { ch: 'E' }]);
  });

  it('wraps whole words at MAXLENGTH, measured before the word is typed', () => {
    // 10 px a character: "AAAA BBBB" is 90 px, past 70, so "BBBB" starts a line; "BBBB CC" is 70 and fits.
    const lines = breakLines(textUnits('AAAA BBBB CC'), 70, () => 10).map((l) => l.text);
    expect(lines).toEqual(['AAAA', 'BBBB CC']);
    expect(breakLines(textUnits('AAAA BBBB'), 1000, () => 10).map((l) => l.text)).toEqual(['AAAA BBBB']);
  });

  it('types at INTERVAL x scale px a second -- 1197 at the dialog\'s 0.9 -- a glyph each time the distance passes its advance', () => {
    const spec = teletypeSpec(tele), run = startTeletype('X'.repeat(400));
    stepTeletype(run, spec, 0.1, nine);
    expect(run.shown).toBe(Math.floor((0.1 * 1197) / 9));                     // 119.7 px: 13 glyphs of 9
    for (let i = 0; i < 60; i++) stepTeletype(run, spec, 1 / 60, nine);
    expect(run.shown).toBe(Math.floor((1.1 * 1197 + 1e-6) / 9));
  });

  it('plays the tick on a frame that appends past the first character, never for the guns\' " " (FUN_0036a300)', () => {
    const spec = teletypeSpec(tele), run = startTeletype('ABCDEF');
    expect(stepTeletype(run, spec, 9 / 1197 + 1e-6, nine)).toEqual({ typed: 1, tick: false });   // the first glyph alone: silent
    expect(stepTeletype(run, spec, 1, nine)).toEqual({ typed: 5, tick: true });
    expect(stepTeletype(run, spec, 1, nine)).toEqual({ typed: 0, tick: false });                  // done
    const blank = startTeletype(' ');
    stepTeletype(blank, spec, 1, nine);
    expect(stepTeletype(startTeletype(' '), spec, 1, nine).tick).toBe(false);
    expect(teletypeLines(blank, spec, nine)).toEqual({ lines: [], cursor: null });
  });

  it('holds a #P pause while the cursor pulses, then types on', () => {
    const spec = teletypeSpec(tele), run = startTeletype('A#P1 B');
    stepTeletype(run, spec, 0.1, nine);
    expect([run.shown, run.pause > 0]).toEqual([2, true]);
    stepTeletype(run, spec, 0.5, nine);
    expect(run.shown).toBe(2);
    stepTeletype(run, spec, 0.6, nine);
    stepTeletype(run, spec, 0.1, nine);
    expect(teletypeDone(run)).toBe(true);
  });

  it('the cursor: full while typing, then sin(phase) x 32 + 96 at PULSERATE rad/s; (1 - t) x 128 with FADECURSOR', () => {
    const spec = teletypeSpec(tele), run = startTeletype('AB');
    expect(cursorAlpha(run, spec)).toBe(128);
    stepTeletype(run, spec, 1, nine);                                           // done this tick: the phase from 0
    expect(cursorAlpha(run, spec)).toBeCloseTo(96, 6);
    stepTeletype(run, spec, 0.05, nine);                                        // 0.5 rad
    expect(cursorAlpha(run, spec)).toBeCloseTo(Math.sin(0.5) * 32 + 96, 6);
    const fade: TeletypeSpec = { ...spec, fadeCursor: true, pulseRate: 1 }, f = startTeletype('AB');
    stepTeletype(f, fade, 1, nine);
    stepTeletype(f, fade, 0.25, nine);
    expect(cursorAlpha(f, fade)).toBeCloseTo(96, 6);
  });

  it('shows the typed lines, the newest kept under MAXHEIGHT (the TELETYPE reads no AUTOSCROLL), the cursor at the last line\'s pen', () => {
    const spec = teletypeSpec(tele), run = startTeletype('L1\nL2\nL3\nL4\nL5\nL6\nL7');
    stepTeletype(run, spec, 10, nine);
    expect(teletypeLines(run, spec, nine).lines).toEqual(['L1']);              // a break restarts the distance: the tick's rest is lost
    for (let i = 0; i < 60; i++) stepTeletype(run, spec, 1 / 60, nine);
    const shown = teletypeLines(run, spec, nine);
    expect(shown.lines).toEqual(['L3', 'L4', 'L5', 'L6', 'L7']);               // 5 x 19 = 95 fits 100; 6 would not
    expect(shown.cursor).toMatchObject({ line: 4, pen: 18 });
    const half = startTeletype('ABCD EFGH');
    stepTeletype(half, spec, (5 * 9) / 1197 + 1e-6, nine);
    expect(teletypeLines(half, spec, nine).lines).toEqual(['ABCD ']);
  });
});

describe('the WRAPPEDTEXT (WepInstText)', () => {
  it('wraps its caption to WIDTH and keeps the lines that start inside HEIGHT (WRAPPEDTEXT_CLIP_READING)', () => {
    const spec = wrappedSpec(tips);
    expect(spec).toEqual({ width: 175, height: 95, spacing: 19, scale: 0.9 });
    const words = Array.from({ length: 40 }, (_, i) => `W${i}`).join(' ');
    const lines = wrappedLines(words, spec, nine);
    expect(lines.length).toBe(5);                                               // 95 / 19
    for (const l of lines) expect(l.length * 9).toBeLessThanOrEqual(175);
    expect(wrappedLines(' ', spec, nine)).toEqual([]);
  });
});
