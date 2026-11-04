import { describe, expect, it } from 'vitest';
import {
  SKB_EMPTY_KEY, SKB_FN, SKB_FN_NAMES, SKB_KEY_TYPE, decodeTextInput, findSoftKeyboard, readSoftKeyboards, skbCell,
  SKB_CELL_TOKEN_READING, SKB_PIECE_ATLAS_READING,
} from '../../src/keyboard';
import { textInputBlock, uiParams } from './fixtures';

/**
 * PLAT-17's reader of `UiParams.rdr` and of `GetTextInput`'s argument block (web research 119 §1, §2, §4), on a
 * synthetic file in the disc's shape (`./fixtures`). The 12 layouts of the real file: `paramsDisc.test.ts`.
 */

describe('a grid cell (FUN_0038da70 D:L284100-284165)', () => {
  it('one character is that character; Quote1 Quote2 ParenL ParenR Space their characters, any case', () => {
    expect(skbCell('Q')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0x51 });
    expect(skbCell('Ä')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0xc4 });
    expect(skbCell('1')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0x31 });
    expect(['Quote1', 'Quote2', 'ParenL', 'ParenR', 'Space'].map((t) => skbCell(t).value)).toEqual([0x27, 0x22, 0x28, 0x29, 0x20]);
    expect(skbCell('space')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0x20 });
  });

  it('the 14 function names are keys 0-13; Switch<n> a switch; an integer token a code point; any other word the empty key', () => {
    expect(SKB_FN_NAMES).toEqual(['CapsLock', 'Recip', 'BackSpace', 'Clear', 'Enter', 'Exit', 'Apply', 'Shift', 'Legend',
      'Dakuten', 'Handakuten', 'WideNarrow', 'MsgPlayer', 'Action2']);
    SKB_FN_NAMES.forEach((n, i) => expect(skbCell(n)).toEqual({ type: SKB_KEY_TYPE.FN, value: i }));
    expect(skbCell('BACKSPACE')).toEqual({ type: SKB_KEY_TYPE.FN, value: SKB_FN.BackSpace });
    expect(skbCell('Switch1')).toEqual({ type: SKB_KEY_TYPE.SWITCH, value: 1 });
    expect(skbCell('34')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0x22 });
    expect(skbCell('8364')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 8364 });
    expect(skbCell('null')).toEqual(SKB_EMPTY_KEY);
    expect(SKB_CELL_TOKEN_READING).toMatch(/two or more digits/);
  });
});

describe('readSoftKeyboards (FUN_00397070, FUN_003963f0, FUN_0038e160)', () => {
  const p = readSoftKeyboards(uiParams());

  it('CommonSoftKeyboardProps: the repeat, the six sounds by slot, the legend', () => {
    expect(p.common).toMatchObject({ repeatDelay: 0.25, repeatSpeedStart: 5, repeatSpeedEnd: 15, repeatAccelTime: 0.5, usbKbdOnIcon: 'SKB_USB_Icon.tif' });
    expect(p.common.sounds).toEqual(['.SLIDE', '.SLIDE\t', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG']);
    expect(p.common.legend).toEqual({ texture: 'SkbLegend.tif', size: [170, 230], slideInSec: 0.2, slideOutSec: 0.2 });
  });

  it('each layout in file order, its grid 7 x 15 of keys, its start, its places and its flags', () => {
    expect(p.layouts.map((l) => l.name)).toEqual(['CREATEPLAYERNAME', 'CREATEPLAYERNAME2', 'ChatSkb']);
    const l = p.layouts[0]!;
    expect(l.grid).toHaveLength(7);
    expect(l.grid.every((r) => r.length === 15)).toBe(true);
    expect(l.grid[6]![0]).toEqual({ type: SKB_KEY_TYPE.SWITCH, value: 1 });
    expect(l.grid[5]![2]).toEqual(SKB_EMPTY_KEY);
    expect(l).toMatchObject({
      startGridPos: [1, 7], skbPos: [15, 200], skbWidth: 460, skbHeight: 230, userStringWidth: 310, userStringLineHeight: 0,
      cursorY: 30, cursorSize: [5, 18], scaleUpSec: 0.2, scaleDownSec: 0.2, ignoreUnchangedString: true, switchTargets: ['CREATEPLAYERNAME2'],
      background: 'Skbbg_LC.tif', shiftBackground: 'Skbbg.tif',
    });
    expect(l.userString).toEqual({ x: 15, y: 55, scale: 1, color: [128, 128, 128], font: 'font_text_01' });
    expect(l.indicators.capsLock).toEqual({ x: 12, y: 108, w: 54, h: 45 });
    expect(l.indicators.usbKbdOn).toBeNull();
    const shift = l.keyProps.find((k) => k.key.type === SKB_KEY_TYPE.FN && k.key.value === SKB_FN.Shift)!;
    expect(shift).toMatchObject({ active: 'SkbHighlight.tif', pressed: 'SkbDepress.tif', buttonSize: [26, 22] });
  });

  it('a layout of pieces keeps its four sets; the defaults where a key is absent', () => {
    const c = p.layouts[2]!;
    expect(c.background).toBeNull();
    expect(c.pieces.map((s) => s.length)).toEqual([3, 3, 4, 4]);
    expect(c.pieces[0]![2]).toEqual({ texture: 'SKB_English_Set.tif', src: { x: 0, y: 320, w: 512, h: 192 }, dst: { x: 0, y: 58, w: 460, h: 175 } });
    expect(c).toMatchObject({ skbHeight: 0, userStringLineHeight: 26, twoEditsGrowUp: 32, cursorY2nd: -28 });
    expect(c.msgPlayerString).toMatchObject({ x: 15, y: -5 });
    const bare = readSoftKeyboards([['CommonSoftKeyboardProps', [], 'SoftKeyboards', [['Name', ['X'], 'Grid', [['A']]]]]]);
    expect(bare.layouts[0]).toMatchObject({ scaleUpSec: 0.25, scaleDownSec: 0.25, ignoreUnchangedString: false, startGridPos: [0, 0] });
    expect(bare.common.backgroundsOpacity).toBe(1);
    expect(SKB_PIECE_ATLAS_READING).toBe(512);
  });

  it('a layout by name ignoring case, the empty name KEYBOARD (FUN_0038d770 D:L284002-284026)', () => {
    expect(findSoftKeyboard(p.layouts, 'createplayername2')?.name).toBe('CREATEPLAYERNAME2');
    expect(findSoftKeyboard(p.layouts, 'MPPLAYERNAME')).toBeNull();
    const k = readSoftKeyboards([['CommonSoftKeyboardProps', [], 'SoftKeyboards', [['Name', ['KEYBOARD']]]]]);
    expect(findSoftKeyboard(k.layouts, '')?.name).toBe('KEYBOARD');
  });
});

describe("GetTextInput's block (FUN_00395f40, FUN_00397640 D:L289863-289923)", () => {
  const names = ['set_player_password', 'x', 'y', 'PLAYERPASSWORD', 'MsgTitle', 'A2Title'];
  const name = (i: number): string | null => names[i] ?? null;

  it('the variable from +8, the purpose +0x10, the layout +0x58, the caps +0x98 bytes / +0x9c chars, the flags', () => {
    const r = decodeTextInput(textInputBlock({ uiVarIndex: 3, purpose: '_604_EnterPassword_MSG', skb: 'CREATEPLAYERNAME', maxBytes: 31, maxChars: 12 }), name);
    expect(r).toEqual({
      uiVar: 'PLAYERPASSWORD', purpose: '_604_EnterPassword_MSG', msgPlayerTitle: '', action2Title: '', skbName: 'CREATEPLAYERNAME',
      uiVar2: '', maxBytes: 31, maxChars: 12, maxBytes2: 0, maxChars2: 0, noDQuote: false, allowEmpty: false,
    });
  });

  it('the two titles by name index (-1 none: empty); over 127 bytes the code\'s own line', () => {
    const long = 'T'.repeat(128);
    const r = decodeTextInput(textInputBlock({ uiVarIndex: 3, purpose: 'p', skb: 'ChatSkb', uiVar2: 'MsgPlayer_Recipient', msgTitle: 4, action2Title: 5,
      maxBytes: 63, maxChars: 63, maxBytes2: 31, maxChars2: 14, noDQuote: true, allowEmpty: true }), (i) => (i === 5 ? long : name(i)));
    expect(r).toMatchObject({ msgPlayerTitle: 'MsgTitle', action2Title: 'Action2 title too long!', uiVar2: 'MsgPlayer_Recipient',
      maxBytes2: 31, maxChars2: 14, noDQuote: true, allowEmpty: true });
  });
});
