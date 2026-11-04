import { GAME_FRAME_DT, itemClass, type WeaponRecord } from '@s2u/scene';
import { fireFrames, roundsPerPull } from '../../../viewer/src/accuracy';
import { TICK_HZ } from '../../../viewer/src/net/protocol';

export type BotRole = 'support' | 'rusher' | 'marksman';
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored optional CPU preferences, not recovered campaign AI or weapon parameters. */
export const ROLE_ADAPTATION = {
  support: { reactionMs: 300, accuracy: 81, aggression: 60, range: 260 },
  rusher: { reactionMs: 235, accuracy: 75, aggression: 85, range: 140 },
  marksman: { reactionMs: 350, accuracy: 89, aggression: 35, range: 600 },
} as const;
export function chooseRole(existing: readonly BotRole[]): BotRole {
  return (['support', 'rusher', 'marksman'] as const).reduce((best, role) =>
    existing.filter((r) => r === role).length < existing.filter((r) => r === best).length ? role : best);
}

/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. The posture choice's bounds: the stick deflection counted as moving, and per role the contact range and
 * the cycle (ticks, its active share, the seat's phase step) in which a still bot goes prone or crouches. */
export const STANCE_ADAPTATION = { moving: 0.1, phaseStep: 47,
  marksman: { beyond: 180, period: 420, active: 210 }, rusher: { within: 110, period: 300, active: 90 },
  support: { within: 220, period: 360, active: 100 } } as const;
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A sniper's switch to its sidearm: the contact range that keeps the sidearm out, and the one that draws it. */
export const WEAPON_SWAP_ADAPTATION = { sniperKeepSidearm: 100, sniperDrawSidearm: 65 } as const;

/** Authored CPU posture policy; the wire and mover still apply the original stance rules. */
export function chooseBotStance(role: BotRole, action: string | null, moving: number, distance: number,
  tick: number, id: number, hiding: boolean): 0 | 1 | 2 {
  const s = STANCE_ADAPTATION, phase = tick + id * s.phaseStep;
  if (moving > s.moving) return 0;
  if (hiding) return 1;
  if (action !== 'fire' && action !== 'suppress' && action !== 'patrol') return 0;
  if (role === 'marksman' && distance > s.marksman.beyond && phase % s.marksman.period < s.marksman.active) return 2;
  if (role === 'rusher' && distance < s.rusher.within && phase % s.rusher.period < s.rusher.active) return 1;
  if (role === 'support' && distance < s.support.within && phase % s.support.period < s.support.active) return 1;
  return 0;
}

/** CPU preference only; the normal swap command, carried magazines and firearm records remain authoritative. */
export function chooseBotWeapon(primaryClass: string, current: 0 | 1, distance: number,
  primaryRounds: number, sidearmRounds: number): 0 | 1 {
  if (primaryRounds <= 0) return 1;
  if (sidearmRounds <= 0) return 0;
  if (primaryClass === 'sniper' && distance < (current === 1 ? WEAPON_SWAP_ADAPTATION.sniperKeepSidearm : WEAPON_SWAP_ADAPTATION.sniperDrawSidearm)) return 1;
  return 0;
}

/**
 * OBF-19 (reading, pending review): the game frames a bot's round waits in `mode` -- the console's kit timer
 * (`../../../viewer/src/accuracy` `fireFrames`: `FireWait`, x 0.8 in burst and automatic, run down a game frame at a time
 * and clamped at 0, so a whole number of frames) plus the bolt's or the pump's `ReloadDelayAfterShot` in frames.
 * LATER 588 (c) (reading, pending review): the lock's timer `kit+0x820` runs down while non-zero and ends on the frame it
 * goes below 0, every frame of it skipping the fire branch (`bVar11 = false`, `FUN_005c0fd0` D:L476550-476562), and the
 * fire timer `kit+0x81c` runs down only inside that branch (D:L476643-476647; the round's own frame runs it down once,
 * D:L476637-476647), so the two add: the M40A1 15 + 15 = 30 frames, the M87ELR 21 + 15 = 36 (was the longer of the
 * two: 15 and 21). The after-shot clip on top is the page's (LATER 330), not the bots'. Was: `ceil(seconds x TICK_HZ)` ticks, the console's frame quantisation lost on the 60 Hz
 * tick -- up to a third faster than the original (the Model 18 in automatic: 20 a second against 14.985; the HK5, F90,
 * M16A2, F2000, SA-80 and Aug in burst or automatic: 12 against 9.99; `match/test/fireRateParity.test.ts`).
 */
export function botFireFrames(record: WeaponRecord, mode: number): number {
  const lock = record.reloadDelayAfterShot ?? 0;
  let lockFrames = 0;
  if (lock > 0) {
    const f = Math.fround, dt = f(GAME_FRAME_DT);
    let left = f(lock);
    do { left = f(left - dt); lockFrames++; } while (!(left < 0));
  }
  return fireFrames(record.fireWait, mode) + lockFrames;   // LATER 588 (c): added (D:L476550-476562, D:L476643-476647)
}

/** Game frames as room ticks (fractional): `frames` x GAME_FRAME_DT x TICK_HZ (3 frames: 6.006 ticks). */
export const framesInTicks = (frames: number): number => frames * GAME_FRAME_DT * TICK_HZ;

/** A local trigger controller: the existing wire carries shots, not a fire-mode mutation. */
export class BotFirePolicy {
  mode = 0;
  reason = 'reset';
  get active(): boolean { return this.remaining > 0; }
  private key = '';
  private remaining = 0;
  private nextPull = 0;
  /** OBF-19: the game frames a round waits in the pull's mode (`botFireFrames`). */
  private frames = 1;
  /**
   * OBF-19: the kit's frame clock on the room's tick. A round sets the next one's tick at the frames counted from the
   * clock's anchor, rounded up to a tick (`dueAt`); a round that goes on its due tick counts on from the same anchor, so a
   * held chain keeps the frames' fractional ticks (3 frames: 7, 6, 6, 6 ... ticks, 6.006 on average) and its rate is the
   * console's; a round later than its due tick (a new pull, a blocked shot) anchors the clock afresh, as the console's
   * press starts the kit's frame (`../../../viewer/src/fire` `update`). Never sooner than the console's frames.
   */
  private anchor = -1000;
  private counted = 0;
  private dueAt = -1000;
  private released = true;
  reset(): void {
    this.mode = 0; this.reason = 'reset'; this.key = ''; this.remaining = 0; this.nextPull = 0; this.released = true;
    this.anchor = -1000; this.counted = 0; this.dueAt = -1000;
  }
  /** OBF-19: whether the kit's timer allows a round at `tick` (the last round's frames counted on the room's tick). */
  timerDue(tick: number): boolean { return tick >= this.dueAt; }
  update(record: WeaponRecord, slot: number, role: BotRole, distance: number, rounds: number, tick: number, ready: boolean) {
    const key = `${slot}:${record.id}:${record.fireModes.join(',')}`;
    if (key !== this.key) { this.reset(); this.key = key; }
    if (!ready || rounds <= 0) {
      this.remaining = 0; this.released = true; this.nextPull = Math.max(this.nextPull, tick + 1);
      this.reason = rounds <= 0 ? 'empty' : 'input-gated';
      return { mode: this.mode, trigger: false, due: false };
    }
    if (!this.remaining) {
      if (!this.released) { this.released = true; return { mode: this.mode, trigger: false, due: false }; }
      if (tick < this.nextPull) return { mode: this.mode, trigger: false, due: false };
      const cls = itemClass(record.id);
      // Hysteresis retains automatic near its boundary and single at the far boundary. A pull never switches mode.
      const close = this.mode === 3 ? 150 : 120, far = this.mode === 1 ? 280 : 320;
      const wanted = cls === 'sniper' || cls === 'shotgun' || cls === 'pistol' || role === 'marksman' || rounds <= 3 || distance > far
        ? 1 : distance < close ? 3 : 2;
      this.mode = [wanted, 1, 2, 3].find((mode) => record.fireModes.includes(mode)) ?? 0;
      this.reason = this.mode === wanted ? rounds <= 3 ? 'conserve-magazine' : `observed-range-${role}` : 'supported-fallback';
      this.frames = botFireFrames(record, this.mode);
      this.remaining = Math.min(rounds, roundsPerPull(this.mode), this.mode === 3 ? role === 'rusher' ? 8 : 6 : Infinity);
      this.released = false;
    }
    return { mode: this.mode, trigger: this.remaining > 0, due: this.remaining > 0 && this.timerDue(tick) };
  }
  fired(tick: number): void {
    if (tick === this.dueAt) this.counted += this.frames;
    else { this.anchor = tick; this.counted = this.frames; }
    this.dueAt = this.anchor + Math.ceil(framesInTicks(this.counted) - 1e-9);
    if (--this.remaining <= 0) this.nextPull = Math.max(this.dueAt, tick + (this.mode === 1 ? 10 : 15));
  }
}
