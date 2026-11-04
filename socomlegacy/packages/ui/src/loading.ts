import type { RdrNode } from '@s2u/archive';
import { assetLibStem, findKey, missionUiVars, type UiProgram, type Vec3 } from '@s2u/scene';
import { drawnAlpha, OPACITY_STACK_BASE_READING, pushOpacity } from './compositor/frame';
import { FADER_NAME } from './compositor/scene';

/**
 * The loading screen's readers (INT-LOADING, an interim ahead of ONL-18; socomlegacy/docs/research/125): what the
 * original's loading screen `dlgLoad.rdr` shows for a map, and how its disc spins -- read off the disc, never typed.
 * Pure: records in, values out (the bitmaps are decoded by the viewer's `loadingAssets`). In `@s2u/ui`, as a new
 * front-end task's code is (the package-boundaries spec §3); the scene readers it needs it imports.
 *
 * - **The screen** is `RUN/UI/READERC.ZAR/dlgLoad.rdr`, built by the loading state's Init `FUN_001f6660`
 *   (D:L55787-55877, research 115) with the scripts of `run/ldzanim.zar` (the string at 0x3e2f94).
 * - **The map's picture, title and description** are the layout's `UIVAR`s (`load_picture`, `mission_title`,
 *   `mission_description`), registered from the map's `READERM.ZAR/mission.rdr` `UiVars` at the level load
 *   (`FUN_002af410` D:L153684, called from `FUN_002acc10`).
 * - **The picture's library** is not in the layout (its one `LIBRARY` is `common/assetlib/loading`, `LOAD_TXR`): the
 *   level load `FUN_002acc10` looks `LoadingScreenAssets` (0x3f19e0) up in `mission.rdr` (0x3f19d0) by a depth-first
 *   search (`FUN_0032ee10` D:L230104 -> `FUN_0032f0e0`) and keeps it at 0x437d1c (D:L152347-152354); the loading
 *   state opens that library (`FUN_001f6660` D:L55800-55814, `FUN_00320d70`). Its file is the path's stem
 *   (`assetLibStem`, `FUN_003199c0`): `ui/assetlib/ld/om02` -> `OM02_TXR.ZED`. **OMnn on MP1-MP12, LPnn on 51-83**
 *   (research 125 §2; research 91's "LPnn per ZDB" was wrong for the first twelve).
 * - **The disc's spin** is the animation `SpinLoadingCD` (the screen's `ONSTART` binding) of the set `dlgLoad.rdr` in
 *   **each map's own `LDZANIM.ZAR`** -- not `UIZANIM`, `EXTZANIM` or `MPZANIM` (research 125 §3): two
 *   `OBJECT_MOTION_FROM_TO` scale motions on `load_CD_Parent` and a `LOOP`.
 */

/** The screen's layout (research 96 §7). */
export const LOADING_DIALOG = { archive: 'RUN/UI/READERC.ZAR', member: 'dlgLoad.rdr' } as const;
/**
 * Its scripts: a member of every map archive, the set named as the dialog, the disc's animation and the one that fades
 * the screen in (research 125 §3).
 */
export const LOADING_SCRIPTS = { member: 'LDZANIM.ZAR', set: 'dlgLoad.rdr', spin: 'SpinLoadingCD', fade: 'OnMenuStart' } as const;
/** The `mission.rdr` key naming the picture's library (0x3f19e0, `FUN_002acc10` D:L152348). */
export const LOADING_ASSETS_KEY = 'LoadingScreenAssets';
/** The layout's `UIVAR` names the map's script fills (`dlgLoad.rdr`'s `LoadingPicture`, `title`, `description`). */
export const LOADING_UIVARS = { picture: 'load_picture', title: 'mission_title', description: 'mission_description' } as const;

export interface LoadingBinding {
  /** `mission_title` (the map's name), or null. */
  title: string | null;
  /** `mission_description`, or null (a blank `" "` on 21 MP maps, empty on MP64: research 125 R125.6). */
  description: string | null;
  /** `load_picture`: the picture's texture name (`ld_mp2_prog.tif`), or null. */
  picture: string | null;
  /** `LoadingScreenAssets` (`ui/assetlib/ld/om02`), or null. */
  library: string | null;
  /** Its file stem (`OM02`): the `_TXR`/`_PAL` pair the picture is in. */
  stem: string | null;
  /** Every `UiVars` entry, for the layout's other `UIVAR`s. */
  vars: ReadonlyMap<string, string>;
}

/** A map's `mission.rdr` (parsed) -> what its loading screen shows. */
export function loadingBinding(mission: RdrNode): LoadingBinding {
  const vars = missionUiVars(mission);
  const found = findKey(mission, LOADING_ASSETS_KEY);
  const library = typeof found === 'string' && found.trim() !== '' ? found : null;
  return {
    title: vars.get(LOADING_UIVARS.title) ?? null,
    description: vars.get(LOADING_UIVARS.description) ?? null,
    picture: vars.get(LOADING_UIVARS.picture) ?? null,
    library, stem: library === null ? null : assetLibStem(library), vars,
  };
}

/** One scale motion: from `from` (null: the node's current scale) towards `to` at `rate` per second, for `seconds`. */
export interface SpinSegment { from: Vec3 | null; to: Vec3; rate: Vec3; seconds: number }

/** The disc's spin: the node its motions scale, the motions in order, and whether the sequence loops. */
export interface LoadingSpin { node: string; segments: SpinSegment[]; loops: boolean; period: number }

/**
 * `SpinLoadingCD` decoded (`decodeUiProgram`) -> its spin: the first sequence's scale motions on one node, and whether
 * a `LOOP` follows them. Null when the program has no scale motion.
 */
export function loadingSpin(program: UiProgram): LoadingSpin | null {
  for (const seq of program.sequences) {
    const segments: SpinSegment[] = [];
    let node: string | null = null, loops = false;
    for (const op of seq.ops) {
      if (op.op === 'move' && op.scale && (node === null || op.node === node)) {
        node = op.node;
        segments.push({ from: op.scale.from, to: op.scale.to, rate: op.scale.rate, seconds: op.seconds });
      } else if (op.op === 'loop' && segments.length) loops = true;
    }
    if (node !== null && segments.length) return { node, segments, loops, period: segments.reduce((t, s) => t + s.seconds, 0) };
  }
  return null;
}

/**
 * The node's scale `t` seconds after the animation starts, as the motion's tick `FUN_0025f9b0` (D:L108850-109034)
 * plays it: each tick adds `rate x dt` to the current scale (`FUN_003156e0` read, `FUN_00309180` x dt, `FUN_00309240`
 * add, `FUN_00315710` write: D:L109021-109027) and, once the elapsed time passes the motion's time, writes `to`
 * (D:L108922-108938) and hands the overrun to the next command -- so the scale is linear in t, from `from` (flag
 * 0x100; else the previous segment's end, the scale at 1 before the first) and exactly `to` at each segment's end. A
 * `LOOP` starts the sequence over; without one the last `to` holds.
 */
export function spinScale(spin: LoadingSpin, t: number): Vec3 {
  const period = spin.period;
  let local = Math.max(0, t);
  if (spin.loops && period > 0) local %= period;
  let current: Vec3 = [1, 1, 1];
  for (const s of spin.segments) {
    const start: Vec3 = s.from ? [...s.from] as Vec3 : current;
    if (local < s.seconds) return [start[0] + s.rate[0] * local, start[1] + s.rate[1] * local, start[2] + s.rate[2] * local];
    local -= s.seconds;
    current = [...s.to] as Vec3;
  }
  return current;
}

/** `OnMenuStart`'s fade: one `OBJECT_OPACITY_FROM_TO` on the fader node (research 125 §3). */
export interface LoadingFade { node: string; from: number; to: number; rate: number; seconds: number }

/**
 * `OnMenuStart` decoded (`decodeUiProgram`) -> its first opacity motion on `MENUFADER` (`FADER_NAME`), the screen's
 * fade from black. Null when the program has none.
 */
export function loadingFade(program: UiProgram): LoadingFade | null {
  for (const seq of program.sequences) {
    for (const op of seq.ops) {
      if (op.op === 'opacity' && op.node.toLowerCase() === FADER_NAME.toLowerCase()) {
        return { node: op.node, from: op.from, to: op.to, rate: op.rate, seconds: op.seconds };
      }
    }
  }
  return null;
}

/**
 * The load state's own ramps (research 115 R115.10, §8.2): its Tick `FUN_001f5e70` writes the fader quad's (G+0x170)
 * alpha directly, (1 - t/0.5) x 128 while it fades in (D:L55662-55675) and (t/0.5) x 128 once the map is loaded
 * (D:L55748-55762), switching to the core state at t > 0.5 s.
 */
export const LOAD_STATE_FADE_SECONDS = 0.5;

/** The alpha the load state writes into the fader quad `t` seconds into its fade in, clamped (`FUN_001f5e70`). */
export function loadStateFaderAlpha(t: number): number {
  return (1 - Math.min(1, Math.max(0, t / LOAD_STATE_FADE_SECONDS))) * 128;
}

/** The fader node's opacity `t` seconds after `OnMenuStart` starts: "from", linear at the rate, "to" from `seconds` on. */
export function faderOpacity(fade: LoadingFade, t: number): number {
  return t >= fade.seconds ? fade.to : fade.from + fade.rate * Math.max(0, t);
}

/**
 * LOADING_FADE_READING (research 125 §5, §7; review F1): what the fader over `dlgLoad` draws. Two writers set the same
 * quad's alpha each frame. The load state's Tick writes its 0.5 s ramp (`loadStateFaderAlpha`) first; then G's tick
 * plays `OnMenuStart` (an `ONSTART` binding, as `SpinLoadingCD` is), whose first command takes MENUFADER's opacity
 * 1 -> 0 in 1.5 s; then G's draw (`FUN_003691c0`) walks the tree, and the 2D adaptor (`FUN_0036d8b0`, R112.3) SETS
 * the quad's alpha to opacity x 128 whenever the stack's top is under 1 -- from the first frame MENUFADER's opacity is
 * under 127/128. So the drawn fade in is `OnMenuStart`'s 1.5 s, and the load state's fade out ((t/0.5) x 128 after the
 * load) is overwritten with 0 (the opacity held at "to"): no fade out is drawn, the screen cuts to the round. The
 * order of the writes is the Tick's (D:L55662-55675, then D:L55768-55769); the walk's push for MENUFADER under the
 * foreplane at the stack's base (`OPACITY_STACK_BASE_READING`) was read, not traced on a frame. A capture series of a
 * load from black (owed to ONL-18, `A_ready009..020`) would settle it.
 */
export const LOADING_FADE_READING = 'OnMenuStart over the load state\'s ramp' as const;

/** The fader's alpha (0..128, black) `t` seconds after the screen started, under `LOADING_FADE_READING`. */
export function loadingFaderAlpha(fade: LoadingFade | null, t: number): number {
  const held = { alpha: loadStateFaderAlpha(t) };
  if (!fade) return held.alpha;
  return drawnAlpha(pushOpacity(OPACITY_STACK_BASE_READING, faderOpacity(fade, t)), held);
}
