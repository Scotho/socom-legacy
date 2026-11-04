/**
 * Where a tool may write its report (PH.R2, RS.R8): shared by `prove-results.ts` and the harness (`harness/compare.ts`,
 * `harness/port-trace.ts`). A module of its own because `prove-results.ts` starts itself when run, and a tool that
 * imports a self-starting tool is refused by `packages/match/test/entryModules.test.ts` (SA-12c: a bundle would start it).
 */
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * Whether `p` is `dir` or under it, by path components: the relative path is outside only when it is absolute (another
 * drive) or its first component is `..` exactly -- a child named `..reports` is inside (a string prefix would not say so).
 */
export function insideDir(dir: string, p: string): boolean {
  const r = relative(resolve(dir), resolve(p));
  if (r === '') return true;
  if (isAbsolute(r)) return false;
  return r.split(/[\\/]/)[0] !== '..';
}

/**
 * Why the report may not be written at `out`, or null: never in the desktop's tree (`SOCOM_PC_ROOT`, read-only ground
 * truth), never in this repository unless git ignores the path (RS.R8: no capture or report of one in git).
 */
export function outputRefusal(out: string, pcRoot: string | null = process.env.SOCOM_PC_ROOT ?? null): string | null {
  const abs = resolve(out);
  if (pcRoot && insideDir(resolve(pcRoot), abs)) return `${abs} is in SOCOM_PC_ROOT's tree, the desktop's read-only ground truth: pass --out`;
  if (!insideDir(REPO_ROOT, abs)) return null;
  try {
    execFileSync('git', ['check-ignore', '-q', abs], { cwd: REPO_ROOT, stdio: 'ignore' });
    return null;
  } catch {
    return `${abs} is in this repository and not ignored by git (RS.R8): write it outside the tree or under an ignored directory (socomlegacy/logs/)`;
  }
}
