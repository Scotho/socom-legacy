import { parseRdr, Zar } from '@s2u/archive';
import { FIRST_RELEASE_MAPS, isLobbyId, missionRecords, type CreateGameReply, type CreateGameRequest, type CreateGameService, type MissionRecord } from '@s2u/ui';
import { createGameOfferOf } from './multiplayerMaps';
import type { RoomListTransport } from './worldOfSocomHost';

/**
 * CREATE GAME's page half (ONL-13, web research 163 §5): CreateGame1 posted to SVC-06's `/lobby/create-game` (mounted
 * by SVC-07a behind `bearerIdentify`) at the page's own origin -- `accountServiceBase`, as the room list's, since the
 * request carries the session's live ticket -- and `missionlist.rdr` read off the player's disc for the PLAY LIST
 * (ONL-14, research 164). The briefing room's mount (ONL-12) hands both to `mountCreateGame` (`@s2u/ui`); this file
 * does not touch the page's session.
 */

/** A 401 for the create: the server holds no session for the ticket (`SESSION_LOST_READING`, `@s2u/ui`'s lobby client). */
export const CREATE_GAME_SESSION_LOST = 'session-lost' as const;

/** MediusCallbackStatus Fail (Horizon's -966): what any refusal that is not a 401 is read as. */
const FAIL = -966;

/**
 * CREATE_GAME_HTTP_ADAPTATION: 2xx the reply; 401 the session lost; any other status (403, 404, 429, 5xx), a reply of
 * another shape or no answer at all a Fail (-966), which cbCreateGame posts as MP_MEDIUS_JOIN_GAME_FAILURE: #295 and
 * back to the briefing room. The console's CreateGame1 travels on its lobby connection, where a refusal is a status;
 * a request the page's transport cannot complete is told to the player the way the original tells any failed create,
 * rather than leaving CREATING on the screen with TRIANGLE guarded. A browser adaptation (OT.R27).
 */
export const CREATE_GAME_HTTP_ADAPTATION = '2xx the reply; 401 the session lost; anything else Fail (-966)' as const;

/** The transport: `/lobby/create-game` asked with the ticket as its bearer. */
export interface CreateGameTransport {
  createGame(q: CreateGameRequest, ticket: string): Promise<CreateGameReply | typeof CREATE_GAME_SESSION_LOST>;
}

/** SVC-06's answer checked field by field (`{ status, mediusWorldId }`); anything else throws. */
export function createGameReplyOf(raw: unknown): CreateGameReply {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Number.isSafeInteger(r['status']) || !Number.isSafeInteger(r['mediusWorldId'])) throw new Error('create game reply: not the shape');
  const lobbyId = typeof r['lobbyId'] === 'string' && isLobbyId(r['lobbyId']) ? r['lobbyId'] : undefined;
  return { status: r['status'] as number, mediusWorldId: r['mediusWorldId'] as number, ...(lobbyId ? { lobbyId } : {}) };
}

/** The transport over `POST <base>/lobby/create-game` (`CREATE_GAME_HTTP_ADAPTATION`). */
export function fetchCreateGameService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): CreateGameTransport {
  return {
    createGame: async (q, ticket) => {
      try {
        const res = await fetchFn(`${base}/lobby/create-game`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ticket}` }, body: JSON.stringify(q),
          credentials: 'omit', cache: 'no-store',
        });
        if (res.status === 401) return CREATE_GAME_SESSION_LOST;
        if (!res.ok) return { status: FAIL, mediusWorldId: -1 };
        return createGameReplyOf(await res.json());
      } catch {
        return { status: FAIL, mediusWorldId: -1 };
      }
    },
  };
}

/**
 * The dialog's `CreateGameService` over the transport: the session's ticket read at the request -- none, no request
 * (as the room list's `ROOM_LIST_NO_TICKET_ADAPTATION`) -- and a 401 handed to `sessionLost` (`LobbyClient.sessionLost`:
 * state 2, MP_MEDIUS_ERROR, this dialog's `OnMultiplayerDisconnect`), the create then never answered.
 */
export function sessionCreateGame(t: CreateGameTransport, ticket: () => string | null, sessionLost: (ticket: string) => void): CreateGameService {
  return {
    createGame: async (q) => {
      const held = ticket();
      if (held === null) throw new Error('create game: no ticket');
      const r = await t.createGame(q, held);
      if (r === CREATE_GAME_SESSION_LOST) { sessionLost(held); throw new Error('create game: session lost'); }
      return r;
    },
  };
}

/** `missionlist.rdr` of the disc's `RUN/READERC.ZAR` (the game's mission table, `FUN_002c9540`), for `GetAvailableMPMissions`. */
export function missionsFromReaderc(bytes: Uint8Array): MissionRecord[] {
  const z = Zar.parse(bytes);
  const key = z.root.children.find((k) => k.name.toLowerCase() === 'missionlist.rdr');
  return key ? missionRecords(parseRdr(z.data(key))) : [];
}

/**
 * CREATE_GAME_OFFER_ADAPTATION (NB-7, OT.R50): the page asks the server what CREATE GAME offers -- `GET /maps` at the
 * page's own origin (`accountServiceBase`, as the create itself), once, with the room list's request
 * (`CreateGameOfferRead`) -- and lists the compiled `FIRST_RELEASE_MAPS` among those maps when the answer says
 * `offer: "served"` (the served rule, every server's since LATER 66; none among them, none listed); otherwise -- a
 * server before it -- or with no answer, the compiled four. The offer
 * ordinarily narrows the four (OT.R58, the owner 2026-10-16: "limit create match map list to 4 maps
 * (frostfire/crossroads/vig/nightfire)"; until then the served offer listed every map the server plays, OT.R50).
 * The original's PLAY LIST is `FUN_00274940`'s rows of the maps present (D:L121473-121555), with no such request: which
 * BAM.R4's explicitly enabled local test server also sends `allCreateGameMaps: true`, offering its whole played set.
 * Which maps a server offers is its configuration. A browser adaptation of the transport (OT.R27); the rows, their order and
 * the dialog are the original's.
 */
export const CREATE_GAME_OFFER_ADAPTATION = 'GET /maps once, with the room list; served: four defaults unless allCreateGameMaps is true (BAM.R4); else FIRST_RELEASE_MAPS' as const;

/**
 * One read of `<base>/maps` (MAPS-4's route, `./servedMaps` `MAPS_PATH`; not imported, so the front end's bundle does not
 * take the test room's online module with it) for CREATE GAME's offer (`createGameOfferOf`): the numbers of the four
 * it names (OT.R58; in the answer's order), or null
 * on a status that is not 2xx, a network error, a body not JSON or not a served offer, or -- with `timeoutMs` -- no
 * answer by then (the request aborted). Without one the read stands until it settles; meanwhile CREATE GAME lists the
 * release's four. `cache: 'no-cache'` and no header of its own, as `./servedMaps`' read.
 */
export async function fetchCreateGameOffer(
  base: string,
  fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
  timeoutMs?: number,
  scope?: (all: boolean) => void,
): Promise<number[] | null> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    if (timeoutMs !== undefined) timer = setTimeout(() => { abort.abort(); resolve(null); }, timeoutMs);
  });
  const read = (async (): Promise<number[] | null> => {
    try {
      const res = await fetchFn(`${base}/maps`, { signal: abort.signal, cache: 'no-cache' });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const offer = createGameOfferOf(body);
      // OT.R58: the four the offer names, never a map outside them -- CREATE GAME's list and the loadout editor alike.
      // BAM.R4: an explicitly enabled test server can offer every map it plays (product adaptation).
      const all = !!body && typeof body === 'object' && (body as { allCreateGameMaps?: unknown }).allCreateGameMaps === true;
      if (offer) scope?.(all);                                     // P537-L2: the server's word, for GAME LOBBY's BOTS too
      return offer && (all ? offer : offer.filter((n) => (FIRST_RELEASE_MAPS as readonly number[]).includes(n)));
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The page's one read of CREATE GAME's offer, started on first use and never at the mount (a front end over the
 * visitor's disc asks nothing of the network until the player goes online, OT.R14): the room list's request starts it
 * (SELECT ROOM comes before the briefing room and its CREATE GAME), and CREATE GAME's own rows start it too for a page
 * that arrived there by a deep link. Until it answers, `current()` is null: the release's four. An empty served answer
 * (no map: central with no host up, LATER 66) is shown and not kept -- the next ask (CREATE GAME's next rows, the room
 * list's next request) reads again, so a moment with no host does not empty CREATE GAME for the page's life (the
 * review's M1); any other answer is kept, one read as before.
 */
export class CreateGameOfferRead {
  private offer: readonly number[] | null = null;
  private asked = false;
  private all = false;

  constructor(private readonly base: string, private readonly fetchFn?: typeof fetch) {}

  /** Starts the read, the first call only. */
  ask(): void {
    if (this.asked) return;
    this.asked = true;
    void fetchCreateGameOffer(this.base, this.fetchFn, undefined, (all) => { this.all = all; }).then((o) => {
      this.offer = o;
      if (o !== null && o.length === 0) this.asked = false;        // LATER 66 (M1): none offered -- ask again next time
    });
  }

  /** The offer as known now (`ask` started first): the server's map numbers, or null for the release's four. */
  current(): readonly number[] | null {
    this.ask();
    return this.offer;
  }

  /**
   * P537-L2 (product track, an adaptation: a developer's test server): whether the served answer said
   * `allCreateGameMaps: true` -- the server runs `CREATE_GAME_ALL_MAPS=1` (PR #537's switch, `match/src/botGates.ts`),
   * so GAME LOBBY offers its BOTS buttons on any disc map in either rules (`GameLobbyCommandsOptions.allBotGames`). False
   * until an answer says so, and on every public server. Starts nothing: the read is the offer's own.
   */
  allMaps(): boolean {
    return this.all;
  }
}

/** The room list's transport with the offer's read started at its first request (`CreateGameOfferRead`); no offer, as it was. */
export function offerWithRooms(rooms: RoomListTransport, offer: CreateGameOfferRead | null): RoomListTransport {
  if (!offer) return rooms;
  const wrapped: RoomListTransport = { channelList: (q, ticket) => { offer.ask(); return rooms.channelList(q, ticket); } };
  const withDoors = rooms.channelListWithDoors?.bind(rooms);         // LATER 455: the doors' request passes through too
  if (withDoors) wrapped.channelListWithDoors = (q, ticket) => { offer.ask(); return withDoors(q, ticket); };
  return wrapped;
}
