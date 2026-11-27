import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { loadKitSource, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, TICK_HZ } from '../../src/sim';
import { LoopbackMatch } from '../../src/net/loopback';
import type { NavigationData } from '../../../match/src/bots/navigation';
import type { NpcMarker } from '../../src/forge/layout';
import { seatSlots } from '../../src/forge/matchMap';
import { ForgeNpcs, soloSideOf } from '../../src/forge/npcs';
import { brainFor, type NpcBrain } from '../../src/forge/npcBrain';

/**
 * NPB-7 (docs/plans/2026-10-24-forge-npc-brains.md; NPB.R4): the forge's patrol NPCs on the disc's Frostfire, measured --
 * the same room the page runs (`LoopbackMatch`), three NPCs a side on the map's own start points, driven by `NpcBrain`
 * through the room's tick. Dev-disc: needs the MP2 fixtures and the prepared graph (`public/maps/nav/MP2.json`) and skips
 * without them, said as a skip. The record is printed and goes in the plan's Log; nothing here asserts where bodies end up
 * (a random walk's geometry is a flake, HAZARDS) -- only that the brain took every seat, that its numbers are finite, and
 * that a sentry in the same room did not move.
 */
const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../../test-fixtures');
const NAV = resolve(process.env.S2U_BOT_NAV_DIR ?? resolve(import.meta.dirname, '../../../../public/maps/nav'), 'MP2.json');
const READY = !!fixture('RUN/MP2.ZDB') && !!fixture('RUN/READERC.ZAR') && !!fixture('RUN/ZWEAPON.ZAR') && !!fixture('RUN/MOTION_P.ZAR') && existsSync(NAV);
const SECONDS = Number(process.env.S2U_NPC_SOAK_S ?? 30);

describe.skipIf(!READY)(`NPB-7: patrol NPCs on Frostfire${READY ? '' : ` (${FIXTURES_ABSENT}; prepared MP2 graph required)`}`, () => {
  async function soak(sentries: number): Promise<{ moved: number[]; sentryMoved: number[]; botsMs: number[]; kills: number; deaths: number; shots: number; verdicts: Record<string, number>; driving: number; wallS: number }> {
    const bytes = (rel: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, rel)));
    const source = await loadKitSource(new FsAssetSource(ROOT));
    const mp2 = bytes('RUN/MP2.ZDB');
    const base = simMapFromBytes(mp2, 'RUN/MP2.ZDB', source);
    const clips = simClipsFromBytes(bytes('RUN/MOTION_P.ZAR'), bytes('RUN/READERC.ZAR'));
    const at = (side: 0 | 1, i: number): [number, number, number] => [...base.slots.filter((s) => s.side === side).sort((a, b) => a.index - b.index)[i]!.position] as [number, number, number];
    const marker = (side: NpcMarker['side'], i: number): NpcMarker => ({ side, type: 0, p: at(side === 'seal' ? 0 : 1, i), yaw: 0 });
    const markers = [0, 1, 2].flatMap((i) => [marker('terrorist', i), marker('seal', i)]);
    const map = { ...base, slots: seatSlots(base.slots, markers, 'seal') };
    const navigation = JSON.parse(readFileSync(NAV, 'utf8')) as NavigationData;

    let now = 0, seed = 7, brain: NpcBrain | null = null;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const botsMs: number[] = [];
    const loop = new LoopbackMatch(map, clips, {
      auto: false, random, now: () => now, launchCountdownS: 0, soloSide: soloSideOf(markers), kits: simKitsFromBytes(source!, mp2),
      beforeStep: () => { const t0 = performance.now(); brain?.step(); botsMs.push(performance.now() - t0); },
    });
    const npcs = new ForgeNpcs(loop, markers, map, random);
    const driven = npcs.npcs.slice(sentries);
    brain = await brainFor('patrol', loop.room, driven, navigation, random, async () => {});
    expect(brain, 'the brain took the graph').not.toBeNull();
    for (let i = 0; i < 4; i++) await Promise.resolve();

    const start = new Map<number, [number, number]>(), reach = new Map<number, number>();
    const wall0 = performance.now();
    for (let t = 0; t < SECONDS * TICK_HZ; t++) {
      now += 1000 / TICK_HZ;
      loop.step(); npcs.step();
      await Promise.resolve(); await Promise.resolve();
      for (const n of npcs.npcs) {
        const s = loop.room.player(n.id)?.sim.walker.state;
        if (!s || !loop.room.player(n.id)!.alive) continue;
        if (!start.has(n.id)) start.set(n.id, [s.x, s.z]);
        const o = start.get(n.id)!;
        reach.set(n.id, Math.max(reach.get(n.id) ?? 0, Math.hypot(s.x - o[0], s.z - o[1])));
      }
    }
    const wallS = (performance.now() - wall0) / 1000;
    const actors = brain!.stats().actors;
    const verdicts: Record<string, number> = {};
    for (const a of actors) { const v = a.verdict ?? 'none'; verdicts[v] = (verdicts[v] ?? 0) + 1; }
    const out = {
      moved: driven.map((n) => Math.round(reach.get(n.id) ?? 0)), sentryMoved: npcs.npcs.slice(0, sentries).map((n) => Math.round(reach.get(n.id) ?? 0)),
      botsMs, kills: actors.reduce((n, a) => n + a.kills, 0), deaths: actors.reduce((n, a) => n + a.deaths, 0),
      shots: 0, verdicts, driving: brain!.driving().length, wallS,
    };
    brain!.close(); npcs.close(); loop.stop();
    return out;
  }

  const ms = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return { mean: +(a.reduce((n, v) => n + v, 0) / Math.max(1, a.length)).toFixed(3), p95: +(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(3), max: +(s[s.length - 1] ?? 0).toFixed(3) };
  };

  it('seats six NPCs on the brain; they walk, the room refuses nothing it counts, the step stays cheap (recorded, not asserted)', async () => {
    const r = await soak(0);
    const cost = ms(r.botsMs), warm = ms(r.botsMs.slice(0, 120)), steady = ms(r.botsMs.slice(120));
    const slow = r.botsMs.map((v, i) => [i, v] as const).filter(([, v]) => v > 50).map(([i]) => i);
    // eslint-disable-next-line no-console
    console.log(`NPB-7 Frostfire, 3+3 patrol NPCs, ${SECONDS} s: farthest each got from its start [${r.moved.join(', ')}] (units); kills ${r.kills} deaths ${r.deaths}; ` +
      `brain step ms: all mean ${cost.mean} p95 ${cost.p95} max ${cost.max}; first 2 s mean ${warm.mean} max ${warm.max}; after mean ${steady.mean} p95 ${steady.p95} max ${steady.max}; ` +
      `ticks over 50 ms: ${slow.length} (first ${slow.slice(0, 8).join(', ')}); ${(SECONDS / r.wallS).toFixed(1)}x real time`);
    expect(r.driving).toBe(6);
    expect(r.moved.every((n) => Number.isFinite(n))).toBe(true);
    expect(Number.isFinite(cost.mean) && Number.isFinite(cost.max)).toBe(true);
  }, 600_000);

  it('leaves a sentry in the same room standing where its marker put it', async () => {
    const r = await soak(1);
    expect(r.driving).toBe(5);
    expect(r.sentryMoved[0]!, 'the sentry did not walk').toBeLessThan(2);
  }, 600_000);
});
