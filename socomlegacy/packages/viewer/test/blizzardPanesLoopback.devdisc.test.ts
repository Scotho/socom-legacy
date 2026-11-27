// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { footprintDistance, planeHeightAt, readKitTable, segmentHits } from '@s2u/scene';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import { loadSimMap } from '../src/simMap';
import {
  cameraLook, centreClaim, encodeCommands, EYE_HEIGHT, faceToward, groundGrid, PROTOCOL_VERSION, TICK_HZ, WorldState,
  type Command, type GroundData, type ServerEvent,
} from '../src/sim';
import type { Conn } from '../../match/src/room';

/**
 * LATER 1522 (B-36b): Blizzard's (MP1) `snow_window01..03` broken by real rounds through the page's own match -- the
 * room in the page (`../src/net/loopback` `LoopbackMatch`, as the offline test room builds it in `main.ts`), the page's
 * world following the room's through `main.ts`'s getter (`pageWorld?.ground === map.ground ? pageWorld : null`), and a
 * `fire` the room judges (`startRefused`, the cone, `roundPath`, `health.at` + `hitAt`) -- never a direct `hitAt`.
 *
 * A window is HP 0 / shield 0 (research 386 §0 A2 and §1-2, reading, pending review; `blizzardDestructibles.devdisc.test.ts`): any round that strikes one
 * of its polygons kills it. Its two GLASS polygons pass the round (penetration 0.99), so a shot's `to` lies past it.
 * Per pane, from a standing spot outside it (walked there: `walker.place` and settled) and from the test room's
 * teleport (`main.ts` `teleport`: `seed`, the yaw, `runSeedFrame`), and from inside the shack outward: the first round
 * the room takes kills the pane (one `sceneDeath`), the room's and the page's world both turn it off, and no round is
 * refused. Each shot's verdict is logged (taken / refused and why / the surfaces it passed / the deaths), so a red
 * says whether the room refused the round (hypothesis a) or broke the pane while the page world did not follow (b).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP1.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

type V3 = [number, number, number];

class Client implements Conn {
  events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* nothing */ }
}

const PANES = [1, 2, 3].map((n) => `worldmodel/snow_window0${n}`);

/** The polygons a node owns (its owner record, and any under it), their points' centre. */
function paneCentre(ground: GroundData, path: string): { centre: V3; polys: number[] } {
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < ground.fields.length / 6; i++) { starts.push(at); at += ground.fields[i * 6]! * 3; }
  const polys: number[] = [];
  for (const o of ground.owners) if (o.path === path || o.path.startsWith(`${path}/`)) for (let k = 0; k < o.count; k++) polys.push(o.first + k);
  const sum: V3 = [0, 0, 0];
  let n = 0;
  for (const i of polys) {
    const pc = ground.fields[i * 6]!;
    for (let k = 0; k < pc; k++) { for (let a = 0; a < 3; a++) sum[a] = sum[a]! + ground.points[starts[i]! + k * 3 + a]!; n++; }
  }
  return { centre: [sum[0] / n, sum[1] / n, sum[2] / n], polys };
}

/** The highest hull surface over (x, z) at or below `y` (a floor to stand on). */
function floorUnder(ground: GroundData, x: number, z: number, y: number): number | null {
  let best: number | null = null;
  let at = 0;
  for (let i = 0; i < ground.fields.length / 6; i++) {
    const pc = ground.fields[i * 6]!;
    const pts = ground.points.subarray(at, at + pc * 3);
    at += pc * 3;
    if (footprintDistance(pts, x, z) > 0) continue;
    const h = planeHeightAt(pts, x, z);
    if (h !== null && h <= y && (best === null || h > best)) best = h;
  }
  return best;
}

async function setup() {
  const map = { ...await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP1.ZDB'), gameType: 2 as const };
  const kits = { table: readKitTable(readFileSync(join(DISC!, 'RUN/ZWEAPON.ZAR'))), map: null };
  // The page's world, built as `main.ts` `show` builds it: on the loaded map's own hull and a grid of it.
  const page = new WorldState(map.meta!, map.ground, groundGrid(map.ground), {});
  page.applyInitial();
  let now = 0;
  // The page's loaded map as the room takes it (`simMapOfLoaded`: the hull forked for the room).
  const loaded = { ...map, path: 'RUN/MP1.ZDB', ...(map.defaultMaterial ? { grenade: { defaultMaterial: map.defaultMaterial } } : {}) };
  const match = new LoopbackMatch(simMapOfLoaded(loaded), null, {
    auto: false, rules: 'classic', kits, now: () => now, random: () => 0.5, launchCountdownS: 0,
    world: () => (page.ground === map.ground ? page : null),   // `main.ts`'s getter, as written
  });
  const room = match.room;
  const client = new Client();
  room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'Solo', map: 'MP1' }, '192.0.2.1');
  const look = { yaw: 0, pitch: 0 };
  const drive = (ticks: number): void => {
    for (let i = 0; i < Math.max(1, ticks); i++) {
      const p = room.player(1)!;
      const cmd: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: look.yaw, pitch: look.pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 };
      room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      now += 1000 / TICK_HZ;
      match.step();
    }
  };
  drive(10);
  const feet = (): V3 => { const w = room.player(1)!.sim.walker.state; return [w.x, w.y, w.z]; };
  /** Stood at `at` as a walk ends there: placed above the floor and settled. */
  const walkTo = (at: V3): void => { room.player(1)!.sim.walker.place(at[0], at[1] + 20, at[2]); drive(30); };
  /** Stood at `at` as the test room's teleport stands the room's body (`main.ts` `teleport`). */
  const teleportTo = (at: V3, yaw: number): void => {
    const w = room.player(1)!.sim.walker;
    w.seed(at[0], at[1], at[2]);
    w.state.yaw = yaw;
    w.runSeedFrame();
    drive(2);
  };
  const face = (point: V3): void => {
    Object.assign(look, faceToward({ feet: feet(), posture: room.player(1)!.sim.walker.posture }, point));
    room.player(1)!.sim.allowSnap();
    drive(30);
  };
  /**
   * One round down the cone's centre at `point`, as `roomDamage.test.ts`'s `shoot`; what the room did, logged. The room
   * broadcasts a taken round's `shot` to every page but the shooter's (`fire`: `broadcast(..., id)`), so a round is taken
   * when the room spent it (`mags[0]`), refused when the page is told (`roundRefused` / `stale`).
   */
  const shoot = (point: V3, label: string): { taken: boolean; refused: string[]; deaths: number } => {
    const before = client.events.length;
    const p = room.player(1)!, seq = p.sim.seq, f = p.cone.frame(seq)!;
    const rounds = p.mags[0].rounds();
    const { eye: e } = cameraLook(f);
    const c = centreClaim(f, [f.feet[0]!, f.feet[1]! + EYE_HEIGHT, f.feet[2]!], Math.hypot(point[0] - e[0], point[1] - e[1], point[2] - e[2]));
    // The claim's line through the room's hull (geometry only, every surface): before the round: which owners it meets within 200 u (material byte).
    const far: V3 = [c.from[0] + c.dir[0] * 200, c.from[1] + c.dir[1] * 200, c.from[2] + c.dir[2] * 200];
    const met = segmentHits(room.map.grid, c.from, far).map((h) => `${h.owner.path.replace(/^worldmodel\//, '')}@${(h.t * 200).toFixed(1)}/m${h.poly.material}`);
    room.text(1, { type: 'fire', seq, from: c.from, dir: c.dir, eye: c.eye, aim: c.aim, weapon: 0, viewTick: room.tick });
    drive(1);
    const got = client.events.slice(before);
    const taken = room.player(1)!.mags[0].rounds() < rounds;
    const refused = got.filter((e) => e.type === 'roundRefused' || e.type === 'stale').map((e) => `${e.type}: ${(e as { why?: string }).why ?? ''}`);
    const deaths = got.filter((e) => e.type === 'sceneDeath').length;
    console.log(`[1522] ${label}: ${taken ? 'TAKEN' : 'NOT TAKEN'} refused=[${refused.join('; ')}] sceneDeath=${deaths}`
      + ` room=[${PANES.map((q) => room.world.isActive(q) ? 1 : 0).join('')}] page=[${PANES.map((q) => page.isActive(q) ? 1 : 0).join('')}]`
      + ` line=[${met.slice(0, 6).join(', ')}]`);
    drive(60);                                                   // past the weapon's cycle
    return { taken, refused, deaths };
  };
  const reset = (): void => { room.world.reset(); drive(1); };
  return { map, page, match, room, client, drive, feet, walkTo, teleportTo, face, shoot, reset };
}

describe.skipIf(!DISC)(`LATER 1522: Blizzard's snow windows by real rounds through the page's match (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it('each pane: the first round the room takes kills it (one sceneDeath), the room and the page world both turn it off, nothing refused', async () => {
    const s = await setup();
    const centres = PANES.map((q) => paneCentre(s.map.ground, q));
    for (const [i, q] of PANES.entries()) console.log(`[1522] ${q}: polygons ${centres[i]!.polys.join(',')} centre ${centres[i]!.centre.map((v) => v.toFixed(1)).join(',')}`);
    // The shack's middle: between the panes' centres.
    const mid: V3 = [0, 1, 2].map((a) => centres.reduce((t, c) => t + c.centre[a]!, 0) / 3) as V3;
    // Outside each pane, ~35 u out along the line from the shack's middle through the pane (01 west, 02 east, 03 +z).
    const outside = centres.map(({ centre }): V3 => {
      const dx = centre[0] - mid[0], dz = centre[2] - mid[2], l = Math.hypot(dx, dz);
      return [centre[0] + dx / l * 35, centre[1], centre[2] + dz / l * 35];
    });
    const failures: string[] = [];
    const run = (label: string, stand: (q: number) => void): void => {
      for (const [i, q] of PANES.entries()) {
        s.reset();
        stand(i);
        s.face(centres[i]!.centre);
        // Review F1: the pane stands in both worlds before the shot, so 'page off' after it tests the follow, not a reset gap.
        expect([s.room.world.isActive(q), s.page.isActive(q)], `${label} ${q}: standing before the shot`).toEqual([true, true]);
        const f = s.feet();
        console.log(`[1522] ${label} ${q}: feet ${f.map((v) => v.toFixed(1)).join(',')} alive=${s.room.player(1)!.alive}`);
        let first: ReturnType<typeof s.shoot> | null = null;
        const refusals: string[] = [];
        for (let k = 0; k < 4 && !first; k++) {
          const r = s.shoot(centres[i]!.centre, `${label} ${q} round ${k + 1}`);
          refusals.push(...r.refused);
          if (r.taken) first = r;
        }
        const roomOn = s.room.world.isActive(q), pageOn = s.page.isActive(q);
        const want = `${label} ${q}: taken=true deaths=1 room=off page=off refused=none`;
        const got = `${label} ${q}: taken=${!!first} deaths=${first?.deaths ?? 0} room=${roomOn ? 'on' : 'off'} page=${pageOn ? 'on' : 'off'} refused=${refusals.length ? refusals.join('|') : 'none'}`;
        if (got !== want) failures.push(got);
      }
    };
    run('walked outside', (i) => {
      const o = outside[i]!;
      s.walkTo([o[0], floorUnder(s.map.ground, o[0], o[2], o[1])!, o[2]]);
    });
    run('teleported outside', (i) => {
      const o = outside[i]!;
      s.teleportTo([o[0], floorUnder(s.map.ground, o[0], o[2], o[1])!, o[2]], 0);
    });
    run('walked inside', () => {
      s.walkTo([mid[0], floorUnder(s.map.ground, mid[0], mid[2], mid[1])!, mid[2]]);
    });
    s.match.stop();
    expect(failures).toEqual([]);
  }, 180_000);
});
