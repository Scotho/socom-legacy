/**
 * OPS-A3 (the OPS lane of the weekend mega sprint; the owner's row H464, his to reword; product track, a browser
 * adaptation -- a service ban has no original: the original's servers are gone and no capture shows one). The words a
 * banned player reads at sign-in, in this one place so that a rewording is one edit, for every page that shows them:
 * the console's sign-in and the overlay's (viewer `modern/session.ts`, through `console/adapters/session.ts` and
 * `modern/overlay/session.ts`), the page's line beside the original's dialog for a session a ban ended (viewer
 * `connectHost.ts`), and the classic LOGIN's failure text (`./lobbyClient`, state 7's reply).
 *
 * What central sends (built by OPS-A2; read here, never changed): a sign-in of an actively banned account whose secret
 * was right is answered status -972 (central `accounts.ts` `ACCOUNT_BANNED_STATUS_ADAPTATION`, the console's
 * MediusPlayerBanned) with `ban: { until, reason? }` in the HTTP body (central `accountHttp.ts`): `until` the ban's end in
 * ms since the epoch, or null for permanent; `reason` only when the operator marked it public. A session a ban ended is
 * told by the lobby endpoint's 401 `{ reason: "banned" }` (`ACCOUNT_BANNED_REASON`), which carries no date.
 *
 * Shown as TEXT everywhere: the reason is the operator's words and never markup. A page older than this module, or a
 * central older than OPS-A2, shows what it showed before (central's own note on -972: a plain failure).
 *
 * Pure: no DOM (web sprint 6 package boundaries); the zone is asked of `Date`, or handed in.
 */

/** MediusPlayerBanned: central's banned sign-in (`ACCOUNT_BANNED_STATUS_ADAPTATION`, central `accounts.ts`). */
export const PLAYER_BANNED_STATUS = -972;

/** What central's banned sign-in shows of its ban (central `accounts.ts` `BanShown`): its end (null: permanent), its public reason. */
export interface ShownBan { until: number | null; reason?: string }

/** BAN_CONTACT_ADAPTATION: where a banned player asks (H464). The community's name as its source spells it most often. */
export const BAN_CONTACT_ADAPTATION = 'To ask about it, contact the staff on the SOCOM II Legacy Discord.';

/** BANNED_PERMANENT_ADAPTATION: a permanent ban, a ban whose end is not told, and a session a ban ended (H464). */
export const BANNED_PERMANENT_ADAPTATION = `This account is banned. ${BAN_CONTACT_ADAPTATION}`;

/** BANNED_UNTIL_ADAPTATION: a ban with an end; `<when>` is `banWhen`'s (H464). */
export const BANNED_UNTIL_ADAPTATION = `This account is banned until <when>. ${BAN_CONTACT_ADAPTATION}`;

/**
 * BANNED_SHORT_ADAPTATION: the short form, for a surface that can hold only a short line. Unused today: the classic
 * dialog holds the whole sentence (`classicBanText`, measured in `lobbyClientBan.test.ts`). Kept so a smaller surface
 * has its words here.
 */
export const BANNED_SHORT_ADAPTATION = 'This account is banned.';

/** BAN_REASON_LINE_ADAPTATION: the public reason's own line; `<reason>` is the operator's text, cut (`BAN_REASON_MAX_ADAPTATION`). */
export const BAN_REASON_LINE_ADAPTATION = 'Reason: <reason>';

/** BAN_REASON_MAX_ADAPTATION: the reason is cut at this many characters (code points, never half a pair). */
export const BAN_REASON_MAX_ADAPTATION = 500;

/** BAN_MONTHS_ADAPTATION: fixed English month abbreviations -- never `toLocaleString`, whose output differs by machine. */
export const BAN_MONTHS_ADAPTATION = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A zone: the minutes east of UTC at the instant `at` (ms), or null where it cannot be computed. */
export type ZoneOffset = (at: number) => number | null;

/** The browser's own zone at `at`: `Date`'s offset (minutes west) turned east. */
export const localZoneOffset: ZoneOffset = (at) => {
  const west = new Date(at).getTimezoneOffset();
  return Number.isFinite(west) ? -west : null;
};

/** The largest time `Date` holds (ECMA-262's time value range), in ms. */
const MAX_TIME = 8.64e15;

const two = (n: number): string => String(n).padStart(2, '0');

/** `ms` read as UTC fields: `15 Nov 2026 02:30` -- the day without a leading zero, 24-hour time, minutes truncated. */
export function banStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${BAN_MONTHS_ADAPTATION[d.getUTCMonth()]} ${d.getUTCFullYear()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/**
 * The ban's end as said: the local date and time, then UTC -- `14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC)` -- or, where
 * the zone cannot be computed (`offsetMinutes` null or not a number), UTC alone: `15 Nov 2026 02:30 UTC`.
 */
export function banWhen(until: number, offsetMinutes: number | null): string {
  const utc = `${banStamp(until)} UTC`;
  if (offsetMinutes === null || !Number.isFinite(offsetMinutes)) return utc;
  return `${banStamp(until + offsetMinutes * 60_000)} (${utc})`;
}

/** The reply's `ban` read: `until` a time or null, `reason` kept only as a string; anything else is no ban (null). */
export function shownBanOf(v: unknown): ShownBan | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const until = o['until'];
  if (until !== null && !(typeof until === 'number' && Number.isFinite(until) && Math.abs(until) <= MAX_TIME)) return null;
  const reason = o['reason'];
  return typeof reason === 'string' ? { until, reason } : { until };
}

/** The ban's sentence: timed when its end is told, else the permanent one. The zone is asked at the ban's end. */
export function banSentence(ban: ShownBan | null, zone: ZoneOffset): string {
  if (!ban || ban.until === null) return BANNED_PERMANENT_ADAPTATION;
  const until = ban.until;
  return BANNED_UNTIL_ADAPTATION.replace('<when>', () => banWhen(until, zone(until)));
}

/**
 * The reason's line, or null when no reason is present (or it is blank): each run of whitespace one space and the ends
 * trimmed (OPS-F1: a line break in the operator's text must not start a line of its own that reads as the page's words),
 * then cut at `BAN_REASON_MAX_ADAPTATION`; nothing else altered -- `#C`, `#B`, markup and entities stay as typed, text.
 */
export function banReasonLine(ban: ShownBan | null): string | null {
  const reason = ban?.reason;
  if (typeof reason !== 'string' || reason.trim() === '') return null;
  const cut = Array.from(reason.replace(/\s+/g, ' ').trim()).slice(0, BAN_REASON_MAX_ADAPTATION).join('');
  return BAN_REASON_LINE_ADAPTATION.replace('<reason>', () => cut);
}

/** The modern surfaces' words: the sentence, then the reason on its own line when present. */
export function banWords(ban: ShownBan | null, zone: ZoneOffset): string {
  const reason = banReasonLine(ban);
  const sentence = banSentence(ban, zone);
  return reason === null ? sentence : `${sentence}\n${reason}`;
}

/**
 * The classic LOGIN's failure text for -972 (`./lobbyClient`, MP_MEDIUS_ERROR's argument where the original passes
 * "Login Failure"): the sentence with its date, never the reason. What decides it: `dlgNetConnect.rdr`'s `OnNetError`
 * popup is 340 x 200 and wraps at 290 (its POPUP record in `RUN/UIZANIM.ZAR`, research 157 §5), and the permanent
 * sentence and the longest timed one take no more lines than the original's own #543 and #545 fill in that screen's
 * 340 x 150 popups (6), none past the wrap -- measured on the disc's record and face by `lobbyClientBan.test.ts` -- so
 * they fit the dialog unchanged. The reason is left out: up to 500 characters does not fit, and the popup's text setter
 * reads `#C` and `#B` in its bytes as colour and bright codes (`../text/wrapped` `wrapLines`, `FUN_00379f70`), so an
 * operator's text would not be shown as text there.
 */
export function classicBanText(ban: ShownBan | null, zone: ZoneOffset): string {
  return banSentence(ban, zone);
}
