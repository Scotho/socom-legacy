/**
 * LATER 753's page instrument (`LOAD_DIAG_ADAPTATION`; product track, a browser adaptation with no original -- it changes
 * nothing the game does). A late joiner's load into a match was said to take minutes (game 3783), but no row measured it.
 * A late seat's load that ends `LOAD_DIAG_LATE_MS_ADAPTATION` or more after its hand-off is told to the page's beacon as a
 * `loaddiag` DIAGNOSTIC row: how long until the map's assets were in, how long until the load ended (the assets and the
 * match's prepare -- the warm-ups -- both settled), whether the prepare was given up at its bound
 * (`PREPARE_WAIT_BOUND_ADAPTATION`), whether the load failed, and whether there was a prepare. Numbers and flags only; the
 * beacon's context adds the release, backend, adapter and map as on every row. One a page load; never an error, so never
 * counted in central's `/metrics`.
 */
export const LOAD_DIAG_ADAPTATION = "a late seat's slow load told to the page's beacon as a loaddiag diagnostic, numbers and flags only" as const;

/** A late seat's load this long or longer (ms, from its hand-off to the load's end) is told. */
export const LOAD_DIAG_LATE_MS_ADAPTATION = 30_000;

/** What `LobbyMatch` tells at a late seat's load's end. */
export interface LoadDiagPage {
  /** Ms from the hand-off to the map's assets settling -- in, or failed (`failed`) -- or null when they never settled. */
  assetsMs: number | null;
  /** Ms from the hand-off to the load's end (the assets and the prepare settled). */
  loadMs: number;
  /** The prepare given up at its bound. */
  boundHit: boolean;
  /** The load failed (the assets' own failure). */
  failed: boolean;
  /** There was a prepare (the warm-ups) to wait for. */
  prepared: boolean;
}

const ms = (v: number | null): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** The diagnostic's message: v1 compact JSON of the fixed fields. */
export function loadDiagMessage(p: LoadDiagPage): string {
  return JSON.stringify({ v: 1, assetsMs: ms(p.assetsMs), loadMs: ms(p.loadMs), boundHit: p.boundHit === true, failed: p.failed === true, prepared: p.prepared === true });
}

/** The page's reporter: `send` (the beacon's `reportDiag('loaddiag', ...)`) called once a page load at most. */
export function loadDiagReporter(send: (message: string) => void): (p: LoadDiagPage) => void {
  let sent = false;
  return (p) => {
    if (sent) return;
    sent = true;
    try { send(loadDiagMessage(p)); } catch { /* the instrument never adds an error */ }
  };
}
