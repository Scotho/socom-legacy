/**
 * LATER 62's field instrument (`NETEND_DIAG_ADAPTATION`; product track, a browser adaptation with no original -- it changes
 * nothing the game does). The development close report (`./closeReport`) is folded out of a release build, so the field
 * could never say which path ended a match on a network error (the owner's 2026-10-15 late joiner, LATER 62). Every
 * `LobbyMatch` return but the match's own end is now also told to the page's beacon as a `netend` DIAGNOSTIC row: the
 * return's `why`, the call site that decided it, the socket's state and close code as they stood before the return closed
 * it, the phase, the late flag and the time since the level showed. No seat id, name, account, ticket, URL or free text:
 * every field is one of a fixed set or a number. At most `NETEND_DIAGS_PER_LOAD_ADAPTATION` a load, inside the beacon's
 * own diagnostic budget; never an error, so never counted in central's `/metrics`.
 */
export const NETEND_DIAG_ADAPTATION = "a match's network-ended return told to the page's beacon as a netend diagnostic, fixed fields only" as const;

/** The most `netend` rows a page load sends. */
export const NETEND_DIAGS_PER_LOAD_ADAPTATION = 3;

const WHYS = ['abandoned', 'kicked', 'aborted', 'net-error', 'timeout', 'late-return', 'stopped'] as const;
const STATES = ['connecting', 'open', 'closed', 'refused', 'none'] as const;
const PHASES = ['idle', 'loading', 'match', 'ended'] as const;
/** A call site's name: a short word of the page's own (`LobbyMatch`), never free text. */
const PATH_FORM = /^[a-z][a-z-]{0,63}$/;

/** What `LobbyMatch` tells at a return. */
export interface NetEndPage {
  why: string;
  path: string;
  state: string;
  code: number | null;
  phase: string;
  late: boolean;
  sinceMatchMs: number | null;
}

const oneOf = <T extends string>(set: readonly T[], v: string): T | 'other' => ((set as readonly string[]).includes(v) ? (v as T) : 'other');

/** The diagnostic's message: v1 compact JSON of the fixed fields only, each checked against its set or form. */
export function netEndMessage(p: NetEndPage): string {
  const code = Number.isInteger(p.code) && p.code! >= 0 && p.code! <= 65535 ? p.code : null;
  const since = typeof p.sinceMatchMs === 'number' && Number.isFinite(p.sinceMatchMs) && p.sinceMatchMs >= 0 ? Math.round(p.sinceMatchMs) : null;
  return JSON.stringify({
    v: 1, why: oneOf(WHYS, p.why), path: PATH_FORM.test(p.path) ? p.path : 'other', state: oneOf(STATES, p.state),
    code, phase: oneOf(PHASES, p.phase), late: p.late === true, sinceMatchMs: since,
  });
}

/** The page's reporter: `send` (the beacon's `reportDiag('netend', ...)`) called at most the cap a load. */
export function netEndReporter(send: (message: string) => void): (p: NetEndPage) => void {
  let sent = 0;
  return (p) => {
    if (sent >= NETEND_DIAGS_PER_LOAD_ADAPTATION) return;
    sent++;
    try { send(netEndMessage(p)); } catch { /* the instrument never adds an error */ }
  };
}
