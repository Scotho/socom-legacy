import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { partMatrix, type MotionClip, type MotionPart } from '@s2u/scene';
import type { BodyView } from '../src/bodyView';
import type { LoadedBody } from '../src/body';
import { Play } from '../src/play';
import type { PlaySnapshot } from '../src/mover';
import { REMOTE_RELOAD_MOTION_READING } from '../src/netPage';

/**
 * REMOTE-RELOAD (`REMOTE_RELOAD_MOTION_READING`, research 91 section 22.2): another body's reload, heard from the room's
 * `reloadSound` at the take, starts that body's reload clip on its play (`Play.remoteReload`) -- the clip
 * `FUN_005c2a90` starts with the magazine (`FUN_005a82e0`, D:L477479) in the step that plays the `ReloadSound`
 * (D:L477484): the still clip of the room's posture, or the family's moving overlay when the body moved at the take;
 * the stick's cut on the copy's replicated stick (`Play.frame`'s `reloadCut`, `FUN_00550ef0` D:L418182-418185) ends a
 * still one (the rifle's carried on as the overlay, the prone one gone); a death ends any (the body is gone),
 * a flinch only a crouched or prone still clip -- as the page's own: its flinch ends the still reload's hold (`./fire`
 * `reloadEndOfBody`, family 'reload'), which `WalkMode.holdReload` makes crouched or prone only (the review's F1).
 */

const still = (name: string, frames: number): MotionClip => ({
  name, version: 5, duration: frames / 30, frameCount: frames, rate: 30, unknown10: -1, unknown14: 1,
  parts: [{ index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, 11, 0), rotations: Float32Array.of(0, 0, 0, 1) }] as MotionPart[],
});
const CLIPS = {
  clips: [
    still('seal_stand', 10), still('seal_crouch', 10), still('seal_prone', 10),
    still('seal_reload', 48), still('seal_crouch_reload', 57), still('seal_prone_reload', 51), still('seal_mv_reload', 36),
    still('seal_reload_shotgun', 48),
  ],
  table: null,
};
const BODY = {
  character: null, model: 'test', dressedBy: 'test', subMeshes: [], fittings: [], missing: [], at: null, height: 20, eye: null,
  parts: [
    { name: 'skel_root', parent: -1, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [0, 11, 0])), bbox: [] },
    { name: 'rhand', parent: 0, bindLocal: Array.from(partMatrix([0, 0, 0, 1], [2, 4, 0])), bbox: [] },
  ],
} as unknown as LoadedBody;
const STAND = {
  feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null, turnRate: 0,
  cutStick: { forward: 0, right: 0 },
} as unknown as PlaySnapshot;
const DT = 1 / 60;

/** A copy's play over a synthetic body and a stand-in walk carrying its replicated snapshot. */
const rig = (snap: PlaySnapshot = STAND) => {
  const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
  const play = new Play();
  play.setBody(view as unknown as BodyView, BODY);
  play.setClips(CLIPS);
  const life = { snap };
  const walk = { snapshot: () => life.snap, view: () => 'third' as const, isDead: () => false };
  const camera = new PerspectiveCamera();
  const frame = (): void => play.frame(DT, walk, camera);
  const reload = (): string | null => play.weaponStats().pose?.reload ?? null;
  frame();
  return { play, life, frame, reload };
};

describe('REMOTE-RELOAD: another body\'s reload heard starts its play\'s reload clip (Play.remoteReload)', () => {
  it('the reading names the room event at the take', () => {
    expect(REMOTE_RELOAD_MOTION_READING).toBe('room event at the take');
  });

  for (const [posture, clip] of [['stand', 'seal_reload'], ['crouch', 'seal_crouch_reload'], ['prone', 'seal_prone_reload']] as const) {
    it(`still, ${posture}: the posture's still clip`, () => {
      const { play, frame, reload } = rig({ ...STAND, stance: posture } as PlaySnapshot);
      expect(reload()).toBeNull();
      play.remoteReload(posture, 1.6, 'rifle', false);
      frame();
      expect(reload()).toBe(clip);
      expect(play.weaponStats().pose?.reloadOverlay).toBe(false);
    });
  }

  it('moving at the take: the family\'s moving overlay (seal_mv_reload)', () => {
    const { play, frame, reload } = rig();
    play.remoteReload('stand', 1.2, 'rifle', true);
    frame();
    expect(reload()).toBe('seal_mv_reload');
    expect(play.weaponStats().pose?.reloadOverlay).toBe(true);
  });

  it('the room\'s family picks the clip (the shotgun\'s still clip)', () => {
    const { play, frame, reload } = rig();
    play.remoteReload('stand', 1.6, 'shotgun', false);
    frame();
    expect(reload()).toBe('seal_reload_shotgun');
  });

  it('no posture from the room: the play\'s own stance', () => {
    const { play, frame, reload } = rig({ ...STAND, stance: 'crouch' } as PlaySnapshot);
    frame();
    play.remoteReload(null, 1.9, 'rifle', false);
    frame();
    expect(reload()).toBe('seal_crouch_reload');
  });

  it('runs out by itself on its clock', () => {
    const { play, frame, reload } = rig();
    play.remoteReload('stand', 1.6, 'rifle', false);
    for (let i = 0; i < 30; i++) frame();
    expect(reload()).toBe('seal_reload');
    for (let i = 0; i < 120; i++) frame();
    expect(reload()).toBeNull();
  });

  it('the stick\'s cut on the replicated stick ends a still one: prone gone, standing carried on as the overlay', () => {
    const prone = rig({ ...STAND, stance: 'prone' } as PlaySnapshot);
    prone.play.remoteReload('prone', 1.7, 'rifle', false);
    for (let i = 0; i < 10; i++) prone.frame();
    expect(prone.reload()).toBe('seal_prone_reload');
    prone.life.snap = { ...prone.life.snap, cutStick: { forward: 1, right: 0 } } as PlaySnapshot;
    for (let i = 0; i < 3; i++) prone.frame();
    expect(prone.reload()).toBeNull();

    const stand = rig();
    stand.play.remoteReload('stand', 1.6, 'rifle', false);
    for (let i = 0; i < 10; i++) stand.frame();
    stand.life.snap = { ...STAND, cutStick: { forward: 1, right: 0 } } as PlaySnapshot;
    for (let i = 0; i < 3; i++) stand.frame();
    expect(stand.reload()).toBe('seal_mv_reload');
    expect(stand.play.weaponStats().pose?.reloadOverlay).toBe(true);
  });

  it("a death pops any reload clip (stopRemoteReload('death'): the body is gone)", () => {
    for (const [posture, moving] of [['stand', false], ['stand', true], ['crouch', false]] as const) {
      const { play, frame, reload } = rig({ ...STAND, stance: posture } as PlaySnapshot);
      play.remoteReload(posture, 1.6, 'rifle', moving);
      frame();
      expect(reload()).not.toBeNull();
      play.stopRemoteReload('death');
      frame();
      expect(reload()).toBeNull();
    }
  });

  // The review's F1: the page's own flinch ends only the still reload's hold (`./fire` `reloadEndOfBody`, family
  // 'reload'), which `WalkMode.holdReload` makes crouched or prone only (`reloadHold`); the room keeps the lock.
  it("a flinch pops only a crouched or prone still clip, as the page's own; a standing still clip and the moving overlay play on", () => {
    for (const [posture, moving, popped] of [['crouch', false, true], ['prone', false, true], ['stand', false, false], ['stand', true, false], ['crouch', true, false]] as const) {
      const { play, frame, reload } = rig({ ...STAND, stance: posture } as PlaySnapshot);
      play.remoteReload(posture, 1.6, 'rifle', moving);
      frame();
      const clip = reload();
      expect(clip).not.toBeNull();
      play.stopRemoteReload('flinch');
      frame();
      expect(reload(), `${posture}${moving ? ' moving' : ''}`).toBe(popped ? null : clip);
    }
  });
});
