import type { MapInfo } from '@s2u/archive';

/**
 * The deploy-time map allowlist: which of the disc's multiplayer maps a build's picker offers and its match server
 * accepts. **A browser / deployment adaptation with no original behind it**: the original chooses a game's map in the
 * lobby's game creation (the lobby sprint's), and this switch gives way to that when it comes. Ported from Chris's
 * browser-beta-v5 (chris/browser-beta-integration d578f347: `packages/viewer/src/multiplayerMaps.ts`, his
 * `VITE_S2U_MAP_ALLOWLIST`), where it held his LAN package to the three maps he had checked.
 *
 * **One variable, two readers.** `VITE_S2U_MAP_ALLOWLIST` (comma-separated stems, `MP2,MP7,MP51,MP72`) is read by the
 * viewer's build -- Vite hands a page only `VITE_`-prefixed variables -- for the picker (`main.ts` `showMaps`), and by
 * the match server (`packages/central/src/main.ts`, through `serverMapAllowlist`), so one exported value sets both.
 * The server's older `MAPS` (the deploy's `env.example`) names the same list; set together they must agree.
 * **Unset or blank: every map** -- the default build keeps all 22 (INT.R9), as `MAPS=` means on the server: every map
 * its source holds (its served set, MAPS-4). The default maps CREATE GAME offers (OT.R45: MP2, MP7, MP51, MP72) are
 * `FIRST_RELEASE_MAPS`, not this switch.
 *
 * The parser is the server's and the page's alike (this module is DOM-free and imports types only), so the two cannot
 * read one value differently. Its stem rule is the server's own (`packages/match/src/server.ts` `allowed`,
 * `/^MP\d{1,2}$/i`): every disc map is `RUN/MP1.ZDB` .. `RUN/MP83.ZDB`.
 */
export const MAP_ALLOWLIST_ENV = 'VITE_S2U_MAP_ALLOWLIST';

/** A map stem the match server accepts (`server.ts` `allowed`). */
const STEM = /^MP\d{1,2}$/;

function tokens(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
}

/**
 * The listed stems, upper-cased and de-duplicated in the order given, or null for every map (unset, empty or blank).
 * A token that is not a stem is dropped here (`invalidMapStems` names it; the server refuses to start on one), so a
 * list naming no real stem offers no map.
 */
export function parseMapAllowlist(value: string | undefined): readonly string[] | null {
  if (value === undefined) return null;
  const all = tokens(value);
  if (all.length === 0) return null;
  return [...new Set(all.map((v) => v.toUpperCase()).filter((v) => STEM.test(v)))];
}

/** The tokens of a list that are not map stems, as written (`../RUN`, `MP123`, `frostfire`). */
export function invalidMapStems(value: string | undefined): string[] {
  return value === undefined ? [] : tokens(value).filter((v) => !STEM.test(v.toUpperCase()));
}

/** The disc's maps the picker offers: all of them with no list, else the listed ones (case aside), in disc order. */
export function allowedMultiplayerMaps(maps: readonly MapInfo[], allowed: readonly string[] | null): MapInfo[] {
  return allowed === null ? [...maps] : maps.filter((m) => allowed.includes(m.archive.toUpperCase()));
}

/**
 * The status of an empty picker, naming its cause: a disc (or served index) with no multiplayer map, or -- the disc
 * holding `discMaps` of them -- the allowlist offering none, its non-stem tokens named (the page drops them silently;
 * only the server refuses to start on one).
 */
export function emptyPickerStatus(o: { discMaps: number; allowlist: string | undefined; source: 'iso' | 'served' }): string {
  if (o.discMaps === 0 || parseMapAllowlist(o.allowlist) === null) {
    return o.source === 'iso' ? 'the disc image holds no RUN/MP*.ZDB archives: is it SOCOM II?' : 'the served index lists no MP archives';
  }
  const bad = invalidMapStems(o.allowlist);
  const dropped = bad.length ? ` (${bad.join(', ')}: not a map stem, dropped)` : '';
  return `the build's map allowlist ${MAP_ALLOWLIST_ENV}=${o.allowlist?.trim()}${dropped} offers none of the ${o.discMaps} maps on this disc`;
}

/**
 * The server's maps from its environment: `MAPS` or `VITE_S2U_MAP_ALLOWLIST`, the empty list for every map
 * (`MatchServerOptions.maps`). An error -- the server's `main.ts` exits on it -- when a token is not a stem, or when
 * both are set to different maps: either would leave the picker offering what the server refuses.
 */
export function serverMapAllowlist(env: Readonly<Record<string, string | undefined>>): { maps: readonly string[] } | { error: string } {
  const named: [string, string | undefined][] = [['MAPS', env['MAPS']], [MAP_ALLOWLIST_ENV, env[MAP_ALLOWLIST_ENV]]];
  for (const [key, value] of named) {
    const bad = invalidMapStems(value);
    if (bad.length) return { error: `${key} names ${bad.join(', ')}, which is not a map stem (MP and one or two digits, MP2)` };
  }
  const [maps, variable] = named.map(([, value]) => parseMapAllowlist(value));
  if (maps && variable) {
    const same = maps.length === variable.length && maps.every((s) => variable.includes(s));
    if (!same) return { error: `MAPS (${maps.join(',')}) and ${MAP_ALLOWLIST_ENV} (${variable.join(',')}) name different maps` };
  }
  return { maps: maps ?? variable ?? [] };
}

/**
 * CREATE GAME's offer, the served rule -- **a deployment's adaptation, with no original behind it**. The four
 * (`FIRST_RELEASE_MAPS`; OT.R58, the owner 2026-10-16: "limit create match map list to 4 maps
 * (frostfire/crossroads/vig/nightfire)") narrowed by the maps the server plays (its served set narrowed by `MAPS`,
 * MAPS-4's `played`; with no local host the live hosts' union, SA-7e), never widened: central's lobby takes it on
 * every start, and `GET /maps` says so (`offer: "served"`) so the page's CREATE GAME lists the same maps
 * (`createGameOfferOf`, bounded to the four by `./createGameHost` `fetchCreateGameOffer`). NB-7 (OT.R50) made it a
 * server setting, `MAP_OFFER` (`release`, the default: the four narrowed by `MAPS` alone; `served`: the nightly's);
 * LATER 66 retired the setting -- the served rule is every server's, and a value left on a box is ignored with one
 * info line (`packages/central/src/main.ts`). The wire's `offer` field is kept, so a page reads the server's set, and
 * `createGameOfferOf` keeps its compatibility: an answer without it (a server before NB-7's rule) leaves the page on
 * its compiled four. The test room's read of the same answer (`./servedMaps`) still names every played map. The
 * original's CREATE GAME is untouched: `FUN_00274940` lists the maps present (D:L121473-121555), and which maps a
 * server offers is its configuration.
 */
/** The `/maps` answer's `offer` field: the served rule (every server's since LATER 66). */
export const MAP_OFFER_SERVED = 'served' as const;

/**
 * The CREATE GAME maps a `/maps` answer offers, as mission numbers (`MP6` -> 6, `missionlist.rdr`'s NUMBER), in the
 * answer's order -- when it says `offer: "served"`; null for any other answer (no offer field -- a server before the
 * served rule --, another offer, a list holding a token that is not a map stem), so the page keeps its compiled
 * `FIRST_RELEASE_MAPS`. An empty list under `served` offers none (the server plays none: central with no host up). The answer as written: the page keeps only the four among it (OT.R58,
 * `./createGameHost` `fetchCreateGameOffer`).
 */
export function createGameOfferOf(body: unknown): number[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { maps, offer } = body as { maps?: unknown; offer?: unknown };
  if (offer !== MAP_OFFER_SERVED || !Array.isArray(maps)) return null;
  const out: number[] = [];
  for (const m of maps as unknown[]) {
    if (typeof m !== 'string' || !STEM.test(m.trim().toUpperCase())) return null;
    out.push(Number(m.trim().slice(2)));
  }
  return out;
}
