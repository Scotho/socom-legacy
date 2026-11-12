// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOBBY_STATE, type DialogDesign, type LobbyService, type RoundQueueLine, type ServerSystemMessage } from '@s2u/ui';
import { chatReplyOf, type BriefingRoomTransport } from '../src/briefingRoomHost';
import { pinnedMatchSocket } from '../src/connectHost';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import { mountRoundChat } from '../src/roundChat';
import type { Say, SayWithdrawn } from '../../match/src/noticeHold';

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
  const says: (Say | SayWithdrawn)[] = [];                                     // OA-3: the poll's `says`, beside `system`
  const briefingRoom = { chatLines: () => Promise.resolve({ lines: [], system: [...live], ...(says.length ? { says: [...says] } : {}) }) } as unknown as BriefingRoomTransport;
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
  return { s, live, says, sunk, run, shown, handOff, round: (on: boolean) => { inRound = on; } };
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

// ---- OA-3 (the operator announcement plan; product track, a browser adaptation): the poll's `says`, to the toast only ----

const SAY_TEXT = 'Maintenance tonight at 22:00 UTC.';
const opSay = (id: number, o: Partial<Say> = {}): Say => ({ id, severity: 0, text: SAY_TEXT, until: Date.now() + 600_000, kind: 'say', ...o });
const toastPanel = (): HTMLElement | null => document.querySelector('[data-operator-say]');
const escape = (): void => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); };

describe('OA-3: the poll\'s `says` read on the page (`chatReplyOf`), additive', () => {
  const line = { originatorAccountId: 7, originatorAccountName: 'bob', messageType: 0, message: 'hi' };

  it('OA-3: chatReplyOf parses says and a withdrawal; a reply without says parses as today', () => {
    expect(chatReplyOf({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }], says: [
      { id: 4, severity: 1, text: SAY_TEXT, game: 7, until: 1_000, kind: 'say', at: 5, closable: true, extra: 'x' },   // unknown fields dropped
      { id: 5, severity: 0, text: 'all', until: 2_000 },                                                                   // no kind on the wire: a say
      { id: 6, withdrawn: true, text: 'dropped' },
      { id: '8', severity: 0, text: 'x', until: 1 }, { id: 9, severity: 0, until: 1 }, { id: 10, severity: 0, text: 'x' },   // malformed: skipped
      { id: 11, severity: 0, text: 'x', until: 1, game: 'seven' }, { id: 12, withdrawn: 'yes' }, { id: 13, severity: 0, text: 'x', until: 1, kind: 'restart' },
      null, 3,
    ] })).toEqual({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }], says: [
      { id: 4, severity: 1, text: SAY_TEXT, game: 7, until: 1_000, kind: 'say' },
      { id: 5, severity: 0, text: 'all', until: 2_000, kind: 'say' },
      { id: 6, withdrawn: true },
    ] });
    expect(chatReplyOf({ lines: [line], says: [{ id: 6, withdrawn: true }] })).toEqual({ lines: [line], says: [{ id: 6, withdrawn: true }] });
    expect(chatReplyOf({ lines: [line], says: 'nope' })).toEqual({ lines: [line], says: [] });
    expect(chatReplyOf({ lines: [] })).toEqual([]);
    expect(chatReplyOf({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }] })).toEqual({ lines: [line], system: [{ id: 3, severity: 0, text: TEXT }] });
  });
});

describe('OA-3: a say on the page\'s session -- the toast and nowhere else (OA.R1: the restart routing untouched)', () => {
  beforeEach(() => { sessionStorage.clear(); document.body.innerHTML = ''; });

  it('OA-3: a --all say in the lobby shows the toast once; no popup, no round line', async () => {
    const x = await session();
    x.says.push(opSay(20));
    await x.run(40);
    expect(toastPanel()?.textContent).toContain(SAY_TEXT);
    expect(x.s.sayToast?.open()?.id).toBe(20);
    await x.run(40);                                                            // still live at the next polls: one panel
    expect(document.querySelectorAll('[data-operator-say]')).toHaveLength(1);
    expect(x.shown).not.toHaveBeenCalled();
    expect(x.sunk).toEqual([]);
    x.s.close();
  });

  it('OA-3: a --game say for another game is dropped in the general lobby; a closed say is not reopened by the poll\'s repeat', async () => {
    const x = await session();
    x.says.push(opSay(21, { game: 7 }));
    await x.run(40);
    expect(toastPanel()).toBeNull();
    x.says.push(opSay(22));
    await x.run(40);
    expect(x.s.sayToast?.open()?.id).toBe(22);
    escape();
    await x.run(40);
    expect(toastPanel()).toBeNull();
    x.s.close();
  });

  it('OA-3 (OA-2\'s note 1): says are deduped by the seen set, never by the `system` watermark -- a restart notice of a lower id still pops up', async () => {
    const x = await session();
    x.says.push(opSay(30));
    await x.run(40);
    expect(x.s.sayToast?.open()?.id).toBe(30);
    x.live.push({ id: 25, severity: 0, text: TEXT });                          // a restart notice after the say, its id lower
    await x.run(40);
    expect(x.shown.mock.calls).toEqual([['OnSystemMessage', TEXT]]);
    escape();
    x.says.push(opSay(24));                                                     // a say below the restart's id: still shown
    await x.run(40);
    expect(x.s.sayToast?.open()?.id).toBe(24);
    x.s.close();
  });

  it('OA-3 (OA-2\'s notes 2 and 3): a withdrawal on every poll closes the say; a say withdrawn in the same reply is never shown', async () => {
    const x = await session();
    x.says.push(opSay(40));
    await x.run(40);
    expect(x.s.sayToast?.open()?.id).toBe(40);
    x.says.splice(0);
    x.says.push({ id: 40, withdrawn: true });                                  // central repeats it on every poll
    await x.run(40);
    expect(x.s.sayToast?.open()).toBeNull();
    expect(toastPanel()).toBeNull();
    x.says.splice(0);
    x.says.push(opSay(41), { id: 41, withdrawn: true });                       // a fresh page's reply: the say and its withdrawal
    await x.run(40);
    expect(toastPanel()).toBeNull();
    x.s.close();
  });

  it('OA-3 review focus 5: a --game say reaches a page in that game whose match is not mounted (the poll is the channel)', async () => {
    const x = await session({ hold: true });
    x.handOff();                                                                // game 7 handed off; the match held loading, never mounted
    await x.run(3);
    x.says.push(opSay(50, { game: 7 }), opSay(51, { game: 8 }));
    await x.run(40);
    expect(x.s.sayToast?.open()?.id).toBe(50);
    expect(toastPanel()?.textContent).toContain(SAY_TEXT);
    escape();
    expect(x.s.sayToast?.open()).toBeNull();                                    // game 8's never queued
    expect(x.shown).not.toHaveBeenCalled();
    expect(x.sunk).toEqual([]);
    x.s.close();
  });
});
