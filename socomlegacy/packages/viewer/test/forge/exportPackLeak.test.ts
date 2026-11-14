import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseSceneGraph, placeInstances } from '@s2u/scene';
import {
  canonicalJson, checkThunderstorePackage, readMapPack, THUNDERSTORE_PACKAGE_RULES, validateRules,
} from '@s2u/creator-contracts';
import { decodePngAsync } from '../../src/png';
import { emptyLayout } from '../../src/forge/layout';
import { exportForgePack, type ForgeExportFile, type ForgeExportInput, type ForgeExportResult } from '../../src/forge/exportPack';
import { PLAN_ICON_INKS, PLAN_ICON_PALETTE } from '../../src/forge/planIcon';
import type { ForgeLayout } from '../../src/forge/rulesAuthoring';
import { at, DEPENDENCY, DEPENDENCY_TEAM, dependentYard, discYard, rulesYard } from './exportFixture';

/**
 * FX-11a slice 3 (scope A3 E11; the plan's FX-13; RS.R8, OT.R34; a browser adaptation with no original): NO game data in
 * an export. A layout names disc assets by string id; the player's disc supplies the bytes. Five holds:
 * (a) the member list is a subset of a FIXED allow-list, written here and not read from the module (a widened list in
 *     the source goes red here);
 * (b) every JSON member reads through the contract's strict readers, canonical, the store manifest's keys exactly the
 *     store's -- no field a reader does not know could carry anything;
 * (c) no text member holds a binary byte or a base64-like run past a small bound;
 * (d) the icon's pixels are the palette's only, in three chunks (no text chunk);
 * (e) on the dev disc (`SOCOM_DISC`; skipped, and said so, without it): for a layout over a real map's real props, no
 *     64-byte window of any exported member equals a window of that map's archive.
 * Plus the module graph: the export's modules import nothing that reads the disc.
 */

/** The allow-list, fixed here: exact root names, the folded rules, and one layout. */
const ALLOWED_EXACT = new Set(['s2u-pack.json', 'manifest.json', 'icon.png', 'README.md', 'rules/mode.json']);
const ALLOWED_LAYOUT = /^layouts\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.json$/;
/** The longest run of base64 or base64url characters a text member may hold: past a SHA-256's 64 hex digits, below any blob. */
const BLOB_RUN = 96;
const WINDOW = 64;

const text = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const fileOf = (files: readonly ForgeExportFile[], path: string): Uint8Array => files.find((f) => f.path === path)!.bytes;
const exported = async (layout: ForgeLayout, extra: Partial<Omit<ForgeExportInput, 'layout'>> = {}): Promise<ForgeExportResult & { ok: true }> => {
  const r = await exportForgePack({ layout, id: 'leak.check', version: '1.0.0', team: 'Leak_Check', ...extra });
  if (!r.ok) throw new Error(`refused: ${r.diagnostics.map((d) => d.code).join(', ')}`);
  return r;
};
const CASES: readonly [string, () => Promise<ForgeExportResult & { ok: true }>][] = [
  ['a disc-only layout', async () => exported(discYard())],
  ['a layout with a rules draft', async () => exported(await rulesYard())],
  ['a layout that requires another pack', async () => exported(dependentYard(), { teams: { [DEPENDENCY.id]: DEPENDENCY_TEAM } })],
];

describe('FX-11a leak (a): an export holds only the allow-listed members', () => {
  it.each(CASES)('%s', async (_name, make) => {
    const r = await make();
    const paths = r.files.map((f) => f.path);
    expect(paths.filter((p) => !ALLOWED_EXACT.has(p) && !ALLOWED_LAYOUT.test(p))).toEqual([]);
    expect(paths.filter((p) => ALLOWED_LAYOUT.test(p)).length).toBe(1);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('FX-11a leak (b): every JSON member reads through a strict reader, canonical', () => {
  it.each(CASES)('%s', async (_name, make) => {
    const r = await make();
    // s2u-pack.json and the layout: the pack validator (unknown keys refused) and the record reader (strict v3).
    const read = await readMapPack(r.files);
    expect(read.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
    expect(read.ok).toBe(true);
    for (const f of r.files) {
      if (f.path === 'icon.png' || f.path === 'README.md') continue;
      const raw = JSON.parse(text(f.bytes)) as unknown;
      // Ours are canonical (`canonicalJson`): no whitespace or key order a reader skips could hide a byte in.
      if (f.path !== 'manifest.json') expect(text(f.bytes), f.path).toBe(canonicalJson(raw));
      if (f.path === 'rules/mode.json') expect(validateRules(raw).status).toBe('pass');
      if (f.path === 'manifest.json') {
        expect(Object.keys(raw as object).sort()).toEqual([...THUNDERSTORE_PACKAGE_RULES.manifestKeys].sort());
        expect(checkThunderstorePackage(r.files).status).toBe('pass');
      }
    }
  });
});

describe('FX-11a leak (c): no text member holds a binary byte or a long base64-like run', () => {
  it.each(CASES)('%s', async (_name, make) => {
    const r = await make();
    for (const f of r.files) {
      if (f.path === 'icon.png') continue;
      const s = text(f.bytes);                                         // throws on any byte that is not UTF-8
      expect(/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s), `${f.path}: a control byte`).toBe(false);
      const longest = Math.max(0, ...(s.match(/[A-Za-z0-9+/=_-]+/g) ?? []).map((run) => run.length));
      expect(longest, `${f.path}: its longest base64-like run`).toBeLessThanOrEqual(BLOB_RUN);
    }
  });
});

describe('FX-11a leak (d): the icon is the palette only, in three chunks', () => {
  const palette = new Set(PLAN_ICON_INKS.map((ink) => PLAN_ICON_PALETTE[ink].join(',')));
  it.each(CASES)('%s', async (_name, make) => {
    const r = await make();
    const png = fileOf(r.files, 'icon.png');
    const decoded = await decodePngAsync(png);
    let off = 0;
    for (let i = 0; i < decoded.data.length; i += 4) if (!palette.has(`${decoded.data[i]},${decoded.data[i + 1]},${decoded.data[i + 2]},${decoded.data[i + 3]}`)) off++;
    expect(off).toBe(0);
    const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const types: string[] = [];
    for (let p = 8; p < png.length; p += 12 + v.getUint32(p)) types.push(String.fromCharCode(...png.subarray(p + 4, p + 8)));
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
});

describe('FX-11a leak: the export modules import nothing that reads the disc', () => {
  const src = (rel: string): string => readFileSync(resolve(import.meta.dirname, '../../src', rel), 'utf8');
  /** The value imports a source names (`import type` is erased, so it is left out). */
  const valueImports = (code: string): string[] => [...code.matchAll(/^import\s+(type\s+)?[^'";]*?\bfrom\s+['"]([^'"]+)['"]/gm)].filter((m) => !m[1]).map((m) => m[2]!);
  const GRAPH: Record<string, readonly string[]> = {
    'forge/exportPack.ts': ['@s2u/creator-contracts', '../../../playtest/src/zip', './planIcon', './rulesAuthoring'],
    'forge/planIcon.ts': ['../console/rgbaPng'],
    'console/rgbaPng.ts': ['../png'],
    'png.ts': [],
    'forge/rulesAuthoring.ts': ['@s2u/creator-contracts'],
    '../../playtest/src/zip.ts': [],
  };
  it.each(Object.entries(GRAPH))('%s imports only %j', (file, allowed) => {
    const code = src(file);
    expect(valueImports(code).sort()).toEqual([...allowed].sort());
    expect(/\bimport\s*\(/.test(code), `${file}: a dynamic import`).toBe(false);
    expect(/\brequire\s*\(/.test(code), `${file}: a require`).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (e) The window scan: no 64-byte window of an export equals one of the map's archive.
// ---------------------------------------------------------------------------------------------------------------------

const B = 257;
const BW = (() => { let p = 1; for (let i = 0; i < WINDOW - 1; i++) p = Math.imul(p, B) >>> 0; return p; })();
const hashAt = (bytes: Uint8Array, at: number): number => {
  let h = 0;
  for (let i = 0; i < WINDOW; i++) h = (Math.imul(h, B) + bytes[at + i]!) >>> 0;
  return h;
};
/** Too plain to tell a copy from chance (a run of one colour, of zeros): fewer than 12 distinct byte values. */
const plain = (bytes: Uint8Array, at: number): boolean => new Set(bytes.subarray(at, at + WINDOW)).size < 12;
/**
 * Every place a window of `archive`, taken every `WINDOW` bytes, equals a window of a member at any offset. Any copy of
 * 2 x WINDOW - 1 bytes or more holds one archive window whole at a multiple of WINDOW, so it is found; a plain window is
 * skipped (its match would be chance).
 */
function sharedWindows(members: readonly ForgeExportFile[], archive: Uint8Array): string[] {
  const index = new Map<number, [number, number][]>();
  members.forEach((m, k) => {
    const b = m.bytes;
    if (b.length < WINDOW) return;
    let h = hashAt(b, 0);
    for (let i = 0; ; i++) {
      (index.get(h) ?? index.set(h, []).get(h)!).push([k, i]);
      if (i + WINDOW >= b.length) break;
      h = (Math.imul((h - Math.imul(b[i]!, BW)) >>> 0, B) + b[i + WINDOW]!) >>> 0;
    }
  });
  const found: string[] = [];
  for (let a = 0; a + WINDOW <= archive.length; a += WINDOW) {
    const hits = index.get(hashAt(archive, a));
    if (!hits || plain(archive, a)) continue;
    for (const [k, i] of hits) {
      const m = members[k]!.bytes;
      let same = true;
      for (let j = 0; j < WINDOW && same; j++) same = m[i + j] === archive[a + j];
      if (same) found.push(`${members[k]!.path}@${i} = archive@${a}`);
    }
  }
  return found;
}

describe('FX-11a leak (e): the window scan finds a planted copy (no disc: synthetic bytes)', () => {
  let seed = 7;
  const noise = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) & 0xff);
  const archive = noise(200_000);
  it('a member holding 127 bytes of the archive is caught; one holding none is not', () => {
    const copy = new Uint8Array(400);
    copy.set(noise(100), 0); copy.set(archive.subarray(5001, 5001 + 127), 100); copy.set(noise(173), 227);
    expect(sharedWindows([{ path: 'layouts/x.json', bytes: copy }], archive).length).toBeGreaterThan(0);
    expect(sharedWindows([{ path: 'layouts/x.json', bytes: noise(4000) }], archive)).toEqual([]);
  });
});

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const STEM = 'MP2';
const ARCHIVE = DISC ? join(DISC, 'RUN', `${STEM}.ZDB`) : '';
const HAVE_DISC = DISC !== '' && existsSync(ARCHIVE);
const MODEL = /^[A-Za-z0-9_.-]{1,64}$/;

describe.skipIf(!HAVE_DISC)('FX-11a leak (e): no window of an export over a real map is a window of its archive (dev disc)', () => {
  it(`a layout over ${STEM} placing its own props: no member and not the zip shares a 64-byte window with ${STEM}.ZDB`, async () => {
    const bytes = new Uint8Array(readFileSync(ARCHIVE));
    const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), `${STEM}_GEO.ZED`)));
    const placed = placeInstances(models, 'worldmodel')
      .filter((p) => p.modelName !== 'worldmodel' && MODEL.test(p.modelName) && [12, 13, 14].every((i) => Number.isFinite(p.world[i]) && Math.abs(p.world[i]!) < 90_000))
      .slice(0, 48);
    expect(placed.length).toBeGreaterThan(0);
    const layout: ForgeLayout = {
      ...emptyLayout({ kind: 'map', archive: STEM }), name: 'Disc props',
      pieces: placed.map((p) => ({ asset: `${STEM}:${p.modelName}`, m: at(p.world[12]!, p.world[13]!, p.world[14]!) })),
      spawns: [{ team: 'A', p: [placed[0]!.world[12]!, placed[0]!.world[13]!, placed[0]!.world[14]!], yaw: 0 }],
    };
    const r = await exported(layout);
    expect(sharedWindows([...r.files, { path: '(the zip)', bytes: r.zip }], bytes)).toEqual([]);
  });
});
