/**
 * Archive-member overrides for the test room (`TEST_ROOM_MODS_ADAPTATION`,
 * `docs/specs/2026-10-18-test-room-mod-loader.md`). A browser adaptation: the disc file is not rebuilt.
 * With nothing installed, a member read returns the same subarray the reader already returned.
 *
 * A map `ZDB` carries its own copies of files that also exist loose (`MP61.ZDB` holds `RUN\COMMON\HUD_PAL.ZED`
 * and `RUN\UI\…`). The map reads those copies. A loose-file override does not change them; a member override does.
 *
 * The archive path is canonicalised the same way `mods/manifest.ts` `canonicalDiscPath` is (upper case, forward
 * slashes). A ZDB member matches the way `zdbEntry` does: case-insensitive, the whole TOC name or a suffix at a
 * `\` or `/`. A ZAR key matches `Zar.find`: the exact path, case included. A key inside a ZDB member is
 * `HUD_PAL.ZED!models/name` — the ZDB member, then the ZAR path.
 */

export interface MemberOverrideBytes {
  /** Disc path of the container (`RUN/MP61.ZDB`, `RUN/SOUNDS/BNKSTORE.ZAR`). */
  archive: string;
  /** The member. A ZDB suffix, a ZAR find path, or `ZDBMEMBER!zar/path` for a key inside a ZDB member. */
  member: string;
  bytes: Uint8Array;
}

interface Row { archive: string; member: string; bytes: Uint8Array }

let rows: Row[] | null = null;
/** Whole archive bytes, or a member slice, to the path those bytes were read as. */
const origins = new WeakMap<Uint8Array, string>();

/** Same path rules as the viewer's `canonicalDiscPath`. A drift here is a member that never matches. */
export function canonicalArchivePath(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 240) return null;
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0 && part !== '.');
  if (parts.length === 0 || parts.length > 16) return null;
  const clean: string[] = [];
  for (const part of parts) {
    if (part === '..') return null;
    const semi = part.indexOf(';');
    const bare = semi >= 0 ? part.slice(0, semi) : part;
    const name = (bare.endsWith('.') ? bare.slice(0, -1) : bare).toUpperCase();
    if (!/^[A-Z0-9_$][A-Z0-9_$.-]{0,79}$/.test(name)) return null;
    clean.push(name);
  }
  return clean.join('/');
}

function normZdb(name: string): string {
  return name.replace(/\\/g, '/').toUpperCase();
}

/** A ZDB TOC name against a mod's member. An inner ZAR key (`left!right`) is not a ZDB member. */
export function zdbMemberMatches(entryName: string, member: string): boolean {
  if (member.includes('!')) return false;
  const entry = normZdb(entryName);
  const want = normZdb(member);
  if (want.length === 0) return false;
  return entry === want || entry.endsWith(`/${want}`);
}

/** Replaces the table. `null` or an empty list turns the hook off. */
export function installMemberOverrides(entries: readonly MemberOverrideBytes[] | null): void {
  if (!entries || entries.length === 0) { rows = null; return; }
  const next: Row[] = [];
  for (const entry of entries) {
    const archive = canonicalArchivePath(entry.archive);
    if (archive && entry.member.length > 0) next.push({ archive, member: entry.member, bytes: entry.bytes });
  }
  rows = next.length > 0 ? next : null;
}

export function memberOverridesActive(): boolean {
  return rows !== null;
}

/** The disc path a whole-archive read belongs to. No table: does nothing, and the bytes are unchanged. */
export function noteMemberArchive(path: string, bytes: Uint8Array): void {
  if (!rows) return;
  const archive = canonicalArchivePath(path);
  if (archive) origins.set(bytes, archive);
}

/** A slice taken out of a tagged archive, so a ZAR parsed from it can see `MEMBER!key` overrides. */
export function noteMemberChild(parent: Uint8Array, entryName: string, child: Uint8Array): void {
  if (!rows) return;
  const archive = origins.get(parent);
  if (!archive || archive.includes('>>')) return;
  origins.set(child, `${archive}>>${normZdb(entryName)}`);
}

/**
 * A ranged read has no whole-archive array to tag. The member bytes themselves carry `archive>>member`,
 * which is what `Zar.parse` reads. No table: does nothing.
 */
export function noteRangedZdbMember(archivePath: string, entryName: string, bytes: Uint8Array): void {
  if (!rows) return;
  const archive = canonicalArchivePath(archivePath);
  if (archive) origins.set(bytes, `${archive}>>${normZdb(entryName)}`);
}

export function memberOriginOf(bytes: Uint8Array): string | undefined {
  return origins.get(bytes);
}

/** The mod bytes for this entry of a tagged archive, or null to keep the disc slice. */
export function findZdbOverride(bytes: Uint8Array, entryName: string): Uint8Array | null {
  const origin = origins.get(bytes);
  if (!origin || origin.includes('>>')) return null;
  return findZdb(origin, entryName);
}

function findZdb(origin: string, entryName: string): Uint8Array | null {
  if (!rows) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.archive === origin && zdbMemberMatches(entryName, row.member)) return row.bytes;
  }
  return null;
}

/** The mod bytes for this ZDB entry, or null when the disc's own slice should be used. */
export function zdbOverrideBytes(archivePath: string, entryName: string): Uint8Array | null {
  const origin = canonicalArchivePath(archivePath);
  return origin ? findZdb(origin, entryName) : null;
}

/**
 * TOC rows a mod adds for this archive. Empty when nothing is installed, or every named member is already in
 * `existing`. `offset` is -1: the bytes are the mod's, and there is no sector to slice.
 */
export function addedZdbEntries(archivePath: string, existing: readonly { name: string }[]): { name: string; offset: number; size: number }[] {
  if (!rows) return [];
  const origin = canonicalArchivePath(archivePath);
  if (!origin) return [];
  const extra: { name: string; offset: number; size: number }[] = [];
  for (const row of rows) {
    if (row.archive !== origin || row.member.includes('!')) continue;
    if (existing.some((entry) => zdbMemberMatches(entry.name, row.member))) continue;
    if (extra.some((entry) => zdbMemberMatches(entry.name, row.member))) continue;
    extra.push({ name: row.member.replace(/\//g, '\\'), offset: -1, size: row.bytes.byteLength });
  }
  return extra;
}

/** Added TOC rows for a tagged whole archive. Empty when those bytes were not read as that archive. */
export function addedZdbEntriesForBytes(bytes: Uint8Array, existing: readonly { name: string }[]): { name: string; offset: number; size: number }[] {
  const origin = origins.get(bytes);
  if (!origin || origin.includes('>>')) return [];
  return addedZdbEntries(origin, existing);
}

/**
 * A ZAR key. `origin` is the loose archive path, or `ARCHIVE>>ZDBMEMBER` for a member of a ZDB.
 * The match is `Zar.find`'s path, exact, including case.
 */
export function zarOverrideBytes(origin: string, keyPath: string): Uint8Array | null {
  if (!rows || keyPath.length === 0) return null;
  const nested = origin.indexOf('>>');
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (nested < 0) {
      if (row.archive === origin && row.member === keyPath) return row.bytes;
      continue;
    }
    const archive = origin.slice(0, nested);
    const container = origin.slice(nested + 2);
    const bang = row.member.indexOf('!');
    if (bang < 0 || row.archive !== archive || row.member.slice(bang + 1) !== keyPath) continue;
    if (zdbMemberMatches(container, row.member.slice(0, bang))) return row.bytes;
  }
  return null;
}

/** A loose archive's member (a ZAR key, or a stream file asked for by name). */
export function looseMemberOverride(archivePath: string, member: string): Uint8Array | null {
  const origin = canonicalArchivePath(archivePath);
  return origin ? zarOverrideBytes(origin, member) : null;
}

/**
 * ZAR find-paths a mod names under `origin` (a loose archive, or `ARCHIVE>>MEMBER`). Replacements are included;
 * the parser skips a path the tree already has, and grafts only a path it does not.
 */
export function addedZarPaths(origin: string): string[] {
  if (!rows) return [];
  const nested = origin.indexOf('>>');
  const out: string[] = [];
  for (const row of rows) {
    if (nested < 0) {
      if (row.archive === origin && !row.member.includes('!')) out.push(row.member);
      continue;
    }
    const archive = origin.slice(0, nested);
    const container = origin.slice(nested + 2);
    const bang = row.member.indexOf('!');
    if (bang < 0 || row.archive !== archive) continue;
    if (!zdbMemberMatches(container, row.member.slice(0, bang))) continue;
    const path = row.member.slice(bang + 1);
    if (path.length > 0) out.push(path);
  }
  return out;
}
