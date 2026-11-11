import {BOUNCE_LIFT, segmentHit} from '@s2u/scene';
import type {Room} from '../../match/src/room';
import type {SimMap} from '../src/simMap';
import {probeLiftOf, Walker} from '../src/mover';
import {wadingDepth} from '../src/equipment';
import {HEAD_VOLUME_HEIGHT_READING} from '../src/stature';
import type {Team} from '../src/net/protocol';
type Position = readonly [number, number, number];
export interface ExchangePlacement {
  source: 'current' | 'original-spawn' | 'original-respawn' | 'fixture-ground'; slotIndex: number | null;
  candidateSide: 0 | 1 | null; candidatePool: 'slots' | 'respawns' | null;
  spawnAt: Position; placedAt: Position; yaw: number;
}

/** The settle's length and the drift it allows (product-track fixture adaptation, `findExchangePlacement`). */
const SETTLE_TICKS = 60, SETTLE_DRIFT = 0.5;

/** Browser fixture adaptation, not a gameplay spawn/eligibility rule. Check native
 * placement, water and the standing blast/head column; actual throw/death assertions
 * remain authoritative. No material is filtered out of the original collision hull.
 */
export function findExchangePlacement(map: Pick<SimMap, 'grid' | 'slots'> & Partial<Pick<SimMap, 'respawns'>>, team: Team, current: Position, yaw: number): ExchangePlacement | null {
  if (!current.every(Number.isFinite) || !Number.isFinite(yaw)) return null;
  const check = (spawnAt: Position): Position | null => {
    if (!spawnAt.every(Number.isFinite)) return null;
    const walker = new Walker(map.grid);
    if (!walker.place(spawnAt[0], spawnAt[1] + probeLiftOf('stand'), spawnAt[2])) return null;
    const feet: Position = [walker.state.x, walker.state.y, walker.state.z];
    if (!feet.every(Number.isFinite) || wadingDepth(map.grid, feet) !== 0) return null;
    // Product-track fixture adaptation (no original): the place is judged where the body comes to rest, not only where
    // it is put. A standing walker is settled there a second (SETTLE_TICKS, still stick) and the candidate is refused
    // unless it stays (within SETTLE_DRIFT, on the ground) and is dry at its rest: the standing lift (LATER 785) can put a
    // record on a face the body leaves at once (MP64 respawn 181 onto `inv_di`, resting 6.42 under water since LATER 833;
    // research 80 s7), and a fixture wants a place a player stands on.
    for (let i = 0; i < SETTLE_TICKS; i++) walker.tick({forward: 0, right: 0, boost: false});
    const rest: Position = [walker.state.x, walker.state.y, walker.state.z];
    if (walker.airborne || Math.hypot(rest[0] - feet[0], rest[1] - feet[1], rest[2] - feet[2]) > SETTLE_DRIFT
      || wadingDepth(map.grid, rest) !== 0) return null;
    // Room.blast HEAD_OVER.stand equals this shared stature; a resting grenade is
    // BOUNCE_LIFT above floor, and Room.sightFrom advances another BOUNCE_LIFT.
    const from: [number, number, number] = [feet[0], feet[1] + 2 * BOUNCE_LIFT, feet[2]];
    const head: [number, number, number] = [feet[0], feet[1] + HEAD_VOLUME_HEIGHT_READING, feet[2]];
    return segmentHit(map.grid, from, head) ? null : feet;
  };
  const here = check(current);
  if (here?.every((value, i) => value === current[i])) return {source: 'current', slotIndex: null, candidateSide: null, candidatePool: null, spawnAt: current, placedAt: current, yaw};
  // AIMAPS.MPS through SimMap's original start/respawn records. Own-side records
  // come first. Other-side coordinates are a last-resort fixture ground point,
  // explicitly NOT the original team's spawn selection or a team change.
  const side = team === 'seal' ? 0 : 1;
  const pools = [
    {side, pool: 'slots' as const}, {side, pool: 'respawns' as const},
    {side: 1 - side, pool: 'slots' as const}, {side: 1 - side, pool: 'respawns' as const},
  ];
  for (const candidate of pools) for (const slot of [...(map[candidate.pool] ?? [])]
    .filter(s => s.side === candidate.side).sort((a, b) => a.index - b.index)) {
    // Match Room.spawn's original SPAWN_LIFT=1 before its Walker probe. Keep the
    // existing input yaw; this fixture changes position, not the player's facing.
    const spawnAt: Position = [slot.position[0], slot.position[1] + 1, slot.position[2]];
    const placedAt = check(spawnAt);
    if (placedAt) return {source: slot.side !== side ? 'fixture-ground' : candidate.pool === 'slots' ? 'original-spawn' : 'original-respawn',
      slotIndex: slot.index, candidateSide: slot.side, candidatePool: candidate.pool, spawnAt, placedAt, yaw};
  }
  return null;
}

/** IPC-only arrangement. Preserve the existing body: Room.spawn would refill spent
 * magazines and heal it. Native Walker.place supplies a checked floor; ordinary
 * authoritative snapshots reconcile both clients, with no new network endpoint.
 */
export function arrangeExchangePlacement(room: Room, actor: number) {
  const player = room.player(actor);
  if (!player?.alive) throw Error('Exchange fixture requires a living actor');
  const snapshot = () => ({team: player.team, char: player.char, nextChar: player.nextChar, kit: [...player.loadout], health: {hp: [...player.health.hp], armour: [...player.health.armour]},
    grenades: {...player.grenades}, magazines: player.mags.map(m => m.state()), alive: player.alive, round: room.round});
  const before = snapshot(), state = player.sim.walker.state;
  const plan = findExchangePlacement(room.map, player.team, [state.x, state.y, state.z], state.yaw);
  if (!plan) throw Error('Exchange fixture found no suitable checked original map position');
  if (plan.source !== 'current') {
    if (!player.sim.walker.place(plan.spawnAt[0], plan.spawnAt[1] + probeLiftOf('stand'), plan.spawnAt[2])) throw Error('Checked Exchange placement failed');
  }
  const actual = player.sim.walker.state;
  if (![actual.x, actual.y, actual.z].every((n, i) => n === plan.placedAt[i]) || actual.yaw !== plan.yaw) throw Error('Actual Exchange placement differs from its check');
  const after = snapshot();
  if (JSON.stringify(after) !== JSON.stringify(before)) throw Error('Exchange arrangement changed team, character, health, ammunition, kit or round');
  return {actor, ...plan, ...after};
}
