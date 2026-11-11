import { PART } from '../../viewer/src/net/damage';
import { NO_PART } from '../../viewer/src/net/hitVolumes';

/**
 * BONE-BOXES (owner ruling OT.R119; research 398 s0-s5, s13; reading, pending review): the walk over a round's body
 * records -- one for each bone box the round's line enters (`../../viewer/src/net/hitVolumes` `rayRecords`), every body's
 * -- as the original's bullet takes them. Pure: the room (`room.ts` `rewoundBodies`, `fire`) holds the records and asks.
 *
 * - The order (`walkOrder`): `FUN_003c9b70` picks, out of the whole list, the record nearest the line's start that is
 *   strictly farther than the one it handled last (D:L319966-320014; the test D:L319990), the shooter's own skipped
 *   (D:L319997-320008: the room never casts on the shooter's body). So two records at one distance are handled once:
 *   the first the list holds (its nearest test is strict too, `fVar16 < fVar18`). The room's list is the players' order,
 *   then the hostages', each body's boxes in its skeleton's order (`BODY_RECORD_TIE_READING`).
 * - The range (`../../viewer/src/round` `roundPath`, `penetrate`): every PERSON record cuts it, the damaging bones' and
 *   the others' alike (`FUN_003c8920` D:L319506-319517).
 * - The damage (`bodyApplications`): the struck node's handler runs for each record (D:L319417-319418); its part routine
 *   returns at once when the victim remembers this round (`+0x1048`, `FUN_005ab850` D:L464597), else damages the
 *   record's bone's part (`FUN_005abbc0` D:L464740-464766) and remembers the round after a head or neck hit
 *   (D:L464741-464743) or a trunk hit (D:L464755-464757) -- never after a limb's; a bone with no branch (a hand, a foot,
 *   the root) damages nothing and remembers nothing. A class-'Q' round (the shotgun's volley) applies on its first
 *   record of a body whatever the bone and remembers (D:L464703-464737): one application a body a ray.
 */

/**
 * BONE-BOXES: the records two bodies' boxes give at exactly one distance [reading]. 'bodies only, list order': the
 * room drops a body record at the distance of the body record before it (the first kept: the players in the room's
 * order, then the hostages, each body's bones in its skeleton's order), as `FUN_003c9b70`'s strict test does
 * (D:L319990). Not built: the same tie between a body record and a world polygon (the original handles one of the two
 * by the query's list order, the grid cells' and the nodes', research 398 s1; `roundPath` keeps both), and the
 * original's own list order between two bodies (its grid walk's, `FUN_002d3cf0` D:L175411-175731). Settles with the
 * query's list read for two actors in one cell, or a capture of a shot through two coincident entries -- measure zero in
 * play.
 */
export const BODY_RECORD_TIE_READING = 'bodies only, list order' as const;

/**
 * BONE-BOXES (research 398 s13.2): the impact routine hands a record to the bounce routine `FUN_003c8f50` instead of
 * the range cut when the weapon's `+0x68` (`FUN_003d2030` D:L324588-324593) is above 0 and the record lies within that
 * distance (D:L319439-319471) [reading]. 'never': the room walks every firearm's body record through the range cut and
 * the handler. Which firearms carry a `+0x68` above 0 is not read; for one that does, a body record inside its distance
 * would bounce, not pass. Settles with `+0x68` read off every firearm record of `ZWEAPON.ZAR` (its field named), and
 * `FUN_003c8f50` read for a PERSON record.
 */
export const BULLET_BOUNCE_HANDOFF_READING = 'never' as const;

/** A body record of the walk: its distance along the round, and whose body, which part (`NO_PART`: a bone that takes nothing). */
export interface BodyRecord { readonly distance: number; readonly tag?: unknown }
interface Tag { id: number; part: number; hostage?: true }

/** Sorts `records` nearest first (in place, stable) and drops each not strictly farther than the last kept (D:L319990). */
export function walkOrder<T extends { distance: number }>(records: T[]): T[] {
  records.sort((a, b) => a.distance - b.distance);
  let n = 0, last = -Infinity;
  for (const r of records) {
    if (r.distance > last) { records[n++] = r; last = r.distance; }
  }
  records.length = n;
  return records;
}

/**
 * The records of a round's walk (in the walk's order; any without a body tag passed over) that apply damage: research
 * 398 s0, rule 4 -- each body's memory of the round set by a HEAD or BODY hit, a later record of that body refused; a
 * `NO_PART` record none. `volley`: the shotgun's ray, class 'Q' -- a body's first record applies, whatever the bone, and
 * remembers. The memory is each body's own (a player and a hostage of one id are two).
 */
export function bodyApplications<T extends BodyRecord>(records: readonly T[], volley: boolean): T[] {
  const remembered = new Set<number>();
  const out: T[] = [];
  for (const r of records) {
    const tag = r.tag as Tag | undefined;
    if (!tag) continue;
    const key = tag.hostage ? -1 - tag.id : tag.id;
    if (remembered.has(key)) continue;                            // FUN_005ab850 D:L464597: this round is remembered
    if (volley) { out.push(r); remembered.add(key); continue; }    // the 'Q' branch, D:L464703-464737
    if (tag.part === NO_PART) continue;                           // no branch of D:L464740-464766
    out.push(r);
    if (tag.part === PART.HEAD || tag.part === PART.BODY) remembered.add(key);
  }
  return out;
}
