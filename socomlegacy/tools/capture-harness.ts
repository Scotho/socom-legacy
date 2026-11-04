/**
 * The capture harness's command line (PLAT-30; web research 108). No game run, no browser: it scores directories.
 *
 *   npx tsx tools/capture-harness.ts score <golden.png> <ours.png> [--letterbox] [--mask x0,y0,x1,y1[;...]]
 *   npx tsx tools/capture-harness.ts report <golden-dir> <run-dir> [--align align.json] [--out report.md] [--letterbox] [--mask ...]
 *   npx tsx tools/capture-harness.ts title <run-dir> [--ref scripts/parity/ref_main_menu_ours.png]
 *
 * `score` prints compare.score's dict as Python prints it, the black control and the verdict. `report` is
 * compare.report's table (golden labels, `align.json`'s `{golden: [ours, note]}`) with the control and the verdict
 * beside each row. `title` is `gate --score-title`: the same PASS/FAIL line, exit 0 or 1. Relative reference paths
 * resolve against the desktop checkout (the gate's cwd): `SOCOM_PC_ROOT` when it is set, else the `ref/desktop`
 * submodule.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { judge, pyFixed, type Rect, type ScoreOptions } from './captureScore';
import { readPng, reportMarkdown, reportRows, scoreTitleDir } from './captureRun';
import { repoRoot } from './desktop';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string): boolean => rest.includes(`--${name}`);
const opt = (name: string): string | undefined => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1]?.startsWith('--') && !['--letterbox'].includes(rest[i - 1]!)));
const root = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : join(repoRoot() ?? '.', 'ref', 'desktop');

const options = (): ScoreOptions => {
  const m = opt('mask');
  const mask = m ? m.split(';').map((r) => r.split(',').map(Number) as unknown as Rect) : undefined;
  return { pcsx2Letterbox: flag('letterbox'), ...(mask ? { mask } : {}) };
};
/** Python's float repr for a printed dict: a whole number keeps its `.0`. */
const py = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

if (cmd === 'score' && positional.length === 2) {
  const j = judge(readPng(positional[0]!), readPng(positional[1]!), options());
  console.log(`{'score': ${py(j.score)}, 'mad': ${py(j.mad)}, 'block': ${py(j.block)}}`);
  console.log(`control ${pyFixed(j.control, 1)}; ${j.matched ? 'matched' : `not matched: ${j.why}`}`);
  process.exit(j.matched ? 0 : 1);
} else if (cmd === 'report' && positional.length === 2) {
  const [golden, run] = positional as [string, string];
  const alignPath = opt('align');
  const align = alignPath ? JSON.parse(readFileSync(alignPath, 'utf8')) : {};
  const md = reportMarkdown(reportRows(golden, run, align, options()), golden, run);
  const outPath = opt('out');
  if (outPath) writeFileSync(outPath, md); else process.stdout.write(md);
} else if (cmd === 'title' && positional.length === 1) {
  const ref = resolve(root, opt('ref') ?? 'scripts/parity/ref_main_menu_ours.png');
  if (!existsSync(ref)) { console.error(`capture-harness: no reference at ${ref}`); process.exit(2); }
  const r = scoreTitleDir(positional[0]!, ref);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} title (${r.detail})`);
  process.exit(r.ok ? 0 : 1);
} else {
  console.error('usage: capture-harness.ts score <golden.png> <ours.png> | report <golden-dir> <run-dir> | title <run-dir>  (see the header)');
  process.exit(2);
}
