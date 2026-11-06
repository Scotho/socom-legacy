import './prelude';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RunAborted } from '../eph/abort';
import { findOnPath, main as ephMain } from '../eph/run';
import { createSiteServer } from '../siteServer';
import { GUI_PORT, PACK_PATHS, SITE_PORT, packPath } from './gui/layout';
import { packPreparer } from './gui/prepare';
import { startGui, type GuiDeps } from './gui/server';
import { readElfCrc } from './gui/state';
import { systemFacts } from './gui/system';
import { writeZipFile } from './zipStream';

/**
 * The parity pack's harness entry (PK-5; docs/specs/2026-11-03-parity-pack-design.md 4, 5, 7): the one bundle
 * `pack/harness/harness.mjs` that `START HERE.cmd` runs with the pack's node. Product track (OT.R53): the GUI and
 * packaging of a validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 *   harness.mjs gui [--check] [--open]   the GUI server (./gui/server) on 127.0.0.1:5390 and the site on 5391
 *   harness.mjs run <EPH args...>        tools/eph/run.ts's CLI, as `node --import tsx tools/eph/run.ts <args>`
 *   harness.mjs --help
 *
 * `./prelude` is imported first (it keeps run.ts's own start check from firing inside the bundle). `gui --check` (the
 * builder's dry check, PK.R4: no PCSX2) starts as usual and answers /api/status until it is killed. On SIGINT, SIGTERM or
 * SIGHUP (the console window closed) the GUI ends its session child first -- its `end`, then its PID tree after 10 s --
 * then both servers, then exits.
 */

export const HARNESS_HELP = `SOCOM II parity harness

  harness.mjs gui [--check] [--open]   the GUI (open http://127.0.0.1:${GUI_PORT}/); --open opens it in the browser
  harness.mjs run <options>            the emulator parity harness itself (run --help for its options)
`;

/** The pack's root: EPH_PACK (START HERE.cmd sets it), else the folder two above this bundle (pack/harness/). */
function packRoot(): string {
  const env = process.env.EPH_PACK;
  if (env && env.trim()) return env.trim().replace(/\\/g, '/');
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/\\/g, '/');
}

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGKILL');
  } catch {
    /* gone already */
  }
}

async function gui(args: readonly string[]): Promise<void> {
  for (const a of args) if (a !== '--check' && a !== '--open') throw new Error(`gui takes --check and --open, not ${a}\n${HARNESS_HELP}`);
  const check = args.includes('--check');
  const root = packRoot();
  const logFile = packPath(root, PACK_PATHS.guiLog);
  try { mkdirSync(dirname(logFile), { recursive: true }); } catch { /* the log is stderr alone */ }
  const log = (line: string): void => {
    const text = `${new Date().toISOString()} ${line}\n`;
    process.stderr.write(text);
    try { appendFileSync(logFile, text); } catch { /* stderr has it */ }
  };
  const guiDir = packPath(root, PACK_PATHS.gui);
  const deps: GuiDeps = {
    packRoot: root, guiDir, dsDir: packPath(root, PACK_PATHS.ds), fontsDir: `${packPath(root, PACK_PATHS.site)}/fonts`,
    harnessEntry: fileURLToPath(import.meta.url), nodePath: process.execPath, env: process.env, platform: process.platform,
    findOnPath: (name, env, exists) => findOnPath(name, env, exists),
    readElfCrc, killTree, preparer: packPreparer, writeZipFile, systemFacts,
    spawn: (cmd, a, o) => spawn(cmd, a, o),
    openFolder: (p) => { spawn('explorer.exe', [p.replace(/\//g, '\\')], { stdio: 'ignore', detached: true, windowsHide: false }).on('error', () => {}).unref(); },
    startSite: (o) => createSiteServer(o),
    log,
  };
  if (!existsSync(`${guiDir}/index.html`)) log(`no GUI page at ${guiDir}/index.html: the pack is incomplete`);
  const g = await startGui(deps, { port: GUI_PORT, sitePort: SITE_PORT });
  if (check) log(`check: the GUI answers at ${g.url}api/status (kill this process to end the check)`);
  // The URL has no `&`, so cmd.exe's start takes it whole (nothing to caret-escape).
  if (args.includes('--open') && process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', g.url], { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
  }
  let stopping = false;
  const stop = (sig: string): void => {
    if (stopping) { process.exit(130); }
    stopping = true;
    log(`${sig}: ending the session and the servers`);
    g.close().then(() => process.exit(0), (err: Error) => { log(`closing: ${err.message}`); process.exit(1); });
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => stop(sig));
}

export async function harnessMain(argv: readonly string[]): Promise<number | null> {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === '--help' || cmd === '-h') { process.stdout.write(HARNESS_HELP); return cmd === undefined ? 2 : 0; }
  if (cmd === 'run') return ephMain(rest);
  if (cmd === 'gui') { await gui(rest); return null; }
  process.stderr.write(`unknown command ${cmd}\n${HARNESS_HELP}`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  harnessMain(process.argv.slice(2)).then((code) => { if (code !== null) process.exit(code); }, (err: Error) => {
    console.error(err.message);
    process.exit(err instanceof RunAborted ? 130 : 1);
  });
}
