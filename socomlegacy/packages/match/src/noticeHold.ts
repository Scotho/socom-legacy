/**
 * The notices' pure part (LATER 261's build fix, B130): their shapes, the timing constants, the approved wording and
 * `noticeHeldAt` -- node-free, because `room.ts` imports it and the page bundles the room (the offline match runs it in
 * the page, `viewer/src/net/loopback.ts`). `./notices` (the store and the file layer, `node:fs`) re-exports every name
 * unchanged. `matchNodeFree.test.ts` holds that `room.ts`'s import graph reaches no `node:` module.
 */

/** What a reply carries of a notice: the page shows each `id` once (ids only increase). */
export interface SystemNotice { id: number; severity: number; text: string }
/**
 * A notice as the store and the file hold it: made at `at`, live until `until` (ms since the epoch). LATER 261:
 * `restartAt`, a host's lead's restart (ms since the epoch; the host's notice command writes it for `restart <minutes>`,
 * none for `now`), which its games keep to tell each later welcome the minutes left (`noticeHeldAt`); central's notices
 * carry none.
 */
export interface Notice extends SystemNotice { at: number; until: number; restartAt?: number }

/** The file in DATA_DIR the notice command writes and a running central polls. */
export const NOTICES_FILE = 'notices.json';

/**
 * NOTICE_LIVE_MS_ADAPTATION: how long a notice is carried by every poll. A minute: a page polls once a second
 * (`CHAT_POLL_MS_ADAPTATION`), so every page up sees it within its first second, and a page signing in within the minute
 * sees it too; a "now" never outlives the restart it announces (a central does not tell one written before its start).
 */
export const NOTICE_LIVE_MS_ADAPTATION = 60_000;
/** NOTICES_KEPT_ADAPTATION: the notices held at most (store and file); the oldest go first. Two a restart at most. */
export const NOTICES_KEPT_ADAPTATION = 8;
/**
 * NOTICES_FILE_POLL_MS_ADAPTATION: how often a running central looks at `notices.json` for a new notice -- a poll
 * (`fs.watchFile`'s kind, as SA-32's `HOSTS_FILE_POLL_MS_ADAPTATION`), never a signal or a port. One second: a "now"
 * reaches the store within it, and box.sh waits `NOTICE_SETTLE_SECONDS` (this, the page's poll and a margin) before
 * the restart.
 */
export const NOTICES_FILE_POLL_MS_ADAPTATION = 1_000;
/**
 * NOTICE_TWIN_MS_ADAPTATION: how close a second notice of the same severity and text must follow the first to be taken
 * for it (`writeNoticeOnce`, nothing written) -- the window of the one case the dedupe exists for, box.sh's `notify`
 * falling through to the next bundle after a run that timed out past its write: that run lasts at most
 * `NOTICE_TIMEOUT_SECONDS` (20 s, `deploy/central/box.sh`), and 5 s of margin make 25 s. Never the whole live window
 * (the combined review's F4): a second restart's "now" a little later (a hand rollback, another deploy) is its own
 * notice, which the central started since that first restart can tell (it never tells one written before its start).
 */
export const NOTICE_TWIN_MS_ADAPTATION = 25_000;

/**
 * NOTICE_NOW_KEPT_MS_ADAPTATION (LATER 261): how long a notice with no restart time -- the "now" -- is held for a game's
 * later welcome (the room's `tellSystem` and `hello`) and a process's later `ready` (the host's supervisor): 25 s. After
 * its "now", update-host.sh waits NOTICE_SETTLE_SECONDS (5 s) and runs `up -d`, whose stop drains the supervisor -- from
 * which no hello is welcomed and no game placed -- so the window need only span the settle and compose's recreate, with a
 * margin (the scale of `NOTICE_TWIN_MS_ADAPTATION`, which answers another question and may differ); a swap that fails
 * after its "now" leaves it heard for at most this long. Counted from each holder's own receipt -- the supervisor from the
 * notice's `at`, a room from its tell -- so a process ready within it is told the "now" at its ready and its rooms keep
 * it as long again: the outer bound is twice this, 50 s after the write.
 */
export const NOTICE_NOW_KEPT_MS_ADAPTATION = 25_000;

/**
 * NOTICE_LEAD_MAX_MS_ADAPTATION (LATER 261, the fresh review's L2): the longest lead a notice may name, a day -- the host's
 * notice command's own cap (`restart <minutes>`, 1 to 1440; central's too). A `restartAt` more than this past its notice's
 * `at` (the file's reader, `isNotice`) or past the reader's clock (the pipe's `system`, `parseDown`) is refused, so a
 * hand-edited file never makes every welcome hear a lead of 10^11 minutes.
 */
export const NOTICE_LEAD_MAX_MS_ADAPTATION = 1440 * 60_000;

/**
 * RESTART_NOTICE_SEVERITY_ADAPTATION: one send per notice at severity 0 -- the class the original routes to the
 * OnSystemMessage popup in the online menus, the briefing room and the game lobby (both bound dialogs), and to the HUD in
 * a round (`FUN_0030dce0` D:L210380-210389: below 0x80, the flag 2; `FUN_001f4d20` D:L54919-54934); CROSS closes the popup,
 * so no one is trapped. The merge controller's call on the table, 2026-10-21 (Horizon sends 0 for its maintenance
 * message, `desktop@be557831`, community evidence only). Known gap: the 16 online dialogs that bind no OnSystemMessage,
 * and a match's load, show nothing (no second send at 0x80 or above for now).
 */
export const RESTART_NOTICE_SEVERITY_ADAPTATION = 0;

/**
 * RESTART_NOTICE_TEXT_ADAPTATION: the wording, the merge controller's approval (2026-10-21): "The server restarts in about
 * N minutes." ("1 minute" singular) ahead of a restart, "The server is restarting now." just before it. Never the
 * original's (Sony's wording is unobservable, research 345 "Unknowns").
 */
export const RESTART_NOTICE_TEXT_ADAPTATION = {
  inMinutes: (minutes: number): string => (minutes === 1 ? 'The server restarts in about 1 minute.' : `The server restarts in about ${minutes} minutes.`),
  now: 'The server is restarting now.',
} as const;

/** The approved text for `minutes` ahead, or `'now'`. */
export function restartNoticeText(when: number | 'now'): string {
  return when === 'now' ? RESTART_NOTICE_TEXT_ADAPTATION.now : RESTART_NOTICE_TEXT_ADAPTATION.inMinutes(when);
}

/** A notice as a room or the supervisor holds it for a later welcome or ready: told at `at`; a lead's restart at `restartAt`. */
export interface KeptNotice { severity: number; text: string; at: number; restartAt?: number }

/**
 * LATER 261: what of a kept notice is told at `now`, or null when it no longer holds -- a lead (`restartAt`) until its
 * restart, its text the approved one for the whole minutes left (at least 1: `restartNoticeText`, "1 minute" singular),
 * always recomputed from `restartAt`, never from the text it was told with; one with no `restartAt` (the "now", or an
 * older writer's) within `NOTICE_NOW_KEPT_MS_ADAPTATION` of `at`, its text as told. Keyed on `restartAt` alone.
 */
export function noticeHeldAt(n: KeptNotice, now: number): { severity: number; text: string } | null {
  if (n.restartAt !== undefined) {
    return now < n.restartAt ? { severity: n.severity, text: restartNoticeText(Math.max(1, Math.ceil((n.restartAt - now) / 60_000))) } : null;
  }
  return now - n.at < NOTICE_NOW_KEPT_MS_ADAPTATION ? { severity: n.severity, text: n.text } : null;
}

/** The id after `last` for a notice made at `now`: at least `now` (so ids keep increasing across a file started over), above `last`. */
export const nextNoticeId = (last: number, now: number): number => Math.max(last + 1, Math.floor(now));

// ---- OA-1 (the operator announcement plan, OA.R1/OA.R5): the operator's say, a notice kind beside the restart notice ----
// Product track, a browser adaptation with no original: SOCOM II's server never sent a player a free-text message in a
// round. The restart notice above is untouched (OA.R1): its wording, severity, 60 s hold and 8-kept cap are its own.

/**
 * An operator's say as the poll carries it (`notice say`, central's `cli/sayMain.ts`): a closable panel on the page (OA-3),
 * every page when `game` is absent, else only the pages in that game; told to newcomers until `until` (ms since the epoch).
 * `severity` is 0 or `SAY_WARN_SEVERITY_ADAPTATION` (the panel's accent only; nothing routes on it). An adaptation.
 */
export interface Say { id: number; severity: number; text: string; game?: number; until: number; kind: 'say' }
/** A say taken down before its `until` (`notice say --withdraw <id>`): a page closes it if open. An adaptation. */
export interface SayWithdrawn { id: number; withdrawn: true }

/** SAY_HOLD_DEFAULT_ADAPTATION: a say's time in force when `--until` names none, 10 min (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_HOLD_DEFAULT_ADAPTATION = 10 * 60_000;
/** SAY_HOLD_MAX_ADAPTATION: the longest a say may stay in force, 24 h past its writing (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_HOLD_MAX_ADAPTATION = 24 * 3_600_000;
/** SAY_LIVE_MAX_ADAPTATION: the says held live at most, beside the restart notices' own cap; the oldest dropped (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_LIVE_MAX_ADAPTATION = 8;
/** SAY_WARN_SEVERITY_ADAPTATION: a say's severity with `--warn`, else 0 -- the panel's accent only (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_WARN_SEVERITY_ADAPTATION = 1;
/** SAY_TEXT_MAX_BYTES_ADAPTATION: a say's text at most, in UTF-8 bytes -- the announcements' limit (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_TEXT_MAX_BYTES_ADAPTATION = 999;

/** Any control character (Unicode Cc: C0, DEL, C1): a newline or a tab included -- the panel is one paragraph. */
const CONTROL = /\p{Cc}/u;

/** A say's text checked: trimmed UTF-8, 1..999 bytes, no control characters; the reason or null. */
export function sayTextRefusal(text: string): string | null {
  if (CONTROL.test(text)) return 'the text holds a control character (a newline, a tab or another): a say is one paragraph';
  const t = text.trim();
  if (t.length === 0) return 'no text';
  const bytes = new TextEncoder().encode(t).length;
  if (bytes > SAY_TEXT_MAX_BYTES_ADAPTATION) return `the text is ${bytes} bytes, over ${SAY_TEXT_MAX_BYTES_ADAPTATION} bytes (SAY_TEXT_MAX_BYTES_ADAPTATION)`;
  return null;
}
