import type { AiLoc } from '@s2u/scene';
import { HostageAi, type HostageAiOptions, type HostageStateId } from './hostageAi';
import {
  CMD_FOLLOW, ESCORTEE_UNIT_ID, orderTestRefusal, unitOfSeat, type HostageCommand, type OrderPick, type OrderRefusal,
} from '../../viewer/src/net/hostageOrder';

export {
  aimPickBlocks, cellDistance, commandFor, crosshairPick, inOrderRange, orderTestRefusal, pickSurfaces, rescuedRefusal, unitOfSeat, ORDER_PICK_REACH_READING,
  AIM_PICK_IGNORE_READING, BARS_MATERIAL_READING, BARS_SWAP_PLACEHOLDER, CMD_FOLLOW, CMD_HOLDPOS, ESCORTEE_UNIT_ID, HOLD_ISSUER_READING,
  ORDER_CELL_FIELD_READING, ORDER_PICK_READING, ORDER_RANGE_CELLS_READING, ORDER_SIDE_READING, PLAYER_TEAM_MASKS, RESCUED_REORDER_READING,
  SPECTATOR_ORDER_READING, UNIT_PER_PLAYER_READING,
  type HostageCommand, type OrderIssuer, type OrderPick, type OrderRefusal, type OrderTarget, type PickBody, type PickSurface,
} from '../../viewer/src/net/hostageOrder';

/**
 * HX-4a (web sprint 31; research 239 s1-s2; rulings HX.R3, HX.R4, HX.R5): the room's half of the hostage orders, pure --
 * the issuer's console's test run by the room (`orderRefusal`, over `../../viewer/src/net/hostageOrder`'s shared rule),
 * then what the host's `OnCommand` does (`FUN_0058fbe0` cases 4 and 5, D:L450351-450410, D:L450465-450540) on HX-3's
 * `HostageAi` (`follow`, `hold`, `releaseFollow`, `unit`), the leaders' bookkeeping (`TryControlHostage` /
 * `ControlHostageAction`, `FUN_005fd010` / `FUN_005fcf10` D:L509476-509527), the release on a leader's death or
 * departure (`FUN_00547af0` D:L413031-413046; `FUN_005998b0` D:L455500-455536) and the UnitTick's HOLD
 * (`FUN_005e8060` D:L498341-498463). The room (HX-1's `extraction.ts`, wave 3) supplies the cells, the pick, the seats.
 */

/**
 * The room runs the issuer's console's test and refuses only what it refuses (finding 7; MISSION rule 5): the original's
 * host applies a forwarded order without re-checking (`FUN_002bb8e0` D:L160706-160721 calls `FUN_00590ac0` directly;
 * research 191 s12.4), its client having run the offer. Reading.
 */
export const ORDER_VALIDATION_READING = "the issuer's console's test, by the room";

/**
 * A leader's death and departure release alike: `FUN_00547af0` (OnDeath, D:L413031-413046) calls
 * `ControlHostageAction(ai, 0)` for every AI whose stack holds 9 (`ctrl+0x42c & 0x200`) and whose leader is the dying
 * body -- the count -1, `+0x5d4` 0, the follow state's live bit cleared -- and a departure reaches it through
 * `FUN_005998b0` -> `FUN_005477a0(0, body)` (D:L455521, D:L412821-412842). `+0x5d8` (`lastLeader`) is kept (189 s14.8;
 * 199 s5, s12.6). Reading.
 */
export const LEADER_RELEASE_READING = 'ControlHostageAction(ai, 0), lastLeader kept';

/**
 * The UnitTick's HOLD (V5 H4-5b; research 199 s12.6): a member's death or departure flags its unit (`FUN_005ed7b0`
 * event 1, D:L454472 / D:L433948 / D:L455529); "UnitTick" (`FUN_005e7fd0`, every frame online, D:L50920, D:L500772) runs
 * `FUN_005e8060`, which, when no living member is left (D:L498439-498463), gives every living escortee of the unit
 * command 5 -- the issuer its last dead member, else the local player (the disconnect: on the host, the host's player;
 * the port's room has none, so null) -- and case 5 brings it back to 0x17 sub-state 2 with YES and into unit 0x11
 * (D:L450536-450539): never stranded. The port tests the units each frame where the original tests a flagged one: a seat
 * unit's membership changes only by those events. Reading (STRONG, one step: a player's unit has no other member).
 */
export const UNIT_TICK_HOLD_READING = 'back to unit 17 with YES';

/**
 * The leader's `+0x520` (NumberOfHostagesControlled; Harry's label, 189 s14.7): kept by `ControlHostageAction`, read by
 * OnDeath's `!= 0` gate (D:L413031); not replicated -- the room's own count. Reading.
 */
export const HOSTAGES_CONTROLLED_READING = "the leader's +0x520: the room's own";

/**
 * FOLLOW's radio: online case 4 calls `FUN_005e7f20(issuer, 0x2b, 0)` = CMD_MP_ESCORTEE_FOLLOWING (D:L450382;
 * the 6-byte Message to all, `FUN_002bad40` D:L160238-160249) -> `SND_ESCORTEE_FOLLOWING` `_60562_LeadingVip_MSG`
 * (research 191 s2.1 step 7). The port has no radio chatter: not played (note only, with HX-1's 0x44). Placeholder.
 */
export const RADIO_CHATTER_PLACEHOLDER = 'unplayed';

/**
 * The original's one round trip: a client's order is forwarded to the host (`FUN_005e6a00` D:L497530-497537 ->
 * `FUN_002bb970` D:L160726-160750, 8 bytes, flags 0x40) and never refused by the net; the port's `hostageOrder` event
 * is the same one trip, the room's test its only refusal (`ORDER_VALIDATION_READING`). Note only.
 */
export const ORDER_RTT_READING = 'one round trip, the room the only refusal';

/** CHRSND YES 0x37, played at 1.0 by OnCommand cases 4 and 5 (ctrl vt+0x24, D:L450379, D:L450537). */
export const CUE_YES = 0x37;

/** A hostage the orders act on: its AI (HX-3's), and the leader's bookkeeping (`ai+0x5d4`, `ai+0x5d8`). */
export interface OrderedHostage {
  readonly id: number;
  readonly ai: HostageAi;
  /** `ai+0x5d4`: the seat leading it (state 9), else null. */
  leader: number | null;
  /** `ai+0x5d8`: the last leader's id, kept on a release (the rescue's credit, HX-5). */
  lastLeader: number | null;
}

/** A seat as the bookkeeping reads it: its id and its alive bit (`+0xe1` bit 4). */
export interface LeaderSeat { id: number; alive: boolean }

/**
 * The leaders' counts (`+0x520`, `HOSTAGES_CONTROLLED_READING`) and `ControlHostageAction` / `TryControlHostage` on
 * them.
 */
export class HostageLeaders {
  private readonly counts = new Map<number, number>();

  /** A round's start: every count gone with the leads (the hostages are fresh). */
  clear(): void {
    this.counts.clear();
  }

  /** A session takeover: the old seat's count is the new seat's. */
  rekey(old: number, id: number): void {
    const n = this.counts.get(old);
    if (n === undefined) return;
    this.counts.delete(old);
    this.counts.set(id, n);
  }

  /** A seat's `+0x520`: how many hostages it leads. */
  controlled(seat: number): number {
    return this.counts.get(seat) ?? 0;
  }

  /**
   * `ControlHostageAction` (`FUN_005fcf10` D:L509476-509527): the old leader released first (its count -1 while
   * positive, D:L509487-509493); then a null leader, or an alive one that is not the hostage itself, taken (D:L509495-509503):
   * `leader`, its count +1, `lastLeader` its id; with no leader after it the follow state's live bit is cleared
   * (`HostageAi.releaseFollow`, D:L509505-509514). Whether the leader was taken.
   */
  controlHostageAction(h: OrderedHostage, leader: LeaderSeat | null): boolean {
    if (h.leader !== null) {
      const n = this.controlled(h.leader);
      if (n > 0) this.counts.set(h.leader, n - 1);
      h.leader = null;
    }
    let took = false;
    if (leader === null || (leader.id !== h.id && leader.alive)) {
      if (leader) {
        h.leader = leader.id;
        this.counts.set(leader.id, this.controlled(leader.id) + 1);
        h.lastLeader = leader.id;
      }
      took = true;
    }
    if (h.leader === null) h.ai.releaseFollow();
    return took;
  }

  /** `TryControlHostage` (`FUN_005fd010`): `ControlHostageAction`, then the follow state's `+0x58` = the leader (the AI's own). */
  tryControlHostage(h: OrderedHostage, leader: LeaderSeat | null): boolean {
    return this.controlHostageAction(h, leader);
  }
}

/**
 * A hostage's AI with Follow's end wired (`HostageAiOptions.signal`): state 9 ended (signal 1: popped by HOLD's unwind,
 * replaced by the rescue, popped by the driver after a release) runs `ControlHostageAction(ai, 0)` -- "Follow's end drops
 * the leader's count" (research 199 s1's replay, s12.6). HX-1's extraction makes its hostages through this (wave 3).
 */
export function createOrderedHostage(opts: HostageAiOptions, leaders: HostageLeaders): OrderedHostage {
  const own = opts.signal;
  const h: { id: number; ai: HostageAi; leader: number | null; lastLeader: number | null } = { id: opts.id, ai: null as unknown as HostageAi, leader: null, lastLeader: null };
  h.ai = new HostageAi({
    ...opts,
    signal: (state, signal) => {
      if (state.id === 9 && signal === 1 && h.leader !== null) leaders.controlHostageAction(h, null);
      own?.(state, signal);
    },
  });
  return h;
}

/** What an order did: the YES asked (CHRSND 0x37), the AI's top state after it, the hostage's unit after it. */
export interface OrderOutcome { yes: boolean; top: HostageStateId | null; unit: number }

/**
 * FOLLOW (OnCommand case 4, D:L450351-450410), for an escortee online: when the hostage's unit is not the issuer's
 * (D:L450373), the hostage joins the issuer's unit (`FUN_005ee160`, D:L450377), YES (D:L450379) and the radio
 * (`RADIO_CHATTER_PLACEHOLDER`); then ClearStack(0) and 9 kept on top or pushed (`HostageAi.follow`); only when 9 is the
 * top, `TryControlHostage` (D:L450393-450398) -- so a FOLLOW on a rescued hostage (0x11's mask refuses 9) joins and says
 * YES but leads nothing (research 199 s1's replay).
 */
export function follow(h: OrderedHostage, issuer: LeaderSeat, leaders: HostageLeaders): OrderOutcome {
  const unit = unitOfSeat(issuer.id);
  let yes = false;
  if (h.ai.unit !== unit) {
    h.ai.unit = unit;
    h.ai.cues.push(CUE_YES);
    yes = true;
  }
  if (h.ai.follow(issuer.id)) leaders.tryControlHostage(h, issuer);
  return { yes, top: h.ai.state, unit: h.ai.unit };
}

/**
 * HOLD (OnCommand case 5, D:L450465-450540): HX-3's `hold(issuer)` (ClearStack(0); `FUN_00555900(ctrl, 2)` -- the
 * unwind to 0x17 and sub-state 2, the issuer recorded -- else UnwindTo(6), else Replace by CAiSHold), then for an
 * escortee, whatever the stack did, YES and the escortee unit 0x11 (`FUN_005ee250`, D:L450536-450539; HX-3's review
 * note, research 238 s2.6). A state 9 the unwind pops ends through `createOrderedHostage`'s Follow's end. `issuer` null:
 * the UnitTick's with no seat left (`UNIT_TICK_HOLD_READING`).
 */
export function hold(h: OrderedHostage, issuer: number | null): OrderOutcome {
  const top = h.ai.hold(issuer ?? -1);
  h.ai.cues.push(CUE_YES);
  h.ai.unit = ESCORTEE_UNIT_ID;
  return { yes: true, top: top ?? h.ai.state, unit: h.ai.unit };
}

/** OnCommand's case for `cmd` (`FUN_0058fbe0`): FOLLOW or HOLD. */
export function onCommand(h: OrderedHostage, cmd: HostageCommand, issuer: LeaderSeat, leaders: HostageLeaders): OrderOutcome {
  return cmd === CMD_FOLLOW ? follow(h, issuer, leaders) : hold(h, issuer.id);
}

/**
 * A leader's death or departure (`LEADER_RELEASE_READING`): `ControlHostageAction(ai, 0)` for every living hostage whose
 * stack holds 9 and whose leader is the seat. The hostages released, in order; the UnitTick's HOLD follows (`unitTick`).
 */
export function releaseLeader(hostages: readonly OrderedHostage[], seat: number, leaders: HostageLeaders): OrderedHostage[] {
  const out: OrderedHostage[] = [];
  for (const h of hostages) {
    if (h.leader !== seat || !h.ai.stack.has(9)) continue;
    leaders.controlHostageAction(h, null);
    out.push(h);
  }
  return out;
}

/**
 * The UnitTick (`UNIT_TICK_HOLD_READING`, `FUN_005e8060` D:L498341-498463): for each seat's unit holding living
 * escortees whose member is dead or gone, HOLD to each of them (the original calls the escortee's OnCommand itself,
 * D:L498450), the issuer the dead member (its seat still resolves) or null (departed). What it issued, in order.
 */
export function unitTick(hostages: readonly OrderedHostage[], seat: (id: number) => LeaderSeat | undefined): { hostage: OrderedHostage; issuer: number | null }[] {
  const out: { hostage: OrderedHostage; issuer: number | null }[] = [];
  for (const h of hostages) {
    if (!h.ai.alive || h.ai.unit === ESCORTEE_UNIT_ID) continue;
    const member = seat(h.ai.unit - 0x20);
    if (member?.alive) continue;
    hold(h, member ? member.id : null);
    out.push({ hostage: h, issuer: member ? member.id : null });
  }
  return out;
}

/** The order as the room receives it (`hostageOrder` with the room's view of both bodies). */
export interface OrderRequest {
  cmd: HostageCommand;
  issuer: { id: number; alive: boolean; spectator: boolean; team: number; feet: readonly number[] };
  hostage: { id: number; alive: boolean; team: number; feet: readonly number[]; unit: number; hidden: boolean; rescued?: boolean };
  eye: readonly number[];
  dir: readonly number[];
}

/** The room's world for the test: a body's cell (`aiCellOf` on sub-map 0) and the crosshair pick along the page's aim. */
export interface OrderWorld {
  cellOf(feet: readonly number[]): AiLoc | null;
  pick(eye: readonly number[], dir: readonly number[]): OrderPick;
}

/** The room's check of an order (`ORDER_VALIDATION_READING`): the console's test over the room's cells and pick. */
export function orderRefusal(req: OrderRequest, world: OrderWorld): OrderRefusal | null {
  const { issuer: i, hostage: h } = req;
  return orderTestRefusal(
    req.cmd,
    { id: i.id, alive: i.alive, spectator: i.spectator, team: i.team, cell: world.cellOf(i.feet) },
    { id: h.id, alive: h.alive, team: h.team, cell: world.cellOf(h.feet), unit: h.unit, hidden: h.hidden, rescued: h.rescued === true },
    world.pick(req.eye, req.dir),
  );
}
