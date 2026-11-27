import { describe, expect, it } from 'vitest';
import { MOTION_CLIPS, oneShotSeconds, SEAL_ANIMS } from '../src/locomotion';
import { ACTION_CLIPS, ACTION_FAMILY, ACTION_SECONDS } from '../src/mover';
import { escorteeSnapshot } from '../src/remotePlayers';
/** The page's snapshot type, as `escorteeSnapshot` takes it (`remotePlayers.ts` keeps the alias module-local). */
type RemoteSnapshot = Parameters<typeof escorteeSnapshot>[0];

/**
 * LATER 1188 (research 447 s9.3, s12; reading, pending review): the page plays a hostage's flashbang cower as the room's
 * snapshot carries it -- the body's action, one of the four appended cower codes (prone: `proneCover`). The clips are in
 * GLOBAL, which the hostage's set includes (447 s9.3), so the page asks the pack for them with the others (`MOTION_CLIPS`);
 * their length is the one-shot's run (`FUN_0028c4f0`), as the room's `cowerSeconds`.
 */

describe('LATER 1188: the page plays a hostage\'s cower', () => {
  it('the four cower actions name their GLOBAL clips, the page loads them, a reaction each', () => {
    expect([SEAL_ANIMS.cowerStand, SEAL_ANIMS.cowerStand2, SEAL_ANIMS.cowerCrouch, SEAL_ANIMS.cowerCrouch2]).toEqual([
      'guard_flashbang_cower', 'guard_flashbang_cower2', 'guard_crouch_flashbang_cower', 'guard_crouch_flashbang_cower2',
    ]);
    for (const clip of ['guard_flashbang_cower', 'guard_flashbang_cower2', 'guard_crouch_flashbang_cower', 'guard_crouch_flashbang_cower2']) {
      expect(MOTION_CLIPS).toContain(clip);
    }
    for (const a of ['cowerStand', 'cowerStand2', 'cowerCrouch', 'cowerCrouch2'] as const) expect(ACTION_FAMILY[a]).toBe('reaction');
  });

  it('their runs: 4.94 / 4.56 standing, 4.92 / 4.53 crouched (playback x ((n - 1) / n)^2)', () => {
    expect(ACTION_SECONDS.cowerStand).toBeCloseTo(4.943, 3);
    expect(ACTION_SECONDS.cowerStand2).toBeCloseTo(4.563, 3);
    expect(ACTION_SECONDS.cowerCrouch).toBeCloseTo(4.916, 3);
    expect(ACTION_SECONDS.cowerCrouch2).toBeCloseTo(4.531, 3);
    expect(ACTION_SECONDS.cowerStand).toBeCloseTo(oneShotSeconds(ACTION_CLIPS.cowerStand.playback, ACTION_CLIPS.cowerStand.frames), 9);
  });

  it('a hostage\'s snapshot keeps the cower as its action (as a knock\'s), over the stance\'s clip', () => {
    const snap = {
      feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null,
      jumps: 0, ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: { name: 'cowerStand', serial: 1, t: 1.2, seconds: 4.94, reversed: false },
      overlay: null, traversal: null, peek: 0, item: 255, weapon: 0, aiming: false, trigger: false, boost: false, binoculars: false,
    } as unknown as RemoteSnapshot;
    const out = escorteeSnapshot(snap, null);
    expect(out.action?.name).toBe('cowerStand');
    expect(out.action?.t).toBeCloseTo(1.2, 6);
  });
});
