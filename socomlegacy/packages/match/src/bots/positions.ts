/**
 * Authored multiplayer bot extension (FBA.R5, FBA.R8), ported from the preserved SOCOM practice-bot snapshot
 * source-20261020T223735Z. Decisions and tuning are ours, not recovered retail campaign behaviour. Existing
 * Redotcom movement, collision, weapon cone, damage, reload and animation implementations remain authority.
 */
import { isLiquidSurface, segmentHit, surfaceWord, SURFACE_SKIP } from '@s2u/scene';
import type { WorldPoly } from '@s2u/scene';
import { scopeEyeHeight as scopedEyeHeight } from '../../../viewer/src/cameraRig';
import { EYE_HEIGHT, rootY, type Stance } from '../../../viewer/src/mover';
import { pointSegment } from '../../../viewer/src/net/shotCone';
import { drain, WalkingNavigation, type NavSteps, type Point } from './navigation';

/** BOP-S: where a resumable `search` stands -- its candidates, the next one, the attempts made, the views chosen. */
export interface SearchCursor { candidates?: Point[]; index: number; attempts: number; selected: Point[] }
export const newSearchCursor = (): SearchCursor => ({ index: 0, attempts: 0, selected: [] });

const scopeEyeHeight = (stance: Stance): number => scopedEyeHeight(stance, rootY(stance));

export interface CoverPosition { hide: Point; peek: Point; crouch: boolean; threat: Point }
export interface CoverContext { threats?: Point[]; preferredRange?: number }
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Newly authored tactical search bounds, not campaign constants; authored extension FBA.R5. */
const COVER_ADAPTATION = { radius: 180, candidates: 48, nearbyWall: 45, peekDistances: [16, 28, 40], reservation: 24,
  clearanceDistances: [16, 28, 40, 64, 96, 144, 184],
  standingTarget: 12, nearPenalty: 0.15, exposureCost: 0.5, routeAttempts: 3, routeSamples: 8, routeExposureCost: 0.8,
  maxThreats: 7, hideThreatCost: 240, peekThreatCost: 48 };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Author-created local search limits. These inspect remembered contact, not an unseen actor. Authored extension FBA.R5. */
const SEARCH_POSITIONS_ADAPTATION = { radius: 65, candidates: 24, spacing: 24, points: 2, routeAttempts: 6 };
const horizontal = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
/**
 * OT.R81 (BOP-S batch 9): the port's invention, measured -- a line-of-sight test's work: its length over this many
 * world units is one glide sample (the navigation work unit). `tools/bops-raycal.ts` on MP2 (this host): `blocked`
 * over 4,000 node-to-node rays 60-400 units long against `clearBody` over 4,000 glides 2.5-60 long, interleaved rounds, medians --
 * 0.027 ms a ray (mean length 253) against 0.123 ms a glide sample, near linear in length (0.076 samples at 60-120,
 * 0.122 at 120-200, 0.200 at 200-300, 0.312 at 300-400): 0.087 samples per 100 units. `protected` and `canFire` are
 * one such ray each (0.216 and 0.215 samples at the same mean length). A single-host value: S1 confirms or re-sets it.
 */
export const RAY_UNITS_PER_SAMPLE_ADAPTATION = 1150;
const rayWork = (from: Point, to: Point): number =>
  Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / RAY_UNITS_PER_SAMPLE_ADAPTATION;
const SOLID = (p: WorldPoly): boolean => !isLiquidSurface(p) && (surfaceWord(p) & SURFACE_SKIP) === 0;

/** Geometry relative to sensed threats only. A cover point must have a reachable, clear firing exposure. */
export class CombatPositions {
  constructor(private readonly nav: WalkingNavigation) {}

  /** BOP-S batch 9: every line-of-sight test is charged to the navigation work (`rayWork`), wherever it is made. */
  private ray(from: Point, to: Point): ReturnType<typeof segmentHit> {
    this.nav.work += rayWork(from, to);
    return segmentHit(this.nav.map.grid, from, to, SOLID);
  }

  blocked(from: Point, to: Point): boolean { return this.ray(from, to) !== null; }

  /** `blocked` as one resumable step (BOP-S batch 9): the step comes before the ray and yields its work. */
  *blockedSteps(from: Point, to: Point): NavSteps<boolean> {
    yield rayWork(from, to);
    return this.blocked(from, to);
  }

  private protectedRay(at: Point, threat: Point, crouch: boolean): [Point, Point] {
    return [[at[0], at[1] + scopeEyeHeight(crouch ? 'crouch' : 'stand'), at[2]], [threat[0], threat[1] + EYE_HEIGHT, threat[2]]];
  }

  protected(at: Point, threat: Point, crouch: boolean): boolean {
    const [own, eye] = this.protectedRay(at, threat, crouch), hit = this.ray(own, eye);
    return hit !== null && Math.hypot(hit.point[0] - own[0], hit.point[2] - own[2]) < COVER_ADAPTATION.nearbyWall;
  }

  *protectedSteps(at: Point, threat: Point, crouch: boolean): NavSteps<boolean> {
    const [own, eye] = this.protectedRay(at, threat, crouch);
    yield rayWork(own, eye);
    return this.protected(at, threat, crouch);
  }

  private fireRay(at: Point, threat: Point, muzzle: Point, targetHeight: number): [Point, Point] {
    return [[at[0] + muzzle[0], at[1] + muzzle[1], at[2] + muzzle[2]], [threat[0], threat[1] + targetHeight, threat[2]]];
  }

  canFire(at: Point, threat: Point, muzzle: Point = [0, EYE_HEIGHT, 0], targetHeight = COVER_ADAPTATION.standingTarget): boolean {
    const [from, to] = this.fireRay(at, threat, muzzle, targetHeight);
    return !this.blocked(from, to);
  }

  *canFireSteps(at: Point, threat: Point, muzzle: Point = [0, EYE_HEIGHT, 0], targetHeight = COVER_ADAPTATION.standingTarget): NavSteps<boolean> {
    const [from, to] = this.fireRay(at, threat, muzzle, targetHeight);
    return !(yield* this.blockedSteps(from, to));
  }

  valid(position: CoverPosition, threat: Point): boolean {
    return this.protected(position.hide, threat, true) && this.canFire(position.peek, threat)
      && this.nav.canWalk(position.hide, position.peek);
  }

  /** A short, walkable change of angle when a teammate occupies the observed firing lane. */
  clearLane(from: Point, threat: Point, allies: Point[], muzzle?: Point, targetHeight = COVER_ADAPTATION.standingTarget): Point | null {
    const dx = threat[0] - from[0], dz = threat[2] - from[2], d = Math.hypot(dx, dz) || 1;
    for (const length of muzzle ? COVER_ADAPTATION.clearanceDistances : COVER_ADAPTATION.peekDistances) for (const side of [-1, 1]) {
      const at: Point = [from[0] - dz / d * length * side, from[1], from[2] + dx / d * length * side];
      if (!this.nav.canWalk(from, at) || !this.canFire(at, threat, muzzle, targetHeight)) continue;
      if (allies.some((p) => Math.abs(p[1] - at[1]) < 12 && (horizontal(p, at) < COVER_ADAPTATION.reservation
        || pointSegment([p[0], p[1] + 12, p[2]], [at[0], at[1] + EYE_HEIGHT, at[2]], [threat[0], threat[1] + 12, threat[2]]) < COVER_ADAPTATION.reservation / 2))) continue;
      return at;
    }
    return null;
  }

  /** A few distinct reachable views of the remembered area, respecting other bots' reserved positions. */
  search(from: Point, contact: Point, reserved: Point[]): Point[] { return drain(this.searchSteps(from, contact, reserved)); }

  /**
   * `search` as resumable steps (BOP-S). The cursor holds the candidate list (ordered from the first origin), the next
   * candidate, the attempts made and the views chosen: a job restarted by a door change or a moved body resumes
   * mid-list from its cursor, its routes from the new origin, instead of starting the list again.
   */
  *searchSteps(from: Point, contact: Point, reserved: Point[], cursor: SearchCursor = newSearchCursor()): NavSteps<Point[]> {
    const candidates = cursor.candidates ??= this.nav.nearby(contact, SEARCH_POSITIONS_ADAPTATION.radius, SEARCH_POSITIONS_ADAPTATION.candidates)
      .filter((at) => horizontal(at, contact) >= SEARCH_POSITIONS_ADAPTATION.spacing
        && !reserved.some((p) => horizontal(at, p) < SEARCH_POSITIONS_ADAPTATION.spacing))
      .sort((a, b) => horizontal(a, from) - horizontal(b, from));
    const selected = cursor.selected;
    for (; cursor.index < candidates.length; cursor.index++) {
      const at = candidates[cursor.index]!;
      if (selected.some((p) => horizontal(at, p) < SEARCH_POSITIONS_ADAPTATION.spacing)) continue;
      if (cursor.attempts + 1 > SEARCH_POSITIONS_ADAPTATION.routeAttempts) break;
      const route = yield* this.nav.routeSteps(from, at);
      cursor.attempts++;
      if (!route.length) continue;
      selected.push(at);
      if (selected.length === SEARCH_POSITIONS_ADAPTATION.points) { cursor.index++; break; }
    }
    return selected;
  }

  /**
   * Distance-weighted standing exposure along the real walking route, with a fixed ray budget -- as resumable steps
   * (BOP-S batch 9): one per ray, each charged.
   */
  private *exposedApproachSteps(from: Point, route: Point[], length: number, threats: Point[]): NavSteps<number> {
    if (length < 0.01) return 0;
    const stride = length / COVER_ADAPTATION.routeSamples;
    let exposed = 0, index = 0, before = from, travelled = 0;
    for (let i = 0; i < COVER_ADAPTATION.routeSamples; i++) {
      const sample = (i + 0.5) * stride;
      let to = route[index]!, segment = Math.hypot(to[0] - before[0], to[1] - before[1], to[2] - before[2]);
      while (index < route.length - 1 && travelled + segment < sample) {
        travelled += segment; before = to; to = route[++index]!;
        segment = Math.hypot(to[0] - before[0], to[1] - before[1], to[2] - before[2]);
      }
      const t = segment > 0 ? Math.min(1, (sample - travelled) / segment) : 0;
      const eye: Point = [before[0] + (to[0] - before[0]) * t, before[1] + (to[1] - before[1]) * t + EYE_HEIGHT,
        before[2] + (to[2] - before[2]) * t];
      for (const threat of threats) if (!(yield* this.blockedSteps(eye, [threat[0], threat[1] + EYE_HEIGHT, threat[2]]))) exposed += stride;
    }
    return exposed * COVER_ADAPTATION.routeExposureCost;
  }

  /** Threat points are caller-sensed feet; conservative standing eyes cover posture uncertainty. */
  choose(from: Point, threat: Point, reserved: Point[], context: CoverContext = {}): CoverPosition | null {
    return drain(this.chooseSteps(from, threat, reserved, context));
  }

  /**
   * `choose` as resumable steps (BOP-S): one step per walk test of a peek, and per step of each candidate's route; and
   * (batch 9) one per candidate and per line-of-sight test, each test charged its work (`rayWork`).
   */
  *chooseSteps(from: Point, threat: Point, reserved: Point[], context: CoverContext = {}): NavSteps<CoverPosition | null> {
    const threats = [threat];
    for (const at of context.threats ?? []) {
      if (threats.length === COVER_ADAPTATION.maxThreats) break;
      if (!threats.some((p) => horizontal(at, p) < 1 && Math.abs(at[1] - p[1]) < 2)) threats.push(at);
    }
    const others = threats.slice(1);
    const candidates = [from, ...this.nav.nearby(from, COVER_ADAPTATION.radius, COVER_ADAPTATION.candidates)];
    const options: { position: CoverPosition; cost: number }[] = [];
    for (const at of candidates) {
      yield;
      if (reserved.some((p) => Math.abs(p[1] - at[1]) < 12 && horizontal(p, at) < COVER_ADAPTATION.reservation)) continue;
      if (!(yield* this.protectedSteps(at, threat, true))) continue;
      const dx = threat[0] - at[0], dz = threat[2] - at[2], d = Math.hypot(dx, dz) || 1;
      let peek: Point | null = (yield* this.canFireSteps(at, threat)) ? at : null;
      if (!peek) for (const length of COVER_ADAPTATION.peekDistances) {
        for (const sign of [-1, 1]) {
          const p: Point = [at[0] - dz / d * length * sign, at[1], at[2] + dx / d * length * sign];
          if (reserved.some((r) => Math.abs(r[1] - p[1]) < 12 && horizontal(r, p) < COVER_ADAPTATION.reservation)
            || !(yield* this.canFireSteps(p, threat))) continue;
          const walkable = yield* this.nav.canWalkSteps(at, p);
          yield;
          if (!walkable) continue;
          peek = p; break;
        }
        if (peek) break;
      }
      if (!peek) continue;
      let flankCost = 0, crouch = !(yield* this.protectedSteps(at, threat, false));
      for (const other of others) {
        const eye: Point = [other[0], other[1] + EYE_HEIGHT, other[2]];
        const lowBlocked = yield* this.blockedSteps([at[0], at[1] + scopeEyeHeight('crouch'), at[2]], eye);
        if (!lowBlocked) flankCost += COVER_ADAPTATION.hideThreatCost;
        else if (!(yield* this.blockedSteps([at[0], at[1] + EYE_HEIGHT, at[2]], eye))) crouch = true;
        if (!(yield* this.blockedSteps([peek[0], peek[1] + EYE_HEIGHT, peek[2]], eye))) flankCost += COVER_ADAPTATION.peekThreatCost;
      }
      const preferred = context.preferredRange;
      const range = preferred !== undefined && Number.isFinite(preferred) ? Math.abs(d - Math.max(0, preferred)) : d;
      options.push({ position: { hide: [...at], peek: [...peek], crouch, threat: [...threat] },
        cost: horizontal(from, at) + horizontal(at, peek) * COVER_ADAPTATION.exposureCost
          + range * COVER_ADAPTATION.nearPenalty + flankCost });
    }
    options.sort((a, b) => a.cost - b.cost);
    let best: CoverPosition | null = null, bestCost = Infinity;
    for (const option of options.slice(0, COVER_ADAPTATION.routeAttempts)) {
      const route = yield* this.nav.routeSteps(from, option.position.hide);
      if (!route.length) continue;
      let length = 0, previous = from;
      for (const at of route) {
        length += Math.hypot(at[0] - previous[0], at[1] - previous[1], at[2] - previous[2]);
        previous = at;
      }
      const cost = option.cost - horizontal(from, option.position.hide) + length + (yield* this.exposedApproachSteps(from, route, length, threats));
      if (cost < bestCost) { best = option.position; bestCost = cost; }
    }
    return best;
  }
}
