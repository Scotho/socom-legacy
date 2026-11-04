import { ActionLifecycle, contextPrompt, isHoldContext, type ActionContext, type CancelCause, type ContextInputs } from './actionContext';
import { DEFUSE_PROMPT_ICON_READING } from './bombPage';
import type { ActionPrompt } from './hud';
import { fastestWait } from './net/fireGate';
import type { ServerEvent } from './net/protocol';
import { GAME_FRAME_DT, GameFrameAccumulator } from '@s2u/scene';

/**
 * Sprint 27 wave 4 (socomlegacy/docs/research/214-demolition-as-built.md s7): the wiring `main.ts` gives the action button,
 * kept here so it is tested headless -- the pages' answers into the picker (`./actionContext` `pickContext`, the order
 * `FUN_0021d9d0`'s), the lifecycle's edges (`ActionLifecycle`), each one-shot context's page call, the room's events
 * relayed to the pages across connections (`RoomEvents`), and each command's `ActionHeld` bit observed for the bomb's
 * prediction (`observeCommands`).
 *
 * **The edges.** The button's press and release come from `main.ts` (the pad's Cross and the touch action lane in
 * `padFrame`, the development keyboard's X), the release before the traversal's own (`TraversalPage.padLanes` and its
 * keyup call `WalkMode.action`). The release fires the page's context at once (`release`): the walk's action filter
 * (`filter`) that follows is told whether a page took it -- true: no `Button.Action` on the command and no move; false:
 * the walk's own action (the climb, the ladder's slide, the command's Action press, the respawn's). The walk asks the
 * filter only while unlocked: a mounted player's dismount (the walk locked, MAP-10b) is fired by `release` alone.
 */

type Context = NonNullable<ActionContext>;

/**
 * The one-shot contexts' page calls (`DoorPage.action`, `ActionPage.action`, the drop's send, `Grenade.plantC4`,
 * `TurretPage.action`; PF-34's `pickup`, the claim's send -- optional: `./matchActions` wires it for a page that mounts the
 * world drops, research 234 s6).
 */
export type FireCalls = Record<'door' | 'switch' | 'bombDrop' | 'c4' | 'turret', () => boolean> & { pickup?: () => boolean; pickup2?: () => boolean; escortee?: () => boolean; victory?: () => boolean };

/** A context's page call; true when the page took the press. The traversal, a hold and none are the walk's own (false). */
export function fireContext(c: ActionContext, calls: FireCalls): boolean {
  switch (c) {
    case 'victory': return calls.victory?.() ?? false;
    case 'door': case 'switch': case 'bombDrop': case 'c4': case 'turret': return calls[c]();
    case 'pickup': return calls.pickup?.() ?? false;
    case 'pickup2': return calls.pickup2?.() ?? false;   // LkPaioX5 (c): the second candidate's claim
    case 'escortee': return calls.escortee?.() ?? false;   // HX-4a: the hostage's order (`./hostagePage` `fire`)
    default: return false;
  }
}

/** The pages the fire table calls (`main.ts` lends them; the drop's send is its own: BombPage has none). */
export interface FirePages {
  victory?(): boolean;
  doors: { action(): boolean };
  actions: { action(): boolean };
  grenade: { plantC4(): boolean };
  turrets: { action(): boolean };
  bombDrop(): boolean;
  /** PF-34: the weapon claim's send (`NetPage.pickup` of the prompt's `did`); absent, the context fires nothing. */
  pickup?(): boolean;
  /** LkPaioX5 (c): the second candidate's claim (the same send of its `did`); absent, nothing. */
  pickup2?(): boolean;
  /** HX-4a: the hostage's order (`HostagePage.fire`: `NetPage.hostageOrder`); absent (the `hostages` part off), nothing. */
  escortee?(): boolean;
}

/** The concrete fire table: each one-shot context to its own page's call. */
export function fireTable(p: FirePages): FireCalls {
  return {
    victory: () => p.victory?.() ?? false,
    door: () => p.doors.action(), switch: () => p.actions.action(), bombDrop: () => p.bombDrop(),
    c4: () => p.grenade.plantC4(), turret: () => p.turrets.action(), pickup: () => p.pickup?.() ?? false,
    pickup2: () => p.pickup2?.() ?? false,
    escortee: () => p.escortee?.() ?? false,
  };
}

/** The pages the picker asks (`main.ts` lends them). */
export interface SourcePages {
  victory?(): boolean;
  walk: { mode(): string; isDead(): boolean; isLocked(): boolean; actionGateShut?(): boolean };
  doors: { target(): unknown };
  /** `armed`, when the page has it, is the switch the prompt is showing — the live ray, or the HUD's last sample. */
  actions: { target(): unknown; armed?(): boolean };
  bomb: { prompt(): ActionPrompt | null } | null;
  grenade: { c4Target(): unknown };
  /**
   * `TurretPage`'s: the turret held, the HUD's prompt, and (LATER 104) whether a predicted release is on its way
   * (`releasing`; absent, none).
   */
  turrets: { mounted(): number | null; prompt(): ActionPrompt | null; releasing?(): boolean };
  traversal: { hudClimb(): { visible: boolean } | null; traversal(): { state(): { kind: string } } | null };
  /** PF-34: the weapon drop the prompt offers (`WorldDrops.prompt`, its hold applied), or null; absent, none. */
  drops?: { prompt(): number | null; second?(): number | null };   // LkPaioX5 (c): `second`, the second candidate
  /** HX-4a: the hostage order the page offers (`HostagePage.offer`), or null; absent (the `hostages` part off), none. */
  hostages?: { offer(): unknown };
}

/**
 * The concrete sources: each context from its own page -- the door's and the switch's targets, the bomb's prompt, C4's
 * target, the turret's prompt, and the traversal's own action offered (214 s4's fix round: the climb prompt visible, or on
 * a ladder -- the slide; never merely walking).
 */
export function pageSources(p: SourcePages): ActionSources {
  return {
    victory: () => p.victory?.() ?? false,
    canAct: () => p.walk.mode() === 'walk' && !p.walk.isDead(),
    // LATER 104 (`./net/emplacement` TURRET_RELEASE_SEQ_ADAPTATION): through a predicted release's round trip (the hold let
    // go at the press, the room's event not yet here) the button stays the turret's, as while held -- `TurretPage.action`
    // keeps the press and sends nothing, and no door, switch or drop in reach takes it. A port-only window, no game value.
    mounted: () => p.turrets.mounted() !== null || (p.turrets.releasing?.() ?? false),
    locked: () => p.walk.isLocked(),
    door: () => p.doors.target() !== null,
    switch: () => p.actions.armed ? p.actions.armed() : p.actions.target() !== null,
    bombPrompt: () => p.bomb?.prompt() ?? null,
    c4: () => p.grenade.c4Target() !== null,
    turret: () => p.turrets.prompt() !== null,
    traversal: () => p.traversal.hudClimb()?.visible === true || p.traversal.traversal()?.state().kind === 'ladder',
    pickup: () => (p.drops?.prompt() ?? null) !== null,
    pickup2: () => (p.drops?.second?.() ?? null) !== null,   // LkPaioX5 (c): the second candidate (`FUN_00544c20`)
    escortee: () => (p.hostages?.offer() ?? null) !== null,
    gateShut: () => p.walk.actionGateShut?.() ?? false,
  };
}

/** What the pages answer for the picker. */
export interface ActionSources {
  victory?(): boolean;
  /** Walking and alive. */
  canAct(): boolean;
  /** `TurretPage.mounted() !== null`, or (LATER 104) its predicted release on its way (`TurretPage.releasing`). */
  mounted(): boolean;
  /** `WalkMode.isLocked()` (a spawn awaited, spectating, mounted). */
  locked(): boolean;
  /** `DoorPage.target() !== null`. */
  door(): boolean;
  /** `ActionPage.armed()` (the prompt's switch), else `target() !== null`. */
  switch(): boolean;
  /** `BombPage.prompt()`: `bomb` the plant, `DEFUSE_PROMPT_ICON_READING` the defuse, `bomb_drop` the drop. */
  bombPrompt(): ActionPrompt | null;
  /** `Grenade.c4Target() !== null`. */
  c4(): boolean;
  /** `TurretPage.prompt() !== null`. */
  turret(): boolean;
  /** The traversal offers its own action: the climb prompt visible, or on a ladder (the slide). */
  traversal(): boolean;
  /** PF-34: a weapon drop offered (`WorldDrops.prompt() !== null`, the prompt's hold applied); absent, none. */
  pickup?(): boolean;
  /** LkPaioX5 (c): a second-class weapon drop offered (the prompt's hold applied); absent, none. */
  pickup2?(): boolean;
  /** HX-4a: a hostage order offered (`HostagePage.offer() !== null`); absent, none. */
  escortee?(): boolean;
  /** LATER 220: the action prompts' common gate shut (`WalkMode.actionGateShut`); absent, open. */
  gateShut?(): boolean;
}

/**
 * The picker's inputs from the pages, each asked only when the picker reaches it (getters: the head's answer spares the
 * others' raycasts). Nothing dead or off the walk; while mounted the turret alone -- the room refuses every other event
 * from a mounted seat (`match/src/room.ts` `mountedRefused`), so the page offers none; locked otherwise, nothing.
 */
export function actionInputs(s: ActionSources): ContextInputs {
  if (!s.canAct()) return {};
  if (s.mounted()) return { turret: true };
  if (s.locked()) return {};
  let bomb: ActionPrompt | null | undefined;
  const bombIs = (p: ActionPrompt): boolean => (bomb === undefined ? (bomb = s.bombPrompt()) : bomb) === p;
  // LATER 220 (research 369 §2): `FUN_00593500` builds the offers past the common gate (D:L452277); gated so far: the
  // door, the switch, the turret's mount (the first head), the bomb's plant and defuse (the second), C4 (the third), a
  // weapon's pickup (the fourth), a hostage's orders (the fifth), the bomb's drop (the sixth), the victory dance (the
  // seventh: the room's offer already asks the gate's terms, LATER 167/171/182, but reaches the page a round trip late)
  // -- the climb keeps its own rule.
  const open = (): boolean => !(s.gateShut?.() ?? false);
  const tests: Record<Context, () => boolean> = {
    victory: () => open() && (s.victory?.() ?? false),
    bombPlant: () => open() && bombIs('bomb'), bombDefuse: () => open() && bombIs(DEFUSE_PROMPT_ICON_READING), traversal: () => s.traversal(),
    door: () => open() && s.door(), switch: () => open() && s.switch(), c4: () => open() && s.c4(), turret: () => open() && s.turret(), bombDrop: () => open() && bombIs('bomb_drop'),
    pickup: () => open() && (s.pickup?.() ?? false), pickup2: () => open() && (s.pickup2?.() ?? false), escortee: () => open() && (s.escortee?.() ?? false),
  };
  const out: ContextInputs = {};
  for (const k of Object.keys(tests) as Context[]) Object.defineProperty(out, k, { get: tests[k], enumerable: true });
  return out;
}

/** The HUD's prompt for a context: `contextPrompt`, the switch's record's bitmap, the turret's mount or dismount from its page. */
export function actionPromptOf(c: ActionContext, pages: { switch(): ActionPrompt | null; turret(): ActionPrompt | null }): ActionPrompt | null {
  if (c === 'turret') return pages.turret();
  return contextPrompt(c, c === 'switch' ? pages.switch() : null);
}

/** What the wiring is lent. */
export interface ActionWiringDeps {
  /** The context now: `pickContext(actionInputs(...))`. */
  pick(): ActionContext;
  fire: FireCalls;
  /** The rest of a cancel: `TraversalPage.cancelAction` (which cancels the walk's hold too). */
  cancel(cause: CancelCause): void;
}

export class ActionWiring {
  readonly lifecycle: ActionLifecycle;
  /** The last release's answer for the walk's filter (true: a page took it, or a hold or cancel ended), or null: none. */
  private pending: boolean | null = null;

  constructor(private readonly deps: ActionWiringDeps) {
    this.lifecycle = new ActionLifecycle(() => deps.pick());
  }

  /** The button went down. */
  press(): void {
    this.pending = null;
    this.lifecycle.press();
  }

  /** Held a frame more, `dt` the frame's real seconds (PAR-24, `./frameTime`): a press walked into a bomb site holds it. */
  hold(dt: number): void {
    if (this.lifecycle.down()) this.lifecycle.hold(dt);
  }

  /** The button came up: the context picked now fires on its page; the answer waits for the walk's filter. */
  release(): void {
    const down = this.lifecycle.down(), was = this.lifecycle.heldContext();
    const step = this.lifecycle.release();
    if (!down) { this.pending = this.lifecycle.lastCancel() !== null ? true : null; return; }
    if (step.fire === null) { this.pending = isHoldContext(was) || isHoldContext(this.deps.pick()); return; }
    this.pending = fireContext(step.fire, this.deps.fire);
  }

  /** A cancel (a port rule: the blur, a menu, the ARMORY, a pad lost, a death, a touch taken): nothing fires. */
  cancel(cause: CancelCause): void {
    this.lifecycle.cancel(cause);
    this.deps.cancel(cause);
  }

  /**
   * The walk's action filter (`WalkMode.setActionFilter`): the release's answer, once; with none (the hook's action, no
   * press seen) the context now fires as a bare press -- never a hold, which is the walk's.
   */
  filter(): boolean {
    const p = this.pending;
    if (p !== null) { this.pending = null; return p; }
    const c = this.deps.pick();
    return isHoldContext(c) ? false : fireContext(c, this.deps.fire);
  }

  /** The frame's end: a release the walk never asked about (locked, off the walk) is dropped. */
  endFrame(): void {
    this.pending = null;
  }
}

/**
 * The room's events to the pages that follow them (`BombPage`, `TurretPage`, `ActionPage`), across the page's connections:
 * one relay made once, each new client followed (`follow`) and the last let go. Following another, or none, first resets
 * the pages with a bare welcome (no objective, no turrets, no round begun): a map change leaves no bomb, no mounted
 * turret and no lock behind.
 */
export class RoomEvents {
  private readonly listeners = new Set<(ev: ServerEvent) => void>();
  private off: (() => void) | null = null;
  private client: object | null = null;

  /** The client followed now, or null (`main.ts` re-follows when `NetPage`'s reconnect replaces it). */
  following(): object | null {
    return this.client;
  }

  on(listener: (ev: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(ev: ServerEvent): void {
    for (const l of [...this.listeners]) l(ev);
  }

  /** The pages back to no room: a welcome that carries nothing. */
  reset(): void {
    this.emit({ type: 'welcome' } as Extract<ServerEvent, { type: 'welcome' }>);
  }

  /** Follow `client`'s events from now (null: none); the previous client let go and the pages reset. */
  follow(client: { on(listener: (ev: ServerEvent) => void): () => void } | null): void {
    this.off?.();
    this.off = null;
    this.client = client;
    this.reset();
    if (client) this.off = client.on((ev) => this.emit(ev));
  }
}

/**
 * Each command the walk sends, observed: `WalkMode.setNetTap` wrapped so `onCommand` hears every command before the
 * client sends it -- its `Button.ActionHeld` bit for the bomb's prediction, which counts the commands the room counts
 * (`BombPage.tick`, `FUN_00594cf0` D:L453249-453287 (*was* cited `FUN_00594600`)), and its stick and pitch for the manual drop's gate, which the room reads off the
 * last command run (`match/src/bomb.ts` `command`, `canDrop`). The walk is the client's (`NetClient` sets the tap).
 */
export function observeCommands<C, F>(
  walk: { setNetTap(tap: ((cmd: C, feet: F, facing?: readonly [number, number]) => void) | null, sent?: number): void },
  onCommand: (cmd: C) => void,
): void {
  const set = walk.setNetTap.bind(walk);
  walk.setNetTap = (tap, sent) => set(tap && ((cmd, feet, facing) => { onCommand(cmd); tap(cmd, feet, facing); }), sent);   // protocol 11: the facing on; F1: the numbering on
}

/**
 * The mounted gun's interval between rounds, as the room's cadence takes it (`match/src/room.ts` `turretRound`, BL-1): the
 * record's fastest enabled mode (`FUN_005c09f0`: `FireWait`, x 0.8 in burst and automatic), never above `FireWait` --
 * `./net/fireGate` `fastestWait`, the one copy the room's gate and the page's share (P3-room, the review's F2); null
 * without a record (the room fires none either).
 */
export function turretInterval(record: { fireWait: number; fireModes: readonly number[] } | null): number | null {
  return record ? fastestWait(record) : null;
}

/**
 * LATER 180 (research 215 s8.3, s8.4; reading, pending review): the latch's frame on the page -- the original refuses the
 * press's game frame and lets class 205 fire on the next (D:L476423-476438); the page refuses its own frame and claims on
 * the first page frame by which one game frame of real seconds has gone (`GameFrameAccumulator`, PF.R8): at 30 Hz the
 * next, at 60 Hz the second or third (two 60 Hz frames are 34 us short of `GAME_FRAME_DT`). Named, not built (LATER
 * 180's review, F4): the original's pending bit is the kit's byte (`kit+1` bit 2, D:L476427), which the take-up
 * `FUN_005c4b10` leaves as it was (it writes the kit's bytes 0 and 4, D:L478810, D:L478841), so a bit set on foot -- a
 * tap released before the raise read 1 -- carries across a mount and the original fires the PKM's first pull on its
 * press; the port's bit is `TurretTrigger`'s own, set by the turret's pulls only (a rare one-frame difference). Settles:
 * a capture of a mounted PKM pull from a lowered body (the press's frame and the round's).
 */
export const RAISE_LATCH_FRAME_READING = 'one game frame of real seconds' as const;

/**
 * The trigger while mounted (MAP-10b): the room fires the turret's rounds from the page's `fire` claims (`room.ts`
 * `fire` -> `turretRound`, the claim's line bounded inside the turret's cone: TURRET_ROUND_LINE_READING), so the page sends one at the press
 * and one each interval while held -- never sooner (the room drops an early one as 'rate'). The rifle is not fired.
 */
export class TurretTrigger {
  /**
   * LATER 588 (b) (reading, pending review): the kit's timer `+0x81c` -- set to the interval at a round, run down a game
   * frame at a time and clamped at 0 (`FUN_005c0fd0` D:L476643-476647; the gate `FUN_005c0ae0` D:L476446-476448), as
   * LATER 326 put the kit's (`./fire` `update`): a round every ceil(interval / frame) game frames at any page frame rate.
   * Was: run down a browser frame at a time (the PKM TURRET's 0.096 s at 10.0 a second at 60 fps and 10.29 at 144,
   * against the original's 3 frames, 9.99).
   */
  private wait = 0;
  /** LATER 588 (b): browser time not yet run down as whole game frames (`GAME_FRAME_DT`), the timer's frame clock. */
  private gameTime = 0;
  /**
   * LATER 180 (research 215 s8.3; reading, pending review): the kit's pending bit (`kit+1 & 4`) -- set by the raise latch,
   * which refuses its frame, any bullet class (`FUN_005c0ae0` D:L476423-476429); class 205 is then not refused below 1
   * (D:L476433-476438); cleared when a round goes (D:L476625-476627, D:L476639-476641), kept across a let-go (states 0 and
   * 3 return before it, D:L476381-476416). The game frames since it was set (`RAISE_LATCH_FRAME_READING`).
   */
  private pending = false;
  /** The game frames counted since the latch (`GameFrameAccumulator`, PF.R8), a fresh count at each latch. */
  private sinceLatch = new GameFrameAccumulator();
  private latchFrames = 0;

  /**
   * One frame of `dt` seconds -- the frame's real seconds (PAR-24, `./frameTime` `FrameTime.real`; research 252 s3), so a
   * page under 10 fps claims at the interval or once a frame, whichever is slower, never sooner: true when a round is due.
   * LATER 180: `lowered`, the gun a bullet class (PKM TURRET, LMG TURRET: class 205) and the body's raise below 1 -- the
   * pull's round waits the latch's game frame (the latch asked before the rate, D:L476423 before D:L476446). LATER 191:
   * `refused`, the kit gate's refusal (the own mount clip's `NoFire`, `./turretPage` `mountFireRefused`), after the latch.
   */
  frame(dt: number, held: boolean, interval: number | null, lowered = false, refused = false): boolean {
    // LATER 588 (b): each whole game frame that ended runs the timer down (D:L476643-476647); the leftover carried.
    this.gameTime += Number.isFinite(dt) && dt > 0 ? dt : 0;
    const steps = Math.floor((this.gameTime + 1e-9) / GAME_FRAME_DT);
    this.gameTime = Math.max(0, this.gameTime - steps * GAME_FRAME_DT);
    const waiting = this.wait > 0;
    for (let k = 0; k < steps && this.wait > 0; k++) this.wait = Math.max(0, this.wait - GAME_FRAME_DT);
    // A round on a frame no step opened the gate on (a press, a lifted refusal) starts the timer's frame clock, as the
    // kit's press does (`./fire` `pull`, LATER 326's F1); one a step opened keeps it (its frame began at that step).
    const opened = waiting && steps > 0 && this.wait <= 1e-9;
    if (this.pending) this.latchFrames += this.sinceLatch.advance(dt);
    if (!held || interval === null || interval <= 0) return false;
    if (lowered && !this.pending) {                     // the latch: its frame refused (D:L476423-476429)
      this.pending = true;
      this.sinceLatch = new GameFrameAccumulator();
      this.latchFrames = 0;
      return false;
    }
    // LATER 191: the kit gate's refusal after the latch (`FUN_005a7de0` D:L476442 -- the mount clip's NoFire): no round, the
    // pending bit kept, the cadence not spent; the first frame it lifts fires at once.
    if (refused) return false;
    if (this.wait > 1e-9) return false;
    if (lowered && this.latchFrames < 1) return false;  // its round no sooner than the next game frame
    this.wait = interval;
    if (!opened) this.gameTime = 0;
    this.pending = false;                               // a round goes: the bit cleared (D:L476625-476627)
    return true;
  }
}
