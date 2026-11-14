/**
 * PV-0 (the player's-view lane's measurement, PV.R7, `docs/plans/2026-11-11-players-view.md`; product track, a test
 * instrument with no original): a base's mp-bots runs and a head's, joined into the two percentages the owner's caps
 * hold.
 *
 *   npx tsx tools/mp-bots-compare.ts --base a.json b.json c.json --head d.json e.json f.json [--net-cap 20 --log-cap 40]
 *
 * Each file is a `tools/mp-bots.ts --json` report. The network figure is the bytes in plus out per client per second
 * at the bots' own sockets (`summary.socket.inOutPerClient`); the log figure is the run's recording's gzipped bytes per
 * second of its own ticks (`summary.recording.gzippedBytesPerSecond`, with `--spawn-server --replays <dir>`). Each side's
 * runs are meaned; the change is (head - base) / base in percent; a change past its cap is OVER. Exit 0 under both caps,
 * 1 over either, 2 on input it cannot compare: an empty side, a null figure, a zero base, or runs that differ in map,
 * players, spectators, seconds or `--scoped` share.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** PV.R7's caps, in percent: network +20, log +40 (the owner's, through the lane's controller). */
export const PV_R7_CAPS = { net: 20, log: 40 } as const;

/** One run's figures off its report (null where the report has none: never read as 0). */
export interface RunFigures {
  label: string;
  map: string | null; players: number | null; spectators: number | null; seconds: number | null; scoped: number;
  net: number | null; log: number | null;
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? x as Record<string, unknown> : {});

/** A report's figures (`label`: its file, for the problems). */
export function runFigures(report: unknown, label: string): RunFigures {
  const r = obj(report), o = obj(r.options), s = obj(r.summary);
  return {
    label, map: typeof o.map === 'string' ? o.map : null, players: num(o.players), spectators: num(o.spectators), seconds: num(o.seconds),
    scoped: num(o.scoped) ?? 0, net: num(obj(s.socket).inOutPerClient), log: num(obj(s.recording).gzippedBytesPerSecond),
  };
}

/** The change from `base` to `head`, in percent of `base`. */
export function pctChange(base: number, head: number): number {
  return ((head - base) * 100) / base;   // the 100 first: (1200 - 1000) / 1000 * 100 is 20.000000000000004, past a cap of 20
}

export interface CompareRow { measure: 'network' | 'log'; base: number; head: number; changePct: number; cap: number; verdict: 'PASS' | 'OVER' }
export interface CompareResult { rows: CompareRow[]; problems: string[]; exit: 0 | 1 | 2 }

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The two sides compared under `caps` (percent); problems make the result unusable (exit 2), with no rows. */
export function compareRuns(base: readonly RunFigures[], head: readonly RunFigures[], caps: { net: number; log: number }): CompareResult {
  const problems: string[] = [];
  if (!base.length) problems.push('the base has no run');
  if (!head.length) problems.push('the head has no run');
  const all = [...base, ...head];
  for (const r of all) {
    if (r.net === null) problems.push(`${r.label}: no network figure (summary.socket.inOutPerClient)`);
    if (r.log === null) problems.push(`${r.label}: no log figure (summary.recording.gzippedBytesPerSecond; run with --spawn-server --replays <dir>)`);
  }
  for (const key of ['map', 'players', 'spectators', 'seconds', 'scoped'] as const) {
    const seen = [...new Set(all.map((r) => r[key]))];
    if (seen.length > 1 || seen[0] === null) problems.push(`the runs differ or are missing in ${key}: ${all.map((r) => `${r.label} ${String(r[key])}`).join(', ')}`);
  }
  if (problems.length) return { rows: [], problems, exit: 2 };
  const row = (measure: CompareRow['measure'], pick: (r: RunFigures) => number, cap: number): CompareRow | null => {
    const b = mean(base.map(pick)), h = mean(head.map(pick));
    if (!(b > 0)) { problems.push(`the base's ${measure} mean is ${b}: no percentage of it`); return null; }
    const changePct = pctChange(b, h);
    return { measure, base: b, head: h, changePct, cap, verdict: changePct > cap ? 'OVER' : 'PASS' };
  };
  const rows = [row('network', (r) => r.net!, caps.net), row('log', (r) => r.log!, caps.log)];
  if (problems.length) return { rows: [], problems, exit: 2 };
  const done = rows as CompareRow[];
  return { rows: done, problems, exit: done.some((r) => r.verdict === 'OVER') ? 1 : 0 };
}

/** The table: base mean, head mean, the change, the cap, the verdict; or the problems. */
export function compareTable(r: CompareResult): string {
  if (r.problems.length) return ['unusable input (exit 2):', ...r.problems.map((p) => `- ${p}`)].join('\n');
  const unit = (m: CompareRow['measure']): string => (m === 'network' ? 'B/s per client, in + out' : 'gzipped B/s of recording');
  const sign = (x: number): string => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;
  return [
    '| measure | unit | base mean | head mean | change | cap | verdict |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...r.rows.map((x) => `| ${x.measure} | ${unit(x.measure)} | ${x.base.toFixed(1)} | ${x.head.toFixed(1)} | ${sign(x.changePct)} | ${x.cap}% | ${x.verdict} |`),
  ].join('\n');
}

/** The command line: the files after `--base` and after `--head`, and the caps; an error's words as a string. */
export function parseCompareArgs(argv: readonly string[]): { base: string[]; head: string[]; netCap: number; logCap: number } | string {
  const base: string[] = [], head: string[] = [];
  let netCap: number = PV_R7_CAPS.net, logCap: number = PV_R7_CAPS.log;
  let into: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--base') into = base;
    else if (a === '--head') into = head;
    else if (a === '--net-cap' || a === '--log-cap') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) return `${a} ${String(argv[i])}: a number (percent)`;
      if (a === '--net-cap') netCap = v; else logCap = v;
      into = null;
    } else if (a.startsWith('--')) return `${a}: not an option (--base, --head, --net-cap, --log-cap)`;
    else if (into) into.push(a);
    else return `${a}: a file before --base or --head`;
  }
  if (!base.length || !head.length) return 'usage: mp-bots-compare --base <a.json ...> --head <b.json ...> [--net-cap 20 --log-cap 40]';
  return { base, head, netCap, logCap };
}

function main(): void {
  const args = parseCompareArgs(process.argv.slice(2));
  if (typeof args === 'string') { console.error(args); process.exit(2); }
  const read = (file: string): RunFigures => {
    try { return runFigures(JSON.parse(readFileSync(file, 'utf8')), file); } catch (e) {
      return runFigures(null, `${file} (unreadable: ${e instanceof Error ? e.message : String(e)})`);
    }
  };
  const result = compareRuns(args.base.map(read), args.head.map(read), { net: args.netCap, log: args.logCap });
  console.log(compareTable(result));
  process.exit(result.exit);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
