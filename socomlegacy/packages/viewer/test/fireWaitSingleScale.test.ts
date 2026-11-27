import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, GAME_FRAME_DT, HELD_SIDEARM } from '@s2u/scene';
import { fireFrames, fireInterval } from '../src/accuracy';
import { AFTER_SHOT_DEFAULT } from '../src/firearms';
import { fastestWait, fireCycleTicks, fireScheduleTicks, launchedRoundWaitTicks, lockFrames, rocketLockSeconds, rocketWaitFrames, rocketWaitTicks } from '../src/net/fireGate';
import { TICK_HZ } from '../src/net/protocol';

/**
 * SWAP-FIRE: r0004's GetFireDelay (r0001 `FUN_005c09f0` -> r0004 0x5c76f0) scales the record's `FireWait` (+0x50) by
 * 1.2 (the word 0x3f99999a, 0x5c7760-0x5c7770) when the slot's mode (`kit+0x6fc` at `kit+0x824`) is 1 or 4 and up;
 * x 0.8 in modes 2 and 3; 1 s in mode 0. r0001 leaves modes 1 and 4+ unscaled -- the wrong build under OT.R97.
 * Levels apart (research 84 s6): mode 1 PROVEN by ATLAS's capture (`origin/agent/spc-atlas` 0d721152d1,
 * `docs/atlas/captures/L5-single-fire-wait-r0001-vs-r0004.md`: M4A1 0.144 s / 5 frames, Mark 23 0.24 s / 8); modes 4 and
 * up a READING (three reads at the bytes, no capture); the turret's x 1.2 a READING; the frames of weapons not captured
 * (M40A1, M87ELR, a turret) PROJECTED by research 84's frame model (`fireFrames`, OBF-19).
 */
describe('SWAP-FIRE: r0004 single-shot FireWait x 1.2', () => {
  it('mode 1 (SEMI) and the round modes (4 and up) wait FireWait x 1.2', () => {
    expect(fireInterval(0.12, 1)).toBeCloseTo(0.144, 12);
    expect(fireInterval(0.2, 1)).toBeCloseTo(0.24, 12);
    expect(fireInterval(0.2, 4)).toBeCloseTo(0.24, 12);
    expect(fireInterval(0.5, 5)).toBeCloseTo(0.6, 12);
  });

  it('burst and automatic keep x 0.8, SAFE keeps 1 s', () => {
    expect(fireInterval(0.12, 2)).toBeCloseTo(0.096, 12);
    expect(fireInterval(0.12, 3)).toBeCloseTo(0.096, 12);
    expect(fireInterval(0.12, 0)).toBe(1);
  });

  it('the frames a round: M4A1 single 4 -> 5, Mark 23 6 -> 8; the M4A1 automatic unchanged at 3', () => {
    expect(DEFAULT_RIFLE.fireWait).toBe(0.12);
    expect(HELD_SIDEARM.fireWait).toBe(0.2);
    expect(fireFrames(DEFAULT_RIFLE.fireWait, 1)).toBe(5);
    expect(fireFrames(HELD_SIDEARM.fireWait, 1)).toBe(8);
    expect(fireFrames(DEFAULT_RIFLE.fireWait, 3)).toBe(3);
    expect(fireFrames(DEFAULT_RIFLE.fireWait, 2)).toBe(3);
  });

  it("the room's rate gate takes the page's single-shot wait (a semi-only Mark 23: no round sooner than FireWait x 1.2)", () => {
    expect(fastestWait(HELD_SIDEARM)).toBeCloseTo(fireInterval(HELD_SIDEARM.fireWait, 1), 12);
    expect(fastestWait(HELD_SIDEARM)).toBeCloseTo(0.24, 12);
    expect(fireCycleTicks(HELD_SIDEARM)).toBeCloseTo(0.24 * TICK_HZ - 1, 9);
    expect(fireScheduleTicks(HELD_SIDEARM)).toBe(2 * fireFrames(HELD_SIDEARM.fireWait, 1));
    expect(fireScheduleTicks(HELD_SIDEARM)).toBe(16);
  });

  it("the room's rate gate is unchanged for a weapon with an automatic (the M4A1's fastest is its x 0.8)", () => {
    expect(fastestWait(DEFAULT_RIFLE)).toBeCloseTo(0.096, 12);
    expect(fireScheduleTicks(DEFAULT_RIFLE)).toBe(6);
  });

  it("the room's launched-round wait is the page's round-mode wait (x 1.2), less a tick", () => {
    expect(launchedRoundWaitTicks(0.5)).toBe(Math.round(fireInterval(0.5, 5) * TICK_HZ) - 1);
    expect(launchedRoundWaitTicks(0.5)).toBe(35);
  });
});

/**
 * LATER 1365 (simulation track; reading, pending review; research 84 s6): the LAW's and the RPG-7's wait between rockets.
 * The round's id is the slot's mode (185 / 186, so 4 and up): r0004 0x5c76f0 scales the round's `FireWait` 3 s x 1.2
 * (0x5c7760-0x5c7770; r0001 `FUN_005c09f0` D:L476329-476340 leaves it unscaled) -- 108 game frames run down in float32.
 * The RPG round alone arms the kit's lock `kit+0x820` (r0004 0x5cd330-0x5cd338, the 0xba test; r0001 `FUN_005c5340`
 * D:L479339-479342) with its `ReloadDelayAfterShot` 1 s, and the lock's frames skip the fire branch, the run-down of the
 * wait included (r0004 0x5c7d94-0x5c7e20; r0001 `FUN_005c0fd0` D:L476550-476563), so they add: 108 + 30 = 138 -- a floor
 * until `RPG_AFTER_SHOT_CLIP_READING` is read (the lock's expiry starts the after-shot clip, r0001 `FUN_005c3000`
 * D:L477643; r0004 0x5ca4d0 unread). The
 * records' values (`FireWait` 3, `ReloadAfterShot`, `ReloadDelayAfterShot` 1, both rounds) as `readWeapon` reads them off
 * the disc (research 94 §C11).
 */
describe('LATER 1365: the rockets wait FireWait x 1.2, the RPG round its lock on top', () => {
  const ROCKET = { fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1 };

  it('the frames: the LAW HEAT 108, the RPG 108 + 30 = 138 (at least: its after-shot clip unread)', () => {
    expect(lockFrames(1)).toBe(30);
    expect(lockFrames(0)).toBe(0);
    expect(rocketLockSeconds(185, ROCKET)).toBe(0);
    expect(rocketLockSeconds(186, ROCKET)).toBe(1);
    expect(rocketLockSeconds(186, { ...ROCKET, reloadAfterShot: false })).toBe(0);
    expect(rocketWaitFrames(185, ROCKET)).toBe(108);
    expect(rocketWaitFrames(186, ROCKET)).toBe(138);
  });

  it("the RPG round's lock with no ReloadDelayAfterShot in its record is the parser's default 0.01 s", () => {
    // `rocketLockSeconds`' `?? AFTER_SHOT_DEFAULT` (the parser's default, r0004 0x3f0c5c-0x3f0c84; research 84 s6 item 5).
    expect(rocketLockSeconds(186, { fireWait: 3, reloadAfterShot: true })).toBe(AFTER_SHOT_DEFAULT);
    expect(AFTER_SHOT_DEFAULT).toBe(0.01);
    expect(rocketLockSeconds(185, { fireWait: 3, reloadAfterShot: true })).toBe(0);
  });

  it("the room's wait in ticks, less a tick: 215 (LAW), 275 (RPG) -- an honest page's 108 / 138 frames never refused", () => {
    expect(rocketWaitTicks(185, ROCKET)).toBe(215);
    expect(rocketWaitTicks(186, ROCKET)).toBe(275);
    expect(108 * GAME_FRAME_DT * TICK_HZ).toBeGreaterThan(215);
    expect(138 * GAME_FRAME_DT * TICK_HZ).toBeGreaterThan(275);
  });
});
