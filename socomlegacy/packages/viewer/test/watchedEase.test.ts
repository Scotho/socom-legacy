import { describe, expect, it } from 'vitest';
import { PlayerCamera, WATCHED_EASE_RATE_READING, watchedEaseFactor } from '../src/playerCamera';
import { SpectatorView, type SpectatorBody } from '../src/spectatorView';

/**
 * INV-SPECTATE fix C (simulation track; reading, pending review; research 314 §5.7): the dead player's teammate view is
 * eased as the original's death camera at state 7 eases it. `FUN_00297410` sets the camera's blend flag +0x45 only with
 * the death camera at 7 (bound to an actor whose controller is not the page's: `FUN_002980d0` D:L141378-141389,
 * D:L141604-141619), and only once the new bind's latch +0x44 has been spent -- the bind's own frame writes the stored
 * target +0x38 and eye +0x2c straight (D:L141028-141041). `FUN_00296f10` then, each frame with +0x45 set and +0x46
 * clear, takes the factor 6 dt (D:L140739), clamped to 1 (D:L140747-140749), and moves the stored target and eye toward
 * the frame's new pair by it (`FUN_00309200` subtract, `FUN_00309180` scale, `FUN_00309240` add; D:L140752-140788) before
 * the pass (`FUN_0029bf70`, D:L140791). A spectator's death camera stays at 0, so its follow is rigid. Unit tests.
 */

const ALIVE = 64;

describe('the transcription: the factor, its clamp', () => {
  it('6 a second (D:L140739)', () => {
    expect(WATCHED_EASE_RATE_READING).toBe(6);
  });
  it('6 dt, clamped to 1 (D:L140747-140749)', () => {
    expect(watchedEaseFactor(1 / 60)).toBeCloseTo(0.1, 12);
    expect(watchedEaseFactor(1 / 30)).toBeCloseTo(0.2, 12);
    expect(watchedEaseFactor(0)).toBe(0);
    expect(watchedEaseFactor(1 / 6)).toBe(1);
    expect(watchedEaseFactor(0.5)).toBe(1);
  });
});

describe('PlayerCamera.ease: the stored target and eye moved by the factor, a new bind snapped', () => {
  const sub = (a: readonly number[], b: readonly number[]): number[] => a.map((x, i) => x - b[i]!);

  it('rigid (ease off): the camera stands where the body puts it every tick', () => {
    const rigid = new PlayerCamera(null), plain = new PlayerCamera(null);
    rigid.ease = false;
    rigid.tick([0, 0, 0], 0, 0, 10, 1 / 60); plain.tick([0, 0, 0], 0, 0, 10, 1 / 60);
    rigid.tick([30, 0, 0], 0, 0, 10, 1 / 60); plain.tick([30, 0, 0], 0, 0, 10, 1 / 60);
    expect(rigid.view(1).eye).toEqual(plain.view(1).eye);
  });

  it('eased: the first tick (the bind) snaps; each tick after moves the eye and target 6 dt of the way', () => {
    const eased = new PlayerCamera(null), rigid = new PlayerCamera(null);
    eased.ease = true;
    eased.tick([0, 0, 0], 0, 0, 10, 1 / 60); rigid.tick([0, 0, 0], 0, 0, 10, 1 / 60);
    const e0 = rigid.view(1).eye, t0 = rigid.view(1).target;
    expect(eased.view(1).eye).toEqual(e0);                                // the bind's frame: written straight
    eased.tick([30, 0, 0], 0, 0, 10, 1 / 60); rigid.tick([30, 0, 0], 0, 0, 10, 1 / 60);
    const e1 = rigid.view(1).eye, t1 = rigid.view(1).target;
    const want = e0.map((x, i) => x + (e1[i]! - x) * 0.1);
    eased.view(1).eye.forEach((x, i) => expect(x).toBeCloseTo(want[i]!, 9));
    const wantT = t0.map((x, i) => x + (t1[i]! - x) * 0.1);
    eased.view(1).target.forEach((x, i) => expect(x).toBeCloseTo(wantT[i]!, 9));
    // A second tick at 1/30 s: 0.2 of the remaining gap.
    const before = eased.view(1).eye;
    eased.tick([30, 0, 0], 0, 0, 10, 1 / 30);
    const gap = sub(e1, before);
    eased.view(1).eye.forEach((x, i) => expect(x).toBeCloseTo(before[i]! + gap[i]! * 0.2, 9));
    // A long frame: clamped to 1, the camera on the pose.
    eased.tick([30, 0, 0], 0, 0, 10, 0.5);
    eased.view(1).eye.forEach((x, i) => expect(x).toBeCloseTo(e1[i]!, 9));
  });

  it('a new bind (`reset`, a fresh rig) snaps, not eases, to the newly bound body', () => {
    const eased = new PlayerCamera(null), rigid = new PlayerCamera(null);
    eased.ease = true;
    eased.tick([0, 0, 0], 0, 0, 10, 1 / 60);
    eased.reset();
    eased.tick([500, 0, 0], 90, 0, 10, 1 / 60); rigid.tick([500, 0, 0], 90, 0, 10, 1 / 60);
    expect(eased.view(1).eye).toEqual(rigid.view(1).eye);
  });
});

describe('only the dead player\'s teammate view eases; the spectator\'s follow stays rigid', () => {
  function view(role: 'spectator' | 'player'): { v: SpectatorView; calls: { id: number; dt: number; ease: boolean | undefined }[] } {
    const bodies: SpectatorBody[] = [{ id: 2, feet: [0, 0, 3.5], yaw: 0, flags: ALIVE, pitch: 0, stance: 0, peek: 0 } as SpectatorBody];
    const calls: { id: number; dt: number; ease: boolean | undefined }[] = [];
    const v = new SpectatorView({
      bodies: () => bodies,
      seat: () => ({ role, self: 1, team: 'seal', teams: new Map([[1, 'seal'], [2, 'seal']]), rules: 'classic', ghost: false }),
      spectate: () => {}, leaveSelf: () => {}, follow: (b, dt, ease) => calls.push({ id: b.id, dt, ease }), resetFollow: () => {},
    });
    if (role === 'player') v.bench();
    v.key({ code: 'ArrowRight', type: 'keyup', repeat: false, preventDefault() {} });
    v.frame(undefined, 1 / 60);
    return { v, calls };
  }
  it('the benched dead player watching a teammate: eased', () => {
    const { calls } = view('player');
    expect(calls.at(-1)).toEqual({ id: 2, dt: 1 / 60, ease: true });
  });
  it('a spectator following a player: rigid (its death camera stays at 0)', () => {
    const { calls } = view('spectator');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.ease).toBeFalsy();
  });
});
