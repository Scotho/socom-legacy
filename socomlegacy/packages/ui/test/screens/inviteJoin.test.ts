import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { FONTS_RDR, LocService, readLocArchive } from '@s2u/scene';
import { DIALOG_EVENTS, type DialogDesign } from '../../src/dialog';
import { readTextFaces } from '../../src/index';
import { measureText } from '../../src/text/layout';
import { captionCodes } from '../../src/text/captions';
import { dialogLookup } from '../../src/screens/dialogArchive';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { WORLD_OF_SOCOM } from '../../src/screens/worldOfSocomCommands';
import { GAME_LOBBY } from '../../src/screens/gameLobbyCommands';
import {
  INVITE_BUTTON, INVITE_BUTTON_CAPTION, INVITE_COPY_ANIMATION, INVITE_DESCRIBE_ANIMATION, INVITE_DESCRIPTION_LOC, INVITE_GAME_PARAM, inviteButtonGate, INVITE_PARAM, INVITE_REFUSAL_TEXT_IDS, INVITE_ROUTE, INVITE_UNIVERSE_PARAM,
  InviteSearch, inviteHref, inviteOf, inviteUniverse, isLobbyLinkPath, lobbyInviteOf, withInviteButton, withoutInvite, type InviteLink,
} from '../../src/screens/inviteJoin';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig } from './gameLobbyRig';

/**
 * LOBBY-INVITE (web sprint 41, product track; the plan's row and its labelled adaptations): the invite link's form, the
 * targeted search that stands in AUTOPLAY's pick under `JoinMPGame(RANDOM)`, its refusals in the original's own strings,
 * SELECT UNIVERSE's choice, and the GAME LOBBY's fourth button -- off the machine, then over the machine on the disc's
 * own SOCOM II ONLINE (`join_random_game`, `join_game`) into the GAME LOBBY. Synthetic games; nothing of the original
 * is changed.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const read = (p: string): Uint8Array | null => (existsSync(join(FIXTURES, p)) ? new Uint8Array(readFileSync(join(FIXTURES, p))) : null);
const READERC = read('RUN/UI/READERC.ZAR'), FONTS = read(FONTS_RDR.archive), LOC = read('RUN/LOCALE/STATES/UIMNLOC.ZAR');

const statsHex = (slots = 0): string => { const b = new Uint8Array(256); b[0] = 0x44; b[4] = slots; b[8] = 2; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const game = (gameName: string, id: number, o: Partial<GameListEntry> = {}): GameListEntry => ({
  status: 0, mediusWorldId: id, playerCount: 2, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 2, genericField2: 300,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: statsHex(0), endOfList: false, ...o,
});
const last = (list: GameListEntry[]): GameListEntry[] => list.map((g, i) => ({ ...g, endOfList: i === list.length - 1 }));
/** GameStats with its current spectators (D[3]) and its spectator slots (D[4]). */
const mixedStats = (watching: number, slots: number): string => { const b = new Uint8Array(256); b[0] = 0x44; b[3] = watching; b[4] = slots; b[8] = 2; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1), room('Bravo', 2, { endOfList: true })];
const names = Object.fromEntries(Object.entries(DIALOG_EVENTS).map(([k, v]) => [v, k]));
const LINK: InviteLink = { mediusWorldId: 7, game: 'friday', universe: 'SOCOM' };
const TEXT: Record<number, string> = { 441: 'Game Full or Locked', 528: 'All players left', 524: 'Clan only', 525: 'Rank', 426: 'Join failure' };

describe('the link (INVITE_LINK_ADAPTATION): built, parsed, never a secret', () => {
  it('the route lands on LOGIN (main/online) and the query carries the game, its drawn name and the universe', () => {
    const href = inviteHref({ origin: 'https://nightly.example', base: '/', link: LINK, hostSearch: '', dev: false });
    expect(INVITE_ROUTE).toEqual(['main', 'online']);
    expect(href).toBe('https://nightly.example/main/online?invite=7&game=friday&universe=SOCOM');
    expect(inviteOf(new URL(href).search)).toEqual(LINK);
  });

  it('a development build copies the host\'s devmode and server= only; nothing else of the host\'s address, never a ticket', () => {
    const host = '?devmode&server=http%3A%2F%2F127.0.0.1%3A5371&ticket=SECRET&name=someone&expMenuSampling=1';
    const dev = inviteHref({ origin: 'http://localhost:5303', base: '/socomlegacy/', link: { ...LINK, game: 'a b$&' }, hostSearch: host, dev: true });
    expect(dev).toBe('http://localhost:5303/socomlegacy/main/online?devmode&server=http%3A%2F%2F127.0.0.1%3A5371&invite=7&game=a+b%24%26&universe=SOCOM');
    expect(inviteOf(new URL(dev).search)).toEqual({ ...LINK, game: 'a b$&' });
    const release = inviteHref({ origin: 'https://s', base: '/', link: LINK, hostSearch: host, dev: false });
    for (const h of [dev, release]) expect(h).not.toMatch(/ticket|SECRET|someone|password/i);
    expect(release).not.toContain('server=');
  });

  it('a development build copies the host\'s devtools with its server= too, as devmode is (the dev-tools switch; PR #333 review)', () => {
    const host = '?devtools&server=http%3A%2F%2F127.0.0.1%3A5371&ticket=SECRET&served';
    const dev = inviteHref({ origin: 'http://localhost:5303', base: '/', link: LINK, hostSearch: host, dev: true });
    expect(dev).toBe('http://localhost:5303/main/online?devtools&server=http%3A%2F%2F127.0.0.1%3A5371&invite=7&game=friday&universe=SOCOM');
    const release = inviteHref({ origin: 'https://s', base: '/', link: LINK, hostSearch: host, dev: false });
    expect(release).toBe('https://s/main/online?invite=7&game=friday&universe=SOCOM');
  });

  it('a lobby id copies /online/lobby/<id> (dev keys kept) and never a path under /lobby; the old query still reads', () => {
    const host = '?devmode&server=http%3A%2F%2F127.0.0.1%3A5371&ticket=SECRET';
    const href = inviteHref({ origin: 'https://n.example', base: '/', link: { ...LINK, lobbyId: 'AbcdEFgh12' }, hostSearch: host, dev: true });
    expect(href).toBe('https://n.example/online/lobby/AbcdEFgh12?devmode&server=http%3A%2F%2F127.0.0.1%3A5371');
    // the takeover's pin (the merge controller's scope (a), 2026-10-23): with a share id the copy is never the old form --
    // no `invite=`, `game=`, `universe=`, no `/main/` -- in a development build or a release one
    const release = inviteHref({ origin: 'https://n.example', base: '/s2u', link: { ...LINK, lobbyId: 'AbcdEFgh12' }, hostSearch: host, dev: false });
    expect(release).toBe('https://n.example/s2u/online/lobby/AbcdEFgh12');
    for (const h of [href, release]) expect(h, h).not.toMatch(/[?&](?:invite|game|universe)=|\/main\//);
    const path = new URL(href).pathname;
    expect(path.startsWith('/lobby/') || path === '/lobby').toBe(false);
    expect(lobbyInviteOf(['online', 'lobby', 'AbcdEFgh12'])).toEqual({ mediusWorldId: 0, game: '', universe: null, lobbyId: 'AbcdEFgh12' });
    expect(isLobbyLinkPath(['lobby', 'AbcdEFgh12'])).toBe(false);
    expect(inviteOf('?invite=7&game=friday&universe=SOCOM')).toEqual(LINK);
  });

  it('a malformed invite is no invite; the universe is optional; the strip removes the three keys only', () => {
    for (const q of ['', '?invite=x&game=a', '?invite=7', '?invite=-1&game=a', '?invite=99999999999&game=a', `?invite=7&game=${'g'.repeat(65)}`, '?invite=7&game=%00x']) expect(inviteOf(q)).toBeNull();
    expect(inviteOf('?invite=7&game=friday')).toEqual({ mediusWorldId: 7, game: 'friday', universe: null });
    expect(withoutInvite(`?devmode&${INVITE_PARAM}=7&${INVITE_GAME_PARAM}=friday&${INVITE_UNIVERSE_PARAM}=SOCOM&server=x`)).toBe('?devmode&server=x');
    expect(withoutInvite('?invite=7&game=friday')).toBe('');
  });
});

describe('INVITE_FLOW_ADAPTATION: SELECT UNIVERSE\'s choice', () => {
  const up = (n: string): { name: string; up: boolean } => ({ name: n, up: true });
  it('the link\'s universe when it is listed and up; else the only one up; else none (a real choice)', () => {
    expect(inviteUniverse(LINK, [up('Other'), up('SOCOM')])).toBe('SOCOM');
    expect(inviteUniverse(LINK, [{ name: 'SOCOM', up: false }, up('Other')])).toBe('Other');
    expect(inviteUniverse({ ...LINK, universe: null }, [up('Only')])).toBe('Only');
    expect(inviteUniverse({ ...LINK, universe: null }, [up('A'), up('B')])).toBeNull();
    expect(inviteUniverse({ ...LINK, universe: 'Gone' }, [up('A'), up('B')])).toBeNull();
    expect(inviteUniverse(LINK, [])).toBeNull();
  });
});

/** The search over a fake list service; what it asked, posted, held and joined. */
function searchRig(list: GameListEntry[] | null, rooms = ROOMS) {
  const asked: string[] = [], events: { event: string; text: string | null }[] = [], found: string[] = [], joined: string[] = [];
  const s = new InviteSearch({
    service: {
      clearGameListFilter: (q) => { asked.push(`clear ${q.filterId}`); return Promise.resolve({ status: 0 }); },
      gameList: (q) => { asked.push(`list ${q.pageSize}`); return list ? Promise.resolve(list) : new Promise(() => {}); },
    },
    rooms: () => rooms, event: (k, text) => { events.push({ event: names[k]!, text }); }, found: (g) => { found.push(g.gameName); },
    joinRoom: (n) => { joined.push(n); return true; }, locText: (id) => TEXT[id] ?? null,
  });
  const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { s, asked, events, found, joined, settle };
}

describe('InviteSearch (INVITE_JOIN_ADAPTATION): AUTOPLAY\'s chain aimed at one game', () => {
  it('found by world id and drawn name: held, MP_RANDOM_GAME_FOUND, its room joined by GF1 -- the rest is AUTOPLAY\'s own tail', async () => {
    const t = searchRig(last([game('other$~Alpha', 5, { genericField1: 1 }), game('friday$~Bravo', 7)]));
    t.s.start(LINK);
    await t.settle();
    expect([t.asked, t.found, t.events, t.joined]).toEqual([['clear 10', 'list 999'], ['friday$~Bravo'], [{ event: 'MP_RANDOM_GAME_FOUND', text: null }], ['Bravo']]);
  });

  const refusal = (id: number) => [{ event: 'MP_MEDIUS_JOIN_ROOM_FAILURE', text: TEXT[id]! }];
  it.each([
    ['not listed (ended)', [game('x$~Alpha', 5)], INVITE_REFUSAL_TEXT_IDS.ended],
    ['the id reused by another game (the name differs)', [game('saturday$~Bravo', 7)], INVITE_REFUSAL_TEXT_IDS.ended],
    ['closed', [game('friday$~Bravo', 7, { worldStatus: 3 })], INVITE_REFUSAL_TEXT_IDS.ended],
    ['full', [game('friday$~Bravo', 7, { playerCount: 16 })], INVITE_REFUSAL_TEXT_IDS.full],
    ['full to its player seats (the spectator slots kept)', [game('friday$~Bravo', 7, { playerCount: 8, gameStats: statsHex(8) })], INVITE_REFUSAL_TEXT_IDS.full],
    ['locked (a password)', [game('friday$~Bravo', 7, { securityLevel: 1 })], INVITE_REFUSAL_TEXT_IDS.full],
    ['another clan\'s clan game', [game('friday$~Bravo', 7, { genericField3: (0xc0000000 | 5) >>> 0 })], INVITE_REFUSAL_TEXT_IDS.clan],
    ['its room not among the client\'s rooms', [game('friday$~Bravo', 7, { genericField1: 9 })], INVITE_REFUSAL_TEXT_IDS.ended],
    ['Horizon\'s NoResult', [{ ...game('', 0), status: 1 }], INVITE_REFUSAL_TEXT_IDS.ended],
  ])('%s: refused clearly with the original\'s string, nothing joined', async (_why, list, id) => {
    const t = searchRig(last(list as GameListEntry[]));
    t.s.start(LINK);
    await t.settle();
    expect([t.events, t.found, t.joined]).toEqual([refusal(id), [], []]);
  });

  // B138 (dot's review 1, CPU_SEAT_REPLACEABLE_ADAPTATION): one human and fifteen CPUs list 16/16; the invited player
  // takes a CPU's seat, as central admits it (`replaceable`), so the link joins; a game of sixteen humans stays full.
  it('B138: a game full of CPUs a joining player may take is found and its room joined; sixteen humans stay full', async () => {
    const t = searchRig(last([game('friday$~Bravo', 7, { playerCount: 16, replaceable: 15 } as Partial<GameListEntry>)]));
    t.s.start(LINK);
    await t.settle();
    expect([t.found, t.events, t.joined]).toEqual([['friday$~Bravo'], [{ event: 'MP_RANDOM_GAME_FOUND', text: null }], ['Bravo']]);
    const u = searchRig(last([game('friday$~Bravo', 7, { playerCount: 16 })]));
    u.s.start(LINK);
    await u.settle();
    expect([u.found, u.joined]).toEqual([[], []]);
  });

  // dot's re-check of B138: 8 humans, 8 CPUs and 8 spectators list 24 of 24 with 8 spectator slots; central admits the
  // invited player into a CPU's seat, so the link joins. The same room with no CPU stays the original's 'full'.
  it('B138: 8 humans + 8 CPUs + 8 spectators is joined; 16 occupants of 24 with 8 slots and no CPU stays full', async () => {
    const t = searchRig(last([game('friday$~Bravo', 7, { playerCount: 24, maxPlayers: 24, gameStats: mixedStats(8, 8), replaceable: 8 } as Partial<GameListEntry>)]));
    t.s.start(LINK);
    await t.settle();
    expect([t.found, t.joined]).toEqual([['friday$~Bravo'], ['Bravo']]);
    const u = searchRig(last([game('friday$~Bravo', 7, { playerCount: 16, maxPlayers: 24, gameStats: mixedStats(8, 8) })]));
    u.s.start(LINK);
    await u.settle();
    expect([u.found, u.joined]).toEqual([[], []]);
  });

  it('the refusal texts are the original\'s: #441, #528, #524, #525 and #426', () => {
    expect(INVITE_REFUSAL_TEXT_IDS).toEqual({ full: 441, ended: 528, clan: 524, rank: 525, failed: 426 });
  });

  it('a JoinGame refused while the invite joins (joinRefused): the status\'s own line; before or after it, the original\'s events', async () => {
    const t = searchRig(last([game('friday$~Bravo', 7)]));
    expect(t.s.refused(-948, 7)).toBe(false);                                               // no invite joining: the original's path
    for (const [status, id] of [[-948, 441], [-978, 441], [-977, 528], [-966, 525], [-972, 426]] as const) {
      t.events.length = 0;
      t.s.start(LINK);
      await t.settle();
      t.events.length = 0;
      expect(t.s.refused(status, 9)).toBe(false);                                           // the review's 3: another world's refusal is the game's
      expect(t.s.refused(status, 7)).toBe(true);
      expect(t.events).toEqual(refusal(id));
      expect(t.s.refused(status, 7)).toBe(false);                                           // once
    }
  });

  it('the review\'s 3: once the invite\'s join has ended another way (done), a refusal for the same world is the game\'s own', async () => {
    const t = searchRig(last([game('friday$~Bravo', 7)]));
    t.s.start(LINK);
    await t.settle();
    expect(t.s.joining).toBe(true);
    t.s.done();
    expect([t.s.joining, t.s.refused(-978, 7)]).toEqual([false, false]);                    // a game-list join's wrong password: MP_INVALID_PASSWORD
  });

  it('a list never answered: nothing more is posted', async () => {
    const t = searchRig(null);
    t.s.start(LINK);
    await t.settle();
    expect([t.asked, t.events]).toEqual([['clear 10', 'list 999'], []]);
  });
});

describe.skipIf(!READERC || !FONTS || !LOC)('the GAME LOBBY\'s fourth button (INVITE_BUTTON_ADAPTATION), over the disc\'s layout', () => {
  const lookup = (): ((n: string) => DialogDesign | null) => dialogLookup([Zar.parse(READERC!)]);
  it('online: a BUTTON after READY in the control list, the slot below it (16, 183), READY\'s own look; its CROSS the port\'s copy', () => {
    const d = withInviteButton(lookup(), () => true)(GAME_LOBBY)!;
    const names = d.controls.map((c) => c.name);
    const at = names.indexOf('PlayerReady');
    expect(names[at + 1]).toBe(INVITE_BUTTON);
    const ready = d.controls[at]!, invite = d.controls[at + 1]!;
    expect([invite.x, invite.y, invite.type]).toEqual([16, 183, 'BUTTON']);
    if (ready.widget.type !== 'BUTTON' || invite.widget.type !== 'BUTTON') throw new Error('not buttons');
    const { caption: _c, bindings: _b, ...look } = ready.widget.button;
    const { caption, bindings, ...own } = invite.widget.button;
    expect(own).toEqual(look);
    expect(caption).toBe(INVITE_BUTTON_CAPTION);
    // READY's own two bindings, each taken by the page's gate: its focus line (ONACTIVATE, #486) and its CROSS (the copy).
    expect(bindings.map((x) => [x.kind, x.name, x.animation])).toEqual([['event', 'ONACTIVATE', INVITE_DESCRIBE_ANIMATION], ['button', 'CROSS', INVITE_COPY_ANIMATION]]);
    expect(INVITE_DESCRIPTION_LOC).toBe(486);
    expect(invite.y + invite.widget.button.size[1]).toBeLessThanOrEqual(218);                // above the lists (y 218)
  });

  it('on LAN, and on every other dialog, the disc\'s own design', () => {
    const plain = lookup();
    expect(withInviteButton(plain, () => false)(GAME_LOBBY)!.controls.map((c) => c.name)).toEqual(plain(GAME_LOBBY)!.controls.map((c) => c.name));
    expect(withInviteButton(plain, () => true)(WORLD_OF_SOCOM)).toEqual(plain(WORLD_OF_SOCOM));
  });

  it('the caption is the disc\'s #377 "INVITE PLAYERS", drawn within the button in the lobby\'s face', () => {
    const loc = new LocService([readLocArchive(LOC!, 'UIMn')]);
    const r = loc.caption(INVITE_BUTTON_CAPTION);
    expect(r).toMatchObject({ kind: 'loc', id: 377, text: 'INVITE PLAYERS' });
    const d = withInviteButton(lookup(), () => true)(GAME_LOBBY)!;
    const fz = Zar.parse(FONTS!);
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const face = faces.find((f) => f.name.toLowerCase() === (d.font ?? '').toLowerCase()) ?? faces[0]!;
    const invite = d.controls.find((c) => c.name === INVITE_BUTTON)!;
    if (invite.widget.type !== 'BUTTON') throw new Error('not a button');
    const codes = captionCodes(INVITE_BUTTON_CAPTION, loc).codes;
    const width = measureText(face, codes, invite.widget.button.scale).width;
    expect(invite.widget.button.offset[0] + width).toBeLessThanOrEqual(invite.widget.button.size[0]);
  });
});

// ---- over the machine ----

const SETTLED = 60;
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
async function until(r: Rig, done: () => boolean, frames = 1800): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');

/** SOCOM II ONLINE built over the logged-in lobby, the invite's search under JoinMPGame(RANDOM) as the page arms it. */
async function invited(games: GameListEntry[], o: { joinGame?: (q: { mediusWorldId: number }) => Promise<{ status: number; mediusWorldId: number }> } = {}): Promise<Rig & { asked: string[]; copies: number[] }> {
  let s!: InviteSearch;
  const asked: string[] = [];
  const copies: number[] = [];
  const r = await gameLobbyRig({
    name: 'socomc', announcement: '', rooms: ROOMS, games, randomGame: () => { s.start(LINK); }, joinRefused: (status, worldId) => s.refused(status, worldId),
    dialogs: (look) => withInviteButton(look, () => true),
    ...(o.joinGame ? { joinGame: o.joinGame } : {}),
  });
  r.host.setBindingGate('lobby-invite', inviteButtonGate({ node: (cmd) => r.parts.current?.nodeCommand(cmd) ?? null, copy: () => { copies.push(1); } }));
  s = new InviteSearch({
    service: {
      clearGameListFilter: (q) => { asked.push(`clear ${q.filterId}`); return Promise.resolve({ status: 0 }); },
      gameList: (q) => { asked.push(`list ${q.pageSize}`); return Promise.resolve(games); },
    },
    rooms: () => r.world()?.rooms() ?? [], event: (k, text) => { r.postWith(k, text); }, found: (g) => { r.commands.randomGameFound(g); },
    joinRoom: (n) => r.briefing.joinRoomForRandomGame(n), locText: (id) => r.loc.byId.get(id) ?? null,
  });
  await r.settle(SETTLED);
  return Object.assign(r, { asked, copies });
}

describe.skipIf(!HAVE)(`the invite's join over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the screen\'s own join_random_game: #801, the search, the room joined, JoinGame for the invited game, join_game into the GAME LOBBY', async () => {
    const r = await invited(last([game('pick$~Alpha', 5, { genericField1: 1, maxPlayers: 24 }), game('friday$~Bravo', 7)]));
    expect(r.parts.current!.widgetHost.animation('join_random_game', null)).toBe(true);
    await r.settle(4);
    expect(r.shown()).toBe(true);                                                                            // #801, kept
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.asked).toEqual(['clear 10', 'list 999']);
    expect(r.requests.filter((q) => q.op === 'join-channel').map((q) => q.body)).toEqual([{ mediusWorldId: 2, lobbyChannelPassword: '' }]);
    expect(r.joins).toEqual([{ mediusWorldId: 7, joinType: 0, gamePassword: '' }]);
    expect(r.current()).toBe(GAME_LOBBY);
    expect(r.socketLog[0]).toBe('open 7');
  });

  it('INVITE PLAYERS focused: #486 in the description strip, as each button draws its own; DOWN: the next button\'s line; CROSS: the copy', async () => {
    const r = await invited(last([game('friday$~Bravo', 7)]));
    r.parts.current!.widgetHost.animation('join_random_game', null);
    await until(r, () => r.current() === GAME_LOBBY);
    await r.settle(SETTLED * 3);
    for (let i = 0; i < 6 && r.shown(); i++) { r.press('CROSS', 10); await r.settle(10); }   // the lobby's first popup answered
    const strip = (): string => r.text('DescriptionText').join(' ').trim();
    // Each lobby button's own line, as its ONACTIVATE writes it (READY's #348 / #349 by FirstReadyText).
    const lineOf = (name: string): string[] => ({ weaponselect: [357], Glswitchteams: [358], PlayerReady: [348, 349] } as Record<string, number[]>)[name]!.map((id) => r.loc.byId.get(id)!.trim());
    const before = r.focused();
    expect(lineOf(before)).toContain(strip());                                                 // the disc's own line for the focused button
    for (let i = 0; i < 12 && r.focused() !== INVITE_BUTTON; i++) r.press('DOWN', 6);
    expect(r.focused()).toBe(INVITE_BUTTON);
    expect(strip()).toBe(r.loc.byId.get(INVITE_DESCRIPTION_LOC)!.trim());                     // "¦ Invite players to join."
    r.press('CROSS', 6);
    expect(r.copies).toEqual([1]);
    r.press('DOWN', 6);
    const next = r.focused();
    expect(next).not.toBe(INVITE_BUTTON);
    expect(lineOf(next)).toContain(strip());                                                   // the next button's own line
    for (let i = 0; i < 12 && r.focused() !== INVITE_BUTTON; i++) r.press('UP', 6);
    expect([r.focused(), strip()]).toEqual([INVITE_BUTTON, r.loc.byId.get(INVITE_DESCRIPTION_LOC)!.trim()]);
  });

  it('the review\'s 3: an invite\'s join still standing for world 7, a game-list join of world 8 with a wrong password: the room\'s own "Password incorrect."', async () => {
    const stats = ((): string => { const x = new Uint8Array(256); x[0] = 0x44; x[1] = 5; x[2] = 6; x[4] = 8; x[8] = 2; return [...x].map((v) => v.toString(16).padStart(2, '0')).join(''); })();
    const LOCKED = game('locked$~Alpha', 8, { genericField1: 1, securityLevel: 1, maxPlayers: 24, rulesSet: 1, genericField2: 65000, playerCount: 1, gameStats: stats });
    let s!: InviteSearch;
    const claims: [number, number, boolean][] = [];
    const r = await gameLobbyRig({
      name: 'socomc', announcement: '', rooms: ROOMS, typed: 'wrong',
      // the locked game listed in whichever room the walk enters (its name ends in "$~<room>", research 159 §3.3)
      games: () => { const v = r.uiVars.find('MEDIUS_LOBBY_NAME')?.value; const room = v?.type === 'string' ? v.value : 'Alpha'; return Promise.resolve(last([{ ...LOCKED, gameName: `locked$~${room}`, genericField1: room === 'Bravo' ? 2 : 1 }])); },
      joinGame: (q) => Promise.resolve(q.mediusWorldId === 8 ? { status: -978, mediusWorldId: -1 } : { status: 0, mediusWorldId: q.mediusWorldId }),
      joinRefused: (status, worldId) => { const c = s.refused(status, worldId); claims.push([status, worldId, c]); return c; },
    });
    // The invite's search for world 7, its room's join taken but never ended (the stuck flag the review found).
    s = new InviteSearch({
      service: { clearGameListFilter: () => Promise.resolve({ status: 0 }), gameList: () => Promise.resolve(last([game('friday$~Bravo', 7)])) },
      rooms: () => ROOMS, event: () => {}, found: () => {}, joinRoom: () => true, locText: (id) => r.loc.byId.get(id) ?? null,
    });
    s.start(LINK);
    await r.settle(SETTLED);
    expect(s.joining).toBe(true);
    r.press('CROSS', 10);                                                                     // SERVER NEWS' popup closed
    for (let i = 0; i < 12 && r.focused() !== 'briefingrooms'; i++) r.press('DOWN', 6);
    r.press('CROSS', 6);
    r.press('CROSS', 2);                                                                      // the room Alpha
    await until(r, () => r.current() === 'dlgMPBriefingRoom.rdr');
    await r.settle(SETTLED);
    for (let i = 0; i < 12 && r.focused() !== 'JoinGame'; i++) r.press('DOWN', 6);
    r.press('CROSS', 6);
    r.press('CROSS', 2);                                                                      // the locked game: its password typed (wrong)
    await r.settle(60);
    expect(claims).toEqual([[-978, 8, false]]);
    expect(r.text('JoiningAnim')).toEqual(['Password incorrect. ']);
  });

  it.each([
    ['full', { playerCount: 16 }],
    ['password protected', { securityLevel: 1 }],
  ])('%s: "Game Full or Locked" (#441) on SOCOM II ONLINE, no keyboard or seat request, the menu stays', async (_why, over) => {
    const r = await invited(last([game('friday$~Bravo', 7, over)]));
    r.parts.current!.widgetHost.animation('join_random_game', null);
    await r.settle(20);
    expect(popupText(r)).toContain(r.loc.byId.get(441)!.trim());
    await r.settle(SETTLED * 2);
    expect([r.current(), r.joins.length, r.keyboards, r.leaves, r.requests.filter((q) => q.op === 'join-channel').length]).toEqual([WORLD_OF_SOCOM, 0, [], [], 0]);
  });

  it('ended: #528 on SOCOM II ONLINE, nothing joined', async () => {
    const r = await invited(last([game('another$~Bravo', 8)]));
    r.parts.current!.widgetHost.animation('join_random_game', null);
    await r.settle(20);
    expect(popupText(r)).toContain(r.loc.byId.get(528)!.split('.')[0]!.trim());
    expect([r.current(), r.joins.length]).toEqual([WORLD_OF_SOCOM, 0]);
  });

  it('filled between the list and the join: JoinGame\'s -948 is the invite\'s own line (#441), not AUTOPLAY\'s #803', async () => {
    const r = await invited(last([game('friday$~Bravo', 7)]), { joinGame: (q) => Promise.resolve({ status: -948, mediusWorldId: q.mediusWorldId }) });
    r.parts.current!.widgetHost.animation('join_random_game', null);
    await until(r, () => r.joins.length > 0);
    await r.settle(20);
    expect(popupText(r)).toContain(r.loc.byId.get(441)!.trim());
    expect(popupText(r)).not.toContain(r.loc.byId.get(803)!.split('.')[0]!.trim());
    expect(r.current()).toBe(WORLD_OF_SOCOM);
  });
});
