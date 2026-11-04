import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEDICATED_NEXT_MATCH_ADAPTATION, IDLE_KICK_ADAPTATION } from '../src/room';

/**
 * The online-parity sweep's P33 (RS-0; product track, a source pin, nothing in the room changes): the page's own room is
 * the match server's `Room` with `solo: true` (viewer `net/loopback.ts`), so every rule that parts the offline match from
 * the online one is a `this.opts.solo` branch of `room.ts`. Each branch names the row it stands on -- on its own line or
 * in the `//` comment lines directly above it -- so a new branch, or one whose row is dropped, goes red here. Ten
 * branches at P33 (2026-11-03): nine the solo room's one-player match (`SOLO_ROUND_PLACEHOLDER`, research 101) or the
 * idle kick's absence (`IDLE_KICK_ADAPTATION`, research 101 section 3 B13); one, the developer's `&kit=` (`soloKit`),
 * has no row -- named here and reported by P33, not given one.
 */

const ROOM = readFileSync(resolve(import.meta.dirname, '../src/room.ts'), 'utf8').split(/\r?\n/);
const NOTE_101 = readFileSync(resolve(import.meta.dirname, '../../../docs/research/101-the-rounds-open-gaps.md'), 'utf8');
/** A branch on the solo room: `this.opts.solo` itself, not `soloSide` or `soloKit`. */
const SOLO = /this\.opts\.solo\b/;
const ROW = /\b[A-Z][A-Z0-9_]*_(?:PLACEHOLDER|READING|ADAPTATION)\b/g;

/** Each branch's line and the `//` comment lines directly above it, joined. */
function branches(): { line: number; text: string; cited: string }[] {
  const out: { line: number; text: string; cited: string }[] = [];
  ROOM.forEach((text, i) => {
    if (!SOLO.test(text)) return;
    const above: string[] = [];
    for (let j = i - 1; j >= 0 && ROOM[j]!.trim().startsWith('//'); j--) above.unshift(ROOM[j]!);
    out.push({ line: i + 1, text, cited: [...above, text].join('\n') });
  });
  return out;
}

/** The branches in file order: what each is, and the row it cites (null: none -- the one P33 reported). */
const EXPECTED: { what: RegExp; row: string | null }[] = [
  { what: /this\.lobby\.join\(id, ev\.name/, row: 'SOLO_ROUND_PLACEHOLDER' },     // hello: the solo seat's side
  { what: /this\.lobby\.join\(id, name/, row: 'SOLO_ROUND_PLACEHOLDER' },         // replace: the same
  { what: /rules !== 'classic' \|\| this\.opts\.solo\) return;/, row: 'SOLO_ROUND_PLACEHOLDER' },   // abandonIfSideEmpty
  { what: /this\.idle\(now\)/, row: 'IDLE_KICK_ADAPTATION' },                     // no idle kick
  { what: /soloKit\?\.\(\)/, row: null },                                         // typeKit: the developer's `&kit=`
  { what: /eliminationWinner\(this\.living\(\)/, row: 'SOLO_ROUND_PLACEHOLDER' }, // the empty side never eliminated
  { what: /phase !== 'waiting' \|\| this\.opts\.solo\) return false;/, row: 'SOLO_ROUND_PLACEHOLDER' },   // waitingWith
  { what: /launchCountdownS > 0/, row: 'SOLO_ROUND_PLACEHOLDER' },                // launchWaitS
  { what: /return this\.players\.size > 0;/, row: 'SOLO_ROUND_PLACEHOLDER' },     // sidesSeated
  { what: /if \(this\.opts\.solo\) return true;/, row: 'SOLO_ROUND_PLACEHOLDER' }, // sidesPresent
];

describe("P33 (RS-0): every `this.opts.solo` branch of the room names its row", () => {
  it('ten branches, in file order, each the one listed', () => {
    const found = branches();
    expect(found.map((b) => b.line)).toHaveLength(10);
    found.forEach((b, i) => expect(b.text, `line ${b.line}`).toMatch(EXPECTED[i]!.what));
  });

  it("each cites its row on its line or in the comment above it; the one with none says so (the developer's `&kit=`)", () => {
    branches().forEach((b, i) => {
      const want = EXPECTED[i]!.row;
      const names = [...b.cited.matchAll(ROW)].map((m) => m[0]);
      if (want === null) {
        expect(names, `line ${b.line}`).toEqual([]);
        expect(b.cited, `line ${b.line}`).toMatch(/no row names it/);
      } else {
        expect(names, `line ${b.line}`).toContain(want);
      }
    });
  });

  it("the rows cited are research 101's: SOLO_ROUND_PLACEHOLDER's ledger row, and the two P33 labels as section 3's B13 and B14", () => {
    expect(NOTE_101).toMatch(/^\| `SOLO_ROUND_PLACEHOLDER` \|/m);
    expect(NOTE_101).toMatch(/^\| B13 \| [^\n]*`IDLE_KICK_ADAPTATION`/m);
    expect(NOTE_101).toMatch(/^\| B14 \| [^\n]*`DEDICATED_NEXT_MATCH_ADAPTATION`/m);
    // Labels only: named values, read by nothing in the room.
    expect(IDLE_KICK_ADAPTATION).toBe('network-room');
    expect(DEDICATED_NEXT_MATCH_ADAPTATION).toBe('next-match');
  });
});
