import { strongest, type Input } from '../../gamepad';
import { SCENIC_LOOK, type SpectatorMode } from '../../spectatorView';
import type { ReplaySteerHeld, ReplayWorldHost } from './worldHost';

/**
 * RVK-B (LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully navigable with keyboard and mouse.
 * Every view."): the test room's read of the replay viewer's steer lane (`./worldHost` `ReplaySteerLane`), framed as
 * the viewer's world only (`../../main.ts`, `REPLAY_WORLD !== null`, where its pad input is built). A browser adaptation
 * with no original -- the game plays no recording back -- that changes nothing a match does: the viewer, in its own page,
 * holds its keyboard and mouse (the frame stays deaf: no key or pointer gate of the frame changes), and hands the world
 * only what a pad would hand it.
 *
 * - **Held** (the keyboard's): merged into the frame's input as a second pad (`steerInput`: on each axis the larger push,
 *   the lift as the pad's Square up / crouch down, the boost as the stick boost), so FREE flies by `feedCamera`'s own lanes
 *   and SCENIC turns and zooms by the spectator's own sticks (`SpectatorView.pad`, SCENIC_LOOK_AXES_READING). An idle lane
 *   hands the input back as it was -- the same object -- so the frame is today's.
 * - **The drag and the wheel** (the mouse's): FREE turns by the fly camera's own drag look (`FlyCamera.lookBy`, its
 *   `look` at its `LOOK` per pixel) and trims its fly speed by the camera's own wheel (one `wheel` event on its canvas per
 *   notch, `FlyCamera.onWheel`'s step and bounds); SCENIC turns and zooms by `SpectatorView.scenicBy`, the sticks' own path
 *   over a step (`REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION`, `REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION`). PLAYER takes
 *   neither: the follow pose is the page's each frame.
 * - **Under the frame's own menu** (`menu`: the START menu, a screen that holds the pad) the lane is read and dropped, as
 *   the pad's sticks are held there.
 */

/**
 * REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION: how far one pixel of the viewer's drag turns a scenic view -- the fly
 * camera's own drag look per pixel (`../../camera.ts` `LOOK`, 0.0028 rad), so a drag turns SCENIC as far as it turns FREE.
 * A browser adaptation: the original's scenic view turns by the stick alone (SCENIC_LOOK).
 */
export const REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION = 0.0028;

/**
 * REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION: one wheel notch on a scenic view, as the zoom stick held full for this many
 * seconds (SCENIC_ZOOM: x (1 + 0.1 x 1.3) = 1.13 a notch, about the fly camera's 1.15 a notch on its speed). A browser
 * adaptation: the original zooms by the left stick alone.
 */
export const REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION = 0.1;

/** Whether nothing is held (the deltas aside). */
const idle = (h: ReplaySteerHeld): boolean =>
  h.moveX === 0 && h.moveY === 0 && h.lift === 0 && !h.boost && h.lookX === 0 && h.lookY === 0;

/**
 * The frame's input with the lane's held values merged in, pure: on each axis the larger push (`strongest`, the pads'
 * own merge), Square's up (`jump`) for a lift up, the crouch for a lift down (the spectator's down, `feedCamera`), the
 * stick boost. Nothing held: `input` itself, untouched.
 */
export function steerInput(input: Input, held: ReplaySteerHeld): Input {
  if (idle(held)) return input;
  return {
    ...input,
    moveX: strongest(input.moveX, held.moveX),
    moveY: strongest(input.moveY, held.moveY),
    lookX: strongest(input.lookX, held.lookX),
    lookY: strongest(input.lookY, held.lookY),
    jump: input.jump || held.lift > 0,
    crouch: input.crouch || held.lift < 0,
    boost: input.boost || held.boost,
  };
}

/** What the read turns: the fly camera's drag look, the canvas its wheel listens on, the page's spectator view. */
export interface SteerTargets {
  fly: { lookBy(dx: number, dy: number): void };
  wheel: EventTarget | null;
  spectator: { readonly mode: SpectatorMode; scenicBy(lookX: number, lookY: number, zoom: number): boolean } | null;
}

/**
 * The frame's read, once a frame (the module's doc): the lane taken (its deltas spent), the drag and the wheel applied to
 * the camera the spectator is in, and the input with the held values merged. No lane on the host: `input` itself.
 */
export function readReplaySteer(host: Pick<ReplayWorldHost, 'steer'>, input: Input, menu: boolean, to: SteerTargets): Input {
  const lane = host.steer;
  if (!lane || typeof lane.take !== 'function') return input;
  const f = lane.take();
  if (menu) return input;
  const mode = to.spectator?.mode ?? 'free';
  if (mode === 'free') {
    if (f.lookDx !== 0 || f.lookDy !== 0) to.fly.lookBy(f.lookDx, f.lookDy);
    const wheel = to.wheel;
    if (wheel && f.notches !== 0) {
      const View = (wheel as Partial<Node>).ownerDocument?.defaultView;
      const Wheel = View?.WheelEvent ?? globalThis.WheelEvent;
      for (let i = 0; i < Math.min(Math.abs(Math.round(f.notches)), 16); i++) {
        wheel.dispatchEvent(new Wheel('wheel', { deltaY: f.notches > 0 ? -1 : 1, cancelable: true }));
      }
    }
  } else if (mode === 'scenic' && to.spectator && (f.lookDx !== 0 || f.lookDy !== 0 || f.notches !== 0)) {
    const perPx = REPLAY_DRAG_LOOK_RADIANS_PER_PX_ADAPTATION / SCENIC_LOOK.rate;
    to.spectator.scenicBy(f.lookDx * perPx, -f.lookDy * perPx, f.notches * REPLAY_WHEEL_ZOOM_STICK_SECONDS_ADAPTATION);
  }
  return steerInput(input, f);
}
