import { mapDisplayName } from '@s2u/archive/mapNames';
/**
 * The public lobby's data and its page head (LINK-3..5; product track, OT.R53), apart from the lobby card's drawing
 * (`./lobbyCard`, which re-exports all of this): it imports no card kit, asset reader or service, so the viewer's
 * vite.config.ts and the public export carry it alone (the export keeps this file; `cards/` stays out of it).
 */

/**
 * LCM-3: one member of a live game as the live view gives it -- name (as the lists cut it), side, watcher, medal, tag.
 * Kept here, not in `./lobby`, so this module imports nothing of central's services: the viewer's vite.config.ts and the
 * public export carry it alone (`lobby.ts` re-exports it).
 */
export interface LiveMember { name: string; side: 'seal' | 'terrorist' | null; spectator: boolean; medal: number; tag: string }

/**
 * LINK-3..5 (product track, OT.R53): the public lobby card. No persona, no disc media, no host of its own -- the HTTP
 * handler and the PNG renderer sit beside it, so this module moves with the server split. Map names are the one name
 * table's display names (`@s2u/archive` `mapDisplayName`, MN-1, OT.R113; the disc's descriptions in their own case).
 * Modes are missionlist.rdr's TYPE (`packages/viewer/test/rules.test.ts`, research 192): the words are
 * `GAME_DETAILS_TYPE_WORDS` (`@s2u/ui`), and a playlist whose types differ is MEDLEY, as GAME DETAILS draws it.
 */

/** A share id: base64url, about 10 characters (`crypto.randomBytes(8)` is 11). */
export const LOBBY_ID_RE = /^[A-Za-z0-9_-]{10,22}$/;

export function isLobbyId(id: string): boolean {
  return LOBBY_ID_RE.test(id);
}

/** The drawn name, cut at "$~" (`drawnName` in `lobby.ts`). */
export function cutDrawn(name: string): string {
  const cut = name.indexOf('$~');
  return cut < 0 ? name : name.slice(0, cut);
}

const NAME_CAP = 48;

/** Controls out, then 48 code points (LINK.R3: capped as the list shows the name). */
export function capName(name: string): string {
  const clean = [...name].filter((c) => {
    const n = c.codePointAt(0)!;
    return n >= 0x20 && n !== 0x7f;
  }).join('');
  return [...clean].slice(0, NAME_CAP).join('');
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** missionlist.rdr TYPE by map number (research 192, `rules.test.ts`). */
const MAP_TYPES: Readonly<Record<number, number>> = {
  61: 1, 62: 1, 73: 1,
  1: 2, 7: 2, 9: 2, 12: 2, 72: 2, 83: 2,
  52: 3, 53: 3, 82: 3,
  6: 4, 10: 4, 11: 4, 71: 4,
  2: 5, 5: 5, 8: 5, 51: 5, 64: 5, 81: 5,
};

/**
 * A map's missionlist.rdr TYPE by its number (`MAP_TYPES`, the 22 maps `viewer/test/rules.test.ts` reads off the disc's
 * `READERC.ZAR`); 0 off the list, as the room's `gameTypeOf` (P32's review F1: central's placement resolves the played
 * rules with it).
 */
export function missionTypeOf(level: number): number {
  return MAP_TYPES[level] ?? 0;
}

const TYPE_WORDS: Readonly<Record<number, string>> = { 1: 'BREACH', 2: 'DEMOLITION', 3: 'ESCORT', 4: 'EXTRACTION', 5: 'SUPPRESSION' };

/**
 * A map's public name by its GameLevel: MN-1 (OT.R113) -- `@s2u/archive`'s one name table (`mapDisplayName`: the 22
 * disc maps and the three HDD maps, `Crossroads`), `Unknown map` for any other level. Never the code (`MP<n>`), which
 * this card, `/api/live` and Discord once showed for a level off the old 22-row copy.
 */
export function mapName(level: number): string {
  return mapDisplayName(level);
}

/** The mode word, or MEDLEY when the playlist's types differ (GAME DETAILS, `gameDetails`). */
export function modeWord(level: number, playlist: readonly number[]): string {
  const levels = playlist.length > 0 ? playlist : (level > 0 ? [level] : []);
  const types = levels.map((n) => MAP_TYPES[n] ?? 0);
  if (types.length === 0) return 'UNKNOWN';
  if (types.some((t) => t !== types[0])) return 'MEDLEY';
  return TYPE_WORDS[types[0]!] ?? 'UNKNOWN';
}

/** What the public summary is allowed to carry. No world id, no account, no persona. */
export interface PublicLobby {
  id: string;
  ended: boolean;
  /** The drawn game name, or "Private match", or "Match ended". */
  name: string;
  private: boolean;
  map: string;
  mode: string;
  players: number;
  maxPlayers: number;
  inProgress: boolean;
  locked: boolean;
  stateHash: string;
}

/** A live game's public inputs. The lobby service fills this; it never includes a member's name. */
export interface LobbyLinkSource {
  gameName: string;
  gameLevel: number;
  playlist: readonly number[];
  securityLevel: number;
  worldStatus: number;
  players: number;
  maxPlayers: number;
}

export type LobbyBody = Omit<PublicLobby, 'stateHash'>;

/** The fields the image and the head are keyed on. The id is not one of them, so an unknown id and an ended game match. */
export function lobbyStateMaterial(s: LobbyBody): string {
  return JSON.stringify([s.ended, s.name, s.private, s.map, s.mode, s.players, s.maxPlayers, s.inProgress, s.locked]);
}

/** A cache key for the image query. Not a secret: FNV-1a over the public fields, base64url. */
export function lobbyStateHash(material: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < material.length; i++) {
    h ^= BigInt(material.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let n = h;
  let out = '';
  for (let i = 0; i < 11; i++) { out += alphabet[Number(n & 63n)]; n >>= 6n; }
  return out;
}

export function describeLobby(source: LobbyLinkSource | null): LobbyBody {
  if (!source) {
    return { id: '', ended: true, name: 'Match ended', private: false, map: '', mode: '', players: 0, maxPlayers: 0, inProgress: false, locked: false };
  }
  const isPrivate = (source.securityLevel & 1) !== 0 || (source.securityLevel & 2) !== 0;
  const level = source.gameLevel !== 0 ? source.gameLevel : (source.playlist[0] ?? 0);
  return {
    id: '',
    ended: false,
    name: isPrivate ? 'Private match' : capName(cutDrawn(source.gameName)),
    private: isPrivate,
    map: mapName(level),
    mode: modeWord(level, source.playlist),
    players: Math.max(0, Math.trunc(source.players)),
    maxPlayers: Math.max(0, Math.trunc(source.maxPlayers)),
    inProgress: source.worldStatus === 2,
    locked: isPrivate,
  };
}

export function withId(body: LobbyBody, id: string, stateHash: string): PublicLobby {
  return { ...body, id, stateHash };
}

/** A checked public summary. A body that is not one becomes the ended card (nothing of it is copied through). */
export function publicLobbyFromJson(raw: unknown, id: string): PublicLobby {
  const ended = withId(describeLobby(null), id, 'ended');
  if (!raw || typeof raw !== 'object') return ended;
  const r = raw as Record<string, unknown>;
  if (r['id'] !== id || typeof r['name'] !== 'string' || typeof r['map'] !== 'string' || typeof r['mode'] !== 'string') return ended;
  if (typeof r['players'] !== 'number' || typeof r['maxPlayers'] !== 'number' || typeof r['ended'] !== 'boolean') return ended;
  if (typeof r['private'] !== 'boolean' || typeof r['inProgress'] !== 'boolean' || typeof r['locked'] !== 'boolean') return ended;
  if (typeof r['stateHash'] !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r['stateHash'])) return ended;
  const name = r['ended'] ? 'Match ended' : (r['private'] ? 'Private match' : capName(r['name']));
  return {
    id, ended: r['ended'], name, private: r['private'],
    map: r['ended'] ? '' : capName(r['map']), mode: r['ended'] ? '' : capName(r['mode']),
    players: r['ended'] ? 0 : Math.max(0, Math.trunc(r['players'])),
    maxPlayers: r['ended'] ? 0 : Math.max(0, Math.trunc(r['maxPlayers'])),
    inProgress: r['ended'] ? false : r['inProgress'], locked: r['ended'] ? false : r['locked'],
    stateHash: r['stateHash'],
  };
}

export function lobbyTitle(s: LobbyBody): string {
  if (s.ended) return 'Match ended';
  if (s.private) return `${s.map} - ${s.players}/${s.maxPlayers} Players`;
  return `${s.map} -- ${s.name}`;
}

/** The Open Graph description. LCM.R16 (a): no "Join Match" (no JOIN anywhere in a card's copy, the plan's Global constraints). */
export function lobbyDescription(s: LobbyBody): string {
  if (s.ended) return 'SOCOM II Legacy';
  return `${s.players}/${s.maxPlayers} players - ${s.mode} - SOCOM II Legacy`;
}

/** Open Graph and Twitter tags, escaped. `origin` empty: root-relative image and url. The same for every user agent. */
export function lobbyHeadTags(lobby: PublicLobby, origin: string): string {
  const root = origin.replace(/\/$/, '');
  const id = encodeURIComponent(lobby.id);
  const image = `${root}/api/lobby/${id}/preview.png?v=${encodeURIComponent(lobby.stateHash)}`;
  const url = `${root}/online/lobby/${id}`;
  const title = escapeXml(lobbyTitle(lobby));
  const description = escapeXml(lobbyDescription(lobby));
  const alt = title;
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="SOCOM II Legacy" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${escapeXml(image)}" />`,
    `<meta property="og:image:width" content="${PREVIEW_SIZE.wide.width}" />`,
    `<meta property="og:image:height" content="${PREVIEW_SIZE.wide.height}" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta property="og:url" content="${escapeXml(url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeXml(image)}" />`,
  ].join('\n');
}

/** `index.html` with the lobby tags before `</head>`, or a standalone document when there is no shell. */
export function injectLobbyHead(html: string | null, lobby: PublicLobby, origin: string): string {
  const tags = lobbyHeadTags(lobby, origin);
  const title = escapeXml(lobbyTitle(lobby));
  const theme = html && html.includes('name="theme-color"') ? '' : `<meta name="theme-color" content="#000e11" />\n`;
  const block = `<!-- lobby-link -->\n${theme}${tags}\n`;
  if (!html || !html.includes('</head>')) {
    // The takeover (OT.R69; OT.R75): no page beside this process -- a central release ships `server/` alone and the
    // hostname's Worker sends `/online/lobby/` here -- so a person following the link would meet an empty body. The page's
    // own `index.html` (the static host's, same origin, under the link's base) is loaded and written in, so the game boots
    // at this address and reads the link; a failed fetch goes to the base. Nothing of the lobby is in the script.
    const boot = `<script>(function(){var p=location.pathname,i=p.indexOf('/online/lobby/'),b=i<0?'/':p.slice(0,i+1);`
      + `fetch(b+'index.html',{cache:'no-cache'}).then(function(r){if(!r.ok)throw r.status;return r.text();})`
      + `.then(function(h){document.open();document.write(h);document.close();})`
      + `.catch(function(){location.replace(b);});})();</script>`;
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<title>${title}</title>\n${block}</head>\n`
      + `<body>${boot}<noscript><a href="/">Open SOCOM II Legacy</a></noscript></body>\n</html>\n`;
  }
  // Replacer functions, never replacement strings: a game name is a player's text, and `$&`, `` $` ``, `$'` and `$1` in a
  // replacement string would re-insert the page's own markup into the head (the takeover's review, F1).
  const titled = /<title>[^<]*<\/title>/.test(html) ? html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`) : html;
  return titled.replace('</head>', () => `${block}</head>`);
}

export type PreviewShape = 'wide' | 'square';

/** LCM.R5: the wide card is the owner's 16:9 reference, 1200 x 675 (Open Graph takes it); the square stays. */
export const PREVIEW_SIZE: Readonly<Record<PreviewShape, { width: number; height: number }>> = {
  wide: { width: 1200, height: 675 },
  square: { width: 1200, height: 1200 },
};
