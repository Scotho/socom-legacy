import { botModelFor, botNameFor, botNativeTypeFor } from '../../../viewer/src/botRoster';
import { SMOKE_PLACEHOLDER } from '../../../viewer/src/smoke';
import { aimPitchLimitsOf } from '../../../viewer/src/net/lookGate';
import { smoothRoute } from './routeSmoothing';
import { chooseBotCharacter } from '../../../viewer/src/characters/catalogue';
/**
 * Authored multiplayer bot extension (FBA.R5, FBA.R8), ported from the preserved SOCOM practice-bot snapshot
 * source-20261020T223735Z. Decisions and tuning are ours, not recovered retail campaign behaviour. Existing
 * Redotcom movement, collision, weapon cone, damage, reload and animation implementations remain authority.
 */
import { actorToWorldDir, actorToWorldPoint, BLIND_KEYS, impactRange, isLiquidSurface, itemClass, maxThrowDistance, polygonNormal, probeFloor,
  releaseSeconds, THROW_GRAVITY, segmentHit, surfaceWord, SURFACE_SKIP, throwAnim, throwVelocity, UNITS_PER_METRE } from '@s2u/scene';
import { Button, holdBits, PROTOCOL_VERSION, TICK_HZ, type Command, type ServerEvent, type Team } from '../../../viewer/src/net/protocol';
import type { Room } from '../room';
import { encodeCommands } from '../../../viewer/src/net/codec';
import { faceToward, pointSegment, targetHeight, type AimFrame } from '../../../viewer/src/net/shotCone';
import { friendlyOnRay, sampledClaim } from './shot';
import { BODY_RADIUS, EYE_HEIGHT, reloadHold, rootY, WALL_BODY_READING, WALL_END_CONTACT_READING, type HoldClip, type Stance, type WallHit } from '../../../viewer/src/mover';
import { shortTurn, wrapYaw } from '../../../viewer/src/yaw';
import { doorInReach } from '../../../viewer/src/doors';
import { LADDER_STANDOFF, Traversal } from '../../../viewer/src/traversal';
import { WEAPON_LINE_BOTS_READING } from '../../../viewer/src/weaponLine';
import { BotFirePolicy, botFireFrames, chooseBotStance, chooseBotWeapon, chooseRole, framesInTicks, ROLE_ADAPTATION, type BotRole } from './roles';
import { botLoadout } from './armory';
import { firearmSlotPresent, type SimKits } from '../../../viewer/src/loadout';
import { WalkingNavigation, validateBotNavigation, type NavigationData, type NavSteps, type Point } from './navigation';
import { CombatPositions, newSearchCursor, type CoverPosition, type SearchCursor } from './positions';
import { BOT_DOOR_STAGGER_ADAPTATION, BOT_NAV_JOB_ADAPTATION, BOT_ROUTE_WORK_PER_TICK_ADAPTATION, doorReplanDue, movingHullStamp, NavScheduler, routeCrossesDoor,
  type NavJobStats, type Slot } from './navScheduler';
import { scopeEyeHeight as scopedEyeHeight } from '../../../viewer/src/cameraRig';
import { pelletsOf } from '../../../viewer/src/firearms';
import { rocketRoundOf } from '../../../viewer/src/equipment';
import { SHOTGUN_PELLET_RANGE_SQ } from '../../../viewer/src/net/damage';
import { MAX_YAW_RATE } from '../../../viewer/src/look';
import type { MoverSim } from '../../../viewer/src/net/moverSim';
import { BotSounds, audibleSound, shotSound, type CombatSound } from './sounds';
import { TeamTactics, TEAM_TACTICS_ADAPTATION, type OpeningProfile, type TacticalAssignment } from './teamTactics';
import { BotPlan } from './botPlan';
import { botProfiler, instrumentNavigation, type BotProfiler } from './botProfile';
import { BotLadderDrive } from './ladderDrive';
import {BotClimbDrive} from './climbDrive';
import { SquadCoordinator, type SquadMember } from './squad';
import { botBehaviours, type BotBehaviours } from '../botGates';

import { BOT_THROW_ADAPTATION, chooseTacticalThrow, solveBotThrow, type BotThrowSolution } from './throwPolicy';

interface MatchBotOptions {
  navigation?: NavigationData; random?: () => number; kits?: SimKits | null; teamProfile?: OpeningProfile;
  /** BOP-S: the navigation work per bot per tick (default `BOT_ROUTE_WORK_PER_TICK_ADAPTATION`; `Infinity`: inert). */
  navWork?: number;
  /** BOP-S S4: the door-change replan stagger (default `BOT_DOOR_STAGGER_ADAPTATION`). */
  doorStagger?: boolean;
  /** P537-L3: PR #537's behaviours on for this room (default: `botBehaviours` of the room's map, `../botGates`). */
  behaviours?: BotBehaviours;
}

/** BOP-S: where a resumable angle search stands -- `search`'s cursor, then the fallback list and its next candidate. */
interface AnglesCursor { search: SearchCursor; nearby?: Point[]; index: number; fallback?: Point[] }
/**
 * A teammate as the tick began (its pose copied before any bot's turn); `blockedBy` is that bot's stamp as it stood then
 * (BOP-S batch 5), so the bots' order within the tick cannot change what another reads.
 */
/** A teammate's pose as the tick began (`sides`); `next`: a bot's next route points then (batch 11: a holder steps off them). */
interface Peer { id: number; team: Team; at: Point; velocity: [number, number]; blockedBy?: { id: number; tick: number }; next?: Point[] }
const newAnglesCursor = (): AnglesCursor => ({ search: newSearchCursor(), index: 0 });
/** A walking plan's answer: the route, the patrol after a failed assignment, the angles after a lost contact. */
interface PlanAnswer { route: Point[]; fallback: Point[] | null; angles: Point[] | null }
const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const MathUtils = { clamp: (x: number, a: number, b: number) => Math.max(a, Math.min(b, x)),
  damp: (x: number, y: number, response: number, dt: number) => y + (x - y) * Math.exp(-response * dt) };

const scopeEyeHeight = (stance: Stance): number => scopedEyeHeight(stance, rootY(stance));

interface FiredContact { victim: number; at: Point; height: number; yaw: number; pitch: number; tick: number; weapon: 0 | 1; gun: number }
interface FireOverrun extends FiredContact { remaining: number; until: number; cadence: number }
type BotPlayer = NonNullable<ReturnType<Room['player']>>;

interface Actor {
  role: BotRole; firePolicy: BotFirePolicy;
  /** The tick a flashbang's white-out stops blinding it (`FLASH_BLIND_ADAPTATION`); unset when never flashed. */
  blindUntil?: number;
  planner: BotPlan; pathFailedUntil: number;
  body: MoverSim;
  id: number; team: Team; ordinal: number; route: Point[]; target: number | null; hunt: number | null; memory: Point | null; memoryUntil: number; memoryHeight: number;
  /** Authored bot contact generation: late navigation must still belong to the sensed decision that asked for it. */
  contactRevision: number;
  visibleSince: number; lastPlan: number; lastShot: number; lastReload: number; yaw: number; pitch: number;
  progress: Point; progressAt: number; recoverUntil: number; side: number; alive: boolean;
  actionUntil: number; reposition: Point | null;
  fired: FiredContact | null; overrun: FireOverrun | null;
  cover: CoverPosition | null; coverPhase: 'hide' | 'peek'; coverPhaseUntil: number; coverPlanAt: number;
  danger: Point | null; dangerUntil: number; pressureUntil: number; pressureReadyAt: number;
  tracked: number | null; trackTicks: number; lastSeen: number; aimOffset: [number, number]; aimSampleAt: number;
  heard: { kind: CombatSound['kind']; at: Point; tick: number } | null;
  stick: [number, number];
  tacticGoal: Point | null; yieldUntil: number; yieldFor: number | null; passing: Point | null; trafficScale: number;
  failedTactic: { goal: Point; until: number } | null;
  seen: { id: number; at: Point }[];
  equipment: { kind: string; start: number; releaseAt: number; power: number; target: Point } | null; lastEquipment: number;
  throwHoldUntil: number;
  lastDodge: number;
  search: { contact: Point; points: Point[]; visited: Point[]; lookUntil: number; facing: number } | null;
  behaviour: 'patrol' | 'engage' | 'investigate' | 'recover' | 'take-cover' | 'hold-cover' | 'peek' | 'reload' | 'flank' | 'cover-fire' | 'search';
  verdict?: string | null;
  /** BOP-S S4: a door changed and this route did not pass through one -- dropped on the bot's own replan slot. */
  doorDirty?: boolean;
  /**
   * BOT-DOOR: the route a door change dropped, and that change's tick -- the walk the bot was on when the door shut, read
   * by the door press of the same tick only (`wantsDoor`), before its replan (through the shut leaf's door edge) lands.
   */
  doorDropped?: { route: Point[]; tick: number };
  /** BOP-S: the cover whose hide point its spent route left it near, and the ticks it was steered there (F1, F2). */
  coverStep?: { cover: CoverPosition; steered: number; stretched: boolean };
  /**
   * BOP-S batch 11 (B): a holder's step aside for a priority walker -- the point it stepped to and the last tick a
   * walker's stamp named it. Gone `yieldTicks` after the last stamp; the hold's own timing is TeamTactics'.
   */
  holdAside?: { to: Point; last: number };
  /** Batch 11 review (watch): walking back to its hold after an aside -- it keeps facing the hold's watch meanwhile. */
  holdReturning?: boolean;
  /** BOP-S (the review's F3): hide points this bot gave up as unreachable, kept out of its own next choices a while. */
  givenUp?: { hide: Point; until: number; revision: number; hull: string | null }[];
  /** BOP-S batch 4: the teammate it is giving way to on a leg too narrow to pass (backing off until it is clear). */
  giveWay?: { id: number; aside: boolean; end: Point; since: number };
  /** BOP-S batch 5: the teammate whose body refused its steering's forward leg, and the tick (read the tick after). */
  blockedBy?: { id: number; tick: number };
  /** BOT-CORNER (the ramp wedge): the teammate whose body refused its leg on consecutive ticks, and since when. */
  refusedSince?: { id: number; since: number };
  /** BOT-CORNER (the ramp wedge): the priority teammate it has given way to on consecutive yields, and since when. */
  yieldedSince?: { id: number; since: number };
  /** BOP-S (LF3): the rungs it last got off -- their stand-off point and the facing into them -- kept out of its steering. */
  ladderAvoid?: { at: Point; into: [number, number]; until: number; revision: number; hull: string | null };
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. New AI timings/ranges. The project has no runnable retail campaign controller; these are exposed practice tuning. */
// `fov` is no adaptation: a bot sees no wider than a player (OT.R81, area (a)'s re-read 1) -- every map's `cameras/camera`
// authors fov (0.6109 0.4276), half-angles, so 70 degrees across and `fovVertical` 49 up and down (viewer `camera.ts`).
const BOT_AI_ADAPTATION = { perceptionTicks: 6, trackingTicks: 2, vision: 850, fov: 70, fovVertical: 49, planTicks: 90,
  stuckTicks: 60, recoverTicks: 45, recoveryDistances: [16, 28], recoveryRetreat: 0.5, progressDistance: 4,
  waypoint: 6, spacing: 20, separation: 2.5,
  repositionTicks: 75, clearanceTicksPerUnit: 1.5, combatRange: 380, rangeAggression: 2,
  burstBase: 2, burstSkill: 4, burstPause: 1.2, burstPauseSkill: 0.7 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Short lateral adjustments, with authored variation in distance and reversal timing. */
const STRAFE_ADAPTATION = { distance: 10, variation: 8, ticks: 22, tickVariation: 18, arrival: 2,
  speed: 0.9, approach: 0.8, backAway: 0.3, retreatFraction: 0.35 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored CPU input choice; the native Walker decides whether the move is legal. */
const DODGE_ADAPTATION = { cooldownTicks: 5 * TICK_HZ, minRange: 65, maxRange: 280, clearDistance: 24, pronePopRange: 160 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Author-created cover pacing; no recovered campaign controller exists. Authored extension FBA.R5. */
// `givenUpTicks` (BOP-S, the review's F3; OT.R81, the port's own): how long a hide point a bot gave up stays out of its
// own choices -- 10 s, over three cover re-plan periods, so the 60-standing/180-bare cycle on one point cannot recur.
const TACTICS_ADAPTATION = { coverPlanTicks: 180, hideTicks: 45, givenUpTicks: 600,
  arrival: 2, crouchReloadRounds: 5, dangerFocusTicks: 90, pressureTicks: 150, pressureHideTicks: 45, dangerRadius: 45, immediateThreat: 40,
  targetPersistence: 0.7, dangerPriority: 0.4, nearMiss: 10, hideAggression: 0.5, laneWaitTicks: 18,
  // BOTS-LAND (botTacticalFrostfire in a respawn room): a bot walking an opening's route stops to shoot at a visible
  // target inside its role's range (ROLE_ADAPTATION's), and keeps walking at a more distant one (FBA.R13).
  stopToFireOnOpening: true };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Deliberately imperfect acquisition which settles with observed tracking; author-created tuning, authored extension FBA.R5. NPB-11's reacquireFraction 0.8 is proposed, held pending the owner's word; main's 0.5 stands until then. */
const AIM_ADAPTATION = { degreesPerError: 0.075, settledFraction: 0.25, settleTicks: 120, sampleTicks: 24,
  sampleErrorTicks: 0.3, pitchFraction: 0.4, reacquireFraction: 0.5, reacquireTicks: 150 };
/**
 * OBF-14 (research 364 s9; reading, pending review): a bot's rifle is raised while it holds a target (`Room` `Player.raise`,
 * carried on its body's `Aiming` flag). The original's AI asks the rifle up when it engages: CSealCtrlAi's tick
 * (`FUN_0056de10`, vtable 0x6693f0 +0xc) -> D:L432502 `FUN_005cba20` -> D:L482998 `FUN_00563e10`, which with a target
 * (its handle `ai+0x67c` held and seen within 3.0 s, `FUN_0060a590`, D:L427779-427794) asks `FUN_005dfe30(body, 1)` (D:L427799);
 * `FUN_00563bd0` (from `FUN_0055d120` D:L424472, its caller's role not read here) asks it up as well and answers ready
 * only with the aim within 0.98 (`FUN_0060f9b0`) and the raise up and settled (`body+0xf74 == 1`, D:L427690-427694) --
 * here the raise starts at the contact, its 0.1 s in-time (`RAISE_TIMES`) inside every role's reaction
 * (`ROLE_ADAPTATION.reactionMs`, 235 ms and more), so no round waits on it and the fire's timing is unchanged.
 * Unread: the AI's own lower -- `FUN_00565b80`'s countdown (`ai+0x734` + `ai+0x738` x rand, D:L428558-428573) and when
 * its no-target branch keeps the rifle up (`uVar18`, 2 -- down -- by default, D:L427774-427778, D:L427795-427797) -- for which a copy here takes
 * its player's 5 s (`LOWER_DELAY`) after the target is lost. Settles: those read (the AI's construction of `+0x734..0x740`), or a capture
 * of a campaign AI's copy losing its contact.
 */
export const BOT_RAISE_READING = 'up while it holds a target' as const;
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Our own short contact/search pacing; F.E.A.R.'s public paper supplies principles, not values. Authored extension FBA.R5. */
const SEARCH_ADAPTATION = { lostSightTicks: 45, dwellTicks: 60, scanDegrees: 90, seconds: 20,
  retainedAngles: 4, fallbackRadius: 90, fallbackCandidates: 12, fallbackPoints: 2, angleSpacing: 24 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Visible facing is a threat cue; distance and commitment still matter. Newly authored practice tuning. */
const DECISIONS_ADAPTATION = { facingCosine: 0.75, facingPriority: 0.65, blockedLaneCost: 2.5 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A flashed
 * bot sights nothing while its white-out (`BLIND_KEYS`, `blindplayer0<level>`, the strength a player's screen shows)
 * stands above this strength: level 1 (25 at most) never blinds it, level 2 about 2.75 s, level 3 about 9 s. */
const FLASH_BLIND_ADAPTATION = { seeBelowStrength: 30 };
/** The seconds a flash of `level` blinds a bot: until its white-out first falls below `FLASH_BLIND_ADAPTATION`'s strength. */
export function blindSeconds(level: 1 | 2 | 3): number {
  const keys = BLIND_KEYS[level], limit = FLASH_BLIND_ADAPTATION.seeBelowStrength;
  if (keys[0]!.strength < limit) return 0;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (b.strength < limit) return a.t + (b.t - a.t) * (a.strength - limit) / (a.strength - b.strength);
  }
  return keys.at(-1)!.t;
}
/**
 * OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. The
 * merge controller's smoke ruling: a bot sights nothing through a live smoke (`Room.smokeSources`), an upright cylinder
 * over the canister bounding the page's own puffs (`SMOKE_PLACEHOLDER`): each born `lift` up, flying out at `spread` and
 * up at `rise` under the exponential `drag` for its longest `life` (a travel of `v / drag x (1 - e^(-drag x life))`), then
 * its half-width at full growth (`size x grow / 2`). It stands from the detonation through the room's removal and on
 * for the last puff's life (`lingerTicks`: a puff born at the removal lives up to `life`'s longest and fades, dot's B138
 * review, finding 3) -- the bot's own memory of the cloud; the grenade's lifetime is unchanged. The wall follows the
 * placeholder when it is read. No wind or drift of the cloud as a whole is modelled (LATER 398).
 */
const puffTravel = (speed: number): number =>
  speed / SMOKE_PLACEHOLDER.drag * (1 - Math.exp(-SMOKE_PLACEHOLDER.drag * SMOKE_PLACEHOLDER.life[1]));
const SMOKE_SIGHT_ADAPTATION = {
  radius: puffTravel(SMOKE_PLACEHOLDER.spread) + SMOKE_PLACEHOLDER.size[1] * SMOKE_PLACEHOLDER.grow / 2,
  height: SMOKE_PLACEHOLDER.lift + puffTravel(SMOKE_PLACEHOLDER.rise[1]) + SMOKE_PLACEHOLDER.size[1] * SMOKE_PLACEHOLDER.grow / 2,
  lingerTicks: Math.ceil(SMOKE_PLACEHOLDER.life[1] * TICK_HZ),
};
/**
 * Whether the sight line `a` -> `b` passes through a live smoke's cylinder (`SMOKE_SIGHT_ADAPTATION`): the segment clipped
 * to the circle across (its span `[t0, t1]`), then that span's heights against the cylinder's foot and top.
 */
function smokeHides(sources: readonly (readonly [number, number, number])[], a: Point, b: Point): boolean {
  const { radius, height } = SMOKE_SIGHT_ADAPTATION;
  const dx = b[0] - a[0], dz = b[2] - a[2], qa = dx * dx + dz * dz;
  for (const c of sources) {
    const ox = a[0] - c[0], oz = a[2] - c[2];
    const qc = ox * ox + oz * oz - radius * radius;
    let t0: number, t1: number;
    if (qa === 0) { if (qc > 0) continue; t0 = 0; t1 = 1; }
    else {
      const qb = 2 * (dx * ox + dz * oz), disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      t0 = Math.max(0, (-qb - root) / (2 * qa)); t1 = Math.min(1, (-qb + root) / (2 * qa));
      if (t0 > t1) continue;
    }
    const y0 = a[1] + (b[1] - a[1]) * t0, y1 = a[1] + (b[1] - a[1]) * t1;
    if (Math.max(Math.min(y0, y1), c[1]) <= Math.min(Math.max(y0, y1), c[1] + height)) return true;
  }
  return false;
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Bot pad control, before the shared retail mover: short easing without changing human acceleration. */
const STEERING_ADAPTATION = { stickRate: 5, response: 20, lookResponse: 12, clearance: 8, arrival: 10,
  turnBase: 90, turnPerAccuracy: 1.5, restPitch: -9.167, patrolSpeed: 0.9, arrivalFloor: 0.3,
  sweepPhaseStep: 17, sweepDegrees: 75, watchLift: 12, contactLift: 12,
  // The steering's dead band: a waypoint nearer than this gives no stick, so one with route left is passed regardless
  // of the look-ahead (route[0] -> route[1] is a planned graph leg); bot-perf-2, MP51 seed 41.
  deadBand: 0.1 };
/**
 * BOT-CORNER (OT.R81, a bot adaptation: the port's invention, no original value -- a bot decision, not an unknown of the
 * game's). The walker takes a face's END along the face's own normal (viewer `WALL_END_CONTACT_READING`, MV-PARITY b2):
 * a body touching the end of the face across its way loses its whole move into that face, where the port's old push
 * off the corner slid it round. A bot steers itself round instead: a contact of the walker's last move (`wallHits`) at
 * a face's end -- within `reach` past `BODY_RADIUS` of the body, its direction from the contact off the face's normal
 * by more than `faceCosine` -- takes the wish's part toward that contact away, so the stick runs along the corner.
 * The players' walker is untouched: this is the bot's stick only. Under the walker's `'radial'` arm (the old corner push)
 * it does nothing, so that arm gives main's bots.
 * Known limit (BOT-CORNER review F3): `reach` is taken past `BODY_RADIUS` whatever the stance. A prone walker's contact
 * from the line ahead (`PRONE_FAN_READING`, up to 8.0 along the travel) can sit within that reach and be taken as a face
 * end, turning a prone bot's stick off it. Rare (bots seldom walk prone into walls), and it only turns the stick -- it
 * cannot push a body through a wall. A later change re-gates the filter on the stance, and the bot check reruns.
 */
const CORNER_SLIDE_ADAPTATION = { reach: 0.5, faceCosine: 0.999 };
/**
 * SEGMENT-BODY (OT.R81, a bot adaptation: the port's invention, no original value -- a bot decision, not an unknown of
 * the game's). Under the walker's segment body (viewer `WALL_BODY_READING` 'segments', research 217 s2.9) a face is met
 * by the body's segments, the side lines 1.05 to 4.2 across the travel: a bot whose leg passes a block's corner within
 * 4.2 of its next face meets that face with a side line, the walker takes the move's whole part along its normal, and
 * a wish straight into it is left with nothing (it stood at MP51-like corners until its stall recovery). When a hit's
 * face takes all but `along` of the wish, the bot steers along the face, away from the hit's side, at the wish's
 * length, until its segments clear the face. The players' walker is untouched: this is the bot's stick only.
 */
const SIDE_SLIDE_ADAPTATION = { along: 0.3 };
/**
 * BOT-CORNER (`CORNER_SLIDE_ADAPTATION`): the wish (dx, dz) less its parts toward the face ends the walker's last move
 * touched, at its length; a wish straight at an end turns along it to the bot's `side`. A contact on a face (its
 * direction the face's normal) is left to the walker, which slides along it already. `endContact` is the walker's
 * `WALL_END_CONTACT_READING`: under `'radial'` the walker pushes the body round itself, and the wish is left as it is.
 */
export function cornerSlide(hits: readonly WallHit[], x: number, z: number, dx: number, dz: number, side: number,
  endContact: 'face-normal' | 'radial' = WALL_END_CONTACT_READING): [number, number] {
  const length = Math.hypot(dx, dz);
  if (endContact !== 'face-normal' || !hits.length || length < 1e-6) return [dx, dz];
  let wx = dx, wz = dz, turned = false, ux = 0, uz = 0;
  for (const h of hits) {
    const ox = x - h.x, oz = z - h.z, d = Math.hypot(ox, oz);
    if (d < 1e-6 || d > BODY_RADIUS + CORNER_SLIDE_ADAPTATION.reach) continue;
    const n = polygonNormal(h.poly.points);
    const nl = n ? Math.hypot(n[0], n[2]) : 0;
    if (!n || nl < 1e-6) continue;
    const cx = ox / d, cz = oz / d;
    if (Math.abs((cx * n[0] + cz * n[2]) / nl) >= CORNER_SLIDE_ADAPTATION.faceCosine) continue;
    const into = wx * cx + wz * cz;
    if (into < 0) { wx -= into * cx; wz -= into * cz; turned = true; ux = cx; uz = cz; }
  }
  if (!turned) return WALL_BODY_READING === 'segments' ? sideSlide(hits, x, z, dx, dz, side) : [dx, dz];
  const left = Math.hypot(wx, wz);
  if (left < 1e-6 * length) { wx = -uz * side; wz = ux * side; return [wx * length, wz * length]; }
  return [wx / left * length, wz / left * length];
}
/** SEGMENT-BODY (`SIDE_SLIDE_ADAPTATION`): the wish turned along a face the walker's last move met that leaves it under `along`. */
function sideSlide(hits: readonly WallHit[], x: number, z: number, dx: number, dz: number, side: number): [number, number] {
  const length = Math.hypot(dx, dz);
  for (const h of hits) {
    const n = polygonNormal(h.poly.points);
    const nl = n ? Math.hypot(n[0], n[2]) : 0;
    if (!n || nl < 1e-6) continue;
    const nx = n[0] / nl, nz = n[2] / nl, into = dx * nx + dz * nz;
    if (into >= 0) continue;
    if (Math.hypot(dx - into * nx, dz - into * nz) >= SIDE_SLIDE_ADAPTATION.along * length) continue;
    const along = (x - h.x) * -nz + (z - h.z) * nx;                // from the hit to the body, along the face
    const sign = Math.abs(along) > 1e-6 ? Math.sign(along) : side;
    return [-nz * sign * length, nx * sign * length];
  }
  return [dx, dz];
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A bot's schedule: the tick stagger its seats share expensive checks over, the wait before a failed opening
 * leg is tried again, the least ticks between reload requests, the least distance a sampled claim is made at, and the
 * crouched shot-origin height it reasons from (world units, ticks). */
const SCHEDULE_ADAPTATION = { staggerTicks: 15, failedTacticTicks: 20 * TICK_HZ, reloadSpacingTicks: 30, minimumClaimDistance: 40,
  crouchShotEye: 9 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored kill-confirmation delay, not a recovered campaign timing. Native cadence and ammunition still bound it. */
const FIRE_OVERRUN_ADAPTATION = { minRounds: 2, maxRounds: 3, minSeconds: 0.18, maxSeconds: 0.3 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored pad policy: reduce speed continuously while following, never install a renewed stop timer. */
const CROWD_ADAPTATION = { minimumFollow: 0.2, movingSpeed: 2, shortcutCandidates: 6, sameFloor: 12, shortcutEveryTicks: 12 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A launcher's use: the least contact range, the allies' rear clearance behind it (distance and the cosine of
 * the rear cone), and the ticks between rockets (world units, room ticks). BOT-LAUNCHER (2026-11-02): no lower-after
 * ticks -- an abandoned launcher is lowered once the raise's clip is over on the room's own test (`launcherClipFree`). */
const LAUNCHER_ADAPTATION = { minimumRange: 175, rearClearance: 80, rearCosine: 0.6, refireTicks: 60,
  facingDegrees: 3 };

/**
 * BOT-LAUNCHER (2026-11-02; OT.R81, the bot's own choice): whether a launcher raise or lower sent with command `seq` falls
 * outside every kept launcher clip -- the room's refusal ('throw: launcher clip', `room.ts` `raiseLauncher` /
 * `lowerLauncher`, PAR-84) asked of the same `MoverSim.launcherClips` on the same `seq + 1`, so the wait is the clip's
 * own life (`launcherClipLife`, the clip table's played-out command), never a counted delay.
 */
function launcherClipFree(p: BotPlayer, seq: number): boolean {
  return !p.sim.launcherClips.liveOn(seq + 1);
}

/**
 * BOT-LAUNCHER: the firearm is in the hand and back up -- no launcher held, and the room's command count past the lower's
 * (`Player.firearmReadyAt`, M7: the room refuses a firearm round before it, 'fire: launcher', `room.ts` `fireAt`).
 * BOT-LAUNCHER-2: nor a launcher raise still waiting for its command (`heldNext`, NU-6 F1 `holdFrom`) -- the raise sent
 * with command S holds the launcher when S + 1 runs, and a round sent in between meets it there.
 */
function firearmBack(p: BotPlayer): boolean {
  return p.held === null && p.heldNext === null && p.ran >= p.firearmReadyAt;
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. A carried grenade's use around the native throw: the cooldown between equipment, the ally clearance at the
 * landing (with `BOT_THROW_ADAPTATION.impactMargin`), the lane check's near cut, the enemies counted at the landing, the
 * hold after a throw and the fuse assumed when a record has none (world units, ticks, seconds). */
const EQUIPMENT_USE_ADAPTATION = { cooldownTicks: 6 * TICK_HZ, allyLanding: 150, laneNearCut: 25, enemyLanding: 70,
  holdTicks: 6, defaultFuseSeconds: 3, facingDegrees: 3, sameFloor: 12, aimLift: 12, arcSamples: 12, arcWallSamples: 9 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Stable local right-of-way is ours; it never changes the shared mover or a human's controls. */
const TRAFFIC_ADAPTATION = { radius: 25, ahead: 0.35, yieldTicks: 12, overlap: 8, passDistance: 24,
  // BOT-CORNER, the MP51 ramp wedge (OT.R81, a bot adaptation): a priority bot whose leg clears the walls but has been
  // refused by the same standing teammate bot's body this many ticks running takes its leg (half a stall window, under
  // `stuckTicks` 60, so before its stall recovery). The room's bodies do not collide; the teammate, giving way, may have
  // found no side and no back-off on a narrow way, and each waited on the other. Likewise a bot giving way to the same
  // stopped, routeless teammate bot, not coming at it, this many ticks with no side and no planned leg clear walks its
  // leg where the walls let it. A human keeps its priority in both.
  deadlockTicks: 30 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Authored input preference, capped by the native base pellet radius (damage.ts, research 94 §C2.1).
 * This chooses where our CPU engages; it is not a hard damage cutoff or a recovered AI rule. */
const PELLET_ENGAGEMENT_RANGE_ADAPTATION = Math.sqrt(SHOTGUN_PELLET_RANGE_SQ.base);
/**
 * OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. P537-L3
 * climbs (Fuse's e7d271abb, his literal 8): the scratch mover ticks a room step gives the climb discovery's probe
 * (`BotClimbDiscovery.step`), its own budget beside the navigation jobs'; one scratch mover a step at most.
 */
const BOT_CLIMB_DISCOVERY_ADAPTATION = { ticksPerStep: 8 };

/** CPU seats in the human's authoritative room, authored extension FBA.R5. No extra damage/health or alternate movement. */
/**
 * OT.R81 (BTL.R8, the merge controller, 2026-10-24): the rules in which a human who joins a game whose places CPUs hold
 * takes one at once -- the CPU leaves through the ordinary leave, the human is promoted through the lobby's queue. The
 * port's own rule (the original's online had no bots): a respawn game has no round boundary before its match's end to wait
 * for. Central's admission counts the same places (`RoomBots.replacementSlots`).
 */
export const CPU_SEAT_REPLACED_AT_JOIN_ADAPTATION = 'respawn' as const;

/**
 * BOT-DOOR-PRESS (the review of f6e5a0fd5, F2): whether the leg `a`-`b` crosses door `door`'s leaf where it stands, on
 * the ground plane -- the leaf as the segment from its hinge (`DoorSpec.sweep`'s centre) to its farthest point.
 */
function crossesLeaf(doors: Room['doors'], door: number, a: Point, b: Point): boolean {
  const s = doors.specs[door]?.sweep;
  if (!s) return false;
  const hx = (s.minX + s.maxX) / 2, hz = (s.minZ + s.maxZ) / 2;
  let fx = hx, fz = hz, best = -1;
  for (const pts of doors.leaf(door)) for (let k = 0; k < pts.length; k += 3) {
    const d = Math.hypot(pts[k]! - hx, pts[k + 2]! - hz);
    if (d > best) { best = d; fx = pts[k]!; fz = pts[k + 2]!; }
  }
  if (best <= 0) return false;
  const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return side(a[0], a[2], b[0], b[2], hx, hz) !== side(a[0], a[2], b[0], b[2], fx, fz)
    && side(hx, hz, fx, fz, a[0], a[2]) !== side(hx, hz, fx, fz, b[0], b[2]);
}

export class MatchBots {
  private readonly actors = new Map<number, Actor>();
  /** NPB-3: the seats of ctors this brain did not seat (dopt); the roster, the character pick and dispose leave them be. */
  private readonly adopted = new Set<number>();
  /**
   * COMBINED-CUT (OT.R93; the fresh review's F1): an adopted seat's `MoverSim.ai` before its adoption, put back at its
   * release. While this brain drives a seat, its controller is the AI's (`IsAi`, research 191 section 4): the stick's
   * cut of its stance clips is refused by id (`FUN_00587c20` D:L445536-445545), as on the brain's own CPU seats.
   */
  private readonly adoptedAi = new Map<number, boolean>();
  /**
   * The smokes a bot's sight reads (`smokes`), by projectile id: where each pours, and the tick its last puff dies once
   * the room has removed it (`null` while it still pours). Cleared at a new round, as the page's effects are.
   */
  private readonly clouds = new Map<number, { at: readonly [number, number, number]; until: number | null }>();
  private cloudRound = '';
  private readonly navigation: WalkingNavigation;
  private readonly ladderDrives = new Map<number, {actor:Actor; body:MoverSim; drive:BotLadderDrive}>();
  private readonly climbDrives=new Map<number,{actor:Actor;body:MoverSim;drive:BotClimbDrive}>();
  private readonly positions: CombatPositions;
  private readonly sounds = new BotSounds();
  private readonly random: () => number;
  private readonly kits: SimKits | null;
  private readonly tactics: TeamTactics;
  private readonly squad = new SquadCoordinator();
  /** BOP-S: the bots' deferrable navigation, time-sliced (`navScheduler.ts`). */
  private readonly jobs: NavScheduler;
  /** BOP-S S4: the door-change replan stagger's switch (`BOT_DOOR_STAGGER_ADAPTATION`). */
  private readonly doorStagger: boolean;
  private lastStep = -1;
  private doorState = '';
  /** BOP-S: the last tick's `movingHullStamp` (null: something was moving). */
  private hullState: string | null = null;
  /**
   * P537-L3: PR #537's behaviours this room runs (pursuit, ladders, climbs, routes), each its own switch, resolved once
   * per room from its map and rules (`../botGates` `botBehaviours`): pursuit alone in a Frostfire or Vigilance respawn
   * room (BTL.R11), all off in every other public room -- main's bots exactly.
   */
  readonly behaviours: BotBehaviours;
  /**
   * P537-L3 (2): CPU seats the room demoted to its queue (`seatRemoved`) -- spectators now, driven by nobody -- left at
   * the next `step`, never inside the room's own idle pass that told them.
   */
  private readonly departing = new Set<number>();

  static async prepare(room: Room, options: MatchBotOptions, yieldWork: () => Promise<void>): Promise<MatchBots> {
    const behaviours = options.behaviours ?? botBehaviours(room.map.stem, room.rules === 'respawn');
    const navigation = MatchBots.walkingNavigation(room, options, behaviours), random = options.random ?? Math.random;
    const tactics = await TeamTactics.prepare(navigation, random, options.teamProfile, yieldWork);
    return new MatchBots(room, { ...options, random, behaviours }, { navigation, tactics });
  }

  /** P537-L3: the room's ladders switch decides whether the disc's ladders join its graph (`WalkingNavigation`). */
  private static walkingNavigation(room: Room, options: MatchBotOptions, behaviours: BotBehaviours): WalkingNavigation {
    const prepared = options.navigation ? validateBotNavigation(room.map, options.navigation) : null;
    if (options.navigation && !prepared) throw new Error('Invalid prepared bot navigation');
    return new WalkingNavigation(room.map, prepared ?? undefined, false, { ladders: behaviours.ladders });
  }

  constructor(private readonly room: Room, options: MatchBotOptions = {}, prepared?: { navigation: WalkingNavigation; tactics: TeamTactics }) {
    this.random = options.random ?? Math.random;
    this.kits = options.kits ?? null;
    this.behaviours = options.behaviours ?? botBehaviours(room.map.stem, room.rules === 'respawn');
    this.navigation = prepared?.navigation ?? MatchBots.walkingNavigation(room, options, this.behaviours);
    this.navigation.setDoorState((door) => this.room.doors.state(door));   // BOT-DOOR's fold: the planner's door edges
    // P537-L3 climbs (Fuse's e7d271abb): the room's clips let the navigation find climbs. Off: never configured -- no
    // discovery, no climb link, main's refusals between components.
    if (this.behaviours.climbs) this.navigation.configureClimbing(room.clips);
    this.positions = new CombatPositions(this.navigation);
    if (botProfiler()) instrumentNavigation(this.navigation);   // BOP-1: counting wrappers, only with the profiler on
    this.tactics = prepared?.tactics ?? new TeamTactics(this.navigation, this.random, options.teamProfile);
    this.tactics.pursuit = this.behaviours.pursuit;              // P537-L3 pursuit: its team commitments
    this.jobs = new NavScheduler(this.navigation, options.navWork ?? BOT_ROUTE_WORK_PER_TICK_ADAPTATION, BOT_NAV_JOB_ADAPTATION, (id) => this.feetOf(id));
    this.doorStagger = options.doorStagger ?? BOT_DOOR_STAGGER_ADAPTATION;
    this.doorState = this.doorsState();
  }

  /** Where a living bot stands (null: no body). */
  private feetOf(id: number): Point | null {
    const p = this.room.player(id), s = p?.alive ? p.sim.walker.state : null;
    return s ? [s.x, s.y, s.z] : null;
  }

  /**
   * BOP-S (the review's F3; s11's bot 235): a cover given up because the bot could not hold it -- its route failed, it
   * stalled on the way, or it stood near the hide point unprotected -- was chosen again at the next re-plan (the choice
   * is deterministic), and the bot cycled there. The hide point is kept out of this bot's own choices (as a reserved
   * point, the squad's radius) until `TACTICS_ADAPTATION.givenUpTicks` pass or the hull moves (a door, a gate, the world).
   */
  private giveUpCover(b: Actor, tick: number): void {
    if (!b.cover) return;
    b.givenUp = [...(b.givenUp ?? []), { hide: [...b.cover.hide], until: tick + TACTICS_ADAPTATION.givenUpTicks,
      revision: this.navigation.revision, hull: this.hullState }];
  }

  /** The hide points this bot gave up that still stand (see `giveUpCover`). */
  private givenUpHides(b: Actor, tick: number): Point[] {
    if (!b.givenUp?.length) return [];
    b.givenUp = b.givenUp.filter((g) => tick < g.until && g.revision === this.navigation.revision && g.hull === this.hullState);
    return b.givenUp.map((g) => g.hide);
  }

  /** BOP-S's instrument: the navigation jobs' ages, starved and redone counts, and the work counter. */
  navigationStats(): NavJobStats & { work: number; pending: number } {
    return { ...this.jobs.stats(), work: this.navigation.work, pending: this.jobs.pendingCount() };
  }

  private doorsState(): string {
    return this.room.doors.specs.map((_, i) => { const s = this.room.doors.state(i); return `${s.valve}:${s.busy}`; }).join(',');
  }

  botIds(): readonly number[] { return [...this.actors.keys()]; }

  tacticalAssignments(): readonly TacticalAssignment[] { return this.tactics.assignments().filter((a) => this.actors.get(a.id)?.team === a.team); }

  metadata(): readonly { id: number; name: string; team: Team; bot: true }[] {
    // The name is the lobby's (H316's `botNameFor`), never a made-up one that could repeat another seat's.
    return [...this.actors.values()].flatMap((b) => {
      const member = this.room.lobby.member(b.id);
      return member ? [{ id: b.id, team: b.team, bot: true as const, name: member.name }] : [];
    });
  }

  /** Regional/native character appearances are independent of each persistent gamer tag. */
  prepareCharacters(newMatch: boolean): void {
    if (newMatch) this.resetCharacters();
    const catalogue = this.room.map.characters;
    if (!catalogue) return;
    const used = new Set<string>(), models: Record<Team, Set<string>> = { seal: new Set(), terrorist: new Set() };
    // BOTN (a browser adaptation, the owner's word, `botModelFor`): a named bot's fixed model on its map, first, every
    // match -- HUGE's raincoat on Frostfire. The room broadcasts the key, so every page draws the same model.
    const fixed = new Set<number>();
    for (const b of this.actors.values()) {
      if (this.adopted.has(b.id)) continue;
      const name = this.room.lobby.member(b.id)?.name, model = name ? botModelFor(name, this.room.map.stem) : null;
      const choice = model ? catalogue.choices.find((c) => c.team === b.team && c.model === model && catalogue.pool?.[b.team]?.includes(c.key))
        ?? catalogue.choices.find((c) => c.team === b.team && c.model === model) : undefined;
      if (!choice) continue;
      if (this.room.botCharacter(b.id) !== choice.key && !this.room.setBotCharacter(b.id, choice.key)) continue;
      fixed.add(b.id); used.add(choice.identity); models[b.team].add(choice.model);
    }
    for (const b of this.actors.values()) {
      if (this.adopted.has(b.id) || fixed.has(b.id)) continue;
      const existing = catalogue.choices.find((c) => c.key === this.room.botCharacter(b.id));
      if (existing?.team === b.team) { used.add(existing.identity); models[b.team].add(existing.model); }
    }
    for (const b of this.actors.values()) {
      if (this.adopted.has(b.id) || this.room.botCharacter(b.id)) continue;
      const choice = chooseBotCharacter(catalogue, b.team, used, this.random, models[b.team]);
      if (choice && this.room.setBotCharacter(b.id, choice.key)) { used.add(choice.identity); models[b.team].add(choice.model); }
    }
  }

  resetCharacters(): void {
    for (const b of this.actors.values()) {
      if (!this.adopted.has(b.id) && this.room.botCharacter(b.id)) this.room.setBotCharacter(b.id, null);
    }
  }

  dispose(): void {
    for (const id of this.actors.keys()) this.jobs.cancel(id);
    this.ladderDrives.clear();
    this.climbDrives.clear();
    this.squad.reset('disposed');
    this.tactics.dispose();
    const ids = [...this.actors.keys()].filter((id) => !this.adopted.has(id));
    for (const id of this.adopted) {
      const p = this.room.player(id);
      if (p) {
        p.raise = false; p.sim.ai = this.adoptedAi.get(id) ?? false;                               // OBF-14, COMBINED-CUT: as `release`
        p.sim.walker.weaponLineCast = !p.sim.ai || WEAPON_LINE_BOTS_READING === 'cast';           // SEGMENT-BODY part 4 (review 2 F3): as `release`
      }
    }
    this.actors.clear(); this.adopted.clear(); this.adoptedAi.clear();
    for (const id of ids) this.room.leave(id);
  }

  private hostile(a: number, other: number): boolean {
    const x = this.room.lobby.member(a), y = this.room.lobby.member(other);
    return !!x?.team && !!y?.team && x.team !== y.team;
  }

  /** One brain for a seat already in the room: what setRoster builds for a seat it made and dopt for one it did not. */
  private newActor(id: number, team: Team, ordinal: number, role: BotRole): Actor {
    const p = this.room.player(id)!, s = p.sim.walker.state;
    return { role, firePolicy: new BotFirePolicy(), id, team, ordinal, body: p.sim, route: [], target: null, hunt: null, memory: null, memoryUntil: 0, memoryHeight: 12, contactRevision: 0, visibleSince: 0,
          lastPlan: -1000, lastShot: -1000, lastReload: -1000, yaw: s.yaw, pitch: s.pitch, progress: [s.x, s.y, s.z],
          progressAt: this.room.tick, recoverUntil: 0, side: this.random() < 0.5 ? -1 : 1, alive: true, behaviour: 'patrol',
          actionUntil: 0, reposition: null, fired: null, overrun: null,
          cover: null, coverPhase: 'hide', coverPhaseUntil: 0, coverPlanAt: -1000,
          danger: null, dangerUntil: 0, pressureUntil: 0, pressureReadyAt: 0,
          tracked: null, trackTicks: 0, lastSeen: -1000, aimOffset: [0, 0], aimSampleAt: 0,
          search: null, heard: null, stick: [0, 0], tacticGoal: null,
          equipment: null, lastEquipment: -1000, throwHoldUntil: 0, lastDodge: -1000,
          failedTactic: null,
          yieldUntil: 0, yieldFor: null, passing: null, trafficScale: 1, seen: [], planner: new BotPlan(), pathFailedUntil: 0 };
  }

  /**
   * NPB-3: drive a seat the room already holds -- a Forge NPC, seated by its own connection with its marker and model --
   * with this brain, as a lobby bot is. The seat stays its owner's: the room is never asked to seat or release it, the
   * roster and the character pick leave it alone, and dispose does not drop it. Returns the handler for the
   * seat's server events (the brain listens for what it hears and how its shots land), or null when the room holds no
   * living-side player under that id.
   */
  adopt(id: number): ((event: ServerEvent) => void) | null {
    const member = this.room.lobby.member(id);
    if (!member || member.role !== 'player' || !member.team || !this.room.player(id) || this.actors.has(id)) return null;
    const team = member.team;
    const peers = [...this.actors.values()].filter((b) => b.team === team);
    let ordinal = 1;
    while (peers.some((b) => b.ordinal === ordinal)) ordinal++;
    const role = chooseRole(peers.map((x) => x.role));
    // NPB-8: the kit a lobby bot of this role is issued, on the type the seat holds (the room's own armory rules decide
    // it; refused or no kits, the seat keeps the kit it has). A seat already in a round keeps its kit until it respawns.
    const held = this.room.player(id)!.nextChar, loadout = botLoadout(this.kits, team, this.random, role, held);
    if (loadout) this.room.text(id, { type: 'loadout', char: held, picks: loadout.picks });
    const b = this.newActor(id, team, ordinal, role);
    this.actors.set(id, b); this.adopted.add(id);
    const sim = this.room.player(id)!.sim;
    this.adoptedAi.set(id, sim.ai); sim.ai = true;               // COMBINED-CUT: IsAi while driven (a respawn's mover carries it)
    sim.walker.stanceCut = false; sim.walker.stanceSeparate = false;   // MOVE fold F3: the bots' words, not the human's last mode
    sim.walker.weaponLineCast = WEAPON_LINE_BOTS_READING === 'cast';   // SEGMENT-BODY part 4: the AI casts no weapon line (+0x2c 0)
    return (event) => this.hear(id, event);
  }

  /** Let go of an adopted seat: it keeps its place in the room and stops being driven. */
  release(id: number): void {
    if (!this.adopted.delete(id)) return;
    const p = this.room.player(id);
    if (p) p.raise = false;                                      // OBF-14 review F1: the raise was the bots', not the seat's
    if (p) p.sim.ai = this.adoptedAi.get(id) ?? false;           // COMBINED-CUT: the seat's own controller again
    if (p) p.sim.walker.weaponLineCast = !p.sim.ai || WEAPON_LINE_BOTS_READING === 'cast';   // SEGMENT-BODY part 4: and its weapon line
    this.adoptedAi.delete(id);
    this.squad.release(id, 'released'); this.removeActor(id);
  }
  private removeActor(id: number): void { this.ladderDrives.delete(id);this.climbDrives.delete(id); this.actors.delete(id); this.jobs.cancel(id); }
  /** The game layer calls only at lobby or round boundaries. Living classic rosters never change here. */
  /**
   * `o.late` (FF-4, FF.R8; product track, the FF lobby only: `RoomBots.ffLaunched`): a CPU seated here enters as a late
   * joiner -- the bridge's late flag a human seated after the launch carries (`Room.hello`'s `as.late`). FF-4 (FF.R8), a
   * CPU entering a running respawn round as a late joiner: the controller's reading, pending review -- BTL.R8/H315's
   * late-human mechanism (RC4), `FUN_002b7d60` D:L158619-158647, `FUN_00543d50` D:L410440, `FUN_00592560`
   * D:L451699-451724: no body until its `loaded` (sent at the next `step`), then dead at load at a start slot, up only by
   * the respawn press past 5 s, which `step` gives a dead CPU as a player's pad would. No spawn of its own. Absent: as before.
   */
  setRoster(roster: { seal: number; terrorist: number }, o: { late?: boolean } = {}): void {
    // A classic round's roster waits for its boundary. A respawn game (the only one with bots, H315) has none before its
    // match's end, so its roster changes at once (BTL.R8: a queued human takes a CPU's place).
    if (this.room.roundRunning && this.room.rules !== CPU_SEAT_REPLACED_AT_JOIN_ADAPTATION) return;
    const count = (x: number): number => Number.isFinite(x) ? Math.max(0, Math.min(8, Math.round(x))) : 0;
    for (const [id, actor] of this.actors) {
      if (this.adopted.has(id)) continue;
      const member = this.room.lobby.member(id), player = this.room.player(id);
      if (!member || !player || member.role !== 'player' || !member.team) {
        this.squad.release(id, 'disconnected');
        this.removeActor(id);
        if (member) this.room.leave(id);
        continue;
      }
      // Native SWITCH TEAMS / clan side swaps rebuild a seat without replacing its connection or ownership.
      // Follow that authoritative move; forgetting only the actor would leak an uncontrolled CPU into the roster.
      if (actor.team !== member.team) {
        actor.team = member.team;
        actor.ordinal = 1;
        while ([...this.actors.values()].some((b) => b !== actor && b.team === actor.team && b.ordinal === actor.ordinal)) actor.ordinal++;
        this.room.setBotCharacter(id, null);
        actor.role = chooseRole([...this.actors.values()].filter((b) => b !== actor && b.team === actor.team).map((b) => b.role));
        actor.firePolicy.reset();
        const loadout = this.botLoadoutFor(member.name, actor.team, actor.role);
        if (this.kits?.map && !loadout) { this.squad.release(id, 'roster-changed'); this.removeActor(id); this.room.leave(id); continue; }
        if (loadout) this.room.text(id, { type: 'loadout', char: loadout.char, picks: loadout.picks });
        this.room.text(id, { type: 'ready' });
      }
      const sim = this.room.player(id)!.sim;
      if (actor.body !== sim) {
        this.resetCombat(actor); actor.body = sim;
        actor.yaw = sim.walker.state.yaw; actor.pitch = sim.walker.state.pitch;
      }
    }
    const wantedFor = (team: Team): number => {
      const humans = this.room.lobby.players().filter((p) => p.team === team && (!this.actors.has(p.id) || this.adopted.has(p.id))).length;
      return Math.min(count(roster[team]), Math.max(0, 8 - humans));
    };
    // Release both sides first so a full smaller room can transfer a CPU place to the other team.
    for (const team of ['seal', 'terrorist'] as const) {
      const seated = [...this.actors.values()].filter((b) => b.team === team && !this.adopted.has(b.id));
      while (seated.length > wantedFor(team)) { const b = seated.pop()!; this.squad.release(b.id, 'roster-changed'); this.removeActor(b.id); this.room.leave(b.id); }
    }
    for (const team of ['seal', 'terrorist'] as const) {
      const wanted = wantedFor(team), seated = [...this.actors.values()].filter((b) => b.team === team && !this.adopted.has(b.id));
      while (seated.length < wanted && this.room.lobby.players().length < 16) {
        // Reuse free u8 seats; server freeId consults this same room membership.
        let id = 239;
        while (id > 0 && this.room.lobby.member(id)) id--;
        if (id === 0) break;
        let ordinal = 1;
        while (seated.some((b) => b.ordinal === ordinal)) ordinal++;
        // H316: a name from the seat's own side (the campaign's characters), never one a seat or watcher holds.
        const name = botNameFor(team, [...this.room.lobby.players(), ...this.room.lobby.spectators()].map((m) => m.name), this.random);
        const role = chooseRole(seated.map((b) => b.role));
        const loadout = this.botLoadoutFor(name, team, role);
        if (this.kits?.map && !loadout) break;
        const hello = this.room.hello(id, { cpu: true, send: (f) => {
          if (typeof f === 'string') this.hear(id, JSON.parse(f) as ServerEvent);
        }, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name, map: this.room.map.stem,
          ...(loadout ? { types: { [team]: loadout.char } } : {}) }, '', { side: team, ...(o.late === true ? { late: true } : {}) });
        if (!hello) break;
        if (!this.room.player(id)) { this.room.leave(id); break; }
        if (loadout) this.room.text(id, { type: 'loadout', char: loadout.char, picks: loadout.picks });
        this.room.text(id, { type: 'ready' });
        const b = this.newActor(id, team, ordinal, role);
        this.actors.set(id, b); seated.push(b);
      }
    }
  }

  /**
   * BOTN (a browser adaptation, `botNativeTypeFor`): a bot whose name has a fixed model on this map that one of the side's
   * native armory types wears is kitted within that type (`botLoadout`'s `only`), so its hello's types, its loadout and
   * its spawn carry it on every host, catalogue or not. One type draw either way (`only` narrows the candidates, the
   * draws are the same index and pistol draws); a type the armory refuses falls back to the side's normal draw (a
   * refusal consumes no draw). Every other bot: `botLoadout` as before.
   */
  private botLoadoutFor(name: string, team: Team, role: BotRole): ReturnType<typeof botLoadout> {
    const only = this.kits?.map ? botNativeTypeFor(name, this.room.map.stem, this.kits.map.kits[team]) : undefined;
    return (only !== undefined ? botLoadout(this.kits, team, this.random, role, only) : null) ?? botLoadout(this.kits, team, this.random, role);
  }

  private remember(b: Actor, id: number | null, at: Point, height = 12): void {
    if (b.overrun && b.overrun.victim !== id) b.overrun = null;
    const changed = b.hunt !== id || !b.memory || Math.hypot(at[0] - b.memory[0], at[2] - b.memory[2]) > BOT_AI_ADAPTATION.waypoint;
    const s = this.room.player(b.id)?.sim.walker.state;
    const committed = s && this.tactics.intent(b.id, [s.x, s.y, s.z], this.room.tick);
    if (changed) {
      b.contactRevision++;
      b.search = null; b.pathFailedUntil = 0; this.jobs.cancel(b.id, 'search');
      if (!committed) { b.route = []; b.lastPlan = -1000; this.jobs.cancel(b.id, 'route'); }
    }
    if (b.hunt !== id) { b.cover = null; b.coverPlanAt = -1000; b.reposition = null; this.jobs.cancel(b.id, 'cover'); }
    b.hunt = id; b.memory = [...at]; b.memoryHeight = height;
    // Travel does not consume the area-search budget. Fresh evidence renews an ongoing area search.
    b.memoryUntil = b.search ? this.room.tick + SEARCH_ADAPTATION.seconds * TICK_HZ : 0;
  }

  private forget(b: Actor, reason = 'contact-lost'): void {
    b.contactRevision++; this.jobs.cancel(b.id);
    this.squad.release(b.id, reason);
    b.planner.reset('contact-forgotten'); b.pathFailedUntil = 0;
    this.tactics.release(b.id); b.tacticGoal = null;
    b.fired = null; b.overrun = null;
    b.hunt = null; b.target = null; b.memory = null; b.memoryUntil = 0;
    b.route = []; b.search = null; b.cover = null; b.reposition = null; b.lastPlan = -1000;
    b.danger = null; b.dangerUntil = 0;
    b.tracked = null; b.trackTicks = 0; b.lastSeen = -1000;
  }

  private listen(b: Actor, sound: CombatSound): void {
    const own = this.room.player(b.id);
    if (!own?.alive || !this.hostile(b.id, sound.id)) return;
    const s = own.sim.walker.state;
    if (!audibleSound(this.room.map.grid, sound, [s.x, s.y, s.z])) return;
    // Gunfire takes priority over an unconfirmed footstep trail; a seen opponent keeps the fighter's attention.
    if (b.target !== null && b.target !== sound.id) return;
    const strongerCue = sound.kind === 'shot' && b.heard?.kind === 'footstep' && b.tracked !== b.hunt;
    if (b.hunt !== null && b.hunt !== sound.id && !strongerCue) return;
    // P537-L3 pursuit (Fuse's 7a2b34909): the team's investigator is a listener free to go; off, main's (any listener).
    if (b.target === null && !this.tactics.investigate(b.id, sound.at, this.room.tick, sound.range, !this.behaviours.pursuit ? undefined : id => {
      const candidate = this.actors.get(id), player = this.room.player(id);
      if (!candidate || !player?.alive || candidate.target !== null) return false;
      const stronger = sound.kind === 'shot' && candidate.heard?.kind === 'footstep' && candidate.tracked !== candidate.hunt;
      if (candidate.hunt !== null && candidate.hunt !== sound.id && !stronger) return false;
      const at = player.sim.walker.state;
      return id === b.id || audibleSound(this.room.map.grid, sound, [at.x,at.y,at.z]);
    })) return;
    b.heard = { kind: sound.kind, at: [...sound.at], tick: this.room.tick };
    if (b.target === null) this.remember(b, sound.id, sound.at);
  }

  private hear(id: number, ev: ServerEvent): void {
    const prof = botProfiler();   // BOP-1: a kill by this seat, counted once (by the killer's own connection)
    if (prof && ev.type === 'kill' && ev.killer === id && this.botSeat(id)) prof.kill(this.botSeat(ev.victim) ? 'bot' : 'human');
    if (ev.type === 'kicked' || ev.type === 'demoted') { this.seatRemoved(id, ev.type === 'demoted'); return; }
    const b = this.actors.get(id), own = this.room.player(id);
    if (!b || !own?.alive) return;
    if (ev.type === 'kill') {
      if (b.hunt === ev.victim) {
        const overrun = this.killOverrun(b, own, ev);
        this.forget(b); b.overrun = overrun;
      }
      return;
    }
    if (ev.type === 'left') {
      if (b.overrun?.victim === ev.id) b.overrun = null;
      if (b.hunt === ev.id) this.forget(b);
      return;
    }
    if (ev.type === 'impact') {
      if (ev.body === id && this.hostile(id, ev.id)) this.threatened(b, ev.from, ev.id);
      return;
    }
    if (ev.type === 'blast') { if (ev.flash) this.flashed(b, ev.flash); return; }
    const s = own.sim.walker.state;
    if (ev.type === 'hurt') { this.threatened(b, ev.from); return; }
    if (ev.type !== 'shot') return;
    const shooter = this.room.player(ev.id);
    if (!shooter || !this.hostile(b.id, ev.id)) return;
    const chest = own.sim.walker.posture === 'prone' ? 3 : own.sim.walker.posture === 'crouch' ? 8 : 12;
    if (pointSegment([s.x, s.y + chest, s.z], ev.from, ev.to) < TACTICS_ADAPTATION.nearMiss
      && (b.hunt !== ev.id || this.room.tick > b.pressureUntil)) {
      this.threatened(b, ev.from, ev.id); return;
    }
    // BTL.R2 (review (a) 7): the sound's place is the event's own (its eye at `from`), never the shooter's exact state.
    this.listen(b, shotSound(ev.id, [ev.from[0], ev.from[1] - EYE_HEIGHT, ev.from[2]], shooter.records.find((r) => r.id === ev.weapon) ?? shooter.records[0]));
  }

  /**
   * P537-L3 (2), the MP64 crash (6d's REPORT: `stats()`'s `player(b.id)!` met a bot actor with no room player): the room
   * removes a seat inside its own step -- the idle kick (W3.R13, `Room.idle`) kicks a seat that sent no active input for
   * the idle time, or with a queue demotes it -- and tells the seat as it does (`kicked` before its `leave`, `demoted`
   * after its body goes). The actor goes at that moment, so no read between the room's step and the bots' next one
   * (`stats`, any `player(b.id)!`) meets an actor without its player. A demoted CPU seat of this set leaves the room at
   * the next step (`departing`); an adopted seat is its owner's to keep.
   */
  private seatRemoved(id: number, demoted: boolean): void {
    if (!this.actors.has(id)) return;
    if (demoted && !this.adopted.has(id)) this.departing.add(id);
    this.squad.release(id, 'disconnected');
    this.removeActor(id); this.adopted.delete(id); this.adoptedAi.delete(id);
  }

  private threatened(b: Actor, from: Point, source?: number): void {
    this.tactics.contact(b.id, this.room.tick);
    b.overrun = null; b.fired = null;
    this.squad.cancelSupport(b.id, 'pressure');
    if (b.search) { b.search = null; b.route = []; b.lastPlan = -1000; }
    const origin: Point = [from[0], from[1] - EYE_HEIGHT, from[2]];
    b.danger = origin; b.dangerUntil = this.room.tick + TACTICS_ADAPTATION.dangerFocusTicks;
    if (this.room.tick >= b.pressureReadyAt) {
      // Repeated hits can renew attention, but cannot extend the same hiding reaction indefinitely.
      b.pressureUntil = this.room.tick + TACTICS_ADAPTATION.pressureHideTicks;
      b.pressureReadyAt = this.room.tick + TACTICS_ADAPTATION.pressureTicks;
    }
    if ((source !== undefined && source !== b.hunt) || !b.memory
      || Math.hypot(b.memory[0] - origin[0], b.memory[2] - origin[2]) > TACTICS_ADAPTATION.dangerRadius) {
      b.target = null; this.remember(b, source ?? b.hunt, origin);
      b.cover = null; b.coverPlanAt = -1000; b.route = []; b.lastPlan = -1000;
    } else if (b.cover && this.room.tick < b.pressureUntil) { b.coverPhase = 'hide'; b.coverPhaseUntil = 0; b.route = []; }
  }

  /**
   * Area (a)'s narrow check, and P2 (the online-parity sweep's TB-1; research 85 s9.5, s12): a flashbang whites a bot
   * out as it whites a player out -- at the level the room's gated blast resolved on the bot's own body and told it
   * (`blast.flash`: the line to the head and the friendly-fire gate, FLASH_FRIENDLY_FIRE_READING; the player controller's
   * 0x597c00 rule from its feet and facing). It sights nothing while that white-out holds (`blindSeconds`). Was
   * (BOTS-LAND to P2): the page's ungated rule at every flash that went off (`Room.detonations`), LATER 399.
   */
  private flashed(b: Actor, level: 1 | 2 | 3): void {
    const seconds = blindSeconds(level);
    if (seconds <= 0) return;
    b.blindUntil = Math.max(b.blindUntil ?? 0, this.room.tick + Math.ceil(seconds * TICK_HZ));
    b.target = null; b.seen = [];
  }

  /**
   * The smokes a bot's sight reads (`SMOKE_SIGHT_ADAPTATION`): each one pouring (`Room.smokeSources`' window, read from
   * `Room.detonations`), then, once the room has removed it, its last puff's life (`lingerTicks`; dot's B138 review,
   * finding 3). A new round clears them.
   */
  private smokes(): void {
    const round = `${this.room.currentMatch().serial}:${this.room.round}`, tick = this.room.tick;
    if (round !== this.cloudRound) { this.clouds.clear(); this.cloudRound = round; }
    const live = new Set<number>();
    for (const d of this.room.detonations()) {
      if (d.kind !== 'smoke') continue;
      live.add(d.pid);
      this.clouds.set(d.pid, { at: d.at, until: null });
    }
    for (const [pid, c] of this.clouds) {
      if (live.has(pid)) continue;
      if (c.until === null) c.until = tick + SMOKE_SIGHT_ADAPTATION.lingerTicks;
      if (tick >= c.until) this.clouds.delete(pid);
    }
  }

  private perceive(b: Actor, feet: Point): void {
    const p = this.room.player(b.id)!, yaw = p.sim.walker.state.yaw * Math.PI / 180;
    const eye: Point = [feet[0], feet[1] + scopeEyeHeight(p.sim.walker.posture), feet[2]];
    const frame = p.cone.frame(p.sim.seq), muzzle = frame ? this.shotOrigin(b.id, frame) : null;
    b.seen = [];
    if (b.blindUntil !== undefined && this.room.tick < b.blindUntil) { b.target = null; return; }   // flashed: it sights nothing
    const smoke = [...this.clouds.values()].map((c) => c.at);
    let best: { id: number; at: Point; score: number } | null = null;
    for (const m of this.room.lobby.players()) {
      if (!this.hostile(b.id, m.id)) continue;
      const enemy = this.room.player(m.id);
      if (!enemy?.alive) continue;
      const s = enemy.sim.walker.state;
      const at: Point = [s.x, s.y, s.z], dx = s.x - feet[0], dz = s.z - feet[2], d = Math.hypot(dx, dz);
      // The merge controller's ruling (BOTS-LAND, 2026-10-24): the sight range is the vision adaptation alone; the weapon's range
      // (metres, scaled to world units) bounds only the fire preference (`withinWeaponPreference`).
      if (d > BOT_AI_ADAPTATION.vision) continue;
      if (d > 1 && (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d < Math.cos(BOT_AI_ADAPTATION.fov * Math.PI / 360)) continue;
      const chest = enemy.sim.walker.posture === 'prone' ? 3 : enemy.sim.walker.posture === 'crouch' ? 8 : 12;
      // The camera's vertical half-angle too: the elevation to the chest against the bot's own pitch (up positive).
      const elevation = Math.atan2(s.y + chest - eye[1], d || 1) * 180 / Math.PI;
      if (Math.abs(elevation - p.sim.walker.state.pitch) > BOT_AI_ADAPTATION.fovVertical / 2) continue;
      if (segmentHit(this.room.map.grid, eye, [s.x, s.y + chest, s.z], (poly) => !isLiquidSurface(poly) && (surfaceWord(poly) & SURFACE_SKIP) === 0)) continue;
      if (smokeHides(smoke, eye, [s.x, s.y + chest, s.z])) continue;   // a live smoke between: no sight (the controller's ruling)
      // Copy only sighted poses. Position planning never follows an unseen opponent's current state.
      b.seen.push({ id: m.id, at });
      const nearDanger = b.danger && Math.hypot(at[0] - b.danger[0], at[2] - b.danger[2]) < TACTICS_ADAPTATION.dangerRadius;
      if (b.danger && this.room.tick < b.dangerUntil && !nearDanger && d > TACTICS_ADAPTATION.immediateThreat) continue;
      const enemyYaw = s.yaw * Math.PI / 180;
      const facingUs = d > 1 && (Math.sin(enemyYaw) * dx + Math.cos(enemyYaw) * dz) / d > DECISIONS_ADAPTATION.facingCosine;
      const clearLane = !muzzle || !this.positions!.blocked(muzzle, [s.x, s.y + chest, s.z]);
      const score = d * (b.hunt === m.id ? TACTICS_ADAPTATION.targetPersistence : 1)
        * (nearDanger ? TACTICS_ADAPTATION.dangerPriority : 1) * (facingUs ? DECISIONS_ADAPTATION.facingPriority : 1)
        * (clearLane ? 1 : DECISIONS_ADAPTATION.blockedLaneCost);
      if (best && score >= best.score) continue;
      best = { id: m.id, at, score };
    }
    if (best) {
      if (Math.hypot(best.at[0] - feet[0], best.at[2] - feet[2]) <= TEAM_TACTICS_ADAPTATION.immediateRange)
        this.tactics.contact(b.id, this.room.tick);
      const continuing = b.tracked === best.id && this.room.tick - b.lastSeen < AIM_ADAPTATION.reacquireTicks;
      if (!continuing) { b.trackTicks = 0; b.aimSampleAt = 0; }
      if (b.target !== best.id) {
        b.visibleSince = this.room.tick - (continuing ? ROLE_ADAPTATION[b.role].reactionMs / 1000 * TICK_HZ * AIM_ADAPTATION.reacquireFraction : 0);
        if (!continuing) { b.actionUntil = 0; b.reposition = null; }
      }
      b.tracked = best.id; b.lastSeen = this.room.tick;
      b.target = best.id; this.remember(b, best.id, best.at);
      const enemy = this.room.player(best.id)!;
      const height = enemy.sim.walker.posture === 'prone' ? 3 : enemy.sim.walker.posture === 'crouch' ? 8 : 12;
      b.memoryHeight = height;
      const desired = faceToward({ feet, posture: p.sim.walker.posture }, [best.at[0], best.at[1] + height, best.at[2]]);
      if (this.room.tick >= b.aimSampleAt && !b.firePolicy.active) {
        b.aimOffset = [this.random() * 2 - 1, this.random() * 2 - 1];
        b.aimSampleAt = this.room.tick + AIM_ADAPTATION.sampleTicks + (100 - ROLE_ADAPTATION[b.role].accuracy) * AIM_ADAPTATION.sampleErrorTicks;
      }
      const settled = AIM_ADAPTATION.settledFraction + (1 - AIM_ADAPTATION.settledFraction) * Math.exp(-b.trackTicks / AIM_ADAPTATION.settleTicks);
      const error = (100 - ROLE_ADAPTATION[b.role].accuracy) * AIM_ADAPTATION.degreesPerError * settled;
      b.yaw = wrapYaw(desired.yaw + b.aimOffset[0] * error);
      // A player's aim limits (`aimPitchLimitsOf`, the prone pair leaned by the slope as a player's): a bot asks for no more.
      const [pitchLo, pitchHi] = aimPitchLimitsOf(p.sim.walker);
      b.pitch = Math.max(pitchLo, Math.min(pitchHi, desired.pitch + b.aimOffset[1] * error * AIM_ADAPTATION.pitchFraction));
    } else {
      b.target = null;
    }
  }

  /** Spend only the carried kind which serves this decision's specific tactical purpose. */
  private throwable(p: BotPlayer, purpose: 'frag' | 'smoke' | 'flash'): string | null {
    const priority = purpose === 'frag' ? [121, 126] : purpose === 'smoke' ? [122, 127] : [123];
    const baked: Record<string, number> = { M67: 121, HE: 126, 'AN-M8': 122, Mark141: 123 };
    const available = Object.entries(p.grenades).filter(([, count]) => count > 0);
    for (const id of priority) {
      const kind = available.find(([name]) => (this.kits?.table.arsenal.byName.get(name)?.id ?? baked[name]) === id)?.[0];
      if (kind) return kind;
    }
    return null;
  }

  /** Refuse an initial trajectory that will bounce off a nearby wall and leave the grenade at our feet. */
  private throwArcClear(feet: Point, yaw: number, shot: BotThrowSolution): boolean {
    const from = actorToWorldPoint(feet, yaw, shot.from), velocity = actorToWorldDir(yaw, shot.velocity);
    const horizontal = Math.hypot(velocity[0], velocity[2]);
    const flight = impactRange(horizontal, velocity[1], shot.from[1]) / horizontal;
    let previous = from;
    for (let step = 1; step <= EQUIPMENT_USE_ADAPTATION.arcSamples; step++) {
      const t = flight * step / EQUIPMENT_USE_ADAPTATION.arcSamples;
      const next: Point = [from[0] + velocity[0] * t, from[1] + velocity[1] * t - THROW_GRAVITY / 2 * t * t, from[2] + velocity[2] * t];
      if (step <= EQUIPMENT_USE_ADAPTATION.arcWallSamples && segmentHit(this.room.map.grid, previous, next,
        (surface) => !isLiquidSurface(surface) && (surfaceWord(surface) & SURFACE_SKIP) === 0)) return false;
      previous = next;
    }
    return true;
  }

  /** A launcher stays inside the Room's normal raise, ready, round and backblast gates. */
  private rocket(b: Actor, p: BotPlayer, feet: Point, yaw: number, seq: number, laneClear: boolean,
    peers: { id: number; team: Team; at: Point }[]): void {
    const launcher = [2, 3, 4].map((slot) => p.loadout[slot]!).find((id) => rocketRoundOf(id) !== null);
    const roundId = launcher === undefined ? null : rocketRoundOf(launcher);
    const ring = roundId === null ? null : p.rounds.ring(roundId);
    const item = launcher === undefined ? null : this.kits?.table.arsenal.items.get(launcher);
    const round = roundId === null ? null : this.kits?.table.arsenal.items.get(roundId);
    const contact = b.target !== null && b.memory && Math.hypot(b.memory[0] - feet[0], b.memory[2] - feet[2]) >= LAUNCHER_ADAPTATION.minimumRange
      && laneClear && Math.abs(shortTurn(yaw, b.yaw)) < LAUNCHER_ADAPTATION.facingDegrees && !this.friendlyInLine(b, feet);
    const rearClear = !peers.some((q) => {
      if (q.id === b.id || q.team !== b.team) return false;
      const x = q.at[0] - feet[0], z = q.at[2] - feet[2], distance = Math.hypot(x, z);
      return distance < LAUNCHER_ADAPTATION.rearClearance && x * Math.sin(yaw * Math.PI / 180) + z * Math.cos(yaw * Math.PI / 180) > distance * LAUNCHER_ADAPTATION.rearCosine;
    });
    if (p.held !== null) {
      if (!contact || !rearClear || roundId === null || !ring || ring.rounds() <= 0 || !round) {
        if (launcherClipFree(p, seq)) {                         // BOT-LAUNCHER: not inside the raise's clip
          this.room.text(b.id, { type: 'throw', seq, kind: p.records[p.sim.weapon].name, from: feet, velocity: [0, 0, 0] });
          b.lastEquipment = this.room.tick;
        }
        return;
      }
      if (p.ran < p.heldReadyAt || p.ran < p.rocketWaitUntil || this.room.tick - b.lastEquipment < LAUNCHER_ADAPTATION.refireTicks) return;
      const record = p.rounds.round(roundId)?.record;
      if (!record?.muzzleVelocity) return;
      const from = actorToWorldPoint(feet, yaw, [2, EYE_HEIGHT, -8]);
      const at = b.memory!, dx = at[0] - from[0], dy = at[1] + b.memoryHeight - from[1], dz = at[2] - from[2];
      const length = Math.hypot(dx, dy, dz) || 1, speed = record.muzzleVelocity;
      this.room.text(b.id, { type: 'throw', seq, kind: round.name, from,
        velocity: [dx / length * speed, dy / length * speed, dz / length * speed] });
      b.lastEquipment = this.room.tick;
      return;
    }
    if (b.role !== 'marksman' || !contact || !rearClear || !item || !ring || ring.rounds() <= 0
      || b.equipment || this.room.tick - b.lastEquipment < EQUIPMENT_USE_ADAPTATION.cooldownTicks || !launcherClipFree(p, seq)) return;
    this.room.text(b.id, { type: 'throw', seq, kind: item.name, from: feet, velocity: [0, 0, 0] });
    b.lastEquipment = this.room.tick;
  }

  /** Local teammate avoidance uses copied poses, so seat order cannot move the obstacle during this decision. */
  private space(b: Actor, feet: Point, dx: number, dz: number, peers: Peer[]): [number, number] {
    let sx = 0, sz = 0;
    b.trafficScale = 1;
    const refused = b.refusedSince;                                // BOT-CORNER: kept only while the refusal runs on
    b.refusedSince = undefined;
    let moving = Math.hypot(dx, dz);
    const allies = peers.filter((q) => q.id !== b.id && q.team === b.team && Math.abs(q.at[1] - feet[1]) <= CROWD_ADAPTATION.sameFloor);
    // A local pass must clear both the native floor/walls and teammates along the whole leg. If already
    // overlapping, allow a leg which increases clearance instead of requiring an impossible clear start.
    const legClear = (q: { at: Point }, to: Point): boolean => pointSegment(q.at, feet, to)
      >= Math.min(TRAFFIC_ADAPTATION.overlap, Math.hypot(q.at[0] - feet[0], q.at[1] - feet[1], q.at[2] - feet[2]));
    const clearPass = (to: Point): boolean => allies.every((q) => legClear(q, to));
    if (moving < 0.1) { b.yieldFor = null; b.yieldedSince = undefined; b.passing = null; b.yieldUntil = 0; return [0, 0]; }
    if (b.passing) {
      const x = b.passing[0] - feet[0], z = b.passing[2] - feet[2];
      if (Math.hypot(x, z) > TACTICS_ADAPTATION.arrival && this.navigation.canWalk(feet, b.passing) && clearPass(b.passing)) return [x, z];
      b.passing = null; b.yieldedSince = undefined;               // BOT-CORNER review 2: a finished pass restarts the yield clock
      // The pass displaced this body from the pose where its first route leg was checked. Reattach once
      // before resuming a blocked leg, keeping the same destination and the navigation search's fixed budget.
      // BOP-S (the attach bypass): the reattach is a route job like any other -- its attachments and A* under the
      // bot's budget, never all at once in its turn. While it waits the bot stands with no route (its old first leg
      // is blocked from here): a bot waiting on its own route job holds the stall clock (LF1).
      if (b.route[0] && !this.navigation.canWalk(feet, b.route[0])) {
        const destination = b.route[b.route.length - 1]!, asked = this.room.tick, reposition = b.reposition, aim = this.currentTarget(b);
        let answered = false, here = true;
        b.lastPlan = asked;
        // The review's blocker: a late answer lands only on the decision that asked for it -- no newer plan (lastPlan
        // moved: a goal, action or search change, a door), no cover or search taken since, no reposition since (the
        // (a) review: the approach's clear-lane step leaves lastPlan alone), the bot still alive.
        this.navJob(b, 'route', `goto:${destination.join(',')}`, feet, (from) => this.navigation.routeSteps(from, destination), (route) => {
          if (!here && (b.lastPlan !== asked || b.cover || b.search || b.reposition !== reposition || !b.alive)) return;
          if (!here) this.lateApplied(aim, this.currentTarget(b));   // the plan's target then and now: a patrol has none
          b.route = route; b.lastPlan = this.room.tick; answered = true;
        });
        here = false;
        if (!answered) { b.route = []; return [0, 0]; }
        dx = b.route[0] ? b.route[0][0] - feet[0] : 0;
        dz = b.route[0] ? b.route[0][2] - feet[2] : 0;
        moving = Math.hypot(dx, dz);
        if (moving < 0.1) return [0, 0];
      }
    }
    // BOP-S batch 4 (the MP2 stair): a bot giving way to an oncoming teammate on a leg too narrow to pass keeps backing
    // off along its own leg while that teammate is still coming at it (`comingAt`), ahead on its way (between it and its
    // route's end) and within the bounds below; it steps aside once a side is clear and waits there, and stands only if
    // both are refused. Once the other stops coming (it holds, it pauses), the record goes and the yielder may walk on:
    // a held priority bot is yielded to and waited on, and the stall recovery runs (batch 5's stated choice).
    // B1: the record is its route's: a new route (its end moved) ends it, as a death does (resetCombat).
    const end = b.route.at(-1);
    const sameWay = b.giveWay !== undefined && end !== undefined
      && Math.hypot(end[0] - b.giveWay.end[0], end[2] - b.giveWay.end[2]) < BOT_AI_ADAPTATION.waypoint;
    const yielding = sameWay ? allies.find((q) => q.id === b.giveWay!.id) : undefined;
    // N1: none of these steps may lead back onto rungs it just got off (LF3's memory).
    const rungs = b.ladderAvoid && Math.hypot(feet[0] - b.ladderAvoid.at[0], feet[2] - b.ladderAvoid.at[2]) < LADDER_STANDOFF + BODY_RADIUS
      ? b.ladderAvoid.into : null;
    const offRungs = (vx: number, vz: number): boolean => !rungs || vx * rungs[0] + vz * rungs[1] <= 0;
    // Batch 7 (s23, MP2's upper stair flight): back along its own leg by `passDistance`, or by the traffic's `overlap`
    // when the floor or a teammate refuses that -- a flight or a T's far wall too close behind it held the yielder
    // still, and its priority teammate with it, for good. No new length: the two the traffic already has.
    const backOff = (): Point | null => {
      for (const length of [TRAFFIC_ADAPTATION.passDistance, TRAFFIC_ADAPTATION.overlap]) {
        const to = this.navigation.offset(feet, -dx / moving, -dz / moving, length);
        if (to && clearPass(to)) return to;
      }
      return null;
    };
    // B2 and batch 5 (the re-look's form): a teammate, bot or human, is coming at it when (a) moving toward this bot
    // (the copied pose's velocity, the traffic's speed test), or (b) a priority bot whose own steering was refused on THIS bot's body last tick: its `blockedBy` stamp as
    // copied with the poses when this tick began (the review's B1: a live slot was overwritten by a priority bot that
    // stepped first), and only a stamp from the tick before. A paused bot with its route kept is neither, so it is
    // yielded to and waited on, and the stall recovery runs.
    const comingAt = (q: Peer): boolean => {
      const x = feet[0] - q.at[0], z = feet[2] - q.at[2], d = Math.hypot(x, z) || 1;
      if ((q.velocity[0] * x + q.velocity[1] * z) / d > CROWD_ADAPTATION.movingSpeed) return true;
      const stamp = q.blockedBy;                                 // as it stood when the tick began (the poses' copy)
      return stamp !== undefined && stamp.id === b.id && stamp.tick === this.room.tick - 1;
    };
    if (yielding && end) {
      const x = feet[0] - yielding.at[0], z = feet[2] - yielding.at[2], d = Math.hypot(x, z);
      const ex = end[0] - feet[0], ez = end[2] - feet[2], de = Math.hypot(ex, ez);
      // B2: only while the other is still coming at it (moving toward it, the traffic's own speed test), inside the
      // yield's radius, and for at most three stall windows; past those the record goes and the normal yield (or the
      // stall recovery, which also clears it) takes over.
      const oncoming = comingAt(yielding);
      if (d > 0.1 && d < de && d < TRAFFIC_ADAPTATION.radius && oncoming && this.room.tick - b.giveWay!.since < 3 * BOT_AI_ADAPTATION.stuckTicks
        && (-x * ex - z * ez) / (d * de) > TRAFFIC_ADAPTATION.ahead) {   // still coming along its way
        if (b.giveWay!.aside) return [0, 0];                       // out of its way: wait for it to go by
        const side = b.id > yielding.id ? 1 : -1;
        for (const [ox, oz] of [[-dz * side, dx * side], [dz * side, -dx * side]] as const) {
          if (!offRungs(ox, oz)) continue;
          const to = this.navigation.offset(feet, ox / moving, oz / moving, TRAFFIC_ADAPTATION.passDistance);
          if (to && clearPass(to)) { b.passing = to; b.yieldedSince = undefined; b.giveWay!.aside = true; return [to[0] - feet[0], to[2] - feet[2]]; }
        }
        const back = offRungs(-dx, -dz) ? backOff() : null;
        if (back) { b.passing = back; b.yieldedSince = undefined; return [back[0] - feet[0], back[2] - feet[2]]; }
        return [0, 0];
      }
    }
    b.giveWay = undefined;
    if (this.room.tick < b.yieldUntil) return [0, 0];
    for (const q of allies.sort((a, c) => a.id - c.id)) {
      if (q.id === b.id || this.hostile(b.id, q.id) || Math.abs(q.at[1] - feet[1]) > CROWD_ADAPTATION.sameFloor) continue;
      let x = feet[0] - q.at[0], z = feet[2] - q.at[2], d = Math.hypot(x, z);
      const ahead = moving > 0.1 && d > 0.1 && (-x * dx - z * dz) / (d * moving) > TRAFFIC_ADAPTATION.ahead;
      const following = (q.velocity[0] * dx + q.velocity[1] * dz) / moving > CROWD_ADAPTATION.movingSpeed;
      if (following && ahead && d < TRAFFIC_ADAPTATION.radius) {
        b.trafficScale = Math.min(b.trafficScale, Math.max(CROWD_ADAPTATION.minimumFollow,
          (d - TRAFFIC_ADAPTATION.overlap) / (TRAFFIC_ADAPTATION.radius - TRAFFIC_ADAPTATION.overlap)));
      }
      // Same-direction traffic eases its pad continuously; oncoming traffic has stable seat priority (humans first).
      if (ahead && d < TRAFFIC_ADAPTATION.radius && (!following && (!this.actors.has(q.id) || q.id < b.id))
        && !this.positions.blocked([feet[0], feet[1] + 10, feet[2]], [q.at[0], q.at[1] + 10, q.at[2]])) {
        // Wait once for a new blocker. Repeatedly renewing this wait against a stationary human used to
        // suppress even the recovery route forever. Let stopped or oncoming priority seats be passed
        // on a stable checked side without changing the strategic route.
        if (b.yieldFor === q.id && !following) {
          // The ahead cone is deliberately broad. Once the initial yield ends, an off-axis ally must not
          // veto a whole planned leg which already clears every teammate and the native floor/walls.
          // This matters at narrow spawn corners where both unnecessary lateral passes are obstructed.
          const planned = this.navigation.offset(feet, dx, dz, moving);
          if (planned && clearPass(planned)) { b.yieldUntil = 0; return [dx, dz]; }
          for (const side of [b.id > q.id ? 1 : -1, b.id > q.id ? -1 : 1]) {
            const to = this.navigation.offset(feet, -dz / moving * side, dx / moving * side, TRAFFIC_ADAPTATION.passDistance);
            if (to && clearPass(to)) { b.passing = to; b.yieldedSince = undefined; return [to[0] - feet[0], to[2] - feet[2]]; }
          }
          // Batch 4: no side clears (a stair, a corridor): back off along its own leg and keep giving way (above) --
          // only for a teammate coming at it (B2); one holding still is not waited out by backing away.
          const coming = comingAt(q);
          const back = coming && offRungs(-dx, -dz) ? backOff() : null;
          if (back) { b.passing = back; b.yieldedSince = undefined; const e = b.route.at(-1); b.giveWay = e ? { id: q.id, aside: false, end: [...e], since: this.room.tick } : undefined; return [back[0] - feet[0], back[2] - feet[2]]; }
          // BOT-CORNER (the ramp wedge, `TRAFFIC_ADAPTATION.deadlockTicks`): the same stopped teammate bot with no route
          // (no plan of its own: MP51 seed 31's 229 stood routeless some 700 ticks), not coming at it, given way to that
          // long with no side and no planned leg clear, it walks its leg where the walls let it -- before its stall
          // recovery, whose escapes a narrow way refuses as well. One paused with its route kept is still waited on and
          // its recovery runs (batch 5; botHeadOn's F1).
          const since = b.yieldedSince?.id === q.id ? b.yieldedSince.since : this.room.tick;
          if (!coming && this.actors.has(q.id) && !q.next?.length && Math.hypot(q.velocity[0], q.velocity[1]) < CROWD_ADAPTATION.movingSpeed
            && this.room.tick - since >= TRAFFIC_ADAPTATION.deadlockTicks
            && this.navigation.offset(feet, dx / moving, dz / moving, Math.min(moving, STEERING_ADAPTATION.clearance))) {
            b.yieldUntil = 0; return [dx, dz];
          }
        }
        if (b.yieldedSince?.id !== q.id) b.yieldedSince = { id: q.id, since: this.room.tick };
        b.yieldFor = q.id;
        b.yieldUntil = this.room.tick + TRAFFIC_ADAPTATION.yieldTicks; return [0, 0];
      }
      if (d >= BOT_AI_ADAPTATION.spacing) continue;
      if (moving < 0.1 && d >= TRAFFIC_ADAPTATION.overlap) continue;
      if (this.positions!.blocked([feet[0], feet[1] + 10, feet[2]], [q.at[0], q.at[1] + 10, q.at[2]])) continue;
      if (d < 0.1) {
        const a = (Math.min(b.id, q.id) * 2.39996) + (b.id > q.id ? Math.PI : 0);
        x = Math.sin(a); z = Math.cos(a); d = 1;
      }
      const weight = (BOT_AI_ADAPTATION.spacing - d) / BOT_AI_ADAPTATION.spacing;
      sx += x / d * weight; sz += z / d * weight;
    }
    b.yieldFor = null; b.yieldedSince = undefined; b.yieldUntil = 0;
    if (Math.hypot(sx, sz) < 0.01) return [dx, dz];
    const l = Math.hypot(dx, dz) || 1;
    const x = dx / l + sx * BOT_AI_ADAPTATION.separation, z = dz / l + sz * BOT_AI_ADAPTATION.separation;
    const d = Math.hypot(x, z) || 1;
    if (this.navigation.offset(feet, x / d, z / d, 8)) return [x, z];
    // At a ramp or wall edge, a sideways separation probe can fail while the planned forward leg is clear.
    // Preserve that leg when it clears teammates; otherwise the group can stop forever on a valid route.
    const forward = this.navigation.offset(feet, dx, dz, 8);
    if (forward && clearPass(forward)) return [dx, dz];
    // Batch 5: stamp the first teammate (in id order) whose body refused this leg, for its own give-way next tick.
    const blocker = forward ? allies.slice().sort((a, c) => a.id - c.id).find((q) => q.id !== b.id && !legClear(q, forward)) : undefined;
    if (blocker) {
      b.blockedBy = { id: blocker.id, tick: this.room.tick };
      // BOT-CORNER (the ramp wedge, `TRAFFIC_ADAPTATION.deadlockTicks`): the same standing teammate bot refusing it that
      // long, the leg clear of the walls (`forward`), it takes the leg.
      const since = refused?.id === blocker.id ? refused.since : this.room.tick;
      b.refusedSince = { id: blocker.id, since };
      if (this.actors.has(blocker.id) && this.room.tick - since >= TRAFFIC_ADAPTATION.deadlockTicks
        && Math.hypot(blocker.velocity[0], blocker.velocity[1]) < CROWD_ADAPTATION.movingSpeed) return [dx, dz];
    }
    return [0, 0];
  }

  private friendlyInLine(b: Actor, feet: Point, contact: Point | null = b.memory): boolean {
    if (!contact) return false;
    const from: Point = [feet[0], feet[1] + (this.room.player(b.id)!.sim.walker.posture === 'crouch' ? SCHEDULE_ADAPTATION.crouchShotEye : EYE_HEIGHT), feet[2]];
    const to: Point = [contact[0], contact[1] + STEERING_ADAPTATION.contactLift, contact[2]];
    for (const m of this.room.lobby.players()) {
      if (m.id === b.id || m.team !== b.team) continue;
      const p = this.room.player(m.id); if (!p?.alive) continue;
      const s = p.sim.walker.state, chest = p.sim.walker.posture === 'crouch' ? 8 : 12;
      if (pointSegment([s.x, s.y + chest, s.z], from, to) < BODY_RADIUS + 1.5) return true;
    }
    return false;
  }

  /** Ease the pad, then check any blended direction before it can round a collision corner. */
  private steer(b: Actor, feet: Point, radians: number, dx: number, dz: number, speed: number): [number, number] {
    const distance = Math.hypot(dx, dz);
    // Deliberate holds (cover, search dwell, support fire) must not coast past their position.
    if (distance < 0.0001) { b.stick = [0, 0]; return b.stick; }
    const forward = (-Math.sin(radians) * dx - Math.cos(radians) * dz) / distance * speed;
    const right = (Math.cos(radians) * dx - Math.sin(radians) * dz) / distance * speed;
    const limit = STEERING_ADAPTATION.stickRate / TICK_HZ;
    const ease = (previous: number, wanted: number): number => previous + MathUtils.clamp(
      MathUtils.damp(previous, wanted, STEERING_ADAPTATION.response, 1 / TICK_HZ) - previous, -limit, limit);
    let f = ease(b.stick[0], forward), r = ease(b.stick[1], right);
    if (Math.abs(f * right - r * forward) > 0.03 || f * forward + r * right < 0) {
      const x = -Math.sin(radians) * f + Math.cos(radians) * r;
      const z = -Math.cos(radians) * f - Math.sin(radians) * r;
      if (!this.navigation!.offset(feet, x, z, STEERING_ADAPTATION.clearance)) {
        // Brake and start along the already checked desired leg, rather than smoothing through its inside wall.
        f = MathUtils.clamp(forward, -limit, limit); r = MathUtils.clamp(right, -limit, limit);
      }
    }
    b.stick = [f, r]; return b.stick;
  }

  private shotOrigin(_id: number, frame: AimFrame): Point {
    return [frame.feet[0], frame.feet[1] + EYE_HEIGHT * scopeEyeHeight(frame.posture) / scopeEyeHeight('stand'), frame.feet[2]];
  }

  /** Seeing over cover does not mean the actual posed weapon has cleared it. */
  private clearShot(b: Actor, frame: AimFrame, from: Point, contact: Point | null = b.memory, height = b.memoryHeight): boolean {
    return contact !== null && !this.positions!.blocked(
      [frame.feet[0], frame.feet[1] + targetHeight(frame.posture, frame.moveRoot), frame.feet[2]], from)
      && !this.positions!.blocked(from, [contact[0], contact[1] + height, contact[2]]);
  }

  private killOverrun(b: Actor, p: BotPlayer, event: Extract<ServerEvent, { type: 'kill' }>): FireOverrun | null {
    const fired = b.fired, record = p.records[p.sim.weapon];
    if (!fired || fired.victim !== event.victim || event.killer !== b.id || p.sim.weapon !== 0 || fired.weapon !== 0
      || fired.gun !== record.id || b.firePolicy.mode !== 3 || !record.fireModes.includes(3) || itemClass(record.id) === 'sniper'
      || p.ran < p.reloadUntil[0] || p.sim.walker.swapProgress() || p.mags[0].rounds() === 0) return null;
    const cadence = framesInTicks(botFireFrames(record, 3));   // OBF-19: the console's frames a round, in (fractional) ticks
    if (this.room.tick - fired.tick > cadence + 1) return null;
    const tuning = FIRE_OVERRUN_ADAPTATION;
    const requested = tuning.minRounds + Math.floor(this.random() * (tuning.maxRounds - tuning.minRounds + 1));
    const window = Math.max(cadence * tuning.minRounds,
      Math.round((tuning.minSeconds + this.random() * (tuning.maxSeconds - tuning.minSeconds)) * TICK_HZ));
    return { ...fired, at: [...fired.at], cadence, until: this.room.tick + window + 1,
      remaining: Math.min(requested, Math.floor(window / cadence), p.mags[0].rounds()) };
  }

  /** Retain only the last firing intent. The dead body is never queried or treated as an active target. */
  private continueOverrun(b: Actor, p: BotPlayer, feet: Point): boolean {
    const overrun = b.overrun, tick = this.room.tick;
    if (!overrun) return false;
    const frame = p.cone.frame(p.sim.seq);
    if (tick > overrun.until || overrun.remaining <= 0 || b.target !== null || !firearmBack(p) || p.sim.weapon !== overrun.weapon
      || p.records[p.sim.weapon].id !== overrun.gun || p.ran < p.reloadUntil[p.sim.weapon]
      || p.mags[p.sim.weapon].rounds() === 0 || p.sim.walker.swapProgress() || !frame?.fire || frame.swapping
      || !this.withinWeaponPreference(b, p, feet, overrun.at)) {
      b.overrun = null; return false;
    }
    const from = this.shotOrigin(b.id, frame);
    if (!this.clearShot(b, frame, from, overrun.at, overrun.height) || this.friendlyInLine(b, feet, overrun.at)) {
      b.overrun = null; return false;
    }
    const due = b.firePolicy.timerDue(tick), record = p.records[p.sim.weapon];   // OBF-19: the kit's frame clock (`BotFirePolicy`)
    const distance = Math.max(SCHEDULE_ADAPTATION.minimumClaimDistance, Math.hypot(overrun.at[0] - feet[0], overrun.at[2] - feet[2]));
    const claims = due ? Array.from({ length: pelletsOf(record) }, () => sampledClaim(frame, from, distance, this.random)) : [];
    if (claims.some((claim) => friendlyOnRay(this.room, b.id, claim.from, claim.dir, record))) {
      b.overrun = null; return false;
    }
    b.stick = [0, 0]; b.behaviour = 'engage';
    this.room.binary(b.id, encodeCommands({ viewTick: tick, commands: [{ seq: p.sim.seq + 1,
      yaw: overrun.yaw, pitch: overrun.pitch, turn: 0, buttons: Button.Trigger,
      stance: frame.posture === 'prone' ? 2 : frame.posture === 'crouch' ? 1 : 0, weapon: p.sim.weapon, forward: 0, right: 0 }] }));
    if (due) {
      overrun.remaining--; b.lastShot = tick; b.firePolicy.fired(tick);
      for (const claim of claims) {
        b.verdict = p.cone.check(p.sim.seq, claim);
        this.room.text(b.id, { type: 'fire', seq: p.sim.seq, viewTick: tick, weapon: p.sim.weapon, ...claim });
      }
      if (overrun.remaining <= 0) b.overrun = null;
    }
    return true;
  }

  private engagementRange(b: Actor, p: BotPlayer): number {
    const ordinary = ROLE_ADAPTATION[b.role].range;
    return pelletsOf(p.records[p.sim.weapon]) > 1 ? Math.min(ordinary, PELLET_ENGAGEMENT_RANGE_ADAPTATION) : ordinary;
  }

  private withinWeaponPreference(b: Actor, p: BotPlayer, from: Point, contact: Point | null): boolean {
    if (!contact) return false;
    const distance = Math.hypot(contact[0] - from[0], contact[1] - from[1], contact[2] - from[2]);
    const record = p.records[p.sim.weapon];
    return distance <= record.maximumRange * UNITS_PER_METRE && (pelletsOf(record) <= 1 || distance <= this.engagementRange(b, p));
  }

  private canProvideFire(b: Actor, laneClear: boolean): boolean {
    const p = this.room.player(b.id);
    if (!p?.alive || b.target === null || !b.memory || this.room.tick < b.pressureUntil
      // P537-L3 pursuit (Fuse's 7a2b34909): no covering-fire promise while a throw, a held item or a traversal holds it.
      || (this.behaviours.pursuit && (b.equipment !== null || p.held !== null || this.room.tick < b.throwHoldUntil
        || this.ladderDrives.has(b.id) || p.sim.moves?.busy()))
      || this.room.tick - b.visibleSince < ROLE_ADAPTATION[b.role].reactionMs / 1000 * TICK_HZ
      || p.mags[p.sim.weapon].rounds() <= TACTICS_ADAPTATION.crouchReloadRounds || p.ran < p.reloadUntil[p.sim.weapon]
      || (b.cover && b.coverPhase !== 'peek')) return false;
    // Eligibility uses the same posed-weapon lane already checked for this observation, not another ray query.
    const s = p.sim.walker.state;
    return laneClear && !p.sim.walker.swapProgress() && this.withinWeaponPreference(b, p, [s.x, s.y, s.z], b.memory);
  }

  private squadMember(b: Actor): SquadMember & { geometryClear: boolean } {
    const p = this.room.player(b.id)!, s = p.sim.walker.state, at: Point = [s.x, s.y, s.z];
    const frame = p.cone.frame(p.sim.seq), from = frame ? this.shotOrigin(b.id, frame) : null;
    const geometryClear = !!frame && !!from && this.clearShot(b, frame, from);
    const laneClear = geometryClear && !this.friendlyInLine(b, at);
    return { id: b.id, team: b.team, alive: p.alive, at, hasContact: b.memory !== null, contact: b.memory ? b.hunt : null, target: b.target,
      rounds: p.mags[p.sim.weapon].rounds(), reloading: p.ran < p.reloadUntil[p.sim.weapon], pressure: this.room.tick < b.pressureUntil,
      geometryClear, laneClear, ready: this.canProvideFire(b, laneClear),
      cover: b.cover, coverValid: !b.cover || !b.memory || this.room.tick % SCHEDULE_ADAPTATION.staggerTicks !== b.id % SCHEDULE_ADAPTATION.staggerTicks || this.positions.valid(b.cover, b.memory),
      pathValid: this.room.tick >= b.recoverUntil,
      atCover: !!b.cover && !!b.memory && Math.hypot(s.x - b.cover.hide[0], s.z - b.cover.hide[2]) < TACTICS_ADAPTATION.arrival
        && this.positions.protected(at, b.memory, p.sim.walker.posture !== 'stand') };
  }

  /**
   * A few reachable views of the remembered contact, as resumable steps (BOP-S). The cursor keeps the place in both
   * candidate lists (`search`'s, then the fallback's), so a job asked again after a door change or a moved body resumes
   * mid-list instead of starting the lists again.
   */
  private *searchAnglesSteps(memory: Point | null, feet: Point, reserved: Point[], cursor: AnglesCursor = newAnglesCursor()): NavSteps<Point[]> {
    if (!memory) return [];
    const points = yield* this.positions.searchSteps(feet, memory, reserved, cursor.search);
    if (points.length) return points;
    // The fallback keeps its own views (the review's F2): `points` is the search cursor's, and a job asked again
    // mid-fallback would otherwise read the fallback's first view as the search's answer and stop there.
    const found = cursor.fallback ??= [];
    // The contact may be beyond a disconnected door or wall. Inspect reachable approaches on this side.
    // BOT-DOOR-PRESS: only approaches the planner may reach from here (`mayReach`); the attachment is `routeSteps`' own.
    const from = cursor.nearby ? null : yield* this.navigation.nearestSteps(feet);
    const nearby = cursor.nearby ??= this.navigation.nearby(feet, SEARCH_ADAPTATION.fallbackRadius, SEARCH_ADAPTATION.fallbackCandidates, from)
      .sort((a, c) => Math.hypot(a[0] - memory[0], a[2] - memory[2]) - Math.hypot(c[0] - memory[0], c[2] - memory[2]));
    for (; cursor.index < nearby.length; cursor.index++) {
      const at = nearby[cursor.index]!;
      if (Math.hypot(at[0] - feet[0], at[2] - feet[2]) < BOT_AI_ADAPTATION.waypoint
        || [...found, ...reserved].some((p) => Math.hypot(p[0] - at[0], p[2] - at[2]) < SEARCH_ADAPTATION.angleSpacing)) continue;
      const route = yield* this.navigation.routeSteps(feet, at);
      if (!route.length) continue;
      found.push(at);
      if (found.length >= SEARCH_ADAPTATION.fallbackPoints) { cursor.index++; break; }
    }
    return found;
  }

  /**
   * The job instrument (product track, counters only): a late answer is being applied; `asked` is the target it was
   * asked for, `current` the bot's target now. Stale when there is no current target or it lies past `waypoint` from
   * the asked one. Changes nothing that is applied.
   */
  private lateApplied(asked: Point | null, current: Point | null): void {
    this.jobs.noteApplied(!!asked && (!current || Math.hypot(asked[0] - current[0], asked[2] - current[2]) > BOT_AI_ADAPTATION.waypoint));
  }
  /**
   * The instrument's target for a route that is the bot's plan's: its search point, tactical goal or contact; none for a
   * patrol (batch 10: the reattach and the recovery compare it at the ask with now, so a late patrol answer, with no
   * target either time, is never counted stale).
   */
  private currentTarget(b: Actor): Point | null { return b.search?.points[0] ?? b.tacticGoal ?? b.memory; }

  /** A navigation job for bot `b` (BOP-S): asked from `feet` now, asked again from where it stands when it must be. */
  private navJob<T>(b: Actor, slot: Slot, key: string, feet: Point, make: (from: Point) => NavSteps<T>, done: (result: T) => void,
    fail?: T): 'done' | 'pending' {
    return this.jobs.submit<T>({ bot: b.id, slot, key, revision: this.navigation.revision, startTick: this.room.tick, steps: make(feet),
      done, from: [...feet], remake: make, ...(fail !== undefined ? { fail } : {}) });
  }

  /**
   * Begin searching the remembered contact from `first`, with the reachable angles a search job finds (BOP-S): at
   * once when the job ends here, else at `first` alone with the angles added when they come.
   */
  private beginSearchWithAngles(b: Actor, feet: Point, first: Point, reserved: Point[], key: string): void {
    const memory = b.memory, cursor = newAnglesCursor();
    let here = true;
    const state = this.navJob(b, 'search', key, feet, (from) => this.searchAnglesSteps(memory, from, reserved, cursor), (angles) => {
      if (here) { this.beginSearch(b, [first, ...angles]); return; }
      // Late: add them to the search of the same contact, if it still runs.
      if (b.search && memory && samePoint(b.search.contact, memory)) { this.lateApplied(memory, b.memory); b.search.points.push(...angles); }
    });
    here = false;
    if (state === 'pending') this.beginSearch(b, [first]);
  }

  private beginSearch(b: Actor, points: Point[]): void {
    if (!b.memory || !points.length) return;
    b.search = { contact: [...b.memory], points, visited: [], lookUntil: 0,
      facing: this.room.player(b.id)!.sim.walker.state.yaw };
    if (!b.memoryUntil) b.memoryUntil = this.room.tick + SEARCH_ADAPTATION.seconds * TICK_HZ;
    b.route = [];
  }

  /**
   * A heard muzzle is above its floor; arrival still requires that floor's legal walking attachment (P537-L3 pursuit,
   * Fuse's 7a2b34909). Off: main's arrival, within `waypoint` on the ground plane.
   */
  private atContact(feet: Point, at: Point): boolean {
    if (Math.hypot(feet[0]-at[0],feet[2]-at[2]) >= BOT_AI_ADAPTATION.waypoint) return false;
    if (!this.behaviours.pursuit) return true;
    const floor = probeFloor(this.room.map.grid,at[0],at[1],at[2]);
    return !!floor && this.navigation.canWalk(feet,[at[0],floor.y,at[2]]);
  }

  /** Search sensed contact with bounded reachable angles; fresh evidence interrupts it. */
  private searchContact(b: Actor, feet: Point): { dx: number; dz: number; yaw: number | null } | null {
    const p = this.room.player(b.id)!;
    if (!b.memory || b.target !== null || b.cover || this.room.tick < b.pressureUntil || this.room.tick < b.recoverUntil
      || p.ran < p.reloadUntil[p.sim.weapon]) return null;
    const tick = this.room.tick, nav = this.navigation!;
    if (!b.search) {
      if (!this.atContact(feet,b.memory)) return null;
      const reserved = [...this.actors.values()].filter((other) => other !== b && !this.hostile(b.id, other.id))
        .flatMap((other) => [...(other.search?.points ?? []), ...(other.cover ? [other.cover.hide, other.cover.peek] : [])]);
      this.beginSearchWithAngles(b, feet, [...b.memory], reserved, 'contact');
    }
    const search = b.search!, destination = search.points[0]!;
    b.behaviour = 'search';
    if (this.atContact(feet,destination)) {
      b.route = [];
      if (!search.lookUntil) { search.lookUntil = tick + SEARCH_ADAPTATION.dwellTicks; search.facing = this.room.player(b.id)!.sim.walker.state.yaw; }
      if (tick < search.lookUntil) return { dx: 0, dz: 0, yaw: wrapYaw(search.facing
        + SEARCH_ADAPTATION.scanDegrees * (0.5 - (search.lookUntil - tick) / SEARCH_ADAPTATION.dwellTicks)) };
      search.visited.push(search.points.shift()!); search.lookUntil = 0;
      if (!search.points.length) {
        const memory = b.memory, cursor = newAnglesCursor(), reserved = search.visited.slice(-SEARCH_ADAPTATION.retainedAngles);
        let here = true;
        const state = this.navJob(b, 'search', 'refill', feet, (from) => this.searchAnglesSteps(memory, from, reserved, cursor), (angles) => {
          if (here) {
            search.points = angles;
            if (!search.points.length) { search.points = [[...feet]]; search.visited = []; }
            return;
          }
          if (b.search !== search) return;
          this.lateApplied(memory, b.memory);
          if (angles.length) search.points.push(...angles);      // after the look-around placeholder
          else search.visited = [];
        });
        here = false;
        // BOP-S: while the angles are found, look around from here (what an empty answer does).
        if (state === 'pending') search.points = [[...feet]];
      }
    } else {
      if (!b.route.length && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks) {
        let here = true;
        this.navJob(b, 'route', `goto:${destination.join(',')}`, feet, (from) => nav.routeSteps(from, destination), (route) => {
          if (!here && (b.search !== search || search.points[0] !== destination)) return;
          if (!here) this.lateApplied(destination, b.search?.points[0] ?? null);
          b.route = route;
          if (!b.route.length) { search.points.shift(); if (!search.points.length) search.points = [[...search.contact]]; }
        });
        here = false;
      }
      const to = b.route[0];
      return { dx: to ? to[0] - feet[0] : 0, dz: to ? to[2] - feet[2] : 0, yaw: null };
    }
    return { dx: 0, dz: 0, yaw: null };
  }

  private resetCombat(b: Actor): void {
    this.ladderDrives.delete(b.id);
    this.climbDrives.delete(b.id);
    b.alive = false; this.forget(b, 'body-or-death-reset'); b.firePolicy.reset();
    b.danger = null; b.dangerUntil = 0; b.pressureUntil = 0; b.pressureReadyAt = 0; b.tracked = null; b.trackTicks = 0;
    b.throwHoldUntil = 0;
    b.lastDodge = -1000;
    b.search = null; b.recoverUntil = 0; b.equipment = null;
    b.heard = null; b.stick = [0, 0]; b.seen = [];
    b.yieldUntil = 0; b.yieldFor = null; b.yieldedSince = undefined; b.passing = null;
    b.failedTactic = null;
    b.planner.reset('body-or-death-reset');
    this.jobs.cancel(b.id);
    b.givenUp = undefined; b.coverStep = undefined; b.ladderAvoid = undefined;   // R3: a life's memories end with it
    b.holdAside = undefined; b.holdReturning = undefined;
    b.giveWay = undefined; b.blockedBy = undefined;              // B1: so does a give-way
    b.refusedSince = undefined;                                   // BOT-CORNER review 1: and the refusal clock
  }

  /**
   * BOT-CORNER review 1: a step that skips the traffic code (a climb, a ladder, an overrun) ends both its clocks, so a
   * refusal or a yield counts only over ticks it saw (`TRAFFIC_ADAPTATION.deadlockTicks`).
   */
  private dropTrafficClocks(b: Actor): void { b.refusedSince = undefined; b.yieldedSince = undefined; }

  /** Back off the failed approach and join a collision-checked route to the same known destination. */
  private *recoverySteps(feet: Point, destination: Point, side: number): NavSteps<Point[]> {
    const nav = this.navigation, dx = destination[0] - feet[0], dz = destination[2] - feet[2], d = Math.hypot(dx, dz) || 1;
    for (const distance of BOT_AI_ADAPTATION.recoveryDistances) for (const turn of [side, -side]) {
      const escape = yield* nav.offsetSteps(feet, -dz / d * turn - dx / d * BOT_AI_ADAPTATION.recoveryRetreat,
        dx / d * turn - dz / d * BOT_AI_ADAPTATION.recoveryRetreat, distance);
      yield;
      if (!escape) continue;
      const route = yield* nav.routeSteps(escape, destination);
      if (route.length) return [escape, ...route];
    }
    return yield* nav.routeSteps(feet, destination);
  }

  /** A walking plan's answer (BOP-S): the route, the patrol after a failed assignment, the angles after a lost contact. */
  private *planSteps(from: Point, goal: Point | null, memory: Point | null, cursor: AnglesCursor): NavSteps<PlanAnswer> {
    const nav = this.navigation;
    const route = goal ? yield* nav.routeSteps(from, goal) : memory ? yield* nav.routeSteps(from, memory) : yield* nav.patrolSteps(from, this.random);
    const fallback = goal && !route.length ? yield* nav.patrolSteps(from, this.random) : null;
    const angles = memory && !(fallback ?? route).length ? yield* this.searchAnglesSteps(memory, from, [], cursor) : null;
    return { route, fallback, angles };
  }

  /** Walk toward a contact whose lane is blocked, or toward its first reachable angle (BOP-S's resumable form). */
  private *approachSteps(from: Point, memory: Point, cursor: AnglesCursor): NavSteps<Point[]> {
    const route = yield* this.navigation.routeSteps(from, memory);
    if (route.length) return route;
    const angle = (yield* this.searchAnglesSteps(memory, from, [], cursor))[0];
    return angle ? yield* this.navigation.routeSteps(from, angle) : route;
  }

  step(): void {
    if (this.departing.size) {                                   // P537-L3 (2): a demoted CPU seat never waits in the queue
      for (const id of this.departing) if (this.room.lobby.member(id)) this.room.leave(id);
      this.departing.clear();
    }
    if (!this.actors.size || this.lastStep === this.room.tick) return;
    // BOP-1 (a product-track instrument): off, one null check and the step as before; on, the step timed whole.
    const prof = botProfiler();
    if (!prof) { this.stepBots(null); return; }
    const t = prof.now();
    try { this.stepBots(prof); } finally { prof.caller = 'other'; prof.end('step', t); }
  }

  /**
   * BOT-DOOR (Craig's live game 2755, MP2) and BOT-DOOR-PRESS: whether bot `b` wants door `door` used -- that door's own
   * leaf, where it stands now, bars its way through the door's swing (`leafBarsRoute`). A shut door: on its route or, on
   * the tick a door change dropped its route (`doorDropped`: the walk a player shut the door on), on that dropped route.
   * An open door at rest: only when the bot is shut in (`shutIn`: no attachment from where it stands; MP51's niche behind
   * door_ft_2's open leaf), and on its own route -- never the dropped one. A route planned while the leaf swung open may
   * hold a leg the leaf covers once at rest (a door edge is taken through a swinging door); read at the rest's door
   * change it shut the door from the doorway and reopened it (the review of f6e5a0fd5, F1: 5 of 51 walks). The
   * original's AI uses a door only through a door task that names it (`FUN_005efa50`: the task's door at +0x58, done
   * once the door's state is the one wanted, D:L502499-502505; the walk to its stand point, D:L502520-502521; the use,
   * `FUN_002b44e0`, D:L502648-502654), its followers having no door logic (research 199 section 6, research 200 section
   * 3.1; the presser's walk is research 92 section 7's `DOOR_MOVE_ORDER_READING`); nothing in it presses a door for
   * standing near one. The bots are the port's own (OT.R81): the walk is their door task. Before BOT-DOOR a CPU pressed
   * any shut door within reach; before BOT-DOOR-PRESS any route meeting the swing box counted (research 364 section 10,
   * finding 3), so a CPU pressed the wrong one of two overlapping doors and reopened a door it had just shut.
   */
  private wantsDoor(b: Actor, feet: Point, door: number, tick: number): boolean {
    if (this.room.doors.state(door).open) return this.leafBarsRoute(feet, b.route, door, true) && this.navigation.shutIn(feet);
    if (this.leafBarsRoute(feet, b.route, door, false)) return true;
    return b.doorDropped?.tick === tick && this.leafBarsRoute(feet, b.doorDropped.route, door, false);
  }

  /**
   * BOT-DOOR-PRESS (OT.R81, a bot adaptation): the legs of `route` from `feet` that meet door `door`'s swing box, in
   * order, up to the first the walk test refuses on the hull as it stands (`WalkingNavigation.legBar`): true when that
   * leg passes on the hull without this door's leaf alone -- this leaf, not a wall or another door's, is in the way. A
   * planned leg (between two route points) counts as it is. The leg from the bot's feet to its first point counts for an
   * open door (whose caller asks `shutIn`), and for a shut one when it crosses the leaf itself (`crossesLeaf`: its next
   * point lies past the leaf, the review's F2 -- no replan's wait) or the bot is shut in; a body strafing or pushed off
   * its line that only clips a leaf its plan clears does not press. The legs after the route has left the box are not read.
   */
  private leafBarsRoute(feet: Point, route: readonly Point[], door: number, open: boolean): boolean {
    const sweep = this.room.doors.specs[door]?.sweep;
    if (!sweep) return false;
    let from = feet, met = false;
    for (let i = 0; i < route.length; i++) {
      const to = route[i]!;
      if (routeCrossesDoor(from, [to], [sweep])) {
        met = true;
        const bar = this.navigation.legBar(from, to, door);
        if (bar !== 'clear') return bar === 'leaf' && (i > 0 || open || crossesLeaf(this.room.doors, door, from, to) || this.navigation.shutIn(feet));
      } else if (met) return false;
      from = to;
    }
    return false;
  }

  /** BOP-1: a CPU seat of this set (an adopted seat is a human's). */
  private botSeat(id: number): boolean { return this.actors.has(id) && !this.adopted.has(id); }

  private stepBots(prof: BotProfiler | null): void {
    this.lastStep = this.room.tick;
    if (this.behaviours.climbs) this.navigation.stepClimbDiscovery(BOT_CLIMB_DISCOVERY_ADAPTATION.ticksPerStep);
    const doors = this.doorsState();
    if (doors !== this.doorState) {
      this.doorState = doors; this.navigation.doorsChanged();
      const sweeps = this.doorStagger ? (this.room.map.doors ?? []).map((door) => door.sweep) : [];
      for (const actor of this.actors.values()) {
        // BOP-S S4 (its own switch): a route that does not pass through a door waits for its bot's replan slot.
        if (this.doorStagger && !routeCrossesDoor(this.feetOf(actor.id) ?? actor.progress, actor.route, sweeps)) { actor.doorDirty = true; continue; }
        actor.doorDropped = actor.route.length ? { route: actor.route, tick: this.room.tick } : undefined;   // BOT-DOOR
        actor.route = []; actor.lastPlan = -1000; actor.pathFailedUntil = 0; actor.doorDirty = false;
      }
    }
    // BOP-S: a swinging leaf moves the hull every tick between its two door changes, and lever gates, cranes and the
    // world move it with no door change at all (the review's F1): no attachment answer carries over any of them.
    const hull = movingHullStamp({ gates: this.room.gates, cranes: this.room.cranes, gridRevision: this.room.map.grid.revision });
    if (doors.includes(':true') || hull === null || hull !== this.hullState) this.navigation.hullMoving();
    this.hullState = hull;
    // CPU assets are already available. Pass the ordinary load barrier; never issue respawn commands in classic.
    const tLoaded = prof ? prof.now() : 0n;
    for (const id of this.actors.keys()) this.room.text(id, { type: 'loaded' });
    if (prof) prof.end('loaded', tLoaded);
    // COMBINED-CUT (re-review F-A): a seat re-seated in place (`Room.switchTeam`, `swapSides`, in the lobby) has a new
    // mover whose `ai` is its connection's; an adopted one is the AI's again while driven, marked every step before the
    // lobby's return (`adoptedAi` keeps the value `release` restores).
    for (const id of this.adopted) { const p = this.room.player(id); if (p) p.sim.ai = true; }
    if (!this.room.roundRunning) {
      for (const b of this.actors.values()) this.resetCombat(b);
      return;
    }
    const nav = this.navigation, tick = this.room.tick;
    // BTL.R2 (review (a) 7): a bot's traffic and fire-lane checks read its own side only -- the enemies' places are
    // never in the list it is handed, by construction.
    const tTactics = prof ? prof.now() : 0n;
    const sides: Record<Team, Peer[]> = { seal: [], terrorist: [] };
    for (const m of this.room.lobby.players()) {
      const q = this.room.player(m.id); if (!q?.alive || !m.team) continue;
      const s = q.sim.walker.state;
      const actor = this.actors.get(m.id), stamp = actor?.blockedBy;   // batch 5: copied with the pose, so no bot's turn this tick can change it
      sides[m.team].push({ id: m.id, team: m.team, at: [s.x, s.y, s.z] as Point, velocity: [s.vx, s.vz] as [number, number],
        ...(stamp ? { blockedBy: { ...stamp } } : {}), ...(actor?.route.length ? { next: actor.route.slice(0, 3).map((q) => [...q] as Point) } : {}) });
    }
    this.tactics.begin(`${this.room.currentMatch().serial}:${this.room.round}`, tick, [...this.actors.values()].map((b) => {
      const p = this.room.player(b.id), s = p?.sim.walker.state;
      return { id: b.id, team: b.team, alive: !!p?.alive, at: s ? [s.x, s.y, s.z] as Point : b.progress };
    }));
    if (prof) prof.end('tactics', tTactics);
    const tHearing = prof ? prof.now() : 0n;
    for (const sound of this.sounds.sample(this.room)) for (const b of this.actors.values()) this.listen(b, sound);
    if (prof) prof.end('hearing', tHearing);
    this.smokes();
    for (const b of this.actors.values()) {
      const p = this.room.player(b.id);
      if (!p) { this.squad.release(b.id, 'disconnected'); this.removeActor(b.id); this.adopted.delete(b.id); this.adoptedAi.delete(b.id); continue; }
      if (b.body !== p.sim) {
        this.resetCombat(b);
        b.body = p.sim; b.lastShot = -1000; b.lastReload = -1000;
      }
      if (!p.alive) {
        this.resetCombat(b);
        // The room alone decides when a dead seat may respawn. Supply the same Action input a
        // player presses; its native timer and round checks still gate the new body.
        if (this.room.rules === 'respawn') {
          const cmd: Command = { seq: p.sim.seq + 1, yaw: b.yaw, pitch: b.pitch, turn: 0,
            buttons: Button.Action, stance: 0, weapon: p.sim.weapon, forward: 0, right: 0 };
          const tCommand = prof ? prof.now() : 0n;
          this.room.binary(b.id, encodeCommands({ viewTick: tick, commands: [cmd] }));
          if (prof) prof.end('command', tCommand);
        }
        continue;
      }
      const s = p.sim.walker.state, feet: Point = [s.x, s.y, s.z];
      if (!b.alive) { b.alive = true; b.lastPlan = -1000; b.coverPlanAt = -1000; b.progress = feet; b.progressAt = tick; b.visibleSince = tick; if (prof) prof.life(b.id); }
      const sensingTicks = BOT_AI_ADAPTATION.perceptionTicks;
      if ((tick + b.id) % sensingTicks === 0) {
        if (prof) {
          const tPerceive = prof.now();
          this.perceive(b, feet);
          prof.end('perception', tPerceive);
          for (const seen of b.seen) prof.saw(b.id, seen.id, tick);
        } else this.perceive(b, feet);
      }
    }
    // All participants have observed this tick before deterministic support selection.
    const tSquad = prof ? prof.now() : 0n;
    const squadMembers = new Map([...this.actors.values()].map((b) => [b.id, this.squadMember(b)]));
    this.squad.sync(`${this.room.currentMatch().serial}:${this.room.round}`, tick, [...squadMembers.values()]);
    if (prof) prof.end('tactics', tSquad);
    // BOP-S S4: a door-stale route is dropped on its bot's own replan slot.
    for (const b of this.actors.values()) if (b.doorDirty && doorReplanDue(tick, b.id, SCHEDULE_ADAPTATION.staggerTicks)) {
      b.route = []; b.lastPlan = -1000; b.pathFailedUntil = 0; b.doorDirty = false;
    }
    // BOP-S: the waiting navigation jobs continue, oldest first, before any bot's turn; their answers land now.
    if (prof) { const tJobs = prof.now(); this.jobs.tick(tick); prof.end('navJobs', tJobs); } else this.jobs.tick(tick);
    for (const b of this.actors.values()) {
      const peers = sides[b.team];
      const p = this.room.player(b.id);
      if (!p?.alive) continue;
      const s = p.sim.walker.state, feet: Point = [s.x, s.y, s.z];
      if (prof) prof.stuckSample(b.id, s.x, s.z, b.route.length > 0, tick, BODY_RADIUS * 2);
      // P537-L3 ladders (Fuse's 86d8be1b5): a route's ladder leg is climbed by the native traversal through ordinary pad
      // input (`BotLadderDrive`). Off, never entered: main's bots, with main's slide off the rungs below.
      // P537-L3 climbs: a route's climb leg is the native climb through ordinary pad input (`BotClimbDrive`). Off, never entered.
      const climbOwned=this.behaviours.climbs?this.climbDrives.get(b.id):undefined;
      let climb=climbOwned?.actor===b&&climbOwned.body===p.sim?climbOwned.drive:undefined;
      if(climbOwned&&!climb)this.climbDrives.delete(b.id);
      if(climb&&!this.navigation.climbLinks.includes(climb.link))climb.invalidate();
      if(this.behaviours.climbs&&!climb&&!b.equipment&&tick>=b.throwHoldUntil&&!b.overrun){
        const link=this.navigation.climbLink(b.route[0],b.route[1]);
        if(link&&Math.hypot(feet[0]-link.entry[0],feet[1]-link.entry[1],feet[2]-link.entry[2])<=BOT_AI_ADAPTATION.waypoint){
          climb=new BotClimbDrive(link,tick,(at,to)=>this.navigation.canWalk(at,to));
          this.climbDrives.set(b.id,{actor:b,body:p.sim,drive:climb});
        }
      }
      if(climb){
        p.raise = false;                                           // main's OBF-14 N1: mid-climb it engages nothing
        const input=climb.step(p.sim,tick);
        if(input.command)this.room.binary(b.id,encodeCommands({viewTick:tick,commands:[input.command]}));
        b.progress=[...feet];b.progressAt=tick;b.lastPlan=tick;
        if(input.done){this.climbDrives.delete(b.id);if(input.failed){b.route=[];b.planner.invalidate('climb-unavailable');}else b.route.splice(0,2);}
        this.dropTrafficClocks(b);
        continue;
      }
      const owned = this.behaviours.ladders ? this.ladderDrives.get(b.id) : undefined;
      let drive = owned?.actor === b && owned.body === p.sim ? owned.drive : undefined;
      if (owned && !drive) this.ladderDrives.delete(b.id);
      if (this.behaviours.ladders && !drive && !b.equipment && tick >= b.throwHoldUntil && !b.overrun) {
        const link = this.navigation.ladderLink(b.route[0], b.route[1]);
        if (link && Math.hypot(feet[0] - link.entry[0], feet[1] - link.entry[1], feet[2] - link.entry[2]) <= BOT_AI_ADAPTATION.waypoint) {
          drive = new BotLadderDrive(link, tick, (at,destination) => this.navigation.canWalk(at, destination));
          this.ladderDrives.set(b.id, {actor:b, body:p.sim, drive});
        }
      }
      if (drive) {
        p.raise = false;                                           // main's OBF-14 N1: on the rungs it engages nothing
        const input = drive.step(p.sim, tick);
        if (input.command) this.room.binary(b.id, encodeCommands({ viewTick: tick, commands: [input.command] }));
        b.progress = [...feet]; b.progressAt = tick; b.lastPlan = tick;
        if (input.done) {
          this.ladderDrives.delete(b.id);
          if (input.failed) { b.route = []; b.planner.invalidate('ladder-unavailable'); }
          else b.route.splice(0, 2);
        }
        // The native traversal owns movement until dismounted; combat, crowd steering and horizontal stall recovery wait.
        this.dropTrafficClocks(b);
        continue;
      }
      // BOP-S (OT.R81, BOP.R11; eb's MP2 ladders): a leg run into a ladder's quad mounts it through the players' own
      // mover (`Traversal.touchLadder`). The bots have no ladder plans, and from the rungs every plan failed -- the
      // navigation's probe settles on the floor below -- so a bot stood there for good. While a ladder move holds the
      // mover, plan nothing; on the rungs press the Action button, the slide (`Traversal.climbLadder`), which lands it
      // on the floor at the ladder's foot. The mover itself is untouched.
      const ladder = p.sim.moves instanceof Traversal ? p.sim.moves.state().kind : 'none';
      if (ladder.startsWith('ladder')) {
        const cmd: Command = { seq: p.sim.seq + 1, yaw: s.yaw, pitch: s.pitch, turn: 0,
          buttons: ladder === 'ladder' ? Button.Action : 0, stance: 0, weapon: p.sim.weapon, forward: 0, right: 0 };
        p.raise = false;                                           // OBF-14 review N1: on the rungs it engages nothing
        this.room.binary(b.id, encodeCommands({ viewTick: tick, commands: [cmd] }));
        b.route = []; b.progress = feet; b.progressAt = tick; b.stick = [0, 0];
        // The review's LF3: remember the rungs (their stand-off point, the facing into them) so its steering does not
        // walk it back into them while the memory lasts -- a mount loop otherwise, where every way on passes them.
        if (ladder === 'ladder') {
          const yaw = s.yaw * Math.PI / 180;
          b.ladderAvoid = { at: [s.x, s.y, s.z], into: [-Math.sin(yaw), -Math.cos(yaw)], until: tick + TACTICS_ADAPTATION.givenUpTicks,
            revision: this.navigation.revision, hull: this.hullState };
        }
        this.dropTrafficClocks(b);
        continue;
      }
      if (this.continueOverrun(b, p, feet)) { this.dropTrafficClocks(b); continue; }
      if (b.memory && b.target === null && b.memoryUntil > 0 && tick >= b.memoryUntil) this.forget(b);
      const tIntent = prof ? prof.now() : 0n;
      let tactical = this.tactics.intent(b.id, feet, tick);
      if (prof) prof.end('tactics', tIntent);
      if (tactical && b.failedTactic && tick < b.failedTactic.until
        && Math.hypot(tactical.goal[0] - b.failedTactic.goal[0], tactical.goal[2] - b.failedTactic.goal[2]) < BOT_AI_ADAPTATION.waypoint)
        tactical = null;
      // Travel still follows the authored opening. A hold cannot spend pellet ammunition at a distant contact;
      // once interrupted, refresh that interruption until the normal approach reaches the weapon preference.
      if (b.target !== null && (!this.withinWeaponPreference(b, p, feet, b.memory)
        || (b.role === 'rusher' && b.memory && Math.hypot(b.memory[0] - feet[0], b.memory[2] - feet[2]) > this.engagementRange(b, p)))
        && (tactical?.hold || b.planner.snapshot().action === 'approach')) {
        this.tactics.contact(b.id, tick); tactical = null;
      }
      if ((tactical?.goal.join(',') ?? null) !== (b.tacticGoal?.join(',') ?? null)) {
        b.route = []; b.lastPlan = -1000; b.reposition = null; this.jobs.cancel(b.id, 'route');
        b.holdAside = undefined; b.holdReturning = undefined;   // batch 11 re-look: a new assignment ends the old hold's aside and walk back
      }
      b.tacticGoal = tactical ? [...tactical.goal] : null;
      if (tactical) { b.search = null; b.reposition = null; }
      const aimFrame = p.cone.frame(p.sim.seq), muzzle = aimFrame ? this.shotOrigin(b.id, aimFrame) : null;
      const laneClear = squadMembers.get(b.id)!.geometryClear;
      if (b.target !== null) b.trackTicks++;
      if (b.search && (b.target !== null || !b.memory
        || Math.hypot(b.memory[0] - b.search.contact[0], b.memory[2] - b.search.contact[2]) > BOT_AI_ADAPTATION.waypoint)) {
        b.search = null; b.route = []; b.lastPlan = -1000;
      }
      let supporting = this.squad.status(b.id).role === 'supporter';
      const mobileCombat = true;
      const loaded = p.mags[p.sim.weapon].rounds() > TACTICS_ADAPTATION.crouchReloadRounds
        && p.ran >= p.reloadUntil[p.sim.weapon];
      if (mobileCombat && b.cover && loaded && tick >= b.pressureUntil
        && ((b.coverPhase === 'peek' && b.target !== null && laneClear)
          || (b.target === null && tick - b.lastSeen > SEARCH_ADAPTATION.lostSightTicks))) {
        b.cover = null; b.coverPlanAt = tick; b.route = []; b.reposition = null; b.lastPlan = -1000;
      }

      const enemyDistance = b.memory ? Math.hypot(b.memory[0] - s.x, b.memory[2] - s.z) : Infinity;
      const preferredRange = this.engagementRange(b, p), rangeRestricted = pelletsOf(p.records[p.sim.weapon]) > 1;
      const withinWeaponPreference = this.withinWeaponPreference(b, p, feet, b.memory);
      const needsMagazine = p.mags[p.sim.weapon].rounds() <= TACTICS_ADAPTATION.crouchReloadRounds;
      const reloading = p.ran < p.reloadUntil[p.sim.weapon];
      const canReload = p.mags[p.sim.weapon].total() > p.mags[p.sim.weapon].rounds() || p.sim.weapon === 1;
      if (!b.memory) b.cover = null;
      if (b.cover && b.memory && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks && !squadMembers.get(b.id)!.coverValid) {
        this.squad.release(b.id, 'cover-invalid');
        b.cover = null; b.route = []; b.coverPlanAt = -1000; b.planner.invalidate('cover-invalid');
      }
      // Query affordances before planning; a predicted take-cover effect is never evidence of shelter.
      if (b.memory && !b.cover && !supporting && ((needsMagazine && canReload) || reloading || tick < b.pressureUntil)
        && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks && tick - b.coverPlanAt >= TACTICS_ADAPTATION.coverPlanTicks) {
        b.coverPlanAt = tick;
        const reserved = [...this.squad.reservedPoints(b.id), ...this.givenUpHides(b, tick)], memory = b.memory;
        const context = { threats: b.seen.filter((seen) => seen.id !== b.hunt).map((seen) => seen.at), preferredRange };
        let here = true;
        this.navJob<CoverPosition | null>(b, 'cover', 'cover', feet, (from) => this.positions.chooseSteps(from, memory, reserved, context), (cover) => {
          if (!here && (b.cover || !b.memory || !b.alive)) return;   // a late answer only fills a bot still without cover
          if (!here) this.lateApplied(memory, b.memory);
          b.cover = cover;
          if (b.cover && !this.squad.reserve(b.id, b.cover)) {
            b.cover = null;
            // BOP-S: a late answer was chosen against the reservations of the tick it was asked; one a teammate took
            // meanwhile is refused here, and that must not cost this bot the whole cover re-plan period -- it asks
            // again on its next slot, against the reservations as they stand.
            if (!here) b.coverPlanAt = -1000;
          }
          if (b.cover) { b.coverPhase = 'hide'; b.coverPhaseUntil = 0; b.route = []; b.reposition = null; }
        }, null);
        here = false;
      }
      supporting = this.squad.status(b.id).role === 'supporter';
      const previousAction = b.planner.snapshot().action;
      const tPlanner = prof ? prof.now() : 0n;
      const planning = b.planner.update({ active: true, contact: b.memory !== null, visible: b.target !== null,
        atContact: !!b.search || (!!b.memory && this.atContact(feet,b.memory)),
        inRange: enemyDistance <= preferredRange && withinWeaponPreference, rangeRestricted,
        lane: laneClear && !this.friendlyInLine(b, feet), loaded: p.mags[p.sim.weapon].rounds() > 0 && !reloading,
        needsReload: p.mags[p.sim.weapon].rounds() === 0 || (!!b.cover && needsMagazine
          && p.mags[p.sim.weapon].rounds() < p.records[p.sim.weapon].magazine), reloading, canReload,
        cover: b.cover !== null, protected: b.cover === squadMembers.get(b.id)!.cover ? squadMembers.get(b.id)!.atCover
          : !!b.cover && !!b.memory && Math.hypot(b.cover.hide[0] - s.x, b.cover.hide[2] - s.z) < TACTICS_ADAPTATION.arrival
            && this.positions.protected(feet, b.memory, p.sim.walker.posture !== 'stand'),
        pressure: tick < b.pressureUntil, opening: tactical !== null, supporting,
        pathFailed: tick < b.pathFailedUntil, contactKey: b.hunt === null ? null : String(b.hunt) });
      if (prof) prof.end('planner', tPlanner);
      const action = planning.action;
      if (action === 'approach' || action === 'investigate' || action === 'search' || action === 'patrol') b.cover = null;
      const sameOpeningRoute = tactical && (action === 'fire' || action === 'patrol')
        && (previousAction === 'fire' || previousAction === 'patrol');
      if (action !== previousAction && !sameOpeningRoute) {
        b.route = []; b.reposition = null; b.lastPlan = -1000; this.jobs.cancel(b.id, 'route');
        if (action !== 'search') b.search = null;
      }
      const walkingAction = action === 'patrol' || action === 'investigate' || action === 'approach' || (action === 'fire' && !!tactical);
      b.behaviour = b.target !== null ? 'engage' : b.memory ? 'investigate' : 'patrol';
      // Replan to sensed information only; an invisible enemy's live position never feeds the route.
      // Batch 11 review (4): no plan while a holder stands aside -- the hold block would empty its route anyway.
      if (walkingAction && !tactical?.hold && !b.holdAside && !b.cover && !b.search && !supporting && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks && (((tactical || b.memory) && tick - b.lastPlan >= BOT_AI_ADAPTATION.planTicks) || (!b.route.length && tick - b.lastPlan > SCHEDULE_ADAPTATION.staggerTicks))) {
        b.lastPlan = tick;
        // BOP-S: one navigation job; while it waits the bot keeps its old route (or stands).
        const goal = tactical ? tactical.goal : null, memory = b.memory, cursor = newAnglesCursor(), reposition = b.reposition;
        const contactRevision = b.contactRevision;
        let here = true, tacticFailed = false;
        this.navJob<PlanAnswer>(b, 'route', goal ? `plan:goal:${goal.join(',')}` : memory ? `plan:contact:${contactRevision}` : 'plan:patrol', feet,
          (from) => this.planSteps(from, goal, memory, cursor), ({ route, fallback, angles }) => {
            // A late answer only moves a bot still walking -- and not one that repositioned since it asked (the (a)
            // review: the approach's clear-lane step empties the route and sets `reposition`, nothing else).
            if (!here && (b.cover || b.search || b.reposition !== reposition || !b.alive)) return;
            // Small refreshes need not restart a pending job every tick, but they can add up beyond its captured
            // contact. Discard that answer and ask from current evidence on the next ordinary planning slot.
            if (!goal && memory && (b.contactRevision !== contactRevision || !b.memory
              || Math.hypot(b.memory[0] - memory[0], b.memory[2] - memory[2]) > BOT_AI_ADAPTATION.waypoint)) {
              b.lastPlan = -1000;
              return;
            }
            if (!here) this.lateApplied(goal ?? memory, goal ? b.tacticGoal : memory ? b.memory : null);
            const now = this.room.tick;
            b.route = route;
            if (goal && !route.length) {
              // A missing graph attachment in a tunnel must not turn a moving assignment into an indefinite stop.
              // Explore a checked local leg, then retry this assignment after a bounded interval.
              b.failedTactic = { goal: [...goal], until: now + SCHEDULE_ADAPTATION.failedTacticTicks };
              b.tacticGoal = null; tacticFailed = true;
              b.route = fallback!;
            }
            if ((!goal || tacticFailed) && memory && b.memory && !b.route.length) {
              b.pathFailedUntil = now + BOT_AI_ADAPTATION.planTicks;
              b.planner.invalidate('path-failed');
              // A missed graph attachment is a reason to try another angle, not forget the enemy.
              this.beginSearch(b, angles!);
              if (!b.memoryUntil) b.memoryUntil = now + SEARCH_ADAPTATION.seconds * TICK_HZ;
            }
          }, { route: [], fallback: [], angles: [] });
        here = false;
        if (tacticFailed) tactical = null;
      }
      while (!b.cover && b.route.length && Math.hypot(b.route[0]![0] - s.x, b.route[0]![2] - s.z) < BOT_AI_ADAPTATION.waypoint
        && (!this.behaviours.pursuit || nav.canWalk(feet, b.route[0]!)) && (b.route.length === 1 || Math.hypot(b.route[0]![0] - s.x, b.route[0]![2] - s.z) < STEERING_ADAPTATION.deadBand
          || nav.canWalk(feet, b.route[1]!))) b.route.shift();
      // Safe local smoothing does not cross a wall or jump between floors.
      if (b.route.length > 2 && tick % CROWD_ADAPTATION.shortcutEveryTicks === b.id % CROWD_ADAPTATION.shortcutEveryTicks) {
        // One checked shortcut per scheduled seat, rather than six expensive hull probes in one tick.
        const candidate = CROWD_ADAPTATION.shortcutCandidates
          - (Math.floor(tick / CROWD_ADAPTATION.shortcutEveryTicks) + b.id) % CROWD_ADAPTATION.shortcutCandidates;
        if (prof) {
          const tSmooth = prof.now(); prof.caller = 'smooth';
          smoothRoute(nav, feet, b.route, candidate);
          prof.caller = 'other'; prof.end('smooth', tSmooth);
        } else smoothRoute(nav, feet, b.route, candidate);
      }
      let dx = b.route[0] ? b.route[0][0] - s.x : 0, dz = b.route[0] ? b.route[0][2] - s.z : 0;
      if ((action === 'approach' || action === 'fire') && !tactical && b.target !== null && b.memory && !b.cover && !b.reposition && tick - b.visibleSince >= TACTICS_ADAPTATION.laneWaitTicks
        && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks && this.friendlyInLine(b, feet)) {
        b.reposition = this.positions.clearLane(feet, b.memory, peers.filter((q) => q.team === b.team && q.id !== b.id).map((q) => q.at));
        if (b.reposition) b.actionUntil = tick + BOT_AI_ADAPTATION.repositionTicks;
      }
      if (action === 'fire' && b.role !== 'marksman' && !tactical && !supporting && !b.cover && b.target !== null && b.memory && (laneClear || !b.route.length)) {
        if (!b.reposition || tick >= b.actionUntil || Math.hypot(b.reposition[0] - s.x, b.reposition[2] - s.z)
          < (laneClear ? STRAFE_ADAPTATION.arrival : TACTICS_ADAPTATION.arrival)) {
          b.side *= -1;
          const tx = (b.memory[0] - s.x) / (enemyDistance || 1), tz = (b.memory[2] - s.z) / (enemyDistance || 1);
          const forward = enemyDistance > preferredRange ? STRAFE_ADAPTATION.approach
            : enemyDistance < preferredRange * STRAFE_ADAPTATION.retreatFraction ? -STRAFE_ADAPTATION.backAway : 0;
          const distance = STRAFE_ADAPTATION.distance + this.random() * STRAFE_ADAPTATION.variation;
          b.reposition = null;
          for (const side of [b.side, -b.side]) {
            const to = nav.offset(feet, -tz * side + tx * forward, tx * side + tz * forward, distance);
            if (to) { b.reposition = to; b.side = side; break; }
          }
          b.actionUntil = tick + STRAFE_ADAPTATION.ticks + Math.floor(this.random() * STRAFE_ADAPTATION.tickVariation);
        }
        if (b.reposition) { dx = b.reposition[0] - s.x; dz = b.reposition[2] - s.z; }
      }
      let desiredStance = 0, exposed = true;
      const lostContact = b.target === null && tick - b.lastSeen > SEARCH_ADAPTATION.lostSightTicks;
      if (b.cover && b.coverPhase === 'peek' && lostContact && tick >= b.coverPhaseUntil
        && !needsMagazine && !reloading && tick >= b.pressureUntil) {
        b.cover = null; b.route = []; b.lastPlan = -1000; b.coverPlanAt = tick;
      }
      if (b.cover && (action === 'take-cover' || action === 'hold-cover' || action === 'peek' || action === 'reload' || action === 'fire')) {
        if (action === 'peek') b.coverPhase = 'peek';
        if ((action === 'take-cover' || action === 'hold-cover' || action === 'reload') && b.coverPhase !== 'hide') {
          b.coverPhase = 'hide'; b.coverPhaseUntil = 0; b.route = [];
        }
        const destination = b.coverPhase === 'hide' ? b.cover.hide : b.cover.peek;
        const arrived = Math.hypot(destination[0] - s.x, destination[2] - s.z) < TACTICS_ADAPTATION.arrival
          && (b.coverPhase === 'peek' || (b.cover === squadMembers.get(b.id)!.cover && squadMembers.get(b.id)!.atCover)
            || (!!b.memory && this.positions.protected(feet, b.memory, true)));
        if (!arrived && b.coverPhase === 'hide' && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks) this.squad.requestSupport(b.id, tick);
        if (!b.route.length && !arrived && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks) {
          const cover = b.cover;
          let here = true;
          this.navJob(b, 'route', `goto:${destination.join(',')}`, feet, (from) => nav.routeSteps(from, destination), (route) => {
            // A late answer for a cover since given up, or to a point that is no longer the current phase's (batch 8: a
            // peek route landing after the phase turned to hide filled the route, and a non-empty route asks nothing new)
            // -- dropped; the phase's own route is asked on the bot's next slot. Compared by the destination, not the phase
            // flag (batch 10, the review of 55f205ca0): when the peek is the hide point both phases ask the same key, a
            // re-ask keeps the old job, and its answer is still the right one.
            const now = b.cover ? (b.coverPhase === 'hide' ? b.cover.hide : b.cover.peek) : null;
            if (!here && (b.cover !== cover || !now || Math.hypot(now[0] - destination[0], now[1] - destination[1], now[2] - destination[2]) > 0.01)) return;
            if (!here) this.lateApplied(destination, now);
            b.route = route;
            // Batch 7 (s43): a route to the HIDE point that ends `arrival` or more short of it is a failed path too -- the
            // hide was on a node no body stands on (LATER 564), so the route ended on a neighbour 14 off and the bot stood
            // there for good (never arrived, its last point never popped, no re-plan, the deadlock rule only within
            // `waypoint`). Not a peek route (the review): a peek ending short is no permanent stall -- it ends when the
            // contact is lost past `coverPhaseUntil` or the action turns back to hide -- and the bot peeks from there.
            const end = route.at(-1);
            // Batch 11 (F2): the phase read at LANDING -- since 882c00804 a late answer can apply in the other phase (peek ==
            // hide), and the rule is the hide phase's.
            if (b.coverPhase === 'hide' && end && Math.hypot(end[0] - destination[0], end[2] - destination[2]) >= TACTICS_ADAPTATION.arrival) b.route = [];
            if (!b.route.length) {
              this.squad.release(b.id, 'path-invalid');
              this.giveUpCover(b, this.room.tick);
              b.cover = null; b.coverPlanAt = this.room.tick; b.planner.invalidate('cover-path-failed');
            }
          });
          here = false;
        }
        while (b.route.length && Math.hypot(b.route[0]![0] - s.x, b.route[0]![2] - s.z)
          < (b.route.length === 1 ? TACTICS_ADAPTATION.arrival : BOT_AI_ADAPTATION.waypoint)
          && (b.route.length > 1 || arrived)
          && (b.route.length === 1 || Math.hypot(b.route[0]![0] - s.x, b.route[0]![2] - s.z) < STEERING_ADAPTATION.deadBand
            || nav.canWalk(feet, b.route[1]!))) b.route.shift();
        dx = arrived ? 0 : b.route[0] ? b.route[0][0] - s.x : 0;
        dz = arrived ? 0 : b.route[0] ? b.route[0][2] - s.z : 0;
        // BOP-S, the cover deadlock (BOP.R11, OT.R81): the cover's `valid` reads protection at the hide point and
        // `arrived` at the feet, so a bot whose route is spent a hair off the hide point on its exposed side never
        // arrived and never gave up -- the last bit was under the steering's dead band (`space`: under 0.1 unit no
        // move). Read both at the hide point: step onto it (a full stride toward it, which the dead band lets through),
        // and if it is still not protected there after `stuckTicks` of such steps, give that cover up so the re-plan runs.
        // The timer is its cover's (the review's F1) and counts only the ticks the stride was really steered (F2: counted
        // where the command is built, after the reload, a support, an equipment or a yield may have held the bot).
        if (b.coverPhase === 'hide' && !arrived && b.route.length <= 1
          && Math.hypot(destination[0] - s.x, destination[2] - s.z) < BOT_AI_ADAPTATION.waypoint) {
          if (b.coverStep?.cover !== b.cover) b.coverStep = { cover: b.cover, steered: 0, stretched: false };
          if (b.coverStep.steered >= BOT_AI_ADAPTATION.stuckTicks) {
            this.squad.release(b.id, 'path-invalid');
            this.giveUpCover(b, tick);
            b.cover = null; b.coverPlanAt = tick; b.route = []; b.coverStep = undefined; b.planner.invalidate('cover-path-failed');
            dx = 0; dz = 0;
          } else {
            const d = Math.hypot(dx, dz);
            b.coverStep.stretched = d > 0 && d < 0.1;
            if (b.coverStep.stretched) { dx = dx / d * TACTICS_ADAPTATION.arrival; dz = dz / d * TACTICS_ADAPTATION.arrival; }
          }
        } else b.coverStep = undefined;
        const hiding = b.coverPhase === 'hide';
        exposed = !hiding && laneClear;
        b.behaviour = hiding ? arrived ? 'hold-cover' : 'take-cover' : 'peek';
        desiredStance = arrived && hiding ? 1 : 0;
        // Keep a useful firing position. A reload, incoming fire or failed geometry gives the next action a reason.
        // F.E.A.R.'s published design, research 98; timings remain our own practice tuning.
        if (hiding && arrived && !b.coverPhaseUntil && !needsMagazine && !reloading && tick >= b.pressureUntil)
          b.coverPhaseUntil = tick + TACTICS_ADAPTATION.hideTicks + (100 - ROLE_ADAPTATION[b.role].aggression) * TACTICS_ADAPTATION.hideAggression;
        if (hiding && b.coverPhaseUntil && tick >= b.coverPhaseUntil && !needsMagazine && !reloading && tick >= b.pressureUntil) {
          b.coverPhase = 'peek'; b.coverPhaseUntil = tick + SEARCH_ADAPTATION.lostSightTicks; b.route = [];
        }
      }
      if (action === 'approach' && !tactical && b.target !== null && b.memory && muzzle && !laneClear && (!b.cover || b.coverPhase === 'peek')
        && tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks) {
        const offset: Point = [muzzle[0] - feet[0], muzzle[1] - feet[1], muzzle[2] - feet[2]];
        const committed = b.reposition && this.positions.canFire(b.reposition, b.memory, offset, b.memoryHeight);
        const step = committed ? b.reposition : this.positions.clearLane(feet, b.memory, [], offset, b.memoryHeight);
        if (step) {
          b.cover = null; b.coverPlanAt = tick; b.route = []; b.reposition = step;
          if (!committed) b.actionUntil = tick + Math.max(BOT_AI_ADAPTATION.repositionTicks,
            Math.ceil(Math.hypot(step[0] - s.x, step[2] - s.z) * BOT_AI_ADAPTATION.clearanceTicksPerUnit));
          dx = step[0] - s.x; dz = step[2] - s.z; desiredStance = 0;
        } else {
          // A wide obstruction needs an ordinary walking approach around its edge, not a frozen peek.
          b.cover = null; b.coverPlanAt = tick; b.reposition = null; b.lastPlan = tick; desiredStance = 0;
          const memory = b.memory, cursor = newAnglesCursor();
          let here = true;
          this.navJob(b, 'route', 'approach', feet, (from) => this.approachSteps(from, memory, cursor), (route) => {
            if (!here && (b.cover || b.search || !b.alive)) return;
            if (!here) this.lateApplied(memory, b.memory);
            b.route = route;
          });
          here = false;
        }
      }
      if (b.target !== null && !laneClear && !b.cover && !b.reposition && b.route[0]) {
        dx = b.route[0][0] - s.x; dz = b.route[0][2] - s.z;
      }
      if (supporting) { dx = 0; dz = 0; b.behaviour = 'cover-fire'; }
      if (action === 'search' && !b.search && b.memory && tick < b.pathFailedUntil)
        this.beginSearchWithAngles(b, feet, [...feet], [], 'path-failed');
      const search = action === 'search' ? this.searchContact(b, feet) : null;
      if (search) { dx = search.dx; dz = search.dz; }
      const holdBlock = (action === 'patrol' || action === 'fire') && tactical && !b.cover && !supporting && tick >= b.pressureUntil;
      // Batch 11 review (2): an aside is the hold block's; it ends whenever the block is skipped (contact, a cover, a
      // support, pressure), and it expires before a stamp is looked up -- else a stale one was reused far from here.
      if (b.holdAside && (!holdBlock || tick - b.holdAside.last > TRAFFIC_ADAPTATION.yieldTicks)) {
        b.holdReturning = !!holdBlock;                             // expired: walking back (a skipped block ends that too)
        b.holdAside = undefined;
      }
      if (b.holdReturning && (!holdBlock || tactical?.hold)) b.holdReturning = undefined;   // back at its hold, or out of it
      if (holdBlock && tactical) {
        // An opening's route keeps walking through `fire` at distant sight (FBA.R13), and a round fired on the move leaves a
        // bloomed cone (the room's, as for any moving player): with a visible target inside the role's range the bot stands
        // to shoot, the route kept to resume after.
        // Batch 11 (B, the holder in a passage): a holder that a priority teammate (a lower id) stamped as the body
        // refusing its leg on the tick before (`blockedBy`, from this tick's snapshot) steps aside -- perpendicular to
        // the walker's approach, by the yielder's own probe (`offset` at `passDistance`), to a point off the walker's
        // leg by the traffic's `overlap` -- and waits there; `yieldTicks` after the last stamp it lets TeamTactics walk it
        // back to its hold. The hold's own timing (its start, its until) is TeamTactics' and is not touched.
        const walker = tactical.hold || b.holdAside
          ? peers.find((q) => q.id < b.id && q.blockedBy?.id === b.id && q.blockedBy.tick === tick - 1) : undefined;
        if (walker) {
          if (b.holdAside) b.holdAside.last = tick;
          else {
            const ax = s.x - walker.at[0], az = s.z - walker.at[2], ad = Math.hypot(ax, az) || 1;
            const past: Point = [s.x + ax / ad * TRAFFIC_ADAPTATION.passDistance, s.y, s.z + az / ad * TRAFFIC_ADAPTATION.passDistance];
            // Off the walker's leg: its approach line on through this body, and its own next route legs (the snapshot's).
            const legs: [Point, Point][] = [[walker.at, past]];
            let from = walker.at;
            for (const q of walker.next ?? []) { legs.push([from, q]); from = q; }
            for (const side of [b.id > walker.id ? 1 : -1, b.id > walker.id ? -1 : 1]) {
              const to = nav.offset(feet, -az / ad * side, ax / ad * side, TRAFFIC_ADAPTATION.passDistance);
              // And clear of every ally (the review): its own step there keeps each teammate on its floor outside the overlap,
              // the give-way's own `clearPass` test.
              const allyClear = (to: Point): boolean => peers.every((q) => q.id === b.id || q.team !== b.team
                || Math.abs(q.at[1] - feet[1]) > CROWD_ADAPTATION.sameFloor
                || pointSegment(q.at, feet, to) >= Math.min(TRAFFIC_ADAPTATION.overlap, Math.hypot(q.at[0] - feet[0], q.at[1] - feet[1], q.at[2] - feet[2])));
              if (to && legs.every(([a, c]) => pointSegment(to, a, c) >= TRAFFIC_ADAPTATION.overlap) && allyClear(to)) { b.holdAside = { to, last: tick }; break; }
            }
          }
        }
        const aside = b.holdAside?.to;
        const stand = tactical.hold || !!aside || (TACTICS_ADAPTATION.stopToFireOnOpening && action === 'fire' && b.target !== null
          && enemyDistance <= ROLE_ADAPTATION[b.role].range);
        dx = stand ? 0 : b.route[0] ? b.route[0][0] - s.x : 0;
        dz = stand ? 0 : b.route[0] ? b.route[0][2] - s.z : 0;
        if (tactical.hold || aside) { b.route = []; b.progressAt = tick; }
        if (aside && Math.hypot(aside[0] - s.x, aside[2] - s.z) > TACTICS_ADAPTATION.arrival) { dx = aside[0] - s.x; dz = aside[2] - s.z; }
      }
      // Measure actual progress continuously so short left/right sweeps and intentional stops do not look stuck.
      // BOP-S (eb's ladders): a walking bot with no route that is not holding is no intentional stop -- every plan of
      // its came back empty -- so it counts toward the stall like a bot pushing a route it cannot walk.
      // Not while it waits on its own plan (the review's LF1): a job under way, or a cleared route not yet re-asked
      // (lastPlan -1000), is no failed plan -- those ticks hold the clock, neither count nor reset it, and the recovery's
      // job never replaces a pending plan in its slot.
      const noRoute = walkingAction && !b.route.length && !tactical?.hold && !supporting;   // LF2: a supporter holds for its partner
      // R2: lastPlan -1000 always reaches the plan block on the bot's slot -- a walking action never keeps `b.search`
      // (approach sees its target, which clears it; patrol has no contact, which clears it; with a search under way the
      // planner's atContact holds and it chooses search, not investigate; an action change clears it), nor a cover
      // (approach, investigate and patrol drop it; a tactical fire with a cover holds at it by design): the wait ends in a slot.
      const waiting = noRoute && (b.lastPlan === -1000 || this.jobs.pending(b.id, 'route'));
      const stalled = noRoute && !waiting;
      if (waiting) b.progressAt++;
      if (Math.hypot(s.x - b.progress[0], s.z - b.progress[2]) >= BOT_AI_ADAPTATION.progressDistance || (Math.hypot(dx, dz) < 0.1 && !noRoute)) {
        b.progress = feet; b.progressAt = tick;
      }
      if (tick - b.progressAt >= BOT_AI_ADAPTATION.stuckTicks) {
        if (Math.hypot(s.x - b.progress[0], s.z - b.progress[2]) < BOT_AI_ADAPTATION.progressDistance && (Math.hypot(dx, dz) > 0.1 || stalled)) {
          const destination = tactical?.goal ?? b.memory ?? b.route.at(-1);
          b.recoverUntil = tick + BOT_AI_ADAPTATION.recoverTicks; b.route = []; b.lastPlan = tick; b.side *= -1;
          // A failed cover approach must release its reservations instead of repeatedly walking into the same corner.
          this.giveUpCover(b, tick);
          b.cover = null; b.coverPlanAt = tick; b.reposition = null;
          b.giveWay = undefined;                                  // B2: a recovery is never swallowed by a give-way
          this.squad.release(b.id, 'path-invalid');
          b.planner.invalidate('movement-stalled');
          // Release a blocked angle while preserving the hunt and its remaining search budget.
          if (b.search) { b.search.points.shift(); b.search.lookUntil = 0;
            if (!b.search.points.length) b.search.points = [[...b.search.contact]]; }
          if (destination) {
            const target = b.search?.points[0] ?? destination, side = b.side, aim = this.currentTarget(b);
            let here = true;
            this.navJob(b, 'route', 'recover', feet, (from) => this.recoverySteps(from, target, side), (route) => {
              if (!here && (b.cover || !b.alive || this.room.tick >= b.recoverUntil)) return;
              if (!here) this.lateApplied(aim, this.currentTarget(b));   // the plan's target then and now: a patrol has none
              b.route = route;
            });
            here = false;
          }
        }
        b.progress = feet; b.progressAt = tick;
      }
      if (tick < b.recoverUntil) {
        b.behaviour = 'recover';
        dx = b.route[0] ? b.route[0][0] - s.x : 0; dz = b.route[0] ? b.route[0][2] - s.z : 0;
      }
      let startedEquipment = false;
      if (!b.equipment && b.target !== null && b.memory && !reloading && !p.sim.walker.swapProgress() && p.held === null
        && p.sim.walker.posture === 'stand' && p.sim.walker.stance === 'stand'
        && tick - b.lastEquipment > BOT_THROW_ADAPTATION.cooldownTicks
        && Math.abs(b.memory[1] - feet[1]) < EQUIPMENT_USE_ADAPTATION.sameFloor && Math.abs(shortTurn(s.yaw, b.yaw)) < EQUIPMENT_USE_ADAPTATION.facingDegrees) {
        const target = b.memory, solution = solveBotThrow(enemyDistance);
        const allies = peers.filter((q) => q.team === b.team && q.id !== b.id);
        const allyNearLanding = allies.some((q) => Math.hypot(q.at[0] - target[0], q.at[2] - target[2])
          < EQUIPMENT_USE_ADAPTATION.allyLanding + BOT_THROW_ADAPTATION.impactMargin);
        const allyInFlight = allies.some((q) => pointSegment(q.at, feet, target) < BOT_THROW_ADAPTATION.laneMargin
          && Math.hypot(q.at[0] - feet[0], q.at[2] - feet[2]) < enemyDistance - EQUIPMENT_USE_ADAPTATION.laneNearCut);
        const purpose = chooseTacticalThrow({ distance: enemyDistance, visibleTicks: tick - b.visibleSince,
          enemiesAtLanding: b.seen.filter((seen) => Math.hypot(seen.at[0] - target[0], seen.at[2] - target[2]) < EQUIPMENT_USE_ADAPTATION.enemyLanding).length,
          underFire: tick < b.pressureUntil || tick < b.dangerUntil,
          gunBlocked: !!aimFrame && !!muzzle && !this.clearShot(b, aimFrame, muzzle),
          pursuing: action === 'approach' || action === 'fire', allyNearLanding, allyInFlight,
          frag: this.throwable(p, 'frag') !== null, smoke: this.throwable(p, 'smoke') !== null,
          flash: this.throwable(p, 'flash') !== null, role: b.role });
        const kind = purpose ? this.throwable(p, purpose) : null;
        if (kind && solution && this.throwArcClear(feet, b.yaw, solution)) {
          const power = solution.power;
          b.equipment = { kind, start: p.sim.seq + 1, releaseAt: tick + Math.ceil(releaseSeconds(throwAnim(power, 0, 'stand')) * TICK_HZ),
            power, target: [...target] };
          b.lastEquipment = tick; startedEquipment = true;
        }
      }
      if (b.equipment) { dx = 0; dz = 0; }
      if (tick < b.throwHoldUntil) { dx = 0; dz = 0; }
      // A plan owns movement permissions. Weapon reload and deliberate holds cannot inherit an old approach.
      if (action === null || action === 'reload' || action === 'hold-cover' || action === 'suppress') { dx = 0; dz = 0; }
      // LF3: near the rungs it got off, never push into them; slide along their face instead.
      const avoid = b.ladderAvoid;
      if (avoid && (tick >= avoid.until || avoid.revision !== this.navigation.revision || avoid.hull !== this.hullState)) b.ladderAvoid = undefined;
      else if (avoid && Math.hypot(s.x - avoid.at[0], s.z - avoid.at[2]) < LADDER_STANDOFF + BODY_RADIUS) {
        const toward = dx * avoid.into[0] + dz * avoid.into[1];
        if (toward > 0) { dx -= toward * avoid.into[0]; dz -= toward * avoid.into[1]; }
      }
      const remaining = Math.hypot(dx, dz);
      const tSpace = prof ? prof.now() : 0n;
      if (prof) prof.caller = 'space';
      [dx, dz] = this.space(b, feet, dx, dz, peers);
      if (prof) { prof.caller = 'other'; prof.end('space', tSpace); }
      [dx, dz] = cornerSlide(p.sim.walker.wallHits(), s.x, s.z, dx, dz, b.side);   // BOT-CORNER
      if (b.reposition && b.target !== null && !b.cover && tick >= b.recoverUntil) b.behaviour = 'flank';
      const moving = Math.hypot(dx, dz);
      // F2: the deadlock's stride counts only when it was really steered this tick.
      if (b.coverStep?.stretched) { if (moving > 0) b.coverStep.steered++; b.coverStep.stretched = false; }
      const coverLook = (b.cover || tick < b.dangerUntil || moving < 0.1) && b.memory
        ? faceToward({ feet, posture: p.sim.walker.posture }, [b.memory[0], b.memory[1] + STEERING_ADAPTATION.contactLift, b.memory[2]]) : null;
      // Stationary opening roles scan the approach while they hold; neither the enemy's hidden live pose nor
      // a frozen spawn-facing direction is used as a search target.
      // Batch 11 review (watch): a holder stepping aside or walking back keeps its hold's watch, not its movement.
      const watch = tactical && (moving < 0.1 || !!b.holdAside || !!b.holdReturning) && b.target === null && !b.memory
        ? faceToward({ feet, posture: p.sim.walker.posture }, [tactical.watch[0], tactical.watch[1] + STEERING_ADAPTATION.watchLift, tactical.watch[2]]) : null;
      const sweep = Math.sin((tick + b.id * STEERING_ADAPTATION.sweepPhaseStep) / (2 * TICK_HZ) * Math.PI) * STEERING_ADAPTATION.sweepDegrees;
      const throwLook = b.equipment ? faceToward({ feet, posture: p.sim.walker.posture },
        [b.equipment.target[0], b.equipment.target[1] + EQUIPMENT_USE_ADAPTATION.aimLift, b.equipment.target[2]]) : null;
      const wantedYaw = throwLook ? throwLook.yaw : b.target !== null ? b.yaw : search?.yaw ?? (coverLook ? coverLook.yaw
        : watch ? wrapYaw(watch.yaw + sweep) : moving > 0 ? wrapYaw(Math.atan2(-dx, -dz) * 180 / Math.PI) : wrapYaw(s.yaw + 1));
      const maxTurn = Math.min((STEERING_ADAPTATION.turnBase + ROLE_ADAPTATION[b.role].accuracy * STEERING_ADAPTATION.turnPerAccuracy) / TICK_HZ, MAX_YAW_RATE * 180 / Math.PI / TICK_HZ);
      const yawError = shortTurn(s.yaw, wantedYaw);
      const turn = MathUtils.clamp(mobileCombat ? MathUtils.damp(0, yawError, STEERING_ADAPTATION.lookResponse, 1 / TICK_HZ) : yawError, -maxTurn, maxTurn);
      const yaw = wrapYaw(s.yaw + turn), radians = yaw * Math.PI / 180;
      const [lookLo, lookHi] = aimPitchLimitsOf(p.sim.walker);
      const desiredPitch = Math.max(lookLo, Math.min(lookHi, b.target !== null ? b.pitch : coverLook?.pitch ?? STEERING_ADAPTATION.restPitch));
      const pitchError = desiredPitch - s.pitch;
      const pitch = s.pitch + MathUtils.clamp(mobileCombat ? MathUtils.damp(0, pitchError, STEERING_ADAPTATION.lookResponse, 1 / TICK_HZ) : pitchError, -maxTurn, maxTurn);
      // Third-person shots use cameraLook. Button.Aim selects the head/lens camera in ShotCone, not weapon raising.
      let buttons = 0;
      const reloadClip = reloading && tick - b.lastReload === 1 ? reloadHold(p.sim.walker.posture, p.sim.weapon === 1) : null;
      if (reloadClip) buttons |= holdBits(reloadClip);
      if (startedEquipment) buttons |= holdBits(throwAnim(b.equipment!.power, 0, 'stand').clip as HoldClip);
      desiredStance = b.equipment ? 0 : chooseBotStance(b.role, action, moving, enemyDistance, tick, b.id, desiredStance === 1,
        Math.hypot(s.vx, s.vz));
      const pronePop = p.sim.walker.stance === 'prone' && desiredStance === 0 && b.target !== null
        && enemyDistance < DODGE_ADAPTATION.pronePopRange && !b.equipment && !reloading;
      if ((p.sim.walker.stance === 'prone' ? 2 : p.sim.walker.stance === 'crouch' ? 1 : 0) !== desiredStance) {
        buttons |= Button.Stance;
        if (pronePop) desiredStance = 3;
      }
      const dodge = b.target !== null && tick < b.dangerUntil && enemyDistance >= DODGE_ADAPTATION.minRange
        && enemyDistance <= DODGE_ADAPTATION.maxRange && moving > 0.1 && !b.equipment
        && tick >= b.throwHoldUntil && !reloading && tick - b.lastDodge >= DODGE_ADAPTATION.cooldownTicks
        && p.sim.walker.stance === 'stand' && p.sim.walker.jumpClear()
        && this.navigation.offset(feet, dx, dz, DODGE_ADAPTATION.clearDistance) !== null;
      if (dodge) { buttons |= Button.Jump; b.lastDodge = tick; }
      // Keep the hand stable throughout a reload. An empty pistol still needs selecting so its ordinary reserve
      // reload (and the Room's existing online pistol-refill rule) can run after the finite rifle is exhausted.
      // A CREATE GAME equipment limit can leave a firearm slot absent (research 362 §2, FUN_005bdc30): the Room
      // refuses a swap to it (`swapRefused`), so the preference keeps the one present slot (#481 review).
      const primaryPresent = firearmSlotPresent(p.loadout, 0), secondaryPresent = firearmSlotPresent(p.loadout, 1);
      const weapon: 0 | 1 = reloading ? p.sim.weapon : !primaryPresent || !secondaryPresent
        ? primaryPresent ? 0 : secondaryPresent ? 1 : p.sim.weapon
        : chooseBotWeapon(itemClass(p.records[0].id), p.sim.weapon,
          b.target !== null ? enemyDistance : Infinity, p.mags[0].total(), p.mags[1].total());
      const switching = p.sim.weapon !== weapon;
      if (switching) buttons |= Button.Swap;
      const acquired = b.target !== null && tick - b.visibleSince >= ROLE_ADAPTATION[b.role].reactionMs / 1000 * TICK_HZ && Math.abs(shortTurn(yaw, b.yaw)) < 2;
      const ready = !b.equipment && firearmBack(p) && (action === 'fire' || action === 'suppress' || action === 'approach') && withinWeaponPreference && acquired && exposed && laneClear && !reloading && !switching && !p.sim.walker.swapProgress() && !(b.cover && p.sim.walker.posture !== 'stand')
        && Math.abs(desiredPitch - pitch) < 2 && !this.friendlyInLine(b, feet);
      const fireInput = b.firePolicy.update(p.records[p.sim.weapon], p.sim.weapon, b.role, enemyDistance,
        p.mags[p.sim.weapon].rounds(), tick, ready);
      if (fireInput.trigger) buttons |= Button.Trigger;
      const speed = b.target !== null ? STRAFE_ADAPTATION.speed : STEERING_ADAPTATION.patrolSpeed;
      // Slow only near a terminal destination. An intermediate corner still needs a decisive pad input.
      const arrival = b.reposition || b.route.length === 1 ? Math.max(STEERING_ADAPTATION.arrivalFloor, Math.min(1, remaining / STEERING_ADAPTATION.arrival)) : 1;
      const tSteer = prof ? prof.now() : 0n;
      if (prof) prof.caller = 'steer';
      const [forward, right] = mobileCombat ? this.steer(b, feet, radians, dx, dz, speed * arrival * b.trafficScale) : [
        moving ? (-Math.sin(radians) * dx - Math.cos(radians) * dz) / moving * speed : 0,
        moving ? (Math.cos(radians) * dx - Math.sin(radians) * dz) / moving * speed : 0,
      ];
      if (prof) { prof.caller = 'other'; prof.end('steer', tSteer); }
      const tCommand = prof ? prof.now() : 0n;
      p.raise = b.target !== null && !b.equipment;                 // OBF-14: `BOT_RAISE_READING`; a throw takes the hand
      const cmd: Command = { seq: p.sim.seq + 1, yaw, pitch, turn: turn * Math.PI / 180 * TICK_HZ, buttons, stance: desiredStance, weapon,
        forward, right };
      this.room.binary(b.id, encodeCommands({ viewTick: tick, commands: [cmd] }));
      if (prof) prof.end('command', tCommand);
      const tDoors = prof ? prof.now() : 0n;
      // Check every active input so a short reach window is not missed between perception samples.
      // Date the request at this command; the Room retains native reach, busy and locked checks.
      // BOT-DOOR-PRESS: only a door whose own leaf bars its walk (`wantsDoor`), shut or open, never one it merely
      // stands within reach of.
      for (let door = 0; door < this.room.doors.count; door++) {
        const state = this.room.doors.state(door);
        if (!state.busy && state.valve !== 99 && doorInReach(this.room.doors, door, feet) && this.wantsDoor(b, feet, door, tick)) {
          this.room.text(b.id, { type: 'door', seq: cmd.seq, door });
          break;
        }
      }
      if (prof) prof.end('doors', tDoors);
      if (startedEquipment && b.equipment) this.room.text(b.id, { type: 'throwStart', seq: cmd.seq, kind: b.equipment.kind });
      if (b.equipment && tick >= b.equipment.releaseAt) {
        const { kind, power, start, target } = b.equipment;
        // A friend can cross a doorway during the native windup. Recheck at hand-open time.
        const unsafeAlly = peers.some((q) => q.team === b.team && q.id !== b.id && (
          Math.hypot(q.at[0] - target[0], q.at[2] - target[2]) < EQUIPMENT_USE_ADAPTATION.allyLanding + BOT_THROW_ADAPTATION.impactMargin
          || (pointSegment(q.at, feet, target) < BOT_THROW_ADAPTATION.laneMargin
            && Math.hypot(q.at[0] - feet[0], q.at[2] - feet[2]) < Math.hypot(target[0] - feet[0], target[2] - feet[2]) - EQUIPMENT_USE_ADAPTATION.laneNearCut)));
        if (!unsafeAlly && (!b.memory || Math.hypot(b.memory[0] - feet[0], b.memory[2] - feet[2]) >= BOT_THROW_ADAPTATION.minimumDistance)) {
          const anim = throwAnim(power, 0, 'stand');
          const from = actorToWorldPoint(feet, yaw, anim.offset);
          const velocity = actorToWorldDir(yaw, throwVelocity(power, 0, anim.offset, maxThrowDistance('stand')).velocity);
          this.room.text(b.id, { type: 'throw', seq: cmd.seq, kind, from, velocity, start });
          const record = [...(this.kits?.table.throwables?.values() ?? [])].find((entry) => entry.record.name === kind)?.record;
          b.throwHoldUntil = tick + Math.ceil((record?.fuse ?? EQUIPMENT_USE_ADAPTATION.defaultFuseSeconds) * TICK_HZ) + EQUIPMENT_USE_ADAPTATION.holdTicks;
        }
        b.equipment = null;
      }
      if (tick % SCHEDULE_ADAPTATION.staggerTicks === b.id % SCHEDULE_ADAPTATION.staggerTicks) this.rocket(b, p, feet, yaw, cmd.seq, laneClear, peers);
      const current = p.sim.weapon;
      const sheltered = b.cover && !exposed && b.memory
        && Math.hypot(b.cover.hide[0] - s.x, b.cover.hide[2] - s.z) < TACTICS_ADAPTATION.arrival
        && this.positions.protected(feet, b.memory, p.sim.walker.posture !== 'stand');
      if (action === 'reload' && !switching && (p.mags[current].rounds() === 0 || (sheltered && needsMagazine))
        && tick - b.lastReload > SCHEDULE_ADAPTATION.reloadSpacingTicks && tick - b.lastShot >= Math.ceil((p.records[current].reloadDelay ?? 0.01) * TICK_HZ)
        && p.ran >= p.reloadUntil[current]) {
        this.room.text(b.id, { type: 'reload', seq: p.sim.seq }); b.lastReload = tick;
      }
      if (p.ran < p.reloadUntil[current]) b.behaviour = 'reload';
      const record = p.records[current];
      if (ready && fireInput.due
        && p.ran >= p.reloadUntil[current] && p.mags[current].rounds() > 0) {
        const frame = p.cone.frame(p.sim.seq);
        if (frame?.fire && !frame.swapping && this.withinWeaponPreference(b, p, frame.feet, b.memory)) {
          const from = this.shotOrigin(b.id, frame);
          if (!from) continue; // The normal frame/line gates remain authoritative.
          if (!this.clearShot(b, frame, from)) continue;
          const claims = Array.from({ length: pelletsOf(record) }, () => sampledClaim(frame, from, Math.max(SCHEDULE_ADAPTATION.minimumClaimDistance, enemyDistance), this.random));
          if (this.friendlyInLine(b, feet) || claims.some((c) => friendlyOnRay(this.room, b.id, c.from, c.dir, record))) continue;
          if (prof && b.target !== null) prof.fired(b.id, b.target, tick, this.botSeat(b.target) ? 'bot' : 'human');
          if (b.target !== null && b.memory) b.fired = { victim: b.target, at: [...b.memory], height: b.memoryHeight,
            yaw: frame.yaw, pitch: frame.pitch, tick, weapon: current, gun: record.id };
          for (const claim of claims) {
            b.verdict = p.cone.check(p.sim.seq, claim);
            this.room.text(b.id, { type: 'fire', seq: p.sim.seq, viewTick: tick, weapon: current, ...claim });
          }
          b.lastShot = tick;
          b.firePolicy.fired(tick);
        }
      }
    }
  }
  stats() {
    return { actors: [...this.actors.values()].map((b) => {
      const p = this.room.player(b.id)!, s = p.sim.walker.state;
      return { id: b.id, team: b.team, role: b.role, profile: { ...ROLE_ADAPTATION[b.role] }, fireMode: b.firePolicy.mode, fireModeReason: b.firePolicy.reason, name: this.room.lobby.member(b.id)!.name,
        primaryName: p.records[0].name, secondaryName: p.records[1].name,
        weapon: p.sim.weapon, alive: p.alive, feet: [s.x, s.y, s.z], kills: p.kills, deaths: p.deaths,
        behaviour: b.behaviour, target: b.target, hunt: b.hunt, lastKnown: b.memory ? [...b.memory] : null,
        planning: b.planner.snapshot(),
        searchUntil: b.memoryUntil || null, velocity: [s.vx, s.vz], yaw: s.yaw,
        lastHeard: b.heard ? { ...b.heard, at: [...b.heard.at] } : null,
        supporting: this.squad.status(b.id).role === 'supporter' ? this.squad.status(b.id).partner : null,
        squad: this.squad.status(b.id), route: b.route.length, rounds: p.mags[p.sim.weapon].rounds(),
        lastShot: b.lastShot, visibleSince: b.visibleSince, seq: p.sim.seq, verdict: b.verdict,
        stance: p.sim.walker.posture, nextWaypoint: b.route[0] ? [...b.route[0]] : null,
        cover: b.cover ? { hide: [...b.cover.hide], peek: [...b.cover.peek], threat: [...b.cover.threat], phase: b.coverPhase } : null };
    }), profiles: Object.fromEntries(Object.entries(ROLE_ADAPTATION).map(([role, profile]) => [role, { ...profile }])), nodes: this.navigation?.nodes.length ?? 0 };
  }
}
