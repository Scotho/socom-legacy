import { afterEach, describe, expect, it } from 'vitest';
import type { CaptionSource } from '@s2u/ui';
import {
  NET_ENDING_TEXTS_ADAPTATION, clearNetEnding, netEndingLine, netEndingOf, netEndingPopupText, setNetEnding, withNetEndingLine, type NetEnding,
} from '../src/net/netEnding';

/**
 * LATER 359b, NET-RES-3 (product track; **an intended divergence under OT.R77**, the owner's word): a seat the server or
 * the network ends for good shows the original's #365 popup ("You have been disconnected from SOCOM Online.") on
 * `dlgNetError.rdr` -- the same popup, the same flow, `mp_net_errno` 32 kept -- with its text naming what ended it. The
 * texts are drafts for the owner (the net-resilience plan's Log), the main controller's copy. #528 (the game ended),
 * #539 (a vote kick) and #529 (ABORT) stay the original's; with no ending set #365 is the disc's own text.
 */
describe('NET-RES-3: the ending a close names', () => {
  it('each final close and the resume running out map to their own ending; 4007 and a plain close name none', () => {
    expect(netEndingOf(4005)).toBe('rate');
    expect(netEndingOf(4006)).toBe('replaced');
    expect(netEndingOf(4008)).toBe('seat-freed');
    expect(netEndingOf(1011)).toBe('room-failed');
    expect(netEndingOf(4022)).toBe('server-update');
    expect(netEndingOf(null, 'server closing')).toBe('server-update');
    expect(netEndingOf(null, 'resume')).toBe('lost');
    expect(netEndingOf(null, 'kicked for inactivity')).toBe('idle');
    expect(netEndingOf(4007)).toBeNull();                         // #528, the original's
    expect(netEndingOf(1000)).toBeNull();
    expect(netEndingOf(null)).toBeNull();
  });

  it("the texts: the main controller's copy (2026-11-18), drafts for the owner", () => {
    expect(NET_ENDING_TEXTS_ADAPTATION).toEqual({
      lost: 'Your connection was lost and could not be restored in time.',
      rate: 'Disconnected: your connection fell too far behind to catch up.',
      replaced: 'This game was opened in another window.',
      'seat-freed': 'Your seat in this game was released.',
      removed: 'You were removed from this game.',
      'room-failed': 'The game server ran into a problem and closed this game.',
      'server-update': 'The game server is restarting for an update.',
      idle: 'Disconnected for inactivity.',
    } satisfies Record<NetEnding, string>);
  });
});

describe("NET-RES-3: #365's text while an ending is set, the disc's otherwise", () => {
  afterEach(() => { clearNetEnding(); });
  const disc: CaptionSource = {
    caption: (c) => (c === '#365' ? { kind: 'loc', id: 365, table: 'UIMnLOC', text: 'You have been disconnected from SOCOM Online.' } : { kind: 'literal', text: c }),
    command: ({ loc }) => ({ kind: 'loc', id: loc, table: 'UIMnLOC', text: loc === 365 ? 'You have been disconnected from SOCOM Online.' : `text ${loc}` }),
  };

  it('no ending: every id and caption as the disc gives it', () => {
    const c = withNetEndingLine(disc);
    expect(netEndingLine()).toBeNull();
    expect(c.command!({ loc: 365, arg: '' })).toEqual(disc.command!({ loc: 365, arg: '' }));
    expect(c.caption('#365')).toEqual(disc.caption('#365'));
  });

  it("an ending set: #365 (the popup's id, and the `#365` caption) answers its text; every other id is the disc's", () => {
    const c = withNetEndingLine(disc);
    setNetEnding('rate');
    expect(netEndingLine()).toBe(NET_ENDING_TEXTS_ADAPTATION.rate);
    expect(c.command!({ loc: 365, arg: '' })).toEqual({ kind: 'loc', id: 365, table: 'UIMnLOC', text: NET_ENDING_TEXTS_ADAPTATION.rate });
    expect(c.caption('#365')).toEqual({ kind: 'loc', id: 365, table: 'UIMnLOC', text: NET_ENDING_TEXTS_ADAPTATION.rate });
    expect(c.command!({ loc: 528, arg: '' })).toEqual(disc.command!({ loc: 528, arg: '' }));   // the game ended: the original's
    expect(c.command!({ loc: 539, arg: '' })).toEqual(disc.command!({ loc: 539, arg: '' }));
    expect(c.caption('PLAIN')).toEqual({ kind: 'literal', text: 'PLAIN' });
    setNetEnding(null);
    expect(c.command!({ loc: 365, arg: '' })).toEqual(disc.command!({ loc: 365, arg: '' }));
  });

  it("the review's F1 (the controller's (A)): in a match the errno-32 popup is the record named 'You' on dlgNetError.rdr -- it takes the line while an ending is set, nothing else does", () => {
    expect(netEndingPopupText('You', 'dlgNetError.rdr')).toBeNull();      // no ending: the original's 'You'
    setNetEnding('lost');
    expect(netEndingPopupText('You', 'dlgNetError.rdr')).toBe(NET_ENDING_TEXTS_ADAPTATION.lost);
    expect(netEndingPopupText('You', 'dlgNetAbort.rdr')).toBeNull();      // ABORT's popup: the original's
    expect(netEndingPopupText('INPUT_STRING', 'dlgNetError.rdr')).toBeNull();
    expect(netEndingPopupText('You', null)).toBeNull();
  });

  it('a source with no `command` keeps none (no texts there before), and a null source stays null', () => {
    const bare: CaptionSource = { caption: disc.caption };
    expect(withNetEndingLine(bare).command).toBeUndefined();
    expect(withNetEndingLine(null)).toBeNull();
  });
});
