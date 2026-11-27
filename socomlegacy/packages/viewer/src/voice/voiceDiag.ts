/**
 * E15's field instrument (SCOPE-E E15, B-58 "in-game mics often not working / cannot take the mic"; LATER 1021, 1022;
 * `VOICE_DIAG_ADAPTATION`): **a browser adaptation with no original** -- a read of the voice client's own counts that
 * changes nothing the game does. The voice report (`./voiceReport`) and the counters (`./voiceCounters`) need `?devmode`
 * or a development build, so the field could not say why a player's mic "does not work": the first press waiting on
 * the microphone (LATER 1021), the talker's frames dropped stale on a slow page (LATER 1022), or the floor held by a
 * teammate (the original's one talker a channel, `match/src/voiceFloor.ts` -- parity, not a fault). Each voice session
 * with at least one talk press now tells the page's beacon one `voicediag` DIAGNOSTIC row at its end (`MatchVoice.dispose`):
 * the presses, the wait from the first press to the first frame sent, the frames sent and dropped stale, the floor asks
 * and those released without a grant, the headset's state, the codec's state and the capture's rate. No seat id, name,
 * account, audio or free text: every field is a number or one of a fixed set. At most `VOICE_DIAGS_PER_LOAD_ADAPTATION`
 * a load, inside the beacon's own diagnostic budget; never an error, so never counted in central's `/metrics`
 * (central `clientErrorsHttp.ts` `CLIENT_DIAG_KINDS`).
 */
export const VOICE_DIAG_ADAPTATION = "a voice session's talk told to the page's beacon as a voicediag diagnostic at its end, fixed fields only" as const;

/** The most `voicediag` rows a page load sends (a lobby's and a round's voice each a session; a few matches a load). */
export const VOICE_DIAGS_PER_LOAD_ADAPTATION = 4;

const HEADSETS = ['ok', 'refused', 'off', 'nocodec'] as const;
const CODECS = ['none', 'asking', 'ready', 'unsupported'] as const;

/** What the voice client tells at its session's end. */
export interface VoiceSessionDiag {
  /** Talk presses this session (each edge of the talk flag on). */
  presses: number;
  /** Milliseconds from the session's first press to its first voice frame sent; null when none was sent. */
  firstSendMs: number | null;
  /** Voice frames sent up. */
  sent: number;
  /** The talker's frames not sent, older than `VOICE_STALE_FRAME_MS_ADAPTATION` (`VoiceDropCounts.stale`). */
  stale: number;
  /** Floor asks sent (`voiceTalk {on}`). */
  asks: number;
  /** Of those, the asks let go with no grant of the floor heard after them. */
  ungranted: number;
  /** The headset as the session ended: usable, the microphone refused, the setup page's switch off, no WebCodecs Opus. */
  headset: (typeof HEADSETS)[number];
  /** The codec's state (`VoiceCodecState`). */
  codec: (typeof CODECS)[number];
  /** The capture context's rate, Hz; null when the capture never opened. */
  captureRate: number | null;
}

const oneOf = <T extends string>(set: readonly T[], v: unknown): T | 'other' => (typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : 'other');
/** A count: a whole number from 0, else 0. */
const count = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
/** A measure: a finite number from 0, rounded, else null. */
const measure = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** The diagnostic's message: v1 compact JSON of the fixed fields only, each checked against its set or form. */
export function voiceDiagMessage(d: VoiceSessionDiag): string {
  return JSON.stringify({
    v: 1, presses: count(d.presses), firstSendMs: measure(d.firstSendMs), sent: count(d.sent), stale: count(d.stale),
    asks: count(d.asks), ungranted: count(d.ungranted), headset: oneOf(HEADSETS, d.headset), codec: oneOf(CODECS, d.codec),
    captureRate: measure(d.captureRate),
  });
}

/** A reporter: `send` (the beacon's `reportDiag('voicediag', ...)`) called at most the cap; never throws. */
export function voiceDiagReporter(send: (message: string) => void): (d: VoiceSessionDiag) => void {
  let sent = 0;
  return (d) => {
    if (sent >= VOICE_DIAGS_PER_LOAD_ADAPTATION) return;
    sent++;
    try { send(voiceDiagMessage(d)); } catch { /* the instrument never adds an error */ }
  };
}

let page: ((d: VoiceSessionDiag) => void) | null = null;
/** The page's reporter, one a load (the cap is the load's): the voice client's default `diag`. */
export function pageVoiceDiag(d: VoiceSessionDiag): void {
  // the beacon imported at the tell, not with the voice module (the page's front end has it loaded already)
  page ??= voiceDiagReporter((m) => {
    void import('../clientErrorBeacon').then((b) => {
      try { b.pageClientErrorBeacon().reportDiag('voicediag', m); } catch { /* no beacon here (a worker, node): nothing */ }
    }).catch(() => undefined);                          // a rejected chunk (a navigation, offline): nothing to tell
  });
  page(d);
}
