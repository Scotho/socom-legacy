/**
 * BOP-S batch 9 (`docs/plans/2026-10-28-bot-performance.md`): the calibration behind `RAY_UNITS_PER_SAMPLE_ADAPTATION`
 * (`packages/match/src/bots/positions.ts`) -- what a cover line-of-sight test costs against one glide sample (2.5 units)
 * on MP2, so S1 can re-run it on the reference box. A product-track instrument (the bots are the port's own, OT.R81):
 * it times, it changes nothing.
 * Rays: CombatPositions' own tests (`blocked`, `protected`, `canFire`) between the cover choice's kinds of points -- a
 * candidate (a graph node) and a threat (another node 60-400 units off, eyes raised as the cover code raises them).
 * Glides: WalkingNavigation's own mover glide (`clearBody`, private) between a node and a point 2.5-60 units off on its
 * own height, timed per glide and divided by its samples (`glideSamples`). Interleaved rounds, medians; then `blocked`
 * by length band. From socomlegacy/ (needs the MP2 fixtures and the prepared graph):
 *   npx tsx tools/bops-raycal.ts [pairs=4000] [rounds=7]
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FsAssetSource } from '@s2u/archive/node';
import { loadKitSource, simMapFromBytes } from '../packages/viewer/src/sim';
import { glideSamples, validateBotNavigation, WalkingNavigation, type Point } from '../packages/match/src/bots/navigation';
import { CombatPositions } from '../packages/match/src/bots/positions';

const pairs = Number(process.argv[2] ?? 4000), rounds = Number(process.argv[3] ?? 7);
const root = resolve(import.meta.dirname, '../test-fixtures'), navPath = resolve(import.meta.dirname, '../public/maps/nav/MP2.json');
const source = await loadKitSource(new FsAssetSource(root));
const map = simMapFromBytes(new Uint8Array(readFileSync(join(root, 'RUN/MP2.ZDB'))), 'RUN/MP2.ZDB', source);
const nav = new WalkingNavigation(map, validateBotNavigation(map, JSON.parse(readFileSync(navPath, 'utf8')))!);
const positions = new CombatPositions(nav);
let s = 12345;
const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const nodes = nav.nodes.filter((n) => n.edges?.length).map((n) => n.at as Point);
const pick = (): Point => nodes[Math.floor(rnd() * nodes.length)]!;
// Ray pairs: candidate and threat 60-400 apart.
const rays: [Point, Point][] = [];
while (rays.length < pairs) { const a = pick(), b = pick(); const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d >= 60 && d <= 400) rays.push([a, b]); }
// Glide pairs: a node and a point 2.5-60 off in a random direction on its own height (the walk tests' own lengths).
const glides: [Point, Point][] = [];
while (glides.length < pairs) {
  const a = pick(), len = 2.5 + rnd() * 57.5, ang = rnd() * Math.PI * 2;
  glides.push([a, [a[0] + Math.sin(ang) * len, a[1], a[2] + Math.cos(ang) * len]]);
}
const clearBody = (nav as unknown as { clearBody(a: Point, b: Point): boolean }).clearBody.bind(nav);
const samples = glides.reduce((t, [a, b]) => t + glideSamples(a, b), 0);
const median = (xs: number[]): number => [...xs].sort((x, y) => x - y)[xs.length >> 1]!;
const per = { blocked: [] as number[], protected: [] as number[], canFire: [] as number[], sample: [] as number[], glide: [] as number[] };
let sink = 0;
for (let r = 0; r < rounds; r++) {
  let t0 = performance.now();
  for (const [a, b] of rays) if (positions.blocked([a[0], a[1] + 12, a[2]], [b[0], b[1] + 12, b[2]])) sink++;
  per.blocked.push((performance.now() - t0) / rays.length);
  t0 = performance.now();
  for (const [a, b] of rays) if (positions.protected(a, b, true)) sink++;
  per.protected.push((performance.now() - t0) / rays.length);
  t0 = performance.now();
  for (const [a, b] of rays) if (positions.canFire(a, b)) sink++;
  per.canFire.push((performance.now() - t0) / rays.length);
  t0 = performance.now();
  for (const [a, b] of glides) if (clearBody(a, b)) sink++;
  const g = performance.now() - t0;
  per.sample.push(g / samples); per.glide.push(g / glides.length);
}
const m = { blocked: median(per.blocked), protected: median(per.protected), canFire: median(per.canFire), sample: median(per.sample), glide: median(per.glide) };
const rayLen = rays.reduce((t, [a, b]) => t + Math.hypot(a[0] - b[0], a[2] - b[2]), 0) / rays.length;
console.log(JSON.stringify({ pairs, rounds, meanRayLength: +rayLen.toFixed(1), meanGlideSamples: +(samples / glides.length).toFixed(2),
  msPerCall: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(5)])),
  raysPerSample: { blocked: +(m.blocked / m.sample).toFixed(3), protected: +(m.protected / m.sample).toFixed(3), canFire: +(m.canFire / m.sample).toFixed(3) },
  sink }));
// By length: blocked() in four length bands.
for (const [lo, hi] of [[60, 120], [120, 200], [200, 300], [300, 400]] as const) {
  const band = rays.filter(([a, b]) => { const d = Math.hypot(a[0] - b[0], a[2] - b[2]); return d >= lo && d < hi; });
  const t0 = performance.now();
  for (let r = 0; r < 3; r++) for (const [a, b] of band) positions.blocked([a[0], a[1] + 12, a[2]], [b[0], b[1] + 12, b[2]]);
  console.log(`  blocked ${lo}-${hi}: ${band.length} rays, ${((performance.now() - t0) / (3 * band.length) / m.sample).toFixed(3)} samples each`);
}
