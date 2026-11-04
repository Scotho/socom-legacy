import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { STEP_PROBE_LIFT_READING, Walker } from '../src/mover';
import { loadSimMap } from '../src/simMap';
import { victoryEligibility, type VictoryActor } from '../src/victory';
import { findVictoryArrangement, requireVictoryPlacement } from '../e2e/victoryArrangement';

// Browser test geometry only, not new gameplay placement or distance rules.
const actor: VictoryActor = { alive: true, ready: true, team: 'seal', position: [0, 0, 0] };
function floor(x0 = -100, x1 = 100, z0 = -100, z1 = 100, y = 0) {
  const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]) };
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 50, cellsX: 4, cellsZ: 4, originX: -100, originZ: -100 }, [], [], [poly]);
}

describe('victory browser fixture checked placement', () => {
  it('retains the original z+20 setup when the real Walker can place it', () => {
    const plan = findVictoryArrangement(floor(), actor, 'terrorist');
    expect(plan?.spawnAt).toEqual([0, 0, 20]); expect(plan?.placedAt).toEqual([0, 0, 20]);
    expect(plan?.distance).toBe(20);
  });
  it('rejects the old no-floor z+20 and checks another non-overlapping candidate', () => {
    const grid = floor(15, 25, -5, 5), old = new Walker(grid);
    expect(old.place(0, STEP_PROBE_LIFT_READING, 20)).toBe(false);
    expect(findVictoryArrangement(grid, actor, 'terrorist')?.placedAt).toEqual([20, 0, 0]);
  });
  // The room's dead drop their weapon at their feet (PF-34, `match/src/pickups.ts` `dropsOf`), and the page offers it
  // (`../src/drops` `Drops.prompt`: within PICKUP_REACH_READING, in front along (-sin yaw, -cos yaw)) -- so the fixture lays
  // the corpse behind the actor and no pickup is offered beside the dance (since AD-6 the picker puts victory ahead of a
  // pickup anyway, `ACTION_CONTEXT_ORDER` after `FUN_0021f850`; was: "pickup before victory").
  it('with the actor facing one way, lays the victim behind it: the dropped weapon is never the pickup prompt, the dance the head', () => {
    for (const yaw of [0, 90, 180, -90, 37]) {
      const plan = findVictoryArrangement(floor(), actor, 'terrorist', yaw)!;
      expect(plan, `yaw ${yaw}`).not.toBeNull();
      const r = (yaw * Math.PI) / 180, forward = [-Math.sin(r), -Math.cos(r)];
      const along = (plan.placedAt[0] - actor.position[0]) * forward[0]! + (plan.placedAt[2] - actor.position[2]) * forward[1]!;
      expect(along, `yaw ${yaw}`).toBeLessThan(0);
      expect(plan.distance).toBeCloseTo(20, 6);
    }
    const behind = findVictoryArrangement(floor(), actor, 'terrorist', 180)!.placedAt;
    expect(behind[0]).toBeCloseTo(0, 9); expect(behind[1]).toBe(0); expect(behind[2]).toBeCloseTo(-20, 9);
  });
  it('fails closed when no finite candidate has a floor', () => {
    expect(findVictoryArrangement(floor(80, 90, 80, 90), actor, 'terrorist')).toBeNull();
  });
  it('rejects a floor whose vertical separation exceeds native eligibility', () => {
    const grid = floor(-100, 100, -100, 100, -40), probe = new Walker(grid);
    expect(probe.place(0, STEP_PROBE_LIFT_READING, 20)).toBe(true);
    expect(findVictoryArrangement(grid, actor, 'terrorist')).toBeNull();
  });
  it('rejects nonfinite actors and actual spawns that disagree with the probe', () => {
    expect(findVictoryArrangement(floor(), { ...actor, position: [NaN, 0, 0] }, 'terrorist')).toBeNull();
    const plan = findVictoryArrangement(floor(), actor, 'terrorist')!;
    expect(() => requireVictoryPlacement(plan, [0, 0, 0])).toThrow('differs from checked placement');
    expect(() => requireVictoryPlacement(plan, [0, NaN, 20])).toThrow('differs from checked placement');
    expect(() => requireVictoryPlacement(plan, plan.placedAt)).not.toThrow();
  });
});

const disc = process.env.SOCOM_DISC;
describe.skipIf(!disc || !existsSync(join(disc, 'RUN/MP51.ZDB')))('victory arrangement on the locally supplied disc', () => {
  it('places the captured MP51 actor beside a valid floor instead of falling back to zero', async () => {
    const map = await loadSimMap(new FsAssetSource(disc!), 'RUN/MP51.ZDB');
    // Browser failure capture, not an original-game spawn claim.
    const captured = { ...actor, position: [1079.7619018554688, 48.71479326297069, 156.11111450195312] as const };
    const old = new Walker(map.grid);
    expect(old.place(captured.position[0], captured.position[1] + STEP_PROBE_LIFT_READING, captured.position[2] + 20)).toBe(false);
    const plan = findVictoryArrangement(map.grid, captured, 'terrorist');
    expect(plan).not.toBeNull();
    expect(plan!.placedAt).toEqual([1099.7619018554688, 51.219684472117784, 156.11111450195312]);
    const spawned = new Walker(map.grid);
    expect(spawned.place(plan!.spawnAt[0], plan!.spawnAt[1] + STEP_PROBE_LIFT_READING, plan!.spawnAt[2])).toBe(true);
    requireVictoryPlacement(plan!, [spawned.state.x, spawned.state.y, spawned.state.z]);
  });
  it('finds checked nonzero corpse positions at both deterministic fixture spawn origins on all 22 maps', async () => {
    const maps = readdirSync(join(disc!, 'RUN')).filter(n => /^MP\d+\.ZDB$/i.test(n)).sort();
    expect(maps).toHaveLength(22);
    const failures: string[] = []; let checked = 0;
    for (const name of maps) {
      const map = await loadSimMap(new FsAssetSource(disc!), `RUN/${name}`);
      for (const side of [0, 1] as const) {
        const slots = map.slots.filter(s => s.side === side), slot = slots[Math.floor(slots.length * .5)];
        if (!slot) { failures.push(`${name}/${side}: no spawn slot`); continue; }
        // Room.spawn's SPAWN_LIFT=1 (room.ts) plus the actual exported mover origin;
        // .5 matches victoryServer's deterministic fixture random, not a game rule.
        const w = new Walker(map.grid), at = slot.position;
        if (!w.place(at[0], at[1] + 1 + STEP_PROBE_LIFT_READING, at[2])) { failures.push(`${name}/${side}: actor floor absent`); continue; }
        const origin: VictoryActor = { ...actor, team: side === 0 ? 'seal' : 'terrorist', position: [w.state.x, w.state.y, w.state.z] };
        const enemy = side === 0 ? 'terrorist' : 'seal', plan = findVictoryArrangement(map.grid, origin, enemy);
        if (!plan) { failures.push(`${name}/${side}: no eligible candidate`); continue; }
        expect(plan.distance).toBeGreaterThan(0);
        expect(victoryEligibility(origin, [{ alive: false, present: true, team: enemy, position: plan.placedAt }])).toBe('available');
        // The fixture's own call (`../e2e/victoryServer`): the slot's facing (`Room.spawn`, -step * 45), the corpse behind.
        const yaw = -slot.step * 45, faced = findVictoryArrangement(map.grid, origin, enemy, yaw);
        if (!faced) { failures.push(`${name}/${side}: no eligible candidate behind yaw ${yaw}`); continue; }
        const r = (yaw * Math.PI) / 180;
        expect((faced.placedAt[0] - origin.position[0]) * -Math.sin(r) + (faced.placedAt[2] - origin.position[2]) * -Math.cos(r)).toBeLessThan(0);
        checked++;
      }
    }
    expect(failures).toEqual([]); expect(checked).toBe(44);
  }, 120000);
});
