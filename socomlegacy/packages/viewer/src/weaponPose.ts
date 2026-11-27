import { GAME_FRAME_DT, sampleClip, sampleClipInto, type MotionClip, type PartPose } from '@s2u/scene';
import { blendWeight, OVERLAY_BLEND, type LayerContext, type NodeLayer, type PoseLayer } from './animator';
import { BLEND_TIME_DEFAULT, entryOf } from './locomotion';
import type { MotionTable } from './motionTable';
import { ALL_RELOAD_CLIPS, PISTOL_RELOAD_CLIPS, RELOAD_CLIPS, reloadClip, reloadLength, reloadSeconds, type ReloadItem, type ReloadStance } from './reloadClip';
import { carriedLockSeconds, carriesOn, reloadCutPhase, reloadCuttable, reloadEnded, type ReloadCutNote } from './reloadLock';
import { fallCovers } from './stillReloadLife';

/**
 * The rifle's poses over the clips (the WEAPON workstream): the **Fire** set the game blends in while the rifle is up
 * (`./weaponRaise`), and the **reload**. An `Animator` pose layer (`addPoseLayer`), so the clip picker and its
 * cross-fade are untouched.
 *
 * **The Fire set.** `FUN_005e0690` 0x5e0690 (decomp lines 494790-494801) pairs twelve anim types with their Fire
 * versions through `FUN_005e1bf0` (the table at `animset+0x5c`, entry +4); `CZSealBody_Tick_0` 0x57a330 (lines
 * 438828-438860), for a motion slot whose flags carry 0x40, maps the playing type back to its base (`FUN_0058c820`)
 * and on to its Fire version (`FUN_0058c970` → `FUN_005e1a10`), and blends that motion into the slot with the raise
 * weight (`FUN_0028bdd0(weight, ...)`); a type with no Fire version (the strafes, the jumps) blends nothing. The types'
 * clips are `READERC.ZAR/animset.rdr`'s "Seal anim set" (and the GLOBAL set it includes for `seal_walk`/`seal_jog`,
 * the clips the viewer's picker plays for Walk and Jog): Stand → `seal_fp_stand`, Walk → `seal_fp_walk` ... below.
 * The `fp` is "fire pose", not first person: "Fire stand" names `seal_fp_stand` (animset.rdr). Its rifle is at the
 * shoulder: the barrel along the body's forward, the sight 15.2 over the feet (research 78's skeleton, MP2).
 *
 * **Not the recoil clips.** `animset.rdr` binds "Rifle recoil" → `seal_recoil` (and the crouch, prone and pistol
 * forms), but no such type name is in the game's image (`socom2_game.elf` holds "Fire stand" and "Rifle reload" and
 * no "recoil" but `RecoilPct`): nothing asks for them, so they are not played. The body's kick is `RecoilPct`'s bend
 * (`./recoilBend`, `FUN_0057b550`; research 442), laid by the animator; `./rifleKick` is the aim's climb, not the body's.
 *
 * **The reload** (research 150; `FUN_005a82e0` 462815-462941) is picked once, at its start, by the body's speed:
 * still (`|v|^2 <= 400`, 462821-462823) the stance's whole-body clip -- "Rifle reload" `seal_reload`, "Rifle crouch
 * reload" `seal_crouch_reload`, "Rifle prone reload" `seal_prone_reload` -- pushed on the action stack as a main-channel
 * play (`FUN_00588bc0` -> `FUN_0028dc90`: a cross-fade over its `BlendTime`, 0.4 when `motion.rdr` gives none); moving,
 * "Moving rifle reload" `seal_mv_reload`, a `BlendOverlay` motion `FUN_00588bc0` (446083-446086) plays on the second
 * channel instead (`FUN_00587780`, `anim+0x180`): laid over the parts it carries at 1.0 (`FUN_00577ea0` 437455-437461),
 * which are the spine from `spinehi`, the arms, the head and the rifle -- never the root or the legs. The still clip is
 * cut (`FUN_00550ef0` 418176-418203 with `FUN_00587c20`) once past its `NoInterrupt` (none standing, 0.35 crouched, 0.5
 * prone) by a move axis or the turn axis over 0.1; the rifle's, the pistol's and the m203's then go on as the family's
 * moving overlay at the phase reached (418205-418226, the clock at 418213), every other reload just ends, and nothing
 * returns to a still clip. The overlay's clock (`FUN_0028d170` 134692-134757) runs keys 0..n-1 at n / `playback` a
 * second and frees the node at the last key; the body cross-fades from the pose on screen over 0.4 s at the overlay's
 * start and end (`OVERLAY_BLEND`). The reload's length as the weapon's lock is `./reloadClip`'s (`reloadSeconds`).
 *
 * The viewer's readings, named:
 * - `PHASE_SHARED`: every Fire version plays at its node's phase -- read since FL-0b (2026-11-14; reading, pending
 *   review): the game makes a second motion for it (`FUN_0028d860(slot, motion, -1)`) chained on the node
 *   (`FUN_0028bdd0`), and `FUN_0028c380` (D:L134213-134216) gives every motion on a node's chain the node's phase,
 *   which `FUN_0028d670` (D:L134881-134903) samples at the motion's own key count; the actor update calls it on each
 *   branch (`FUN_0057a330` D:L438875, D:L438891, D:L438909). Nothing clocks the Fire version on its own. *Was:* a
 *   locomotion cycle's at the base clip's phase, a pose's (stand, crouch, prone, the steps) on its own clock at its own
 *   `playback` -- which ran `seal_fp_step` at its full rate under a crawling turn (AH-4's raised turn in place, finding 18).
 * - The reload's cross-fades were a named placeholder (0.2 s in and out; research 84 §11) until research 150 read
 *   them: the still clip comes in over its `BlendTime` default 0.4 (`FUN_00287620`) and goes out, from its pop (PAR-73;
 *   was its last key), over the next play's (`seal_stand` 0.5); the overlay over the body's 0.4 both ways
 *   (`OVERLAY_BLEND`). 2026-10-03. Since PAR-95 (research 251 section 12.9, 2026-10-14) the still clip's two are the
 *   body's cross-fade from the pose drawn (`PoseLayer.crossFade`), the layer at 1 from its push to its pop, as the
 *   game's snapshot blend is; *was* the layer's own weight easing in and out over the live play.
 */

/**
 * The Fire version of each clip the picker can play (`FUN_005e0690`'s twelve pairs through animset.rdr's names).
 * Keys are the base clips: the Seal set's own and the GLOBAL set's, which the viewer's picker plays.
 */
export const FIRE_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  // Stand (type 1) → Fire stand
  seal_stand: 'seal_fp_stand', seal_stand_alert01: 'seal_fp_stand', seal_stand_alert02: 'seal_fp_stand',
  // Walk (2), Jog (3), Run (4) → Fire walk, Fire jog, Fire run
  seal_walk: 'seal_fp_walk', seal_walk_alert: 'seal_fp_walk', seal_walk_alert02: 'seal_fp_walk',
  seal_jog: 'seal_fp_jog', seal_jog_alert: 'seal_fp_jog', seal_run: 'seal_fp_run',
  // Walk backwards (5), Jog backwards (6)
  seal_walk_bw: 'seal_fp_walk_bw', seal_run_bw: 'seal_fp_run_bw',
  // Step (0x10)
  seal_step: 'seal_fp_step', seal_alert_step: 'seal_fp_step',
  // Crouch (0x12), Crouch walk (0x14), Crouch step (0x15), Crouch walk backwards (0x18)
  seal_crouch: 'seal_fp_crouch', seal_crouch_alert01: 'seal_fp_crouch', seal_crouch_alert02: 'seal_fp_crouch',
  seal_crouchwalk: 'seal_fp_crouchwalk', seal_crouch_step: 'seal_fp_crouch_step', seal_crouchwalk_bw: 'seal_fp_crouchwalk_bw',
  // Prone (0x1a)
  seal_prone: 'seal_fp_prone',
});

/**
 * The pistol's Fire versions (`FUN_005e0690`'s `FUN_005e1af0` pairs, entry +6 of the anim set's table, read through
 * `FUN_0058c970` -> `FUN_005e19d0` when `m_item` is 2): "Pistol fire stand" `seal_pfp_stand` ... twelve, keyed by the
 * base clip as `FIRE_VERSIONS` is; the strafes and the 90-degree runs take the pistol's own strafe and run clips.
 */
export const PISTOL_FIRE_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  seal_stand: 'seal_pfp_stand', seal_stand_alert01: 'seal_pfp_stand', seal_stand_alert02: 'seal_pfp_stand',
  seal_walk: 'seal_pfp_walk', seal_walk_alert: 'seal_pfp_walk', seal_walk_alert02: 'seal_pfp_walk',
  seal_jog: 'seal_pfp_jog', seal_jog_alert: 'seal_pfp_jog', seal_run: 'seal_pfp_run',
  seal_walk_bw: 'seal_pfp_walk_bw', seal_run_bw: 'seal_pfp_run_bw',
  seal_step: 'seal_pfp_step', seal_alert_step: 'seal_pfp_step',
  seal_crouch: 'seal_pfp_crouch', seal_crouch_alert01: 'seal_pfp_crouch', seal_crouch_alert02: 'seal_pfp_crouch',
  seal_crouchwalk: 'seal_pfp_crouchwalk', seal_crouch_step: 'seal_pfp_crouch_step', seal_crouchwalk_bw: 'seal_pfp_crouchwalk_bw',
  seal_prone: 'seal_pfp_prone',
  seal_rstrafe: 'seal_p_rstrafe', seal_lstrafe: 'seal_p_lstrafe', seal_rstrafe_fast: 'seal_p_rstrafe_fast',
  seal_lstrafe_fast: 'seal_p_lstrafe_fast', seal_run_90r: 'seal_p_run_90r', seal_run_90l: 'seal_p_run_90l',
});

// The reload's clips, its still test and its length live in `./reloadClip` (one table with the match server, MJ-1).
export { PISTOL_RELOAD_CLIPS, RELOAD_CLIPS, RELOAD_STILL_SPEED, reloadLength, type ReloadStance } from './reloadClip';

/** Every clip the weapon's layer asks the worker for (the page adds them to `PLAY_CLIPS`). */
export const WEAPON_CLIPS: readonly string[] = [...new Set([
  ...Object.values(FIRE_VERSIONS), ...Object.values(RELOAD_CLIPS),
  ...Object.values(PISTOL_FIRE_VERSIONS), ...Object.values(PISTOL_RELOAD_CLIPS),
  // Web sprint 4 M4: the shotgun reload, the pump and `Rifle m203 reload` (`./reloadClip`'s families).
  ...ALL_RELOAD_CLIPS,
])];

/** The clips the picker plays standing still in each stance (kept for the hook's readers; the reload reads the speed). */
export const STILL_CLIPS: ReadonlySet<string> = new Set(['seal_stand', 'seal_crouch', 'seal_prone']);

/** The body's cross-fade at the second channel's start and its end (`./animator` `OVERLAY_BLEND`, one constant with the swap's). */
export { OVERLAY_BLEND };
/** Every Fire version plays at its node's phase (`FUN_0028c380` D:L134213-134216; FL-0b). Kept as the module's flag. */
export const PHASE_SHARED = true;

/** What the layers are doing, for the hook. */
export interface WeaponPoseStats {
  fire: string | null; fireWeight: number;
  /**
   * The reload clip playing (the overlay: or fading out past its last key), its cross-fade weight (a still clip's 1
   * from its push to its pop since PAR-95: its fades are the body's), whether it is the second channel's, its key.
   */
  reload: string | null; reloadWeight: number; reloadOverlay: boolean; reloadFrame: number;
}

/** A reload clip playing: the still stance's (a main-channel play in the game) or the moving overlay (the second channel). */
interface ReloadRun {
  stance: ReloadStance; family: ReloadItem; clip: MotionClip;
  /** The second channel (`BlendOverlay`): the family's moving clip. */
  overlay: boolean;
  /** Seconds into the clip. */
  t: number;
  /** The clip's seconds: its `playback`, or the record's `ReloadTime` on a still clip (`FUN_005a82e0` 462935-462940). */
  period: number;
  /** The clip's own `playback` (`./reloadClip` `reloadLength`): the end test's half step (PAR-69, `reloadEnded`). */
  playback: number;
  /** `(n - 1) / n`. */
  end: number;
  /** The stick cuts a still clip only past this phase (`NoInterrupt`; absent, the loader's 0: at once). */
  noInterrupt: number;
  /**
   * The cross-fade in, seconds (0: none -- the overlay carrying a cut still clip on, and since PAR-95 every still clip:
   * the body's cross-fade carries the change; *was* the still clip's `BlendTime`).
   */
  fadeIn: number;
  /**
   * The overlay's cross-fade out, seconds, set when its play is over (`outAt`); null while it plays. A still clip's pop
   * is the body's cross-fade since PAR-95 (*was* its fade out, over the play beneath's `BlendTime`).
   */
  fadeOut: number | null;
  /**
   * Seconds into the clip the cross-fade out starts, set with `fadeOut`: the overlay's last key (`FUN_0028d170`
   * D:L134737), the still clip's pop (PAR-73: the frame the driver's end test passes, `reloadEnded`).
   */
  outAt: number;
  /** The still clip's `NoPitchtwist`: the twist is off while it plays (`FUN_00587a30`); never the overlay's. */
  noPitchtwist: boolean;
  /** PAR-79: the still clip covered by the fall (the body in the air): its clock stands, nothing is asked of it. */
  covered: boolean;
  /** PAR-79: the seconds since the landing that handed it back (`step`), null when never covered. */
  back: number | null;
}

/**
 * The two layers, in the order the animator takes them: the Fire version at the raise weight, folded into each play
 * node before the nodes merge (FL-0), then the reload over the merged body. `step` runs the reload's clock once a frame,
 * before the animator's (the Fire version runs at its node's phase, FL-0b). *Was* also `mergeParts`, the Fire versions
 * merged among themselves for the layer laid over the merged body (retired with that layer, FL-0).
 */
export class WeaponPose {
  /** The raise weight (`./weaponRaise`), set once a frame. */
  fireWeight = 0;
  /** The firearm in use (`m_item`): the rifle's or the pistol's Fire versions and reloads. */
  item: 'rifle' | 'pistol' = 'rifle';
  private reload: ReloadRun | null = null;
  /** LATER 530: the run a turret's take cut, kept for the room's refusal of the take (`keepReload`, `resumeReload`). */
  private kept: ReloadRun | null = null;
  /** The `BlendTime` of the clip under the reload layer at its last sample: what a still clip fades out over. */
  private underBlend = BLEND_TIME_DEFAULT;
  /**
   * A cut this frame: the body's cross-fade the next sample asks the animator for (`PoseLayer.crossFade`) -- the second
   * channel's 0.4 (`FUN_0057a010` 438628-438633) when the overlay carries the clip on, the resumed play's `BlendTime`
   * (`FUN_005870e0`'s new play) when the clip just ends -- so no joint jumps whether or not the mover's play changes.
   * PAR-95 (research 251 section 12.9): a still clip's push and its uncut pop ask the same, the push over the clip's
   * own `BlendTime` (`FUN_0028dc90` D:L135215-135220), the pop over the play beneath's (`FUN_0028da00`
   * D:L135042-135043, D:L135100-135103).
   */
  private pendingFade: number | null = null;
  /**
   * PAR-95: the pending cross-fade is a still clip's push, drawn with the clip's own time already run
   * (`PoseLayer.crossFadeRun`: the player's push lands after the frame's driver, PAR-67, and `FUN_00576860` takes the
   * frame's time off before it weighs, D:L436624-436629).
   */
  private pendingRun = false;
  /** PF-18: the last cut of a still clip, until `Fire` takes it (`takeReloadCut`). */
  private cutNote: ReloadCutNote | null = null;
  private readonly now: Pick<WeaponPoseStats, 'fire' | 'fireWeight'> = { fire: null, fireWeight: 0 };

  /**
   * The Fire version of each node of the play, at the raise weight, folded into its node before the nodes merge
   * (`PoseLayer.nodes`; FL-0): nothing laid over the merged body (`sample` lays none).
   */
  readonly fireLayer: PoseLayer = { sample: () => null, nodes: (c) => this.sampleFire(c) };
  /** LATER 1221: `sampleFire`'s list, its node layers and their sampled parts, reused each step. */
  private readonly fireOut: (NodeLayer | null)[] = [];
  private readonly fireLayers: NodeLayer[] = [];
  private readonly fireParts: PartPose[][] = [];
  /** The reload clip: the still stance's whole body or the moving overlay, cross-faded as the game's play and channel are. */
  readonly reloadLayer: PoseLayer = { sample: (c) => this.sampleReload(c) };

  constructor(private readonly clips: ReadonlyMap<string, MotionClip>, private readonly table: MotionTable | null) {}

  /**
   * Advances the layers' own clocks by `dt` seconds. `cut`: a move axis or the turn axis over 0.1 this frame
   * (`FUN_00550ef0` 418182-418185; `./play` `reloadCut`) -- past its `NoInterrupt` (`FUN_00587c20` 445549-445565), and
   * not before `RELOAD_CUT_DELAY_READING` from its start (the push's initial skip, PAR-61: `./reloadLock`
   * `reloadCuttable`), it
   * ends a still reload clip, which the rifle's, the pistol's and the m203's carry on as the family's moving overlay at
   * the phase reached (418205-418226: the overlay's clock set to phase x playback x (n-1)/n at 418213); the prone, the
   * shotgun's and the pump's end there. The overlay's play is over at its last key (its node freed, `FUN_0028d170`
   * 134737); a still clip's when the driver's end test pops it (PAR-73: `./reloadLock` `reloadEnded`, PAR-69's lagged
   * end, `FUN_00582540` D:L418193, `FUN_005870e0` D:L418203) -- a command past its last key without a `ReloadTime`,
   * drawn at its held stop (n-1)/n until then (`FUN_0028c4f0` D:L134260-134266) and cuttable until then, the end asked
   * first (PAR-72: `FUN_00587c20` D:L445526-445528). Then the body cross-fades to what is under it.
   *
   * PAR-79 (research 251 section 12.3, "PAR-79"; PTW.R3 with the room's `cutAt` and `./stillReloadLife`): `airborne`, the
   * body in the air (the snapshot's). The fall covers a still clip (`fallCovers`: not `Rifle m203 reload`) on the first
   * frame in the air (`FUN_005af930` D:L466956-466970) and only the top advances (`FUN_0057a330` D:L438708): its clock
   * stands and nothing is asked of it. Back on the floor it is handed back at that phase (`FUN_0028da00`
   * D:L135104-135107): the landing's frame advances it and asks nothing, its end is asked from the next, its cut from a
   * game frame past the landing (the next driver tick, `FUN_00550ef0` D:L418176). A landing with a clip pops it through
   * `Fire` (`reloadEnd`, `stopReload`), as before.
   */
  step(dt: number, cut = false, airborne = false): void {
    const r = this.reload;
    if (!r) return;
    if (!r.overlay && r.fadeOut === null) {
      if (r.covered) {
        if (airborne) return;                                    // PAR-79: covered, its clock stands
        r.covered = false; r.back = 0; r.t += dt;                // handed back: the landing's frame advances it, asks nothing
        return;
      }
      if (airborne && fallCovers(r.family)) { r.covered = true; return; }
    }
    r.t += dt;
    if (r.back !== null) r.back += dt;
    const over = r.overlay ? r.t >= r.period * r.end : reloadEnded({ period: r.period, playback: r.playback, frames: r.clip.frameCount }, r.t);
    if (r.fadeOut === null && over) {
      // PAR-95 (research 251 section 12.9): a still clip's pop (PAR-73, the frame the driver's end test passes;
      // `FUN_005870e0` D:L445128 -> `FUN_00589aa0` -> `FUN_0028da00` D:L446515) is the body's cross-fade from the pose
      // drawn over the play beneath's `BlendTime` (D:L135042-135043, D:L135100-135103), as its cut's is: the layer is
      // gone from the pop's frame, and the aim's twist comes back with the cross-fade. *Was:* the layer's own weight
      // faded out from the pop over the live play (`fadeOut` = the play beneath's `BlendTime`), the twist back at once.
      if (!r.overlay) {
        this.reload = null; this.pendingFade = this.underBlend; this.pendingRun = false;
        return;
      }
      r.fadeOut = OVERLAY_BLEND;
      r.outAt = r.period * r.end;
    }
    if (r.fadeOut !== null) {
      if (r.t - r.outAt >= r.fadeOut) this.reload = null;
      return;
    }
    // PAR-67: the cut reads the phase a game frame behind the push's clock (`reloadCutPhase`), not the drawn one.
    const phase = reloadCutPhase({ period: r.period, frames: r.clip.frameCount }, r.t);
    if (!cut || r.overlay || !reloadCuttable(r.t, phase, r.noInterrupt)) return;   // PAR-61: the room's count
    if (r.back !== null && r.back < GAME_FRAME_DT) return;       // PAR-79: a game frame past the landing that handed it back
    const clip = carriesOn(r.family, r.stance) ? this.clips.get(reloadClip(r.stance, true, r.family)) : undefined;
    if (!clip) {                                                 // the clip ends: the ground state's play returns
      this.reload = null; this.pendingFade = this.underBlend; this.pendingRun = false;
      this.cutNote = { carried: false, left: 0 };                // PF-18: and the fire's lock with it (FUN_005a7ab0)
      return;
    }
    const period = reloadLength(clip, this.table) ?? clip.duration;
    const next = this.run(r.stance, r.family, clip, true, period);
    next.t = phase * period * next.end;                          // D:L418213: the overlay's clock from the phase the cut read
    // PF-18: the fire is held to the overlay's last key (FUN_005a7ab0 D:L462548-462555): its life x (1 - phase) left.
    this.cutNote = { carried: true, left: carriedLockSeconds(period * next.end, phase) };
    next.fadeIn = 0;                                             // at 1 from its first frame: the body's cross-fade carries the change
    this.pendingFade = OVERLAY_BLEND;
    this.pendingRun = false;
    this.reload = next;
  }

  /**
   * A reload starts (`FUN_005a82e0`): `moving` the body over 20 a second at the start (`./reloadClip` `reloadMoving`), which
   * picks the family's moving overlay standing or crouched; else the stance's still clip. `length`: the clip's seconds
   * -- the still clip's `playback`, or the record's `ReloadTime` (`reloadSeconds`), the moving one's own `playback`.
   * `family`: the clip family (`./reloadClip` `reloadFamily`), else the item's. `startAt` (RELOAD-HITPOSE F1, the port's
   * own timing): seconds the clip's clock starts run on by, as `resumeReload` runs a kept one on by its wait -- another
   * body's reload released on the drawn clock past the tick it was heard under (`./remotePlayers` `frame`); 0 otherwise.
   */
  startReload(stance: ReloadStance, length: number, family: ReloadItem | null = null, moving = false, startAt = 0): void {
    const fam = family ?? this.item;
    const clip = this.clips.get(reloadClip(stance, moving, fam));
    this.kept = null;                                            // LATER 530: a new clip -- a take's kept one is gone
    this.pendingFade = null;
    this.pendingRun = false;
    this.cutNote = null;
    this.reload = clip && length > 0 ? this.run(stance, fam, clip, moving && stance !== 'prone', length) : null;
    if (this.reload && startAt > 0) this.reload.t = startAt;     // F1: run on by the drawn ticks past its mark (`resumeReload`'s `k.t +=`)
    // PAR-95 (research 251 section 12.9): a still clip is pushed on the stack (`FUN_005a82e0` D:L462928 ->
    // `FUN_00588bc0` -> `FUN_0028dc90` D:L446292), which sets the body's snapshot blend over the clip's `BlendTime`
    // (D:L135215-135220): the layer at 1 from its first frame, the body cross-fading from the pose drawn -- the aim's
    // twist in it easing out. *Was:* the layer's own weight faded in over the live play (`fadeIn`), the twist off at
    // once.
    const r = this.reload;
    if (r && !r.overlay) {
      this.pendingFade = entryOf(r.clip.name, this.table)?.blendTime ?? BLEND_TIME_DEFAULT;
      this.pendingRun = true;
    }
  }

  private run(stance: ReloadStance, family: ReloadItem, clip: MotionClip, overlay: boolean, period: number): ReloadRun {
    const entry = entryOf(clip.name, this.table);
    const n = clip.frameCount;
    return {
      stance, family, clip, overlay, t: 0, period, playback: reloadLength(clip, this.table) ?? period,
      end: n < 2 ? 1 : (n - 1) / n, noInterrupt: entry?.noInterrupt ?? 0,
      fadeIn: overlay ? OVERLAY_BLEND : 0, fadeOut: null, outAt: 0,   // PAR-95: a still clip's is the body's cross-fade
      noPitchtwist: !overlay && (entry?.noPitchtwist ?? false), covered: false, back: null,
    };
  }

  /**
   * REMOTE-RELOAD's review F1: a still reload clip crouched or prone is playing -- the clip the page's own reload holds
   * the mover to (`./walk` `WalkMode.holdReload`, `./mover` `reloadHold`), so the one a flinch's pop ends
   * (`./fire` `reloadEndOfBody`, family 'reload'). A standing still clip and a moving overlay hold none.
   */
  stillHeld(): boolean {
    const r = this.reload;
    return r !== null && !r.overlay && r.fadeOut === null && r.stance !== 'stand';
  }

  /**
   * The reload stops: `completed` (`Fire`'s lock run out) lets a clip whose play is over finish its cross-fade out --
   * the overlay's, or a still clip's popped (PAR-95: the body's, its request kept if not yet drawn; *was:* cleared
   * with no clip left); otherwise (a new map, leaving the walk, a cut-short magazine) the clip is gone at once.
   */
  stopReload(completed = false): void {
    if (!completed || (this.reload !== null && this.reload.fadeOut === null)) {
      this.reload = null; this.pendingFade = null; this.pendingRun = false;
    }
    this.cutNote = null;
  }

  /**
   * LATER 530 (R2 of LATER 526's second re-look; research 215 s8.6 "A1"): the turret's take, sent at send time, cuts the
   * reload clip (`Fire.mountTake`'s `reloadEnd`, `kept`; `stopReload` follows): the run as it stands is kept for the room's
   * refusal of the take (`resumeReload`). None playing: none kept. A new reload (`startReload`) drops it.
   */
  keepReload(): void {
    this.kept = this.reload ? { ...this.reload } : null;
  }

  /**
   * LATER 530: the room refused the take -- `FUN_005463c0` refuses before its take's steps (D:L412131-412166), so the
   * original's clip was never popped (`FUN_0058c350` D:L447983-447992) and played on through the wait. The kept run goes
   * back on the body, its clock run on by `wait` (the seconds the take stood: `Fire`'s one clock with the kit's timer,
   * `reloadResume`'s `wait` -- this layer counts none of its own). Pushed again with the body's cross-fade, the still
   * clip's over its `BlendTime` as its push asks (`FUN_0028dc90` D:L135215-135220), the overlay's over the second
   * channel's 0.4 (`OVERLAY_BLEND`), since this page drew the take's cut: the page's repair of its own send-time cut, not
   * what the original does at a refusal (its clip was never cut). Once; nothing when none was kept, a clip plays since, or
   * the kept clip's play ran out in the wait. True when laid back.
   */
  resumeReload(wait: number): boolean {
    const k = this.kept;
    this.kept = null;
    if (!k || this.reload) return false;
    k.t += Math.max(0, wait);
    if (k.back !== null) k.back += Math.max(0, wait);
    const over = k.overlay ? k.t >= k.period * k.end : reloadEnded({ period: k.period, playback: k.playback, frames: k.clip.frameCount }, k.t);
    if (k.fadeOut !== null || over) return false;
    this.reload = k;
    this.cutNote = null;
    this.pendingFade = k.overlay ? OVERLAY_BLEND : entryOf(k.clip.name, this.table)?.blendTime ?? BLEND_TIME_DEFAULT;
    this.pendingRun = false;
    return true;
  }

  /**
   * PF-18 (ruling PF.R37; research 150 §3.7, 218 §2): the still clip's cut since the last call, once -- whether the
   * overlay carries on and the seconds left to its last key (0: nothing carries on) -- for `Fire`'s lock
   * (`FireSource.reloadCut`, through `./play` `Play.takeReloadCut`); null when there was none.
   */
  takeReloadCut(): ReloadCutNote | null {
    const n = this.cutNote;
    this.cutNote = null;
    return n;
  }

  /** Whether a reload clip is playing (its cross-fade out included). */
  reloading(): boolean {
    return this.reload !== null;
  }

  /**
   * The reload's length in a stance, moving or not: the clip's `playback` (null without the clip) -- of `family`, else
   * the item's -- or the record's `ReloadTime` when still (`./reloadClip` `reloadSeconds`).
   */
  reloadSeconds(stance: ReloadStance, moving: boolean, family: ReloadItem | null = null, reloadTime = 0): number | null {
    return reloadSeconds(this.clips, this.table, stance, moving, family ?? this.item, reloadTime);
  }

  /** `FUN_005a82e0`'s choice: prone the prone reload; else moving the overlay, still the stance's; the family's set. */
  reloadClip(stance: ReloadStance, moving: boolean, family: ReloadItem | null = null): string {
    return reloadClip(stance, moving, family ?? this.item);
  }

  stats(): WeaponPoseStats {
    const r = this.reload;
    return { ...this.now, reload: r?.clip.name ?? null, reloadWeight: r ? weightOf(r) : 0, reloadOverlay: r?.overlay ?? false, reloadFrame: r ? frameOf(r) : 0 };
  }

  /**
   * FL-0 (seat 8a's finding 16; research 217 s3.6c; reading, pending review): each node's own Fire version, aligned with
   * `current.nodes`, at the raise weight -- the sub-node `FUN_0057a330` (D:L438828-438859) hangs on each node of a play
   * flagged 0x40 whose type has one (`FUN_0058c820` -> `FUN_0058c970`, the launcher set excluded, D:L438829), with
   * `FUN_0028bdd0(raise, ...)` (D:L133955-133964), which `FUN_00577ea0` folds into that node before the nodes merge
   * (`./animator` `foldSub`). A node with none (the strafes, the 90-degree runs) takes none and keeps its whole share in
   * the merge. *Was:* the Fire versions merged among themselves and laid over the merged body at the raise weight times
   * their nodes' share, which cut the lateral clip's share (at a raised 45-degree run the hips about -31 against the
   * original's -54.7, AH-4 q16 `st-full45`).
   *
   * `stats()`: the Fire clip of the heaviest node that has one, and the raise weight times the share of the play's
   * weight those nodes hold (as before: how much of the body is the Fire set's).
   */
  private sampleFire(current: LayerContext): (NodeLayer | null)[] | null {
    this.now.fire = null;
    this.now.fireWeight = 0;
    if (!(this.fireWeight > 0)) return null;
    const versions = this.item === 'pistol' ? PISTOL_FIRE_VERSIONS : FIRE_VERSIONS;
    const nodes = current.nodes ?? [{ clip: current.clip, frame: current.frame, phase: current.phase, weight: 1 }];
    let total = 0, share = 0;
    let lead: { fire: MotionClip; weight: number } | null = null;
    for (const n of nodes) {
      total += n.weight;
      const name = versions[n.clip.name];
      const fire = name ? this.clips.get(name) : undefined;
      if (!fire || !(n.weight > 0)) continue;
      share += n.weight;
      if (!lead || n.weight > lead.weight) lead = { fire, weight: n.weight };
    }
    if (!lead || !(total > 0)) return null;
    // LATER 1221 (a browser adaptation, the same floats): the layer's list, each node's layer and its sampled parts are
    // this pose's own, rewritten each step (the animator reads them in the step and keeps none: `PoseLayer`'s contract).
    const out = this.fireOut;
    out.length = nodes.length;
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k]!;
      const name = versions[n.clip.name];
      const fire = name ? this.clips.get(name) : undefined;
      if (!fire || !(n.weight > 0)) { out[k] = null; continue; }
      const entry = entryOf(fire.name, this.table);
      // FL-0b: at its node's phase, whatever the clip (`PHASE_SHARED`: FUN_0028c380 D:L134213-134216, FUN_0028d670
      // D:L134881-134903). *Was:* a still Fire clip on the layer's own clock over its `playback` seconds.
      const parts = this.fireParts[k] ?? (this.fireParts[k] = []);
      sampleClipInto(fire, n.phase * fire.duration, { loop: entry?.looped ?? true }, parts);
      parts.length = fire.parts.length;                            // exactly the clip's parts, as `sampleClip` gave
      const layer = this.fireLayers[k] ?? (this.fireLayers[k] = { parts, weight: 0 });
      layer.parts = parts; layer.weight = this.fireWeight;
      out[k] = layer;
    }
    this.now.fire = lead.fire.name;
    this.now.fireWeight = this.fireWeight * Math.min(1, share / total);
    return out;
  }

  /**
   * The reload clip over the pose below: the parts it carries at its key, blended by its cross-fade weight; a still clip
   * says `noPitchtwist` while it plays (`FUN_00587a30` reads the main channel's clip: the overlay leaves the locomotion's).
   */
  private sampleReload(current: LayerContext): {
    parts: readonly PartPose[]; weight: number; noPitchtwist?: boolean; crossFade?: number; crossFadeRun?: number; push?: boolean;
  } | null {
    const r = this.reload;
    const crossFade = this.pendingFade ?? undefined;
    const run = this.pendingRun && r ? r.t : undefined;          // PAR-95: a still clip's push, its time run
    this.pendingFade = null;
    this.pendingRun = false;
    if (!r) return crossFade !== undefined ? { parts: [], weight: 0, crossFade } : null;
    this.underBlend = entryOf(current.clip.name, this.table)?.blendTime ?? BLEND_TIME_DEFAULT;
    const parts = sampleClip(r.clip, frameOf(r) / r.clip.rate, { loop: false }).parts;
    return {
      parts, weight: weightOf(r), noPitchtwist: r.noPitchtwist && r.fadeOut === null, crossFade,
      ...(run !== undefined ? { crossFadeRun: run, push: true } : {}),   // the review's F1: a push, whatever else started
    };
  }
}

/** The phase, 0..`end`: t over playback x (n-1)/n (`FUN_0028d170` 134705 for the overlay; the one-shot's rate for the still clip). */
function phaseOf(r: ReloadRun): number {
  return Math.min(r.end, r.t / (r.period * r.end));
}

/**
 * The clip's key at `t`: the overlay's is t / playback x n (`FUN_0028d670` from `FUN_0028d170` 134703), a still one-shot's
 * phase x n (`FUN_0028c4f0`, `./animator`); both stop at n - 1 -- key n is the closing copy of key 0 (research 77 §5).
 */
function frameOf(r: ReloadRun): number {
  const n = r.clip.frameCount;
  return Math.min(n - 1, Math.max(0, r.overlay ? (r.t / r.period) * n : phaseOf(r) * n));
}

/**
 * The cross-fade weight: in over `fadeIn` from the start, out over `fadeOut` from `outAt` -- the overlay's last key --
 * by `blendWeight`'s ease. A still clip's is 1 (PAR-95: its push and its pop are the body's cross-fade; *was* in over
 * its `BlendTime` and out from its pop, PAR-73).
 */
function weightOf(r: ReloadRun): number {
  const win = r.fadeIn > 0 ? blendWeight(Math.min(1, r.t / r.fadeIn)) : 1;
  if (r.fadeOut === null) return win;
  const wout = r.fadeOut > 0 ? 1 - blendWeight(Math.min(1, (r.t - r.outAt) / r.fadeOut)) : 0;
  return Math.min(win, wout);
}
