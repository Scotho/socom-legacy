// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { motionTableFromArchive } from '../src/motionTable';
import { mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { PlayerLoadout } from '../src/loadout';
import type { HoldClip, PlaySnapshot } from '../src/mover';

/**
 * NU-8a T1 (research 326 §6 T1; pins -- they pass on the code as it stood, nothing changes): the rest of the throw's
 * sequence as research 326 §1.4 and §3 read it.
 *
 * - Every throw and placing clip, on `motion.rdr` (`golden/motion-rdr.json`, the table `motionTableFromArchive` reads
 *   out of `RUN/READERC.ZAR`; research 77 §7): one-shots (looped 0), `NoPitchtwist`, with §1.4's `NoInterrupt`,
 *   `BlendTime` (none: the loader's 0.4, but the crouched throw's 0.2) and playback, the standing throws' grunt at 0.45.
 *   `FUN_00588bc0` links a non-`BlendOverlay` entry on the stack (D:L446083-446086, D:L446292): the golden does not carry
 *   that flag, so the fixture half re-reads it from the tracked `READERC.ZAR` (skipped without it, a skip said).
 * - The take-up, the pin and the wind-up play nothing (326 §1.1-§1.3: `FUN_005a64c0`'s class-3 branch pushes no play,
 *   D:L461887-461920; no pin; the wind-up writes the power alone, D:L453509-453517): the page's part starts no clip and
 *   lays no hold between `equip` and `throwStart`.
 */

const here = dirname(fileURLToPath(import.meta.url));
type Row = [string, boolean | null, number | null, number | null, number | null, number | null, number | null, number | null, boolean, boolean, string];
const pin = JSON.parse(readFileSync(resolve(here, 'golden/motion-rdr.json'), 'utf8')) as { entries: Row[] };
const rows = new Map(pin.entries.map((r) => [r[0], r] as const));

/** 326 §1.4's table and §3's placings: clip, playback, `NoInterrupt`, `BlendTime` (null: none, the loader's 0.4), callback. */
const CLIPS: readonly [string, number, number, number | null, string][] = [
  ['seal_throwgrenade', 1.6, 0.49, null, 'throw_whoosh@0.45'],
  ['seal_tossgrenade', 1.6, 0.75, null, ''],
  ['seal_crouch_throwgrenade', 1.1, 0.8, 0.2, ''],
  ['seal_prone_throwgrenade', 1.6, 0.9, null, ''],
  ['seal_prone_tossgrenade', 1.1, 0.9, null, ''],
  ['seal_toss_rlean', 1.25, 0.9, null, ''],
  ['seal_toss_llean', 1.2, 0.9, null, ''],
  ['seal_p_throwgrenade', 1.6, 0.49, null, 'throw_whoosh@0.45'],
  ['seal_p_tossgrenade', 2, 0.8, null, ''],
  ['seal_p_toss_rlean', 1.25, 0.9, null, ''],
  ['seal_p_toss_llean', 1.2, 0.9, null, ''],
  ['seal_place_claymore', 2.7, 0.9, null, ''],
  ['seal_p_place_claymore', 2.7, 0.9, null, ''],
  ['seal_put_onwall', 2.5, 1, null, ''],
  ['seal_p_put_onwall', 2.5, 1, null, ''],
];

describe('NU-8a T1: the throw and placing clips on motion.rdr (research 326 §1.4, §3; pins)', () => {
  it('the golden: every throw and placing clip a one-shot, NoPitchtwist, with 326 §1.4 and §3\'s NoInterrupt, BlendTime, playback and callback', () => {
    expect(CLIPS).toHaveLength(15);                                      // the eleven throw clips, the four placings
    for (const [clip, playback, noInterrupt, blendTime, callback] of CLIPS) {
      const r = rows.get(clip);
      expect(r, clip).toBeDefined();
      expect([r![1], r![2], r![7], r![4], r![9], r![10]], clip).toEqual([false, playback, noInterrupt, blendTime, true, callback]);
    }
  });

  const READERC = fixture('RUN/READERC.ZAR');
  it.skipIf(!READERC)(`the disc: none of them is BlendOverlay, each a one-shot NoPitchtwist on the stack${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const table = motionTableFromArchive(READERC!)!;
    for (const [clip, playback, noInterrupt, blendTime] of CLIPS) {
      const m = table.get(clip);
      expect(m, clip).toBeDefined();
      expect([m!.blendOverlay ?? false, m!.looped, m!.noPitchtwist, m!.playback, m!.noInterrupt, m!.blendTime ?? null], clip)
        .toEqual([false, false, true, playback, noInterrupt, blendTime]);
    }
  });
});

describe("NU-8a T1: the page plays no clip between the take-up and the throw's start (research 326 §1.1-§1.3; a pin)", () => {
  it('equip, the wind-up held a second: no clip started and no hold laid; the release: the one clip and its hold, at throwStart', () => {
    const s = {
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null,
      jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: 0 }, action: null, turnRate: 0,
    } as PlaySnapshot;
    const holds: HoldClip[] = [];
    const walk = {
      grid: () => null, gridOfGround: () => null, snapshot: () => s, view: () => 'third', fireAim: () => null, feet: () => s.feet,
      drawnFeet: () => s.feet, hold: (clip: HoldClip) => { holds.push(clip); s.hold = clip; s.holdSerial = holds.length; return true; },
      mode: () => 'walk', isDead: () => false, fireAllowed: () => true, swapGate: () => true, onActionEnd: () => () => {},
      launcherRaised: () => {}, launcherLowered: () => {}, launcherCleared: () => {}, onLauncherStickLower: () => () => {},
    };
    const firearm = {
      shotRumble: () => {},                              // CTL-2: the hands' fire step's motors
      fire: { release: () => {}, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0, reloading: false }) },
      zoom: { state: () => 1 }, kit: { swapping: () => false, item: () => 'rifle', state: () => ({ swap: null }) },
      setZoom: () => {}, showFireMode: () => {}, item: () => 'rifle', record: () => ({ name: 'M4A1' }), records: () => [{}, {}],
      icon: () => 'm4.tif', selectFirearm: () => true, shoulderGate: () => true, kitFree: () => true,
    };
    const play = {
      partPoint: () => null, heldNode: () => null, itemNode: () => null, launcherNode: () => null, motionSource: () => null,
      setRifleStowed: () => {}, addPoseLayer: () => {},
    };
    const deps: MatchThrowDeps = {
      scene: new Scene(), walk: walk as never, fly: { shakeScreen: () => {} }, play: play as never, loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, net: () => null, firearm: () => firearm as never,
      audio: { onAnimCallback: () => null, play: () => {} } as never,
    };
    const t = mountThrowables(deps);
    const start = vi.spyOn(t.throwPose, 'start');
    const events: string[] = [];
    t.grenade.on('equip', (on) => events.push(`equip ${on}`));
    t.grenade.on('throwStart', ({ anim }) => events.push(`throwStart ${anim.clip}`));
    const frame = (): void => { t.frame(1 / 60); t.poseFrame(1 / 60); };
    expect(t.grenade.select('M67')).toBe(true);                         // the take-up
    for (let i = 0; i < 20; i++) frame();
    expect(t.hands().trigger(true)).toBe(true);                          // the press: the wind-up (the pin is none)
    expect(t.grenade.phase()).toBe('holding');
    for (let i = 0; i < 60; i++) frame();
    expect(events).toEqual(['equip true']);
    expect(start).not.toHaveBeenCalled();
    expect(holds).toEqual([]);
    t.hands().trigger(false);                                            // the release
    frame();
    expect(events).toEqual(['equip true', 'throwStart seal_throwgrenade']);
    expect(start).toHaveBeenCalledTimes(1);
    expect(holds).toEqual(['seal_throwgrenade']);
  });
});
