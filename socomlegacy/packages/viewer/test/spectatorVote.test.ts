// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MESSAGE_SCALE } from '../src/hud';
import { SPECTATORS_EJECTED_TEXT, SPECTATOR_VOTE_FORMATS } from '../src/net/protocol';
import {
  SPECTATOR_LINE_COLOUR, SPECTATORS_ROOT_TEXT, spectatorEntries, spectatorVoteLine, TEAM_VOTE_FORMAT, teamVoteLine, VOTE_ALL_LABELS, VOTE_ALL_ROW, VoteAllToggle,
} from '../src/spectatorVote';
import { ROOT_HELP, ROOT_ORDER, ROOTS, SPECTATORS_ROOT } from '../src/tauntMenu';

/**
 * SVC-23f (research 264 §4.3): the page's half of VOTE ALL at the reading level -- the TCM's SPECTATORS root and its VOTE
 * ALL row (`FUN_00232bc0` D:L83632-83633, `FUN_0022f210` D:L81282-81310, `FUN_0022f0f0` D:L81252-81280) and the two
 * message-window lines (`FUN_002b9bd0` D:L159591-159601, `FUN_002b9d80` D:L159625, drawn by `FUN_002b6530` in colour 2
 * past the leading spaces). The strings are the ELF's (S:0x3e63e0, 0x3e63f0, 0x3e6410, 0x3e6420, 0x3e5cc0, 0x3e5cb0).
 */

/** A page's net client as the part holds it: its seat id (the server reuses ids across matches, `server.ts`). */
const client = (id = 2) => ({ id });
const SEAT = client();
const rows = (spectators: number, toggle = new VoteAllToggle(), seat: object = SEAT) => {
  const sent: { type: 'voteAll'; on: boolean }[] = [];
  return { sent, toggle, entries: () => spectatorEntries({ spectators, client: seat, toggle, send: (e) => { sent.push(e); } }) };
};

describe('the TCM\'s SPECTATORS (S:0x3e63e0) > VOTE ALL ON:OFF (S:0x3e6410)', () => {
  it('the root sits between TEAMMATES and MESSAGES in the tree\'s order, with the ELF\'s caption and help', () => {
    expect(ROOT_ORDER.map((r) => ROOTS[r])).toEqual(['TACTICAL ORDERS', 'TAUNTS', 'RADIO', 'TEAMMATES', 'SPECTATORS', 'MESSAGES']);
    expect([ROOTS[SPECTATORS_ROOT], ROOT_HELP[SPECTATORS_ROOT]]).toEqual([SPECTATORS_ROOT_TEXT.label, SPECTATORS_ROOT_TEXT.help]);
    expect(SPECTATORS_ROOT_TEXT).toEqual({ label: 'SPECTATORS', help: 'Spectator controls' });
    expect(VOTE_ALL_ROW).toEqual({ caption: 'VOTE ALL ON:OFF', help: 'Vote to Retain or Remove all players' });
  });

  it('no spectator present: no row (FUN_0022f210 returns 1, the root not drawn); one or more: VOTE ALL REMOVE with its help', () => {
    expect(rows(0).entries()).toEqual([]);
    const [row] = rows(2).entries();
    expect([row?.label, row?.help, row?.key, typeof row?.action]).toEqual([VOTE_ALL_LABELS.off, 'Vote to Retain or Remove all players', 'voteAll', 'function']);
    expect(VOTE_ALL_LABELS).toEqual({ off: 'VOTE ALL REMOVE', on: 'VOTE ALL RETAIN' });
  });

  it('a press flips the toggle and sends voteAll with the new state; the label follows it (REMOVE off, RETAIN on)', () => {
    const r = rows(1);
    r.entries()[0]!.action!();
    expect([r.sent, r.entries()[0]!.label]).toEqual([[{ type: 'voteAll', on: true }], 'VOTE ALL RETAIN']);
    r.entries()[0]!.action!();
    expect([r.sent, r.entries()[0]!.label]).toEqual([[{ type: 'voteAll', on: true }, { type: 'voteAll', on: false }], 'VOTE ALL REMOVE']);
  });

  it('the toggle is cleared with the TCM (FUN_0022f3b0; FUN_001fbae0 D:L57780-57781) and is the client\'s: a new client starts off, even with the same seat id', () => {
    const toggle = new VoteAllToggle();
    rows(1, toggle).entries()[0]!.action!();
    expect(toggle.state(SEAT)).toBe(true);
    const next = client(SEAT.id);                                  // the next match's client, the server's id reused
    expect([toggle.state(next), rows(1, toggle, next).entries()[0]!.label]).toEqual([false, 'VOTE ALL REMOVE']);
    toggle.reset();
    expect(toggle.state(SEAT)).toBe(false);
  });
});

describe('the message window\'s two lines (FUN_002b9bd0, FUN_002b9d80)', () => {
  const style = { scale: MESSAGE_SCALE, rgb: [0.5, 0.5, 0.75], opacity: 100 / 128 };

  it('the team vote\'s line: "Voting: You have %d votes against you." (S:0x3f26c0, FUN_002ba040 D:L159765-159766), colour 2 too', () => {
    expect(TEAM_VOTE_FORMAT).toBe('Voting: You have %d votes against you.');
    expect(teamVoteLine({ type: 'votes', count: 3 })).toEqual([{ text: 'Voting: You have 3 votes against you.', ...style }]);
  });

  it('spectatorVote: the ELF\'s format with the name and the votes standing, its leading space not drawn (FUN_002b6530 D:L157930), colour 2', () => {
    expect(SPECTATOR_LINE_COLOUR).toEqual({ rgb: [64 / 128, 64 / 128, 96 / 128], opacity: 100 / 128 });
    expect(spectatorVoteLine({ type: 'spectatorVote', name: 'kilo', against: true, count: 3 }))
      .toEqual([{ text: 'kilo voting against spectators: 3 votes against.', ...style }]);
    expect(spectatorVoteLine({ type: 'spectatorVote', name: 'kilo', against: false, count: 2 }))
      .toEqual([{ text: 'kilo voting for spectators: 2 votes against.', ...style }]);
    // The protocol's formats keep the ELF's leading space; only the drawing skips it.
    expect([SPECTATOR_VOTE_FORMATS.against[0], SPECTATOR_VOTE_FORMATS.for[0]]).toEqual([' ', ' ']);
  });

  it('spectatorsEjected: "Spectators EJECTED from this game." (S:0x3f2650), colour 2; one line per event', () => {
    expect(spectatorVoteLine({ type: 'spectatorsEjected' })).toEqual([{ text: SPECTATORS_EJECTED_TEXT, ...style }]);
    expect(SPECTATORS_EJECTED_TEXT).toBe('Spectators EJECTED from this game.');
    const lines = [{ type: 'spectatorVote', name: 'a', against: true, count: 5 }, { type: 'spectatorsEjected' }, { type: 'spectatorsEjected' }] as const;
    expect(lines.map((e) => spectatorVoteLine(e)[0]!.text)).toEqual(['a voting against spectators: 5 votes against.', SPECTATORS_EJECTED_TEXT, SPECTATORS_EJECTED_TEXT]);
  });
});
