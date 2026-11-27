import type { XboxBuildIdentity } from './src/xboxPrototype/buildIdentity';

/** A separate-build adaptation. Never guess a revision or bypass Git ownership checks. */
export function xboxBuildStamp(git: (args: readonly string[]) => string,
  clock: () => Date = () => new Date(), allowDirty = false): XboxBuildIdentity {
  let commit: string, status: string;
  try {
    commit = git(['rev-parse', '--verify', 'HEAD']).trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid Git commit');
    // All worktree inputs matter, including shared UI and newly written source files.
    status = git(['status', '--porcelain', '--untracked-files=normal']).trim();
  } catch {
    throw new Error('Cannot identify Xbox test build. Run Git in this worktree and resolve its access/ownership error before building.');
  }
  const dirty = status.length > 0;
  if (dirty && !allowDirty) throw new Error('Xbox test build has uncommitted files. Commit the reviewed work, or set XBOX_ALLOW_DIRTY_BUILD=1 for a labeled local check.');
  return { schema: 1, flavor: 'xbox-webgl2-experiment', commit, revision: `${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`,
    dirty, builtAt: clock().toISOString() };
}
export function xboxBuildManifest(build: XboxBuildIdentity): string { return `${JSON.stringify(build, null, 2)}\n`; }
