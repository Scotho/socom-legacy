import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, SEAL_TUNING, type WeaponRecord } from '@s2u/scene';
import { Accuracy } from '../src/accuracy';
import { Hud } from '../src/hud';
import { ViewBob } from '../src/look';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { eyeBob, NIGHT_OVERRIDE, type NightOverride, Zoom, type ZoomHold } from '../src/zoom';

/**
 * MATCH-04's audit (web sprint 6, W6.R3): the view state `body+0x200` as a transition table, row by row, each row with
 * the function and the line it is read from -- `FUN_005445b0` (zoom in, d-pad Up, D:L410716, jump table 0x65c360),
 * `FUN_00544400` (zoom out, d-pad Down, D:L410623, table 0x65c320), `FUN_005448a0` (the set and the magnification
 * `+0x204`, D:L410929, table 0x65c3b0) and the other setters. The jump tables and the targets of the mangled cases were
 * read off the ELF's bytes (2026-10-01): 0x65c360 = 0x544688, 0x544780, 0x544860, 0x544810 x2, 0x544830 x7, 0x544860;
 * 0x65c320 = 0x544578, 0x5444c0, 0x5444c8, 0x5444d0, 0x5444d8, 0x5444f0 x8. The table, its comparison with `zoom.ts`
 * and the rows out of the page's reach: web research 84 §7, "The transition table, row by row (MATCH-04's audit)".
 */

const oneMode: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5] };              // an unscoped rifle (NumZoomModes 1)
const noModes: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [] };
const sniper: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] };        // the M40A1
/** No record on the disc has nine modes; the only way to reach states 11 and 12 and read their rows. */
const nineModes: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5, 2, 3, 4, 5, 6, 7, 8, 9] };
/** Ten modes: from 12, `12 - 3 < 10` holds, so only the table's entry 12 (0x544860) keeps 12 from stepping to 13. */
const tenModes: WeaponRecord = { ...DEFAULT_RIFLE, zoomModes: [1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10] };

interface Row {
  /** The function and the line (or the address of the hand-decoded instruction) the row is read from. */
  cite: string;
  from: number;
  w: WeaponRecord;
  night?: boolean;
  hold?: ZoomHold;
  flag?: NightOverride;
  to: number;
}

function step(r: Row, how: 'in' | 'out'): number {
  const z = new Zoom(r.w, r.night ?? false, r.flag ?? NIGHT_OVERRIDE);
  if (r.hold) z.setHold(r.hold);
  z.set(r.from);
  return how === 'in' ? z.zoomIn() : z.zoomOut();
}

const every: { w: WeaponRecord; name: string }[] = [
  { w: HELD_SIDEARM, name: 'the Mark 23' }, { w: oneMode, name: 'a one-mode rifle' }, { w: noModes, name: 'no ZoomMode' },
  { w: HELD_RIFLE, name: 'the M4A1 SD' }, { w: DEFAULT_RIFLE, name: 'the M4A1' }, { w: sniper, name: 'the M40A1' },
];
const holds: ZoomHold[] = ['firearm', 'round', 'launcher', 'item'];

describe('FUN_005445b0, zoom in (d-pad Up; D:L410716, table 0x65c360)', () => {
  it('0 -> 1 for every weapon class, every hold, night or day (0x544778: li s4,1 with no vehicle; D:L410751-410790)', () => {
    for (const { w, name } of every) {
      for (const hold of holds) {
        for (const night of [false, true]) {
          expect([name, hold, night, step({ cite: '0x54477c', from: 0, w, hold, night, to: 1 }, 'in')]).toEqual([name, hold, night, 1]);
        }
      }
    }
  });

  const rows: Row[] = [
    // From 1 (0x544780-0x54480c; the Ghidra C at D:L410791-410806 is mangled, the arms read off the bytes).
    { cite: '0x544794-0x54479c FUN_003d1cb0: a raised rocket launcher stays', from: 1, w: sniper, hold: 'launcher', to: 1 },
    { cite: '0x544794-0x54479c: the launcher stays at night too', from: 1, w: oneMode, hold: 'launcher', night: true, to: 1 },
    { cite: '0x5447a8-0x5447b0 FUN_005bd7e0: a launcher-round mode stays', from: 1, w: sniper, hold: 'round', to: 1 },
    { cite: '0x5447a8-0x5447b0: the round mode stays at night too', from: 1, w: oneMode, hold: 'round', night: true, to: 1 },
    { cite: '0x5447c0-0x5447e4 (+0x5dc): a night map -> 3, scoped', from: 1, w: HELD_RIFLE, night: true, to: 3 },
    { cite: '0x5447c0-0x5447e4: a night map -> 3, unscoped', from: 1, w: HELD_SIDEARM, night: true, to: 3 },
    { cite: '0x5447c0-0x5447e4: a night map -> 3, an item in the hand', from: 1, w: sniper, hold: 'item', night: true, to: 3 },
    { cite: '0x5447b8/0x5447d8 (s3, s2): a class flag set -> 3 on a day map', from: 1, w: HELD_RIFLE, flag: { primary: true, secondary: null }, to: 3 },
    { cite: '0x5447b8/0x5447d8: a class flag clear -> no goggles on a night map', from: 1, w: oneMode, night: true, flag: { primary: false, secondary: null }, to: 4 },
    { cite: '0x5447f0-0x544804 (lw +0x284, sltiu 2): two modes -> 5', from: 1, w: HELD_RIFLE, to: 5 },
    { cite: '0x5447f0-0x544804: three modes -> 5', from: 1, w: sniper, to: 5 },
    { cite: '0x544808-0x54480c: fewer than two -> 4, the pistol', from: 1, w: HELD_SIDEARM, to: 4 },
    { cite: '0x544808-0x54480c: fewer than two -> 4, a one-mode rifle', from: 1, w: oneMode, to: 4 },
    { cite: '0x544808-0x54480c: fewer than two -> 4, no mode', from: 1, w: noModes, to: 4 },
    { cite: '0x544808-0x54480c: an item (NumZoomModes 1) -> 4', from: 1, w: sniper, hold: 'item', to: 4 },
    // 2 (the vehicle's first person) and 12: table entries 2 and 12 are 0x544860, the call with s4 unchanged.
    { cite: '0x65c360[2] = 0x544860 (D:L410807-410809): 2 stays, scoped', from: 2, w: HELD_RIFLE, to: 2 },
    { cite: '0x65c360[2] = 0x544860: 2 stays, unscoped', from: 2, w: oneMode, to: 2 },
    { cite: '0x65c360[2] = 0x544860: 2 stays at night', from: 2, w: HELD_RIFLE, night: true, to: 2 },
    { cite: '0x65c360[12] = 0x544860 (D:L410808): 12 stays, though 12 - 3 < NumZoomModes 10', from: 12, w: tenModes, to: 12 },
    // 3 and 4 (0x544810-0x54482c; D:L410810-410816).
    { cite: '0x544810-0x54482c: 3 -> 5 with two or more modes', from: 3, w: HELD_RIFLE, night: true, to: 5 },
    { cite: '0x544810-0x544824: 3 stays with fewer than two', from: 3, w: HELD_SIDEARM, night: true, to: 3 },
    { cite: '0x544810-0x54482c: 4 -> 5 with two or more modes', from: 4, w: sniper, to: 5 },
    { cite: '0x544810-0x544824: 4 stays with fewer than two', from: 4, w: oneMode, to: 4 },
    // 5-11 (0x544830-0x54485c; D:L410817-410820): s + 1 while s - 3 < NumZoomModes.
    { cite: '0x544830-0x54485c: 5 -> 6 (5 - 3 < 3)', from: 5, w: sniper, to: 6 },
    { cite: '0x544830-0x544848: 6 stays (6 - 3 < 3 is false)', from: 6, w: sniper, to: 6 },
    { cite: '0x544830-0x544848: 5 stays with two modes (5 - 3 < 2 is false)', from: 5, w: HELD_RIFLE, to: 5 },
    { cite: '0x544830-0x54485c: 11 -> 12 (11 - 3 < 9)', from: 11, w: nineModes, to: 12 },
  ];
  it.each(rows)('$cite: $from -> $to', (r) => {
    expect(step(r, 'in')).toBe(r.to);
  });
});

describe('FUN_00544400, zoom out (d-pad Down; D:L410623, table 0x65c320)', () => {
  const rows: Row[] = [
    { cite: '0x65c320[0] = 0x544578: 0 stays', from: 0, w: HELD_RIFLE, to: 0 },
    { cite: '0x5444c0 (daddu s3,zero,zero): 1 -> 0', from: 1, w: HELD_RIFLE, to: 0 },
    { cite: '0x5444c8: 2 -> 0', from: 2, w: HELD_RIFLE, to: 0 },
    { cite: '0x5444d0 (li s3,1): 3 -> 1', from: 3, w: HELD_RIFLE, night: true, to: 1 },
    { cite: '0x5444d0: 3 -> 1, unscoped', from: 3, w: HELD_SIDEARM, night: true, to: 1 },
    { cite: '0x5444d8-0x5444e0 (jal FUN_005b9020; li s3,1): 4 -> 1', from: 4, w: oneMode, to: 1 },
    { cite: '0x544514-0x544540 (D:L410674-410682): 5 -> 1 on a day map', from: 5, w: HELD_RIFLE, to: 1 },
    { cite: '0x544518-0x54453c (+0x5dc): 5 -> 3 on a night map', from: 5, w: HELD_RIFLE, night: true, to: 3 },
    { cite: '0x544514/0x544530 (s2, s1): 5 -> 3 by a class flag on a day map', from: 5, w: HELD_RIFLE, flag: { primary: true, secondary: null }, to: 3 },
    { cite: '0x544558-0x544570 (D:L410684-410686): 6 -> 5 (6 - 5 < 3)', from: 6, w: sniper, to: 5 },
    { cite: '0x544558-0x544570: 12 -> 11 (12 - 5 < 9)', from: 12, w: nineModes, to: 11 },
    { cite: '0x544558-0x544560: 7 stays with two modes (7 - 5 < 2 is false)', from: 7, w: HELD_RIFLE, to: 7 },
  ];
  it.each(rows)('$cite: $from -> $to', (r) => {
    expect(step(r, 'out')).toBe(r.to);
  });
});

describe('FUN_005448a0, the set and the magnification +0x204 (D:L410929, table 0x65c3b0)', () => {
  const at = (w: WeaponRecord, ...path: number[]): Zoom => {
    const z = new Zoom(w);
    for (const s of path) z.set(s);
    return z;
  };

  it.each([
    { cite: 'D:L410963 (0x3f800000): 0 -> 1.0', w: HELD_RIFLE, path: [0], mag: 1.0 },
    { cite: 'D:L410971 (0x3f8147ae): 1 -> 1.01', w: HELD_RIFLE, path: [1], mag: 1.01 },
    { cite: 'D:L410971: 2 -> 1.01', w: HELD_RIFLE, path: [2], mag: 1.01 },
    { cite: 'D:L410978: 3 -> 1.01', w: HELD_RIFLE, path: [3], mag: 1.01 },
    { cite: 'D:L410986 (0x41100000): 4 -> 9.0', w: HELD_SIDEARM, path: [4], mag: 9.0 },
    { cite: 'D:L411005-411008 (FUN_003c5980, state - 4): 5 -> ZoomMode1', w: HELD_RIFLE, path: [5], mag: 3 },
    { cite: 'D:L411005-411008: 6 -> ZoomMode2', w: sniper, path: [5, 6], mag: 12 },
    { cite: 'D:L411005-411008: 12 -> ZoomMode8', w: nineModes, path: [12], mag: 9 },
  ])('$cite', ({ w, path, mag }) => {
    expect(at(w, ...path).target()).toBe(mag);
  });

  it('D:L411006: past the record\'s count +0x204 is not written -- the magnification before stays', () => {
    expect(at(HELD_RIFLE, 5, 6).target()).toBe(3);                    // 6 - 4 < 2 is false: the 3x of state 5 kept
    expect(at(HELD_RIFLE, 6).target()).toBe(1.0);                     // from third person: the 1.0 kept
    // The weapon is read only at the set: a record changed under a scope keeps the old +0x204 (FUN_005c4b10 sets nothing).
    const z = at(HELD_RIFLE, 5);
    z.setWeapon(DEFAULT_RIFLE);
    expect([z.state(), z.target()]).toEqual([5, 3]);
    z.set(1);
    z.set(5);
    expect(z.target()).toBe(2.5);                                     // the next set reads the M4A1's ZoomMode1
  });

  it('D:L410938: a set to the state it is in changes nothing -- +0x204 is not read again off a record changed since', () => {
    const z = at(HELD_RIFLE, 5);                                       // the SD's 3x
    z.setWeapon(DEFAULT_RIFLE);                                        // the M4A1 in the hand: ZoomMode1 2.5
    z.set(5);                                                          // the same state: no write
    expect([z.state(), z.target()]).toEqual([5, 3]);
  });

  it('FUN_001f0750 D:L52864-52873: the run is in or out by the state (+0x201 < +0x200), not by the magnification', () => {
    // The binoculars (4, 9x) to the SD's scope (5, 3x): the state goes up, so FUN_001f1610 runs at 3 x the new
    // target (D:L53289: 9 a second), though the magnification falls.
    const z = new Zoom(HELD_SIDEARM);
    z.set(1);
    z.set(4);
    z.settle();
    z.setWeapon(HELD_RIFLE);                                          // the binoculars stay through the switch
    expect(z.zoomIn()).toBe(5);
    z.update(0.1);
    expect(z.magnification()).toBeCloseTo(9 - 0.9, 9);
    // Down by the state (5 -> 1): at least 3 x the old target (D:L52895-52900), 9 a second from 3x.
    z.settle();
    z.zoomOut();
    z.update(0.1);
    expect(z.magnification()).toBeCloseTo(3 - 0.9, 9);
  });
});

describe('the other setters of +0x200', () => {
  it('FUN_005c5340 D:L479399-479406: a pull\'s second round while +0x200 > 4 sets 1 -- not in the binoculars (4)', () => {
    for (let s = 0; s <= 12; s++) {
      const a = new Accuracy(HELD_RIFLE);
      a.trigger();
      const first = a.round(s, 'stand');
      const second = a.round(s, 'stand');
      expect([s, first.dropZoom, second.dropZoom]).toEqual([s, false, s > 4]);
    }
  });

  it('FUN_005c4b10 D:L478813-478833: a switch drops only the night vision to 1, and only off a night mission', () => {
    const rows: { from: number; night: boolean; to: number }[] = [
      { from: 3, night: false, to: 1 }, { from: 3, night: true, to: 3 },
      { from: 1, night: false, to: 1 }, { from: 4, night: false, to: 4 }, { from: 5, night: false, to: 5 },
    ];
    for (const r of rows) {
      const z = new Zoom(HELD_RIFLE, r.night);
      z.set(r.from);
      z.setWeapon(DEFAULT_RIFLE);
      expect([r.from, r.night, z.state()]).toEqual([r.from, r.night, r.to]);
    }
  });

  it('FUN_00216770 D:L70387-70389: a launcher-round mode with +0x200 > 1 sets 1 (the night vision and the binoculars too)', () => {
    for (let s = 0; s <= 6; s++) {
      const z = new Zoom(sniper, s === 3);
      z.set(s);
      z.setHold('round');
      expect([s, z.state()]).toEqual([s, s > 1 ? 1 : s]);
    }
  });

  it('FUN_00599b60 -> FUN_00553ea0 D:L419886-419889: a spawn, a living body\'s at a round start too, re-inits the view: 0, 1.0', () => {
    // A classic round survived at the M40A1's 12x (state 6); a two-mode rifle picked for the next round (the path was the
    // ARMORY between rounds, retired by the owner's ruling of 2026-10-02, INT.R3: the re-init stands on the decomp); the
    // round's start respawns the living body (FUN_00223680 L75913-75931 -> FUN_00598b90 L455158 -> FUN_00599b60).
    const z = new Zoom(sniper);
    z.zoomIn();
    z.zoomIn();
    z.zoomIn();
    z.settle();
    expect([z.state(), z.target(), z.magnification()]).toEqual([6, 12, 12]);
    // The switch alone keeps state 6 and its 12x (FUN_005c4b10 drops only 3): a state the new rifle cannot reach.
    const switched = new Zoom(sniper);
    switched.set(5);
    switched.set(6);
    switched.setWeapon(DEFAULT_RIFLE);
    expect([switched.state(), switched.target()]).toEqual([6, 12]);
    // The spawn: the body's init writes +0x200 = 0, +0x201 = 0xff, +0x202 = 0, +0x204 = 1.0, and the round start's
    // banner (FUN_001fb420) resets the run (FUN_001f1880 D:L53345: the applied and the target 1.0) -- third person at once.
    z.respawn(DEFAULT_RIFLE);
    expect([z.state(), z.target(), z.magnification(), z.hudZoom()]).toEqual([0, 1.0, 1.0, 0]);
    expect([z.zoomIn(), z.zoomIn()]).toEqual([1, 5]);                 // the new rifle's own steps
    expect(z.target()).toBe(2.5);
  });

  it('FUN_00547af0 D:L413083-413095: death sets 0, and FUN_0029b2f0(1.0) (D:L413084) puts the camera at 1.0 at once', () => {
    let socket: WebSocketLike | null = null;
    const died: number[] = [];
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      setDead: () => undefined, mode: () => 'walk',
    } as unknown as WalkMode;
    const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      died: () => { died.push(1); },
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
    } as ServerEvent);
    server({ type: 'kill', killer: 2, victim: 3, weapon: null, how: 'weapon', clip: null } as ServerEvent);
    expect(died).toEqual([]);                                         // another's death: nothing
    server({ type: 'kill', killer: 2, victim: 1, weapon: null, how: 'weapon', clip: null } as ServerEvent);
    expect(died).toEqual([1]);                                        // the page's own: the view state to 0
    // What the page does with it (main.ts `died`): the zoom reset -- state 0 and the 1.0 on screen, no run.
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.zoomIn();
    z.settle();
    z.reset();
    expect([z.state(), z.magnification(), z.target()]).toEqual([0, 1.0, 1.0]);
  });
});

describe('LATER 97: the mounted zoom (research 84 X10, X11, Z2, Z3, Z11, O2, O3)', () => {
  const plain = { thermal: false }, thermal = { thermal: true };
  it('X10 (FUN_005463c0 D:L412247-412255): the mount takes every head view to 1, or 2 on a THERMAL turret; third person stays 0', () => {
    const got: string[] = [];
    for (const m of [plain, thermal]) {
      for (const from of [0, 1, 3, 4, 5, 6]) {
        const z = new Zoom(sniper);
        z.set(from);
        z.setMount(m);
        got.push(`${m.thermal ? 'T' : 'P'}${from}->${z.state()}`);
      }
    }
    expect(got).toEqual(['P0->0', 'P1->1', 'P3->1', 'P4->1', 'P5->1', 'P6->1', 'T0->0', 'T1->2', 'T3->2', 'T4->2', 'T5->2', 'T6->2']);
  });
  it('Z2, Z3, Z11 (0x544688-0x544784, D:L410807-410809), O2, O3 (0x5444c0, 0x5444c8): mounted, Up 0 -> 1 or 2 and holds; Down to 0 -- for every hold', () => {
    for (const hold of ['firearm', 'round', 'launcher', 'item'] as const) {
      for (const [m, top] of [[plain, 1], [thermal, 2]] as const) {
        const z = new Zoom(sniper);
        z.setMount(m);
        z.setHold(hold);
        const ups = [z.zoomIn(), z.zoomIn(), z.zoomIn()];
        expect([hold, m.thermal, ups, z.zoomOut(), z.zoomOut()]).toEqual([hold, m.thermal, [top, top, top], 0, 0]);
      }
    }
  });
  it('X11 (FUN_00545ee0 D:L412018-412019): the release takes 2 to 1 and leaves 0 and 1 -- no pre-mount view restored', () => {
    const at = (m: { thermal: boolean }, from: number, steps: ('in' | 'out')[]): number => {
      const z = new Zoom(sniper);
      z.set(from);
      z.setMount(m);
      for (const s of steps) if (s === 'in') z.zoomIn(); else z.zoomOut();
      z.setMount(null);
      return z.state();
    };
    expect([at(thermal, 6, []), at(thermal, 0, ['in']), at(thermal, 6, ['out']), at(plain, 6, []), at(plain, 0, [])]).toEqual([1, 1, 0, 1, 0]);
    const z = new Zoom(sniper);
    z.setMount(plain);
    z.setMount(null);
    expect([z.zoomIn(), z.zoomIn()], 'on foot again, the rifle steps past first person').toEqual([1, 5]);
  });
});

describe('the first-person bob (FUN_005966a0 D:L453823-453849, BOBBING_FIRSTPERSON; research 83 §6)', () => {
  const TICK = 1 / 60;

  it('runs in view states 1-3 only (D:L453829: +0x200 - 1 < 2 || +0x200 == 3)', () => {
    expect([...Array(13).keys()].filter(eyeBob)).toEqual([1, 2, 3]);
  });

  it('walking: Walk_Amplitude 6 x cos(phase) PS2 px, the phase at Walk_Rate 15 rad/s x the push (D:L453844-453845: DAT_0044d4e8 / DAT_0044d4f0)', () => {
    expect([SEAL_TUNING.bobbing.walkAmplitude, SEAL_TUNING.bobbing.walkRate]).toEqual([6, 15]);
    const bob = new ViewBob();
    const out: number[] = [];
    for (let i = 0; i < 4; i++) out.push(bob.step(TICK, 0, 1, false));
    out.forEach((v, i) => expect(v).toBeCloseTo(6 * Math.cos(15 * TICK * i), 12));
    const half = new ViewBob();
    half.step(TICK, 0, 0.5, false);
    expect(half.step(TICK, 0, 0.5, false)).toBeCloseTo(6 * Math.cos(15 * 0.5 * TICK), 12);   // the push scales the rate
  });

  it('prone: Crawl_Amplitude 4, Crawl_Rate 8 (the [stance == 2] entries, DAT_0044d4ec / DAT_0044d4f4)', () => {
    expect([SEAL_TUNING.bobbing.crawlAmplitude, SEAL_TUNING.bobbing.crawlRate]).toEqual([4, 8]);
    const bob = new ViewBob();
    const out: number[] = [];
    for (let i = 0; i < 4; i++) out.push(bob.step(TICK, 0, 1, true));
    out.forEach((v, i) => expect(v).toBeCloseTo(4 * Math.cos(8 * TICK * i), 12));
  });

  it('two axes: the mean of their sizes (D:L453839-453842); still: 0 at once, the phase kept; it wraps past 2 pi (D:L453846)', () => {
    const bob = new ViewBob();
    bob.step(TICK, 0.5, -1, false);
    expect(bob.step(TICK, 0, 0, false)).toBe(0);
    expect(bob.step(TICK, 0, 1, false)).toBeCloseTo(6 * Math.cos(15 * 0.75 * TICK), 12);
    // D:L453846-453847: past 2 pi the phase loses 2 pi -- held on the phase itself (cos alone cannot see a wrap).
    const wrap = new ViewBob();
    const phase = (): number => (wrap as unknown as { phase: number }).phase;
    for (let i = 0; i < 61; i++) {
      wrap.step(TICK, 0, 1, false);
      expect(phase()).toBeLessThanOrEqual(2 * Math.PI);
    }
    expect(phase()).toBeCloseTo(61 * 15 * TICK - 4 * Math.PI, 9);   // 15.25 rad: two wraps
  });
});
