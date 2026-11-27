// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { FlyCamera } from '../src/camera';
import { PlayerLoadout } from '../src/loadout';
import { EXPLOSION_SHAKES, ScreenShake, type Shake } from '../src/look';
import { blastShakeFor, mountThrowables, type MatchThrowDeps } from '../src/matchThrow';
import { Play } from '../src/play';
import { WalkMode, type PlaySnapshot } from '../src/walk';

/**
 * R4P-220 DEAD-CAMERA-SHAKE (docs/atlas/readings/r4p-phase2-reads-216-220-227.md, "R4P-220"; simulation track, reading,
 * pending review): r0004's body tick `FUN_00556050` adds the local body's alive bit (`+0xe1` bit 0x10) to the blast
 * shake's test (D4:L456790-456802) -- r0001's `FUN_00550ef0` had none (D:L418097-418109, before the dead return at
 * D:L418112). So a blast by a DEAD local player's body shakes nothing. Both of the page's doors -- a grenade's `explode`
 * and a script round's blast point (`hands.blast`) -- take the test, through the real `WalkMode.setDead` and `FlyCamera`.
 *
 * The Player View (`./povCamera`, drawn by `./matchNet` `spectatePov`; product track, a browser adaptation with no
 * original): the owner's criterion (verbatim, the reading) -- "INCLUDE, but make exceptions for the "Player View" mode
 * that we've added, which should receive all of the same player events that a living player does necessary to drive the
 * parallel view." -- POV_SHAKE_ADAPTATION: the watched body's distance to the blast starts the view's own shake, whatever
 * the watcher's own state; a watched body that is dead is not drawn (`povFrame`), so it has no feet to shake by.
 */

afterEach(() => { vi.restoreAllMocks(); });

type Vec3 = [number, number, number];

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
}

/** The throwables' part on the real walk and fly camera, the SEAL's feet stubbed (`WalkMode.snapshot` needs a map). */
function page() {
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  let feet: Vec3 | null = [0, 0, 0];
  vi.spyOn(walk, 'snapshot').mockImplementation(() => (feet ? { feet: [...feet] } as unknown as PlaySnapshot : null));
  const own: Shake[] = [];
  const watched: Shake[] = [];
  vi.spyOn(fly, 'shakeScreen').mockImplementation((s) => { own.push(s); });
  // Assigned, not spied: the view's door is the camera's own (`FlyCamera.shakeSubject`, its own case below).
  (fly as unknown as { shakeSubject(s: Shake): void }).shakeSubject = (s) => { watched.push(s); };
  const t = mountThrowables({
    scene: new Scene(), walk, fly, play: new Play(), loadouts: new PlayerLoadout(), view: () => null, map: () => null,
    net: () => null, firearm: () => ({}) as never,
    audio: { onAnimCallback: () => null, onFire: () => null, play: () => {} } as unknown as MatchThrowDeps['audio'],
  });
  const g = t.grenade as unknown as { emit(k: string, i: unknown): void };
  /** A frag going off at `pos`, `distance` from the SEAL's feet (`GrenadeThrower`'s `distanceToPlayer`). */
  const frag = (pos: Vec3, distance: number | null): void => g.emit('explode', {
    pos, radius: 0, anim: 'x', baseAnim: 'x', material: null, distanceToPlayer: distance, damageToPlayer: 0, item: 'M67',
    detonation: null, flash: null, byEffects: true,
  });
  const blast = (at: Vec3): void => { t.hands().blast!(at); };
  return { fly, walk, own, watched, frag, blast, setFeet: (f: Vec3 | null) => { feet = f; }, dispose: () => { t.dispose(); } };
}

describe('R4P-220: r0004 shakes only a living local body (FUN_00556050 D4:L456790-456802)', () => {
  it('blastShakeFor: dead, none; alive, explosionShake by the bands (100 / 200 / 600, strict)', () => {
    expect(blastShakeFor(50, false)).toBeNull();
    expect(blastShakeFor(50, true)).toEqual(EXPLOSION_SHAKES[2]);
    expect(blastShakeFor(150, true)).toEqual(EXPLOSION_SHAKES[1]);
    expect(blastShakeFor(599.9, true)).toEqual(EXPLOSION_SHAKES[0]);
    expect(blastShakeFor(600, true)).toBeNull();
    expect(blastShakeFor(null, true)).toBeNull();
  });

  it("a frag 50 u from the page's feet: alive, the big preset; dead (WalkMode.setDead), no shake at all", () => {
    const p = page();
    p.frag([50, 0, 0], 50);
    expect(p.own).toEqual([EXPLOSION_SHAKES[2]]);
    p.walk.setDead(true);
    p.frag([50, 0, 0], 50);
    expect(p.own).toEqual([EXPLOSION_SHAKES[2]]);                     // the corpse's camera: nothing
    p.walk.setDead(false);
    p.frag([50, 0, 0], 50);
    expect(p.own).toHaveLength(2);                                    // alive again (a respawn): it shakes
    p.dispose();
  });

  it("a script round's blast point 50 u from the page's feet (hands.blast): alive, the big preset; dead, none", () => {
    const p = page();
    p.blast([50, 0, 0]);
    expect(p.own).toEqual([EXPLOSION_SHAKES[2]]);
    p.walk.setDead(true);
    p.blast([50, 0, 0]);
    expect(p.own).toEqual([EXPLOSION_SHAKES[2]]);
    p.dispose();
  });
});

describe('R4P-220, the Player View (POV_SHAKE_ADAPTATION, the owner\'s criterion): the watched body\'s shake', () => {
  it('a dead watcher in the view: a frag 50 u from the WATCHED body shakes the view, never his own camera', () => {
    const p = page();
    p.walk.setDead(true);
    p.fly.setSubjectFeet([1000, 0, 0]);                               // drawn on a living teammate (`spectatePov`)
    p.frag([1050, 0, 0], 1050);
    expect(p.watched).toEqual([EXPLOSION_SHAKES[2]]);
    p.frag([1150, 0, 0], 1150);
    expect(p.watched).toEqual([EXPLOSION_SHAKES[2], EXPLOSION_SHAKES[1]]);
    p.blast([1000, 0, 50]);
    expect(p.watched).toHaveLength(3);
    expect(p.own).toEqual([]);
    p.fly.setSubjectFeet(null);                                       // not drawn (the follow; the teammate dead)
    p.frag([1050, 0, 0], 1050);
    p.blast([1000, 0, 50]);
    expect(p.watched).toHaveLength(3);
    p.dispose();
  });
});

describe('R4P-220: FlyCamera carries the Player View\'s own shake (shakeSubject), stepped on its frames', () => {
  it('not walking, a subject drawn: the screen offset swings as a living page\'s ScreenShake, on top of the subject\'s offset', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.setAspect(4 / 3);
    const ref = new ScreenShake();
    fly.setSubjectFeet([0, 0, 0]);
    fly.setSubjectOffset(3, 2);
    fly.shakeSubject(EXPLOSION_SHAKES[2]!);
    ref.start(EXPLOSION_SHAKES[2]!);
    for (let k = 0; k < 20; k++) {
      fly.update(1 / 60);
      const [x, y] = ref.step(1 / 60);
      const s = fly.lookState().screen;
      expect(s[0]).toBeCloseTo(3 + x, 9);
      expect(s[1]).toBeCloseTo(2 + y, 9);
    }
    expect(ref.amplitude()[0]).toBeGreaterThan(0);                   // still swinging: a real comparison
  });

  it('no subject drawn, or walking: shakeSubject does nothing; leaving the view settles it', () => {
    const fly = new FlyCamera(canvas());
    fly.setPose({ yaw: 0, pitch: 0 });
    fly.shakeSubject(EXPLOSION_SHAKES[2]!);
    fly.update(1 / 60);
    expect(fly.lookState().screen).toEqual([0, 0]);
    fly.setSubjectFeet([0, 0, 0]);
    fly.shakeSubject(EXPLOSION_SHAKES[2]!);
    fly.update(1 / 60);
    expect(fly.lookState().screen).not.toEqual([0, 0]);
    fly.setSubjectFeet(null);
    expect(fly.lookState().screen).toEqual([0, 0]);
    fly.update(1 / 60);
    expect(fly.lookState().screen).toEqual([0, 0]);
    const walking = new FlyCamera(canvas());
    walking.setPose({ yaw: 0, pitch: 0 });
    walking.setWalking(true);
    walking.setSubjectFeet([0, 0, 0]);
    walking.shakeSubject(EXPLOSION_SHAKES[2]!);
    walking.update(1 / 60);
    expect(walking.lookState().screen).toEqual([0, 0]);
    expect(walking.subjectFeet()).toBeNull();
  });
});
