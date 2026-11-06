import { actorToWorldPoint } from '@s2u/scene';
import { actionAtPick, ACTION_TYPE_CODES, type MapAction } from '../mapActions';
import type { Stance } from '../mover';
import { TICK_HZ, type Team } from './protocol';

/**
 * XR-05, DEMOLITION's bomb (socomlegacy/docs/research/214-demolition-as-built.md s1-s2; research 171 s6-s7, 173 s2-s3, 193
 * s2.2/s4.3/s5): the rules the room's authority (`match/src/bomb.ts` `BombAuthority`) and the page's follower
 * (`../bombPage.ts`) share, so the two cannot drift. Headless: the room imports it (no three.js).
 *
 * The original's `CZBombState` (`FUN_002c26e0` D:L164244, 0x14 bytes) carries the bomb's place, the carrier's or
 * planter's actor id (+0xc), the defuser's (+0xe) and a state 0-5 (+0x10); `FUN_002c1f10` (D:L164008-164043) takes the
 * transitions 1 -> 2 (pickup), 2 -> 1 (drop), 2 -> 3 (plant), 3 -> 4 (defuse) and 3 -> 5 (the host's fuse). Every value
 * here is a reading of the decompilation or the disc (PF.R2), none measured on the original running.
 */

/** The states (`FUN_002c1f10` D:L164008-164043; research 171 s6). */
export const BOMB_STATE = { reset: 0, ground: 1, carried: 2, planted: 3, defused: 4, detonated: 5 } as const;
export type BombState = (typeof BOMB_STATE)[keyof typeof BOMB_STATE];

/**
 * A hold the room is counting (research 214 s2): a plant's or a defuse's 5 s on the Action button, or the plant's
 * 2.25 s placement after it (`place`). `sinceTick` is the room tick it began on.
 */
export interface BombHold { by: number; kind: 'plant' | 'defuse' | 'place'; sinceTick: number }

/**
 * The bomb on the wire (additive JSON, protocol 10 kept: PF.R33; research 214 s1): a `bomb` server event on every
 * transition and every hold's begin and end, and the welcome's `objective` for a late joiner. The original's 0x14-byte
 * `BombObject` (`FUN_002c20c0` D:L164056-164099) with the planting team kept apart from the carrier (research 173 s3:
 * `bomb_owner` is a team valve the defuse overwrites).
 */
export interface BombWire {
  state: BombState;
  /** Where the bomb lies (states 1, 3, 4, 5); while carried, where it was picked up -- the carrier's body draws it. */
  pos: [number, number, number];
  /** The carrying player's id (state 2), else null. */
  carrier: number | null;
  /** The player who planted it (states 3-5), else null. */
  planter: number | null;
  /** The planting player's side (states 3-5), else null. */
  plantingTeam: Team | null;
  /** The player who defused it (state 4), else null. */
  defuser: number | null;
  /** The hold the room counts, when one runs (`BombHold`). */
  hold?: BombHold;
  /** The room tick the fuse ends on (state 3), else null: the page counts the defuse timer from its server tick. */
  detonateTick: number | null;
  /**
   * The room tick the 4 s cooldown ends on (`PICKUP_COOLDOWN_S`): no pickup and no manual drop before it. A drop sets it
   * (`FUN_0059dd30` D:L452153) and so does a pickup (D:L452610).
   */
  pickupAfterTick: number;
  /**
   * PB-1 re-review (option B), landed by the online-parity sweep's P25 (BO-1): why the bomb lies on the ground after a
   * carrier's drop (state 1; absent at a round's reset and once picked up) -- 'manual' the carrier's own (`bombAction`,
   * action 6, `FUN_005937c0` D:L452458-452473), 'death', 'leave' or 'gone' (`match/src/bomb.ts` `BombEvent.why`);
   * additive (PF.R33). The dropper's page plays the drop's `Place claymore` for 'manual' alone (`FUN_0059ddb0`
   * D:L457606-457612: pushed where the actor's controller is not remote; research 214 s3, "The drop's clip").
   */
  dropWhy?: 'manual' | 'death' | 'leave' | 'gone';
}

/** The plant's and the defuse's hold: 5 s (`0x40a00000`), reset on a release (`FUN_00594600` D:L453260-453294). */
export const HOLD_S = 5;
/**
 * The hold in the room's commands: the counter commits when it goes below zero (`FUN_005920c0` D:L451484), one 60 Hz
 * command a tick of it -- the 300th consecutive command with `Button.ActionHeld` set while eligible.
 */
export const HOLD_TICKS = Math.round(HOLD_S * TICK_HZ);
/**
 * The plant's placement stage after the hold: the kit's +0x87c = 2.25 s (`FUN_005be9a0` D:L475479-475488), counted down
 * by the kit's tick, which then probes the ground and asks for state 3 (`FUN_005c1970` D:L476883-476886,
 * D:L477003-477010). The separate 3 s cooldown (+0x81c) is not another delay (research 171 s6).
 */
export const PLACEMENT_S = 2.25;
/** The fuse from state 3: 30 s (`FUN_002c2260` D:L164131; mp72LOC 7210 "THE BOMB WILL DETONATE IN 30 SECONDS"). */
export const FUSE_S = 30;

/**
 * [reading, pending review] LATER 148 (research 214 §6): a plant restarts the round's clock at the fuse. The HUD's round
 * clock (`FUN_001f6b60` D:L55990-56002) draws the game object's clock remainder (`FUN_002a6ad0`: +0xec, kept as +0xe0
 * less the time since +0xe4, `FUN_002aa490` D:L151092-151108); the bomb's commit, at state 3, sets +0xe0 to the fuse's ms
 * and its base to now (`FUN_002c20c0` D:L164084-164088, `FUN_002a6ac0` D:L148964), and detonates when that clock reaches
 * 0 (D:L164079-164080) -- the fuse *is* the round clock; the game object's clock is every console's (GameState @0xc,
 * research 193 §4.2). A detonation leaves it at 0. A defuse stops it at the fuse's remainder: the state-4 transition clears
 * the clock's second running flag +0xf5 (`FUN_002c1c30` D:L163937), and the clock refreshes only while +0xf4 and +0xf5 are
 * both set (`FUN_002aa490` D:L151092) -- `DEFUSE_CLOCK_HELD_READING` (LATER 152). It replaces research 214
 * §6's note-only row on the planted clock. Owed: a capture of a plant (research 213's capture B item 7).
 */
export const PLANTED_CLOCK_FUSE_READING = 'the round clock restarts at the fuse' as const;

/**
 * [reading, pending review] LATER 152 (research 214 §6): a defuse holds the round clock at the fuse's remainder until
 * the round's end, on every console. The state-4 transition clears the game object's +0xf5 (`FUN_002c1c30` D:L163937;
 * the host through the commit `FUN_002c20c0`, every client through the bomb's state receive `FUN_002c23b0` D:L164158);
 * the clock refreshes only while +0xf4 and +0xf5 are set (`FUN_002aa490` D:L151092), and nothing in the round sets +0xf5
 * again (the GameState receive never writes it, D:L163312-163318; the round's exit does, `FUN_00223970` D:L76135). The
 * room holds `timeLeft` and says so (`score.clockHeld`). Owed: a capture of a defuse.
 */
export const DEFUSE_CLOCK_HELD_READING = 'held at the defuse' as const;
/** No pickup for 4 s after a drop (`FUN_0059dd30` D:L452153); a pickup sets the same cooldown (D:L452610). */
export const PICKUP_COOLDOWN_S = 4;
/**
 * The automatic pickup: item type 0xb within a squared 3D distance under 400 -- 20 u (`FUN_00593da0` D:L452602 ->
 * `FUN_005aa110` D:L463790-463827: the nearest type-11 item by `FUN_00541d40`'s 3D search at D:L463817 (its body
 * D:L409226-409267), then dx² + dy² + dz² < 400 again at D:L463821, no line or wall test). OBF-17 (Trello NH8lPT6Z):
 * was the horizontal distance alone, so a player on Night Stalker's bomb hut roof took the bomb on the floor 53.6 under
 * him.
 */
export const PICKUP_REACH_SQ = 400;
/**
 * PICKUP_POINT_OFFSET_PLACEHOLDER (OBF-17; research 214 §6): the original measures the pickup from the actor's position
 * (`+0x1c`) plus `+0x14b0` -- the posed `firepoint`'s offset turned by the actor's rotation (research 217 §1.3;
 * `FUN_005df930` D:L493889) -- or plus `DAT_003f64c0` (0, 0, 0) when that vector is zero (`FUN_005aa110`
 * D:L463807-463814). The room poses no weapon, so it measures from the feet: the zero vector, the original's own branch
 * for an actor with no offset. The posed muzzle stands about 12.7 over the feet standing (research 217 §1.3's table), so
 * the original's reach is likely shorter across and longer downward than this. Settles it: an RDRAM read of
 * `actor+0x14b0` at a pickup (capture B item 5), standing, crouched and prone.
 */
export const PICKUP_POINT_OFFSET_PLACEHOLDER: readonly [number, number, number] = [0, 0, 0];
/** The defuse's reach from the planted bomb: horizontal 15, vertical 20 (`DAT_00650688` / `DAT_00650690`; D:L452589-452598). */
export const DEFUSE_REACH = { horizontal: 15, vertical: 20 } as const;

/**
 * DROP_AIM_READING: the manual drop (action 6, mask 0x40, `FUN_005937c0` D:L452458-452473) asks the actor's +0x1450
 * below -0.25; read as the aim's sine (about 14.5 degrees down). What +0x1450 holds is not traced; capture B item 6.
 */
export const DROP_AIM_READING = -0.25;

/**
 * PLANT_PLACEMENT_CANCEL_READING (PF.R30): a release inside the 2.25 s placement does not cancel it -- the hold has
 * committed (`FUN_005920c0`), and the kit's timer runs on (`FUN_005c1970`); the planter's death or leave cancels it and
 * drops the bomb. Capture B items 7b/7c settle it.
 */
export const PLANT_PLACEMENT_CANCEL_READING = 'runs-to-completion' as const;

/**
 * DEM_SAME_TICK_READING (PF.R28): the room's events come before its clock in a tick -- the holds run with the commands,
 * then the placement and the fuse, then the round's clock -- so a plant landing on the clock's last tick stops the
 * time-out and a defuse completing on the fuse's tick defuses. Capture B items 8 and 10.
 */
export const DEM_SAME_TICK_READING = 'events-first' as const;

/**
 * DEFUSE_REACH_READING: the defuse is taken by proximity to the planted bomb's point within `DEFUSE_REACH` (the room has
 * no reticle); the original's DEFUSE action may also ask a pick (D:L452436-452454 reads the team, D:L452589-452598 the
 * reach). Capture B item 8.
 */
export const DEFUSE_REACH_READING = 'proximity' as const;

/**
 * [reading, pending review] PLANT_REACH_READING (PLANT-AIM, IP2; research 214 §2, §6): the plant is offered where the
 * reticle's pick strikes the tent -- `FUN_005aa240` (D:L463830-463905): the node under the reticle (the pick's action
 * record `+0x3fc` first, else its opaque hit `+0x3dc`, `FUN_005aa6e0`; the port's `actionRayDetail`) or a parent of it
 * names the MPBOMB record, and the actor's place is within the record's range 15 of the struck point on the ground plane
 * and its elevation 15 in height, both strict (D:L463895-463898) -- the plant's offer (`FUN_005937c0` D:L452339,
 * D:L452414-452417: record type 4 past `FUN_00594350` D:L452722-452724 -> `FUN_00594480`). Every DEMOLITION tent's node owns
 * the floor quad about its base (research 284 §1; MP83's `seal_tent` an upright quad too), so the zone is that patch
 * plus the reach, gated by looking at it. The hold re-picks every frame: it is begun on a pick (`FUN_00594cf0`
 * D:L453258-453264), counted and committed on the re-pick (`FUN_005920c0` D:L451495-451509), and reset when the offer
 * leaves the list's head (bit 4 of +0x171, D:L453281-453287, written by `FUN_0021f850` D:L74304-74307) -- the room judges
 * eligibility each tick (`holdKind`). The room sees no reticle: the page names its pick (`bombAction` 'aim') and the room
 * holds it to the newest command's look and its own grid (`match/src/room.ts` `plantAimSees`, XR-04's check). The reach is
 * measured from the actor's position plus `+0x14b0` (D:L463874-463881): `PLANT_PICK_FIREPOINT_READING`. *Was*
 * `'proximity'`: the feet within 15 / 15 of the node's origin, the r0001 stand-in this supersedes (`atPlantSite`). Owed:
 * capture B item 7, the plant from the reach's edge.
 */
export const PLANT_REACH_READING = 'aim-pick' as const;

/**
 * [reading, pending review] PLANT_PICK_FIREPOINT_READING (PLANT-AIM; research 214 §2, 217 §1.3): the point the plant's
 * reach is measured from. `FUN_005aa240` takes the actor's position (`+0x1c`) plus `+0x14b0` -- the posed `firepoint`'s
 * offset turned by the actor's rotation, written each tick by `FUN_005df930` (D:L493889) -- and the zero vector only when
 * that offset is zero (D:L463874-463881). The room poses no weapon, so the offset is research 217 §1.3's table: the M4's
 * `firepoint` on the port's pose at the first key of each idle, body frame (x right, y up, z behind; turned by the facing
 * as `bombPlantHand` turns the hand). It matters: standing at the aim's lowest pitch (-70, `aimPitchLimits`) the camera's
 * look strikes level ground 15.3 u ahead of the feet -- out of the record's range 15 from the feet, 6.3 from this point.
 * Not followed: the pistol's shorter muzzle, an aimed or moving clip's (`seal_fp_stand` 15.15 ahead), the other character
 * models -- as `CROUCH_GATE_REACH_READING`. The switches' reach (`actionReachNote`, XR-04) and the pickup's
 * (`PICKUP_POINT_OFFSET_PLACEHOLDER`) still measure from the feet. Owed: an RDRAM read of `actor+0x14b0` standing, crouched
 * and prone (research 217 §1.3), with capture B item 7.
 */
export const PLANT_PICK_FIREPOINT_READING = {
  stand: [-2.750, 12.728, -8.599], crouch: [1.341, 7.090, -11.438], prone: [-1.728, 0.074, -14.490],
} as const satisfies Record<Stance, readonly [number, number, number]>;

/** The point the plant's reach is measured from (`PLANT_PICK_FIREPOINT_READING`): the feet plus the stance's firepoint, turned by `yaw`. */
export function plantReachFrom(feet: readonly number[], yaw: number, posture: Stance): [number, number, number] {
  return actorToWorldPoint(feet, yaw, PLANT_PICK_FIREPOINT_READING[posture]);
}

/**
 * BOMB_GROUND_READING: StartBomb stands at its AI cell's centre and quantised height (`FUN_002c1a80` D:L163839 ->
 * `FUN_0052d480`, `FUN_00516940`; research 173 s2) without the optional `FUN_00516920` correction (bit 7 of the cell's
 * low byte, clear on every bomb cell), and the ground bomb is made there with no probe of the floor (`FUN_002c1c30`
 * D:L163956-163964 -> `FUN_0059dab0`) -- on MP72 0.166 under the floor's 47.500, the quantisation's; a dropped or planted
 * bomb at the first surface under the feet that `./placing` `restsOn` accepts, by the room's own search (`bomb.ts`
 * `floor()`: +`BOMB_FLOOR_LIFT` down `FLOOR_SEARCH`, research 214; the original projects the model, `FUN_0059ddb0`).
 * (Was: "as `chargeRests` finds it" -- before AD-4 the two shared one probe; AD-4's review, F2.) Capture B items 5, 11
 * and 15.
 */
export const BOMB_GROUND_READING = 'cellY' as const;

/**
 * BOMB_RESULT_DELAY_READING (PF.R27; research 171 s7, 213 s2.4): from the outcome to the round's end state, as the
 * script sums it -- `defuse`'s WAIT 3 then `success`/`failure`'s WAIT 20 and WAIT 1; `bomb_timer`'s WAIT 2 and WAIT 2
 * then the same 20 + 1. A script reading, not a stopwatch.
 */
export const BOMB_RESULT_DELAY_READING = { defused: 3 + 20 + 1, detonated: 2 + 2 + 20 + 1 } as const;

/**
 * [reading, pending review] LATER 149 (research 174 §2): BREACH's detonation hold on the host's console, a SEAL's
 * (`ELIMINATION_PERSPECTIVE_READING`): `bomb_timer`'s SEAL-console branch sets `mp_winner = 0`, WAIT 2 (MP61 @4192, MP62 /
 * MP73 @4120), then `success` (MP61 @4284): 2 + 20 + 1 -- one WAIT 2 where DEMOLITION's has two. Its Terrorist defuse is
 * DEMOLITION's 3 + 20 + 1 (`defuse`'s SEAL-console branch, MP61 @3040: WAIT 3, then `failure`; `breach_success`'s own
 * `failure` finds it running, `FUN_00269b00`).
 */
export const BREACH_DETONATION_HOLD_READING = 2 + 20 + 1;

/**
 * FIRST_REQUEST_WINS_READING (PF.R28): two players reaching the bomb on one tick -- the host takes the first request it
 * handles (research 193 s5); the room takes the lower seat id.
 */
export const FIRST_REQUEST_WINS_READING = 'lower seat id' as const;

/**
 * MPBOMB_BLAST_OWNER_READING (BOMB-DAMAGE, research 332 §1): the detonation's blast hurts the players in its reach as a
 * grenade's does -- `base_explosion1`'s FIRE_WEAPON (`FUN_0025ccb0` D:L107153-107326) fires a pool round of MPBOMB /
 * MPBOMB Ammo (Explosion_Damage 50, Explosion_Radius 30 = 300 u) at the bomb's node, whose PostTick counts the 0.001 s
 * fuse on every machine (`FUN_003c9fb0` D:L320128) and whose `HandleTimers` detonates it online through +4 bit 4
 * (`FUN_003c99a0` D:L319884-319901; the bit set at D:L107322) -- and its owner (`+0xac`, the fire's last argument
 * D:L107310-107311) is each console's own SEAL (`FUN_002b3580` D:L107285: `DAT_00440c38`; `FUN_002c1c30` D:L163926
 * gives the program only a type-3 context, so the type-9 replacement D:L107286-107297 never runs). The victim's console
 * hurts its own SEAL only (`FUN_005ac070` D:L464826-464833), so the owner at each hit is the victim: friendly fire spares
 * no one and a death is his own (`FUN_005a0e70` D:L459286-459300). The room's `bombBlast`. Owed: capture B item 9 (the
 * death line and the score). Was the placeholder 'none' (PF.R32, 2026-10-05): no player hurt, the path untraced.
 */
export const MPBOMB_BLAST_OWNER_READING = 'victim' as const;

/**
 * Whether the feet are within the automatic pickup's reach of the bomb: the squared 3D distance from the feet plus
 * `PICKUP_POINT_OFFSET_PLACEHOLDER` under 400 (`PICKUP_REACH_SQ`).
 */
export function pickupReach(bomb: readonly number[], feet: readonly number[]): boolean {
  const o = PICKUP_POINT_OFFSET_PLACEHOLDER;
  const dx = feet[0]! + o[0] - bomb[0]!, dy = feet[1]! + o[1] - bomb[1]!, dz = feet[2]! + o[2] - bomb[2]!;
  return dx * dx + dy * dy + dz * dz < PICKUP_REACH_SQ;
}

/** Whether the feet are within the defuse's reach of the planted bomb: horizontal under 15 and vertical under 20. */
export function defuseReach(bomb: readonly number[], feet: readonly number[]): boolean {
  const dx = feet[0]! - bomb[0]!, dy = feet[1]! - bomb[1]!, dz = feet[2]! - bomb[2]!;
  return dx * dx + dz * dz < DEFUSE_REACH.horizontal ** 2 && dy * dy < DEFUSE_REACH.vertical ** 2;
}

/**
 * Who plants at an MPBOMB record (`FUN_00594480` D:L452755-452759): the SEALs at `terrorist_tent`, the Terrorists at
 * `seal_tent` (`FUN_002ac410` D:L152198-152201 names the two nodes). A disc record keeps that rule even when the
 * record carries `team`. `mapActions.ts` stores the disc's `team` when the file has one (research 174: Sujo's radios
 * are team 0), so the field is not the plant rule.
 *
 * A forge site is an adaptation. `forgeBombActions` writes path `forge/site_<i>` and puts who plants on `team`
 * (0 the SEALs, 1 the Terrorists). That field decides only for those paths.
 */
function plantingSide(a: MapAction): Team | null {
  if (a.typeCode !== ACTION_TYPE_CODES['MPBOMB']) return null;
  if (a.path.startsWith('forge/site_')) {
    if (a.team === 0) return 'seal';
    if (a.team === 1) return 'terrorist';
    return null;
  }
  return plantingSideOfNode(a.node);
}

/** A disc MPBOMB record's planting side by its node's name alone (`plantingSide`'s disc rule): the Forge's Map Data too. */
export function plantingSideOfNode(node: string): Team | null {
  const n = node.toLowerCase();
  if (n === 'terrorist_tent') return 'seal';
  if (n === 'seal_tent') return 'terrorist';
  return null;
}

/**
 * A side's plant site: the first MPBOMB record `plantingSide` gives to that side. Null when the map has none.
 */
export function plantSite(team: Team, actions: readonly MapAction[]): MapAction | null {
  return actions.find((a) => plantingSide(a) === team) ?? null;
}

/** A forge layout's generated site (`forgeBombActions`): no scene node, no polygon to aim at. */
function forgeSite(a: MapAction): boolean {
  return a.path.startsWith('forge/site_');
}

/**
 * Whether the feet stand within the site record's range and elevation of its node's origin (`actionAtPick` with the
 * node's own point as the pick). Since PLANT-AIM it is not a disc tent's plant gate (`plantAimAt`): it is a forge site's
 * reach and the sweeps' ring of spots about the node.
 */
export function atPlantSite(site: MapAction, feet: readonly number[]): boolean {
  return actionAtPick([site], { path: site.path, point: site.at }, feet) !== null;
}

/** PLANT-AIM: the pick the plant reads -- the struck polygon's owner path and the point (the page's `actionRayPick`). */
export interface PlantPick { path: string; point: readonly number[] }

/**
 * PLANT-AIM (`PLANT_REACH_READING`): whether `pick` offers the plant at `site` -- the action it names among `actions`
 * (`actionAtPick`: the node or a parent, the reach from the point to `from`, the actor's measuring point,
 * `plantReachFrom`; the feet when not given) is the site. A forge site has no polygon to aim at, so its reach stays the
 * feet near its point (`atPlantSite`) -- the forge's adaptation, unchanged by PLANT-AIM.
 */
export function plantAimAt(
  site: MapAction, feet: readonly number[], pick: PlantPick | null, actions: readonly MapAction[] = [site], from: readonly number[] = feet,
): boolean {
  if (forgeSite(site)) return atPlantSite(site, feet);
  return pick !== null && actionAtPick(actions, pick, from)?.path === site.path;
}

/** What the hold's eligibility reads of the bomb: its state, carrier, whether a placement runs, the planting side, its place. */
export interface BombHoldState {
  state: BombState; carrier: number | null; placing: boolean; plantingTeam: Team | null; pos: readonly number[];
}

/**
 * Which hold a player's held Action counts for (research 214 s2), the room's and the page's one rule: 'plant' for the
 * carrier whose pick (`a.pick`) offers its side's site (`site`, `plantSite`; `plantAimAt` over the map's `actions`, the reach
 * from `a.from`, `plantReachFrom`, else the feet; PLANT-AIM) while no placement runs (`FUN_00594350` / `FUN_00594480`
 * D:L452694+); 'defuse' for a player of the other side within `DEFUSE_REACH` of the planted bomb (D:L452436-452454,
 * D:L452589-452598); else null. Whether the player is alive and the round in play is the caller's.
 */
export function holdKind(
  b: BombHoldState, a: { id: number; team: Team; feet: readonly number[]; pick?: PlantPick | null; from?: readonly number[] },
  site: MapAction | null, actions: readonly MapAction[] = site ? [site] : [],
): 'plant' | 'defuse' | null {
  if (b.state === BOMB_STATE.carried && b.carrier === a.id && !b.placing && site && plantAimAt(site, a.feet, a.pick ?? null, actions, a.from ?? a.feet)) return 'plant';
  if (b.state === BOMB_STATE.planted && a.team !== b.plantingTeam && defuseReach(b.pos, a.feet)) return 'defuse';
  return null;
}

/** What a manual drop reads: the bomb carried, the room tick, the cooldown's end, the stick and the look's pitch (degrees, up positive). */
export interface DropInput { carrying: boolean; tick: number; pickupAfterTick: number; forward: number; right: number; pitch: number }

/** The manual drop's gate (`FUN_005937c0` D:L452458-452473): carrying, the cooldown clear, no stick, aiming down. */
export function canDrop(d: DropInput): boolean {
  return d.carrying && d.tick >= d.pickupAfterTick && d.forward === 0 && d.right === 0
    && Math.sin((d.pitch * Math.PI) / 180) < DROP_AIM_READING;
}

/**
 * The side a resolved bomb gives the round: state 4 the defuser's (`defuse` @1960: `bomb_owner` is the defuser's team),
 * state 5 the planting team's (`bomb_timer` @4596); null otherwise (research 171 s7, 213 s2.4).
 */
export function bombOutcome(state: BombState, plantingTeam: Team | null, defuserTeam: Team | null): Team | null {
  if (state === BOMB_STATE.defused) return defuserTeam;
  if (state === BOMB_STATE.detonated) return plantingTeam;
  return null;
}

/**
 * The hold from the bomb's outcome to the round's end state, seconds, on the game type's script
 * (`BOMB_RESULT_DELAY_READING`; BREACH's detonation `BREACH_DETONATION_HOLD_READING`, LATER 149).
 */
export function resultHoldS(kind: 'defused' | 'detonated', gameType: number = 2): number {
  return kind === 'detonated' && gameType === 1 ? BREACH_DETONATION_HOLD_READING : BOMB_RESULT_DELAY_READING[kind];
}
