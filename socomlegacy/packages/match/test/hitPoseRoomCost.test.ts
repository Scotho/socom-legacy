import { describe, expect, it } from 'vitest';
import { PerformanceObserver } from 'node:perf_hooks';
import { TICK_HZ } from '../../viewer/src/sim';
import { simSkeletonsFromBytes } from '../../viewer/src/simMap';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { crowdRoom, type CrowdBody } from './helpers/hitPoseRoom';

/**
 * HIT-POSE's perf fold (research 217 s3.6a; the merging controller's condition, 2026-11-10: a 16-bot MP2 room's step
 * mean 0.80 -> 1.74 ms and worst 5.9 -> 16.4 ms on a 2 vCPU box at HIT-POSE's head 76b1eac24): a full room's step
 * measured with the live poses (the SEAL's skeleton with its motion) and without them (the same skeleton, its motion
 * dropped: the idle sets, the room before HIT-POSE) -- 16 seats moving every tick (`helpers/hitPoseRoom` `crowdRoom`).
 * Logged per run: the step's mean, 99th percentile and worst milliseconds, the heap's growth (each tick's rise in
 * `heapUsed` summed: what the step allocated between collections, a floor), and the collections the run took (count and
 * milliseconds, the `gc` performance entries), and apart the worst of the first step and the `WARM` ticks after it (the 16 spawns, each building
 * its poser; in round 1 the process's first, cold). Held: the mean under a tick's budget. An instrument; unit-test evidence of
 * the host it runs on only -- the numbers are the host's, compared within one run.
 */

const MP2 = fixture('RUN/MP2.ZDB'), PACK = fixture('RUN/MOTION_P.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const WARM = 180, TICKS = 1800;

interface Measure { mean: number; p99: number; worst: number; allocKbTick: number; gcs: number; gcMs: number; alive: number; spawnWorst: number }

async function measure(body: CrowdBody): Promise<Measure> {
  const gc: { duration: number }[] = [];
  const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) gc.push({ duration: e.duration }); });
  const t = crowdRoom(body, 16);
  const spawnWorst = Math.max(t.spawnMs, ...t.step(WARM));        // the room's first step (its 16 spawns) and the warm-up
  obs.observe({ entryTypes: ['gc'] });
  let rise = 0, last = process.memoryUsage().heapUsed;
  const ms: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    ms.push(t.step(1)[0]!);
    const now = process.memoryUsage().heapUsed;
    if (now > last) rise += now - last;
    last = now;
  }
  await new Promise((r) => setTimeout(r, 50));                      // the gc entries are delivered on the loop
  obs.disconnect();
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    mean: ms.reduce((a, b) => a + b, 0) / ms.length, p99: sorted[Math.floor(sorted.length * 0.99)]!, worst: sorted.at(-1)!,
    allocKbTick: rise / TICKS / 1024, gcs: gc.length, gcMs: gc.reduce((a, e) => a + e.duration, 0), alive: t.alive(), spawnWorst,
  };
}

const line = (label: string, m: Measure): string => `HIT-POSE room cost ${label}: 16 seats (${m.alive} alive), ${TICKS} ticks, step mean ${m.mean.toFixed(3)} ms, p99 ${m.p99.toFixed(3)} ms, worst ${m.worst.toFixed(3)} ms; heap rise ${m.allocKbTick.toFixed(1)} kB a tick; ${m.gcs} collections, ${m.gcMs.toFixed(1)} ms; the spawn step's and the next ${WARM} ticks' worst ${m.spawnWorst.toFixed(3)} ms`;

describe.skipIf(!MP2 || !PACK || !READERC)(`HIT-POSE: a 16-seat room's step with and without the live poses${MP2 && PACK && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const skeletons = MP2 && PACK && READERC ? simSkeletonsFromBytes(MP2, READERC, PACK) : { seal: [], terrorist: [], escortees: [] };

  it('logs the step\'s mean, p99, worst, heap rise and collections, posed and on the idle sets; the posed mean under a tick\'s budget', async () => {
    const seal = skeletons.seal[0]!;
    expect(seal.motion).toBeDefined();
    const { motion: _played, ...idle } = seal;                     // the same skeleton, its motion dropped: the idle sets
    const runs: [string, Measure][] = [];
    for (const round of [1, 2]) {
      runs.push([`idle sets (round ${round})`, await measure(idle)]);
      runs.push([`posed (round ${round})`, await measure(seal)]);
    }
    for (const [label, m] of runs) console.log(line(label, m));
    for (const [label, m] of runs) {
      expect(m.alive, label).toBe(16);
      if (label.startsWith('posed')) expect(m.mean, label).toBeLessThan(1000 / TICK_HZ);
    }
  }, 300_000);
});
