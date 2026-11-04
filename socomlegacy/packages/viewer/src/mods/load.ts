/**
 * Turns picked packages into an override table. Mods apply top to bottom: the lower id in the panel order wins a
 * conflict, and the conflict is named. A disabled mod does not override or conflict. The master switch off leaves the
 * table empty. (`TEST_ROOM_MODS_ADAPTATION`.)
 */
import type { ModChoices } from './choices';
import { parseModManifestBytes, type ModManifest } from './manifest';
import type { ModPackage } from './readPackage';

export interface ModSource {
  label: string;
  /** Set once the manifest has parsed, so a later remove finds the stored package. */
  id?: string;
  files?: ReadonlyMap<string, Uint8Array>;
  error?: string;
}

export interface ModFileRole {
  path: string;
  /** `added` is a path the disc listing does not have. `replaces` is one it does. `member` is one file inside an archive. */
  role: 'added' | 'replaces' | 'member';
}

export type ModOverride =
  | { kind: 'file'; path: string; bytes: Uint8Array; modId: string }
  | { kind: 'member'; archive: string; member: string; bytes: Uint8Array; modId: string };

export function overrideLabel(entry: ModOverride): string {
  return entry.kind === 'file' ? entry.path : `${entry.archive} ${entry.member}`;
}

export interface ModConflict {
  path: string;
  winnerId: string;
  loserIds: readonly string[];
}

export interface LoadedMod {
  kind: 'loaded';
  id: string;
  name: string;
  version: string;
  author: string;
  enabled: boolean;
  label: string;
  paths: readonly ModFileRole[];
}

export interface InvalidMod {
  kind: 'invalid';
  label: string;
  reason: string;
}

export interface ModSession {
  rows: readonly (LoadedMod | InvalidMod)[];
  conflicts: readonly ModConflict[];
  /** What applies while the master switch is on and the mod is enabled. */
  overrides: readonly ModOverride[];
  /** A path to read when showing that the hook is on or off. Null when nothing loaded. */
  samplePath: string | null;
  choices: ModChoices;
}

interface ParsedMember { archive: string; member: string; bytes: Uint8Array }

interface Parsed {
  manifest: ModManifest;
  label: string;
  files: Map<string, Uint8Array>;
  members: ParsedMember[];
}

function parseSource(source: ModSource): Parsed {
  if (source.error) throw new Error(source.error);
  const files = source.files;
  if (!files) throw new Error('the package has no files');
  const manifestBytes = files.get('mod.json');
  if (!manifestBytes) throw new Error('mod.json is missing');
  const manifest = parseModManifestBytes(manifestBytes);
  const out = new Map<string, Uint8Array>();
  const members: ParsedMember[] = [];
  for (const entry of manifest.files) {
    const bytes = files.get(entry.file);
    if (!bytes) throw new Error(`${entry.file} is not in the package`);
    if (entry.kind === 'file') out.set(entry.path, bytes);
    else members.push({ archive: entry.archive, member: entry.member, bytes });
  }
  return { manifest, label: source.label, files: out, members };
}

function conflictPath(entry: ModOverride): string {
  return entry.kind === 'file' ? entry.path : `${entry.archive} ! ${entry.member}`;
}

/**
 * Loads `sources`. `choices.order` is extended with new ids and kept otherwise. `discPaths` is the disc's own listing
 * (canonical paths): a file it does not contain is `added`, and one it does is `replaces`.
 */
export function loadMods(sources: readonly ModSource[], choices: ModChoices, discPaths: ReadonlySet<string> = new Set()): ModSession {
  const parsed: Parsed[] = [];
  const invalid: InvalidMod[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    try {
      const mod = parseSource(source);
      if (seen.has(mod.manifest.id)) {
        invalid.push({ kind: 'invalid', label: source.label, reason: `a mod with id ${mod.manifest.id} is already loaded` });
        continue;
      }
      seen.add(mod.manifest.id);
      parsed.push(mod);
    } catch (e) {
      invalid.push({ kind: 'invalid', label: source.label, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  const ids = parsed.map((mod) => mod.manifest.id);
  // Ids with no package this visit stay in the order, so picking the same mod again keeps its place and its on/off.
  const order = [...choices.order];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const disabled = choices.disabled.filter((id) => order.includes(id));
  const next: ModChoices = { enabled: choices.enabled, order, disabled };
  const rank = new Map(order.map((id, index) => [id, index]));
  const active = parsed.filter((mod) => !disabled.includes(mod.manifest.id));
  // Top to bottom. The later write wins, which is the lower row.
  const ranked = [...active].sort((a, b) => rank.get(a.manifest.id)! - rank.get(b.manifest.id)!);
  const table = new Map<string, ModOverride>();
  const losers = new Map<string, string[]>();
  const write = (key: string, entry: ModOverride): void => {
    const prev = table.get(key);
    if (prev) losers.set(key, [...(losers.get(key) ?? []), prev.modId]);
    table.set(key, entry);
  };
  for (const mod of ranked) {
    for (const [path, bytes] of mod.files) write(`file\0${path}`, { kind: 'file', path, bytes, modId: mod.manifest.id });
    for (const member of mod.members) {
      write(`member\0${member.archive}\0${member.member}`, { kind: 'member', ...member, modId: mod.manifest.id });
    }
  }
  const conflicts: ModConflict[] = [];
  for (const [key, loserIds] of losers) conflicts.push({ path: conflictPath(table.get(key)!), winnerId: table.get(key)!.modId, loserIds });
  conflicts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byId = new Map(parsed.map((mod) => [mod.manifest.id, mod]));
  const rows: (LoadedMod | InvalidMod)[] = order.filter((id) => byId.has(id)).map((id) => {
    const mod = byId.get(id)!;
    return {
      kind: 'loaded', id, name: mod.manifest.name, version: mod.manifest.version, author: mod.manifest.author,
      enabled: !disabled.includes(id), label: mod.label,
      paths: [
        ...[...mod.files.keys()].map((path) => ({ path, role: discPaths.has(path) ? 'replaces' as const : 'added' as const })),
        ...mod.members.map((member) => ({ path: `${member.archive} ${member.member}`, role: 'member' as const })),
      ],
    };
  });
  const applied = choices.enabled ? [...table.values()] : [];
  const samplePath = applied[0] ? overrideLabel(applied[0]) : null;
  return {
    rows: [...rows, ...invalid],
    conflicts,
    overrides: applied,
    samplePath,
    choices: next,
  };
}
