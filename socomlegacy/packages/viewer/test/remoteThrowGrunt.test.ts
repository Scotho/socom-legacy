// test/remoteThrowGrunt.test.ts -- NU-7 G1 (research 325 §1.4, §4 G1; REMOTE_THROW_GRUNT_READING): another player's
// standing throw heard on this page from its body's own clip. The original's copy plays the throw clip from the Push
// Blend (`network_log`, research 230 §5.2.11; D:L445755-445756) and its body update runs the callback driver with no
// controller test (`FUN_00550ef0` -> `FUN_0057a330` D:L418454 -> `FUN_0028c9e0` D:L439009, D:L134377-134450), so its
// `throw_whoosh` (`.MALE_GRUNT`) sounds at the clip's 0.45 on the copy's own phase. The real `RemotePlayers` runs with
// the real `ThrowPose` on the disc's throw clips (`MOTION_P.ZAR`, `motion.rdr` in `READERC.ZAR`) under the match's sound
// (`./matchSound` `mountSound`, `others` the bodies, as both pages mount it); only the body's view and its `Play` are
// stand-ins, as in `remoteLauncher.test.ts`, and the audio's `onAnimCallback` records what is asked.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene } from 'three';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GameAudio } from '../src/audio';
import type { LoadedMap } from '../src/loadMap';
import { DEFAULT_LIGHTING } from '../src/lighting';
import { mountSound, silentOut } from '../src/matchSound';
import { clipsFromPack, motionTableFromArchive } from '../src/motionTable';
import { HOLD_CLIPS, HOLD_SECONDS, type HoldClip } from '../src/mover';
import { BodyFlag, bodyHoldBits, type BodyState } from '../src/net/protocol';
import type { PlayClips } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { THROW_CLIPS } from '../src/throwPose';

const READERC = fixture('RUN/READERC.ZAR');
const MOTION = fixture('RUN/MOTION_P.ZAR');
const haveClips = READERC !== null && MOTION !== null;

/** The disc's throw clips and their callbacks, handed to each body's `ThrowPose` through its `Play.motionSource`. */
const clipSource = vi.hoisted(() => ({ src: null as unknown }));
vi.mock('../src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = new G();
  hand = new G();
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed() {}
  stopVictory() {}
  setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {} setAnimSet() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} onEvent() {} frame() {}
  motionSource() { return clipSource.src; }
} }; });

const DT = 1 / 60;
const FEET: [number, number, number] = [100, 0, 200];

/** Another player's body, standing still at `FEET`, carrying `hold` (the mover's hold on the wire, `BODY_HOLD_SHIFT`). */
function body(o: { hold?: HoldClip | null; serial?: 0 | 1; alive?: boolean; pistol?: boolean } = {}): BodyState {
  return {
    id: 2, feet: [...FEET], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
    flags: (o.alive === false ? 0 : BodyFlag.Alive) | bodyHoldBits(o.hold ?? null) | (o.hold && o.serial ? BodyFlag.HoldSerial : 0),
    stance: 0, landing: 0, jumps: 0, ground: 0, groundForward: 0, groundRight: 0, groundCls: -1, stickSnaps: 0,
    action: 0, actionSerial: 0, actionT: 0, actionSeconds: 0, overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
    trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: 255, slot: o.pistol ? 1 : 0,
  };
}

/** The page: the bodies (`RemotePlayers`) and the match's sound over them, a frame each as both pages run them. */
function page() {
  const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
  remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, null);
  remote.setClips({ clips: [], table: null } as unknown as PlayClips);
  const audio = new GameAudio(silentOut(), () => 0.5, { inline: false });
  let t = 0;
  const heard: { name: string; at: unknown; t: number }[] = [];
  vi.spyOn(audio, 'onAnimCallback').mockImplementation((name: string, at?: unknown) => { heard.push({ name, at, t }); return null; });
  const sound = mountSound({
    audio, side: () => 'seal', others: () => remote,
    walk: { mode: () => 'walk' as const, drawnFeet: (): [number, number, number] => [0, 0, 0], posture: () => 'stand' as const, grid: () => null },
    fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) },
    loadouts: { type: () => 1 },
  });
  const listener = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, position: { x: 0, y: 0, z: 0 } };
  /** One page frame: `NetPage.frame`'s bodies, then the sound's (main.ts and matchMount.ts call them in this order). */
  const frame = (b: BodyState): void => { t += DT; remote.frame(DT, [b], camera); sound.frame(listener); };
  /** `n` frames of the body `o`. */
  const run = (n: number, o: Parameters<typeof body>[0] = {}): void => { for (let i = 0; i < n; i++) frame(body(o)); };
  const grunts = () => heard.filter((h) => h.name === 'throw_whoosh');
  return { run, frame, heard, grunts, now: () => t };
}

/** The frames a hold rides the body: its clip's run to its last key (`HOLD_SECONDS`), as the room's mover holds it. */
const holdFrames = (hold: HoldClip): number => Math.ceil(HOLD_SECONDS[hold] / DT);

/**
 * The grunt's time into the clip: `throw_whoosh` at phase 0.45 (`motion.rdr`), the one-shot's clock
 * `phase = elapsed / (playback (n - 1) / n)` (`./throwPose`, `FUN_0028c4f0`); the standing throw's 1.6 and 28 keys
 * (`HOLD_CLIPS`, whose header has the pistol's version share them) -- 0.69 s (research 251 §12.7).
 */
const GRUNT_S = 0.45 * HOLD_CLIPS.seal_throwgrenade.playback * (27 / 28);

describe.skipIf(!haveClips)(`NU-7 G1: another's standing throw is heard from its body's clip, once, at 0.45${haveClips ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  beforeAll(() => {
    clipSource.src = { clips: new Map(clipsFromPack(MOTION!, THROW_CLIPS).map((c) => [c.name, c])), table: motionTableFromArchive(READERC!)! };
  });

  for (const pistol of [false, true]) {
    it(`the standing throw${pistol ? ', the pistol in the hand (seal_p_throwgrenade)' : ' (seal_throwgrenade)'}: throw_whoosh once, at the clip's 0.45, at the body's drawn feet`, () => {
      const p = page();
      p.run(10, { pistol });                                        // the body drawn before its throw
      const start = p.now();
      p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', pistol });
      p.run(60, { pistol });
      const g = p.grunts();
      expect(g).toHaveLength(1);
      expect(g[0]!.at).toEqual(FEET);
      const into = g[0]!.t - start;                                 // the hold's first frame steps the clip by one frame
      expect(into).toBeGreaterThanOrEqual(GRUNT_S - 1e-9);
      expect(into - DT).toBeLessThan(GRUNT_S);
      expect(p.heard.map((h) => h.name)).toEqual(['throw_whoosh']); // nothing else asked: no pin, no hold sound
    });
  }

  it('two standing throws back to back (the hold\'s parity flipped, no frame between): one grunt each', () => {
    const p = page();
    p.run(10);
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', serial: 0 });
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', serial: 1 });
    p.run(30);
    expect(p.grunts()).toHaveLength(2);
  });

  const SILENT: { name: string; hold: HoldClip; pistol?: boolean }[] = [
    { name: 'the standing toss', hold: 'seal_tossgrenade' },
    { name: 'the pistol\'s toss', hold: 'seal_p_tossgrenade', pistol: true },
    { name: 'the crouched throw', hold: 'seal_crouch_throwgrenade' },
    { name: 'the prone throw', hold: 'seal_prone_throwgrenade' },
    { name: 'the prone toss', hold: 'seal_prone_tossgrenade' },
    { name: 'the toss from the right peek', hold: 'seal_toss_rlean' },
    { name: 'the toss from the left peek', hold: 'seal_toss_llean' },
    { name: 'the claymore\'s placing', hold: 'seal_place_claymore' },
  ];
  for (const s of SILENT) {
    it(`${s.name} (${s.hold}): none -- its clip carries no callback`, () => {
      const p = page();
      p.run(10, { pistol: s.pistol });
      p.run(holdFrames(s.hold), { hold: s.hold, pistol: s.pistol });
      p.run(60, { pistol: s.pistol });
      expect(p.heard).toEqual([]);
    });
  }

  it('a standing throw knocked off before 0.45 (its hold gone at 0.3 s): none', () => {
    const p = page();
    p.run(10);
    p.run(18, { hold: 'seal_throwgrenade' });
    p.run(60);
    expect(p.grunts()).toEqual([]);
  });

  it("a joiner's catch-up -- the body first drawn already carrying the throw's hold: none; its next throw is heard", () => {
    const p = page();
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade' });   // the first frame this page draws the body
    p.run(30);
    expect(p.grunts()).toEqual([]);
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', serial: 1 });
    p.run(30);
    expect(p.grunts()).toHaveLength(1);
  });

  it("a joiner's catch-up followed by the next throw with no frame between (the parity flipped): that one heard", () => {
    const p = page();
    p.run(5, { hold: 'seal_throwgrenade', serial: 0 });
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', serial: 1 });
    p.run(30);
    expect(p.grunts()).toHaveLength(1);
  });

  it('a dead body: none -- dead before the grunt with the hold still on, or dead throughout', () => {
    const p = page();
    p.run(10);
    p.run(18, { hold: 'seal_throwgrenade' });
    p.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', alive: false });
    p.run(30, { alive: false });
    expect(p.grunts()).toEqual([]);
    const q = page();
    q.run(10, { alive: false });
    q.run(holdFrames('seal_throwgrenade'), { hold: 'seal_throwgrenade', serial: 1, alive: false });
    expect(q.grunts()).toEqual([]);
  });
});
