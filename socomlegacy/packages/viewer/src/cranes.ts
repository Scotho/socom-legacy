import { Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import {
  decodeEffectProgram, flattenScene, parseAnimSets,
  type CollisionOwner, type EffectProgram, type Footprint, type SceneNode, type ZAnimAnimation,
} from '@s2u/scene';
import { apply4 } from './doorMath';
import { readActionRecords, ACTION_TYPE_CODES } from './mapActions';
import { under } from './mapMeta';
import { groundPolygons, type GroundData } from './mover';
import type { CraneWire } from './net/protocol';

/**
 * Chain Reaction's three moving hooks (MAP-07; socomlegacy/docs/research/176-suppression-map-audit.md §9).
 *
 * The room and the page run this same code. Each hook's `translate_hook_N` is two relative translations
 * (`OBJECT_MOTION_FROM_TO`, flags `CRANE_TRANSLATE_FLAGS_READING`, `FUN_0025fe70` / `FUN_0025f9b0`; research 174 §5,
 * 176 §9.2): out along Z, then back, 15 seconds a leg, repeated by a WHILE that runs forever
 * (`CRANE_CYCLE_REPEAT_READING`). A SWITCH (`epan_N` / `crane_onoff_N`) pauses and resumes the translation and keeps
 * the phase (research 176 §9.1). `swingplate`, the hook's child, keeps turning about its local X. The control meshes
 * live under `hcont_N`, where `control_pause_N` is rooted, and that swap is the lever (`CRANE_SWITCH_MESH_READING`).
 * `epan_N` and `hcont_N` are not children of the hook, so they take the same translation themselves
 * (`CRANE_PANEL_WITH_HOOK_READING`). A pause holds that translation on the hook and on both panels.
 *
 * What the disc check left open is named below and listed in research 176 §11.
 */

/**
 * The published displacements are Z only (research 176 §9.2: "not a guessed vertical lift"). The disc check of
 * `8881c80d9` read X and Y as 0 on both commands of each `translate_hook_N`.
 */
export const CRANE_DELTA_XY_READING = 0;
/** Each authored leg's duration (research 176 §9.2, "Duration each way"; the same disc check). */
export const CRANE_LEG_SECONDS_READING = 15;
/**
 * The tick reaches the target when the command's seconds are up (`FUN_0025f9b0` resolves the endpoint). The disc
 * check read the rate floats as the displacement over 15 seconds.
 */
export const CRANE_RATE_FROM_DELTA_READING = 'delta / seconds' as const;
/**
 * The two legs play again from the rest pose. The disc check read a WHILE whose forever bit is set after the return
 * leg, not a `LOOP` command. The published Z pair sums to zero, so the repeat closes.
 */
export const CRANE_CYCLE_REPEAT_READING = 'while forever' as const;
/**
 * `translate_hook_N`'s flags word, read 0x9 on both commands. Bit 0x1 is the relative translation (`FUN_0025fe70`).
 */
export const CRANE_TRANSLATE_FLAGS_READING = 0x9;
/**
 * Bit 0x8 of `CRANE_TRANSLATE_FLAGS_READING`. It is set on the disc. What it changes is not read; the motion stays
 * the relative translation.
 */
export const CRANE_TRANSLATE_FLAG8_READING = 0x8;
/** The swingplate's initial speed, radians a second (research 176 §9.2; the disc check). The sign alternates each second. */
export const CRANE_SWING_SPEED_READING = 0.06981317;
/** The swingplate's acceleration magnitude, radians a second squared. The sign is opposite the speed. */
export const CRANE_SWING_ACCEL_READING = 0.13962634;
/** One angular motion, then the rotation is back (research 176 §9.2, "then restores rotation"; lifetime 1 on the disc). */
export const CRANE_SWING_SECONDS_READING = 1;
/** The hook's child the swing is applied to (`swing_hook_N`'s node-ref, the disc check). */
export const CRANE_SWING_NODE_READING = 'swingplate';
/** The axis of `CRANE_SWING_NODE_READING`: the node's own X (the disc check). */
export const CRANE_SWING_AXIS_READING = 'local x' as const;
/** `crane_vN` at a round's start. The first press takes the valve-zero branch and pauses. */
export const CRANE_VALVE_START_READING = 0;
/** `hookN_moving` at a round's start, set by `sound_hook_N` (the disc check). 0 while the translation is paused. */
export const CRANE_MOVING_START_READING = 1;
/**
 * `go_on_switch` / `go_off_now` (the disc check of `5471db584`). `go_on_switch` is shown at load and `go_off_now` is
 * hidden: its node reference has deactivate and saveActive (`FUN_0026b5e0`). A resume shows `go_on_switch` and hides
 * `go_off_now`. A pause does the reverse. There is no separate lever animation; this swap is the lever.
 */
export const CRANE_SWITCH_MESH_READING = 'go_on_switch shown at load; go_off_now hidden; resume go_on_switch; pause go_off_now' as const;
/** The mesh a resume shows (research 176 §9.1, the disc check). */
export const CRANE_SWITCH_ON_NODE_READING = 'go_on_switch';
/** The mesh a pause shows. */
export const CRANE_SWITCH_OFF_NODE_READING = 'go_off_now';
/**
 * `control_pause_N` and `control_resume_N` are rooted at `hcont_N` (the disc check of `5471db584`). The meshes are
 * not children of `epan_N`.
 */
export const CRANE_CONTROL_ROOT_READING = 'hcont';
/** The instance under `CRANE_CONTROL_ROOT_READING` that holds the two meshes: `control_switch=control_switch`. */
export const CRANE_CONTROL_SWITCH_READING = 'control_switch';
/**
 * `epan_N` and `hcont_N` are placed beside `hookN`, not under it (the disc paths). `translate_hook_N` is the hook's
 * translation. Those two roots take that same translation, so their pieces stay the hook's offset from rest. The
 * swing stays on `swingplate`. A pause holds the translation on the hook and on both panels (research 176 §9.2).
 */
export const CRANE_PANEL_WITH_HOOK_READING = 'epan and hcont take the hook translation; swing stays on swingplate' as const;
/**
 * `crane_onoff_N`'s set-2 commands 16, 20 and 5 -- `ai::MOVE`, `ai::ANIMATE` and `ai::EVENT` by the decoder's names
 * (research 92 section 2 read them on the doors: the presser ordered toward the node, `Open door` pushed on it, an AI
 * noise). The crane's host runs none of the three: whether a switch's press pushes the clip on the presser is not read
 * here. The mesh rule above is read off the disc's deactivate and saveActive bits (reading, pending review).
 */
export const CRANE_ONOFF_UNDECODED_READING = 'set 2 cmd 16, 20, 5' as const;
/** No capture shows a player carried with the hook (research 176 §9.2). The hull moves; the body is not. */
export const CRANE_RIDE_PLACEHOLDER = 'not carried';
/** No capture shows crush damage from the hook (research 176 §9.2: do not add damage because a hook moves). */
export const CRANE_CRUSH_PLACEHOLDER = 'no damage';
/** `sound_hook_N` and `~CRANE` need the conditional WHILE the effect decoder does not reproduce (research 176 §9.1). */
export const CRANE_SOUND_PLACEHOLDER = 'not played';

/** Which control meshes are drawn (`CRANE_SWITCH_MESH_READING`). */
export type CraneMesh = 'both' | 'on' | 'off';

/** The contact and the sound the disc check left open, and the unread `crane_onoff` commands (research 176 §11). */
export function craneUnresolved(): {
  ride: typeof CRANE_RIDE_PLACEHOLDER;
  crush: typeof CRANE_CRUSH_PLACEHOLDER;
  sound: typeof CRANE_SOUND_PLACEHOLDER;
  onoff: typeof CRANE_ONOFF_UNDECODED_READING;
} {
  return {
    ride: CRANE_RIDE_PLACEHOLDER,
    crush: CRANE_CRUSH_PLACEHOLDER,
    sound: CRANE_SOUND_PLACEHOLDER,
    onoff: CRANE_ONOFF_UNDECODED_READING,
  };
}

/** The disc check of `8881c80d9`, the values the runtime uses. */
export function craneDisc(): {
  flags: typeof CRANE_TRANSLATE_FLAGS_READING;
  flag8: typeof CRANE_TRANSLATE_FLAG8_READING;
  repeat: typeof CRANE_CYCLE_REPEAT_READING;
  swingNode: typeof CRANE_SWING_NODE_READING;
  axis: typeof CRANE_SWING_AXIS_READING;
  valve: typeof CRANE_VALVE_START_READING;
  moving: typeof CRANE_MOVING_START_READING;
  mesh: typeof CRANE_SWITCH_MESH_READING;
  panel: typeof CRANE_PANEL_WITH_HOOK_READING;
} {
  return {
    flags: CRANE_TRANSLATE_FLAGS_READING,
    flag8: CRANE_TRANSLATE_FLAG8_READING,
    repeat: CRANE_CYCLE_REPEAT_READING,
    swingNode: CRANE_SWING_NODE_READING,
    axis: CRANE_SWING_AXIS_READING,
    valve: CRANE_VALVE_START_READING,
    moving: CRANE_MOVING_START_READING,
    mesh: CRANE_SWITCH_MESH_READING,
    panel: CRANE_PANEL_WITH_HOOK_READING,
  };
}

/**
 * The swingplate's angle at `t` seconds (research 176 §9.2): one second of constant acceleration from
 * `±CRANE_SWING_SPEED_READING`, which is back at zero with the speed reversed, then the other way.
 * Applied to `CRANE_SWING_NODE_READING` about `CRANE_SWING_AXIS_READING`.
 */
export function craneSwingAngle(t: number): number {
  if (t <= 0) return 0;
  const period = CRANE_SWING_SECONDS_READING;
  const leg = Math.floor(t / period);
  const u = t - leg * period;
  const sign = leg % 2 === 0 ? 1 : -1;
  const v0 = sign * CRANE_SWING_SPEED_READING;
  const accel = -sign * CRANE_SWING_ACCEL_READING;
  return v0 * u + 0.5 * accel * u * u;
}

/** One relative translation (bit 0x1 of `CRANE_TRANSLATE_FLAGS_READING`): `delta` added to where the leg starts, over `seconds`. */
export interface CraneLeg {
  delta: readonly [number, number, number];
  seconds: number;
}

/** The SWITCH that pauses the hook (research 176 §9.1). */
export interface CraneControl {
  valve: string;
  at: readonly [number, number, number];
  range: number;
  elevation: number;
}

/** One hook, plain data the page and the room share. */
export interface CraneSpec {
  index: number;
  node: string;
  path: string;
  legs: readonly CraneLeg[];
  /** Indices into the hull's owners (`GroundData.owners`). */
  owners: readonly number[];
  /** `CRANE_SWING_NODE_READING`, the child of `path`. */
  swing: string;
  /** `CRANE_SWITCH_ON_NODE_READING` under the control. */
  onMesh: string;
  /** `CRANE_SWITCH_OFF_NODE_READING` under the control. */
  offMesh: string;
  /**
   * `epan_N` and `hcont_N` (`CRANE_PANEL_WITH_HOOK_READING`). The same translation as `path`, not the swing.
   * A child of `path` is not listed: `moveNode` already carries it.
   */
  panels: readonly string[];
  /** Which meshes are drawn at a round's start (`CRANE_SWITCH_MESH_READING`). */
  mesh: CraneMesh;
  control: CraneControl;
}

/**
 * MP81's three hooks as research 176 §9.1-§9.2 prints them. The live map reads the same legs from `MZANIM.ZAR`
 * (`readCranes`); this table is the test's and the note's, not a substitute for a disc that is present.
 */
const CHAIN_REACTION_HOOKS = [
  { node: 'hook1', path: 'worldmodel/hook1', z: 230, valve: 'crane_v1', at: [1118.335, 75.5, 1889.718] as const },
  { node: 'hook2', path: 'worldmodel/hook2', z: -320, valve: 'crane_v2', at: [1118.335, 75.5, 1801.718] as const },
  { node: 'hook3', path: 'worldmodel/hook3', z: 280, valve: 'crane_v3', at: [1118.335, 75.5, 1321.718] as const },
] as const;

/** `worldmodel/hcont_N/control_switch=control_switch`, the parent the two meshes are placed under. */
function switchRoot(index: number): string {
  const n = index + 1;
  return `worldmodel/${CRANE_CONTROL_ROOT_READING}_${n}/${CRANE_CONTROL_SWITCH_READING}=${CRANE_CONTROL_SWITCH_READING}`;
}

/** The three hooks from the audit table, each with `owners` into a hull a test built. */
export function chainReactionCraneSpecs(owners: readonly (readonly number[])[] = [[], [], []]): CraneSpec[] {
  return CHAIN_REACTION_HOOKS.map((h, i) => ({
    index: i,
    node: h.node,
    path: h.path,
    legs: [
      { delta: [CRANE_DELTA_XY_READING, CRANE_DELTA_XY_READING, h.z], seconds: CRANE_LEG_SECONDS_READING },
      { delta: [CRANE_DELTA_XY_READING, CRANE_DELTA_XY_READING, -h.z], seconds: CRANE_LEG_SECONDS_READING },
    ],
    owners: owners[i] ?? [],
    swing: `${h.path}/${CRANE_SWING_NODE_READING}`,
    onMesh: `${switchRoot(i)}/${CRANE_SWITCH_ON_NODE_READING}`,
    offMesh: `${switchRoot(i)}/${CRANE_SWITCH_OFF_NODE_READING}`,
    panels: [`worldmodel/epan_${i + 1}`, `worldmodel/${CRANE_CONTROL_ROOT_READING}_${i + 1}`],
    mesh: 'on',
    control: { valve: h.valve, at: h.at, range: 15, elevation: 15 },
  }));
}

/**
 * A placement the hook's translation carries (`CRANE_PANEL_WITH_HOOK_READING`): the hook's own path, or `epan_N` /
 * `hcont_N`. The swing is not part of this test; `spinLocalX` still turns `swingplate` after the translation.
 */
export function craneRides(spec: Pick<CraneSpec, 'path' | 'panels'>, path: string): boolean {
  return under(path, spec.path) || spec.panels.some((panel) => under(path, panel));
}

/**
 * Instance placements that ride a hook, each as its own group, and the rest as one group in their original order.
 * `go_on_switch` is a child of the realised `control_switch` prototype, so the three cranes would otherwise share one
 * instanced draw (`userData.nodePaths`). A map with no cranes returns the group unchanged. `loadMap` emits each group.
 */
export function splitCranePlacements<T extends { path: string }>(
  group: readonly T[],
  specs: readonly Pick<CraneSpec, 'path' | 'panels'>[],
): T[][] {
  if (specs.length === 0 || group.length === 0) return [group.slice()];
  const riding: T[][] = [];
  const stay: T[] = [];
  for (const p of group) (specs.some((s) => craneRides(s, p.path)) ? riding.push([p]) : stay.push(p));
  return stay.length ? [...riding, stay] : riding;
}

/**
 * CRANE_PRESS_SLACK_ADAPTATION (a network adaptation, no original: the original's press and hull are one console's):
 * how near the room's polygon a crane press may land, in units -- `CRANE_PRESS_BASE_SLACK` plus the fastest leg's
 * travel over the press's lag and `CRANE_PRESS_FRAME_SECONDS`. The page draws the hook at its newest snapshot plus one
 * frame (`./cranePage` `frame`); the room judges the press at its command's tick, so **the room is ahead** of what the
 * page saw, by about the round trip plus the snapshot's age (the #337 review's F1; was: "the page a frame ahead"). The
 * lag is the room's tick less the page's view clock (`Player.viewTick`, the page's claim), clamped to
 * `CRANE_PRESS_LAG_BOUND_ADAPTATION` (`MAX_REWIND_MS`, 200 ms): a forger gains at most that term (about 4 u on hook2).
 * Since NCW-2 B-bound the shots' rewind is a per-seat cap from 200 up to 400 ms (match `room.ts` `rewindCapMs`); the
 * press deliberately keeps the 200 ms floor (as `./net/protocol` `MAX_REWIND_MS` says), so a high-ping seat's press
 * counts less of its lag than its shots do. The view clock is the page's interpolation time, `INTERP_DELAY_MS` (100 ms) behind its server
 * tick (`./net/client`), older than the snapshot the hook is drawn from, so the lag overstates the hook's by up to that
 * delay -- toward acceptance, inside the same bound; and it is the newest batch's clock, not the press's own, which a
 * queued command understates by the queue's depth, under that 100 ms. LATER 325: the hook rewound to the view tick instead.
 */
export const CRANE_PRESS_SLACK_ADAPTATION = 'CRANE_PRESS_BASE_SLACK + fastest leg speed x (press lag + CRANE_PRESS_FRAME_SECONDS)' as const;
/** CRANE_PRESS_SLACK_ADAPTATION's base, in units: `C4_SURFACE_SLACK_PLACEHOLDER`'s value (`equipment.ts`), the line's own slack. */
export const CRANE_PRESS_BASE_SLACK = 1;
/**
 * CRANE_PRESS_SLACK_ADAPTATION's frame, in seconds: the page's drawn frame clamp (`main.ts` and `matchMount.ts`, `Math.min(
 * frameTime.frame(...), 0.1)`, PAR-24), the frame the page steps the hook past its snapshot. Pinned to both sources by `cranes.test.ts`.
 */
export const CRANE_PRESS_FRAME_SECONDS = 0.1;
/** CRANE_PRESS_SLACK_ADAPTATION's lag bound: `MAX_REWIND_MS` (200 ms, the shots' rewind floor, kept on purpose), the most of the page's claimed lag counted. */
export const CRANE_PRESS_LAG_BOUND_ADAPTATION = 'MAX_REWIND_MS' as const;

/**
 * CRANE_PREDICT_ADAPTATION (P8, the online-parity sweep's DMA-3; research 176 s9, 213 s4; a network adaptation beside
 * CRANE_PRESS_SLACK_ADAPTATION): the control is a SWITCH, and the original runs a switch's use on the pressing console
 * (`FUN_00592d50`'s 0x2000 branch -> `FUN_002b44e0`, `SWITCH_PREDICT_ADAPTATION`), so its presser's meshes swap and its
 * hook pauses or resumes at the press. The page toggles its own copy at the press (`CraneSet.predict`, from
 * `CranePage.press`) and holds it -- stepping on locally, the snapshots' phase not laid on that hook -- until the room's
 * word: a snapshot whose valve is the predicted one is the room's toggle, and the hook takes the snapshot again (a jump
 * of the hook's travel over about the up-link delay, the room having toggled that much later); a snapshot acking a
 * command past the press's (`NetClient.acked`) on the old valve, or one with no own body (a dead seat's), is a refusal,
 * and the snapshot's state is laid back at once (the hooks play no sound, `CRANE_SOUND_PLACEHOLDER`). No original: the
 * original has no refusal to run back. Costs: a refused press's swap was seen; another's toggle of the same hook just
 * before this press reads as this press's (the room then refuses or toggles back, and the next snapshot says which).
 */
export const CRANE_PREDICT_ADAPTATION = 'toggled at the press, held until the room\'s word' as const;

/** CRANE_PRESS_SLACK_ADAPTATION for one hook's legs; `lagSeconds` the press's lag, already clamped by the caller (the room). */
export function cranePressSlack(spec: Pick<CraneSpec, 'legs'>, lagSeconds = 0): number {
  const seconds = Math.max(0, lagSeconds) + CRANE_PRESS_FRAME_SECONDS;
  let speed = 0;
  for (const leg of spec.legs) {
    if (leg.seconds <= 0) continue;
    const s = Math.hypot(leg.delta[0], leg.delta[1], leg.delta[2]) / leg.seconds;
    if (s > speed) speed = s;
  }
  return CRANE_PRESS_BASE_SLACK + speed * seconds;
}

/**
 * Where the hook is relative to its rest pose: the completed legs' deltas, then this leg's fraction
 * (`CRANE_RATE_FROM_DELTA_READING`). Leg 0 is the rest pose's outbound leg, which holds because the published
 * pair sums to zero (`CRANE_CYCLE_REPEAT_READING`).
 */
export function craneOffset(legs: readonly CraneLeg[], leg: number, t: number): [number, number, number] {
  const o: [number, number, number] = [0, 0, 0];
  if (legs.length === 0) return o;
  const i = ((leg % legs.length) + legs.length) % legs.length;
  for (let k = 0; k < i; k++) add(o, legs[k]!.delta);
  const cur = legs[i]!;
  const k = cur.seconds > 0 ? Math.min(1, Math.max(0, t / cur.seconds)) : 1;
  o[0] += cur.delta[0] * k;
  o[1] += cur.delta[1] * k;
  o[2] += cur.delta[2] * k;
  return o;
}

function add(o: [number, number, number], d: readonly [number, number, number]): void {
  o[0] += d[0];
  o[1] += d[1];
  o[2] += d[2];
}

/** A column-major translation, the same layout `WorldView.moveNode` applies (research 92's door delta). */
function translationOf(dx: number, dy: number, dz: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = dx;
  m[13] = dy;
  m[14] = dz;
  return m;
}

interface CraneRun {
  spec: CraneSpec;
  leg: number;
  t: number;
  swingT: number;
  paused: boolean;
  /** `spec.mesh` until the first press (`CRANE_SWITCH_MESH_READING`). */
  mesh: CraneMesh;
  rest: { offset: number; points: Float32Array }[];
  /** P8 (`CRANE_PREDICT_ADAPTATION`): the page's own press awaiting the room's word -- its command, the paused state it set. */
  predicted: { seq: number; paused: boolean } | null;
}

/** What the page lends: the hook drawn where it is now, its swingplate turned, the control meshes shown. */
export interface CraneHooks {
  moved?(spec: CraneSpec, delta: Float32Array): void;
  /** `CRANE_SWING_NODE_READING` about its local X, after `moved` so the translation stays. */
  swung?(spec: CraneSpec, angle: number): void;
  /** `CRANE_SWITCH_MESH_READING`. */
  shown?(spec: CraneSpec, mesh: CraneMesh): void;
}

/**
 * The map's hooks. `ground` is the hull the polygons live in (rewritten in place, as a door's leaf is), or null
 * for a set that only draws.
 */
export class CraneSet {
  private readonly cranes: CraneRun[];
  private readonly hull: Float32Array | null;

  constructor(readonly specs: readonly CraneSpec[], ground: GroundData | null, private readonly hooks: CraneHooks = {}) {
    const polys = ground ? groundPolygons(ground) : [];
    const base = ground ? ground.points.byteOffset : 0;
    this.cranes = specs.map((spec) => {
      const rest: CraneRun['rest'] = [];
      for (const o of spec.owners) {
        const owner = ground?.owners[o];
        if (!owner) continue;
        for (const p of polys.slice(owner.first, owner.first + owner.count)) {
          rest.push({ offset: (p.points.byteOffset - base) / 4, points: Float32Array.from(p.points) });
        }
      }
      return { spec, leg: 0, t: 0, swingT: 0, paused: false, mesh: spec.mesh, rest, predicted: null };
    });
    this.hull = ground?.points ?? null;
    for (const c of this.cranes) this.pose(c);
  }

  get count(): number {
    return this.cranes.length;
  }

  /** The hook whose control valve is `valve`, or -1. */
  indexByValve(valve: string): number {
    const name = valve.toLowerCase();
    return this.specs.findIndex((s) => s.control.valve.toLowerCase() === name);
  }

  /**
   * The control's other branch (research 176 §9.1): moving becomes paused (`crane_vN` 1, `hookN_moving` 0), paused
   * becomes moving (`crane_vN` 0, `hookN_moving` 1). The first press pauses (`CRANE_VALVE_START_READING`). The sway
   * clock is not touched. The meshes follow the press (`CRANE_SWITCH_MESH_READING`). False when `valve` is not one
   * of these hooks.
   */
  toggleByValve(valve: string): boolean {
    const i = this.indexByValve(valve);
    if (i < 0) return false;
    this.toggle(i);
    return true;
  }

  /** Pause or resume hook `i`, and swap the control meshes. */
  toggle(i: number): void {
    const c = this.cranes[i];
    if (!c) return;
    c.paused = !c.paused;
    c.mesh = c.paused ? 'off' : 'on';
    this.pose(c);
  }

  /**
   * P8 (`CRANE_PREDICT_ADAPTATION`): the page's own press of hook `i`'s control, sent to the room naming command `seq`:
   * toggled here at once and held until the room's word (`applyWire`). False -- the press followed off the wire -- for no
   * such hook, or one whose last press still waits.
   */
  predict(i: number, seq: number): boolean {
    const c = this.cranes[i];
    if (!c || c.predicted) return false;
    this.toggle(i);
    c.predicted = { seq, paused: c.paused };
    return true;
  }

  /**
   * `crane_vN` (`valve`), `hookN_moving` (`moving`), the leg, the seconds into it, the swing angle, and which
   * control meshes are drawn.
   */
  state(i: number): { paused: boolean; valve: number; moving: number; leg: number; t: number; offset: [number, number, number]; swing: number; mesh: CraneMesh } {
    const c = this.cranes[i];
    if (!c) return { paused: false, valve: CRANE_VALVE_START_READING, moving: CRANE_MOVING_START_READING, leg: 0, t: 0, offset: [0, 0, 0], swing: 0, mesh: 'on' };
    return {
      paused: c.paused,
      valve: c.paused ? 1 : CRANE_VALVE_START_READING,
      moving: c.paused ? 0 : CRANE_MOVING_START_READING,
      leg: c.leg, t: c.t,
      offset: craneOffset(c.spec.legs, c.leg, c.t),
      swing: craneSwingAngle(c.swingT),
      mesh: c.mesh,
    };
  }

  /** One step, `dt` seconds. Translation holds while paused; the sway does not (research 176 §9.1). */
  step(dt: number): void {
    for (const c of this.cranes) {
      c.swingT += dt;
      if (!c.paused) this.advance(c, dt);
      this.pose(c);
    }
  }

  /** The round's start: every hook at rest and moving again (research 176 §9.3, the reset with the doors). */
  reset(): void {
    for (const c of this.cranes) {
      c.leg = 0;
      c.t = 0;
      c.swingT = 0;
      c.paused = false;
      c.mesh = c.spec.mesh;
      c.predicted = null;
      this.pose(c);
    }
  }

  /** Every hook for the snapshot, in spec order. */
  wire(): CraneWire[] {
    return this.cranes.map((c) => ({
      valve: c.paused ? 1 : CRANE_VALVE_START_READING,
      leg: c.leg,
      ms: Math.max(0, Math.min(0xffff, Math.round(c.t * 1000))),
      swingMs: ((Math.round(c.swingT * 1000) % 2000) + 2000) % 2000,
      mesh: c.mesh === 'on' ? 1 : c.mesh === 'off' ? 2 : 0,
    }));
  }

  /**
   * A server's hooks (`Snapshot.cranes`): the phase and the pause, exactly, so a late join does not restart the leg
   * (research 176 §9.3). `acked` (P8) is the last command of this page's the room had run as of that snapshot
   * (`NetClient.acked`), null with no own body in it, undefined when not known: it settles a predicted press.
   */
  applyWire(wire: readonly CraneWire[] | undefined, acked?: number | null): void {
    if (!wire) return;
    wire.forEach((w, i) => {
      const c = this.cranes[i];
      if (!c || c.spec.legs.length === 0) return;
      const p = c.predicted;
      if (p) {
        // P8 (`CRANE_PREDICT_ADAPTATION`): the room's toggle (its valve the predicted one) or its refusal (past the press's
        // command on the old valve, or no own body) ends the prediction, and the snapshot is laid on; else it holds.
        const decided = (w.valve !== 0) === p.paused || acked === null || (acked !== undefined && acked > p.seq);
        if (!decided) return;
        c.predicted = null;
      }
      c.paused = w.valve !== 0;
      c.leg = ((w.leg % c.spec.legs.length) + c.spec.legs.length) % c.spec.legs.length;
      c.t = Math.max(0, w.ms) / 1000;
      c.swingT = Math.max(0, w.swingMs) / 1000;
      c.mesh = w.mesh === 1 ? 'on' : w.mesh === 2 ? 'off' : 'both';
      this.pose(c);
    });
  }

  private advance(c: CraneRun, dt: number): void {
    let left = dt;
    for (let guard = 0; left > 0 && guard < 8; guard++) {
      const leg = c.spec.legs[c.leg];
      if (!leg) return;
      if (leg.seconds <= 0) {
        c.leg = (c.leg + 1) % c.spec.legs.length;
        c.t = 0;
        continue;
      }
      const room = leg.seconds - c.t;
      if (left < room) {
        c.t += left;
        return;
      }
      left -= room;
      c.t = 0;
      c.leg = (c.leg + 1) % c.spec.legs.length;
    }
  }

  /** The hook's polygons and its drawing, at the offset the leg and the clock name. */
  private pose(c: CraneRun): void {
    const [dx, dy, dz] = craneOffset(c.spec.legs, c.leg, c.t);
    if (this.hull) {
      for (const r of c.rest) {
        for (let k = 0; k < r.points.length; k += 3) {
          this.hull[r.offset + k] = r.points[k]! + dx;
          this.hull[r.offset + k + 1] = r.points[k + 1]! + dy;
          this.hull[r.offset + k + 2] = r.points[k + 2]! + dz;
        }
      }
    }
    this.hooks.moved?.(c.spec, translationOf(dx, dy, dz));
    this.hooks.swung?.(c.spec, craneSwingAngle(c.swingT));
    this.hooks.shown?.(c.spec, c.mesh);
  }
}

/**
 * MP81's hooks off the archive: `translate_hook_N`'s relative translations, the `hookN` node's polygons, and the
 * SWITCH whose valve is `crane_vN`. None on any other map. Never throws.
 */
export function readCranes(
  bytes: Uint8Array, toc: ZdbEntry[], models: SceneNode[], owners: CollisionOwner[], polys: readonly { points: Float32Array }[],
): { cranes: CraneSpec[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  let programs = new Map<string, EffectProgram>();
  let anims: ZAnimAnimation[] = [];
  try {
    const archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
    anims = archive.sets.flatMap((s) => s.anims);
    programs = new Map(anims.map((a) => [a.name.toLowerCase(), decodeEffectProgram(a)]));
  } catch (e) {
    return { cranes: [], diagnostics: [`cranes: MZANIM.ZAR: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (![1, 2, 3].some((i) => programs.has(`translate_hook_${i}`))) return { cranes: [], diagnostics };
  const { records, error } = readActionRecords(bytes, toc);
  if (error !== undefined) diagnostics.push(`cranes: actions.rdr: ${error}`);
  const flat = flattenScene(models, 'worldmodel');
  const cranes: CraneSpec[] = [];
  for (let i = 1; i <= 3; i++) {
    const program = programs.get(`translate_hook_${i}`);
    if (!program) {
      diagnostics.push(`cranes: translate_hook_${i} is not in MZANIM.ZAR`);
      continue;
    }
    const legs = legsOf(program, diagnostics, i);
    if (legs.length === 0) {
      diagnostics.push(`cranes: translate_hook_${i} has no relative translation`);
      continue;
    }
    const sum = craneOffset(legs, legs.length, 0);
    if (Math.hypot(...sum) > 0.05) diagnostics.push(`cranes: hook${i} legs do not close (${sum.map((n) => n.toFixed(3)).join(', ')}); ${CRANE_CYCLE_REPEAT_READING}`);
    const at = flat.find((f) => f.node.name.toLowerCase() === `hook${i}`);
    if (!at) {
      diagnostics.push(`cranes: hook${i} is not placed`);
      continue;
    }
    const mine = owners.map((o, k) => (under(o.path, at.path) ? k : -1)).filter((k) => k >= 0);
    if (mine.length === 0) diagnostics.push(`cranes: hook${i} has no collision under it`);
    const record = (records ?? []).find((r) => r.typeCode === ACTION_TYPE_CODES.SWITCH && (
      r.valve.toLowerCase() === `crane_v${i}` || r.anims.some((a) => a.toLowerCase() === `crane_onoff_${i}`)
    ));
    const placed = record ? flat.find((f) => f.node.name.toLowerCase() === record.node.toLowerCase()) : undefined;
    const origin = placed ? apply4(placed.world, 0, 0, 0) : null;
    if (!record || !origin) diagnostics.push(`cranes: hook${i} has no SWITCH control placed`);
    const swing = pathNamed(flat, at.path, CRANE_SWING_NODE_READING);
    const pause = anims.find((a) => a.name.toLowerCase() === `control_pause_${i}`);
    const rootRef = pause?.nodeRefs[pause.params.rootNodeIndex];
    const rootName = rootRef && rootRef.name !== 'NA' ? rootRef.name : null;
    const rootPath = rootName ? flat.find((f) => f.node.name.toLowerCase() === rootName.toLowerCase())?.path ?? null : null;
    if (!pause || !rootPath) diagnostics.push(`cranes: hook${i} control_pause_${i} is not rooted at a placed ${CRANE_CONTROL_ROOT_READING}`);
    const onMesh = rootPath ? pathNamed(flat, rootPath, CRANE_SWITCH_ON_NODE_READING) : null;
    const offMesh = rootPath ? pathNamed(flat, rootPath, CRANE_SWITCH_OFF_NODE_READING) : null;
    if (!swing) diagnostics.push(`cranes: hook${i} has no ${CRANE_SWING_NODE_READING} child`);
    if (!onMesh || !offMesh) diagnostics.push(`cranes: hook${i} is missing ${CRANE_SWITCH_ON_NODE_READING} or ${CRANE_SWITCH_OFF_NODE_READING}`);
    const onFlags = meshFlags(anims, rootName, i, CRANE_SWITCH_ON_NODE_READING);
    const offFlags = meshFlags(anims, rootName, i, CRANE_SWITCH_OFF_NODE_READING);
    if (!onFlags.seen || !offFlags.seen) diagnostics.push(`cranes: hook${i} switch meshes have no deactivate/saveActive flags under ${rootName ?? CRANE_CONTROL_ROOT_READING}`);
    const panels = panelRoots(placed?.path ?? null, rootPath, at.path);
    for (const root of panels) {
      owners.forEach((o, k) => { if (under(o.path, root) && !mine.includes(k)) mine.push(k); });
    }
    const travel = travelOf(legs);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const k of mine) {
      const o = owners[k]!;
      for (const p of polys.slice(o.first, o.first + o.count)) {
        for (let n = 0; n < p.points.length; n += 3) {
          minX = Math.min(minX, p.points[n]!);
          maxX = Math.max(maxX, p.points[n]!);
          minZ = Math.min(minZ, p.points[n + 2]!);
          maxZ = Math.max(maxZ, p.points[n + 2]!);
        }
      }
    }
    const sweep: Footprint = {
      minX: (Number.isFinite(minX) ? minX : 0) + travel.minX,
      maxX: (Number.isFinite(maxX) ? maxX : 0) + travel.maxX,
      minZ: (Number.isFinite(minZ) ? minZ : 0) + travel.minZ,
      maxZ: (Number.isFinite(maxZ) ? maxZ : 0) + travel.maxZ,
    };
    for (const k of mine) owners[k]!.sweep = sweep;
    const fallback = switchRoot(i - 1);
    cranes.push({
      index: cranes.length,
      node: at.node.name,
      path: at.path,
      legs,
      owners: mine,
      panels,
      swing: swing ?? `${at.path}/${CRANE_SWING_NODE_READING}`,
      onMesh: onMesh ?? `${fallback}/${CRANE_SWITCH_ON_NODE_READING}`,
      offMesh: offMesh ?? `${fallback}/${CRANE_SWITCH_OFF_NODE_READING}`,
      mesh: openingMesh(onFlags.seen && onFlags.deactivate, offFlags.seen && offFlags.deactivate),
      control: {
        valve: record?.valve || `crane_v${i}`,
        at: origin ?? [0, 0, 0],
        range: record?.range ?? 15,
        elevation: record?.elevation ?? 15,
      },
    });
  }
  return { cranes, diagnostics };
}

/**
 * Init bits of a mesh node on `control_pause_N`, `control_resume_N`, or any animation rooted at the same node
 * (`CRANE_CONTROL_ROOT_READING`). `seen` is false when no such reference carries deactivate or saveActive.
 */
function meshFlags(anims: readonly ZAnimAnimation[], root: string | null, hook: number, node: string): { seen: boolean; deactivate: boolean } {
  const want = node.toLowerCase();
  const pause = `control_pause_${hook}`;
  const resume = `control_resume_${hook}`;
  let seen = false;
  let deactivate = false;
  for (const anim of anims) {
    const rooted = root !== null && animRoot(anim)?.toLowerCase() === root.toLowerCase();
    const named = anim.name.toLowerCase() === pause || anim.name.toLowerCase() === resume;
    if (!rooted && !named) continue;
    for (const ref of anim.nodeRefs) {
      if (ref.name.toLowerCase() !== want) continue;
      if (!ref.init.deactivate && !ref.init.saveActive) continue;
      seen = true;
      deactivate = deactivate || ref.init.deactivate;
    }
  }
  return { seen, deactivate };
}

/** `go_on_switch` shown and `go_off_now` hidden is `'on'` (`CRANE_SWITCH_MESH_READING`). */
function openingMesh(onHidden: boolean, offHidden: boolean): CraneMesh {
  if (!onHidden && offHidden) return 'on';
  if (onHidden && !offHidden) return 'off';
  return 'both';
}

/** The animation's root reference name, or null. */
function animRoot(anim: ZAnimAnimation): string | null {
  const ref = anim.nodeRefs[anim.params.rootNodeIndex];
  return ref && ref.name !== 'NA' ? ref.name : null;
}

/**
 * `epan_N` and `hcont_N` when the scene places them beside the hook (`CRANE_PANEL_WITH_HOOK_READING`). A path under
 * the hook is omitted: the hook's own translation already carries it, and a second move would clear the swing.
 */
function panelRoots(epan: string | null, hcont: string | null, hook: string): string[] {
  const out: string[] = [];
  for (const path of [epan, hcont]) {
    if (!path || under(path, hook) || under(hook, path) || out.includes(path)) continue;
    out.push(path);
  }
  return out;
}

/** A node named `name` at or under `parent`, or null. */
function pathNamed(flat: readonly { node: { name: string }; path: string }[], parent: string, name: string): string | null {
  const n = name.toLowerCase();
  return flat.find((f) => f.node.name.toLowerCase() === n && under(f.path, parent))?.path ?? null;
}

/**
 * Relative translations in command order (bit 0x1 of `CRANE_TRANSLATE_FLAGS_READING`). A word other than 0x9 is named
 * (`CRANE_TRANSLATE_FLAG8_READING`) and still taken as relative. A word without bit 0x1 is skipped.
 */
function legsOf(program: EffectProgram, diagnostics: string[], hook: number): CraneLeg[] {
  const legs: CraneLeg[] = [];
  for (const seq of program.sequences) {
    for (const op of seq.ops) {
      if (op.op !== 'fromTo' || !op.translation) continue;
      if ((op.flags & 1) === 0) {
        diagnostics.push(`cranes: hook${hook} translation flags 0x${op.flags.toString(16)} are not relative; skipped`);
        continue;
      }
      if (op.flags !== CRANE_TRANSLATE_FLAGS_READING) {
        diagnostics.push(`cranes: hook${hook} translation flags 0x${op.flags.toString(16)} are not 0x${CRANE_TRANSLATE_FLAGS_READING.toString(16)}; bit 0x${CRANE_TRANSLATE_FLAG8_READING.toString(16)} is unread, motion stays relative`);
      }
      const delta = op.translation.to;
      const seconds = op.seconds;
      if (seconds > 0) {
        const rate = delta.map((d) => d / seconds);
        const off = rate.some((r, i) => Math.abs(r - op.translation!.rate[i]!) > 1e-2);
        if (off) diagnostics.push(`cranes: hook${hook} rate is not delta/seconds (${CRANE_RATE_FROM_DELTA_READING})`);
      }
      legs.push({ delta: [delta[0], delta[1], delta[2]], seconds });
    }
  }
  return legs;
}

/** The box the offsets of one cycle cover, including the rest pose. */
function travelOf(legs: readonly CraneLeg[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let x = 0, z = 0, minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const leg of legs) {
    x += leg.delta[0];
    z += leg.delta[2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}
