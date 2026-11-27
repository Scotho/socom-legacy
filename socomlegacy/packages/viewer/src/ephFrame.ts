import type { MoverAction, Stance } from './mover';

/**
 * The emulator parity harness's per-frame read of the page (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md,
 * "Per-frame records"). A browser adaptation, product track (OT.R53): a dev-mode-only instrument that reads the walk and
 * changes nothing -- no new state, no game rule. Null unless the page was opened with the bare `?devmode`
 * (`./source` `devMode`), so a player's page answers nothing.
 */
export interface EphFrame {
  /**
   * The walk's fixed-step tick count (`WalkMode.ticks()`: `ticks_`, counted once per `WalkMode.tap`, one per mover step
   * of `TICK` = 1/60 s; never restarted). The harness schedules the page side of a script on it.
   */
  tick: number;
  /** The walk's stance (`WalkMode.stance()`, what the hook's `stance()` reads). */
  stance: Stance;
  /** The body in use (`WalkMode.posture()`, `Walker.posture`). */
  posture: Stance;
  /** Whether the walk is on (false in the fly camera: no snapshot, no action). */
  walking: boolean;
  /** The action holding the mover (`PlaySnapshot.action`): its name, seconds since it started, played backwards; or null. */
  action: { name: string; t: number; reversed: boolean } | null;
  /**
   * The feet as the walker's last completed tick left them (`Walker.state.x/y/z`: the tick `tick` stamps; the disc's world
   * units, the coordinates PCSX2's actor position is read in), each null when the walk is off. The parity matrix
   * (tools/eph/analyze.ts) compares the two sides' speeds, stops and climbs on these. LATER 1165 (c): before it they
   * were `PlaySnapshot.feet` = `Walker.tickFeet()`, the feet blended between the last two ticks at the read's moment
   * (now `drawnX/Y/Z`), which read an accelerating body part of a tick short; a build whose walker gives no state still
   * gives those, said by `feetFrom`.
   */
  x: number | null;
  y: number | null;
  z: number | null;
  /** LATER 1165 (c): what x/y/z are -- 'tick' (the walker's own state), 'blended' (no state to read), null (walk off). */
  feetFrom: 'tick' | 'blended' | null;
  /** LATER 1165 (c): the state the tick before `tick` left (`Walker.prev`), for a tick a frame skipped; null if none. */
  prevX: number | null;
  prevY: number | null;
  prevZ: number | null;
  /** LATER 1165 (c): the feet blended between the last two ticks at the read's moment (`Walker.tickFeet()`): what was drawn. */
  drawnX: number | null;
  drawnY: number | null;
  drawnZ: number | null;
  /** The mover's yaw (`PlaySnapshot.yaw`, degrees in `Pose.yaw`'s sense: facing (-sin yaw, -cos yaw)), or null. */
  yaw: number | null;
  /**
   * EPH-TILT: PRONE-TILT's root tilt (research 217 s7, on agent/prone-tilt) as the walker's last tick left it, for the
   * harness to set against the PS2's root quaternion (tools/eph/sampler.ts TILT_ADDRESSES). `Walker.rootTilt.q` (x, y,
   * z, w; null when the rule wrote none) and `.up` (the root's up, the body's frame: x right, y up, z behind);
   * `Walker.tiltNormal`, the floor normal it last read (world axes); the walker's `tiltTop()` clip and phase. Every one
   * null on a build without them (a tree without PRONE-TILT): feature-detected, read only.
   */
  rootQx: number | null;
  rootQy: number | null;
  rootQz: number | null;
  rootQw: number | null;
  rootUpX: number | null;
  rootUpY: number | null;
  rootUpZ: number | null;
  tiltNx: number | null;
  tiltNy: number | null;
  tiltNz: number | null;
  topClip: string | null;
  topPhase: number | null;
  /**
   * The move axes the walker ran its last tick on (`Walker.cutStick`, the original's actor+0x240 forward and +0x244
   * lateral as `FUN_00586570` reads them): forward, and right as lateral. Null when the walker gives none.
   */
  stickForward: number | null;
  stickLateral: number | null;
  /**
   * The animator's play as the body is drawn (`Play.animStats`, the hook's `stats().anim`): its key (`loco:stand`,
   * `idle:crouch`, `jump`...), its dominant node's clip (the locomotion ladder's walk, jog or run among them) and that
   * clip's phase (key over key count, 0 to 1); and the posed skeleton root's height over the feet (`Play.rootY`), as
   * PCSX2's side logs its action ids and root y. Null with no body or clips, or before the first play. Added after the
   * movement hunt (agent-mail/evidence/eph-hunt-2026-11-01, fix 3): `topClip` holds the stance clips only.
   */
  animPlay: string | null;
  animClip: string | null;
  animPhase: number | null;
  rootHeight: number | null;
  /**
   * R4P-208 fold 3, a test-harness adaptation (product track): the walker's turn, rad/s, left positive (`Walker.turn`;
   * over `turn_maxrate` the turn word `actor+0x23c` the band squares), and its turn memory (`Walker.turnMemory`,
   * `actor+0x105e` 0x10 / 0x08: 'none', 'turning' or 'walked'), as its last tick left them. Read only, feature-detected;
   * null with no walker or a value not of its shape.
   */
  turn: number | null;
  turnMemory: string | null;
}

/** What the anim read takes (`./play` `Play`: `animStats()` and `rootY()`), both read only. */
export interface EphAnimSource {
  animStats(): { readonly clip: string; readonly frame: number; readonly frames: number; readonly play: string } | null;
  rootY(): number | null;
}

type AnimFields = Pick<EphFrame, 'animPlay' | 'animClip' | 'animPhase' | 'rootHeight'>;

/** The anim fields off the play (null for each absent, empty or not finite). */
export function animOf(anim: EphAnimSource | null | undefined): AnimFields {
  const st = anim?.animStats() ?? null;
  const clip = st && typeof st.clip === 'string' && st.clip !== '' ? st.clip : null;
  return {
    animPlay: st && typeof st.play === 'string' && st.play !== '' ? st.play : null,
    animClip: clip,
    animPhase: clip && st && st.frames > 0 ? finite(st.frame / st.frames) : null,
    rootHeight: finite(anim?.rootY() ?? null),
  };
}

type TiltFields = Pick<EphFrame, 'rootQx' | 'rootQy' | 'rootQz' | 'rootQw' | 'rootUpX' | 'rootUpY' | 'rootUpZ' | 'tiltNx' | 'tiltNy' | 'tiltNz' | 'topClip' | 'topPhase' | 'stickForward' | 'stickLateral'>;

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** `n` finite numbers off an array, or null. */
function vec(v: unknown, n: number): number[] | null {
  if (!Array.isArray(v) || v.length < n) return null;
  const out = v.slice(0, n).map(finite);
  return out.every((x) => x !== null) ? (out as number[]) : null;
}

/**
 * EPH-TILT: what the read takes from PRONE-TILT's `Walker` (agent/prone-tilt, not in this base), every member optional
 * so a build without it reads null: `rootTilt` and `tiltNormal` (public getters that copy) and `tiltTop()` (the top play
 * as the rule reads it; a private method on that branch, called here only when present -- making it public is
 * PRONE-TILT's to do). The values are `unknown` and shape-checked, since nothing in this base types them.
 */
export interface EphTiltWalker {
  readonly rootTilt?: { readonly q?: unknown; readonly up?: unknown } | null;
  readonly tiltNormal?: unknown;
  readonly tiltTop?: () => { readonly clip?: unknown; readonly phase?: unknown } | null;
  /** `Walker.cutStick` (in this base): the tick's move axes, forward and right. */
  readonly cutStick?: { readonly forward?: unknown; readonly right?: unknown } | null;
}

/**
 * EPH-TILT: the tilt fields off the walker, by feature: `rootTilt` and `tiltNormal` are getters that copy, `tiltTop()`
 * reads the top play; none of them changes the walker. Anything absent or not of its shape gives null.
 */
export function tiltOf(walker: object | null): TiltFields {
  const w: EphTiltWalker | null = walker;
  const rt = w?.rootTilt ?? null;
  const q = rt ? vec(rt.q, 4) : null;
  const up = rt ? vec(rt.up, 3) : null;
  const n = w ? vec(w.tiltNormal, 3) : null;
  const top = w && typeof w.tiltTop === 'function' ? w.tiltTop() : null;
  return {
    rootQx: q?.[0] ?? null, rootQy: q?.[1] ?? null, rootQz: q?.[2] ?? null, rootQw: q?.[3] ?? null,
    rootUpX: up?.[0] ?? null, rootUpY: up?.[1] ?? null, rootUpZ: up?.[2] ?? null,
    tiltNx: n?.[0] ?? null, tiltNy: n?.[1] ?? null, tiltNz: n?.[2] ?? null,
    topClip: top && typeof top.clip === 'string' ? top.clip : null, topPhase: top ? finite(top.phase) : null,
    stickForward: finite(w?.cutStick?.forward), stickLateral: finite(w?.cutStick?.right),
  };
}

/** R4P-208 fold 3: the walker's turn and turn memory, feature-detected and read only (`EphFrame.turn` / `turnMemory`). */
function turnOf(walker: object | null): Pick<EphFrame, 'turn' | 'turnMemory'> {
  const w = walker as { turn?: unknown; turnMemory?: unknown } | null;
  return { turn: finite(w?.turn), turnMemory: typeof w?.turnMemory === 'string' ? w.turnMemory : null };
}

/** What the read takes from the walk (`WalkMode`). */
export interface EphFrameSource {
  ticks(): number;
  stance(): Stance;
  posture(): Stance;
  snapshot(): { action: MoverAction | null; feet: readonly [number, number, number]; yaw: number } | null;
  /** EPH-TILT: the walker, for `tiltOf` (`WalkMode.ephWalker`); absent or null: the tilt fields null. */
  ephWalker?(): object | null;
}

/** A `{ x, y, z }` of finite numbers off `v`, or null (the walker's `state` / `prev`, read only). */
function xyzOf(v: unknown): [number, number, number] | null {
  if (v === null || typeof v !== 'object') return null;
  const o = v as { x?: unknown; y?: unknown; z?: unknown };
  const x = finite(o.x), y = finite(o.y), z = finite(o.z);
  return x !== null && y !== null && z !== null ? [x, y, z] : null;
}

export function ephFrameOf(on: boolean, walk: EphFrameSource, anim?: EphAnimSource | null): EphFrame | null {
  if (!on) return null;
  const snap = walk.snapshot();
  const a = snap?.action ?? null;
  // LATER 1165 (c): the walker's own tick state (`state`, and `prev` the tick before), feature-detected and read only.
  const walker = walk.ephWalker?.() ?? null;
  const own = snap ? xyzOf((walker as { state?: unknown } | null)?.state) : null;
  const prev = own ? xyzOf((walker as { prev?: unknown } | null)?.prev) : null;
  const feet = own ?? (snap ? [snap.feet[0], snap.feet[1], snap.feet[2]] : null);
  return {
    tick: walk.ticks(),
    stance: walk.stance(),
    posture: walk.posture(),
    walking: snap !== null,
    action: a && { name: a.name, t: a.t, reversed: a.reversed },
    x: feet ? feet[0] : null,
    y: feet ? feet[1] : null,
    z: feet ? feet[2] : null,
    yaw: snap ? snap.yaw : null,
    ...tiltOf(walker),
    ...animOf(anim),
    ...turnOf(walker),
    feetFrom: !snap ? null : own ? 'tick' : 'blended',
    prevX: prev ? prev[0] : null, prevY: prev ? prev[1] : null, prevZ: prev ? prev[2] : null,
    drawnX: snap ? snap.feet[0] : null, drawnY: snap ? snap.feet[1] : null, drawnZ: snap ? snap.feet[2] : null,
  };
}
