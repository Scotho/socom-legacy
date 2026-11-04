/**
 * A blast's ringing ears on the page (`./net/blast`; `FUN_005a0e70`: the gate L459194-459206, the ring L459229-459235).
 *
 * - **The ring**: `.RINGING_EARS` played straight from the banks, without a place (`FUN_00344f30(0x65f160)` -- the bank
 *   sound by name -- then its `+0x1c` play, L459230-459233): a bank sound, not a zAnim, so never the callback map.
 *   Played before the duck, as the game does (the duck is L459234).
 * - **The hold**: selected group masters held at `volume` (0.35) for `seconds` (5) -- `FUN_003412f0(5.0, 0.35, 0,2,1,3,5,6,
 *   -1)` L241197. A second blast inside the hold keeps the duck and makes the hold `max(remaining, 5)` (L241209-241214);
 *   one during the fade puts the channels back to full and ducks them again from there with a fresh hold
 *   (L241215-241219, then the duck L241220-241246).
 * - **The fade**: once the hold has run out, `FUN_00341a60` (L241559-241563) calls `FUN_003410d0(dt)` each frame, which
 *   does `t += dt / 5` (L241145) and sets each channel to `ducked + (orig - ducked) * t` (L241153-241162): a linear
 *   return to full over `RING_FADE_SECONDS`, the table cleared at t = 1 (L241163-241173). About 10 s from blast to full.
 *
 * Research 202 §10–11: group 4 (ring), 7 (headset) and 14 (UI) are excluded. GameAudio handles the selected group
 * masters independently of the player's volume/mute controls. BLAST_PCM_GROUP_READING names the PCM approximation.
 */

export interface RingAudio {
  beginBlastDuck(volume: number): void;
  recoverBlastDuck(progress: number): void;
  endBlastDuck(): void;
  /** A bank sound by name, without a place (`GameAudio.play`). */
  play(name: string, at: null): boolean;
}

/** `FUN_003410d0` L241145: `t += dt / 5.0` -- the channels come back to full over 5 s after the hold. */
export const RING_FADE_SECONDS = 5;
/** The page's fade step, ms: the timer the fade is stepped on (the game steps it each frame; the mix's own ramp smooths). */
const FADE_STEP_MS = 50;

export class RingingEars {
  private active = false;
  private holdUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepper: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly audio: RingAudio) {}

  get ringing(): boolean {
    return this.active;
  }

  start(seconds: number, volume: number): void {
    this.audio.play('.RINGING_EARS', null);
    const now = performance.now();
    const holding = this.active && this.timer !== null && now < this.holdUntil;
    if (!holding) {
      // Not in the hold (idle or fading): back to full (L241215-241219), then ducked from there (L241220-241246).
      this.stopFade();
      if (this.active) this.audio.endBlastDuck();
      this.audio.beginBlastDuck(volume);
    }
    this.active = true;
    // The longer remaining/requested hold wins (including a shorter overlapping blast).
    this.holdUntil = Math.max(holding ? this.holdUntil : now, now + seconds * 1000);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.beginFade(), this.holdUntil - now);
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.stopFade();
    if (this.active) this.audio.endBlastDuck();
    this.active = false;
  }

  private beginFade(): void {
    this.timer = null;
    this.step();
    if (this.active) this.stepper = setInterval(() => this.step(), FADE_STEP_MS);
  }

  /** `FUN_003410d0(dt)`, L241137-241172. */
  private step(): void {
    if (!this.active) return;
    // Browser scheduling adaptation: elapsed monotonic time, not the number of timer callbacks delivered.
    const fade = Math.max(0, (performance.now() - this.holdUntil) / (1000 * RING_FADE_SECONDS));
    if (fade >= 1) { this.stop(); return; }
    this.audio.recoverBlastDuck(fade);
  }

  private stopFade(): void {
    if (this.stepper !== null) clearInterval(this.stepper);
    this.stepper = null;
  }
}
