import { Group, Vector3 } from 'three';
import { segmentHit, type Grid, type KitRound, type KitTable, type Loadout, type V3, type WeaponPoint } from '@s2u/scene';
import { muzzlePoint } from './heldItem';
import { EQUIPMENT_SLOTS, equipmentKind, launcherRaiseSeconds, rocketLaunch, rocketRoundOf, slotSelectable, wadingDepth, type LauncherFrom } from './equipment';
import type { KitRounds } from './firearms';
import type { MagazineRing } from './magazines';
import type { PlaySnapshot } from './walk';

/**
 * The LAW (the AT-4, id 145) and the RPG-7 (146) on the page (web sprint 4, M7; research 94 §C4, R94.6/R94.8/R94.9):
 *
 * - **Equipment, SlotCost 2** (`FUN_0023fef0` L89160-89200): the launcher takes an equipment slot and its round the next
 *   (the LAW HEAT, 185; the RPG, 186). `3`/`4`/`5` on the launcher's slot raise it -- `FUN_005bdc30` lets a rocket
 *   launcher up only while the kit holds a round it fires (`FUN_005c45c0`) -- and never on the round's (a round is a fire
 *   mode of its carrier, `FUN_003c5d20`).
 * - **The fire** (`FUN_005c6600` redirects the carrier's slot to its round's; `FUN_005c09f0` at the round's `FireWait`,
 *   3 s): the rocket leaves the launcher's `firepoint` (the held model's muzzle; else the eye) straight at the point
 *   under the reticle -- no loft, `FUN_005bf8a0` lofts only the 40 mm carriers -- at its `Muzzle_Velocity`
 *   (`ROCKET_LAUNCH_SPEED_READING`), then accelerates without a fall (`./grenade`'s flight of it, `stepGrenade`); each
 *   shot fires the `Backblast` backwards from the muzzle (`FUN_003d2d70`, the `backblast` event; the room deals it).
 * - **One round at a time**: the LAW HEAT's one shot; the RPG's after-shot lock (`ReloadDelayAfterShot` 1 s) walks to
 *   the next kit slot holding RPG rounds (`FUN_005c3000`), inside the round's `FireWait` -- so a rocket every 3 s while
 *   rounds last (`KitRounds`, one ring a round slot).
 * - **Drawn** (research 94 §C8): the launcher's model on the right hand's held node while it is up (`heldNode`), on the
 *   `launcher` node on `spinehi` while carried (`carryNode`; its pose there is the clips' `launcher` track, not probed:
 *   `HOLSTER_TRACK_READING` -- hung at the node's origin).
 * - **The HUD box** (research 94 §C9): the launcher's `IconTextureName` (`AT4_icon.tif`, `RPG_icon.tif`), the round's
 *   in the fire-mode cell (`firemode_AT4.tif`, `firemode_RPG.tif`, `FUN_00237b40`), the rounds the kit holds.
 */

export interface RocketSource {
  snapshot(): PlaySnapshot | null;
  grid(): Grid | null;
  /** The eye and the far end of the aim (`WalkMode.fireAim`): the point under the reticle is found along it. */
  aim(): { eye: V3; far: V3 } | null;
  /** The launcher's `firepoint` in the world (the held model's muzzle), null without a posed model: the eye then. */
  muzzle?(): V3 | null;
  /** The right hand's held node (`Play.heldNode`): the launcher rides it while up. */
  heldNode?(): Group | null;
  /** The `launcher` node on `spinehi` (`Play.launcherNode`): the launcher rides it while carried. */
  carryNode?(): Group | null;
  /** A launcher's model by `ModelName` (`WorldView.held`), null when the map has none. */
  model?(name: string): Group | null;
  /** A launcher model's named points (`LoadedMap.weapons`): its `firepoint`, where the rocket leaves. */
  points?(name: string): readonly WeaponPoint[];
  /**
   * PF-37 (research 236 s3): how deep the SEAL wades, for the take-up's `LAUNCHER_BODY_READING` (`FUN_005857e0`).
   * Absent: `wadingDepth(grid(), snapshot().feet)`, the room's own reading of the same depth (0 without either).
   */
  wadingDepth?(): number;
}

/** A rocket leaving: its round, the launch, the backblast. */
export interface RocketLaunch {
  launcher: number;
  round: { id: number; name: string };
  record: KitRound['record'];
  from: V3;
  dir: V3;
  velocity: V3;
  /** The point under the reticle it was aimed at. */
  to: V3;
  /** The rounds the kit holds for it after this one. */
  rounds: number;
  /** LATER 503: the launch's id in the launcher's journal (`RocketLauncher.refund`), page-local, never on the wire. */
  shot: number;
}

/** LATER 503: the launches a stale may yet give back -- a page's bookkeeping, no game value (rockets leave 3 s apart). */
const ROCKET_JOURNAL = 8;

export interface RocketEvents {
  /**
   * The launcher up (true) or away (false): the rifle stowed while it is up (`Play.setRifleStowed`). PAR-83: `by` 'stick',
   * put away by the stick's lower (`lower`), which the room lays from the command's own stick -- no event for it.
   */
  equip: (on: boolean, launcher: number | null, by?: 'stick') => void;
  launch: (e: RocketLaunch) => void;
  /** The backblast fired (`FUN_003d2d70`): from the muzzle, backwards. */
  backblast: (e: { pos: V3; dir: V3 }) => void;
}

export interface RocketStats {
  held: number | null;
  carried: number | null;
  rounds: number;
  wait: number;
  launched: number;
  lastLaunch: { from: V3; velocity: V3; to: V3; round: string } | null;
  backblasts: number;
  lastBackblast: { pos: V3; dir: V3 } | null;
}

type Listeners = { [K in keyof RocketEvents]: RocketEvents[K][] };

export class RocketLauncher {
  private table: KitTable | null = null;
  private loadout: Loadout | null = null;
  private rounds: KitRounds | null = null;
  private held_: number | null = null;
  private wait = 0;
  private launched = 0;
  private backblasts = 0;
  private lastLaunch: RocketStats['lastLaunch'] = null;
  private lastBackblast: RocketStats['lastBackblast'] = null;
  private drawn: { node: Group; object: Group } | null = null;
  private readonly listeners: Listeners = { equip: [], launch: [], backblast: [] };
  /** LATER 503: the launches the room may yet refuse, oldest first, each with its ring as it stood before (`refund`). */
  private journal: { shot: number; ring: MagazineRing; before: { slots: number[]; current: number }; wait: number; waitSerial: number }[] = [];
  private shotSerial = 0;
  /** LATER 511's review F1: bumped by every writer of `wait` (a kit, a raise, a drop, a launch) -- `refund`'s guard. */
  private waitSerial = 0;

  constructor(private readonly source: RocketSource) {}

  on<K extends keyof RocketEvents>(kind: K, fn: RocketEvents[K]): () => void {
    (this.listeners[kind] as RocketEvents[K][]).push(fn);
    return () => {
      const list = this.listeners[kind] as RocketEvents[K][];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof RocketEvents>(kind: K, ...args: Parameters<RocketEvents[K]>): void {
    for (const fn of this.listeners[kind] as ((...a: typeof args) => void)[]) fn(...args);
  }

  /** A spawn's kit: the tables, the loadout and its round slots (the page's `KitRounds`, shared with the fire). */
  setKit(table: KitTable | null, loadout: Loadout, rounds: KitRounds): void {
    this.table = table;
    this.loadout = loadout;
    this.rounds = rounds;
    this.wait = 0;
    this.waitSerial++;
    this.journal = [];                                           // LATER 503: a stale launch cannot refund the new kit
    if (this.held_ !== null) { this.held_ = null; this.emit('equip', false, null); }
    this.undraw();
  }

  /** The launcher in the kit's equipment slots (the first), or null. */
  carried(): number | null {
    for (const s of EQUIPMENT_SLOTS) { const id = this.loadout?.[s]; if (id !== undefined && equipmentKind(id) === 'launcher') return id; }
    return null;
  }

  /** The rounds the kit holds for a launcher (its round's slots, `KitRounds`). */
  roundsFor(launcher: number): number {
    const round = rocketRoundOf(launcher);
    if (round === null || !this.rounds) return 0;
    return this.rounds.held().filter((h) => h.id === round).reduce((n, h) => n + h.rounds, 0);
  }

  /**
   * The kit's equipment slot `slot` (1-3) up when it holds a rocket launcher that may be taken (`slotSelectable`):
   * true when the launcher is (or already was) up; false for any other slot, which leaves the hand as it was. `from`:
   * the firearm in hand it is raised from, whose clip it plays (`launcherRaiseSeconds`, PF-21); the rifle by default.
   */
  selectSlot(slot: number, from: LauncherFrom = 0): boolean {
    const at: number | undefined = EQUIPMENT_SLOTS[slot - 1];
    const id = at === undefined ? undefined : this.loadout?.[at];
    if (id === undefined || equipmentKind(id) !== 'launcher') return false;
    // PF-37: the depth gates the take-up only -- a launcher already up is not lowered by the water.
    if (!slotSelectable(id, { claymoresDown: 0, roundsFor: (l) => this.roundsFor(l), wadingDepth: () => (this.held_ === id ? 0 : this.wadingDepth()) })) return false;
    if (this.held_ === id) return true;
    this.held_ = id;
    this.wait = launcherRaiseSeconds(from);         // up before the first rocket (the room holds it to the same)
    this.waitSerial++;
    this.emit('equip', true, id);
    return true;
  }

  /**
   * PF-37: the SEAL's wading depth -- the source's hook, else the water over its feet (`wadingDepth`), else 0. The one
   * depth both page gates read: `selectSlot` and the R2 inventory's `SlotContext` (`main.ts`, held: research 236 s4).
   */
  wadingDepth(): number {
    if (this.source.wadingDepth) return this.source.wadingDepth();
    const grid = this.source.grid(), snap = this.source.snapshot();
    return grid && snap ? wadingDepth(grid, snap.feet) : 0;
  }

  /**
   * The launcher put away (the firearm or a throwable taken up). PAR-83: `by` 'stick', by the stick's lower
   * (`./walk` `WalkMode.onLauncherStickLower`, `FUN_00550ef0` D:L418263-418278), told with the `equip` it emits.
   */
  lower(by?: 'stick'): void {
    if (this.held_ === null) return;
    this.held_ = null;
    if (by === undefined) this.emit('equip', false, null);
    else this.emit('equip', false, null, by);
  }

  /**
   * OT.R59 (`RECONNECT_HELD_LAUNCHER_ADAPTATION`, server `room.ts`): the launcher let go at once with no `equip` -- a
   * resumed seat's, which the room has already lowered: no event to the room, no lower clip, no firearm wait.
   */
  drop(): void {
    if (this.held_ === null) return;
    this.held_ = null;
    this.wait = 0;
    this.waitSerial++;
    this.undraw();
  }

  held(): number | null { return this.held_; }
  up(): boolean { return this.held_ !== null; }

  /** The HUD box's icon: the launcher's `IconTextureName`, lower case; null while none is up. */
  icon(): string | null {
    return this.held_ === null ? null : this.table?.arsenal.items.get(this.held_)?.icon?.toLowerCase() ?? null;
  }

  /** The fire-mode cell's icon: the round's (`FUN_00237b40`: `firemode_AT4.tif`); null while none is up. */
  roundIcon(): string | null {
    const round = this.held_ === null ? null : rocketRoundOf(this.held_);
    return round === null ? null : this.table?.rounds.get(round)?.icon ?? null;
  }

  /**
   * LATER 503 (the network's bookkeeping; the original has no wire): a rocket the room refused (`stale`, request 'throw':
   * `decide`'s stale bound, the mount's, `launchRocket`'s NoFire) never left the room's kit, so its round comes back to
   * the page's -- the ring put back as it stood before the launch and any later launch from it replayed, the firearm's
   * `Fire.refundRound` model; once a shot, false for one not in the journal (refunded, aged out, or a kit since). LATER
   * 511 (1): its wait back too (the round's `FireWait`, which the room's `rocketWaitUntil` never took for it) when the
   * wait is still the one its launch set (`waitSerial` unchanged: no later launch, raise, drop or kit since -- their wait
   * is their own; the review's F1).
   */
  refund(shot: number): boolean {
    const at = this.journal.findIndex((e) => e.shot === shot);
    if (at < 0) return false;
    const { ring, before, wait, waitSerial } = this.journal[at]!;
    if (waitSerial === this.waitSerial) this.wait = wait;
    this.journal.splice(at, 1);
    ring.restore(before);
    for (const e of this.journal.slice(at)) {
      if (e.ring !== ring) continue;
      e.before = ring.state();
      ring.fire();
    }
    return true;
  }

  /** The rounds the kit holds for the launcher up (the HUD box's count). */
  count(): number { return this.held_ === null ? 0 : this.roundsFor(this.held_); }

  /** The trigger with the launcher up: a rocket, when one is left and the round's `FireWait` has run. */
  pull(): RocketLaunch | null {
    const id = this.held_;
    if (id === null || this.wait > 0 || !this.source.snapshot()) return null;
    const roundId = rocketRoundOf(id);
    const round = roundId === null ? undefined : this.table?.rounds.get(roundId);
    const ring = roundId === null ? null : this.rounds?.ring(roundId) ?? null;
    const aim = this.source.aim();
    if (!round || !ring || ring.rounds() <= 0 || !aim || roundId === null) return null;
    // The point under the reticle: the eye's ray to the hull (`segmentHit`), else its far end.
    const grid = this.source.grid();
    const seen = grid ? segmentHit(grid, aim.eye, aim.far) : null;
    const to: V3 = seen ? [seen.point[0], seen.point[1], seen.point[2]] : [...aim.far];
    const from: V3 = [...(this.source.muzzle?.() ?? this.firepoint() ?? aim.eye)];
    const out = rocketLaunch(round.record, from, to);
    const shot = ++this.shotSerial;                              // LATER 503: its ring read before it leaves, journalled after
    const waitBefore = this.wait, before = ring.state();
    ring.fire();
    // The round's FireWait (`kit+0x8b8`), which holds its after-shot feed (`ReloadDelayAfterShot` 1 s) inside it.
    this.wait = Math.max(round.fireWait, round.reloadAfterShot ? round.reloadDelayAfterShot : 0);
    this.waitSerial++;
    this.journal.push({ shot, ring, before, wait: waitBefore, waitSerial: this.waitSerial });
    if (this.journal.length > ROCKET_JOURNAL) this.journal.shift();
    this.launched++;
    const e: RocketLaunch = {
      launcher: id, round: { id: roundId, name: round.record.name }, record: round.record, from, dir: out.dir, velocity: out.velocity, to,
      rounds: this.roundsFor(id), shot,
    };
    this.lastLaunch = { from, velocity: out.velocity, to, round: round.record.name };
    this.emit('launch', e);
    if (round.record.hasBackblast) {
      this.backblasts++;
      this.lastBackblast = { pos: out.backblast.pos, dir: out.backblast.dir };
      this.emit('backblast', out.backblast);
    }
    return e;
  }

  /** One frame: the rate's wait, and the launcher drawn in the hand or carried. */
  update(dt: number): void {
    this.wait = Math.max(0, this.wait - dt);
    this.draw();
  }

  stats(): RocketStats {
    return {
      held: this.held_, carried: this.carried(), rounds: this.held_ === null ? this.roundsFor(this.carried() ?? -1) : this.count(),
      wait: this.wait, launched: this.launched, lastLaunch: this.lastLaunch && { ...this.lastLaunch },
      backblasts: this.backblasts, lastBackblast: this.lastBackblast && { ...this.lastBackblast },
    };
  }

  /** The launcher's model: on the hand's node while up, on `spinehi`'s `launcher` node while carried. */
  private draw(): void {
    const id = this.held_ ?? this.carried();
    const name = id === null ? null : this.table?.arsenal.items.get(id)?.model ?? null;
    const node = id === null ? null : this.held_ !== null ? this.source.heldNode?.() ?? null : this.source.carryNode?.() ?? null;
    if (!name || !node) { this.undraw(); return; }
    if (this.drawn && this.drawn.node === node && this.drawn.object.name === name) return;
    this.undraw();
    const template = this.source.model?.(name) ?? null;
    if (!template) return;
    const object = template.clone();
    object.name = name;
    node.add(object);
    this.drawn = { node, object };
  }

  /** The launcher model's `firepoint` in the world, through its node on the hand; null when it is not drawn up. */
  private firepoint(): V3 | null {
    const d = this.drawn;
    if (!d || this.held_ === null) return null;
    const p = muzzlePoint(this.source.points?.(d.object.name) ?? []);
    if (!p) return null;
    d.object.updateWorldMatrix(true, false);
    const v = new Vector3(p[0], p[1], p[2]).applyMatrix4(d.object.matrixWorld);
    return [v.x, v.y, v.z];
  }

  private undraw(): void {
    this.drawn?.object.removeFromParent();
    this.drawn = null;
  }
}
