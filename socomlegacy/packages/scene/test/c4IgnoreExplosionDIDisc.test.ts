import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseRdr, parseZdb, rdrGet, zdbSlice, Zar, type RdrNode, type ZarKey } from '@s2u/archive';
import { throwableRecord } from '../src/index';

/**
 * WM-29 (the controller's ruling (a), 2026-11-15; research 430 s4, 235 s1): the room's C4 fixtures are re-cut to the
 * disc's own C4 -- whose round, `C4 Ammo`, carries the bare `IgnoreExplosionDI` (`FUN_003cb1a0` D:L320755-320756: ammo
 * `+0x28 & 2` -> projectile `+5 & 2`), so its blast asks neither line (`FUN_005a0e70` D:L459192-459193, `FUN_003c80e0`
 * D:L319096). The condition of that ruling is held here: EVERY file of the disc that holds an ammunition table (a
 * script with `ZAMMO` rows, in any `.ZAR` on the disc or any `.ZAR` member of a `.ZDB`) is read through the repository's
 * readers (`Zar`, `parseZdb`, `parseRdr`), each one's `C4 Ammo` row must carry the field, and no other row may. The
 * holders are printed by file and script; a file that differs fails by name; an archive or a `.rdr` script the readers
 * refuse is printed as NOT READ and FAILS the test (the fresh review's finding 2: nothing passed over in silence). A
 * `.ZAR` or `.ZED` (the same container) nested in one is opened; `ZAMMO` is sought at any depth of a script. NOT looked
 * into, said here: a `.ZDB` member that is neither, an archive key that is none of `.rdr`, `.zar`, `.zed`, and any file
 * of the disc that is not a `.ZAR`, a `.ZED` or a `.ZDB` -- so what it shows is every ammunition table in a SCRIPT of
 * those archives, not every byte of the disc. The committed byte copy (`test-fixtures/RUN/ZWEAPON.ZAR`) is
 * `projectile.test.ts`'s. A dev-disc test: without `SOCOM_DISC` it is skipped, and a skip is not a pass.
 */

const DISC = process.env.SOCOM_DISC;
const present = !!DISC && existsSync(DISC);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(zar|zed|zdb)$/i.test(name)) out.push(p);
  }
  return out;
}

interface Holder { where: string; rows: number; flagged: string[]; c4: boolean | null }
/**
 * A ZAR's head alone is 100 bytes (`archive/src/zar.ts` HEAD; research 36 s1): a key NAMED like an archive whose bytes
 * are fewer is not one. The first box run (2026-11-15, box/wm-ffblast-census-d78c9ac36) met 3360 of them, every one a
 * 4-byte entry under `file buffersize table/` of a `DBUFFER.ZAR` (the UI's, and COMMON's, each MP map's and each SP
 * mission's inside the `.ZDB`s) named after a `.ZED` file -- a table of sizes, not archives; the reader's refusal of
 * each was "read 4 at 4 beyond 4". They are counted and printed by parent and size, not opened, and not NOT READ.
 */
const ZAR_HEAD = 100;
interface Small { where: string; size: number }

/** Every `ZAMMO` value in the script, at any depth: the node after the key, as the reader holds it. */
function ammoTables(node: RdrNode, out: RdrNode[] = []): RdrNode[] {
  if (typeof node === 'string') return out;
  for (let i = 0; i < node.length; i++) {
    if (node[i] === 'ZAMMO' && i + 1 < node.length) out.push(node[i + 1]!);
    else ammoTables(node[i]!, out);
  }
  return out;
}

/** Every script of the archive with `ZAMMO` rows: its rows' count, the rows that carry the field, and the C4 record's. */
function holdersOf(bytes: Uint8Array, where: string, out: Holder[], notRead: string[], small: Small[]): void {
  const zar = Zar.parse(bytes);
  const visit = (key: ZarKey, path: string): void => {
    const at = path ? `${path}/${key.name}` : key.name;
    if (/\.(zar|zed)$/i.test(key.name) && key.size > 0) {
      if (key.size < ZAR_HEAD) small.push({ where: `${where} -> ${path}`, size: key.size });
      else try { holdersOf(zar.data(key), `${where} -> ${at}`, out, notRead, small); } catch (e) { notRead.push(`${where} -> ${at}: ${(e as Error).message}`); }
    }
    if (/\.rdr$/i.test(key.name) && key.size > 0) {
      let rdr: RdrNode | null = null;
      try { rdr = parseRdr(zar.data(key)); } catch (e) { notRead.push(`${where} -> ${at}: ${(e as Error).message}`); }
      for (const table of rdr === null ? [] : ammoTables(rdr)) {
        // A row is a list with its own InternalName; a table the reader holds as one row is that row.
        const list = Array.isArray(table) ? table as RdrNode[] : [];
        const rows = list.some((r) => Array.isArray(r)) ? list.filter((r) => Array.isArray(r)) : (list.length > 0 ? [list] : []);
        // The second review's finding 3: `rdrGet` finds a key only where a value follows it, so a bare field that ENDS a
        // row would read as absent; the field's own word anywhere in the row counts here.
        const bare = (r: RdrNode): boolean => rdrGet(r, 'IgnoreExplosionDI') !== undefined || (Array.isArray(r) && r.some((x) => x === 'IgnoreExplosionDI'));
        const flagged = rows.filter(bare).map((r) => String(rdrGet(r, 'InternalName')));
        let c4: boolean | null = null;
        try { c4 = throwableRecord(rdr!, 'C4').ignoreExplosionDI === true; } catch { c4 = null; }   // no C4 weapon row in this script
        out.push({ where: `${where} -> ${at}`, rows: rows.length, flagged, c4 });
      }
    }
    for (const child of key.children) visit(child, at);
  };
  for (const child of zar.root.children) visit(child, '');
}

describe.skipIf(!present)('WM-29: C4 Ammo carries IgnoreExplosionDI in every file of the disc that holds an ammunition table (dev-disc)', () => {
  it('every ZAMMO table on the disc: C4 Ammo flagged, nothing else flagged; the holders named', { timeout: 600_000 }, () => {
    const holders: Holder[] = [], notRead: string[] = [], small: Small[] = [];
    let archives = 0;
    for (const path of files(DISC!)) {
      const name = relative(DISC!, path).replace(/\\/g, '/');
      const bytes = new Uint8Array(readFileSync(path));
      if (/\.(zar|zed)$/i.test(path)) {
        archives++;
        try { holdersOf(bytes, name, holders, notRead, small); } catch (e) { notRead.push(`${name}: ${(e as Error).message}`); }
        continue;
      }
      let entries;
      try { entries = parseZdb(bytes); } catch (e) { notRead.push(`${name}: ${(e as Error).message}`); continue; }
      for (const entry of entries) {
        if (!/\.(zar|zed)$/i.test(entry.name)) continue;
        archives++;
        try { holdersOf(zdbSlice(bytes, entry), `${name} >> ${entry.name}`, holders, notRead, small); } catch (e) { notRead.push(`${name} >> ${entry.name}: ${(e as Error).message}`); }
      }
    }
    console.log(`(WM-29 C4 flag) archives read ${archives}, NOT READ ${notRead.length}, ZAMMO tables ${holders.length}`);
    for (const h of holders) console.log(`(WM-29 C4 flag) ${h.where}: ${h.rows} rows, flagged [${h.flagged.join(', ')}], C4's record ${h.c4}`);
    for (const n of notRead) console.log(`(WM-29 C4 flag) NOT READ ${n}`);
    // Keys named like an archive but shorter than a ZAR's head: by the key that holds them (map numbers folded) and size.
    const groups = new Map<string, number>();
    for (const s of small) {
      const key = `${s.where.replace(/\d+/g, 'N')} (${s.size} bytes)`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    console.log(`(WM-29 C4 flag) named like an archive, under ${ZAR_HEAD} bytes, not opened: ${small.length}`);
    for (const [key, count] of groups) console.log(`(WM-29 C4 flag) not an archive x${count}: ${key}`);
    expect(notRead).toEqual([]);
    expect(holders.length).toBeGreaterThan(0);
    const differ = holders.filter((h) => h.flagged.length !== 1 || h.flagged[0] !== 'C4 Ammo' || h.c4 === false);
    expect(differ.map((h) => h.where)).toEqual([]);
    // The one the game loads its kit from must be among them, with the C4 weapon's record flagged.
    const kit = holders.filter((h) => /(^|\/)RUN\/ZWEAPON\.ZAR -> /i.test(h.where));
    expect(kit.length).toBeGreaterThan(0);
    expect(kit.every((h) => h.c4 === true)).toBe(true);
  });
});
