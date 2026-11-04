// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import type { Walker } from '../src/mover';
import { packGround, WalkMode } from '../src/walk';

/**
 * NET-WIRE's landing review (2026-10-08, F1; research 224 §4): one lobby socket carries a second match -- the first
 * released to the lobby (`GameSocketHost.adopt`, `NetClient.rebind` to the idle walk), the next launch handing it to the
 * page's walk again (`NetPage`, `rebind(deps.walk)`) -- and the client's command numbers run on (`NetClient.seq` is never
 * reset). The walk numbers its ticks by the client's numbering (`setNetTap`'s `sent`), so its look record holds the step
 * the room's ack names (`WalkMode.reconcileFacing`), and the landing's draw (`Walker.commandSeq`,
 * `LANDING_HIT_DRAW_READING`) runs on the command the room runs, in every match on the socket. A real WalkMode, a real
 * NetClient, the loopback room; a flat synthetic floor (no disc).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const ground = () => packGround(PARAMS, [FLOOR], OWNERS);
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({ side, index, position: [x, 0, z], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 } });
const LOADED = () => ({ path: 'RUN/MP99.ZDB', name: 'FLAT', ground: ground(), slots: [slot(0, 0, -100, 0), slot(1, 0, 100, 0)], respawns: [slot(0, 0, -300, 0)], doors: [] });
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
/** The lobby's idle walk (`../src/gameLobbyHost` `idleWalk`): it takes no tap and runs no tick. */
const idleWalk: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {} };

describe('the walk numbers its ticks by the client across a rebind (F1, research 224 §4)', () => {
  it('the walk\'s look record holds the step for the client\'s current ack in the first match and in the second on the same socket', async () => {
    const match = new LoopbackMatch(simMapOfLoaded(LOADED()), null, { auto: false });
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    const walk = new WalkMode(fly);
    walk.setGround(ground(), [0, 0, 0]);
    fly.setPose({ x: -100, y: 40, z: 0, yaw: 0, pitch: 0 });
    let turn = 0;
    fly.groundWish = () => ({ forward: 0, right: 0, boost: false });
    const client = new NetClient({ url: 'loopback:', map: 'MP99', name: 'Solo', socket: match.socket }, walk);
    await flush();
    // The room's own state as each snapshot reconciles it: the ack and its facing (the client's private `reconcile`).
    const acks: { ack: number; facing?: { yaw: number; pitch: number } }[] = [];
    const reconcile = (client['reconcile'] as (ack: number, server: [number, number, number], facing?: { yaw: number; pitch: number }) => void).bind(client);
    client['reconcile'] = (ack: number, server: [number, number, number], facing?: { yaw: number; pitch: number }): void => {
      acks.push({ ack, facing });
      reconcile(ack, server, facing);
    };
    const walker = (): Walker => walk['walker']!;
    const misnumbered: [number, number][] = [];
    const run = async (n: number, tapped: boolean): Promise<void> => {
      for (let i = 0; i < n; i++) {
        turn += 0.75;                                            // a steady turn, so each step's facing is its own
        fly.setPose({ yaw: turn });
        fly.update(1 / 60);
        walk.frame(1 / 60);
        // The tick just run was the client's last command: the walk drew its landing on that number (LANDING_HIT_DRAW_READING).
        if (tapped && walker().commandSeq !== client.lastSeq()) misnumbered.push([walker().commandSeq, client.lastSeq()]);
        match.step();
        await flush();
      }
    };
    /** The walk's record from the client's newest ack: the replayed facings, keyed by the client's command numbers. */
    const fromAck = (): { ack: number; seqs: number[] | null } => {
      const last = acks[acks.length - 1]!;
      const replayed = walk.reconcileFacing(last.ack, last.facing ?? { yaw: walker().state.yaw, pitch: walker().state.pitch });
      return { ack: last.ack, seqs: replayed ? [...replayed.keys()] : null };
    };
    const after = (ack: number): number[] => Array.from({ length: client.lastSeq() - ack }, (_, k) => ack + 1 + k);

    await run(120, true);
    expect(client.lastSeq()).toBe(120);
    const first = fromAck();
    expect(first.ack).toBeGreaterThan(0);
    expect(first.seqs).toEqual(after(first.ack));

    // The match released to the lobby (the idle walk); the page's walk ticks on untapped; the next launch hands it back.
    client.rebind(idleWalk);
    await run(30, false);
    expect(client.lastSeq()).toBe(120);
    client.rebind(walk);
    acks.length = 0;
    await run(120, true);
    expect(client.lastSeq()).toBe(240);
    const second = fromAck();
    expect(second.ack).toBeGreaterThan(120);
    expect(second.seqs).toEqual(after(second.ack));
    expect(misnumbered).toEqual([]);
  });
});
