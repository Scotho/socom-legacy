import { describe, expect, it } from 'vitest';
import {
  BAN_CONTACT_ADAPTATION, BAN_MONTHS_ADAPTATION, BAN_REASON_LINE_ADAPTATION, BAN_REASON_MAX_ADAPTATION, BANNED_PERMANENT_ADAPTATION,
  BANNED_SHORT_ADAPTATION, BANNED_UNTIL_ADAPTATION, PLAYER_BANNED_STATUS, banReasonLine, banSentence, banStamp, banWhen, banWords,
  classicBanText, localZoneOffset, shownBanOf,
} from '../../src/screens/banWords';
import * as ui from '../../src/index';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation -- a service ban has no original): the words a banned
 * player reads at sign-in, in one place so a rewording is one edit. The time is pinned with its zone offset (minutes
 * east of UTC) handed in, so no test reads the machine's zone. Every reason invented.
 */

/** 15 Nov 2026 02:30 UTC. */
const T = Date.UTC(2026, 10, 15, 2, 30);
const TAIL = 'To ask about it, contact the staff on the SOCOM II Legacy Discord.';

describe("OPS-A3: the ban's words", () => {
  it("the sentences, as the main controller accepted them (H464), and the community written exactly SOCOM II Legacy", () => {
    expect(PLAYER_BANNED_STATUS).toBe(-972);
    expect(BAN_CONTACT_ADAPTATION).toBe(TAIL);
    expect(BANNED_PERMANENT_ADAPTATION).toBe(`This account is banned. ${TAIL}`);
    expect(BANNED_UNTIL_ADAPTATION).toBe(`This account is banned until <when>. ${TAIL}`);
    expect(BANNED_SHORT_ADAPTATION).toBe('This account is banned.');
    expect(BAN_REASON_LINE_ADAPTATION).toBe('Reason: <reason>');
    expect(BAN_REASON_MAX_ADAPTATION).toBe(500);
    expect(BAN_MONTHS_ADAPTATION).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });

  it("reaches the viewer through @s2u/ui's index (lobbyClient re-exports the module)", () => {
    expect(ui.BANNED_PERMANENT_ADAPTATION).toBe(BANNED_PERMANENT_ADAPTATION);
    expect(ui.banWords).toBe(banWords);
  });

  it("a stamp is built from the Date's own fields: day without a leading zero, the month's fixed abbreviation, 24-hour time", () => {
    expect(banStamp(T)).toBe('15 Nov 2026 02:30');
    expect(banStamp(Date.UTC(2027, 0, 5, 23, 59, 59))).toBe('5 Jan 2027 23:59');
    expect(banStamp(Date.UTC(2026, 8, 1, 0, 0))).toBe('1 Sep 2026 00:00');
  });

  it("the when: local then UTC; a negative offset crossing midnight back a day; a positive one crossing into a new year", () => {
    expect(banWhen(T, -300)).toBe('14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC)');
    expect(banWhen(Date.UTC(2026, 11, 31, 22, 0), 120)).toBe('1 Jan 2027 00:00 (31 Dec 2026 22:00 UTC)');
    expect(banWhen(T, 330)).toBe('15 Nov 2026 08:00 (15 Nov 2026 02:30 UTC)');
    expect(banWhen(T, 0)).toBe('15 Nov 2026 02:30 (15 Nov 2026 02:30 UTC)');
  });

  it("the when where the zone cannot be computed: UTC alone", () => {
    expect(banWhen(T, null)).toBe('15 Nov 2026 02:30 UTC');
    expect(banWhen(T, Number.NaN)).toBe('15 Nov 2026 02:30 UTC');
  });

  it("the sentence: permanent for until null, for no ban, and for a ban out of shape; timed with the when", () => {
    const zone = (): number => -300;
    expect(banSentence({ until: null }, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
    expect(banSentence(null, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
    expect(banSentence({ until: T }, zone)).toBe(`This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). ${TAIL}`);
    expect(banSentence({ until: T }, () => null)).toBe(`This account is banned until 15 Nov 2026 02:30 UTC. ${TAIL}`);
  });

  it("the zone is asked at the ban's own end (a DST change between now and then is the end's offset)", () => {
    const asked: number[] = [];
    banSentence({ until: T }, (at) => { asked.push(at); return 60; });
    expect(asked).toEqual([T]);
    expect(localZoneOffset(T)).toBe(-new Date(T).getTimezoneOffset());
  });

  it("the reply's ban read: until a number or null, reason a string; anything else is no ban (the permanent words)", () => {
    expect(shownBanOf({ until: null })).toEqual({ until: null });
    expect(shownBanOf({ until: T, reason: 'invented' })).toEqual({ until: T, reason: 'invented' });
    expect(shownBanOf({ until: T, reason: 7 })).toEqual({ until: T });
    for (const bad of [undefined, null, 'x', 5, [], {}, { until: 'soon' }, { until: Number.POSITIVE_INFINITY }, { until: 9e15 }]) {
      expect(shownBanOf(bad)).toBeNull();
    }
  });

  it("the reason line only when the reason is present, cut at 500 characters, never altered (<b> and & stay as they are)", () => {
    expect(banReasonLine({ until: null })).toBeNull();
    expect(banReasonLine({ until: null, reason: '' })).toBeNull();
    expect(banReasonLine({ until: null, reason: '   ' })).toBeNull();
    expect(banReasonLine(null)).toBeNull();
    expect(banReasonLine({ until: null, reason: 'spam <b>bold</b> & more' })).toBe('Reason: spam <b>bold</b> & more');
    expect(banReasonLine({ until: null, reason: 'cost $& and $1' })).toBe('Reason: cost $& and $1');
    const long = 'x'.repeat(600);
    expect(banReasonLine({ until: null, reason: long })).toBe(`Reason: ${'x'.repeat(500)}`);
    const astral = '\u{1F600}'.repeat(501);
    expect(banReasonLine({ until: null, reason: astral })).toBe(`Reason: ${'\u{1F600}'.repeat(500)}`);
  });

  it("the words: the sentence, then the reason on its own line when present", () => {
    const zone = (): number => -300;
    expect(banWords({ until: null }, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
    expect(banWords({ until: null, reason: 'invented <b>&' }, zone)).toBe(`${BANNED_PERMANENT_ADAPTATION}\nReason: invented <b>&`);
    expect(banWords({ until: T, reason: 'r' }, zone)).toBe(`This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). ${TAIL}\nReason: r`);
    expect(banWords(null, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
  });

  it("a reason holding the popup's codes, markup, an entity and line breaks comes out literally, its whitespace runs one space", () => {
    const zone = (): number => -300;
    const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);     // the line and paragraph separators
    const reason = `aim #C1 bot #B\n\nThis account is unbanned.\r\n\t<b>x</b> &amp; ${LS}y`;
    const line = 'Reason: aim #C1 bot #B This account is unbanned. <b>x</b> &amp; y';
    expect(banReasonLine({ until: null, reason })).toBe(line);
    const words = banWords({ until: null, reason }, zone);
    expect(words).toBe(`${BANNED_PERMANENT_ADAPTATION}\n${line}`);
    // two lines only: the sentence and the reason's own -- the reason cannot start a third that reads as the game's words
    expect(words.split(new RegExp(`[\\n\\r${LS}${PS}]`))).toEqual([BANNED_PERMANENT_ADAPTATION, line]);
    expect(banReasonLine({ until: null, reason: '  edge  ' })).toBe('Reason: edge');
  });

  it("the classic dialog's text for a ban with a public reason holds no part of the reason", () => {
    const zone = (): number => -300;
    const parts = ['ZULUWORD', '#C1', '#B', 'QUEBECWORD'];
    for (const until of [null, T]) {
      const text = classicBanText({ until, reason: parts.join(' ') }, zone);
      for (const p of parts) expect(text, `${String(until)} ${p}`).not.toContain(p);
      expect(text).not.toContain('Reason');
    }
  });

  it("the classic dialog's text: the sentence with its date, never the reason", () => {
    const zone = (): number => -300;
    expect(classicBanText({ until: null, reason: 'invented' }, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
    expect(classicBanText({ until: T, reason: 'invented' }, zone)).toBe(banSentence({ until: T }, zone));
    expect(classicBanText(null, zone)).toBe(BANNED_PERMANENT_ADAPTATION);
  });
});
