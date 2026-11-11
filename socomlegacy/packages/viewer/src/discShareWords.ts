import type { ReceiverPhase, SenderPhase } from './discShareView';

/**
 * DSH-5 (the disc share plan, DSH.R12): the words of the disc share's two screens -- the receiver's row and its expanded
 * area in Play's "Before you deploy" panel ("Request Game Files (XBOX)", the owner's words), and the sender's dialog the
 * pairing link opens. One file, so a later pass (or a translation) changes them in one place. A browser adaptation: the
 * launcher's words, nothing of the game.
 */

/** The panel's row, the owner's label (DSH.R12), and its line at rest. */
export const SHARE_ROW_LABEL = 'Request Game Files (XBOX)';
export const SHARE_ROW_HINT = 'Copy from your PC or phone; enables Xbox graphics on this device';

/** The expanded area's title (the panel's head while it is open). */
export const SHARE_TITLE = SHARE_ROW_LABEL;

/** The read set's size as the steps say it (DSH.R4: 95 files, 1,338,391,063 bytes). */
export const SHARE_SIZE_WORDS = 'about 1.34 GB';

/**
 * Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01: Xbox players scanned the code with a phone that had no
 * copy of the game): the area's first line, before the code and the steps -- which device opens the link.
 */
export const SHARE_LEAD = 'Open this link on the PC or phone that already has the game set up. A phone without the game cannot send it.';

/**
 * Setup onboarding (ZjCZXTTW): the one line "Before you deploy" says under its title while the disc is out, on a page
 * with the share's row -- the Xbox's first screen of the launch points at the row at the panel's foot.
 */
export const SHARE_XBOX_POINTER = 'On Xbox? Choose Request Game Files (XBOX) at the bottom of this list.';

/** The receiver's numbered steps; `code` is the code shown beside them. Step 1 follows `SHARE_LEAD` (ZjCZXTTW). */
export const shareSteps = (code: string): readonly string[] => [
  'On that PC or phone, at home or anywhere else, open this site.',
  `Scan the code, or choose Send game files and type ${code}.`,
  'Approve on that device, and check that the code matches.',
  `Keep this page open, in front, until the copy finishes (${SHARE_SIZE_WORDS}).`,
];

/** DSH.R10: both devices use the same site; `host` is this page's. */
export const shareHostLine = (host: string): string => `Open it on the same site: ${host}`;

/** The receiver's phases as its status says them: a head and a line. */
export const RECEIVER_WORDS: Record<ReceiverPhase, { head: string; line: string }> = {
  idle: { head: 'Not started', line: 'Press Cross to make a code.' },
  requesting: { head: 'Making a code…', line: 'One moment.' },
  waiting: { head: 'Waiting for the other device', line: 'Open the link on it, or type the code there.' },
  paired: { head: 'Paired', line: 'The other device answered. The copy starts in a moment.' },
  copying: { head: 'Copying the game files', line: 'Keep this page open, in front, until it finishes.' },
  done: { head: 'Done: your disc is ready', line: 'The files are kept in this browser. Play starts from them.' },
  failed: { head: 'The copy did not finish', line: '' },
  // RB-26: a hosted share's No (the host's link, `?discshare-host=`).
  declined: { head: 'The host said No', line: 'Nothing was copied. Ask the host again, or ask someone else.' },
};

/** A failure before any code was made (pairing unreachable or refused): nothing was copied, so not "the copy". */
export const RECEIVER_FAILED_EARLY = 'Could not start';

/** The receiver's Try again (its failed phase). */
export const SHARE_RETRY = 'Try again';

/**
 * The row's line while a request is under way (the panel shut over it, or back on its rows). RB-26: `hosted`, a page a
 * host's link opened -- its waiting and paired said as the host's answers (`RECEIVER_HOSTED_WORDS`).
 */
export function shareRowHint(phase: ReceiverPhase, pct: number | null, hosted = false): string {
  const h = hosted ? RECEIVER_HOSTED_WORDS[phase] : undefined;
  if (h && (phase === 'waiting' || phase === 'requesting' || phase === 'paired')) return h.head;
  if (phase === 'waiting' || phase === 'requesting') return 'Waiting for the other device';
  if (phase === 'paired') return 'Paired: the copy starts in a moment';
  if (phase === 'copying') return pct === null ? 'Copying the game files' : `Copying the game files · ${pct}%`;
  if (phase === 'done') return 'Copied: your disc is ready';
  if (phase === 'failed') return 'The copy did not finish · open it to try again';
  if (phase === 'declined') return 'The host said No';
  return SHARE_ROW_HINT;
}

/** The legend's Cross on the row. */
export const SHARE_ROW_VERB = 'Request';

/** The sender's dialog (the page the pairing link opens, DSH.R12). */
export const SENDER_TITLE = 'Send game files to the other device';
export const SENDER_CODE_LINE = 'Check that this code matches the one on the other device:';
export const SENDER_YES = 'Yes, send';
export const SENDER_NO = 'No';
export const SENDER_EXTRACT = 'Extract, then send';
export const SENDER_CLOSE = 'Close';
export const SENDER_STOP = 'Stop';

/** The sender's phases as its dialog says them. */
export const SENDER_WORDS: Record<SenderPhase, { lead: string; note?: string }> = {
  enter: { lead: 'Choose the other device’s code, or type it.' },
  asked: {
    lead: 'A device asks for this browser’s game files.',
    // DSH.R16 (the owner, 2026-11-07): sharing between players is intended; the note no longer limits it to your own devices.
    note: `Say Yes only if the code matches the one the other device shows. The copy is ${SHARE_SIZE_WORDS}; keep this page open until it finishes.`,
  },
  // Setup onboarding (ZjCZXTTW): the device with no copy leads with what to do (was: "A device on your network asks for
  // this browser's game files.", the reason only in the note).
  'needs-extract': {
    lead: 'Put your ISO on this device first, or open this link on the PC or phone that already has the game.',
    note: 'This browser does not hold a complete copy of your disc yet, so there is nothing to send. Choose Extract, then send: your disc is extracted here first, then this page asks again.',
  },
  sending: { lead: 'Sending the game files. Keep this page open, in front, until it finishes.' },
  done: { lead: 'Sent. The other device has the game files.' },
  failed: { lead: 'The copy did not finish.' },
  declined: { lead: 'Not sent.' },
};

/** The stub's reason, until the transfer (DSH-4) is built: nothing is sent yet. */
export const SHARE_NOT_BUILT = 'Sending between devices is not built yet in this version of the launcher.';

/*
 * DSH-4: the transfer's words -- the connection check's refusals (DSH.R15: an unread pair, no path), the pairing's
 * failures (the merge controller's landing condition: pairing unavailable on this site is said plainly), the copy's own
 * failures, and the sender's code entry.
 */

/*
 * DSH.R15 (the owner, 2026-11-07): the devices may be on different networks; the connection's path is said, never
 * refused (it was: `shareNotLocalType`, "... Both must be on the same home network", DSH.R2 and DSH.R14).
 */
/** DSH.R15: the path, said while the copy runs -- directly between the devices, or through Cloudflare's TURN relay. */
export const SHARE_VIA_DIRECT = 'Connected directly between the devices.';
export const SHARE_VIA_RELAY = 'Connected through Cloudflare’s relay, encrypted end to end.';
/** The connection's selected pair could not be read (none, or a candidate type ICE does not name). */
export const SHARE_PAIR_UNREAD = 'The connection between the devices could not be read, so nothing was sent. Try again.';
/** No WebRTC in this browser. */
export const SHARE_NO_RTC = 'This browser cannot connect devices directly, so it cannot copy the game files. Use a current browser.';
/** The devices never connected: ICE found no path (DSH.R15), or the connect timeout. */
export const SHARE_NO_CONNECT = 'The devices could not find a way to reach each other, so nothing was sent. Keep both pages open, in front, and try again; a strict network (some workplaces, schools, VPNs or mobile carriers) can block the connection.';

/** Pairing unreachable on this site (the static host's 404/405, an HTML page, no answer, 502/503). */
export const SHARE_UNAVAILABLE = 'Pairing isn\u2019t available on this site right now. Your disc and this page are fine; try again later.';
/** 429. */
export const SHARE_TOO_MANY = 'Too many tries; wait a few minutes, then try again.';
/** 403: a wrong secret or another site's page. */
export const SHARE_FORBIDDEN = 'This site refused the pairing (it was made on another page or site). Make a new code and try again.';
/** 409: a message before the other device joined. */
export const SHARE_CONFLICT = 'The pairing was not ready for that step. Make a new code and try again.';
/** The route's 404 on a claim: no request has that code. */
export const SHARE_NO_SUCH_CODE = 'No request has that code (codes expire after 10 minutes and work once). Check the code shown on the other device.';
/** The route's 404 on a poll or a send: the pairing ended (expired, or the other side left). */
export const SHARE_ENDED = 'The pairing ended (a code lasts 10 minutes). Make a new code and try again.';
/** The receiver's code expired unanswered. */
export const SHARE_EXPIRED = 'The code expired before the other device answered. Make a new code.';
/** Anything else the routes refused. */
export const shareRefused = (status: number): string => `Pairing was refused (${status}). Try again in a moment.`;

/** The other side said No, or stopped. */
export const SHARE_OTHER_STOPPED = 'The other device said No, or stopped the copy.';
/** The data channel dropped mid-copy. */
export const SHARE_DROPPED = 'The connection between the devices dropped. Try again: the copy carries on from what is already saved.';
/** A file's SHA-256 is not the sender's (the file is discarded). */
export const shareMismatch = (path: string): string => `${path} arrived damaged and was discarded, so the copy stopped. Try again.`;
/** The two pages read different read sets. */
export const SHARE_VERSION = 'The two devices run different versions of the launcher. Reload both pages, then try again.';
/** The other device's message was not the transfer's. */
export const SHARE_PROTOCOL = 'The other device sent something this page does not understand, so the copy stopped. Reload both pages and try again.';
/** The disc share review's B1: nothing came from the other device for the copy's inactivity bound. */
export const SHARE_IDLE = 'Nothing came from the other device for a while, so the copy stopped. Keep both pages open, in front, and try again: the copy carries on from what is already saved.';
/** The third check: a step of this device's own storage never finished (another tab holding it, or the storage stuck). */
export const SHARE_LOCAL_STUCK = 'This browser’s storage did not answer, so the copy stopped. Close other tabs of this site, then try again: the copy carries on from what is already saved.';
/** The disc share review's N2: the sender's files are not exactly the read set (some missing, or others added). */
export const SHARE_NOT_READ_SET = 'The other device’s copy is not the whole set of game files this launcher needs, so nothing was saved. Extract the disc again there, then send again.';
/** The sender's kept extraction is gone or not whole. */
export const SHARE_SOURCE_GONE = 'This browser no longer holds a complete copy of your disc. Choose your disc to extract it, then send again.';

/** The sender's code entry (the "Send game files to another device" row in Settings > App). */
export const SHARE_SEND_ROW_LABEL = 'Send game files to another device';
export const SHARE_SEND_ROW_ACTION = 'Send';
export const SHARE_SEND_ROW_ABOUT = 'Copy the game files kept in this browser to an Xbox, PC or phone, at home or elsewhere. That device shows a code; type it here, or pick it from the list of requests on this network.';
export const SHARE_SEND_ROW_NOTE = 'Directly between the devices, or through Cloudflare’s relay when no direct path exists, encrypted end to end; nothing of the disc passes through our servers.';
export const SENDER_ENTER_LEAD = 'Choose the other device\u2019s code, or type it.';
export const SENDER_ENTER_NONE = 'No request found on this network yet. On the other device, open Play, then Request Game Files (XBOX); on another network, type the code it shows.';
export const SENDER_ENTER_SOME = 'Requests on this network:';
export const SENDER_TYPE = 'Type a code';
export const SHARE_CODE_TITLE = 'The other device\u2019s code';
export const SHARE_CODE_LEAD = 'The 6 characters shown on the other device.';
export const SHARE_CODE_BAD = 'That is not a code: 6 letters and digits, as the other device shows it.';

/*
 * RB-26 (the replay batch plan; DSH.R16, its Q9-Q11 defaults): the host mode's words -- a page with the disc holds a
 * share open from the disc mark, its link (`?discshare-host=<token>`) asked by other players' pages, one copy at a time.
 */

/**
 * A page opened by a host's link waits for the host's Yes. The host sends one copy at a time and the receiver is not told
 * its place (RB-25's wire carries no `queued` to the receiver), so the line says it may wait its turn.
 */
export const RECEIVER_HOSTED_WAITING = 'Waiting for the host to say Yes. Check that the host sees this code. The host sends one copy at a time, so yours may wait its turn: keep this page open, in front.';
/** The host's share ended (closed, its page gone, or launched into a game) before it said Yes or No. */
export const SHARE_HOST_ENDED = 'The host stopped sharing before answering. Ask them to open Share again, then open their new link.';
/** The host's own share was lost at central (its route's 404: it lapsed or ended). */
export const SHARE_HOST_GONE = 'This share ended. Open Share again to take requests; the old link no longer works.';
/** A request whose turn came after it ended (its route's 404 at the host's Yes). */
export const SHARE_REQUEST_GONE = 'That request ended before its turn came. The next one goes ahead.';
/** Q11's default: launching ends the share -- the copy under way and every request waiting. */
export const SHARE_DEPLOY_STOPS = 'Launching stops sharing: the copy under way stops and the requests waiting are turned away.';
/**
 * RB-26, the receiver a host's link opened (`?discshare-host=<token>`): its phases said as the host's answers -- asking,
 * queued at the host (waiting: in the host's list, unanswered; RB-25's wire tells the receiver no place, so "queued"
 * covers both an unanswered request and one the host said Yes to while another copies), and approved (paired: the
 * host's Yes reached central). The other phases keep `RECEIVER_WORDS` (declined: "The host said No").
 */
export const RECEIVER_HOSTED_WORDS: Partial<Record<ReceiverPhase, { head: string; line: string }>> = {
  requesting: { head: 'Asking the host…', line: 'One moment.' },
  waiting: { head: 'Queued at the host', line: RECEIVER_HOSTED_WAITING },
  paired: { head: 'The host said Yes', line: 'The copy starts in a moment.' },
};
/** RB-26: the hosted area's first line, before the code. */
export const SHARE_HOSTED_LEAD = 'Someone is sharing their game files with this link. They see the code below in their Share list and say Yes beside it.';
/** RB-26: the hosted area's steps; `code` is the code shown above them. */
export const shareHostedSteps = (code: string): readonly string[] => [
  `Check that the host sees ${code} in their Share list.`,
  'The host says Yes beside it. One copy goes at a time, so yours may wait its turn.',
  `Keep this page open, in front, until the copy finishes (${SHARE_SIZE_WORDS}).`,
];
/** RB-26: a declined request's Cross -- the host is asked again. */
export const SHARE_ASK_AGAIN = 'Ask again';
/** The host's queue place, as the panel says it. */
export const shareQueued = (place: number): string => `Queued #${place}`;

/*
 * DSH-10 and DSH-11 (the disc share plan, DSH.R17, the owner, 2026-11-10: "the "send disc" feature that works like our
 * xbox request game files but provides a shareable link of YOUR iso ... enabled when you have a disc added already
 * (hoverable tooltip for context)"): the sender's words -- the "Send Game Files" row of Play's "Before you deploy" panel,
 * the disc mark's "SEND DISC", and the send area both open (RB-27's host screen, RB-26's host mode). Product track, the
 * launcher's words: the owner may change any.
 */

/** The panel's row (directly above `SHARE_ROW_LABEL`), and the send area's head. */
export const SEND_ROW_LABEL = 'Send Game Files';
export const SEND_TITLE = SEND_ROW_LABEL;
/** The disc mark menu's row, in the menu's capitals (DISC-LABELS: DISC ISO, RETAIL DISC). */
export const SEND_MENU_LABEL = 'SEND DISC';
/** The legend's Cross on the enabled row (and the menu's row). */
export const SEND_ROW_VERB = 'Send';

/**
 * Why the row is enabled or not (`../console/state` `sendState`): `ready`, a complete extraction kept in this browser
 * (DSH.R7); `saving`, the extraction running now; `part`, an extraction kept but not whole; `none`, nothing kept.
 */
export type SendWhy = 'ready' | 'none' | 'saving' | 'part';
/** Each state's line (the row's hint; the legend's line on a disabled press) and tooltip (the row's `title` and description). */
export const SEND_WORDS: Record<SendWhy, { line: string; tip: string }> = {
  ready: {
    line: 'Make a link that copies your game files to another device',
    tip: 'Makes a link to the game files saved in this browser. Whoever opens it, on this network or anywhere else, asks you for a copy, and you say Yes beside the code they show. One copy at a time; keep this open while you share. Deploying stops sharing.',
  },
  none: {
    line: 'Add your disc first',
    tip: 'Needs your disc saved in this browser. Choose your disc with the disc mark (bottom left) and let it finish saving; then Send Game Files makes a link others can open to copy it.',
  },
  saving: {
    line: 'Your disc is still saving in this browser',
    tip: 'Send Game Files opens once your disc has finished saving in this browser: only a complete copy can be sent.',
  },
  part: {
    line: 'Only part of your disc is saved here',
    tip: 'Only part of your disc is saved in this browser. Choose your disc again to finish saving it, then send.',
  },
};

/** The send area: its lead, the line under the link, and its link's words. */
export const SEND_LEAD = 'Send this link to whoever needs the game files. When they open it, their code shows below: say Yes beside it if it matches the code on their screen.';
export const SEND_KEEP_OPEN = 'Keep this open while you share.';
export const SEND_OPENING = 'Making your link…';
export const SEND_COPY_LINK = 'Copy link';
export const SEND_LINK_COPIED = 'Link copied';
/** CPS-5's pattern: the browser refused the clipboard (a pad's Cross is no user gesture to it), so the link is selected by hand. */
export const SEND_COPY_REFUSED = 'Select the link above and copy it: the browser refused the clipboard.';
/** The QR's accessible name. */
export const sendQrLabel = (link: string): string => `Send link: ${link}`;
/** The requests' list. */
export const SEND_REQUESTS = 'Requests';
export const SEND_NO_REQUESTS = 'No requests yet. When someone opens your link, their code shows here.';
export const SEND_YES = 'Yes';
export const SEND_NO = 'No';
export const SEND_STOP = 'Stop';
/** Circle in the area: it closes the area, which ends the share (Q10). */
export const SEND_CLOSE = 'Stop sharing';
/** The review of agent/disc-send-row (F2): Circle where nothing is shared (needs-extract, failed): back to the rows. */
export const SEND_BACK = 'Back';
/** The review's F2: Circle while a copy runs asks first, in the words of Deploy's question (`SHARE_DEPLOY_STOPS`). */
export const SHARE_CLOSE_STOPS = 'Closing stops sharing: the copy under way stops and the requests waiting are turned away.';
/** A request's age, as the list says it. */
export const sendAge = (ms: number): string => (ms < 60_000 ? 'just now' : `${Math.floor(ms / 60_000)} min ago`);
/** The copy under way's head. */
export const sendCopying = (code: string): string => `Sending to ${code}`;
/** The last copy's outcome. */
export function sendLast(last: { code: string; outcome: 'done' | 'failed' | 'stopped'; reason?: string }): string {
  if (last.outcome === 'done') return `Sent to ${last.code}.`;
  if (last.outcome === 'stopped') return `Stopped the copy to ${last.code}.`;
  return `The copy to ${last.code} did not finish.${last.reason ? ` ${last.reason}` : ''}`;
}
/** The host's `needs-extract` (DSH.R7: nothing opened at central). */
export const SEND_NEEDS_EXTRACT = 'This browser does not hold a complete copy of your disc, so there is nothing to send. Choose your disc with the disc mark (bottom left) and let it finish saving.';
/** The host's `failed`: the head; its reason follows. */
export const SEND_FAILED = 'Could not make a link';
/** Q11's question (Deploy while the share is busy): `SHARE_DEPLOY_STOPS` its lead; No first and focused. */
export const SHARE_DEPLOY_CONFIRM = {
  title: 'Stop sharing and deploy?',
  lead: SHARE_DEPLOY_STOPS,
  no: 'No, keep sharing',
  yes: 'Yes, deploy',
} as const;
/** The review's F2: Circle (or the crumb's Back) while a copy runs; No first and focused. */
export const SHARE_CLOSE_CONFIRM = {
  title: 'Stop sharing?',
  lead: SHARE_CLOSE_STOPS,
  no: 'No, keep sharing',
  yes: 'Yes, stop sharing',
} as const;
