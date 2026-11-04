import { describe, expect, it } from 'vitest';
import * as page from '../src/voice/voiceReport';
import * as bounds from '../../match/src/reportBounds';
import { pinnedGameDoor, pinnedMatchSocket, voiceReportSocket } from '../src/connectHost';

/**
 * SA-7d VOICE-REPORT-DOOR (the server split; a playtest instrument with no original, VOICE_REPORT_ADAPTATION): a placed
 * game's voice report goes to its door's game path (`/g/<id>/dev/voice-report`), the door forwarding it to the game's
 * process; the URL comes only from the seat's `PinnedGameDoor` (made by parsing central's answer), never from anywhere
 * else. The report's path and body bound are match's (`match/src/reportBounds.ts`), the page re-exporting them.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };

describe('SA-7d: the voice report through a placed game\'s door', () => {
  it('the path and the body bound are match\'s, one source (the page re-exports the same bindings)', () => {
    expect(page.VOICE_REPORT_PATH).toBe(bounds.VOICE_REPORT_PATH);
    expect(page.VOICE_REPORT_BODY_MAX_BYTES).toBe(bounds.VOICE_REPORT_BODY_MAX_BYTES);
    expect([bounds.VOICE_REPORT_PATH, bounds.VOICE_REPORT_BODY_MAX_BYTES]).toEqual(['/dev/voice-report', 4096]);
  });

  it('voiceReportUrl keeps a door\'s game path; any other socket URL reports at its host, as before', () => {
    expect(page.voiceReportUrl('wss://firehuge.play.socom2legacy.com/g/7')).toBe('https://firehuge.play.socom2legacy.com/g/7/dev/voice-report');
    expect(page.voiceReportUrl('ws://127.0.0.1:5343/g/12')).toBe('http://127.0.0.1:5343/g/12/dev/voice-report');
    expect(page.voiceReportUrl('ws://127.0.0.1:8787/ws?x=1')).toBe('http://127.0.0.1:8787/dev/voice-report');
    expect(page.voiceReportUrl('wss://site.test/ws')).toBe('https://site.test/dev/voice-report');
    expect(page.voiceReportUrl('wss://h.test/g/7/x')).toBe('https://h.test/dev/voice-report');   // not a door's game path: the host, as before
    expect(page.voiceReportUrl('https://h.test/g/7')).toBeNull();
  });

  it('voiceReportSocket: a placed seat reports to its pinned door; a local seat to its pinned socket', () => {
    const door = pinnedGameDoor('wss://firehuge.play.socom2legacy.com/g/7', 7, false)!;
    expect(voiceReportSocket({ pinned: door, token: 'a.b.c' })).toBe('wss://firehuge.play.socom2legacy.com/g/7');
    const local = pinnedMatchSocket('', LOC, false, false);
    expect(voiceReportSocket({ pinned: local, ticket: 't' })).toBe(local.url);
  });
});
