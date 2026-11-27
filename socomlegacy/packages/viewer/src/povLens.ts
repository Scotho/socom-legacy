import type { WeaponRecord, WeaponStanceName } from '@s2u/scene';
import { ShotCone } from './net/shotCone';
import { Button, TICK_HZ, type Command } from './net/protocol';
import { handReticleType, type ReticleMode } from './reticle';
import { viewLens, type ViewLens } from './sights';
import { BINOCULARS, Zoom, type RenderView, type ZoomView } from './zoom';

/**
 * PV-7a: the watched player's view state -- his zoom run, field of view, far range, lens and reticle bloom -- as a
 * watcher's page rebuilds it from what the wire carries (research 402 sections 2, 3 and 7). **A browser adaptation**
 * (`POV_VIEW_ADAPTATION`, research 402 section 1: the original has no player's view); it changes nothing the game does
 * and nothing the owner's own page draws. Pure: no scene, DOM, network or clock -- time comes in as whole commands.
 *
 * **The zoom: a real `Zoom`, driven to the carried state.** From protocol 16 a body carries its owner's view state
 * (`./zoom`'s 0-12, research 402 section 3). The watcher holds its own `Zoom` and, at each command crossed, gives it the
 * item in hand (`setWeapon` on a change), the map's night (`setNight`) and the wire's state (`set`), then
 * `POV_COMMAND_DT_ADAPTATION` of `update`. `Zoom.set` is the whole of the owner's run: it writes the target and the rate
 * by the state's way, not the magnification's (`./zoom`'s header, "The animation": "In or out is the state's way"), so
 * a watcher that sees the owner's successive states sets the owner's targets at the owner's rates in the owner's
 * direction -- the binoculars' 9x to a 3x scope runs in on both sides. The press itself (`zoomIn`/`zoomOut`, the night
 * step, a mount) is never re-derived: the state on the wire already says where it went (night vision is 3, a THERMAL
 * turret's twin is 2 -- set as they come, no `setMount`). **What is late:** the run starts at the command the watcher
 * first sees the state, at most one snapshot (two commands) after the owner's press, and steps once a command where the
 * owner's page steps once a frame; a state held for one command between two snapshots is never seen (its target and
 * rate are skipped: a zoom-out's rate takes the larger of the old target's and the running rate, so a skipped state can
 * change the next run's speed). Measured (`test/povLens.test.ts`, "F5: the owner at 30, 60 and 144 frames a second,
 * frames not aligned to commands"): during a run the watcher is at most 3 commands behind or 1 ahead of the owner, at
 * owners of 30, 60 and 144 frames a second, and equal once the run has settled. The one near-miss (the same describe,
 * "the near-miss"): a second zoom-out pressed within about two frames of the first run's end (6 -> 5 -> 1 on a sniper)
 * can run at the other of the two speeds (36 or 18 a second) for up to 9 commands, about 150 ms -- that edge falls
 * inside one snapshot and the wire cannot say which side of it the owner was on; it settles to equal.
 *
 * **Death and the spawn** (the subject's `alive`, `BodyFlag.Alive`): the alive-to-dead edge is `Zoom.reset` -- the
 * owner's death puts the camera at 1.0 at once (`./zoom`'s header, "What drops it": death), which a `set(0)` would not
 * (it would run out); the spawn is a change of the body's spawn count (`PovLensInput.spawns`), with or without a death
 * seen (a classic round's start spawns the living again), or the dead-to-alive edge: `Zoom.respawn` with the record in
 * hand and the kit at rest (the header's spawn). While dead
 * the wire's state (0, research 402 section 3) is not read and the bloom is not run. The first sample after a
 * construction or `reset()` (a new subject, a rebuild of the rig) is placed at once (`Zoom.settle`): the run's phase
 * before it is unknown, so a view joined mid-scope shows the scope, not a run from 1.0.
 *
 * **The bloom: rebuilt in kind** (research 402 section 2, "the reticle"). This is the ROOM's model of the owner's bloom
 * -- a `ShotCone` (`./net/shotCone`), the room's per-seat `Accuracy` run from a seat's commands -- run on the watcher
 * from the body's per-command look, motion, posture, air and trigger and the subject's `shot` events; it is not the
 * owner's page's own value (`ShotCone`'s header: the room's runs on commands, the page's on frames, within
 * `CONE_SLACK_PX_PLACEHOLDER`). The stick (the command's `forward`/`right`) is not on a body: it is given 0. It moves only
 * the exertion (`Accuracy.exert`), and the exertion only the scope's sway, which is CARRIED (research 402 section 3) and
 * not this module's -- the size and the knock do not read it. A `shot` is bloomed on the newest command the watcher has
 * run (the event names no command); the room blooms it at its own (`ShotCone.round`, LATER 248). Scoped (state 4 and up)
 * there is no bloom: the cone is a point moved by the sway (`Accuracy.cone`), so `reticle().size` is null.
 *
 * **Not exposed** (research 402 section 2: the owner's perception): the accuracy pip, the threat marks, the target's
 * name and colour; nor the owner's HUD (LATER 898).
 */

/**
 * A browser adaptation with no original (research 402 sections 1 and 7: the player's view does not exist in the game):
 * one command's time, seconds -- the watcher's zoom run and bloom step by this once a command crossed (60 Hz,
 * `TICK_HZ`), where the owner's page steps once a frame.
 */
export const POV_COMMAND_DT_ADAPTATION = 1 / TICK_HZ;

/**
 * A browser adaptation with no original (research 402 sections 2 and 7): how many commands back a `shot` event may be
 * put on the last scoped command (view state 5 and up) when the newest command is in state 1 while the pull's
 * count is already one or more -- the pull's second scoped round, which dropped the view to 1 (`./zoom`'s header, "What
 * drops it"; `Accuracy.round`'s `dropZoom`). The room decides that round only after the command after it ran, so its
 * event reaches the watcher after the body that shows the drop; bloomed on that unscoped command it would bloom the
 * first-person reticle the owner shows unbloomed. Two snapshots (four commands). Its cost: only a hand zoom-out from
 * the scope straight to first person (5 -> 1) followed within four commands by a round of the same pull -- that round is
 * put on the scoped command too (no bloom where the owner's blooms); a zoom-out to the night vision (5 -> 3) is not.
 */
export const POV_DROP_SHOT_WINDOW_ADAPTATION = 4;

/** The wire's view state as the watcher reads it: a whole 0-12, anything else 0 (research 402 section 3). */
export function povViewState(view: number): number {
  return Number.isInteger(view) && view >= 0 && view <= 12 ? view : 0;
}

/** What the wire gives per command for the subject; the caller builds it from the body at whole commands. */
export interface PovLensInput {
  /** The body's view state (protocol 16's `view` bits 0-3), `./zoom`'s 0-12; anything else reads as 0. */
  view: number;
  /**
   * What the owner's `Zoom` holds: the FIREARM record of the selected slot -- never an item's, never a turret's
   * (`matchFirearm`: the zoom is given the selected slot's firearm). A firearm up: its record. An item up (a grenade, a
   * charge, the Detonator: `BodyState.weapon` is then the item's id): still the selected firearm slot's record --
   * `BodyState.slot` (0 the primary, 1 the sidearm) through the subject's kit. Mounted: the same firearm's record.
   */
  record: WeaponRecord;
  /**
   * What the room's cone holds (`room.ts`: the seat's `ShotCone` is given the firearm's record, or the turret's while
   * mounted, never an item's): a firearm up or an item up, the same firearm record as `record`; mounted, the turret's
   * record (the turret's item id, e.g. 205, 207, 230, through the map's turret definitions). Only the bloom reads it.
   */
  coneRecord: WeaponRecord;
  /**
   * The body's spawn count (the same count the page keeps as `spawnsAt`): a change is a spawn -- `Zoom.respawn` and the
   * kit at rest -- with or without a death seen (a classic round's start spawns the living again, `./zoom`'s header).
   */
  spawns: number;
  /** The map's `NightMission` (`Zoom.setNight`; the scope's lens at night, `viewLens`). */
  mapNight: boolean;
  /** `BodyFlag.Alive`: its edges are the death (`Zoom.reset`) and the spawn (`Zoom.respawn`). */
  alive: boolean;
  /** The body's look, degrees (`BodyState.yaw`, `pitch`): `ShotCone.tick`'s turn and pitch rates. */
  yaw: number;
  pitch: number;
  /** The body's velocity, units a second (`BodyState.vx/vy/vz`): the bloom's movement target. */
  velocity: readonly [number, number, number];
  /** `BodyFlag.Airborne`. */
  airborne: boolean;
  /** The posture the body uses (`BodyState.stance` through `STANCE_CODES`): the bloom's stance row. */
  posture: WeaponStanceName;
  /** The raw stance, the exertion's decay row (`AimMover.stance`); absent, `posture`. Moves only the exertion. */
  rawStance?: WeaponStanceName;
  /** `BodyFlag.Trigger`: its edges start the pull's count again (`Accuracy.trigger`). */
  trigger: boolean;
  /** TURRET-CONE: mounted, the turret record's row (`AimMover.coneStance`); absent, `posture`. */
  coneStance?: WeaponStanceName;
  /** LATER 107/168: the turret held, or null (`AimMover.turret`: a scope left by the mount clears no knock). */
  turret?: number | null;
  /**
   * The scope lens's thermal input (`sights` `thermalLensFitted`, R4P-110): the subject's kit holds the thermal scope and
   * the item in his hand is class sniper; absent, false.
   */
  thermal?: boolean;
  /** A throwable, a charge or the gear is up (the owner's `hands.itemUp()`): no lens, the reticle's mode. Absent, false. */
  itemUp?: boolean;
  /** The selected slot's fire mode (`FUN_005be300`'s, a launcher round's id above 4); absent, 1. */
  fireMode?: number;
}

/** The lens the owner's page derives from the state (`matchFirearm` `gunFrame`: `zoom.view()`, `viewLens`). */
export interface PovLensView {
  /** The state as the watcher's `Zoom` holds it. */
  state: number;
  view: ZoomView;
  /** The scope's level, `state - 4` in 5-12 (`ZoomMode[level]`); 0 outside a scope. */
  scopeLevel: number;
  /** The lit colours' one lens (`sights` `viewLens`): the goggles, a scope's lens, the thermal's, or none. */
  lens: ViewLens;
}

/** What the reticle's draw takes (`matchFirearm` `aimReticle`: `setMode`, `setSet`, `setTube`, `setNight`, `setSize`). */
export interface PovReticle {
  mode: ReticleMode;
  /** `handReticleType`'s set for the record, the state, the run's target and the fire mode. */
  set: number;
  /** Set 0 laid in state 2: the scope's tube over the cross (LATER 164). */
  tube: boolean;
  /** The night vision is on (`reticle.setNight`). */
  night: boolean;
  /** The arms' push, pixels -- `Accuracy.reticle`'s, halved in state 0 -- or null: scoped (no bloom) or dead. */
  size: number | null;
  /** The knock's offset of the centre, pixels, y down (`Accuracy.reticle`'s `offset`). */
  offset: [number, number];
}

export class PovLens {
  private zoom: Zoom | null = null;
  private cone: ShotCone | null = null;
  private record: WeaponRecord | null = null;
  private coneRecord: WeaponRecord | null = null;
  private spawns = 0;
  /** The last commands' numbers and view states (`POV_DROP_SHOT_WINDOW_ADAPTATION`), newest last. */
  private recent: { seq: number; state: number }[] = [];
  private alive = true;
  private seq = 0;
  private last: PovLensInput | null = null;
  /** `reset()` was called: the next sample is placed at once (`Zoom.settle`), as the first one is. */
  private settleNext = false;

  /** One command of the subject: called once per whole command crossed, by the loop that ticks the rig. */
  tick(input: PovLensInput): void {
    const state = povViewState(input.view);
    if (!this.zoom || !this.cone) {
      this.zoom = new Zoom(input.record, input.mapNight);
      this.cone = new ShotCone(input.coneRecord);
      this.record = input.record;
      this.coneRecord = input.coneRecord;
      this.spawns = input.spawns;
      this.alive = input.alive;
      if (input.alive) { this.zoom.set(state); this.zoom.settle(); }
    } else {
      this.zoom.setNight(input.mapNight);
      if (input.record !== this.record) {
        this.record = input.record;
        this.zoom.setWeapon(input.record);
      }
      if (input.coneRecord !== this.coneRecord) {
        this.coneRecord = input.coneRecord;
        this.cone.setWeapon(input.coneRecord);
      }
      const spawned = input.spawns !== this.spawns;
      this.spawns = input.spawns;
      if (this.settleNext) {                                                   // after reset(): placed at once
        this.settleNext = false;
        if (spawned && input.alive) this.zoom.respawn(input.record);
        if (input.alive) { this.zoom.set(state); this.zoom.settle(); }
      } else {
        if (this.alive && !input.alive) this.zoom.reset();                    // the death: 1.0 at once
        else if (input.alive && (spawned || !this.alive)) {                    // the spawn, with or without a death
          this.zoom.respawn(input.record);
          this.cone.reset();
          this.recent = [];
        }
        if (input.alive) this.zoom.set(state);
      }
      this.alive = input.alive;
    }
    this.zoom.update(POV_COMMAND_DT_ADAPTATION);
    this.last = input;
    if (!input.alive) return;
    const s = this.zoom.state();
    this.seq++;
    const cmd: Command = {
      seq: this.seq, forward: 0, right: 0, yaw: input.yaw, pitch: input.pitch, turn: 0, stance: 0, weapon: 0,
      buttons: (input.trigger ? Button.Trigger : 0) | (s >= 1 ? Button.Aim : 0) | (s >= BINOCULARS ? Button.Scope : 0) | (s === BINOCULARS ? Button.Binoculars : 0),
    };
    this.recent.push({ seq: this.seq, state: s });
    if (this.recent.length > POV_DROP_SHOT_WINDOW_ADAPTATION + 1) this.recent.shift();
    this.cone.tick(cmd, {
      feet: [0, 0, 0], velocity: [...input.velocity], airborne: input.airborne, posture: input.posture, stance: input.rawStance,
      moveRoot: null, peek: 0, weapon: 0, coneStance: input.coneStance, turret: input.turret ?? null, lookScale: this.zoom.lookScale(),
    }, this.seq);
  }

  /**
   * A round of the subject's (a `shot` event): bloomed on the newest command run (`ShotCone.round`) -- or, when the
   * newest is in state 1 (the drop's) with the pull's count at one or more, on the last scoped command
   * (`POV_DROP_SHOT_WINDOW_ADAPTATION`): the dropping round, which `ShotCone.round` blooms there and whose leave its
   * replay takes back (LATER 233), as the room's cone does. The caller delivers the event once the command clock has run
   * past the body that carried it (the event names no command).
   */
  shot(): void {
    if (!this.cone || !this.alive || this.seq === 0) return;
    let at = this.seq;
    const newest = this.recent[this.recent.length - 1];
    if (newest && newest.state === 1 && this.cone.state().burst >= 1) {     // the drop always sets 1 (FUN_005c5340)
      for (let i = this.recent.length - 2; i >= 0; i--) if (this.recent[i]!.state >= 5) { at = this.recent[i]!.seq; break; }
    }
    this.cone.round(at);
  }

  /** The run's applied magnification (`Zoom.magnification`). */
  magnification(): number { return this.zoom?.magnification() ?? 1; }

  /** The vertical FOV for a base FOV (`Zoom.fov`). */
  fov(baseDegrees: number): number { return this.zoom ? this.zoom.fov(baseDegrees) : baseDegrees; }

  /** The magnification and the state's far range (`Zoom.renderView`, `viewRangeExtra`). */
  renderView(): RenderView { return this.zoom?.renderView() ?? { magnification: 1, farExtra: 0 }; }

  /** What the HUD's "ZOOM: x" shows (`Zoom.hudZoom`): the state's value, not the run's. */
  hudZoom(): number { return this.zoom?.hudZoom() ?? 0; }

  /** PV-7b: the binoculars' state, 4 (`Zoom.binoculars`): the HUD's RANGE place and the look's mode 4. */
  binoculars(): boolean { return this.zoom?.binoculars() ?? false; }

  /** PV-7b: the look's scale for the state (`Zoom.lookScale`): the look's divisor, as the owner's `gunFrame` hands it on. */
  lookScale(): number { return this.zoom?.lookScale() ?? 1; }

  lens(): PovLensView {
    const z = this.zoom, state = z?.state() ?? 0, i = this.last;
    return {
      state, view: z?.view() ?? 'third', scopeLevel: state >= 5 && state <= 12 ? state - 4 : 0,
      lens: viewLens(state, i?.thermal ?? false, i?.mapNight ?? false, this.alive && !(i?.itemUp ?? false)),
    };
  }

  reticle(): PovReticle {
    const z = this.zoom, state = z?.state() ?? 0, i = this.last;
    const item = i?.itemUp ?? false;
    const mode: ReticleMode = state === BINOCULARS ? 'binoculars' : z?.view() === 'scope' && !item ? 'scope' : 'reticle';
    const set = this.record ? handReticleType(null, this.record.id, state, z?.target() ?? 1, i?.fireMode ?? 1) : -1;
    const k = this.cone?.state();
    // PV-7b: `Accuracy.reticle`'s halving in state 0 (accuracy.ts:693-695), which `ShotCone` does not expose.
    const size = !k || !this.alive || state >= BINOCULARS ? null : state === 0 ? k.size * 0.5 : k.size;
    return { mode, set, tube: set === 0 && state === 2, night: z?.view() === 'nightvision', size, offset: k ? [k.offset[0], k.offset[1]] : [0, 0] };
  }

  /** A new subject, a respawn the caller saw whole, a rebuild of the rig: at rest; the next sample is placed at once. */
  reset(): void {
    this.zoom?.reset();
    this.cone?.reset();
    this.seq = 0;
    this.recent = [];
    this.alive = true;
    this.settleNext = true;
  }
}
