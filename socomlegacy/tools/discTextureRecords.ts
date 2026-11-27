import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseZdb, zdbSlice, Zar } from '@s2u/archive';
import { decodeTexture, PaletteTable, parseTextureRecord } from '@s2u/gs';
import type { HashRecord } from './pcsx2Names';

/**
 * Every texture record on the disc, loose `*_TXR.ZED` and inside every ZDB, each with its own library's `_PAL`
 * (`./hudBitmaps`' rule): the texel bytes as stored, the TEX0 fields, the raw `buf` of the palette its CBP names, and
 * the sha256 of the RGBA the runtime decodes (`decodeTexture`) -- what an HD pack entry is keyed by (HD.R3). One
 * record per distinct (texels, palette, TEX0) triple. Decoded disc data: nothing of it is written into the repository.
 */
export interface DiscTextureRecord extends HashRecord {
  where: string; name: string; tbw: number; tbp0: number; cbp: number; cpsm: number;
  rgbaSha256: string;
  /** The decoded RGBA itself (the recolour of a tier C file reads the record's own colours, `./hdRecolour`). */
  rgba: Uint8ClampedArray;
}

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

function rawPalettes(pal: Uint8Array | undefined): Map<number, { format: number; buf: Uint8Array }> {
  const out = new Map<number, { format: number; buf: Uint8Array }>();
  if (!pal) return out;
  const zar = Zar.parse(pal);
  for (const key of zar.find('palettes')?.children ?? []) {
    const par = zar.child(key, 'par'), buf = zar.child(key, 'buf');
    if (!par || !buf) continue;
    const p = zar.data(par), v = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const id = v.getUint32(0, true);
    if (!out.has(id)) out.set(id, { format: (v.getUint32(4, true) >>> 16) & 0xff, buf: zar.data(buf) });
  }
  return out;
}

/** One archive of texture banks: a directory's loose `*.ZED` or one ZDB's members, read only when asked (WM-50). */
export interface TextureSource {where:string;members:()=>Map<string, () => Uint8Array>}

const walkFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walkFiles(p) : [p]; });

/** Every texture source under a root, in the order `discTextureRecords` reads them: the loose directories, then the ZDBs. */
export function textureSources(disc: string): TextureSource[] {
  const files = walkFiles(disc), out: TextureSource[] = [];
  const byDir = new Map<string, Map<string, () => Uint8Array>>();
  for (const f of files) {
    if (!/\.ZED$/i.test(f)) continue;
    const d = relative(disc, join(f, '..')).replace(/\\/g, '/');
    if (!byDir.has(d)) byDir.set(d, new Map());
    byDir.get(d)!.set(basename(f).toUpperCase(), () => new Uint8Array(readFileSync(f)));
  }
  for (const [d, m] of byDir) out.push({ where: d, members: () => m });
  for (const f of files) {
    if (!/\.ZDB$/i.test(f)) continue;
    out.push({ where: relative(disc, f).replace(/\\/g, '/'), members: () => {
      const bytes = new Uint8Array(readFileSync(f)), m = new Map<string, () => Uint8Array>();
      for (const e of parseZdb(bytes)) m.set(e.name.replace(/^.*[\\/]/, '').toUpperCase(), () => zdbSlice(bytes, e));
      return m;
    } });
  }
  return out;
}

/**
 * The records of one source: each `*_TXR.ZED` with its `_PAL`, de-duplicated against `seen` (one shared set for the
 * whole disc, `discTextureRecords`); `null` keeps every named record, a repeat of another's texels, palette and TEX0
 * included -- how WM-50's per-map coverage counts an archive's records (the HD plan's MP71 row: 56 records, 55 images).
 */
export function sourceRecords(src: TextureSource, warn: (m: string) => void = () => undefined, seen: Set<string> | null = new Set()): DiscTextureRecord[] {
  const out: DiscTextureRecord[] = [], members = src.members();
  for (const [name, read] of members) {
    if (!/_TXR\.ZED$/i.test(name)) continue;
    const pal = members.get(name.replace(/_TXR\.ZED$/i, '_PAL.ZED'));
    try { libraryRecords(`${src.where}/${name}`, read(), pal?.(), seen, out); } catch (e) { warn(`${src.where}/${name}: ${(e as Error).message}`); }
  }
  return out;
}

function libraryRecords(where: string, txr: Uint8Array, pal: Uint8Array | undefined, seen: Set<string> | null, out: DiscTextureRecord[]): void {
  const zar = Zar.parse(txr), palettes = PaletteTable.fromZars(pal ? [Zar.parse(pal)] : []), raw = rawPalettes(pal);
  for (const k of zar.find('textures')?.children ?? []) {
    const dat = zar.child(k, 'texdat');
    if (!dat) continue;
    const rec = parseTextureRecord(k.name, zar.data(dat));
    if (!rec.tex0) continue;
    const t = rec.tex0, p = raw.get(t.cbp);
    const key = `${sha(rec.pixels)}|${p ? sha(p.buf) : ''}|${t.psm}|${t.tw}|${t.th}|${t.csa}|${t.cpsm}`;
    if (seen) { if (seen.has(key)) continue; seen.add(key); }
    const d = decodeTexture(rec, palettes).rgba;
    out.push({
      where: `${where}:${k.name}`, name: k.name, width: rec.width, height: rec.height,
      psm: t.psm, tbw: t.tbw, tbp0: t.tbp0, cbp: t.cbp, tw: t.tw, th: t.th, tcc: t.tcc, csa: t.csa, cpsm: t.cpsm, csm: t.csm,
      pixels: rec.pixels, pal: p?.buf ?? null, palFormat: p?.format ?? null,
      rgbaSha256: sha(new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength)), rgba: d.data,
    });
  }
}

export function discTextureRecords(disc: string, warn: (m: string) => void = () => undefined): DiscTextureRecord[] {
  const seen = new Set<string>();
  return textureSources(disc).flatMap((src) => sourceRecords(src, warn, seen));
}
