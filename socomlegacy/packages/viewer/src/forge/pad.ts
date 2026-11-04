/**
 * FORGE (FG-12; the owner, 2026-10-13: "Ship in release, + controller"; FG.R9): the forge's controller scheme. A
 * browser adaptation with no original -- the game has no editor -- read off the pad's standard mapping (the page's own
 * `PAD_BUTTON` order, `../gamepad`: Cross 0 ... Start 9, L3 10, R3 11, the d-pad 12-15) into the forge's actions:
 *
 *     left stick  fly (walk in Play)        right stick  look             L2 / R2   down / up
 *     Cross tap   select or place at the centre                          L1 / R1   previous / next tool
 *     Cross held  add to or take out of the selection what is at the centre (FG-47)
 *     d-pad up/down  previous / next prop   d-pad left/right  turn the selection
 *     Circle tap  deselect                  Circle held  grab: the sticks move the selection
 *     Square      duplicate                 Triangle  delete              SELECT  undo   L3  redo   R3  snap
 *     START       the forge's menu (Play, Walk, the base, the palette, the view, save, the controls)
 *     the left stick at its rim boosts the fly, as the touch stick's rim does (`../camera` `setStickBoost`)
 *
 * Pure: a frame in, the frame's actions out (edges, the d-pad's repeat, the tap-or-hold), so it is tested without a pad.
 *
 * FG-47 (FG.R24, multi-select): Cross is a tap-or-hold as Circle is -- let go within `PAD_HOLD_MS`, the act (at the
 * release); held past it, the pick (at once, its release then nothing) -- while `crossHolds` is set, as the page sets it
 * in the build. Where Cross must act at its press (the walk's jump, a card's yes, the menu's choice) the page leaves it
 * off, and Cross acts at its press as before (the default).
 *
 * AM-1 (FI.R2, FI.R5; the owner, 2026-10-16: "make menu movement work with analog sticks across the board"; a browser
 * adaptation, no original): while the forge's menu is open (`menuOpen`, as the page sets it) the left stick is its
 * d-pad -- up / down / left / right as the d-pad's `prevAsset` / `nextAsset` / `turnLeft` / `turnRight`, with the
 * d-pad's repeat (`MenuStick`) -- and flies nothing (`move` at rest). The forge lobby's window reads it the same way.
 */

export interface PadSnapshot {
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

export type PadAction =
  | 'act' | 'pick' | 'deselect' | 'duplicate' | 'delete' | 'prevTool' | 'nextTool' | 'prevAsset' | 'nextAsset'
  | 'turnLeft' | 'turnRight' | 'undo' | 'redo' | 'snap' | 'menu';

export interface PadFrame {
  actions: PadAction[];
  /** The left stick, x right, y down (the pad's own sign), past the dead zone. */
  move: [number, number];
  /** The right stick, likewise. */
  look: [number, number];
  /** R2 less L2, -1..1. */
  lift: number;
  /** Circle held: the sticks move the selection rather than the camera. */
  grab: boolean;
  /** The left stick at its rim: the fly's boost. */
  boost: boolean;
}

/** The sticks' radial dead zone (the page's `PAD_DEAD_ZONE`, `../gamepad`). */
export const PAD_DEAD = 0.15;
/** The d-pad's repeat: the console launcher's (`../console/input` REPEAT_DELAY, REPEAT_EVERY). */
export const PAD_REPEAT_DELAY_MS = 400;
export const PAD_REPEAT_EVERY_MS = 100;
/** FG-47: Cross held this long is a hold (the pick), not a tap (the act); the forge's own, no original. */
export const PAD_HOLD_MS = 350;
/**
 * The forge match's way back to the forge on the pad: SELECT (8) and START (9) held together (the forge's own, no
 * original; the match reads each alone). Read by the page's frame in its Play match and its lobby's (`./page`), and by
 * the overlay's rule (`../modern/overlay/binding` `overlayOpensBy`, LATER 92): in the match either is a hold-opener,
 * which in the match (the overlay's running round) is the page's alone -- neither a tap nor a hold opens the overlay
 * there, so the chord always reaches the page.
 */
export const FORGE_MATCH_EXIT_CHORD = [8, 9] as const;
/**
 * PAD_MENU_STICK_PUSH_ADAPTATION (AM-1; a browser adaptation, no original): a menu's left stick is a direction once its
 * stronger axis is past this (the raw axis, -1..1). The stick on the setup page's walker steps at 0.55
 * (`../startupNavigation`); this is the forge's own, the controller's choice (the FI plan's AM-1 row and Log), not the original's.
 */
export const PAD_MENU_STICK_PUSH_ADAPTATION = 0.5;
/** PAD_MENU_STICK_REST_ADAPTATION (AM-1; a browser adaptation): under this on both axes the menu's stick is let go, re-armed. */
export const PAD_MENU_STICK_REST_ADAPTATION = 0.3;

/**
 * FG-47: whether Cross is the build's tap-or-hold this frame (the page sets `ForgePad.crossHolds` from it). Not in the walk
 * (its jump at the press), not under a card or the menu (their yes at the press), and not while the lobby's window takes
 * the pad (the review's F2: its Cross acts at the press -- LEAVE among them -- so a release after the window went must
 * find no hold begun, or the forge would act on it).
 */
export function crossHoldsIn(s: { playing: boolean; card: boolean; menu: boolean; lobbyWindow: boolean }): boolean {
  return !s.playing && !s.card && !s.menu && !s.lobbyWindow;
}
/** A trigger below this is at rest. */
const TRIGGER_REST = 0.1;
/** The left stick's push (past the dead zone, 0..1) that counts as its rim: the boost. */
const BOOST_PUSH = 0.95;

const EDGE: [number, PadAction][] = [[2, 'duplicate'], [3, 'delete'], [4, 'prevTool'], [5, 'nextTool'], [8, 'undo'], [10, 'redo'], [11, 'snap'], [9, 'menu']];
const REPEAT: [number, PadAction][] = [[12, 'prevAsset'], [13, 'nextAsset'], [14, 'turnLeft'], [15, 'turnRight']];
const CROSS = 0;
const CIRCLE = 1;

/** A menu stick's direction: the pad's own signs (x right, y down). */
export type StickStep = 'up' | 'down' | 'left' | 'right';
/** AM-1: the menu stick's directions as the d-pad's actions (`REPEAT`'s 12-15). */
const STICK_ACTION: Record<StickStep, PadAction> = { up: 'prevAsset', down: 'nextAsset', left: 'turnLeft', right: 'turnRight' };

/**
 * AM-1 (a browser adaptation, no original): a left stick read as a menu's d-pad. Its stronger axis past
 * `PAD_MENU_STICK_PUSH_ADAPTATION` is a direction: one step at once, then the d-pad's repeat (`PAD_REPEAT_DELAY_MS`, then
 * every `PAD_REPEAT_EVERY_MS`); the stronger axis turned to another direction is a new press; under
 * `PAD_MENU_STICK_REST_ADAPTATION` it is let go and re-armed. `hold` makes a stick already pushed (the fly, when the
 * menu opens) wait for the rest. Pure: axes and the clock in.
 */
export class MenuStick {
  private dir: StickStep | null = null;
  private waiting = false;
  private at = 0;

  /** What is pushed now waits for the rest before it counts. */
  hold(): void { this.waiting = true; this.dir = null; }
  /** Let go: the next push steps. */
  reset(): void { this.waiting = false; this.dir = null; }

  /** The step this frame from the left stick (`axes[0]`, `axes[1]`), or null. */
  step(axes: readonly number[], now: number): StickStep | null {
    const read = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const x = read(axes[0]), y = read(axes[1]);
    const m = Math.max(Math.abs(x), Math.abs(y));
    if (m < PAD_MENU_STICK_REST_ADAPTATION) { this.reset(); return null; }
    if (this.waiting || m <= PAD_MENU_STICK_PUSH_ADAPTATION) return null;
    const dir: StickStep = Math.abs(y) >= Math.abs(x) ? (y < 0 ? 'up' : 'down') : x < 0 ? 'left' : 'right';
    if (dir !== this.dir) { this.dir = dir; this.at = now + PAD_REPEAT_DELAY_MS; return dir; }
    if (now < this.at) return null;
    this.at += PAD_REPEAT_EVERY_MS;
    return dir;
  }
}

function stick(axes: readonly number[], i: number): [number, number] {
  const x = axes[i] ?? 0, y = axes[i + 1] ?? 0;
  const m = Math.hypot(x, y);
  if (m < PAD_DEAD) return [0, 0];
  const k = Math.min(1, (m - PAD_DEAD) / (1 - PAD_DEAD)) / m;          // rescaled past the dead zone, the direction kept
  return [x * k, y * k];
}

export class ForgePad {
  private held = new Set<number>();
  /** False until every button is up once: a button still held from before the page is not a press. */
  private armed = false;
  private readonly repeatAt = new Map<number, number>();
  private circleGrabbed = false;
  /** FG-47: when Cross went down as a tap-or-hold (null: not pending), and whether its hold has picked. */
  private crossAt: number | null = null;
  private crossPicked = false;
  /**
   * FG-47: Cross as a tap-or-hold (the page sets it in the build, each frame); false -- the default, the scheme as before
   * FG-47 (the walk, a card, the menu, and every other reader of this edge map) -- Cross acts at its press.
   */
  crossHolds = false;
  /** AM-1: the forge's menu is open (the page sets it, each frame): the left stick steps it, and flies nothing. */
  menuOpen = false;
  private readonly menuStick = new MenuStick();
  /** Whether the menu was open at the frame before: a menu opening holds the stick until it rests. */
  private menuWas = false;

  /** What is held now waits to be let go before it counts (the forge back from a match, its exit chord still down). */
  reset(): void {
    this.armed = false;
    this.menuStick.reset();
    this.menuWas = false;
    this.repeatAt.clear();
    this.circleGrabbed = false;
    this.crossAt = null;
    this.crossPicked = false;
  }

  frame(pad: PadSnapshot | null, now: number): PadFrame {
    const rest: PadFrame = { actions: [], move: [0, 0], look: [0, 0], lift: 0, grab: false, boost: false };
    if (!pad) { this.held.clear(); this.armed = false; this.crossAt = null; this.crossPicked = false; this.menuWas = false; return rest; }
    const down = new Set<number>();
    pad.buttons.forEach((b, i) => { if (b.pressed) down.add(i); });
    if (!this.armed) {
      this.held = down;
      if (down.size === 0) this.armed = true;
      return rest;
    }
    const pressed = (i: number): boolean => down.has(i) && !this.held.has(i);
    const actions: PadAction[] = [];
    // Cross: at its press when it holds not; else a tap at its release, a hold past PAD_HOLD_MS the pick.
    if (pressed(CROSS)) {
      if (this.crossHolds) { this.crossAt = now; this.crossPicked = false; } else { this.crossAt = null; actions.push('act'); }
    } else if (down.has(CROSS)) {
      if (this.crossHolds && this.crossAt !== null && !this.crossPicked && now - this.crossAt >= PAD_HOLD_MS) { this.crossPicked = true; actions.push('pick'); }
    } else if (this.held.has(CROSS)) {
      if (this.crossAt !== null && !this.crossPicked && this.crossHolds) actions.push('act');
      this.crossAt = null;
      this.crossPicked = false;
    }
    for (const [i, a] of EDGE) if (pressed(i)) actions.push(a);
    for (const [i, a] of REPEAT) {
      if (!down.has(i)) { this.repeatAt.delete(i); continue; }
      if (pressed(i)) { actions.push(a); this.repeatAt.set(i, now + PAD_REPEAT_DELAY_MS); continue; }
      const at = this.repeatAt.get(i);
      if (at !== undefined && now >= at) { actions.push(a); this.repeatAt.set(i, at + PAD_REPEAT_EVERY_MS); }
    }
    let move = stick(pad.axes, 0);
    // AM-1: the menu open, the left stick is its d-pad (the d-pad's actions and repeat), and flies nothing.
    if (this.menuOpen) {
      if (!this.menuWas) this.menuStick.hold();
      // AM-1's review F1: the d-pad held, the stick waits (as the console's and StartupNavigation's merge the two into
      // one direction): never a double step, nor two repeats running side by side.
      if ([12, 13, 14, 15].some((i) => down.has(i))) this.menuStick.hold();
      const s = this.menuStick.step(pad.axes, now);
      if (s) actions.push(STICK_ACTION[s]);
      move = [0, 0];
    }
    this.menuWas = this.menuOpen;
    const look = stick(pad.axes, 2);
    // Circle: held, a grab; let go with nothing moved meanwhile, a tap (deselect).
    const grab = down.has(CIRCLE);
    if (grab && (move[0] || move[1] || look[0] || look[1])) this.circleGrabbed = true;
    if (!grab && this.held.has(CIRCLE)) { if (!this.circleGrabbed) actions.push('deselect'); this.circleGrabbed = false; }
    const trig = (i: number): number => { const v = pad.buttons[i]?.value ?? 0; return v < TRIGGER_REST ? 0 : v; };
    this.held = down;
    return { actions, move, look, lift: trig(7) - trig(6), grab, boost: Math.hypot(move[0], move[1]) >= BOOST_PUSH };
  }
}
