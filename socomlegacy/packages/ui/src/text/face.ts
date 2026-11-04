import type { RdrNode } from '@s2u/archive';
import { RdrLookup } from '../rdrLookup';
import { fadd, fmul } from './f32';

/**
 * A face of `fonts.rdr` as the engine loads it (web research 111 §1; `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`). The file is `RUN/READERC.ZAR/fonts.rdr` (`FONTS_RDR` in `@s2u/scene`, research 95 §5.1);
 * a dialog's face is loaded by name from its `faces` list by `FUN_00359c40` (D:L255324-255480), every glyph through
 * `FUN_0035bef0` (D:L256760-256886), its elements through `FUN_0035bd80` / `FUN_0035c2c0` / `FUN_0035aa80`.
 *
 * This is the engine's reading, not `@s2u/scene`'s `parseFontFaces` (which keeps one element per record and takes the
 * first of a repeated code): the glyphs live in a map keyed by code, filled through its `operator[]` (`FUN_0035c3a0`),
 * so a code listed twice is ONE glyph -- the second record's elements appended to the first's, its scalar fields
 * written over them (research 111 §1.2; `font_text_01` lists code 96 twice).
 */

/** One element of a glyph (`FUN_0035c2c0` D:L256891-256910 and `FUN_0035aa80` D:L256009-256041). */
export interface GlyphElement {
  /** `UL` and `LR`, texels, top row first, as written. */
  ul: [number, number];
  lr: [number, number];
  /** LR.x - UL.x (element +2). */
  width: number;
  /**
   * The quad's height in texel rows: (texH - UL.y - 1) - (texH - LR.y) = LR.y - UL.y - 1 (element +4 minus +6, the
   * atlas addressed bottom row first). The quad samples rows UL.y + 1 .. LR.y - 1; row UL.y is not drawn.
   */
  height: number;
  /** `DispPos` as written, truncated to ints (`FUN_0035a180`); the engine stores -y (element +10 = -DispPos.y). */
  disp: [number, number];
  /** `HorScale`, `VertScale`: default 1 (D:L256026-256031). */
  hscale: number;
  vscale: number;
}

/** A glyph of a face's map (the 0x30-byte record at the map node + 0x10). */
export interface TextGlyph {
  code: number;
  /** 0-based into the face's `textures` (`texture` - 1, D:L256783-256793; default `texture` 1). */
  texture: number;
  baseline: number;
  /** `lKerning` (+0x14) and `rKerning` (+0x16): read, default 0; the disc's faces carry neither. */
  lKerning: number;
  rKerning: number;
  /** +0x10: -1 from the constructor, 8 for code 32 (D:L256869-256871); read only by the TELETYPE's append (`FUN_00362e00`). */
  advance: number;
  /** `color`: the glyph is drawn in it at the string's alpha, with no drop shadow (D:L256860-256868). */
  color: [number, number, number] | null;
  elements: GlyphElement[];
}

export interface TextFace {
  name: string;
  /** `texture`, else `textures` (`FUN_0032f200`, a lookup in the face's own list only; D:L255362-255397). */
  textures: string[];
  /** +0x30 `opacity` (default 1), +0x34 `scale` (default 1), +0x28 `xspacing` (int, 0). */
  opacity: number;
  scale: number;
  xspacing: number;
  /** +0x20 `topy`, +0x24 `boty` (ints, 0): only the TELETYPE's cursor reads them (`FUN_00378c00` D:L272829-272882). */
  topy: number;
  boty: number;
  /** +0x1c `glowtexture`: read, never drawn by the text path (research 111 §4); the disc's faces carry none. */
  glowTexture: string | null;
  /** `Korean` (+0x38): the Hangul composition table (`FUN_003599d0`), used for codes 0xAC00-0xD7A3; the disc's faces carry none. */
  korean: boolean;
  /** `dropshadow` (+0x3c): `offset` truncated to ints (+0x40/+0x44), `color` (+0x48), `opacity` (+0x54, default 1). */
  shadow: { offset: [number, number]; color: [number, number, number]; opacity: number } | null;
  /** The glyph map, by code. */
  glyphs: ReadonlyMap<number, TextGlyph>;
}

/** `FUN_0032f200`: the value after `key` among the list's own elements (no descent); undefined when absent. */
function shallow(node: RdrNode | undefined, key: string): RdrNode | undefined {
  if (!Array.isArray(node)) return undefined;
  for (let i = 0; i < node.length; i++) if (node[i] === key) return i + 1 < node.length ? node[i + 1] : [];
  return undefined;
}

const numberOf = (n: RdrNode | undefined): number => {
  const v = typeof n === 'string' ? Number(n) : NaN;
  return Number.isFinite(v) ? v : 0;
};
/** `FUN_0035a180`: element `i` of a list as an int (a float truncated, anything else 0). */
const intAt = (n: RdrNode | undefined, i: number): number => (Array.isArray(n) ? Math.trunc(numberOf(n[i])) : 0);

/** The names in a `fonts.rdr`'s `faces` list, in file order. */
export function faceNames(root: RdrNode): string[] {
  const faces = new RdrLookup().list(root, 'faces') ?? [];
  const out: string[] = [];
  for (let i = 0; i + 1 < faces.length; i++) if (typeof faces[i] === 'string' && Array.isArray(faces[i + 1])) out.push(faces[i++] as string);
  return out;
}

/**
 * `FUN_00359c40`: the face `name` of a parsed `fonts.rdr`. A name the file lacks gives an empty face (no textures, no
 * glyphs: its text draws nothing), as the engine's lookups of a null record all fail.
 */
export function readTextFace(root: RdrNode, name: string): TextFace {
  const q = new RdrLookup();
  const rec = q.find(q.find(root, 'faces'), name);
  const texNode = shallow(rec, 'texture') ?? shallow(rec, 'textures');
  const textures = (Array.isArray(texNode) ? texNode : []).filter((t): t is string => typeof t === 'string');
  const shadowNode = shallow(rec, 'dropshadow');
  const offset = shallow(shadowNode, 'offset');
  const face: TextFace = {
    name, textures,
    opacity: q.float(rec, 'opacity') ?? 1,
    scale: q.float(rec, 'scale') ?? 1,
    xspacing: q.int(rec, 'xspacing') ?? 0,
    topy: q.int(rec, 'topy') ?? 0,
    boty: q.int(rec, 'boty') ?? 0,
    glowTexture: q.str(rec, 'glowtexture'),
    korean: shallow(rec, 'Korean') !== undefined,
    shadow: shadowNode === undefined ? null : {
      offset: [intAt(offset, 0), intAt(offset, 1)],
      color: q.float3(shadowNode, 'color') ?? [0, 0, 0],
      opacity: q.float(shadowNode, 'opacity') ?? 1,
    },
    glyphs: new Map(),
  };
  const map = face.glyphs as Map<number, TextGlyph>;
  for (const g of q.list(rec, 'charoffsets') ?? []) readGlyph(q, map, g);
  return face;
}

/** Every face a `fonts.rdr` names, read as the engine reads each. */
export function readTextFaces(root: RdrNode): TextFace[] {
  return faceNames(root).map((n) => readTextFace(root, n));
}

function element(q: RdrLookup, ul: RdrNode | undefined, lr: RdrNode | undefined, rec: RdrNode | null): GlyphElement {
  const u: [number, number] = [intAt(ul, 0), intAt(ul, 1)], l: [number, number] = [intAt(lr, 0), intAt(lr, 1)];
  const disp = rec === null ? undefined : q.find(rec, 'DispPos');
  return {
    ul: u, lr: l, width: l[0] - u[0], height: l[1] - u[1] - 1,
    disp: [intAt(disp, 0), intAt(disp, 1)],
    hscale: rec === null ? 1 : q.float(rec, 'HorScale') ?? 1,
    vscale: rec === null ? 1 : q.float(rec, 'VertScale') ?? 1,
  };
}

/**
 * SHORT_GLYPH_CODE_READING: the code of a short-form record (no `Code`). `FUN_0035bef0` (D:L256806-256820) takes the
 * record's first node by its type: an int node (1) its value, a string (3) its first byte, any other node 0.
 * `parseRdr` keeps no node types (TOKEN_TYPE_READING, research 105 §1) and writes a float as its shortest spelling, so
 * an integer-spelled token is read as an int, another number-spelled one as a float (0), any other as a string -- a
 * string "5" (53 in the engine) or a float 5.0 (0) would read as 5. Unreachable on the disc: all 351 records of
 * `fonts.rdr` carry `Code` (research 111 §1.2).
 */
export const SHORT_GLYPH_CODE_READING = 'an integer-spelled token an int node, another number a float (0), else a string (its first byte)';

/** `FUN_0035bef0`: one `charoffsets` record into the map. */
function readGlyph(q: RdrLookup, map: Map<number, TextGlyph>, rec: RdrNode): void {
  const texture = (q.int(rec, 'texture') ?? 1) - 1;
  let code = q.int(rec, 'Code');
  const short = code === null;
  if (short) {
    // The short form (no `Code`): the record's first element is the code (SHORT_GLYPH_CODE_READING).
    const first = Array.isArray(rec) ? rec[0] : undefined;
    code = typeof first !== 'string' ? 0
      : /^[-+]?\d+$/.test(first.trim()) ? Number(first)
        : first.trim() !== '' && Number.isFinite(Number(first)) ? 0
          : first.charCodeAt(0) || 0;
  }
  code = code! & 0xffff;
  let g = map.get(code);
  if (!g) {
    g = { code, texture, baseline: 0, lKerning: 0, rKerning: 0, advance: -1, color: null, elements: [] };
    map.set(code, g);
  }
  if (short) {
    const list = Array.isArray(rec) ? rec : [];
    g.elements.push(element(q, list[1], list[2], null));
  } else {
    for (const el of q.list(rec, 'Elems') ?? []) g.elements.push(element(q, q.find(el, 'UL'), q.find(el, 'LR'), el));
  }
  g.texture = texture;
  g.baseline = q.int(rec, 'baseline') ?? 0;
  g.lKerning = q.int(rec, 'lKerning') ?? 0;
  g.rKerning = q.int(rec, 'rKerning') ?? 0;
  if (q.has(rec, 'color')) {
    const c = q.float3(rec, 'color') ?? [0, 0, 0];
    g.color = [Math.trunc(c[0]), Math.trunc(c[1]), Math.trunc(c[2])];
  }
  if (code === 0x20) g.advance = 8;
}

/**
 * `FUN_0035a3a0` (D:L255682-255798): the glyph a code draws with. The map's own glyph; none for 0x0D (a carriage
 * return draws and advances nothing); a Hangul syllable through the `Korean` table when the face has one (not modelled:
 * the disc's faces have none, so it falls through); otherwise the glyph of the letter `'A' + code % 26`, and when the
 * face lacks that too, the map's first glyph (`UNKNOWN_GLYPH_LAST_RESORT_READING`). `fallback` says which was used.
 */
export function lookupGlyph(face: TextFace, code: number): { glyph: TextGlyph | null; fallback: 'none' | 'letter' | 'first' } {
  const own = face.glyphs.get(code & 0xffff);
  if (own) return { glyph: own, fallback: 'none' };
  if ((code & 0xffff) === 0x0d) return { glyph: null, fallback: 'none' };
  const letter = face.glyphs.get(((code & 0xffff) % 26) + 0x41);
  if (letter) return { glyph: letter, fallback: 'letter' };
  if (face.glyphs.size === 0) return { glyph: null, fallback: 'none' };
  return { glyph: face.glyphs.get(Math.min(...face.glyphs.keys()))!, fallback: 'first' };
}

/**
 * UNKNOWN_GLYPH_LAST_RESORT_READING: when neither the code nor its letter is in the map, `FUN_0035a3a0` returns the
 * glyph at the map header's +0xc (D:L255757-255770), read as the tree's leftmost node -- the lowest code. Unreachable
 * on the disc's faces, which hold every letter A-Z.
 */
export const UNKNOWN_GLYPH_LAST_RESORT_READING = 'lowest code' as const;

/** `FUN_0035a7b0` (D:L255868-255889): a glyph's width, the largest `int(DispPos.x + width x HorScale)` of its elements. */
export function glyphWidth(g: TextGlyph): number {
  let w = 0;
  for (const e of g.elements) w = Math.max(w, Math.trunc(fadd(e.disp[0], fmul(e.width, e.hscale))));
  return w;
}
