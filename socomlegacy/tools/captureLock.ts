import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The host lock before a CPU-heavy page capture (PLAT-30; web research 108 §7; the Host rules of the web sprint 6
 * plan): the PC project's `scripts/loop_lock.sh check` prints FREE or HELD and exits 0 either way, so its first line is
 * read. The PC project is `SOCOM_PC_ROOT`, or its host path when that is unset; when neither holds the script, or
 * bash does not run, the lock cannot be asked -- and the capture refuses rather than starting unchecked.
 */

/** The PC project on the dev host (the brief's SOCOM_PC_ROOT), asked when the variable is unset. */
export const DEFAULT_PC_ROOT = 'C:/Projects/socom_pc';

export type LockRunner = (script: string) => { stdout: string; error?: Error };

const bashCheck: LockRunner = (script) => {
  const r = spawnSync('bash', [script, 'check'], { encoding: 'utf8' });
  return { stdout: r.stdout ?? '', ...(r.error ? { error: r.error } : {}) };
};

/** `{ free, line }`: free only when the check's first line begins with FREE. */
export function askHostLock(env: Readonly<Record<string, string | undefined>> = process.env, run: LockRunner = bashCheck,
  exists: (p: string) => boolean = existsSync): { free: boolean; line: string } {
  const roots = env.SOCOM_PC_ROOT ? [env.SOCOM_PC_ROOT] : [DEFAULT_PC_ROOT];
  const script = roots.map((r) => join(resolve(r), 'scripts', 'loop_lock.sh')).find((s) => exists(s));
  if (!script) return { free: false, line: `the lock cannot be asked: no scripts/loop_lock.sh under ${roots.join(', ')} (set SOCOM_PC_ROOT)` };
  const r = run(script);
  if (r.error) return { free: false, line: `the lock cannot be asked: bash did not run (${r.error.message})` };
  const line = (r.stdout.split('\n')[0] ?? '').trim();
  return { free: line.startsWith('FREE'), line: line || 'no answer' };
}
