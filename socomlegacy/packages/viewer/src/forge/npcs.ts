import { segmentHit } from '@s2u/scene';
import { aimedClaim, BOT_PITCH_STEP_DEG, BOT_YAW_STEP_DEG, lookStep, muzzleOf, torsoPoint } from '../net/botAim';
import { NetClient, type NetWalk } from '../net/client';
import { quantiseCommand } from '../net/codec';
import type { V3 } from '../net/hitVolumes';
import { TEAM_SIZE } from '../net/lobby';
import type { LoopbackMatch } from '../net/loopback';
import { aimPitchLimitsOf } from '../net/lookGate';
import { netRefills } from '../net/netRefill';
import { MAX_PLAYERS, TICK_HZ, type Command, type ServerEvent, type Team } from '../net/protocol';
import { faceToward, type CameraBody } from '../net/shotCone';
import type { SimMap } from '../simMap';
import { reloadDelayOf } from '../firearms';
import type { NpcMarker } from './layout';

// NPB-1: the aim code the forge's NPCs share with the headless bots lives in `../net/botAim`.
export { aimedClaim, lookStep };

/**
 * FG-21 (the owner, 2026-10-13: "add hostile npcs as a new entity type that can die in play mode. Allow for selection
 * from known player models"): the forge's NPCs in its offline match. The game had no bots: this driver is a browser
 * adaptation of the sandbox with no original, and nothing of the game's own rooms reaches it -- only the forge's Play
 * (`./match`) builds one, on the page's own room (`../net/loopback`, `socketAs`).
 *
 * What is the room's own rule, unchanged: each NPC is a seat of the room like any page's -- its `NetClient` says hello
 * with the side's character type (protocol 9's `types`, one of the map's own `LoadedMap.types`), the room seats it on the
 * side `RoomOptions.soloSide` names, the classic round start stands it on its side's slot by its client index (where
 * `./matchMap` put its marker), and the room alone decides its rounds, its damage, its death and the round's end.
 *
 * What is the adaptation's own (`FORGE_HOSTILE_DRIVER_ADAPTATION`): the NPC stands where it spawned (no stick), turns its
 * look onto the nearest living body of the other side in sight by at most the full stick's rate a tick (OT.R38's law,
 * which the room's look gate holds every seat to), and once its look holds that body's torso, after a reaction, fires down
 * the look at the cone's centre as a page's round goes (`centreClaim`); an empty magazine is reloaded after the record's
 * ReloadDelay when the room would take the reload (another magazine with rounds, or FG-42: the network refill under the
 * room's rules, `../net/netRefill`). It reads the bodies off the page's own room (the room runs in the page) rather than
 * a snapshot stream. A round the room refuses (its reload lock, a motion's NoFire) is simply dropped by the room.
 */
export const FORGE_HOSTILE_DRIVER_ADAPTATION = 'the forge\'s NPCs: stand, turn onto a foe in sight by the stick law, fire down the look' as const;

/** The id of the page's player in its own room (`../net/loopback`'s SOLO_ID); the NPCs' seats follow it. */
export const PLAYER_SEAT = 1;
/** The adaptation's own choice: NPC i takes seat `NPC_SEAT_BASE + i`. */
export const NPC_SEAT_BASE = 2;
/** The adaptation's own choice: the ticks a foe must be held in sight before the first round (a reaction, 0.5 s). */
export const NPC_REACTION_TICKS = 30;
/**
 * The adaptation's own choice: no round in the first 3 s after each spawn -- the round's opening fades in and the player
 * has not yet seen the field (a playtest of 2026-10-13 died in the fade to an NPC standing in sight).
 */
export const NPC_OPENING_TICKS = 180;
/** The adaptation's own choice: the ticks between rounds, the least and the spread (one round each 1/3 s to 1 1/3 s). */
export const NPC_FIRE_GAP_TICKS = 20;
export const NPC_FIRE_SPREAD_TICKS = 60;
/** The adaptation's own choice: how far an NPC sees and fires, 4000 units (the headless bots' range, `tools/mp-bots.ts`). */
export const NPC_RANGE = 4000;

/** The full stick's turn a tick, degrees (`MAX_YAW_RATE` over the 60 Hz commands): the bots' one step (`../net/botAim`). */
export const NPC_YAW_STEP_DEG = BOT_YAW_STEP_DEG;
/** The full stick's pitch a tick, degrees (`MAX_PITCH_RATE` over the 60 Hz commands): the bots' one step. */
export const NPC_PITCH_STEP_DEG = BOT_PITCH_STEP_DEG;

/** The side the player takes: the one opposite most NPCs (a SEAL with none, or as many on each side). */
export function playerSideOf(npcs: readonly NpcMarker[]): Team {
  const terrorists = npcs.filter((n) => n.side === 'terrorist').length;
  return npcs.length - terrorists > terrorists ? 'terrorist' : 'seal';
}

/**
 * The NPCs the room can seat, in the layout's order: a side holds `TEAM_SIZE` seats (8) and the room `MAX_PLAYERS` (16),
 * the player's among them (the room's own lobby rule, `../net/lobby`). Past either the lobby would seat an NPC on the
 * other side or not at all, so those sit out the match and are counted. FG-24: `maxPlayers`, the layout's players
 * setting (the room's `maxPlayers`, `./settings` `roomOptionsOf`), caps the total below 16; above it the room's sides
 * still hold 8 each (FG-29 owed), so the total stays 16.
 */
export function npcsThatFit(npcs: readonly NpcMarker[], player: Team, maxPlayers: number = MAX_PLAYERS): { kept: NpcMarker[]; dropped: number } {
  const count = { seal: 0, terrorist: 0 };
  count[player] = 1;
  const cap = Math.min(maxPlayers, MAX_PLAYERS);
  const kept: NpcMarker[] = [];
  for (const n of npcs) {
    if (count[n.side] >= TEAM_SIZE || count.seal + count.terrorist >= cap) continue;
    count[n.side]++;
    kept.push(n);
  }
  return { kept, dropped: npcs.length - kept.length };
}

/** The room's `soloSide`: the player on `player` (by default `playerSideOf`), NPC i on its own marker's side. */
export function soloSideOf(npcs: readonly NpcMarker[], player: Team = playerSideOf(npcs)): (id: number) => Team | undefined {
  return (id) => (id === PLAYER_SEAT ? player : npcs[id - NPC_SEAT_BASE]?.side);
}

/**
 * The room's `soloSide` option for a forge match: given whenever there are NPCs to seat or the player's side is named
 * (the Play settings' Spawn as, a browser adaptation), so a chosen side holds with no NPC placed; neither, none (the
 * room's own seat).
 */
export function soloSideOption(npcs: readonly NpcMarker[], player?: Team): { soloSide?: (id: number) => Team | undefined } {
  return npcs.length || player ? { soloSide: soloSideOf(npcs, player) } : {};
}

/** A body's torso: the middle of its BODY capsules (the placeholder capsules' where the room has no skeleton). */
export function torsoOf(feet: readonly number[], yaw: number, posture: CameraBody['posture']): V3 {
  return torsoPoint({ feet, yaw, posture }, null);
}

/** A seat as the room holds it (`Room.player`): what the driver reads of its own and of the others'. */
type Seat = NonNullable<ReturnType<LoopbackMatch['room']['player']>>;

/** The room's body of a seat as a camera body (its feet, look, stance, root and peek). */
function bodyOf(p: Seat): CameraBody {
  const s = p.sim.walker.state;
  return { feet: [s.x, s.y, s.z], yaw: s.yaw, pitch: s.pitch, posture: p.sim.walker.posture, moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0 };
}

/**
 * The NPC's end of its client: no mover of its own (the room's is the truth, in the page); each tick's command goes out
 * with the room's feet, so the client's prediction never corrects anything.
 */
class NpcWalk implements NetWalk {
  private tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  constructor(private readonly feet: () => [number, number, number]) {}
  setNetTap(tap: typeof this.tap): void { this.tap = tap; }
  respawn(): boolean { return true; }
  nudge(): void {}
  setLocked(): void {}
  play(input: Omit<Command, 'seq'>): void { this.tap?.(quantiseCommand({ ...input, seq: 0 }), this.feet()); }
}

/** One NPC: its seat's client and its aim. */
export class ForgeNpc {
  readonly client: NetClient;
  private readonly walk: NpcWalk;
  private look: { yaw: number; pitch: number } | null = null;
  private target: number | null = null;
  private heldSince = -1;
  private fireAt = 0;
  private reloadAt: number | null = null;
  private t = 0;

  constructor(private readonly loop: LoopbackMatch, readonly id: number, readonly marker: NpcMarker, map: Pick<SimMap, 'stem' | 'grid'>,
    private readonly random: () => number = Math.random) {
    this.walk = new NpcWalk(() => {
      const s = this.seat()?.sim.walker.state;
      return s ? [s.x, s.y, s.z] : [0, 0, 0];
    });
    this.sight = (a, b) => segmentHit(map.grid, a, b) === null;
    this.client = new NetClient({
      url: 'loopback:', map: map.stem, name: `NPC ${id - NPC_SEAT_BASE + 1}`, socket: loop.socketAs(id),
      types: () => ({ seal: marker.type, terrorist: marker.type }),
    }, this.walk);
    this.client.on((ev: ServerEvent) => {
      if (ev.type === 'spawn' && ev.id === id) {
        this.look = null; this.target = null; this.heldSince = -1; this.reloadAt = null;
        this.fireAt = this.t + NPC_OPENING_TICKS;
      }
    });
  }

  private readonly sight: (a: V3, b: V3) => boolean;

  private seat(): Seat | undefined { return this.loop.room.player(this.id); }

  /** The nearest living body of the other side within range and in sight of the muzzle, or null. */
  private foe(self: Seat, from: V3): { id: number; point: V3 } | null {
    let best: { id: number; point: V3; d: number } | null = null;
    const ids = [PLAYER_SEAT, ...this.others()];
    for (const id of ids) {
      if (id === this.id) continue;
      const p = this.loop.room.player(id);
      if (!p || !p.alive || p.team === self.team) continue;
      const b = bodyOf(p);
      const point = torsoOf(b.feet, b.yaw, b.posture);
      const d = Math.hypot(point[0] - from[0], point[1] - from[1], point[2] - from[2]);
      if (d <= 1 || d >= NPC_RANGE || (best && d >= best.d) || !this.sight(from, point)) continue;
      best = { id, point, d };
    }
    return best;
  }

  /** The other NPCs' seats (set by `ForgeNpcs`). */
  others: () => readonly number[] = () => [];

  /** One 60 Hz tick: the look toward a foe in sight, a round once held, an empty magazine reloaded. */
  step(): void {
    const t = ++this.t;
    const self = this.seat();
    if (!self || !self.alive || this.client.role !== 'player') { this.walk.play({ forward: 0, right: 0, yaw: this.look?.yaw ?? 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }); return; }
    const body = bodyOf(self);
    this.look ??= { yaw: body.yaw, pitch: body.pitch };
    const from = muzzleOf(body.feet);
    const foe = this.foe(self, from);
    let turn = 0, holds = false;
    if (foe) {
      if (foe.id !== this.target) { this.target = foe.id; this.heldSince = -1; }
      const want = faceToward({ feet: body.feet, posture: body.posture, moveRoot: body.moveRoot, peek: body.peek }, foe.point);
      const [lo, hi] = aimPitchLimitsOf(self.sim.walker);
      const pitch = Math.min(hi, Math.max(lo, want.pitch));
      const s = lookStep(this.look, { yaw: want.yaw, pitch });
      this.look = { yaw: s.yaw, pitch: s.pitch };
      turn = s.turn;
      holds = s.holds && pitch === want.pitch;
      if (holds && this.heldSince < 0) { this.heldSince = t; this.fireAt = Math.max(this.fireAt, t + NPC_REACTION_TICKS); }
      if (!holds) this.heldSince = -1;
    } else { this.target = null; this.heldSince = -1; }
    this.walk.play({ forward: 0, right: 0, yaw: this.look.yaw, pitch: this.look.pitch, turn, buttons: 0, stance: 0, weapon: 0 });
    const seq = this.client.lastSeq();
    // The magazine as the room counts it: empty with another holding rounds -- or none, where the room's network refill
    // takes the record under its rules (FG-42: `netRefills`, the room's `reload`'s own rule, NET-REFILL) -- a reload
    // after the record's ReloadDelay.
    const mag = self.mags[0];
    if (mag.rounds() <= 0) {
      const reloads = mag.canReload() || netRefills(self.records[0].id, { respawn: this.loop.room.rules === 'respawn' });
      if (this.reloadAt === null && reloads) this.reloadAt = t + Math.ceil(reloadDelayOf(self.records[0]) * TICK_HZ - 1e-9);
      if (this.reloadAt !== null && t >= this.reloadAt) { this.reloadAt = null; this.client.send({ type: 'reload', seq }); }
      return;
    }
    if (!foe || !holds || t < this.fireAt) return;
    this.fireAt = t + NPC_FIRE_GAP_TICKS + Math.floor(this.random() * NPC_FIRE_SPREAD_TICKS);
    const now = bodyOf(self);
    const claim = aimedClaim({ ...now, yaw: this.look.yaw, pitch: this.look.pitch }, muzzleOf(now.feet), foe.point);
    this.client.send({ type: 'fire', seq, from: claim.from, dir: claim.dir, weapon: 0, viewTick: this.client.viewTick(), eye: claim.eye, aim: claim.aim });
  }

  close(): void { this.client.close(); }
}

/** The layout's NPCs on the page's room, ticked by `start` at 60 Hz (or by `step`, the tests). */
export class ForgeNpcs {
  readonly npcs: ForgeNpc[];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(loop: LoopbackMatch, markers: readonly NpcMarker[], map: Pick<SimMap, 'stem' | 'grid'>, random: () => number = Math.random) {
    this.npcs = markers.map((m, i) => new ForgeNpc(loop, NPC_SEAT_BASE + i, m, map, random));
    const ids = this.npcs.map((n) => n.id);
    for (const n of this.npcs) n.others = () => ids;
  }

  step(): void { for (const n of this.npcs) n.step(); }

  start(): void {
    if (this.timer !== null || this.npcs.length === 0) return;
    this.timer = setInterval(() => this.step(), 1000 / TICK_HZ);
  }

  close(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const n of this.npcs) n.close();
  }
}
