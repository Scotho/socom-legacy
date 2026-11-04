import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { actorToWorldPoint, isLiquidSurface, probeFloor, segmentHit, type V3 } from '@s2u/scene';
import { EQUIPMENT_SLOTS } from '../src/equipment';
import { GrenadeThrower } from '../src/grenade';
import {
  loadKitSource, loadSimClips, loadSimMap, simKitsFromBytes, PROBE_LIFT, PROTOCOL_VERSION, type ServerEvent,
} from '../src/sim';
import { Room, type Conn } from '../../match/src/room';

/**
 * The page's claymore on real hulls, into the match server's room (web sprint 4 M7; research 85 §9.7, research 94
 * §C5): a real `GrenadeThrower` places four claymores on a disc map -- its own ground cast under the hand
 * (`FUN_005c2430`) -- and its `place` and `detonate` events go to a real `Room` as the page sends them
 * (`main.ts`: `NetPage.throwEvent`, the `throw` message of the item's name, the facing as its velocity; the
 * Detonator's from the feet). The room must take all four and set them off on the Detonator, and the enemy in front
 * must die. No renderer and no socket. Unit fixtures (`roomEquipment.test.ts`, `equipmentPage.test.ts`) use a flat
 * synthetic floor; this crosses the page's placement and the room's checks on the maps' own ground.
 *
 * Ported from Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347: `packages/viewer/test/
 * placedCharges.test.ts` and `betaPlacedCharges.test.ts`), merged and moved onto our wire: his `placeCharge` /
 * `detonateCharges` messages and `chargePlaced` / `chargeDetonated` events are not ours (M7 carries every equipment use
 * on `throw`), so the room's `grenade` broadcasts are counted instead. Staging is the test's: the victim is put where
 * the search finds a clear line, 60 (else 45, 75) u ahead of the placer on a floor within 3 u of its feet, from 16
 * headings -- test geometry, not the game's; the placer's kit is an ARMORY pick (below). Reads `SOCOM_DISC`; skips
 * without it. Fish Hook's case (at the bottom) is the claymore in water: wading, not too deep (PF-13).
 */

const DISC = process.env.SOCOM_DISC;
/** His two files' maps: Frostfire and Crossroads, and his beta's Desert Glory, Fish Hook and Night Stalker. */
const MAPS = ['MP2', 'MP72', 'MP6', 'MP71', 'MP7'] as const;
/** Fish Hook: the map whose SEAL spawn stands in water (the case below). */
const WET = 'MP71';
const HAVE = !!DISC && MAPS.every((m) => existsSync(resolve(DISC, `RUN/${m}.ZDB`)));
/**
 * The ARMORY pick that puts a claymore (item 153) in the SEAL's slot 3, the first equipment slot after the rifle and
 * the pistol (`EQUIPMENT_SLOTS`). Only the fourth SEAL type carries one on these maps, and the original locks the
 * fourth on Crossroads and Fish Hook (`InWhichAOP` 70; open since OT.R91, `fourthArmoryTypeOpen`), so the kit is picked
 * in the waiting room of a classic room as the lobby's ARMORY picks it, for the round's spawn (W5.R1; research 95 section 4.1).
 */
const CLAYMORE_PICK = { slot: 3, id: 153 } as const;
/** How long a classic room is given to launch its first round once both sides are seated (ticks: 60 s). */
const LAUNCH_TICKS = 60 * 60;
/**
 * The victim's distances ahead (his 60 first, then the 45 and 75 his map simulation searched), the headings searched
 * and the floor tolerance: the test's staging, inside the claymore's 125 u of full damage (research 91 section 5).
 */
const VICTIM_AHEAD = [60, 45, 75] as const, HEADINGS = 16, FLOOR_TOLERANCE = 3;
/** The victim's body height the search's line ends at (test geometry: about the chest of a standing SEAL). */
const BODY_LINE = 18.3;

class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
}

/**
 * The bridge on one map: four placements by the page, `taken` of them by the room; with all four, the Detonator's fire
 * and the enemy ahead dead.
 */
async function bridge(stem: string, taken = 4): Promise<void> {
  const source = new FsAssetSource(DISC as string);
  const path = `RUN/${stem}.ZDB`;
  const map = await loadSimMap(source, path);
  const kitSource = await loadKitSource(source);
  expect(kitSource).not.toBeNull();
  const kits = simKitsFromBytes(kitSource!, await source.read(path));
  const room = new Room(map, await loadSimClips(source), { rules: 'classic', random: () => 0.5 }, null, kits);
  const victimConn = new Client(), placerConn = new Client();
  room.hello(1, victimConn, { type: 'hello', version: PROTOCOL_VERSION, map: stem, name: 'VICTIM', rules: 'classic' }, '192.0.2.1');
  room.hello(2, placerConn, { type: 'hello', version: PROTOCOL_VERSION, map: stem, name: 'PLACER', rules: 'classic' }, '192.0.2.2');
  room.step();
  expect([room.player(1)!.team, room.player(2)!.team]).toEqual(['terrorist', 'seal']);
  room.text(2, { type: 'loadout', picks: [CLAYMORE_PICK] });
  for (let k = 0; k < LAUNCH_TICKS && room.player(2)!.loadout[CLAYMORE_PICK.slot] !== CLAYMORE_PICK.id; k++) room.step();
  expect(placerConn.events.filter((e) => e.type === 'roundStart')).toHaveLength(1);
  const victim = room.player(1)!, placer = room.player(2)!;
  expect(victim.alive && placer.alive).toBe(true);
  const names = EQUIPMENT_SLOTS.map((s) => kits.table.arsenal.items.get(placer.loadout[s])?.name ?? null);
  expect(names).toContain('Claymore');

  // The staging: a heading whose hand has ground under it and whose line ahead is clear to a body on a floor.
  const s = placer.sim.walker.state;
  let spot: V3 | null = null;
  for (const ahead of VICTIM_AHEAD) {
    for (let i = 0; i < HEADINGS && !spot; i++) {
      s.yaw = (i * 360) / HEADINGS;
      const hand = actorToWorldPoint([s.x, s.y, s.z], s.yaw, [2, 8, -8]);
      const under = probeFloor(map.grid, hand[0], s.y, hand[2]);
      if (!under) continue;
      const r = (s.yaw * Math.PI) / 180, x = s.x - Math.sin(r) * ahead, z = s.z - Math.cos(r) * ahead;
      const there = probeFloor(map.grid, x, s.y, z);
      if (!there || Math.abs(there.y - s.y) > FLOOR_TOLERANCE) continue;
      // A water surface is no wall (Fish Hook's SEAL spawns stand in water 3 deep: research 86 section 6.4).
      if (!segmentHit(map.grid, [hand[0], under.y + 0.1, hand[2]], [x, there.y + BODY_LINE, z], (p) => !isLiquidSurface(p))) spot = [x, there.y, z];
    }
    if (spot) break;
  }
  expect(spot).not.toBeNull();
  expect(victim.sim.walker.place(spot![0], spot![1] + PROBE_LIFT, spot![2])).toBe(true);

  // The page: its thrower on the map's hull, reading the placer's body, its kit the placer's; its events on the wire
  // as main.ts sends them (`net.throwEvent(info.item, info.pos, info.facing)`; the Detonator's from the feet).
  const g = new GrenadeThrower({ grid: () => map.grid, snapshot: () => placer.sim.body(), view: () => 'third' }, undefined, () => 0.5);
  g.setRecords([...(kits.table.throwables?.values() ?? [])].map((t) => t.record));
  g.setKit(names);
  g.on('place', (e) => room.text(2, { type: 'throw', seq: placer.sim.seq, kind: e.item, from: [...e.pos], velocity: [...e.facing] }));
  g.on('detonate', (e) => room.text(2, { type: 'throw', seq: placer.sim.seq, kind: 'Detonator', from: [...e.from], velocity: [0, 0, 0] }));
  for (let i = 0; i < 4; i++) {
    expect(g.select('Claymore')).toBe(true);
    g.pull();
    g.release();
    for (let k = 0; k < 180; k++) g.update(1 / 60);
    expect(g.stats().placed).toBe(i + 1);
  }
  const grenades = (kind: string) => victimConn.events.filter((e) => e.type === 'grenade' && (e as { kind: string }).kind === kind);
  expect(grenades('Claymore')).toHaveLength(taken);                      // every placement taken by the room
  if (taken < 4) return;
  expect(g.held()).toBe('Detonator');
  g.pull();
  g.release();
  g.update(0.1);
  expect(grenades('Detonator')).toHaveLength(1);
  for (let k = 0; k < 6; k++) room.step();
  expect(victimConn.events.filter((e) => e.type === 'hurt').length).toBeGreaterThan(0);
  expect(victim.alive).toBe(false);
}

describe.skipIf(!HAVE)(`the page's claymores on real hulls into the room${HAVE ? '' : ' (SOCOM_DISC with the five maps absent)'}`, () => {
  it.each(MAPS.filter((m) => m !== WET))('%s: four claymores the page places are taken by the room and its Detonator kills the enemy ahead', (stem) => bridge(stem), 60_000);

  // Fish Hook's SEAL spawn stands in water (feet 46.96, the surface `di_water_bigpoly` at 50; research 86 section 6.4):
  // wading 3.04 deep, under `CLAYMORE_RULES.maxWaterDepth` 3.2 (PF-13: the game's only water test, D:L475310-475350).
  // The page sets the claymore on the bed under the water (48.19: `placeCharge`'s ground cast passes liquid surfaces
  // over) and the room takes all four. Until web sprint 26 this pinned a known defect -- the room's hand-walled test met
  // the water's surface and took none; the placed path from the head at the hand's height (PF-05, SVC-23b) no longer
  // meets it (found taken on agent/world d9696dbf before PF-13's change, folded in by PF-13).
  it(`${WET}: four claymores the page sets down wading 3.04 deep (under 3.2) are taken by the room and its Detonator kills the enemy ahead`, () => bridge(WET), 60_000);
});
