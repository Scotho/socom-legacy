/**
 * Where the tools read the desktop project from (the repo restructure, Phase B step 6): it is no longer in this tree.
 * An explicit `SOCOM_PC_ROOT` wins when it holds what is asked for; else the `ref/desktop` submodule when it is
 * initialised; else null, and the caller skips that check cleanly (CI checks out without submodules).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The repository's root: the first directory at or above `from` holding `.git` (a directory, or a worktree's file). */
export function repoRoot(from: string = import.meta.dirname): string | null {
  for (let d = resolve(from); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

/** The desktop checkout holding `needs` (a path inside it): `SOCOM_PC_ROOT`, else `<repo>/ref/desktop`; else null. */
export function desktopRoot(
  needs: string, env: NodeJS.ProcessEnv = process.env, from: string = import.meta.dirname,
): string | null {
  const roots: string[] = [];
  if (env.SOCOM_PC_ROOT) roots.push(resolve(env.SOCOM_PC_ROOT));
  const repo = repoRoot(from);
  if (repo) roots.push(join(repo, 'ref', 'desktop'));
  return roots.find((r) => existsSync(join(r, needs))) ?? null;
}
