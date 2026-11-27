import { describe, expect, it } from 'vitest';
import { pinnedMatchSocket } from '../src/connectHost';
import { GameSocketHost, type GameLobbyHandOff } from '../src/gameLobbyHost';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';

/**
 * SEAT_QUEUE_BUTTON_ADAPTATION (`@s2u/ui` `seatQueue`): the game lobby's socket (`GameSocketHost`) gives the spectator's
 * queue button the room's word -- claims taken, seats free, its place, a held seat -- sends its press as the seat's claim,
 * shows the held seat's line, and owes the seat's load (the screen's READY) once its own claim seats it in the lobby.
 */

const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[] };
const welcome = (role: 'spectator' | 'player'): ServerEvent => ({
  type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role, team: role === 'player' ? 'seal' : null, queue: 0, name: 'socomc',
  players: [{ id: 3, name: 'kilo', team: 'terrorist' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
}) as unknown as ServerEvent;

function lobby(role: 'spectator' | 'player' = 'spectator') {
  const socks: Sock[] = [];
  const hands: GameLobbyHandOff[] = [];
  let comings = 0;
  const host = new GameSocketHost({
    pinned: PINNED, ticket: () => 'tkt', holds: () => {}, matchStart: (h) => { hands.push(h); }, seatComing: () => { comings++; },
    socket: () => {
      const sent: string[] = [];
      const s = { binaryType: '', readyState: 1, sent, send: (d: string) => { sent.push(d); }, close: () => {} } as unknown as Sock;
      socks.push(s);
      return s;
    },
  });
  host.attach({ welcomed: () => {}, gameLobby: () => {}, roundStart: () => {}, seatEnded: () => {}, dropped: () => {} });
  host.open(7);
  socks[0]!.onopen?.({});
  const say = (ev: object): void => { socks[0]!.onmessage?.({ data: JSON.stringify(ev) }); };
  say(welcome(role));
  const claims = (): unknown[] => socks[0]!.sent.filter((d) => d.includes('"seatClaim"')).map((d) => JSON.parse(d) as unknown);
  /** The room's lobby view: the game launched (a watcher's late seat) or not (before its launch, or back from its game). */
  const view = (launched: boolean): void => { say({ type: 'gameLobby', seats: [{ id: 3, name: 'kilo', team: 'terrorist', ready: true, host: true, readyIn: 0 }], countdown: null, launched }); };
  return { host, say, claims, view, hands, comings: () => comings };
}

describe('GameSocketHost: the spectator\'s seat queue in the game lobby', () => {
  it('a welcomed watcher: none before the room\'s `seats`; then the room\'s word, its place as it moves', () => {
    const l = lobby();
    expect(l.host.seatQueue()).toBeNull();
    l.say({ type: 'seats', open: 0, claim: true });
    expect(l.host.seatQueue()).toEqual({ claim: true, open: 0, queue: 0, coming: false });
    l.host.seatClaim(true);
    expect(l.claims()).toEqual([{ type: 'seatClaim', on: true }]);
    l.say({ type: 'queue', position: 2 });
    expect(l.host.seatQueue()).toMatchObject({ queue: 2 });
    l.host.seatClaim(false);
    expect(l.claims().at(-1)).toEqual({ type: 'seatClaim', on: false });
  });

  it('a player (and a queued joiner, told no `seats`): none -- the original SWITCH TEAMS', () => {
    const p = lobby('player');
    p.say({ type: 'seats', open: 1, claim: true });
    expect(p.host.seatQueue()).toBeNull();
    const q = lobby();
    q.say({ type: 'queue', position: 1 });
    expect(q.host.seatQueue()).toBeNull();
  });

  it('its claim seated in the lobby: the held seat\'s line, then the load owed once (the screen\'s READY); the button the original\'s', () => {
    const l = lobby();
    l.view(true);
    l.say({ type: 'seats', open: 1, claim: true });
    l.host.seatClaim(true);
    l.say({ type: 'seatComing', team: 'seal' });
    expect([l.comings(), l.host.seatQueue()?.coming, l.host.takeSeatLoad()]).toEqual([1, true, false]);
    l.say({ type: 'promoted', team: 'seal', claim: true });
    expect(l.host.seatQueue()).toBeNull();                        // a player now
    expect([l.host.takeSeatLoad(), l.host.takeSeatLoad()]).toEqual([true, false]);
  });

  it('a promotion not of its claim owes no load; the hand-off before the load lets it go', () => {
    const a = lobby();
    a.say({ type: 'promoted', team: 'seal' });                    // a queued joiner's seat
    expect(a.host.takeSeatLoad()).toBe(false);
    const b = lobby();
    b.view(true);
    b.say({ type: 'seats', open: 1, claim: true });
    b.host.seatClaim(true);
    b.say({ type: 'promoted', team: 'seal', claim: true });
    b.host.handOff({ mediusWorldId: 7, gameName: 'g$~Alpha', mission: 'mp2', lateJoiner: true });   // READY pressed by hand first
    expect([b.hands.length, b.host.takeSeatLoad()]).toEqual([1, false]);
  });

  it('a claim seated in a lobby not launched (its queue kept across the game\'s return) owes no load: its READY is its own', () => {
    const a = lobby();
    a.view(true);
    a.say({ type: 'seats', open: 0, claim: true });
    a.host.seatClaim(true);
    a.say({ type: 'queue', position: 1 });
    a.view(false);                                                // the game over: the room's lobby again, the claim still queued
    a.say({ type: 'promoted', team: 'seal', claim: true });                    // a player left; the queue's head seated
    expect(a.host.takeSeatLoad()).toBe(false);
    const b = lobby();                                            // owed, then the game back in its lobby before the page took it
    b.view(true);
    b.say({ type: 'seats', open: 1, claim: true });
    b.host.seatClaim(true);
    b.say({ type: 'promoted', team: 'seal', claim: true });
    b.view(false);
    b.view(true);                                                 // and launched again: the old load is not owed again
    expect(b.host.takeSeatLoad()).toBe(false);
  });
});
