// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chatShows } from '@s2u/ui';
import { liveOptions, STREAMER_CHAT_IN_ROW, STREAMER_DETAILS_ROW, STREAMER_MODE_ROW, STREAMER_MY_VOICE_ROW, STREAMER_VOICE_IN_ROW } from '../src/console/adapters/options';
import { ROUND_LINE_KIND, roundQueueLine } from '../src/roundChat';
import { resetStreamerCache, saveStreamerRow, setSocialLookup, setStreamerMode, streamerChatShows } from '../src/streamerMode';

/**
 * STREAMER-P1 slice 2 (product track, a browser adaptation; the scope's s2 and s3.3): Chat from others -- the one rule
 * (`streamerChatShows`), the ui package's filter set from it, the round's drain -- and the Communication sub-rows.
 */
beforeEach(() => { localStorage.clear(); resetStreamerCache(); setSocialLookup(null); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); setSocialLookup(null); });

describe('STREAMER-P1: Chat from others', () => {
  it('Off: every line shows, here and through the ui package\'s filter', () => {
    expect(streamerChatShows('lobby', { name: 'stranger' })).toBe(true);
    expect(chatShows('lobby', { name: 'stranger' })).toBe(true);
  });
  it('the preset (Matches + friends & clan): a lobby stranger hidden, a friend shown; a match shows everyone', () => {
    setStreamerMode(true);
    setSocialLookup((who) => who.name === 'pal' || who.accountId === 9);
    expect(chatShows('lobby', { name: 'stranger' })).toBe(false);
    expect(chatShows('lobby', { name: 'pal' })).toBe(true);
    expect(chatShows('lobby', { accountId: 9, name: 'renamed' })).toBe(true);
    expect(chatShows('match', { name: 'stranger' })).toBe(true);
  });
  it('the round\'s drain: under Friends & clan only a stranger\'s line is dropped; the player\'s own line and a friend\'s show', () => {
    setStreamerMode(true);
    saveStreamerRow('chatIn', 'friends');
    setSocialLookup((who) => who.name === 'pal');
    const o = { external: true, inRound: () => true };
    expect(roundQueueLine({ text: 'x: hi', name: 'stranger', kind: ROUND_LINE_KIND.universe }, o)).toBeNull();
    expect(roundQueueLine({ text: 'pal: hi', name: 'pal', kind: ROUND_LINE_KIND.whisper }, o)).not.toBeNull();
    expect(roundQueueLine({ text: 'me: hi', name: 'me', kind: ROUND_LINE_KIND.whisper, own: true }, o)).not.toBeNull();
    saveStreamerRow('chatIn', 'matches-friends');
    expect(roundQueueLine({ text: 'x: hi', name: 'stranger', kind: ROUND_LINE_KIND.universe }, o)).not.toBeNull();
  });
  it('the review’s F1: under the preset, a whisper or a universe line from someone NOT in the round is a lobby stranger’s: dropped', () => {
    setStreamerMode(true);
    const out = { external: true, inRound: (n: string) => n === 'teammate' };
    expect(roundQueueLine({ text: 'x: psst', name: 'outsider', kind: ROUND_LINE_KIND.whisper }, out)).toBeNull();
    expect(roundQueueLine({ text: 'x: all', name: 'outsider', kind: ROUND_LINE_KIND.universe }, out)).toBeNull();
    expect(roundQueueLine({ text: 't: hi', name: 'teammate', kind: ROUND_LINE_KIND.whisper }, out)).not.toBeNull();
  });
});

describe('STREAMER-P1: the Communication sub-rows', () => {
  const comm = (o: ReturnType<typeof liveOptions>) => o.categories().find((c) => c.id === 'communication')!.rows;
  it('On: Voice from others, My voice, Chat from others, Room and account details, in that order, at the preset; they round-trip', () => {
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
    expect(comm(o).map((r) => r.id)).not.toContain(STREAMER_VOICE_IN_ROW);
    o.set(STREAMER_MODE_ROW, 1);
    const ids = comm(o).map((r) => r.id);
    expect(ids.slice(ids.indexOf(STREAMER_MODE_ROW))).toEqual([STREAMER_MODE_ROW, STREAMER_VOICE_IN_ROW, STREAMER_MY_VOICE_ROW, STREAMER_CHAT_IN_ROW, STREAMER_DETAILS_ROW]);
    const row = (id: string) => comm(o).find((r) => r.id === id)!;
    expect(row(STREAMER_VOICE_IN_ROW)).toMatchObject({ label: 'Voice from others', values: ['Everyone', 'Matches + friends & clan', 'Friends & clan only', 'Off'], def: 0 });
    expect(row(STREAMER_MY_VOICE_ROW)).toMatchObject({ label: 'My voice', values: ['Everywhere', 'Matches only', 'Off'], def: 0 });
    expect(row(STREAMER_CHAT_IN_ROW)).toMatchObject({ label: 'Chat from others', values: ['Everyone', 'Matches + friends & clan', 'Friends & clan only', 'Off'], def: 0 });
    expect([o.value(STREAMER_VOICE_IN_ROW), o.value(STREAMER_MY_VOICE_ROW), o.value(STREAMER_CHAT_IN_ROW)]).toEqual([1, 1, 1]);
    for (const id of [STREAMER_VOICE_IN_ROW, STREAMER_MY_VOICE_ROW, STREAMER_CHAT_IN_ROW]) expect(row(id).about).toMatch(/this browser/i);
    expect(row(STREAMER_MY_VOICE_ROW).about).toMatch(/whole room/i);       // why it has no friends choice
    o.set(STREAMER_CHAT_IN_ROW, 3);
    expect(localStorage.getItem('s2u.viewer.streamer.chatIn')).toBe('off');
    o.set(STREAMER_MY_VOICE_ROW, 2);
    expect(localStorage.getItem('s2u.viewer.streamer.myVoice')).toBe('off');
    o.set(STREAMER_VOICE_IN_ROW, 2);
    expect(localStorage.getItem('s2u.viewer.streamer.voiceIn')).toBe('friends');
    o.dispose();
  });
});
