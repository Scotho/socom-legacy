import { describe, expect, it } from 'vitest';
import { codesText, placeWrapped, scrollWrapped, wrapLines } from '../../src/index';
import { textFace } from './fixtures';

// Web research 111 §5: WRAPPEDTEXT's setter FUN_00379f70 (D:L273409-273555), its draw FUN_003794b0
// (D:L273084-273195), the scroll ops FUN_00379b10. Worked by hand: in the fixture face 'A' steps 10, ' ' 6.

const f = textFace();
const spec = { width: 25, scale: 1, color: [128, 128, 128] as const };
const lines = (s: string, w = 25): string[] => wrapLines(f, s, { ...spec, width: w }).map((l) => codesText(l.codes));

describe('FUN_00379f70: the caption into line nodes', () => {
  it('a line takes characters until it reaches WIDTH after a space, then is cut back to that space', () => {
    expect(lines('AA AA AA')).toEqual(['AA', 'AA', 'AA']);
  });
  it('a word wider than WIDTH overflows: the line ends at the first space after it', () => {
    expect(lines('AAAA AA')).toEqual(['AAAA', 'AA']);
  });
  it('a break ends a line and is not kept; spaces and breaks opening a line are skipped', () => {
    expect(lines('A\n\n  A')).toEqual(['A', 'A']);
  });
  it('#Crgb sets the NEXT line\'s colour (signed bytes) and ends this one', () => {
    const l = wrapLines(f, 'A#C\x10\x20\x90A', spec);
    expect(l.map((x) => [codesText(x.codes), x.color])).toEqual([['A', [128, 128, 128]], ['A', [16, 32, -112]]]);
  });
  it('the WIDTH test is <=: a line that reaches WIDTH exactly after a space ends there (D:L273510)', () => {
    // 'AA A' measures 36: at WIDTH 36 the line stops and is cut back to its space; with < it would take ' ' and keep 'AA A'.
    expect(lines('AA A A', 36)).toEqual(['AA', 'A A']);
  });
  it('the line is built a byte at a time: a lone lead byte is measured, and may end the line (FUN_00362e00, FUN_00362b70)', () => {
    // 'A \xC2' measures 10 + 6 + 10 (the lead before the terminator decodes to 0, drawn as 'A'), 26 >= 25: cut back.
    // Read as whole characters, 'A ' + 0x80 (no glyph: the first, ' ', 6) measures 22 and stays one line.
    const l = wrapLines(f, 'A \xC2\x80', spec);
    expect(l.map((x) => [x.bytes, x.codes])).toEqual([[[0x41], [0x41]], [[0xc2, 0x80], [0x80]]]);
  });
  it('#Crgb is counted and read in bytes: a colour byte >= 0xC0 is one signed byte, not a lead', () => {
    const l = wrapLines(f, 'A#C\xC3\x80\x80A', spec);
    expect(l.map((x) => [codesText(x.codes), x.color])).toEqual([['A', [128, 128, 128]], ['A', [-61, -128, -128]]]);
  });
  it('#B stays in the line\'s text and the next line starts in the state it left', () => {
    const l = wrapLines(f, 'A#BA\nA', { ...spec, width: 100 });
    expect(l.map((x) => [codesText(x.codes), x.bold])).toEqual([['A#BA', false], ['A', true]]);
  });
});

describe('FUN_003794b0: where the lines stand', () => {
  const box = { width: 175, spacing: 19, height: 95, autoScroll: false, displayOneLine: false };
  it('line k at (x, int(y + k x SPACING - 3)); the scissor from (x, -4 + y - SPACING) to (x + WIDTH, -4 + y + HEIGHT - SPACING)', () => {
    const p = placeWrapped(box, 380, 300, [20, 20, 20]);
    expect(p.lines.map((l) => [l.x, l.y, l.drawn])).toEqual([[380, 297, true], [380, 316, true], [380, 335, true]]);
    expect(p.clip).toEqual({ x0: 380, y0: 277, x1: 555, y1: 372 });
    expect([p.rows, p.upArrow, p.downArrow]).toEqual([3, false, false]);
  });
  it('the scroll lifts the lines; AUTOSCROLL holds the last rows in view once they overflow HEIGHT', () => {
    expect(placeWrapped(box, 380, 300, [20], 19, 7).lines[0]!.y).toBe(278);
    expect(placeWrapped({ ...box, autoScroll: true }, 380, 300, [20], 0, 7).lines[0]!.y).toBe(259);
  });
  it('a line outside (0, 448) is not drawn; with no HEIGHT there is no scissor', () => {
    const p = placeWrapped({ ...box, height: 0 }, 10, 440, [5, 5]);
    expect(p.clip).toBeNull();
    expect(p.lines.map((l) => l.drawn)).toEqual([true, false]);
  });
  it('DISPLAY_ONE_LINE keeps every line on the first row, each after the last one\'s width', () => {
    const p = placeWrapped({ ...box, displayOneLine: true }, 100, 300, [20, 30, 10]);
    expect(p.lines.map((l) => [l.x, l.y])).toEqual([[100, 297], [120, 297], [150, 297]]);
  });
  it('the arrows: up while scrolled, down while rows x SPACING - HEIGHT is ahead (ARROW_VISIBILITY_READING)', () => {
    const p = placeWrapped(box, 380, 300, [1, 1, 1, 1, 1, 1, 1], 19, 7);
    expect([p.upArrow, p.downArrow]).toEqual([true, true]);
  });
});

describe('FUN_00379b10: Scroll_Down / Scroll_Up', () => {
  it('step one pitch while there is more below, or while above 0', () => {
    const s = { spacing: 19, height: 95 };
    expect([scrollWrapped(s, 0, 7, 'Scroll_Down'), scrollWrapped(s, 19, 7, 'Scroll_Down'), scrollWrapped(s, 38, 7, 'Scroll_Down')]).toEqual([19, 38, 38]);
    expect([scrollWrapped(s, 19, 7, 'Scroll_Up'), scrollWrapped(s, 0, 7, 'Scroll_Up')]).toEqual([0, 0]);
  });
});
