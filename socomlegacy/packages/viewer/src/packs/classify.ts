/**
 * B206 ML-1 (ML.R3): the MODS drop classifier, a browser adaptation (OT.R110, ML.R2: product track, nothing of the game).
 * One dropped zip, folder or set of loose files is read by its member NAMES (and, for a Thunderstore wrapping, its one
 * small store manifest) and named by the earlier format its payload already is:
 *
 * 1. **A Thunderstore wrapping** (`THUNDERSTORE_STORE_FILES` at the root, the root `manifest.json` carrying the store's
 *    keys, `THUNDERSTORE_PACKAGE_RULES.manifestKeys`) is checked against the store's rules (`checkThunderstorePackage`)
 *    and its root files are set aside -- never members of the payload. A root `manifest.json` WITHOUT the store's keys
 *    is not the store's: a GX served pack's own root `manifest.json` (`format: 's2u-local-texture-pack'`; packs.ts
 *    :85-90 names the collision) is read as today.
 * 2. **The payload's kind**, in this order: a v2 pack (`s2u-pack.json` at the root or in one folder, whatever members
 *    it lists: stored, never applied, ML.R3); a forge-map bundle (FP-5, FP.R3: `forge-bundle.json`, FP-4's envelope, at the root or in one folder with
 *    no `s2u-pack.json` beside it -- its own packs sit a folder down; the registry validates it whole and installs its
 *    packs and its read-only custom map); then the HD pack (`experimental-packs/hd/current.json` under any folder, as `importHdZip` finds it); an
 *    `s2u-mod` (`mod.json`); a model pack (`models.json`); a GX texture pack (a built pack's root `manifest.json`, an
 *    `export.json` folder, or plain PNGs); anything else refused with its reason.
 *
 * The unwrap is ML-5's shared `unwrapThunderstore` (`@s2u/creator-contracts` `packs.ts`; B206 ML-5, merged into
 * `agent/mods` at ML-3's step 0): the one reader of a wrapping in the repository, plugged in here as the default of
 * `ClassifyOptions.unwrap` (`sharedThunderstoreUnwrap`); a caller may still hand its own hook. Nothing here fetches,
 * uploads or names a store page.
 */
import { FORGE_BUNDLE_FILE, THUNDERSTORE_STORE_FILES, unwrapThunderstore, type ThunderstoreUnwrapEntry } from '@s2u/creator-contracts';

/**
 * What MODS installs: the four libraries plus the v2 pack the registry stores but never applies, and (FP-5) the forge-map
 * bundle -- its packs installed as v2 packs, its layout kept as a read-only custom map.
 */
export type DropKind = 'hd' | 'mod' | 'model' | 'texture' | 'pack' | 'bundle';
/** FP-5: the forge-map bundle's envelope (`@s2u/creator-contracts` `FORGE_BUNDLE_FILE`, FP-4), the sixth marker. */
export const BUNDLE_MARKER: string = FORGE_BUNDLE_FILE;
export interface DropWrapping {
  /** The store files found at the root and set aside (never members of the payload). */
  storeFiles: readonly string[];
  /** The store manifest's `name` and `version_number`, for the list's words. */
  name: string; version: string;
}
export type DropClass =
  | { kind: DropKind; wrapping: DropWrapping | null; root: string; payload: readonly string[]; texture?: 'built' | 'source' }
  | { kind: 'refused'; reason: string };
/** A small member's text (the store manifest, a root `manifest.json`); null when it is absent or over its bound. */
export type ReadSmall = (name: string) => Promise<Uint8Array | null>;
/**
 * The unwrap hook (the ML-5 seam): given the member names and a small reader, the wrapping found (null: none) or a
 * refusal's reason. `sharedThunderstoreUnwrap` is the default.
 */
export type ThunderstoreUnwrap = (names: readonly string[], read: ReadSmall) => Promise<DropWrapping | null | { refused: string }>;
export interface ClassifyOptions { unwrap?: ThunderstoreUnwrap }

/** A store manifest is at most this (the v2 manifest's own bound, `PACK_MANIFEST_BYTES_ADAPTATION`: 1 MiB). */
export const STORE_MANIFEST_READ_BYTES = 1024 * 1024;
const STORE_FILES: ReadonlySet<string> = new Set(THUNDERSTORE_STORE_FILES);
const isDir = (name: string): boolean => name.endsWith('/');

/** The JSON object of `bytes`, or null. */
function jsonObject(bytes: Uint8Array | null): Record<string, unknown> | null {
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * The default unwrap: ML-5's `unwrapThunderstore` over the names, the store's root files read first (each small; the
 * function asks their bytes of its caller). A store manifest over its bound or unreadable is no wrapping (read as
 * today); a store root file present but unreadable is handed in empty, so the store's rules refuse it in words. The
 * wrapping's report (`checkThunderstorePackage`) refuses the drop on its first error.
 */
export const sharedThunderstoreUnwrap: ThunderstoreUnwrap = async (names, read) => {
  const candidates = new Set<string>();
  for (const name of names) {
    const parts = name.split('/');
    const rel = parts.length === 1 ? name : parts.length === 2 ? parts[1]! : null;
    if (rel !== null && STORE_FILES.has(rel)) candidates.add(name);
  }
  if (![...candidates].some((name) => name === 'manifest.json' || name.endsWith('/manifest.json'))) return null;
  const entries: ThunderstoreUnwrapEntry[] = [];
  for (const path of names) {
    if (!candidates.has(path)) { entries.push({ path }); continue; }
    entries.push({ path, bytes: (await read(path)) ?? new Uint8Array(0) });
  }
  const out = unwrapThunderstore(entries);
  if (!out.wrapped) return null;
  const first = out.report.diagnostics.find((d) => d.severity === 'error');
  if (first) return { refused: `The Thunderstore package does not keep the store's rules: ${first.text}` };
  return { storeFiles: out.store.map((e) => out.root + e.path), name: String(out.manifest.name), version: String(out.manifest.version_number) };
};

/** The one folder every name sits under ('' when they do not share one, or when one sits at the root). */
function oneFolder(names: readonly string[]): string {
  const first = names[0]?.split('/')[0];
  if (!first || names.some((name) => !name.includes('/') || name.split('/')[0] !== first)) return '';
  return `${first}/`;
}

/**
 * Names `names` (a zip's members or a folder's relative paths; directory entries ignored). `read` answers a small
 * member's bytes, asked only for a root `manifest.json` and the store's root files.
 */
export async function classifyDrop(names: readonly string[], read: ReadSmall, options: ClassifyOptions = {}): Promise<DropClass> {
  const all = names.filter((name) => !isDir(name));
  if (all.length === 0) return { kind: 'refused', reason: 'Nothing to add: the drop holds no files.' };
  // A loose folder's names carry its own top folder; a wrapping is read at the folder's root as at a zip's.
  const top = oneFolder(all);
  const local = top ? all.map((name) => name.slice(top.length)) : all;
  const readLocal: ReadSmall = (name) => read(top + name);
  const wrapped = await (options.unwrap ?? sharedThunderstoreUnwrap)(local, readLocal);
  if (wrapped && 'refused' in wrapped) return { kind: 'refused', reason: wrapped.refused };
  const setAside = new Set(wrapped?.storeFiles ?? []);
  const payload = local.filter((name) => !setAside.has(name));
  if (payload.length === 0) return { kind: 'refused', reason: 'The Thunderstore package holds only its store files: no pack is inside it.' };
  // The payload's own root: inside the one folder a wrapping or a zipped directory adds.
  const inner = oneFolder(payload);
  const rel = inner ? payload.map((name) => name.slice(inner.length)) : payload;
  const root = top + inner;
  const found = (kind: DropKind, extra: { texture?: 'built' | 'source' } = {}): DropClass =>
    ({ kind, wrapping: wrapped ?? null, root, payload: payload.map((name) => top + name), ...extra });
  // A v2 pack: s2u-pack.json at the root or in the one folder, whatever members it lists (the FP-5 review's F4: a pack
  // may carry a member named forge-bundle.json). A bundle's own packs sit a folder down (`packs/<n>/s2u-pack.json`).
  if (rel.includes('s2u-pack.json') || payload.includes('s2u-pack.json')) return found('pack');
  // FP-5: a bundle -- forge-bundle.json at that level with no s2u-pack.json beside it; deeper than one folder, refused.
  if (rel.includes(BUNDLE_MARKER) || payload.includes(BUNDLE_MARKER)) return found('bundle');
  if (payload.some((name) => name.endsWith(`/${BUNDLE_MARKER}`)))
    return { kind: 'refused', reason: `Its ${BUNDLE_MARKER} sits deeper than one folder, or there are two: a Forge map bundle holds one, at the root of the zip or its one folder.` };
  if (payload.some((name) => /(^|\/)experimental-packs\/hd\/current\.json$/.test(top + name))) return found('hd');
  if (rel.includes('mod.json')) return found('mod');
  if (rel.includes('models.json')) return found('model');
  if (rel.includes('manifest.json')) {
    // Not the store's (a wrapping was set aside above): a built GX pack's own manifest, read as today.
    const own = jsonObject(await read(root + 'manifest.json'));
    if (own?.format === 's2u-local-texture-pack') return found('texture', { texture: 'built' });
    return { kind: 'refused', reason: 'Its manifest.json is neither a Thunderstore package\'s nor a built texture pack\'s.' };
  }
  if (rel.some((name) => /(^|\/)export\.json$/.test(name)) || rel.some((name) => /\.png$/i.test(name))) return found('texture', { texture: 'source' });
  if (rel.some((name) => /(^|\/)mod\.json$/.test(name))) return { kind: 'refused', reason: 'Its mod.json sits deeper than one folder: put mod.json at the root of the zip or its one folder.' };
  return { kind: 'refused', reason: 'Not a pack MODS reads: no s2u-pack.json, HD pack, mod.json, models.json, texture manifest, export.json or PNG.' };
}
