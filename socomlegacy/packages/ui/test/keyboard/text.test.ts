import { describe, expect, it } from 'vitest';
import {
  skbBlank, skbByteLength, skbTakeEdit, SKB_TAKE_EDIT_READING, skbGridCase, skbRaise, skbUtf8Bytes, skbWithinCaps, skbWrap, SKB_BLANK_READING, SKB_FIT_READING,
} from '../../src/keyboard';

const cps = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);

describe('the text rules (web research 119 §6, §7.2)', () => {
  it('UTF-8 as FUN_0039fd80 encodes: 1 byte below 0x80, 2 below 0x800, else 3', () => {
    expect([0x41, 0x7f, 0x80, 0xc4, 0x7ff, 0x800, 8364, 0xffff].map(skbUtf8Bytes)).toEqual([1, 1, 2, 2, 2, 3, 3, 3]);
    expect(skbByteLength(cps('aÄ€'))).toBe(6);
  });

  it('the caps (FUN_00396d40): bytes <= MaxBytes and characters <= MaxChars, each only when > 0', () => {
    expect(skbWithinCaps(cps('abcdefghijklmn'), 31, 14)).toBe(true);
    expect(skbWithinCaps(cps('abcdefghijklmno'), 31, 14)).toBe(false);
    expect(skbWithinCaps(cps('€'.repeat(11)), 31, 14)).toBe(false);   // 33 bytes
    expect(skbWithinCaps(cps('x'.repeat(500)), 0, 0)).toBe(true);
  });

  it('the case rule: the grid lowers A-Z, À-Þ but ×, Š, Ÿ (FUN_0038d200); a raise restores them (FUN_0039a8d0)', () => {
    expect(cps('AZÀÞ×ß1').map(skbGridCase)).toEqual(cps('azàþ×ß1'));
    expect(skbGridCase(0x160)).toBe(0x161);
    expect(skbGridCase(0x178)).toBe(0xff);
    expect(cps('azàþ÷ß1').map((c) => skbRaise(c, true))).toEqual(cps('AZÀÞ÷ß1'));
    expect(skbRaise(0x161, true)).toBe(0x160);
    expect(skbRaise(0xff, true)).toBe(0x178);
    expect(skbRaise(0x61, false)).toBe(0x61);
  });

  it('blank: nothing, or spaces only (r0004 SkbTypedTextNotBlank; r0001 FUN_003996b0 superseded)', () => {
    expect(skbBlank([])).toBe(true);
    expect(skbBlank(cps('   '))).toBe(true);
    expect(skbBlank(cps(' a '))).toBe(false);
    expect(SKB_BLANK_READING).toMatch(/0x20 only/);
  });

  it('blank in r0004: the space only (SkbTypedTextNotBlank, D4:L315305-315317; L357) -- a tab, LF, VT, FF or CR is text', () => {
    expect(skbBlank([0x09])).toBe(false);
    expect(skbBlank([0x0a])).toBe(false);
    expect(skbBlank([0x0d])).toBe(false);
    expect([0x0b, 0x0c].map((c) => skbBlank([c]))).toEqual([false, false]);
    expect(skbBlank(cps(' 	 '))).toBe(false);
    expect(skbBlank(cps('    '))).toBe(true);
    // No table read in r0004: a code past U+00FF (research 184 4.1's U+0160, U+0178) is not a space.
    expect([0x160, 0x178, 0x20ac].map((c) => skbBlank([c]))).toEqual([false, false, false]);
  });

  it('the take-text edit (SkbTakeText, D4:L315622-315648, D4:L315676-315702; L358): every $~ becomes $-', () => {
    expect(skbTakeEdit('a$~b')).toBe('a$-b');
    expect(skbTakeEdit('$~$~')).toBe('$-$-');
    expect(skbTakeEdit('$$~~')).toBe('$$-~');
    expect(skbTakeEdit('~$ a$')).toBe('~$ a$');
    expect(SKB_TAKE_EDIT_READING).toMatch(/\$~/);
  });

  it('the fit (SKB_FIT_READING): lines broken after a run of spaces, at most the layout\'s lines; no measure, one line', () => {
    const w = (c: readonly number[]): number => c.length * 10;
    expect(skbWrap(cps('abc def'), 50, 2, w)).toEqual([cps('abc '), cps('def')]);
    expect(skbWrap(cps('abc def ghi'), 50, 2, w)).toBeNull();
    expect(skbWrap(cps('abcdefgh'), 50, 2, w)).toBeNull();
    expect(skbWrap(cps('abcdefgh'), 50, 1, null)).toEqual([cps('abcdefgh')]);
    expect(SKB_FIT_READING).toMatch(/after a run of spaces/);
  });
});
