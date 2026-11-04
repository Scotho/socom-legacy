import { beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_DOOR_ADAPTATION, GAME_TOKEN_CHARS_MAX, gameSeatOf, gameSeatOpen, isGameSeat, isGameToken, isPinnedDoor, isPinnedSocket, pinnedForgeDoor, pinnedGameDoor,
  pinnedMatchSocket, voiceReportSocket,
} from '../src/connectHost';

/**
 * SA-6b (the server split, SA.R22 (3)-(4), (6); product track, `GAME_DOOR_ADAPTATION`): the pinned-door type, made only
 * by parsing central's answer -- `wss://<host>.play.socom2legacy.com/g/<game>` (H251; the host 1-32 letters, digits and
 * hyphens, not starting or ending with one), or in devmode only `ws://127.0.0.1:<5343-5349>/g/<game>`, the game the one
 * joined -- and the game seat a socket opens: the page's pinned URL with the login's ticket, or a pinned door with the
 * game's token, never mixed. Doors and tokens invented.
 */

const LOC = { protocol: 'https:', host: 'site.test', origin: 'https://site.test' };
const DEV_LOC = { protocol: 'http:', host: '127.0.0.1:5303', origin: 'http://127.0.0.1:5303' };
const PINNED = pinnedMatchSocket('', LOC, false, false);
/** A game token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const door = (host: string, game = 7): string => `wss://${host}.play.socom2legacy.com/g/${game}`;

describe('SA-6b: the pinned door (pinnedGameDoor)', () => {
  it('a production door of the joined game: pinned, its URL and game kept, frozen', () => {
    const d = pinnedGameDoor(door('firehuge'), 7, false);
    expect(d).not.toBeNull();
    expect([d!.url, d!.game, isPinnedDoor(d), isPinnedSocket(d), Object.isFrozen(d)]).toEqual([door('firehuge'), 7, true, false, true]);
    for (const host of ['a', 'fuse-2', '0', 'a'.repeat(32), 'a-b-c']) expect(pinnedGameDoor(door(host), 7, false), host).not.toBeNull();
  });

  it('refuses a door of another game, a path not /g/<positive int>, a query, a fragment, credentials, a port, a trailing slash', () => {
    const bad = [
      door('firehuge', 8), 'wss://firehuge.play.socom2legacy.com/g/0', 'wss://firehuge.play.socom2legacy.com/g/-7', 'wss://firehuge.play.socom2legacy.com/g/07',
      'wss://firehuge.play.socom2legacy.com/g/7/', 'wss://firehuge.play.socom2legacy.com/g/7?x=1', 'wss://firehuge.play.socom2legacy.com/g/7#f',
      'wss://firehuge.play.socom2legacy.com/ws', 'wss://firehuge.play.socom2legacy.com/g/7.0', `wss://u:p${'@'}firehuge.play.socom2legacy.com/g/7`,
      'wss://firehuge.play.socom2legacy.com:443/g/7', 'wss://firehuge.play.socom2legacy.com/g/ 7', ` ${door('firehuge')}`,
    ];
    for (const raw of bad) expect(pinnedGameDoor(raw, 7, true), raw).toBeNull();
  });

  it('refuses a host outside *.play.socom2legacy.com: the apex, two labels, a suffix trick, upper case, another domain', () => {
    const bad = [
      'wss://play.socom2legacy.com/g/7', door('a.b'), 'wss://firehuge.play.socom2legacy.com.evil.example/g/7', door('FIREHUGE'),
      'wss://firehuge.evil.example/g/7', 'wss://firehuge.socom2legacy.com/g/7', 'wss://firehugeplay.socom2legacy.com/g/7',
    ];
    for (const raw of bad) expect(pinnedGameDoor(raw, 7, true), raw).toBeNull();
  });

  it('the host is 1-32 letters, digits and hyphens, not starting or ending with one (H251; SA-6f): an underscore, a leading or trailing hyphen, 33 characters refused', () => {
    for (const host of ['fire_huge', '-firehuge', 'firehuge-', '-', 'a'.repeat(33), 'fire huge', 'firé']) expect(pinnedGameDoor(door(host), 7, true), host).toBeNull();
  });

  it('ws: outside devmode refused; the devmode loopback 5343-5349 only, exactly 127.0.0.1', () => {
    expect(pinnedGameDoor('ws://firehuge.play.socom2legacy.com/g/7', 7, true)).toBeNull();
    for (let port = 5343; port <= 5349; port++) {
      expect(pinnedGameDoor(`ws://127.0.0.1:${port}/g/7`, 7, true), String(port)).not.toBeNull();
      expect(pinnedGameDoor(`ws://127.0.0.1:${port}/g/7`, 7, false), String(port)).toBeNull();
    }
    for (const raw of ['ws://127.0.0.1:5342/g/7', 'ws://127.0.0.1:5350/g/7', 'ws://localhost:5343/g/7', 'wss://127.0.0.1:5343/g/7', 'ws://127.0.0.1/g/7', 'ws://127.0.0.2:5343/g/7', 'ws://127.0.0.1:5343/g/8']) {
      expect(pinnedGameDoor(raw, 7, true), raw).toBeNull();
    }
  });

  it('anything but a string is refused, never thrown', () => {
    for (const raw of [null, undefined, 7, {}, { url: door('firehuge') }, [door('firehuge')]]) expect(pinnedGameDoor(raw, 7, true)).toBeNull();
    expect(pinnedGameDoor(door('firehuge'), Number.NaN, true)).toBeNull();
  });

  it('the page\'s devmode for doors: a development build under ?devmode, not origin-only (the rule server= follows)', () => {
    expect(pinnedMatchSocket('?devmode', DEV_LOC, true, false).devDoors).toBe(true);
    expect(pinnedMatchSocket('?devmode', DEV_LOC, false, false).devDoors).toBe(false);
    expect(pinnedMatchSocket('', DEV_LOC, true, false).devDoors).toBe(false);
    expect(pinnedMatchSocket('?devmode', DEV_LOC, true, true).devDoors).toBe(false);
  });

  it('GAME_DOOR_ADAPTATION names the door and its hosts', () => {
    expect(GAME_DOOR_ADAPTATION).toMatch(/play\.socom2legacy\.com/);
  });
});

/**
 * LATER 275 (SA-7i's page half; product track, `GAME_DOOR_ADAPTATION`): a placed forge lobby's door, from central's
 * create or token answer -- the same two forms as a game's (`wss://<host>.play.socom2legacy.com/g/<n>`, or in devmode
 * only the loopback 5343-5349), the numeric game id read from the door itself (the page knows its lobby by its string
 * id; central placed it under a number).
 */
describe('LATER 275: a placed forge lobby\'s door (pinnedForgeDoor)', () => {
  it('a production door: pinned as a game door, its game read from /g/<n>; refused nowhere for devDoors', () => {
    for (const dev of [false, true]) {
      const d = pinnedForgeDoor(door('firehuge', 41), dev);
      expect(d, String(dev)).not.toBeNull();
      expect([d!.url, d!.game, isPinnedDoor(d), Object.isFrozen(d)]).toEqual([door('firehuge', 41), 41, true, true]);
    }
  });

  it('the devmode loopback 5343-5349 only with devDoors; 5340 (central) and 5342 refused even then', () => {
    for (let port = 5343; port <= 5349; port++) {
      expect(pinnedForgeDoor(`ws://127.0.0.1:${port}/g/3`, true)?.game, String(port)).toBe(3);
      expect(pinnedForgeDoor(`ws://127.0.0.1:${port}/g/3`, false), String(port)).toBeNull();
    }
    for (const raw of ['ws://127.0.0.1:5340/g/3', 'ws://127.0.0.1:5342/g/3', 'ws://localhost:5343/g/3', 'ws://127.0.0.1:5350/g/3']) {
      expect(pinnedForgeDoor(raw, true), raw).toBeNull();
    }
  });

  it('refuses /ws, a standing room\'s path, a query, another zone, http:, ws: outside devmode, a game id past the safe integers, a non-string', () => {
    const bad = [
      'wss://firehuge.play.socom2legacy.com/ws', 'wss://firehuge.play.socom2legacy.com/r/MP2/classic', 'wss://firehuge.play.socom2legacy.com/g/41?x=1',
      'wss://firehuge.play.example.com/g/41', 'wss://firehuge.play.socom2legacy.com.evil.example/g/41', 'http://firehuge.play.socom2legacy.com/g/41',
      'https://firehuge.play.socom2legacy.com/g/41', 'ws://firehuge.play.socom2legacy.com/g/41', 'wss://firehuge.play.socom2legacy.com/g/0',
      'wss://firehuge.play.socom2legacy.com/g/9999999999999999', 'wss://site.test/ws', 'http://127.0.0.1:5343/g/3',
    ];
    for (const raw of bad) expect(pinnedForgeDoor(raw, true), raw).toBeNull();
    for (const raw of [null, undefined, 41, {}, [door('firehuge', 41)]]) expect(pinnedForgeDoor(raw, true)).toBeNull();
  });
});

describe('SA-6b: the game token\'s form (GAME_TOKEN_CHARS_MAX, match\'s TOKEN_MAX_LENGTH mirrored)', () => {
  it('three base64url parts and their dots, 1..GAME_TOKEN_CHARS_MAX characters', () => {
    expect(GAME_TOKEN_CHARS_MAX).toBe(16_384);
    expect(isGameToken(TOKEN)).toBe(true);
    const long = `${'a'.repeat(GAME_TOKEN_CHARS_MAX - 4)}.b.c`;
    expect([isGameToken(long), isGameToken(`${long}d`)]).toEqual([true, false]);
    for (const bad of ['', 'a.b', 'a.b.c.d', 'a..c', 'a.b.c ', 'a+b.c.d', 7, null, undefined]) expect(isGameToken(bad), String(bad)).toBe(false);
  });
});

describe('SA-6b: the game seat (isGameSeat, gameSeatOpen, gameSeatOf)', () => {
  let DOOR: NonNullable<ReturnType<typeof pinnedGameDoor>>;
  beforeEach(() => { DOOR = pinnedGameDoor(door('firehuge'), 7, false)!; });

  it('the pinned URL with a ticket, or a pinned door with a token, is a seat', () => {
    expect(isGameSeat({ pinned: PINNED, ticket: 'tkt' })).toBe(true);
    expect(isGameSeat({ pinned: PINNED, ticket: '' })).toBe(true);           // the forge's hand-off: no ticket
    expect(isGameSeat({ pinned: DOOR, token: TOKEN })).toBe(true);
    expect(isGameSeat({ id: 7, pinned: DOOR, token: TOKEN })).toBe(true);
  });

  it('a mixed seat is refused: a ticket with a door, a token with the pinned URL, both on either', () => {
    expect(isGameSeat({ pinned: DOOR, ticket: 'tkt' })).toBe(false);
    expect(isGameSeat({ pinned: PINNED, token: TOKEN })).toBe(false);
    expect(isGameSeat({ pinned: DOOR, token: TOKEN, ticket: 'tkt' })).toBe(false);
    expect(isGameSeat({ pinned: PINNED, ticket: 'tkt', token: TOKEN })).toBe(false);
  });

  it('an unpinned URL of either kind is refused: a plain { url }, a door string, a door not made by pinnedGameDoor', () => {
    expect(isGameSeat({ pinned: { url: 'wss://site.test/ws' }, ticket: 'tkt' })).toBe(false);
    expect(isGameSeat({ pinned: { url: door('firehuge'), game: 7 }, token: TOKEN })).toBe(false);
    expect(isGameSeat({ pinned: door('firehuge'), token: TOKEN })).toBe(false);
    expect(isGameSeat({ pinned: 'wss://site.test/ws', ticket: 'tkt' })).toBe(false);
    expect(isGameSeat({ pinned: Object.freeze({ ...DOOR }), token: TOKEN })).toBe(false);
  });

  it('a door seat with a bad token, or naming another game than its id, is refused; nothing that is no object is a seat', () => {
    expect(isGameSeat({ pinned: DOOR, token: '' })).toBe(false);
    expect(isGameSeat({ pinned: DOOR, token: 'x' })).toBe(false);
    expect(isGameSeat({ id: 8, pinned: DOOR, token: TOKEN })).toBe(false);
    for (const v of [null, undefined, 'x', 7]) expect(isGameSeat(v)).toBe(false);
  });

  it('gameSeatOpen: the pinned URL and the ticket, or the door and the token -- never the other credential', () => {
    expect(gameSeatOpen({ pinned: PINNED, ticket: 'tkt' }, 7)).toEqual({ url: PINNED.url, game: { id: 7, ticket: 'tkt' } });
    expect(gameSeatOpen({ pinned: DOOR, token: TOKEN }, 7)).toEqual({ url: door('firehuge'), game: { id: 7, token: TOKEN } });
  });

  it('gameSeatOf: only the seat\'s two fields from a hand-off, nothing else carried', () => {
    const local = { mediusWorldId: 7, gameName: 'g', pinned: PINNED, ticket: 'tkt', held: true };
    const placed = { mediusWorldId: 7, gameName: 'g', pinned: DOOR, token: TOKEN, held: true };
    expect(gameSeatOf(local as never)).toEqual({ pinned: PINNED, ticket: 'tkt' });
    expect(gameSeatOf(placed as never)).toEqual({ pinned: DOOR, token: TOKEN });
  });

  it('voiceReportSocket: the pinned URL for a local game; the pinned door for a placed one (SA-7d: the door forwards it)', () => {
    expect(voiceReportSocket({ pinned: PINNED, ticket: 'tkt' })).toBe(PINNED.url);
    expect(voiceReportSocket({ pinned: DOOR, token: TOKEN })).toBe(DOOR.url);
  });
});
