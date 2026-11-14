// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, WalkMode, type GroundData } from '../src/walk';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { decodeCommands, encodeCommands, frameKind, VIEW_SWAY_STEP_ADAPTATION } from '../src/net/codec';
import { Frame, type Command } from '../src/net/protocol';

/**
 * PV-3 (the player's-view lane, `docs/plans/2026-11-11-players-view.md`; research 402 section 3; a browser adaptation
 * with no original, product track): the page's own command carries its view state and its scope's sway (`Command.view`,
 * `swayX`, `swayY`), read off a seam (`WalkMode.setViewSource`) once per command built, as ER-2's raise is
 * (`setRaiseSource`). Nothing the mover, the fire or the reticle reads changes: the walk only REPORTS them. A resend of
 * a kept command (the client's redundancy, a respawn's replay) re-sends it as built and never reads the seam again.
 */

/** A flat ground polygon (`m_ditype` 3: bits 0 and 1), world space (`walk.test.ts`' own). */
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(-200, -200, 200, 200, 0)],
  [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }],
);

type ViewSource = () => { view: number; swayX: number; swayY: number };
/** The seam under test, typed apart so the RED run fails on the call, not on the compile. */
type Seamed = WalkMode & { setViewSource(read: ViewSource | null): void };

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** A spawned walk on the flat floor, its commands collected. */
function rig(): { mode: Seamed; sent: Omit<Command, 'seq'>[] } {
  const fly = new FlyCamera(canvas());
  const mode = new WalkMode(fly) as Seamed;
  made.push(mode);
  mode.setGround(GROUND, [150, 0, 150]);
  expect(mode.respawn([150, 1, 150], 0)).toBe(true);
  const sent: Omit<Command, 'seq'>[] = [];
  mode.setNetTap((cmd) => { sent.push(cmd); });
  return { mode, sent };
}

/** One command on the wire and back (`encodeCommands` / `decodeCommands`), and its own 18 bytes. */
const wire = (cmd: Omit<Command, 'seq'>, seq = 1): { back: Command; tail: number[] } => {
  const bytes = encodeCommands({ viewTick: 0, commands: [{ ...cmd, seq }] });
  return { back: decodeCommands(bytes).commands[0]!, tail: [...bytes.slice(-3)] };
};

describe('PV-3: the walk\'s command carries the page\'s view state and sway (setViewSource)', () => {
  it('a source of (7, 3.5, -2): each command carries it, and it crosses the wire as view 7 and the sway at the step', () => {
    const { mode, sent } = rig();
    mode.setViewSource(() => ({ view: 7, swayX: 3.5, swayY: -2 }));
    for (let i = 0; i < 3; i++) mode.frame(1 / 60);
    expect(sent.length).toBeGreaterThan(0);
    for (const cmd of sent) {
      expect([cmd.view, cmd.swayX, cmd.swayY]).toEqual([7, 3.5, -2]);
      const { back, tail } = wire(cmd);
      expect([back.view, back.swayX, back.swayY]).toEqual([7, 3.5, -2]);
      expect(tail).toEqual([7, 3.5 / VIEW_SWAY_STEP_ADAPTATION, (256 - 2 / VIEW_SWAY_STEP_ADAPTATION) & 255]);
    }
  });

  it('the page sends its values as they are: the codec rounds the sway to its step and reads a view past 12 as none', () => {
    const { mode, sent } = rig();
    let next = { view: 7, swayX: 3.3, swayY: -2.1 };
    mode.setViewSource(() => next);
    mode.frame(1 / 60);
    expect([sent.at(-1)!.view, sent.at(-1)!.swayX, sent.at(-1)!.swayY]).toEqual([7, 3.3, -2.1]);   // not clamped on the page
    const { back } = wire(sent.at(-1)!);
    expect([back.view, back.swayX, back.swayY]).toEqual([7, 3.5, -2]);
    next = { view: 13, swayX: 0, swayY: 0 };
    mode.frame(1 / 60);
    expect(sent.at(-1)!.view).toBe(13);
    expect(wire(sent.at(-1)!).back.view).toBe(0);                 // `viewState`: the one rule, the codec's
  });

  it('without a source the three fields are absent and the three bytes 0; a source taken away leaves them so again', () => {
    const { mode, sent } = rig();
    mode.frame(1 / 60);
    const plain = sent.at(-1)!;
    expect('view' in plain || 'swayX' in plain || 'swayY' in plain).toBe(false);
    expect(wire(plain).tail).toEqual([0, 0, 0]);
    mode.setViewSource(() => ({ view: 5, swayX: 10, swayY: 10 }));
    mode.frame(1 / 60);
    expect(wire(sent.at(-1)!).tail).not.toEqual([0, 0, 0]);
    mode.setViewSource(null);
    mode.frame(1 / 60);
    expect('view' in sent.at(-1)!).toBe(false);
    expect(wire(sent.at(-1)!).tail).toEqual([0, 0, 0]);
  });

  it('the source is read once per command built, never per frame: a 144 Hz page reads it about 60 times a second', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly, () => undefined) as Seamed;
    mode.setGround(GROUND, [150, 0, 150]);
    mode.bindKey();
    made.push(mode);
    fly.setPose({ x: 150, y: 40, z: 150, yaw: 0, pitch: 0 });
    expect(mode.setMode('walk')).toBe(true);
    let sent = 0, reads = 0;
    mode.setNetTap(() => { sent++; });
    mode.setViewSource(() => { reads++; return { view: 6, swayX: 1, swayY: 1 }; });
    for (let i = 0; i < 144; i++) { fly.update(1 / 144); mode.frame(1 / 144); }
    expect(reads).toBe(sent);
    expect(reads).toBeGreaterThanOrEqual(59);
    expect(reads).toBeLessThanOrEqual(61);
  });

  it('no net tap, no command: the source is never read (the offline test room)', () => {
    const fly = new FlyCamera(canvas());
    const mode = new WalkMode(fly) as Seamed;
    made.push(mode);
    mode.setGround(GROUND, [150, 0, 150]);
    expect(mode.respawn([150, 1, 150], 0)).toBe(true);
    let reads = 0;
    mode.setViewSource(() => { reads++; return { view: 6, swayX: 1, swayY: 1 }; });
    for (let i = 0; i < 10; i++) mode.frame(1 / 60);
    expect(reads).toBe(0);
  });
});

describe('PV-3: a kept command is re-sent as built (the source is not read again)', () => {
  it('a respawn\'s replay of the kept commands reads no source and changes no sent command\'s bytes', () => {
    const { mode, sent } = rig();
    let reads = 0;
    mode.setViewSource(() => { reads++; return { view: 5 + (reads % 8), swayX: reads, swayY: -reads }; });
    for (let i = 0; i < 6; i++) mode.frame(1 / 60);
    const n = reads;
    expect(n).toBe(sent.length);
    const kept = sent.map((c, i) => ({ ...c, seq: i + 1 }));
    const before = kept.map((c) => [...encodeCommands({ viewTick: 0, commands: [c] })]);
    expect(mode.respawn([150, 1, 150], 0, kept)).toBe(true);     // `NetClient.spawned`'s replay (`MoverSim.apply`)
    expect(reads).toBe(n);
    expect(kept.map((c) => [...encodeCommands({ viewTick: 0, commands: [c] })])).toEqual(before);
    expect(sent.length).toBe(n);                                  // the replay sends nothing
  });

  it('the client\'s redundancy re-sends each command\'s own bytes in the next frames, whatever the source reads since', () => {
    // The page's path: `NetClient` takes the walk's tap (`setNetTap`), keeps each command in its history and sends the last
    // `COMMAND_REDUNDANCY` of them in every frame (`NetClient.tick`).
    let tap: Parameters<NetWalk['setNetTap']>[0] = null;
    const walkProxy = new Proxy({ setNetTap: (t: typeof tap) => { tap = t; }, respawn: () => true, resume: () => true } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => undefined),
    }) as unknown as NetWalk;
    const frames: Uint8Array[] = [];
    const socket = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => { if (typeof d !== 'string') frames.push(d); }, close: () => undefined } as unknown as WebSocketLike;
    const client = new NetClient({ url: 'mem', map: 'MP2', name: 'Tester', socket: () => socket }, walkProxy);
    socket.onopen?.({} as Event);
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
        players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 1, env: { revision: 0, epoch: 1, states: [] }, startTick: 0,
      }),
    } as MessageEvent);
    const { mode } = rig();
    mode.setNetTap((cmd, feet, facing) => tap!(cmd, feet, facing));
    let reads = 0;
    mode.setViewSource(() => { reads++; return { view: 4 + reads, swayX: 2 * reads, swayY: -3 * reads }; });
    for (let i = 0; i < 4; i++) mode.frame(1 / 60);
    expect(reads).toBe(4);
    const cmds = frames.filter((f) => frameKind(f) === Frame.Commands).map((f) => decodeCommands(f).commands);
    const bySeq = new Map<number, string[]>();
    for (const batch of cmds) for (const c of batch) bySeq.set(c.seq, [...(bySeq.get(c.seq) ?? []), JSON.stringify(c)]);
    const first = Math.min(...bySeq.keys());
    expect(JSON.parse(bySeq.get(first)![0]!)).toMatchObject({ view: 5, swayX: 2, swayY: -3 });
    for (const [seq, copies] of bySeq) {
      expect(new Set(copies).size).toBe(1);                         // each copy of a command is the command as built
      const c = JSON.parse(copies[0]!) as Command;
      expect([c.view, c.swayX, c.swayY]).toEqual([4 + seq - first + 1, 2 * (seq - first + 1), -3 * (seq - first + 1)]);
    }
    expect(bySeq.get(first)!.length).toBeGreaterThan(1);            // re-sent in a later frame
    client.close();
  });

  it('a correction\'s re-run (`rerunFrom`, a late knock) and the facing\'s replay read no source, send nothing, keep each command as built', () => {
    // The setup is `knockReplay.test.ts`' (`page()` and its late case): the room's knock after command 4 heard eight
    // commands later -- the mover laid back to the state kept after 4 and commands 5.. run again through `MoverSim.apply`
    // (`WalkMode.replayKnock` -> `rerunFrom`); then the room's facing after a command (`reconcileFacing`, the look log's replay).
    const { mode, sent } = rig();
    let reads = 0;
    mode.setViewSource(() => { reads++; return { view: 5 + (reads % 8), swayX: reads, swayY: -reads }; });
    for (let i = 0; i < 12; i++) mode.frame(1 / 60);
    const n = reads;
    expect(n).toBe(sent.length);
    const asBuilt = sent.map((c) => [c.view, c.swayX, c.swayY]);
    const keptCmds = (): Command[] => (mode['kept'] as { cmd: Command }[]).map((k) => k.cmd);
    const keptBefore = keptCmds().map((c) => JSON.stringify(c));
    expect(keptBefore.length).toBeGreaterThan(8);
    const before = sent.map((c, i) => [...encodeCommands({ viewTick: 0, commands: [{ ...c, seq: i + 1 }] })]);
    const after = (mode['taps'] as number) - 8;                     // a command still kept, eight behind the last sent
    const replayed: number[] = [];
    expect(mode.knock({ velocity: [11.3, 48.8, 0], fall: 'fallForward' }, after, (a) => replayed.push(a))).toBe(true);
    expect(replayed).toEqual([after]);                              // the re-run ran (`rerunFrom` calls it last)
    expect(mode.reconcileFacing(after + 2, { yaw: 0.25, pitch: 0 })).not.toBeNull();   // the facing's replay ran
    expect(reads).toBe(n);                                          // neither read the source
    expect(sent.length).toBe(n);                                    // neither sent a command
    expect(sent.map((c) => [c.view, c.swayX, c.swayY])).toEqual(asBuilt);
    expect(sent.map((c, i) => [...encodeCommands({ viewTick: 0, commands: [{ ...c, seq: i + 1 }] })])).toEqual(before);
    expect(keptCmds().map((c) => JSON.stringify(c))).toEqual(keptBefore);   // the kept ring's copies, as built
  });
});
