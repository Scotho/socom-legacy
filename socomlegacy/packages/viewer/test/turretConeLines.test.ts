// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { readKitTable, type WeaponRecord } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Accuracy } from '../src/accuracy';
import { FlyCamera } from '../src/camera';
import type { LoadedMap } from '../src/loadMap';
import { mountActions, type MatchActionsDeps } from '../src/matchActions';
import { TURRET_RETICLE_STANCE_READING } from '../src/net/emplacement';
import { NetClient } from '../src/net/client';
import { LoopbackMatch } from '../src/net/loopback';
import type { ServerEvent } from '../src/net/protocol';
import type { NetPage } from '../src/netPage';
import { loadKitSource, simKitsFromBytes } from '../src/sim';
import { simMapFromBytes } from '../src/simMap';
import { STEP_PROBE_LIFT_READING, WalkMode } from '../src/walk';

/**
 * TURRET-CONE, the page's and the room's lines agree (research 215 s8.2; reading, pending review): the page rolls a
 * mounted round on the turret record's cone (`TurretPage.round`, `setSpread`) and draws it (`MatchFirearm.turretRound`:
 * the tracer, the marks), then claims that line (`./matchActions` `sendTurretRound`: `from: r.from, dir: r.dir`); the
 * room bounds the claim inside its own run of the cone about its gun line and fires along it from its own firepoint
 * (`room.ts` `turretRound`). So no tracer stands apart from its hit: the room's round leaves where the page's drawn one
 * does, along the same line, and its hit lies on the page's line. Headless, Crossroads (MP72, the fixtures) through the
 * loopback room: the page's real `WalkMode`, `NetClient` and action part (`mountActions`, the turrets and their trigger),
 * the page's kit on the turret slot an `Accuracy` on PKM TURRET's record at `TURRET_RETICLE_STANCE_READING`'s row (as
 * `MatchFirearm.gunFrame` runs it), rolled before its bloom (P1's review F2) -- an automatic burst of about ten rounds.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP72 = fixture('RUN/MP72.ZDB'), READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const READY = MP72 !== null && READERC !== null && ZWEAPON !== null;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
type V3 = [number, number, number];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
/** The distance from `p` to the line through `a` along the unit `d`. */
const offLine = (p: readonly number[], a: readonly number[], d: readonly number[]): number => {
  const v = sub(p, a), t = dot(v, d);
  return len([v[0] - d[0]! * t, v[1] - d[1]! * t, v[2] - d[2]! * t]);
};

describe.skipIf(!READY)(`TURRET-CONE: the page's drawn turret round and the room's fired one lie on one line${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("an automatic burst on Crossroads' PKM TURRET through the loopback: each drawn round's muzzle and line are the room's, each room hit lies on the page's line, and the burst spreads (no tracer apart from its hit)", { timeout: 180_000 }, async () => {
    const table = readKitTable(ZWEAPON!);
    const kits = (await loadKitSource(new FsAssetSource(FIXTURES)))!;
    const sim = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', { table, readerc: READERC! });
    let now = 0, seed = 1;
    const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const match = new LoopbackMatch(sim, null, { auto: false, random, now: () => now, launchCountdownS: 0, kits: simKitsFromBytes(kits, MP72!) });
    // The room's rounds, as every other page hears them (`shot`: from, to; the shooter's own page is never sent its own).
    const shots: Extract<ServerEvent, { type: 'shot' }>[] = [];
    const room = match.room as unknown as { broadcast(ev: ServerEvent, except?: number): void };
    const broadcast = room.broadcast.bind(match.room);
    room.broadcast = (ev, except) => { if (ev.type === 'shot') shots.push(ev); broadcast(ev, except); };

    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(sim.ground, null, sim.grid);
    const map = { turrets: sim.turrets, arsenal: { table } } as unknown as LoadedMap;
    // The page's kit on the turret slot (`MatchFirearm`: `gunFrame`'s bloom at the stance row, `turretRound`'s per round).
    const record: WeaponRecord = table.turretRecords!.get(table.arsenal.byName.get('PKM TURRET')!.id)!;
    const kit = new Accuracy(record);
    const still = { stance: TURRET_RETICLE_STANCE_READING, rawStance: TURRET_RETICLE_STANCE_READING, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };
    const drawn: { from: V3; dir: V3; count: number; radius: number }[] = [];
    let client: NetClient | null = null;
    const acts = mountActions({
      walk, fly: { pose: () => fly.pose() },
      doors: { target: () => null, action: () => false },
      traversal: { cancelAction: () => {}, padLanes: () => {}, hudClimb: () => null, traversal: () => null, holdAllowed: () => true },
      grenade: { c4Target: () => null, plantC4: () => false, cancelMenuHold: () => {} },
      play: { startVictory: () => false, stopVictory: () => {}, resetVictory: () => {}, victoryActive: () => false, victoryState: () => null },
      firearm: { held: () => {}, fire: { subscribe: () => () => {} } },
      net: () => (client ? ({ client }) as unknown as NetPage : null), map: () => map, view: () => null, world: () => null,
      remote: { teamOf: () => null, feet: () => null },
      bombView: {},
      turret: {
        // `MatchFirearm.turretRound`: the round drawn on the page's own line, then the kit's round step (the bloom).
        round: (_record: unknown, from: readonly number[], dir: readonly number[], _frame: unknown, count: number) => {
          drawn.push({ from: [from[0]!, from[1]!, from[2]!], dir: [dir[0]!, dir[1]!, dir[2]!], count, radius: kit.cone(0, 1).radius });
          kit.round(0, TURRET_RETICLE_STANCE_READING);
        },
      },
    } as unknown as MatchActionsDeps);
    acts.turrets.setSpread(() => kit.cone(0, 1), random);           // `main.ts` / `matchMount.ts`: `firearm.turretCone()`; seeded (the review's F4)
    client = new NetClient({ url: 'loopback:', map: 'MP72', name: 'Solo', socket: match.socket }, walk);
    acts.follow(client);
    await flush();
    const frame = async (n: number): Promise<void> => {
      for (let i = 0; i < n; i++) {
        fly.update(1 / 60); walk.frame(1 / 60); acts.turrets.frame();
        kit.update(1 / 60, still);
        acts.turretFrame(1 / 60, false);
        now += 1000 / 60; match.step(); await flush();
      }
    };
    await frame(120);
    // Behind mp72_turret01 facing its way (`roomTurrets.test.ts` BEHIND), the page's mover and the room's at the same feet.
    const t = sim.turrets!.find((p) => p.name === 'mp72_turret01')!;
    const at: V3 = [600.394, 50, 1608];
    expect(walk.respawn(at, 0)).toBe(true);
    const body = match.room.player(client.id!)!;
    body.sim.walker.place(at[0], at[1] + STEP_PROBE_LIFT_READING, at[2]);
    body.sim.walker.state.yaw = 0;
    await frame(20);
    expect(acts.turrets.target()).toBe(t.id);
    expect(acts.turrets.action()).toBe(true);
    for (let i = 0; i < 30 && acts.turrets.mounted() === null; i++) await frame(1);
    expect(acts.turrets.mounted()).toBe(t.id);
    await frame(90);                                                 // the hold placed; the kit settled at TargetMin
    shots.length = 0;
    expect(acts.trigger(true)).toBe(true);                           // the turret's trigger, AUTO
    await frame(60);
    acts.trigger(false);
    await frame(10);
    const drops = (match.room as unknown as { takeDrops(): Record<string, number> | null }).takeDrops();

    const lines: string[] = [];
    let worstFrom = 0, worstAngle = 0, worstHit = 0, spread = 0;
    const n = Math.min(drawn.length, shots.length);
    for (let i = 0; i < n; i++) {
      const p = drawn[i]!, s = shots[i]!;
      const roomDir = sub(s.to, s.from), l = len(roomDir);
      const from = len(sub(s.from, p.from));
      const angle = Math.acos(Math.min(1, dot(roomDir, p.dir) / l));
      const hit = offLine(s.to, p.from, p.dir);
      spread = Math.max(spread, Math.acos(Math.min(1, dot(p.dir, drawn[0]!.dir))));
      worstFrom = Math.max(worstFrom, from); worstAngle = Math.max(worstAngle, angle); worstHit = Math.max(worstHit, hit);
      lines.push(`round ${p.count}: cone ${p.radius.toFixed(5)}; the room's muzzle ${from.toFixed(4)} from the page's, its line ${angle.toExponential(2)} rad off, its hit ${hit.toFixed(4)} off the page's line at ${l.toFixed(1)}`);
    }
    console.log(`TURRET-CONE lines agree (MP72 mp72_turret01, PKM TURRET): ${drawn.length} drawn, ${shots.length} fired, drops ${JSON.stringify(drops)}\n${lines.join('\n')}\nworst: muzzle ${worstFrom.toFixed(4)}, line ${worstAngle.toExponential(2)} rad, hit ${worstHit.toFixed(4)}; the burst's spread ${spread.toFixed(5)} rad`);
    expect(drawn.length, 'about ten rounds in a second of AUTO').toBeGreaterThanOrEqual(9);
    expect(shots.length, 'every drawn round fired by the room').toBe(drawn.length);
    expect(drops).toBeNull();
    expect(worstFrom).toBeLessThan(0.01);
    expect(worstAngle).toBeLessThan(1e-5);
    expect(worstHit).toBeLessThan(0.01);
    expect(spread, "the burst spreads inside the turret's cone").toBeGreaterThan(0.005);
  });
});
