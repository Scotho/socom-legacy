import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { memcardsDir } from '../eph/build';
import { findOnPath } from '../eph/run';
import { slash } from '../eph/runDir';
import {
  BUILD_USAGE, GUI_PORT, PACK_LAYOUT, PackPlanError, absoluteFolders, checkDevBuild, chromiumDirName, describePlan,
  fillTemplate, judgeChecklist, listTree, outDirRefusal, packEnv, packIni, packName, packStamp, parseBuildArgs,
  planPcsx2Copy, versionJson, type BuildArgs, type PackFs, type PackPlan, type Pcsx2CopyPlan, type PlanGroup,
} from './packPlan';
import { writeZipFile } from './zipStream';

/**
 * The parity pack's builder (PK-4; docs/specs/2026-11-03-parity-pack-design.md section 7; the skill `parity-pack`,
 * section 2). Product track (OT.R53): the packaging of a validation instrument, an adaptation; it changes nothing the
 * game does. Thin over `./packPlan.ts`: it reads the host, plans, refuses before it writes anything, then builds.
 *
 *   node --import tsx tools/parity-pack/build.ts --out <dir> [--pcsx2 <dir>] [--ffmpeg <exe>] [--with-chromium]
 *        [--zip] [--dry-run] [--check]          (from socomlegacy/; --help; --check-only checks a pack already built)
 *
 * What it reads: `EPH_RUN_DIR`'s `pcsx2/` (the harness's copy: its ini, cards and states; `--pcsx2` overrides),
 * `SOCOM_PC_ROOT`'s `scripts/parity/launch_to_mission.txt`, ffmpeg on PATH (`--ffmpeg` overrides), the node running it
 * (`process.execPath`, the pack's runtime), the three Playwright packages, git's tag and sha. What it never ships: the
 * BIOS, a disc image (PK.R3; packPlan's exclusions). `--check` starts the pack's GUI only: no PCSX2 starts (PK.R4).
 */

const REDOTCOM = slash(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const REPO = slash(resolve(REDOTCOM, '..'));
const HARNESS_ENTRY = `${REDOTCOM}/tools/parity-pack/harness.ts`;
const GUI_INDEX = `${REDOTCOM}/tools/parity-pack/gui/index.html`;
const TEMPLATES = `${REDOTCOM}/tools/parity-pack/templates`;
const PLAYWRIGHT_PACKAGES = ['@playwright/test', 'playwright', 'playwright-core'] as const;
/** The page build's variables the nightly unsets (deploy/nightly.sh's recipe; the agent pair is not wanted here). */
const UNSET_FOR_PAGE = [
  'VITE_S2U_MULTIPLAYER', 'VITE_S2U_MAP_ALLOWLIST', 'VITE_S2U_SHIP_STARTUP_MEDIA', 'VITE_S2U_ROOMS', 'VITE_S2U_LOCAL_PORT',
  'VIEWER_BASE', 'VITE_S2U_AGENT_URL', 'VITE_S2U_AGENT_ICE_SERVERS',
] as const;
const CHECK_WAIT_MS = 30_000;

const say = (line: string): void => console.log(`parity-pack: ${line}`);
const fail = (what: string): never => { throw new PackPlanError(what); };

const realFs: PackFs = {
  exists: (p) => existsSync(p),
  readdir: (p) => readdirSync(p),
  stat: (p) => { const s = statSync(p); return { size: s.size, isDirectory: s.isDirectory() }; },
  readText: (p) => readFileSync(p, 'utf8'),
};

function git(args: string[], cwd: string = REPO): string | null {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The nearest folder of `p` that exists (the output may not exist yet). */
function existingAncestor(p: string): string {
  let d = resolve(p);
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  return d;
}

const gitTopLevel = (dir: string): string | null => git(['rev-parse', '--show-toplevel'], existingAncestor(dir));
const isIgnored = (path: string): boolean => {
  const top = gitTopLevel(path);
  return top !== null && spawnSync('git', ['check-ignore', '-q', '--', path], { cwd: top }).status === 0;
};

// ---------------------------------------------------------------------------------------------------------------------
// The host and the plan

interface Host {
  readonly out: string;
  readonly name: string;
  readonly zipPath: string;
  readonly pcsx2Source: string;
  readonly pcsx2: Pcsx2CopyPlan;
  readonly iniSource: string;
  readonly launchToMission: string;
  readonly ffmpeg: string;
  readonly node: string;
  readonly playwright: readonly { name: string; dir: string; version: string }[];
  readonly chromium: { name: string; dir: string } | null;
  /** PK.R6: the BIOS folder ships (--with-bios). */
  readonly withBios: boolean;
  readonly lockScript: string | null;
  readonly now: Date;
}

function packageDir(name: string): string {
  const req = createRequire(`${REDOTCOM}/package.json`);
  try {
    return slash(dirname(req.resolve(`${name}/package.json`)));
  } catch {
    return fail(`no ${name} package resolvable from ${REDOTCOM}: the workspace's install is missing it`);
  }
}

function readHost(args: BuildArgs, env: NodeJS.ProcessEnv): Host {
  const now = new Date();
  const out = slash(resolve(args.out));
  const name = packName(now);
  const zipPath = `${slash(dirname(out))}/${name}.zip`;

  const pcsx2Source = slash(args.pcsx2 ? resolve(args.pcsx2)
    : env.EPH_RUN_DIR?.trim() ? `${slash(env.EPH_RUN_DIR.trim())}/pcsx2` : fail('EPH_RUN_DIR is not set and no --pcsx2 <dir>: name the PCSX2 copy to ship'));
  const listing = listTree(pcsx2Source, realFs);
  const iniSource = `${pcsx2Source}/inis/PCSX2.ini`;
  const iniText = existsSync(iniSource) ? readFileSync(iniSource, 'utf8') : '';
  const abs = absoluteFolders(iniText);
  if (abs.length > 0) fail(`${iniSource} names folders by absolute path (${abs.join(', ')}): the pack's copy must name them relative to itself`);
  const cards = memcardsDir(iniText, pcsx2Source);
  const memcards = cards === null ? 'memcards' : slash(cards).toLowerCase().startsWith(`${pcsx2Source.toLowerCase()}/`)
    ? slash(cards).slice(pcsx2Source.length + 1) : fail(`the ini's memory cards folder ${cards} is outside ${pcsx2Source}`);
  const pcsx2 = planPcsx2Copy(pcsx2Source, listing, { memcards, withBios: args.withBios });

  const pcRoot = env.SOCOM_PC_ROOT?.trim() ? slash(env.SOCOM_PC_ROOT.trim()) : fail('SOCOM_PC_ROOT is not set: the desktop tree holds scripts/parity/launch_to_mission.txt');
  const launchToMission = `${pcRoot}/scripts/parity/launch_to_mission.txt`;
  if (!existsSync(launchToMission)) fail(`no ${launchToMission} (SOCOM_PC_ROOT's boot script, shipped in the desktop stub)`);
  const lock = `${pcRoot}/scripts/loop_lock.sh`;

  const ffmpeg = args.ffmpeg ? slash(resolve(args.ffmpeg)) : findOnPath('ffmpeg', env, (p) => existsSync(p));
  if (ffmpeg === null) fail('no ffmpeg on PATH: name it with --ffmpeg <exe>');
  if (!existsSync(ffmpeg!)) fail(`no ffmpeg at ${ffmpeg}`);
  const node = slash(process.execPath);

  const playwright = PLAYWRIGHT_PACKAGES.map((p) => {
    const dir = packageDir(p);
    return { name: p, dir, version: String((JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { version?: string }).version ?? '?') };
  });

  let chromium: Host['chromium'] = null;
  if (args.withChromium) {
    const core = playwright.find((p) => p.name === 'playwright-core')!;
    const dirName = chromiumDirName(readFileSync(`${core.dir}/browsers.json`, 'utf8'));
    const root = env.PLAYWRIGHT_BROWSERS_PATH?.trim() ? slash(env.PLAYWRIGHT_BROWSERS_PATH.trim())
      : env.LOCALAPPDATA ? `${slash(env.LOCALAPPDATA)}/ms-playwright` : fail('LOCALAPPDATA is not set: no ms-playwright folder to take Chromium from');
    const dir = `${root}/${dirName}`;
    if (!existsSync(dir)) fail(`no ${dir}: --with-chromium needs Playwright's Chromium for playwright-core ${core.version} installed`);
    chromium = { name: dirName, dir };
  }
  return { out, name, zipPath, pcsx2Source, pcsx2, iniSource, launchToMission, ffmpeg: ffmpeg!, node, playwright, chromium, withBios: args.withBios, lockScript: existsSync(lock) ? lock : null, now };
}

const file = (from: string, to: string): { from: string; to: string; size: number } => ({ from, to, size: statSync(from).size });

/** ffmpeg's and node's licence texts when they sit beside the exe (or beside its `bin/`). */
function licencesBeside(exe: string, prefix: string): { from: string; to: string; size: number }[] {
  const dirs = [dirname(exe)];
  if (basename(dirname(exe)).toLowerCase() === 'bin') dirs.push(dirname(dirname(exe)));
  const out: { from: string; to: string; size: number }[] = [];
  for (const d of dirs) {
    for (const n of readdirSync(d)) {
      if (/^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n) || (prefix === 'ffmpeg' && /\.txt$/i.test(n))) {
        const from = slash(join(d, n));
        if (statSync(from).isFile()) out.push(file(from, `${PACK_LAYOUT.runtime}/${prefix}-${n}`));
      }
    }
  }
  return out;
}

function planPack(h: Host): PackPlan {
  const groups: PlanGroup[] = [
    { name: 'site', to: PACK_LAYOUT.site, files: [], built: 'vite build, NODE_ENV=development, VITE_S2U_ACCOUNT_ORIGIN_ONLY=1 (the nightly\'s recipe), then its development markers checked' },
    { name: 'harness', to: PACK_LAYOUT.harnessBundle, files: [], built: `esbuild of ${HARNESS_ENTRY} (node22, esm, Playwright external)` },
    { name: 'gui', to: PACK_LAYOUT.gui, files: guiFiles() },
    { name: 'pcsx2', to: PACK_LAYOUT.pcsx2, files: h.pcsx2.files, built: undefined },
    { name: 'runtime', to: PACK_LAYOUT.runtime, files: [
      file(h.node, PACK_LAYOUT.node), ...licencesBeside(h.node, 'node'),
      file(h.ffmpeg, PACK_LAYOUT.ffmpeg), ...licencesBeside(h.ffmpeg, 'ffmpeg'),
    ] },
    { name: 'playwright', to: PACK_LAYOUT.harnessModules, files: h.playwright.flatMap((p) => listTree(p.dir, realFs)
      .map((f) => ({ from: `${p.dir}/${f.rel}`, to: `${PACK_LAYOUT.harnessModules}/${p.name}/${f.rel}`, size: f.size }))) },
    { name: 'stub', to: PACK_LAYOUT.desktopStub, files: [file(h.launchToMission, PACK_LAYOUT.launchToMission)] },
    ...(h.chromium ? [{ name: 'chromium', to: `${PACK_LAYOUT.browsers}/${h.chromium.name}`, files: listTree(h.chromium.dir, realFs)
      .map((f) => ({ from: `${h.chromium!.dir}/${f.rel}`, to: `${PACK_LAYOUT.browsers}/${h.chromium!.name}/${f.rel}`, size: f.size })) }] : []),
    { name: 'written', to: '.', files: [], built: `${PACK_LAYOUT.startHere}, ${PACK_LAYOUT.readme}, ${PACK_LAYOUT.version}, the drop-here notes, the .keep files` },
  ];
  return { out: h.out, groups, excluded: h.pcsx2.excluded };
}

/** The GUI's page and the design system beside it (`gui/ds/*.css`, `gui/fonts/*`); PK-5's page absent: none. */
function guiFiles(): { from: string; to: string; size: number }[] {
  if (!existsSync(GUI_INDEX)) return [];
  const ds = `${REPO}/shared/ds`;
  const fonts = `${REPO}/shared/fonts`;
  return [
    file(GUI_INDEX, `${PACK_LAYOUT.gui}/index.html`),
    ...readdirSync(ds).filter((n) => n.endsWith('.css')).map((n) => file(`${ds}/${n}`, `${PACK_LAYOUT.gui}/ds/${n}`)),
    ...readdirSync(fonts).filter((n) => statSync(`${fonts}/${n}`).isFile()).map((n) => file(`${fonts}/${n}`, `${PACK_LAYOUT.gui}/fonts/${n}`)),
  ];
}

/** The refusals a build would hit that the plan itself does not (each one line). */
function buildRefusals(h: Host, args: BuildArgs): string[] {
  const r: string[] = [];
  const outRefusal = outDirRefusal(h.out, gitTopLevel, isIgnored);
  if (outRefusal) r.push(outRefusal);
  if (existsSync(h.out) && (!statSync(h.out).isDirectory() || readdirSync(h.out).length > 0)) r.push(`${h.out} is not empty: name a new folder, or delete it first`);
  if (args.zip) {
    const z = outDirRefusal(h.zipPath, gitTopLevel, isIgnored);
    if (z) r.push(z);
    if (existsSync(h.zipPath)) r.push(`${h.zipPath} exists: delete it first`);
  }
  if (!existsSync(HARNESS_ENTRY)) r.push(`no harness entry at ${HARNESS_ENTRY}: PK-5 not merged`);
  if (!existsSync(GUI_INDEX)) r.push(`no GUI page at ${GUI_INDEX}: PK-5 not merged`);
  const dirty = git(['status', '--porcelain', '--', 'socomlegacy', 'shared', 'package.json', 'package-lock.json']);
  if (dirty === null) r.push(`git status failed in ${REPO}: the page's tag and sha cannot be read`);
  else if (dirty !== '') r.push(`uncommitted changes under socomlegacy/ or shared/: the page would not be the commit VERSION.json names (as deploy/nightly.sh refuses)`);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// The build's steps

/** The host lock, read only (AGENTS.md "Layout" 5): a HELD line refuses the heavy step. */
function lockCheck(h: Host, what: string): void {
  if (h.lockScript === null) return;
  const r = spawnSync('bash', [h.lockScript, 'check'], { encoding: 'utf8' });
  const line = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split(/\r?\n/).pop() ?? '';
  if (r.status !== 0 || r.error) fail(`the host lock could not be read (${h.lockScript} check): ${line || r.error?.message}`);
  if (/HELD/.test(line)) fail(`the host lock is held, so ${what} waits: ${line}`);
  say(`host lock: ${line}`);
}

function buildPage(h: Host): void {
  lockCheck(h, 'the page build');
  const site = `${h.out}/${PACK_LAYOUT.site}`;
  const vite = `${dirname(createRequire(`${REDOTCOM}/package.json`).resolve('vite/package.json'))}/bin/vite.js`;
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development', VITE_S2U_ACCOUNT_ORIGIN_ONLY: '1' };
  for (const k of UNSET_FOR_PAGE) delete env[k];
  say(`page: vite build --config packages/viewer/vite.config.ts --outDir ${site} --emptyOutDir (development, minified)`);
  const r = spawnSync(process.execPath, [vite, 'build', '--config', 'packages/viewer/vite.config.ts', '--outDir', site, '--emptyOutDir'], { cwd: REDOTCOM, env, stdio: 'inherit' });
  if (r.status !== 0) fail(`the page build failed (exit ${r.status ?? r.signal})`);
  const assets = `${site}/assets`;
  if (!existsSync(assets)) fail(`the page build wrote no ${assets}`);
  const names = readdirSync(assets);
  const read = (ext: string): string => names.filter((n) => n.endsWith(ext)).map((n) => readFileSync(`${assets}/${n}`, 'utf8')).join('\n');
  const missing = checkDevBuild(read('.js'), read('.css'));
  if (missing.length > 0) fail(`the page is not a development build: missing ${missing.join(', ')}`);
  say('page: the development markers are in');
}

async function bundleHarness(h: Host): Promise<void> {
  lockCheck(h, 'the harness bundle');
  const { build } = await import('esbuild');
  const outfile = `${h.out}/${PACK_LAYOUT.harnessBundle}`;
  say(`harness: esbuild ${HARNESS_ENTRY} -> ${outfile}`);
  await build({
    entryPoints: [HARNESS_ENTRY], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile, logLevel: 'warning',
    external: ['@playwright/test', 'playwright', 'playwright-core', 'esbuild', 'vite'],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
}

function copyGroup(h: Host, g: PlanGroup): void {
  for (const f of g.files) {
    const to = `${h.out}/${f.to}`;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(f.from, to);
  }
}

function pcsx2Version(exe: string): string {
  if (process.platform !== 'win32') return 'unknown';
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`], { encoding: 'utf8' });
  const v = r.status === 0 ? (r.stdout ?? '').trim() : '';
  return v || 'unknown';
}

const crlf = (s: string): string => s.replace(/\r?\n/g, '\r\n');

function writeText(h: Host, rel: string, text: string): void {
  const to = `${h.out}/${rel}`;
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, text);
}

function writeFiles(h: Host, plan: PackPlan, pageSha: string, pageTag: string, builderCommit: string, pcsx2: string): void {
  const vars = {
    PACK_NAME: h.name, PAGE_TAG: pageTag, STAMP: packStamp(h.now),
    BIOS_STEP: h.withBios
      ? 'This pack already includes a PS2 BIOS, so nothing else is needed; if you would rather use your own dump, put it in\n   "drop-here\\bios" (the .bin file, with its .nvm and .mec files if you have them) and it is used instead.'
      : 'and your own PS2 BIOS dump in "drop-here\\bios" (the .bin file, with its .nvm and .mec files if you have them).',
    BIOS_SHIPPED: h.withBios ? 'a PS2 BIOS is included in this pack (for your use with this harness only)' : 'you supply your own PS2 BIOS',
  };
  writeText(h, PACK_LAYOUT.startHere, crlf(fillTemplate(readFileSync(`${TEMPLATES}/START-HERE.cmd`, 'utf8'), vars)));
  writeText(h, PACK_LAYOUT.readme, crlf(fillTemplate(readFileSync(`${TEMPLATES}/README.txt`, 'utf8'), vars)));
  writeText(h, PACK_LAYOUT.isoNote, crlf('Put your SOCOM II (US) disc image (.iso) in this folder. Only one .iso, please.\n'));
  writeText(h, PACK_LAYOUT.biosNote, crlf(h.withBios
    ? 'This pack includes a PS2 BIOS already. To use your own instead, put it in this folder (the .bin file, with its .nvm and .mec files if you have them).\n'
    : 'Put your PS2 BIOS dump in this folder (the .bin file, with its .nvm and .mec files if you have them).\n'));
  for (const k of [PACK_LAYOUT.handoffKeep, PACK_LAYOUT.runsKeep, PACK_LAYOUT.logsKeep]) writeText(h, k, '');
  mkdirSync(`${h.out}/${PACK_LAYOUT.pcsx2}/bios`, { recursive: true });
  const included = [
    `pcsx2 ${pcsx2}`, `site ${pageTag}`, 'harness', `node ${process.version}`, 'ffmpeg',
    ...h.playwright.map((p) => `${p.name} ${p.version}`), ...(h.chromium ? [h.chromium.name] : []), ...(h.withBios ? ['bios (PK.R6)'] : []),
  ];
  const v = versionJson({ pageSha, pageTag, pcsx2Version: pcsx2, builderCommit, now: h.now, included });
  writeText(h, PACK_LAYOUT.version, `${JSON.stringify(v, null, 2)}\n`);
  say(`wrote ${PACK_LAYOUT.startHere}, ${PACK_LAYOUT.readme}, ${PACK_LAYOUT.version} (${plan.groups.length} groups)`);
}

async function zipPack(h: Host): Promise<void> {
  const top = basename(h.out);
  const entries = listTree(h.out, realFs).map((f) => ({ name: `${top}/${f.rel}`, path: `${h.out}/${f.rel}`, mtime: h.now }));
  say(`zip: ${entries.length} entries -> ${h.zipPath}`);
  const r = await writeZipFile(h.zipPath, entries, { now: h.now });
  say(`zip: ${r.entries} entries, ${r.bytes.toLocaleString('en-US')} bytes`);
}

// ---------------------------------------------------------------------------------------------------------------------
// The check (no PCSX2 starts: PK.R4)

async function status(): Promise<unknown | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${GUI_PORT}/api/status`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
}

async function checkPack(out: string): Promise<void> {
  const node = `${out}/${PACK_LAYOUT.node}`;
  const harness = `${out}/${PACK_LAYOUT.harnessBundle}`;
  for (const p of [node, harness, `${out}/${PACK_LAYOUT.version}`]) if (!existsSync(p)) fail(`no ${p}: is ${out} a built pack?`);
  if (existsSync(`${out}/${PACK_LAYOUT.dropHere}`) && readdirSync(`${out}/${PACK_LAYOUT.dropHere}`).some((n) => /\.iso$/i.test(n))) {
    fail(`${out}/${PACK_LAYOUT.dropHere} holds an image: the check runs with none`);
  }
  if (await status() !== null) fail(`something already answers on 127.0.0.1:${GUI_PORT}: stop it before the check`);
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') env[k] = v;
  Object.assign(env, packEnv(out, process.env.PATH ?? process.env.Path ?? ''));
  say(`check: ${node} ${harness} gui --check`);
  const child = spawn(node, [harness, 'gui', '--check'], { cwd: out, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let exited: number | null | undefined;
  child.on('exit', (code) => { exited = code; });
  child.stdout.on('data', (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) if (l) say(`  gui | ${l}`); });
  child.stderr.on('data', (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) if (l) say(`  gui! ${l}`); });
  try {
    const until = Date.now() + CHECK_WAIT_MS;
    let s: unknown | null = null;
    while (Date.now() < until && exited === undefined) {
      s = await status();
      if (s !== null) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (s === null) fail(exited !== undefined ? `the pack's GUI exited (code ${exited}) before it answered` : `the pack's GUI did not answer on 127.0.0.1:${GUI_PORT} within ${CHECK_WAIT_MS / 1000} s`);
    const j = judgeChecklist(s);
    for (const l of j.lines) say(l);
    if (j.failed.length > 0) fail(`the check failed: ${j.failed.join(', ')} not green`);
    say("check: every line is green but the ones the tester's own files turn green (the image, the BIOS, the maps) and the pad's warning");
  } finally {
    killTree(child.pid);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseBuildArgs(argv);
  if (args.help) { console.log(BUILD_USAGE); return 0; }
  if (!isAbsolute(args.out)) say(`--out ${args.out} resolved against ${process.cwd()}`);
  if (args.checkOnly) { await checkPack(slash(resolve(args.out))); return 0; }

  const h = readHost(args, process.env);
  const plan = planPack(h);
  const refusals = buildRefusals(h, args);
  if (args.dryRun) {
    console.log('parity pack plan -- nothing written (--dry-run)');
    for (const l of describePlan(plan)) console.log(l);
    if (args.zip) console.log(`zip        ${h.zipPath}`);
    for (const r of refusals) console.log(`refused    ${r}`);
    return refusals.length > 0 ? 1 : 0;
  }
  if (refusals.length > 0) fail(refusals.join('\n  '));

  const pageSha = git(['rev-parse', '--short', 'HEAD']) ?? fail('git rev-parse failed');
  const pageTag = git(['describe', '--tags', '--always']) ?? fail('git describe failed');
  const builderCommit = pageSha;
  const pcsx2 = pcsx2Version(`${h.pcsx2Source}/pcsx2-qt.exe`);
  say(`building ${h.name} at ${h.out} (page ${pageTag} ${pageSha}, PCSX2 ${pcsx2})`);
  mkdirSync(h.out, { recursive: true });

  buildPage(h);
  await bundleHarness(h);
  for (const g of plan.groups) {
    if (g.files.length === 0) continue;
    if (g.name === 'playwright') {
      for (const p of h.playwright) cpSync(p.dir, `${h.out}/${PACK_LAYOUT.harnessModules}/${p.name}`, { recursive: true, dereference: true });
    } else {
      copyGroup(h, g);
    }
    say(`${g.name}: ${g.files.length} files -> ${g.to}`);
  }
  writeText(h, `${PACK_LAYOUT.pcsx2}/inis/PCSX2.ini`, packIni(readFileSync(h.iniSource, 'utf8')));
  say(`pcsx2: ${PACK_LAYOUT.pcsx2}/inis/PCSX2.ini rewritten (DEV9 off; ${h.pcsx2.excluded.length} files left out)`);
  writeFiles(h, plan, pageSha, pageTag, builderCommit, pcsx2);

  if (args.zip) await zipPack(h);
  if (args.check) await checkPack(h.out);
  say(`done: ${h.out}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err: Error) => {
    console.error(err instanceof PackPlanError ? err.message : `parity pack: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}
