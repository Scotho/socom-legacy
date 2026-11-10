import { HOSTAGE_TEAM_READING, type AiLoc } from '@s2u/scene';
import type { ActionPrompt } from './hud';
import { ACTION_ICONS } from './hud';
import {
  commandFor, crosshairPick, orderTestRefusal, ORDER_PICK_REACH_READING, PLAYER_TEAM_MASKS, type HostageCommand, type PickBody, type PickSurface,
} from './net/hostageOrder';
import type { HostageStateWire, ServerEvent } from './net/protocol';

/**
 * HX-4a (web sprint 31; research 239 s1, s3; ruling HX.R8): the `hostages` part's page module, headless -- what the
 * action button offers on a hostage (FOLLOW! or HOLD POSITION, the HUD's `escortee` prompt) and its fire. The offer is
 * the issuer's console's test (`./net/hostageOrder` `orderTestRefusal`), the very test the room runs on the order, cast
 * on the page's own ray (the hostage bodies' and the others' capsules, the hull's surfaces under the aim pick's rule), so
 * the prompt matches what the room accepts. It draws nothing itself: the HUD's prompt comes through the action lane
 * (`./actionContext` `escortee`). Its mount -- `main.ts`'s, the `PART_DEPS` line, the switch, the action lane's input
 * and fire -- is the wave-4 batch's (research 239 s7); the front end has the part off this sprint.
 */

type V3 = [number, number, number];

/**
 * The prompts (`FUN_0021ded0`'s context-action table): action 0xe "FOLLOW!" (0x3e4f00) and 0xf "HOLD POSITION"
 * (0x3e4f08), both with `action_escortee.tif` (0x3e4dd0, loaded D:L73564-73565; `action_x.tif` its fallback), the
 * press's masks 0x4000 / 0x8000 (`FUN_00592d50` D:L452112-452130) -- research 189 s3, 190 s9 (D:L73782-73800,
 * D:L74265-74290). Shared with HX-5's HUD. Reading.
 */
export const ESCORTEE_PROMPT_READING = 'FOLLOW! 0xe / HOLD POSITION 0xf, action_escortee.tif';

/** Each order's prompt (`ESCORTEE_PROMPT_READING`): its text, its action and its mask in the offer (`+0xed0`). */
export const ESCORTEE_PROMPTS: Readonly<Record<HostageCommand, { text: string; action: number; mask: number }>> = {
  4: { text: 'FOLLOW!', action: 0xe, mask: 0x4000 },
  5: { text: 'HOLD POSITION', action: 0xf, mask: 0x8000 },
};

/**
 * Who hears an escortee's YES: OnCommand plays it through the ctrl's vt+0x24 (D:L450379, D:L450537) on the console that
 * runs the AI -- the host; whether the other consoles hear it is unread. The port plays it on every page, at the body,
 * when the room's `hostageState` moves the hostage's unit into or out of 17 (`../netPage` `escorteeVoice`).
 * Placeholder.
 */
export const HOSTAGE_YES_AUDIENCE_PLACEHOLDER = 'everyone, at the body';

/**
 * The YES an order plays: CHRSND 0x37 at 1.0 (D:L450379, D:L450537), which mp_fem1-3 name `^CO_0343` (their only
 * cues: YES, DAMAGE, DEATH -- research 189 s2, 199 s8). Reading.
 */
export const HOSTAGE_YES_CUE_READING = { cue: 0x37, sound: '^CO_0343' } as const;

/** What the page offers: the hostage, the order, its text, the HUD prompt and its bitmap. */
export interface HostageOffer { hostage: number; cmd: HostageCommand; text: string; prompt: ActionPrompt; icon: string }

/** What the part reads. */
export interface HostagePageDeps {
  /** The page's own seat: its id, alive, a spectator or not, its side, its feet; null off a match. */
  self(): { id: number; alive: boolean; spectator: boolean; side: 'seal' | 'terrorist'; feet: readonly number[] } | null;
  /** The hostages as the room told them (HX-1's `NetPage.hostages()`: the welcome's list, each `hostageState` since). */
  hostages(): Iterable<HostageStateWire>;
  /** A hostage's drawn feet (`RemotePlayers.feet`), or null. */
  feet(id: number): readonly number[] | null;
  /** The page's aim: the eye and the far point (`WalkMode.fireAim`), or null. */
  aim(): { eye: readonly number[]; far: readonly number[] } | null;
  /** Every body the ray meets on its capsules (the others' and the hostages': `./net/hitVolumes` `rayBody`), with its distance. */
  bodies(eye: V3, dir: V3, reach: number): readonly PickBody[];
  /** The hull's surfaces along the ray with their materials (`./net/hostageOrder` `pickSurfaces`). */
  surfaces(eye: V3, far: V3): readonly PickSurface[];
  /** A point's AI-map cell for the order's range (`./net/hostageOrder` `orderCellOf`: the located sub-map's own), null off every stored cell. */
  cellOf(feet: readonly number[]): AiLoc | null;
  /** The send (`NetPage.hostageOrder`). */
  order(hostage: number, cmd: HostageCommand): boolean;
}

export class HostagePage {
  private offered: HostageOffer | null = null;
  private fresh = false;
  /** HX-OBEY: why the last `compute` offered nothing (the step that stopped it), or null when it offered; for the dev hook. */
  private lastWhy: string | null = null;

  /** HX-OBEY: why nothing is offered now (`compute`'s stopping step: 'no self', 'no aim', 'no pick', 'not a hostage', 'no body', or the test's refusal), or null. */
  why(): string | null {
    this.offer();
    return this.lastWhy;
  }

  constructor(private readonly deps: HostagePageDeps) {}

  /** The order offered now (the action lane's `escortee` input, the HUD's prompt), or null; once a frame (`frame`). */
  offer(): HostageOffer | null {
    if (!this.fresh) { this.offered = this.compute(); this.fresh = true; }
    return this.offered;
  }

  /** A new frame: the offer is asked afresh. */
  frame(): void {
    this.fresh = false;
  }

  /** The `hostageState` hook (`PART_DEPS.hostages`): a state the room told changes the offer at once. */
  state(_ev: Extract<ServerEvent, { type: 'hostageState' }>): void {
    this.fresh = false;
  }

  /** A round's start or a map left: nothing offered until asked again. */
  reset(): void {
    this.offered = null;
    this.fresh = false;
  }

  /** The action button's release on the `escortee` context: the order offered now, sent; whether one was. */
  fire(): boolean {
    this.fresh = false;
    const o = this.offer();
    return o !== null && this.deps.order(o.hostage, o.cmd);
  }

  private compute(): HostageOffer | null {
    const out = this.computeWhy();
    this.lastWhy = typeof out === 'string' ? out : null;
    return typeof out === 'string' ? null : out;
  }

  /** The offer, or the step that stopped it (`why`). */
  private computeWhy(): HostageOffer | string {
    const self = this.deps.self(), aim = this.deps.aim();
    if (!self) return 'no self';
    if (!aim) return 'no aim';
    const eye: V3 = [aim.eye[0]!, aim.eye[1]!, aim.eye[2]!];
    const d = [aim.far[0]! - eye[0], aim.far[1]! - eye[1], aim.far[2]! - eye[2]];
    const l = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (!(l > 0)) return 'no aim';
    const dir: V3 = [d[0]! / l, d[1]! / l, d[2]! / l];
    const far: V3 = [eye[0] + dir[0] * ORDER_PICK_REACH_READING, eye[1] + dir[1] * ORDER_PICK_REACH_READING, eye[2] + dir[2] * ORDER_PICK_REACH_READING];
    const pick = crosshairPick(this.deps.bodies(eye, dir, ORDER_PICK_REACH_READING), this.deps.surfaces(eye, far));
    if (pick.picked === null) return pick.blocked.length ? `blocked: ${pick.blocked.join(',')}` : 'no pick';
    let h: HostageStateWire | null = null;
    for (const x of this.deps.hostages()) if (x.id === pick.picked) { h = x; break; }
    if (!h) return `not a hostage: ${pick.picked}`;
    const feet = this.deps.feet(h.id);
    if (!feet) return 'no body';
    const cmd = commandFor(h);
    const why = orderTestRefusal(
      cmd,
      { id: self.id, alive: self.alive, spectator: self.spectator, team: PLAYER_TEAM_MASKS[self.side], cell: this.deps.cellOf(self.feet) },
      { id: h.id, alive: h.alive, team: HOSTAGE_TEAM_READING, cell: this.deps.cellOf(feet), unit: h.unit, hidden: h.opacity <= 0, rescued: h.ai === 0x11 },
      pick,
    );
    if (why) return why;
    return { hostage: h.id, cmd, text: ESCORTEE_PROMPTS[cmd].text, prompt: 'escortee', icon: ACTION_ICONS.escortee };
  }
}
