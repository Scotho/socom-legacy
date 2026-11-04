import { beforeEach, describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, GAME_LOBBY, GAME_LOBBY_CHAT_VAR, INVITE_COPY_ANIMATION, INVITE_DESCRIBE_ANIMATION, UiVarManager, ValveStore, VALVE_TYPE, WORLD_OF_SOCOM, type GameListEntry, type InviteLink, type LobbyService } from '@s2u/ui';
import {
  INVITE_COPIED_LINE, INVITE_HANDOFF_ADAPTATION, INVITE_HANDOFF_CHANNEL, INVITE_HANDOFF_LINES, INVITE_HANDOFF_WAIT_MS_ADAPTATION, INVITE_TAKEN_MARK_ADAPTATION, INVITE_TAKEN_MARK_TTL_MS_ADAPTATION, answerInvites,
  clearInviteTaken, connectInvite, copyText, endHandOff, guardInviteLogin, handOff, markInviteTaken, offerInvite, pageInvite, withInviteButton, type InviteBusy, type InviteChannel, type InviteMount,
} from '../src/inviteHost';

/**
 * LOBBY-INVITE's page half (web sprint 41, product track): the cross-tab hand-off (INVITE_HANDOFF_ADAPTATION) over a fake
 * BroadcastChannel bus, the login guard, the address's invite, the copy and its fallback, and the session's part --
 * INVITE_FLOW_ADAPTATION's SELECT UNIVERSE advance and INVITE_JOIN_ADAPTATION's start on SOCOM II ONLINE -- over a fake
 * machine walked through the login path (LOGIN, DNAS, SELECT UNIVERSE, the persona form, CONNECTING, USER AGREEMENT).
 * The screens themselves are the original's and run in `@s2u/ui`'s `inviteJoin.test.ts` over the disc's layout.
 */

const LINK: InviteLink = { mediusWorldId: 7, game: 'friday', universe: 'SOCOM' };
const flush = async (n = 20): Promise<void> => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/** One origin's BroadcastChannel: every channel of the name hears every other's message (never its own), asynchronously. */
class Bus {
  private readonly all = new Set<InviteChannel & { deliver(m: unknown): void }>();
  sent: { type: string }[] = [];
  open = (): InviteChannel => {
    const bus = this;
    const ch = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage(m: unknown): void { bus.sent.push(m as { type: string }); for (const o of bus.all) if (o !== ch) queueMicrotask(() => o.deliver(m)); },
      close(): void { bus.all.delete(ch); },
      deliver(m: unknown): void { ch.onmessage?.({ data: structuredClone(m) }); },
    };
    this.all.add(ch);
    return ch;
  };
}
const wait = (): Promise<void> => flush();

/** A tab of the game answering the channel: whether it holds a session, and what it is busy with. */
function tab(bus: Bus, id: string, state: { holds: boolean; busy: InviteBusy | null }) {
  const taken: InviteLink[] = [];
  const a = answerInvites({ open: bus.open, id, holds: () => state.holds, busy: () => state.busy, take: (l) => { taken.push(l); } });
  return { taken, close: () => a.close() };
}

describe('the hand-off (INVITE_HANDOFF_ADAPTATION): a logged-in tab of this browser takes the invite', () => {
  it('the channel, the window', () => {
    expect([INVITE_HANDOFF_CHANNEL, INVITE_HANDOFF_WAIT_MS_ADAPTATION]).toEqual(['s2u-invite', 500]);
  });

  it('taken: a tab holding a session outside a game takes it; the new tab is told so', async () => {
    const bus = new Bus();
    const other = tab(bus, 'A', { holds: true, busy: null });
    const idle = tab(bus, 'B', { holds: false, busy: null });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('taken');
    expect([other.taken, idle.taken]).toEqual([[LINK], []]);
    expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held', 'offer', 'taken']);
    expect(JSON.stringify(bus.sent)).not.toMatch(/ticket|password/i);
    expect(INVITE_HANDOFF_LINES.taken).toBe('The invite went to your open SOCOM II tab.');
  });

  it('busy in a game lobby (its socket held, or the join under way): the lobby line, nothing taken', async () => {
    const bus = new Bus();
    const other = tab(bus, 'A', { holds: true, busy: 'lobby' });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy-lobby');
    expect(other.taken).toEqual([]);
    expect(INVITE_HANDOFF_LINES['busy-lobby']).toBe('Your open SOCOM II tab is in a game lobby: leave it there, then open the link again.');
  });

  it('busy in a match: the match line', async () => {
    const bus = new Bus();
    tab(bus, 'A', { holds: true, busy: 'match' });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy-match');
    expect(INVITE_HANDOFF_LINES['busy-match']).toBe('Your open SOCOM II tab is in a game: finish there, then open the link again.');
  });

  it('one tab free and one busy: the free one takes it', async () => {
    const bus = new Bus();
    tab(bus, 'A', { holds: true, busy: 'match' });
    const free = tab(bus, 'B', { holds: true, busy: null });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('taken');
    expect(free.taken).toEqual([LINK]);
  });

  it('no tab answers (none holds a session): null -- this tab goes on to LOGIN', async () => {
    const bus = new Bus();
    tab(bus, 'A', { holds: false, busy: null });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBeNull();
  });

  it('no BroadcastChannel in the browser: null at once', async () => {
    expect(await handOff(LINK, { open: () => null, id: 'N', wait })).toBeNull();
  });

  it('the review\'s 4: a tab that answered held and then declined the offer still holds a session -- busy, never null (no login)', async () => {
    const bus = new Bus();
    const raw = bus.open();                                                // answers every ping held{busy:null}, takes nothing
    raw.onmessage = (e) => {
      const m = e.data as { type: string; from: string; nonce: string };
      if (m.type === 'ping') raw.postMessage({ v: 1, type: 'held', to: m.from, from: 'D', nonce: m.nonce, busy: null });
    };
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy');
    expect(INVITE_HANDOFF_LINES.busy).toBe('Your open SOCOM II tab is busy: leave it there, then open the link again.');
  });

  it('the review\'s 7: the address is consumed only when another tab took the invite; a busy outcome keeps it for a reload', () => {
    let consumed = 0;
    const m = { consumed: () => { consumed++; } };
    expect(endHandOff(m, 'busy-lobby')).toBe(INVITE_HANDOFF_LINES['busy-lobby']);
    expect(endHandOff(m, 'busy-match')).toBe(INVITE_HANDOFF_LINES['busy-match']);
    expect(endHandOff(m, 'busy')).toBe(INVITE_HANDOFF_LINES.busy);
    expect(consumed).toBe(0);
    expect(endHandOff(m, 'taken')).toBe(INVITE_HANDOFF_LINES.taken);
    expect(consumed).toBe(1);
  });
});

describe('the login guard: never a login while another tab holds the session', () => {
  const svc = (log: string[]): LobbyService => ({
    login: (q) => { log.push(`login ${q.name}`); return Promise.resolve({ status: 0, ticket: 'T' }); },
    register: (q) => { log.push(`register ${q.name}`); return Promise.resolve({ status: 0 }); },
    logout: () => Promise.resolve({ status: 0 }),
  });
  const mount = (bus: Bus, pending = true): InviteMount => ({
    link: LINK, id: 'N', open: bus.open, wait, pending: () => pending, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true),
  });

  it('a tab that logged in after the start answers at the login: the login and the registration are never sent; the invite goes there', async () => {
    const bus = new Bus();
    const other = tab(bus, 'A', { holds: true, busy: null });
    const log: string[] = [], handed: string[] = [];
    const g = guardInviteLogin(svc(log), mount(bus), (h) => { handed.push(h); });
    let settled = false;
    void g.login({ name: 'socomc', password: 'pw' }).then(() => { settled = true; });
    await flush(60);
    void g.register({ name: 'socomc', password: 'pw' });
    await flush(60);
    expect([log, handed, settled, other.taken.length]).toEqual([[], ['taken', 'taken'], false, 2]);
  });

  it('the review\'s 5: two invite tabs at their logins at once (each holding, state 7) -- exactly one logs in, the other is told its tab is busy', async () => {
    const bus = new Bus();
    const logA: string[] = [], logB: string[] = [], handed: string[] = [];
    const two = (id: string, log: string[]) => {
      answerInvites({ open: bus.open, id, holds: () => true, busy: () => null, take: () => {} });
      const m: InviteMount = { link: LINK, id, open: bus.open, wait, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true) };
      return guardInviteLogin(svc(log), m, (h) => { handed.push(`${id} ${h}`); });
    };
    const a = two('A', logA), b = two('B', logB);
    void a.login({ name: 'a', password: 'p' });
    void b.login({ name: 'b', password: 'p' });
    await flush(80);
    expect([logA, logB, handed]).toEqual([['login a'], [], ['B busy']]);
  });

  it('the re-review\'s A: the higher id asks first, the lower id pings while it asks -- the dropped ping is answered when the asker goes on; one login', async () => {
    const bus = new Bus();
    const logA: string[] = [], logB: string[] = [], handed: string[] = [];
    const gate = (): { wait: () => Promise<void>; open: () => void } => {
      let release!: () => void;
      const p = new Promise<void>((ok) => { release = ok; });
      return { wait: () => p, open: () => release() };
    };
    const gA = gate(), gB = gate();
    const two = (id: string, log: string[], w: () => Promise<void>) => {
      answerInvites({ open: bus.open, id, holds: () => false, busy: () => null, take: () => {} });   // neither connected yet
      const m: InviteMount = { link: LINK, id, open: bus.open, wait: w, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true) };
      return guardInviteLogin(svc(log), m, (h) => { handed.push(`${id} ${h}`); });
    };
    const b = two('B', logB, gB.wait), a = two('A', logA, gA.wait);
    void b.login({ name: 'b', password: 'p' });                            // B asks first
    await flush(20);
    void a.login({ name: 'a', password: 'p' });                            // A pings while B's window is open: B drops it, kept
    await flush(20);
    gB.open();                                                             // B's ask ends with none: B goes on and answers A's kept ping
    await flush(40);
    gA.open();
    await flush(40);
    expect([logB, logA, handed]).toEqual([['login b'], [], ['A busy']]);
  });

  it('no tab answers: the login and the registration go to the service; with no invite pending, no ping at all', async () => {
    const bus = new Bus();
    const log: string[] = [];
    const g = guardInviteLogin(svc(log), mount(bus), () => {});
    expect(await g.login({ name: 'a', password: 'b' })).toEqual({ status: 0, ticket: 'T' });
    expect(await g.register({ name: 'a', password: 'b' })).toEqual({ status: 0 });
    expect(log).toEqual(['login a', 'register a']);
    const quiet = new Bus();
    await guardInviteLogin(svc(log), mount(quiet, false), () => {}).login({ name: 'c', password: 'd' });
    expect(quiet.sent).toEqual([]);
  });
});

describe('the address\'s invite and the copy', () => {
  const win = (search: string) => {
    const writes: string[] = [];
    const w = {
      location: { origin: 'https://n.example', pathname: '/main/online/dnas', search, hash: '#x' },
      history: { state: { s2uMenuRoute: { depth: 2 } }, replaceState(_s: unknown, _u: string, url: string) { writes.push(url); w.location.search = url.slice(url.indexOf('?') >= 0 ? url.indexOf('?') : url.indexOf('#'), url.indexOf('#')); } },
      navigator: { clipboard: { writeText: () => Promise.resolve() } },
      document: null,
    };
    return { w, writes };
  };

  it('read once from the address; consumed strips the three keys, the path, the other keys, the fragment and the router\'s state kept', () => {
    const { w, writes } = win('?devmode&invite=7&game=friday&universe=SOCOM');
    const m = pageInvite(w.location.search, w as never, { base: '/', dev: true });
    expect([m.link, m.pending()]).toEqual([LINK, true]);
    m.consumed();
    expect([writes, m.pending()]).toEqual([['/main/online/dnas?devmode#x'], false]);
    expect(m.href(LINK)).toBe('https://n.example/main/online?devmode&invite=7&game=friday&universe=SOCOM');
  });

  it('the Clipboard API first; refused, the copy command over a hidden field; both refused, false', async () => {
    const field = { value: '', style: {} as Record<string, string>, select() {}, setAttribute() {}, remove() { removed++; } };
    let removed = 0, copied = '';
    const doc = (ok: boolean) => ({ body: { append() {} }, createElement: () => field, execCommand: (c: string) => { copied = `${c} ${field.value}`; return ok; } });
    expect(await copyText('L', { clipboard: { writeText: () => Promise.resolve() } }, doc(true) as never)).toBe(true);
    expect(await copyText('L', { clipboard: { writeText: () => Promise.reject(new Error('NotAllowed')) } }, doc(true) as never)).toBe(true);
    expect([copied, removed]).toEqual(['copy L', 1]);
    expect(await copyText('L', {}, doc(false) as never)).toBe(false);
  });
});

// ---- INVITE-DECLINE (web sprint 41's follow-up, product track) ----

const accounts = (log: string[]): LobbyService => ({
  login: (q) => { log.push(`login ${q.name}`); return Promise.resolve({ status: 0, ticket: 'T' }); },
  register: (q) => { log.push(`register ${q.name}`); return Promise.resolve({ status: 0 }); },
  logout: () => Promise.resolve({ status: 0 }),
});

describe('INVITE-DECLINE: a holder may decline an offer (`take` returns false)', () => {
  it('take false: no `taken` posted; the asker, held and not taken, ends busy and never logs in', async () => {
    const bus = new Bus();
    const offered: InviteLink[] = [];
    answerInvites({ open: bus.open, id: 'A', holds: () => true, busy: () => null, take: (l) => { offered.push(l); return false; } });   // a holder's own decline
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy');
    expect(offered).toEqual([LINK]);
    expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held', 'offer']);
    const log: string[] = [], handed: string[] = [];
    const m: InviteMount = { link: LINK, id: 'M', open: bus.open, wait, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true) };
    void guardInviteLogin(accounts(log), m, (h) => { handed.push(h); }).login({ name: 'a', password: 'p' });
    await flush(60);
    expect([log, handed]).toEqual([[], ['busy']]);
  });

  // LATER 89 / 70: the layer that refuses a holder no longer free is the offer's own `busy()`, asked again at the offer --
  // free at its `held` (null), busy at the offer ('asking': the console launcher's sign-in opened between), `take` is
  // never asked, no `taken` is posted, and the asker ends busy.
  it('the offer-time busy(): a holder free at its held and busy at the offer is never asked to take', async () => {
    const bus = new Bus();
    let calls = 0;                                                              // the held's answer, then the offer's
    let asked = 0;
    const take = (): boolean => { asked++; return true; };
    answerInvites({ open: bus.open, id: 'A', holds: () => true, busy: () => (calls++ === 0 ? null : 'asking'), take });
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy');
    expect(asked, 'take never asked').toBe(0);
    expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held', 'offer']);
  });

  it('take true, or void: taken, as before', async () => {
    for (const answer of [true, undefined]) {
      const bus = new Bus();
      answerInvites({ open: bus.open, id: 'A', holds: () => true, busy: () => null, take: () => answer });
      expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('taken');
      expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held', 'offer', 'taken']);
    }
  });
});

/** A tab's window: its address and its BroadcastChannel on `bus`. */
function tabWin(search: string, bus: Bus) {
  return {
    location: { origin: 'https://n.example', pathname: '/main/online', search, hash: '' },
    history: { state: null, replaceState() {} },
    navigator: {}, document: null,
    BroadcastChannel: function BroadcastChannel() { return bus.open(); },
  };
}
const INVITE_SEARCH = '?invite=7&game=friday&universe=SOCOM';
const T0 = 1_000_000;
/** `pageInvite` at `now` on the fake bus's quick window (the hand-off's 500 ms waits as microtasks). */
const mounted = (search: string, bus: Bus, now?: number): InviteMount =>
  Object.assign(pageInvite(search, tabWin(search, bus) as never, { base: '/', ...(now === undefined ? {} : { now: () => now }) }), { wait });
/** A raw tab answering every ping held{busy}. */
const holder = (bus: Bus, id: string, busy: InviteBusy | 'asking' | null): void => {
  const raw = bus.open();
  raw.onmessage = (e) => {
    const m = e.data as { type: string; from: string; nonce: string };
    if (m.type === 'ping') raw.postMessage({ v: 1, type: 'held', to: m.from, from: id, nonce: m.nonce, busy });
  };
};

describe('INVITE_TAKEN_MARK_ADAPTATION: a page that took the invite never offers it again', () => {
  beforeEach(() => { clearInviteTaken(); });

  it('the adaptation and its window named', () => {
    expect(INVITE_TAKEN_MARK_TTL_MS_ADAPTATION).toBe(15000);
    expect(INVITE_TAKEN_MARK_ADAPTATION).toMatch(/in memory/);
  });

  it('the mark equal and fresh: took -- no offer; the login pings only, free and asking answers do not block it; the service itself kept', async () => {
    const bus = new Bus();
    const free = tab(bus, 'A', { holds: true, busy: null });               // would take it, were it offered
    holder(bus, 'Q', 'asking');
    markInviteTaken(LINK, T0);
    const m = mounted(INVITE_SEARCH, bus, T0 + INVITE_TAKEN_MARK_TTL_MS_ADAPTATION - 1);
    expect([m.link, m.pending(), m.took]).toEqual([LINK, true, true]);
    expect(await offerInvite(m)).toBeNull();
    expect(bus.sent).toEqual([]);
    const log: string[] = [], handed: string[] = [];
    const svc = accounts(log);
    expect(guardInviteLogin(svc, m, (h) => { handed.push(h); })).toBe(svc);
    expect(await svc.login({ name: 'a', password: 'p' })).toEqual({ status: 0, ticket: 'T' });
    expect(await svc.register({ name: 'a', password: 'p' })).toEqual({ status: 0 });
    await flush(60);
    expect([free.taken, log, handed]).toEqual([[], ['login a', 'register a'], []]);
    expect(bus.sent.map((x) => x.type)).toEqual(['ping', 'held', 'held', 'ping', 'held', 'held']);   // a ping before each, never an offer
  });

  it('took, and a tab in a game lobby or a match answers: the login and the registration stop with its line, never sent, never an offer', async () => {
    for (const [busy, line] of [['lobby', 'busy-lobby'], ['match', 'busy-match']] as const) {
      const bus = new Bus();
      holder(bus, 'B', busy);
      markInviteTaken(LINK, T0);
      const m = mounted(INVITE_SEARCH, bus, T0);
      expect(m.took).toBe(true);
      const log: string[] = [], handed: string[] = [];
      const svc = guardInviteLogin(accounts(log), m, (h) => { handed.push(h); });
      void svc.login({ name: 'a', password: 'p' });
      await flush(60);
      void svc.register({ name: 'a', password: 'p' });
      await flush(60);
      expect([log, handed]).toEqual([[], [line, line]]);
      expect(bus.sent.map((x) => x.type)).not.toContain('offer');
    }
  });

  it('an expired mark (15 s or older): cleared and ignored, the hand-off runs', async () => {
    const bus = new Bus();
    const free = tab(bus, 'A', { holds: true, busy: null });
    markInviteTaken(LINK, T0);
    const m = mounted(INVITE_SEARCH, bus, T0 + INVITE_TAKEN_MARK_TTL_MS_ADAPTATION);
    expect(m.took).toBe(false);
    expect(await offerInvite(m)).toBe('taken');
    expect(free.taken).toEqual([LINK]);
  });

  it('a different mark: cleared and ignored, the hand-off runs', async () => {
    const bus = new Bus();
    const free = tab(bus, 'A', { holds: true, busy: null });
    markInviteTaken({ ...LINK, mediusWorldId: 99 }, T0);
    const m = mounted(INVITE_SEARCH, bus, T0);
    expect(m.took).toBe(false);
    expect(mounted('?invite=99&game=friday', bus, T0).took).toBe(false);   // cleared, not left for another
    expect(await offerInvite(m)).toBe('taken');
    expect(free.taken).toEqual([LINK]);
  });

  it('used once: a second mount does not see it; nor one after an address without an invite', () => {
    const bus = new Bus();
    markInviteTaken(LINK, T0);
    expect(mounted(INVITE_SEARCH, bus, T0).took).toBe(true);
    expect(mounted(INVITE_SEARCH, bus, T0).took).toBe(false);
    markInviteTaken(LINK, T0);
    expect(mounted('', bus, T0).took).toBe(false);
    expect(mounted(INVITE_SEARCH, bus, T0).took).toBe(false);
  });

  it('clearInviteTaken (a START that never mounts): the mark gone', () => {
    markInviteTaken(LINK, T0);
    clearInviteTaken();
    expect(mounted(INVITE_SEARCH, new Bus(), T0).took).toBe(false);
  });

  it('two free launchers: the first takes the invite and marks it, its front end mounts on the address -- never re-offered; one login, in the first', async () => {
    const bus = new Bus();
    const launcher = (id: string) => {
      const started: string[] = [];
      let search = '';
      const a = answerInvites({ open: bus.open, id, holds: () => true, busy: () => null, take: (l) => {
        markInviteTaken(l);                                                  // INVITE-FOLLOW: marked before START
        search = `?invite=${l.mediusWorldId}&game=${l.game}&universe=${l.universe ?? ''}`;
        started.push(search);
        return true;
      } });
      return { started, search: () => search, close: () => a.close() };
    };
    const one = launcher('L1'), two = launcher('L2');
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('taken');
    expect([one.started, two.started]).toEqual([[INVITE_SEARCH], []]);
    one.close();                                                           // START: the launcher's answer gone, its front end mounting
    const sent = bus.sent.length;
    const m = mounted(one.search(), bus);                                  // the same document, the clock's own time
    expect(m.took).toBe(true);
    expect(await offerInvite(m)).toBeNull();
    const log: string[] = [];
    await guardInviteLogin(accounts(log), m, () => {}).login({ name: 'a', password: 'p' });
    await flush(60);
    expect([bus.sent.slice(sent).map((x) => x.type), two.started, log]).toEqual([['ping', 'held'], [], ['login a']]);   // the free L2 answers, does not block
    // Without the mark (the defect, INVITE-START's F1): the mounting front end offers again and the second launcher takes it.
    const unmarked = mounted(INVITE_SEARCH, bus);
    expect(await offerInvite(unmarked)).toBe('taken');
    expect(two.started).toEqual([INVITE_SEARCH]);
  });
});

// ---- INVITE-SKIP (web sprint 41's follow-up, INVITE-FOLLOW's F3; product track) ----

describe('INVITE-SKIP: a holder that cannot take an invite now answers \'asking\'; the offer goes to one that can', () => {
  beforeEach(() => { clearInviteTaken(); });

  /** A holder answering through `answerInvites`, its `busy()` as given; the offers it was handed. */
  const answering = (bus: Bus, id: string, busy: InviteBusy | 'asking' | null) => {
    const offered: InviteLink[] = [];
    answerInvites({ open: bus.open, id, holds: () => true, busy: () => busy, take: (l) => { offered.push(l); } });
    return offered;
  };
  const helds = (bus: Bus) => (bus.sent as unknown as { type: string; from: string; busy?: unknown }[]).filter((x) => x.type === 'held').map((x) => `${x.from} ${String(x.busy)}`);

  it('the adaptation names \'asking\' -- holds a session, cannot take now', () => {
    expect(INVITE_HANDOFF_ADAPTATION).toMatch(/asking/);
  });

  it('an \'asking\' holder answering first and a free one: the offer goes to the free one, taken; the asking one is offered nothing', async () => {
    const bus = new Bus();
    const asking = answering(bus, 'L', 'asking');                         // the console launcher mid-extraction, an overlay up
    const free = answering(bus, 'G', null);                                // a free game tab
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('taken');
    expect([asking, free]).toEqual([[], [LINK]]);
    expect(helds(bus)).toEqual(['L asking', 'G null']);                    // `answerInvites` posts the holder's busy() unchanged
    expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held', 'held', 'offer', 'taken']);
    expect((bus.sent[3] as unknown as { to: string }).to).toBe('G');
  });

  it('only an \'asking\' holder: no offer; the asker ends busy and never logs in', async () => {
    const bus = new Bus();
    const asking = answering(bus, 'L', 'asking');
    expect(await handOff(LINK, { open: bus.open, id: 'N', wait })).toBe('busy');
    expect(bus.sent.map((m) => m.type)).toEqual(['ping', 'held']);
    const log: string[] = [], handed: string[] = [];
    const m: InviteMount = { link: LINK, id: 'M', open: bus.open, wait, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true) };
    void guardInviteLogin(accounts(log), m, (h) => { handed.push(h); }).login({ name: 'a', password: 'p' });
    void guardInviteLogin(accounts(log), { ...m, id: 'R' }, (h) => { handed.push(h); }).register({ name: 'a', password: 'p' });
    await flush(80);
    expect([asking, log, handed]).toEqual([[], [], ['busy', 'busy']]);
  });

  it('the took path\'s ping-only check: an \'asking\' answer does not block -- the login and the registration go on, never an offer', async () => {
    const bus = new Bus();
    const asking = answering(bus, 'L', 'asking');
    markInviteTaken(LINK, T0);
    const m = mounted(INVITE_SEARCH, bus, T0 + 1);
    expect(m.took).toBe(true);
    const log: string[] = [], handed: string[] = [];
    const svc = guardInviteLogin(accounts(log), m, (h) => { handed.push(h); });
    expect(await svc.login({ name: 'a', password: 'p' })).toEqual({ status: 0, ticket: 'T' });
    expect(await svc.register({ name: 'a', password: 'p' })).toEqual({ status: 0 });
    expect([asking, log, handed]).toEqual([[], ['login a', 'register a'], []]);
    expect(bus.sent.map((x) => x.type)).toEqual(['ping', 'held', 'ping', 'held']);
  });
});

// ---- the session's part over a fake machine ----

const SERVER_SELECT = 'dlgNetServerSelect.rdr';
const game = (gameName: string, id: number): GameListEntry => ({
  status: 0, mediusWorldId: id, playerCount: 2, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 2, genericField2: 300,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: '44'.padEnd(512, '0'), endOfList: true,
});
const names = Object.fromEntries(Object.entries(DIALOG_EVENTS).map(([k, v]) => [v, k]));

/** The session's surroundings, each a value the test sets: the dialog shown, the lobby, the universes, the rooms, the game held. */
function session(o: { link?: InviteLink | null; universes?: { name: string; status: number }[] } = {}) {
  const state = { dialog: 'dlgNetLogin.rdr', lobbyState: 0, ticket: null as string | null, rooms: [] as { mediusWorldId: number; lobbyName: string }[], held: null as GameListEntry | null, socket: false, blocked: false, round: null as number | null };
  const started: string[] = [], events: { event: string; text: string | null }[] = [], joined: string[] = [], consumed: number[] = [], copies: string[] = [], nodes: string[] = [];
  const uiVars = new UiVarManager();
  const unis = o.universes ?? [{ name: 'SOCOM', status: 1 }];
  uiVars.add('SERVER_LIST', { type: 'array', value: unis.map((u) => ({ type: 'array', value: [{ type: 'string', value: u.name }, { type: 'int', value: 0 }, { type: 'int', value: 0 }, { type: 'int', value: 0 }] })) }, 1);
  const valves = new ValveStore();
  let pending = (o.link === undefined ? LINK : o.link) !== null;
  let copyOk = true;
  const mount: InviteMount = {
    link: o.link === undefined ? LINK : o.link, id: 'S', open: () => null, wait, pending: () => pending,
    consumed: () => { pending = false; consumed.push(1); }, href: (l) => `https://n/main/online?invite=${l.mediusWorldId}&game=${l.game}`, copy: (t) => { copies.push(t); return Promise.resolve(copyOk); },
  };
  const gates: ((b: { dialog: string; animation: string }) => boolean)[] = [];
  const shell = { get currentName() { return state.dialog; }, switchState: -1, screen: null, popups: { shown: () => false } };
  const menu = {};
  const lobby = { get up() { return state.lobbyState !== 0; }, state: () => state.lobbyState, ticket: () => state.ticket };
  const s = connectInvite({ setBindingGate: (_o: string, g: unknown) => { gates.push(g as never); } } as never, {
    mount, uiVars, valves: () => valves, event: (k, text) => { events.push({ event: names[k]!, text }); },
    machine: () => ({ states: { top: () => menu }, menu, queue: { count: 0 }, shell: () => shell }) as never,
    parts: { current: { widgetHost: { animation: (n: string, a: string | null) => { started.push(a === null ? n : `${n}(${a})`); return true; } }, nodeCommand: (c: { node: string; loc: number; opcodeByte: number }) => { nodes.push(`${c.node} op${c.opcodeByte - 0xe8} #${c.loc}`); return { answer: true }; } }, o: { captions: null } } as never,
    universes: { entriesEnded: true, find: (n: string) => unis.find((u) => u.name === n) ? { universeStatus: unis.find((u) => u.name === n)!.status } : null } as never,
    lobby: () => lobby,
    briefing: {
      service: { clearGameListFilter: () => Promise.resolve({ status: 0 }), gameList: () => Promise.resolve([game('friday$~Bravo', 7)]) },
      commands: { joinRoomForRandomGame: (n: string) => { joined.push(n); return true; } },
    } as never,
    world: { commands: { rooms: () => state.rooms, clan: { clanId: -1 } } } as never,
    gameLobby: { commands: { randomGameFound: (g: GameListEntry) => { state.held = g; }, game: () => state.held }, socket: { link: () => (state.socket ? {} : null) } } as never,
    match: () => ({ get blocked() { return state.blocked; }, roundClock: () => state.round }) as never,
  });
  const frames = (n = 40): void => { for (let i = 0; i < n; i++) s.frame(); };
  const go = (dialog: string, n = 40): void => { state.dialog = dialog; frames(n); };
  return { s, state, started, events, joined, consumed, copies, nodes, uiVars, valves, gates, go, frames, setCopy: (ok: boolean) => { copyOk = ok; } };
}

/** The game's own login, as the lobby client answers it: a refused password back to the persona form, a success logged in. */
function login(t: ReturnType<typeof session>, answer: 'ok' | 'refused'): void {
  t.go('dlgNetConnect.rdr');
  t.state.lobbyState = 7;                                                  // STATE: ACCOUNT LOGIN
  t.frames();
  if (answer === 'refused') { t.state.lobbyState = 0; t.go('dlgNetPlayerName.rdr'); return; }   // MP_INVALID_PASSWORD #545: exit_connect_screen
  t.state.lobbyState = 11; t.state.ticket = 'T';
  t.go('dlgUsagePolicy.rdr');
}

describe('INVITE_FLOW_ADAPTATION and the join over the login path (a fake machine)', () => {
  it('logged out -> LOGIN -> DNAS -> SELECT UNIVERSE advanced to the link\'s universe once -> the persona form untouched -> CONNECTING -> USER AGREEMENT -> the join on SOCOM II ONLINE', async () => {
    const t = session({ universes: [{ name: 'Other', status: 1 }, { name: 'SOCOM', status: 1 }] });
    t.go('dlgNetLogin.rdr'); t.go('dlgNetAuthenticate.rdr'); t.go(SERVER_SELECT);
    expect(t.started).toEqual(['select_server(SOCOM)']);
    t.go('dlgNetPlayerName.rdr');
    t.go(SERVER_SELECT);                                                   // TRIANGLE back: a real choice now
    t.go('dlgNetPlayerName.rdr');
    expect(t.started).toEqual(['select_server(SOCOM)']);
    login(t, 'ok');
    expect(t.started).toEqual(['select_server(SOCOM)']);                  // nothing before SOCOM II ONLINE
    t.go(WORLD_OF_SOCOM, 5);
    expect(t.started).toEqual(['select_server(SOCOM)']);                  // the room list not answered yet
    t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.frames();
    expect(t.started).toEqual(['select_server(SOCOM)', 'join_random_game']);
    expect(t.s.searchArmed()).toBe(true);                                  // JoinMPGame(RANDOM): the invite's search, not AUTOPLAY's
    expect(t.consumed).toEqual([1]);                                       // the address stripped once the join starts
    await flush(40);
    expect([t.state.held?.gameName, t.events, t.joined]).toEqual(['friday$~Bravo', [{ event: 'MP_RANDOM_GAME_FOUND', text: null }], ['Bravo']]);
    expect(t.s.searchArmed()).toBe(false);                                 // a later AUTOPLAY is AUTOPLAY's
    t.go(GAME_LOBBY);
    t.go(WORLD_OF_SOCOM);
    expect(t.started.filter((n) => n === 'join_random_game')).toHaveLength(1);
  });

  it('SELECT UNIVERSE: the only universe up when the link\'s is not listed; two up and none named: no advance', () => {
    const one = session({ link: { ...LINK, universe: 'Gone' }, universes: [{ name: 'A', status: 0 }, { name: 'B', status: 1 }] });
    one.go(SERVER_SELECT);
    expect(one.started).toEqual(['select_server(B)']);
    const two = session({ link: { ...LINK, universe: null }, universes: [{ name: 'A', status: 1 }, { name: 'B', status: 1 }] });
    two.go(SERVER_SELECT);
    expect(two.started).toEqual([]);
  });

  it('a new account (the register question\'s YES, its registration, its login): the invite kept, then the join', () => {
    const t = session();
    t.go(SERVER_SELECT); t.go('dlgNetPlayerName.rdr'); t.go('dlgNetConnect.rdr');
    t.state.lobbyState = 10; t.frames();                                   // STATE: LOGIN FAILURE -- the register question
    t.state.lobbyState = 3; t.frames();                                    // STATE: ACCOUNT REGISTRATION
    expect(t.consumed).toEqual([]);
    login(t, 'ok');
    t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect(t.started.at(-1)).toBe('join_random_game');
  });

  it('a failed password, then its retry: the invite kept across the refusal, used after the first success', () => {
    const t = session();
    t.go(SERVER_SELECT); t.go('dlgNetPlayerName.rdr');
    login(t, 'refused');
    expect([t.consumed, t.started]).toEqual([[], ['select_server(SOCOM)']]);
    login(t, 'refused');
    login(t, 'ok');
    t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect(t.started).toEqual(['select_server(SOCOM)', 'join_random_game']);
  });

  it('no invite: no advance and no join; JoinMPGame(RANDOM) stays AUTOPLAY\'s', () => {
    const t = session({ link: null });
    t.go(SERVER_SELECT); login(t, 'ok');
    t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect([t.started, t.s.searchArmed()]).toEqual([[], false]);
  });

  it('an invite handed over by another tab while this one is logged in on SOCOM II ONLINE: straight to the join', () => {
    const t = session({ link: null });
    t.state.lobbyState = 11; t.state.ticket = 'T'; t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect(t.s.holds()).toBe(true);
    expect(t.s.take(LINK)).toBe(true);
    t.frames();
    expect(t.started).toEqual(['join_random_game']);
  });

  it('busy: a game lobby or a join under way is "lobby", a match is "match"; outside a game, none; no session, nothing held', () => {
    const t = session({ link: null });
    expect(t.s.holds()).toBe(false);
    t.state.lobbyState = 7;
    expect(t.s.holds()).toBe(true);                                        // a login under way holds it too
    t.state.lobbyState = 11; t.state.ticket = 'T';
    expect(t.s.busy()).toBeNull();
    t.state.held = game('friday$~Bravo', 7);
    expect(t.s.busy()).toBeNull();                                         // the review's 2: a refused JoinGame leaves the game held, the state back at 11
    t.state.lobbyState = 15;
    expect(t.s.busy()).toBe('lobby');                                      // JoinGame under way (state 15)
    t.state.lobbyState = 17;
    expect(t.s.busy()).toBe('lobby');                                      // the game joined (state 17)
    t.state.lobbyState = 11; t.state.socket = true;
    expect(t.s.busy()).toBe('lobby');                                      // the GAME LOBBY's socket
    t.state.socket = false; t.state.blocked = true;
    expect(t.s.busy()).toBe('match');                                      // the match's load
    t.state.blocked = false; t.state.round = 120;
    expect(t.s.busy()).toBe('match');                                      // a round under way
  });

  it('the review\'s 3: the invite\'s refusal is claimed only for the invited world while its join stands; after it ends another way, the game\'s own', async () => {
    const t = session();
    t.state.lobbyState = 11; t.state.ticket = 'T'; t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect(t.s.searchArmed()).toBe(true);
    await flush(40);                                                       // found, the room joined: the invite's join stands
    expect(t.s.refused(-978, 9)).toBe(false);                              // another world's refusal: the game's own
    t.state.lobbyState = 0x13; t.frames(2);                                // JoinChannel
    t.state.lobbyState = 11; t.frames(2);                                  // the room refused: back at 11 on SOCOM II ONLINE
    expect(t.s.refused(-978, 7)).toBe(false);                              // a later game-list join's wrong password: MP_INVALID_PASSWORD, the game's
  });

  it('the review\'s 3: while the invite\'s join stands its own refusal is claimed; the session ending ends it', async () => {
    const t = session();
    t.state.lobbyState = 11; t.state.ticket = 'T'; t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    t.s.searchArmed();
    await flush(40);
    t.state.lobbyState = 15; t.frames(2);
    expect(t.s.refused(-948, 7)).toBe(true);                               // the invited world, its join standing: "Game Full or Locked"
    t.s.searchArmed();
    const u = session();
    u.state.lobbyState = 11; u.state.ticket = 'T'; u.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    u.go(WORLD_OF_SOCOM);
    u.s.searchArmed();
    await flush(40);
    u.state.lobbyState = 0; u.state.ticket = null; u.frames(2);           // the session ended
    expect(u.s.refused(-948, 7)).toBe(false);
  });

  it('the review\'s 6: an offer while the invite\'s join_random_game is under way is declined; the search stays the first invite\'s', async () => {
    const t = session();
    t.state.lobbyState = 11; t.state.ticket = 'T'; t.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    t.go(WORLD_OF_SOCOM);
    expect(t.started).toEqual(['join_random_game']);
    expect(t.s.busy()).toBe('lobby');                                      // answered busy: the offerer is told so
    expect(t.s.take({ mediusWorldId: 99, game: 'other', universe: null })).toBe(false);   // take's own return: false, declined (answerInvites posts no `taken` on it, INVITE-DECLINE)
    expect(t.s.searchArmed()).toBe(true);                                  // still the invite's search, never AUTOPLAY's
    await flush(40);
    expect(t.state.held?.gameName).toBe('friday$~Bravo');
  });

  it('the re-review\'s B: a join_random_game that never reaches JoinMPGame(RANDOM) leaves no stuck "lobby" -- the session ending, the screen left, or its wait run out', () => {
    const lost = session();
    lost.state.lobbyState = 11; lost.state.ticket = 'T'; lost.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    lost.go(WORLD_OF_SOCOM);
    expect(lost.s.busy()).toBe('lobby');                                   // armed
    lost.state.lobbyState = 0; lost.state.ticket = null; lost.frames(2);  // the session lost
    expect([lost.s.busy(), lost.s.searchArmed()]).toEqual([null, false]);

    const left = session();
    left.state.lobbyState = 11; left.state.ticket = 'T'; left.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    left.go(WORLD_OF_SOCOM);
    left.go('dlgFriendList.rdr', 2);                                       // the screen left before the row ran
    expect([left.s.busy(), left.s.searchArmed()]).toEqual([null, false]);

    const stuck = session();
    stuck.state.lobbyState = 11; stuck.state.ticket = 'T'; stuck.state.rooms = [{ mediusWorldId: 2, lobbyName: 'Bravo' }];
    stuck.go(WORLD_OF_SOCOM);
    stuck.frames(200);                                                     // a popup cancelled: JoinMPGame(RANDOM) never asked
    expect([stuck.s.busy(), stuck.s.searchArmed(), stuck.started.filter((n) => n === 'join_random_game').length]).toEqual([null, false, 1]);
  });

  it('the GAME LOBBY\'s button: its CROSS copies the link (the game held, its drawn name, the universe) and says so in the text panel', async () => {
    const t = session({ link: null });
    t.state.held = game('friday$~Bravo', 7);
    t.uiVars.set(t.uiVars.add('SERVER_NAME', null, 2), { type: 'string', value: 'SOCOM' });
    expect(t.gates[0]!({ dialog: GAME_LOBBY, animation: INVITE_COPY_ANIMATION })).toBe(true);
    expect(t.gates[0]!({ dialog: GAME_LOBBY, animation: 'ready_anim' })).toBe(false);
    await flush();
    expect(t.copies).toEqual(['https://n/main/online?invite=7&game=friday']);
    const panel = (): string => JSON.stringify(t.uiVars.find(GAME_LOBBY_CHAT_VAR)?.value);
    expect(panel()).toContain(INVITE_COPIED_LINE);
    t.setCopy(false);
    t.gates[0]!({ dialog: GAME_LOBBY, animation: INVITE_COPY_ANIMATION });
    await flush();
    expect(panel()).toContain('https://n/main/online?invite=7');           // refused: the link itself in the panel
  });

  it('the button focused (its ONACTIVATE): DescriptionText.op1(#486) through the built dialog, as READY\'s OnReadystart writes its own', () => {
    const t = session({ link: null });
    expect(t.gates[0]!({ dialog: GAME_LOBBY, animation: INVITE_DESCRIBE_ANIMATION })).toBe(true);
    expect(t.nodes).toEqual(['DescriptionText op1 #486']);
    expect(t.gates[0]!({ dialog: 'dlgWorldOfSOCOM.rdr', animation: INVITE_DESCRIBE_ANIMATION })).toBe(false);
  });

  it('the button only on the online GAME LOBBY (ComeFromLan 0)', () => {
    const design = { libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], objects: [], scripts: [], models: [], dropped: [], controls: [
      { name: 'PlayerReady', type: 'BUTTON', x: 16, y: 153, opacity: 1, childOf: null, widget: { type: 'BUTTON', uivar: null, button: { size: [150, 30], offset: [10, 28], scale: 1, caption: '_347_READY_MSG', normal: {}, active: {}, pressed: {}, disabled: {}, hcentered: false, font: null, bindings: [] } } },
    ] };
    const valves = new ValveStore();
    const look = withInviteButton(() => design as never, () => valves);
    expect(look(GAME_LOBBY)!.controls.map((c) => c.name)).toEqual(['PlayerReady', 'InviteButton']);
    valves.acquire('ComeFromLan', VALVE_TYPE.PERM); valves.set('ComeFromLan', 1, VALVE_TYPE.PERM);
    expect(look(GAME_LOBBY)!.controls.map((c) => c.name)).toEqual(['PlayerReady']);
    expect(withInviteButton(() => design as never, () => undefined)(GAME_LOBBY)!.controls).toHaveLength(2);   // before the opener: online
  });
});
