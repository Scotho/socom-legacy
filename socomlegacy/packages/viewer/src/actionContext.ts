import { DEFUSE_PROMPT_ICON_READING } from './bombPage';
import type { ActionPrompt } from './hud';
import { PICKUP_PROMPT_COOLDOWN_READING } from './net/pickupRules';

/**
 * XR-06 (socomlegacy/docs/research/214-demolition-as-built.md s4): the page's one action context -- what the action button
 * (the pad's Cross, the touch action button, the development keyboard's X) does now -- and its press / hold / release /
 * cancel kept apart. Headless: `main.ts` feeds `pickContext` from the pages that know each context (`./doorPage`,
 * `./actionPage`, `./bombPage`, `./grenade`'s C4 target, `./traversalPage`) and calls the lifecycle on the button's edges
 * (the wiring is the controller's, PF.R22: research 214 s4 lists it).
 *
 * - **The order** is the picker's (`FUN_0021d9d0` D:L73370-73404): each frame it rebuilds a list from the player's
 *   action mask (`+0xed0`, one bit an action: `FUN_00544c80` D:L411188 sets `+0xed4 = 1 << action`) through
 *   `FUN_0021f850` (D:L74042+), which appends an entry per bit set in a fixed order -- 0x80000, 0x100000, 0x800, 0x400,
 *   0x1000, **0x80** (action 7: the bomb's plant and defuse), **0x10000** (the ladder slide), 0x2, **0x4** (the climb),
 *   **0x2000** (action 13: a door, a switch -- `FUN_005aa240`'s pick, D:L452002-452022), **0x40000** (C4, item 0x97:
 *   D:L452030-452057), 0x20000, 0x8, 0x200000, 0x10, 0x20, 0x100, 0x200, 0x4000, 0x8000, **0x40** (action 6: the drop,
 *   `FUN_005937c0` D:L452458-452473) last -- and the list's head is the action (`FUN_00544c80(.., head+4)`). So carrying
 *   the bomb aimed down at a C4 target, C4 is the action, not the drop. `FUN_00592d50` only runs the one bit it is given.
 *   AD-6 (research 214 s4): the setters are `FUN_005937c0`'s -- **0x80000** the turret's mount (action 19,
 *   `FUN_005a88c0` D:L462999; set D:L452472-452475), **0x100000** its release (action 20, `FUN_005a8850` D:L462973: the
 *   actor holds a turret; set and returned at D:L452334-452338, so a mounted player is offered the release alone --
 *   `./actionWiring` `actionInputs`), **0x200000** the victory dance (action 21, D:L452376-452377), **0x10** / **0x20** a
 *   weapon's pickup (actions 4 / 5, the candidates `FUN_00544c30` / `FUN_00544c20`, D:L452427-452434), and
 *   `FUN_00593d00`'s **0x4000** / **0x8000** a hostage's order (D:L452494-452498). Each entry goes in at the list's tail
 *   (`FUN_002209c0` D:L74589-74590). A second input rotates the list (D:L73332-73386, `+0xedc` 3 or 2): restored by
 *   ActionSelection (research 303).
 * - **The edges**: the player update fires the Action on the button's release edge (`FUN_00594cf0` D:L453194-453243): a
 *   release fires the one-shot context picked then (a door, a switch, the drop, C4, a turret, the traversal) and ends a
 *   hold. The plant and the defuse are a hold (the 5 s of `FUN_00594600` D:L453260-453294, counted by the room on the
 *   commands' `ActionHeld`): their release fires nothing, and a press that walks into a site still held becomes the
 *   site's hold, so its release never also climbs, opens a door or plants C4.
 * - **The cancel** is a port rule -- no original has pointers or windows: a cancel ends the hold and fires nothing, and the
 *   release that follows it is nothing too. The browser's blur, a menu over the game, the ARMORY, a pad lost and the
 *   player's death are cancels; so are a touch button's `pointercancel` and `lostpointercapture` (`./touch`). A cancel
 *   after a release is nothing (`lostpointercapture` follows a lift in some browsers).
 */

export type ActionContext = 'door' | 'switch' | 'bombPlant' | 'bombDefuse' | 'bombDrop' | 'c4' | 'traversal' | 'turret' | 'pickup' | 'pickup2' | 'escortee' | 'victory' | null;
type Context = NonNullable<ActionContext>;

/** What is in reach now, each context's own test (the pages answer them). */
export type ContextInputs = Partial<Record<Context, boolean>>;

/**
 * Each context's bits in the action mask (`1 << action`), as `FUN_0021f850` tests them (D:L74050-74293). AD-6: the
 * turret's mount and release (0x80000, 0x100000) and the pickup's two candidates (0x10, 0x20) read (research 214 s4).
 * LkPaioX5 part 2 (c) (research 87 §5, "The action list"): the two candidates are two actions, two contexts -- `pickup`
 * action 4 (0x10, `FUN_00544c30`'s `+0x14c`) and `pickup2` action 5 (0x20, `FUN_00544c20`'s `+0x150`), set apart by
 * `FUN_005937c0` (D:L452427-452434), each its own list entry (records 0x40c580 and 0x40c660, `FUN_0021f850`).
 */
export const ACTION_CONTEXT_BITS: Readonly<Record<Context, readonly number[]>> = {
  turret: [0x80000, 0x100000], bombPlant: [0x80], bombDefuse: [0x80], traversal: [0x10000, 0x4], door: [0x2000], switch: [0x2000],
  c4: [0x40000], victory: [0x200000], pickup: [0x10], pickup2: [0x20], escortee: [0x4000, 0x8000], bombDrop: [0x40],
};

/**
 * The contexts in the picker's build order (`FUN_0021d9d0`, `FUN_0021f850`; AD-6, research 214 s4): the turret (its mount
 * and release, the list's first two bits), the plant and the defuse (one bit, never both at once), the traversal (the
 * slide's bit then the climb's), a door or a switch (one bit), C4, the victory dance (research 303), a weapon's pickup
 * (PF-34; LkPaioX5 (c): the first candidate's, then the second's), a hostage's order (HX-4a), the drop last.
 */
export const ACTION_CONTEXT_ORDER: readonly Context[] = ['turret', 'bombPlant', 'bombDefuse', 'traversal', 'door', 'switch', 'c4', 'victory', 'pickup', 'pickup2', 'escortee', 'bombDrop'];

/**
 * The first context in reach, in the picker's order (the list's head); null with none. `traversal` is in reach only while
 * the traversal offers its own action -- a ledge's climb prompt, a ladder's slide -- not merely while walking.
 */
export function pickContext(inputs: ContextInputs): ActionContext {
  for (const c of ACTION_CONTEXT_ORDER) if (inputs[c]) return c;
  return null;
}

/** Original action-list head and rotation, ISO FUN_0021d9d0 / FUN_00595320; research 303.
 * The list is rebuilt when availability changes. Left rotates head to tail, Right tail to head.
 * Call input with press edges, not held-direction levels. */
export class ActionSelection {
  private signature = '';
  private order: Context[] = [];
  private directions = { left: false, right: false, takeLeft: false, takeRight: false };
  pick(inputs: ContextInputs): ActionContext {
    const available = ACTION_CONTEXT_ORDER.filter(c => inputs[c]);
    const signature = available.join(',');
    if (signature !== this.signature) { this.signature = signature; this.order = available; }
    return this.order[0] ?? null;
  }
  /**
   * LkPaioX5 part 2 (a) (research 87 §5, "The action list"): the list as the last `pick` built it and the d-pad turned it,
   * its head first -- what the HUD draws: the head, list[1] right and list[2] left (`FUN_0021f210` D:L73979-74032).
   */
  list(): readonly Context[] {
    return this.order;
  }
  rotate(direction: 'left' | 'right'): void {
    if (this.order.length < 2) return;
    if (direction === 'left') this.order.push(this.order.shift()!);
    else this.order.unshift(this.order.pop()!);
  }
  input(actionHeld: boolean, leftPressed: boolean, rightPressed: boolean): boolean {
    if (!actionHeld) return false;
    // Original writes left first, right second: right wins a simultaneous press.
    if (rightPressed) this.rotate('right');
    else if (leftPressed) this.rotate('left');
    return true;
  }
  /** Browser input ownership: a direction used to choose an action cannot turn into a peek before release. */
  pad(action: boolean, left: boolean, right: boolean): { left: boolean; right: boolean } {
    const d = this.directions;
    this.input(action, left && !d.left, right && !d.right);
    d.left = left; d.right = right;
    d.takeLeft = left && (action || d.takeLeft); d.takeRight = right && (action || d.takeRight);
    return { left: left && !d.takeLeft, right: right && !d.takeRight };
  }
  reset(): void { this.signature = ''; this.order = []; this.directions = { left: false, right: false, takeLeft: false, takeRight: false }; }
}

/** The held contexts: the plant and the defuse (action 7's 5 s hold); every other fires once on the release. */
export function isHoldContext(c: ActionContext): c is 'bombPlant' | 'bombDefuse' {
  return c === 'bombPlant' || c === 'bombDefuse';
}

/**
 * The HUD's prompt for a context (research 87 s5, `./hud` `ACTION_ICONS`): the switch's from its record's bitmap
 * (`./actionPage` `prompt()`, `action_x.tif` without one), the defuse's `DEFUSE_PROMPT_ICON_READING`; none for the
 * traversal, whose ledge prompt is the climb's own feed (`Hud.feed`'s `climb`).
 */
export function contextPrompt(c: ActionContext, switchPrompt: ActionPrompt | null = null): ActionPrompt | null {
  switch (c) {
    case 'victory': return 'victory';
    case 'door': return 'door';
    case 'switch': return switchPrompt ?? 'action';
    case 'bombPlant': return 'bomb';
    case 'bombDefuse': return DEFUSE_PROMPT_ICON_READING;
    case 'bombDrop': return 'bomb_drop';
    case 'c4': return 'c4';
    case 'turret': return 'turret_mount';
    case 'pickup': return 'pickup';                     // PF-34; LkPaioX5 (c): action 4's `action_pickup_item1.tif` (research 87 s5)
    case 'pickup2': return 'pickup2';                   // LkPaioX5 (c): action 5's `action_pickup_item2.tif`
    case 'escortee': return 'escortee';                 // HX-4a: `action_escortee.tif` (FUN_0021ded0 D:L73564-73565)
    default: return null;
  }
}

/** What an edge did: the context to fire now (null: nothing), and the context the button holds after it (null: up). */
export interface ActionStep { fire: ActionContext; heldContext: ActionContext }

/** Why a hold was cancelled (the port's causes; none is the game's). */
export type CancelCause = 'blur' | 'menu' | 'armory' | 'padLost' | 'death' | 'touch' | 'loading';

const NOTHING: ActionStep = { fire: null, heldContext: null };

export class ActionLifecycle {
  private isDown = false;
  private held: ActionContext = null;
  private seconds = 0;
  private cancelled: CancelCause | null = null;
  /** PF-34: seconds the weapon prompt is still held after a pickup was chosen (`PICKUP_PROMPT_COOLDOWN_READING`). */
  private pickupHold = 0;

  /** `pick`: the context now (`pickContext` over the pages' answers). */
  constructor(private readonly pick: () => ActionContext) {}

  /** The button went down: the context in reach is held (a press while down is nothing more). */
  press(): ActionStep {
    if (!this.isDown) {
      this.isDown = true;
      this.held = this.pick();
      this.seconds = 0;
      this.cancelled = null;
    }
    return { fire: null, heldContext: this.held };
  }

  /**
   * Held `dt` seconds more -- the frame's real seconds (`./frameTime` `FrameTime.real`, PAR-24), not the simulation's
   * clamped step: a hold context in reach takes the hold over (a press walked into a site holds the site).
   */
  hold(dt: number): ActionStep {
    if (!this.isDown) return { ...NOTHING };
    const now = this.pick();
    if (isHoldContext(now) && now !== this.held) { this.held = now; this.seconds = 0; }
    this.seconds += dt;
    return { fire: null, heldContext: this.held };
  }

  /** Explicit action-list rotation changes the held action; merely walking out of a site does not. */
  reselect(): void {
    if (!this.isDown || this.cancelled) return;
    this.held = this.pick(); this.seconds = 0;
  }

  /** The button came up: a one-shot context in reach fires (the release edge); a hold ends and fires nothing. */
  release(): ActionStep {
    if (!this.isDown) return { ...NOTHING };
    const held = this.held;
    this.end();
    if (isHoldContext(held)) return { ...NOTHING };
    const now = this.pick();
    if (now === 'pickup' || now === 'pickup2') this.pickupHold = PICKUP_PROMPT_COOLDOWN_READING;   // LkPaioX5 (c): either TAKE
    return { fire: isHoldContext(now) ? null : now, heldContext: null };
  }

  /**
   * PF-34 (`PICKUP_PROMPT_COOLDOWN_READING`): `dt` seconds of the frame for the weapon prompt's hold -- counted only while
   * a candidate is in reach (`inReach`), as `FUN_00593da0` counts `+0x23c` down only when it found one
   * (D:L452547-452549). PAR-24 (ACT.R8's general rule; research 252): `dt` is the frame's real seconds
   * (`./frameTime` `FrameTime.real`), never the 0.1 s-clamped step the pages hand their simulation -- below 10 fps that
   * step held the 3 s for 6 s at 5 fps. A long frame credits its real time and no more; a frame the lanes do not run
   * (the loading hold) credits nothing.
   *
   * PAR-34 (`./drops` `PICKUP_HOLD_PER_CLASS_READING`): `inReach` may be the number of `FUN_00593da0`'s candidate classes
   * in reach (0-2, `WorldDrops.holdCandidates`): the hold runs down once for each, the second only while it is still
   * above 0 (D:L452547-452549, D:L452563-452565). `true` is one.
   */
  elapse(dt: number, inReach: boolean | number): void {
    const n = inReach === true ? 1 : inReach === false ? 0 : inReach;
    for (let k = 0; k < n && this.pickupHold > 0; k++) this.pickupHold = Math.max(0, this.pickupHold - dt);
  }

  /** PF-34: whether a chosen pickup still holds the weapon prompt (no `pickup` context is offered meanwhile). */
  pickupHeld(): boolean { return this.pickupHold > 0; }

  /** A cancel (a port rule): the hold ends, nothing fires, and the release after it is nothing; after a release, nothing. */
  cancel(cause: CancelCause = 'blur'): ActionStep {
    if (this.isDown) { this.end(); this.cancelled = cause; }
    return { ...NOTHING };
  }

  /** Whether the button is held (pressed and neither released nor cancelled). */
  down(): boolean { return this.isDown; }
  /** The context held, or null when up. */
  heldContext(): ActionContext { return this.held; }
  /** Seconds the current context has been held (0 when up). */
  heldFor(): number { return this.seconds; }
  /** Why the last hold was cancelled, until the next press; null when it was not. */
  lastCancel(): CancelCause | null { return this.cancelled; }

  private end(): void {
    this.isDown = false;
    this.held = null;
    this.seconds = 0;
  }
}
