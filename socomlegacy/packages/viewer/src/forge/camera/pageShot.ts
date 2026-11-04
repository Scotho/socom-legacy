import type { Pose } from '../../camera';
import { createShotDriver, linearShotSampler, type ShotDriver, type ShotEnded, type ShotPoint, type ShotSampler, type ShotSpec } from './driver';
import { checkShot, sampleShot } from './shot';

/**
 * R5-B (a browser adaptation, no original): the camera shot's page half -- the one driver a page (the Forge editor, the
 * solo test room) builds on its own fly camera, the sampler closure that carries the map's scale, and the takeover
 * seam. It moves the fly camera's pose and nothing else: never the game's own camera law, its pitch clamp, Play, roll,
 * the FOV or any simulation value.
 *
 * The units seam (the UI seat's ruling to dot, 2026-10-25 16:21Z): the motion law takes the map's `MetersPerUnit` as an
 * explicit third argument, read PER CALL from the page (which holds it; `FlyCamera.setScale` does not, and its 0.1
 * fallback is never used here); a law that throws, or no scale, gives a NaN pose, which the driver never applies and
 * ends the shot `stopped`.
 */

/** The motion law with the map's scale: dot's `sampleShot(spec, t, metersPerUnit)` (`./shot`). */
export type ScaledShotLaw = (spec: ShotSpec, t: number, metersPerUnit: number) => ShotPoint;
/** The admission check with the map's scale: dot's `checkShot(spec, metersPerUnit)` -- each finding's words; none, admitted. */
export type ScaledShotCheck = (spec: ShotSpec, metersPerUnit: number) => readonly string[];

/** The stand-in law (before dot's landed; kept as the explicit fallback): the driver's straight segments (no scale needed). */
export function standInShotLaw(spec: ShotSpec, t: number, _metersPerUnit: number): ShotPoint { return linearShotSampler(spec, t); }
/**
 * The stand-in check until dot's lands -- the two findings the frozen contract (2026-10-25 15:21Z / 16:21Z) names that
 * `parseCameraShot` lets through: a missing or non-positive scale, and a point whose look is its own position (a
 * zero-length look vector).
 */
export function standInShotCheck(spec: ShotSpec, metersPerUnit: number): string[] {
  if (!(Number.isFinite(metersPerUnit) && metersPerUnit > 0)) return ['the map states no scale (MetersPerUnit) to frame a shot with'];
  const findings: string[] = [];
  for (const [i, p] of spec.points.entries()) {
    if (p.at.every((v, k) => v === p.look[k])) findings.push(`point ${i} looks at its own position`);
  }
  return findings;
}
/**
 * R6 (8): dot's module (`./shot`, on this branch since `ffac65f36`): the page's law is `sampleShot` itself, through the
 * closure that reads the map's scale per call (`scaledShotSampler`); its check is `checkShot`, each finding's words
 * `<text> (<field>)`, run at admission before the bounds walk (`driver` `check`, then `shotAdmission`).
 */
export const PAGE_SHOT_LAW: ScaledShotLaw = (spec, t, metersPerUnit) => sampleShot(spec, t, metersPerUnit);
export const PAGE_SHOT_CHECK: ScaledShotCheck = (spec, metersPerUnit) => checkShot(spec, metersPerUnit).map((d) => `${d.text} (${d.field ?? 'shot'})`);

const NO_POSE: ShotPoint = { at: [Number.NaN, Number.NaN, Number.NaN], look: [Number.NaN, Number.NaN, Number.NaN] };
/** The scale a page holds now, or null: a positive, finite number only. */
const scaleOf = (metersPerUnit: () => number | null): number | null => {
  const m = metersPerUnit();
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : null;
};
/** The driver's sampler: the law with the page's scale read per call; no scale or a throw is a NaN pose. */
export function scaledShotSampler(metersPerUnit: () => number | null, law: ScaledShotLaw = PAGE_SHOT_LAW): ShotSampler {
  return (spec, t) => {
    const scale = scaleOf(metersPerUnit);
    if (scale === null) return NO_POSE;
    try { return law(spec, t, scale); } catch { return NO_POSE; }
  };
}
/** The driver's admission check: the first finding's words with the page's scale, or null. */
export function scaledShotCheck(metersPerUnit: () => number | null, check: ScaledShotCheck = PAGE_SHOT_CHECK): (spec: ShotSpec) => string | null {
  return (spec) => {
    const scale = scaleOf(metersPerUnit);
    try { return check(spec, scale ?? Number.NaN)[0] ?? null; } catch (e) { return e instanceof Error ? e.message : 'the camera shot does not check'; }
  };
}

/** The page's fly camera, as the shot uses it: its pose, and its exact setter (`FlyCamera.setPose`). */
export interface ShotCamera { pose(): Pose; setPose(pose: Pose): void }
export interface PageShotOptions {
  camera: ShotCamera;
  /** The loaded map's `MetersPerUnit`, read per call; null while the page holds none. */
  metersPerUnit: () => number | null;
  /** The page may take a pose now (Build, the fly camera); false ends the shot `mode`. */
  canDrive: () => boolean;
  /**
   * Once a shot ends, whatever ended it (the page saves its camera here, ONCE: a shot frame never saves). A shot
   * replaced by the next is not ended.
   */
  onEnd?: (ended: ShotEnded, shotId: string) => void;
  law?: ScaledShotLaw;
  check?: ScaledShotCheck;
  now?: () => number;
}
export interface PageShot {
  /** The one driver the page hands its facade (`shotDriver`); every end it reaches calls `onEnd`. */
  readonly driver: ShotDriver;
  /**
   * The camera stands off the pose the shot last gave it: someone else moved it since -- a person's accepted look (the
   * camera's own mouse, lock or touch handler), a key's glide, the page's own focus. The page ends the shot `manual`.
   * Input suspension is not read here (it is shared with focus and the menus, never a takeover detector).
   */
  overridden(): boolean;
  /**
   * The Forge page's frame in place of its fly update: no shot, the update. A shot: `mode` when the page cannot take
   * the pose; `manual` when the camera was moved since the last shot frame; else the update runs first as the takeover
   * test -- the shot's own setPose cleared the velocity and the FOV kick, so without an accepted input it moves nothing
   * -- and a move ends the shot `manual` before the shot overwrites it (the person's move stands); else the shot's frame.
   * A shot's first frame takes the camera without the test: a glide still coasting from before the shot is not input,
   * and the first pose (its setPose) clears it.
   */
  frame(dt: number, flyUpdate: () => void): void;
}

const samePose = (a: Pose, b: Pose): boolean => a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch;

export function createPageShot(options: PageShotOptions): PageShot {
  const { camera, canDrive, onEnd } = options;
  let given: Pose | null = null;
  let live: string | null = null;
  const inner = createShotDriver({
    sampler: scaledShotSampler(options.metersPerUnit, options.law),
    check: scaledShotCheck(options.metersPerUnit, options.check),
    apply: (pose) => {
      if (!canDrive()) return false;
      camera.setPose(pose);
      given = camera.pose();
      return true;
    },
    ...(options.now ? { now: options.now } : {}),
  });
  const settle = (): void => {
    if (live === null || inner.active()) return;
    const id = live, ended = inner.status().ended ?? 'stopped';
    live = null; given = null;
    onEnd?.(ended, id);
  };
  const driver: ShotDriver = {
    start(spec, shotId) { const replaced = inner.start(spec, shotId); live = shotId; given = null; return replaced; },
    stop(reason) { const id = inner.stop(reason); settle(); return id; },
    frame(dt) { const drove = inner.frame(dt); settle(); return drove; },
    status: () => inner.status(),
    active: () => inner.active(),
    sample: (spec, t) => inner.sample(spec, t),
    check: (spec) => inner.check(spec),
  };
  const overridden = (): boolean => given !== null && inner.active() && !samePose(given, camera.pose());
  return {
    driver, overridden,
    frame(dt, flyUpdate) {
      if (!inner.active()) { flyUpdate(); return; }
      if (!canDrive()) { driver.stop('mode'); flyUpdate(); return; }
      if (overridden()) { driver.stop('manual'); flyUpdate(); return; }
      if (given === null) { driver.frame(dt); return; }
      const before = camera.pose();
      flyUpdate();
      if (!samePose(before, camera.pose())) { driver.stop('manual'); return; }
      driver.frame(dt);
    },
  };
}
