/**
 * IP3 (card bbXnSJNH, "the round can start before a slow player has finished loading"): a measurement instrument with
 * no original (product track, OT.R53). The lobby match's load phases are recorded as User Timing marks named
 * `s2u:load:<phase>`, so a timed run (the f9 runner's harness) or the browser's Performance panel can read them, and at
 * the first world frame one `match load:` console line gives each phase's milliseconds after the load's start. Nothing
 * the game does, and nothing the page sends, changes.
 */
export const LOAD_MARKS_ADAPTATION = 'the match load phases marked for measurement' as const;

/** The User Timing names' prefix. */
export const LOAD_MARK_PREFIX = 's2u:load:';

/**
 * The phases, in the order a lobby match normally passes them:
 * - `load-start`: the front end asks the mission's world (the loading screen's load, `LobbyMatch`'s `load`);
 * - `decode-done`: the worker's decode answered (the assets are in the page);
 * - `start`: the match starts (`LobbyMatch`'s `start`, the loading screen's hide asked);
 * - `mounted`: the match's canvas is in the page (`./matchMount`'s `mount` returned);
 * - `world-built`: the world's scene is built from the assets (`buildWorld`);
 * - `renderer`: the renderer is made (WebGPU or WebGL2);
 * - `warm-settled`: the scene's compile jobs have settled (the shader warm-up);
 * - `first-frame`: the first frame drawn with the world in;
 * - `loaded-sent`: the page told the room `loaded` (ONL-18b).
 */
export type LoadPhase =
  | 'load-start' | 'decode-done' | 'start' | 'mounted' | 'world-built' | 'renderer' | 'warm-settled' | 'first-frame' | 'loaded-sent';

export const LOAD_PHASES: readonly LoadPhase[] = [
  'load-start', 'decode-done', 'start', 'mounted', 'world-built', 'renderer', 'warm-settled', 'first-frame', 'loaded-sent',
];

/** What the marks need of `performance` (the tests hand in their own). */
export interface LoadMarkClock {
  mark(name: string): unknown;
  clearMarks?(name?: string): void;
  getEntriesByName?(name: string, type?: string): readonly { startTime: number }[];
}

const pagePerformance = (): LoadMarkClock | null =>
  typeof globalThis.performance?.mark === 'function' ? (globalThis.performance as unknown as LoadMarkClock) : null;

/**
 * IP3's lobby prepare (`./lobbyPrepare` `LOBBY_PREPARE_ADAPTATION`): the marks that say whether the hand-off's prepare
 * found the match the game lobby prepared (ready or still in the making) -- not a phase, a fact of the load.
 */
const LOBBY_PREPARED_MARKS = { found: `${LOAD_MARK_PREFIX}lobby-prepared`, none: `${LOAD_MARK_PREFIX}lobby-unprepared` } as const;

/** A summary: each phase's ms, and `lobbyPrepared` once the hand-off's prepare has said whether it found the lobby's. */
export type LoadSummary = Partial<Record<LoadPhase, number>> & { lobbyPrepared?: boolean };

/** Each phase's latest mark, in milliseconds after the latest `load-start` (absent: not reached). */
export function loadSummary(perf: LoadMarkClock | null = pagePerformance()): LoadSummary {
  const at = (p: LoadPhase): number | undefined => {
    const e = perf?.getEntriesByName?.(LOAD_MARK_PREFIX + p, 'mark');
    return e && e.length ? e[e.length - 1]!.startTime : undefined;
  };
  const start = at('load-start');
  const out: LoadSummary = {};
  if (start === undefined) return out;
  for (const p of LOAD_PHASES) {
    const t = at(p);
    if (t !== undefined && t >= start) out[p] = Math.round(t - start);
  }
  const last = (name: string): number | undefined => { const e = perf?.getEntriesByName?.(name, 'mark'); return e && e.length ? e[e.length - 1]!.startTime : undefined; };
  const found = last(LOBBY_PREPARED_MARKS.found), none = last(LOBBY_PREPARED_MARKS.none);
  if (found !== undefined && found >= start && (none === undefined || found >= none)) out.lobbyPrepared = true;
  else if (none !== undefined && none >= start) out.lobbyPrepared = false;
  return out;
}

/**
 * One phase reached. A `load-start` clears the earlier load's marks first, so each summary is one load's. At the first
 * frame the summary is logged once. Never throws: an instrument does not stop a load.
 */
export function markLoad(phase: LoadPhase, perf: LoadMarkClock | null = pagePerformance(), log: (line: string) => void = (l) => { console.info(l); }): void {
  if (!perf) return;
  try {
    if (phase === 'load-start') { for (const p of LOAD_PHASES) perf.clearMarks?.(LOAD_MARK_PREFIX + p); perf.clearMarks?.(LOBBY_PREPARED_MARKS.found); perf.clearMarks?.(LOBBY_PREPARED_MARKS.none); }
    perf.mark(LOAD_MARK_PREFIX + phase);
    if (phase === 'first-frame') log(`match load: ${JSON.stringify(loadSummary(perf))}`);
  } catch { /* an instrument never stops the load */ }
}

/**
 * IP3's lobby prepare (`./lobbyPrepare`): the hand-off's prepare found the match the game lobby prepared (`found`), or
 * made its own; the next `match load:` line says which (`lobbyPrepared`). Never throws.
 */
export function markLobbyPrepared(found: boolean, perf: LoadMarkClock | null = pagePerformance()): void {
  if (!perf) return;
  try { perf.mark(found ? LOBBY_PREPARED_MARKS.found : LOBBY_PREPARED_MARKS.none); } catch { /* an instrument never stops the load */ }
}
