/**
 * Moving and looking on a touch screen.
 *
 * Two floating sticks (owner, 2026-09-29): a finger landing on the left half is the move stick, one on the right half
 * (while walking; flying keeps the canvas's one-finger drag) the look stick. Each is born where its thumb lands, its knob
 * follows the thumb clamped to the base, and it is let go on the lift; each half tracks its own finger, so both are
 * held at once. The sticks are a pad: their knobs are the standard layout's axes 0/1 and 2/3 (`sticksPad`), read by
 * `./gamepad`'s `padInput` -- the same dead zone, rescale and everything downstream a pad's sticks get. The buttons
 * (the lift pair, the stance, the fire, and walk mode's pad buttons) are elements above the zones: a press on one never
 * reaches a zone, and a zone holds its finger, so a stick never presses a button.
 */
import type { FlyCamera } from './camera';
import { PAD_LAYOUT, padInput, type GamepadLike, type Input } from './gamepad';
import { capturePointer, releasePointer } from './pointer';

/**
 * What the sticks and the buttons write: the camera's touch lanes, and the look's. The page hands over its own lane
 * instead of the camera, to merge the sticks with a pad's before the camera sees either (`./gamepad`, `mergeInput`).
 */
export type TouchTarget = Pick<FlyCamera, 'setStick' | 'setLift' | 'setStickBoost'> & { setLook?(x: number, y: number): void };

/** How far from the centre counts as nothing, as a fraction of the base's radius. */
export const DEAD_ZONE = 0.15;

/** The stick's travel in CSS pixels: past this it is fully pushed (the base is 116px across, its knob 46px). */
export const STICK_RADIUS = 52;
const RADIUS = STICK_RADIUS;
/** How far a push counts as the rim, and how long it has to stay there to mean a boost. */
export const RIM = 0.97;
export const RIM_HOLD_MS = 400;

/**
 * The boost gesture on a phone: the thumb pushed to the stick's rim and held there. A moment at the
 * rim is ordinary steering; holding it is the ask. There is no second control for it, because a
 * second control is the thing a thumb cannot reach while it is on the stick. It is the fly camera's
 * boost alone: on foot the camera ignores it (`FlyCamera.setStickBoost`; no sprint in walk mode).
 */
export function boostFromRim(pushed: number, heldMs: number): boolean {
  return pushed >= RIM && heldMs >= RIM_HOLD_MS;
}

/**
 * Where the stick is pushed, as an axis pair in the unit disc.
 *
 * `dx`/`dy` are the thumb's offset from where it landed, in CSS pixels, with `dy` positive *down* the
 * screen the way a pointer event gives it. What comes back is `x` right and `y` **forward**, so the
 * sign of `dy` flips: pushing the stick up the screen moves the camera the way it is looking.
 *
 * Two shaping rules, both there to stop the stick feeling wrong rather than to be clever:
 *
 * - **Dead zone.** A thumb resting on the glass wanders a few pixels, and without a dead zone the
 *   camera creeps whenever a finger is down. Inside it the answer is exactly zero.
 * - **Rescaled past it.** The magnitude is remapped so that the dead-zone edge is 0 and the rim is 1,
 *   rather than jumping straight to `DEAD_ZONE` the moment the zone is left. Direction is untouched.
 *
 * The magnitude is clamped to 1, so a thumb dragged off the base is fully pushed rather than faster
 * than fully pushed -- `camera.update` clamps too, but a vector that means what it says is easier to
 * reason about than one that relies on being clamped later.
 */
export function stickVector(dx: number, dy: number, radius = RADIUS, deadZone = DEAD_ZONE): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const pushed = Math.min(distance / radius, 1);
  if (pushed <= deadZone) return { x: 0, y: 0 };
  const scale = ((pushed - deadZone) / (1 - deadZone)) / distance;
  return { x: dx * scale, y: -dy * scale };
}

/** Where the knob is drawn, in pixels from the base's centre: the raw offset, clamped to the rim. */
export function knobOffset(dx: number, dy: number, radius = RADIUS): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return { x: dx, y: dy };
  return { x: (dx / distance) * radius, y: (dy / distance) * radius };
}

/**
 * Is this a device that wants them? A coarse pointer says so up front, and a touch event says so for
 * the hybrids a media query gets wrong -- a laptop with a touch screen reports a fine pointer and can
 * still be poked. Either one shows the controls, and once shown they stay. The window's width is not read: a narrow
 * or zoomed desktop window is still a desktop (OT.R29, the setup page's review 2).
 */
export function wantsTouchControls(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * A real touch device: a coarse pointer that cannot hover (a phone, a tablet). The setup page's START wants a supported
 * controller (OT.R29, the owner: "controller support only"); such a device starts with its page controls instead. A
 * fine-pointer desktop never passes, whatever its width or zoom, and a touch laptop that hovers neither. A browser
 * adaptation.
 */
export function touchDevice(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * One floating stick: born where its finger lands (`down`), its knob following the finger clamped to `radius`
 * (`move`), let go on the lift (`up`). It answers only the finger that started it. What it reports is a pad stick's:
 * `axes` is the knob over the radius, in the unit disc, x right and y growing *down* as the Gamepad API gives them, with
 * no dead zone -- the pad pipeline applies that (`stickInput`).
 */
export class FloatingStick {
  private id: number | null = null;
  private ox = 0;
  private oy = 0;
  private dx = 0;
  private dy = 0;

  constructor(readonly radius = STICK_RADIUS) {}

  get held(): boolean {
    return this.id !== null;
  }

  /** A finger lands: the stick is born under it, unless another finger holds it already. */
  down(id: number, x: number, y: number): boolean {
    if (this.id !== null) return false;
    this.id = id;
    this.ox = x;
    this.oy = y;
    this.dx = 0;
    this.dy = 0;
    return true;
  }

  /** Its finger moved; any other finger's move is not this stick's. */
  move(id: number, x: number, y: number): boolean {
    if (id !== this.id) return false;
    this.dx = x - this.ox;
    this.dy = y - this.oy;
    return true;
  }

  /** Its finger lifted (or was cancelled): centred and free for the next. */
  up(id: number): boolean {
    if (id !== this.id) return false;
    this.release();
    return true;
  }

  /** Let go whatever holds it. */
  release(): void {
    this.id = null;
    this.dx = 0;
    this.dy = 0;
  }

  origin(): { x: number; y: number } {
    return { x: this.ox, y: this.oy };
  }

  /** The knob's offset from the base's centre, in pixels, clamped to the rim. */
  knob(): { x: number; y: number } {
    const k = knobOffset(this.dx, this.dy, this.radius);
    return { x: k.x + 0, y: k.y + 0 };
  }

  /** How far it is pushed, 0 to 1. */
  pushed(): number {
    return Math.min(Math.hypot(this.dx, this.dy) / this.radius, 1);
  }

  /** The stick as a pad's axis pair: x right, y down, in the unit disc, unshaped. */
  axes(): [number, number] {
    const k = this.knob();
    return [k.x / this.radius + 0, k.y / this.radius + 0];
  }
}

/** The two sticks as a pad with no buttons: the move stick on the standard layout's axes 0/1, the look stick on 2/3. */
export function sticksPad(move: FloatingStick, look: FloatingStick | null): GamepadLike {
  return { axes: [...move.axes(), ...(look ? look.axes() : [0, 0])], buttons: [] };
}

/**
 * The two sticks read through the pad's own pipeline (`padInput`): the pad's dead zone, rescale and y flip. Through
 * `PAD_LAYOUT`, never the active controller config: the floating sticks are placed under the thumbs and stay move and
 * look in every preset (a browser adaptation; OPT-14, research 344 §7).
 */
export function stickInput(move: FloatingStick, look: FloatingStick | null): Input {
  return padInput(sticksPad(move, look), PAD_LAYOUT);
}

/** What the touch C button reports: pressed, let go, or cancelled (the finger taken by the system: no tap). */
export type StanceTouch = 'down' | 'up' | 'cancel';

/**
 * What `attachTouchControls` hands back: a way to let both sticks go (a pad connecting hides the touch layer), and the
 * sticks as a pad's four axes (`sticksPad`'s), for the touch layer's virtual pad (MP-1, FI.R3: `./matchTouch`).
 */
export interface TouchControls { release(): void; axes(): number[] }

/**
 * Where the layer lives (PAR-5, web research 222 §11): every element is found under `root` -- never looked up on the
 * document, so two roots never take each other's -- and the layer's `touch` class is `root`'s. `root` defaults to the
 * page's body (`/testroom`'s case). `signal` takes every listener off when it aborts; `win` is where a hybrid's first
 * `touchstart` is heard (the global by default), taken off by the same signal. `blocked` (MP-1, FI.R4): while it says
 * so -- the layer hidden because the game reads a pad -- a press reaches no button and starts no stick.
 */
export interface TouchScope {
  root?: HTMLElement;
  signal?: AbortSignal;
  win?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  blocked?: () => boolean;
  /**
   * MP-1's review F1: where the walk pad's buttons put their reset -- each lets go of its finger and its `is-down`
   * without a press (the virtual pad is let go by its owner), for a layer hidden or released with a thumb still on it,
   * whose `pointerup` an inert, hidden button may never get.
   */
  resets?: (() => void)[];
}

/**
 * The scope's element of id `id`, under its root alone. An attribute selector, not `#id`: a selector engine may answer
 * `#id` through the document's `getElementById` (jsdom's does) -- the first such element on the page, not the root's.
 */
export const under = (root: ParentNode, id: string): HTMLElement | null => root.querySelector<HTMLElement>(`[id="${id}"]`);

/**
 * Wires the two sticks and the lift buttons to a camera, or to a lane that stands in for one; the stance button beside
 * them to `onStance` (the walk's `C`: its press, release and cancel), and the fire button to `onFire` -- pressed true,
 * let go false. The move stick is `#stick-zone` (with `#stick-base`/`#stick-knob`), the look stick `#aim-zone` (with
 * `#aim-base`/`#aim-knob`), which the stylesheet shows only while walking. Each is found under `scope.root`.
 */
export function attachTouchControls(
  camera: TouchTarget, onStance: (event: StanceTouch) => void = () => undefined, onFire: (down: boolean) => void = () => undefined,
  scope: TouchScope = {},
): TouchControls {
  const none: TouchControls = { release: () => undefined, axes: () => [0, 0, 0, 0] };
  const root = scope.root ?? document.body;
  const signal = scope.signal;
  const blocked = (): boolean => scope.blocked?.() ?? false;
  const on = signal ? { signal } : undefined;
  const up = under(root, 'touch-up');
  const down = under(root, 'touch-down');
  const moveStick = new FloatingStick();
  const lookStick = new FloatingStick();
  /** Both sticks, through the pad's pipeline, into the lanes. */
  const feed = (): void => {
    const v = stickInput(moveStick, lookStick);
    camera.setStick(v.moveX, v.moveY);
    camera.setLook?.(v.lookX, v.lookY);
  };

  const show = (): void => root.classList.add('touch');
  if (wantsTouchControls()) show();
  // A hybrid device only gives itself away by being touched. Once, then the listener is done (or taken off with the rest).
  const heard: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = scope.win ?? globalThis;
  heard.addEventListener('touchstart', show, { once: true, passive: true });
  signal?.addEventListener('abort', () => { heard.removeEventListener('touchstart', show); }, { once: true });

  /** The timer that turns a held rim into a boost (the fly camera's), or null while the move stick is short of it. */
  let rimTimer: ReturnType<typeof setTimeout> | null = null;
  const leaveRim = (): void => {
    if (rimTimer !== null) clearTimeout(rimTimer);
    rimTimer = null;
    camera.setStickBoost(false);
  };
  signal?.addEventListener('abort', () => { if (rimTimer !== null) clearTimeout(rimTimer); rimTimer = null; }, { once: true });

  const releases: Array<() => void> = [];
  const wire = (zoneId: string, baseId: string, knobId: string, stick: FloatingStick, onMove: () => void, onLift: () => void): void => {
    const zone = under(root, zoneId);
    const base = under(root, baseId);
    const knob = under(root, knobId);
    if (!zone || !base || !knob) return;
    let captured: number | null = null;
    const lift = (): void => {
      if (captured !== null) releasePointer(zone, captured);
      captured = null;
      stick.release();
      zone.classList.remove('is-held');
      base.hidden = true;
      knob.style.transform = 'translate(-50%, -50%)';
      onLift();
      feed();
    };
    releases.push(lift);
    zone.addEventListener('pointerdown', (e) => {
      if (e.target !== zone || blocked() || !stick.down(e.pointerId, e.clientX, e.clientY)) return;
      // The base is placed where the thumb landed rather than sitting in a fixed corner: a thumb reaches where it
      // reaches, and a stick that starts under it never has to be found first.
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.hidden = false;
      zone.classList.add('is-held');
      knob.style.transform = 'translate(-50%, -50%)';
      captured = e.pointerId;
      capturePointer(zone, e.pointerId);
      e.preventDefault();
    }, on);
    zone.addEventListener('pointermove', (e) => {
      if (!stick.move(e.pointerId, e.clientX, e.clientY)) return;
      const at = stick.knob();
      knob.style.transform = `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))`;
      onMove();
      feed();
      e.preventDefault();
    }, on);
    const end = (e: PointerEvent): void => { if (stick.up(e.pointerId)) lift(); };
    zone.addEventListener('pointerup', end, on);
    zone.addEventListener('pointercancel', end, on);
  };

  wire('stick-zone', 'stick-base', 'stick-knob', moveStick, () => {
    // A thumb held still at the rim sends no more events, so the hold is a timer rather than a poll.
    if (boostFromRim(moveStick.pushed(), RIM_HOLD_MS)) {
      if (rimTimer === null) rimTimer = setTimeout(() => camera.setStickBoost(true), RIM_HOLD_MS);
    } else {
      leaveRim();
    }
  }, leaveRim);
  wire('aim-zone', 'aim-base', 'aim-knob', lookStick, () => undefined, () => undefined);
  const controls: TouchControls = { release: () => { for (const r of releases) r(); }, axes: () => [...sticksPad(moveStick, lookStick).axes] };
  if (!up || !down) return releases.length > 0 ? controls : none;

  // The stance: C on a keyboard (owner, 2026-09-29) -- the walk tells the tap from the hold (`WalkMode.stanceTouch`), so the
  // button reports its press and its release; one finger at a time, and a cancel (the system took the finger) is no tap.
  const stance = under(root, 'touch-stance');
  if (stance) {
    let down: number | null = null;
    /** Whether the browser holds the pointer for the button: if not, sliding off it is the release. */
    let held = true;
    stance.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (down !== null || blocked()) return;
      down = e.pointerId;
      held = capturePointer(stance, e.pointerId);
      stance.classList.add('is-down');
      onStance('down');
    }, on);
    const lift = (event: StanceTouch) => (e: PointerEvent): void => {
      if (down === null || e.pointerId !== down) return;
      down = null;
      releasePointer(stance, e.pointerId);
      stance.classList.remove('is-down');
      onStance(event);
    };
    stance.addEventListener('pointerup', lift('up'), on);
    stance.addEventListener('pointercancel', lift('cancel'), on);
    stance.addEventListener('lostpointercapture', lift('cancel'), on);
    const slid = lift('up');
    stance.addEventListener('pointerleave', (e) => { if (!held) slid(e); }, on);
  }

  // The trigger: held, the rifle fires at its rate (`./fire`); up, cancelled or slid off, it is let go.
  const fire = under(root, 'touch-fire');
  if (fire) {
    let firing = false;
    fire.addEventListener('pointerdown', (e) => {
      if (blocked()) return;
      firing = true;
      onFire(true);
      capturePointer(fire, e.pointerId);
      e.preventDefault();
    }, on);
    for (const event of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      fire.addEventListener(event, () => { if (firing) { firing = false; onFire(false); } }, on);
    }
  }

  for (const [button, direction] of [[up, 1], [down, -1]] as [HTMLElement, number][]) {
    button.addEventListener('pointerdown', (e) => {
      if (blocked()) return;
      camera.setLift(direction);
      capturePointer(button, e.pointerId);
      e.preventDefault();
    }, on);
    // Up, cancelled, or the finger slid off the button: all of them mean stop.
    for (const event of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      button.addEventListener(event, () => camera.setLift(0), on);
    }
  }
  return controls;
}

/**
 * Walk mode's touch pad (MP-1, FI.R1, FI.R3; `index.html`, `#touch-walk`; a browser adaptation): the PlayStation pad's
 * sixteen buttons, each carrying its W3C standard-mapping index in `data-pad` (0 Cross, 1 Circle, 2 Square, 3 Triangle,
 * 4 L1, 5 R1, 6 L2, 7 R2, 8 SELECT, 9 START, 10 L3, 11 R3, 12-15 the D-pad's up, down, left and right: `./gamepad`
 * `PAD_BUTTON`). A press holds that button down on the touch layer's virtual pad and a release lets it go (`press`); the
 * page reads the lanes off that pad through `PAD_LAYOUT` (`./matchTouch`), so a touch button means what the controller's
 * button means, and everything downstream (the stance's tap and hold, the zoom's steps, the peek held, the reload) behaves
 * as it does for a pad. Each button owns its pointer, so the thumb can be on the stick, R1 and Square at once. The layout
 * is the play's: with the play off the element is not on the page and nothing is wired.
 *
 * XR-06 (research 214 s4; a port rule: a cancel is never a release): a lift says how -- `up` for `pointerup` and a slide
 * off a button the browser would not capture, `cancel` for `pointercancel` and `lostpointercapture` (the system took the
 * finger), as the stance button reports its own. Either lets the button go; the page's action lifecycle fires nothing on a
 * cancel (`./actionContext`). The first lift wins: the `lostpointercapture` a browser sends after a `pointerup` is nothing.
 * The layout is found under `scope.root` (PAR-5: the page's body by default), its listeners taken off by `scope.signal`;
 * while `scope.blocked` says so (FI.R4: the layer hidden for a pad) a press reaches no button.
 */
export function attachWalkTouch(
  press: (button: number, down: boolean, how?: 'up' | 'cancel') => void, scope: TouchScope = {},
): number {
  const root = under(scope.root ?? document.body, 'touch-walk');
  if (!root) return 0;
  const on = scope.signal ? { signal: scope.signal } : undefined;
  // A long press on a button must not open the browser's menu, and a drag from it must not scroll or select.
  root.addEventListener('contextmenu', (e) => e.preventDefault(), on);
  let wired = 0;
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-pad]'))) {
    const index = Number(button.dataset['pad']);
    if (!Number.isInteger(index) || index < 0 || index > 15) continue;
    wired++;
    let down: number | null = null;
    /** Whether the browser holds the pointer for this button: if not, sliding off it is the release. */
    let held = true;
    const pressed = (e: PointerEvent): void => {
      e.preventDefault();
      if (down !== null || scope.blocked?.()) return;
      down = e.pointerId;
      held = capturePointer(button, e.pointerId);
      button.classList.add('is-down');
      try { globalThis.navigator?.vibrate?.(8); } catch { /* not offered */ }
      press(index, true);
    };
    const lift = (how: 'up' | 'cancel') => (e: PointerEvent): void => {
      if (down === null || (e.pointerId !== undefined && e.pointerId !== down)) return;
      down = null;
      releasePointer(button, e.pointerId);
      button.classList.remove('is-down');
      press(index, false, how);
    };
    button.addEventListener('pointerdown', pressed, on);
    button.addEventListener('pointerup', lift('up'), on);
    for (const type of ['pointercancel', 'lostpointercapture'] as const) button.addEventListener(type, lift('cancel'), on);
    const slid = lift('up');
    button.addEventListener('pointerleave', (e) => { if (!held) slid(e); }, on);
    scope.resets?.push(() => {
      if (down === null) return;
      releasePointer(button, down);
      down = null;
      button.classList.remove('is-down');
    });
  }
  return wired;
}
