import { describe, expect, it } from 'vitest';
import type { LayoutSpawner } from '@s2u/creator-contracts';
import type { Room } from '../../src/room';
import { RuleHost, type RuleLayout, type RuleNpcSeats } from '../../src/creator/rules';
import { BATTLE_ROYALE, CAPTURE_THE_FLAG, PAINTBALL, PARTY, ZOMBIES, type Json } from './rulesProofs';
import { duelScript, rulesRoom, ticks, type ScriptStep, type V3 } from './rulesHarness';

/**
 * FCW-31 step 4 (spec §11): the five proof experiences (FCW-30's specs, `./rulesProofs`) run in the page's own room
 * (`LoopbackMatch`, solo, stepped here) from one seed, twice -- the two runs' recordings and rule states identical -- each
 * to one round's end. Unit and room-level evidence only: no page draws them here (no rendered or physical run).
 */

const spawner = (id: string, more: Partial<LayoutSpawner>): LayoutSpawner => ({ id, source: 'player', at: [0, 0, 0], yaw: 0, radius: 0, ...more });

/**
 * The test's NPC seats (`RuleNpcSeats`): the horde seated before the round as the Forge seats its NPCs, and woken by a
 * release -- each placed at its spot. The NPC brains are the page's (`viewer/src/forge/npcBrain.ts`, on the map's
 * navigation, which this floor has none of): here the released NPCs stand where they are put.
 */
function hordeOf(room: () => Room, ids: readonly number[]): RuleNpcSeats {
  let next = 0;
  return {
    release: (_s, count, _brain, at) => {
      const out: number[] = [];
      for (let i = 0; i < count && next < ids.length; i++, next++) {
        const id = ids[next]!, p = room().player(id);
        p?.sim.walker.place(at[i]![0], at[i]![1] + 20, at[i]![2]);
        out.push(id);
      }
      return out;
    },
  };
}

interface Case {
  spec: Json;
  at: V3[];
  layout?: RuleLayout;
  seconds: number;
  until: number;
  script: ScriptStep[];
  sides?: (id: number) => 'seal' | 'terrorist';
  npcs?: readonly number[];
  check: (r: ReturnType<typeof rulesRoom>, host: RuleHost) => void;
}

function runOnce(c: Case) {
  let room: Room | null = null;
  const host = new RuleHost({ ...(c.layout ? { layout: c.layout } : {}), ...(c.npcs ? { npcs: hordeOf(() => room!, c.npcs) } : {}) });
  const report = host.enable(c.spec, 2026);
  expect(report.diagnostics).toEqual([]);
  const r = rulesRoom(c.at, { rules: 'classic', roundSeconds: c.seconds, launchCountdownS: 1, ruleHost: host, ...(c.sides ? { soloSide: c.sides } : {}) }, { loopback: true });
  room = r.room;
  r.run(c.script, c.until);
  return { r, host };
}

function twice(c: Case): void {
  const a = runOnce(c), b = runOnce(c);
  expect(b.r.recorder.lines).toEqual(a.r.recorder.lines);
  expect(JSON.stringify(b.host.snapshot())).toBe(JSON.stringify(a.host.snapshot()));
  expect(a.r.reports.length).toBeGreaterThanOrEqual(1);                   // one round's end, at least
  c.check(a.r, a.host);
}

const shows = (r: ReturnType<typeof rulesRoom>, seat: number): string => JSON.stringify(r.clients[seat - 1]!.of('rulesPresent'));

describe('FCW-31: the five proof experiences in a loopback room, one seed twice', () => {
  it('paintball: one hit out, the side out ends the round', () => {
    twice({
      spec: PAINTBALL, at: [[0, 0, 0], [150, 0, 0]], seconds: 20, until: ticks(1) + ticks(8), script: duelScript(1.5),
      check: (r, host) => {
        expect(r.reports[0]!.wins).toEqual({ seal: 0, terrorist: 1 });
        expect(host.snapshot().variables['hits@2']).toBe(1);
      },
    });
  });

  it('party: the beat and the stage as cues and messages, the page\'s to show (presentation as broadcast state)', () => {
    twice({
      spec: PARTY, at: [[0, 0, 0], [150, 0, 0]], seconds: 40, until: ticks(1) + ticks(43), script: [],
      layout: { zones: [{ id: 'stage', shape: 'cylinder', at: [150, 0, 0], radius: 60, height: 200 }] },
      check: (r) => {
        expect(shows(r, 1)).toContain('Party time');
        expect(shows(r, 1)).toContain('party.beat');
        expect(shows(r, 2)).toContain('party.cheer');                      // the stage's cheer to the seat on it
        expect(shows(r, 1)).not.toContain('party.cheer');
        expect(r.reports[0]!.wins).toEqual({ seal: 0, terrorist: 0 });     // the clock's draw: the rules decided nothing
      },
    });
  });

  it('zombies + shop: a wave released from its spawner (the test\'s seats, standing), a bounty for a kill', () => {
    const npcs = [2, 3, 4, 5, 6, 7, 8, 9];
    const far = (i: number): V3 => [-800, 0, -600 + i * 60];
    const script: ScriptStep[] = [...duelScript(1.5)].filter((s) => s.id === 1);
    twice({
      spec: ZOMBIES, at: [[0, 0, 0], ...npcs.map((_, i) => far(i))], seconds: 20, until: ticks(1) + ticks(40), script, npcs,
      sides: (id) => (id === 1 ? 'seal' : 'terrorist'),
      layout: {
        zones: [{ id: 'shop', shape: 'cylinder', at: [0, 0, 0], radius: 50, height: 200 }],
        spawners: [spawner('horde', { source: 'npc', at: [300, 0, 0], radius: 150, side: 'terrorist' })],
      },
      check: (r, host) => {
        const snap = host.snapshot();
        const bounties = r.clients[0]!.of('kill').filter((k) => k['killer'] === 1 && npcs.includes(k['victim'] as number)).length;
        expect(bounties).toBeGreaterThanOrEqual(1);
        expect(snap.variables['cash@1']).toBe(500 + 100 * bounties);       // `bounty`: 100 a zombie seat 1 shot
        expect(snap.variables['wave']).toBe(bounties === npcs.length ? 2 : 1);   // `next` only on the wave's last death
      },
    });
  });

  it('battle royale: drops, loot, the ring hurting outside it, the last side standing', () => {
    twice({
      spec: BATTLE_ROYALE, at: [[0, 0, 0], [150, 0, 0]], seconds: 60, until: ticks(1) + ticks(30), script: [],
      layout: {
        zones: [{ id: 'ring', shape: 'cylinder', at: [0, 0, 0], radius: 300, height: 400 }],
        markers: [{ id: 'centre', at: [0, 0, 0], yaw: 0 }],
        spawners: [spawner('drops', { at: [600, 0, 0], radius: 100 }), spawner('loot', { source: 'item', at: [0, 0, 800], radius: 100 })],
      },
      check: (r, host) => {
        expect(host.snapshot().world).toHaveLength(20);
        expect(r.clients[0]!.of('kill').length).toBeGreaterThan(0);           // the ring's hazard, the room's kill
        expect(r.reports[0]!.wins.seal + r.reports[0]!.wins.terrorist).toBe(1);
      },
    });
  });

  it('capture the flag: three captures win the round', () => {
    const stand: V3 = [300, 0, 100], base: V3 = [-300, 0, 0], away: V3 = [-300, 0, 300];
    const script: ScriptStep[] = [];
    for (let k = 0; k < 3; k++) {
      const t = ticks(2) + k * ticks(1.5);
      script.push({ at: t, id: 2, do: 'move', to: stand }, { at: t + 20, id: 2, do: 'move', to: base }, { at: t + 40, id: 2, do: 'move', to: away });
    }
    twice({
      spec: CAPTURE_THE_FLAG, at: [[0, 0, 0], [-300, 0, 300]], seconds: 40, until: ticks(1) + ticks(8), script,
      layout: {
        zones: [
          { id: 'base-seal', shape: 'cylinder', at: base, radius: 50, height: 200 },
          { id: 'base-terrorist', shape: 'cylinder', at: [300, 0, 0], radius: 50, height: 200 },
        ],
        spawners: [spawner('stand-seal', { source: 'item', at: [-300, 0, -100] }), spawner('stand-terrorist', { source: 'item', at: stand })],
      },
      check: (r, host) => {
        expect(host.snapshot().variables['caps@seal']).toBe(3);
        expect(r.reports[0]!.wins).toEqual({ seal: 1, terrorist: 0 });
      },
    });
  });
});

