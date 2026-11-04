/**
 * A QR Code encoder (ISO/IEC 18004), pure TypeScript with no dependency, for the disc share's pairing link (DSH-5, the
 * disc share plan, DSH.R12: "a QR code is shown to tunnel with some instruction steps"). Versions 1-10, the byte mode
 * (the text's UTF-8 bytes) and the alphanumeric mode, the four error correction levels (the page uses M), all eight
 * masks scored by the standard's four penalty rules, the format and version information. `qrSvg` draws a matrix as one
 * crisp inline SVG with its quiet zone, dark on light for a phone's camera.
 *
 * The lower-level steps are exported so `test/qr.test.ts` can hold each against published values: the data codewords
 * and Reed-Solomon codewords of the "HELLO WORLD" worked example, the format information of every level and mask, the
 * version information of versions 7-10, the alignment centres and the codeword capacities of versions 1-10.
 *
 * A browser adaptation (the launcher's pairing screen): nothing of the game.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export type QrMode = 'byte' | 'alphanumeric';
/** A module matrix, `[row][column]`, true dark. */
export type QrMatrix = boolean[][];

/** The highest version this encoder builds (the link it carries is a few dozen bytes; version 10-M holds 213). */
export const QR_MAX_VERSION = 10;

/**
 * The error correction blocks of versions 1-10 (ISO/IEC 18004 Table 9): per level, the EC codewords per block and the
 * groups of blocks as [count, data codewords per block].
 */
type Blocks = readonly [ec: number, groups: readonly (readonly [count: number, data: number])[]];
const BLOCKS: Record<EcLevel, readonly Blocks[]> = {
  L: [[7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]], [26, [[1, 108]]], [18, [[2, 68]]], [20, [[2, 78]]], [24, [[2, 97]]], [30, [[2, 116]]], [18, [[2, 68], [2, 69]]]],
  M: [[10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]],
  Q: [[13, [[1, 13]]], [22, [[1, 22]]], [18, [[2, 17]]], [26, [[2, 24]]], [18, [[2, 15], [2, 16]]], [24, [[4, 19]]], [18, [[2, 14], [4, 15]]], [22, [[4, 18], [2, 19]]], [20, [[4, 16], [4, 17]]], [24, [[6, 19], [2, 20]]]],
  H: [[17, [[1, 9]]], [28, [[1, 16]]], [22, [[2, 13]]], [16, [[4, 9]]], [22, [[2, 11], [2, 12]]], [28, [[4, 15]]], [26, [[4, 13], [1, 14]]], [26, [[4, 14], [2, 15]]], [24, [[4, 12], [4, 13]]], [28, [[6, 15], [2, 16]]]],
};

/** The format information's two error correction bits (ISO/IEC 18004 Table 12). */
const EC_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const blocksOf = (version: number, level: EcLevel): Blocks => {
  if (!Number.isInteger(version) || version < 1 || version > QR_MAX_VERSION) throw new RangeError(`QR version ${version} is outside 1-${QR_MAX_VERSION}`);
  return BLOCKS[level][version - 1]!;
};

/** The modules on a side. */
export const qrSize = (version: number): number => 17 + 4 * version;

/** The data codewords a version and level hold. */
export function dataCapacity(version: number, level: EcLevel): number {
  return blocksOf(version, level)[1].reduce((n, [count, data]) => n + count * data, 0);
}

/** All codewords, data and error correction, a version holds. */
export function totalCodewords(version: number, level: EcLevel = 'M'): number {
  const [ec, groups] = blocksOf(version, level);
  return groups.reduce((n, [count, data]) => n + count * (data + ec), 0);
}

/* ---------- the data ---------- */

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** The character count indicator's length (ISO/IEC 18004 Table 3), versions 1-9 and 10-26. */
const countBits = (mode: QrMode, version: number): number => (mode === 'byte' ? (version < 10 ? 8 : 16) : (version < 10 ? 9 : 11));

/** The text as the mode reads it: UTF-8 bytes, or the alphanumeric characters (refused when one is not in the set). */
function units(text: string, mode: QrMode): number[] {
  if (mode === 'byte') return [...new TextEncoder().encode(text)];
  return [...text].map((ch) => {
    const v = ALNUM.indexOf(ch);
    if (v < 0) throw new RangeError(`"${ch}" is not in the QR alphanumeric set`);
    return v;
  });
}

/** The segment's bits: the mode indicator, the count, the data (no terminator). */
function segmentBits(text: string, mode: QrMode, version: number): number[] {
  const out: number[] = [];
  const put = (v: number, n: number): void => { for (let i = n - 1; i >= 0; i--) out.push((v >>> i) & 1); };
  const u = units(text, mode);
  put(mode === 'byte' ? 0b0100 : 0b0010, 4);
  put(u.length, countBits(mode, version));
  if (mode === 'byte') for (const b of u) put(b, 8);
  else {
    for (let i = 0; i + 1 < u.length; i += 2) put(u[i]! * 45 + u[i + 1]!, 11);
    if (u.length % 2) put(u[u.length - 1]!, 6);
  }
  return out;
}

/**
 * The data codewords of `text` in `version` at `level` (ISO/IEC 18004 7.4): the segment, the terminator (up to four
 * zeros), zeros to a byte, then the pad codewords 236 and 17 in turn. Throws when the text does not fit.
 */
export function dataCodewords(text: string, version: number, level: EcLevel, mode: QrMode = 'byte'): number[] {
  const cap = dataCapacity(version, level) * 8;
  const bits = segmentBits(text, mode, version);
  if (bits.length > cap) throw new RangeError(`${bits.length} bits do not fit version ${version}-${level} (${cap})`);
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  for (let pad = 0xec; out.length < cap / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** The smallest version (1-10) whose `level` holds `text`, or null when none does. */
export function pickVersion(text: string, level: EcLevel, mode: QrMode = 'byte'): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) if (segmentBits(text, mode, v).length <= dataCapacity(v, level) * 8) return v;
  return null;
}

/* ---------- Reed-Solomon over GF(256), the field of x^8 + x^4 + x^3 + x^2 + 1 ---------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}
/** The product of two field elements. */
export const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);
/** alpha to the power `n`. */
export const gfExp = (n: number): number => EXP[((n % 255) + 255) % 255]!;

/** The generator polynomial of degree `n`, the product of (x - alpha^i) for i < n, highest power first, leading 1 kept. */
export function rsGenerator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] = next[j]! ^ g[j]!; next[j + 1] = next[j + 1]! ^ gfMul(g[j]!, gfExp(i)); }
    g = next;
  }
  return g;
}

/** The `n` error correction codewords of `data`: the remainder of data * x^n divided by the generator. */
export function rsRemainder(data: readonly number[], n: number): number[] {
  const gen = rsGenerator(n);
  const r = new Array<number>(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift()!;
    r.push(0);
    for (let i = 0; i < n; i++) r[i] = r[i]! ^ gfMul(gen[i + 1]!, f);
  }
  return r;
}

/**
 * The final codeword sequence (ISO/IEC 18004 7.6): the data split into the version's blocks, each block's error
 * correction, then the data interleaved column by column across the blocks, then the error correction the same way.
 */
export function finalCodewords(data: readonly number[], version: number, level: EcLevel): number[] {
  const [ec, groups] = blocksOf(version, level);
  if (data.length !== dataCapacity(version, level)) throw new RangeError(`version ${version}-${level} takes ${dataCapacity(version, level)} data codewords, not ${data.length}`);
  const blocks: number[][] = [];
  let at = 0;
  for (const [count, len] of groups) for (let k = 0; k < count; k++) { blocks.push(data.slice(at, at + len)); at += len; }
  const ecs = blocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]!);
  return out;
}

/* ---------- the function patterns ---------- */

/** The alignment patterns' row and column centres (ISO/IEC 18004 Annex E, Table E.1), versions 1-10. */
export function alignmentCenters(version: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const last = qrSize(version) - 7;
  const step = n === 2 ? last - 6 : Math.ceil((last - 6) / (n - 1) / 2) * 2;
  const out = [6];
  for (let p = last - step * (n - 2); p <= last; p += step) out.push(p);
  return out;
}

/** BCH remainder of `value` shifted by the generator's degree (the format's and the version's codes). */
function bch(value: number, gen: number, degree: number): number {
  let r = value << degree;
  for (let i = 31 - Math.clz32(r); i >= degree; i--) if ((r >>> i) & 1) r ^= gen << (i - degree);
  return r;
}

/** The 15-bit format information of `level` and `mask` (ISO/IEC 18004 7.9.1): BCH(15,5), masked with 101010000010010. */
export function formatBits(level: EcLevel, mask: number): number {
  const data = (EC_BITS[level] << 3) | mask;
  return ((data << 10) | bch(data, 0x537, 10)) ^ 0x5412;
}

/** The 18-bit version information of `version` 7-40 (ISO/IEC 18004 7.10): BCH(18,6). */
export function versionBits(version: number): number {
  return (version << 12) | bch(version, 0x1f25, 12);
}

interface Grid { size: number; dark: QrMatrix; fixed: boolean[][] }

const grid = (size: number): Grid => ({
  size,
  dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  fixed: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
});

const setFixed = (g: Grid, row: number, col: number, dark: boolean): void => {
  if (row < 0 || col < 0 || row >= g.size || col >= g.size) return;
  g.dark[row]![col] = dark;
  g.fixed[row]![col] = true;
};

/** The format information's two copies (bit 14 the most significant) and the dark module. */
function drawFormat(g: Grid, bits: number): void {
  const n = g.size;
  const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFixed(g, i, 8, bit(i));
  setFixed(g, 7, 8, bit(6));
  setFixed(g, 8, 8, bit(7));
  setFixed(g, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFixed(g, 8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) setFixed(g, 8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFixed(g, n - 15 + i, 8, bit(i));
  setFixed(g, n - 8, 8, true);                                           // the dark module, (4V + 9, 8)
}

/**
 * The function patterns of `version`: the three finders with their separators, the timing patterns, the alignment
 * patterns, the version information (7 and up), the dark module, the format areas reserved (drawn light). Answers the
 * modules' colours and which are function modules.
 */
export function functionPatterns(version: number): { dark: QrMatrix; fixed: boolean[][] } {
  const g = grid(qrSize(version));
  const n = g.size;
  for (let i = 0; i < n; i++) { setFixed(g, 6, i, i % 2 === 0); setFixed(g, i, 6, i % 2 === 0); }
  for (const [r0, c0] of [[3, 3], [3, n - 4], [n - 4, 3]] as const) {
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      setFixed(g, r0 + dr, c0 + dc, d !== 2 && d !== 4);
    }
  }
  const al = alignmentCenters(version);
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setFixed(g, r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  drawFormat(g, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFixed(g, b, a, on);                                             // top right: 6 rows by 3 columns
      setFixed(g, a, b, on);                                             // bottom left: 3 rows by 6 columns
    }
  }
  return { dark: g.dark, fixed: g.fixed };
}

/** The eight data masks (ISO/IEC 18004 Table 10): true where a data module is inverted. */
export const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/**
 * The data modules in placement order (ISO/IEC 18004 7.7.3): two-module columns from the bottom right, upward then
 * downward in turn, the vertical timing column skipped, function modules passed over.
 */
export function dataPositions(version: number): [number, number][] {
  const { fixed } = functionPatterns(version);
  const n = qrSize(version);
  const out: [number, number][] = [];
  let up = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const row = up ? n - 1 - k : k;
      for (const col of [right, right - 1]) if (!fixed[row]![col]) out.push([row, col]);
    }
    up = !up;
  }
  return out;
}

/** The symbol of `codewords` (the final sequence) in `version` at `level` under `mask`. */
export function buildMatrix(codewords: readonly number[], version: number, level: EcLevel, mask: number): QrMatrix {
  const { dark, fixed } = functionPatterns(version);
  const g: Grid = { size: qrSize(version), dark: dark.map((r) => r.slice()), fixed };
  const pos = dataPositions(version);
  pos.forEach(([r, c], i) => {
    const byte = codewords[i >>> 3];
    const on = byte !== undefined && ((byte >>> (7 - (i & 7))) & 1) === 1;   // the remainder bits are 0
    g.dark[r]![c] = on !== MASKS[mask]!(r, c);
  });
  drawFormat(g, formatBits(level, mask));
  return g.dark;
}

/**
 * The penalty score of a symbol (ISO/IEC 18004 7.8.3): N1 runs of five or more of a colour in a row or column (3, and 1
 * more per module beyond five), N2 each 2x2 block of one colour (3), N3 each 1:1:3:1:1 finder-like run with four light
 * modules on either side in a row or column (40), N4 the dark share's distance from half in whole 5% steps (10 each).
 */
export function penalty(m: QrMatrix): number {
  const n = m.length;
  let score = 0;
  const at = (r: number, c: number, cols: boolean): boolean => (cols ? m[c]![r]! : m[r]![c]!);
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  for (const cols of [false, true]) {
    for (let r = 0; r < n; r++) {
      let run = 1;
      for (let c = 1; c <= n; c++) {
        if (c < n && at(r, c, cols) === at(r, c - 1, cols)) { run++; continue; }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      for (let c = 0; c + 11 <= n; c++) {
        let a = true; let b = true;
        for (let k = 0; k < 11; k++) { const v = at(r, c + k, cols); if (v !== A[k]) a = false; if (v !== B[k]) b = false; }
        if (a) score += 40;
        if (b) score += 40;
      }
    }
  }
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (m[r]![c]) dark++;
    if (r + 1 < n && c + 1 < n) { const v = m[r]![c]; if (m[r]![c + 1] === v && m[r + 1]![c] === v && m[r + 1]![c + 1] === v) score += 3; }
  }
  const total = n * n;
  score += 10 * Math.floor(Math.abs(dark * 20 - total * 10) / total);
  return score;
}

export interface QrSymbol { version: number; level: EcLevel; mask: number; modules: QrMatrix }

export interface QrOptions {
  /** The error correction level; M by default (the disc share's link). */
  level?: EcLevel;
  mode?: QrMode;
  /** A fixed mask (0-7); absent, the one with the lowest penalty (the first on a tie). */
  mask?: number;
  /** A fixed version; absent, the smallest that holds the text. */
  version?: number;
}

/** `text` as a QR symbol. Throws when it is longer than version 10 holds at the level. */
export function encodeQr(text: string, opts: QrOptions = {}): QrSymbol {
  const level = opts.level ?? 'M';
  const mode = opts.mode ?? 'byte';
  const version = opts.version ?? pickVersion(text, level, mode);
  if (version === null) throw new RangeError(`the text is too long for a version ${QR_MAX_VERSION}-${level} QR code`);
  const words = finalCodewords(dataCodewords(text, version, level, mode), version, level);
  if (opts.mask !== undefined) return { version, level, mask: opts.mask, modules: buildMatrix(words, version, level, opts.mask) };
  let best: QrSymbol | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const modules = buildMatrix(words, version, level, mask);
    const s = penalty(modules);
    if (s < bestScore) { bestScore = s; best = { version, level, mask, modules }; }
  }
  return best!;
}

/** `text`'s module matrix at level M (byte mode, UTF-8). */
export const qrMatrix = (text: string, level: EcLevel = 'M'): QrMatrix => encodeQr(text, { level }).modules;

export interface QrSvgOptions {
  /** The quiet zone in modules; 4 by default (the standard's). */
  quiet?: number;
  dark?: string;
  light?: string;
  /** The image's accessible name. */
  label?: string;
  /** A class on the `<svg>`. */
  className?: string;
}

const attr = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The matrix as one inline SVG: a light ground over the symbol and its quiet zone, the dark modules one path, one
 * user unit per module, `crispEdges` so a scaled symbol keeps sharp module edges.
 */
export function qrSvg(m: QrMatrix, opts: QrSvgOptions = {}): string {
  const q = opts.quiet ?? 4;
  const side = m.length + 2 * q;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + q} ${r + q}h1v1h-1z`; }));
  const label = opts.label ?? 'QR code';
  return `<svg${opts.className ? ` class="${attr(opts.className)}"` : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" role="img" aria-label="${attr(label)}" shape-rendering="crispEdges" data-qr-size="${m.length}" data-qr-quiet="${q}"><rect width="${side}" height="${side}" fill="${attr(opts.light ?? '#ffffff')}"/><path fill="${attr(opts.dark ?? '#000000')}" d="${d}"/></svg>`;
}
