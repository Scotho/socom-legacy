import { CHAT_MESSAGE_CHARS, GAME_LOBBY_CHAT_LINES } from '@s2u/ui';
import { LOBBY_PASSWORD_MAX, lobbyPasswordOk, type ForgeLobbyChatLine, type ForgeLobbyRequest, type GameLobbyEvent, type GameLobbySeat } from './deps';

/**
 * FORGE (FG-27; FG.R22): the lobby popup's view -- a browser adaptation with no original: the original's game lobby
 * (`dlgGameLobby.rdr` as `../../gameLobbyHost` and `@s2u/ui`'s `GameLobbyCommands` fill it) represented in the forge's
 * own markup, from the room's `gameLobby` view and nothing else. Nothing of the game's behaviour is changed: every
 * request goes to the room, which decides (`match/src/gameLobby.ts` `PreMatch`); the view only opens or closes a
 * button where the room would refuse it anyway, and shows the room's own refusal as a line.
 *
 * What it draws, after the original's lists (`GameLobbyCommands.drawLists`, `FUN_002f7020` D:L196331-196496):
 * - SEALS and TERRORISTS, each seat a row -- its name, the ready mark (the room's `ready` flag, drawn as the original's ready dot -- `@s2u/ui` `gameLobbyCommands.ts`'s reading; the popup holds no value of its own), the host's star --
 *   and SPECTATORS below (name only); the seated count against the layout's cap (FG.R18 `players`); the local seat
 *   marked (`is-me`);
 * - the chat (`B_CHATLIST`): each line `name (All): text` or `name (Team): text` (`gameLobbyChatLine`'s form,
 *   `FUN_002ba9d0` D:L160181-160184), the last `GAME_LOBBY_CHAT_LINES` kept; the seat's own line drawn at once (the
 *   relay sends it to the others only, `FUN_002ba870` D:L160111); an input cut at `CHAT_MESSAGE_CHARS`; Enter sends
 *   (the form's submit: no key listener), a toggle picks the team's scope (SVC-19's `team`);
 * - the talker bar: the name the voice part reports (`./lobbyVoice`), or its notice;
 * - READY (the seat's READY shown; its gate's seconds while `readyIn` holds it), SWITCH SIDES, ARMORY, LAUNCH (the
 *   host's only: open once both sides are seated and the host's gate is past -- `PreMatch.forceLaunch`'s `sides` and
 *   `gate` -- the countdown's seconds on it), LEAVE. Under a countdown READY and SWITCH SIDES are closed, as the room
 *   refuses both (`SWITCH_CLOSED_AT_COUNTDOWN_READING`); a watcher has neither (`spectator`), nor an ARMORY.
 * - FG-45 (FG.R24; a forge adaptation with no original -- the game's lobby has no such control): the lobby's
 *   visibility, LISTED / UNLISTED, the creator's control alone (`listed`), closed while its change is asked.
 * - FG-48b (the same track): KICK, the host's alone (`kickable`), opening a card of the other seats by name -- a seat's
 *   button kicks it (`kick`, its room id), CANCEL asks nothing; the card's rows follow the room's view.
 * - FG-48c (the same track): LEAVE hands a host's lobby on (the page's), and CLOSE LOBBY, the host's alone (`closable`),
 *   opens a card that asks before the lobby is closed for everyone (`closeLobby`) -- its focus on CANCEL first, so a
 *   second Cross closes nothing. Every host control follows its option each tick, so a successor gains them live.
 */

export interface LobbyViewOptions {
  doc: Document;
  title(): { name: string; map: string; players: number };
  me(): { id: number; host: boolean } | null;
  send(ev: ForgeLobbyRequest): void;
  chat(text: string, team: boolean): void;
  /** ARMORY pressed. */
  armory(): void;
  /** Whether the ARMORY can open (the page has its source). */
  armoryReady(): boolean;
  /** LEAVE pressed. */
  leave(): void;
  /** The talk button held (true) or let go (false) with the pointer. */
  talk(down: boolean): void;
  /** The page's clock, ms; absent, `performance.now`. */
  now?(): number;
  /**
   * FG-45 (FG.R24; an adaptation, no original): the lobby's visibility as the host's control shows it -- `on` listed in
   * the modern UI's Custom matches, `busy` a change asked and not answered -- or null (absent) for a joiner: no control.
   */
  listed?(): { on: boolean; busy: boolean } | null;
  /** FG-45: the host's control pressed (the page asks the server's change). */
  toggleListed?(): void;
  /**
   * FG-48a (FG.R24; an adaptation, no original): the lobby's password as the host's control shows it -- `locked` it asks
   * one, `busy` a change asked and not answered -- or null (absent) for a joiner: no control.
   */
  password?(): { locked: boolean; busy: boolean } | null;
  /** FG-48a: the card's SET (a password the server takes) or CLEAR (null). */
  setPassword?(password: string | null): void;
  /**
   * FG-48b (FG.R24; an adaptation, no original): the host's kick as its control shows it -- `busy` a kick asked and not
   * answered -- or null (absent) for a joiner: no control.
   */
  kickable?(): { busy: boolean } | null;
  /** FG-48b: the KICK card's seat chosen (the room's seat id). */
  kick?(seat: number): void;
  /** FG-48c (FG.R24; an adaptation, no original): whether CLOSE LOBBY shows (the host's alone); absent, a joiner's: none. */
  closable?(): boolean;
  /** FG-48c: the close card's CLOSE pressed (the page closes the lobby for everyone). */
  closeLobby?(): void;
}

/**
 * The controls the pad's focus walks, in order (FG-45's `listed`, FG-48a's `password`, FG-48b's `kick` and FG-48c's
 * `close`, the host's alone, before LEAVE).
 */
export const LOBBY_CONTROLS = ['ready', 'switch', 'armory', 'launch', 'listed', 'password', 'kick', 'close', 'leave'] as const;
export type LobbyControl = (typeof LOBBY_CONTROLS)[number];

/** FG-48: a card over the window's controls (the password's, FG-48b the kick's, FG-48c the close's), walked by the pad while it shows. */
export type LobbyCard = 'password' | 'kick' | 'close';

/** FG-48a: the PASSWORD control's label while the lobby is open. */
const LOCK_LABEL = 'PASSWORD';

type ListName = 'seal' | 'terrorist' | 'spectator';

/** FG-48: a card: its root, its items in the pad's order (each with `data-card-act`), the focus among them. */
interface CardHere { name: LobbyCard; root: HTMLElement; items(): HTMLElement[]; focus: number; cancel(): void }

export class LobbyView {
  readonly root: HTMLDivElement;
  private readonly doc: Document;
  private readonly head: HTMLDivElement;
  private readonly lists = new Map<ListName, HTMLUListElement>();
  private readonly counts = new Map<string, HTMLElement>();
  private readonly countdownLine: HTMLDivElement;
  private readonly refusedLine: HTMLDivElement;
  private readonly talker: HTMLDivElement;
  private readonly lines: HTMLUListElement;
  private readonly input: HTMLInputElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private ev: GameLobbyEvent | null = null;
  private team = false;
  /** When (the page's clock, ms) the seat's READY gate and the launch countdown end, from the last view. */
  private readyAt: number | null = null;
  private countdownAt: number | null = null;
  private focus = 0;
  /** FG-45: LISTED's change is out (the control closed meanwhile; it holds the pad's focus, F1). */
  private listedBusy = false;
  /** FG-48a: PASSWORD's change is out (held as LISTED's is). */
  private passwordBusy = false;
  /** FG-48: the card showing, or null. */
  private card: CardHere | null = null;
  /** FG-48a: the password card's parts. */
  private readonly passwordCard: { root: HTMLFormElement; field: HTMLInputElement; set: HTMLButtonElement; clear: HTMLButtonElement; cancel: HTMLButtonElement };
  /** FG-48b: KICK's ask is out (held as LISTED's is). */
  private kickBusy = false;
  /** FG-48b: the kick card's parts -- its seats' buttons (redrawn from the room's view) and CANCEL. */
  private readonly kickCard: { root: HTMLDivElement; seats: HTMLDivElement; buttons: HTMLButtonElement[]; cancel: HTMLButtonElement };
  /** FG-48c: the close card's parts -- CLOSE and CANCEL. */
  private readonly closeCardParts: { root: HTMLDivElement; close: HTMLButtonElement; cancel: HTMLButtonElement };

  constructor(private readonly o: LobbyViewOptions) {
    const doc = this.doc = o.doc;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
      const e = doc.createElement(tag);
      e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.root = el('div', 'fx-lobby');

    this.head = el('div', 'fx-lobby-head');
    const players = el('span', 'fx-lobby-count');
    players.dataset['count'] = 'players';
    this.counts.set('players', players);

    const sides = el('div', 'fx-lobby-sides');
    const column = (name: ListName, label: string): HTMLDivElement => {
      const col = el('div', `fx-lobby-list fx-lobby-${name}`);
      col.dataset['list'] = name;
      const h = el('div', 'fx-lobby-list-head');
      const count = el('span', 'fx-lobby-count');
      count.dataset['count'] = name;
      this.counts.set(name, count);
      h.append(el('span', 'fx-lobby-list-name', label), count);
      const ul = el('ul', 'fx-lobby-rows');
      this.lists.set(name, ul);
      col.append(h, ul);
      return col;
    };
    sides.append(column('seal', 'SEALS'), column('terrorist', 'TERRORISTS'));
    const watchers = column('spectator', 'SPECTATORS');

    this.countdownLine = el('div', 'fx-lobby-countdown');
    this.countdownLine.hidden = true;
    this.refusedLine = el('div', 'fx-lobby-refused');
    this.refusedLine.hidden = true;
    this.refusedLine.setAttribute('role', 'status');

    // The chat panel.
    const chat = el('div', 'fx-lobby-chat');
    this.lines = el('ul', 'fx-lobby-lines');
    this.lines.setAttribute('aria-live', 'polite');
    const form = el('form', 'fx-lobby-chat-form');
    this.input = el('input', 'fx-lobby-input');
    this.input.type = 'text';
    this.input.maxLength = CHAT_MESSAGE_CHARS;
    this.input.placeholder = 'Say something';
    this.input.setAttribute('aria-label', 'Chat');
    const teamButton = this.button('team', 'TEAM', 'fx-lobby-team');
    teamButton.setAttribute('aria-pressed', 'false');
    teamButton.addEventListener('click', () => {
      this.team = !this.team;
      teamButton.classList.toggle('is-on', this.team);
      teamButton.setAttribute('aria-pressed', String(this.team));
    });
    const sendButton = this.button('say', 'SEND', 'fx-lobby-say');
    sendButton.type = 'submit';
    form.append(this.input, teamButton, sendButton);
    form.addEventListener('submit', (e) => { e.preventDefault(); this.say(); });
    chat.append(this.lines, form);

    // The talker bar and the talk button (the pad's Circle is the page's: `ForgeLobby.talk`).
    const voice = el('div', 'fx-lobby-voice');
    this.talker = el('div', 'fx-lobby-talker');
    const talk = this.button('talk', 'HOLD TO TALK', 'fx-lobby-talk');
    const down = (e: Event): void => { if ((e as MouseEvent).button === undefined || (e as MouseEvent).button === 0) { e.preventDefault(); o.talk(true); } };
    const up = (): void => { o.talk(false); };
    talk.addEventListener('pointerdown', down);
    talk.addEventListener('pointerup', up);
    talk.addEventListener('pointerleave', up);
    talk.addEventListener('pointercancel', up);
    voice.append(talk, this.talker);

    // READY, SWITCH SIDES, ARMORY, LAUNCH, LEAVE.
    const bar = el('div', 'fx-lobby-buttons');
    const act: Record<LobbyControl, () => void> = {
      ready: () => { o.send('lobbyReady'); },
      switch: () => { o.send('switchTeams'); },
      armory: () => { o.armory(); },
      launch: () => { o.send('launch'); },
      listed: () => { o.toggleListed?.(); },
      password: () => { this.openPasswordCard(); },
      kick: () => { this.openKickCard(); },
      close: () => { this.openCloseCard(); },
      leave: () => { o.leave(); },
    };
    const labels: Record<LobbyControl, string> = {
      ready: 'READY', switch: 'SWITCH SIDES', armory: 'ARMORY', launch: 'LAUNCH', listed: 'UNLISTED', password: LOCK_LABEL, kick: 'KICK', close: 'CLOSE LOBBY', leave: 'LEAVE',
    };
    for (const name of LOBBY_CONTROLS) {
      const b = this.button(name, labels[name], `fx-lobby-btn fx-lobby-${name}`);
      b.addEventListener('click', () => { if (!b.disabled && !b.hidden) act[name](); });
      bar.append(b);
    }
    this.buttons.get('ready')!.setAttribute('aria-pressed', 'false');
    const listedButton = this.buttons.get('listed')!;
    listedButton.setAttribute('aria-pressed', 'false');
    listedButton.title = 'Whether this lobby shows in Custom matches (Play online, Lobbies); unlisted, it is joined by its link';
    const passwordButton = this.buttons.get('password')!;
    passwordButton.setAttribute('aria-pressed', 'false');
    passwordButton.title = 'A password others type before they join (set, change or clear it)';

    // FG-48a: the password's card -- a field (typed by a keyboard; the pad reaches it and the card's buttons), SET, CLEAR, CANCEL.
    const pwRoot = el('form', 'fx-lobby-card');
    pwRoot.dataset['card'] = 'password';
    pwRoot.hidden = true;
    pwRoot.setAttribute('aria-label', 'The lobby\'s password');
    const pwField = el('input', 'fx-lobby-input fx-lobby-card-field');
    pwField.type = 'password';
    pwField.maxLength = LOBBY_PASSWORD_MAX;
    pwField.autocomplete = 'off';
    pwField.placeholder = 'A new password';
    pwField.setAttribute('aria-label', 'Password');
    pwField.dataset['cardAct'] = 'field';
    const cardButton = (act: string, label: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-lobby-btn';
      b.dataset['cardAct'] = act;
      b.textContent = label;
      return b;
    };
    const pwSet = cardButton('set', 'SET');
    pwSet.type = 'submit';
    const pwClear = cardButton('clear', 'CLEAR');
    const pwCancel = cardButton('cancel', 'CANCEL');
    const pwRow = el('div', 'fx-lobby-card-buttons');
    pwRow.append(pwSet, pwClear, pwCancel);
    pwRoot.append(el('div', 'fx-lobby-card-title', 'PASSWORD'), el('p', 'fx-lobby-card-note', 'Players type it before they join; clear it to open the lobby.'), pwField, pwRow);
    this.passwordCard = { root: pwRoot, field: pwField, set: pwSet, clear: pwClear, cancel: pwCancel };
    pwField.addEventListener('input', () => { this.drawPasswordCard(); });
    pwRoot.addEventListener('submit', (e) => {
      e.preventDefault();
      if (pwSet.disabled) return;
      const text = pwField.value;
      this.closeCard();
      o.setPassword?.(text);
    });
    pwClear.addEventListener('click', () => { if (pwClear.disabled) return; this.closeCard(); o.setPassword?.(null); });
    pwCancel.addEventListener('click', () => { this.closeCard(); });
    this.buttons.get('kick')!.title = 'Remove a player from this lobby; they cannot join it again while it lasts';

    // FG-48b: the kick's card -- a button for each other seat (by name, its room id on it), then CANCEL.
    const kickRoot = el('div', 'fx-lobby-card');
    kickRoot.dataset['card'] = 'kick';
    kickRoot.hidden = true;
    kickRoot.setAttribute('role', 'dialog');
    kickRoot.setAttribute('aria-label', 'Remove a player');
    const kickSeats = el('div', 'fx-lobby-card-buttons fx-lobby-card-seats');
    const kickCancel = cardButton('cancel', 'CANCEL');
    const kickRow = el('div', 'fx-lobby-card-buttons');
    kickRow.append(kickCancel);
    kickRoot.append(el('div', 'fx-lobby-card-title', 'KICK'), el('p', 'fx-lobby-card-note', 'Choose a player to remove. They cannot join this lobby again while it lasts.'), kickSeats, kickRow);
    this.kickCard = { root: kickRoot, seats: kickSeats, buttons: [], cancel: kickCancel };
    kickCancel.addEventListener('click', () => { this.closeCard(); });
    this.buttons.get('close')!.title = 'Close the lobby for every player in it (LEAVE hands it to the next player instead)';

    // FG-48c: the close's card -- CLOSE and CANCEL, asked before the lobby ends for everyone.
    const closeRoot = el('div', 'fx-lobby-card');
    closeRoot.dataset['card'] = 'close';
    closeRoot.hidden = true;
    closeRoot.setAttribute('role', 'dialog');
    closeRoot.setAttribute('aria-label', 'Close the lobby');
    const closeYes = cardButton('close', 'CLOSE');
    const closeNo = cardButton('cancel', 'CANCEL');
    const closeRow = el('div', 'fx-lobby-card-buttons');
    closeRow.append(closeYes, closeNo);
    closeRoot.append(el('div', 'fx-lobby-card-title', 'CLOSE THE LOBBY'), el('p', 'fx-lobby-card-note', 'Every player in it leaves and the lobby ends. LEAVE hands it to the next player instead.'), closeRow);
    this.closeCardParts = { root: closeRoot, close: closeYes, cancel: closeNo };
    closeYes.addEventListener('click', () => { this.closeCard(); o.closeLobby?.(); });
    closeNo.addEventListener('click', () => { this.closeCard(); });

    const main = el('div', 'fx-lobby-main');
    main.append(sides, watchers);
    this.root.append(this.head, main, this.countdownLine, this.refusedLine, voice, chat, bar, pwRoot, kickRoot, closeRoot);
    this.update(null);
  }

  private button(name: string, label: string, cls: string): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.dataset['act'] = name;
    b.textContent = label;
    this.buttons.set(name, b);
    return b;
  }

  private now(): number { return this.o.now?.() ?? performance.now(); }
  private own(): GameLobbySeat | null {
    const me = this.o.me();
    return me ? this.ev?.seats.find((s) => s.id === me.id) ?? null : null;
  }

  /** The room's view drawn (null: none yet -- the lists empty, the buttons closed). */
  update(ev: GameLobbyEvent | null): void {
    this.ev = ev;
    const now = this.now(), own = this.own();
    this.readyAt = own && own.readyIn > 0 ? now + own.readyIn * 1000 : null;
    this.countdownAt = ev && ev.countdown !== null && !ev.launched ? now + ev.countdown * 1000 : null;
    const t = this.o.title();
    this.head.replaceChildren();
    const name = this.doc.createElement('span');
    name.className = 'fx-lobby-title';
    name.textContent = t.name;
    const map = this.doc.createElement('span');
    map.className = 'fx-lobby-map';
    map.textContent = t.map;
    this.head.append(name, map, this.counts.get('players')!);

    const seats = ev?.seats ?? [];
    const me = this.o.me();
    for (const list of ['seal', 'terrorist', 'spectator'] as const) {
      const of = seats.filter((s) => (list === 'spectator' ? s.team === null : s.team === list));
      this.lists.get(list)!.replaceChildren(...of.map((s) => this.row(s, list !== 'spectator', me?.id ?? null)));
      this.counts.get(list)!.textContent = String(of.length);
    }
    this.counts.get('players')!.textContent = `${seats.filter((s) => s.team !== null).length}/${t.players}`;

    const refused = ev?.refused ?? null;
    this.refusedLine.textContent = refused ?? '';
    this.refusedLine.hidden = refused === null;
    if (this.card?.name === 'kick') this.drawKickCard();                // FG-48b: its rows follow the room's view
    this.tick();
  }

  private row(s: GameLobbySeat, player: boolean, me: number | null): HTMLLIElement {
    const li = this.doc.createElement('li');
    li.className = 'fx-lobby-row';
    li.dataset['id'] = String(s.id);
    li.classList.toggle('is-me', s.id === me);
    li.classList.toggle('is-host', s.host);
    const name = this.doc.createElement('span');
    name.className = 'fx-lobby-name';
    name.textContent = s.name;
    li.append(name);
    if (player) {
      li.classList.toggle('is-ready', s.ready);
      const ready = this.doc.createElement('span');
      ready.className = 'fx-lobby-ready';
      ready.textContent = s.ready ? '●' : '○';
      ready.title = s.ready ? 'Ready' : 'Not ready';
      li.append(ready);
    }
    const host = this.doc.createElement('span');
    host.className = 'fx-lobby-host';
    host.textContent = s.host ? '★' : '';
    if (s.host) host.title = 'Host';
    li.append(host);
    return li;
  }

  private secondsTo(at: number | null): number | null {
    return at === null ? null : Math.max(0, Math.ceil((at - this.now()) / 1000));
  }

  /** Once a frame (or at an update): the gate's and the countdown's seconds, the buttons' states. */
  tick(): void {
    const ev = this.ev, own = this.own(), me = this.o.me();
    const launched = ev?.launched ?? false;
    const readyIn = this.secondsTo(this.readyAt) ?? 0;
    const countdown = this.secondsTo(this.countdownAt);
    const player = own !== null && own.team !== null;
    const counting = countdown !== null;
    const set = (name: LobbyControl, disabled: boolean, text?: string): void => {
      const b = this.buttons.get(name)!;
      b.disabled = disabled;
      if (text !== undefined && b.textContent !== text) b.textContent = text;
    };
    set('ready', !player || launched || counting || readyIn > 0, readyIn > 0 ? `READY (${readyIn})` : 'READY');
    const ready = this.buttons.get('ready')!;
    ready.classList.toggle('is-on', own?.ready ?? false);
    ready.setAttribute('aria-pressed', String(own?.ready ?? false));
    set('switch', !player || launched || counting);
    set('armory', !player || launched || !this.o.armoryReady());
    const seats = ev?.seats ?? [];
    const sides = seats.some((s) => s.team === 'seal') && seats.some((s) => s.team === 'terrorist');
    const host = (me?.host ?? false) || (own?.host ?? false);
    const launch = this.buttons.get('launch')!;
    launch.hidden = !host;
    set('launch', !host || launched || !sides || (own !== null && readyIn > 0), counting ? `LAUNCH (${countdown})` : 'LAUNCH');
    // FG-45: the visibility, the creator's page's alone (the page gives it the host ticket's proof); hidden for a joiner.
    const vis = this.o.listed?.() ?? null;
    const listed = this.buttons.get('listed')!;
    listed.hidden = vis === null;
    this.listedBusy = vis?.busy ?? false;
    set('listed', vis === null || vis.busy, vis?.on ? 'LISTED' : 'UNLISTED');
    listed.classList.toggle('is-on', vis?.on ?? false);
    listed.setAttribute('aria-pressed', String(vis?.on ?? false));
    // FG-48a: the password, the host's alone (the page gives it the host's proof); hidden for a joiner.
    const pw = this.o.password?.() ?? null;
    const password = this.buttons.get('password')!;
    password.hidden = pw === null;
    this.passwordBusy = pw?.busy ?? false;
    set('password', pw === null || pw.busy, pw?.locked ? 'LOCKED' : LOCK_LABEL);
    password.classList.toggle('is-on', pw?.locked ?? false);
    password.setAttribute('aria-pressed', String(pw?.locked ?? false));
    if (pw === null && this.card?.name === 'password') this.closeCard();
    if (this.card?.name === 'password') this.drawPasswordCard();
    // FG-48b: KICK, the host's alone (the page gives it the host's proof); closed with no other seat in, or a kick out.
    const k = this.o.kickable?.() ?? null;
    const kick = this.buttons.get('kick')!;
    kick.hidden = k === null;
    this.kickBusy = k?.busy ?? false;
    set('kick', k === null || k.busy || this.others().length === 0);
    if ((k === null || k.busy) && this.card?.name === 'kick') this.closeCard();
    // FG-48c: CLOSE LOBBY, the host's alone; gone (a hand-on), its card goes too.
    const closable = this.o.closable?.() ?? false;
    this.buttons.get('close')!.hidden = !closable;
    set('close', !closable);
    if (!closable && this.card?.name === 'close') this.closeCard();
    set('leave', false);
    this.countdownLine.hidden = !counting;
    if (counting) this.countdownLine.textContent = `GAME STARTS IN ${countdown} SECONDS`;
    this.showFocus();
  }

  /** A line of the room's chat (an empty one draws none, `FUN_002ba9d0` D:L160146). */
  chatLine(line: ForgeLobbyChatLine): void {
    if (line.text === '') return;
    this.addLine(`${line.from} (${line.team ? 'Team' : 'All'}): ${line.text}`, line.team ? 'is-team' : null);
  }

  /** A line of the page's own (the headset's notices), among the chat's, unformatted. */
  notice(text: string): void { this.addLine(text, 'is-notice'); }

  private addLine(text: string, cls: string | null): void {
    const li = this.doc.createElement('li');
    li.className = 'fx-lobby-line';
    if (cls) li.classList.add(cls);
    li.textContent = text;
    this.lines.append(li);
    while (this.lines.children.length > GAME_LOBBY_CHAT_LINES) this.lines.firstElementChild!.remove();
    this.lines.scrollTop = this.lines.scrollHeight;
  }

  private say(): void {
    const text = this.input.value.slice(0, CHAT_MESSAGE_CHARS);
    if (text === '') return;
    this.input.value = '';
    this.o.chat(text, this.team);
    this.chatLine({ from: this.own()?.name ?? '', text, team: this.team });
  }

  /** Whether the chat's input has the focus (the voice's DEV key is not read while typing). */
  typing(): boolean { return this.doc.activeElement === this.input; }

  setTalker(text: string): void { this.talker.textContent = text; }
  /** The seat's own talk state (the original's `can_talk` icon): the talk button lit. */
  setTalking(on: boolean): void { this.buttons.get('talk')!.classList.toggle('is-on', on); }

  // ---- the pad's focus ----

  private open(name: LobbyControl): boolean { const b = this.buttons.get(name)!; return !b.disabled && !b.hidden; }

  /**
   * FG-45's review F1: a control closed only while its own request is out (LISTED's change) keeps the focus, so the
   * focus never slides on to the next open control (LEAVE, which for the host closes the lobby) under a second Cross.
   */
  private holds(name: LobbyControl): boolean {
    if (this.buttons.get(name)!.hidden) return false;
    return (name === 'listed' && this.listedBusy) || (name === 'password' && this.passwordBusy) || (name === 'kick' && this.kickBusy);
  }

  /** The focused control, or null when none is open (a busy control that holds the focus counts). */
  focused(): LobbyControl | null {
    const n = LOBBY_CONTROLS.length;
    if (this.holds(LOBBY_CONTROLS[this.focus]!)) return LOBBY_CONTROLS[this.focus]!;
    for (let i = 0; i < n; i++) {
      const name = LOBBY_CONTROLS[(this.focus + i) % n]!;
      if (this.open(name)) return name;
    }
    return null;
  }

  /** The focus moved by `step` (+1 the next control, -1 the one before), wrapping, past a closed one. */
  focusMove(step: 1 | -1): void {
    const n = LOBBY_CONTROLS.length, from = LOBBY_CONTROLS.indexOf(this.focused() ?? LOBBY_CONTROLS[this.focus]!);
    for (let i = 1; i <= n; i++) {
      const at = (from + step * i + n * n) % n;
      if (this.open(LOBBY_CONTROLS[at]!)) { this.focus = at; break; }
    }
    this.showFocus();
  }

  /** Cross: the focused control pressed (a busy one that holds the focus presses nothing). */
  press(): void {
    const name = this.focused();
    if (name && this.open(name)) this.buttons.get(name)!.click();
  }

  private showFocus(): void {
    const on = this.focused();
    for (const name of LOBBY_CONTROLS) this.buttons.get(name)!.classList.toggle('is-focus', name === on && this.card === null);
  }

  // ---- FG-48: the cards (the password's), over the controls ----

  /** The card showing, or null (while one shows, the page routes the pad to it: `cardMove`, `cardPress`, `cardCancel`). */
  cardOpen(): LobbyCard | null { return this.card?.name ?? null; }

  private showCard(c: CardHere): void {
    this.closeCard();
    this.card = c;
    c.root.hidden = false;
    this.showCardFocus();
    this.showFocus();
  }

  /** The card closed (nothing asked). */
  closeCard(): void {
    const c = this.card;
    if (!c) return;
    this.card = null;
    c.root.hidden = true;
    for (const i of c.items()) i.classList.remove('is-focus');
    c.cancel();
    this.showFocus();
  }

  private cardItemOpen(e: HTMLElement): boolean { return !(e instanceof HTMLButtonElement && e.disabled) && !e.hidden; }

  /** The card's focus moved by `step` over its open items, wrapping. */
  cardMove(step: 1 | -1): void {
    const c = this.card;
    if (!c) return;
    const items = c.items(), n = items.length;
    for (let i = 1; i <= n; i++) {
      const at = (c.focus + step * i + n * n) % n;
      if (this.cardItemOpen(items[at]!)) { c.focus = at; break; }
    }
    this.showCardFocus();
  }

  /** Cross on the card: its focused button pressed, or its field given the keyboard's focus. */
  cardPress(): void {
    const c = this.card;
    if (!c) return;
    const item = c.items()[c.focus];
    if (!item || !this.cardItemOpen(item)) return;
    if (item instanceof HTMLInputElement) { item.focus(); return; }
    item.click();
  }

  /** Circle on the card: closed, nothing asked. */
  cardCancel(): void { this.closeCard(); }

  private showCardFocus(): void {
    const c = this.card;
    if (!c) return;
    const items = c.items();
    if (!this.cardItemOpen(items[c.focus]!)) {
      const open = items.findIndex((i) => this.cardItemOpen(i));
      if (open >= 0) c.focus = open;
    }
    items.forEach((i, at) => { i.classList.toggle('is-focus', at === c.focus); });
  }

  /** FG-48a: PASSWORD pressed -- its card shown, its field empty (a password is never kept in it). */
  private openPasswordCard(): void {
    const pc = this.passwordCard;
    pc.field.value = '';
    this.showCard({ name: 'password', root: pc.root, items: () => [pc.field, pc.set, pc.clear, pc.cancel], focus: 0, cancel: () => { pc.field.value = ''; } });
    this.drawPasswordCard();
    try { pc.field.focus(); } catch { /* no focus to give */ }
  }

  /** FG-48a: SET open for a password the server takes, CLEAR for a locked lobby. */
  private drawPasswordCard(): void {
    const pc = this.passwordCard;
    pc.set.disabled = !lobbyPasswordOk(pc.field.value);
    pc.clear.disabled = !(this.o.password?.()?.locked ?? false);
    this.showCardFocus();
  }

  /** FG-48c: CLOSE LOBBY pressed -- its card shown, the focus on CANCEL (a second Cross closes nothing). */
  private openCloseCard(): void {
    const cc = this.closeCardParts;
    this.showCard({ name: 'close', root: cc.root, items: () => [cc.close, cc.cancel], focus: 1, cancel: () => undefined });
  }

  /** FG-48b: the seats other than this page's own, in the room's order (none before the welcome). */
  private others(): GameLobbySeat[] {
    const me = this.o.me();
    return me ? (this.ev?.seats ?? []).filter((s) => s.id !== me.id) : [];
  }

  /** FG-48b: KICK pressed -- its card shown over the other seats, the first one in focus. */
  private openKickCard(): void {
    const kc = this.kickCard;
    this.drawKickCard();
    if (kc.buttons.length === 0) return;
    this.showCard({ name: 'kick', root: kc.root, items: () => [...kc.buttons, kc.cancel], focus: 0, cancel: () => undefined });
  }

  /**
   * FG-48b: the kick card's seats drawn from the room's view -- a button a seat, its room id on it -- the focus kept on the
   * seat it was on while that seat stays; the last other seat gone closes the card.
   */
  private drawKickCard(): void {
    const kc = this.kickCard;
    const c = this.card?.name === 'kick' ? this.card : null;
    const held = c ? kc.buttons[c.focus]?.dataset['seat'] ?? null : null;
    const onCancel = c !== null && c.focus >= kc.buttons.length;
    kc.buttons = this.others().map((s) => {
      const b = this.doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-lobby-btn';
      b.dataset['cardAct'] = 'seat';
      b.dataset['seat'] = String(s.id);
      b.textContent = s.name;
      b.addEventListener('click', () => { this.closeCard(); this.o.kick?.(s.id); });
      return b;
    });
    kc.seats.replaceChildren(...kc.buttons);
    if (!c) return;
    if (kc.buttons.length === 0) { this.closeCard(); return; }
    const at = held === null ? -1 : kc.buttons.findIndex((b) => b.dataset['seat'] === held);
    c.focus = onCancel ? kc.buttons.length : at >= 0 ? at : Math.min(c.focus, kc.buttons.length - 1);
    this.showCardFocus();
  }
}
