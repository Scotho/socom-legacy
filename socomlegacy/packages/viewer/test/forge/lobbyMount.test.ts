// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { ArmoryDeps } from '../../src/armory';
import type { ArmoryData } from '../../src/armoryData';
import type { ArmoryExit } from '../../src/armoryState';
import type { NetClient } from '../../src/net/client';
import type { Headset } from '../../src/voice/headset';
import type { MatchVoice, MatchVoiceDeps } from '../../src/voice/voiceClient';
import type { ForgeLobbyChatLine, ForgeLobbyDeps, GameLobbyEvent } from '../../src/forge/lobby/deps';
import { mountForgeLobby } from '../../src/forge/lobby/lobby';
import type { ArmoryLike } from '../../src/forge/lobby/lobbyArmory';

/**
 * FORGE (FG-27; FG.R22, a browser adaptation with no original): the popup as the page mounts it (FG-26 wires it) --
 * the window over the forge, the lobby view fed by the seam's events, the pad's actions, the voice, the ARMORY in the
 * window. The owner's word (2026-10-14): the pad's Home button (16) is never read; a guest's ARMORY choice goes to the
 * room only.
 */

const seat = (id: number, name: string, team: 'seal' | 'terrorist' | null, o: { ready?: boolean; host?: boolean } = {}) =>
  ({ id, name, team, ready: o.ready ?? false, host: o.host ?? false, readyIn: 0 });
const view = (seats: GameLobbyEvent['seats'], o: Partial<GameLobbyEvent> = {}): GameLobbyEvent => ({ type: 'gameLobby', seats, countdown: null, launched: false, ...o });

function client(): NetClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  return { id: 1, state: 'open', sent, send: (ev: unknown) => { sent.push(ev); }, sendVoice: () => undefined, on: () => () => undefined, onVoice: () => () => undefined } as unknown as NetClient & { sent: unknown[] };
}

function harness(o: { armory?: boolean; visibility?: ForgeLobbyDeps['visibility']; password?: ForgeLobbyDeps['password']; kick?: ForgeLobbyDeps['kick']; end?: ForgeLobbyDeps['end'] } = {}) {
  const lobbyCbs = new Set<(ev: GameLobbyEvent) => void>(), chatCbs = new Set<(l: ForgeLobbyChatLine) => void>();
  const sent: string[] = [], chats: [string, boolean][] = [], exits: ArmoryExit[] = [];
  let last: GameLobbyEvent | null = view([seat(1, 'Host', 'seal', { host: true }), seat(2, 'Guest-1', 'terrorist')]);
  let closed = 0;
  const net = client();
  const deps: ForgeLobbyDeps = {
    doc: document,
    net: () => net,
    lobby: () => last,
    onLobby: (cb) => { lobbyCbs.add(cb); return () => { lobbyCbs.delete(cb); }; },
    onChat: (cb) => { chatCbs.add(cb); return () => { chatCbs.delete(cb); }; },
    me: () => ({ id: 1, host: true }),
    title: () => ({ name: 'FROSTFIRE BOX', map: 'MP2', players: 16 }),
    send: (ev) => { sent.push(ev); },
    chat: (text, team) => { chats.push([text, team]); },
    armory: () => (o.armory === false ? null : {
      data: Promise.resolve({ archive: 'MP2.ZAR', bitmaps: [], models: [], modelTextures: [], world: { arsenal: {} as never, valves: new Map() } } as unknown as ArmoryData),
      side: 'seal', send: (e) => { exits.push(e); },
    }),
    close: () => { closed++; },
    ...(o.visibility ? { visibility: o.visibility } : {}),
    ...(o.password ? { password: o.password } : {}),
    ...(o.kick ? { kick: o.kick } : {}),
    ...(o.end ? { end: o.end } : {}),
  };
  const pads: boolean[] = [];
  const voice = (d: MatchVoiceDeps): MatchVoice => {
    void d;
    return { netDeps: () => ({ voiceFloor: () => undefined, voiceFrame: () => undefined }), pad: (t: boolean) => { pads.push(t); }, state: () => ({}) as never, mute: () => undefined, muted: () => false, radio: () => undefined, dispose: () => undefined } as MatchVoice;
  };
  const headset = (): Headset => ({ microphone: async () => null, noHeadset: () => undefined, throttled: () => undefined, frame: () => ({ padPresent: true, focused: true }), modulate: (b: Float32Array) => b, setVoiceMask: () => undefined, keys: () => new Set(), dispose: () => undefined }) as unknown as Headset;
  let armoryDeps: ArmoryDeps | null = null, armoryOpen = false;
  const armoryPads: string[][] = [];
  const makeArmory = (d: ArmoryDeps): ArmoryLike => {
    armoryDeps = d;
    return {
      setData: () => undefined, setWorld: () => undefined, open: () => { armoryOpen = true; return true; }, isOpen: () => armoryOpen,
      frame: () => undefined, pad: (p) => { armoryPads.push([...p]); return true; }, input: () => true, taking: () => armoryOpen, tap: () => true,
      close: () => { if (armoryOpen) { armoryOpen = false; d.closed?.(); } }, quads: () => [], models: () => [],
    };
  };
  const store = new Map<string, string>();
  const host = document.createElement('div');
  document.body.append(host);
  let t = 0;
  const lobby = mountForgeLobby(host, deps, {
    store: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v); } },
    viewport: () => ({ width: 1280, height: 720 }),
    voice: { mount: voice, headset, seconds: () => t, tuners: () => ({ headset: 1 }) },
    paint: null, makeArmory, now: () => t * 1000,
  });
  const snap = (pressed: number[]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })), axes: [0, 0, 0, 0] });
  return {
    lobby, host, sent, chats, exits, pads, net, armoryPads, snap,
    emit: (ev: GameLobbyEvent) => { last = ev; for (const cb of lobbyCbs) cb(ev); },
    say: (l: ForgeLobbyChatLine) => { for (const cb of chatCbs) cb(l); },
    closed: () => closed, listeners: () => lobbyCbs.size + chatCbs.size,
    armoryDeps: () => armoryDeps!, shutArmory: () => { armoryOpen = false; armoryDeps!.closed?.(); },
    at: (s: number) => { t = s; },
  };
}

const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string): T => root.querySelector<T>(sel)!;
const settle = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

afterEach(() => { document.body.innerHTML = ''; });

describe('FORGE lobby: the popup mounted', () => {
  it('mounts a window into the host with the lobby\'s rows from the last view, and follows the room\'s events and chat', () => {
    const h = harness();
    expect(q(h.host, '.fx-window')).not.toBeNull();
    expect(q(h.host, '.fx-window-name').textContent).toContain('FROSTFIRE BOX');
    expect([...h.host.querySelectorAll('.fx-lobby-list[data-list="terrorist"] .fx-lobby-name')].map((e) => e.textContent)).toEqual(['Guest-1']);
    h.emit(view([seat(1, 'Host', 'seal', { host: true }), seat(2, 'Guest-1', 'seal')]));
    expect([...h.host.querySelectorAll('.fx-lobby-list[data-list="seal"] .fx-lobby-name')].map((e) => e.textContent)).toEqual(['Host', 'Guest-1']);
    h.say({ from: 'Guest-1', text: 'ready?', team: true });
    expect(q(h.host, '.fx-lobby-line').textContent).toBe('Guest-1 (Team): ready?');
  });

  it('LEAVE and the window\'s close call the page\'s close; dispose lets the seam\'s listeners go and takes the window down', () => {
    const h = harness();
    q<HTMLButtonElement>(h.host, '[data-act="leave"]').click();
    q<HTMLButtonElement>(h.host, '.fx-window-close').click();
    expect(h.closed()).toBe(2);
    expect(h.listeners()).toBe(2);
    h.lobby.dispose();
    expect(h.listeners()).toBe(0);
    expect(h.host.querySelector('.fx-window')).toBeNull();
  });

  it('the pad: the d-pad walks the controls, Cross presses; the first read only notes what is held', () => {
    const h = harness();
    h.lobby.pad(h.snap([0]));                                              // Cross held from the START menu: no press
    expect(h.sent).toEqual([]);
    h.lobby.pad(h.snap([]));
    h.lobby.pad(h.snap([0]));
    expect(h.sent).toEqual(['lobbyReady']);
    h.lobby.pad(h.snap([]));
    h.lobby.pad(h.snap([15]));                                             // Right: SWITCH SIDES
    h.lobby.pad(h.snap([]));
    h.lobby.pad(h.snap([0]));
    expect(h.sent).toEqual(['lobbyReady', 'switchTeams']);
  });

  it('AM-1: the left stick walks the controls as the d-pad does, with the forge menu\'s repeat; held from before, it waits for the rest', () => {
    // FI.R2 (the owner, 2026-10-16: "make menu movement work with analog sticks across the board"): the popup's own
    // focus (a browser adaptation, FG.R22) takes the stick by `../../src/forge/pad` `MenuStick`.
    const focusOf = (x: ReturnType<typeof harness>): string | undefined => q(x.host, '.is-focus').dataset['act'];
    // What the d-pad's Down walks to, press by press: the stick is to walk the same.
    const d = harness();
    d.lobby.pad(d.snap([]));
    const walk: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) { d.lobby.pad(d.snap([13])); d.lobby.pad(d.snap([])); walk.push(focusOf(d)); }
    d.lobby.dispose();

    const h = harness();
    const stick = (x: number, y: number) => ({ ...h.snap([]), axes: [x, y, 0, 0] });
    const ms = (n: number): void => { h.at(n / 1000); };
    h.lobby.pad(stick(0, 0.9));                                            // pushed from the START menu: the first read
    const start = focusOf(h);
    ms(16); h.lobby.pad(stick(0, 0.9));
    ms(400 * 2); h.lobby.pad(stick(0, 0.9));
    expect(focusOf(h)).toBe(start);                                        // held from before: no step, no repeat
    ms(1000); h.lobby.pad(stick(0, 0));
    ms(1016); h.lobby.pad(stick(0.2, 0.9));                                // down, the stronger axis
    expect(focusOf(h)).toBe(walk[0]);
    ms(1100); h.lobby.pad(stick(0, 0.9));
    expect(focusOf(h)).toBe(walk[0]);                                      // held: one step until the delay
    ms(1016 + 401); h.lobby.pad(stick(0, 0.9));
    expect(focusOf(h)).toBe(walk[1]);                                      // the delay: a repeat
    ms(1016 + 502); h.lobby.pad(stick(0, 0.9));
    expect(focusOf(h)).toBe(walk[2]);                                      // then at the interval
    ms(2000); h.lobby.pad(stick(0, 0.2));                                  // under the rest: re-armed
    ms(2016); h.lobby.pad(stick(0, -0.9));
    expect(focusOf(h)).toBe(walk[1]);                                      // up: the one before
    ms(2032); h.lobby.pad(stick(0, 0));
    ms(2048); h.lobby.pad(stick(-0.9, 0));
    expect(focusOf(h)).toBe(walk[0]);                                      // left, as the d-pad's Left
    ms(2064); h.lobby.pad(stick(0, 0));
    ms(2080); h.lobby.pad(stick(0.9, 0));
    expect(focusOf(h)).toBe(walk[1]);                                      // right, as the d-pad's Right
    expect(h.sent).toEqual([]);                                            // the stick presses nothing
  });

  it("AM-1's review F1: the d-pad pressed with the stick pushed the same way steps once, not twice", () => {
    const focusOf = (x: ReturnType<typeof harness>): string | undefined => q(x.host, '.is-focus').dataset['act'];
    const d = harness();
    d.lobby.pad(d.snap([]));
    d.lobby.pad(d.snap([13]));
    const one = focusOf(d);
    d.lobby.dispose();
    const h = harness();
    h.lobby.pad(h.snap([]));
    h.lobby.pad({ ...h.snap([]), axes: [0, 0, 0, 0] });                   // the stick seen at rest: armed
    h.lobby.pad({ ...h.snap([13]), axes: [0, 0.9, 0, 0] });               // the d-pad's Down and the stick down, one frame
    expect(focusOf(h)).toBe(one);
  });

  it('the pad\'s Home button (16) is never read: no focus, no press, no talk', () => {
    const h = harness();
    h.lobby.pad(h.snap([]));
    const focus = q(h.host, '.is-focus').dataset['act'];
    for (let i = 0; i < 3; i++) { h.lobby.pad(h.snap([16])); h.lobby.pad(h.snap([])); }
    h.lobby.pad(h.snap([16])); h.at(0.1); h.lobby.frame(0.016);
    expect(h.sent).toEqual([]);
    expect(q(h.host, '.is-focus').dataset['act']).toBe(focus);
    expect(h.pads.every((p) => !p)).toBe(true);
    expect(h.closed()).toBe(0);
  });

  it('Circle held talks (the voice\'s pad source), the page\'s talk() too', () => {
    const h = harness();
    h.lobby.pad(h.snap([]));
    h.lobby.frame(0.016);
    h.lobby.pad(h.snap([1])); h.at(0.1); h.lobby.frame(0.016);
    expect(h.pads.at(-1)).toBe(true);
    h.lobby.pad(h.snap([])); h.at(0.2); h.lobby.frame(0.016);
    expect(h.pads.at(-1)).toBe(false);
    h.lobby.talk(true); h.at(0.3); h.lobby.frame(0.016);
    expect(h.pads.at(-1)).toBe(true);
    h.lobby.talk(false); h.at(0.4); h.lobby.frame(0.016);
    expect(h.pads.at(-1)).toBe(false);
  });

  it('ARMORY opens the screen in the window; its change goes to the room only; its close returns to the lobby', async () => {
    const h = harness();
    q<HTMLButtonElement>(h.host, '[data-act="armory"]').click();
    await settle();
    expect(h.lobby.screen()).toBe('armory');
    expect(q(h.host, '.fx-window').classList.contains('is-armory')).toBe(true);
    // The pad goes to the screen now (its first read notes what is held).
    h.lobby.pad(h.snap([])); h.lobby.pad(h.snap([13]));
    expect(h.armoryPads).toEqual([['Down']]);
    const exit: ArmoryExit = { type: 1, kit: [1, 2, 3, 4, 5] as never, picks: [] };
    h.armoryDeps().change(exit, 'seal');
    expect(h.exits).toEqual([exit]);
    h.lobby.frame(0.016);
    expect(h.net.sent).toEqual([{ type: 'voiceRadio', on: false }]);   // RADIO OFF at the entry
    h.shutArmory();
    expect(h.lobby.screen()).toBe('lobby');
    expect(q(h.host, '.fx-window').classList.contains('is-armory')).toBe(false);
    h.lobby.frame(0.016);
    expect(h.net.sent).toEqual([{ type: 'voiceRadio', on: false }, { type: 'voiceRadio', on: true }]);
  });

  it('the launch closes an open ARMORY and keeps the lobby view', async () => {
    const h = harness();
    q<HTMLButtonElement>(h.host, '[data-act="armory"]').click();
    await settle();
    h.emit(view([seat(1, 'Host', 'seal', { host: true }), seat(2, 'Guest-1', 'terrorist')], { launched: true }));
    expect(h.lobby.screen()).toBe('lobby');
  });
});

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the host's visibility in the mounted window -- the page's
 * seam (`deps.visibility`, the creator's page only) asked on a press, the label following its answer, a refusal said in
 * the chat panel as the window's other notices are.
 */
describe('FG-45: the lobby\'s visibility in the window', () => {
  it('a press asks the page\'s change; the label follows its 200; a refusal is a notice line and the state stays', async () => {
    let listed = false, refusal: string | null = null;
    const asks: boolean[] = [];
    const h = harness({
      visibility: () => ({ listed: () => listed, set: async (on) => { asks.push(on); if (refusal === null) listed = on; return refusal; } }),
    });
    const b = q<HTMLButtonElement>(h.host, '[data-act="listed"]');
    expect([b.hidden, b.textContent]).toEqual([false, 'UNLISTED']);
    b.click();
    expect(b.disabled).toBe(true);                                          // asked: closed until the answer
    await settle();
    expect(asks).toEqual([true]);
    expect([b.disabled, b.textContent]).toEqual([false, 'LISTED']);
    refusal = 'only the lobby\'s host may change its visibility';
    b.click();
    await settle();
    expect(asks).toEqual([true, false]);
    expect(b.textContent).toBe('LISTED');
    const last = [...h.host.querySelectorAll('.fx-lobby-line')].at(-1)!;
    expect(last.classList.contains('is-notice')).toBe(true);
    expect(last.textContent).toContain(refusal);
  });

  it('a joiner\'s window has none (no visibility from the page)', () => {
    expect(q<HTMLButtonElement>(harness().host, '[data-act="listed"]').hidden).toBe(true);
    document.body.innerHTML = '';
    expect(q<HTMLButtonElement>(harness({ visibility: () => null }).host, '[data-act="listed"]').hidden).toBe(true);
  });
});

/** FG-45's review F1: the host's Cross pressed twice on LISTED within the change's round trip never reaches LEAVE. */
describe('FG-45 F1: the pad on a pending visibility change', () => {
  it('Up twice to LISTED, Cross twice before the answer: one change asked, the lobby not left', async () => {
    let listed = false;
    const asks: boolean[] = [];
    let answer: ((words: string | null) => void) | null = null;
    const h = harness({
      visibility: () => ({ listed: () => listed, set: (on) => { asks.push(on); return new Promise<string | null>((r) => { answer = (w) => { if (w === null) listed = on; r(w); }; }); } }),
    });
    h.lobby.pad(h.snap([]));                                               // the first read notes what is held
    for (const b of [12, 12]) { h.lobby.pad(h.snap([b])); h.lobby.pad(h.snap([])); }
    expect(q(h.host, '.is-focus').dataset['act']).toBe('listed');
    h.lobby.pad(h.snap([0])); h.lobby.pad(h.snap([]));
    h.lobby.pad(h.snap([0])); h.lobby.pad(h.snap([]));
    expect(asks).toEqual([true]);
    expect(h.closed()).toBe(0);
    expect(q(h.host, '.is-focus').dataset['act']).toBe('listed');
    answer!(null);
    await settle();
    expect(q<HTMLButtonElement>(h.host, '[data-act="listed"]').textContent).toBe('LISTED');
    expect(h.closed()).toBe(0);
  });
});

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): the host's password in the mounted window -- the page's
 * seam (`deps.password`) asked from the card, the label following its answer, a refusal a notice line; the pad reaches
 * the control and the card (the d-pad walks it, Cross presses, Circle closes it and does not talk).
 */
describe('FG-48a: the lobby\'s password in the window', () => {
  const pwHarness = (o: { refusal?: string | null } = {}) => {
    let locked = false;
    const asks: (string | null)[] = [];
    const h = harness({ password: () => ({ locked: () => locked, set: async (pw) => { asks.push(pw); if ((o.refusal ?? null) === null) locked = pw !== null; return o.refusal ?? null; } }) });
    return { h, asks, locked: () => locked };
  };

  it('the card\'s SET asks the page\'s change with the typed password; the label follows its 200; a refusal is a notice line', async () => {
    const { h, asks } = pwHarness();
    const b = q<HTMLButtonElement>(h.host, '[data-act="password"]');
    expect([b.hidden, b.textContent]).toEqual([false, 'PASSWORD']);
    b.click();
    const field = q<HTMLInputElement>(h.host, '[data-card="password"] input');
    field.value = 'open sesame';
    field.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>(h.host, '[data-card="password"] [data-card-act="set"]').click();
    expect(b.disabled).toBe(true);                                         // asked: closed until the answer
    await settle();
    expect(asks).toEqual(['open sesame']);
    expect([b.disabled, b.textContent]).toEqual([false, 'LOCKED']);
    document.body.innerHTML = '';
    const refused = pwHarness({ refusal: 'only the lobby\'s host may change its password' });
    q<HTMLButtonElement>(refused.h.host, '[data-act="password"]').click();
    const f2 = q<HTMLInputElement>(refused.h.host, '[data-card="password"] input');
    f2.value = 'x';
    f2.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>(refused.h.host, '[data-card="password"] [data-card-act="set"]').click();
    await settle();
    const last = [...refused.h.host.querySelectorAll('.fx-lobby-line')].at(-1)!;
    expect(last.classList.contains('is-notice')).toBe(true);
    expect(last.textContent).toContain('only the lobby\'s host may change its password');
    expect(JSON.stringify([...refused.h.host.querySelectorAll('.fx-lobby-line')].map((l) => l.textContent))).not.toContain('"x"');
  });

  it('the pad: Up to PASSWORD, Cross opens the card; the d-pad walks it, Circle closes it without a talk; Cross on CLEAR asks null', async () => {
    const { h, asks } = pwHarness();
    // Locked first, by the mouse.
    q<HTMLButtonElement>(h.host, '[data-act="password"]').click();
    const field = q<HTMLInputElement>(h.host, '[data-card="password"] input');
    field.value = 'pw';
    field.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>(h.host, '[data-card="password"] [data-card-act="set"]').click();
    await settle();
    const tap = (b: number): void => { h.lobby.pad(h.snap([b])); h.lobby.pad(h.snap([])); };
    h.lobby.pad(h.snap([]));                                               // the first read notes what is held
    tap(12);                                                               // Up: LEAVE
    tap(12);                                                               // Up: PASSWORD
    expect(q(h.host, '.fx-lobby-buttons .is-focus').dataset['act']).toBe('password');
    tap(0);                                                                // Cross: the card
    expect(q(h.host, '[data-card="password"]').hidden).toBe(false);
    tap(1);                                                                // Circle: closed, no talk
    expect(q(h.host, '[data-card="password"]').hidden).toBe(true);
    expect(h.pads).not.toContain(true);
    tap(0);
    tap(13);                                                               // Down: the field -> CLEAR (SET closed)
    expect(q(h.host, '[data-card="password"] .is-focus').dataset['cardAct']).toBe('clear');
    tap(0);
    await settle();
    expect(asks).toEqual(['pw', null]);
    expect(q<HTMLButtonElement>(h.host, '[data-act="password"]').textContent).toBe('PASSWORD');
    expect(h.closed()).toBe(0);
  });

  it('a joiner\'s window has none', () => {
    expect(q<HTMLButtonElement>(harness().host, '[data-act="password"]').hidden).toBe(true);
  });
});

/**
 * FG-48b (FG.R24; a product-track adaptation, no original): the host's kick in the mounted window -- the page's seam
 * (`deps.kick`) asked from the KICK card with the seat's room id, a refusal a notice line, the kicked seat named once it
 * is done; the pad reaches the control and the card (the d-pad chooses, Cross kicks, Circle cancels and does not talk).
 */
describe('FG-48b: the host\'s kick in the window', () => {
  const kickHarness = (o: { refusal?: string | null } = {}) => {
    const asks: number[] = [];
    const h = harness({ kick: () => ({ kick: async (s) => { asks.push(s); return o.refusal ?? null; } }) });
    return { h, asks };
  };
  const lines = (host: HTMLElement): string[] => [...host.querySelectorAll('.fx-lobby-line')].map((l) => l.textContent ?? '');

  it('the card\'s seat asks the page\'s kick with its room id; KICK closed until the answer; done, a notice names the seat; a refusal is a notice', async () => {
    const { h, asks } = kickHarness();
    const b = q<HTMLButtonElement>(h.host, '[data-act="kick"]');
    expect([b.hidden, b.disabled, b.textContent]).toEqual([false, false, 'KICK']);
    b.click();
    q<HTMLButtonElement>(h.host, '[data-card="kick"] [data-seat="2"]').click();
    expect(b.disabled).toBe(true);
    await settle();
    expect(asks).toEqual([2]);
    expect(b.disabled).toBe(false);
    expect(lines(h.host).at(-1)).toMatch(/Guest-1/);
    document.body.innerHTML = '';
    const refused = kickHarness({ refusal: 'only the lobby\'s host may remove a player' });
    q<HTMLButtonElement>(refused.h.host, '[data-act="kick"]').click();
    q<HTMLButtonElement>(refused.h.host, '[data-card="kick"] [data-seat="2"]').click();
    await settle();
    const last = [...refused.h.host.querySelectorAll('.fx-lobby-line')].at(-1)!;
    expect(last.classList.contains('is-notice')).toBe(true);
    expect(last.textContent).toContain('only the lobby\'s host may remove a player');
  });

  it('the pad: Up to KICK, Cross opens the card on the first other seat; Circle cancels without a talk; Cross kicks; the page never closed', async () => {
    const { h, asks } = kickHarness();
    const tap = (b: number): void => { h.lobby.pad(h.snap([b])); h.lobby.pad(h.snap([])); };
    h.lobby.pad(h.snap([]));                                               // the first read notes what is held
    tap(12);                                                               // Up: LEAVE
    tap(12);                                                               // Up: KICK
    expect(q(h.host, '.fx-lobby-buttons .is-focus').dataset['act']).toBe('kick');
    tap(0);                                                                // Cross: the card
    expect(q(h.host, '[data-card="kick"]').hidden).toBe(false);
    expect(q(h.host, '[data-card="kick"] .is-focus').dataset['seat']).toBe('2');
    tap(1);                                                                // Circle: closed, no talk
    expect(q(h.host, '[data-card="kick"]').hidden).toBe(true);
    expect(h.pads).not.toContain(true);
    expect(asks).toEqual([]);
    tap(0);                                                                // Cross: the card again
    tap(13);                                                               // Down: CANCEL
    expect(q(h.host, '[data-card="kick"] .is-focus').dataset['cardAct']).toBe('cancel');
    tap(12);                                                               // Up: the seat
    tap(0);                                                                // Cross: kicked
    await settle();
    expect(asks).toEqual([2]);
    expect(h.closed()).toBe(0);
  });

  it('a joiner\'s window has none', () => {
    expect(q<HTMLButtonElement>(harness().host, '[data-act="kick"]').hidden).toBe(true);
  });
});

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): the host's controls follow the page's seams live -- the page
 * gives them while its own seat carries the host's flag (`lobbyHostProof`), so a successor's window gains LISTED,
 * PASSWORD, KICK and CLOSE LOBBY at the next frame without a reload, and an old host's loses them. CLOSE LOBBY asks the
 * page's close (`deps.end`), LEAVE the page's leave (`deps.close`, the hand-on).
 */
describe('FG-48c: the host\'s controls follow the seams live', () => {
  const HOST_ONLY = ['listed', 'password', 'kick', 'close'] as const;
  const shown = (host: HTMLElement): string[] => HOST_ONLY.filter((a) => !q<HTMLButtonElement>(host, `[data-act="${a}"]`).hidden);

  it('none, then all at the next frame once the page hosts; gone again at the next frame when it no longer does', () => {
    let hosting = false;
    const ends: string[] = [];
    const h = harness({
      visibility: () => (hosting ? { listed: () => false, set: async () => null } : null),
      password: () => (hosting ? { locked: () => false, set: async () => null } : null),
      kick: () => (hosting ? { kick: async () => null } : null),
      end: () => (hosting ? { close: () => { ends.push('close'); } } : null),
    });
    expect(shown(h.host)).toEqual([]);
    hosting = true;
    h.lobby.frame(0);
    expect(shown(h.host)).toEqual([...HOST_ONLY]);
    q<HTMLButtonElement>(h.host, '[data-act="close"]').click();
    q<HTMLButtonElement>(h.host, '[data-card="close"] [data-card-act="close"]').click();
    expect(ends).toEqual(['close']);
    expect(h.closed()).toBe(0);                                            // the close is the page's end, not its leave
    hosting = false;
    h.lobby.frame(0);
    expect(shown(h.host)).toEqual([]);
    q<HTMLButtonElement>(h.host, '[data-act="leave"]').click();
    expect(h.closed()).toBe(1);
  });

  it('the pad: Up from READY to LEAVE, then CLOSE LOBBY; Cross opens its card on CANCEL; Circle closes it without a talk', () => {
    const ends: string[] = [];
    const h = harness({ end: () => ({ close: () => { ends.push('close'); } }) });
    const tap = (b: number): void => { h.lobby.pad(h.snap([b])); h.lobby.pad(h.snap([])); };
    h.lobby.pad(h.snap([]));
    tap(12);                                                               // Up: LEAVE
    tap(12);                                                               // Up: CLOSE LOBBY
    expect(q(h.host, '.fx-lobby-buttons .is-focus').dataset['act']).toBe('close');
    tap(0);                                                                // Cross: the card, on CANCEL
    expect(q(h.host, '[data-card="close"] .is-focus').dataset['cardAct']).toBe('cancel');
    tap(1);                                                                // Circle: closed, no talk
    expect(q(h.host, '[data-card="close"]').hidden).toBe(true);
    expect(h.pads).not.toContain(true);
    tap(0); tap(12); tap(0);                                               // the card, Up to CLOSE, Cross
    expect(ends).toEqual(['close']);
    expect(h.closed()).toBe(0);
  });
});
