import { describe, expect, it } from 'vitest';
import { followPlace, FOLLOW_WATCHED_PITCH } from '../e2e/followPlace';
import { WATCHED_LOOK_PITCH_READING } from '../src/matchNet';
import { rootY } from '../src/mover';
import { PlayerCamera } from '../src/playerCamera';
import { FOLLOW_BEHIND, FOLLOW_OVER, FOLLOW_PITCH } from '../src/spectatorView';

/**
 * The place `e2e/replayPaths.spec.ts` case 3 finds the follow camera by (`e2e/followPlace.ts`), held against the product:
 * a browser adaptation's test helper, no claim about the original beyond the constants it reads. The spec pinned the
 * follow at the old `FOLLOW_BEHIND` / `FOLLOW_OVER` (24.906 / 25.709), the rig's place at -9.167 degrees; SPECTATE-PITCH
 * (v0.4.21) ticks the rendering follow level, and the case could only time out. The derivation must give the old numbers
 * at the old pitch (so it is the same camera the spec always meant) and the product's own camera at the reading's. Since
 * LATER 1017 the non-rendering hosts' fallback (`spectatorView.ts` `FOLLOW_*`) is that level place too.
 */

/** The non-rendering fallback's place before LATER 1017: the player's own spawn rest at `init_aim_pitch`. */
const OLD_PITCH = -9.167, OLD_BEHIND = 24.906, OLD_OVER = 25.709;

/** The eye of a fresh `PlayerCamera` after one tick on open ground (no grid): behind the body along +z at yaw 0, and over its feet. */
function rigPlace(pitch: number): { behind: number; over: number; across: number } {
  const cam = new PlayerCamera(null);
  cam.tick([0, 0, 0], 0, pitch, rootY('stand'), undefined, true);
  const eye = cam.view(1).eye;
  return { behind: eye[2], over: eye[1], across: eye[0] };
}

describe('the follow camera at rest, as the replay paths spec finds it', () => {
  it('at the old follow pitch the derivation is the two numbers the spec used to pin', () => {
    const p = followPlace(OLD_PITCH);
    expect(Math.abs(p.behind - OLD_BEHIND)).toBeLessThan(0.002);
    expect(Math.abs(p.over - OLD_OVER)).toBeLessThan(0.002);
  });

  it('the pitch it uses by default is the reading the rendering follow ticks at', () => {
    expect(FOLLOW_WATCHED_PITCH).toBe(WATCHED_LOOK_PITCH_READING);
  });

  it('at the reading it is the level place: the whole reach behind, the look height over', () => {
    const p = followPlace();
    expect(p.behind).toBeCloseTo(28.75, 9);
    expect(p.over).toBeCloseTo(rootY('stand') + 10, 9);
  });

  it('and it is where the old numbers are not: the spec that pinned them could not pass (0.01 is its tolerance)', () => {
    const p = followPlace();
    expect(Math.abs(p.behind - OLD_BEHIND)).toBeGreaterThan(3);
    expect(Math.abs(p.over - OLD_OVER)).toBeGreaterThan(4);
  });

  it('LATER 1017: the non-rendering fallback (FOLLOW_*) stands at the derivation\'s place at its own pitch, the level one', () => {
    expect(FOLLOW_PITCH).toBe(FOLLOW_WATCHED_PITCH);
    const p = followPlace(FOLLOW_PITCH);
    expect(Math.abs(p.behind - FOLLOW_BEHIND)).toBeLessThan(0.002);
    expect(Math.abs(p.over - FOLLOW_OVER)).toBeLessThan(0.002);
  });

  it('at both pitches it is the eye of the product camera after a tick on open ground', () => {
    for (const pitch of [FOLLOW_WATCHED_PITCH, OLD_PITCH]) {
      const want = followPlace(pitch), got = rigPlace(pitch);
      expect(Math.abs(got.behind - want.behind), `behind at ${pitch}`).toBeLessThan(1e-6);
      expect(Math.abs(got.over - want.over), `over at ${pitch}`).toBeLessThan(1e-6);
      expect(Math.abs(got.across), `across at ${pitch}`).toBeLessThan(1e-6);
    }
  });
});
