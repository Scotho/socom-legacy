import { describe, expect, it } from 'vitest';
import { KBM_PAGES, kbmAllowed, testroomKbmPage } from '../src/kbmScope';

/**
 * RB-1 (the replay batch, RB.R4; OT.R114): keyboard and mouse are allowed in the test room and the Forge where no online
 * room is joined -- the match client absent, `'loopback:'` or `'replay:'` -- and refused for any server URL. A browser
 * adaptation (product track); it changes nothing the game does.
 */
describe('RB-1: kbmAllowed(page, clientUrl)', () => {
  it('the test room and the Forge with no client, a loopback client or a replay client: allowed', () => {
    for (const page of ['testroom', 'forge'] as const) {
      expect(kbmAllowed(page, undefined), page).toBe(true);
      expect(kbmAllowed(page, null), page).toBe(true);
      expect(kbmAllowed(page, 'loopback:'), page).toBe(true);
      expect(kbmAllowed(page, 'replay:'), page).toBe(true);
    }
  });

  it('any server URL: refused, on both pages', () => {
    for (const page of ['testroom', 'forge'] as const) {
      expect(kbmAllowed(page, 'wss://play.example.test/room/1'), page).toBe(false);
      expect(kbmAllowed(page, 'ws://127.0.0.1:5303'), page).toBe(false);
      expect(kbmAllowed(page, 'https://example.test/'), page).toBe(false);
      expect(kbmAllowed(page, ''), page).toBe(false);                 // an empty URL is not an absent client
      expect(kbmAllowed(page, 'loopback:x'), page).toBe(false);       // the exact scheme only (`matchMount.ts`'s test)
      expect(kbmAllowed(page, 'LOOPBACK:'), page).toBe(false);
    }
  });

  it('every other page stays controller-only, whatever its client', () => {
    for (const page of ['launcher', 'match'] as const) {
      expect(kbmAllowed(page, undefined), page).toBe(false);
      expect(kbmAllowed(page, 'loopback:'), page).toBe(false);
      expect(kbmAllowed(page, 'replay:'), page).toBe(false);
      expect(kbmAllowed(page, 'wss://play.example.test/'), page).toBe(false);
    }
  });

  it("RPM-2: the test room framed as the launcher's replay world asks as the launcher -- controller-only, whatever its client", () => {
    // `?replayview` (MU-11, `./modern/replays/worldHost`): the launcher's Replays viewer frames the test room as its world,
    // and that frame is the launcher's page (OT.R29), not OT.R114's test room. Its recording's client is 'replay:', so
    // asking as the test room let a release frame take the pointer lock on a click and the backtick's test-room chrome.
    expect(testroomKbmPage(true)).toBe('launcher');
    for (const url of [undefined, null, 'replay:', 'loopback:', 'wss://play.example.test/']) {
      expect(kbmAllowed(testroomKbmPage(true), url), String(url)).toBe(false);
    }
    // The test room itself, playing a recording or offline: still allowed (RB-1).
    expect(testroomKbmPage(false)).toBe('testroom');
    for (const url of [undefined, null, 'replay:', 'loopback:']) expect(kbmAllowed(testroomKbmPage(false), url), String(url)).toBe(true);
  });

  it('the pages are the two OT.R114 names', () => {
    expect([...KBM_PAGES]).toEqual(['testroom', 'forge']);
  });
});
