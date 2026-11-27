import { expect, it, vi } from 'vitest';
import { walkingSound } from '../src/xboxPrototype/sound';
import type { GameAudio } from '../src/audio';
import type { WalkMode } from '../src/walk';
import type { FlyCamera } from '../src/camera';
import type { FireEvent } from '../src/fireCore';

function setup() {
  const audio = { setFallTable: vi.fn(), onFire: vi.fn(), onReload: vi.fn(), onRoundPast: vi.fn(), play: vi.fn(),
    stopTransient: vi.fn(), stopMusic: vi.fn(), roundCues: () => null, setData: vi.fn(), setLoops: vi.fn(), setLadderSlide: vi.fn(), onLand: vi.fn(), onAnimCallback: vi.fn() };
  const walk = { mode: () => 'walk', drawnFeet: () => [1, 2, 3], posture: () => 'stand', grid: () => null, gridOfGround: () => null };
  return { audio, sound: walkingSound(audio as unknown as GameAudio, walk as unknown as WalkMode, {} as FlyCamera) };
}

it('uses the shared gun report rule once per shotgun shell, plus reload and dry sounds', () => {
  const { sound, audio } = setup(), weapon = { name: 'M3' };
  sound.fireEvent({ type: 'round', weapon, from: [4, 5, 6], pellet: 0 } as FireEvent);
  sound.fireEvent({ type: 'round', weapon, from: [4, 5, 6], pellet: 1 } as FireEvent);
  sound.fireEvent({ type: 'reloadStart', weapon } as FireEvent);
  sound.fireEvent({ type: 'dry', weapon } as FireEvent);
  expect(audio.onFire.mock.calls).toEqual([['M3', [4, 5, 6]]]);
  expect(audio.onReload.mock.calls).toEqual([['M3', [1, 2, 3]]]);
  expect(audio.play.mock.calls).toEqual([['.GUN_EMPTY', null]]);
});

it('forwards the shared hands pose callback at its position and suppresses it under round screens', () => {
  const { sound, audio } = setup();
  sound.animCallback('throw_whoosh', [1, 2, 3]); expect(audio.onAnimCallback.mock.calls).toEqual([['throw_whoosh', [1, 2, 3]]]);
  sound.screen(true); sound.animCallback('throw_whoosh', [4, 5, 6]); expect(audio.onAnimCallback).toHaveBeenCalledOnce();
  sound.screen(false); sound.animCallback('throw_whoosh', null); expect(audio.onAnimCallback).toHaveBeenLastCalledWith('throw_whoosh', null);
});

it('holds the shared ladder loop only outside the round screen and releases its handle on teardown', () => {
  const { sound, audio } = setup();
  sound.ladderSlide([1, 2, 3]); expect(audio.setLadderSlide).toHaveBeenLastCalledWith([1, 2, 3]);
  sound.screen(true); sound.ladderSlide([1, 2, 3]); expect(audio.setLadderSlide).toHaveBeenLastCalledWith(null);
  sound.ladderLand(2, [1, 2, 3]); expect(audio.onLand).not.toHaveBeenCalled();
  sound.screen(false); sound.ladderSlide([4, 5, 6]); expect(audio.setLadderSlide).toHaveBeenLastCalledWith([4, 5, 6]);
  sound.ladderLand(2, [4, 5, 6]); expect(audio.onLand).toHaveBeenCalledWith(2, expect.any(Number), [4, 5, 6]);
  sound.dispose(); expect(audio.setLadderSlide).toHaveBeenLastCalledWith(null);
});

it('stops existing sounds once at round screens and gates local and remote reports until they close', () => {
  const { sound, audio } = setup(), weapon = { name: 'M3' };
  sound.screen(true); sound.screen(true);
  sound.fireEvent({ type: 'round', weapon, from: [4, 5, 6] } as FireEvent);
  sound.roundFired({ weapon, from: [4, 5, 6] });
  sound.reloadSound(weapon, [1, 2, 3]);
  sound.roundPast([0, 0, 0], [1, 1, 1], [2, 2, 2]);
  sound.sceneSound('.DOOR', [1, 2, 3], 0.5);
  expect(audio.stopTransient).toHaveBeenCalledTimes(1);
  expect(audio.onFire).not.toHaveBeenCalled();
  expect(audio.onReload).not.toHaveBeenCalled();
  expect(audio.onRoundPast).not.toHaveBeenCalled();
  expect(audio.play).not.toHaveBeenCalled();
  sound.screen(false); sound.roundFired({ weapon, from: [4, 5, 6] });
  sound.sceneSound('.DOOR', [1, 2, 3], 0.5);
  expect(audio.onFire).toHaveBeenCalledTimes(1);
  expect(audio.play.mock.calls).toEqual([['.DOOR', [1, 2, 3], 'play', 0.5]]);
});
