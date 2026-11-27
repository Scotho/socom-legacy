import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Settings } from '@s2u/card';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  JOIN_LEAVE_LINE_ADAPTATION, JOIN_LEAVE_LINE_DEFAULT_ADAPTATION, JOIN_LEAVE_LINE_KEY, JOIN_LEAVE_LINE_VALUES, JOIN_LEAVE_LINE_WORDS,
  JoinLeaveLines, joinLine, leaveLine, readJoinLeaveLine, saveJoinLeaveLine, type JoinLeaveSeat,
} from '../src/joinLeaveLine';

/**
 * JOIN-LEAVE-LINE (a BROWSER ADAPTATION, product track; no original -- `../src/joinLeaveLine`): the line the match page
 * posts on the message window when a human player joins or leaves the game. The room tells every page `joined` and
 * `left` for more than a join and a leave -- a team switch, a trade, "Alternate teams" are `left` then `joined` for the
 * same seat (match `src/room.ts` `switchTeam`, `tradeTeams`, `swapSides`) -- so a leave's line waits a moment for the
 * same seat's `joined`, and a pair is no line at all.
 */

const HOLD = JOIN_LEAVE_LINE_ADAPTATION.reseatHoldS;
/** The match on (its first round started) and not yet on (the room waiting, loading, or between matches). */
const ON = true, WAITING = false;
const FRAME = 1 / 60;

function lines() {
  const posted: string[] = [];
  const l = new JoinLeaveLines((text) => { posted.push(text); });
  /** Frames of 1/60 s for `seconds`. */
  const run = (seconds: number): void => { for (let i = 0; i < Math.ceil(seconds / FRAME); i++) l.frame(FRAME); };
  return { l, posted, run };
}

const seat = (id: number, name: string, over: Partial<JoinLeaveSeat> = {}): JoinLeaveSeat =>
  ({ id, name, bot: false, self: false, seated: false, ...over });
/** The seat as the page holds it when the room says it left: seated. */
const held = (id: number, name: string, over: Partial<JoinLeaveSeat> = {}): JoinLeaveSeat => seat(id, name, { seated: true, ...over });

describe('JOIN-LEAVE-LINE: the lines', () => {
  it('the two texts, the name as the room gave it', () => {
    expect([joinLine('Machete'), leaveLine('Machete')]).toEqual(['Machete has joined the game.', 'Machete has left the game.']);
    expect(joinLine('-KiLL-')).toBe('-KiLL- has joined the game.');
  });

  it('a join posts at once', () => {
    const { l, posted } = lines();
    l.joined(seat(2, 'Machete'), ON);
    expect(posted).toEqual(['Machete has joined the game.']);
  });

  it('a leave posts once its hold has run, not before, and once only', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    expect(posted).toEqual([]);
    run(HOLD / 2);
    expect(posted).toEqual([]);
    run(HOLD);
    expect(posted).toEqual(['Machete has left the game.']);
    run(HOLD * 4);
    expect(posted).toEqual(['Machete has left the game.']);
  });

  it('one long frame does not run a hold out: the hold takes several frames', () => {
    const { l, posted } = lines();
    l.left(held(2, 'Machete'));
    l.frame(HOLD * 10);                                  // a hitch between the room's `left` and its `joined`
    expect(posted).toEqual([]);
    l.joined(seat(2, 'Machete'), ON);
    expect(posted).toEqual([]);
  });
});

describe('JOIN-LEAVE-LINE: only a join into a match that has begun', () => {
  it('a join before the match starts posts nothing: he was in the game when it began', () => {
    const { l, posted, run } = lines();
    l.joined(seat(2, 'Machete'), WAITING);
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a leave before the match starts still posts', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    run(HOLD * 2);
    expect(posted).toEqual(['Machete has left the game.']);
  });

  it('a team switch before the match starts posts nothing, as during one', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.joined(seat(2, 'Machete'), WAITING);
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('another player on a leaver\'s id before the match starts: the leave posts, the join does not', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.joined(seat(2, 'Vandal'), WAITING);
    run(HOLD * 4);
    expect(posted).toEqual(['Machete has left the game.']);
  });
});

describe('JOIN-LEAVE-LINE: a seat moved is no join and no leave', () => {
  it('SWITCH TEAMS: `left` then `joined` for the same seat posts nothing, then or later', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.joined(seat(2, 'Machete'), ON);
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a trade and "Alternate teams": every `left` first, then every `joined` -- nothing', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete')); l.left(held(3, 'Wardog')); l.left(held(4, 'Sabre'));
    run(FRAME * 3);                                      // a few frames between the two runs of messages
    l.joined(seat(2, 'Machete'), ON); l.joined(seat(3, 'Wardog'), ON); l.joined(seat(4, 'Sabre'), ON);
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('another player on the leaver\'s id inside the hold is a leave and a join, in that order', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.joined(seat(2, 'Vandal'), ON);                         // the room hands a freed id to the next seat
    expect(posted).toEqual(['Machete has left the game.', 'Vandal has joined the game.']);
    run(HOLD * 4);
    expect(posted).toHaveLength(2);
  });

  it('a seat that left and came back after the hold is a leave, then a join', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    run(HOLD * 2);
    l.joined(seat(2, 'Machete'), ON);
    expect(posted).toEqual(['Machete has left the game.', 'Machete has joined the game.']);
  });
});

describe('JOIN-LEAVE-LINE: who gets no line', () => {
  it('a CPU player: neither its join nor its leave', () => {
    const { l, posted, run } = lines();
    l.joined(seat(5, 'JESTER', { bot: true }), ON);
    l.left(held(5, 'JESTER', { bot: true }));
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a CPU player seated on a leaver\'s id inside the hold: the leaver\'s line still posts, the CPU\'s never', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.joined(seat(2, 'Machete', { bot: true }), ON);         // even under the leaver's name
    expect(posted).toEqual(['Machete has left the game.']);
    run(HOLD * 4);
    expect(posted).toHaveLength(1);
  });

  it('the page\'s own seat', () => {
    const { l, posted, run } = lines();
    l.joined(seat(1, 'Tester', { self: true }), ON);
    l.left(held(1, 'Tester', { self: true }));
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a `left` for a seat the page does not hold (a watcher\'s leave, the second `left` of a demotion)', () => {
    const { l, posted, run } = lines();
    l.left(seat(7, 'Watcher'));
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a `left` whose name the page never had', () => {
    const { l, posted, run } = lines();
    l.left(held(7, ''));
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });

  it('a `joined` for a seat the page already holds under that name', () => {
    const { l, posted } = lines();
    l.joined(held(2, 'Machete'), ON);
    expect(posted).toEqual([]);
  });

  it('a new welcome drops the held leaves: its roster replaces the page\'s', () => {
    const { l, posted, run } = lines();
    l.left(held(2, 'Machete'));
    l.clear();
    run(HOLD * 4);
    expect(posted).toEqual([]);
  });
});

function memory(): { settings: Settings; data: Map<string, string> } {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  return { settings: new Settings(() => storage as unknown as Storage, { report: () => {} } as never), data };
}

// PRS-888 (product track, a browser adaptation): the lines are a This-browser setting (s2u.viewer.joinLeaveLine), ON by
// default -- the owner's ruling (tracker D7, 2026-11-24 08:13Z: "Yes, on by default"); the original posts no such line,
// so Off is the game's own behaviour and stays one press away (modelled on `../src/rangeReadout`).
describe('JOIN-LEAVE-LINE: a browser setting (s2u.viewer.joinLeaveLine), on by default (the owner, D7)', () => {
  it('the key is one of the page keys; Off / On, On by default', () => {
    expect(JOIN_LEAVE_LINE_KEY).toBe('s2u.viewer.joinLeaveLine');
    expect(PAGE_SETTING_KEYS).toContain(JOIN_LEAVE_LINE_KEY);
    expect(JOIN_LEAVE_LINE_VALUES).toEqual(['off', 'on']);
    expect(JOIN_LEAVE_LINE_VALUES.map((v) => JOIN_LEAVE_LINE_WORDS[v])).toEqual(['Off', 'On']);
    expect(JOIN_LEAVE_LINE_DEFAULT_ADAPTATION).toBe('on');
  });

  it('reads On unset or unknown, and what was saved', () => {
    const { settings, data } = memory();
    expect(readJoinLeaveLine(settings)).toBe('on');
    data.set(JOIN_LEAVE_LINE_KEY, 'bogus');
    expect(readJoinLeaveLine(settings)).toBe('on');
    saveJoinLeaveLine('off', settings);
    expect(data.get(JOIN_LEAVE_LINE_KEY)).toBe('off');
    expect(readJoinLeaveLine(settings)).toBe('off');
  });

  it('is labelled a browser adaptation, on by the owner ruling though the original posts no such line', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../src/joinLeaveLine.ts'), 'utf8');
    expect(doc).toMatch(/BROWSER ADAPTATION/);
    expect(doc).toContain('MATCH_ABORT_OTHERS_READING');
    expect(doc).toMatch(/ON by default/);
    expect(doc).toMatch(/D7/);
  });

  it('both pages read it at the mount into the net page\'s deps', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
      expect(text, f).toContain("joinLeaveLines: readJoinLeaveLine() === 'on',");
    }
  });
});
