/**
 * A test-room mod manifest (`mod.json`). A browser adaptation with no original (`TEST_ROOM_MODS_ADAPTATION`,
 * `docs/specs/2026-10-18-test-room-mod-loader.md`): the disc stays the game's data, and a mod only names files the
 * test room may substitute. Nothing here runs the file's bytes.
 */

export const MOD_FORMAT = 's2u-mod';
export const MOD_FORMAT_VERSION = 1;
/** The only game this loader will apply a mod to: SOCOM II (US) retail r0001. */
export const MOD_GAME_TARGET = 'socom2-us-r0001';

export const MOD_LIMITS = {
  files: 32,
  manifestBytes: 64 * 1024,
} as const;

export class ModManifestError extends Error {
  constructor(reason: string) {
    super(`mod.json: ${reason}`);
    this.name = 'ModManifestError';
  }
}

export interface ModFileOverride {
  kind: 'file';
  /** Disc path, upper case, forward slashes (`NOTES/HELLO.TXT`). */
  path: string;
  /** Path of the bytes inside the mod package (`HELLO.TXT`). */
  file: string;
}

export interface ModMemberOverride {
  kind: 'member';
  /** Disc path of the container (`RUN/MP61.ZDB`). */
  archive: string;
  /**
   * The member. A ZDB name or suffix (`HUD_PAL.ZED`, `RUN\COMMON\HUD_PAL.ZED`), a ZAR find path (`a.bnk`),
   * or a key inside a ZDB member (`HUD_PAL.ZED!models/name`).
   */
  member: string;
  /** Path of the bytes inside the mod package. */
  file: string;
}

export type ModEntry = ModFileOverride | ModMemberOverride;

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  target: string;
  files: readonly ModEntry[];
}

function fail(reason: string): never {
  throw new ModManifestError(reason);
}
const PRINTABLE = /^[\x20-\x7e]+$/;

/** A disc path in the form `IsoAssetSource` looks a file up: upper case, no `..`, forward slashes. */
export function canonicalDiscPath(path: string): string | null {
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

/** A path inside the package. Case is kept. `.` segments are dropped; `..` is refused. */
export function canonicalPackagePath(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 240) return null;
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0 && part !== '.');
  if (parts.length === 0 || parts.length > 16) return null;
  for (const part of parts) {
    if (part === '..' || !/^[\x20-\x7e]{1,128}$/.test(part)) return null;
  }
  return parts.join('/');
}

function text(value: unknown, field: string, min: number, max: number): string {
  const span = min === 0 ? `at most ${max}` : `${min}-${max}`;
  if (typeof value !== 'string') fail(`${field} must be ${span} printable characters`);
  if (value.length < min || value.length > max || (value.length > 0 && !PRINTABLE.test(value))) {
    fail(`${field} must be ${span} printable characters`);
  }
  return value;
}

/** A member name: a ZDB suffix or path, a ZAR find path, or `MEMBER!zar/path`. Case of a ZAR path is kept. */
function canonicalMember(value: unknown, index: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !PRINTABLE.test(value)) {
    fail(`files[${index}].member must name the member, such as HUD_PAL.ZED`);
  }
  const bang = value.indexOf('!');
  const left = bang >= 0 ? value.slice(0, bang) : value;
  const right = bang >= 0 ? value.slice(bang + 1) : null;
  if (left.length === 0 || left.includes('!') || canonicalDiscPath(left) === null) {
    fail(`files[${index}].member must name the member, such as HUD_PAL.ZED`);
  }
  if (right !== null) {
    if (right.length === 0 || right.includes('!') || right.includes('\\')) {
      fail(`files[${index}].member must name the member, such as HUD_PAL.ZED`);
    }
    const parts = right.split('/');
    if (parts.length > 16 || parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
      fail(`files[${index}].member must name the member, such as HUD_PAL.ZED`);
    }
  }
  return value;
}

function present(value: string | null, reason: string): string {
  if (value === null) fail(reason);
  return value;
}

/** Parses a manifest object. Every failure is a `ModManifestError` whose message starts `mod.json:`. */
export function parseModManifest(raw: unknown): ModManifest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail('the manifest must be a JSON object');
  const o = raw as Record<string, unknown>;
  if (o.format !== MOD_FORMAT) fail(`format must be "${MOD_FORMAT}"`);
  if (o.formatVersion !== MOD_FORMAT_VERSION) fail(`formatVersion must be ${MOD_FORMAT_VERSION}`);
  const id = text(o.id, 'id', 1, 64);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) {
    fail('id must be 1-64 characters of a-z, 0-9 and hyphens, and must not start or end with a hyphen');
  }
  const name = text(o.name, 'name', 1, 48);
  const version = text(o.version, 'version', 1, 32);
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(version)) fail('version must be letters, digits, dots, plus or hyphen');
  const author = text(o.author, 'author', 1, 64);
  const description = text(o.description, 'description', 0, 400);
  if (o.target !== MOD_GAME_TARGET) fail(`target must be "${MOD_GAME_TARGET}" (this loader reads SOCOM II US r0001)`);
  const listed = o.files;
  if (!Array.isArray(listed) || listed.length < 1 || listed.length > MOD_LIMITS.files) {
    fail(`files must be a list of 1 to ${MOD_LIMITS.files} overrides`);
  }
  const files: ModEntry[] = [];
  const paths = new Set<string>();
  for (let i = 0; i < listed.length; i++) {
    const entry = listed[i];
    if (entry === null || entry === undefined || typeof entry !== 'object' || Array.isArray(entry)) fail(`files[${i}] must be an object`);
    const row = entry as Record<string, unknown>;
    const file = present(
      canonicalPackagePath(typeof row.file === 'string' ? row.file : ''),
      `files[${i}].file must be a file inside the package, not mod.json`,
    );
    if (file.toLowerCase() === 'mod.json') fail(`files[${i}].file must be a file inside the package, not mod.json`);
    const hasPath = typeof row.path === 'string';
    const hasMember = typeof row.archive === 'string' || typeof row.member === 'string';
    if (hasPath && hasMember) fail(`files[${i}] names a disc path and an archive member; use one`);
    if (!hasPath && !hasMember) fail(`files[${i}] needs a path, or an archive and a member`);
    if (hasPath) {
      const path = present(
        canonicalDiscPath(row.path as string),
        `files[${i}].path must be a disc path such as NOTES/HELLO.TXT (no "..", not absolute)`,
      );
      if (paths.has(path)) fail(`files[${i}].path repeats ${path}`);
      paths.add(path);
      files.push({ kind: 'file', path, file });
      continue;
    }
    const archive = present(
      canonicalDiscPath(typeof row.archive === 'string' ? row.archive : ''),
      `files[${i}].archive must be a disc path such as RUN/MP61.ZDB`,
    );
    const member = canonicalMember(row.member, i);
    const key = `${archive}!${member}`;
    if (paths.has(key)) fail(`files[${i}] repeats ${archive} member ${member}`);
    paths.add(key);
    files.push({ kind: 'member', archive, member, file });
  }
  return { id, name, version, author, description, target: MOD_GAME_TARGET, files };
}

/** Parses the `mod.json` file's bytes. */
export function parseModManifestBytes(bytes: Uint8Array): ModManifest {
  if (bytes.byteLength > MOD_LIMITS.manifestBytes) fail(`mod.json is over ${MOD_LIMITS.manifestBytes} bytes`);
  const textBody = new TextDecoder('utf-8', { fatal: false }).decode(bytes.byteLength > 0 && bytes[0] === 0xef ? bytes.subarray(3) : bytes);
  let raw: unknown;
  try { raw = JSON.parse(textBody); } catch (e) { fail(`not JSON (${e instanceof Error ? e.message : String(e)})`); }
  return parseModManifest(raw);
}
