import { actorToWorldPoint, CLAYMORE_RULES, PLACE_CLAYMORE_ANIM, type HullCast } from '@s2u/scene';
import type { MapAction } from '../../viewer/src/mapActions';
import { Button, TICK_HZ, type Command, type SimMap, type Stance, type Team } from '../../viewer/src/sim';
import {
  BOMB_STATE, bombOutcome, canDrop, FUSE_S, HOLD_TICKS, holdKind, PICKUP_COOLDOWN_S, PLACEMENT_S, pickupReach, plantReachFrom, plantSite,
  type BombHold, type BombState, type BombWire, type PlantPick,
} from '../../viewer/src/net/objective';
import { placeGround, restsOn } from '../../viewer/src/net/placing';

/**
 * XR-05, DEMOLITION's bomb in the room (socomlegacy/docs/research/214-demolition-as-built.md s1-s2; research 171 s6-s7,
 * 173 s2-s3; rulings PF.R27, PF.R28, PF.R30, PF.R32, PF.R33): the room's one `CZBombState` a round -- on the ground at
 * StartBomb, picked up by proximity, carried, dropped (a death, a leave, the manual drop), planted after a 5 s hold and a
 * 2.25 s placement at the opposing tent, defused by the other side's 5 s hold, detonated at 30 s. The original's state
 * handler takes a client's request whole (`FUN_002b9a00`, research 171 s6); here the room is the authority: it measures
 * the holds itself from `Button.ActionHeld` on the commands it runs (`command`), never a duration a page sends, and
 * checks the reach, the side, the state and the round's phase.
 *
 * The rules are `../../viewer/src/net/objective`'s, which the page's follower (`bombPage.ts`) reads too. The room calls
 * `command` for each command it runs (`Room.run`), `step` once a tick after the movers and the grenades and before its
 * clock (`DEM_SAME_TICK_READING`), `dropped` on a death or a leave, `rekey` on a session takeover, `reset` at a round's
 * start; its clock reads `result` and `planted` (PF.R27). The scoring (PF-14) and the bases (XR-08) listen on `on`.
 */

type V3 = [number, number, number];

/** A player as the bomb sees it. */
export interface BombActor {
  readonly id: number; readonly team: Team; readonly alive: boolean; feet(): V3;
  /** B194: the body's facing, degrees (yaw 0 faces -z; the room's walker's `yaw`): the plant's hand (`bombPlantHand`). */
  yaw(): number;
  /** B194: the sidearm in the hand (`Walker.hand` 1, the actor's `+0xf79` 2): the plant's pistol clip (`bombPlantHand`). */
  pistol(): boolean;
  /** PLANT-AIM: the body's stance (`Walker.posture`): the plant's reach point (`plantReachFrom`). Absent: standing. */
  posture?(): Stance;
  /**
   * LATER 220's second head (research 369 §2): the action prompts' common gate shut on the command `command` counts
   * (`room.ts` `actionGateShut`): the plant's and the defuse's offer (0x80) is built past it (`FUN_00593500` D:L452277),
   * so a held command under it counts no hold, as a released one. Absent: open.
   */
  readonly gateShut?: boolean;
  /**
   * PLANT-AIM (`PLANT_REACH_READING`): the pick the page named (`aim`) as the room re-picks it now -- along the newest
   * command's look and its own grid (`room.ts` `plantAimSees`), read on every tick the plant's eligibility is: the surface
   * the room takes (its own point), or null. Absent: the named pick is taken as it is (a caller with no look to hold it to).
   */
  sees?(claim: PlantAim): PlantPick | null;
}

/** PLANT-AIM: the pick a page names for the plant (`bombAction` 'aim'): the struck surface and the eye its ray left. */
export interface PlantAim { surface: PlantPick & { point: V3 }; eye?: V3 }

/** What the room lends the bomb. */
export interface BombHost {
  /** The room's tick. */
  tick(): number;
  /**
   * A round in play or in its decided hold (`DECIDED_HOLD_BOMB_READING`): outside them -- the waiting room, the result
   * screens -- the bomb is held as it lies: no hold counts, no pickup, drop, placement or fuse.
   */
  live(): boolean;
  /** Every seated player. */
  actors(): Iterable<BombActor>;
  actor(id: number): BombActor | undefined;
  /** The room's hull cast (the charges' ground, `Room.hullCast`). */
  cast(): HullCast;
  /** Every page told the bomb as it stands (a `bomb` event). */
  send(wire: BombWire): void;
}

/** The transitions the room's listeners hear: PF-14's +2s, XR-08's bases. */
export type BombEventKind = 'pickedUp' | 'dropped' | 'planted' | 'defused' | 'detonated';
export interface BombEvent {
  kind: BombEventKind;
  /** The actor: the picker, the dropping carrier, the planter (`planted`, `detonated`), the defuser; null for none. */
  by: number | null;
  /** The actor's side. */
  team: Team | null;
  /** Where the bomb is after the transition. */
  pos: V3;
  /** The planting side (states 3-5), else null. */
  plantingTeam: Team | null;
  /** A drop's cause: the carrier's death, its leave or its seat lost (`gone`), or the manual drop. */
  why?: 'death' | 'leave' | 'gone' | 'manual';
}

/**
 * How far under the feet the dropped bomb's ground is looked for (`BOMB_GROUND_READING`; the plant's is the hand's column
 * since B194, `plant`): the room's own search bound, not a game value -- a corpse thrown off a roof still finds the street.
 */
const FLOOR_SEARCH = 1000;
/**
 * How far over the feet that search starts (`BOMB_GROUND_READING`): the room's own bound, not a game value, so feet a hair
 * under their floor still find it (AD-4: it was the placement's cast lift, 1, borrowed; the original projects the
 * bomb's model, `FUN_0059ddb0`, not the placement's column, so the bomb keeps its own search).
 */
const BOMB_FLOOR_LIFT = 1;

/**
 * BOMB_PLANT_HAND_READING (B194, research 214 §2 "The plant's point"; reading, pending review): the right hand's point,
 * body frame (x right, y up, z behind, the soles at the origin), as the placement ends. MPBOMB (item 0x9a) takes the
 * kit's ground-placement branch with 0x98-0x9a and 0x9e (`FUN_005c1970` D:L476888, D:L477002-477010): `FUN_005c2430`
 * carries node `+0x300` (`rhand`, research 80) at (0, 0, 0) (`DAT_003f64c0`) through `FUN_002869d0` on the `+0x170`
 * skeleton, the body's matrix (`+0x50`) and its position (`+0x1c`) (D:L477198-477200). The pose is `Place claymore`'s
 * (`PLANT_ANIM`, D:L475480-475481) -- with the sidearm in the hand its pistol pair (`handAnim`) -- at `PLACEMENT_S`
 * (2.25 s, `+0x87c`) on the one-shot clock (`./throwPose`, `FUN_0028c4f0`: phase t / (2.7 x 54/55), key phase x 55):
 * key 46.682, the port's sampler and `writePose` (`viewer/src/animator.ts`) over the shared rig (every DEMOLITION map's
 * eight types alike; `central/test/bombPlantHand.test.ts` re-reads it off MOTION_P.ZAR and MP2's skeletons). Unread:
 * the clip's root travel in x and z, which `writePose` drops (the clip's root moves about 1.2 u right by then); the
 * hand's frame on the tick the timer runs out against the clip's (one 60 Hz tick is 0.35 keys).
 */
export const BOMB_PLANT_HAND_READING = {
  key: (PLACEMENT_S / (PLACE_CLAYMORE_ANIM.playback * ((PLACE_CLAYMORE_ANIM.frames - 1) / PLACE_CLAYMORE_ANIM.frames))) * PLACE_CLAYMORE_ANIM.frames,
  rifle: [2.603405, 6.207189, 1.43147] as const,
  pistol: [1.750641, 6.814781, 0.164585] as const,
} as const;

/** The plant's hand in the world (`BOMB_PLANT_HAND_READING`): the feet's point turned by the facing's yaw. */
export function bombPlantHand(feet: readonly number[], yaw: number, pistol: boolean): V3 {
  return actorToWorldPoint(feet, yaw, pistol ? BOMB_PLANT_HAND_READING.pistol : BOMB_PLANT_HAND_READING.rifle);
}

/**
 * ACT-7 (ACT.R8, the owner's call via the merge controller, 2026-10-08, and its rulings on the shape the same day): a
 * hold takes the original's real time -- 300 ticks, 5 s -- on any honest machine, and never less for anyone. It advances
 * one a room tick while the player's held state is live: set by the latest command run with `ActionHeld` while
 * eligible, and live until this many ticks pass with no command run at all. A page sends one command a fixed 60 Hz tick
 * of its walk but at most 6 a frame (`main.ts` clamps a frame's dt to 0.1 s; `mover.ts` `advance`), so below 10 fps it
 * sends fewer than 60 a second and its frames come further apart -- 12 ticks at 5 fps -- and counting its commands would
 * slow it; counting ticks does not, and a flood cannot speed ticks: a hold commits on its 300th live tick exactly.
 * 15 ticks (250 ms; the merge controller ratified it over the 8 first named): a 5-fps page sends a frame every 12
 * ticks, and 15 covers that gap plus some network jitter (8 would pause it 4 ticks in 12). It cannot speed a hold -- the
 * hold counts ticks, never commands -- it only decides how long a stalled or gone page keeps holding: past it the hold PAUSES, and resumes without a reset at its next held command (the
 * original has no such pause -- a console never stalls -- so a short pause-and-resume is the faithful reading; a reset
 * would punish a hitch). A server tolerance (the game has no server: research 91 s15), not a game value.
 */
export const HOLD_LIVE_TICKS_PLACEHOLDER = 15;

/**
 * [reading, pending review] LATER 149 (research 174 §2): on BREACH only a SEAL picks the bomb up -- `FUN_0059def0`
 * (D:L457619) makes the pickup's request, with game `+0x111 == 1`, only when `FUN_002c31d0` (D:L164725-164762) finds the
 * player's team word the SEALs' -- the test follows the side-swap byte `DAT_004412d8`, as `FUN_002c3330` maps the same word
 * to `player_team 0` (D:L164835-164855). The decompiler shows the call with no argument (D:L457629): it dropped the
 * player passed through in `a0`, the only reading under which BREACH has a pickup at all. DEMOLITION's pickup takes
 * either side. A Terrorist over the bomb leaves it lying.
 */
export const BREACH_PICKUP_READING = 'seals-only' as const;

/**
 * [reading, pending review] LATER 145 (research 214 §6): the bomb is live through a decided round's hold. The original's
 * requests (`FUN_0059def0` pickup, `FUN_0059dd30` drop, `FUN_0059da80` defuse, `FUN_005bc730` plant) reach the host's
 * state machine (`FUN_002c2090` -> `FUN_002b9910` -> `FUN_002c1f10` D:L164008-164043) with no test of the round, and its
 * commit (`FUN_002c20c0` D:L164060-164100) holds while the game's state is 3 and the bomb is alive (+0x113, +0xd6): the
 * state turns to 4 / 6 only 3 s after `mission_complete` / `mission_failure` (`FUN_002a9b30` D:L150662-150665), set at the
 * very end of `success` / `failure` (after their WAIT 20 and WAIT 1, all 22 maps), when `FUN_002c1970` (D:L150616) tears the
 * bomb down -- the room's `endRound`. Each transition scores (`FUN_002c1c30`: the plant +2, the defuse). No detonation fits
 * in a hold (`FUSE_S` 30 s). In the room, DEMOLITION alone (BREACH has no room bomb, research 174 §8 item 7): after an elimination
 * the survivors pick up, drop and plant; the waiting room and the result screens keep the bomb as it lies.
 */
export const DECIDED_HOLD_BOMB_READING = 'live through a decided hold' as const;

/** A hold being counted (ACT.R8): its kind, the tick it began, the last tick a command ran for it, the live ticks counted. */
interface Hold { kind: 'plant' | 'defuse'; since: number; last: number; ticks: number }

export class BombAuthority {
  private state_: BombState = BOMB_STATE.ground;
  private pos: V3;
  private carrier: number | null = null;
  private planter: number | null = null;
  private plantingTeam: Team | null = null;
  private defuser: number | null = null;
  private defuserTeam: Team | null = null;
  private detonateTick: number | null = null;
  private pickupAfterTick = 0;
  /**
   * The plant's placement stage (`PLACEMENT_S`) once the hold committed: who, from and to which tick, and the planter's
   * feet, facing and hand then (the hand's point is taken at the end, `plant`; these stand in for a planter gone by then).
   */
  private placing: { by: number; team: Team; since: number; ends: number; feet: V3; yaw: number; pistol: boolean } | null = null;
  /**
   * The holds being counted, by player (`FUN_00594cf0`'s hold, D:L453249-453287; *was* cited `FUN_00594600`): begun by a command with `ActionHeld` while eligible, kept live
   * by the next, advanced one a tick at `step` while live (ACT.R8, `HOLD_LIVE_TICKS_PLACEHOLDER`).
   */
  private readonly holds = new Map<number, Hold>();
  /** Each player's last command run: the manual drop's stick and aim. */
  private readonly last = new Map<number, { forward: number; right: number; pitch: number }>();
  /** PLANT-AIM: each player's last named pick (`aim`), kept until it names another or none, judged when read (`eligible`). */
  private readonly aims = new Map<number, PlantAim>();
  /** Where the carrier stood at the last tick (its seat lost between ticks: the bomb lies there, `FUN_002bef60`). */
  private carrierFeet: V3 | null = null;
  /** P25 (BO-1; PB-1 re-review, option B): the last drop's cause, told with the bomb on the ground (`BombWire.dropWhy`). */
  private dropWhy: NonNullable<BombEvent['why']> | null = null;
  /** The last wire told: a `bomb` event goes out when it changes. */
  private told: string;
  private readonly listeners = new Map<BombEventKind, Set<(e: BombEvent) => void>>();

  /**
   * The room's bomb on a DEMOLITION or BREACH map (game types 2 and 1, `FUN_002a6c50` D:L149166-149173's bomb setup
   * branch): DEMOLITION's two MPBOMB records (`plantSite`), BREACH's `terrorist_tent` alone, and StartBomb
   * (`SimMap.bombStart`); null on any other map, or one missing its site(s) or StartBomb.
   */
  static of(map: SimMap, host: BombHost): BombAuthority | null {
    // LATER 149: the one shared bomb on BREACH (1) and DEMOLITION (2) alike (`InitBomb` D:L149166-149173). BREACH's map
    // has `terrorist_tent` alone -- the SEALs' site; the Terrorists plant nowhere -- and only a SEAL picks the bomb up.
    if ((map.gameType !== 1 && map.gameType !== 2) || !map.bombStart) return null;
    const actions = map.meta?.actions ?? [];
    const seal = plantSite('seal', actions), terrorist = plantSite('terrorist', actions);
    if (map.gameType === 1) return seal ? new BombAuthority([...map.bombStart], { seal, terrorist: null }, host, 'seal', actions) : null;
    return seal && terrorist ? new BombAuthority([...map.bombStart], { seal, terrorist }, host, null, actions) : null;
  }

  private constructor(private readonly start: V3, private readonly sites: Readonly<Record<Team, MapAction | null>>, private readonly host: BombHost,
    /** LATER 149 (`BREACH_PICKUP_READING`): the one side that picks the bomb up, or null for both (DEMOLITION). */
    private readonly pickupTeam: Team | null,
    /** PLANT-AIM: the map's actions, the pick's node resolved among them (`plantAimAt`, `FUN_005aa470`'s parent walk). */
    private readonly actions: readonly MapAction[]) {
    this.pos = [...start];
    this.told = JSON.stringify(this.wire());
  }

  /** The state (`BOMB_STATE`). */
  get state(): BombState { return this.state_; }
  /** State 3: the round's result is the bomb's (PF.R27). */
  get planted(): boolean { return this.state_ === BOMB_STATE.planted; }

  /** The bomb as the wire carries it (`BombWire`): the welcome's `objective` and every `bomb` event. */
  wire(): BombWire {
    const hold = this.hold();
    return {
      state: this.state_, pos: [...this.pos], carrier: this.carrier, planter: this.planter, plantingTeam: this.plantingTeam,
      defuser: this.defuser, ...(hold ? { hold } : {}), detonateTick: this.detonateTick, pickupAfterTick: this.pickupAfterTick,
      ...(this.state_ === BOMB_STATE.ground && this.dropWhy ? { dropWhy: this.dropWhy } : {}),
    };
  }

  /** A listener for a transition; returns its removal. */
  on(kind: BombEventKind, listener: (e: BombEvent) => void): () => void {
    let set = this.listeners.get(kind);
    if (!set) this.listeners.set(kind, set = new Set());
    set.add(listener);
    return () => set.delete(listener);
  }

  /** The round's result once the bomb has one: state 4 the defuser's side, state 5 the planting side's (`bombOutcome`). */
  result(): { winner: Team; kind: 'defused' | 'detonated' } | null {
    const winner = bombOutcome(this.state_, this.plantingTeam, this.defuserTeam);
    if (!winner) return null;
    return { winner, kind: this.state_ === BOMB_STATE.defused ? 'defused' : 'detonated' };
  }

  /**
   * A round's start (`FUN_002c1a80` D:L163839 at the level's load; the round is a reload, research 91 s18.2.4): on the
   * ground at StartBomb, no carrier, no planter, no fuse, no cooldown, no hold -- told to every page.
   */
  reset(): void {
    this.state_ = BOMB_STATE.ground;
    this.pos = [...this.start];
    this.carrier = this.planter = this.defuser = this.detonateTick = null;
    this.plantingTeam = this.defuserTeam = null;
    this.pickupAfterTick = 0;
    this.placing = null;
    this.carrierFeet = null;
    this.dropWhy = null;                                          // P25: a reset is no drop
    this.holds.clear();
    this.publish(true);
  }

  /**
   * One command the room ran for `a` (`Room.run`): its stick and aim kept for the manual drop, and the hold's state set
   * (ACT.R8, the owner's call via the merge controller, 2026-10-08; it was counted once a tick on which a command ran, so
   * a 15-fps page's batches of 4 took 20 s): a command with `ActionHeld` while `a` may plant (the carrier at its side's
   * site, no placement running) or defuse (the other side, within `DEFUSE_REACH` of the planted bomb) begins the hold or
   * keeps it live; any command without the bit, out of reach, or under the prompts' common gate resets it to 0 (`FUN_00594cf0`'s hold, D:L453249-453287:
   * flag bit 4 clear resets the timer `+0x160` to 5.0 s and clears the target, D:L453281-453287; the bit is written by
   * `FUN_0021f850` D:L74307 after `FUN_00593500` D:L73390 built the offers past the gate -- *was* cited `FUN_00594600`
   * D:L453260-453294). The
   * hold advances one a room tick at `step` while live (`HOLD_LIVE_TICKS_PLACEHOLDER`) and commits on its 300th
   * (`HOLD_TICKS`; `FUN_005920c0` D:L451484): the plant's placement begins, or the defuse is done (D:L451507-451522, no
   * placement). The wire is told once a tick (`step`).
   */
  command(a: BombActor, cmd: Pick<Command, 'forward' | 'right' | 'pitch' | 'buttons'>): void {
    this.last.set(a.id, { forward: cmd.forward, right: cmd.right, pitch: cmd.pitch });
    const kind = this.host.live() && a.alive && (cmd.buttons & Button.ActionHeld) !== 0 && !a.gateShut ? this.eligible(a) : null;
    let h = this.holds.get(a.id);
    if (!kind) {
      if (h) this.holds.delete(a.id);
      return;
    }
    const tick = this.host.tick();
    if (!h || h.kind !== kind) {
      h = { kind, since: tick, last: tick, ticks: 0 };
      this.holds.set(a.id, h);
    }
    h.last = tick;
  }

  /**
   * One tick, after the commands and before the room's clock (`DEM_SAME_TICK_READING`): a carrier whose seat is gone or
   * dead without a drop (a takeover's ghost, a demotion) leaves the bomb where it stood; the placement ends in a plant
   * (`PLACEMENT_S`); a bomb on the ground goes to the lowest-id living player within reach once the cooldown is clear
   * (`FIRST_REQUEST_WINS_READING`); the fuse ends in the detonation (`FUSE_S`, the host's: `FUN_002c2260`).
   */
  step(): void {
    // A seat gone without a leave (a takeover's old id, a replaced or demoted connection): its hold and command go.
    for (const map of [this.holds, this.last, this.aims] as Map<number, unknown>[]) for (const id of map.keys()) if (!this.host.actor(id)) map.delete(id);
    if (!this.host.live()) { this.publish(); return; }
    const tick = this.host.tick();
    if (this.state_ === BOMB_STATE.carried && this.carrier !== null) {
      const c = this.host.actor(this.carrier);
      if (!c?.alive) this.dropAt(this.carrierFeet ?? this.pos, this.carrier, c?.team ?? null, 'gone');
      else this.carrierFeet = c.feet();
    }
    // ACT.R8: each hold advances one this tick while live -- a command run within `HOLD_LIVE_TICKS_PLACEHOLDER` ticks, the
    // actor alive and still eligible -- before the placement, the pickups and the fuse (`DEM_SAME_TICK_READING`).
    for (const [id, h] of [...this.holds]) {
      const a = this.host.actor(id);
      if (!a?.alive || this.eligible(a) !== h.kind) { this.holds.delete(id); continue; }
      if (tick - h.last >= HOLD_LIVE_TICKS_PLACEHOLDER) continue;            // stalled or gone: paused, not reset
      if (++h.ticks < HOLD_TICKS) continue;
      this.holds.delete(id);
      if (h.kind === 'plant') this.beginPlacement(a);
      else this.defuse(a);
    }
    if (this.placing && tick >= this.placing.ends) this.plant();
    if (this.state_ === BOMB_STATE.ground && tick >= this.pickupAfterTick) {
      let taker: BombActor | null = null;
      for (const a of this.host.actors()) if (a.alive && (this.pickupTeam === null || a.team === this.pickupTeam) && (!taker || a.id < taker.id) && pickupReach(this.pos, a.feet())) taker = a;
      if (taker) this.pickup(taker);
    }
    if (this.state_ === BOMB_STATE.planted && this.detonateTick !== null && tick >= this.detonateTick) this.detonate();
    this.publish();
  }

  /**
   * A player's death or leave (`FUN_00547af0` D:L413112 -> `FUN_0059dd30` D:L457560; a leave, `FUN_002bef60`
   * D:L162527): its hold is gone; carrying, the bomb lies at `feet`'s ground and a placement under way is cancelled
   * (`PLANT_PLACEMENT_CANCEL_READING`).
   */
  dropped(id: number, team: Team, feet: V3, why: 'death' | 'leave'): void {
    this.holds.delete(id);
    if (why === 'leave') { this.last.delete(id); this.aims.delete(id); }
    if (this.state_ === BOMB_STATE.carried && this.carrier === id) this.dropAt(feet, id, team, why);
  }

  /**
   * The manual drop (`bombAction` 'drop'; action 6, `FUN_005937c0` D:L452458-452473): null when taken, else why not --
   * 'not in play', 'not carrying', 'placing' (the placement holds the bomb), 'cooldown', 'drop aim' (`canDrop`: a
   * stick or an aim above `DROP_AIM_READING` on the last command run).
   */
  manualDrop(a: BombActor): string | null {
    if (!this.host.live()) return 'not in play';
    if (this.state_ !== BOMB_STATE.carried || this.carrier !== a.id) return 'not carrying';
    if (this.placing) return 'placing';
    const tick = this.host.tick();
    if (tick < this.pickupAfterTick) return 'cooldown';
    const l = this.last.get(a.id) ?? { forward: 0, right: 0, pitch: 0 };
    if (!canDrop({ carrying: true, tick, pickupAfterTick: this.pickupAfterTick, ...l })) return 'drop aim';
    this.dropAt(a.feet(), a.id, a.team, 'manual');
    return null;
  }

  /** A session takeover (`Room.takeOver`): the seat's bomb, hold and last command go with it to its new id. */
  rekey(old: number, id: number): void {
    if (this.carrier === old) this.carrier = id;
    if (this.planter === old) this.planter = id;
    if (this.defuser === old) this.defuser = id;
    if (this.placing?.by === old) this.placing.by = id;
    for (const map of [this.holds, this.last, this.aims] as Map<number, unknown>[]) {
      const v = map.get(old);
      if (v !== undefined) { map.delete(old); map.set(id, v); }
    }
    this.publish();
  }

  /**
   * PLANT-AIM (`PLANT_REACH_READING`): the pick player `id`'s page names for the plant (`bombAction` 'aim'), or none (null).
   * Kept as named -- not judged here: the room holds it to the newest look each tick it reads it (`BombActor.sees`), as
   * the original re-picks every frame of the hold (`FUN_00594cf0` D:L453258, `FUN_005920c0` D:L451495).
   */
  aim(id: number, claim: PlantAim | null): void {
    if (claim) this.aims.set(id, claim);
    else this.aims.delete(id);
  }

  // ---- the transitions ----

  /**
   * The hold `a`'s held Action counts for (`holdKind`, the page's rule too). PLANT-AIM: the carrier's named pick, when the
   * room still sees it (`BombActor.sees`), is the plant's pick; none, and no plant.
   */
  private eligible(a: BombActor): 'plant' | 'defuse' | null {
    const b = { state: this.state_, carrier: this.carrier, placing: this.placing !== null, plantingTeam: this.plantingTeam, pos: this.pos };
    const claim = b.state === BOMB_STATE.carried && b.carrier === a.id && !b.placing ? this.aims.get(a.id) : undefined;
    const pick = claim ? (a.sees ? a.sees(claim) : claim.surface) : null;
    const feet = a.feet(), from = pick ? plantReachFrom(feet, a.yaw(), a.posture?.() ?? 'stand') : feet;
    return holdKind(b, { id: a.id, team: a.team, feet, pick, from }, this.sites[a.team], this.actions);
  }

  private beginPlacement(a: BombActor): void {
    const since = this.host.tick();
    this.placing = { by: a.id, team: a.team, since, ends: since + Math.round(PLACEMENT_S * TICK_HZ), feet: a.feet(), yaw: a.yaw(), pistol: a.pistol() };
  }

  /**
   * The placement's end (B194, research 214 §2 "The plant's point"; reading, pending review): `FUN_005c1970`'s
   * ground-placement branch for MPBOMB, once `+0x87c` runs out (D:L476886-476889, D:L477001-477010) -- the ground under
   * the right hand (`bombPlantHand`; the world's column there through `placeGround`, `FUN_005c2430` D:L477211-477249),
   * taken when it lies above the feet (`+0x404`) less `CLAYMORE_RULES.placeDrop` (D:L477005), and the bomb set there
   * (`FUN_005bc730`, whose MPBOMB request carries that point to state 3, D:L473982). Else nothing is set (D:L477020): the
   * placement ends with the bomb still carried. Was: the ground under the feet as the hold committed (`floor`,
   * `BOMB_GROUND_READING`), the second reading research 214 §2 keeps (parity clause 7).
   */
  private plant(): void {
    const p = this.placing!;
    this.placing = null;
    const a = this.host.actor(p.by);
    const feet = a ? a.feet() : p.feet;
    const ground = placeGround(this.host.cast(), bombPlantHand(feet, a ? a.yaw() : p.yaw, a ? a.pistol() : p.pistol));
    if (!ground || !(ground.point[1] > feet[1] - CLAYMORE_RULES.placeDrop)) { this.publish(); return; }
    this.state_ = BOMB_STATE.planted;
    this.pos = [ground.point[0], ground.point[1], ground.point[2]];
    this.carrier = null;
    this.carrierFeet = null;
    this.planter = p.by;
    this.plantingTeam = p.team;
    this.detonateTick = this.host.tick() + Math.round(FUSE_S * TICK_HZ);
    this.holds.clear();
    this.emit({ kind: 'planted', by: p.by, team: p.team, pos: [...this.pos], plantingTeam: p.team });
  }

  private defuse(a: BombActor): void {
    this.state_ = BOMB_STATE.defused;
    this.defuser = a.id;
    this.defuserTeam = a.team;
    this.holds.clear();
    this.emit({ kind: 'defused', by: a.id, team: a.team, pos: [...this.pos], plantingTeam: this.plantingTeam });
  }

  /**
   * The host's fuse (state 5). The room listens: the bases (XR-08) and, BOMB-DAMAGE, the players in MPBOMB's reach
   * (`Room.bombBlast`, `MPBOMB_BLAST_OWNER_READING`; was PF.R32's no player hurt).
   */
  private detonate(): void {
    this.state_ = BOMB_STATE.detonated;
    this.holds.clear();
    this.emit({ kind: 'detonated', by: this.planter, team: this.plantingTeam, pos: [...this.pos], plantingTeam: this.plantingTeam });
  }

  private pickup(a: BombActor): void {
    this.state_ = BOMB_STATE.carried;
    this.carrier = a.id;
    this.pos = a.feet();
    this.carrierFeet = a.feet();
    this.dropWhy = null;                                          // P25: carried, no drop to name
    this.pickupAfterTick = this.host.tick() + Math.round(PICKUP_COOLDOWN_S * TICK_HZ);   // D:L452610
    this.emit({ kind: 'pickedUp', by: a.id, team: a.team, pos: [...this.pos], plantingTeam: null });
  }

  private dropAt(at: V3, by: number, team: Team | null, why: NonNullable<BombEvent['why']>): void {
    this.state_ = BOMB_STATE.ground;
    this.pos = this.floor(at);
    this.carrier = null;
    this.carrierFeet = null;
    this.placing = null;
    this.dropWhy = why;                                           // P25: the drop's cause on the wire (`BombWire.dropWhy`)
    this.pickupAfterTick = this.host.tick() + Math.round(PICKUP_COOLDOWN_S * TICK_HZ);   // FUN_0059dd30 D:L452153
    this.emit({ kind: 'dropped', by, team, pos: [...this.pos], plantingTeam: null, why });
    this.publish();
  }

  /**
   * The ground under `at` (`BOMB_GROUND_READING`): the first surface a charge could rest on (`restsOn`, the placement's
   * accept test: VOLUMETRIC and LIQUID passed, no penetration test since AD-4) from `BOMB_FLOOR_LIFT` over the point
   * down to `FLOOR_SEARCH` under it, else the point itself. The room's own search: the original projects the model
   * (`FUN_0059ddb0`), so the placement's column and selector (`placeGround`) are not taken here.
   */
  private floor(at: V3): V3 {
    const hit = this.host.cast()([at[0], at[1] + BOMB_FLOOR_LIFT, at[2]], [at[0], at[1] - FLOOR_SEARCH, at[2]]).find(restsOn);
    return hit ? [at[0], hit.point[1], at[2]] : [...at];
  }

  /** The hold the wire shows: the placement while it runs, else the oldest hold being counted. */
  private hold(): BombHold | undefined {
    if (this.placing) return { by: this.placing.by, kind: 'place', sinceTick: this.placing.since };
    for (const [by, h] of this.holds) return { by, kind: h.kind, sinceTick: h.since };
    return undefined;
  }

  private emit(e: BombEvent): void {
    for (const l of this.listeners.get(e.kind) ?? []) l(e);
  }

  /** Every page told when the wire changed (a transition, a hold's begin or end); `force` tells it whatever it is. */
  private publish(force = false): void {
    const w = this.wire();
    const key = JSON.stringify(w);
    if (!force && key === this.told) return;
    this.told = key;
    this.host.send(w);
  }
}
