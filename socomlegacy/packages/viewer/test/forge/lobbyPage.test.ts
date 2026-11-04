// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedMatchSocket } from '../../src/connectHost';
import type { NetClient } from '../../src/net/client';
import type { ServerEvent } from '../../src/net/protocol';
import type { ForgeLobbyDeps } from '../../src/forge/lobby/deps';
import { mountForgeLobby } from '../../src/forge/lobby/lobby';
import {
  defaultLobbyName, forgetStaleHost, joinLockedLobby, LOBBY_LEAVE_WAIT_MS, leaveLobbyInOrder, lobbyHostProof, lobbyMenuItems, lobbyPasswordField, lobbySocketOf, lobbyVisibilityToggle, matchHandOff,
  typingTarget,
  type LobbyLeaveEffects, type LobbyRowsState, type LockedJoinEffects,
} from '../../src/forge/lobbyPage';
import type { EnterAnswer } from '../../src/forge/lobbyClient';

/**
 * FORGE (FG-26; FG.R11, FG.R20-R23, a browser adaptation with no original): the page's lobby pieces -- the START menu's
 * rows (the popup's open and close, FG.R22), the typing guard (FG.R23: the chat's typing reaches no forge shortcut),
 * the match's hand-off over the lobby's client (`mountMatch` as the front end's `GameLobbyHandOff`), and the popup's
 * notice and its hiding. The owner's word (2026-10-14, FG.R22): the pad's Home button (16) is never read.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FORGE = resolve(here, '../../src/forge');

describe('FORGE lobby: the START menu\'s rows', () => {
  const acts = () => {
    const did: string[] = [];
    return { did, acts: { create: () => did.push('create'), show: (on: boolean) => did.push(on ? 'show' : 'hide'), leave: () => did.push('leave'), close: () => did.push('close'), copyLink: () => did.push('copy') } };
  };

  it('no lobby: "Create lobby", disabled while there is nothing to post', () => {
    const { did, acts: a } = acts();
    const rows = lobbyMenuItems({ lobby: null, canCreate: true }, a);
    expect(rows.map((r) => r.id)).toEqual(['lobby-create']);
    rows[0]!.act!();
    expect(did).toEqual(['create']);
    expect(lobbyMenuItems({ lobby: null, canCreate: false }, a)[0]!.disabled).toBe(true);
  });

  it('a lobby open: show or hide the window, copy the link, leave; FG-48c the host\'s LEAVE hands it on, its "Close the lobby" apart', () => {
    const { did, acts: a } = acts();
    const open: LobbyRowsState = { lobby: { name: 'BOXES', role: 'host', shown: false, ended: false }, canCreate: true };
    const rows = lobbyMenuItems(open, a);
    expect(rows.map((r) => r.id)).toEqual(['lobby-window', 'lobby-link', 'lobby-leave', 'lobby-close']);
    expect(rows[0]!.label).toMatch(/Show/);
    expect(rows[2]!.label).toBe('Leave the lobby');
    expect(rows[2]!.note).toMatch(/next player/i);
    expect(rows[3]!.label).toBe('Close the lobby');
    expect(rows[3]!.note).toMatch(/every/i);
    for (const r of rows) r.act!();
    expect(did).toEqual(['show', 'copy', 'leave', 'close']);
    // A joiner leaves; it has no close.
    const joiner = lobbyMenuItems({ lobby: { name: 'BOXES', role: 'joiner', shown: false, ended: false }, canCreate: true }, a);
    expect(joiner.map((r) => [r.id, r.label])).toEqual([['lobby-window', 'Show the lobby'], ['lobby-link', 'Copy the lobby link'], ['lobby-leave', 'Leave the lobby']]);
    did.length = 0;
    const shown = lobbyMenuItems({ ...open, lobby: { ...open.lobby!, shown: true } }, a);
    expect(shown[0]!.label).toMatch(/Hide/);
    shown[0]!.act!();
    expect(did.at(-1)).toBe('hide');
  });

  it('an ended lobby offers a new one', () => {
    const { acts: a } = acts();
    expect(lobbyMenuItems({ lobby: { name: 'BOXES', role: 'joiner', shown: true, ended: true }, canCreate: true }, a).map((r) => r.id)).toEqual(['lobby-create']);
  });
});

describe('FORGE lobby: the name the server takes (1..32 printable ASCII)', () => {
  it('is the map\'s label, its non-ASCII dropped and its length cut', () => {
    expect(defaultLobbyName('Frostfire')).toBe('Forge: Frostfire');
    expect(defaultLobbyName('Crossroads · Night')).toBe('Forge: Crossroads Night');
    expect(defaultLobbyName('A very long map name that will not fit anywhere').length).toBe(32);
    expect(defaultLobbyName('')).toBe('Forge');
  });
});

describe('FORGE lobby: the chat\'s typing reaches no forge shortcut (FG.R23)', () => {
  it('an input, a text area, a select or an editable is a typing target; the canvas and the body are not', () => {
    const doc = document;
    for (const tag of ['input', 'textarea', 'select'] as const) expect(typingTarget(doc.createElement(tag)), tag).toBe(true);
    const editable = doc.createElement('div');
    editable.contentEditable = 'true';
    expect(typingTarget(editable)).toBe(true);
    expect(typingTarget(doc.createElement('canvas'))).toBe(false);
    expect(typingTarget(doc.body)).toBe(false);
    expect(typingTarget(null)).toBe(false);
  });

  it('the popup\'s chat input is one', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const lobby = mountForgeLobby(host, deps(), { store: { get: () => null, set: () => undefined }, viewport: () => ({ width: 1280, height: 720 }), paint: null });
    const input = lobby.root.querySelector('input');
    expect(input).not.toBeNull();
    expect(typingTarget(input)).toBe(true);
    lobby.dispose();
  });

  it('the forge\'s development keys return at once on a typing target (page.ts\'s keydown listener)', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8').split('\n');
    const at = page.findIndex((l) => /addEventListener\('keydown'/.test(l));
    expect(at).toBeGreaterThan(0);
    expect(page.slice(at, at + 3).join('\n')).toMatch(/if \(typingTarget\(e\.target\)\) return;/);
  });
});

describe('FORGE lobby: the pad\'s Home button (16) is never read (the owner\'s word, 2026-10-14, FG.R22)', () => {
  it('no forge source reads button 16', () => {
    const files = ['', 'lobby/'].flatMap((d) => readdirSync(resolve(FORGE, d)).filter((f) => f.endsWith('.ts')).map((f) => `${d}${f}`));
    const bad = files.flatMap((f) => readFileSync(resolve(FORGE, f), 'utf-8').split('\n').flatMap((l, i) => (/buttons\s*\[\s*16\s*\]|buttons\.at\(\s*16\s*\)|PAD_BUTTON\.Home/.test(l) ? [`${f}:${i + 1}`] : [])));
    expect(bad).toEqual([]);
  });
});

describe('FORGE lobby: the popup\'s notice and its hiding (the page\'s START menu and toolbar open and close it)', () => {
  it('a notice is a line of the chat panel; hidden, the window stays mounted', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const lobby = mountForgeLobby(host, deps(), { store: { get: () => null, set: () => undefined }, viewport: () => ({ width: 1280, height: 720 }), paint: null });
    lobby.notice('The lobby closed');
    expect(lobby.root.textContent).toContain('The lobby closed');
    lobby.setShown(false);
    expect(lobby.root.hidden).toBe(true);
    expect(lobby.root.isConnected).toBe(true);
    lobby.setShown(true);
    expect(lobby.root.hidden).toBe(false);
    lobby.dispose();
  });
});

describe('FORGE lobby: the match\'s hand-off over the lobby\'s client (match.ts as the front end\'s GameLobbyHandOff)', () => {
  it('names the lobby, its map and the pinned socket; the welcome and the round handed on; the session held by the client', () => {
    const client = { id: 3 } as unknown as NetClient;
    const welcome = { type: 'welcome', id: 3, team: 'seal' } as unknown as Extract<ServerEvent, { type: 'welcome' }>;
    const pinned = pinnedMatchSocket('', { protocol: 'https:', host: 'forge.test' }, false);
    const h = matchHandOff({ client, welcome, roundStart: null, events: [welcome] }, { gameName: 'BOXES', mission: 'MP72', pinned, lateJoiner: false });
    expect(h).toMatchObject({ client, welcome, roundStart: null, mediusWorldId: 0, gameName: 'BOXES', mission: 'MP72', lateJoiner: false, held: true, ticket: '' });
    expect(h.pinned.url).toBe('wss://forge.test/ws');
  });
});

/**
 * LATER 275 (SA-7i's page half; product track, the transport -- a browser adaptation with no original): where the lobby's
 * socket opens. No seat (a lobby central runs itself, `npm run local`'s): the page's pinned `/ws`, no token, as before. A
 * placed lobby's seat: its door, pinned by `pinnedForgeDoor` (the devmode loopback only where the page's pin allows it),
 * and its token; a door the page does not follow: none (the page says so). The match's `pinned` stays the page's own.
 */
describe('LATER 275: the lobby\'s socket (`lobbySocketOf`)', () => {
  const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'forge.test' }, false, false);
  const DEV = pinnedMatchSocket('?devmode', { protocol: 'http:', host: '127.0.0.1:5303' }, true, false);
  const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
  const DOOR = 'wss://firehuge.play.socom2legacy.com/g/41';

  it('no seat: the pinned /ws and no token', () => {
    expect(lobbySocketOf(PINNED, null)).toEqual({ url: 'wss://forge.test/ws', token: null });
  });

  it('a placed lobby\'s seat: its door and its token; the loopback door only under the page\'s devmode pin', () => {
    expect(lobbySocketOf(PINNED, { door: DOOR, token: TOKEN })).toEqual({ url: DOOR, token: TOKEN });
    expect(lobbySocketOf(DEV, { door: 'ws://127.0.0.1:5343/g/3', token: TOKEN })).toEqual({ url: 'ws://127.0.0.1:5343/g/3', token: TOKEN });
    expect(lobbySocketOf(PINNED, { door: 'ws://127.0.0.1:5343/g/3', token: TOKEN })).toBeNull();
  });

  it('a door the page does not follow is none: central\'s port, /ws, another zone, a query', () => {
    for (const door of ['ws://127.0.0.1:5340/g/3', 'wss://firehuge.play.socom2legacy.com/ws', 'wss://firehuge.play.example.com/g/41', `${DOOR}?x=1`, 'wss://forge.test/ws']) {
      expect(lobbySocketOf(DEV, { door, token: TOKEN }), door).toBeNull();
    }
  });

  it('the page: enterLobby opens on it, says a refused door and closes the creator\'s lobby; create and join hand it the seat', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/seat: \{ door: string; token: string \} \| null/);
    expect(enter).toMatch(/const sock = lobbySocketOf\(pinned, o\.seat\);/);
    expect(enter).toMatch(/openLobbySocket\(\{ url: sock\.url,/);
    expect(enter).toMatch(/the lobby's server is not one this page joins/);
    expect(enter.indexOf('lobbySocketOf(')).toBeLessThan(enter.indexOf('openLobbySocket('));
    // The match's hand-off keeps the page's own pinned socket (`matchHandOff`'s `pinned`).
    expect(enter).toMatch(/const l: LobbyHere = \{ \.\.\.o, pinned, session,/);
    const create = page.slice(page.indexOf('const createLobbyNow = '), page.indexOf('const joinLobby = '));
    expect(create).toMatch(/enterLobby\(\{[^}]*seat: made\.seat/);
    const join = page.slice(page.indexOf('const joinLobby = '), page.indexOf('lobbyBtn.addEventListener'));
    const asked = join.indexOf('askForgeSeat('), locked = join.indexOf('joinLockedLobby('), hello = join.indexOf('enterLobby({');
    expect(asked).toBeGreaterThan(locked);                                   // after the locked lobby's entry
    expect(hello).toBeGreaterThan(asked);                                    // just before the hello: the token lives 60 s
    expect(join).toMatch(/if \(placed && !placed\.ok\) \{ ownLayoutBack\(\); return stop\(/);
    expect(join).toMatch(/enterLobby\(\{[^}]*seat: placed\?\.seat \?\? null/);
  });

  /**
   * LATER 306 (LATER 275's after-the-fact review, the forge seat's): the refusal branches pinned. A refused door closes
   * the creator's lobby by its host ticket alone, awaited -- a close refused or unanswered said in words, the entry still
   * false (else a signed-in host holds a lobby it cannot enter: its next Create is 409 until the idle sweep); the joiner's
   * refused entry goes back to its own layout and stops. Deleting either branch turns this red.
   */
  it('LATER 306: a refused door awaits the creator\'s close (host ticket alone) and says a failed one; the join\'s refusal goes back and stops', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/^const enterLobby = async \(/);
    const refused = /if \(!sock\) \{[\s\S]*?\n {6}return false;\n {4}\}/.exec(enter)?.[0] ?? '';
    expect(refused).toMatch(/the lobby's server is not one this page joins/);
    // (a) the close, by the host's role and its host ticket alone (no bearer), awaited
    expect(refused).toMatch(/o\.role === 'host' && o\.hostTicket && !\(await closeLobby\(lobbyBase\(\), o\.id, o\.hostTicket\)\)/);
    expect(enter).not.toMatch(/void closeLobby\(/);
    // (2) a failed close named in words
    expect(refused).toMatch(/say\(`[^`]*could not be closed[^`]*`, true\)/);
    // the entry awaited by both callers
    const create = page.slice(page.indexOf('const createLobbyNow = '), page.indexOf('const joinLobby = '));
    expect(create).toMatch(/await enterLobby\(\{[^}]*seat: made\.seat/);
    const join = page.slice(page.indexOf('const joinLobby = '), page.indexOf('lobbyBtn.addEventListener'));
    // (b) the joiner's refused entry: its own layout back, then the stop
    expect(join).toMatch(/if \(!\(await enterLobby\(\{[^\n]*seat: placed\?\.seat \?\? null \}\)\)\) \{\n\s*ownLayoutBack\(\);\n\s*return stop\(/);
  });
});

function deps(): ForgeLobbyDeps {
  return {
    doc: document, net: () => null, lobby: () => null, onLobby: () => () => undefined, onChat: () => () => undefined, me: () => null,
    title: () => ({ name: 'BOXES', map: 'MP72', players: 8 }), send: () => undefined, chat: () => undefined, armory: () => null, close: () => undefined,
  };
}

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the create's card carries the lobby's visibility beside its
 * name -- "Show in Custom matches", off unless ticked (the mouse and the keyboard set it there; the pad sets it later
 * from the window, the host's control).
 */
describe('FG-45: the create card\'s visibility toggle', () => {
  it('a checkbox labelled "Show in Custom matches", off by default; ticked, the lobby asks to be listed', () => {
    const t = lobbyVisibilityToggle(document);
    document.body.append(t.root);
    const box = t.root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box).not.toBeNull();
    expect(t.root.textContent).toContain('Show in Custom matches');
    expect([box.checked, t.listed()]).toEqual([false, false]);
    box.click();
    expect([box.checked, t.listed()]).toEqual([true, true]);
    t.root.remove();
  });

  it('the page hands the card the toggle and the create its answer (page.ts `createLobbyNow`)', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const create = page.slice(page.indexOf('const createLobbyNow = '), page.indexOf('const joinLobby = '));
    expect(create).toMatch(/lobbyVisibilityToggle\(doc\)/);
    expect(create).toMatch(/createLobby\(lobbyBase\(\), name, l, ticket, undefined, \{ listed: [^}]+\}\)/);
  });
});

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): the create card's optional password field, and the page's
 * join of a locked lobby -- the password asked in a card before the hello (after the guest pass for a guest), entered
 * over `POST .../enter` with the seat's bearer, a refusal said and asked again.
 */
describe('FG-48a: the create card\'s password and a locked lobby\'s join', () => {
  it('a password field (masked, at most 32), empty for none; a password the server would refuse is said as not taken', () => {
    const f = lobbyPasswordField(document);
    document.body.append(f.root);
    const input = f.root.querySelector<HTMLInputElement>('input')!;
    expect([input.type, input.maxLength]).toEqual(['password', 32]);
    expect(f.root.textContent).toMatch(/password/i);
    expect([f.password(), f.ok()]).toEqual([null, true]);                   // none: an open lobby
    input.value = 'open sesame';
    expect([f.password(), f.ok()]).toEqual(['open sesame', true]);
    input.value = 'café';
    expect(f.ok()).toBe(false);
    f.root.remove();
  });

  it('the page: the create card carries the field and the create its password; a locked lobby\'s join asks it and enters before the hello', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const create = page.slice(page.indexOf('const createLobbyNow = '), page.indexOf('const joinLobby = '));
    expect(create).toMatch(/lobbyPasswordField\(doc\)/);
    expect(create).toMatch(/password: passwordField\.password\(\)/);
    const join = page.slice(page.indexOf('const joinLobby = '), page.indexOf('lobbyBtn.addEventListener'));
    expect(join).toMatch(/got\.lobby\.locked/);
    // The call site only: the loop itself is `joinLockedLobby`'s, run below.
    const asked = join.indexOf('askGuest('), entered = join.indexOf('joinLockedLobby('), hello = join.indexOf('enterLobby({');
    expect(asked).toBeGreaterThan(0);
    expect(entered).toBeGreaterThan(asked);                                  // after the guest pass
    expect(hello).toBeGreaterThan(entered);                                  // before the hello
    expect(join.slice(entered)).toMatch(/enterLocked\(/);                    // the enter is the client's
    expect(join).toMatch(/ticket \? null :/);                                // a login-ticket seat renews no pass (F2)
  });
});

/**
 * FG-48b, FG-48c (FG.R24; a product-track adaptation, no original): the page hands the window its host's seams -- the
 * visibility, the password, the kick, FG-48c the close -- while its own seat carries the host's flag and it holds a proof
 * (`lobbyHostProof`), so a successor's page gains them live and the old host's loses them.
 */
describe('FG-48b, FG-48c: the page\'s host seams (page.ts `enterLobby`)', () => {
  it('each seam follows `lobbyHostProof` over the seat\'s own flag; the kick proved by the proof; the close a seam of its own', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/const hostProof = \(\): LobbyHostProof \| null => lobbyHostProof\(l, session\.me\(\)\);/);
    for (const seam of ['visibility', 'password', 'kick', 'end']) expect(enter, seam).toMatch(new RegExp(`const ${seam} = \\(\\): \\w+ \\| null => \\{ const p = hostProof\\(\\); return !p \\? null :`));
    expect(enter).toMatch(/kickSeat\(lobbyBase\(\), l\.id, seat, p\.hostTicket, p\.bearer\)/);
    expect(enter).toMatch(/setListed\(lobbyBase\(\), l\.id, on, p\.hostTicket, p\.bearer\)/);
    expect(enter).toMatch(/setPassword\(lobbyBase\(\), l\.id, pw, p\.hostTicket, p\.bearer\)/);
    expect(enter).toMatch(/mountForgeLobby\(doc\.body, \{ \.\.\.session\.deps\([^)]*\)[^}]*\}\), visibility, password, kick, end \}/);
    // A seat handed the host reads the lobby once, so LISTED and the password show the server's state.
    expect(enter).toMatch(/session\.onLobby\(/);
    expect(enter).toMatch(/fetchLobby\(lobbyBase\(\), l\.id\)/);
    // The START menu's rows follow the proof too, and its close is the lobby's close.
    expect(page).toMatch(/role: lobbyHostProof\(lobby, lobby\.session\.me\(\)\) \? 'host' : 'joiner'/);
    expect(page).toMatch(/close: \(\) => leaveLobby\(true\)/);
  });
});

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): the page's proof of the host -- its own seat's host flag (the
 * room's view, `ForgeLobbySession.me`) and something to prove it with: the creator's host ticket, or a bearer (the login's
 * ticket, or an FG-28 guest successor's pass). A guest creator proves itself by its host ticket alone (FG-38: its pass is
 * never its host's bearer). Before its welcome the creator's page stands on its ticket (the creator's path).
 */
describe('FG-48c: the page\'s proof of the host (`lobbyHostProof`)', () => {
  const T = ['host', 'ticket'].join('-'), LOGIN = ['login', 'ticket'].join('-'), PASS = ['guest', 'pass'].join('-');
  it('the creator: its host ticket and its login\'s bearer; a guest creator its host ticket alone', () => {
    expect(lobbyHostProof({ role: 'host', hostTicket: T, ticket: LOGIN, guest: false }, { host: true })).toEqual({ hostTicket: T, bearer: LOGIN });
    expect(lobbyHostProof({ role: 'host', hostTicket: T, ticket: PASS, guest: true }, { host: true })).toEqual({ hostTicket: T, bearer: null });
    expect(lobbyHostProof({ role: 'host', hostTicket: T, ticket: null, guest: true }, { host: true })).toEqual({ hostTicket: T, bearer: null });
  });

  it('a successor (no host ticket): its own bearer -- the login\'s, or its guest pass -- while its seat carries the flag', () => {
    expect(lobbyHostProof({ role: 'joiner', hostTicket: null, ticket: LOGIN, guest: false }, { host: true })).toEqual({ hostTicket: null, bearer: LOGIN });
    expect(lobbyHostProof({ role: 'joiner', hostTicket: null, ticket: PASS, guest: true }, { host: true })).toEqual({ hostTicket: null, bearer: PASS });
    // FG.R21's ticketless seat has nothing to prove itself by.
    expect(lobbyHostProof({ role: 'joiner', hostTicket: null, ticket: null, guest: true }, { host: true })).toBeNull();
  });

  it('no flag, no proof: a joiner, and the old host whose flag went with the hand-on', () => {
    expect(lobbyHostProof({ role: 'joiner', hostTicket: null, ticket: LOGIN, guest: false }, { host: false })).toBeNull();
    expect(lobbyHostProof({ role: 'host', hostTicket: T, ticket: LOGIN, guest: false }, { host: false })).toBeNull();
  });

  it('before the welcome (no seat yet): the creator\'s ticket path; a joiner none', () => {
    expect(lobbyHostProof({ role: 'host', hostTicket: T, ticket: null, guest: true }, null)).toEqual({ hostTicket: T, bearer: null });
    expect(lobbyHostProof({ role: 'joiner', hostTicket: null, ticket: LOGIN, guest: false }, null)).toBeNull();
  });
});

/**
 * FG-48a's review F3a and F2 (a product-track adaptation, no original): the locked join's loop, run -- the password asked,
 * a refusal said and asked again (a wrong one, 429, 400), a cancel the join's end, any other refusal its stop; and F2, a
 * guest whose pass lapsed while the card was open (401) given a fresh pass once and entered again with the same password.
 */
describe('FG-48a review F3a: the locked join\'s loop (`joinLockedLobby`)', () => {
  type Answer = EnterAnswer;
  const wrong: Answer = { ok: false, status: 403, words: 'not the password', wrong: true };
  const limited: Answer = { ok: false, status: 429, words: 'too many tries', wrong: false };
  const bad: Answer = { ok: false, status: 400, words: 'not taken', wrong: false };
  const elsewhere: Answer = { ok: false, status: 403, words: 'another lobby\'s pass', wrong: false };
  const lapsed: Answer = { ok: false, status: 401, words: 'the sign-in has ended', wrong: false };
  const right: Answer = { ok: true };
  // Invented bearers, joined from segments (no quoted value reads as a credential to the leak check).
  const PASS_1 = ['pass', '1'].join('-'), PASS_2 = ['pass', '2'].join('-');
  /** Effects scripted: the typed answers in order, the enter's answers in order, the renewals' answers in order (or no renew). */
  const run = (typed: (string | null)[], answers: Answer[], renewals: ({ ok: true; bearer: string } | { ok: false; words: string })[] | null) => {
    const log: string[] = [];
    const entered: [string, string][] = [];
    const effects: LockedJoinEffects = {
      ask: async (line) => { log.push(`ask: ${line}`); return typed.length ? typed.shift()! : null; },
      enter: async (password, bearer) => { entered.push([password, bearer]); const a = answers.shift(); if (!a) throw new Error('an enter past the script'); return a; },
      renew: renewals === null ? null : async () => { log.push('renew'); const r = renewals.shift(); if (!r) throw new Error('a renewal past the script'); return r; },
      say: (line) => { log.push(`say: ${line}`); },
    };
    return { log, entered, done: joinLockedLobby('BOXES', PASS_1, effects) };
  };

  it('right first time: admitted, the bearer the seat\'s own', async () => {
    const r = run(['open sesame'], [right], null);
    expect(await r.done).toEqual({ ok: true, bearer: PASS_1 });
    expect(r.entered).toEqual([['open sesame', PASS_1]]);
    expect(r.log).toEqual(['ask: BOXES asks a password before you join.']);
  });

  it('wrong then right: the refusal said and asked again', async () => {
    const r = run(['nope', 'open sesame'], [wrong, right], null);
    expect(await r.done).toEqual({ ok: true, bearer: PASS_1 });
    expect(r.entered.map(([p]) => p)).toEqual(['nope', 'open sesame']);
    expect(r.log).toEqual(['ask: BOXES asks a password before you join.', 'say: not admitted: not the password', 'ask: Not admitted: not the password. Type it again.']);
  });

  it('a cancel ends the join, at the first ask or after a refusal', async () => {
    expect(await run([null], [], null).done).toEqual({ ok: false, cancelled: true });
    const r = run(['nope', null], [wrong], null);
    expect(await r.done).toEqual({ ok: false, cancelled: true });
    expect(r.entered).toHaveLength(1);
  });

  it('429 and 400 ask again; then right', async () => {
    const r = run(['a', 'b', 'open sesame'], [limited, bad, right], null);
    expect(await r.done).toEqual({ ok: true, bearer: PASS_1 });
    expect(r.entered).toHaveLength(3);
  });

  it('another refusal stops the join, its words said once', async () => {
    const r = run(['open sesame', 'never asked'], [elsewhere], null);
    expect(await r.done).toEqual({ ok: false, cancelled: false, line: 'The lobby did not admit you: another lobby\'s pass.' });
    expect(r.entered).toHaveLength(1);
    expect(r.log.filter((l) => l.startsWith('ask'))).toHaveLength(1);
  });

  it('a login-ticket seat\'s 401 stops as before: no renewal', async () => {
    const r = run(['open sesame'], [lapsed], null);
    expect(await r.done).toEqual({ ok: false, cancelled: false, line: 'The lobby did not admit you: the sign-in has ended.' });
  });

  it('F2: a guest\'s 401 takes a fresh pass once and enters again with the same password; the hello carries the fresh pass', async () => {
    const r = run(['open sesame'], [lapsed, right], [{ ok: true, bearer: PASS_2 }]);
    expect(await r.done).toEqual({ ok: true, bearer: PASS_2 });
    expect(r.entered).toEqual([['open sesame', PASS_1], ['open sesame', PASS_2]]);
    expect(r.log.filter((l) => l.startsWith('ask'))).toHaveLength(1);       // the same typed password, not asked again
  });

  it('F2: once only -- a second 401 after the fresh pass stops; a fresh pass refused stops with its words', async () => {
    const twice = run(['open sesame', 'pw', 'never asked'], [lapsed, wrong, lapsed], [{ ok: true, bearer: PASS_2 }]);
    expect(await twice.done).toEqual({ ok: false, cancelled: false, line: 'The lobby did not admit you: the sign-in has ended.' });
    expect(twice.entered).toEqual([['open sesame', PASS_1], ['open sesame', PASS_2], ['pw', PASS_2]]);
    expect(twice.log.filter((l) => l === 'renew')).toHaveLength(1);
    const refused = run(['open sesame'], [lapsed], [{ ok: false, words: 'too many guest passes asked from here' }]);
    expect(await refused.done).toEqual({ ok: false, cancelled: false, line: 'No fresh guest pass for this lobby: too many guest passes asked from here.' });
  });
});

/**
 * The FG-48 batch review's F2 (a product-track adaptation, no original): the host's LEAVE and CLOSE LOBBY run in order --
 * the request (the LEAVE's POST, the close's DELETE) settled before the socket closes, so the server never reads the
 * socket's end first (which would hand the lobby on and leave the DELETE a 403, the lobby open under a successor); the
 * wait bounded (`LOBBY_LEAVE_WAIT_MS`) so a dead server never holds the page; a failure said, never swallowed. A joiner,
 * with nothing to ask, closes its socket at once.
 */
describe('FG-48 review F2: the host\'s leave in order (`leaveLobbyInOrder`)', () => {
  type Settle = { ok: true } | { ok: false; words: string };
  /** Effects with the request and the bound held open by the test: each settled by hand. */
  const rig = (hosting = true) => {
    const log: string[] = [];
    let settle: (a: Settle) => void = () => undefined;
    let fail: (e: unknown) => void = () => undefined;
    let lapse: () => void = () => undefined;
    const waits: number[] = [];
    const effects: LobbyLeaveEffects = {
      request: hosting ? () => { log.push('request'); return new Promise<Settle>((ok, no) => { settle = ok; fail = no; }); } : null,
      closeSocket: () => { log.push('close'); },
      say: (line) => { log.push(`say: ${line}`); },
      wait: (ms) => { waits.push(ms); return new Promise<void>((r) => { lapse = r; }); },
    };
    return { log, waits, effects, settle: (a: Settle) => settle(a), fail: (e: unknown) => fail(e), lapse: () => lapse() };
  };
  const ticks = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('the socket closes only after the request settles; a close that went through says nothing', async () => {
    for (const what of ['close', 'leave'] as const) {
      const r = rig();
      const done = leaveLobbyInOrder(what, r.effects);
      await ticks();
      expect(r.log).toEqual(['request']);                              // asked; the socket still open
      r.settle({ ok: true });
      expect(await done).toBe('done');
      expect(r.log).toEqual(['request', 'close']);
      expect(r.waits).toEqual([LOBBY_LEAVE_WAIT_MS]);
    }
  });

  it('a failed close or leave is said, and the socket closes after it all the same', async () => {
    const c = rig();
    const closing = leaveLobbyInOrder('close', c.effects);
    c.settle({ ok: false, words: 'only the lobby\'s host may close it' });
    expect(await closing).toBe('failed');
    expect(c.log).toEqual(['request', 'say: the lobby was not closed: only the lobby\'s host may close it', 'close']);
    const l = rig();
    const leaving = leaveLobbyInOrder('leave', l.effects);
    l.settle({ ok: false, words: 'the server could not be reached' });
    expect(await leaving).toBe('failed');
    expect(l.log).toEqual(['request', 'say: the lobby was not handed on: the server could not be reached', 'close']);
    // A request that throws is a failure said too.
    const t = rig();
    const thrown = leaveLobbyInOrder('close', t.effects);
    t.fail(new Error('boom'));
    expect(await thrown).toBe('failed');
    expect(t.log).toEqual(['request', 'say: the lobby was not closed: boom', 'close']);
  });

  it('the bound: a request that never settles still closes the socket when the wait lapses, the lapse said', async () => {
    const r = rig();
    const done = leaveLobbyInOrder('close', r.effects);
    await ticks();
    expect(r.log).toEqual(['request']);
    r.lapse();
    expect(await done).toBe('timeout');
    expect(r.log).toEqual(['request', `say: the server did not answer the close in ${LOBBY_LEAVE_WAIT_MS / 1000} s: the lobby may still be open`, 'close']);
    r.settle({ ok: false, words: 'late' });                            // a late answer changes nothing more
    await ticks();
    expect(r.log).toHaveLength(3);
    expect(LOBBY_LEAVE_WAIT_MS).toBeGreaterThan(0);
    expect(LOBBY_LEAVE_WAIT_MS).toBeLessThanOrEqual(10_000);           // a few seconds: a dead server never holds the page
  });

  it('a joiner (nothing to ask) closes its socket at once, in the same tick', () => {
    const r = rig(false);
    void leaveLobbyInOrder('leave', r.effects);
    expect(r.log).toEqual(['close']);
    expect(r.waits).toEqual([]);
  });

  it('the page runs its leave through it: the window and the renderer let go first, the socket by the order', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const leave = page.slice(page.indexOf('const leaveLobby = '), page.indexOf('const ownLayoutBack = '));
    expect(leave).toMatch(/leaveLobbyInOrder\(/);
    expect(leave).toMatch(/closeSocket: \(\) => \{? ?l\.session\.close\(\)/);
    expect(leave).not.toMatch(/^\s*l\.session\.close\(\);/m);              // never closed beside the request in one tick
    expect(leave.indexOf('l.popup?.dispose()')).toBeLessThan(leave.indexOf('leaveLobbyInOrder('));
    expect(leave.indexOf('l.painter.dispose()')).toBeLessThan(leave.indexOf('leaveLobbyInOrder('));
    expect(leave).not.toMatch(/does not matter/);
  });
});

/**
 * The FG-48 re-review's F1 (a product-track adaptation, no original): at a lobby match's end (and at the start's failure
 * once the socket went to the match) the lobby's socket is already gone -- the match's close shut it -- so the socket's
 * close is the hand-on: the page sends no request after it (it would meet a 403 and say an untrue line) and says nothing.
 * An explicit LEAVE or CLOSE LOBBY, the socket still the session's, keeps the F2 order. And a told lobby that names another
 * seat as host drops the page's own creator's proof, so a page that handed the lobby on never proves itself host again.
 */
describe('FG-48 re-review F1: no request after the socket, no stale host proof', () => {
  type Settle = { ok: true } | { ok: false; words: string };
  const rig = () => {
    const log: string[] = [];
    let settle: (a: Settle) => void = () => undefined;
    const waits: number[] = [];
    const effects: LobbyLeaveEffects = {
      request: () => { log.push('request'); return new Promise<Settle>((ok) => { settle = ok; }); },
      closeSocket: () => { log.push('close'); },
      say: (line) => { log.push(`say: ${line}`); },
      wait: (ms) => { waits.push(ms); return new Promise<void>(() => undefined); },
    };
    return { log, waits, effects, settle: (a: Settle) => settle(a) };
  };
  const ticks = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('the socket gone (a match\'s end): no request, no line, no wait -- the session let go at once, for a LEAVE and a CLOSE', async () => {
    for (const what of ['leave', 'close'] as const) {
      const r = rig();
      const done = leaveLobbyInOrder(what, { ...r.effects, socketGone: true });
      expect(r.log).toEqual(['close']);                                  // in the caller's own tick
      expect(await done).toBe('gone');
      await ticks();
      expect(r.log).toEqual(['close']);                                  // nothing asked, nothing said
      expect(r.waits).toEqual([]);
    }
  });

  it('the socket held (an explicit LEAVE or CLOSE LOBBY): the F2 order as before', async () => {
    for (const what of ['leave', 'close'] as const) {
      const r = rig();
      const done = leaveLobbyInOrder(what, { ...r.effects, socketGone: false });
      await ticks();
      expect(r.log).toEqual(['request']);
      r.settle({ ok: true });
      expect(await done).toBe('done');
      expect(r.log).toEqual(['request', 'close']);
      expect(r.waits).toEqual([LOBBY_LEAVE_WAIT_MS]);
    }
  });

  const T = ['host', 'ticket'].join('-'), LOGIN = ['login', 'ticket'].join('-'), PASS = ['guest', 'pass'].join('-');
  const seats = (...host: boolean[]) => ({ seats: host.map((h, i) => ({ id: i + 1, host: h })) });

  it('before a told lobby names another host, the creator\'s ticket still proves it; after, the proof is null on every path', () => {
    const l = { role: 'host' as const, hostTicket: T as string | null, ticket: LOGIN, guest: false };
    expect(lobbyHostProof(l, null)).toEqual({ hostTicket: T, bearer: LOGIN });
    // Its own seat the host, or no host named (or no seat of its own yet): nothing dropped.
    expect(forgetStaleHost(l, seats(true, false), { id: 1 })).toBe(false);
    expect(forgetStaleHost(l, seats(false, false), { id: 1 })).toBe(false);
    expect(forgetStaleHost(l, seats(false, true), null)).toBe(false);
    expect(l.hostTicket).toBe(T);
    expect(lobbyHostProof(l, { host: true })).toEqual({ hostTicket: T, bearer: LOGIN });
    // Another seat the host: the creator's ticket dropped -- the match's end (no seat, `me` null) proves nothing now.
    expect(forgetStaleHost(l, seats(false, true), { id: 1 })).toBe(true);
    expect(l.hostTicket).toBeNull();
    expect(lobbyHostProof(l, null)).toBeNull();
    expect(lobbyHostProof(l, { host: false })).toBeNull();
    // Handed back later, the seat proves itself by its bearer, as any successor.
    expect(lobbyHostProof(l, { host: true })).toEqual({ hostTicket: null, bearer: LOGIN });
  });

  it('a guest creator: its pass never its bearer while it holds the ticket; dropped, it stands as a guest successor would', () => {
    const g = { role: 'host' as const, hostTicket: T as string | null, ticket: PASS, guest: true };
    expect(lobbyHostProof(g, null)).toEqual({ hostTicket: T, bearer: null });
    expect(forgetStaleHost(g, seats(true, false), { id: 2 })).toBe(true);
    expect(lobbyHostProof(g, null)).toBeNull();
    expect(lobbyHostProof(g, { host: false })).toBeNull();
    expect(lobbyHostProof(g, { host: true })).toEqual({ hostTicket: null, bearer: PASS });
  });

  it('the page: its leave reads whether the session still holds the socket; the told lobby drops a stale proof', () => {
    const page = readFileSync(resolve(FORGE, 'page.ts'), 'utf-8');
    const leave = page.slice(page.indexOf('const leaveLobby = '), page.indexOf('const ownLayoutBack = '));
    expect(leave).toMatch(/const socketGone = l\.session\.net\(\) === null;/);
    expect(leave).toMatch(/leaveLobbyInOrder\(close \? 'close' : 'leave', \{ socketGone, request,/);
    expect(leave.indexOf('const socketGone')).toBeLessThan(leave.indexOf('leaveLobbyInOrder('));
    const enter = page.slice(page.indexOf('const enterLobby = '), page.indexOf('const createLobbyNow = '));
    expect(enter).toMatch(/session\.onLobby\(\(ev\) => \{\s*forgetStaleHost\(l, ev, session\.me\(\)\);/);
    // The match's end and the start's failure let the lobby go by the same leave: no request of their own.
    const end = page.slice(page.indexOf('let matchOfLobby = false;'), page.indexOf("matchBack.addEventListener('click', endMatch)"));
    expect(end).toMatch(/if \(matchOfLobby\) \{ matchOfLobby = false; leaveLobby\(\); \}/);
    expect(end).toMatch(/socket/);
    expect(end).not.toMatch(/handOnLobby|closeLobby\(/);
  });
});
