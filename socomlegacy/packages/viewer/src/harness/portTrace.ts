/**
 * The browser client's recorder sample (plan PH-3). Read-only: it reads `Walker` and `Traversal` and writes
 * nothing back. The field names are the harness schema's (`tools/harness/schema.ts`); this file does not import
 * `tools/` (package boundary, ruling R7).
 *
 * A headless run steps the same mover the page steps. It is not a retail capture.
 */
import { floorUnder } from '../climb';
import { rootY, type Stance, type Walker } from '../mover';
import type { Traversal } from '../traversal';

export interface PortPad {
  b: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

/** The grenade page's placing readout: the headless walk's GrenadeThrower (PH-3), or null where a runner has none. */
export interface PortGrenade {
  placing: boolean;
  /** Seconds on the placing clock, when placing. */
  timer: number | null;
  placed: number;
}

export interface PortSignals {
  prompt: boolean;
  action: 'climb' | 'place' | 'none';
  holding: boolean;
}

export interface PortSample {
  fields: Record<string, number | string | null>;
  signals: PortSignals;
}

const PLACE_CLIP = 'seal_place_claymore';

function actionOf(kind: string, holdingClip: string | null, grenade: PortGrenade | null): 'climb' | 'place' | 'none' {
  if (holdingClip === PLACE_CLIP || grenade?.placing) return 'place';
  if (kind === 'climb') return 'climb';
  return 'none';
}

/**
 * One game frame of the port, in the schema's names. Null is "no reading" (the comparator skips or masks it).
 * `feetYClimb` is the feet y the runner remembered while a climb was current; the engine is not asked to store it.
 */
export function readPortSample(opt: {
  walker: Walker;
  traversal: Traversal | null;
  grenade: PortGrenade | null;
  pad: PortPad;
  frame: number;
  tGuest: number;
  dt: number;
  feetYClimb: number | null;
}): PortSample {
  const w = opt.walker;
  const s = w.state;
  const t = opt.traversal;
  const st = t?.state() ?? { kind: 'none' as const, clip: null, key: 0, ladder: null };
  const holdingClip = w.holding?.clip ?? null;
  const action = actionOf(st.kind, holdingClip, opt.grenade);
  const depth = st.kind === 'climb' || holdingClip !== null || w.action !== null ? 1 : 0;
  const climbClip = st.kind === 'climb' && st.clip !== null;
  const phase = climbClip && t ? t.state().key : null;
  const pose = t?.pose() ?? null;
  const overFeet = pose?.rootY ?? rootY(w.posture as Stance);
  const floor = floorUnder(w.grid, s.x, s.y, s.z);
  const wished = w.pendingStance ?? w.posture;
  // research 366 section 2: the original skips its gravity step while a climb motion is current; no vy condition
  const suspended = st.kind === 'climb' ? 1 : 0;
  const fields: Record<string, number | string | null> = {
    frame: opt.frame,
    t_guest: opt.tGuest,
    dt: opt.dt,
    'pad.b': opt.pad.b,
    'pad.lx': opt.pad.lx,
    'pad.ly': opt.pad.ly,
    'pad.rx': opt.pad.rx,
    'pad.ry': opt.pad.ry,
    'pos.x': s.x,
    'pos.y': s.y,
    'pos.z': s.z,
    'matrix.y': null,
    'feetY.climb': opt.feetYClimb,
    'vel.local.x': s.vx,
    'vel.local.y': s.vy,
    'vel.local.z': s.vz,
    'vel.world.x': s.vx,
    'vel.world.y': s.vy,
    'vel.world.z': s.vz,
    'action.current': action,
    'action.depth': depth,
    'play.phase': phase,
    'play.steer': null,
    'gravity.suspended': suspended,
    'flags.e1bit4': null,                                      // an active flag, meaning unread (research 366 section 2): no port reading
    'flags.0x200': null,
    'flags.2b': null,
    'claymore.timer': opt.grenade?.placing ? opt.grenade.timer : null,
    'claymore.placed': opt.grenade ? opt.grenade.placed : null,
    'stance.wished': wished,
    health: null,
    alive: w.dead ? 0 : 1,
    moveScale: 1,
    'root.y': s.y + overFeet,
    'floor.y': floor,
    'floor.window': null,
  };
  return {
    fields,
    signals: { prompt: t?.climbPrompt() !== null, action, holding: holdingClip !== null },
  };
}
