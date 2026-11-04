// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundPolygons, packGround, TICK, WalkMode, type Walker } from '../src/walk';
import { Traversal } from '../src/traversal';
import { readMotionTable } from '../src/motionTable';
import { oneShotSeconds } from '../src/locomotion';
import { fireCapability } from '../src/net/fireCapability';
import { flinchBodyOf, flinchStance } from '../src/net/deaths';
import {
  GATE_AFTER, GATE_MOTION_RECORDS, GATE_PARAMS, GATE_ROWS, GATE_SETTLE, gateKnock, gatePolys, knockOutcome, PEEK_LEAD, peekOutcome, stanceOutcome, walkOutcome,
  type GateRow,
} from './helpers/gateTable';

/** PF-17: the `motion.rdr` records the fire rows read (`GATE_MOTION_RECORDS`), handed over as `./play` does. */
const TABLE = readMotionTable(GATE_MOTION_RECORDS);

/**
 * The page's runner of the sprint 28 gate table (ruling PF.R35; `./helpers/gateTable.ts`): each row on the page's own
 * walk -- `WalkMode` with its `Walker` and `Traversal`, the press through the page's own entry (`WalkMode.setStance`) --
 * and the outcome the row expects. `central/test/roomGates.test.ts` runs the same rows through the room.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** The row on the page: the body placed, settled, driven, pressed, run on; the outcome. */
function onPage(row: GateRow): string {
  const { polys, owners } = gatePolys(row);
  const fly = new FlyCamera(canvas());
  const m = new WalkMode(fly, () => undefined);
  made.push(m);
  m.setGround(packGround(GATE_PARAMS, polys, owners), null);
  m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  m.setMotionTable(TABLE);
  expect(m.respawn([row.body.at[0], 0, row.body.at[1]], row.body.yaw)).toBe(true);
  const w = m['walker'] as Walker;
  w.stance = row.body.stance;
  const weapon = row.body.weapon ?? 0;
  m['weapon_'] = weapon;
  m.walkFor(GATE_SETTLE * TICK, { forward: 0, right: 0, boost: false });
  expect(m.stance()).toBe(row.body.stance);
  const stick = { forward: row.motion?.forward ?? 0, right: row.motion?.right ?? 0, boost: false };
  if (row.motion) m.walkFor(row.motion.ticks * TICK, stick);
  switch (row.input.kind) {
    case 'stance': m.setStance(row.input.to); break;
    case 'fire': {
      // PF-17: the press starts the clip; the round at the first tick its motion reaches `at` -- `fireAllowed()`, the
      // page's `Fire.source.ready` half, on the page's own mover after that tick.
      const at = row.input.at;
      m.setStance(row.input.press);
      for (let i = 0; i < GATE_AFTER; i++) {
        m.walkFor(TICK, stick);
        const c = fireCapability(w, m.traversal(), weapon === 1, TABLE).motion;
        if (c && c.clip === at.clip && c.phase >= at.phase) return m.fireAllowed() ? 'taken' : 'refused';
      }
      return `never reached ${at.clip} ${at.phase}`;
    }
    case 'walk': break;                                  // PF-16: the motion alone
    case 'flinchDuring': {                                           // PF-21: the page's own flinch over the press's clip
      const press = row.input.press;
      if ('stance' in press) m.setStance(press.stance); else m.swapWeapon('pistol');
      m.walkFor(row.input.after * TICK, stick);
      const pose = { clip: 'seal_flinch_rarm', frame: 1, loop: false, rootY: null };
      m.setFlinchPose(() => pose);
      const drawn = m.snapshot()?.traversal === pose;
      m.setFlinchPose(null);
      return drawn ? `flinch from ${flinchStance(flinchBodyOf(w))}` : 'no flinch';
    }
    case 'peekStance': {                                         // PF-20: the lean held, the press through the page's entry
      const t = m['moves'] as Traversal;
      m.lean(row.input.side);
      m.walkFor(PEEK_LEAD * TICK, stick);
      const keyBefore = t.pose()?.frame ?? -1;
      m.setStance(row.input.to);
      m.walkFor(TICK, stick);
      const pressPeek = t.peeking(), pressStance = m.stance();
      m.walkFor(TICK, stick);
      const seen = { pressPeek, pressStance, nextPeek: t.peeking(), nextStance: m.stance(), keyBefore, keyNext: t.pose()?.frame ?? -1 };
      m.walkFor(GATE_AFTER * TICK, stick);
      return peekOutcome(row, seen);
    }
    case 'flinch': {
      // PF-18: the page's own flinch as `netPage.ts` hands it over (`setFlinchPose`: a pose on its own clock, null at
      // its one-shot end, PAR-58), on the walk's tick count here; the reload's gate `WalkMode.flinching()` (the page's
      // `Fire.source.flinching`), the round's `fireAllowed()`. The end is the room's (`roomGates.test.ts`): the table's
      // stand-in playback and the same stand-in 25 keys, `T x ((n - 1) / n)^2` (PTW.R3).
      const clip = 'seal_flinch_rarm', end = oneShotSeconds(TABLE.get(clip)!.playback!, 25);
      let t = 0;
      m.setFlinchPose(() => (t < end ? { clip, frame: t * 30, loop: false, rootY: null } : null));
      for (let i = 0; i < row.input.ticks; i++) { m.walkFor(TICK, stick); t += TICK; }
      if (row.input.then === 'reload') return m.flinching() ? 'refused' : 'taken';
      return m.fireAllowed() ? 'taken' : 'refused';
    }
    case 'knock': {
      // PF-19: the blast event's knock as `netPage.ts` hands it over (`WalkMode.knock`: `applyKnock` on the page's own
      // mover and moves); what the body shows at once, and the round's permission over it (`fireAllowed`).
      const busyBefore = m.traversal()?.busy() ?? false;
      const k = gateKnock(row, [w.state.x, w.state.y, w.state.z], w.posture, w.state.yaw);
      if (!k || !m.knock(k)) return 'no knock';
      const s = w.state;
      return knockOutcome(row, {
        busyBefore, busy: m.traversal()?.busy() ?? false, airborne: w.airborne, action: w.action?.name ?? null,
        fire: m.fireAllowed() || !m.knockCovered(), speed: Math.hypot(s.vx, s.vy, s.vz),
      });
    }
  }
  m.walkFor(GATE_AFTER * TICK, stick);
  switch (row.input.kind) {
    case 'stance': return stanceOutcome(row, m.stance());
    case 'walk': return walkOutcome(row, w.state.x);
  }
}

describe('the gate table on the page (PF.R35): WalkMode, Walker and Traversal', () => {
  it.each(GATE_ROWS.map((r) => [r.name, r.expect, r] as const))('%s: the page and the room agree (%s)', (_name, expected, row) => {
    expect(onPage(row)).toBe(expected);
  });
});
