// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_CHARS, GAME_LOBBY_CHAT_LINES } from '@s2u/ui';
import type { GameLobbyEvent } from '../../src/forge/lobby/deps';
import { LobbyView, type LobbyViewOptions } from '../../src/forge/lobby/lobbyView';

/**
 * FORGE (FG-27; FG.R22, a browser adaptation with no original): the lobby popup's view -- the original's game lobby
 * (`dlgGameLobby.rdr` as `gameLobbyHost.ts` fills it: the two sides' lists with the ready marks and the host's star, the
 * spectators, the chat, the talker bar, READY, SWITCH SIDES, ARMORY, the host's LAUNCH) in the forge's own markup.
 */

const seat = (id: number, name: string, team: 'seal' | 'terrorist' | null, o: { ready?: boolean; host?: boolean; readyIn?: number } = {}) =>
  ({ id, name, team, ready: o.ready ?? false, host: o.host ?? false, readyIn: o.readyIn ?? 0 });
const lobby = (seats: GameLobbyEvent['seats'], o: Partial<Omit<GameLobbyEvent, 'type' | 'seats'>> = {}): GameLobbyEvent =>
  ({ type: 'gameLobby', seats, countdown: null, launched: false, ...o });

function make(me: { id: number; host: boolean } | null = { id: 1, host: true }, armory = true, extra: Partial<LobbyViewOptions> = {}) {
  const sent: string[] = [], chats: [string, boolean][] = [], calls: string[] = [], talk: boolean[] = [];
  let now = 0;
  const v = new LobbyView({
    doc: document,
    title: () => ({ name: 'FROSTFIRE BOX', map: 'MP2', players: 16 }),
    me: () => me,
    send: (ev) => { sent.push(ev); },
    chat: (text, team) => { chats.push([text, team]); },
    armory: () => { calls.push('armory'); },
    armoryReady: () => armory,
    leave: () => { calls.push('leave'); },
    talk: (down) => { talk.push(down); },
    now: () => now,
    ...extra,
  });
  document.body.append(v.root);
  return { v, sent, chats, calls, talk, setNow: (ms: number) => { now = ms; } };
}

const rows = (root: HTMLElement, list: string): string[] =>
  [...root.querySelectorAll(`.fx-lobby-list[data-list="${list}"] .fx-lobby-row`)].map((r) => r.querySelector('.fx-lobby-name')!.textContent!);
const button = (root: HTMLElement, name: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`[data-act="${name}"]`)!;

afterEach(() => { document.body.innerHTML = ''; });

describe('FORGE lobby: the view', () => {
  it('bot roster and kick names carry no accent of their own (H316), as a human\'s on the same seat', () => {
    const { v } = make({ id: 1, host: true }, true, { kickable: () => ({ busy: false }), kick: () => undefined });
    const names = ['Freq', 'Cav', 'Orion', 'Botty McBotface'];
    const bots = names.map((name, i) => ({ ...seat(i + 2, name, 'seal'), bot: true as const }));
    v.update(lobby([seat(1, 'Host', 'terrorist', { host: true }), ...bots]));
    button(v.root, 'kick').click();
    const spans = () => [...v.root.querySelectorAll<HTMLElement>('.fx-lobby-row:not(.is-me) .fx-lobby-name')];
    const targets = () => [...v.root.querySelectorAll<HTMLElement>('[data-card="kick"] [data-seat]')];
    for (const elements of [spans(), targets()]) {
      expect(elements.map((e) => e.textContent)).toEqual(names);
      expect(elements.map((e) => [e.style.color, e.style.textShadow])).toEqual(names.map(() => ['', '']));
    }
    v.update(lobby([seat(1, 'Host', 'terrorist', { host: true }), ...bots.map(({ bot: _bot, ...human }) => human)]));
    for (const elements of [spans(), targets()]) {
      expect(elements.map((e) => e.textContent)).toEqual(names);
      expect(elements.map((e) => [e.style.color, e.style.textShadow])).toEqual(names.map(() => ['', '']));
    }
  });
  it('draws each side\'s rows, the spectators, the marks, the counts against the cap and the local seat', () => {
    const { v } = make();
    v.update(lobby([
      seat(1, 'Host', 'seal', { host: true, ready: true }), seat(2, 'Guest-1', 'terrorist'), seat(3, 'Guest-2', 'seal'), seat(4, 'Watcher', null),
    ]));
    expect(rows(v.root, 'seal')).toEqual(['Host', 'Guest-2']);
    expect(rows(v.root, 'terrorist')).toEqual(['Guest-1']);
    expect(rows(v.root, 'spectator')).toEqual(['Watcher']);
    const host = v.root.querySelector('.fx-lobby-row[data-id="1"]')!;
    expect(host.classList.contains('is-ready')).toBe(true);
    expect(host.classList.contains('is-host')).toBe(true);
    expect(host.classList.contains('is-me')).toBe(true);
    const g = v.root.querySelector('.fx-lobby-row[data-id="2"]')!;
    expect([g.classList.contains('is-ready'), g.classList.contains('is-host'), g.classList.contains('is-me')]).toEqual([false, false, false]);
    expect(v.root.querySelector('[data-count="players"]')!.textContent).toBe('3/16');
    expect(v.root.querySelector('[data-count="seal"]')!.textContent).toBe('2');
    expect(v.root.querySelector('[data-count="terrorist"]')!.textContent).toBe('1');
    expect(v.root.querySelector('[data-count="spectator"]')!.textContent).toBe('1');
    expect(v.root.querySelector('.fx-lobby-head')!.textContent).toContain('FROSTFIRE BOX');
    expect(v.root.querySelector('.fx-lobby-head')!.textContent).toContain('MP2');
  });

  it('READY, SWITCH SIDES and LAUNCH send their requests; ARMORY and LEAVE call theirs', () => {
    const { v, sent, calls } = make();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    button(v.root, 'ready').click();
    button(v.root, 'switch').click();
    button(v.root, 'launch').click();
    button(v.root, 'armory').click();
    button(v.root, 'leave').click();
    expect(sent).toEqual(['lobbyReady', 'switchTeams', 'launch']);
    expect(calls).toEqual(['armory', 'leave']);
  });

  it('READY shows its gate\'s seconds and is closed while the server holds it; the toggle shows the seat\'s READY', () => {
    const { v, setNow } = make();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true, readyIn: 12 }), seat(2, 'G', 'terrorist')]));
    const ready = button(v.root, 'ready');
    expect(ready.disabled).toBe(true);
    expect(ready.textContent).toBe('READY (12)');
    setNow(5_000); v.tick();
    expect(ready.textContent).toBe('READY (7)');
    setNow(12_000); v.tick();
    expect([ready.disabled, ready.textContent]).toEqual([false, 'READY']);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true, ready: true }), seat(2, 'G', 'terrorist')]));
    expect(ready.classList.contains('is-on')).toBe(true);
    expect(ready.getAttribute('aria-pressed')).toBe('true');
  });

  it('LAUNCH is the host\'s only, closed until both sides are seated and its gate is past; the countdown shows on it', () => {
    const guest = make({ id: 2, host: false });
    guest.v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect(button(guest.v.root, 'launch').hidden).toBe(true);
    document.body.innerHTML = '';
    const { v, setNow } = make();
    const launch = button(v.root, 'launch');
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })]));
    expect([launch.hidden, launch.disabled]).toEqual([false, true]);       // one side empty
    v.update(lobby([seat(1, 'Host', 'seal', { host: true, readyIn: 3 }), seat(2, 'G', 'terrorist')]));
    expect(launch.disabled).toBe(true);                                    // the host's gate
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect([launch.disabled, launch.textContent]).toEqual([false, 'LAUNCH']);
    setNow(1_000);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')], { countdown: 30 }));
    expect(launch.textContent).toBe('LAUNCH (30)');
    expect(v.root.querySelector('.fx-lobby-countdown')!.textContent).toContain('30');
    setNow(11_000); v.tick();
    expect(launch.textContent).toBe('LAUNCH (20)');
    // Under the countdown READY and SWITCH SIDES are closed (the room refuses both: SWITCH_CLOSED_AT_COUNTDOWN_READING).
    expect([button(v.root, 'ready').disabled, button(v.root, 'switch').disabled]).toEqual([true, true]);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')], { launched: true }));
    expect([launch.disabled, button(v.root, 'ready').disabled, button(v.root, 'switch').disabled, button(v.root, 'armory').disabled]).toEqual([true, true, true, true]);
  });

  it('a watcher has no READY, SWITCH SIDES or ARMORY; no ARMORY source closes it too', () => {
    const w = make({ id: 4, host: false });
    w.v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(4, 'W', null)]));
    expect([button(w.v.root, 'ready').disabled, button(w.v.root, 'switch').disabled, button(w.v.root, 'armory').disabled]).toEqual([true, true, true]);
    document.body.innerHTML = '';
    const n = make({ id: 2, host: false }, false);
    n.v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect(button(n.v.root, 'armory').disabled).toBe(true);
  });

  it('a refusal is a line with the reason\'s words, not a dialog', () => {
    const { v } = make();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })], { refused: 'sides' }));
    const line = v.root.querySelector('.fx-lobby-refused')!;
    expect(line.textContent).toBe('sides');
    expect((line as HTMLElement).hidden).toBe(false);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })]));
    expect((line as HTMLElement).hidden).toBe(true);
  });

  it('the chat: Enter (the form\'s submit) sends the line and draws it as the original\'s own line; team lines marked; the last 21 kept', () => {
    const { v, chats } = make();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })]));
    const input = v.root.querySelector<HTMLInputElement>('.fx-lobby-chat input')!;
    const form = v.root.querySelector<HTMLFormElement>('.fx-lobby-chat form')!;
    expect(input.maxLength).toBe(CHAT_MESSAGE_CHARS);
    input.value = 'go go go';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(chats).toEqual([['go go go', false]]);
    expect(input.value).toBe('');
    button(v.root, 'team').click();
    expect(button(v.root, 'team').getAttribute('aria-pressed')).toBe('true');
    input.value = 'flank';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(chats.at(-1)).toEqual(['flank', true]);
    input.value = '';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(chats.length).toBe(2);                                         // nothing sent for an empty line
    v.chatLine({ from: 'Guest-1', text: 'hi', team: false });
    const lines = [...v.root.querySelectorAll('.fx-lobby-line')];
    expect(lines.map((l) => l.textContent)).toEqual(['Host (All): go go go', 'Host (Team): flank', 'Guest-1 (All): hi']);
    expect(lines.map((l) => l.classList.contains('is-team'))).toEqual([false, true, false]);
    for (let i = 0; i < 30; i++) v.chatLine({ from: 'G', text: `${i}`, team: false });
    expect(v.root.querySelectorAll('.fx-lobby-line').length).toBe(GAME_LOBBY_CHAT_LINES);
    v.chatLine({ from: 'G', text: '', team: false });                      // an empty line draws none
    expect(v.root.querySelector('.fx-lobby-lines')!.lastElementChild!.textContent).toBe('G (All): 29');
  });

  it('the talker bar shows who holds the floor; the talk button holds to talk with the pointer', () => {
    const { v, talk } = make();
    v.setTalker('Guest-1');
    expect(v.root.querySelector('.fx-lobby-talker')!.textContent).toContain('Guest-1');
    v.setTalker('VOICE PAUSED');
    expect(v.root.querySelector('.fx-lobby-talker')!.textContent).toContain('VOICE PAUSED');
    const t = button(v.root, 'talk');
    const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
    t.dispatchEvent(new Ctor('pointerdown', { bubbles: true, button: 0 }));
    t.dispatchEvent(new Ctor('pointerup', { bubbles: true, button: 0 }));
    t.dispatchEvent(new Ctor('pointerdown', { bubbles: true, button: 0 }));
    t.dispatchEvent(new Ctor('pointerleave', { bubbles: true }));
    expect(talk).toEqual([true, false, true, false]);
    v.setTalking(true);
    expect(t.classList.contains('is-on')).toBe(true);
  });

  it('the pad moves a focus over the controls and Cross presses the focused one, skipping a closed one', () => {
    const { v, sent } = make();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect(v.focused()).toBe('ready');
    v.focusMove(1);
    expect(v.focused()).toBe('switch');
    v.press();
    expect(sent).toEqual(['switchTeams']);
    v.focusMove(-1); v.focusMove(-1);                                      // wraps
    expect(v.focused()).toBe('leave');
    expect(button(v.root, 'leave').classList.contains('is-focus')).toBe(true);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true, readyIn: 9 }), seat(2, 'G', 'terrorist')]));
    v.focusMove(1);                                                        // ready closed: skipped
    expect(v.focused()).toBe('switch');
  });
});

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the lobby's visibility in the window -- the host's control
 * alone (a joiner's hidden), its label the state ("LISTED" / "UNLISTED"), closed while a change is asked, walked by the
 * pad's focus between LAUNCH and LEAVE.
 */
describe('FG-45: the host\'s visibility control', () => {
  it('hidden for a joiner (no visibility given); the host\'s shows the state, and a press asks the change', () => {
    const joiner = make({ id: 2, host: false });
    joiner.v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect(button(joiner.v.root, 'listed').hidden).toBe(true);
    document.body.innerHTML = '';
    const state = { on: false, busy: false };
    const { v, calls } = make({ id: 1, host: true }, true, { listed: () => state, toggleListed: () => { calls.push('listed'); } });
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    const b = button(v.root, 'listed');
    expect([b.hidden, b.disabled, b.textContent, b.getAttribute('aria-pressed')]).toEqual([false, false, 'UNLISTED', 'false']);
    b.click();
    expect(calls).toEqual(['listed']);
    state.on = true; v.tick();
    expect([b.textContent, b.classList.contains('is-on'), b.getAttribute('aria-pressed')]).toEqual(['LISTED', true, 'true']);
    state.busy = true; v.tick();
    expect(b.disabled).toBe(true);                                         // a change under way
    b.click();
    expect(calls).toEqual(['listed']);
  });

  it('the pad\'s focus walks to it between LAUNCH and LEAVE and Cross presses it; a joiner\'s walk never lands on it', () => {
    const state = { on: false, busy: false };
    const { v, calls } = make({ id: 1, host: true }, true, { listed: () => state, toggleListed: () => { calls.push('listed'); } });
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    expect(v.focused()).toBe('ready');
    v.focusMove(-1);
    expect(v.focused()).toBe('leave');
    v.focusMove(-1);
    expect(v.focused()).toBe('listed');
    expect(button(v.root, 'listed').classList.contains('is-focus')).toBe(true);
    v.press();
    expect(calls).toEqual(['listed']);
    v.focusMove(-1);
    expect(v.focused()).toBe('launch');
    document.body.innerHTML = '';
    const j = make({ id: 2, host: false });
    j.v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    const seen = new Set<string | null>();
    for (let i = 0; i < 8; i++) { j.v.focusMove(1); seen.add(j.v.focused()); }
    expect(seen.has('listed')).toBe(false);
  });
});

/**
 * FG-45's review F1: while the visibility's change is out its control is closed, and the pad's focus must not slide on
 * to the next open control (LEAVE, which for the host closes the lobby): a busy control keeps the focus, and Cross on it
 * presses nothing.
 */
describe('FG-45 F1: a busy LISTED keeps the pad\'s focus', () => {
  it('Cross twice on LISTED while its change is out: one ask, LEAVE never pressed, the focus stays on LISTED', () => {
    const state = { on: false, busy: false };
    const { v, calls } = make({ id: 1, host: true }, true, { listed: () => state, toggleListed: () => { calls.push('listed'); state.busy = true; } });
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]));
    v.focusMove(-1); v.focusMove(-1);
    expect(v.focused()).toBe('listed');
    v.press();
    v.tick();                                                              // the change is out: the control closed
    expect(button(v.root, 'listed').disabled).toBe(true);
    expect(v.focused()).toBe('listed');
    v.press();
    expect(calls).toEqual(['listed']);                                     // no second ask, no LEAVE
    expect(button(v.root, 'listed').classList.contains('is-focus')).toBe(true);
    expect(button(v.root, 'leave').classList.contains('is-focus')).toBe(false);
    v.focusMove(1);                                                        // the walk still leaves it
    expect(v.focused()).toBe('leave');
  });
});

/**
 * FG-48a (FG.R24; a product-track adaptation, no original -- the game's lobby has no password): the host's PASSWORD
 * control and its card in the window -- a field, SET, CLEAR (when locked) and CANCEL -- reached by the mouse and by the
 * pad (the card's items walked, Cross pressing, Circle cancelling). A joiner has none.
 */
describe('FG-48a: the host\'s password control and its card', () => {
  const two = () => lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'G', 'terrorist')]);
  const card = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[data-card="password"]:not([hidden])');
  const cardButton = (root: HTMLElement, name: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`[data-card="password"] [data-card-act="${name}"]`)!;
  const field = (root: HTMLElement): HTMLInputElement => root.querySelector<HTMLInputElement>('[data-card="password"] input')!;
  const type = (root: HTMLElement, text: string): void => { const f = field(root); f.value = text; f.dispatchEvent(new Event('input')); };

  it('hidden for a joiner; the host\'s says PASSWORD or LOCKED, and a press opens its card (a password field, at most 32)', () => {
    const j = make({ id: 2, host: false });
    j.v.update(two());
    expect(button(j.v.root, 'password').hidden).toBe(true);
    document.body.innerHTML = '';
    const state = { locked: false, busy: false };
    const { v } = make({ id: 1, host: true }, true, { password: () => state, setPassword: () => undefined });
    v.update(two());
    const b = button(v.root, 'password');
    expect([b.hidden, b.disabled, b.textContent, b.getAttribute('aria-pressed')]).toEqual([false, false, 'PASSWORD', 'false']);
    expect(card(v.root)).toBeNull();
    b.click();
    expect(card(v.root)).not.toBeNull();
    expect(v.cardOpen()).toBe('password');
    expect([field(v.root).type, field(v.root).maxLength]).toEqual(['password', 32]);
    state.locked = true; v.tick();
    expect([b.textContent, b.classList.contains('is-on'), b.getAttribute('aria-pressed')]).toEqual(['LOCKED', true, 'true']);
    state.busy = true; v.tick();
    expect(b.disabled).toBe(true);
  });

  it('the card: SET closed until the field holds a password the server takes; SET asks it, CLEAR asks null (locked only), CANCEL nothing', () => {
    const state = { locked: false, busy: false };
    const asked: (string | null)[] = [];
    const { v } = make({ id: 1, host: true }, true, { password: () => state, setPassword: (pw) => { asked.push(pw); } });
    v.update(two());
    button(v.root, 'password').click();
    expect(cardButton(v.root, 'set').disabled).toBe(true);
    expect(cardButton(v.root, 'clear').disabled).toBe(true);                 // nothing to clear on an open lobby
    type(v.root, 'café');
    expect(cardButton(v.root, 'set').disabled).toBe(true);
    type(v.root, 'x'.repeat(33));
    expect(cardButton(v.root, 'set').disabled).toBe(true);
    type(v.root, 'open sesame');
    expect(cardButton(v.root, 'set').disabled).toBe(false);
    cardButton(v.root, 'set').click();
    expect(asked).toEqual(['open sesame']);
    expect(card(v.root)).toBeNull();
    state.locked = true; v.tick();
    button(v.root, 'password').click();
    expect(field(v.root).value).toBe('');                                    // never kept in the card
    cardButton(v.root, 'clear').click();
    expect(asked).toEqual(['open sesame', null]);
    button(v.root, 'password').click();
    cardButton(v.root, 'cancel').click();
    expect(asked).toEqual(['open sesame', null]);
    expect(card(v.root)).toBeNull();
    expect(v.cardOpen()).toBeNull();
  });

  it('the pad: the card\'s items walked past a closed one, Cross presses the focused one, cancel closes it', () => {
    const state = { locked: true, busy: false };
    const asked: (string | null)[] = [];
    const { v } = make({ id: 1, host: true }, true, { password: () => state, setPassword: (pw) => { asked.push(pw); } });
    v.update(two());
    v.focusMove(-1); v.focusMove(-1);
    expect(v.focused()).toBe('password');
    v.press();
    expect(v.cardOpen()).toBe('password');
    const on = (): string | null => v.root.querySelector<HTMLElement>('[data-card="password"] .is-focus')?.dataset['cardAct'] ?? null;
    expect(on()).toBe('field');
    v.cardMove(1);
    expect(on()).toBe('clear');                                              // SET closed: an empty field
    v.cardMove(1);
    expect(on()).toBe('cancel');
    v.cardMove(1);
    expect(on()).toBe('field');
    v.cardMove(-1);
    v.cardMove(-1);
    expect(on()).toBe('clear');
    v.cardPress();
    expect(asked).toEqual([null]);
    expect(v.cardOpen()).toBeNull();
    v.press();
    expect(v.cardOpen()).toBe('password');
    v.cardCancel();
    expect(v.cardOpen()).toBeNull();
    expect(asked).toEqual([null]);
  });
});

/**
 * FG-48b (FG.R24; a product-track adaptation, no original): the host's KICK in the window -- the host's alone (a
 * joiner's hidden), closed while no other seat is in or a kick is out; its card lists the other seats (never the host's
 * own), the pad walks it (the d-pad chooses, Cross kicks, Circle cancels), and its rows follow the room's view.
 */
describe('FG-48b: the host\'s KICK and its card', () => {
  const three = () => lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'Lima', 'terrorist'), seat(3, 'Mike', null)]);
  const card = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[data-card="kick"]:not([hidden])');
  const seats = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('[data-card="kick"] [data-card-act="seat"]')].map((b) => b.textContent ?? '');
  const on = (root: HTMLElement): string | null => {
    const f = root.querySelector<HTMLElement>('[data-card="kick"] .is-focus');
    return f ? (f.dataset['cardAct'] === 'seat' ? `seat:${f.dataset['seat']}` : f.dataset['cardAct'] ?? null) : null;
  };

  it('hidden for a joiner; the host\'s KICK closed with no other seat in, or while a kick is out', () => {
    const j = make({ id: 2, host: false });
    j.v.update(three());
    expect(button(j.v.root, 'kick').hidden).toBe(true);
    document.body.innerHTML = '';
    const state = { busy: false };
    const { v } = make({ id: 1, host: true }, true, { kickable: () => state, kick: () => undefined });
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })]));
    const b = button(v.root, 'kick');
    expect([b.hidden, b.disabled, b.textContent]).toEqual([false, true, 'KICK']);
    v.update(three());
    expect(b.disabled).toBe(false);
    state.busy = true; v.tick();
    expect(b.disabled).toBe(true);
  });

  it('the card lists the other seats by name, never the host\'s own; a seat\'s button kicks it by its room id; CANCEL asks nothing', () => {
    const kicked: number[] = [];
    const { v } = make({ id: 1, host: true }, true, { kickable: () => ({ busy: false }), kick: (s) => { kicked.push(s); } });
    v.update(three());
    button(v.root, 'kick').click();
    expect(v.cardOpen()).toBe('kick');
    expect(card(v.root)).not.toBeNull();
    expect(seats(v.root)).toEqual(['Lima', 'Mike']);
    v.root.querySelector<HTMLButtonElement>('[data-card="kick"] [data-seat="3"]')!.click();
    expect(kicked).toEqual([3]);
    expect(v.cardOpen()).toBeNull();
    button(v.root, 'kick').click();
    v.root.querySelector<HTMLButtonElement>('[data-card="kick"] [data-card-act="cancel"]')!.click();
    expect(kicked).toEqual([3]);
    expect(card(v.root)).toBeNull();
  });

  it('the rows follow the room\'s view while the card shows; the last other seat gone closes it', () => {
    const { v } = make({ id: 1, host: true }, true, { kickable: () => ({ busy: false }), kick: () => undefined });
    v.update(three());
    button(v.root, 'kick').click();
    v.update(lobby([seat(1, 'Host', 'seal', { host: true }), seat(3, 'Mike', null), seat(4, 'November', 'seal')]));
    expect(seats(v.root)).toEqual(['Mike', 'November']);
    v.update(lobby([seat(1, 'Host', 'seal', { host: true })]));
    expect(v.cardOpen()).toBeNull();
  });

  it('the pad: the focus walks to KICK before LEAVE; on the card the d-pad chooses, Cross kicks, cancel closes', () => {
    const kicked: number[] = [];
    const { v } = make({ id: 1, host: true }, true, { kickable: () => ({ busy: false }), kick: (s) => { kicked.push(s); } });
    v.update(three());
    v.focusMove(-1);
    expect(v.focused()).toBe('leave');
    v.focusMove(-1);
    expect(v.focused()).toBe('kick');
    v.press();
    expect(v.cardOpen()).toBe('kick');
    expect(on(v.root)).toBe('seat:2');
    v.cardMove(1);
    expect(on(v.root)).toBe('seat:3');
    v.cardMove(1);
    expect(on(v.root)).toBe('cancel');
    v.cardMove(1);
    expect(on(v.root)).toBe('seat:2');
    v.cardMove(-1);
    v.cardMove(-1);
    expect(on(v.root)).toBe('seat:3');
    v.cardPress();
    expect(kicked).toEqual([3]);
    expect(v.cardOpen()).toBeNull();
    v.press();
    expect(v.cardOpen()).toBe('kick');
    v.cardCancel();
    expect(v.cardOpen()).toBeNull();
    expect(kicked).toEqual([3]);
  });
});

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): LEAVE hands the lobby on, and the host's "Close the lobby"
 * is a control of its own -- CLOSE LOBBY, the host's alone (`closable`), opening a card that asks before it closes the
 * lobby for everyone (its focus on CANCEL first, so no second Cross closes it); the pad walks it as the other cards.
 */
describe('FG-48c: the host\'s CLOSE LOBBY and its card', () => {
  const two = () => lobby([seat(1, 'Host', 'seal', { host: true }), seat(2, 'Lima', 'terrorist')]);
  const on = (root: HTMLElement): string | null => root.querySelector<HTMLElement>('[data-card="close"] .is-focus')?.dataset['cardAct'] ?? null;

  it('hidden for a joiner; the host\'s opens a card -- CLOSE asks the page\'s close, CANCEL nothing; LEAVE still the page\'s leave', () => {
    const j = make({ id: 2, host: false });
    j.v.update(two());
    expect(button(j.v.root, 'close').hidden).toBe(true);
    document.body.innerHTML = '';
    const closes: string[] = [];
    const { v, calls } = make({ id: 1, host: true }, true, { closable: () => true, closeLobby: () => { closes.push('close'); } });
    v.update(two());
    const b = button(v.root, 'close');
    expect([b.hidden, b.disabled, b.textContent]).toEqual([false, false, 'CLOSE LOBBY']);
    b.click();
    expect(v.cardOpen()).toBe('close');
    expect(v.root.querySelector<HTMLElement>('[data-card="close"]')!.hidden).toBe(false);
    v.root.querySelector<HTMLButtonElement>('[data-card="close"] [data-card-act="cancel"]')!.click();
    expect(closes).toEqual([]);
    expect(v.cardOpen()).toBeNull();
    b.click();
    v.root.querySelector<HTMLButtonElement>('[data-card="close"] [data-card-act="close"]')!.click();
    expect(closes).toEqual(['close']);
    expect(v.cardOpen()).toBeNull();
    button(v.root, 'leave').click();
    expect(calls).toEqual(['leave']);
    expect(closes).toEqual(['close']);
  });

  it('the pad: CLOSE LOBBY just before LEAVE; the card opens on CANCEL, so Cross twice closes nothing; the d-pad to CLOSE, Cross closes', () => {
    const closes: string[] = [];
    const { v } = make({ id: 1, host: true }, true, { closable: () => true, closeLobby: () => { closes.push('close'); } });
    v.update(two());
    v.focusMove(-1);
    expect(v.focused()).toBe('leave');
    v.focusMove(-1);
    expect(v.focused()).toBe('close');
    v.press();
    expect(v.cardOpen()).toBe('close');
    expect(on(v.root)).toBe('cancel');
    v.cardPress();                                                         // a second Cross: CANCEL
    expect(v.cardOpen()).toBeNull();
    expect(closes).toEqual([]);
    v.press();
    v.cardMove(-1);
    expect(on(v.root)).toBe('close');
    v.cardPress();
    expect(closes).toEqual(['close']);
  });

  it('the host\'s flag gone (a hand-on): the control hides at the next tick and its open card closes', () => {
    let hosting = true;
    const { v } = make({ id: 1, host: true }, true, { closable: () => hosting, closeLobby: () => undefined });
    v.update(two());
    button(v.root, 'close').click();
    expect(v.cardOpen()).toBe('close');
    hosting = false;
    v.tick();
    expect(button(v.root, 'close').hidden).toBe(true);
    expect(v.cardOpen()).toBeNull();
  });
});
