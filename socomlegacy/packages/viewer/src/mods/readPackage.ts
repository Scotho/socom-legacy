/**
 * A mod package the visitor picked: a zip, or a folder's files. Read in the browser. Nothing is fetched.
 * (`TEST_ROOM_MODS_ADAPTATION`.)
 */
import { ZIP_LIMITS as ZIP_READER_LIMITS, ZipError, openZip, bytesSource, type ZipLimits } from '../zipReader';
import { MOD_LIMITS, canonicalPackagePath } from './manifest';

export interface ModPackage {
  label: string;
  files: ReadonlyMap<string, Uint8Array>;
}

/**
 * A map archive is about 16 MiB and `SOUNDS/BNKSTORE.ZAR` is 64 MiB. The zip reader's own bounds cover those.
 * How many files a package may name is the manifest's. A full browser store is the quota error, not a size cap.
 */
const ZIP_LIMITS: ZipLimits = { ...ZIP_READER_LIMITS, members: MOD_LIMITS.files + 1 };

export class ModPackageError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ModPackageError';
  }
}

/** `mod.json` at the package root, or inside the one folder a zipped directory adds. Other roots are refused. */
export function rootedPackage(entries: readonly { path: string; bytes: Uint8Array }[]): ModPackage['files'] {
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const path = canonicalPackagePath(entry.path);
    if (!path || path.endsWith('/')) continue;
    if (files.has(path)) throw new ModPackageError(`${path} is listed twice`);
    files.set(path, entry.bytes);
  }
  if (files.has('mod.json')) return files;
  const nests = [...files.keys()].filter((name) => name.endsWith('/mod.json'));
  if (nests.length === 0) throw new ModPackageError('mod.json is missing');
  if (nests.length > 1) throw new ModPackageError('mod.json appears in more than one folder');
  const root = nests[0]!.slice(0, -'mod.json'.length);
  const stripped = new Map<string, Uint8Array>();
  for (const [name, bytes] of files) {
    if (!name.startsWith(root)) throw new ModPackageError(`${name} is outside ${root}`);
    stripped.set(name.slice(root.length), bytes);
  }
  return stripped;
}

export function modPackageFromEntries(label: string, entries: readonly { path: string; bytes: Uint8Array }[]): ModPackage {
  return { label, files: rootedPackage(entries.map((entry) => ({ path: entry.path, bytes: entry.bytes.slice() }))) };
}

export async function modPackageFromZip(label: string, bytes: Uint8Array): Promise<ModPackage> {
  try {
    const zip = await openZip(bytesSource(bytes), ZIP_LIMITS);
    const entries: { path: string; bytes: Uint8Array }[] = [];
    for (const member of zip.members) {
      if (member.name.endsWith('/')) continue;
      entries.push({ path: member.name, bytes: await zip.read(member) });
    }
    return modPackageFromEntries(label, entries);
  } catch (e) {
    if (e instanceof ModPackageError) throw e;
    if (e instanceof ZipError) throw new ModPackageError(e.message);
    throw new ModPackageError(e instanceof Error ? e.message : String(e));
  }
}

/**
 * What a pick may hold before it is read (#342's review, the low): a folder's file count and its total bytes, and a
 * zip's size, all checked from the picker's own `File.size` before a byte is read. The total is the zip reader's own
 * archive bound; the count leaves room beside the manifest's 32 files for the folder's own extras. A browser adaptation.
 */
export const MOD_PICK_LIMITS = { folderFiles: 64, totalBytes: ZIP_READER_LIMITS.archiveBytes } as const;

const GIB = 1024 * 1024 * 1024;

/** Why a picked folder is refused before it is read, or null. */
export function folderPickProblem(files: readonly { size: number }[]): string | null {
  if (files.length > MOD_PICK_LIMITS.folderFiles) return `a mod folder holds at most ${MOD_PICK_LIMITS.folderFiles} files; this one has ${files.length}`;
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MOD_PICK_LIMITS.totalBytes) return `the folder is too large (over ${MOD_PICK_LIMITS.totalBytes / GIB} GiB)`;
  return null;
}

/** Why a picked zip is refused before it is read whole, or null. */
export function zipPickProblem(size: number): string | null {
  return size > MOD_PICK_LIMITS.totalBytes ? `the zip is too large (over ${MOD_PICK_LIMITS.totalBytes / GIB} GiB)` : null;
}
