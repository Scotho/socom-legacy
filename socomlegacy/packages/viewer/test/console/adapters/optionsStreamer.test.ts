// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liveOptions, STREAMER_DETAILS_ROW, STREAMER_MODE_ROW } from '../../../src/console/adapters/options';
import { resetStreamerCache, setStreamerMode, STREAMER_KEYS, streamerModeOn } from '../../../src/streamerMode';

/**
 * STREAMER-P1 slice 1 (product track, a browser adaptation; the scope's s2 and s4.6): OPTIONS > Communication > This
 * browser carries the master row "Streamer mode" after the microphone's rows; its sub-rows show only while it is On.
 * Slice 1's sub-row is "Room and account details" (voice and chat come with slice 2).
 */
beforeEach(() => { localStorage.clear(); resetStreamerCache(); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); });

const make = () => liveOptions(() => {}, { signedIn: () => false, pads: () => [], touch: () => false });
const comm = (o: ReturnType<typeof make>) => o.categories().find((c) => c.id === 'communication')!.rows;

describe('STREAMER-P1: the Communication rows', () => {
  it('Off: the master row follows Microphone, Off by default, no sub-row shown; its help says what it hides and its limits', () => {
    const o = make();
    const ids = comm(o).map((r) => r.id);
    expect(ids.slice(-3)).toEqual(['mic-on', 'mic-device', STREAMER_MODE_ROW]);
    expect(ids).not.toContain(STREAMER_DETAILS_ROW);
    const row = comm(o).find((r) => r.id === STREAMER_MODE_ROW)!;
    expect(row).toMatchObject({ label: 'Streamer mode', values: ['Off', 'On'], def: 0 });
    expect(o.value(STREAMER_MODE_ROW)).toBe(0);
    expect(row.about).toMatch(/this browser/i);
    expect(row.about).toMatch(/OBS/);
    expect(row.about).toMatch(/still see your name/i);
    expect(row.about).toMatch(/Ctrl\+Shift\+S/);
    expect(row.about).toMatch(/taken out of the address bar/i);   // slice 1b (`../../../src/inviteAddressHold`)
    expect(row.about).toMatch(/reload/i);                         // what the hold costs: a reload has no invite
    expect(row.note).toMatch(/this browser/i);
  });

  it('On writes the preset: Room and account details shows, Hidden; it round-trips; Off hides it and restores the row', () => {
    const o = make();
    o.set(STREAMER_MODE_ROW, 1);
    expect(localStorage.getItem(STREAMER_KEYS.on)).toBe('on');
    const details = comm(o).find((r) => r.id === STREAMER_DETAILS_ROW)!;
    expect(details).toMatchObject({ label: 'Room and account details', values: ['Shown', 'Hidden'], def: 0 });
    expect(details.about).toMatch(/password/i);
    expect(details.about).toMatch(/taken out of the address bar/i);
    expect(o.value(STREAMER_DETAILS_ROW)).toBe(1);
    o.set(STREAMER_DETAILS_ROW, 0);
    expect(localStorage.getItem(STREAMER_KEYS.details)).toBe('shown');
    o.reset(STREAMER_DETAILS_ROW);
    expect(localStorage.getItem(STREAMER_KEYS.details)).toBe('shown');
    o.set(STREAMER_MODE_ROW, 0);
    expect(streamerModeOn()).toBe(false);
    expect(comm(o).map((r) => r.id)).not.toContain(STREAMER_DETAILS_ROW);
    expect(localStorage.getItem(STREAMER_KEYS.details)).toBe('shown');   // restored to what it was before On (unset: Shown)
  });

  it('the hotkey\'s change is what the row reads', () => {
    const o = make();
    setStreamerMode(true);
    expect(o.value(STREAMER_MODE_ROW)).toBe(1);
  });
});
