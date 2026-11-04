/// <reference types="vite/client" />
import type { Settings, WriteResult } from '@s2u/card';
import { netSettings } from './netPage';
import { pageSettings } from './pageStore';
import type { Simulate } from './net/client';

/**
 * The panel's **Online** setting (owner, 2026-09-29): Off (the single page, as before), Shared (this site's own match
 * service, `sharedServer`: TRS-1/TRS-2) or Local (the static server `npm start -w @s2u/central` runs on this machine). Remembered in this browser (`ONLINE_KEY`).
 * Local is a developer's: offered only on a page served from this machine (`isLocalHost`; owner, 2026-09-29: "Make sure
 * the localhost option is only visible locally, never on the deployed site"). Elsewhere the option is not rendered, and
 * an `online=local` link or a remembered Local reads as Off (the page then writes Off into its address).
 * In reCOM mode the page joins the match as a player (`./netPage`); in the map viewer it joins as a spectator that
 * never takes a player's place (the hello's `watch`), to watch the match on the map.
 *
 * The URL still overrides it, as before the setting: `&mp` joins the server at this page's host (`/ws`) and
 * `&server=wss://host/ws` names one (`netSettings`); `&lag=`/`&loss=` run the latency injector either way.
 */

export type OnlineChoice = 'off' | 'shared' | 'local';
export const ONLINE_CHOICES: readonly OnlineChoice[] = ['off', 'shared', 'local'];

/**
 * TRS-1 (the test room's SHARED, `docs/plans/2026-10-18-test-room-shared.md`; TRS.R1, the owner, 2026-10-18: "Fix the
 * "SHARED" in /testroom to start a match on nightly. Ideally this should work locally automatically", amending NB.R8):
 * Shared is this site's own match service. On a deployed page that is the page's own origin's `/ws` (`ownOriginSocket`),
 * which the page joins through central's standing room for the map (SA.R14: `/rooms` lists it hosted, the room pass
 * hands a host's door and a guest's or an account's token -- `./connectHost` `ROOM_DOOR_ADAPTATION`); on a local page,
 * TRS-2, the local stack's central (`LOCAL_STACK_SERVER`, `npm run dev:stack`). Was `SHARED_SERVER`, the old
 * socomunzipped multiplayer host, with no tunnel connector since 2026-09-30 (HUMAN_TASKS O27). An instrument
 * (product track): the match it joins is unchanged.
 */
export function sharedServer(location: { protocol: string; host: string; hostname?: string }): string {
  return pageIsLocal(location) ? LOCAL_STACK_SERVER : ownOriginSocket(location);
}

/** The page's own origin's match socket -- the bare `&mp`'s (`./netPage` `netSettings`) and a deployed page's Shared. */
export function ownOriginSocket(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/**
 * TRS-2: the local stack's central on this machine (`tools/local-stack.ts` `LOCAL_STACK_PORTS.server`, pinned equal by
 * `test/sharedHost.test.ts`), Shared's target on a local page: `npm run dev:stack` starts it with a host whose standing
 * rooms a Shared page joins as the deployed page does.
 */
export const LOCAL_STACK_SERVER = 'ws://127.0.0.1:5340/ws';
/** `npm start -w @s2u/central`'s default port on this machine. */
export const LOCAL_DEFAULT_PORT = 8787;

/**
 * The local server's port: `LOCAL_DEFAULT_PORT`, unless the build names another (`VITE_S2U_LOCAL_PORT`, a whole port
 * number). The e2e run names its own (`e2e/ports.ts`, `playwright.config.ts`): a spec's Online = Local must reach the
 * server the spec started, never the developer's own on 8787 (2026-10-01: a spec's page reached the owner's play-test
 * server there and was refused for its protocol).
 */
export function localPort(env: string | undefined = pageLocalPortSetting()): number {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : LOCAL_DEFAULT_PORT;
}

/**
 * LATER 495 (2026-10-26) -- **a browser adaptation, the e2e harness's** (product track; the original has no Local server):
 * the e2e run's Playwright workers each start their match server on their own port (`e2e/ports.ts` `workerPort`), and
 * each worker's pages are handed theirs in their storage before the page loads (`playwright.config.ts`
 * `use.storageState`). On a development build's local page that stored port is the Local port; otherwise
 * (`undefined`) the build's own. A release or demo page never reads it: the read sits under a literal
 * `import.meta.env.DEV` (`pageLocalPortSetting`), which every `vite build` folds away as it does the keyboard's (OT.R29;
 * `test/e2eWorkerPorts.test.ts` holds the source and a build of this tree). `stored`: the stored value; `local`: whether
 * the page is this machine's (`pageIsLocal`).
 */
export function e2eLocalPort(stored: string | null, local: boolean): string | undefined {
  if (!local || stored === null) return undefined;
  const n = Number(stored);
  return stored !== '' && Number.isInteger(n) && n > 0 && n < 65536 ? stored : undefined;
}
/** The page's Local port setting: a development build's run-time one (`e2eLocalPort`), else the build's (`VITE_S2U_LOCAL_PORT`). */
function pageLocalPortSetting(): string | undefined {
  if (import.meta.env.DEV) {
    const local = typeof location !== 'undefined' && pageIsLocal(location);
    // Through the page's own settings (`./pageStore`, the one path to the browser's storages; a storage that cannot
    // be read gives null there): B146's gate, `test/pageStore.test.ts`'s inventory.
    const stored = local ? pageSettings.get('s2u.e2e.localPort') : null;
    const run = e2eLocalPort(stored, local);
    if (run !== undefined) return run;
  }
  return viteLocalPort();
}
function viteLocalPort(): string | undefined {
  // Vite's build variables (none under Node), named as `import.meta.env.*` is: Vite gives a module its env only when its
  // text names import.meta's env so -- through a cast of `import.meta` the dev server served none and the page's Local
  // stayed 8787 whatever the run set (2026-10-01; `test/onlineLocalPort.test.ts`).
  return (import.meta.env as Record<string, string | undefined> | undefined)?.['VITE_S2U_LOCAL_PORT'];
}

/** The local server's WebSocket (Online = Local). */
export const LOCAL_SERVER = `ws://localhost:${localPort()}/ws`;

/** Where the choice is remembered. */
export const ONLINE_KEY = 's2u.viewer.online';

/**
 * Whether a host (`location.host` or `.hostname`: a port and IPv6 brackets are fine) is this machine: `localhost`,
 * `127.0.0.1`, `[::1]` or a name under `.localhost` (RFC 6761), case aside.
 */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  const name = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0]!;
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name === '::1' || name.endsWith('.localhost');
}

/** Whether the page is served from this machine (so Local is offered). */
export function pageIsLocal(location: { host: string; hostname?: string }): boolean {
  return isLocalHost(location.hostname || location.host);
}

/** The choices the setting offers: Local only on a local page. */
export function onlineChoices(local: boolean): readonly OnlineChoice[] {
  return local ? ONLINE_CHOICES : ONLINE_CHOICES.filter((c) => c !== 'local');
}

/** A stored or linked value, read back: one of the choices offered (`local`: whether Local is), or Off. */
export function onlineChoice(stored: string | null, local = true): OnlineChoice {
  return stored === 'shared' || (stored === 'local' && local) ? stored : 'off';
}

export interface OnlineTarget {
  /** What the panel shows as chosen: one of the three, or 'url' for a server the URL named that is neither. */
  choice: OnlineChoice | 'url';
  /** The server to join, or null for none. */
  url: string | null;
  /** True when the URL (`&mp`, `&server=`) decided it rather than the setting. */
  fromUrl: boolean;
  simulate?: Simulate;
}

/**
 * The server the page joins: the URL's `&mp` / `&server=` first (an override, as before the setting), else the stored
 * choice's -- Local only on a local page (`pageIsLocal`), else Off. `location` is the page's own, for `&mp`'s default of this host.
 */
export function resolveOnline(search: string, stored: string | null, location: { protocol: string; host: string; hostname?: string }): OnlineTarget {
  const fromUrl = netSettings(search, location);
  const q = new URLSearchParams(search);
  const lag = Number(q.get('lag') ?? '0'), loss = Number(q.get('loss') ?? '0');
  const simulate: Simulate | undefined = lag > 0 || loss > 0 ? { latencyMs: lag, jitterMs: lag / 5, loss: loss / 100 } : undefined;
  if (fromUrl) {
    const choice = fromUrl.url === sharedServer(location) ? 'shared' : fromUrl.url === LOCAL_SERVER ? 'local' : 'url';
    return { choice, url: fromUrl.url, fromUrl: true, ...(fromUrl.simulate ? { simulate: fromUrl.simulate } : {}) };
  }
  const choice = onlineChoice(stored, pageIsLocal(location));
  const url = choice === 'shared' ? sharedServer(location) : choice === 'local' ? LOCAL_SERVER : null;
  return { choice, url, fromUrl: false, ...(simulate && url ? { simulate } : {}) };
}

/**
 * The remembered choice, through the page's settings path (`./pageStore`, PLAT-24): a storage that throws (a private
 * window) reads as none, and a write that fails is reported and returned -- Off next time.
 */
export function readOnline(settings: Settings = pageSettings): string | null {
  return settings.get(ONLINE_KEY);
}
export function writeOnline(choice: OnlineChoice, settings: Settings = pageSettings): WriteResult {
  return settings.set(ONLINE_KEY, choice);
}

/** The connection as the panel shows it (`NetPage.status`). */
export interface OnlineStatus {
  /** `offline`: Online is off and the page's own match runs (`./net/loopback`); `off`: Online off, no match at all. */
  state: 'off' | 'offline' | 'connecting' | 'online' | 'retrying' | 'refused';
  /** Players in the match, when online. */
  players: number;
  /** Seconds to the next attempt, when retrying. */
  retryIn: number;
  /** Whether this page watches (the map viewer) rather than plays. */
  watching: boolean;
  /** The server's reason, when refused. */
  reason?: string;
  /** Retrying a local server never reached (Online = Local, 2026-09-30): the line says how to start it. */
  local?: boolean;
  /** TRS-2: retrying the local stack never reached (Online = Shared on a local page): the line says how to start it. */
  stack?: boolean;
  /** TR-2: the map a `NO_SUCH_MAP` refusal names -- the refused hello's (`withRefusalMap`). */
  map?: string;
}

/**
 * TR-2 (the test room's maps plan, TR.R3; research 307 §2): the server's words for a hello whose map it does not play --
 * code 4004 'no such map', its log's detail `{ map }` (`packages/match/src/server.ts` :806, `allowed()` :692).
 */
export const NO_SUCH_MAP = 'no such map';

/**
 * TR-2 (the owner's playtest, 2026-10-12: "When in testroom mode, LOCAL online just says 'no such map'."): the status
 * with the map a `NO_SUCH_MAP` refusal is about. The refused frame carries the reason alone (`server.ts` :918 sends
 * `{ type: 'refused', reason }`; the detail `{ map: String(ev.map) }` goes only to the server's log), and that map is the
 * hello's own, so the page names the map its client asked for (`./net/client` `NetClient.refusal`). Any other state or
 * reason, or a client refusal that is not the status's, is the status as it was.
 */
export function withRefusalMap(s: OnlineStatus, refusal: { reason: string; map: string } | null | undefined): OnlineStatus {
  if (s.state !== 'refused' || s.reason !== NO_SUCH_MAP || !refusal || refusal.reason !== s.reason || !refusal.map) return s;
  return { ...s, map: refusal.map };
}

/** The refusal's words: the server's reason (verbatim), and for `NO_SUCH_MAP` with its map, the map after it. */
function refusedText(s: OnlineStatus): string {
  const reason = s.reason ?? 'by the server';
  return s.reason === NO_SUCH_MAP && s.map ? `${reason} (${s.map})` : reason;
}

/** How the Local server is started (`@s2u/central`'s `start` script; the panel's line and toast name it). */
export const LOCAL_START = 'npm start -w @s2u/central';
/**
 * TRS-1 (the merge controller's word, 2026-10-21): what Online = Shared says when central lists no standing room for the
 * map hosted (`/rooms`), or its room pass finds no host running it (404) -- plainly, never a generic failure, and with no
 * fall back to the page's own `/ws` (Shared is the standing rooms; the bare `&mp` keeps today's fall back). HUMAN_TASKS
 * H268: the hosts' `STANDING_MAPS`.
 */
export const NO_SHARED_ROOM = 'no shared room is up right now';
/** TRS-2: how the local stack is started (`npm run dev:stack`: `tools/local-stack.ts --split`; Shared on a local page). */
export const STACK_START = 'npm run dev:stack';
/**
 * LATER 263: what Online = Shared says when the server answers 404 on `/rooms` -- the route not served (a proxy without
 * it: O29's tunnel rule, `^/(ws|health)$`) -- plainly and once, never retried as a server not reached.
 */
export const NO_ROOMS_ROUTE = 'this server does not serve /rooms, the room list Shared needs';

/**
 * LATER 262: the status of Shared's room join while it retries (`./main`, `startRoomJoin`'s `unlisted` and `retrying`):
 * the stack's start line (`stack`) only while the local stack's `/rooms` is not read (`listed` false); once it is read
 * the stack is up, and a failed pass -- a page on another port than the stack's 5342, refused by its origin check -- is
 * the server's line, never "no local stack".
 */
export function roomRetryStatus(ms: number, o: { stack: boolean; listed: boolean; watching: boolean }): OnlineStatus {
  return { state: 'retrying', players: 0, retryIn: ms / 1000, watching: o.watching, ...(o.stack && !o.listed ? { stack: true } : {}) };
}

/**
 * The toast when the connection's headline changes (`./main` `showOnline`): in the match, watching, or unreachable --
 * in plain words for a local server never reached (the owner's play test, 2026-09-30). Null: no toast.
 */
export function onlineToast(s: OnlineStatus): string | null {
  if (s.state === 'online') return s.watching ? 'Online: watching the match' : 'Online: in the match';
  // TR-2: a map the server does not play, said where the player looks (the panel's line is folded away); other refusals
  // keep their line alone, as before.
  if (s.state === 'refused') return s.reason === NO_SUCH_MAP && s.map ? `Online: refused: ${refusedText(s)}` : null;
  if (s.state !== 'retrying') return null;
  if (s.stack) return `Online: no local stack -- start it with ${STACK_START}; the page joins it once it is up`;   // TRS-2
  return s.local
    ? `Online: no local match server -- start it with ${LOCAL_START}; the page joins it once it is up`
    : 'Online: the match server is unreachable; retrying';
}

/**
 * The one line the panel writes under the setting, whether the lamp is up, down or neither, and -- while retrying -- the
 * countdown to the next attempt, apart from the line: the line sits in a polite live region (`#online-state`) and is
 * announced when it changes, so it changes with the state alone; the seconds go to `#online-retry`, which is not live
 * (review 2 m-11; the PLAYERS ONLINE count is kept out of a live region for the same reason, index.html).
 */
export function onlineLine(s: OnlineStatus): { text: string; lamp: 'up' | 'down' | null; countdown?: string } {
  switch (s.state) {
    case 'off': return { text: 'single player: no server', lamp: null };
    case 'offline': return { text: 'offline match · no server', lamp: null };
    case 'connecting': return { text: 'connecting ...', lamp: null };
    case 'online': return { text: `online · ${s.players} ${s.players === 1 ? 'player' : 'players'}${s.watching ? ' · watching' : ''}`, lamp: 'up' };
    case 'retrying': return {
      text: s.stack ? `no local stack · start it with ${STACK_START}` : s.local ? `no local match server · start it with ${LOCAL_START}` : 'server unreachable · retrying', lamp: 'down',
      countdown: `in ${Math.max(1, Math.ceil(s.retryIn))} s`,
    };
    case 'refused': return { text: `refused: ${refusedText(s)}`, lamp: 'down' };
  }
}
