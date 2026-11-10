import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GPU_RASTER_TOLERANCE_ADAPTATION, checkTolerancePin, type UiGpuTolerancePin, type UiGpuToleranceSource, type UiGpuToleranceStats,
} from '../packages/viewer/src/uiGpuTolerance';

/**
 * GM-27 (the GPU menus plan, row GM-27; GM.R5; research 380 §1): writes the data of `GPU_RASTER_TOLERANCE_ADAPTATION`
 * (`packages/viewer/src/uiGpuToleranceData.ts`) from the parity spec's records, so a later run re-pins reproducibly. Per
 * class (review finding 1) and run key, field by field: the max over every line's f32 twin and the class's runs' GPU
 * statistics -- `software` the SwiftShader and llvmpipe records only, `gpu` every record (so a software record enters it
 * only where it exceeds the hardware's). A line the GPU did not draw (`path` software, or `l1AtLowerScale`) gives its
 * twin only. The pin is checked before it is written
 * (`checkTolerancePin`: rounding class only). A browser adaptation's instrument: it decides no pixel of the game.
 *
 *   node --import tsx tools/gm-pin-tolerance.ts --evidence <agent-mail>/evidence/gpu-menus [--sources <sources.json>]
 *     [--out <file>] [--date YYYY-MM-DD]
 *
 * `--sources` is a JSON list of `{ label, vendor, backend, host, unmasked, sha, date, summary }` (`summary` relative to
 * `--evidence`); without it, the sources of the pin in the tree are read again. Each summary's `renderer.json` beside it
 * must name the `unmasked` renderer its source says. `--date` defaults to today (UTC).
 */

export type PinSourceIn = Omit<UiGpuToleranceSource, 'runs'>;

const SOFTWARE = ['SwiftShader', 'llvmpipe'];
const counts = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0);
const stats = (v: unknown): v is { maxAbs: number[]; atLeast: number[] } =>
  !!v && counts((v as { maxAbs?: unknown }).maxAbs, 4) && counts((v as { atLeast?: unknown }).atLeast, 3);

type Acc = Map<string, { maxAbs: number[]; atLeast: number[] }>;

/**
 * The pin's max rule over named summaries' text: per class, the bound per run key (keys sorted, the same in both), and
 * how many runs each source's GPU drew. A source marked `software` (a software rasteriser's record) folds into both
 * classes; any other into `gpu` only.
 */
export function pinRuns(sources: readonly { label: string; text: string; software?: boolean }[]): {
  software: Record<string, UiGpuToleranceStats>; gpu: Record<string, UiGpuToleranceStats>; counts: Record<string, number>;
} {
  const accs: Record<'software' | 'gpu', Acc> = { software: new Map(), gpu: new Map() };
  const fold = (acc: Acc, run: string, s: { maxAbs: number[]; atLeast: number[] }): void => {
    const a = acc.get(run);
    if (!a) { acc.set(run, { maxAbs: [...s.maxAbs], atLeast: [...s.atLeast] }); return; }
    s.maxAbs.forEach((v, i) => { a.maxAbs[i] = Math.max(a.maxAbs[i]!, v); });
    s.atLeast.forEach((v, i) => { a.atLeast[i] = Math.max(a.atLeast[i]!, v); });
  };
  const drew: Record<string, number> = {};
  for (const { label, text, software = false } of sources) {
    const runs = new Set<string>();
    text.split(/\r?\n/).forEach((l, i) => {
      if (!l.trim()) return;
      let o: { run?: unknown; path?: unknown; l1AtLowerScale?: unknown; gpu?: unknown; twin?: unknown };
      try { o = JSON.parse(l) as typeof o; } catch { throw Error(`${label}: line ${i + 1} is not JSON`); }
      if (typeof o?.run !== 'string' || !o.run) throw Error(`${label}: line ${i + 1} names no run`);
      if (!stats(o.twin)) throw Error(`${label}: line ${i + 1} (${o.run}) has no twin statistics (maxAbs: 4 counts, atLeast: 3)`);
      fold(accs.software, o.run, o.twin);
      fold(accs.gpu, o.run, o.twin);
      if (o.path !== 'gpu' || o.l1AtLowerScale === true) return;
      if (!stats(o.gpu)) throw Error(`${label}: line ${i + 1} (${o.run}) has no gpu statistics (maxAbs: 4 counts, atLeast: 3)`);
      if (software) fold(accs.software, o.run, o.gpu);
      fold(accs.gpu, o.run, o.gpu);
      runs.add(o.run);
    });
    if (!runs.size) throw Error(`${label}: its GPU drew no run`);
    drew[label] = runs.size;
  }
  const out = (acc: Acc): Record<string, UiGpuToleranceStats> => {
    const runs: Record<string, UiGpuToleranceStats> = {};
    for (const key of [...acc.keys()].sort()) {
      const a = acc.get(key)!;
      runs[key] = { maxAbs: a.maxAbs as unknown as UiGpuToleranceStats['maxAbs'], atLeast: a.atLeast as unknown as UiGpuToleranceStats['atLeast'] };
    }
    return runs;
  };
  const software = out(accs.software), gpu = out(accs.gpu);
  checkTolerancePin({ pinned: '', vendors: '', sources: [], software, gpu });
  return { software, gpu, counts: drew };
}

/** The vendor matrix in words: "one vendor only (NVIDIA: D3D11 x2, Vulkan x1) plus SwiftShader and llvmpipe". */
export function vendorsText(sources: readonly PinSourceIn[]): string {
  const hw = new Map<string, Map<string, number>>();
  const soft: string[] = [];
  for (const s of sources) {
    if (SOFTWARE.includes(s.vendor)) { if (!soft.includes(s.vendor)) soft.push(s.vendor); continue; }
    const b = hw.get(s.vendor) ?? new Map<string, number>();
    b.set(s.backend, (b.get(s.backend) ?? 0) + 1);
    hw.set(s.vendor, b);
  }
  const vendor = (v: string): string => `${v}: ${[...hw.get(v)!].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} x${n}`).join(', ')}`;
  const names = [...hw.keys()].sort();
  const head = names.length === 0 ? 'no real GPU' : names.length === 1 ? `one vendor only (${vendor(names[0]!)})` : `${names.length} vendors (${names.map(vendor).join('; ')})`;
  return soft.length ? `${head} plus ${soft.join(' and ')}` : head;
}

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The data module's text: a header naming this tool, then the pin, one line per source and per run of each class. */
export function renderTolerancePin(pin: UiGpuTolerancePin): string {
  const src = (s: UiGpuToleranceSource): string =>
    `    { label: ${q(s.label)}, vendor: ${q(s.vendor)}, backend: ${q(s.backend)}, host: ${q(s.host)},\n`
    + `      unmasked: ${q(s.unmasked)},\n`
    + `      sha: ${q(s.sha)}, date: ${q(s.date)}, summary: ${q(s.summary)}, runs: ${s.runs} },`;
  return [
    '// Written by tools/gm-pin-tolerance.ts (GM-27) from the parity spec\'s records -- re-pin by running it, never by hand.',
    '// The data of GPU_RASTER_TOLERANCE_ADAPTATION (./uiGpuTolerance.ts, which checks it at load); research 380 §1.',
    "import type { UiGpuTolerancePin } from './uiGpuTolerance';",
    '',
    'export const UI_GPU_TOLERANCE_PIN: UiGpuTolerancePin = {',
    `  pinned: ${q(pin.pinned)},`,
    `  vendors: ${q(pin.vendors)},`,
    '  sources: [',
    ...pin.sources.map(src),
    '  ],',
    ...(['software', 'gpu'] as const).flatMap((cls) => [
      cls === 'software' ? '  // the software rasterisers (SwiftShader, llvmpipe): the twin and their records' : '  // the GPUs: the twin and every record',
      `  ${cls}: {`,
      ...Object.entries(pin[cls]).map(([k, r]) => `    ${q(k)}: { maxAbs: [${r.maxAbs.join(', ')}], atLeast: [${r.atLeast.join(', ')}] },`),
      '  },',
    ]),
    '};',
    '',
  ].join('\n');
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The command: read the summaries, check each renderer, write the module. */
export function pinMain(argv: readonly string[]): void {
  const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const evidence = arg('--evidence');
  if (!evidence) throw Error('gm-pin-tolerance: --evidence <the evidence root the summaries are under> is required');
  const out = arg('--out') ?? join(ROOT, 'packages', 'viewer', 'src', 'uiGpuToleranceData.ts');
  const date = arg('--date') ?? new Date().toISOString().slice(0, 10);
  const listed = arg('--sources');
  const sources: PinSourceIn[] = listed
    ? (JSON.parse(readFileSync(listed, 'utf8')) as PinSourceIn[])
    : GPU_RASTER_TOLERANCE_ADAPTATION.sources.map(({ runs: _runs, ...s }) => s);
  if (!sources.length) throw Error('gm-pin-tolerance: no source named');
  const texts = sources.map((s) => {
    const summary = join(evidence, s.summary);
    const rendererFile = join(dirname(summary), 'renderer.json');
    if (!existsSync(rendererFile)) throw Error(`${s.label}: renderer.json: none beside ${s.summary}`);
    const unmasked = (JSON.parse(readFileSync(rendererFile, 'utf8')) as { unmasked?: unknown }).unmasked;
    if (unmasked !== s.unmasked) throw Error(`${s.label}: renderer.json names ${JSON.stringify(unmasked)}, not ${JSON.stringify(s.unmasked)}`);
    return { label: s.label, text: readFileSync(summary, 'utf8'), software: SOFTWARE.includes(s.vendor) };
  });
  const { software, gpu, counts: drew } = pinRuns(texts);
  const pin: UiGpuTolerancePin = { pinned: date, vendors: vendorsText(sources), sources: sources.map((s) => ({ ...s, runs: drew[s.label]! })), software, gpu };
  checkTolerancePin(pin);
  writeFileSync(out, renderTolerancePin(pin));
  const big = (runs: Record<string, UiGpuToleranceStats>): string => {
    const v = Object.values(runs);
    return `max |Δ| ${Math.max(...v.flatMap((r) => [...r.maxAbs]))}, largest count at |Δ| >= 1 ${Math.max(...v.map((r) => r.atLeast[0]))}`;
  };
  console.log(`gm-pin-tolerance: ${Object.keys(gpu).length} runs from ${sources.length} sources (${pin.vendors}) -> ${out}; software ${big(software)}; gpu ${big(gpu)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) pinMain(process.argv.slice(2));
