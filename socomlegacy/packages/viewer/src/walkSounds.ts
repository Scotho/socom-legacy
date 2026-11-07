import { probeFloor, type Grid } from '@s2u/scene';
import type { StanceCode } from '@s2u/sound';
import type { GameAudio, Vec3 } from './audio';
import type { FireEvent } from './fire';
import type { PlayEvent } from './play';
import type { Stance } from './walk';
import { cameraFloor } from './floorPick';

/**
 * The walk's events turned into `GameAudio`'s (socomlegacy/docs/research/81 §4-§6): the body's (`Play.onEvent`: the game's
 * footfalls off the play's phase, `FUN_005a3570`; each clip's `zanim_callback` as its key is crossed -- `jump_whoosh`
 * among them; the landing with its contact speed, research 80) and the rifle's (`Fire.subscribe`: a round, a reload).
 * Each sound is heard where it happens: a step at the foot, a round at the muzzle.
 */

/** `.GUN_EMPTY` (ELF 0x65f8f8): the dry trigger's click, in every multiplayer map's own `_fx.bnk` (research 305 s2). */
export const GUN_EMPTY_SOUND = '.GUN_EMPTY';

/**
 * GUN_EMPTY_PULL_READING (PAR-89, research 305 s2.3; LATER 48): one click per press of a dry trigger with no magazine to
 * take -- `Fire.dryFrame` sends `dry` on each frame of `FUN_005c0fd0`'s dry branch that asks it, `(bVar11 && pressed) ||
 * bVar6` (D:L476616): while the pull's count (kit +0x818) is under 2 (D:L476618), on a press (trigger state 1 or 2,
 * D:L476591-476592; the states by `FUN_00597790` D:L454354-454383) whose count is under the pull's limit (`FUN_005c0940`
 * D:L476283-476310: 1 when no magazine of the slot holds rounds, `FUN_005bdb00` -> `FUN_005bda70` D:L474519-474538), the
 * count raised when no reload follows (D:L476630-476631) and cleared at rest and on the release (`FUN_005c0ae0`
 * D:L476381-476382, D:L476399-476400). With a magazine to take the click and the reload at once; refused, both asked again
 * each frame (`../fire` `DRY_CLICK_FRAME_READING`); online, a refill weapon's with no press (`bVar6`, D:L476596-476615).
 * Was: "what `FUN_005bdb00` answers is unread" and the unpressed path `GUN_EMPTY_UNPRESSED_READING`, 'not built' (retired
 * with LATER 48). [reading]
 */
export const GUN_EMPTY_PULL_READING = 1;

/**
 * GUN_EMPTY_REMOTE_READING (PAR-89, research 305 s2.4): the click is the page's own trigger's alone -- no other player's
 * dry pull is heard, and none is sent (`NetPage.fireEvent` sends rounds and reloads only). `FUN_005c0fd0` runs per kit
 * and reads its controller's trigger state (+0x118, D:L476592) without the local test (vtable +0x2c) that gates its
 * stop of the kit's +0x89c handle (D:L476386-476396); how a remote player's controller (`CRemoteCtrl`) comes by a
 * trigger state is unread. Settled by reading `CRemoteCtrl`'s writer of +0x118, or a two-console capture of a dry
 * pull. [reading]
 */
export const GUN_EMPTY_REMOTE_READING = 'local' as const;

/** What this reads of the walk when an event comes. */
export interface WalkSignals {
  walking(): boolean;
  /** The feet as drawn, world units. */
  feet(): Vec3 | null;
  /** The posture the steps are chosen by (stand, crouch, prone). */
  stance(): Stance;
  /** The stick: forward and right, -1..1 (the keys are the stick at its rim). */
  wish(): { forward: number; right: number };
  grid(): Grid | null;
}

const STANCE_CODE: Record<Stance, StanceCode> = { stand: 0, crouch: 1, prone: 2 };

export class WalkSounds {
  /** How many of each the walk sent, for the hook. */
  readonly counts = { footfalls: 0, callbacks: 0, landings: 0, rounds: 0, reloads: 0 };

  constructor(private readonly audio: GameAudio, private readonly walk: WalkSignals) {}

  /** The material under a point: the floor the ground probe picks there (`probeFloor`), its polygon's byte. */
  material(at: Vec3): number {
    const grid = this.walk.grid();
    return (grid && probeFloor(grid, at[0], at[1], at[2])?.poly.material) ?? 0;
  }

  /**
   * Once a frame: the ambience on while walking, and the camera's place for the reverb's depth and the beds
   * (`GameAudio.setEnvironment`). `FUN_00295b00`'s one probe under the camera (D:L140037-140038) writes the camera's
   * `+0x2b8` (`m_inside`, D:L140054-140055) and `+0x2bc` (the reverb zone, D:L140056-140057), which the reverb reads
   * (`FUN_00341a60` D:L241520-241521) and `CAMERA_INDOORS` (66) answers: so the camera's own pick (`./floorPick`
   * `cameraFloor`, `FUN_002d4c20`: the highest floor at or below the camera), the effects' 66's; with none, nothing is
   * written (D:L140039) and the last answer stands (research 81 §9-§10, research 89 §21; reading, pending review). Was
   * the actor's pick (`probeFloor`: up to 6 over), so a camera under a low roof's top heard outdoors.
   */
  frame(camera: Vec3 | null): void {
    const walking = this.walk.walking();
    this.audio.setAmbience(walking);
    const grid = this.walk.grid();
    if (!walking || !grid || !camera) return;
    const floor = cameraFloor(grid, camera[0], camera[1], camera[2])?.poly;
    if (floor) this.audio.setEnvironment((floor.inside ?? 0) !== 0, floor.reverbZone ?? 0);
  }

  /** The body's events (`Play.onEvent`), while walking. */
  playEvent(e: PlayEvent): void {
    const feet = this.walk.feet();
    if (!this.walk.walking() || !feet) return;
    if (e.kind === 'footfall') {
      const stance = STANCE_CODE[this.walk.stance()];
      if (stance === 2 && e.foot === 'left') return;   // prone: the left foot's call is skipped, the crawl is the right's
      const at = e.position ?? feet, wish = this.walk.wish();
      this.counts.footfalls++;
      this.audio.onFootstep(this.material(feet), at, { stance, stick: Math.max(Math.abs(wish.forward), Math.abs(wish.right)) });
    } else if (e.kind === 'callback') {
      this.counts.callbacks++;
      this.audio.onAnimCallback(e.name, feet);
    } else if (e.kind === 'land') {
      this.counts.landings++;
      this.audio.onLand(e.speed, this.material(feet), feet);
    }
  }

  /**
   * The rifle's own events (`./fire` `subscribe`): a round is heard at the fire point it left (the muzzle), a reload
   * where it starts -- the record's sounds by its `InternalName` (`.M4A1_SIL`, `.M4A1_SIL_RLD` for the M4A1 SD).
   */
  fireEvent(e: FireEvent): void {
    // PAR-89 (research 305 s2): the dry trigger's `.GUN_EMPTY` -- the kit's handle +0x88c (ELF 0x65f8f8, `FUN_005c7e00`
    // D:L480569-480570) played unplaced (vtable +0xc, `FUN_005c0fd0` D:L476617-476620; research 122 R122.4): no place,
    // the bank's own pan, full volume. The page's own trigger only (GUN_EMPTY_REMOTE_READING, GUN_EMPTY_PULL_READING).
    if (e.type === 'dry') { this.audio.play(GUN_EMPTY_SOUND, null); return; }
    // A shotgun's pull is one shell and one report, its pellets beside it (M4, research 94 §C2.1): the first ray's.
    if (e.type === 'round' && !(e.pellet! > 0)) { this.audio.onFire(e.weapon.name, e.from); this.counts.rounds++; }
    else if (e.type === 'reloadStart') { this.audio.onReload(e.weapon.name, this.walk.feet()); this.counts.reloads++; }
    // M4: the bolt's or pump's lock ran out -- its `ReloadAfterShotSound` at the body (`FUN_005c3000`: `.SHOTGUN_COCK`).
    else if (e.type === 'afterShot') this.audio.onReloadAfterShot(e.weapon.name, this.walk.feet());
  }
}
