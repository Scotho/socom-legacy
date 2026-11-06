import { dirname, isAbsolute } from 'node:path';
import type { PlanContext } from './run';
import { slash } from './runDir';

/**
 * The parity pack's plan context (PK-2; docs/specs/2026-11-03-parity-pack-design.md 6.1). Product track (OT.R53): a
 * validation instrument's packaging, an adaptation, never in a build and never changing the game's behaviour.
 *
 * A pack has no git, so run.ts's hostContext (`git rev-parse`) cannot place it. `EPH_PACK=<root>` names the pack and
 * this context is made from `<root>/pack/VERSION.json` instead: `repo` is `<root>/pack/harness` (the bundle, which a run
 * directory must not be inside), there are no clones, the worktree parent is the pack's own parent, and `SOCOM_PC_ROOT`
 * (the pack's desktop stub) is read from the env as it is for any run. `EPH_RUN_DIR` defaults to `<root>/pack/run`, a
 * sibling of `harness`; ./runDir checkRunDir's refusals stand unchanged over it. Pure: the file reads are injected.
 */

/** `<root>/pack/VERSION.json`, written by the pack's builder (design 7). */
export interface PackVersion {
  readonly pageSha: string;
  readonly pageTag: string;
  readonly pcsx2Version: string;
  readonly packStamp: string;
  readonly builderCommit: string;
}

export const PACK_VERSION_FIELDS = ['pageSha', 'pageTag', 'pcsx2Version', 'packStamp', 'builderCommit'] as const;

export class PackContextError extends Error {
  constructor(what: string) {
    super(`EPH pack: ${what}`);
    this.name = 'PackContextError';
  }
}

/** The pack's root from EPH_PACK, slashed; refused when blank or relative. */
function packRoot(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') throw new PackContextError('EPH_PACK is not set: name the pack folder');
  const p = slash(raw.trim());
  if (!isAbsolute(p) && !/^[A-Za-z]:\//.test(p)) throw new PackContextError(`EPH_PACK must be an absolute path, not "${raw}"`);
  return p;
}

/** `<root>/pack/VERSION.json`, each field a string; a missing or malformed file refused in one line. */
export function readPackVersion(root: string, exists: (p: string) => boolean, readText: (p: string) => string): PackVersion {
  const at = `${slash(root)}/pack/VERSION.json`;
  if (!exists(at)) throw new PackContextError(`no VERSION.json at ${at}: is EPH_PACK the pack folder?`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(at));
  } catch (err) {
    throw new PackContextError(`${at}: VERSION.json is not JSON (${(err as Error).message.split('\n')[0]})`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new PackContextError(`${at}: VERSION.json is not an object`);
  const o = parsed as Record<string, unknown>;
  for (const f of PACK_VERSION_FIELDS) {
    if (typeof o[f] !== 'string' || (o[f] as string).trim() === '') throw new PackContextError(`${at}: VERSION.json has no string ${f}`);
  }
  return Object.fromEntries(PACK_VERSION_FIELDS.map((f) => [f, o[f] as string])) as unknown as PackVersion;
}

/** The PlanContext of a run inside a pack (EPH_PACK set), and the pack's VERSION.json. */
export function packContext(
  env: Readonly<Record<string, string | undefined>>, now: Date, platform: NodeJS.Platform,
  exists: (p: string) => boolean, readText: (p: string) => string,
): PlanContext & { readonly version: PackVersion } {
  const root = packRoot(env.EPH_PACK);
  const version = readPackVersion(root, exists, readText);
  const runDir = env.EPH_RUN_DIR && env.EPH_RUN_DIR.trim() ? env.EPH_RUN_DIR : `${root}/pack/run`;
  return {
    env: Object.assign({}, env, { EPH_RUN_DIR: runDir }), repo: `${root}/pack/harness`, clones: [], worktreeParent: slash(dirname(root)),
    now, platform, exists, readText, version,
  };
}
