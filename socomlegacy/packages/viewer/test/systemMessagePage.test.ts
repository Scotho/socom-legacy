// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { LOBBY_STATE, type DialogDesign, type LobbyService, type RoundQueueLine, type ServerSystemMessage } from '@s2u/ui';
import { chatReplyOf, type BriefingRoomTransport } from '../src/briefingRoomHost';
import { pinnedMatchSocket } from '../src/connectHost';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { mountRoundChat } from '../src/roundChat';

/**
 * SA-43c RESTART-NOTICE, Part 1, on the page's session (web research 345 §2; reading, pending review): the system
 * notices `/lobby/chat-lines` carries (`system`, central's SA-43c) read by the session's poll and routed as the original's
 * system-message callback routes them (`FUN_0030dce0` D:L210355-210398 to the current state's +0x2c) -- on the front end
 * the dialog's MP_SYSTEM_MESSAGE with the text (`FUN_001f4d20` D:L54919-54934, raised at the menu state's tick step
 * (6)); in a round the HUD's main window, the text alone in colour 1 at the window's scale and time (`FUN_001ecc40`
 * D:L51076-51099); while a match loads, nothing (`FUN_001e7c80`, empty). A fake account service, a fake transport, fake
 * sockets and stand-in dialogs; no server (R293).
 */

const TEXT = 'The server restarts in about 10 minutes.';
const BOUND = 'dlgGameLobby.rdr';
/** A stand-in dialog with the disc's binding: EVENT MP_SYSTEM_MESSAGE -> OnSystemMessage (UIanim.rdr). */
const design = (bound: boolean): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: bound ? [{ kind: 'event', name: 'MP_SYSTEM_MESSAGE', code: 0x3a, state: 1, animation: 'OnSystemMessage', argument: null }] : [],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const DIALOGS = ['dlgGameLobby.rdr', 'dlgNetAbandoned.rdr', 'dlgNetError.rdr', 'dlgLoad.rdr', 'dlgMenu.rdr'];
const disc: FrontEndDisc = { dialog: (n) => (DIALOGS.includes(n) ? design(n === BOUND) : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const PINNED = pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false);
type Sock = WebSocketLike & { sent: string[]; closed: number[] };

async function session(o: { hold?: boolean } = {}) {
  const account: LobbyService = {
    login: () => Promise.resolve({ status: 0, ticket: 'tkt' }), register: () => Promise.resolve({ status: 0 }),
    logout: () => Promise.resolve({ status: 0 }), keepAlive: () => Promise.resolve(true),
  };
  const live: ServerSystemMessage[] = [];
  const briefingRoom = { chatLines: () => Promise.resolve({ lines: [], system: [...live] }) } as unknown as BriefingRoomTransport;
  const sunk: RoundQueueLine[] = [];
  let inRound = false;
  const socks: Sock[] = [];
  const s = new FrontEndSession({
    disc, startDialog: BOUND, account, matchSocket: PINNED, briefingRoom,
    roundChat: () => (inRound ? (l) => { sunk.push(l); } : null),
    gameSocket: () => {
      const sent: string[] = [], closed: number[] = [];
      const k = { binaryType: '', readyState: 1, sent, closed, send: (d: string) => { sent.push(d); }, close: (c?: number) => { closed.push(c ?? 0); } } as unknown as Sock;
      socks.push(k);
      return k;
    },
    lobbyMatch: { screen: { show: () => {}, hide: () => {} }, load: () => (o.hold ? new Promise(() => {}) : Promise.resolve()) },
  });
  let now = 0;
  s.advance(now);
  const run = async (k: number): Promise<void> => { for (let i = 0; i < k; i++) { s.advance(now += 34); await flush(); } };
  s.lobby!.connect('localhost', 10075);
  await run(3);
  s.lobby!.login('socomc', 'pw');
  await run(6);
  expect(s.lobby!.state()).toBe(LOBBY_STATE.LOGGED_IN);
  const shown = vi.spyOn(s.parts.current!.widgetHost, 'animation');
  const sock = (): Sock => socks.at(-1)!;
  const say = (ev: ServerEvent): void => { sock().onmessage?.({ data: JSON.stringify(ev) }); };
  const handOff = (): void => {
    s.gameLobby.socket!.open(7);
    sock().onopen?.({});
    say({ type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'socomc', players: [], rules: 'classic', round: 0, rounds: 11, ghost: false } as unknown as ServerEvent);
    s.gameLobby.socket!.handOff({ mediusWorldId: 7, gameName: 'g$~A', mission: 'mp2', lateJoiner: false });
  };
  return { s, live, sunk, run, shown, handOff, round: (on: boolean) => { inRound = on; } };
}

describe('SA-43c: the poll\'s `system` read on the page (`chatReplyOf`), additive', () => {
  it('a reply with `system`: the lines and the notices, each checked; a notice not of the shape skipped, never the lines lost', () => {
    const line = { originatorAccountId: 7, originatorAccountName: 'bob', messageType: 0, message: 'hi' };
    expect(chatReplyOf({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }, { id: '4', severity: 0, text: 'x' }, { id: 5, severity: 0 }] }))
      .toEqual({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }] });
  });

  it('a reply without it (an older central\'s): the lines, as `chatLinesOf` reads them', () => {
    expect(chatReplyOf({ lines: [] })).toEqual([]);
    expect(() => chatReplyOf({})).toThrow();
  });
});

describe('SA-43c: a notice routed by the state current when it comes (FUN_0030dce0 -> the state\'s +0x2c)', () => {
  it('the front end: the dialog\'s MP_SYSTEM_MESSAGE with the text (its OnSystemMessage started with it), once per id', async () => {
    const x = await session();
    x.live.push({ id: 1, severity: 0, text: TEXT });
    await x.run(40);
    expect(x.shown.mock.calls).toEqual([['OnSystemMessage', TEXT]]);
    await x.run(40);                                                            // still live at the next polls: not again
    expect(x.shown.mock.calls).toHaveLength(1);
    expect(x.sunk).toEqual([]);
  });

  it('in a round: the round\'s sink takes the text alone, kind 1, the state\'s own line; no dialog event', async () => {
    const x = await session();
    x.round(true);
    x.live.push({ id: 1, severity: 0, text: TEXT });
    await x.run(40);
    expect(x.sunk).toEqual([{ text: TEXT, name: '', kind: 1, own: true }]);
    expect(x.shown).not.toHaveBeenCalled();
  });

  it('while a match loads: nothing -- no dialog event, no round line -- and it is not shown later', async () => {
    const x = await session({ hold: true });
    x.handOff();
    await x.run(3);
    expect(x.s.match.phase).toBe('loading');
    x.live.push({ id: 1, severity: 0, text: TEXT });
    await x.run(40);
    expect(x.shown).not.toHaveBeenCalled();
    expect(x.sunk).toEqual([]);
  });

  it('the round\'s HUD line: the text alone in colour 1 (128, 128, 64) at the window\'s scale, on the main window', () => {
    const posted: unknown[] = [];
    const hud = { postMessage: (l: unknown) => { posted.push(l); } } as unknown as Pick<Hud, 'postMessage'>;
    const chat = mountRoundChat({ hud, external: () => false, names: () => [] });
    chat.line({ text: TEXT, name: '', kind: 1, own: true });
    const [r, g, b] = MESSAGE_COLOURS[1]!;
    expect([r, g, b]).toEqual([128, 128, 64]);
    expect(posted).toEqual([[{ text: TEXT, scale: MESSAGE_SCALE, rgb: [r / 128, g / 128, b / 128] }]]);
  });
});
