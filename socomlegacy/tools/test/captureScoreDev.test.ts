import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { blackFrame } from '../captureImage';
import { score, thumb, thumbDistance, titleCaptures, toGrey } from '../captureScore';
import { PROMPT_THRESH, SCREEN_THRESH, cropRefDistance, isScreen, refScales, screenGrey, type CropRef } from '../captureRefs';
import { readPng, scoreTitleDir, writeRun } from '../captureRun';
import type { ManifestEntry } from '../captureSteps';

/**
 * The capture harness against the reference itself, on the archived captures -- dev host only (PLAT-30's calibration;
 * web research 108 §2.4). The captures live in the PC project (`SOCOM_PC_ROOT`), never in this tree (W6.R8): the
 * recomp's title-gate run `logs/parity/gate/x51_gate_iop/title`, PCSX2's `logs/parity/runs/pcsx2_title1` (640x480) and
 * `pcsx2_mission_a`, and the PC project's committed references (`scripts/parity/ref_main_menu_ours.pcsx2.png`, the
 * 640x448 letterboxed lobby titles `scripts/parity/refs/lobby/title_*.pcsx2.png` beside the recomp's `title_*.png`).
 *
 * Python is spawned once through the PC project's `scripts/python_env.sh` (cwd `SOCOM_PC_ROOT`) and prints
 * `compare.score` for every pair -- the gate's own module, no copy -- and `drive.thumb` distances; the harness must
 * print the same three numbers for every pair. Then the harness writes a run directory from the recomp's title captures
 * (decoded and re-encoded by its own reader and writer, `manifest.json` in drive.py's format) and
 * `python -m tools_py.parity.gate --score-title <dir>` must PASS it with the detail line the harness computes itself.
 * Without the PC project, its captures, bash or a Python, everything here skips -- reported as skipped (`ctx.skip`),
 * never as a pass: a dev host that has lost its Python shows no green calibration.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const P = (...p: string[]): string => join(PC_ROOT ?? '', ...p);
const GATE_TITLE = P('logs', 'parity', 'gate', 'x51_gate_iop', 'title');
const PCSX2_TITLE = P('logs', 'parity', 'runs', 'pcsx2_title1');
const PCSX2_CARDS = P('logs', 'parity', 'runs', 'pcsx2_mission_a');
const MENU_PCSX2 = P('scripts', 'parity', 'ref_main_menu_ours.pcsx2.png');
const LOBBY = P('scripts', 'parity', 'refs', 'lobby');
const HAVE = PC_ROOT !== null && [GATE_TITLE, PCSX2_TITLE, PCSX2_CARDS, MENU_PCSX2, LOBBY, P('scripts', 'python_env.sh')].every(existsSync);

interface Pair { golden: string; ours: string | null; letterbox?: boolean }
interface Printed { score: number; mad: number; block: number }

/** The sample: every pair the brief names a family of, from the files present. */
function pairs(): Pair[] {
  const out: Pair[] = [];
  const title = titleCaptures(readdirSync(GATE_TITLE));
  // the recomp's title captures against PCSX2's main menu (the gate's own question, with PCSX2 as the golden)
  for (const n of title) out.push({ golden: MENU_PCSX2, ours: join(GATE_TITLE, n) });
  // PCSX2's 640x480 title run against the recomp's, by step index (the gate's whole-frame squeeze of 480 to 224)
  const byStep = new Map(title.map((n) => [n.slice(0, 3), n]));
  for (const n of titleCaptures(readdirSync(PCSX2_TITLE))) {
    const o = byStep.get(n.slice(0, 3));
    if (o) out.push({ golden: join(PCSX2_TITLE, n), ours: join(GATE_TITLE, o) });
  }
  // research 98 §1's dark opening cards against black: the control's numbers (ours null = black)
  for (const n of ['s02_CROSS.png', 's03_CROSS.png', 's04_CROSS.png']) out.push({ golden: join(PCSX2_CARDS, n), ours: null });
  // PCSX2's 640x448 letterboxed lobby titles against the recomp's, with and without the 4:3 correction
  for (const n of readdirSync(LOBBY).filter((f) => f.endsWith('.pcsx2.png')).sort()) {
    const o = join(LOBBY, n.replace('.pcsx2.png', '.png'));
    if (!existsSync(o)) continue;
    out.push({ golden: join(LOBBY, n), ours: o });
    out.push({ golden: join(LOBBY, n), ours: o, letterbox: true });
  }
  return out;
}

const PY = [
  'import json, sys',
  'from PIL import Image',
  'from tools_py.parity import compare, drive',
  'job = json.loads(sys.stdin.read())',
  'out = []',
  'for p in job["pairs"]:',
  '    g = Image.open(p["golden"]).convert("RGB")',
  '    o = Image.open(p["ours"]).convert("RGB") if p["ours"] else Image.new("RGB", g.size)',
  '    if p.get("letterbox"):',
  '        x0 = (g.width - g.width * g.height / 480.0) / 2',
  '        g = g.resize(compare.SIZE, Image.BOX, box=(x0, 0, g.width - x0, g.height))',
  '    out.append(compare.score(g, o))',
  'dist = []',
  'for a, b in job["thumbs"]:',
  '    dist.append(float(abs(drive.thumb(Image.open(a)) - drive.thumb(Image.open(b))).mean()))',
  'print(json.dumps(dict(scores=out, dist=dist)))',
].join('\n');

function python(args: string[], input: string): { out: string; why: string | null } {
  const r = spawnSync('bash', ['-c', '. scripts/python_env.sh && socom_require_python captureScoreDev && exec "$PYTHON" "$@"', 'captureScoreDev', ...args],
    { cwd: PC_ROOT!, input, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) return { out: '', why: `bash did not run (${r.error.message})` };
  if (r.status !== 0 && r.status !== 1) return { out: r.stdout, why: `bash or Python failed (exit ${r.status}): ${r.stderr.trim().split('\n').pop() ?? ''}` };
  return { out: r.stdout, why: null };
}

describe.skipIf(!HAVE)('the harness against compare.py and the gate, on the archived captures (dev host)', () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it('prints compare.score\'s numbers for every sampled pair, and drive.thumb\'s distances', (ctx) => {
    const sample = pairs();
    const title = titleCaptures(readdirSync(GATE_TITLE));
    const thumbs = title.slice(0, 6).map((n, i) => [join(GATE_TITLE, n), join(GATE_TITLE, title[i + 1]!)] as const);
    const py = python(['-c', PY], JSON.stringify({ pairs: sample, thumbs }));
    if (py.why) { ctx.skip(`captureScoreDev: not compared -- ${py.why}`); return; }
    const ref = JSON.parse(py.out) as { scores: Printed[]; dist: number[] };
    const ours = sample.map((p) => {
      const g = readPng(p.golden);
      return score(g, p.ours ? readPng(p.ours) : blackFrame(g.width, g.height), { pcsx2Letterbox: p.letterbox === true });
    });
    console.log(`captureScoreDev: ${sample.length} pairs, ${ours.filter((s, i) => s.score === ref.scores[i]!.score).length} scores equal`);
    expect(sample.length).toBeGreaterThanOrEqual(40);
    expect(ours).toEqual(ref.scores);
    expect(thumbs.map(([a, b]) => thumbDistance(thumb(readPng(a)), thumb(readPng(b))))).toEqual(ref.dist);
  }, 600_000);

  it('writes a run directory that gate --score-title passes, with the detail the harness computes', (ctx) => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-title-'));
    dirs.push(dir);
    const names = titleCaptures(readdirSync(GATE_TITLE));
    const manifest: ManifestEntry[] = names.map((n, i) => ({ step: i, label: n.slice(0, -4), t: 22 + 6 * i, stable: true, waited: 0, buttons: [] }));
    writeRun(dir, new Map(names.map((n) => [n, readPng(join(GATE_TITLE, n))])), manifest);
    const ours = scoreTitleDir(dir, P('scripts', 'parity', 'ref_main_menu_ours.png'));
    const py = python(['-m', 'tools_py.parity.gate', '--score-title', dir], '');
    if (py.why) { ctx.skip(`captureScoreDev: gate not run -- ${py.why}`); return; }
    expect(ours.ok).toBe(true);
    expect(py.out.trim()).toBe(`PASS title (${ours.detail})`);
  }, 600_000);
});

const REFS = P('scripts', 'parity', 'refs');
const BLOP = P('logs', 'parity', 'blop_c');
/** The login run's screens the crop references name (the recomp's, 640x448). */
const BLOP_FRAMES = ['00_login.png', '01_universe.png', '07_write_down.png', '08_eula.png', '09_lobby.png'];
const HAVE_REFS = PC_ROOT !== null && [join(REFS, 'refs.json'), P('scripts', 'python_env.sh'), ...BLOP_FRAMES.map((f) => join(BLOP, f))].every(existsSync);

const PY_REFS = [
  'import json, sys, numpy as np',
  'from PIL import Image',
  'from tools_py.parity import online_login_ours as olo',
  'job = json.loads(sys.stdin.read())',
  'sh = olo.Shell.__new__(olo.Shell)',
  'sh.meta = json.load(open(olo.REFS + "/refs.json"))',
  'out = []',
  'for f in job["frames"]:',
  '    arr = np.asarray(Image.open(f).convert("L").resize((320, 224)), dtype=float)',
  '    out.append({n: sh.diff(n, arr=arr) for n in sorted(sh.meta)})',
  'print(json.dumps(out))',
].join('\n');

describe.skipIf(!HAVE_REFS)('the crop references against Shell.diff, on the login run (dev host)', () => {
  it('prints Shell.diff\'s distance for every refs.json reference on every frame, and is_screen\'s verdicts', (ctx) => {
    const frames = BLOP_FRAMES.map((f) => join(BLOP, f));
    const py = python(['-c', PY_REFS], JSON.stringify({ frames }));
    if (py.why) { ctx.skip(`captureScoreDev: crop references not compared -- ${py.why}`); return; }
    const ref = JSON.parse(py.out) as Record<string, number>[];
    const meta = JSON.parse(readFileSync(join(REFS, 'refs.json'), 'utf8')) as Record<string, CropRef>;
    const refs = new Map(Object.keys(meta).sort().map((n) => [n, { meta: meta[n]!, scales: refScales(toGrey(readPng(join(REFS, `${n}.png`)))) }]));
    const ours = frames.map((f) => {
      const arr = screenGrey(readPng(f));
      return Object.fromEntries([...refs].map(([n, r]) => [n, cropRefDistance(arr, r.scales, r.meta.box)]));
    });
    expect(ours).toEqual(ref);
    // is_screen from Python's own distances: at most the threshold, and the nearest among the box's sharers
    const verdict = (d: Record<string, number>, n: string): boolean => d[n]! <= (PROMPT_THRESH[n] ?? SCREEN_THRESH)
      && Object.keys(d).every((o) => o === n || meta[o]!.box.join() !== meta[n]!.box.join() || !(d[o]! < d[n]!));
    const on = frames.map((f, i) => {
      const arr = screenGrey(readPng(f));
      return [...refs.keys()].filter((n) => isScreen(arr, n, refs).matched).join(',') + '|' + Object.keys(ref[i]!).filter((n) => verdict(ref[i]!, n)).join(',');
    });
    console.log(`captureScoreDev: crop references, ${frames.length} frames x ${refs.size} references; on: ${on.join('  ')}`);
    for (const line of on) { const [a, b] = line.split('|'); expect(a).toBe(b); }
  }, 600_000);
});
