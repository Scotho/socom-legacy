import { MP_NAME_KEY, PERSONA_NAME_MAX, type PersonaRecord } from '@s2u/card';
import type { Rgba } from '@s2u/gs';
import { PERSONA_LIST_ROWS, ladderMedal } from '@s2u/ui';
import { accountServiceBase } from '../../connectHost';
import { LADDER_SESSION_LOST, fetchLadderService } from '../../ladderLobbyHost';
import { buildMultiplayerEnabled } from '../../multiplayer';
import { pageSettings } from '../../pageStore';
import { locKeyId } from '../../tauntSettings';
import { fetchUniverseService, universeServiceBase } from '../../universeHost';
import type { DiscAssets } from '../../modern/discAssets';
import { launcherState, type LauncherState } from '../../modern/launcherState';
import { SERVER_OFFLINE, SERVER_UNAVAILABLE } from '../../modern/lobbies/data';
import {
  PHRASE_SLOTS, cardProfileEdits, keyOf, personaNameProblem, phraseProblem, pruneSpaces, townProblem, type ProfileCardEdits,
} from '../../modern/profile/cardEdits';
import type { ServerDetail } from '../../modern/report/serverDetail';
import { pageSession, type ModernSession } from '../../modern/session';
import { rgbaPngUrl } from '../rgbaPng';
import {
  OVERLAY_LOCK_WORDS, type PersonaCreate, type PersonaEditorView, type PersonaListView, type PersonaLock, type PersonaOutcome, type PersonaRow,
  type PhraseKind, type PhraseRow, type ProfileAdapter, type RankView, type RecordMission, type ServiceRecordView,
} from '../state';
import { readUniverseHost, universeFailureDetail, universeFailureWords, type UniverseHost } from '../universe';

/**
 * The console's Persona and Service record (CX-PERSONA of `docs/plans/2026-10-11-console-launcher.md`; OT.R60 (c)),
 * DOM-free -- drawn by `../render/profile` and driven by `../grammar`. It took over the modern Profile section
 * (`src/modern/profile/index.ts`, `personas.ts`, `phrases.ts`: MU-4, MU-12b, MU-13c, MU-13e, MU2-3, MU2-7; retired with this
 * row), its rules ported one for one. A browser adaptation (MU.R1), labelled as one: it adds no screen to the original
 * and changes none.
 *
 * - **Signed out** the card's personas are read exactly as the original's persona form reads them (`PersonaCard.load`,
 *   slot 1 then slot 2 -- `PERSONA_LOAD_ADAPTATION`, `../../personaHost`; `../../modern/profile/cardEdits`' `open`), with
 *   their names and hosts. The card's persona record holds no rank (`PersonaRecord`: HOST, NAME, TOWN, GENDER, PORT, the
 *   password's length, SAVEPASSWORD, PROFILES), so signed out there is none.
 * - **Signed in** the Service record reads two routes, each with the session's bearer ticket and no cookie, when its
 *   screen opens (OT.R14): `POST /modern/account` with an empty JSON body (POST, not GET: a browser sends no `Origin` on
 *   a same-origin GET and the route's Origin check needs one -- the MU-3 review's ruling, 2026-10-09) -- the display
 *   name, the clan, friend and ignore counts, whether the account is on the board (`ratedOnce`, SVC-23a, OT.R33 call 5
 *   (b)) and PLAYER INFO's rows -- and `GET /lobby/loadout` (SVC-24's route, as the original page reads it), whose
 *   records the record lists mission by mission. PLAYER INFO's rows are the SERVER's (MU-12b: `statsRecord.ts`'s
 *   `playerInfoLines`; the viewer does not depend on the server package), handed on as they come, in the original's order
 *   -- `No matches recorded yet` over a record never posted, nothing invented.
 * - **The rank (MU2-3).** The original draws a persona's rank as his medal of merit beside his name (research 155 §3,
 *   R155.11): the client asks its position (`LadderPosition_ExtraInfo`, Lobby 0xf1, stat 0, order 1) and computes the
 *   medal 0-5 of the answer's position and total (`FUN_002eb010` D:L188994-189051; `FUN_002eaee0` D:L188934-188970,
 *   `@s2u/ui` `ladderMedal`). The same service the ladder page asks (ONL-30a's `../../ladderLobbyHost`
 *   `fetchLadderService`: `POST /lobby/ladder-position`), on its own -- the record never waits for it -- and the medal named
 *   by PLAYER RANKING's RANK INSIGNIA legend (`PROFILE_RANKS`). Its mark: the design's `star` while no disc is in (the
 *   design's stand-in); with the disc in, the disc's own picture of that medal (MU2-7: `Medal_*.tif` through
 *   `../../modern/discAssets` `readMedalPictures`, read once per image, as a PNG data URL, `../rgbaPng`), nothing while it
 *   reads or if it fails (MU.R3). Medal 0 -- a total of 0, a failed answer, no answer -- is no rank, as `null.tif`; a failed
 *   answer leaves the medal as it was (`FUN_002eb010` writes nothing on one; MU2-3's review F1).
 * - **The edits (MU.R2: the card's storage rules unchanged).** Nothing is stored here. The match name (`s2u.mp.name`,
 *   `MP_NAME_KEY`: W3.R12's field, which the card's `mpNameMigration` reads into the persona) through the card package's
 *   `Settings.set` under the field's own rule (`cleanMatchName`). A persona's HOME TOWN and GENDER, a new persona, Delete,
 *   and the card's five taunts and five team messages through `../../modern/profile/cardEdits` (`PersonaCard`'s own write
 *   paths, one open card to a write) under its checks -- the name keyboard's and the hometown keyboard's limits, at most
 *   three a server, `phraseProblem`. The persona's NAME is read only: it is the login's identity (`FUN_002fbce0`
 *   D:L199060-199062) and the card package has no rename. A new persona is filed under the universe the player connects
 *   to (`../universe` `readUniverseHost`). The password is neither shown nor changed.
 * - **The phrases' game text (MU.R3).** A game-written card holds a slot as a HudCLOC key, and a slot never edited holds
 *   none: its text is the disc's caption (`HudCLOC.rdr`). Without the disc that slot is "Insert disc to see", never the key
 *   as text and never a text made up; with it the caption, read once per image.
 * - **Refusals** in the section's words; a 401 ends the session (once a read); a 403 is the origin gate, not a lost one.
 * - **In the overlay** (OT.R60) the session is the overlay's (`../../modern/overlay/session` `overlaySession`): the game's
 *   own persona when the game holds one, read and never driven. The edits wait over any game page -- the game's front end
 *   keeps and saves its own list of the card's personas, so an edit from here could race it -- and elsewhere in the
 *   overlay while the game holds the account or a round runs (`follow`, the console's `personaEditLock`), each with its
 *   line (`OVERLAY_LOCK_WORDS`). The record and the persona screens stay readable.
 *
 * Every string from the card, the disc, the server or the page is handed on as data; the screens set it as text.
 */

export const PROFILE_ADAPTATION = 'a browser profile over the card and the server record, not part of the original' as const;

/**
 * The ranks by medal of merit (research 155 §2.3, R155.9): PLAYER RANKING's RANK INSIGNIA legend, `dlgLadderLobby.rdr`'s
 * literal TEXT widgets `admiral_text` .. `ensign_text` and their bands `adm_text_desc` .. `ensign_text_desc` (read off
 * the disc by `packages/ui/test/screens/ladderLobbyScreen.test.ts`), each beside its medal -- 5 `Medal_Black` ..
 * 1 `Medal_Blue`, the index the medal column's texture (0 `null.tif`, no rank). 1-4 are the room list's ELIGIBLE RANKS
 * (`@s2u/ui` `ELIGIBLE_RANKS`). Moved from the retired section unchanged.
 */
export const PROFILE_RANKS = {
  1: { rank: 'ENSIGN', band: 'LOWEST 15%' },
  2: { rank: 'LIEUTENANT', band: 'NEXT 30-85%' },
  3: { rank: 'LT. COMMANDER', band: 'NEXT 5-30%' },
  4: { rank: 'CAPTAIN', band: 'TOP 5%' },
  5: { rank: 'ADMIRAL', band: 'TOP 10 PLAYERS' },
} as const satisfies Readonly<Record<1 | 2 | 3 | 4 | 5, { rank: string; band: string }>>;

/** The field's rule (`main.ts` `#mp-name`, `mpNameMigration.parse`): printable ASCII, whitespace collapsed, 30 at most. */
export function cleanMatchName(raw: string): string {
  return raw.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}
/** The match name's cap (`cleanMatchName`'s 30; the section's field `maxLength`). */
export const MATCH_NAME_MAX = 30;

/** A persona's record key as one string: HOST, PORT and NAME (the account list's key, `FUN_002fbce0`). */
export const personaId = (p: Pick<PersonaRecord, 'HOST' | 'PORT' | 'NAME'>): string => `${p.HOST}\u0000${p.PORT}\u0000${p.NAME}`;

const PHRASE_KINDS = {
  taunts: { noun: 'Taunt', base: 60762, help: 'Sent to your enemies when you pick a custom taunt in a match.' },
  messages: { noun: 'Message', base: 60757, help: 'Sent to your team from the Chat menu in a match.' },
} as const;

/**
 * The retired section's words, kept (`index.ts`, `personas.ts`, `phrases.ts`): the card's states, the new persona's, the
 * phrases' gates, the delete's question. `signedOutRecord` joins its signed-out card's title and line.
 */
export const PERSONA_WORDS = {
  cardUnreadable: 'The memory card cannot be read here (its save file did not read), so nothing is listed or changed.',
  empty: 'No persona on the card yet',
  slot: (n: number): string => `Personas from memory card slot ${n}`,
  hostLoading: 'Reading the server a new persona is filed under',
  full: `A server holds ${PERSONA_LIST_ROWS} personas at most: delete one to add another.`,
  server: (host: string, port: number): string => `Server: ${host === '' ? 'this server' : host}${port ? `:${port}` : ''}`,
  insertDisc: 'Insert disc to see',
  readingDisc: 'Reading the disc',
  discTextUnavailable: 'Disc text unavailable',
  shared: 'Saved on the memory card, for every persona on this card.',
  deleteLead: (name: string): string => `Delete the persona ${name}? It is removed from the memory card.`,
  matchNameSub: 'Name shown in test-room matches',
  signedOutRecord: 'Sign in to see your service record. Your record and loadouts are kept on the server.',
  gone: 'That persona is no longer on the memory card',
  cardRefused: 'the memory card refused the write',
} as const;

interface InfoRow { label: string; value: string }
interface Account { name: string; clan: string | null; friends: number; ignored: number; ladderPosted: boolean; posted: boolean; unreadable: boolean; rows: InfoRow[] }
interface Side { valid: boolean }
interface Loadout { mission: string; seal: Side | null; terrorist: Side | null }
type Load<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string; lost?: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const UNEXPECTED = 'Unexpected answer from the server';

/** `/modern/account`'s answer, as the retired section parsed it (`parseAccount`); null when it is not of the shape. */
function parseAccount(v: unknown): Account | null {
  if (!isObj(v) || typeof v['displayName'] !== 'string' || !isObj(v['serviceRecord'])) return null;
  const r = v['serviceRecord'];
  const clan = r['clan'];
  if (!(clan === null || (isObj(clan) && typeof clan['name'] === 'string'))) return null;
  if (!isCount(r['friends']) || !isCount(r['ignored']) || typeof r['ladderPosted'] !== 'boolean') return null;
  const st = r['stats'];
  if (!isObj(st) || typeof st['posted'] !== 'boolean' || !Array.isArray(st['rows'])) return null;
  const rows: InfoRow[] = [];
  for (const x of st['rows'] as unknown[]) {
    if (!isObj(x) || typeof x['label'] !== 'string' || typeof x['value'] !== 'string') return null;
    rows.push({ label: x['label'], value: x['value'] });
  }
  return {
    name: v['displayName'], clan: clan === null ? null : String(clan['name']), friends: r['friends'], ignored: r['ignored'], ladderPosted: r['ladderPosted'],
    posted: st['posted'], unreadable: st['unreadable'] === true, rows,
  };
}
function parseSide(v: unknown): Side | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isCount(v['charSet']) || typeof v['valid'] !== 'boolean' || !Array.isArray(v['items']) || !v['items'].every(isCount)) return undefined;
  return { valid: v['valid'] };
}
/** `/lobby/loadout`'s answer (the retired section's `parseLoadouts`): the records, mission by mission. */
function parseLoadouts(v: unknown): Loadout[] | null {
  if (!isObj(v) || !Array.isArray(v['loadouts'])) return null;
  const out: Loadout[] = [];
  for (const e of v['loadouts'] as unknown[]) {
    if (!isObj(e) || typeof e['mission'] !== 'string') return null;
    const seal = parseSide(e['seal']); const terrorist = parseSide(e['terrorist']);
    if (seal === undefined || terrorist === undefined) return null;
    out.push({ mission: e['mission'], seal, terrorist });
  }
  return out;
}
/** A side's cell as the retired section said it: Set, Saved (the record's valid byte clear), Not set. */
const sideWord = (s: Side | null): string => (!s ? 'Not set' : s.valid ? 'Set' : 'Saved');

/**
 * A refusal in words (MU-P1c 18): 401 the session lost; 403 the origin gate (no Sec-Fetch-Site, Safari < 16.4), not a
 * lost session; anything else -- an HTTP 500 among them -- the launcher's one wording for a server that answers but fails.
 * No status code is said.
 */
const WORDS = (status: number): string =>
  status === 401 ? 'Your session ended. Sign in again'
  : status === 403 ? 'The server refused this request'
  : `${SERVER_UNAVAILABLE}.`;

export interface ProfileDeps {
  /** The session (absent: the page's, `../../modern/session` `pageSession`); the overlay's `overlaySession` there. */
  session?: ModernSession;
  /** The disc's state and its readers (absent: the disc store's, `../../modern/launcherState`). */
  launcher?: LauncherState;
  /** The server's base (absent: `accountServiceBase` over `win`'s address). */
  base?: string;
  /** The window whose address the bases are built from (OVERLAY-CONSOLE: the game page's, never the frame's). */
  win?: Window;
  fetchFn?: typeof fetch;
  /** The card's edits (absent: the page's card, `cardProfileEdits()`). */
  edits?: ProfileCardEdits;
  /** The card package's settings (MU.R2; absent: the page's, `pageSettings`). */
  settings?: { get(key: string): string | null; set(key: string, value: string): { ok: boolean } };
  /**
   * The universe a new persona is filed under (absent: the page's universe service, `../../universeHost` -- with the
   * build's multiplayer switch off, `../../multiplayer`, no request: the read fails as no answer, Offline).
   */
  readHost?: () => Promise<UniverseHost>;
  /** HudCLOC.rdr's captions (absent: the image in now's, `launcher.assets().readTauntCaptions`). */
  readCaptions?: () => Promise<Readonly<Record<string, string>>>;
  /** After each write the card took (the console's card adapter reads it again). */
  onCardWrite?: () => void;
  /** After the match name is written: the page's own `#mp-name` field kept in step (`main.ts` writes its own on its change). */
  onMatchName?: (name: string) => void;
  /** The universe read's failure detail for the Report (`../../modern/report/serverDetail`), or null when it read. */
  noteDetail?: (d: ServerDetail | null) => void;
}

export type LiveProfile = ProfileAdapter & { dispose(): void };

/**
 * Whether a card's persona is the one signed in (CX-PERSONA's review F3): its name, and -- once this page's server is
 * read (`here`, the universe entry's host and port) -- its server too, so the same name kept for two servers marks only
 * this one. Before the server is read, the name alone. Display only.
 */
export function personaSignedIn(p: { NAME: string; HOST: string; PORT: number }, name: string | null, here: { host: string; port: number } | null): boolean {
  if (name === null || p.NAME !== name) return false;
  return here === null || (p.HOST === here.host && p.PORT === here.port);
}

/**
 * NET_CENSOR_TEXT_PLACEHOLDER (research 101's ledger, research 153 §8): the original filters a home town and a phrase
 * through `NetCensorText` on the online front end; here, as the retired section did, nothing is filtered -- the text
 * stays as typed -- until the reply's rules are read.
 */
export function liveProfile(notify: () => void, deps: ProfileDeps = {}): LiveProfile {
  const session = deps.session ?? pageSession();
  const launcher = deps.launcher ?? launcherState();
  const win = (): Window => deps.win ?? globalThis.window;
  const base = deps.base ?? accountServiceBase(win().location.search, win().location, (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true);
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const edits = deps.edits ?? cardProfileEdits();
  const settings = deps.settings ?? pageSettings;
  const readHost = deps.readHost ?? ((): Promise<UniverseHost> => (buildMultiplayerEnabled()
    ? readUniverseHost(fetchUniverseService(universeServiceBase(win().location.search, win().location), fetchFn))
    : Promise.reject(new TypeError('multiplayer is off in this build'))));
  const readCaptions = deps.readCaptions ?? ((): Promise<Readonly<Record<string, string>>> => {
    const assets = launcher.assets?.() ?? null;
    return assets?.readTauntCaptions ? assets.readTauntCaptions() : Promise.reject(new Error('no opened image behind the launcher'));
  });

  let disposed = false;
  let lockOf: () => PersonaLock | null = () => null;
  const ping = (): void => { if (!disposed) notify(); };

  // ----- the card

  let host: { kind: 'idle' | 'loading' } | { kind: 'ready'; host: UniverseHost } | { kind: 'error'; message: string } = { kind: 'idle' };
  let hostGen = 0;
  let captions: { kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; value: Readonly<Record<string, string>> } = { kind: 'idle' };

  function loadHost(): void {
    const g = ++hostGen;
    host = { kind: 'loading' };
    let pending: Promise<UniverseHost>;
    try { pending = readHost(); } catch (e) { pending = Promise.reject(e); }
    // MU-P1c 18: no raw detail in the UI; MU-P2 (review r2, P3-2): it goes to the Report's context instead.
    pending.then((h) => { if (g !== hostGen) return; host = { kind: 'ready', host: h }; deps.noteDetail?.(null); },
      (e: unknown) => { if (g !== hostGen) return; host = { kind: 'error', message: universeFailureWords(e) }; deps.noteDetail?.(universeFailureDetail(e)); })
      .then(() => { if (g === hostGen) ping(); });
  }

  const lockLine = (): string | null => {
    const l = lockOf();
    return l === 'card' ? OVERLAY_LOCK_WORDS.editCard : l === 'game' ? OVERLAY_LOCK_WORDS.editGame : l === 'round' ? OVERLAY_LOCK_WORDS.editRound : null;
  };
  const no = (words: string): PersonaOutcome => ({ ok: false, words });
  /** Why an edit of the card cannot be tried now: the lock, or a card that cannot be read; null when it can. */
  const guard = (): PersonaOutcome | null => {
    const l = lockLine();
    if (l) return no(l);
    return edits.usable() ? null : no(PERSONA_WORDS.cardUnreadable);
  };
  /** Why the card refused the last write (`cardEdits` `refusal`, MU-F2b), else the general reason. */
  const refusedBecause = (): string => edits.refusal?.() || PERSONA_WORDS.cardRefused;
  const find = (id: string): PersonaRecord | undefined => edits.personas().find((p) => personaId(p) === id);
  const wrote = (words: string): PersonaOutcome => { deps.onCardWrite?.(); ping(); return { ok: true, words }; };
  const signedName = (): string | null => (session.state() === 'signed-in' ? session.account()?.name ?? null : null);

  function createState(held: readonly PersonaRecord[]): PersonaCreate {
    if (host.kind === 'error') return { kind: 'failed', line: host.message };
    if (host.kind !== 'ready') return { kind: 'loading', line: PERSONA_WORDS.hostLoading };   // idle or loading
    const h = host.host;
    if (held.filter((p) => p.HOST === h.host && p.PORT === h.port).length >= PERSONA_LIST_ROWS) return { kind: 'full', line: PERSONA_WORDS.full };
    return { kind: 'ready', host: h.host, port: h.port, line: PERSONA_WORDS.server(h.host, h.port) };
  }

  /**
   * The disc's caption for a slot that holds the game's text: a string, or why none is shown (no disc: locked). A running
   * game's disc (`in-game`) is the disc in, as the rank's mark reads it (the seat's call, 2026-10-17).
   */
  function caption(kind: PhraseKind, slot: number, held: string | null): string | 'locked' | 'reading' | 'unavailable' {
    if (!launcher.isoInserted() && launcher.disc() !== 'in-game') return 'locked';
    if (captions.kind === 'idle') {
      captions = { kind: 'loading' };
      let p: Promise<Readonly<Record<string, string>>>;
      try { p = readCaptions(); } catch (e) { p = Promise.reject(e); }
      const entry = captions;
      p.then((value) => { if (captions === entry) captions = { kind: 'ready', value }; }, () => { if (captions === entry) captions = { kind: 'error' }; })
        .then(() => { if (captions.kind !== 'loading') ping(); });
    }
    if (captions.kind === 'loading') return 'reading';
    if (captions.kind !== 'ready') return 'unavailable';
    const id = held === null ? PHRASE_KINDS[kind].base + slot : locKeyId(held) ?? PHRASE_KINDS[kind].base + slot;
    return captions.value[String(id)] ?? 'unavailable';
  }
  function phraseRows(kind: PhraseKind): PhraseRow[] {
    const held = kind === 'taunts' ? edits.taunts() : edits.messages();
    const out: PhraseRow[] = [];
    for (let slot = 0; slot < PHRASE_SLOTS; slot++) {
      const h = held[slot] ?? null;
      const label = `${PHRASE_KINDS[kind].noun} ${slot + 1}`;
      if (h !== null && locKeyId(h) === null) { out.push({ kind, slot, label, value: h, own: true, gated: null }); continue; }
      const c = caption(kind, slot, h);
      if (c === 'locked') out.push({ kind, slot, label, value: PERSONA_WORDS.insertDisc, own: false, gated: 'locked' });
      else if (c === 'reading') out.push({ kind, slot, label, value: PERSONA_WORDS.readingDisc, own: false, gated: 'reading' });
      else if (c === 'unavailable') out.push({ kind, slot, label, value: PERSONA_WORDS.discTextUnavailable, own: false, gated: 'unavailable' });
      else out.push({ kind, slot, label, value: c, own: false, gated: null });
    }
    return out;
  }

  // ----- the record

  let active = false;
  let account: Load<Account> = { kind: 'idle' };
  let loadouts: Load<Loadout[]> = { kind: 'idle' };
  /** My medal of merit 0-5; 0 until the position answers, and kept through a failed answer. */
  let medal = 0;
  let generation = 0;
  /** MU2-7: the disc's medal pictures, for the image they were read from (once per image), each medal's URL made once. */
  let medals: { from: DiscAssets; state: Load<ReadonlyMap<number, Rgba>>; urls: Map<number, string> } | null = null;

  async function get(path: string, ticket: string): Promise<{ status: number; body: unknown }> {
    // `/modern/*` is POST with an empty JSON body (`central/src/modernHttp.ts`); `/lobby/loadout` the original page's GET.
    const post = path.startsWith('/modern/');
    const res = await fetchFn(`${base}${path}`, {
      method: post ? 'POST' : 'GET', headers: { ...(post ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${ticket}` },
      ...(post ? { body: '{}' } : {}), credentials: 'omit', cache: 'no-store',
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, body };
  }

  /**
   * My medal: the position answer's position and total through `ladderMedal`, from a Success only. Any other answer is
   * null: the medal is left as it was, as `FUN_002eb010` writes nothing on a failed answer. A 401 is the session lost.
   */
  async function readMedal(ticket: string): Promise<number | null | typeof LADDER_SESSION_LOST> {
    try {
      const r = await fetchLadderService(base, fetchFn).position(ticket);
      if (r === LADDER_SESSION_LOST) return r;
      return r.status === 0 ? ladderMedal(r.ladderPosition, r.totalRankings) : null;
    } catch {
      return null;
    }
  }

  async function load(): Promise<void> {
    const ticket = session.ticket();
    if (session.state() !== 'signed-in' || !ticket) { account = { kind: 'idle' }; loadouts = { kind: 'idle' }; medal = 0; return; }
    const gen = ++generation;
    account = { kind: 'loading' }; loadouts = { kind: 'loading' };
    const settle = async <T,>(path: string, parse: (v: unknown) => T | null): Promise<Load<T>> => {
      try {
        const r = await get(path, ticket);
        if (r.status !== 200) return { kind: 'error', message: WORDS(r.status), lost: r.status === 401 };
        const v = parse(r.body);
        return v === null ? { kind: 'error', message: UNEXPECTED } : { kind: 'ready', value: v };
      } catch {
        return { kind: 'error', message: `${SERVER_OFFLINE}.` };
      }
    };
    // A ticket the server no longer holds (401) ends the session once, by its own API.
    let lost = false;
    const lose = (): void => { if (!lost) { lost = true; void session.signOut(); } };
    // The rank on its own: its answer lands when it lands; the record does not wait for it.
    void readMedal(ticket).then((m) => {
      if (gen !== generation || disposed) return;
      if (m === LADDER_SESSION_LOST) { lose(); return; }
      if (m === null) return;                                         // a failed answer writes nothing (FUN_002eb010)
      medal = m;
      ping();
    });
    const [a, l] = await Promise.all([settle('/modern/account', parseAccount), settle('/lobby/loadout', parseLoadouts)]);
    if (gen !== generation || disposed) return;                       // signed out (or in again) meanwhile: not taken
    account = a; loadouts = l;
    if ([a, l].some((x) => x.kind === 'error' && x.lost)) lose();     // 401 only: a 403 is the origin gate
    ping();
  }

  /** The rank's mark (MU2-3's review F2, MU2-7): the star with no disc in; the disc's picture once read; else none. */
  function rankOf(): RankView | null {
    if (medal < 1 || medal > 5) return null;
    const r = PROFILE_RANKS[medal as keyof typeof PROFILE_RANKS];
    const discIn = launcher.isoInserted() || launcher.disc() === 'in-game';
    if (!discIn) return { medal, ...r, mark: 'star', picture: null };
    const assets = launcher.assets?.() ?? null;
    if (!assets?.readMedalPictures) return { medal, ...r, mark: 'none', picture: null };
    if (medals?.from !== assets) {
      const entry: NonNullable<typeof medals> = { from: assets, state: { kind: 'loading' }, urls: new Map() };
      medals = entry;
      assets.readMedalPictures().then((value) => { entry.state = { kind: 'ready', value }; },
        (e: unknown) => { entry.state = { kind: 'error', message: e instanceof Error ? e.message : String(e) }; })
        .then(() => { if (medals === entry) ping(); });
    }
    const pic = medals.state.kind === 'ready' ? medals.state.value.get(medal) : undefined;
    if (!pic) return { medal, ...r, mark: 'none', picture: null };
    let url = medals.urls.get(medal);
    if (url === undefined) { url = rgbaPngUrl(pic) ?? ''; medals.urls.set(medal, url); }
    if (url === '') return { medal, ...r, mark: 'none', picture: null };   // a picture it cannot write (review F1)
    return { medal, ...r, mark: 'medal', picture: url };
  }

  const offSession = session.onChange(() => {
    generation++;
    account = { kind: 'idle' }; loadouts = { kind: 'idle' }; medal = 0;
    if (active) void load();
    ping();
  });
  // A new image: its own captions and medal pictures (each read again on demand).
  const offDisc = launcher.onChange(() => { captions = { kind: 'idle' }; ping(); });

  return {
    open(screen): void {
      if (screen === 'persona') { if (host.kind === 'idle') loadHost(); return; }
      active = true;
      if (account.kind === 'idle' || account.kind === 'error') void load();
    },
    personas(): PersonaListView {
      if (!edits.usable()) return { kind: 'unreadable', line: PERSONA_WORDS.cardUnreadable };
      const held = edits.personas();
      const name = signedName();
      const slot = edits.slot();
      const here = host.kind === 'ready' ? { host: host.host.host, port: host.host.port } : null;
      const rows: PersonaRow[] = held.map((p) => ({ id: personaId(p), name: p.NAME, host: p.HOST, signedIn: personaSignedIn(p, name, here) }));
      return {
        kind: 'ok', slotLine: slot === null ? '' : PERSONA_WORDS.slot(slot), rows, empty: held.length === 0 ? PERSONA_WORDS.empty : null,
        signedIn: name, held: rows.some((r) => r.signedIn), create: createState(held), locked: lockLine(),
      };
    },
    editor(id): PersonaEditorView {
      if (!edits.usable()) return { kind: 'gone' };
      const p = find(id);
      if (!p) return { kind: 'gone' };
      return {
        kind: 'ok', id, name: p.NAME, host: p.HOST, town: p.TOWN, gender: p.GENDER === 1 ? 1 : 0,   // PLAYERGENDER 1 Female (`FUN_00275130`)
        phrases: [...phraseRows('taunts'), ...phraseRows('messages')],
        help: { taunts: `${PHRASE_KINDS.taunts.help} ${PERSONA_WORDS.shared}`, messages: `${PHRASE_KINDS.messages.help} ${PERSONA_WORDS.shared}` },
        locked: lockLine(),
      };
    },
    matchName: () => settings.get(MP_NAME_KEY) ?? '',
    setMatchName(raw): PersonaOutcome {
      const l = lockLine();
      if (l) return no(l);
      const name = cleanMatchName(raw);
      if (!name) return no('Enter a name: printable characters only');
      if (!settings.set(MP_NAME_KEY, name).ok) return no('Name not saved: this browser refused the write');
      // KNOWN LIMIT (the section's): main.ts also sends { type: 'name' } to a live match; that is not exported, so a match
      // already open keeps the old name until the page's own field changes (main.ts is not edited from here).
      deps.onMatchName?.(name);
      ping();
      return { ok: true, words: 'Match name saved' };
    },
    setTown(id, town): PersonaOutcome {
      const g = guard();
      if (g) return g;
      const p = find(id);
      if (!p) return no(PERSONA_WORDS.gone);
      const why = townProblem(town);
      if (why) return no(why);
      if (!edits.setPersonaTown(keyOf(p), town)) return no(`Home town not saved: ${refusedBecause()}`);
      return wrote('Home town saved');
    },
    setGender(id, gender): PersonaOutcome {
      const g = guard();
      if (g) return g;
      const p = find(id);
      if (!p) return no(PERSONA_WORDS.gone);
      if ((p.GENDER === 1 ? 1 : 0) === gender) return { ok: true, words: '' };   // the one held: nothing written
      if (!edits.setPersonaGender(keyOf(p), gender)) return no(`Gender not saved: ${refusedBecause()}`);
      return wrote(`Gender: ${gender === 1 ? 'Female' : 'Male'}`);
    },
    setPhrase(kind, slot, text): PersonaOutcome {
      const g = guard();
      if (g) return g;
      const why = phraseProblem(text);
      if (why) return no(why);
      const noun = PHRASE_KINDS[kind].noun;
      const ok = kind === 'taunts' ? edits.setTaunt(slot, text) : edits.setMessage(slot, text);
      if (!ok) return no(`${noun} not saved: ${refusedBecause()}`);
      return wrote(`${noun} ${slot + 1} saved`);
    },
    create(p): PersonaOutcome & { id?: string } {
      const g = guard();
      if (g) return g;
      if (host.kind !== 'ready') return no(host.kind === 'error' ? host.message : PERSONA_WORDS.hostLoading);
      const h = host.host;
      const clean = pruneSpaces(p.name);
      const why = personaNameProblem(clean, edits.personas(), h.host, h.port) || townProblem(p.town);
      if (why) return no(why);
      if (!edits.createPersona({ name: clean, host: h.host, port: h.port, town: p.town, gender: p.gender })) return no(`Persona not created: ${refusedBecause()}`);
      return { ...wrote(`Persona ${clean} created`), id: personaId({ HOST: h.host, PORT: h.port, NAME: clean }) };
    },
    remove(id): PersonaOutcome {
      const g = guard();
      if (g) return g;
      const p = find(id);
      if (!p) return no(PERSONA_WORDS.gone);
      if (!edits.deletePersona(keyOf(p))) return no(`Not deleted: ${refusedBecause()}`);
      return wrote(`Persona ${p.NAME} deleted`);
    },
    retryHost(): void { loadHost(); },
    record(): ServiceRecordView {
      if (session.state() !== 'signed-in') return { kind: 'signed-out', line: PERSONA_WORDS.signedOutRecord };
      const name = account.kind === 'ready' ? account.value.name : session.account()?.name ?? '';
      const rec = account.kind === 'ready'
        ? (() => {
          const r = account.value;
          // The original shows PLAYER INFO of the default record for a record never posted; the note sits on top of its
          // rows. A version the server cannot read is a browser page's note (not the original's).
          const note = r.unreadable ? { text: 'This record\'s version can\'t be read', adaptation: true } : !r.posted ? { text: 'No matches recorded yet', adaptation: false } : null;
          return { kind: 'ok' as const, clan: r.clan ?? 'None', friends: r.friends, ignored: r.ignored, ladder: r.ladderPosted ? 'Posted' : 'Not posted', note, rows: r.rows };
        })()
        : account.kind === 'error' ? { kind: 'failed' as const, words: account.message } : { kind: 'loading' as const };
      const lo = loadouts.kind === 'ready'
        ? { kind: 'ok' as const, missions: loadouts.value.map((x): RecordMission => ({ mission: x.mission, seal: sideWord(x.seal), terrorist: sideWord(x.terrorist) })) }
        : loadouts.kind === 'error' ? { kind: 'failed' as const, words: loadouts.message } : { kind: 'loading' as const };
      return { kind: 'signed-in', name, rank: rankOf(), record: rec, loadouts: lo };
    },
    retry(): void { void load(); },
    follow(l): void { lockOf = l; },
    locked: lockLine,
    dispose(): void { disposed = true; generation++; hostGen++; offSession(); offDisc(); },
  };
}

/** The name keyboard's cap on the console's field (`_455_EnterPlayerName_MSG`: 14 characters, research 153 §3). */
export const NEW_NAME_MAX = PERSONA_NAME_MAX;
