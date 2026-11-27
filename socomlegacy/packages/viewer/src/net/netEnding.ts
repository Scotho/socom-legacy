import type { CaptionSource } from '@s2u/ui';

/**
 * LATER 359b, NET-RES-3 (product track; **an intended divergence under OT.R77**, the owner's word: "the error texts do not
 * say what failed"). A seat the server or the network ends for good goes, as before, to `dlgNetError.rdr` with
 * `mp_net_errno` 32, whose popup shows UIMnLOC 365 `_365_BeenDisconnected_MSG` ("You have been disconnected from SOCOM
 * Online."): the same popup, the same flow. While an ending is set, #365's text is that ending's line instead
 * (`withNetEndingLine`, the front end's caption source); with none set it is the disc's own. #528 (the game ended), #539 (a
 * vote kick) and #529 (ABORT) are never touched: they stay the original's.
 */
export type NetEnding = 'lost' | 'rate' | 'replaced' | 'seat-freed' | 'removed' | 'room-failed' | 'server-update' | 'idle';

/**
 * NET_ENDING_TEXTS_ADAPTATION: the lines, the main controller's copy (2026-11-18), DRAFTS for the owner to edit (the
 * net-resilience plan's Log); a change is the string alone. The viewer's words, no original.
 */
export const NET_ENDING_TEXTS_ADAPTATION: Readonly<Record<NetEnding, string>> = {
  lost: 'Your connection was lost and could not be restored in time.',
  rate: 'Disconnected: your connection fell too far behind to catch up.',
  replaced: 'This game was opened in another window.',
  'seat-freed': 'Your seat in this game was released.',
  removed: 'You were removed from this game.',
  'room-failed': 'The game server ran into a problem and closed this game.',
  'server-update': 'The game server is restarting for an update.',
  idle: 'Disconnected for inactivity.',
};

/**
 * LATER 359b's second divergence (the review of 417fd7d537, F1; the main controller's (A)): in a MATCH a seat's end opens
 * `dlgNetError.rdr`, whose errno-32 popup is a text-id-0 record named "You" (research 315 §2; not #365), so the ending's line
 * goes there too -- only that popup, only on that dialog, only while an ending is set.
 */
export const NET_ERROR_DIALOG = 'dlgNetError.rdr';
export const NET_ERROR_POPUP_NAME = 'You';
export function netEndingPopupText(name: string, dialog: string | null): string | null {
  return name === NET_ERROR_POPUP_NAME && dialog === NET_ERROR_DIALOG ? netEndingLine() : null;
}

/** The popup's id whose text an ending replaces: UIMnLOC 365 (`netPage.ts` `GAME_SOCKET_CLOSED_DIALOG_READING`). */
const DISCONNECTED_LOC = 365;

/**
 * The ending a close names: its code (the transport's, ours: 4005 the rate limit, 4006 another socket took the seat,
 * 4008 the seat freed, 1011 the room failed, 4022 the host's update), else the page's own reason ('server closing' the
 * drain, 'resume' the retries past the seat's hold, 'kicked for inactivity'); null for 4007 (#528, the original's) and
 * anything else.
 */
export function netEndingOf(code: number | null, reason: string | null = null): NetEnding | null {
  switch (code) {
    case 4005: return 'rate';
    case 4006: return 'replaced';
    case 4008: return 'seat-freed';
    case 1011: return 'room-failed';
    case 4022: return 'server-update';
    default: break;
  }
  switch (reason) {
    case 'server closing': return 'server-update';
    case 'resume': return 'lost';
    case 'kicked for inactivity': return 'idle';
    default: return null;
  }
}

let pending: NetEnding | null = null;

/** The seat's ending, set as it ends (null clears it); read by #365's text until the next game's seat clears it. */
export function setNetEnding(ending: NetEnding | null): void { pending = ending; }
/** The page's ending cleared: a new game's seat, or a test's tidy-up. */
export function clearNetEnding(): void { pending = null; }
/** #365's line while an ending is set, else null (the disc's text). */
export function netEndingLine(): string | null { return pending === null ? null : NET_ENDING_TEXTS_ADAPTATION[pending]; }

/**
 * The front end's caption source with #365 answered by the ending's line while one is set -- the popup's text id
 * (`command`, `locTextOf`) and a `#365` caption alike -- and every other id, and #365 with none set, as the disc gives it.
 */
export function withNetEndingLine(source: CaptionSource): CaptionSource;
export function withNetEndingLine(source: CaptionSource | null): CaptionSource | null;
export function withNetEndingLine(source: CaptionSource | null): CaptionSource | null {
  if (!source) return null;
  const swap = (r: ReturnType<CaptionSource['caption']>): ReturnType<CaptionSource['caption']> => {
    const line = netEndingLine();
    return line !== null && r.kind === 'loc' && r.id === DISCONNECTED_LOC ? { ...r, text: line } : r;
  };
  const command = source.command;
  return {
    caption: (c) => swap(source.caption(c)),
    ...(command ? { command: (cmd: { loc: number; arg: string }) => swap(command.call(source, cmd)) } : {}),
  };
}
