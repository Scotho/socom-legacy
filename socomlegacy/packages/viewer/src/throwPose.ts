import { HAND_ANIMS, handAnim, PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM, sampleClip, THROW_ANIMS, type MotionClip, type ThrowAnim } from '@s2u/scene';
import type { LayerContext, PoseLayer } from './animator';
import { BLEND_TIME_DEFAULT, entryOf, motionOf, type Motion } from './locomotion';
import type { MotionTable } from './motionTable';
import type { ActionEnd } from './mover';

/**
 * The throw's clip on the body (the grenades workstream; socomlegacy/docs/research/85 §3): the clip `GetThrowAnim` picked,
 * played as the game plays a one-shot and laid over the locomotion as an `Animator` pose layer, the way the weapon's
 * reload is (`./weaponPose`) -- the clip picker and its cross-fade untouched.
 *
 * - **The clock** is the one-shot rule the motion workstream read (`./locomotion`, `FUN_0028c4f0`): the phase runs at
 *   `1 / (playback (n - 1) / n)` a second to its stop at `(n - 1) / n`, the key sampled `phase x n`; the release
 *   fraction is a phase (`@s2u/scene`'s `releaseSeconds`), so the hand lets go on the clip's own frame.
 * - **A throw is the action stack's top play** (PAR-85, research 251 section 12.9; reading, pending review): the stack
 *   draws its top alone (`FUN_00577ea0` D:L437430-437455), so the layer stands at weight 1 from its first key to its pop
 *   (`PoseLayer.top`). Its push asks the body's cross-fade from the pose drawn over the clip's `BlendTime` (0.2 on the
 *   crouched throw, else `FUN_00287620`'s 0.4; `FUN_0028dc90` D:L135215-135220, eased by `FUN_00576860`); its pop --
 *   the mover's hold's end, whatever its reason (`throwPoseEnds`), or the clip's last key when no hold carries it --
 *   drops the layer and asks the cross-fade over the uncovered play's `BlendTime` (`FUN_0028da00` D:L135100-135103: the
 *   run's 0.4, the idle's 0.5). A part the clip lacks is not written and holds the pose drawn
 *   (`PISTOL_ONESHOT_PARTS_READING`); the clip's `NoPitchtwist` turns the aim's twist off from the push to the pop
 *   (`FUN_00587a30`). *Was* (PAR-76's `RUNNING_THROW_BODY_READING` `'locomotion'`): a layer fading in linearly over the
 *   `BlendTime` and out linearly over `BLEND_TIME_DEFAULT` from the clip's last key, over the live locomotion.
 * - **A placing** (the claymore's, C4's, the bomb's plant) is the same stack push and the same sampler (NU-8b B3,
 *   research 326 section 3, R326.6: `Place claymore` and `Put on wall` through `FUN_0057d540` -> `FUN_00588bc0` ->
 *   `FUN_0028dc90`, D:L446292; reading, pending review): the stack's top as a throw is, popped at its hold's end
 *   whatever the reason (the claymore's lagged 158th command, C4's 142nd, the bomb's 156th: PAR-74, PAR-75). *Was*: a
 *   layer in over its `BlendTime`, out over `BLEND_TIME_DEFAULT` once the clip held its last key or its hold was cut
 *   [reading: the same stack's top, read for the throws by PAR-85; the placings' not built]. That layer stays for a clip
 *   outside `TOP_CLIPS`, which no throw or placing is since.
 * - **The callbacks**: `motion.rdr`'s `zanim_callback`s on the clip (`throw_whoosh` at 0.45 on the standing throw: the
 *   grunt `.MALE_GRUNT`) as the phase crosses them, for the page's audio.
 * - **The pistol's versions** (`@s2u/scene` `handAnim`, research 85 s8.1): most are upper-body clips (`seal_p_throwgrenade`
 *   16 parts, `seal_p_tossgrenade` 15, `seal_p_put_onwall` 16): the layer lays only the parts the clip carries
 *   [reading: PISTOL_ONESHOT_PARTS_READING].
 * - **The others' bodies** (`follow`, `./remotePlayers`): the mover's hold rides the body on the wire (`./net/body`, the
 *   hold code in `BodyState.flags`); a throw's or a placing's hold starts its clip there, the pistol's version with the
 *   sidearm in that body's hand, and it pops on the frame its hold leaves the body (a placing since NU-8b B3).
 */

/**
 * The parts a pistol one-shot does not carry, by family [reading]. PAR-85 (research 251 section 12.9, B4; reading,
 * pending review): read -- the stack's sampler writes only the parts the top's motion has a track for (`FUN_005777d0`
 * D:L437202-437285, `FUN_00577700` D:L437155-437167), and a part's value lives on from frame to frame, so a part the
 * top lacks holds the pose drawn at its push (`'push'`: `seal_p_throwgrenade` and `seal_p_tossgrenade` lack the root,
 * `hips` and every leg part -- the legs stand frozen mid-stride through a pistol throw from the run). Built for the
 * throws by PAR-85, for the placings by NU-8b B3 (research 326 section 3: the same push and sampler, R326.6; reading,
 * pending review): `seal_p_put_onwall`'s and `seal_p_place_claymore`'s missing parts hold the pose drawn at the push
 * too. *Was* `{ throw: 'push', place: 'beneath' }` (PAR-85: the placings' layer not the stack's top yet), and before it
 * `'beneath'` for every pistol one-shot (research 85 s8.1).
 */
export const PISTOL_ONESHOT_PARTS_READING: Readonly<Record<'throw' | 'place', 'push' | 'beneath'>> = Object.freeze({ throw: 'push', place: 'push' });

/**
 * PAR-85 (research 251 section 12.9; reading, pending review) [reading]: what the body draws under a throw let go on
 * the run -- `'snapshot'`: the stack draws its top alone (`FUN_00577ea0` D:L437430-437455), and the push's snapshot,
 * the pose drawn the frame of the push (the run at the phase its clock stops at), carries the legs into the throw, eased
 * out over the throw's `BlendTime` (`FUN_0028dc90` D:L135215-135220, `FUN_00576860` D:L436624-436634); the pop draws the
 * run again at its kept phase, eased in over its own `BlendTime` (`FUN_0028da00` D:L135100-135107). Built: `ThrowPose`
 * as the top (`PoseLayer.top`) and `./animator`'s play kept under a standing throw's hold (`THROW_LOW_STANCE_POP_READING`).
 * A capture of a running throw proves it. *Was* `'locomotion'` (PAR-76, research 251 section 12.6): the layer over the
 * live locomotion, which the hold set idle, so the run cross-faded to the idle under the layer's fade-in and back after
 * the cut.
 */
export const RUNNING_THROW_BODY_READING = 'snapshot' as const;

/** Every throw and placing clip the page asks the worker for, the pistol's too (the page adds them to `PLAY_CLIPS`). */
export const THROW_CLIPS: readonly string[] = [...new Set(HAND_ANIMS.map((a) => a.clip))];

/**
 * The throws' and the placings' clips, the rifle's and the pistol's (`GetThrowAnim`'s table, `Place claymore`, `Put on
 * wall`, `handAnim`): each the stack's top (PAR-85; the placings since NU-8b B3, research 326 section 3). *Was* the
 * throws' alone.
 */
const TOP_CLIPS: ReadonlySet<string> = new Set([...Object.values(THROW_ANIMS), PLACE_CLAYMORE_ANIM, PUT_ON_WALL_ANIM].flatMap((a) => [a.clip, handAnim(a, true).clip]));

/** Every throw and placing by its clip: the hold codes' names (`HOLD_CLIPS`) among them. */
const BY_HOLD: ReadonlyMap<string, ThrowAnim> = new Map(HAND_ANIMS.map((a) => [a.clip, a]));

/** The throw or placing a hold clip is, the pistol's version in a pistol hand (`handAnim`), or null (a reload's hold). */
export function holdAnim(clip: string | null, pistol: boolean): ThrowAnim | null {
  const a = clip === null ? undefined : BY_HOLD.get(clip);
  return a ? handAnim(a, pistol) : null;
}

/**
 * PAR-19 D08 (research 251 section 4.2): whether a mover's end (`Walker.onActionEnd`) ends the throw's pose. A throw's
 * or a placing's hold, whatever the reason: its pop is the hold's end (PAR-85 B3, research 251 section 12.9 -- the
 * uncut end on the lagged clock's 91st command, PAR-70, not the clip's last key on the pose's own clock; a placing's
 * since NU-8b B3, research 326 section 3 -- the claymore's lagged 158th, C4's 142nd, the bomb's 156th, PAR-74, PAR-75).
 * *Was*: the throw's own end `complete` left to the pose's clock (before PAR-85), and a placing's until NU-8b -- its
 * hold's end heard only when taken off before its clip's end (the stick's cut past `NoInterrupt`, `FUN_00550ef0`
 * D:L418180-418190 with `FUN_00587c20` D:L445549-445564; a knock; another action). The page's own death is not a
 * mover's end: the thrower's `cut` stops the pose (`./matchThrow`, THROW-INTERRUPT), and the hold's later end finds it
 * stopped.
 */
export function throwPoseEnds(end: ActionEnd): boolean {
  const b = end.body;
  if (!b || b.source !== 'hold') return false;
  return b.family === 'throw' || b.family === 'place';
}

/** Where the clips come from once the source's pack is in (`Play.motionSource`). */
export type ThrowClipSource = () => { clips: ReadonlyMap<string, MotionClip>; table: MotionTable | null } | null;

export interface ThrowPoseStats { clip: string | null; phase: number; weight: number; elapsed: number }

export class ThrowPose {
  private motion: Motion | null = null;
  private elapsed = 0;
  private phase = 0;
  private weight = 0;
  private fired = new Set<string>();
  /** PAR-19 D08: the clock the body's hold came off at (`cut`), or null -- a placing's. */
  private cutAt: number | null = null;
  /** PAR-85: the clip is a throw or a placing, the action stack's top play (`TOP_CLIPS`). */
  private top = false;
  /** PAR-85 B3: a mover's hold carries the throw, so its pop is the hold's end (`cut`), not the clip's last key. */
  private held = false;
  /** PAR-85: the throw popped; the next sample drops the layer and asks the body's cross-fade. */
  private popped = false;
  /** PAR-85: the push's cross-fade the next sample asks for (the clip's `BlendTime`), or null. */
  private pushFade: number | null = null;
  /** The seconds of the last `step`: the cross-fade's time already run when it is drawn (`PoseLayer.crossFadeRun`). */
  private lastDt = 0;
  /** LATER 529 (F1 of its review): the wait's seconds past the hand's opening, run on once the hand has let go (`released`). */
  private owed = 0;
  private due = false;
  /**
   * LATER 529 (F3 of LATER 526's review): the clip as the turret's take found it (`keep`), and the seconds run since
   * (`wait`, counted by `step`), until the room's word on the take (`resume`). Null: none kept.
   */
  private kept: {
    motion: Motion; elapsed: number; phase: number; fired: Set<string>; cutAt: number | null; top: boolean; held: boolean; wait: number;
  } | null = null;
  /** The pose layer: `Play.addPoseLayer` lays it over the clips. */
  readonly layer: PoseLayer = { sample: (c) => this.sample(c) };

  constructor(private readonly source: ThrowClipSource) {}

  /**
   * The throw's clip starts now; false without the clip (the grenade still flies, from the table's hand). `held`: a
   * mover's hold carries it (the page's `Walker.hold` took it, or the others' hold on the wire), so a throw pops at the
   * hold's end (`cut`); without one a throw pops the frame after its last key.
   */
  start(anim: ThrowAnim, held = false): boolean {
    const src = this.source();
    const clip = src?.clips.get(anim.clip);
    if (!src || !clip) { this.stop(); return false; }
    this.motion = motionOf(clip, entryOf(clip.name, src.table));
    this.owed = 0; this.due = false;
    this.elapsed = 0;
    this.phase = 0;
    this.fired = new Set();
    this.cutAt = null;
    this.top = TOP_CLIPS.has(clip.name);
    this.held = held && this.top;
    this.popped = false;
    this.weight = this.top ? 1 : 0;
    this.pushFade = this.top ? this.motion.blendTime : null;   // FUN_0028dc90 D:L135218-135220: the top's BlendTime
    return true;
  }

  /**
   * The body's hold came off (`throwPoseEnds`), or the page's death cut it (`./matchThrow`'s `cut`). A throw or a
   * placing pops (PAR-85 B1, B3; the placings since NU-8b B3): the layer drops and the body cross-fades from the pose
   * drawn onto the play beneath, once -- a second call finds it popped or stopped. *Was*, for a placing (PAR-19 D08,
   * research 251 section 4.2): the clip stopped where it was and the layer faded out from then over the play's out-blend
   * (`BLEND_TIME_DEFAULT`); a clip outside `TOP_CLIPS` still does.
   */
  cut(): void {
    if (!this.motion) return;
    if (this.top) { this.pop(); return; }
    if (this.cutAt === null) this.cutAt = this.elapsed;
  }

  /**
   * The others' bodies: the hold their mover carries this frame (`BodyState`'s hold code, `./net/body`), and whether the
   * sidearm is in that hand, and the hold's start parity (`BodyFlag.HoldSerial`, `Walker.holdStarts`' low bit). A throw's
   * or a placing's hold that was not there last frame -- another code, or the same code with the parity flipped (the next
   * throw with no frame of no hold between) -- starts its clip. A throw or a placing on top pops when its hold changes
   * or leaves the body (PAR-85 B3; the placings since NU-8b B3 -- *was*: a placing's clip ran out on its own clock).
   */
  follow(clip: string | null, pistol: boolean, serial = 0): void {
    const was = this.followed, wasSerial = this.followedSerial;
    this.followed = clip;
    this.followedSerial = serial;
    if (clip === was && (clip === null || serial === wasSerial)) return;
    if (this.top && this.motion && !this.popped) this.pop();
    const a = holdAnim(clip, pistol);
    if (a) this.start(a, true);
  }
  private followed: string | null = null;
  private followedSerial = 0;

  /**
   * PAR-85 F1 (the review of 968035b80): the hand emptied (`GrenadeThrower`'s `equip(false)`: the slot's last throw lets
   * the hand go at its clip's last key, `finishThrow`, a couple of frames before the mover's hold comes off on its lagged
   * clock). A throw a hold carries is still the stack's top: it stays, and pops at the hold's end with the body's
   * cross-fade as every throw does (`cut`, `holdOn`). Anything else stops at once (`stop`).
   */
  letGo(): void {
    if (this.top && this.held && this.motion && !this.popped) return;
    this.stop();
  }

  /**
   * PAR-85 F1: whether the page's own mover still holds a kit one-shot this frame (`PlaySnapshot.hold`; false in fly mode
   * or with no mover). A throw a hold carries pops when none is on -- the hold's end the walk relays (`throwPoseEnds`)
   * pops it the same frame; this covers a hold that left with its mover (a respawn's new body), whose end no one hears.
   */
  holdOn(on: boolean): void {
    if (!on && this.top && this.held && this.motion && !this.popped) this.pop();
  }

  /**
   * LATER 529 (F3 of LATER 526's review; research 215 s8.6 "A1"): the turret's take, sent at send time, is about to pop the
   * body's stack (`FUN_0058c350` D:L447983-447988), its hold's end 'replaced' popping this clip (`throwPoseEnds`): the
   * clip as it stands is kept, its clock counted on through the wait, for the room's refusal (`resume`). Nothing on the
   * body: none kept.
   */
  keep(): void {
    this.kept = this.motion && !this.popped ? {
      motion: this.motion, elapsed: this.elapsed, phase: this.phase, fired: new Set(this.fired), cutAt: this.cutAt,
      top: this.top, held: this.held, wait: 0,
    } : null;
  }

  /**
   * LATER 529 (F3): the room refused the take -- `FUN_005463c0` refuses before any of its take's steps (D:L412131-412166),
   * so the original's stack was never popped and the clip played on through the wait. The kept clip goes back on the
   * body, run on by the wait's seconds (the hold the walk laid back has run its commands too, `WalkMode.mountUntake`);
   * pushed again as the stack's push asks, the cross-fade over its `BlendTime` from the pose drawn (`FUN_0028dc90`
   * D:L135215-135220), since this page drew the take's pop. That cross-fade is the page's repair of its own send-time pop
   * (research 215 s8.6 "A1"), not what the original does at a refusal: its clip was never popped and never pushed again.
   * Once; nothing when none was kept or another clip plays since (a new throw).
   *
   * Returns the callbacks the wait crossed (their zAnim names; null: nothing laid back), for the page to play at the
   * refusal: the original heard them through the wait, this page's popped clip did not (the review's F3), so they are
   * played late, not dropped.
   *
   * `overrun` (the review's F1: one clock with the hand): the seconds of the wait that ran past the hand's opening
   * (`GrenadeThrower.mountUntake`). The clip is laid back at the hand's opening, the release phase, for the let-go to read
   * the posed hand there; the overrun is run on from the let-go (`released`).
   */
  resume(overrun = 0): string[] | null {
    const k = this.kept;
    this.kept = null;
    if (!k || this.playing()) return null;
    this.motion = k.motion; this.elapsed = k.elapsed; this.phase = k.phase; this.fired = k.fired; this.cutAt = k.cutAt;
    this.top = k.top; this.held = k.held;
    this.popped = false;
    this.weight = this.top ? 1 : 0;
    this.pushFade = this.top ? k.motion.blendTime : null;
    this.owed = Math.min(Math.max(0, overrun), k.wait);
    this.due = false;
    const heard = this.step(k.wait - this.owed);                // the wait's run to the hand's opening
    this.lastDt = 0;                                            // the push's cross-fade: no tick run on it yet
    return heard;
  }

  /** LATER 529 (F1): the hand has let go -- the overrun the wait ran past its opening is run on at the next `step`. */
  released(): void {
    this.due = this.owed > 0;
  }

  /** Stops at once (a new map, leaving the walk): no pop's cross-fade. */
  stop(): void {
    this.owed = 0; this.due = false;
    this.motion = null;
    this.weight = 0;
    this.top = false;
    this.held = false;
    this.popped = false;
    this.pushFade = null;
    this.cutAt = null;
  }

  /** Whether a clip is on the body: a throw or a placing until its pop (a clip outside `TOP_CLIPS`, until its fade has run out). */
  playing(): boolean {
    return this.motion !== null && !this.popped;
  }

  /** Advances the clock by `dt`; returns the callbacks the phase crossed (their zAnim names). */
  step(dt: number): string[] {
    this.lastDt = dt;
    if (this.kept) this.kept.wait += dt;                         // LATER 529: the take's wait, counted for `resume`
    if (this.due) { dt += this.owed; this.owed = 0; this.due = false; }   // LATER 529 (F1): the overrun, after the let-go
    const m = this.motion;
    if (!m || this.popped) return [];
    // A throw no hold carries (the mover refused it: no mover's end to follow) pops the frame after its last key was drawn.
    if (this.top && !this.held && this.phase >= m.end) { this.pop(); return []; }
    this.elapsed += dt;
    const a = m.frames < 2 ? 1 : (m.frames - 1) / m.frames;
    // playback ((n - 1) / n)^2 seconds, or a placing's cut (PAR-19 D08): the phase held there, the fade out from it
    const played = Math.min(m.period * a * m.end, this.cutAt ?? Infinity);
    this.phase = Math.min(m.end, Math.min(this.elapsed, played) / (m.period * a));
    let blendOut = 1;
    if (this.top) this.weight = 1;                              // the top: drawn alone, at 1, to its pop
    else {
      const blendIn = m.blendTime > 0 ? Math.min(1, this.elapsed / m.blendTime) : 1;
      blendOut = this.elapsed <= played ? 1 : Math.max(0, 1 - (this.elapsed - played) / BLEND_TIME_DEFAULT);
      this.weight = Math.min(blendIn, blendOut);
    }
    const out: string[] = [];
    for (const c of m.callbacks) {
      if (this.phase >= c.phase && !this.fired.has(c.name)) { this.fired.add(c.name); out.push(c.name); }
    }
    if (blendOut <= 0) this.stop();
    return out;
  }

  stats(): ThrowPoseStats {
    return { clip: this.playing() ? this.motion!.name : null, phase: this.phase, weight: this.weight, elapsed: this.elapsed };
  }

  /** PAR-85: the throw comes off the stack (its hold's end, or its last key with none). */
  private pop(): void {
    if (this.popped) return;
    this.popped = true;
    this.weight = 0;
    this.pushFade = null;
  }

  private sample(current: LayerContext): ReturnType<PoseLayer['sample']> {
    const m = this.motion;
    if (!m) return null;
    if (this.top) {
      if (this.popped) {
        // The pop (FUN_0028da00 D:L135100-135103): the layer drops and the body cross-fades from the throw's last drawn
        // pose over the uncovered play's BlendTime -- `current`, the play now under the layer (its main clip's: every
        // running clip's and the stand's first node agree), the frame's tick already run (the pop is in the driver).
        const crossFade = entryOf(current.clip.name, this.source()?.table ?? null)?.blendTime ?? BLEND_TIME_DEFAULT;
        this.stop();
        return { parts: [], weight: 0, crossFade, crossFadeRun: this.lastDt };
      }
      const push = this.pushFade;
      this.pushFade = null;
      const parts = sampleClip(m.clip, (this.phase * m.frames) / m.clip.rate, { loop: false }).parts;
      // The push landed after last frame's driver (the kit's frame, research 251 section 12.9): this frame's tick ran it.
      return { parts, weight: 1, noPitchtwist: m.noPitchtwist, top: true, ...(push !== null ? { crossFade: push, crossFadeRun: this.lastDt } : {}) };
    }
    if (!(this.weight > 0)) return null;
    const key = this.phase * m.frames;
    return { parts: sampleClip(m.clip, key / m.clip.rate, { loop: false }).parts, weight: this.weight };
  }
}
