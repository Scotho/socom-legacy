import { CLAYMORE, type KitTable, type Loadout, type WeaponRecord } from '@s2u/scene';
import { KitRounds } from '../../viewer/src/firearms';
import type { MagazineRing } from '../../viewer/src/magazines';
import type { PickupClipName } from '../../viewer/src/mover';
import type { AimFrame } from '../../viewer/src/net/shotCone';
import type { DropWire, KitEquipmentWire, ServerEvent } from '../../viewer/src/net/protocol';
import { launcherKitRounds, pickupKitOf, PICKUP_REACH_READING, PICKUP_SPEED_READING } from '../../viewer/src/net/pickupRules';
import { claimWeapon, dropsOf, firearmsCarried, takeEquipment, transferAmmo, type DropSpec } from './pickups';
import { equipmentSlotsOf, type EquipmentSlots } from '../../viewer/src/equipment';
import type { EquipmentSlotState } from '../../viewer/src/equipmentSlots';
import { heldWeaponModels } from '../../viewer/src/loadout';

/**
 * PF-34 (ruling PF.R54; web research 234 s1-s4): the room's world drops -- the entities, their stable ids, the claims and
 * the bundles walked over -- as a module of its own with its sinks (the room's broadcast, send and refusal tally), so
 * `Room` holds one field and six one-line calls (`kill`, `text`, `step`, `clearAir`, `joinWire`; research 234 s6; NU-4
 * D1 adds the result's `sweep` in `step`, research 317 s5 D1). Pure of the room: it reads and writes a seat's live kit
 * (`loadout`, `records`, `mags`; the cone's record for the slot in the hand) and nothing else -- never the saved pick
 * (`next`), the respawn's kit or the weapon select.
 */

/**
 * How long a drop lies: the round -- no lifetime of its own online (web research 317 R317.6, §2.2): the 60 s timer is
 * laid only offline (`FUN_00541700` D:L408887-408888, D:L408909-408910; the allocators lay the never mark -1.0,
 * D:L409758, D:L409834) and run only offline (`FUN_002aa490` D:L151163-151165 -> `FUN_00542290`). A drop lies until
 * it is taken or swept with the round's result (`sweep`, `DROP_SWEEP_AT_RESULT_READING`); the round's start and the
 * abandon clear the air again (`clear`). [reading] Named `DROP_LIFETIME_PLACEHOLDER` until NU-4 D1 (2026-10-14). Settles:
 * research 317's capture A (a weapon dropped and left, still there at the round's end; HUMAN_TASKS H224).
 */
export const DROP_LIFETIME_READING = 'round' as const;
/**
 * When the round's drops go: 3 s after the round's end state, at the result's sweep (web research 317 R317.8, §3.1) --
 * on the host when its 3.0 s wait ends (`FUN_002a9b30` D:L150617-150626, D:L150629-150668), on a client when the host's
 * game state +0x113 = 4 or 6 arrives (`FUN_002aa490` D:L151127-151131); `FUN_002aa910` clears every pickup
 * (`FUN_00542e50(0)` D:L151241, D:L409867-409914). The bodies stay. The room sweeps once its result is the room's
 * `ENGINE_READ_S` old (`Room.step`, once a result); the page by its own reckoning of the same moment (`NetPage`'s
 * `sweepDrops`). [reading] Settles: research 317's capture C (HUMAN_TASKS H226).
 */
export const DROP_SWEEP_AT_RESULT_READING = '3 s after the end state' as const;
/**
 * A dropper who leaves: his drops stay, claimable, under his id (`from`) -- a drop has no live owner to look up (the
 * claim is the room's, `PICKUP_ROUTE_READING`). The original's routing to a departed owner (`FUN_002ba2c0` resolving an
 * actor that is gone) and any transfer are not read (194 s2 "pickup owner departure/transfer"). Settles: capture B's
 * quitter. [placeholder]
 */
export const DROP_OWNER_DEPARTURE_PLACEHOLDER = 'stays' as const;
/**
 * NU-5 (research 323 §1.5, research 324 §1.4 step 3): when a launcher claim pushes its `Swap rifle`. `FUN_0059f0c0`
 * pushes it with no exchange and family 4 only while `FUN_00589900` answers (D:L458201-458206); that answers 1 with no
 * action on the actor's stack (`FUN_00555170(actor + 0x1c0)` 0, D:L446436-446437), and with one only past further tests
 * (the online byte and `+0x1061`, `+0x1060`'s bit 4 and four knock-down types, `+0x174` and the top's `+0x2b`,
 * D:L446439-446470) whose meaning is not read. The port lays the clip when the mover holds no action, none otherwise --
 * the less likely default: with an action playing `FUN_00589900` still answers 1 (D:L446469) unless one of those tests
 * answers 0 (the review of 7c374ad0a, F4).
 * The exchange's clip has no gate (D:L458208-458211). Settles: those tests read, or capture NU5-5 (a LAW taken while a
 * landing plays). [placeholder]
 */
export const PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER = 'no action on the body' as const;

/**
 * OBF-15, ruling OBF.R9 (the owner, 2026-10-30, "Drop it to the ground"): a death's drops lie on the floor below the
 * feet they fell from -- the room's own floor pick, the walking tick's (`selectFloor(probeGround(...))` from the feet +
 * `probeLiftOf('stand')`, `Walker.slideOrMove`; `FUN_005b5d40` D:L470230-470240, research 86 s6.3), taken only when it
 * is at or under the feet; with no floor there, the drop stays where it fell. **An owner-ruled departure from the
 * original**, not a reading: `FUN_0059f730` places the drop at the weapon's mount on the body (D:L458398-458441) and no
 * per-tick pass over the pickups settles it (the lifetime `FUN_00542290` alone), so the original's, as read, stays in
 * the air after a death in a jump (web research 234 s7, `DROP_PLACEMENT_PLACEHOLDER`). A standing death's feet are on
 * the floor already: unchanged.
 */
export const DROP_SETTLE_ADAPTATION = 'the floor below, else where it fell' as const;

type V3 = [number, number, number];

/** A seat as the drops need it (the room's `Player`, structurally). */
export interface DropSeat {
  readonly id: number;
  alive: boolean;
  loadout: Loadout;
  records: readonly [WeaponRecord, WeaponRecord];
  mags: [MagazineRing, MagazineRing];
  /** The kit's launcher-round rings (`KitRounds`); a launcher claim gives it the claimed round (NU-5 L1). */
  rounds: KitRounds;
  /** The pouch: the throwables and charges left, by name (`pouchOf`): the launcher's slot test reads it (NU-5 L1). */
  readonly grenades: Readonly<Record<string, number>>;
  /** Independent throwable/charge rings, when the seat supports slot metadata (research 361 §3). */
  equipmentSlots?: EquipmentSlots;
  /**
   * LATER 1129 (reading, pending review): the kit holds the Detonator (0xc1). `FUN_005c74e0` (D:L480156-480202) adds it
   * whenever a claymore (0x99) is in the kit -- after a take's pour (`FUN_005ba3d0` D:L472771) and at the kit's re-init
   * (`FUN_005c7840` D:L480388; its direct callers the spawn's `FUN_00599b60` D:L455675 and `FUN_00553e60` D:L419394) -- and
   * nothing removes it, so an install over a spent claymore keeps it. Absent: not tracked.
   */
  detonator?: boolean;
  /** The firearm in the hand. */
  readonly weapon: 0 | 1;
  /** The turret held (MAP-10b), or null. */
  readonly mounted: number | null;
  readonly cone: { frame(seq: number): AimFrame | undefined; setWeapon(record: WeaponRecord): void };
  readonly sim: {
    readonly seq: number;
    readonly walker: {
      readonly state: { x: number; y: number; z: number; yaw: number }; readonly action: { readonly name: string } | null;
      /** SEGMENT-BODY part 4 (F1): the kit's firearm models, the weapon line's length (`heldWeaponModels`). */
      heldModels: { rifle: string | null; pistol: string | null };
    };
  };
}

/** Where the drops tell what happens: every page, one page, and the room's refusal tally (`dropped('pickup', why)`). */
export interface DropSinks {
  broadcast(ev: ServerEvent): void;
  send(id: number, ev: ServerEvent): void;
  refused(why: string, id: number): void;
  /**
   * NU-5 X1 and research 324 P2: the pick-up's `Swap rifle` on seat `id`'s mover from the claim's command `seq` + 1 --
   * `swapRifleExchange` after an exchange laid a weapon, `swapRifleClaim` after a launcher claim (`room.ts`: kept on
   * `MoverSim.launcherClips`, as the launcher's raise is).
   */
  swapRifle(id: number, seq: number, clip: PickupClipName): void;
}

export interface WorldDropsOptions {
  /** The kit table the seats' records are read from (the room's `kits?.table`). */
  table(): KitTable | null;
  /** How many commands behind the seat's latest a claim may name (the room's `FIRE_ARRIVAL_JITTER_TICKS`). */
  staleTicks: number;
  /**
   * OBF-15 (`DROP_SETTLE_ADAPTATION`): the room's floor pick under feet at (x, y, z) -- its height, or null with no
   * floor there. Absent, the drops lie at the feet.
   */
  floor?(x: number, y: number, z: number): number | null;
}

/** Why a claim was refused (the room's tally, `pickup: <why>`). */
export type PickupRefusal = 'not alive' | 'over' | 'mounted' | 'stale' | 'gone' | 'taken' | 'kind' | 'reach' | 'speed'
  | 'nofire' | 'swapping' | 'binoculars' | 'family';

const feetOf = (s: DropSeat): V3 => { const w = s.sim.walker.state; return [w.x, w.y, w.z]; };
/**
 * R142: the kit's round rings for a loadout an equipment take installed into -- each round the new loadout still holds
 * keeping its rounds (by its id, `KitRounds.ring`'s redirect, as `launcherKitRounds` keeps them), the overwritten slot's
 * gone; never a fill.
 */
function roundsKept(old: KitRounds, table: KitTable | null, loadout: Loadout): KitRounds {
  const next = new KitRounds(table, loadout);
  for (const h of old.held()) {
    const was = old.ring(h.id), now = next.ring(h.id);
    if (was && now) now.restore(was.state());
  }
  return next;
}
const dist2 = (a: readonly number[], b: readonly number[]): number => (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
const REACH2 = PICKUP_REACH_READING * PICKUP_REACH_READING;
const SPEED2 = PICKUP_SPEED_READING * PICKUP_SPEED_READING;

export class WorldDrops {
  private readonly lying: DropWire[] = [];
  /** The next `did`: from 0 at each cleared air, never given twice within it (`PROJECTILE_ID_READING`'s rule). */
  private serial = 0;
  /**
   * The tick's claims, resolved in `step` by the lower seat id (`DROP_SAME_TICK_READING`), one seat's in seq order; LATER
   * 135: one a command a seat (`claim`), `frame` the claim's frame as of its decision (its command's, or a drop's body),
   * absent looked up at the tick.
   */
  private readonly claims: { id: number; seq: number; did: number; frame?: AimFrame }[] = [];

  constructor(private readonly sinks: DropSinks, private readonly opts: WorldDropsOptions) {}

  /** The drops lying now, each the `drop` event's body (the joiner's `welcome.join.drops`). */
  wire(): DropWire[] {
    return this.lying.map((d) => ({ ...d, at: [...d.at] as V3, ...(d.entries ? { entries: d.entries.map((e) => ({ ...e })) } : {}) }));
  }

  /** The air cleared (a round's start, the abandon: `DROP_LIFETIME_READING`): no drop, no claim, the ids from 0. */
  clear(): void {
    this.lying.length = 0;
    this.claims.length = 0;
    this.serial = 0;
  }

  /**
   * NU-4 D1: the result's sweep (`DROP_SWEEP_AT_RESULT_READING`; `FUN_002aa910`'s `FUN_00542e50(0)`, D:L151241): every
   * drop and claim gone, nothing told (each page sweeps its own at the same moment). The serial is kept, so no `did` is
   * given twice within the round; the round's start (`clear`) restarts it.
   */
  sweep(): void {
    this.lying.length = 0;
    this.claims.length = 0;
  }

  /**
   * A classic death (the room calls it from `kill`, once a death: the original's edge, `FUN_00547af0` D:L413052 ->
   * `FUN_00547350` D:L412694-412696): the body's drops (`dropsOf`) laid and told, its rings cleared -- its throwable and
   * charge rings among them since R142 (`BUNDLE_SLOTS_PLACEHOLDER`).
   * OBF-15: at the floor below the feet (`DROP_SETTLE_ADAPTATION`, OBF.R9), a death in the air's included.
   */
  death(victim: DropSeat): void {
    const s = victim.sim.walker.state;
    const below = this.opts.floor?.(s.x, s.y, s.z) ?? null;      // OBF-15: DROP_SETTLE_ADAPTATION (OBF.R9)
    const y = below !== null && below <= s.y ? below : s.y;
    for (const d of dropsOf({
      id: victim.id, loadout: victim.loadout, records: victim.records, mags: victim.mags, rounds: victim.rounds, feet: [s.x, y, s.z], yaw: s.yaw,
      table: this.opts.table(), ...(victim.equipmentSlots ? { equipmentSlots: victim.equipmentSlots } : {}),
    })) this.lay(d);
  }

  /**
   * A `pickup` event: kept for the tick's resolution. LATER 135: one claim a command a seat -- a later one for the same
   * command replaces it (the page sends at most one a command: a bound, so a modified page cannot claim several drops on
   * one command); claims for different commands are all kept, each judged in turn. `frame`: the claim's frame as of its
   * decision (`Room.decide`: its command's, or for a command a dropped backlog never ran the body the drop leaves), on
   * which `judge` reads it; absent, as before (the seat's latest command and the cone at the tick).
   */
  claim(id: number, seq: number, did: number, frame?: AimFrame): void {
    const at = this.claims.findIndex((c) => c.id === id && c.seq === seq);
    if (at >= 0) this.claims.splice(at, 1);
    this.claims.push({ id, seq, did, ...(frame ? { frame } : {}) });
  }

  /**
   * The tick's drops, after the seats' commands ran: the claims by the lower seat id, then each living seat's walk over
   * the bundles in reach. `live`: the round in play (`Room.inRound`); outside it a claim is refused `'over'` and no
   * bundle is walked over.
   */
  step(seats: ReadonlyMap<number, DropSeat>, live: boolean): void {
    // By the lower seat id (the contest), one seat's claims in seq order (LATER 135).
    for (const c of this.claims.splice(0).sort((a, b) => a.id - b.id || a.seq - b.seq)) {
      const seat = seats.get(c.id);
      if (!seat) continue;
      const why = this.judge(seat, c.seq, c.did, live, c.frame);
      if (why) this.sinks.refused(why, c.id);
      else this.take(seat, this.lying.findIndex((d) => d.did === c.did), c.seq);
    }
    if (!live) return;
    for (const seat of [...seats.values()].sort((a, b) => a.id - b.id)) if (seat.alive) this.walk(seat);
  }

  /**
   * A weapon claim's gates, in order (`PICKUP_MOTION_GATE_READING`, `PICKUP_REACH_READING`, `PICKUP_SPEED_READING`): the
   * seat alive and the round in play; not mounted; the claim's frame -- LATER 135: the one it was decided on, while it is
   * still the seat's own cone's (a respawn's new cone, or a copy, is not: 'stale'), its stale bound judged at the decision;
   * a claim with none, the command named within `staleTicks` of the seat's latest and still in the cone's frames; the drop
   * lying (`'taken'` for an id given this round and gone, `'gone'` for one never given);
   * a weapon, not a bundle; the frame's feet within the reach and its velocity under the speed; the frame may fire, is
   * not swapping and not behind the binoculars; the weapon's family a firearm slot's.
   */
  private judge(seat: DropSeat, seq: number, did: number, live: boolean, decided?: AimFrame): PickupRefusal | null {
    if (!seat.alive) return 'not alive';
    if (!live) return 'over';
    // LATER 135: a claim decided at its command carries that command's frame (or the drop's body), its stale bound judged
    // then; one with none is judged as before, against the seat's latest command at the tick's end.
    // The fresh review's F2: a decided frame counts only while it is this seat's cone's -- a cone replaced since (a respawn,
    // `spawn`) holds no such frame, so a dead body's claim is never judged on its pre-death frame after a respawn.
    const frame = decided
      ? (seat.cone.frame(decided.seq) === decided ? decided : undefined)
      : (seat.sim.seq - seq > this.opts.staleTicks ? undefined : seat.cone.frame(seq));
    if (!frame) return 'stale';
    // LATER 204 (ASK_AT_COMMAND_ADAPTATION, the port's own: the original judges a pickup at its press, with no command to
    // name): the mount its command ran under (`AimFrame.turret`, as LATER 172's `mountedAt`), not the seat's present one.
    // For a seq the room has no frame of, the claim rides `p.cone.latest()` (`room.ts` `decide`): the newest run command's
    // mount -- where `mountedAt` falls back to the present `mounted`. After the stale check: a claim both stale and mounted
    // reports 'stale' (was 'mounted').
    if ((frame.turret ?? null) !== null) return 'mounted';
    const drop = this.lying.find((d) => d.did === did);
    if (!drop) return did >= 0 && did < this.serial ? 'taken' : 'gone';
    if (drop.kind !== 'weapon') return 'kind';
    if (dist2(frame.feet, drop.at) > REACH2) return 'reach';
    if (frame.velocity[0] ** 2 + frame.velocity[1] ** 2 + frame.velocity[2] ** 2 > SPEED2) return 'speed';
    if (!frame.fire) return 'nofire';
    if (frame.swapping) return 'swapping';
    if (frame.binoculars) return 'binoculars';
    return null;
  }

  /**
   * An accepted weapon claim on the claim's command `seq`, applied once: the live kit changed, the old slot dropped, every
   * page told. NU-5 L1: a rocket launcher into an equipment slot, its round beside it (`claimWeapon`; the seat's
   * `KitRounds` by `launcherKitRounds`), the taker's `kit` naming no firearm slot and writing no ring (`filled` empty).
   * NU-5 X1 / research 324 P2: `Swap rifle` on the taker's mover from `seq` + 1 (`DropSinks.swapRifle`) -- after an
   * exchange laid a weapon (`FUN_00588bc0` D:L458209-458211), or after a launcher claim
   * (`PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER`, D:L458201-458206); none for a claim into an empty slot.
   */
  private take(seat: DropSeat, at: number, seq: number): void {
    const drop = this.lying[at]!;
    const s = seat.sim.walker.state, table = this.opts.table();
    const kit = pickupKitOf(seat.loadout, table, (slot) => seat.rounds.held()[slot]?.rounds ?? 0, seat.grenades, seat.equipmentSlots?.state());
    const got = claimWeapon(drop, { id: seat.id, loadout: seat.loadout, records: seat.records, mags: seat.mags, feet: feetOf(seat), yaw: s.yaw, kit }, table);
    if ('refused' in got) { this.sinks.refused(got.refused, seat.id); return; }
    this.lying.splice(at, 1);
    seat.loadout = got.loadout;
    seat.records = got.records;
    seat.sim.walker.heldModels = heldWeaponModels(table, got.loadout);   // SEGMENT-BODY part 4 (F1): the weapon line's length
    if (got.slot !== null && got.ring) {
      seat.mags[got.slot] = got.ring;
      if (seat.weapon === got.slot) seat.cone.setWeapon(got.records[got.slot]);   // PICKUP_HAND_READING: the hand kept
    }
    if (got.launcher) {
      seat.rounds = launcherKitRounds(seat.rounds, table, got.loadout, got.loadout[got.launcher.round]!, got.launcher.rounds);
      if (seat.equipmentSlots) {
        const next = equipmentSlotsOf(got.loadout, table);
        next.restoreLegacy({});
        next.restore(seat.equipmentSlots.state().filter(s => next.kind(s.slot) === s.kind));
        seat.equipmentSlots = next;
      }
    }
    this.sinks.broadcast({ type: 'taken', did: drop.did, by: seat.id, kit: [...got.loadout] });
    for (const d of got.replaced) this.lay(d);
    if (got.replaced.some((d) => d.kind === 'weapon')) this.sinks.swapRifle(seat.id, seq, 'swapRifleExchange');
    else if (got.launcher && seat.sim.walker.action === null) this.sinks.swapRifle(seat.id, seq, 'swapRifleClaim');
    this.tellKit(seat, got.slot, got.launcher ? [[], []] : undefined);
  }

  /**
   * A living seat over the bundles within reach of its feet (`FUN_00593da0` D:L452526-452533): the equipment entries
   * taken by `takeEquipment` (R142, `PICKUP_EQUIPMENT_TAKE_READING`: each granted one removed whole), the firearm entries
   * by `transferAmmo`; told.
   */
  private walk(seat: DropSeat): void {
    const feet = feetOf(seat);
    for (let i = 0; i < this.lying.length; i++) {
      const d = this.lying[i]!;
      if (d.kind !== 'ammo' || dist2(feet, d.at) > REACH2) continue;
      // A slot carries a firearm only with an item the kit table has a record for: an empty slot, or one holding the
      // Designator or the M203 item, holds the baked record (`NO_FIREARM_RECORD_PLACEHOLDER`) and takes no ammunition.
      // r0004's skip reads each record's own NumMags (PICKUP_POUR_READING): the kit table's, by the slot's item, not the
      // 2X-doubled count.
      const table = this.opts.table();
      const entries = d.entries ?? [];
      // LATER 1129: the rings before the take (a copy: `takeEquipment` pours into the rings' own arrays), for the `kit`.
      const ringsBefore = seat.equipmentSlots?.state().map((r) => ({ ...r, rounds: [...r.rounds] })) ?? [];
      const eq = seat.equipmentSlots
        ? takeEquipment(entries, { loadout: seat.loadout, equipmentSlots: seat.equipmentSlots, roundsAt: (slot) => seat.rounds.held()[slot]?.rounds ?? 0 }, table)
        : null;
      const took = eq?.granted.some(Boolean) ?? false;
      if (eq && eq.installed.length) {
        // The kit's round rings after an install over one (`FUN_005bc410` changes the installed slot only).
        seat.rounds = roundsKept(seat.rounds, table, eq.loadout);
        seat.loadout = eq.loadout;
      }
      const carried = firearmsCarried(seat.loadout, table);
      const own = ([0, 1] as const).map((s) => table?.records.get(seat.loadout[s])?.mags ?? seat.records[s].mags) as [number, number];
      const out = transferAmmo(entries.filter((_, k) => !eq?.granted[k]), seat.records, seat.mags, carried, own);
      if (!out.moved && !took) continue;
      // LATER 1129: the take's pour ends in FUN_005c74e0 (D:L472771): a claymore now in the kit adds the Detonator.
      if (took && EQUIPMENT_SLOT_IDS.some((s) => seat.loadout[s] === CLAYMORE.id)) seat.detonator = true;
      this.tellKit(seat, null, out.filled, out.added, took ? equipmentTold(ringsBefore, seat.equipmentSlots!.state(), eq!.installed) : undefined);
      if (out.residual.length) {
        d.entries = out.residual;
        this.sinks.broadcast({ type: 'drop', ...this.wireOf(d) });
      } else {
        this.lying.splice(i--, 1);
        this.sinks.broadcast({ type: 'taken', did: d.did, by: seat.id });
      }
    }
  }

  private lay(spec: DropSpec): void {
    const d: DropWire = { did: this.serial++, ...spec };
    this.lying.push(d);
    this.sinks.broadcast({ type: 'drop', ...this.wireOf(d) });
  }

  private wireOf(d: DropWire): DropWire {
    return { did: d.did, kind: d.kind, ...(d.item !== undefined ? { item: d.item } : {}), ...(d.entries ? { entries: d.entries.map((e) => ({ ...e })) } : {}), at: [...d.at] as V3, yaw: d.yaw, from: d.from };
  }

  private tellKit(seat: DropSeat, slot: 0 | 1 | null, filled?: [number[], number[]], added?: [number[], number[]], equipment?: KitEquipmentWire[]): void {
    this.sinks.send(seat.id, {
      type: 'kit', loadout: [...seat.loadout], ...(slot !== null ? { slot } : {}), rounds: [seat.mags[0].state().slots, seat.mags[1].state().slots],
      ...(filled ? { filled } : {}), ...(added ? { added } : {}),
      ...(equipment ? { equipment } : {}), ...(seat.detonator ? { detonator: true as const } : {}),   // only ever added (FUN_005c74e0)
    });
  }
}

/**
 * DETONATOR_KEPT_READING (LATER 1129; reading, pending review; research 85 §9.7.1, §12.1): `FUN_005c74e0`
 * (D:L480156-480202) adds the Detonator (0xc1) when the owner's list (`+0x830` -> `+0x6c4`) holds a claymore and never
 * removes it, so the kit keeps it until the next kit is built (`DropSeat.detonator`, the room's `Player.detonator`).
 * Open: whether that list is the character's template or the live kit. The take's add (a claymore picked up gives the
 * Detonator) rests on the live-kit reading: were it the template, a taker who spawned without a claymore would get no
 * Detonator from one he picks up (the review's F2).
 */
export const DETONATOR_KEPT_READING = 'added with a claymore in the kit, kept until the next kit' as const;

const EQUIPMENT_SLOT_IDS = [2, 3, 4] as const;

/**
 * LATER 1129: the slots a take wrote, for the taker's `kit` -- an installed slot whole, a topped-up one with the amount
 * each magazine changed by (`added`); a slot the take left as it was is not named.
 */
function equipmentTold(before: readonly EquipmentSlotState[], after: readonly EquipmentSlotState[], installed: readonly number[]): KitEquipmentWire[] {
  const out: KitEquipmentWire[] = [];
  for (const a of after) {
    const state = { slot: a.slot, kind: a.kind, rounds: [...a.rounds], current: a.current };
    if (installed.includes(a.slot)) { out.push(state); continue; }
    const b = before.find((x) => x.slot === a.slot && x.kind === a.kind);
    if (!b) { out.push(state); continue; }
    const added = a.rounds.map((r, i) => r - (b.rounds[i] ?? 0));
    if (added.some((n) => n !== 0)) out.push({ ...state, added });
  }
  return out;
}
