// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { GameLobbyMatchStart } from '@s2u/ui';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import { Hud } from '../src/hud';
import { LobbyMatch } from '../src/lobbyMatch';
import { mountChat } from '../src/matchChat';
import type { ChatEntry } from '../src/tauntMenu';
import type { NetClient, WebSocketLike } from '../src/net/client';
import { BodyFlag, PROTOCOL_VERSION, type ScoreRow, type ServerEvent, type Team } from '../src/net/protocol';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { RemotePlayers } from '../src/remotePlayers';
import type { SpectatorBody, SpectatorSeat } from '../src/spectatorView';
import type { WalkMode } from '../src/walk';

/**
 * HOTFIX vote-roster (the owner on live v0.4.14, 2026-11-08: "can't seem to vote players out"). Product track: the
 * port's own page wiring, the vote rule unchanged. The Chat menu's TEAMMATES rows are the room's live score rows
 * (`../src/matchChat` `teammates`, `net.rows`), while the page's `toggleVote` checked a second list (`NetPage.teams`)
 * filled from the one welcome the page heard at its own join and the `joined` / `left` heard after the match page took
 * over -- the lobby's `joined` / `left` heard between are not replayed by the hand-off (`GameSocketHost.handOff`,
 * `LobbyMatch.start`). So a row showed VOTE REMOVE and its press sent nothing. The page now votes from the rows the menu
 * draws (one roster), and the dead player's teammate cycle reads the same sides. The lobby's socket, `LobbyMatch` and
 * `NetPage` are the real ones over a fake socket, the room's events scripted; no server, no browser.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };
const START: GameLobbyMatchStart = { mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: false };

function lobbySeat() {
  const sockets: Sock[] = [];
  const handOffs: GameLobbyHandOff[] = [];
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: () => {}, now: () => 0,
    socket: () => {
      const sent: string[] = [];
      const s = { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock;
      sockets.push(s);
      return s;
    },
    matchStart: (h) => { handOffs.push(h); },
  });
  host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
  host.open(7);
  sockets[0]!.onopen?.({});
  const say = (ev: ServerEvent): void => { sockets.at(-1)!.onmessage?.({ data: JSON.stringify(ev) }); };
  const votes = (): unknown[] => sockets.flatMap((s) => s.sent).filter((d) => typeof d === 'string').map((d) => JSON.parse(d) as Record<string, unknown>).filter((e) => e.type === 'vote');
  return { host, handOffs, say, votes };
}

async function matchEvents(h: GameLobbyHandOff, during?: () => void): Promise<{ client: NetClient; events: readonly ServerEvent[] }> {
  let t = 0, loaded: () => void = () => {};
  const started: { client: NetClient; events: readonly ServerEvent[] }[] = [];
  const match = new LobbyMatch({
    now: () => t, screen: { show: () => {}, hide: () => {} },
    load: () => new Promise<void>((res) => { loaded = res; }),
    start: (s) => { started.push(s); return { release: () => null, close: () => {} }; },
    back: () => {}, holds: () => {},
  });
  match.start(h);
  during?.();
  loaded();
  await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 20; i++) { t += 100; match.frame(); }
  expect(started).toHaveLength(1);
  return started[0]!;
}

function page(client: NetClient, events: readonly ServerEvent[], extra: Partial<NetPageDeps> = {}): NetPage {
  const hud = new Hud();
  hud.postMessage = (() => undefined) as typeof hud.postMessage;
  let dead = false;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setDead: (on: boolean) => { dead = on; }, isDead: () => dead,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true, mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = new Proxy({ bodies: () => [] } as Record<string, unknown>, { get: (o, k: string) => (k in o ? o[k] : () => undefined) }) as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    game: { id: 7, ticket: 'tkt', pinned: PINNED, holds: () => {}, ended: () => {}, adopt: { client, events } },
    socket: () => { throw new Error('no second socket'); },
    ...extra,
  };
  return new NetPage(deps, PINNED.url, 'MP99', 'Host', undefined, false, 'classic');
}

const welcome = (players: { id: number; name: string; team: Team }[] = []): ServerEvent => ({
  type: 'welcome', id: 1, version: PROTOCOL_VERSION, map: 'MP99', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Host',
  players, rules: 'classic', round: 1, rounds: 11, ghost: false, phase: 'waiting', epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as unknown as ServerEvent);
const joined = (id: number, team: Team): ServerEvent => ({ type: 'joined', id, name: `P${id}`, team });
const left = (id: number): ServerEvent => ({ type: 'left', id } as ServerEvent);
const roundOne = (): ServerEvent => ({ type: 'roundStart', round: 1, seconds: 60, wins: { seal: 0, terrorist: 0 }, rounds: 11, epoch: 5, startTick: 900 } as unknown as ServerEvent);
const row = (id: number, team: Team): ScoreRow => ({ id, name: id === 1 ? 'Host' : `P${id}`, team, kills: 0, deaths: 0, score: 0, alive: true, ping: 0 });
const score = (...rows: ScoreRow[]): ServerEvent => ({ type: 'score', rows, timeLeft: 60, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);

/** The seat welcomed, `lobby` heard on its lobby socket, then launched; the match page on the hand-off. */
async function handed(lobby: ServerEvent[], players: { id: number; name: string; team: Team }[] = [], extra: Partial<NetPageDeps> = {}) {
  const seat = lobbySeat();
  seat.say(welcome(players));
  for (const ev of lobby) seat.say(ev);
  seat.host.handOff(START);
  const m = await matchEvents(seat.handOffs.at(-1)!, () => { seat.say(roundOne()); });
  return { seat, net: page(m.client, m.events, extra) };
}

const teammatesOf = (net: NetPage): number[] => (net as unknown as { teammates(): number[] }).teammates();
/** The real Chat menu's TEAMMATES rows (root 3) over the page. */
function menu(net: NetPage): () => ChatEntry[] {
  const chat = mountChat({ net: () => net, hud: { postMessage: () => {} }, audio: { playStream: () => 'played', hasStream: () => true }, messages: () => [], side: () => 'seal', character: () => 0 });
  return () => chat.entries(3);
}
const menuIds = (rows: ChatEntry[]): number[] => rows.map((r) => Number(r.children?.find((c: NonNullable<ChatEntry['children']>[number]) => c.key?.startsWith('vote:'))?.key?.slice(5)));
const voteRow = (rows: ChatEntry[], id: number): ChatEntry | undefined => rows.flatMap((r) => r.children ?? []).find((c) => c.key === `vote:${id}`);

describe('HOTFIX vote-roster: the vote and the TEAMMATES rows are one roster after the hand-off', () => {
  it('(a) a teammate who joined the lobby after the seat\'s welcome is listed and voted on: the vote goes out', async () => {
    const { seat, net } = await handed([joined(2, 'seal')]);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'seal')));
      expect(teammatesOf(net)).toEqual([2]);
      expect(net.toggleVote(2)).toBe(true);
      expect(seat.votes()).toEqual([{ type: 'vote', target: 2, remove: true }]);
    } finally { net.close(); }
  });

  it('(b) a lobby SWITCH TEAMS (left, then joined on the other side): the side is the current one', async () => {
    const { seat, net } = await handed([left(3), joined(3, 'seal'), left(2), joined(2, 'terrorist')],
      [{ id: 2, name: 'P2', team: 'seal' }, { id: 3, name: 'P3', team: 'terrorist' }]);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'terrorist'), row(3, 'seal')));
      expect(teammatesOf(net)).toEqual([3]);
      expect(net.toggleVote(2)).toBe(false);
      expect(net.toggleVote(3)).toBe(true);
      expect(seat.votes()).toEqual([{ type: 'vote', target: 3, remove: true }]);
    } finally { net.close(); }
  });

  it('(c) the menu\'s PLAYER n rows and the vote\'s teammates agree for any mix of welcome, joined and score rows', async () => {
    const cases: { players: { id: number; name: string; team: Team }[]; lobby: ServerEvent[]; match: ServerEvent[] }[] = [
      { players: [], lobby: [joined(2, 'seal')], match: [score(row(1, 'seal'), row(2, 'seal'))] },
      { players: [{ id: 2, name: 'P2', team: 'seal' }], lobby: [left(2)], match: [score(row(1, 'seal'))] },
      { players: [{ id: 2, name: 'P2', team: 'seal' }], lobby: [joined(4, 'terrorist')], match: [joined(5, 'seal'), score(row(1, 'seal'), row(2, 'seal'), row(4, 'terrorist'), row(5, 'seal'))] },
      { players: [{ id: 2, name: 'P2', team: 'seal' }, { id: 3, name: 'P3', team: 'seal' }], lobby: [], match: [score(row(1, 'seal'), row(3, 'seal'), row(6, 'seal'))] },
      { players: [{ id: 2, name: 'P2', team: 'seal' }], lobby: [], match: [] },
    ];
    for (const c of cases) {
      const { seat, net } = await handed(c.lobby, c.players);
      try {
        for (const ev of c.match) seat.say(ev);
        expect(teammatesOf(net), JSON.stringify(c)).toEqual(menuIds(menu(net)()));
      } finally { net.close(); }
    }
  });

  it('(d) the menu\'s label flips to VOTE RETAIN only when a vote message went out', async () => {
    const { seat, net } = await handed([joined(2, 'seal')]);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'seal')));
      const rows = menu(net);
      expect(voteRow(rows(), 2)?.label).toBe('VOTE REMOVE');
      voteRow(rows(), 2)!.action!();
      expect(seat.votes()).toEqual([{ type: 'vote', target: 2, remove: true }]);
      expect(voteRow(rows(), 2)?.label).toBe('VOTE RETAIN');
      net.close();                                                    // a closed page sends nothing: the label stays
      voteRow(rows(), 2)!.action!();
      expect(seat.votes()).toHaveLength(1);
      expect(voteRow(rows(), 2)?.label).toBe('VOTE RETAIN');
    } finally { net.close(); }
  });

  it('(e) the dead player\'s teammate cycle offers the late lobby joiner after the same hand-off', async () => {
    const { seat, net } = await handed([joined(2, 'seal'), joined(3, 'terrorist')]);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'seal'), row(3, 'terrorist')));
      const bodies: SpectatorBody[] = [1, 2, 3].map((id) => ({ id, feet: [0, 0, 0], yaw: 0, flags: BodyFlag.Alive }));
      (net.client as unknown as { bodies(): SpectatorBody[] }).bodies = () => bodies;
      const view = net.spectator as unknown as { host: { seat(): SpectatorSeat }; teammates(seat: SpectatorSeat): number[] };
      expect(view.teammates(view.host.seat())).toEqual([2]);
    } finally { net.close(); }
  });

  it('(f) a match relaunched from the same lobby (adopt) votes on a player who joined between the two games', async () => {
    const seat = lobbySeat();
    seat.say(welcome([{ id: 2, name: 'P2', team: 'seal' }]));
    seat.host.handOff(START);
    await matchEvents(seat.handOffs[0]!, () => { seat.say(roundOne()); });
    seat.host.adopt(seat.handOffs[0]!.client);                        // GAME COMPLETE: the same game's lobby takes it back
    seat.say(joined(3, 'seal'));                                      // a player joins the lobby between the games
    seat.host.handOff(START);
    const second = await matchEvents(seat.handOffs[1]!, () => { seat.say(roundOne()); });
    const two = page(second.client, second.events);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'seal'), row(3, 'seal')));
      expect(teammatesOf(two)).toEqual([2, 3]);
      expect(two.toggleVote(3)).toBe(true);
      expect(seat.votes()).toEqual([{ type: 'vote', target: 3, remove: true }]);
    } finally { two.close(); }
  });

  it('F3 (the review): a late joiner whose joined the page never heard has his score row side in the kill feed cue', async () => {
    // A hostage killed by player 2 (a terrorist the page heard of only in the room's score rows): the script's
    // killed-by cue is the killer's side's (`netPage.ts` `kill`, HX-5) -- was `teams`, which had no side for him: no cue.
    const cues: string[] = [];
    const roundAudio = { roundStart: () => {}, eliminated: () => {}, timeExpired: () => {}, roundOver: () => {}, reset: () => {}, frame: () => {}, hostage: (cue: string) => { cues.push(cue); } };
    const { seat, net } = await handed([], [], { roundAudio: roundAudio as unknown as NetPageDeps['roundAudio'] });
    try {
      seat.say(score(row(1, 'seal'), row(2, 'terrorist')));
      seat.say({ type: 'kill', victim: 50, killer: 2, how: 'shot', victimKind: 'hostage', clip: null, weapon: null } as unknown as ServerEvent);
      expect(cues).toEqual(['killedByTerrorists']);
    } finally { net.close(); }
  });

  it('the diagnostic (the review): a refused vote says why on the console (an instrument)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { seat, net } = await handed([]);
    try {
      seat.say(score(row(1, 'seal'), row(2, 'seal'), row(3, 'terrorist')));
      expect(net.toggleVote(3)).toBe(false);
      expect(info).toHaveBeenLastCalledWith('[vote] refused: target not a teammate');
      (net.spectator as unknown as { watchingNow: number | null }).watchingNow = 2;
      expect(net.toggleVote(2)).toBe(false);
      expect(info).toHaveBeenLastCalledWith('[vote] refused: row closed');
      (net.spectator as unknown as { watchingNow: number | null }).watchingNow = null;
      net.close();
      expect(net.toggleVote(2)).toBe(false);
      expect(info).toHaveBeenLastCalledWith('[vote] refused: not seated');
    } finally { net.close(); info.mockRestore(); }
  });
});
