import { expect, it, vi } from 'vitest';
import { PLACE_CLAYMORE_ANIM, type MotionClip } from '@s2u/scene';
import { ownBombBody } from '../src/bombPage';
import { Play } from '../src/play';
import type { ActionEnd } from '../src/mover';
import type { WalkMode } from '../src/walk';
import { prototypeHands } from '../src/xboxPrototype/hands';

/** Synthetic playback fixture through the actual Play/ThrowPose and bomb-body
 * adapter. This checks lifecycle wiring, not the disc's timing or rendered pose. */
function setup() {
  const anim = PLACE_CLAYMORE_ANIM;
  const clip: MotionClip = { name: anim.clip, version: 5, duration: 1, frameCount: 30,
    rate: 30, unknown10: -1, unknown14: 1, parts: [] };
  const play = new Play();
  play.setClips({ clips: [clip], table: [[anim.clip, { looped: false, playback: 1, maxVelocity: -1,
    blendTime: 0.1, transitionA: null, transitionB: null, noInterrupt: null,
    callbacks: [{ name: 'fixture_callback', time: 0.25 }] }]] });
  const listeners = new Set<(end: ActionEnd) => void>();
  let held = false;
  const end = (family: 'place' | 'reload' = 'place', reason: ActionEnd['reason'] = 'complete') => {
    held = false;
    for (const listener of listeners) listener({ body: { source: 'hold', name: 'seal_place_claymore', family, serial: 1 }, overlay: null, reason });
  };
  const walk = {
    snapshot: () => ({ hold: held }), drawnFeet: () => [1, 2, 3],
    onActionEnd: (listener: (end: ActionEnd) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    hold: () => { if (held) end('place', 'replaced'); held = true; return true; },
  } as unknown as WalkMode;
  const callback = vi.fn(), hands = prototypeHands({ play, walk, callback });
  const body = ownBombBody({ setGearVisible: () => {} }, hands.pose, walk, () => false);
  return { hands, body, callback, end, listeners, anim, loseMover: () => { held = false; } };
}

it('keeps a bomb placing on the shared layer until the mover ends it and emits its callback once', () => {
  const h = setup(); h.body.startClip!(h.anim, h.anim.clip);
  h.hands.frame(0.3); h.hands.frame(2);
  expect(h.callback.mock.calls).toEqual([['fixture_callback', [1, 2, 3]]]);
  expect(h.hands.pose.playing()).toBe(true);
  h.end(); expect(h.hands.pose.playing()).toBe(false);
  h.hands.frame(1); expect(h.callback).toHaveBeenCalledTimes(1);
  h.hands.dispose(); expect(h.listeners.size).toBe(0);
});

it('replacing a placing ends the old hold before starting the new pose', () => {
  const h = setup(); h.body.startClip!(h.anim, h.anim.clip); h.hands.frame(0.3);
  h.body.startClip!(h.anim, h.anim.clip);
  expect(h.hands.pose.playing()).toBe(true); expect(h.hands.pose.stats().elapsed).toBe(0);
  h.hands.frame(0.3); expect(h.callback).toHaveBeenCalledTimes(2);
  h.end('reload'); expect(h.hands.pose.playing()).toBe(true);
  h.hands.frame(0.01); expect(h.hands.pose.playing()).toBe(false);
  h.hands.dispose();
});

it('drops the layer when its mover disappears, and teardown removes callbacks without another tick', () => {
  const h = setup(); h.body.startClip!(h.anim, h.anim.clip);
  h.loseMover(); h.hands.frame(0.5);
  expect(h.hands.pose.playing()).toBe(false); expect(h.callback).not.toHaveBeenCalled();
  h.body.startClip!(h.anim, h.anim.clip); h.hands.dispose(); h.hands.dispose();
  expect(h.hands.pose.playing()).toBe(false); expect(h.listeners.size).toBe(0);
  h.hands.frame(1); expect(h.callback).not.toHaveBeenCalled();
});
