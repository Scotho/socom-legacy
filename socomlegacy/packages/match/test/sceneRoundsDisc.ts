import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { footprintDistance, planeHeightAt, readKitTable } from '@s2u/scene';
import { loadSimMap } from '../../viewer/src/simMap';
import { PROTOCOL_VERSION, TICK_HZ, encodeCommands, type Command, type GroundData, type ServerEvent, type SimMap } from '../../viewer/src/sim';
import { Room, type Conn } from '../src/room';

/** Research 386 §3.2's dev-disc harness: a room on one map with its kit table, two seats, the hull's heights. */
class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
  of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] { return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[]; }
}

export type Live = { alive: boolean; health: { hp: number[] }; sim: { walker: { state: { x: number; y: number; z: number } } } };

/** The hull's surface heights over (x, z), low to high (every polygon whose footprint holds the point). */
export function surfacesOver(ground: GroundData, x: number, z: number): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i < ground.fields.length / 6; i++) {
    const pc = ground.fields[i * 6]!;
    const pts = ground.points.subarray(at, at + pc * 3);
    at += pc * 3;
    if (footprintDistance(pts, x, z) > 0) continue;
    const y = planeHeightAt(pts, x, z);
    if (y !== null) out.push(y);
  }
  return out.sort((a, b) => a - b);
}

export async function roomOn(disc: string, stem: string, random: () => number = () => 0.5) {
  const map: SimMap = { ...await loadSimMap(new FsAssetSource(disc), `RUN/${stem}.ZDB`), gameType: 2 };
  const kits = { table: readKitTable(readFileSync(join(disc, 'RUN/ZWEAPON.ZAR'))), map: null };
  let now = 0;
  const room = new Room(map, null, { now: () => now, random, launchCountdownS: 0 }, null, kits);
  const clients = new Map<number, Client>();
  for (const id of [1, 2]) {
    const c = new Client();
    clients.set(id, c);
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `p${id}`, map: stem }, `192.0.2.${id}`);
  }
  const seqs = new Map<number, number>();
  const step = (): void => {
    for (const id of clients.keys()) {
      const seq = (seqs.get(id) ?? 0) + 1;
      seqs.set(id, seq);
      const c: Command = { seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(id, encodeCommands({ viewTick: room.tick, commands: [c] }));
    }
    now += 1000 / TICK_HZ;
    room.step();
  };
  for (let t = 0; t < 10; t++) step();
  const players = (room as unknown as { players: Map<number, Live> }).players;
  const place = (id: number, at: readonly number[]): Live => {
    const p = players.get(id)!;
    Object.assign(p.sim.walker.state, { x: at[0], y: at[1], z: at[2] });
    return p;
  };
  const origin = (suffix: string): number[] => {
    const [, w] = [...map.meta!.fireNodes!.entries()].find(([path]) => path.endsWith(suffix))!;
    return [w[12]!, w[13]!, w[14]!];
  };
  const client = (id: number): Client => clients.get(id)!;
  const bombBlast = (at: number[]): void => (room as unknown as { bombBlast(at: number[]): void }).bombBlast(at);
  return { map, room, step, place, origin, client, bombBlast, player: (id: number) => players.get(id)! };
}

