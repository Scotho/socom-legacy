import { devSwitches } from '../source';
import type { VoiceDropCounts, VoiceTraceEntry } from './voiceClient';

/**
 * VOICE-LATE-2 (1), web sprint 18 (the owner's H190 test, 2026-10-12; research 226 §3.2, §6): the page's voice counters
 * on the owner's screen during a two-account test -- the voice client's drops by why (`VoiceDropCounts`: `stale`,
 * `backlog`, `suspended`, `late`, `ahead`), `heard`, `sent`, and arrival-to-decoded (min / median / max, ms, over the
 * frames decoded in the last `VOICE_LOG_PERIOD_MS`, read off the client's development-build trace `VoiceTraceEntry`).
 *
 * **A browser adaptation with no original -- a playtest instrument** (`VOICE_COUNTERS_ADAPTATION`): the console's voice
 * had no buffer to drop from and no counter to show (research 170 §6.1). It is a read of the voice client's state and
 * changes nothing the game does. The voice client (`./voiceClient` `mountVoice`) attaches it only under a literal
 * `import.meta.env.DEV`, which every `vite build` folds to false and drops with this module (OT.R29's shape, as
 * `../keyboardTesting` and `../devSeen` are), and the page's panel only with the page's `?devmode` (`../source`
 * `devMode`), the switch the page's other dev overlays take (`../playtestReport`). Each voice client has its own -- the
 * game lobby's (`../gameLobbyHost` `GameLobbyVoice`, the pre-match lobby) and the round's (`../matchMount`, `/testroom`'s
 * `../main`) -- shown while it is mounted and removed at its `dispose`, so the lobby's goes at the match's hand-off and
 * the round's comes with the round.
 */
export const VOICE_COUNTERS_ADAPTATION = "the page's voice counters on screen: a playtest instrument with no original; a development build's with ?devmode only" as const;

/** The panel's `data-s2u` attribute: what a page check finds (and a release build lacks). */
export const VOICE_COUNTERS_MARKER = 's2u-dev-voice-counters';

/** Arrival-to-decoded over a window, ms. */
export interface ArrivalStats { n: number; min: number; median: number; max: number }

/**
 * The frames decoded within `windowMs` before `now` (the client's clock, ms): `decoded - arrived` each, their minimum,
 * median (the mean of the middle two for an even count) and maximum; null when none was decoded in the window.
 */
export function arrivalToDecoded(trace: readonly VoiceTraceEntry[], now: number, windowMs: number): ArrivalStats | null {
  const spans: number[] = [];
  for (const e of trace) if (e.decoded !== null && e.decoded >= now - windowMs) spans.push(e.decoded - e.arrived);
  return spreadOf(spans);
}

/**
 * Any series of ms (VOICE-LATE-4: the decoder's own per-packet time, the main thread's lag; research 226 §3.4): its
 * count, minimum, median (the mean of the middle two for an even count) and maximum; null for none. The input is not
 * changed.
 */
export function spreadOf(values: readonly number[]): ArrivalStats | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  const median = v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
  return { n: v.length, min: v[0]!, median, max: v[v.length - 1]! };
}

const ms = (v: number): string => String(Math.round(v * 10) / 10);

/** The panel's text: the counts and the arrival-to-decoded line, labelled. */
export function voiceCountersText(s: { sent: number; heard: number; drops: Readonly<VoiceDropCounts> }, a: ArrivalStats | null): string {
  const d = s.drops;
  return [
    'VOICE -- playtest instrument (DEV)',
    `sent ${s.sent}  heard ${s.heard}`,
    `drops: stale ${d.stale}  backlog ${d.backlog}  suspended ${d.suspended}  late ${d.late}  ahead ${d.ahead}`,
    a ? `arrival->decoded ms (last 1 s): min ${ms(a.min)}  med ${ms(a.median)}  max ${ms(a.max)}  (n ${a.n})` : 'arrival->decoded ms (last 1 s): none',
  ].join('\n');
}

/** Where the counters are shown: the page's panel, or a test's. */
export interface VoiceCountersPanel {
  /** The text now (the page's sets it only when it changed). */
  show(text: string): void;
  /** The panel taken off the page. */
  dispose(): void;
}

/**
 * The page's panel: a fixed, click-through text box at the bottom left of the page, over the game's canvas and the
 * lobby's screen alike. Null without a document (a worker, node) or without `?devmode` in the page's address.
 */
export function pageCountersPanel(doc: Document | undefined = globalThis.document): VoiceCountersPanel | null {
  if (!doc?.createElement || !doc.body || !devSwitches(doc.defaultView?.location?.search ?? '').tools) return null;
  const el = doc.createElement('pre');
  el.setAttribute('data-s2u', VOICE_COUNTERS_MARKER);
  Object.assign(el.style, {
    position: 'fixed', left: '4px', bottom: '4px', margin: '0', padding: '4px 6px', zIndex: '2147483647',
    pointerEvents: 'none', font: '11px/1.3 monospace', color: '#b8f5b8', background: 'rgba(0, 0, 0, 0.65)', whiteSpace: 'pre',
  });
  doc.body.append(el);
  let shown = '';
  return {
    show: (text) => { if (text !== shown) { shown = text; el.textContent = text; } },
    dispose: () => { el.remove(); },
  };
}
