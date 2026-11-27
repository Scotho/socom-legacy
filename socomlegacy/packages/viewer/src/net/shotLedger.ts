import type { CombatReport, ShotLedgerFields } from './protocol';
import { bodyPointDistance } from './shotCone';
import type { HitBody } from './hitVolumes';

/*
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game). Product track: a playtest instrument with
 * no original. The room's half (opt-in COMBAT_REPORT: `ShotLedgerFields` on its `fire` rows, `../../../match/src/room.ts`
 * `fireAt`), the page's half (`PageShot`: what the page's own cast on its drawn bodies expected of each round it sent,
 * `../remotePlayers` `aimFirst`) and their join for the ?devmode playtest report (`joinShotLedger`). Everything here
 * reads; nothing decides, draws or sends anything the game does.
 */

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): how far either side of a body's feet,
 * along the round's line, the room searches for its nearest miss (`lineBodyDistance`), world units -- a standing body
 * is under 20 units tall and a prone one under 20 long (10 units a metre), so 40 holds every box with room to spare.
 * An instrument's span, not a game value.
 */
export const LEDGER_MISS_SPAN = 40;
/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the search's first step along the line, world units. */
export const LEDGER_MISS_STEP = 0.5;

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the least distance from the line `from` +
 * t `dir` (t in [0, reach], `dir` a unit vector) to `body`'s volumes (`bodyPointDistance`): sampled every
 * `LEDGER_MISS_STEP` within `LEDGER_MISS_SPAN` of the foot of `feet` on the line, then narrowed by a ternary search over
 * the step either side of the least sample. Null when that window lies wholly outside [0, reach]. An estimate for a
 * report: the room judges nothing by it.
 */
export function lineBodyDistance(from: readonly number[], dir: readonly number[], reach: number, feet: readonly number[], body: HitBody): number | null {
  const t0 = (feet[0]! - from[0]!) * dir[0]! + (feet[1]! - from[1]!) * dir[1]! + (feet[2]! - from[2]!) * dir[2]!;
  const lo = Math.max(0, t0 - LEDGER_MISS_SPAN), hi = Math.min(reach, t0 + LEDGER_MISS_SPAN);
  if (!(hi >= lo)) return null;
  const at = (t: number): number => bodyPointDistance([from[0]! + dir[0]! * t, from[1]! + dir[1]! * t, from[2]! + dir[2]! * t], body);
  let bestT = lo, best = at(lo);
  for (let t = lo + LEDGER_MISS_STEP; t <= hi; t += LEDGER_MISS_STEP) {
    const d = at(t);
    if (d < best) { best = d; bestT = t; }
  }
  let a = Math.max(lo, bestT - LEDGER_MISS_STEP), b = Math.min(hi, bestT + LEDGER_MISS_STEP);
  for (let i = 0; i < 30; i++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
    if (at(m1) <= at(m2)) b = m2; else a = m1;
  }
  const d = Math.min(best, at((a + b) / 2));
  return Number.isFinite(d) ? d : null;
}

const LEDGER_KEYS = ['seq', 'rewindTick', 'rewindLead', 'rewindClass', 'missBy', 'worldAt'] as const;

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the `ShotLedgerFields` `data` carries, and
 * only those it carries -- so a row without them is the row as before, key for key.
 */
export function shotLedgerFields(data: ShotLedgerFields): ShotLedgerFields {
  const out: Record<string, unknown> = {};
  for (const k of LEDGER_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out as unknown as ShotLedgerFields;
}

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): what the page expected of one round it
 * sent (`seq`, the `fire` message's): the first record its own cast on its drawn bodies made along the round's line
 * (`../remotePlayers` `aimFirst`) -- the body's id, the bone box and the part (`./hitVolumes` `NO_PART` for a bone that
 * takes nothing) and the distance along the line -- or all null, none.
 */
export interface PageShot { seq: number; body: number | null; bone: number | null; part: number | null; distance: number | null }

/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): what the page keeps of its own rounds (`PageShot`s), oldest first. */
export interface PageShotReport { events: PageShot[]; dropped: number }

/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): a refused round as the page was told it (`roundRefused`). */
export interface LedgerRefusal { seq: number; why: string }

/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the room's side of one round, from its first deciding row. */
export interface LedgerRoom {
  status: CombatReport['status']; reason: string | null; target: number | null; part: number | null;
  rewindTick: number | null; rewindLead: number | null; rewindClass: CombatReport['rewindClass'] | null; missBy: number | null; worldAt: number | null;
}

/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): one round's row of the join. */
export interface ShotLedgerRow { seq: number; class: string; page: Omit<PageShot, 'seq'> | null; room: LedgerRoom | null }

/** SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the report's section -- its rows by seq and the count by class. */
export interface ShotLedgerSection { rows: ShotLedgerRow[]; byClass: Record<string, number> }

const roomOf = (r: CombatReport): LedgerRoom => ({
  status: r.status, reason: r.reason ?? null, target: r.target?.id ?? null, part: r.part ?? null,
  rewindTick: r.rewindTick ?? null, rewindLead: r.rewindLead ?? null, rewindClass: r.rewindClass ?? null, missBy: r.missBy ?? null, worldAt: r.worldAt ?? null,
});

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): one round's class from the room's rows for
 * its seq (a shotgun pull's rays share one), the page's refusal told for it and the page's expectation --
 * - an applied row: `PART-DIFFERS` when the page expected another body or part (page head, room body: B-44), else `OK`;
 * - a 'no damage' miss (every record a bone that takes nothing; P9): `NO-DAMAGE-BONE`;
 * - a rejected row, or a `roundRefused` (P1-P7): `REFUSED:<why>`;
 * - a plain miss: when the page's cast met a body, `WORLD` if the room's walk met a world surface before that body's
 *   distance (P10), else `POSE-MISS` (P8: its row keeps `missBy` and `rewindClass`); when it met none (`page.body`
 *   null), `OK` (a miss the page expected too); with no page row for the seq at all (its ring let it go, or the page
 *   noted none), `MISS-NO-PAGE` -- not taken for a miss the page expected;
 * - a miss under another of the room's reasons ('not alive', 'guard', 'beyond range'): `ROOM-MISS:<reason>`;
 * - no row of the room's kept for a round the page sent: `UNANSWERED`. Not "the room never decided" by itself: two known
 *   causes leave a decided round with no row here -- a refusal the room reports with no seq (`room.ts` `dropped` for
 *   'shape', 'too many waiting', the action gate, 'mounted' and the turret's paths), which joins only as REFUSED when a
 *   `roundRefused` was told for it; and the report's per-tick cap on refusal rows
 *   (`COMBAT_REPORT_REJECTIONS_PER_TICK`) dropping one. The page's or the report's ring letting it go is a third.
 * `PRESS-LOST` (P11, a press with no round) is not built: the page holds no cheap signal of a lost press.
 */
export function ledgerClass(rows: readonly CombatReport[], refused: LedgerRefusal | undefined, page: PageShot | undefined): { class: string; room: CombatReport | null } {
  const applied = rows.find((r) => r.status === 'applied');
  if (applied) {
    const differs = page !== undefined && page.body !== null && (page.body !== (applied.target?.id ?? null) || page.part !== applied.part);
    return { class: differs ? 'PART-DIFFERS' : 'OK', room: applied };
  }
  const noDamage = rows.find((r) => r.status === 'miss' && r.reason === 'no damage');
  if (noDamage) return { class: 'NO-DAMAGE-BONE', room: noDamage };
  const rejected = rows.find((r) => r.status === 'rejected');
  if (rejected) return { class: `REFUSED:${rejected.reason ?? ''}`, room: rejected };
  if (refused) return { class: `REFUSED:${refused.why}`, room: null };
  const miss = rows.find((r) => r.status === 'miss' && r.reason === null);
  if (miss) {
    if (!page) return { class: 'MISS-NO-PAGE', room: miss };
    if (page.body === null) return { class: 'OK', room: miss };
    const world = miss.worldAt ?? null;
    return { class: world !== null && page.distance !== null && world < page.distance ? 'WORLD' : 'POSE-MISS', room: miss };
  }
  const other = rows.find((r) => r.status === 'miss');
  if (other) return { class: `ROOM-MISS:${other.reason ?? ''}`, room: other };
  return { class: 'UNANSWERED', room: null };
}

/**
 * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game): the join of the room's `fire` rows that
 * name a seq, the refused rounds told and the page's own expectations, by seq (ascending), each row classed
 * (`ledgerClass`), with the count by class. Null -- no section -- unless some combat row names a seq (a room speaking the
 * ledger, `COMBAT_REPORT=1`): a report from an older room, or with the report off, is the report as before.
 */
export function joinShotLedger(combat: readonly CombatReport[], refused: readonly LedgerRefusal[], page: readonly PageShot[]): ShotLedgerSection | null {
  const fire = combat.filter((r) => r.request === 'fire' && typeof r.seq === 'number');
  if (!fire.length) return null;
  const rows = new Map<number, CombatReport[]>();
  for (const r of fire) { const l = rows.get(r.seq!); if (l) l.push(r); else rows.set(r.seq!, [r]); }
  const told = new Map<number, LedgerRefusal>();
  for (const r of refused) if (!told.has(r.seq)) told.set(r.seq, r);
  const pages = new Map<number, PageShot>();
  for (const s of page) if (!pages.has(s.seq)) pages.set(s.seq, s);
  const seqs = [...new Set([...rows.keys(), ...told.keys(), ...pages.keys()])].sort((a, b) => a - b);
  const out: ShotLedgerRow[] = [];
  const byClass: Record<string, number> = {};
  for (const seq of seqs) {
    const p = pages.get(seq);
    const { class: cls, room } = ledgerClass(rows.get(seq) ?? [], told.get(seq), p);
    out.push({ seq, class: cls, page: p ? { body: p.body, bone: p.bone, part: p.part, distance: p.distance } : null, room: room ? roomOf(room) : null });
    byClass[cls] = (byClass[cls] ?? 0) + 1;
  }
  return { rows: out, byClass };
}
