/**
 * LINK-3..5 (product track, OT.R53): the public lobby card. No persona, no disc media, no host of its own -- the HTTP
 * handler and the PNG renderer sit beside it, so this module moves with the server split. Map names are the archive
 * descriptions (`packages/viewer/src/launchSettings/maps.ts` DISC_MAPS, pinned by `packages/archive/test/mapIndex.test.ts`).
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

/** Disc map descriptions, by GameLevel. A level the table does not name is `MP<n>` when it is a small integer. */
const MAP_NAMES: Readonly<Record<number, string>> = {
  1: 'BLIZZARD', 2: 'FROSTFIRE', 5: 'ABANDONED', 6: 'DESERT GLORY', 7: 'NIGHT STALKER', 8: "RAT'S NEST",
  9: 'BITTER JUNGLE', 10: 'BLOOD LAKE', 11: 'DEATH TRAP', 12: 'THE RUINS', 51: 'VIGILANCE', 52: 'THE MIXER',
  53: 'FOXHUNT', 61: 'SUJO', 62: 'ENOWAPI', 64: 'SHADOW FALLS', 71: 'FISH HOOK', 72: 'CROSSROADS', 73: 'SANDSTORM',
  81: 'CHAIN REACTION', 82: 'GUIDANCE', 83: 'REQUIEM',
};

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

export function mapName(level: number): string {
  if (MAP_NAMES[level]) return MAP_NAMES[level];
  if (Number.isInteger(level) && level > 0 && level < 1000) return `MP${level}`;
  return 'UNKNOWN';
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

export function lobbyDescription(s: LobbyBody): string {
  if (s.ended) return 'SOCOM II Legacy | Join Match';
  return `${s.players}/${s.maxPlayers} players - ${s.mode} - SOCOM II Legacy | Join Match`;
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
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
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

export const PREVIEW_SIZE: Readonly<Record<PreviewShape, { width: number; height: number }>> = {
  wide: { width: 1200, height: 630 },
  square: { width: 1200, height: 1200 },
};

/** "SNAPSHOT - OCT 17, 2026 - 9:32 PM ET" in America/New_York. The label is ET, as the mockups. */
export function snapshotLabel(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const day = String(Number(get('day')));
  return `SNAPSHOT - ${get('month').toUpperCase()} ${day}, ${get('year')} - ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()} ET`;
}

/** The site emblem (`shared/ds/emblem.svg`), inlined. Geometric; no disc mark. */
export function emblem(): string {
  return `<g transform="translate(48 40)">
    <rect x="2" y="2" width="60" height="60" rx="6" fill="#000e11" stroke="#c4a04a" stroke-width="3"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="#786e3b" stroke-width="2.5" stroke-dasharray="26 7"/>
    <path d="M15 32h6M43 32h6M32 11v5M32 48v5" stroke="#786e3b" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M21 45 29.5 19H36L27.5 45Z M31 45 39.5 19H46L37.5 45Z" fill="#dcb85c"/>
  </g>`;
}

export function topo(width: number, height: number): string {
  const lines: string[] = [];
  for (let i = 0; i < 16; i++) {
    const y0 = 24 + i * (height / 17);
    let d = `M 0 ${y0.toFixed(1)}`;
    for (let x = 0; x <= width; x += 36) {
      const y = y0 + Math.sin(x / 88 + i * 0.65) * 16 + Math.sin(x / 34 + i) * 7;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    lines.push(`<path d="${d}" fill="none" stroke="#0d595c" stroke-width="1.2" opacity="0.5"/>`);
  }
  return lines.join('');
}

export function crosshair(x: number, y: number): string {
  return `<g stroke="#786e3b" stroke-width="1.5" fill="none" opacity="0.65">
    <path d="M${x - 16} ${y}h32M${x} ${y - 16}v32"/>
    <circle cx="${x}" cy="${y}" r="9"/>
  </g>`;
}

function pips(players: number, max: number, x: number, y: number, pipW: number): string {
  const slots = Math.max(0, Math.min(max, 32));
  if (slots === 0) return '';
  const filled = max <= 32 ? Math.min(Math.max(0, players), slots) : Math.round((players / max) * slots);
  const gap = 4;
  const out: string[] = [];
  for (let i = 0; i < slots; i++) {
    const px = x + i * (pipW + gap);
    out.push(`<rect x="${px}" y="${y}" width="${pipW}" height="10" rx="1" fill="${i < filled ? '#dcb85c' : '#0d595c'}"/>`);
  }
  return out.join('');
}

function notchedButton(x: number, y: number): string {
  const w = 280;
  const h = 64;
  const notch = 16;
  const points = `${x},${y} ${x + w},${y} ${x + w},${y + h - notch} ${x + w - notch},${y + h} ${x},${y + h}`;
  return `<polygon points="${points}" fill="none" stroke="#c4a04a" stroke-width="2"/>
    <text x="${x + 28}" y="${y + 42}" fill="#dcb85c" font-family="Oswald" font-weight="600" font-size="26" letter-spacing="2">JOIN MATCH -&gt;</text>`;
}

/**
 * The text-only card (LINK.R4, LINK-5). Wide puts the players block right of a divider. No disc picture.
 * Every user string is escaped. `at` is the snapshot, labelled ET.
 */
export function lobbyPreviewSvg(lobby: PublicLobby, shape: PreviewShape, at: Date): string {
  const { width, height } = PREVIEW_SIZE[shape];
  const wide = shape === 'wide';
  const ended = lobby.ended;
  const map = escapeXml(ended ? 'MATCH ENDED' : lobby.map);
  const name = escapeXml(ended ? '' : lobby.name.toUpperCase());
  const mode = escapeXml(ended ? '' : lobby.mode);
  const count = `${lobby.players} / ${lobby.maxPlayers}`;
  const mapSize = map.length > 16 ? 64 : map.length > 12 ? 76 : (wide ? 92 : 108);
  const nameY = wide ? 196 : 280;
  const mapY = wide ? 300 : 460;
  const modeY = wide ? 360 : 560;
  const marks = wide
    ? `${crosshair(220, 520)}${crosshair(700, 120)}${crosshair(1040, 480)}`
    : `${crosshair(180, 980)}${crosshair(980, 180)}${crosshair(600, 860)}`;
  const players = ended ? '' : (wide
    ? `<line x1="760" y1="170" x2="760" y2="500" stroke="#786e3b" stroke-width="1"/>
       <text x="800" y="280" fill="#dfe4e5" font-family="Oswald" font-weight="500" font-size="72">${escapeXml(count)}</text>
       <text x="800" y="324" fill="#c4a04a" font-family="Oswald" font-weight="500" font-size="22" letter-spacing="4">PLAYERS</text>
       ${pips(lobby.players, lobby.maxPlayers, 800, 352, 12)}`
    : `<text x="56" y="680" fill="#dfe4e5" font-family="Oswald" font-weight="500" font-size="80">${escapeXml(count)}</text>
       <text x="56" y="732" fill="#c4a04a" font-family="Oswald" font-weight="500" font-size="24" letter-spacing="4">PLAYERS</text>
       ${pips(lobby.players, lobby.maxPlayers, 56, 764, 28)}`);
  const badge = ended ? 'ENDED' : 'LIVE MATCH';
  const dot = ended ? '' : `<circle cx="1008" cy="62" r="5" fill="#dcb85c"/>`;
  const badgeX = wide ? 1036 : 1036;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#000e11"/>
  ${topo(width, height)}
  ${marks}
  ${emblem()}
  <text x="128" y="84" fill="#dfe4e5" font-family="Oswald" font-weight="500" font-size="28" letter-spacing="1.5">SOCOM II Legacy</text>
  <rect x="980" y="40" width="176" height="44" rx="4" fill="none" stroke="#c4a04a" stroke-width="1.5"/>
  ${dot}
  <text x="${badgeX}" y="69" fill="#dcb85c" font-family="Oswald" font-weight="500" font-size="16" letter-spacing="1.5">${badge}</text>
  ${name ? `<text x="56" y="${nameY}" fill="#dcb85c" font-family="Oswald" font-weight="500" font-size="26" letter-spacing="6">${name}</text>` : ''}
  <text x="56" y="${mapY}" fill="#dfe4e5" font-family="Saira Condensed" font-style="italic" font-weight="800" font-size="${mapSize}">${map}</text>
  ${mode ? `<text x="56" y="${modeY}" fill="#c4a04a" font-family="Oswald" font-weight="500" font-size="24" letter-spacing="6">${mode}</text>` : ''}
  ${players}
  <text x="56" y="${height - 48}" fill="#786e3b" font-family="JetBrains Mono" font-weight="400" font-size="18">${escapeXml(snapshotLabel(at))}</text>
  ${notchedButton(width - 328, height - 112)}
</svg>`;
}
