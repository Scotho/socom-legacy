/**
 * The voice report's route and body bound (VOICE-LATE-3, research 226 §3.3; `VOICE_REPORT_ADAPTATION`, a playtest
 * instrument with no original): the match process's `POST /dev/voice-report` (`server.ts`), the door that forwards a placed
 * game's report to it (`host/src/door.ts`, SA-7d) and the page that posts it (`viewer/src/voice/voiceReport.ts`, which
 * re-exports both) read them here -- one source, in `match`, imported by nothing but constants (a leaf the page's bundle
 * can load: no Node module).
 */

/** The report's route on the server a page's socket names (and, behind a host's door, under the game's path). */
export const VOICE_REPORT_PATH = '/dev/voice-report';

/**
 * The largest body the server reads, bytes. VOICE-LATE-3's shape was about 500 in 2 048; VOICE-LATE-4's, every field at
 * its bound (the user agent's `VOICE_REPORT_AGENT_MAX_CHARS`, `VOICE_REPORT_BRANDS_MAX` brands), is about 2 430 -- held
 * by `viewer/test/voiceLate4.test.ts`. An instrument's bound.
 */
export const VOICE_REPORT_BODY_MAX_BYTES = 4096;

/**
 * LATER 62 (CLOSE_REPORT_ADAPTATION, a development and playtest instrument with no original): the close report's route on
 * the server a page's socket named (and, behind a host's door, under the game's path), read by the match process
 * (`server.ts`), the door that forwards a placed game's (`host/src/door.ts`) and the page (`viewer/src/net/closeReport.ts`).
 */
export const CLOSE_REPORT_PATH = '/dev/close-report';

/** The largest close report body the server and the door read, bytes: its fixed shape at every bound is about 250. */
export const CLOSE_REPORT_BODY_MAX_BYTES = 512;
