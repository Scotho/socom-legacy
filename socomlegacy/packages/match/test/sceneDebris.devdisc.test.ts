// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { readKitTable } from '@s2u/scene';
import { loadSimMap } from '../../viewer/src/simMap';
import { loadKitSource } from '../../viewer/src/loadout';
import { PROTOCOL_VERSION, TICK_HZ, encodeCommands, type Command, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/**
 * Research 386 §3.2-§3.3 on the disc (`RUN/MP1.ZDB`, `RUN/MP6.ZDB`, `RUN/MP12.ZDB` through `loadSimMap`, the kit table
 * through `loadKitSource`):
 *
 * - The death debris: each `CALL_ANIMATION` of a `*_part_fly` / `toilet_flypart*` names its own part at +9 (flags 0x0d),
 *   the callee's `NODE_CALLER` (`FUN_0025d5c0` D:L107605-107613; D:L118164-118168). Blizzard's `toilet_flypart1/2` and
 *   MP6's `crate_part_fly` wait (1 s; 2 s), fade the part (over 1 s; 2 s) and turn it off: each part is gone
 *   ~2 s (MP1) or ~4 s (MP6) after the blow, in the room's state (the wire). The Ruins' (MP12) `tower_part_fly` only flies its part (no fade, no off): the
 *   same call shape, its parts named, nothing turned off.
 * - Blizzard's outhouse fires `C4` / `C4 Ammo` at its `toilet` (fuse 0.001 s): the room sets it off a tick on at the
 *   toilet's world position, every page told (`sceneRound`), a player there reached by its blast.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP1.ZDB')) && existsSync(join(d, 'RUN/MP6.ZDB')) && existsSync(join(d, 'RUN/MP12.ZDB')));

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

async function roomOn(stem: string) {
  const source = new FsAssetSource(DISC!);
  const map: SimMap = { ...await loadSimMap(source, `RUN/${stem}.ZDB`, await loadKitSource(source)), gameType: 2 };
  let now = 0;
  const kits = { table: readKitTable(readFileSync(join(DISC!, 'RUN/ZWEAPON.ZAR'))), map: null };
  const room = new Room(map, null, { now: () => now, random: () => 0.5, launchCountdownS: 0 }, null, kits);
  const client = new Client();
  room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'p1', map: stem }, '192.0.2.1');
  let seq = 0;
  const step = (): void => {
    const c: Command = { seq: ++seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [c] }));
    now += 1000 / TICK_HZ;
    room.step();
  };
  for (let t = 0; t < 10; t++) step();
  const player = (room as unknown as { players: Map<number, { alive: boolean; sim: { walker: { state: { x: number; y: number; z: number } } } }> }).players.get(1)!;
  return { map, room, client, step, player };
}

/** The placed part paths a destructible's death names on its calls' +9 (the calls' `caller` node references). */
function partsOf(d: { program: { sequences: { ops: { op: string; caller?: number }[] }[] }; nodes: (string | null)[] }): string[] {
  return d.program.sequences.flatMap((s) => s.ops.flatMap((o) => (o.op === 'call' && o.caller !== undefined ? [d.nodes[o.caller]!] : [])));
}

describe.skipIf(!DISC)(`research 386: the death debris and the outhouse's C4 on the disc (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it("MP1: outhouse1's fifteen parts are gone ~2 s after the blow; its C4 goes off at the toilet a tick on, told to every page", async () => {
    const s = await roomOn('MP1');
    const d = s.map.meta!.scene!.destructibles.find((x) => x.anim === 'outhouse1')!;
    const parts = partsOf(d);
    expect(parts).toEqual(Array.from({ length: 15 }, (_, i) => `${d.nodes[4]}/part${i + 1}`));
    const toilet = s.map.meta!.fireNodes!.get(d.nodes[4]!)!;
    const at = [toilet[12]!, toilet[13]!, toilet[14]!];
    expect(Math.hypot(at[0]! - 2623.027, at[2]! - 3170.774)).toBeLessThan(30);   // within the outhouse at its root (173 §5)
    Object.assign(s.player.sim.walker.state, { x: at[0], y: at[1], z: at[2] });
    expect(s.room.world.health.hitAt(d.targetPath, { kind: 'impact', rating: 10, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    for (const p of parts) expect(s.room.world.isActive(p), p).toBe(true);    // `toilet` on: its parts drawn
    s.step();
    const told = s.client.of('sceneRound');
    expect(told.map((e) => e.kind)).toEqual(['C4']);
    for (let i = 0; i < 3; i++) expect(told[0]!.at[i]).toBeCloseTo(at[i]!, 3);
    expect(s.client.of('blast').length + (s.player.alive ? 0 : 1)).toBeGreaterThan(0);   // the player at the toilet reached
    for (let k = 1; k < Math.floor(1.9 * TICK_HZ); k++) s.step();
    for (const p of parts) expect(s.room.world.isActive(p), `${p} at 1.9 s`).toBe(true);
    for (let k = 0; k < Math.ceil(0.3 * TICK_HZ); k++) s.step();
    for (const p of parts) expect(s.room.world.isActive(p), `${p} at 2.2 s`).toBe(false);
    const wire = s.room.world.states().map((x) => `${x.path}:${x.active}`);
    for (const p of parts) expect(wire).toContain(`${p}:false`);
  }, 120_000);

  it("MP6: hit_crate01's nine parts are gone ~4 s after the blow (crate_part_fly: wait 2 s, a 2 s fade, off), by the same call shape", async () => {
    const s = await roomOn('MP6');
    const d = s.map.meta!.scene!.destructibles.find((x) => x.anim === 'hit_crate01')!;
    const parts = partsOf(d);
    expect(parts).toHaveLength(9);
    for (const p of parts) expect(p, p).toMatch(/\/part[1-9]$/);
    expect(s.room.world.health.hitAt(d.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    for (let k = 0; k < Math.floor(3.9 * TICK_HZ); k++) s.step();
    for (const p of parts) expect(s.room.world.isActive(p), `${p} at 3.9 s`).toBe(true);
    for (let k = 0; k < Math.ceil(0.3 * TICK_HZ); k++) s.step();
    for (const p of parts) expect(s.room.world.isActive(p), `${p} at 4.2 s`).toBe(false);
  }, 120_000);

  it("MP12: tower_hitme's three calls name part1..3 (flags 0x0d); tower_part_fly only flies them -- nothing turned off", async () => {
    const s = await roomOn('MP12');
    const d = s.map.meta!.scene!.destructibles.find((x) => x.anim === 'tower_hitme')!;
    const parts = partsOf(d);
    expect(parts.map((p) => p.split('/').at(-1))).toEqual(['part1', 'part2', 'part3']);
    expect(s.room.world.health.hitAt(d.targetPath, { kind: 'impact', rating: 12, modifier: 0, point: [0, 0, 0] })).toEqual({ applied: true, died: true });
    const on = parts.map((p) => s.room.world.isActive(p));
    for (let k = 0; k < 3 * TICK_HZ; k++) s.step();
    expect(parts.map((p) => s.room.world.isActive(p))).toEqual(on);
  }, 120_000);
});
