import { execFile } from 'node:child_process';
import * as os from 'node:os';

/**
 * The tester's machine, for the Save's `system.json` (PK-5; docs/specs/2026-11-03-parity-pack-design.md 5, "Save", and
 * 11: the GPU by PowerShell `Get-CimInstance Win32_VideoController`, a failure recorded as `unknown`, never fatal).
 * Product track (OT.R53): an instrument's record, an adaptation. Nothing personal: no user name, no host name, no path.
 */

export interface SystemFacts {
  readonly windows: { readonly release: string; readonly version: string };
  readonly cpu: { readonly model: string; readonly count: number };
  readonly memoryBytes: number;
  readonly gpu: string;
  readonly node: string;
}

export interface SystemDeps {
  readonly release: () => string;
  readonly version: () => string;
  readonly cpus: () => readonly { readonly model: string }[];
  readonly totalmem: () => number;
  /** The GPU names, one line each, or a rejection. */
  readonly gpuNames: () => Promise<string>;
  readonly nodeVersion: string;
}

export const GPU_TIMEOUT_MS = 15_000;

/** `powershell -NoProfile -Command (Get-CimInstance Win32_VideoController).Name`, bounded. */
export function powershellGpuNames(): Promise<string> {
  return new Promise((ok, fail) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name'],
      { timeout: GPU_TIMEOUT_MS, windowsHide: true }, (err, stdout) => (err ? fail(err) : ok(String(stdout))));
  });
}

export const NODE_SYSTEM: SystemDeps = {
  release: () => os.release(),
  version: () => os.version(),
  cpus: () => os.cpus(),
  totalmem: () => os.totalmem(),
  gpuNames: powershellGpuNames,
  nodeVersion: process.version,
};

export async function systemFacts(d: SystemDeps = NODE_SYSTEM): Promise<SystemFacts> {
  let gpu = 'unknown';
  try {
    const names = (await d.gpuNames()).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length) gpu = names.join('; ');
  } catch {
    gpu = 'unknown';
  }
  const safe = <T>(f: () => T, or: T): T => { try { return f(); } catch { return or; } };
  const cpus = safe(d.cpus, []);
  return {
    windows: { release: safe(d.release, 'unknown'), version: safe(d.version, 'unknown') },
    cpu: { model: cpus[0]?.model.trim() || 'unknown', count: cpus.length },
    memoryBytes: safe(d.totalmem, 0),
    gpu,
    node: d.nodeVersion,
  };
}
