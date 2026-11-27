import { BodyFlag } from './net/protocol';
import type { OtherBody } from './pushApart';

/**
 * The first hostage body id (the room's `HOSTAGE_ID_BASE`, match `src/extraction.ts`; `./net/protocol`'s escortee doc):
 * the room sends its hostages among the bodies, and the page offers seats only (`PUSH_APART_HOSTAGE_PLACEHOLDER`).
 */
export const PAGE_HOSTAGE_ID_BASE = 240;

/**
 * The page's other bodies for its own predicted body: the client's bodies at the view tick (`NetClient.bodies`, every
 * other body; the room's hostages among them, dropped by id -- `PUSH_APART_HOSTAGE_PLACEHOLDER`), the living ones, with
 * their posture (`PUSH_APART_REMOTE_STANCE_PLACEHOLDER`).
 * They are the interpolated copies, behind the room's by the view delay: where the page's stop and the room's differ,
 * the room's correction of the page's own body shows it (research 426 s9).
 */
export function bodiesOfStates(states: readonly { id: number; feet: readonly [number, number, number]; stance: number; flags: number }[] | null | undefined, aliveFlag: number = BodyFlag.Alive): OtherBody[] {
  const out: OtherBody[] = [];
  if (!states) return out;
  for (const b of states) {
    if ((b.flags & aliveFlag) === 0 || b.id >= PAGE_HOSTAGE_ID_BASE) continue;
    out.push({ x: b.feet[0], y: b.feet[1], z: b.feet[2], stance: b.stance === 1 ? 'crouch' : b.stance === 2 ? 'prone' : 'stand' });
  }
  return out;
}
