// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  alignmentCenters, buildMatrix, dataCapacity, dataCodewords, dataPositions, encodeQr, finalCodewords, formatBits, functionPatterns,
  penalty, pickVersion, qrMatrix, qrSize, qrSvg, rsRemainder, totalCodewords, versionBits, type EcLevel, type QrMatrix,
} from '../src/qr';

/**
 * DSH-5 (the disc share plan, DSH.R12): the QR encoder the pairing screen draws its link with (`src/qr.ts`), held against
 * published values -- the "HELLO WORLD" worked example of Thonky's QR Code Tutorial (its data codewords and its error
 * correction codewords, at 1-M and 1-Q, alphanumeric), the format information table of ISO/IEC 18004 (Annex C, every
 * level and mask), the version information of versions 7-10 (Annex D), the alignment centres (Annex E) and the
 * capacities of versions 1-10 (Tables 7 and 9) -- and by a decoder written here apart from the encoder (its own field
 * arithmetic, its own placement walk): every symbol built reads back to its text with every block's syndromes zero. A
 * browser adaptation: nothing of the game.
 */

const bits = (s: string): number => parseInt(s, 2);

/** ISO/IEC 18004 Annex C, Table C.1 (Thonky's "Format Information" table): the 15-bit strings, most significant first. */
const FORMAT: Record<EcLevel, readonly string[]> = {
  L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
  M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'],
  Q: ['011010101011111', '011000001101000', '011111100110001', '011101000000110', '010010010110100', '010000110000011', '010111011011010', '010101111101101'],
  H: ['001011010001001', '001001110111110', '001110011100111', '001100111010000', '000011101100010', '000001001010101', '000110100001100', '000100000111011'],
};

/** ISO/IEC 18004 Annex D, Table D.1: the version information of versions 7-10. */
const VERSION: Record<number, string> = {
  7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011',
};

/** ISO/IEC 18004 Annex E, Table E.1: the alignment patterns' centres. */
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** ISO/IEC 18004 Table 9: all codewords of versions 1-10; and the remainder bits after them (Table 1). */
const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const REMAINDER = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];
/** ISO/IEC 18004 Table 7: the byte mode's characters at level M, versions 1-10. */
const BYTES_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
/** ISO/IEC 18004 Table 7: data codewords at L, M, Q, H for versions 1 and 10. */
const DATA_V1 = { L: 19, M: 16, Q: 13, H: 9 } as const;
const DATA_V10 = { L: 274, M: 216, Q: 154, H: 122 } as const;

/** Thonky's "HELLO WORLD" example, alphanumeric: its data codewords and error correction codewords. */
const HELLO = 'HELLO WORLD';
const HELLO_1M_DATA = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
const HELLO_1M_EC = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
const HELLO_1Q_DATA = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
const HELLO_1Q_EC = [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16];

/* ---------- a decoder apart from the encoder ---------- */

/** GF(256) multiply by shift and add, reduced by x^8 + x^4 + x^3 + x^2 + 1 (no tables shared with the encoder). */
function mul(a: number, b: number): number {
  let r = 0;
  while (b) { if (b & 1) r ^= a; a <<= 1; if (a & 0x100) a ^= 0x11d; b >>= 1; }
  return r;
}
const pow2 = (n: number): number => { let r = 1; for (let i = 0; i < n; i++) r = mul(r, 2); return r; };
/** The codeword block evaluated at alpha^i (the highest power first): zero for i < ec on an unbroken block. */
const syndrome = (block: number[], i: number): number => block.reduce((acc, c) => mul(acc, pow2(i)) ^ c, 0);

/** ISO/IEC 18004 Table 9 (versions 1, 3, 5, 7, 10 at the levels these tests build): EC per block, block data lengths. */
const LAYOUT: Record<string, [number, number[]]> = {
  '1-M': [10, [16]], '1-Q': [13, [13]], '3-M': [26, [44]], '5-Q': [18, [15, 15, 16, 16]], '7-H': [26, [13, 13, 13, 13, 14]], '10-M': [26, [43, 43, 43, 43, 44]],
};

/** Reads `m` back: the format (matched to the table), the data under the mask, the blocks checked, the byte text. */
function decode(m: QrMatrix, version: number): { level: EcLevel; mask: number; text: string } {
  const n = m.length;
  expect(n).toBe(17 + 4 * version);
  let f = 0;
  for (const [r, c] of [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]] as const) f = (f << 1) | (m[r]![c] ? 1 : 0);
  let f2 = 0;
  for (let i = 0; i < 7; i++) f2 = (f2 << 1) | (m[n - 1 - i]![8] ? 1 : 0);
  for (let i = 0; i < 8; i++) f2 = (f2 << 1) | (m[8]![n - 8 + i] ? 1 : 0);
  expect(f2, 'the two format copies agree').toBe(f);
  const found = (Object.keys(FORMAT) as EcLevel[]).flatMap((l) => FORMAT[l].map((s, k) => (bits(s) === f ? [l, k] as const : null)).filter((x) => x !== null));
  expect(found, 'the format is one of the table\'s').toHaveLength(1);
  const [level, mask] = found[0]!;
  const fixed = functionPatterns(version).fixed;
  const flip = (r: number, c: number): boolean => [
    (r + c) % 2, r % 2, c % 3, (r + c) % 3, (Math.floor(r / 2) + Math.floor(c / 3)) % 2, ((r * c) % 2) + ((r * c) % 3), (((r * c) % 2) + ((r * c) % 3)) % 2, (((r + c) % 2) + ((r * c) % 3)) % 2,
  ][mask] === 0;
  const stream: number[] = [];
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const c of [col, col - 1]) if (!fixed[r]![c]) stream.push(m[r]![c] !== flip(r, c) ? 1 : 0);
    }
    up = !up;
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= stream.length; i += 8) words.push(stream.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  const [ec, lens] = LAYOUT[`${version}-${level}`]!;
  const blocks = lens.map(() => [] as number[]);
  let at = 0;
  for (let i = 0; i < Math.max(...lens); i++) lens.forEach((len, b) => { if (i < len) blocks[b]!.push(words[at++]!); });
  for (let i = 0; i < ec; i++) blocks.forEach((b) => { b.push(words[at++]!); });
  for (const b of blocks) for (let i = 0; i < ec; i++) expect(syndrome(b, i), 'a block\'s syndrome').toBe(0);
  const data = blocks.flatMap((b) => b.slice(0, b.length - ec));
  const dbits = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((k) => (w >> k) & 1));
  const read = (from: number, len: number): number => dbits.slice(from, from + len).reduce((v, b) => (v << 1) | b, 0);
  const mode = read(0, 4);
  if (mode === 0b0010) {
    const cnt = read(4, 9);
    const AL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    let s = ''; let p = 13;
    for (let k = 0; k + 1 < cnt; k += 2) { const v = read(p, 11); s += AL[Math.floor(v / 45)]! + AL[v % 45]!; p += 11; }
    if (cnt % 2) s += AL[read(p, 6)]!;
    return { level, mask, text: s };
  }
  expect(mode, 'the byte mode').toBe(0b0100);
  const cb = version < 10 ? 8 : 16;
  const cnt = read(4, cb);
  const bytes = Array.from({ length: cnt }, (_, k) => read(4 + cb + 8 * k, 8));
  return { level, mask, text: new TextDecoder().decode(new Uint8Array(bytes)) };
}

describe('QR: the data and its error correction (Thonky\'s "HELLO WORLD")', () => {
  it('1-M alphanumeric: the 16 data codewords and the 10 error correction codewords', () => {
    expect(dataCodewords(HELLO, 1, 'M', 'alphanumeric')).toEqual(HELLO_1M_DATA);
    expect(rsRemainder(HELLO_1M_DATA, 10)).toEqual(HELLO_1M_EC);
  });

  it('1-Q alphanumeric: the 13 data codewords and the 13 error correction codewords', () => {
    expect(dataCodewords(HELLO, 1, 'Q', 'alphanumeric')).toEqual(HELLO_1Q_DATA);
    expect(rsRemainder(HELLO_1Q_DATA, 13)).toEqual(HELLO_1Q_EC);
    expect(finalCodewords(HELLO_1Q_DATA, 1, 'Q'), 'one block: the data, then its error correction').toEqual([...HELLO_1Q_DATA, ...HELLO_1Q_EC]);
  });

  it('1-Q under mask 6: the format string Q6 in both copies, and the symbol reads back to HELLO WORLD', () => {
    const m = buildMatrix([...HELLO_1Q_DATA, ...HELLO_1Q_EC], 1, 'Q', 6);
    expect(formatBits('Q', 6)).toBe(bits('010111011011010'));
    expect(decode(m, 1)).toEqual({ level: 'Q', mask: 6, text: HELLO });
  });

  it('byte mode, UTF-8: the mode 0100, the count, the bytes, the terminator and the pads 236 / 17', () => {
    // "é" is two UTF-8 bytes (C3 A9): 0100 00000010 11000011 10101001 0000, then the pads.
    const w = dataCodewords('é', 1, 'M');
    expect(w.slice(0, 4)).toEqual([0b01000000, 0b00101100, 0b00111010, 0b10010000]);
    expect(w.slice(4)).toEqual([236, 17, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]);
  });
});

describe('QR: the format and version information (ISO/IEC 18004 Annexes C and D)', () => {
  it.each(['L', 'M', 'Q', 'H'] as const)('level %s: every mask\'s 15-bit string is the table\'s', (level) => {
    for (let mask = 0; mask < 8; mask++) expect(formatBits(level, mask).toString(2).padStart(15, '0'), `${level}${mask}`).toBe(FORMAT[level][mask]);
  });

  it('versions 7-10: the 18-bit strings are the table\'s', () => {
    for (const v of [7, 8, 9, 10]) expect(versionBits(v).toString(2).padStart(18, '0'), `version ${v}`).toBe(VERSION[v]);
  });

  it('the version information sits in both 6x3 blocks (version 7 and up), the least significant bit first', () => {
    for (const v of [7, 8, 9, 10]) {
      const m = functionPatterns(v).dark;
      const n = qrSize(v);
      const want = VERSION[v]!;
      for (let i = 0; i < 18; i++) {
        const on = want[17 - i] === '1';
        expect(m[Math.floor(i / 3)]![n - 11 + (i % 3)], `v${v} top right bit ${i}`).toBe(on);
        expect(m[n - 11 + (i % 3)]![Math.floor(i / 3)], `v${v} bottom left bit ${i}`).toBe(on);
      }
    }
  });
});

describe('QR: the function patterns of versions 1-10', () => {
  const versions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it.each(versions)('version %i: three finders with light separators, the timing rows, the dark module', (v) => {
    const { dark, fixed } = functionPatterns(v);
    const n = qrSize(v);
    expect(dark).toHaveLength(n);
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        expect(dark[r0! + r]![c0! + c], `finder at ${r0},${c0}: ${r},${c}`).toBe(ring !== 2);
        expect(fixed[r0! + r]![c0! + c]).toBe(true);
      }
    }
    for (let i = 0; i < 8; i++) {
      expect(dark[7]![i]).toBe(false); expect(dark[i]![7]).toBe(false);                     // top left separator
      expect(dark[7]![n - 1 - i]).toBe(false); expect(dark[i]![n - 8]).toBe(false);         // top right
      expect(dark[n - 8]![i]).toBe(false); expect(dark[n - 1 - i]![7]).toBe(false);         // bottom left
    }
    for (let i = 8; i < n - 8; i++) {
      expect(dark[6]![i], `timing row at ${i}`).toBe(i % 2 === 0);
      expect(dark[i]![6], `timing column at ${i}`).toBe(i % 2 === 0);
    }
    expect(dark[4 * v + 9]![8], 'the dark module (4V + 9, 8)').toBe(true);
  });

  it.each(versions)('version %i: the alignment centres are the table\'s, each a 5x5 pattern, none over a finder', (v) => {
    expect(alignmentCenters(v)).toEqual(ALIGN[v]);
    const { dark } = functionPatterns(v);
    const al = ALIGN[v]!;
    const last = al[al.length - 1];
    let drawn = 0;
    for (const r of al) for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      drawn++;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) expect(dark[r + dr]![c + dc], `alignment ${r},${c}`).toBe(Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
    expect(drawn).toBe(v === 1 ? 0 : al.length * al.length - 3);
  });

  it.each(versions)('version %i: the data modules are every codeword bit plus the remainder bits', (v) => {
    expect(totalCodewords(v)).toBe(TOTAL[v - 1]);
    expect(dataPositions(v)).toHaveLength(TOTAL[v - 1]! * 8 + REMAINDER[v - 1]!);
  });
});

describe('QR: the capacities and the version picked by length', () => {
  it('data codewords at each level for versions 1 and 10 (Table 7), and every level\'s total for 1-10 (Table 9)', () => {
    for (const l of ['L', 'M', 'Q', 'H'] as const) {
      expect(dataCapacity(1, l)).toBe(DATA_V1[l]);
      expect(dataCapacity(10, l)).toBe(DATA_V10[l]);
      for (let v = 1; v <= 10; v++) expect(totalCodewords(v, l), `${v}-${l}`).toBe(TOTAL[v - 1]);
    }
  });

  it('the byte mode at M: each version holds its table\'s characters, one more takes the next version', () => {
    BYTES_M.forEach((cap, k) => {
      expect(pickVersion('a'.repeat(cap), 'M'), `${cap} bytes`).toBe(k + 1);
      expect(pickVersion('a'.repeat(cap + 1), 'M'), `${cap + 1} bytes`).toBe(k === 9 ? null : k + 2);
    });
    expect(() => encodeQr('a'.repeat(214))).toThrow(RangeError);
  });
});

describe('QR: the mask penalty (ISO/IEC 18004 7.8.3)', () => {
  const sq = (f: (r: number, c: number) => boolean): QrMatrix => Array.from({ length: 11 }, (_, r) => Array.from({ length: 11 }, (_, c) => f(r, c)));

  it('all light: N1 9 for each of 22 lines, N2 3 for each of 100 blocks, N4 100', () => {
    expect(penalty(sq(() => false))).toBe(22 * 9 + 100 * 3 + 100);
    expect(penalty(sq(() => true))).toBe(22 * 9 + 100 * 3 + 100);
  });

  it('a checkerboard scores 0; one finder-like row 1011101 0000 in it scores N3 40', () => {
    const checker = (r: number, c: number): boolean => (r + c) % 2 === 0;
    expect(penalty(sq(checker))).toBe(0);
    const row = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    expect(penalty(sq((r, c) => (r === 0 ? row[c] === 1 : checker(r, c))))).toBe(40);
  });

  it('encodeQr picks the mask with the lowest penalty', () => {
    const s = encodeQr(HELLO, { level: 'Q', mode: 'alphanumeric' });
    const words = finalCodewords(dataCodewords(HELLO, 1, 'Q', 'alphanumeric'), 1, 'Q');
    const scores = Array.from({ length: 8 }, (_, k) => penalty(buildMatrix(words, 1, 'Q', k)));
    expect(scores[s.mask]).toBe(Math.min(...scores));
    expect(s.mask).toBe(scores.indexOf(Math.min(...scores)));
    expect(s.mask, "the tutorial's worked example ends on mask 6").toBe(6);
  });
});

describe('QR: whole symbols read back', () => {
  it.each([
    ['the pairing link', 'https://s2.example.org/?discshare=QX7K4M', 'M', 3],
    ['a longer address at Q', 'https://a-longer-host-name.example.org/?discshare=ABCDEF', 'Q', 5],
    ['a full version 7 at H', 'x'.repeat(64), 'H', 7],
    ['the largest at M', 'y'.repeat(213), 'M', 10],
  ] as const)('%s: the version by length, every block\'s syndromes zero, the text back', (_name, text, level, version) => {
    const s = encodeQr(text, { level });
    expect(s.version).toBe(version);
    expect(decode(s.modules, version)).toEqual({ level, mask: s.mask, text });
  });

  it('qrMatrix is level M by default', () => {
    const m = qrMatrix('https://s2.example.org/?discshare=QX7K4M');
    expect(decode(m, 3).level).toBe('M');
  });
});

describe('QR: the SVG', () => {
  it('one light ground over the symbol and its 4-module quiet zone, the dark modules one path, crisp edges', () => {
    const m = qrMatrix('https://s2.example.org/?discshare=QX7K4M');
    const box = document.createElement('div');
    box.innerHTML = qrSvg(m, { label: 'Pairing link' });
    const svg = box.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${m.length + 8} ${m.length + 8}`);
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Pairing link');
    const rect = svg.querySelector('rect')!;
    expect(rect.getAttribute('fill')).toBe('#ffffff');
    expect(rect.getAttribute('width')).toBe(String(m.length + 8));
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('fill')).toBe('#000000');
    const dark = m.flat().filter(Boolean).length;
    expect(path.getAttribute('d')!.match(/M/g)).toHaveLength(dark);
    expect(path.getAttribute('d')!.startsWith('M4 4h1v1h-1z'), 'the top left finder\'s corner after the quiet zone').toBe(true);
  });
});
