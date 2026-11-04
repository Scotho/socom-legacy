import { capturePointer, releasePointer, requestLock } from './pointer';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { GAME_FRAME_DT, GAME_FRAME_MAX_STEPS } from '@s2u/scene';
import { padRaw, strongest } from './gamepad';
import { moveStick } from './moveStick';
import {
  LookLaw, maxPitchRateOf, maxYawRateOf, nudgePitch, PITCH_HARD, ScreenShake, SCREEN, stepPitch, viewOffset, ViewBob,
  type LookOptions, type LookState, type Shake,
} from './look';
import { wrapYaw, wrapYawRad } from './yaw';
import { MAX_TICKS, TICK } from './mover';
import { keyboardSite } from './keyboardTesting';
import { mouseSite } from './mouseTesting';

/** A camera pose in the game's world frame: position in game units, yaw and pitch in degrees. */
export interface Pose { x: number; y: number; z: number; yaw: number; pitch: number }

/** Metres a second at a cruise; the fly speed is this divided by `MetersPerUnit` to get game units. */
const METRES_PER_SECOND = 12;
/** Ctrl multiplies it: crossing a 100 m map end to end takes about two seconds. */
const SPRINT = 5;
/** Radians of look per pixel of drag, and per unit of pointer-lock movement. */
const LOOK = 0.0028;
/** A thumb has a phone's width to work with, not a desk's: a touch drag turns this much further. */
export const TOUCH_LOOK = 2;
/** Radians a second the arrow keys turn, for a keyboard with no mouse to hand. */
const ARROW_LOOK = 1.6;
/** Straight up and straight down are singular for a yaw/pitch camera, so stop just short. */
const PITCH_LIMIT = MathUtils.degToRad(89.9);
/*
 * Walking, the look is the game's (`./look`, web research 83): the pad's right stick and the arrow keys (a full push)
 * through the pad reader's dead zone, curve and ramp, at `turn_maxrate` / `pitch_rate` x 1.118 at full push, and the
 * mouse by the viewer's own mapping (`LookOptions`: raw by default, one inch at 800 DPI = one second of full stick, the
 * pitch at the game's 0.425 of the turn). The pitch stops at the stance's aim limits and comes back to them at
 * 0.5 rad/s after a stance change (`FUN_00594600`).
 */

/**
 * How fast velocity chases the stick, per second, as the exponent of an exponential approach.
 * Pressing a key reaches ~99% of cruise in 3/ACCEL seconds; releasing it coasts for about 3/BRAKE.
 * Braking is slower than accelerating, which is what gives creative-mode flight its glide: you stop
 * over roughly a third of a second rather than on the frame the key comes up.
 */
export const ACCEL = 14;
export const BRAKE = 8;

/**
 * One axis of the velocity model over `dt` seconds, in closed form: v(t) = target + (v0 - target)e^(-rate t).
 * Both the distance covered and the velocity at the end are taken from that curve rather than from `v * dt` at
 * one end of it, so the distance does not depend on how the time is cut up. The fly camera steps it once a frame;
 * the walk (`./walk`) steps it once a 60 Hz tick on the ground plane.
 */
export function glide(v0: number, target: number, rate: number, dt: number): { moved: number; velocity: number } {
  const decay = Math.exp(-rate * dt);
  const integral = (1 - decay) / rate;            // ∫e^(-rate t) dt over the step
  return { moved: target * dt + (v0 - target) * integral, velocity: target + (v0 - target) * decay };
}

/**
 * What the keys and the touch stick ask the walk for (`./walk`): forward and right on the ground plane, -1..1. The
 * boost is the fly camera's gesture and is always false here: the walk has no sprint (W2.R2; the owner, 2026-09-28).
 * The field stays so the walk's input type is unchanged.
 */
export interface GroundWish { forward: number; right: number; boost: boolean }

/**
 * The vertical field of view at rest before a map states its own, and how far the boost widens it.
 * Every map's `cameras/camera` authors `fov (0.6109 0.4276)` -- half-angles, 35 degrees by 24.5 --
 * and `setFov` puts the map's on once it is read; 49 is what all but one of them come to.
 */
const FOV = 49;
/**
 * The clip planes a map is opened with, before its own are known. 4 is the game's own near plane; the
 * far is a whole large map and then some, and `setClipPlanes` narrows it once the map's extent is read.
 */
const DEFAULT_NEAR = 4;
const DEFAULT_FAR = 12000;
/**
 * Walking, the most one look step may take: `GAME_FRAME_MAX_STEPS` game frames of `GAME_FRAME_DT` (a stalled tab's
 * backlog is dropped, as the trajectories' accumulator drops it). On the original `FUN_002da930` reads the pad and grows
 * its ramp once a 30 Hz game frame and the turn and the pitch move by that frame's rate x dt (`FUN_00594600`,
 * `actor+0x48`; research 180 sections 0 and 1.1, research 208). MISSION R8 -- a known deviation the owner ruled
 * (2026-10-04: "the speed is good, but the feeling was wrong"; "agreed on hybrid. make this a known deviation"; research
 * 208 section 9): the page reads the pad every drawn frame and grows the ramp continuously at its per-second
 * equivalent (`./look` `RAMP_PER_SECOND`: full in 0.42 s), so a push turns the view on the next drawn frame, not up to
 * a game frame (33 ms) later; the original's per-frame stair-steps of the ramp are not reproduced.
 */
const LOOK_MAX_DT = GAME_FRAME_MAX_STEPS * GAME_FRAME_DT;
/**
 * NET-LOOK round 4: walking, a frame's look is held to what the walker's ticks can carry -- `Walker.advance` runs at
 * most `MAX_TICKS` ticks a frame and drops the rest -- so a long hitch turns the camera no further than the body can
 * follow on the law (the page's and the room's gates; `WalkMode.frame` spreads it over those ticks).
 */
const WALK_LOOK_MAX_DT = Math.min(LOOK_MAX_DT, MAX_TICKS * TICK);
const SPRINT_FOV = 1.14;
/** Exponential approach rate for the FOV kick, per second. */
const FOV_RATE = 9;

/**
 * Sprint is a double-tap of forward, held -- Minecraft's own gesture, and the only safe one in a browser.
 * Ctrl cannot be used: Ctrl+W closes the tab and Chrome does not let a page prevent it, so binding a boost
 * to Ctrl next to a W that means "forward" hands the player a loaded gun. Ctrl+D and Ctrl+A are preventable
 * and are prevented below, but Ctrl+W is not, so nothing is bound to Ctrl at all.
 */
const DOUBLE_TAP_MS = 300;

/** Wheel speed control: one notch is this factor, clamped to these bounds. */
const WHEEL_STEP = 1.15;
const SPEED_MIN = 0.1;
const SPEED_MAX = 16;

/** Frame-rate independent exponential approach: the value `a` moves toward `b` at rate `k` per second. */
const approach = (a: number, b: number, k: number, dt: number): number =>
  b + (a - b) * Math.exp(-k * dt);

/**
 * Every code the camera consumes. A keydown on one of these is prevented, so the browser chords that
 * share them -- Ctrl+D bookmark, Ctrl+A select-all, Ctrl+S save, Space page-scroll -- never fire while
 * the viewer has the keyboard. `C` (the walk's stance) is not here: `WalkMode` prevents a bare C while walking
 * itself, and owning it here would take Ctrl+C (copy) from the page everywhere.
 */
const OWNED = new Set([
  'keyw', 'keya', 'keys', 'keyd', 'keyq', 'keye', 'space', 'shiftleft', 'shiftright',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

export interface FlyCameraOptions {
  /** Called when the wheel changes the speed multiplier, so the page can show it. */
  onSpeedChange?: (multiplier: number) => void;
  /** Called when pointer lock is taken or released, so the page can show a hint. */
  onLockChange?: (locked: boolean) => void;
  /**
   * The trigger (W2.5, `./fire`): the left button pressed (true) and let go (false) **while the mouse is captured**.
   * The click that takes the lock is not a shot; losing the lock lets a held trigger go.
   */
  onFire?: (down: boolean) => void;
  /**
   * OT.R68 (the owner, 2026-10-21: keyboard and mouse for everything in the forge's creation UI, not once its matches
   * have started): the forge editor's camera reads its keys and the captured mouse's look in every build. A browser
   * adaptation; only `./forge/page` passes it -- every other camera keeps OT.R29 / OT.R38, a development build's alone.
   */
  forgeKbm?: true;
}

/**
 * A fly camera in the game's world frame (y up, right-handed, SEMANTICS section 8), with the controls
 * and the feel of a creative-mode build camera:
 *
 * - **Click the canvas to capture the mouse**; look is then free, and Esc gives the pointer back. When
 *   pointer lock is unavailable — headless Playwright, a touch screen — dragging still looks, so the
 *   screenshot tests and a tablet both keep working.
 * - **W/S** fly along the look direction, pitch included, so looking down and holding W descends.
 *   **A/D** strafe level with the horizon whatever the pitch: a strafe that dipped with the nose makes
 *   it impossible to sidle along a wall while looking at it.
 * - **Space** up, **Shift** down, both in world space. **Double-tap W and hold** to boost, which widens
 *   the view to match -- Minecraft's own sprint gesture, and the only one that is safe here: Ctrl+W
 *   closes the tab and no page can prevent it, so nothing is bound to Ctrl.
 *   The boost is the fly camera's alone: in walk mode nothing boosts (owner, 2026-09-28).
 *   **Q/E** stay bound to down/up as they were, for anyone with the old keys in their fingers.
 * - **Wheel** trims the speed between a tenth and sixteen times, because a map is 100 m across but a
 *   prop is 30 cm.
 *
 * Movement is velocity-based rather than position-based: keys steer a target velocity that the real
 * velocity chases, so starts ramp and stops glide instead of snapping. `setPose` kills the velocity
 * outright, which is what keeps the Playwright poses exact.
 *
 * Yaw and pitch are kept here rather than read back off the camera's quaternion, so the debug hook can
 * set an exact pose.
 */
export class FlyCamera {
  readonly camera: PerspectiveCamera;
  /**
   * Radians, canonical in [0, 2 pi) (`wrapYawRad`, web research 86 section 3.8): every turn is folded in where it is
   * stored, so the mover, the body, the climb's steer and the command never see a yaw wound round (SOCOM II's facing is a
   * rotation and has no winding).
   */
  private yaw = 0;
  private pitch = 0;
  /** The touch stick's axes, -1..1: x strafes right, y moves along the look direction. */
  private stickX = 0;
  private stickY = 0;
  /** The touch up/down buttons: 1, 0 or -1, the same lane space and shift drive. */
  private lift = 0;
  /** The stick held at its rim: the phone's boost gesture (`./touch`). */
  private stickBoost = false;
  /** A pad's right stick (`./gamepad`, W2.7), -1..1: x turns right, y looks up, at the arrow keys' rate scaled. */
  private lookX = 0;
  private lookY = 0;
  private readonly keys = new Set<string>();
  /** A menu over the game holds the input (the ARMORY): no key, stick, lift or mouse look reaches the camera. */
  private suspended = false;
  private dragging: number | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Game units a second at the map's scale; `setScale` adjusts it when a map states its own. */
  private speed = METRES_PER_SECOND / 0.1;
  /** The wheel's trim on top of `speed`. */
  private speedMultiplier = 1;
  /** Current velocity in game units a second. Public movement state, zeroed by `setPose`. */
  private readonly velocity = new Vector3();
  /** The vertical field of view at rest: the map's own once `setFov` has it. */
  private restFov = FOV;
  /** The FOV actually applied, eased toward its target so the sprint kick is not a step. */
  private fov = FOV;
  private locked = false;
  /** When forward was last tapped, and whether the tap that is still held was the second one. */
  private lastForwardTap = 0;
  private sprinting_ = false;
  /** Walk mode (`./walk`): the keys and the stick steer the mover, and this camera only looks. */
  private walking = false;
  /** Walking, the pitch's limits in radians (`setPitchLimits`: the aim pitch's, W2.1). */
  private walkPitch: [number, number] = [-PITCH_LIMIT, PITCH_LIMIT];
  /** The left button pressed while locked and not yet let go (`onFire`). */
  private triggerHeld = false;
  /** OT.R68: the forge editor's camera, whose keys and captured look are every build's (`FlyCameraOptions.forgeKbm`). */
  readonly forgeKbm: boolean;
  /** Original BOBBING_1ST_PERSON applied by StoreOptions (ISO 0027b960). */
  originalHeadBob = true;
  /** Walking: the game's look law (`./look`), the screen shake, the view bob and what they last gave. */
  private readonly law = new LookLaw();
  private readonly shake = new ScreenShake();
  private readonly bob = new ViewBob();
  private eyeView = false;
  private prone = false;
  private scoped = false;
  private turnRate = 0;
  /**
   * TOUCH_LOOK_STICK_LAW_ADAPTATION (a browser adaptation; OT.R38 / H115 "Controller only", the merge controller's
   * reading on the owner's authority): walking, a finger's drag does not move the look -- it sets where the look goes
   * (these, radians still to turn and to pitch), and the look moves there at most at the full stick's rate
   * (`MAX_YAW_RATE`, `MAX_PITCH_RATE`, by the zoom), the stick's own share first. The room holds every look to the
   * stick's law; an exemption for touch would reopen the snap to any page that says it is a finger.
   */
  private touchYaw = 0;
  private touchPitch = 0;
  private screen: [number, number] = [0, 0];
  /** The shake and the bob this look frame gave, and the kit's scoped sway (`setKitOffset`): their sum is `screen`. */
  private lookOffset: [number, number] = [0, 0];
  private kitOffset: [number, number] = [0, 0];
  /** The map's near plane (`setClipPlanes`), and the head view's shorter one while it holds (`setViewNear`, OBF-1). */
  private mapNear = DEFAULT_NEAR;
  private viewNear: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: FlyCameraOptions = {},
  ) {
    this.camera = new PerspectiveCamera(FOV, 1, DEFAULT_NEAR, DEFAULT_FAR);
    this.camera.rotation.order = 'YXZ';       // yaw about y, then pitch about the new x
    this.forgeKbm = options.forgeKbm === true;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // A right-click is a look-around on a fly camera, not a request for the browser's menu.
    canvas.addEventListener('contextmenu', this.onContextMenu);
    if (import.meta.env.DEV) keyboardSite('s2u-kb-fly-camera');      // OT.R29: the keys a development build's only,
    if (import.meta.env.DEV || this.forgeKbm) {                      //   and the forge editor's in every build (OT.R68)
      globalThis.addEventListener('keydown', this.onKeyDown);
      globalThis.addEventListener('keyup', this.onKeyUp);
    }
    globalThis.addEventListener('blur', this.onBlur);
    if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock');   // OT.R38: the mouse's look a development build's only,
    if (import.meta.env.DEV || this.forgeKbm) {                      //   and the forge editor's in every build (OT.R68)
      globalThis.document?.addEventListener('pointerlockchange', this.onLockChange);
    }
  }

  /**
   * ONL-18c (web research 166 §8): every listener the constructor added taken off again -- the front end's match mounts
   * a camera for each match and lets it go at the match's end (`./matchMount`); `/testroom`'s lives as long as its page.
   */
  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
    globalThis.removeEventListener('keydown', this.onKeyDown);
    globalThis.removeEventListener('keyup', this.onKeyUp);
    globalThis.removeEventListener('blur', this.onBlur);
    globalThis.document?.removeEventListener('pointerlockchange', this.onLockChange);
    this.keys.clear();
  }

  /** `MetersPerUnit` from the map: the fly speed is a cruise in metres, whatever the unit is. */
  setScale(metersPerUnit: number): void {
    this.speed = METRES_PER_SECOND / (metersPerUnit > 0 ? metersPerUnit : 0.1);
  }

  /**
   * The near and far clip planes. Depth precision is spent in proportion to `far / near`, and a
   * perspective depth buffer puts most of its resolution just past the near plane: at the 1 / 40000 the
   * camera used to open with, two coplanar surfaces a few units apart land on the same depth value and
   * flicker against each other as the camera moves. The game's own near plane is 4 (`m_near_plane` in
   * `cameras/camera`, 4.0 on all 22 maps) and its far is a few hundred; the viewer keeps the near and
   * takes a far from the map's extent, which is generous enough to fly around in and still ~26x the
   * precision.
   */
  setClipPlanes(near: number, far: number): void {
    if (!(far > near) || near <= 0) return;
    this.mapNear = near;
    this.camera.near = this.viewNear === null ? near : Math.min(near, this.viewNear);
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * OBF-1 (`./playerCamera` `HEAD_VIEW_NEAR_ADAPTATION`, the owner's OBF.R1): the view from the head's near plane while
   * a camera face stands inside the map's (`headViewNear`), never past the map's; null gives the map's back. The
   * projection only: a point's place on the frame does not depend on it.
   */
  setViewNear(near: number | null): void {
    this.viewNear = near !== null && near > 0 ? near : null;
    const next = this.viewNear === null ? this.mapNear : Math.min(this.mapNear, this.viewNear);
    if (this.camera.near === next) return;
    this.camera.near = next;
    this.camera.updateProjectionMatrix();
  }

  /** The map's own vertical field of view, in degrees; the boost widens from it and eases back to it. */
  setFov(degrees: number): void {
    if (!(degrees > 1 && degrees < 179)) return;
    this.restFov = degrees;
    this.fov = degrees;
    this.camera.fov = degrees;
    this.camera.updateProjectionMatrix();
  }

  /**
   * SPECTATOR-VIEW W6 (`./spectatorView` SCENIC_ZOOM): the spectator's scenic magnification as the projection's x / y
   * scale -- three's `zoom`, tan(half FOV) / m (`FUN_002964f0` D:L140524-140527) -- apart from the FOV the scopes and the
   * boost set (`setFov`), which it never touches; `setPose` keeps it. 1 is the camera as it was.
   */
  setMagnification(magnification: number): void {
    if (this.camera.zoom === magnification) return;
    this.camera.zoom = magnification;
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The projection's width/height, the value `setAspect` last wrote (the canvas, or the PS2 aspect). */
  aspect(): number {
    return this.camera.aspect;
  }

  /** The wheel's speed trim, for the page's hint line. */
  multiplier(): number {
    return this.speedMultiplier;
  }

  /** Whether the mouse is currently captured. */
  isLocked(): boolean {
    return this.locked;
  }

  /** Stand at `from` (game units) and face `to`. */
  lookFrom(from: readonly [number, number, number], to: readonly [number, number, number]): void {
    const [dx, dy, dz] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const flat = Math.hypot(dx, dz);
    this.setPose({
      x: from[0], y: from[1], z: from[2],
      yaw: MathUtils.radToDeg(Math.atan2(-dx, -dz)),   // the camera looks down its own -z
      pitch: MathUtils.radToDeg(Math.atan2(dy, flat)),
    });
  }

  /**
   * Place the camera exactly. Velocity and the FOV kick are cleared: a pose set by the debug hook has
   * to be the pose the next frame renders, or the screenshot tests would photograph a camera still
   * gliding out of its previous one.
   */
  setPose(pose: Partial<Pose>): void {
    const now = this.pose();
    this.camera.position.set(pose.x ?? now.x, pose.y ?? now.y, pose.z ?? now.z);
    this.yaw = wrapYawRad(MathUtils.degToRad(pose.yaw ?? now.yaw));
    if (pose.yaw !== undefined) this.touchYaw = 0;              // a facing set: a finger's look still owed is spent
    if (pose.pitch !== undefined) this.touchPitch = 0;
    this.pitch = this.clampPitch(MathUtils.degToRad(pose.pitch ?? now.pitch));
    this.velocity.set(0, 0, 0);
    this.fov = this.restFov;
    this.camera.fov = this.restFov;
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  /** Forge editor browser adaptation: pixel-delta look without resetting flight glide or FOV.
   * Only its opt-in input helper calls this; walking and suspended cameras retain their input owner.
   */
  lookBy(dx: number, dy: number): void {
    if (this.suspended || this.walking) return;
    this.look(dx, dy);
  }

  /**
   * WEAPON: turns the look's pitch by `radians` (up positive), clamped to the pitch limits, the rest of the pose kept:
   * the rifle's kick (`./rifleKick`, through `Fire`).
   */
  addPitch(radians: number): void {
    // NET-LOOK round 3: a pitch already outside the posture's limits (a stance just narrowed them) is not put at their
    // edge by the kick -- `FUN_00594600` brings it back at 0.5 rad/s (`stepPitch`), as the kick adds on top -- held only
    // within the hard +-1.4 rad (`PITCH_HARD`). Inside the limits the kick is held to them, as before.
    const [lo, hi] = this.walkPitch;
    const outside = this.walking && (this.pitch > hi + 1e-9 || this.pitch < lo - 1e-9);
    const pitch = outside ? MathUtils.clamp(this.pitch + radians, -PITCH_HARD, PITCH_HARD) : this.clampPitch(this.pitch + radians);
    if (pitch !== this.pitch) { this.pitch = pitch; this.apply(); }
  }

  pose(): Pose {
    const p = this.camera.position;
    return { x: p.x, y: p.y, z: p.z, yaw: wrapYaw(MathUtils.radToDeg(this.yaw)), pitch: MathUtils.radToDeg(this.pitch) };
  }

  /**
   * Walk mode on or off. On, `update` still turns the view (the mouse, the arrow keys) and eases the boost's FOV,
   * but no longer moves the camera: the keys and the stick are read by the walk through `groundWish`, and the walk
   * places the view with `placeView` (the mouse's y then moves the pitch at the pad's ratio, clamped to
   * `setPitchLimits`). Either way the glide is dropped, and so is any boost armed: a W double-tapped or a stick held at
   * its rim must not carry across the switch (the walk has none, and flying starts unboosted).
   */
  setWalking(on: boolean): void {
    this.walking = on;
    this.touchYaw = 0; this.touchPitch = 0;
    this.velocity.set(0, 0, 0);
    this.sprinting_ = false;
    this.lastForwardTap = 0;
    this.stickBoost = false;
    this.law.reset();
    this.turnRate = 0;
    if (!on) {
      this.lookOffset = [0, 0];
      this.kitOffset = [0, 0];
      this.setScreenOffset(0, 0);
      this.walkPitch = [-PITCH_LIMIT, PITCH_LIMIT];
      this.apply();                                  // a third-person view leaves the look where yaw and pitch put it
    }
  }

  /**
   * Walking, the camera's pitch limits in degrees (`playerCamera.ts`'s `pitchLimits`: -70..60, prone -20..25). A pitch
   * outside new limits (a stance change) is not clamped: `update` brings it back at the game's 0.5 rad/s
   * (`FUN_00594600`). Flying they are the fly camera's own, just short of straight up and down.
   */
  setPitchLimits(minDegrees: number, maxDegrees: number): void {
    if (!this.walking) return;
    this.walkPitch = [MathUtils.degToRad(minDegrees), MathUtils.degToRad(maxDegrees)];
  }

  // ---- The look law's controls (web research 83; `./look`) ---------------------------------------------------------

  /** The mouse's mapping and the look's options (`LookOptions`); they act while walking. */
  setLookOptions(opts: Partial<LookOptions>): void {
    this.law.setOptions(opts);
  }

  lookOptions(): LookOptions {
    return this.law.options();
  }

  /**
   * The scope's magnification (the weapon's `ZoomModeN`, 1 unscoped; `mode4` the 9x view): the look divides by it, and
   * the bob's phase slows by 0.2 (`FUN_005966a0`). The night vision is not a scope: 1.
   */
  setZoom(magnification: number, mode4 = false): void {
    this.law.setZoom(magnification, mode4);
    this.scoped = magnification > 1.01 || mode4;
  }

  /** The body the look rides (the bob's inputs): a view from the head or not, prone or not. `main.ts` sets it each frame. */
  setBody(eyeView: boolean, prone: boolean): void {
    this.eyeView = eyeView;
    this.prone = prone;
  }

  /** A screen shake (`./look`: `explosionShake`, `MACHINE_GUN_SHAKE`, a weapon's `ScreenShake`); walking only. */
  shakeScreen(shake: Shake): void {
    if (this.walking) this.shake.start(shake);
  }

  /**
   * The walk's look for the body (`LookState`, `./look`): the look's yaw and the body's -- the same in SOCOM II --
   * the pitch, the turn rate and the axes, and the screen offset drawn.
   */
  lookState(): LookState {
    const yaw = wrapYaw(MathUtils.radToDeg(this.yaw));
    return {
      lookYaw: yaw, bodyYaw: yaw, pitch: MathUtils.radToDeg(this.pitch), turnRate: this.turnRate,
      axis: this.law.axis(), turning: this.turnRate !== 0, screen: [...this.screen],
    };
  }

  /**
   * How far the screen offset moved the picture, as fractions of the frame (x right, y down): the reticle, a HUD
   * element, stays where it was while the world shifts under it (`main.ts` takes this off the projected aim point).
   */
  screenShift(): [number, number] {
    const [ox, oy] = viewOffset(this.screen[0], this.screen[1]);
    return [-ox / (this.camera.aspect * SCREEN.height), -oy / SCREEN.height];
  }

  /**
   * Walking, where the page puts the view (W2.1): the eye, and the target it looks at with no roll -- `FUN_0029bc90`'s
   * placement, which is three's `lookAt` with y up -- or with no target, the look yaw and pitch give (the scope).
   * The yaw and pitch themselves are untouched: they are the body's turn and the camera's pitch.
   */
  placeView(eye: readonly [number, number, number], target: readonly [number, number, number] | null): void {
    this.camera.position.set(eye[0], eye[1], eye[2]);
    if (target) this.camera.lookAt(target[0], target[1], target[2]);
    else this.apply();
  }

  /** Stand the camera at a point without touching the look, the FOV or anything else `setPose` resets. */
  moveTo(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  /**
   * The ground-plane half of what `update` would steer by, as the console's pad reader hands the mover its stick
   * (web research 88 section 3): the stick -- the pad's or the touch stick's, its push as the pad gave it (`./gamepad`'s
   * radial 0.15 dead zone and rescale undone, as `walkLook` does for the look) -- through the move stick's law
   * (`moveStick`: 0.3 per axis, the rescale, the circle's x sqrt 2); the keys a full byte on each axis they press, so
   * W+D is (1, 1) as PCSX2's binds and the host port's keys give it; on each axis the larger of the two. Not put back
   * in the unit disc: the game never does. The boost (a double-tapped W held, or the stick held at its rim) is the fly
   * camera's: on the ground it is never on. Space and shift have no meaning on the ground.
   */
  groundWish(): GroundWish {
    const [sx, sy] = moveStick(...padRaw(this.stickX, this.stickY), this.law.options().stick.deadZone);
    const keyForward = (this.keys.has('keyw') ? 1 : 0) - (this.keys.has('keys') ? 1 : 0);
    const keyRight = (this.keys.has('keyd') ? 1 : 0) - (this.keys.has('keya') ? 1 : 0);
    return { forward: strongest(keyForward, sy) + 0, right: strongest(keyRight, sx) + 0, boost: false };
  }

  /**
   * One frame of movement. `dt` is seconds, so held keys move the same distance on any refresh rate,
   * and the exponential approach below is sampled rather than iterated — 30 fps and 240 fps land the
   * camera in the same place.
   */
  update(dt: number): void {
    if (dt <= 0) return;

    // The arrow keys turn at a steady rate; a frame's worth here, before the frame's forward is taken. A pad's right
    // stick (W2.7) turns at the same rate scaled by its push, and on each axis the larger of the two is taken.
    // Walking, they are the pad's full axis: `turn_maxrate` and `pitch_rate` radians a second (W2.1).
    const arrowTurn = (this.keys.has('arrowleft') ? 1 : 0) - (this.keys.has('arrowright') ? 1 : 0);
    const arrowTilt = (this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('arrowdown') ? 1 : 0);
    if (this.walking) this.walkLook(dt, arrowTurn, arrowTilt);
    else {
      // A pad's corner is past the rim (`./gamepad` `padStick`); flying, the pair is held to the disc as it always was.
      const rim = Math.max(1, Math.hypot(this.lookX, this.lookY));
      const lookX = this.lookX / rim, lookY = this.lookY / rim;
      const turn = Math.abs(lookX) > Math.abs(arrowTurn) ? -lookX : arrowTurn;
      const tilt = Math.abs(lookY) > Math.abs(arrowTilt) ? lookY : arrowTilt;
      if (turn !== 0 || tilt !== 0) {
        this.yaw = wrapYawRad(this.yaw + turn * ARROW_LOOK * dt);
        this.pitch = this.clampPitch(this.pitch + tilt * ARROW_LOOK * dt);
        this.apply();
      }
    }

    // Forward carries the pitch; right is taken from the yaw alone so strafing stays level.
    const forward = new Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wish = new Vector3();
    // The touch stick, before the keys: it is an analogue pair on the same two axes, so it adds to the
    // same wish vector and everything below -- the ramp, the glide, the frame-rate independence -- is
    // the keys' own model doing the work.
    if (this.stickX !== 0 || this.stickY !== 0) {
      wish.addScaledVector(forward, this.stickY);
      wish.addScaledVector(right, this.stickX);
    }
    if (this.lift !== 0) wish.y += this.lift;
    if (this.keys.has('keyw')) wish.add(forward);
    if (this.keys.has('keys')) wish.sub(forward);
    if (this.keys.has('keyd')) wish.add(right);
    if (this.keys.has('keya')) wish.sub(right);
    if (this.keys.has('space') || this.keys.has('keye')) wish.y += 1;
    if (this.down() || this.keys.has('keyq')) wish.y -= 1;

    const moving = wish.lengthSq() > 0;
    // The walk has no boost (W2.R2: the game's run is 65 and nothing faster), so neither has its field of view.
    const boosting = !this.walking && moving && (this.sprinting() || (this.stickBoost && (this.stickX !== 0 || this.stickY !== 0)));
    const cruise = this.speed * this.speedMultiplier * (boosting ? SPRINT : 1);
    // One key or three, the speed is the same: clamping stops diagonals being 1.7x faster. It *clamps*
    // rather than normalises so that a stick pushed half way moves at half speed -- with keys the
    // vector is always at least unit length, so they are unaffected.
    if (wish.lengthSq() > 1) wish.normalize();
    const target = moving ? wish.multiplyScalar(cruise) : new Vector3();

    // v(t) = target + (v0 - target)e^(-rate t). Both the new velocity and the distance covered during
    // the frame are taken from that closed form rather than from `v * dt` at one end of it: stepping a
    // curve with a rectangle would make the distance depend on the frame length, and the camera would
    // quietly cover less ground on a 240 Hz monitor than on a 30 Hz one.
    const rate = moving ? ACCEL : BRAKE;
    const x = glide(this.velocity.x, target.x, rate, dt);
    const y = glide(this.velocity.y, target.y, rate, dt);
    const z = glide(this.velocity.z, target.z, rate, dt);
    if (!this.walking) {
      this.camera.position.set(this.camera.position.x + x.moved, this.camera.position.y + y.moved, this.camera.position.z + z.moved);
      this.velocity.set(x.velocity, y.velocity, z.velocity);
    }

    // Below a millimetre a second the glide is over; snapping to zero keeps a released key from
    // leaving the camera creeping forever and keeps `update` cheap when nothing is happening.
    if (!moving && this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

    const fovTarget = boosting ? this.restFov * SPRINT_FOV : this.restFov;
    if (Math.abs(this.fov - fovTarget) > 1e-3) {
      this.fov = approach(this.fov, fovTarget, FOV_RATE, dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * The touch stick, as an axis pair rather than as keys. Nothing is clamped here -- `./touch` has
   * already put the vector inside the unit disc, and `update` clamps anyway.
   */
  setStick(x: number, y: number): void {
    this.stickX = this.suspended ? 0 : x;
    this.stickY = this.suspended ? 0 : y;
  }

  /** The touch up/down buttons: 1 up, -1 down, 0 released. */
  setLift(v: number): void {
    this.lift = this.suspended ? 0 : v;
  }

  /** The stick held at its rim: boosts while the stick is pushed, the way a double-tapped W does. */
  setStickBoost(on: boolean): void {
    this.stickBoost = on && !this.walking && !this.suspended;      // no sprint on foot
  }

  /**
   * The game's input held by a menu over it (web sprint 5, the ARMORY: "while it is open the game's keys and buttons do
   * nothing"): on, every held key is let go, the sticks, the lift and the boost zeroed, and until it is off no key
   * press, stick, lift or mouse look reaches the camera -- so neither the fly camera nor the walker (`groundWish`) moves.
   */
  setInputSuspended(on: boolean): void {
    if (on === this.suspended) return;
    this.suspended = on;
    if (!on) return;
    this.keys.clear();
    this.sprinting_ = false;
    this.stickX = 0; this.stickY = 0; this.lookX = 0; this.lookY = 0; this.lift = 0; this.stickBoost = false;
    this.velocity.set(0, 0, 0);
    this.letGo();
  }

  /**
   * Walking, the pad's pitch push the look law read this game frame (`LookLaw.pitchAxis`: `ctrl+0x138 x DAT_003df198`,
   * up positive), for the kick's stick follow (`./rifleKick`, PF-06); 0 flying.
   */
  pitchPush(): number { return this.walking ? this.law.pitchAxis() : 0; }

  /** Whether a menu holds the input (`setInputSuspended`). */
  inputSuspended(): boolean { return this.suspended; }

  /**
   * A pad's right stick (`./gamepad`, W2.7): x right, y up, in the unit disc. It turns the view at the arrow keys'
   * `ARROW_LOOK` scaled by the push, in walk mode as in fly, and moves nothing.
   */
  setLook(x: number, y: number): void {
    this.lookX = this.suspended ? 0 : x;
    this.lookY = this.suspended ? 0 : y;
  }

  /**
   * Walking, one frame of the game's look: the right stick -- the push as the pad itself gave it, `./gamepad`'s radial
   * 0.15 dead zone and rescale undone so the game's own 0.3 per axis is the only one -- or the arrow keys, a full
   * push, the larger on each axis; the look law's rates; the pitch stepped (`stepPitch`); then the screen shake and
   * the view bob, as a view offset.
   */
  private walkLook(dt: number, arrowTurn: number, arrowTilt: number): void {
    const [padX, padY] = padRaw(this.lookX, this.lookY);
    const x = Math.abs(padX) > Math.abs(arrowTurn) ? padX : -arrowTurn;
    const y = Math.abs(padY) > Math.abs(arrowTilt) ? padY : arrowTilt;
    // MISSION R8 (`LOOK_MAX_DT`'s comment): the pad read and the ramp grown every drawn frame at the ramp's per-second
    // equivalent (`FUN_002da930`), then the turn and the pitch moved at the rates x dt (`FUN_00594600`, `actor+0x48`).
    const h = Math.min(Math.max(0, dt), WALK_LOOK_MAX_DT);
    const rates = this.law.frame(h, x, y);
    // TOUCH_LOOK_STICK_LAW_ADAPTATION: the finger's look moved toward its target at what the full stick leaves this frame.
    const stick = this.law.options().stick;                // CONTROLLER OPTIONS: the look stick's full push (LATER 316)
    const roomYaw = Math.max(0, (maxYawRateOf(stick) * this.law.zoom() - Math.abs(rates.yaw)) * h);
    const roomPitch = Math.max(0, (maxPitchRateOf(stick) * this.law.zoom() - Math.abs(rates.pitch)) * h);
    const ty = Math.max(-roomYaw, Math.min(roomYaw, this.touchYaw));
    const tp = Math.max(-roomPitch, Math.min(roomPitch, this.touchPitch));
    this.touchYaw -= ty;
    this.touchPitch -= tp;
    this.turnRate = rates.yaw + (h > 0 ? ty / h : 0);
    let pitch = stepPitch(this.pitch, rates.pitch, h, this.walkPitch[0], this.walkPitch[1]);
    if (tp !== 0) {
      const nudged = nudgePitch(pitch, tp, this.walkPitch[0], this.walkPitch[1]);
      if (nudged === pitch) this.touchPitch = 0;                     // at the limit: the rest of the drag is spent
      pitch = nudged;
    }
    if (((rates.yaw !== 0 || ty !== 0) && h > 0) || pitch !== this.pitch) {
      this.yaw = wrapYawRad(this.yaw + rates.yaw * h + ty);
      this.pitch = pitch;
      this.apply();
    }
    const [sx, sy] = this.shake.step(dt);
    const wish = this.groundWish(), slow = this.scoped ? 0.2 : 1;
    const bob = this.eyeView && this.originalHeadBob ? this.bob.step(dt, wish.right * slow, wish.forward * slow, this.prone) : 0;
    this.lookOffset = [sx, sy + bob];
    this.setScreenOffset(sx + this.kitOffset[0], sy + bob + this.kitOffset[1]);
  }

  /**
   * The kit's view offset (`./accuracy` `scopeViewOffset`; research 381, reading pending review), PS2 pixels, x right,
   * y down: the scope's sway on the camera's `+0x480/+0x484`, which the shake (`FUN_00299c40` D:L142072-142078) adds
   * to.
   * Drawn at once -- the round's frame -- and kept through the look's frames until the next; walking only.
   */
  setKitOffset(x: number, y: number): void {
    if (!this.walking) return;
    this.kitOffset = [x, y];
    this.setScreenOffset(this.lookOffset[0] + x, this.lookOffset[1] + y);
  }

  /** The PS2 screen offset (`./look`, `viewOffset`) on the camera, or none. */
  private setScreenOffset(x: number, y: number): void {
    this.screen = [x, y];
    if (x === 0 && y === 0) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
      return;
    }
    const [ox, oy] = viewOffset(x, y);
    const w = this.camera.aspect * SCREEN.height;
    this.camera.setViewOffset(w, SCREEN.height, ox, oy, w, SCREEN.height);
  }

  /** Double-tapped forward, still held. Released, the sprint ends. */
  private sprinting(): boolean {
    return this.sprinting_ && this.keys.has('keyw');
  }

  private down(): boolean {
    return this.keys.has('shiftleft') || this.keys.has('shiftright');
  }

  private apply(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private look(dx: number, dy: number): void {
    if (this.walking) {
      // The viewer's mouse mapping (`LookLaw.mouse`): raw angles now, or counts kept for the stick law's frame.
      const [yaw, pitch] = this.law.mouse(dx, dy);
      if (yaw === 0 && pitch === 0) return;
      this.yaw = wrapYawRad(this.yaw + yaw);
      this.pitch = nudgePitch(this.pitch, pitch, this.walkPitch[0], this.walkPitch[1]);
      this.apply();
      return;
    }
    this.yaw = wrapYawRad(this.yaw - dx * LOOK);
    this.pitch = this.clampPitch(this.pitch - dy * LOOK);
    this.apply();
  }

  private clampPitch(pitch: number): number {
    return this.walking ? MathUtils.clamp(pitch, this.walkPitch[0], this.walkPitch[1]) : MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /**
   * A click captures the mouse. `requestPointerLock` rejects on a page that has not been interacted
   * with and is absent altogether in some headless configurations, so a failure quietly leaves us on
   * the drag path rather than breaking the viewer.
   */
  private readonly onPointerDown = (e: PointerEvent): void => {
    // Without this a drag across the canvas selects the panel's text and the page flashes blue.
    e.preventDefault();
    // A click on a checkbox leaves it focused, and `onKeyDown` ignores anything aimed at an input --
    // so without this, touching any panel control killed WASD until the page was reloaded. The canvas
    // has no tabindex and never takes focus by itself, so the focus is dropped by hand.
    const focused = globalThis.document?.activeElement;
    if (focused instanceof HTMLElement && focused !== this.canvas) focused.blur();
    // OT.R38 / H115 ("Controller only"): the pointer lock, the locked mouse's trigger and look, and a mouse's or a pen's
    // drag look are a development build's only (`./mouseTesting`); a release keeps a finger's drag (the touch layer).
    // OT.R68: the forge editor's captured mouse (its page asks the lock on a right-click) clicks at the centre in every build.
    if (import.meta.env.DEV || this.forgeKbm) {
      if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock');
      if (this.locked) {
        if (e.button === 0) { this.triggerHeld = true; this.options.onFire?.(true); }
        return;
      }
      if (import.meta.env.DEV && e.pointerType === 'mouse') {
        // Raw mouse input where the browser offers it: the OS's pointer acceleration is for a cursor, not for a look. A
        // refusal of the raw request falls back to the plain one, and a refusal of that to the drag; none of them may
        // reach the console as an uncaught rejection (`./pointer`, `requestLock`).
        requestLock(this.canvas);
      }
    }
    if (e.pointerType !== 'touch') {
      if (import.meta.env.DEV) mouseSite('s2u-mouse-drag-look');
      else return;                                                   // a release: only a finger drags the look
    }
    if (this.dragging !== null) return;
    this.dragging = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    // Refused when the pointer is already gone (the click became the lock, a synthetic event): no `pointerup` will come
    // for it, so there is no drag to keep, and it is not an error (`./pointer`).
    if (!capturePointer(this.canvas, e.pointerId)) this.dragging = null;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.suspended) return;                     // a menu holds the input
    if ((import.meta.env.DEV || this.forgeKbm) && this.locked) {   // OT.R38: the locked look a development build's; OT.R68 the forge's
      this.look(e.movementX ?? 0, e.movementY ?? 0);
      return;
    }
    if (this.dragging !== e.pointerId) return;
    const k = e.pointerType === 'touch' ? TOUCH_LOOK : 1;
    if (this.walking && e.pointerType === 'touch') {
      // TOUCH_LOOK_STICK_LAW_ADAPTATION: the drag's angles (the raw mapping, `LookLaw.mouse`) become the look's target.
      const [yaw, pitch] = this.law.mouse((e.clientX - this.lastX) * k, (e.clientY - this.lastY) * k);
      this.touchYaw += yaw;
      this.touchPitch += pitch;
    } else this.look((e.clientX - this.lastX) * k, (e.clientY - this.lastY) * k);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.letGo();
    if (this.dragging !== e.pointerId) return;
    this.dragging = null;
    releasePointer(this.canvas, e.pointerId);
  };

  private readonly onLockChange = (): void => {
    this.locked = globalThis.document?.pointerLockElement === this.canvas;
    if (!this.locked) this.letGo();
    if (this.locked && this.dragging !== null) {
      // The click that took the lock also started a drag; the lock owns the look from here.
      releasePointer(this.canvas, this.dragging);
      this.dragging = null;
    }
    this.options.onLockChange?.(this.locked);
  };

  /** The trigger let go, once, if it was held (`onFire`). */
  private letGo(): void {
    if (!this.triggerHeld) return;
    this.triggerHeld = false;
    this.options.onFire?.(false);
  }

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  /** The wheel trims the fly speed, the way every build camera does. */
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const step = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    this.speedMultiplier = MathUtils.clamp(this.speedMultiplier * step, SPEED_MIN, SPEED_MAX);
    this.options.onSpeedChange?.(this.speedMultiplier);
  };

  /** `code`, not `key`: WASD stays where it is on an AZERTY keyboard, and shift does not rename letters. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // A browser adaptation with no original (the console has no pointer lock): Escape while this canvas holds the lock
    // asks the document to drop it, since a browser's own Escape is not sure to (headless Chrome), and the key goes no
    // further into the camera. The page's other Escape listeners (the vote menu, the popups) are their own; the view
    // state, the scopes and the binoculars do not read Escape. Ported from Chris's browser-beta-v5 (camera.ts).
    if (e.code === 'Escape' && globalThis.document?.pointerLockElement === this.canvas) {
      globalThis.document.exitPointerLock?.();
      return;
    }
    if (this.suspended) return;                     // a menu holds the input (`setInputSuspended`)
    if (e.target instanceof HTMLElement && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    const code = e.code.toLowerCase();
    if (OWNED.has(code)) e.preventDefault();

    if (code === 'keyw' && !this.keys.has('keyw') && !this.walking) {   // the press, not the auto-repeat; no sprint on foot
      const now = performance.now();
      this.sprinting_ = now - this.lastForwardTap < DOUBLE_TAP_MS;
      this.lastForwardTap = now;
    }
    this.keys.add(code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code.toLowerCase();
    if (code === 'keyw') this.sprinting_ = false;
    this.keys.delete(code);
  };

  /**
   * Stop on this pose. The glide's velocity is dropped and any key still held is let go, so the next frame does not
   * carry a strafe on: a Play press, and the editor put back after it.
   */
  halt(): void {
    this.letGo();
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.sprinting_ = false;
  }

  /**
   * A key held while the page loses focus never sends its keyup, and the camera would drift forever.
   * The velocity goes too, or blurring mid-flight would leave it coasting behind a dead tab.
   */
  private readonly onBlur = (): void => {
    this.halt();
  };
}
