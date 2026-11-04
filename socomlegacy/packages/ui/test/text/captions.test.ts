import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { captionBytes, captionCodes, dialogCaptions, locTextBytes, loadDialog, secureCodes, type CaptionSource, OBJECT_TYPES, CONTROL_TYPES } from '../../src/index';

// Web research 111 §2, §7: a caption through the text setter FUN_003631f0 (D:L260984-261045) and SECURETEXT's
// FUN_0036aff0 (D:L265383-265411).

const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
  const out: RdrNode[] = [];
  for (let i = 0; i < kv.length; i += 2) { const v = kv[i + 1]!; out.push(kv[i] as string, Array.isArray(v) ? v : [v]); }
  return out;
};

const loc: CaptionSource = {
  caption: (c) => (c === '_1_Ok_MSG' ? { kind: 'loc', id: 1, table: 'UIMn', text: '\xa6 OK' } : /^_\d+_.*_MSG$/.test(c) ? { kind: 'unresolved', id: 2, ref: c } : { kind: 'literal', text: c }),
};

describe('a caption to the codes it draws', () => {
  it('a table\'s string is already decoded; a literal or an unknown name is the dialog\'s bytes, decoded as the engine does', () => {
    expect(captionCodes('_1_Ok_MSG', loc).codes).toEqual([0xa6, 0x20, 0x4f, 0x4b]);
    expect(captionCodes('\xc2\xa6X', loc).codes).toEqual([0xa6, 0x58]);
    expect(captionCodes('_2_Gone_MSG', loc)).toMatchObject({ resolution: { kind: 'unresolved' } });
    expect(captionCodes('_2_Gone_MSG', loc).codes[0]).toBe(0x5f);
    expect(captionCodes('Hi', null).codes).toEqual([0x48, 0x69]);
  });
  it('the bytes a byte-walking setter takes: a table string re-encoded (LOC_TEXT_BYTES_READING), a literal as it stands', () => {
    expect(locTextBytes('\xa6 OK\u00eb')).toBe('\xc2\xa6 OK\xc3\xab');
    expect(captionBytes('_1_Ok_MSG', loc)).toBe('\xc2\xa6 OK');
    expect(captionBytes('\xc2\xa6X', loc)).toBe('\xc2\xa6X');
    expect(captionBytes('_2_Gone_MSG', loc)).toBe('_2_Gone_MSG');
    expect(captionBytes('Hi', null)).toBe('Hi');
  });
  it('SECURETEXT shows one * a character', () => {
    expect(secureCodes([0x61, 0xa6, 0x62])).toEqual([0x2a, 0x2a, 0x2a]);
  });
});

describe('every caption a dialog holds', () => {
  it('texts, buttons, a RADIOSTRIP\'s subordinates, a LISTBOX\'s option cells', () => {
    const d = loadDialog([['SCREENS', r(
      'FONT', 'font_text_01',
      'CONTROLS', [
        r('NAME', 'go', 'TYPE', 'BUTTON', 'SPEC', r('CAPTION', '_1_Ok_MSG', 'FONT', 'font_titlebar_01')),
        r('NAME', 'strip', 'TYPE', 'RADIOSTRIP', 'SPEC', r('SUBORDINATES', [r('NAME', 'c1', 'TYPE', 'CHECKBOX', 'XPOS', '0', 'YPOS', '0', 'SPEC', r('CAPTION', 'One'))])),
        r('NAME', 'list', 'TYPE', 'LISTBOX', 'SPEC', r('OPTIONS', [r('CAPTION', ['Row'])])),
      ],
      'OBJECTS', [r('NAME', 't', 'TYPE', 'TEXT', 'SPEC', r('CAPTION', 'Hello'))],
    )]]);
    expect(dialogCaptions(d).map((c) => [c.path, c.type, c.caption, c.font])).toEqual([
      ['go', 'BUTTON', '_1_Ok_MSG', 'font_titlebar_01'],
      // The strip has no CAPTION of its own: the depth-first lookup (FUN_0032f0e0) finds its subordinate's.
      ['strip', 'RADIOSTRIP', 'One', null],
      ['strip/c1', 'CHECKBOX', 'One', null],
      ['list/option0/0', 'LISTBOX', 'Row', null],
      ['t', 'TEXT', 'Hello', null],
    ]);
  });
});

describe('TICKERTAPETEXT is SOCOM 1\'s', () => {
  it('neither of SOCOM II\'s factories makes it (FUN_00382070, FUN_00382890; reCOM zui_spec.cpp:99 is SOCOM 1\'s)', () => {
    expect([...OBJECT_TYPES, ...CONTROL_TYPES]).not.toContain('TICKERTAPETEXT');
  });
});
