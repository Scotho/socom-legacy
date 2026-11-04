import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseZdb, zdbSlice, Zar } from '@s2u/archive';
import { decodeTexture, PaletteTable, parseTextureRecord } from '@s2u/gs';
import { encodePng } from './png';

/**
 * Every texture library on the disc decoded the way the runtime decodes it (`decodeTexture(record, palettes)`, the
 * default orders), each `X_TXR.ZED` against its own `X_PAL.ZED` (`./hudBitmaps`' rule), loose files and the members of
 * every ZDB alike. One PNG per distinct decoded image, named by the sha256 of its RGBA bytes, and `index.json` listing
 * where each was found. Decoded disc data: the output directory must sit outside the repository.
 * Usage: tsx tools/dump-all-textures.ts <disc root> <out dir>
 */
const [disc, outArg] = process.argv.slice(2);
if (!disc || !outArg) { console.error('usage: dump-all-textures.ts <disc root> <out dir>'); process.exit(2); }
const out: string = outArg;
mkdirSync(out, { recursive: true });

interface Seen { sha: string; width: number; height: number; bpp: number; alpha: 'opaque' | 'binary' | 'graded'; where: string[] }
const seen = new Map<string, Seen>();
let decoded = 0, failed = 0;

const alphaOf = (d: Uint8Array | Uint8ClampedArray): Seen['alpha'] => {
  let binary = true, opaque = true;
  for (let i = 3; i < d.length; i += 4) { const a = d[i]!; if (a !== 255) opaque = false; if (a !== 0 && a !== 255) { binary = false; break; } }
  return opaque ? 'opaque' : binary ? 'binary' : 'graded';
};

function library(where: string, txr: Uint8Array, pal: Uint8Array | undefined): void {
  let zar: Zar, palettes: PaletteTable;
  try { zar = Zar.parse(txr); palettes = PaletteTable.fromZars(pal ? [Zar.parse(pal)] : []); } catch { failed++; return; }
  for (const k of zar.find('textures')?.children ?? []) {
    const dat = zar.child(k, 'texdat');
    if (!dat) continue;
    try {
      const rec = parseTextureRecord(k.name, zar.data(dat));
      const { rgba } = decodeTexture(rec, palettes);
      const sha = createHash('sha256').update(rgba.data).digest('hex');
      decoded++;
      const s = seen.get(sha);
      if (s) { if (s.where.length < 64) s.where.push(`${where}:${k.name}`); continue; }
      seen.set(sha, { sha, width: rgba.width, height: rgba.height, bpp: rec.bpp, alpha: alphaOf(rgba.data), where: [`${where}:${k.name}`] });
      writeFileSync(join(out, `${sha}.png`), encodePng(rgba.width, rgba.height, rgba.data));
    } catch { failed++; }
  }
}

/** Pairs each `*_TXR.ZED` of a member set with its `*_PAL.ZED`. */
function pairs(where: string, members: Map<string, () => Uint8Array>): void {
  for (const [name, read] of members) {
    if (!/_TXR\.ZED$/i.test(name)) continue;
    const pal = members.get(name.replace(/_TXR\.ZED$/i, '_PAL.ZED'));
    library(`${where}/${name}`, read(), pal?.());
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const files = walk(disc);
// Loose libraries, grouped by folder.
const byDir = new Map<string, Map<string, () => Uint8Array>>();
for (const f of files) {
  if (!/\.ZED$/i.test(f)) continue;
  const d = relative(disc, join(f, '..')).replace(/\\/g, '/');
  if (!byDir.has(d)) byDir.set(d, new Map());
  byDir.get(d)!.set(basename(f).toUpperCase(), () => new Uint8Array(readFileSync(f)));
}
for (const [d, m] of byDir) pairs(d, m);
// Every ZDB's members (the maps and missions carry COMMON/*, HUD2, FLIB, CLIB ... inside).
for (const f of files) {
  if (!/\.ZDB$/i.test(f)) continue;
  const bytes = new Uint8Array(readFileSync(f));
  const toc = parseZdb(bytes);
  const m = new Map<string, () => Uint8Array>();
  for (const e of toc) m.set(e.name.replace(/^.*[\\/]/, '').toUpperCase(), () => zdbSlice(bytes, e));
  pairs(relative(disc, f).replace(/\\/g, '/'), m);
}
writeFileSync(join(out, 'index.json'), JSON.stringify([...seen.values()]));
const by = (k: Seen['alpha']) => [...seen.values()].filter((s) => s.alpha === k).length;
console.log(JSON.stringify({ decoded, distinct: seen.size, failed, opaque: by('opaque'), binary: by('binary'), graded: by('graded') }));
