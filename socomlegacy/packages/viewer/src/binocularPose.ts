import { sampleClip, type MotionClip, type PartPose } from '@s2u/scene';
import type { LayerContext, PoseLayer } from './animator';
import { BLEND_TIME_DEFAULT, entryOf, motionOf, type Motion } from './locomotion';
import type { Stance } from './mover';
import type { MotionTable } from './motionTable';

/**
 * The body raising the binoculars (view state 4, `./zoom`; the owner's yes of 2026-10-01): the game's six
 * `*2binocular` clips, as the others see a player with the binoculars up. The page's own body is hidden in that view
 * (the eye's), so the layer runs on the remote bodies (`./remotePlayers`, off `BodyFlag.Binoculars`).
 *
 * - **The clips** (READERC's `animset.rdr`, `MOTION_P.ZAR`): `Stand -> Binocular` `seal_stand2binocular`, `Crouch ->
 *   Binocular` `seal_crouch2binocular`, `Prone -> Binocular` `seal_prone2binocular`, and the sidearm's `Pistol stand /
 *   crouch / prone -> Binocular` `seal_p_*2binocular` -- reCOM's `animTypeStand2Binocular` .. `animTypeProne2Binocular_P`
 *   (`zanim.h` 185-187, 258-260). Their `motion.rdr` rows are one-shots (`looped 0`), and SOCOM 1's carry `NoFire`
 *   (a hint the fire rule agrees with: `FUN_005be9a0` refuses every use in state 4).
 * - **The play**: the stance's clip (the sidearm's set with the pistol in the hand) runs once as the game plays a one-shot
 *   (`./locomotion` `motionOf`: the phase to `(n - 1) / n` over `playback (n - 1) / n` seconds), blended in over its
 *   `BlendTime`, and holds its last key while the binoculars stay up; a stance change while up plays the new stance's
 *   clip from its start.
 * - **The way down** (`BINOCULAR_LOWER_READING`): no `Binocular -> Stand` exists (the anim set names only the raise, and
 *   reCOM's enum has none), so the raise runs backwards at its own rate to its first key and the layer fades out over
 *   `BLEND_TIME_DEFAULT` -- the reversed play the game gives a swap clip (`ActionReversed`), a reading for this one.
 * - **The whole body** (`BINOCULAR_BODY_READING`): the clip is laid over every part at full weight, the legs too, as
 *   the throw's is (`./throwPose`); whether the game blends it over the upper body only is not traced.
 */

/** The six clips, by the hand's set and the stance (READERC `animset.rdr`; `MOTION_P.ZAR`). */
export const BINOCULAR_ANIMS: Readonly<Record<'rifle' | 'pistol', Readonly<Record<Stance, string>>>> = {
  rifle: { stand: 'seal_stand2binocular', crouch: 'seal_crouch2binocular', prone: 'seal_prone2binocular' },
  pistol: { stand: 'seal_p_stand2binocular', crouch: 'seal_p_crouch2binocular', prone: 'seal_p_prone2binocular' },
};

/** Every binocular clip the page asks the worker for (beside `PLAY_CLIPS`). */
export const BINOCULAR_CLIPS: readonly string[] = [...Object.values(BINOCULAR_ANIMS.rifle), ...Object.values(BINOCULAR_ANIMS.pistol)];

/** The way down: the raise played backwards (no lowering clip on the disc) [reading]. */
export const BINOCULAR_LOWER_READING = 'reversed' as const;
/** The clip over the whole body, the legs too, at full weight once blended in [reading]. */
export const BINOCULAR_BODY_READING = 'whole' as const;

/** The clip for a stance and the hand's set: the sidearm's `seal_p_` set with the pistol up, else the rifle's. */
export function binocularClip(stance: Stance, item: 'rifle' | 'pistol'): string {
  return BINOCULAR_ANIMS[item][stance];
}

/** Where the clips come from once the source's pack is in (`Play.motionSource`). */
export type BinocularClipSource = () => { clips: ReadonlyMap<string, MotionClip>; table: MotionTable | null } | null;

export interface BinocularPoseStats { clip: string | null; phase: number; weight: number; up: boolean }

export class BinocularPose {
  private motion: Motion | null = null;
  private phase = 0;
  private weight = 0;
  private elapsed = 0;
  private up = false;
  private fade = 0;
  private fadeFrom = 0;
  /** The pose layer: `Play.addPoseLayer` lays it over the clips. */
  readonly layer: PoseLayer = { sample: (c) => this.sample(c) };

  constructor(private readonly source: BinocularClipSource) {}

  /**
   * One frame: `up` the binoculars (the body's replicated flag), `stance` its posture, `item` the hand's set. Raises,
   * holds, or lowers (`BINOCULAR_LOWER_READING`); a missing clip leaves the body as it is.
   */
  update(dt: number, up: boolean, stance: Stance, item: 'rifle' | 'pistol'): void {
    const want = binocularClip(stance, item);
    if (up && (!this.up || this.motion?.name !== want)) {
      const src = this.source();
      const clip = src?.clips.get(want);
      this.motion = clip && src ? motionOf(clip, entryOf(clip.name, src.table)) : null;
      this.phase = 0;
      this.elapsed = 0;
      this.fade = 0;
    }
    this.up = up;
    const m = this.motion;
    if (!m) { this.weight = 0; return; }
    const a = m.frames < 2 ? 1 : (m.frames - 1) / m.frames;
    const rate = dt / (m.period * a);
    if (up) {
      this.elapsed += dt;
      this.phase = Math.min(m.end, this.phase + rate);
      this.weight = m.blendTime > 0 ? Math.min(1, this.elapsed / m.blendTime) : 1;
      this.fadeFrom = this.weight;
      return;
    }
    if (this.phase > 0) { this.phase = Math.max(0, this.phase - rate); this.fadeFrom = this.weight; return; }
    this.fade += dt;
    this.weight = this.fadeFrom * Math.max(0, 1 - this.fade / BLEND_TIME_DEFAULT);
    if (this.weight <= 0) this.stop();
  }

  /** Stops at once (a new map, a death, the body gone). */
  stop(): void {
    this.motion = null;
    this.weight = 0;
    this.phase = 0;
    this.up = false;
  }

  stats(): BinocularPoseStats {
    return { clip: this.motion?.name ?? null, phase: this.phase, weight: this.weight, up: this.up };
  }

  private sample(_current: LayerContext): { parts: readonly PartPose[]; weight: number } | null {
    const m = this.motion;
    if (!m || !(this.weight > 0)) return null;
    const key = this.phase * m.frames;
    return { parts: sampleClip(m.clip, key / m.clip.rate, { loop: false }).parts, weight: this.weight };
  }
}
