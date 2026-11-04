import { GAME_FRAME_DT, GameFrameAccumulator, type MotionClip } from '@s2u/scene';
import type { ActionPrompt, ClimbPrompt as HudClimbPrompt } from './hud';
import type { Input } from './gamepad';
import type { MotionEntry } from './motionTable';
import { rippleAnimation, Traversal, TRAVERSAL_CLIP, type ClimbPrompt, type Ripple, type TraversalEvent, type TraversalKind } from './traversal';
import type { EffectPlace } from './effects';
import { groundPolygons, type WalkMode } from './walk';
import { keyboardSite } from './keyboardTesting';
import { chaseActionPress } from './doors';

/**
 * The traversal on the page (web research 86): the moves made for each mover (`WalkMode.useTraversal`), the clips
 * handed to them, the keys, the pad's lanes, the HUD's prompts, the sounds the clips do not already carry, the events,
 * and the hook's view. `main.ts` makes one.
 *
 * **The bindings** (research 86 section 7.4): the game's action button is **Cross** (`controller.rdr` Default:
 * X -> Action, Square -> Jump), its peek **the d-pad's left and right, held** (`FUN_00594cf0`, decomp 453431-453457);
 * `./gamepad`'s `action`, `leanLeft` and `leanRight` lanes carry them. The keyboard, walking: **X** the action (taken on
 * its release, as the game takes the pad's; held, the slide from a ladder's head), **Q** / **E** held the peek left /
 * right (the fly camera's down / up, free on foot).
 *
 * **The HUD** (`./hud`): the climb prompt goes to `Hud.feed`'s `climb` (`hudClimb`); on a ladder the action slot shows
 * the ladder slide's icon (`action_slide.tif`, entry 0x10 "LADDER SLIDE") through `Hud.setAction` (`hudFrame`).
 *
 * **The sounds** (research 86 section 7.5): the clips' `zanim_callback`s -- `ladder_rung` (`.STEP_LADDER`), `climb_up`,
 * `pull_up`, `jump_whoosh` -- reach the audio through the animator's own events (`Play.onEvent` -> `WalkSounds`), as
 * the traversal's clips play in the animator; so do the wade's steps and the fall into water (the bed's `UNDERWATER`
 * material's `.STEP_WATER` / `.FALL_WATER`). What no clip carries is sent here: the slide's `~LADDER_SLIDE` loop, held
 * for the "Ladderslide" clip's whole life at the feet and stopped as it ends (`soundFrame`; PAR-89, research 305 s3:
 * `FUN_00550ef0` D:L418407-418422 -- research 86 s7.5's "one pass at its start" misread `FUN_00344f30`, D:L461031, the
 * handle's lookup at load, as the play), and the slide's landing (`FUN_005af930`'s landing, at the slide's contact
 * speed).
 *
 * **The events** also go out as `s2u:traversal` `CustomEvent`s on `window`, `detail` the `TraversalEvent`.
 */

/** The events' name on `window`. */
export const TRAVERSAL_EVENT = 's2u:traversal';

/** What the hook reports (`__viewer.traversal()`). */
export interface TraversalStats {
  kind: TraversalKind;
  ladder: string | null;
  clip: string | null;
  key: number;
  prompt: ClimbPrompt | null;
  peek: number;
  depth: number;
  ladders: number;
  /** The last few events, newest last. */
  events: TraversalEvent[];
}

/**
 * The sounds the page lends the traversal: the slide's loop, held at a place or let go (`GameAudio.setLadderSlide`), and
 * a landing (`WalkSounds`).
 */
export interface TraversalSounds {
  slide(position: [number, number, number] | null): void;
  land(speed: number, position: [number, number, number]): void;
}

/** The part of `Hud` the ladder's icon needs. */
export interface ActionSlot { setAction(action: ActionPrompt | null, allowed?: boolean): void }

/** The part of `Effects` the water's ripples and splash need. */
export interface TraversalEffects {
  spawn(name: string, place: EffectPlace): { readonly finished: boolean; stop(): void } | null;
  play(name: string, place: EffectPlace): boolean;
}

/** `seal_fall_in_water` (decomp 469892-469896): the splash of a fall into water, once, at the water's point. */
export const FALL_IN_WATER = 'seal_fall_in_water';

/**
 * RIPPLES_AT_ROUND_CLEAR_READING (PAR-10, web research 257 s3): at a round's clear (the round's start, an abandon:
 * `matchMount.ts`'s `roundClear`, `main.ts`'s `clearDecals`) the wading ripples running are stopped and forgotten. The
 * ripples loop until stopped (research 89: `WHILE`/`END_WHILE`); `FUN_005b52b0` stops them only over water, at a band
 * change or a death (`+0xe1` bit 4, D:L469904-469913; research 180 U8), so one left running when the SEAL respawns away
 * from the water would loop there for the rest of the map. What the original's round turn does to a running zAnim is
 * unread: CMPExitState `FUN_00223970` (D:L76084) runs `FUN_0031c880` (D:L219040-219061), whose `FUN_003be800(0x4b5080)`
 * and per-node `FUN_00313620(.., 0)` are not traced to the effect runs. Settled by reading those two, or a capture of a
 * round's turn with the SEAL wading. [reading]
 */
export const RIPPLES_AT_ROUND_CLEAR_READING = 'stopped' as const;

/**
 * LADDER_SLIDE_LOOP_GATE_READING (PAR-89, research 305 s3.3): the slide's loop is held while the walk is on, the SEAL
 * alive and the traversal draws the "Ladderslide" clip (`TRAVERSAL_CLIP.slide`) -- the top action `FUN_00550ef0` tests
 * (`DAT_003def50`, D:L418407; `FUN_00577e40` D:L437398-437411), so neither "Ladder -> slide" nor "Ladderslide land". The
 * block's other gates are not carried: `FUN_005c3780(actor + 0x5e0)` answering non-zero (D:L418342) and the actor's
 * +0x5e1 bit 7 (D:L418390), whose writers are unread, and whether `FUN_00550ef0` runs for a dead actor (the page stops
 * the loop at the death). Settled by reading those writers and the death's path through `FUN_00550ef0`, or a capture
 * of a slide ended by a death. [reading]
 */
export const LADDER_SLIDE_LOOP_GATE_READING = 'walking, alive, the slide clip' as const;

export class TraversalPage {
  private moves: Traversal | null = null;
  private clips: { clips: MotionClip[]; table: ReadonlyMap<string, MotionEntry> | null } | null = null;
  private readonly held = new Set<string>();
  private padLean: -1 | 0 | 1 = 0;
  /** The action button held, on the keyboard (X) and on the pad (Cross). */
  private keyHeld = false;
  private padHeld = false;
  /** LATER 362: the action button's chased pressure (`chaseActionPress`), stepped each game frame (`chaseAction`). */
  private press = 0;
  /** LATER 362b's review F2: the button down at the last chase, and the game frames since its press. */
  private pressDown = false;
  private pressFrames = new GameFrameAccumulator();

  /**
   * LATER 362 (research 92 section 6): one frame of the action button's pressure chase (`FUN_00594cf0` D:L453194-453203,
   * `chaseActionPress`), the pad's or the key's held standing in for the full press -- stepped before the frame's release
   * fires its context, as the original's chase runs before the Action (D:L453218-453243), so the door reads the release
   * frame's value (`actionPress`). LATER 362b's review F2: the chase runs once a game frame (`GAME_FRAME_DT`; ACT.R8, the
   * original's real time on any page rate) -- the page's frames counted into game frames from the press, and the
   * release's own frame its one falling step, as the original's release frame chases before it fires.
   */
  chaseAction(held: boolean, dt: number): void {
    const down = held || this.keyHeld;
    if (down !== this.pressDown) {
      this.pressDown = down;
      this.pressFrames = new GameFrameAccumulator();           // the frames count from the edge
      if (!down) { this.press = chaseActionPress(this.press, false, GAME_FRAME_DT); return; }   // the release's frame
    }
    const n = this.pressFrames.advance(dt);
    for (let k = 0; k < n; k++) this.press = chaseActionPress(this.press, down, GAME_FRAME_DT);
  }

  /** LATER 362: the action button's chased pressure now (the door's `press`). */
  actionPress(): number {
    return this.press;
  }
  /** Browser keyboard safeguard: a development key taken by the dead route stays its own until keyup. */
  private keyRespawnOwned = false;
  /** The actual respawn-dead path, supplied by the shared match actions (research 354); false outside that match. */
  respawnInputActive: () => boolean = () => false;
  /** One fresh press, validated by NetPage before its existing command bit is queued (research 354). */
  pressRespawn: () => boolean = () => false;
  /** Browser consumed-input safeguard: the development capture listener must not start a live hold before keyup. */
  respawnKeyInputActive(): boolean { return this.respawnInputActive() || this.keyRespawnOwned; }
  /**
   * XR-06: a cancel taken while the button was down (`cancelAction`): the hold stays off, and the button's release when
   * it comes fires nothing, until the key and the pad are both up.
   */
  private cancelled = false;
  /** The hook's lean (`__viewer.setLean`), for the tests. */
  hookLean: -1 | 0 | 1 = 0;
  private readonly recent: TraversalEvent[] = [];
  /** Whether the HUD's action slot holds the ladder slide's icon because of us. */
  private slideShown = false;
  /** The effects the water plays through, and the ripple now running per size (`+0x1370` big, `+0x136c` small). */
  private effects: TraversalEffects | null = null;
  private readonly ripples: Record<Ripple['size'], { handle: { readonly finished: boolean; stop(): void }; name: string; place: EffectPlace } | null> = { big: null, small: null };

  constructor(private readonly walk: WalkMode, private readonly sounds: TraversalSounds | null = null) {
    walk.useTraversal((walker, ground) => {
      const t = new Traversal(walker.grid, groundPolygons(ground));
      if (this.clips) t.setClips(this.clips.clips, this.clips.table);
      t.on((e) => this.emit(e));
      this.moves = t;
      return t;
    });
  }

  /** The play clips as the worker sent them (`PlayData`): the traversal's roots come from them. */
  setClips(data: { clips: MotionClip[]; table: [string, MotionEntry][] | null } | null): void {
    this.clips = data ? { clips: data.clips, table: data.table ? new Map(data.table) : null } : null;
    if (this.clips && this.moves) this.moves.setClips(this.clips.clips, this.clips.table);
  }

  /** The traversal on the current mover, or null. */
  traversal(): Traversal | null {
    return this.walk.traversal() === this.moves ? this.moves : null;
  }

  /** The action button, as the keyboard's X, the pad's Cross or a test presses it; false when not walking. */
  action(): boolean {
    if (this.respawnInputActive()) return this.pressRespawn();
    return this.walk.action();
  }

  /**
   * The pad's lanes each frame (`padFrame`): the action held (the slide from a ladder's head reads it held) and taken on
   * its release -- `FUN_00594cf0` (decomp 453194-453225) fires the context action on the button's release edge (state 3),
   * the jump on its press -- and the peek while held.
   */
  padLanes(before: Input, after: Input, dt?: number): void {
    if (dt !== undefined) this.chaseAction(after.action, dt);   // LATER 362: a frame given here, its chase first
    const cancelled = this.cancelled;
    const respawn = this.respawnInputActive();
    this.padHeld = after.action;
    if (!after.action && !this.keyHeld) this.cancelled = false;
    this.pushHold();
    if (this.walk.mode() === 'walk' && !cancelled) {
      if (respawn && !before.action && after.action) this.pressRespawn();
      else if (!respawn && before.action && !after.action) this.action();
    }
    this.padLean = after.leanLeft === after.leanRight ? 0 : after.leanLeft ? -1 : 1;
  }

  /** Whether the keys may act now (false while a menu over the game holds the input: the ARMORY). */
  keysOpen: () => boolean = () => true;

  /** Development X: living Action on release, respawn Action on a nonrepeat press; Q/E peek held (research 354). */
  bindKeys(target: EventTarget = globalThis): void {
    if (!import.meta.env.DEV) return;                                // OT.R29: the keys a development build's only
    keyboardSite('s2u-kb-traversal');
    target.addEventListener('keydown', ((e: KeyboardEvent) => {
      if (!['KeyX', 'KeyQ', 'KeyE'].includes(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.walk.mode() !== 'walk') return;
      const el = e.target;
      if (typeof HTMLElement !== 'undefined' && el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
      if (e.code === 'KeyX' && this.respawnKeyInputActive()) {
        const held = this.keyHeld || this.keyRespawnOwned;
        this.keyHeld = true; this.keyRespawnOwned = true; this.pushHold();
        if (!held && !e.repeat && !this.cancelled && this.keysOpen() && this.respawnInputActive()) this.pressRespawn();
        return;
      }
      if (!this.keysOpen()) return;
      if (e.code === 'KeyX') { this.keyHeld = true; this.pushHold(); return; }
      this.held.add(e.code);
    }) as EventListener);
    if (import.meta.env.DEV) target.addEventListener('keyup', ((e: KeyboardEvent) => {
      this.held.delete(e.code);
      if (e.code !== 'KeyX') return;
      const respawn = this.keyRespawnOwned || this.respawnInputActive();
      this.keyRespawnOwned = false;
      if (!this.keyHeld) { if (!this.padHeld) this.cancelled = false; return; }
      this.keyHeld = false;
      const cancelled = this.cancelled;
      if (!this.padHeld) this.cancelled = false;
      this.pushHold();
      if (!respawn && !cancelled && this.walk.mode() === 'walk') this.action(); // living context only, as the pad's release
    }) as EventListener);
    // XR-06: the window's blur is a cancel (the keyup it swallows is no release): the peek and the hold let go, nothing fired.
    // Codex's P2 on #421: the keyup never comes, so the key's cancel latch (which only a keyup clears) ends here too --
    // the next keydown after refocus is a fresh press (research 354), not the swallowed one's tail.
    target.addEventListener('blur', () => { this.held.clear(); this.cancelAction(); if (!this.padHeld) this.cancelled = false; });
  }

  /**
   * XR-06 (research 214 s4; a port rule: a cancel is never a release): the action button's hold cancelled -- the blur, a
   * menu, the ARMORY, a pad lost, a death (`./actionContext` `ActionLifecycle.cancel`). The hold lets go now, the walk's next
   * command carries no `ActionHeld` (`WalkMode.cancelAction`), and the button's release when it comes fires nothing.
   */
  cancelAction(): void {
    if (this.keyHeld || this.padHeld) this.cancelled = true;
    this.keyHeld = false;
    this.keyRespawnOwned = false;                                    // Codex's P2 on #421: the dead key's ownership ends with the hold
    this.pushHold();
    (this.walk as { cancelAction?: () => void }).cancelAction?.();
  }

  /**
   * The action button held, as the move reads it (`Traversal.holdAction`: the slide from a ladder's head,
   * `FUN_00582540` state 2): the key's or the pad's, and never while the mover is locked or the SEAL dead -- the lean's
   * gate (`WalkMode.lean`, M-1 of review 2): the dead's controller `FUN_00592560` (L451642-451730) reads the respawn
   * press alone, and a locked mover takes no press. Pushed on every edge and each frame (`input`), so a death or a
   * lock while the button is down drops the hold at once.
   */
  /** A selected one-shot contextual action does not hold the bomb or ladder action. */
  holdAllowed: () => boolean = () => true;
  private pushHold(): void {
    const held = (this.keyHeld || this.padHeld) && this.holdAllowed() && !this.cancelled && !this.walk.isLocked() && !this.walk.isDead();
    this.traversal()?.holdAction(held);
  }

  /** One frame, before the walk's: the peek from the keys, the pad and the hook. */
  input(): void {
    this.pushHold();
    const q = this.held.has('KeyQ'), e = this.held.has('KeyE');
    const keys: -1 | 0 | 1 = q === e ? 0 : q ? -1 : 1;
    this.walk.lean(keys !== 0 ? keys : this.padLean !== 0 ? this.padLean : this.hookLean);
  }

  /**
   * One frame of the slide's loop (PAR-89, research 305 s3; LADDER_SLIDE_LOOP_GATE_READING): held at the feet while the
   * "Ladderslide" clip plays, let go otherwise -- on the clip's end (the landing), a death, the walk's end or no mover.
   * Both pages call it each frame, after the walk's.
   */
  soundFrame(): void {
    if (!this.sounds) return;
    const sliding = this.walk.mode() === 'walk' && !this.walk.isDead() && this.traversal()?.pose()?.clip === TRAVERSAL_CLIP.slide;
    this.sounds.slide(sliding ? this.walk.drawnFeet() : null);
  }

  /** The HUD's climb prompt (`Hud.feed`'s `climb`): the step up and the vault use the low icon, as all use one bitmap. */
  hudClimb(): HudClimbPrompt | null {
    const t = this.traversal();
    const p = t && this.walk.mode() === 'walk' ? t.climbPrompt() : null;
    if (!p) return null;
    return { visible: p.visible, kind: p.kind === 'med' || p.kind === 'high' ? p.kind : 'low' };
  }

  /** The ladder's slot on the HUD: `action_slide.tif` while on a ladder (the slide the action button offers). */
  hudFrame(hud: ActionSlot): void {
    const on = this.walk.mode() === 'walk' && this.traversal()?.state().kind === 'ladder';
    if (on && !this.slideShown) hud.setAction('ladder_slide');
    else if (!on && this.slideShown) hud.setAction(null);
    this.slideShown = on;
  }

  /**
   * The map's effects (`./effects`), for the water's ripples and splash -- since PAR-10 both pages' (the firearm's
   * `Effects`; research 257 s3). The ripples the old ones ran are stopped first: they loop until stopped, and the keeper
   * forgets them here.
   */
  setEffects(effects: TraversalEffects | null): void {
    this.clearRipples();
    this.effects = effects;
  }

  /**
   * The ripples running, stopped and forgotten (RIPPLES_AT_ROUND_CLEAR_READING): a round's clear; the next frame in the
   * water starts one afresh.
   */
  clearRipples(): void {
    for (const size of ['big', 'small'] as const) {
      const cur = this.ripples[size];
      if (cur && !cur.handle.finished) cur.handle.stop();
      this.ripples[size] = null;
    }
  }

  /**
   * One frame of the water's effects (`FUN_005b52b0`, decomp 469810-469920): the ripple the water line asks for,
   * following the SEAL (its place moved each frame); a new one only when there is none or the last has ended, a change
   * of pace waiting for it; the other size's stopped on a switch. Dead in the water -- the actor's `+0xe1` bit 4 clear
   * (research 180 U8: the death `FUN_00547af0` clears it) -- both are stopped (D:L469904-469913; research 257 s3.1) and
   * forgotten, and none is started; out of the water (no probe met it, so `FUN_005b52b0` does not run) a death stops
   * nothing.
   */
  effectsFrame(): void {
    const fx = this.effects, t = this.traversal();
    if (t && this.walk.mode() === 'walk' && this.walk.isDead() && t.depth() > 0) { this.clearRipples(); return; }
    const want = t && this.walk.mode() === 'walk' ? t.ripple() : null;
    for (const size of ['big', 'small'] as const) {
      const cur = this.ripples[size];
      if (cur && cur.handle.finished) this.ripples[size] = null;
      if (want && want.size !== size && cur && !cur.handle.finished) { cur.handle.stop(); this.ripples[size] = null; }
    }
    if (!fx || !want) return;
    const cur = this.ripples[want.size];
    if (cur) { cur.place.position = [...want.at]; return; }
    const place: EffectPlace = { position: [...want.at], velocity: [0, 0, 0], normal: [0, 1, 0] };
    const handle = fx.spawn(rippleAnimation(want), place);
    if (handle) this.ripples[want.size] = { handle, name: rippleAnimation(want), place };
  }

  stats(): TraversalStats | null {
    const t = this.traversal();
    if (!t || this.walk.mode() !== 'walk') return null;
    const s = t.state();
    return {
      ...s, prompt: t.climbPrompt(), peek: t.peek(), depth: t.depth(), ladders: t.ladders.length, events: [...this.recent],
    };
  }

  private emit(e: TraversalEvent): void {
    this.recent.push(e);
    if (this.recent.length > 16) this.recent.shift();
    const feet = this.walk.drawnFeet();
    // The slide's loop is `soundFrame`'s (research 305 s3): no one pass at its start.
    if (this.sounds && feet && e.type === 'ladderSlideLand') this.sounds.land(e.speed, feet);
    if (e.type === 'waterLand') this.effects?.play(FALL_IN_WATER, { position: [...e.at], velocity: [0, 0, 0], normal: [0, 1, 0] });
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent(TRAVERSAL_EVENT, { detail: e }));
  }
}
