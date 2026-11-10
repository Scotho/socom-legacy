import { capturePointer, releasePointer } from './pointer';
import { requestLock } from './pointerLock';
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
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
const FORGE_SPEED_MIN_ADAPTATION = 0.1;
const FORGE_SPEED_MAX_ADAPTATION = 16;
const FORGE_LOOK_SPEED_MIN_ADAPTATION = 0.1;
const FORGE_LOOK_SPEED_MAX_ADAPTATION = 5;
const FORGE_FOV_MIN_ADAPTATION = 30;
const FORGE_FOV_MAX_ADAPTATION = 120;
/** Forge wheel travel: one hundred wheel pixels moves one tenth of the base fly speed. */
const FORGE_WHEEL_TRAVEL_ADAPTATION = 0.001;
export const FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION = 100;
const FORGE_DOLLY_RATE_ADAPTATION = 0.01;
const FORGE_FOV_STEP_ADAPTATION = 5;
const ORTHOGRAPHIC_REFERENCE_DEPTH_ADAPTATION = 100;
/**
 * The forge editor camera's own numbers, named (FP-1b, REVIEW-B 15; browser adaptations, FG.R2 -- the game has no editor
 * camera): its collision radius in metres (world units `/ metersPerUnit`), the orthographic views' wheel zoom (a wheel
 * pixel scales the zoom by `e^(-deltaY x rate)`), their zoom bounds, and Z / C's zoom step in an orthographic view.
 */
export const FORGE_CAMERA_RADIUS_M_ADAPTATION = 0.25;
export const FORGE_ORTHO_WHEEL_ZOOM_ADAPTATION = 0.002;
export const FORGE_ORTHO_ZOOM_MIN_ADAPTATION = 0.1;
export const FORGE_ORTHO_ZOOM_MAX_ADAPTATION = 100;
export const FORGE_ORTHO_ZOOM_STEP_ADAPTATION = 0.9;
/**
 * RB-8 (OT.R114, RB.R4; a browser adaptation): the name the camera writes where it asks the pointer lock under a page's
 * `kbm` opt-in (the test room's), outside the literal gate, so the built chunk that asks it carries it and the build test
 * allows that chunk by name beside the Forge's (`test/build_keyboard.test.ts`). Not a mouse site: those stay a
 * development build's alone (`./mouseTesting`).
 */
export const KBM_POINTER_LOCK_SITE = 's2u-kbm-pointer-lock';

export type ForgeViewportView = 'perspective' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

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

/** The letters the Forge's camera flies on while RMB is held (`update`'s `keyboardMove`): taken from the editor then. */
const FORGE_FLY_KEYS = new Set(['keyw', 'keya', 'keys', 'keyd', 'keyq', 'keye', 'keyr', 'keyf']);

export interface FlyCameraOptions {
  /** Called when the wheel changes the speed multiplier, so the page can show it. */
  onSpeedChange?: (multiplier: number, source: 'wheel' | 'setting') => void;
  /** Called when the perspective field of view changes. */
  onFovChange?: (degrees: number) => void;
  /**
   * Called when the camera itself changes the Forge's viewport view, not at the page's own ask: a Walk started from an
   * orthographic view returns to perspective (`setWalking`), so the page's view menu can say so. A browser adaptation, FG.R2.
   */
  onViewportViewChange?: (view: ForgeViewportView) => void;
  /** Called while Forge's RMB look gesture is held, even when pointer lock is unavailable. */
  onLookHoldChange?: (held: boolean) => void;
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
   * It also carries the Forge editor's navigation (RMB look, MMB pan, the orthographic views), and it implies `kbm`: the
   * opt-in's older name, kept as its alias (the replay batch's RB-1).
   */
  forgeKbm?: true;
  /**
   * OT.R114 (the replay batch's RB.R4; a browser adaptation): the camera may read the keyboard and the captured mouse in
   * every build, without the Forge editor's navigation -- `true`, or a predicate asked at each event (the page's
   * `./kbmScope` `kbmAllowed` over its match client, so a test room that joins an online room goes deaf at once).
   * Read as `kbm` / `kbmNow()`; the key, lock and look gates read it from RB-8.
   */
  kbm?: true | (() => boolean);
  /** The Forge's pointer-events overlay; pointer lock still belongs to the canvas. */
  pointerInput?: HTMLElement;
  /** View-space depth at an MMB press, used to pan the clicked point with the pointer. */
  panDepthAt?: (clientX: number, clientY: number) => number | null;
  /** World-space point under the pointer for orbit and dolly gestures. */
  pivotAt?: (clientX: number, clientY: number) => Vector3 | null;
  /** Clips and slides a proposed Forge camera translation against the scene when collision navigation is enabled. */
  constrainMovement?: (from: Vector3, to: Vector3, radius: number) => { position: Vector3; normals: Vector3[] };
}

/**
 * A fly camera in the game's world frame (y up, right-handed, SEMANTICS section 8), with the controls
 * and the feel of a creative-mode build camera:
 *
 * - **Click the canvas to capture the mouse** in the standalone fly view; the Forge instead holds RMB
 *   to look, MMB-drags to pan, and moves along the view direction with the wheel. When pointer lock
 *   is unavailable, dragging still looks where supported.
 * - **W/S** fly along the look direction, pitch included, so looking down and holding W descends.
 *   **A/D** strafe level with the horizon whatever the pitch: a strafe that dipped with the nose makes
 *   it impossible to sidle along a wall while looking at it.
 * - **Space** up, **Shift** down, both in world space. **Double-tap W and hold** to boost, which widens
 *   the view to match -- Minecraft's own sprint gesture, and the only one that is safe here: Ctrl+W
 *   closes the tab and no page can prevent it, so nothing is bound to Ctrl.
 *   The boost is the fly camera's alone: in walk mode nothing boosts (owner, 2026-09-28).
 *   **Q/E** stay bound to down/up as they were, for anyone with the old keys in their fingers.
 * - **Wheel** trims the speed between a tenth and sixteen times; in Forge it moves forward and back
 *   along the look direction unless RMB is held.
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
  private activeCamera: PerspectiveCamera | OrthographicCamera;
  private readonly perspectiveCamera: PerspectiveCamera;
  private readonly orthographicCamera: OrthographicCamera;
  private orthographicHeight: number;
  private orthographicFocusDistance = ORTHOGRAPHIC_REFERENCE_DEPTH_ADAPTATION;
  private viewportView: ForgeViewportView = 'perspective';
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
  private metersPerUnit = 0.1;
  /** The wheel's trim on top of `speed`. */
  private speedMultiplier = 1;
  private lookSpeedMultiplier = 1;
  private cameraCollisionEnabled = false;
  /** Current velocity in game units a second. Public movement state, zeroed by `setPose`. */
  private readonly velocity = new Vector3();
  private readonly pointerInput: HTMLElement;
  /** The vertical field of view at rest: the map's own once `setFov` has it. */
  private restFov = FOV;
  /** The FOV actually applied, eased toward its target so the sprint kick is not a step. */
  private fov = FOV;
  private locked = false;
  /** The forge holds its pointer lock only for the duration of a right-button press. */
  private rightMouseHeld = false;
  private panning: number | null = null;
  private panButton: number | null = null;
  private lastPanX = 0;
  private lastPanY = 0;
  private panUnitsPerPixel = 0;
  private orbiting: { id: number; pivot: Vector3; position: Vector3; yaw: number; pitch: number; x: number; y: number } | null = null;
  private dollying: { id: number; pivot: Vector3; offset: Vector3; y: number } | null = null;
  /** When forward was last tapped, and whether the tap that is still held was the second one. */
  private lastForwardTap = 0;
  private sprinting_ = false;
  /** Walk mode (`./walk`): the keys and the stick steer the mover, and this camera only looks. */
  private walking = false;
  /** Walking, the pitch's limits in radians (`setPitchLimits`: the aim pitch's, W2.1). */
  private walkPitch: [number, number] = [-PITCH_LIMIT, PITCH_LIMIT];
  /** The left button pressed while locked and not yet let go (`onFire`). */
  private triggerHeld = false;
  /** RB-8: what last asked the pointer lock outside a development build (`KBM_POINTER_LOCK_SITE`), else null. */
  kbmLockAsked: string | null = null;
  /** OT.R68: the forge editor's camera, whose keys and captured look are every build's (`FlyCameraOptions.forgeKbm`). */
  readonly forgeKbm: boolean;
  /** OT.R114 / RB.R4: opted in to the keyboard and the mouse at all (`FlyCameraOptions.kbm`, or `forgeKbm`, its alias). */
  readonly kbm: boolean;
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
    this.pointerInput = options.pointerInput ?? canvas;
    this.perspectiveCamera = new PerspectiveCamera(FOV, 1, DEFAULT_NEAR, DEFAULT_FAR);
    this.orthographicHeight = 2 * ORTHOGRAPHIC_REFERENCE_DEPTH_ADAPTATION * Math.tan(MathUtils.degToRad(FOV) / 2);
    this.orthographicCamera = new OrthographicCamera(
      -this.orthographicHeight / 2, this.orthographicHeight / 2,
      this.orthographicHeight / 2, -this.orthographicHeight / 2,
      DEFAULT_NEAR, DEFAULT_FAR,
    );
    this.camera = this.perspectiveCamera;
    this.activeCamera = this.perspectiveCamera;
    this.perspectiveCamera.rotation.order = 'YXZ';
    this.orthographicCamera.rotation.order = 'YXZ';
    this.forgeKbm = options.forgeKbm === true;
    this.kbm = this.forgeKbm || options.kbm === true || typeof options.kbm === 'function';
    this.pointerInput.addEventListener('pointerdown', this.onPointerDown);
    this.pointerInput.addEventListener('pointermove', this.onPointerMove);
    this.pointerInput.addEventListener('pointerup', this.onPointerUp);
    this.pointerInput.addEventListener('pointercancel', this.onPointerUp);
    if (this.pointerInput !== canvas) {
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointermove', this.onPointerMove);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('pointercancel', this.onPointerUp);
    }
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // A right-click is a look-around on a fly camera, not a request for the browser's menu.
    canvas.addEventListener('contextmenu', this.onContextMenu);
    if (import.meta.env.DEV) keyboardSite('s2u-kb-fly-camera');      // OT.R29: the keys a development build's only,
    // RB-8 (OT.R114): and in every build the forge editor's (OT.R68) and a `kbm` page's, asked again at each key (`kbmNow`)
    if (import.meta.env.DEV || this.forgeKbm || this.kbm) {
      globalThis.addEventListener('keydown', this.onKeyDown);
      globalThis.addEventListener('keyup', this.onKeyUp);
    }
    globalThis.addEventListener('blur', this.onBlur);
    if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock');   // OT.R38: the mouse's look a development build's only,
    // RB-8 (OT.R114): and in every build the forge editor's (OT.R68) and a `kbm` page's
    if (import.meta.env.DEV || this.forgeKbm || this.kbm) {
      globalThis.document?.addEventListener('pointerlockchange', this.onLockChange);
    }
  }

  /**
   * OT.R114 / RB.R4: whether the keyboard and the mouse may reach this camera now -- `forgeKbm` and `kbm: true` always,
   * a `kbm` predicate as it answers at this ask, no opt-in never. A development build's own keys are not asked here.
   */
  kbmNow(): boolean {
    if (this.forgeKbm) return true;
    const kbm = this.options.kbm;
    return kbm === true || (typeof kbm === 'function' && kbm());
  }

  /**
   * ONL-18c (web research 166 §8): every listener the constructor added taken off again -- the front end's match mounts
   * a camera for each match and lets it go at the match's end (`./matchMount`); `/testroom`'s lives as long as its page.
   */
  dispose(): void {
    const c = this.canvas;
    this.pointerInput.removeEventListener('pointerdown', this.onPointerDown);
    this.pointerInput.removeEventListener('pointermove', this.onPointerMove);
    this.pointerInput.removeEventListener('pointerup', this.onPointerUp);
    this.pointerInput.removeEventListener('pointercancel', this.onPointerUp);
    if (this.pointerInput !== c) {
      c.removeEventListener('pointerdown', this.onPointerDown);
      c.removeEventListener('pointermove', this.onPointerMove);
      c.removeEventListener('pointerup', this.onPointerUp);
      c.removeEventListener('pointercancel', this.onPointerUp);
    }
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
    this.metersPerUnit = metersPerUnit > 0 ? metersPerUnit : 0.1;
    this.speed = METRES_PER_SECOND / this.metersPerUnit;
  }

  setCameraCollisionEnabled(enabled: boolean): void {
    this.cameraCollisionEnabled = enabled;
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
    const effectiveNear = this.viewNear === null ? near : Math.min(near, this.viewNear);
    for (const camera of [this.perspectiveCamera, this.orthographicCamera]) {
      camera.near = effectiveNear;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * OBF-1 (`./playerCamera` `HEAD_VIEW_NEAR_ADAPTATION`, the owner's OBF.R1): the view from the head's near plane while
   * a camera face stands inside the map's (`headViewNear`), never past the map's; null gives the map's back. The
   * projection only: a point's place on the frame does not depend on it.
   */
  setViewNear(near: number | null): void {
    this.viewNear = near !== null && near > 0 ? near : null;
    const next = this.viewNear === null ? this.mapNear : Math.min(this.mapNear, this.viewNear);
    for (const camera of [this.perspectiveCamera, this.orthographicCamera]) {
      if (camera.near !== next) {
        camera.near = next;
        camera.updateProjectionMatrix();
      }
    }
  }

  /** The map's own vertical field of view, in degrees; the boost widens from it and eases back to it. */
  setFov(degrees: number): void {
    if (!(degrees > 1 && degrees < 179)) return;
    this.restFov = degrees;
    this.fov = degrees;
    this.perspectiveCamera.fov = degrees;
    this.perspectiveCamera.updateProjectionMatrix();
    this.options.onFovChange?.(degrees);
  }

  /**
   * SPECTATOR-VIEW W6 (`./spectatorView` SCENIC_ZOOM): the spectator's scenic magnification as the projection's x / y
   * scale -- three's `zoom`, tan(half FOV) / m (`FUN_002964f0` D:L140524-140527) -- apart from the FOV the scopes and the
   * boost set (`setFov`), which it never touches; `setPose` keeps it. 1 is the camera as it was.
   */
  setMagnification(magnification: number): void {
    if (this.activeCamera.zoom === magnification) return;
    this.activeCamera.zoom = magnification;
    this.activeCamera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.perspectiveCamera.aspect = aspect;
    this.orthographicCamera.left = -this.orthographicHeight * aspect / 2;
    this.orthographicCamera.right = this.orthographicHeight * aspect / 2;
    this.orthographicCamera.top = this.orthographicHeight / 2;
    this.orthographicCamera.bottom = -this.orthographicHeight / 2;
    this.perspectiveCamera.updateProjectionMatrix();
    this.orthographicCamera.updateProjectionMatrix();
  }

  setForgeViewportView(view: ForgeViewportView, focus: Vector3 | null = null): void {
    if (!this.forgeKbm) return;
    if (view === 'perspective') {
      if (this.viewportView !== 'perspective') {
        this.perspectiveCamera.position.copy(this.orthographicCamera.position);
        this.perspectiveCamera.rotation.copy(this.orthographicCamera.rotation);
        this.activeCamera = this.perspectiveCamera;
      }
      this.viewportView = view;
      this.yaw = wrapYawRad(this.perspectiveCamera.rotation.y);
      this.pitch = this.clampPitch(this.perspectiveCamera.rotation.x);
      this.apply();
      return;
    }

    const orientation: Record<Exclude<ForgeViewportView, 'perspective'>, [number, number]> = {
      top: [0, -PITCH_LIMIT],
      bottom: [0, PITCH_LIMIT],
      left: [-Math.PI / 2, 0],
      right: [Math.PI / 2, 0],
      front: [0, 0],
      back: [Math.PI, 0],
    };
    const target = this.viewportView === 'perspective'
      ? focus?.clone() ?? this.perspectiveCamera.position.clone().add(this.perspectiveCamera.getWorldDirection(new Vector3()).multiplyScalar(ORTHOGRAPHIC_REFERENCE_DEPTH_ADAPTATION))
      : this.orthographicCamera.position.clone().add(this.orthographicCamera.getWorldDirection(new Vector3()).multiplyScalar(this.orthographicFocusDistance));
    if (this.viewportView === 'perspective') {
      this.orthographicFocusDistance = Math.max(1, target.distanceTo(this.perspectiveCamera.position));
      this.orthographicHeight = 2 * this.orthographicFocusDistance
        * Math.tan(MathUtils.degToRad(this.perspectiveCamera.fov) / 2) / this.perspectiveCamera.zoom;
      this.orthographicCamera.zoom = 1;
      this.setAspect(this.perspectiveCamera.aspect);
    }
    [this.yaw, this.pitch] = orientation[view];
    this.viewportView = view;
    this.activeCamera = this.orthographicCamera;
    this.apply();
    const forward = this.orthographicCamera.getWorldDirection(new Vector3());
    this.orthographicCamera.position.copy(target).addScaledVector(forward, -this.orthographicFocusDistance);
    this.rightMouseHeld = false;
    this.options.onLookHoldChange?.(false);
    if (globalThis.document?.pointerLockElement === this.canvas) globalThis.document.exitPointerLock?.();
  }

  forgeViewportView(): ForgeViewportView {
    return this.viewportView;
  }

  orbitForgeViewport(dx: number, dy: number, focus: Vector3): void {
    if (!this.forgeKbm || (dx === 0 && dy === 0)) return;
    if (this.activeCamera === this.orthographicCamera) this.setForgeViewportView('perspective');
    const distance = Math.max(1, this.activeCamera.position.distanceTo(focus));
    this.yaw = wrapYawRad(this.yaw - dx * LOOK * this.lookSpeedMultiplier);
    this.pitch = this.clampPitch(this.pitch - dy * LOOK * this.lookSpeedMultiplier);
    this.apply();
    this.activeCamera.position.copy(focus).addScaledVector(this.activeCamera.getWorldDirection(new Vector3()), -distance);
    this.velocity.set(0, 0, 0);
  }

  viewportCamera(): PerspectiveCamera | OrthographicCamera {
    return this.activeCamera;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = MathUtils.clamp(multiplier, FORGE_SPEED_MIN_ADAPTATION, FORGE_SPEED_MAX_ADAPTATION);
    this.options.onSpeedChange?.(this.speedMultiplier, 'setting');
  }

  setLookSpeedMultiplier(multiplier: number): void {
    this.lookSpeedMultiplier = MathUtils.clamp(multiplier, FORGE_LOOK_SPEED_MIN_ADAPTATION, FORGE_LOOK_SPEED_MAX_ADAPTATION);
  }

  lookSpeed(): number {
    return this.lookSpeedMultiplier;
  }

  fieldOfView(): number {
    return this.restFov;
  }

  /** The projection's width/height, the value `setAspect` last wrote (the canvas, or the PS2 aspect). */
  aspect(): number {
    return this.perspectiveCamera.aspect;
  }

  isLookHeld(): boolean {
    return this.rightMouseHeld;
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
    this.activeCamera.position.set(pose.x ?? now.x, pose.y ?? now.y, pose.z ?? now.z);
    this.yaw = wrapYawRad(MathUtils.degToRad(pose.yaw ?? now.yaw));
    if (pose.yaw !== undefined) this.touchYaw = 0;              // a facing set: a finger's look still owed is spent
    if (pose.pitch !== undefined) this.touchPitch = 0;
    this.pitch = this.clampPitch(MathUtils.degToRad(pose.pitch ?? now.pitch));
    this.velocity.set(0, 0, 0);
    this.fov = this.restFov;
    this.perspectiveCamera.fov = this.restFov;
    this.perspectiveCamera.updateProjectionMatrix();
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
    const p = this.activeCamera.position;
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
    // The Forge's Walk is on foot, in perspective: an orthographic view (Top, Front...) has no mouse look (`look`) and
    // is not the walk's view, so it returns to perspective first, the page told (a browser adaptation, FG.R2).
    if (on && this.forgeKbm && this.activeCamera === this.orthographicCamera) {
      this.setForgeViewportView('perspective');
      this.options.onViewportViewChange?.('perspective');
    }
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
    return [-ox / (this.perspectiveCamera.aspect * SCREEN.height), -oy / SCREEN.height];
  }

  /**
   * Walking, where the page puts the view (W2.1): the eye, and the target it looks at with no roll -- `FUN_0029bc90`'s
   * placement, which is three's `lookAt` with y up -- or with no target, the look yaw and pitch give (the scope).
   * The yaw and pitch themselves are untouched: they are the body's turn and the camera's pitch.
   */
  placeView(eye: readonly [number, number, number], target: readonly [number, number, number] | null): void {
    this.activeCamera.position.set(eye[0], eye[1], eye[2]);
    if (target) this.activeCamera.lookAt(target[0], target[1], target[2]);
    else this.apply();
  }

  /** Stand the camera at a point without touching the look, the FOV or anything else `setPose` resets. */
  moveTo(x: number, y: number, z: number): void {
    this.activeCamera.position.set(x, y, z);
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
    // RB-8 (OT.R114, RB.R4): a `kbm` page whose opt-in turned false (the test room joined an online room) holds no key
    // and no pointer lock from here: what was held is let go at this frame, as a lost focus lets it go.
    if (!import.meta.env.DEV && !this.forgeKbm && (this.keys.size > 0 || this.locked) && !this.kbmNow()) this.dropKbm();

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
      if ((!this.forgeKbm || this.activeCamera !== this.orthographicCamera) && (turn !== 0 || tilt !== 0)) {
        const lookSpeed = this.forgeKbm ? this.lookSpeedMultiplier : 1;
        this.yaw = wrapYawRad(this.yaw + turn * ARROW_LOOK * dt * lookSpeed);
        this.pitch = this.clampPitch(this.pitch + tilt * ARROW_LOOK * dt * lookSpeed);
        this.apply();
      }
    }

    // Forward carries the pitch; right is taken from the yaw alone so strafing stays level.
    const forward = new Vector3(0, 0, -1).applyEuler(this.activeCamera.rotation);
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wish = new Vector3();
    // The touch stick, before the keys: it is an analogue pair on the same two axes, so it adds to the
    // same wish vector and everything below -- the ramp, the glide, the frame-rate independence -- is
    // the keys' own model doing the work.
    const orthographicView = this.forgeKbm && this.activeCamera === this.orthographicCamera;
    if (!orthographicView && (this.stickX !== 0 || this.stickY !== 0)) {
      wish.addScaledVector(forward, this.stickY);
      wish.addScaledVector(right, this.stickX);
    }
    if (!orthographicView && this.lift !== 0) wish.y += this.lift;
    const keyboardMove = !this.forgeKbm || (this.activeCamera === this.perspectiveCamera && this.rightMouseHeld);
    if (keyboardMove && this.keys.has('keyw')) wish.add(forward);
    if (keyboardMove && this.keys.has('keys')) wish.sub(forward);
    if (keyboardMove && this.keys.has('keyd')) wish.add(right);
    if (keyboardMove && this.keys.has('keya')) wish.sub(right);
    if (keyboardMove && (this.keys.has('space') || this.keys.has('keye'))) wish.y += 1;
    if (keyboardMove && ((!this.forgeKbm && this.down()) || this.keys.has('keyq'))) wish.y -= 1;
    // R and F, the view's own up and down, are the forge editor's (a browser adaptation, FG.R2; OT.R68): never the test
    // room's fly camera or the match's fly fallback (FP-1b, REVIEW-B 9).
    if (this.forgeKbm && keyboardMove && this.keys.has('keyr')) wish.add(new Vector3(0, 1, 0).applyEuler(this.activeCamera.rotation));
    if (this.forgeKbm && keyboardMove && this.keys.has('keyf')) wish.sub(new Vector3(0, 1, 0).applyEuler(this.activeCamera.rotation));

    const moving = wish.lengthSq() > 0;
    // The walk has no boost (W2.R2: the game's run is 65 and nothing faster), so neither has its field of view.
    const boosting = !this.walking && moving && (
      this.sprinting()
      || (this.stickBoost && (this.stickX !== 0 || this.stickY !== 0))
      || (this.forgeKbm && this.down())
    );
    const forgeMovementFactor = this.forgeMovementFactor();
    if (forgeMovementFactor === 0) this.velocity.set(0, 0, 0);
    const cruise = this.speed * this.speedMultiplier * forgeMovementFactor * (boosting ? SPRINT : 1);
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
      const from = this.activeCamera.position.clone();
      const to = from.clone().add(new Vector3(x.moved, y.moved, z.moved));
      const collisionActive = this.forgeKbm && this.cameraCollisionEnabled
        && this.activeCamera === this.perspectiveCamera && this.rightMouseHeld;
      const constraint = collisionActive
        ? this.options.constrainMovement?.(from, to, FORGE_CAMERA_RADIUS_M_ADAPTATION / this.metersPerUnit)
        : undefined;
      const resolved = constraint?.position ?? to;
      this.activeCamera.position.copy(resolved);
      if (constraint?.normals.length) {
        this.velocity.set(x.velocity, y.velocity, z.velocity);
        for (const normal of constraint.normals) this.velocity.projectOnPlane(normal);
      } else if (collisionActive && !resolved.equals(to)) {
        this.velocity.set(0, 0, 0);
      } else {
        this.velocity.set(x.velocity, y.velocity, z.velocity);
      }
    }

    // Below a millimetre a second the glide is over; snapping to zero keeps a released key from
    // leaving the camera creeping forever and keeps `update` cheap when nothing is happening.
    if (!moving && this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

    const fovTarget = boosting ? this.restFov * SPRINT_FOV : this.restFov;
    if (this.activeCamera === this.perspectiveCamera && Math.abs(this.fov - fovTarget) > 1e-3) {
      this.fov = approach(this.fov, fovTarget, FOV_RATE, dt);
      this.perspectiveCamera.fov = this.fov;
      this.perspectiveCamera.updateProjectionMatrix();
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
      if (this.activeCamera.view?.enabled) this.activeCamera.clearViewOffset();
      return;
    }
    const [ox, oy] = viewOffset(x, y);
    const w = this.perspectiveCamera.aspect * SCREEN.height;
    this.activeCamera.setViewOffset(w, SCREEN.height, ox, oy, w, SCREEN.height);
  }

  /** Double-tapped forward, still held. Released, the sprint ends. */
  private sprinting(): boolean {
    return this.sprinting_ && this.keys.has('keyw');
  }

  private down(): boolean {
    return this.keys.has('shiftleft') || this.keys.has('shiftright');
  }

  private forgeMovementFactor(): number {
    if (!this.forgeKbm) return 1;
    if (this.keys.has('controlleft') || this.keys.has('controlright')) return 0;
    return 1;
  }

  private apply(): void {
    this.activeCamera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private look(dx: number, dy: number): void {
    if (this.forgeKbm && this.activeCamera === this.orthographicCamera) return;
    if (this.walking) {
      // The viewer's mouse mapping (`LookLaw.mouse`): raw angles now, or counts kept for the stick law's frame.
      const [yaw, pitch] = this.law.mouse(dx, dy);
      if (yaw === 0 && pitch === 0) return;
      this.yaw = wrapYawRad(this.yaw + yaw);
      this.pitch = nudgePitch(this.pitch, pitch, this.walkPitch[0], this.walkPitch[1]);
      this.apply();
      return;
    }
    const sensitivity = this.forgeKbm ? this.lookSpeedMultiplier : 1;
    this.yaw = wrapYawRad(this.yaw - dx * LOOK * sensitivity);
    this.pitch = this.clampPitch(this.pitch - dy * LOOK * sensitivity);
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
    if (this.forgeKbm && this.activeCamera === this.perspectiveCamera && e.altKey && (e.button === 0 || e.button === 2)) {
      const pivot = this.options.pivotAt?.(e.clientX, e.clientY)
        ?? this.activeCamera.position.clone().add(this.activeCamera.getWorldDirection(new Vector3()).multiplyScalar(FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION));
      this.velocity.set(0, 0, 0);
      if (e.button === 0) {
        this.orbiting = {
          id: e.pointerId, pivot, position: this.activeCamera.position.clone(), yaw: this.yaw, pitch: this.pitch,
          x: e.clientX, y: e.clientY,
        };
      } else {
        this.rightMouseHeld = true;
        this.options.onLookHoldChange?.(true);
        this.dollying = { id: e.pointerId, pivot, offset: this.activeCamera.position.clone().sub(pivot), y: e.clientY };
      }
      if (!this.locked && !capturePointer(this.pointerInput, e.pointerId)) {
        this.orbiting = null;
        this.dollying = null;
        if (e.button === 2) {
          this.rightMouseHeld = false;
          this.options.onLookHoldChange?.(false);
        }
      }
      e.stopImmediatePropagation();
      return;
    }
    if (this.forgeKbm && (e.button === 1 || (e.button === 2 && this.activeCamera === this.orthographicCamera))) {
      this.panning = e.pointerId;
      this.panButton = e.button;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      const rect = this.pointerInput.getBoundingClientRect();
      const depth = this.options.panDepthAt?.(e.clientX, e.clientY) ?? FORGE_PIVOT_FALLBACK_DEPTH_ADAPTATION;
      const verticalSpan = this.activeCamera === this.perspectiveCamera
        ? 2 * Math.max(0.1, depth) * Math.tan(MathUtils.degToRad(this.perspectiveCamera.fov) / 2)
        : this.orthographicHeight;
      this.panUnitsPerPixel = verticalSpan / (Math.max(1, rect.height) * this.activeCamera.zoom);
      if (!this.locked && !capturePointer(this.pointerInput, e.pointerId)) this.panning = null;
      e.stopImmediatePropagation();
      return;
    }
    if (this.forgeKbm && e.button !== 2 && !(this.locked && e.button === 0)) return;
    if (this.forgeKbm && e.button === 2) {
      this.rightMouseHeld = true;
      this.options.onLookHoldChange?.(true);
    }
    // A click on a checkbox leaves it focused, and `onKeyDown` ignores anything aimed at an input --
    // so without this, touching any panel control killed WASD until the page was reloaded. The canvas
    // has no tabindex and never takes focus by itself, so the focus is dropped by hand.
    const focused = globalThis.document?.activeElement;
    if (focused instanceof HTMLElement && focused !== this.canvas) focused.blur();
    // OT.R38 / H115 ("Controller only"): the pointer lock, the locked mouse's trigger and look, and a mouse's or a pen's
    // drag look are a development build's only (`./mouseTesting`); a release keeps a finger's drag (the touch layer).
    // OT.R68: the forge editor's page asks for its right-button look lock in every build. RB-8 (OT.R114, RB.R4): a `kbm`
    // page's camera (the test room's) takes the lock, its locked trigger and its drag look in every build too, while its
    // opt-in answers true at this press.
    const kbmMouse = this.kbm && this.kbmNow();
    if (import.meta.env.DEV || this.forgeKbm || kbmMouse) {
      if (import.meta.env.DEV) mouseSite('s2u-mouse-pointer-lock');
      if (this.locked) {
        if (e.button === 0) { this.triggerHeld = true; this.options.onFire?.(true); }
        return;
      }
      if (!this.forgeKbm && e.pointerType === 'mouse') {
        // Raw mouse input where the browser offers it: the OS's pointer acceleration is for a cursor, not for a look. A
        // refusal of the raw request falls back to the plain one, and a refusal of that to the drag; none of them may
        // reach the console as an uncaught rejection (`./pointerLock`, `requestLock`).
        if (!import.meta.env.DEV) this.kbmLockAsked = KBM_POINTER_LOCK_SITE;   // RB-8: the build test's allow-list, by name
        requestLock(this.canvas);
      }
    }
    if (e.pointerType !== 'touch') {
      if (import.meta.env.DEV) mouseSite('s2u-mouse-drag-look');
      else if (!this.forgeKbm && !kbmMouse) return;                  // a release: only a finger drags the look (RB-8: or a `kbm` page's mouse)
    }
    if (this.dragging !== null) return;
    this.dragging = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    // Refused when the pointer is already gone (the click became the lock, a synthetic event): no `pointerup` will come
    // for it, so there is no drag to keep, and it is not an error (`./pointer`).
    if (!capturePointer(this.pointerInput, e.pointerId)) this.dragging = null;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.suspended) return;                     // a menu holds the input
    if (this.forgeKbm && this.orbiting !== null && this.orbiting.id === e.pointerId) {
      const state = this.orbiting;
      const sensitivity = this.lookSpeedMultiplier;
      const yawDelta = -(e.clientX - state.x) * LOOK * sensitivity;
      const yaw = wrapYawRad(state.yaw + yawDelta);
      const pitch = this.clampPitch(state.pitch - (e.clientY - state.y) * LOOK * sensitivity);
      const offset = state.position.clone().sub(state.pivot).applyAxisAngle(new Vector3(0, 1, 0), yawDelta);
      const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      offset.applyAxisAngle(right, pitch - state.pitch);
      this.activeCamera.position.copy(state.pivot).add(offset);
      this.yaw = yaw;
      this.pitch = pitch;
      this.apply();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (this.forgeKbm && this.dollying !== null && this.dollying.id === e.pointerId) {
      const state = this.dollying;
      const distance = Math.max(0.1, state.offset.length() * Math.exp((e.clientY - state.y) * FORGE_DOLLY_RATE_ADAPTATION));
      this.activeCamera.position.copy(state.pivot).add(state.offset.clone().setLength(distance));
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (this.forgeKbm && this.panning !== null && this.panning === e.pointerId) {
      const dx = e.clientX - this.lastPanX, dy = e.clientY - this.lastPanY;
      this.activeCamera.translateX(-dx * this.panUnitsPerPixel);
      this.activeCamera.translateY(dy * this.panUnitsPerPixel);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    // OT.R38: the locked look a development build's; OT.R68 the forge's; RB-8 (OT.R114) a `kbm` page's while its opt-in holds
    if ((import.meta.env.DEV || this.forgeKbm || this.kbmNow()) && this.locked) {
      if (!this.editorFly() || this.rightMouseHeld) this.look(e.movementX ?? 0, e.movementY ?? 0);
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
    if (this.forgeKbm && (e.button === 0 || e.type === 'pointercancel') && this.orbiting !== null && this.orbiting.id === e.pointerId) {
      this.orbiting = null;
      releasePointer(this.pointerInput, e.pointerId);
      e.stopImmediatePropagation();
    }
    if (this.forgeKbm && (e.button === 2 || e.type === 'pointercancel') && this.dollying !== null && this.dollying.id === e.pointerId) {
      this.dollying = null;
      releasePointer(this.pointerInput, e.pointerId);
      e.stopImmediatePropagation();
    }
    if (this.forgeKbm && (e.button === this.panButton || e.type === 'pointercancel') && this.panning !== null && this.panning === e.pointerId) {
      this.panning = null;
      this.panButton = null;
      releasePointer(this.pointerInput, e.pointerId);
      e.stopImmediatePropagation();
    }
    if (this.forgeKbm && (e.button === 2 || e.type === 'pointercancel')) {
      this.rightMouseHeld = false;
      this.options.onLookHoldChange?.(false);
      for (const key of ['keyw', 'keys', 'keya', 'keyd', 'keyq', 'keye', 'keyr', 'keyf', 'space', 'shiftleft', 'shiftright']) this.keys.delete(key);
      this.velocity.set(0, 0, 0);
      if (this.editorFly() && globalThis.document?.pointerLockElement === this.canvas) globalThis.document.exitPointerLock?.();
    }
    if (e.button === 0) this.letGo();
    if (this.dragging !== e.pointerId) return;
    this.dragging = null;
    releasePointer(this.pointerInput, e.pointerId);
  };

  /**
   * The Forge editor's fly navigation (a browser adaptation, FG.R2): the lock and the locked look held only while RMB is
   * (`onLockChange`, `onPointerMove`, `onPointerUp`). Its Walk is not the editor's fly: the lock Walk's own press asks
   * (`./forge/page` `toggleWalk`, the toolbar or V) is kept, and the captured mouse looks as a walk's does elsewhere.
   */
  private editorFly(): boolean {
    return this.forgeKbm && !this.walking;
  }

  /** RB-8: the keys let go and the pointer lock given back, once a `kbm` page's opt-in answers false. */
  private dropKbm(): void {
    this.keys.clear();
    this.sprinting_ = false;
    if (this.locked && globalThis.document?.pointerLockElement === this.canvas) globalThis.document.exitPointerLock?.();
  }

  private readonly onLockChange = (): void => {
    this.locked = globalThis.document?.pointerLockElement === this.canvas;
    if (this.editorFly() && this.locked && !this.rightMouseHeld) globalThis.document?.exitPointerLock?.();
    if (!this.locked) this.letGo();
    if (this.locked && this.dragging !== null) {
      // The click that took the lock also started a drag; the lock owns the look from here.
      releasePointer(this.pointerInput, this.dragging);
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

  /** The Forge moves along its look unless RMB is held, when the wheel trims fly speed instead. */
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.forgeKbm) {
      if (this.suspended) return;
      if (this.rightMouseHeld) {
        const step = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
        this.speedMultiplier = MathUtils.clamp(this.speedMultiplier * step, SPEED_MIN, SPEED_MAX);
        this.options.onSpeedChange?.(this.speedMultiplier, 'wheel');
        return;
      }
      const deltaY = e.deltaMode === 1
        ? e.deltaY * 16
        : e.deltaMode === 2
          ? e.deltaY * (this.pointerInput.clientHeight || 800)
          : e.deltaY;
      const movementFactor = this.forgeMovementFactor();
      if (this.activeCamera === this.orthographicCamera) {
        const zoomFactor = Math.exp(-deltaY * FORGE_ORTHO_WHEEL_ZOOM_ADAPTATION);
        this.orthographicCamera.zoom = MathUtils.clamp(this.orthographicCamera.zoom * zoomFactor, FORGE_ORTHO_ZOOM_MIN_ADAPTATION, FORGE_ORTHO_ZOOM_MAX_ADAPTATION);
        this.orthographicCamera.updateProjectionMatrix();
      } else if (movementFactor !== 0) {
        const forward = this.activeCamera.getWorldDirection(new Vector3());
        this.activeCamera.position.addScaledVector(
          forward,
          -deltaY * this.speed * this.speedMultiplier * FORGE_WHEEL_TRAVEL_ADAPTATION * movementFactor,
        );
      }
      return;
    }
    const step = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    this.speedMultiplier = MathUtils.clamp(this.speedMultiplier * step, SPEED_MIN, SPEED_MAX);
    this.options.onSpeedChange?.(this.speedMultiplier, 'wheel');
  };

  /**
   * Whether a navigation gesture holds the viewport: RMB held (the fly look, the Alt+RMB dolly), the MMB or orthographic
   * RMB pan, the Alt+LMB orbit, or a drag look. The Forge's key map reads it (`./forge/keys` `navigating`): its own
   * keydown listener runs in the capture phase, before this camera's, so the camera cannot keep the keys from it alone.
   */
  navigating(): boolean { return this.forgeNavigating(); }
  private forgeNavigating(): boolean {
    return this.rightMouseHeld || this.panning !== null || this.orbiting !== null || this.dollying !== null || this.dragging !== null;
  }

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
    if (!import.meta.env.DEV && !this.kbmNow()) return;   // RB-8 (OT.R114): a `kbm` page's opt-in, asked at each key
    if (e.target instanceof HTMLElement && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    const code = e.code.toLowerCase();
    // While the Forge navigates -- RMB held to fly, or any other navigation drag (`forgeNavigating`) -- its fly keys are
    // the camera's alone, so the editor's W / E / R (the gizmo's modes) and the rest of the letters it flies on never
    // reach the page's own keys then.
    if (this.forgeKbm && this.forgeNavigating() && FORGE_FLY_KEYS.has(code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (this.forgeKbm && this.rightMouseHeld && (code === 'keyz' || code === 'keyc')) {
      e.preventDefault();
      if (!e.repeat && this.activeCamera === this.perspectiveCamera) {
        this.setFov(MathUtils.clamp(this.perspectiveCamera.fov + (code === 'keyz' ? FORGE_FOV_STEP_ADAPTATION : -FORGE_FOV_STEP_ADAPTATION), FORGE_FOV_MIN_ADAPTATION, FORGE_FOV_MAX_ADAPTATION));
      } else if (!e.repeat) {
        const step = FORGE_ORTHO_ZOOM_STEP_ADAPTATION;
        this.setMagnification(MathUtils.clamp(this.activeCamera.zoom * (code === 'keyz' ? step : 1 / step), FORGE_ORTHO_ZOOM_MIN_ADAPTATION, FORGE_ORTHO_ZOOM_MAX_ADAPTATION));
      }
      e.stopImmediatePropagation();
    } else if (OWNED.has(code)) e.preventDefault();

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
    if (this.panning !== null) releasePointer(this.pointerInput, this.panning);
    if (this.orbiting !== null) releasePointer(this.pointerInput, this.orbiting.id);
    if (this.dollying !== null) releasePointer(this.pointerInput, this.dollying.id);
    this.panning = null;
    this.panButton = null;
    this.orbiting = null;
    this.dollying = null;
    this.rightMouseHeld = false;
    this.options.onLookHoldChange?.(false);
    if (this.forgeKbm && globalThis.document?.pointerLockElement === this.canvas) globalThis.document.exitPointerLock?.();
  };
}
