import type { Grid } from '@s2u/scene';
import { scopeViewOffset } from './accuracy';
import { headEye, proneEyeTerms, scopeEye, toWorld, type Vec3 } from './cameraRig';
import { TICK, type Stance } from './mover';
import { viewState } from './net/codec';
import { headViewNear, PlayerCamera } from './playerCamera';
import { easePeek } from './traversal';
import { lensOf } from './zoom';

/**
 * PV-5 (the player's-view lane; product track): **a browser adaptation** -- the original has no player's view
 * (research 402 s1: research 248 s1-2, research 314 s5.7). The rig that draws the watched player's own picture on a
 * watcher's page: the subject's own `PlayerCamera`, ticked on the subject's COMMAND clock (research 402 s4), composed
 * as the owner's page composes it (`walk.ts` `cameraTick` :2864-2874, `follow` :2904-2946). It changes nothing the game
 * does: no scene, no DOM, no network, no room; a page that never shows the view never builds one. Nothing about the
 * original is claimed here; the constants below are `*_ADAPTATION`.
 *
 * **The time base.** A frame at command time `cmd = n + a` (fractional, unwrapped) is the owner's page after command
 * n's tick with `a` of a tick in its accumulator (`walk.ts` `frame` :2525-2585: one `cameraTick` after each command,
 * then `follow` draws `PlayerCamera.view(w.alpha())`). So each whole command crossed since the last frame ticks the
 * camera once, at the mover's `TICK` (walk.ts passes none: `PlayerCamera.tick`'s default, the same 1/60), with
 * `source.at(k)`'s body -- the body AFTER command k, its look that command's -- and the pose is `view(a)`, between the
 * ticks of n-1 and n. The pose depends on `cmd` alone, never on how many page frames fell between, nor on wall time.
 *
 * **Which sample feeds which term** (n = floor(cmd), a = cmd - n):
 * - the third-person eye and target: `view(a)`, the camera ticks of n-1 and n (each tick's feet, yaw, pitch, root,
 *   posed flag and eased peek its own command's); the window's aspect the WATCHER's (research 402 s2);
 * - the jump's drawn height (MISSION R8; LATER 96's drawn-only offset): `drawn` of n-1 and n at `a` (walk.ts
 *   :2908-2909, `Walker.drawnFeet` minus `tickFeet`, both linear in the part-tick between the two ticks' values);
 * - the head view's feet: `feet` of n-1 and n at `a` (`Walker.tickFeet`, `mover.ts:4038-4041`), plus the drawn height;
 * - the head view's LOOK (yaw and pitch, the eye's turn and the direction): command n's -- one command later than the
 *   feet's base n-1, held for the whole fraction. Why, and its cost: the owner's page draws the fly camera's pose at the
 *   frame (`walk.ts:2904`). On a frame that ran a tick that pose is command n's look (the spread's f = 1, `walk.ts`
 *   :2548-2562, its `f` :2560) -- a 60 Hz owner's every frame. On a frame that ran none (an owner's screen above 60 Hz) it is
 *   newer than any command and reaches the wire only as command n+1's. So against a high-refresh owner the watcher's
 *   look trails by up to one command's turn (the turn rate x 16.7 ms): a timing shift of at most one tick during a
 *   turn, zero while the aim is still. The wire does not carry the owner's frame phase, so interpolating toward n+1
 *   would instead LEAD a 60 Hz owner by the same bound. PV-9's instrument measures it;
 * - the head view's root, stance, peek and floor normal: command n's (the walk's `posedRoot`, `w.posture`,
 *   `moves.peek()` and `w.floorNormal` as they stand after the frame's last tick, :2930-2932) -- the raw root, not
 *   the camera's eased one;
 * - the head view's near plane: `headViewNear` on the drawn eye, the newest look, the watcher's aspect (:2945);
 * - whether the view is from the head, and the sway's screen offset: command n's view state and sway.
 */

/** PV-5: the rig's tick, the mover's (`mover.ts` `TICK`; `walk.ts` ticks `PlayerCamera` at its default, the same). */
export const POV_TICK = TICK;

/**
 * PV-5 (an adaptation; no original): how many commands of the source's history a rebuild ticks through, silently, before
 * it draws -- 90, 1.5 s of 60 Hz commands: the wall pass's hold after a hit is 1.5 s (`cameraRig.ts` `CAM_HOLD`, set
 * by `cameraPass` :242-292, at :271 and :288), and the peek's ease (`traversal.ts` `easePeek` :330-333, exp(-6 t)) has closed all but e^-9 of a gap
 * by then. So a replay's seek, or a watcher's hitch past the window (one under it is ticked through, PV-10a), redraws the
 * camera the owner had, where the source holds those commands. Not an exact convergence: a pass distance still letting
 * out (0.97 a game frame, x 0.25 over 1.5 s) or a peek gap begun just over 90 commands back (at most 2e^-9, 2.5e-4, under
 * the 1e-4 snap only past 92) can differ from an uninterrupted run; with no history (at(n - 1) unknown) it is the settled
 * pose.
 */
export const POV_WARM_TICKS_ADAPTATION = 90;

/**
 * PV-5 (an adaptation; no original): more whole commands than this crossed in one page frame is a burst -- a seek, a
 * stall past the warm window -- and the rig is rebuilt at the frame's command rather than ticked through it (PV.R6).
 * PV-10a: `POV_WARM_TICKS_ADAPTATION` (was 8), chosen from the rebuild's own cost, not from a measured figure: a rebuild
 * ticks up to 91 commands of the source's history from a settled start, so ticking a burst of known commands through
 * costs no more up to this bound, and is the uninterrupted run's state given the same samples and the frame's one root
 * (the last sentence below), where a rebuild loses what happened more than 90 commands back (a wall pull still letting out). PV-9's first run: 23 of its 24 rebuilds were bursts of 8.1 to
 * 35.3 commands in one page frame (hitches of 130-500 ms, the clock's catch-up after a hold), 8 of them with the view
 * drawn; under this bound each is caught up. The root handed once a frame (`./matchNet` `povFrame`) is the frame's for
 * every command it ticks, in a catch-up as in a rebuild.
 */
export const POV_MAX_TICKS_ADAPTATION = POV_WARM_TICKS_ADAPTATION;

/** The pov subject after one command: what the wire and the remote animator give a watcher. */
export interface PovBody {
  /** The feet after the command (the simulated height). */
  feet: readonly [number, number, number];
  /** Degrees, as `BodyState`: the command's look. */
  yaw: number;
  pitch: number;
  /** The held side, -1 left, 0, 1 right; the rig eases it (`./traversal` `easePeek`). */
  peek: -1 | 0 | 1;
  /** The camera root's height over the feet, and whether it is the posed skeleton's (as `spectateFollow` passes it). */
  root: number;
  posed: boolean;
  /** `zoom.ts` view state 0-12 (research 402 s3). */
  view: number;
  /** The scope's sway, `accuracy.ts` units (PS2 pixels). */
  sway: readonly [number, number];
  /** The saved floor normal's y, for the prone eye's tilt (`cameraRig.ts` `proneEyeTerms`); 1 on flat ground. */
  floorNormalY: number;
  /** The posture the head's eye is placed for (`scopeEye`'s stance). */
  stance: Stance;
  /** The drawn-only offset of the feet (a jump's drawn height, MISSION R8; LATER 96), drawn minus simulated; absent 0. */
  drawn?: readonly [number, number, number];
  /**
   * PV-15: the seat's spawn count at the command (`NetClient.lifeAtCommand`); absent where the source has none (one
   * life). The rig's history never crosses a change of it: at a spawn the owner's page makes a new camera (`walk.ts`
   * `respawn` -> `restart`; NU-12 B1, the original's `FUN_00299150`), so a camera ticked through the last life's
   * commands -- the corpse's place, a wall behind it, the pass's hold running -- is not the owner's at the spawn.
   */
  life?: number;
}

/**
 * The subject at a whole command number (the rig asks whole numbers only, never a negative one); null = unknown.
 * The contract: at(k) is known for every whole k from the oldest buffered command up to the clock's command; a k ahead
 * of the newest snapshot returns null, and the rig holds on the newest known pose (`PovCamera.frame`).
 */
export interface PovSource { at(cmd: number): PovBody | null }

/** The rig's pose at a command time. */
export interface PovPose {
  /** The drawn eye, and a point on the drawn look (`FlyCamera.placeView`'s pair; `fly.setPose` takes eye, yaw, pitch). */
  eye: Vec3;
  target: Vec3;
  /** Degrees, the look: the newest command's in a head view, the eye-to-target line's in third person. */
  yaw: number;
  pitch: number;
  /** The head view's near plane (`headViewNear`, `HEAD_VIEW_NEAR_ADAPTATION`), null for the map's (third person). */
  near: number | null;
  /** The view is from the head: the page hides the subject's body. */
  head: boolean;
  /** `accuracy.ts` `scopeViewOffset(view, sway)`: returned, not applied (applying it is another task's seam). */
  offset: [number, number];
}

type Sample = { body: PovBody; peek: number };
const ZERO: readonly [number, number, number] = [0, 0, 0];

/**
 * The player's-view rig (PV-5): one per watched subject. `frame` may run every page frame while the follow still shows
 * (the caller discards the pose): nothing in it depends on whether a pose was used, so the wall pass's history
 * (`cameraRig.ts` `cameraPass`) is the owner's by the time the view is shown. Rigid, as the owner's own camera is:
 * `PlayerCamera.ease` (the dead player's watched ease) stays off, and no death camera is set.
 */
export class PovCamera {
  private readonly camera: PlayerCamera;
  private readonly grid: Grid | null;
  private prev: Sample | null = null;
  private cur: Sample | null = null;
  private lastN = 0;
  private peekValue = 0;

  constructor(deps: { grid: Grid | null }) {
    this.grid = deps.grid;
    this.camera = new PlayerCamera(deps.grid);
  }

  /** A bind, a seek, a reconnect, a map or grid change: the next frame is rebuilt settled at its command. */
  reset(): void {
    this.camera.reset();
    this.prev = this.cur = null;
    this.peekValue = 0;
  }

  /** The eased peek value the last tick read. */
  peek(): number {
    return this.peekValue;
  }

  /** Whether the camera's watched ease is on (never: the player's view is rigid). */
  eased(): boolean {
    return this.camera.ease;
  }

  /**
   * Advance to command time `cmd` (fractional, unwrapped): one tick per whole command crossed, then the pose at the
   * fraction. The rig's state depends on the whole command only, so a step back inside the same command (float noise,
   * a clock's nudge) is a redraw at the new fraction. A step back to an earlier whole command rebuilds (`rebuild`).
   *
   * **The edge of the source** (N1). A sample not there YET -- at(k) unknown for a k past the state with at(n) unknown
   * too: the clock a hair past the newest snapshot, as at each snapshot's arrival -- is a hold, not a reset: the rig
   * ticks the known commands up to m, keeps every state, and draws m's settled end (`view(1)` of the ticks m-1 and m,
   * the feet, drawn height and look m's) -- the uninterrupted run's pose as cmd reaches m + 1 from below; the next frame
   * resumes from m. The burst rule counts the commands known to tick: up to `POV_MAX_TICKS_ADAPTATION` (the warm window,
   * PV-10a) they are ticked through in this frame, one ask each; more rebuilds. A hole with the sample at cmd known (a gap,
   * not the edge) rebuilds there.
   *
   * **A spawn on the way** (PV-15): a command of another life than the rig's newest tick (`PovBody.life`) rebuilds --
   * and the rebuild's history stops at the spawn -- so the camera at a spawn is a new one, as the owner's is.
   */
  frame(source: PovSource, cmd: number, nearAspect: number): PovPose | null {
    if (!Number.isFinite(cmd)) return null;
    const n = Math.floor(cmd);
    if (!this.cur || n < this.lastN) return this.rebuild(source, cmd, nearAspect);
    const known: PovBody[] = [];
    let gap = false;
    const life = this.cur.body.life;
    for (let k = this.lastN + 1; k <= n && known.length <= POV_MAX_TICKS_ADAPTATION; k++) {
      const body = source.at(k);
      if (!body) { gap = k < n && source.at(n) !== null; break; }
      if (body.life !== life) return this.rebuild(source, cmd, nearAspect);   // PV-15: a spawn on the way
      known.push(body);
    }
    if (known.length > POV_MAX_TICKS_ADAPTATION || gap) return this.rebuild(source, cmd, nearAspect);
    for (const body of known) { this.step(body, nearAspect); this.lastN++; }
    return this.lastN === n ? this.pose(cmd - n, nearAspect) : this.pose(1, nearAspect);
  }

  /**
   * The rig rebuilt at n = floor(cmd) from the source's history (`POV_WARM_TICKS_ADAPTATION`). Its top is the newest
   * known command m in [max(n - 90, 0), n] -- n itself when known; below it a fresh bind one command ahead of the
   * buffer shows m's settled end (as `frame`'s hold) rather than nothing; null when none is known. Then the oldest k in
   * [max(m - 90, 0), m] with at(k)..at(m) all known, walking back from m (at most 91 samples asked once the top is
   * found, none negative); the settled state at k (a fresh camera's tick drawn as both ends, the peek at its held side),
   * one tick a command up to m, then the pose. With no history (at(m - 1) unknown) that is the settled pose at m.
   * PV-15: the walk back also stops at a command of another life than m's (`PovBody.life`): the history is the new
   * life's alone, and at the spawn's own command the settled pose there -- a new camera's first tick.
   */
  private rebuild(source: PovSource, cmd: number, nearAspect: number): PovPose | null {
    this.reset();
    const n = Math.floor(cmd);
    let m = n, newest: PovBody | null = null;
    for (; m >= Math.max(n - POV_WARM_TICKS_ADAPTATION, 0); m--) if ((newest = source.at(m))) break;
    if (!newest) return null;
    const run: PovBody[] = [newest];                             // newest first
    for (let k = m - 1; k >= Math.max(m - POV_WARM_TICKS_ADAPTATION, 0); k--) {
      const body = source.at(k);
      if (!body || body.life !== newest.life) break;             // PV-15: never across a spawn
      run.push(body);
    }
    run.reverse();
    const first = run[0]!;
    this.peekValue = first.peek;                                 // settled: the held side reached
    this.step(first, nearAspect);
    this.camera.settle();
    this.prev = this.cur;
    for (let i = 1; i < run.length; i++) this.step(run[i]!, nearAspect);
    this.lastN = m;
    return m === n ? this.pose(cmd - n, nearAspect) : this.pose(1, nearAspect);
  }

  /** One command's tick, as `walk.ts` `cameraTick`: the peek eased after the actor's tick (`traversal.ts:1289`), then the camera. */
  private step(body: PovBody, nearAspect: number): void {
    this.peekValue = easePeek(this.peekValue, body.peek, POV_TICK);   // the owner's own ease (`./traversal`)
    this.camera.peek = this.peekValue;
    this.camera.nearAspect = nearAspect;
    // JUMP_OVERHEAD_CAMERA_ADAPTATION is the player's OWN camera's (research 90 s10.1): a watched camera keeps the
    // original's frame, so its gate stays shut (LATER 1401; a drawn offset alone never opened it on the walk either).
    this.camera.jumping = false;
    this.camera.tick(body.feet, body.yaw, body.pitch, body.root, POV_TICK, body.posed);
    const next = { body, peek: this.peekValue };
    this.prev = this.cur ?? next;
    this.cur = next;
  }

  /** `walk.ts` `follow`, at the part-tick `a`. */
  private pose(a: number, nearAspect: number): PovPose {
    const prev = this.prev!, cur = this.cur!;
    const lerp = (p: readonly number[], q: readonly number[]): Vec3 =>
      [p[0]! + (q[0]! - p[0]!) * a, p[1]! + (q[1]! - p[1]!) * a, p[2]! + (q[2]! - p[2]!) * a];
    this.camera.nearAspect = nearAspect;
    const d = lerp(prev.body.drawn ?? ZERO, cur.body.drawn ?? ZERO);
    const moved = d[0] !== 0 || d[1] !== 0 || d[2] !== 0;
    const offset = scopeViewOffset(cur.body.view, cur.body.sway);
    // A view from the head: `./zoom` `lensOf` (`Zoom.lens()`, which `matchFirearm.ts` hands `WalkMode.setScoped`: the walk's
    // view is then 'scope'; the dead fall back, PV.R6, the caller's), the state past 12 read as 0 (`./net/codec`
    // `viewState`, research 402 s3).
    if (!lensOf(viewState(cur.body.view))) {
      const third = this.camera.view(a, d);                     // lifted by `d` and rechecked there (`PlayerCamera.view`'s `lift`)
      const eye: Vec3 = [third.eye[0], third.eye[1], third.eye[2]];
      const target: Vec3 = [third.target[0], third.target[1], third.target[2]];
      const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
      return {
        eye, target, yaw: (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
        near: null, head: false, offset,
      };
    }
    // The newest command's look, held for the whole fraction (walk.ts:2904): a 60 Hz owner's exactly; a high-refresh
    // owner's trails by up to one command's turn, and no lerp toward n+1 fixes that without leading a 60 Hz owner (header).
    const look = cur.body;
    const yaw = (look.yaw * Math.PI) / 180, pitch = (look.pitch * Math.PI) / 180;
    const local = scopeEye(cur.body.stance, cur.body.root, cur.peek, proneEyeTerms(cur.body.floorNormalY, look.pitch));   // PRONE_EYE_LOOK
    const headAt = (feet: Vec3): Vec3 => headEye(this.grid, feet, toWorld(feet, look.yaw, local));
    const ahead: Vec3 = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const simFeet = lerp(prev.body.feet, cur.body.feet);         // the feet a tick behind (mover.ts:4038-4041)
    const seen = headAt(moved ? [simFeet[0] + d[0], simFeet[1] + d[1], simFeet[2] + d[2]] : simFeet);
    return {
      eye: seen, target: [seen[0] + ahead[0], seen[1] + ahead[1], seen[2] + ahead[2]], yaw: look.yaw, pitch: look.pitch,
      near: headViewNear(this.grid, seen, ahead, nearAspect), head: true, offset,
    };
  }
}
