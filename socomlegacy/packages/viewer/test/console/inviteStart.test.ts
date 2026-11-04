// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_SET_VERSION, SOCOM2_US_BOOT, type AssetSource } from '@s2u/archive';
import { inviteOf, type InviteLink, type LobbyService } from '@s2u/ui';
import { buildIso } from '../../../archive/test/isoImage';
import { GameAudio } from '../../src/audio';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { KEPT_DISC_TITLE, liveDisc, type LiveDisc } from '../../src/console/adapters/disc';
import {
  autoStartStep, INVITE_WAITING_LINE, inviteAddress, inviteAt, liveInvite, type AutoStartView,
} from '../../src/console/adapters/invite';
import { liveLaunch } from '../../src/console/adapters/launch';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { DiscExtractRecord, ExtractEnv, ExtractHooks, ExtractionState } from '../../src/discExtract';
import type { DiscRequest, SourceRequest } from '../../src/discSource';
import { EVICTED_LINE } from '../../src/discStart';
import { mountFrontEnd, type FrontEndMount } from '../../src/frontEnd';
import { MenuMusic } from '../../src/menuMusic';
import {
  answerInvites, clearInviteTaken, endHandOff, guardInviteLogin, handOff, INVITE_HANDOFF_LINES, offerInvite, pageInvite, type InviteChannel, type InviteMount,
} from '../../src/inviteHost';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc } from '../../src/modern/discStore';
import type { ModernSession, SessionState } from '../../src/modern/session';
import { DISC_EXTRACT_SLOT, type RecordStore } from '../../src/pageStore';
import { FakeOpfs, FakeStorage } from '../discExtractFakes';
import { discStep } from './discStep';
import { mountShell } from './shell';

/**
 * INVITE-START (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R8; the product track, OT.R53): an
 * invite address auto-STARTs the console launcher once START is ready -- the disc kept whole, or chosen and extracted, or
 * gone on from -- and a plain visit is unchanged (a); a fresh browser is asked for the disc and extracts it first (b);
 * the menus' sound, suspended after a START with no gesture, resumes at the first key or click (c). Part B: the launcher
 * answers the invite channel (`../../src/inviteHost`, the online seat's, reused) with a fake channel, the asking tab the
 * module's own `handOff`. The disc's extraction and the front end's mount are faked at their seams (DX-3's rig); the disc
 * adapter, the launch, the console and the invite module are the real ones. Generated values only: no game data.
 */

const ID = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const cnf = (): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.02\r\nVMODE = NTSC\r\n`);
const discFile = (): File => new File([buildIso([{ path: 'SYSTEM.CNF', bytes: cnf() }, { path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');
const record = (done = true): DiscExtractRecord => ({
  v: 1, readSet: READ_SET_VERSION, identity: { ...ID }, backend: 'opfs', dir: 'SCUS_972.75-1.02-NTSC',
  files: [{ path: 'SYSTEM.CNF', size: 60, sha256: done ? 'a'.repeat(64) : null, done }, { path: 'RUN/MP2.ZDB', size: 940, sha256: done ? 'b'.repeat(64) : null, done }],
  total: 1000, persisted: true, started: 1, when: done ? 2 : null,
});
const memoryRecords = (): RecordStore & { map: Map<string, unknown> } => {
  const map = new Map<string, unknown>();
  return { map, get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); }, delete: async (k) => { map.delete(k); } };
};
const settle = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  if (ms) { await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); }
};
const pick = (file: File): void => {
  const input = document.getElementById('disc-page-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
};

/** The invite the specs use: a world id, a drawn game name and a universe (generated). */
const LINK: InviteLink = { mediusWorldId: 1234, game: 'Bravo Team', universe: 'US East' };
const INVITE_Q = '?invite=1234&game=Bravo%20Team&universe=US%20East';

/** A same-origin channel in memory: a message reaches every other end, after the poster's turn (as a BroadcastChannel). */
function fakeBus(): { open: () => InviteChannel; ends: Set<InviteChannel>; log: { type: string; from: string; busy?: unknown }[] } {
  const ends = new Set<InviteChannel>();
  const log: { type: string; from: string; busy?: unknown }[] = [];
  const open = (): InviteChannel => {
    const ch: InviteChannel = {
      onmessage: null,
      postMessage(m: unknown) {
        const r = m as { type: string; from: string; busy?: unknown };
        log.push({ type: r.type, from: r.from, ...('busy' in r ? { busy: r.busy } : {}) });
        for (const o of ends) if (o !== ch) queueMicrotask(() => { o.onmessage?.({ data: structuredClone(m) }); });
      },
      close() { ends.delete(ch); },
    };
    ends.add(ch);
    return ch;
  };
  return { open, ends, log };
}

interface Run { request: DiscRequest; hooks: ExtractHooks; resolve(r: DiscExtractRecord): void; reject(e: unknown): void }
interface AtMount { path: string; search: string }
interface Rig {
  ctl: ConsolePage['ctl']; disc: LiveDisc; mount: ReturnType<typeof vi.fn>; at: AtMount[]; runs: Run[];
  done(i?: number): void; controls: { on: boolean }; session: { value: SessionState }; bus: ReturnType<typeof fakeBus>;
}

let page: ConsolePage | null = null;
beforeEach(() => { publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); });

async function rig(o: {
  address?: string; state?: ExtractionState; kept?: DiscExtractRecord | null; signedIn?: boolean; controls?: boolean;
  mount?: () => FrontEndMount | null; onMount?: () => void;
} = {}): Promise<Rig> {
  window.history.replaceState(null, '', o.address ?? `/main/online${INVITE_Q}`);
  const records = memoryRecords();
  if (o.kept) records.map.set(DISC_EXTRACT_SLOT, o.kept);
  const env: ExtractEnv = { records, storage: new FakeStorage(new FakeOpfs()), idb: () => null };
  const runs: Run[] = [];
  let state: ExtractionState = o.state ?? 'none';
  const extract = (request: DiscRequest, hooks: ExtractHooks): Promise<DiscExtractRecord> => new Promise((resolve, reject) => {
    runs.push({ request, hooks, resolve, reject });
    hooks.signal?.addEventListener('abort', () => { reject(new Error('the extraction was stopped')); });
    hooks.onPlan?.(record(false).files, 1000, 'opfs');
  });
  const notify = (): void => { page?.render(); };
  const disc = liveDisc(document, notify, { extraction: { env, extract, room: async () => 4e9, doneHold: 0, state: async () => state } });
  const at: AtMount[] = [];
  const mount = vi.fn(() => {
    at.push({ path: window.location.pathname, search: window.location.search });
    o.onMount?.();
    return o.mount ? o.mount() : ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} } as FrontEndMount);
  });
  const signOut = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
  const launch = liveLaunch(document, {
    session: signOut, mount: mount as never, base: '/', sheets: [], loadSheet: async () => {},
    overlay: async () => ({ mountPageOverlay: () => {} }), ...(disc.start ? { start: disc.start } : {}),
  });
  const controls = { on: o.controls ?? true };
  const session = { value: (o.signedIn ? 'signed-in' : 'signed-out') as SessionState };
  const bus = fakeBus();
  const invite = liveInvite(window, { session: { state: () => session.value }, disc, notify, base: '/', open: bus.open, id: 'console' });
  const A: Adapters = {
    ...sampleAdapters(), data: 'live', states: undefined, disc, launch, invite,
    controls: { ready: () => controls.on, line: () => '', reason: () => 'Connect a controller to start.' },
  };
  page = bootConsole(document, window, A, { keymap: true });
  await disc.loaded();
  await settle();
  const done = (i = 0): void => { state = 'whole'; records.map.set(DISC_EXTRACT_SLOT, record()); runs[i]!.resolve(record()); };
  return { ctl: page.ctl, disc, mount, at, runs, done, controls, session, bus };
}
/** The Disc step -- its state word the step's, its line the legend chip's (`./discStep`; LR-23, was LR-13's disc check of Play's panel). */
const discItem = (): { state: string; sub: string } => {
  const d = discStep(page!);
  return { state: d.state, sub: d.sub };
};
/** The source the front end was mounted with. */
const mounted = (r: Rig): SourceRequest => (r.mount.mock.calls[0] as unknown as [string, SourceRequest])[1];

describe('the decision', () => {
  const view = (v: Partial<AutoStartView> = {}): AutoStartView =>
    ({ invite: true, spent: false, start: 'idle', overlay: null, disc: 'ready', extracting: false, ready: true, ...v });
  it('starts only on an invite address, once, with START idle and ready, no overlay and no extraction running', () => {
    expect(autoStartStep(view())).toBe('start');
    expect(autoStartStep(view({ invite: false }))).toBe('off');                 // FI.R8 (a): a plain visit
    expect(autoStartStep(view({ spent: true }))).toBe('off');                   // never twice in a page
    expect(autoStartStep(view({ start: 'arming' }))).toBe('met');               // the player's START is the same START
    expect(autoStartStep(view({ start: 'launching' }))).toBe('met');
    for (const disc of ['empty', 'reading', 'error'] as const) expect(autoStartStep(view({ disc }))).toBe('wait');
    expect(autoStartStep(view({ extracting: true }))).toBe('wait');             // FI.R8 (b): the extraction first
    expect(autoStartStep(view({ overlay: 'extract' }))).toBe('wait');
    expect(autoStartStep(view({ overlay: 'signin' }))).toBe('wait');
    expect(autoStartStep(view({ ready: false }))).toBe('wait');                 // no controller yet
  });

  it('an invite address is main/online with an invite the front end reads; anything else is a plain visit', () => {
    expect(inviteAt({ pathname: '/main/online', search: INVITE_Q }, '/')).toEqual(LINK);
    expect(inviteAt({ pathname: '/s2u/main/online', search: INVITE_Q }, '/s2u/')).toEqual(LINK);
    expect(inviteAt({ pathname: '/', search: INVITE_Q }, '/')).toBeNull();
    expect(inviteAt({ pathname: '/main', search: INVITE_Q }, '/')).toBeNull();
    expect(inviteAt({ pathname: '/main/online', search: '' }, '/')).toBeNull();
    expect(inviteAt({ pathname: '/main/online', search: '?invite=x&game=Bravo' }, '/')).toBeNull();   // does not read
  });

  it('an invite taken: the address main/online, the other keys as written, the invite\'s three, the fragment kept', () => {
    const to = inviteAddress({ search: '?devmode&server=http://h:1&invite=9&game=Old', hash: '#x' }, '/', LINK);
    expect(to).toBe('/main/online?devmode&server=http://h:1&invite=1234&game=Bravo+Team&universe=US+East#x');
    expect(inviteOf(new URL(to, 'https://lobby.test').search)).toEqual(LINK);
    expect(inviteAddress({ search: '', hash: '' }, '/s2u', { ...LINK, universe: null })).toBe('/s2u/main/online?invite=1234&game=Bravo+Team');
  });
});

/** The rigs wait past START's arming (360 ms) several times: generous bounds for a loaded host. */
const SLOW = { timeout: 20_000 };

describe('part A: the auto-START', SLOW, () => {
  it('whole: an invite address STARTs by itself from storage, with no chooser, carrying the invite\'s keys', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    expect(r.ctl.S.start).not.toBe('idle');
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(mounted(r)).toEqual({ kind: 'stored', identity: ID });
    expect(r.at[0]).toEqual({ path: '/main/online', search: INVITE_Q });
    expect(inviteOf(r.at[0]!.search)).toEqual(LINK);
    page = null;                                                                // taken down by the hand-over
  });

  it('a plain visit is unchanged: whole, and no START until the player presses it', async () => {
    for (const address of ['/?menuflow=x', `/${INVITE_Q}`, '/main/online']) {
      mountShell(document);
      publishDisc(document, { state: 'empty', filename: null });
      const r = await rig({ address, state: 'whole', kept: record() });
      await settle(400);
      expect(r.ctl.S.start).toBe('idle');
      expect(r.mount).not.toHaveBeenCalled();
      expect(discItem()).toEqual({ state: 'READY', sub: KEPT_DISC_TITLE });
      page?.dispose(); page = null;
    }
  });

  it('none and partial: the console as today with the invite\'s one line; no START', async () => {
    for (const state of ['none', 'partial'] as const) {
      mountShell(document);
      publishDisc(document, { state: 'empty', filename: null });
      const r = await rig({ state, kept: state === 'partial' ? record(false) : null });
      await settle(400);
      expect(r.mount).not.toHaveBeenCalled();
      expect(discItem()).toEqual({ state: 'NEEDED', sub: `${INVITE_WAITING_LINE} Your SOCOM 2 ISO (or the retail disc)` });
      page?.dispose(); page = null;
    }
  });

  it('evicted: the browser\'s line, then the invite\'s', async () => {
    const r = await rig({ state: 'evicted', kept: record() });
    expect(r.mount).not.toHaveBeenCalled();
    expect(discItem()).toEqual({ state: 'NEEDED', sub: `${EVICTED_LINE} ${INVITE_WAITING_LINE} Your SOCOM 2 ISO (or the retail disc)` });
  });

  it('fresh: the chooser, then the extraction; no START while it runs; START from storage right after it is done', async () => {
    const r = await rig();
    const file = discFile();
    pick(file);
    await settle(400);
    expect(r.runs).toHaveLength(1);
    expect(r.ctl.S.overlay).toBe('extract');
    expect(r.ctl.S.start).toBe('idle');                                         // the disc reads ready meanwhile: no START
    expect(discItem().sub).not.toContain(INVITE_WAITING_LINE);
    r.done();
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(mounted(r)).toEqual({ kind: 'stored', identity: ID, disc: { kind: 'iso', file } });
    expect(r.at[0]).toEqual({ path: '/main/online', search: INVITE_Q });
    page = null;
  });

  it('after three failures the player can go on from the disc: START follows with the disc\'s own request', async () => {
    const r = await rig();
    const file = discFile();
    pick(file);
    await settle();
    for (let i = 0; i < 3; i++) {
      r.runs[i]!.reject(new Error('write failed'));
      await settle();
      expect(r.mount).not.toHaveBeenCalled();
      if (i < 2) { r.ctl.press('cross'); await settle(); }
    }
    expect(r.ctl.S.start).toBe('idle');
    (document.querySelector('#overlay [data-act="extract"][data-i="1"]') as HTMLElement).click();   // Continue from the disc
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(mounted(r)).toEqual({ kind: 'iso', file });
    page = null;
  }, 10_000);

  it('no controller yet: it waits, and STARTs when one is ready', async () => {
    const r = await rig({ state: 'whole', kept: record(), controls: false });
    await settle(400);
    expect(r.mount).not.toHaveBeenCalled();
    r.controls.on = true;
    page!.render();                                                             // the pad's poll re-draws the page
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    page = null;
  });

  it('never twice: a START refused and closed is not pressed again by itself; the player\'s START still runs', async () => {
    const r = await rig({ state: 'whole', kept: record(), mount: () => null });
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    r.ctl.press('circle');                                                      // Back to the launcher
    expect(r.ctl.S.start).toBe('idle');
    page!.render();
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    r.ctl.press('options');
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(2);
  });

  it('a START the player presses meanwhile is the same START', async () => {
    const r = await rig({ state: 'whole', kept: record() });
    expect(r.ctl.S.start).not.toBe('idle');                                     // the auto-START's, arming or launching
    r.ctl.press('options');
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    page = null;
  });
});

describe('FI.R8 (c): the sound after an auto-START with no gesture', SLOW, () => {
  /** A context under the autoplay rule: suspended, and a resume runs it only once the page has had an activation. */
  class PolicyContext {
    static last: PolicyContext | null = null;
    state = 'suspended';
    sampleRate = 48_000;
    currentTime = 0;
    destination = {};
    resumes = 0;
    onstatechange: (() => void) | null = null;
    constructor() { PolicyContext.last = this; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    resume(): Promise<void> {
      this.resumes++;
      if (!activation.hasBeenActive) return new Promise<void>(() => undefined);   // no activation: pending (Chromium)
      this.state = 'running';
      this.onstatechange?.();
      return Promise.resolve();
    }
  }
  const activation = { hasBeenActive: false };

  for (const gesture of ['keydown', 'pointerdown'] as const) {
    it(`suspended after the START; the first ${gesture === 'keydown' ? 'key' : 'click'} resumes it, and the menus' music runs from then on`, async () => {
      const g = globalThis as unknown as { AudioContext?: unknown };
      const was = g.AudioContext;
      g.AudioContext = PolicyContext;
      activation.hasBeenActive = false;
      Object.defineProperty(navigator, 'userActivation', { configurable: true, value: activation });
      // The review of #253's F2: the mount is the real `mountFrontEnd`, over a source with no files (its audio is made
      // and wired before anything is read), so this pins the front end's own wiring, not a copy of it: its `WebAudioOut`
      // and `GameAudio` unlocked on the document (`pageUiSounds` -> `unlockOn`, `../../src/uiSoundHost.ts`), the menus'
      // music resumed when the output runs (`MenuMusic`'s `whenRunning`, `webOut.onRunning`). jsdom draws nothing: a 2D
      // context that takes every call and no animation frame run, as `../frontEndWiring.test.ts` mounts it.
      const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d as unknown as CanvasRenderingContext2D);
      vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const music = vi.spyOn(MenuMusic.prototype, 'resume');
      const unlock = vi.spyOn(GameAudio.prototype, 'unlockOn');
      const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
      let fe: FrontEndMount | null = null;
      try {
        const r = await rig({ state: 'whole', kept: record(), mount: () => (fe = mountFrontEnd('?menuflow', { kind: 'http', baseUrl: '/maps' }, document, { assets: nothing, movies: null })) });
        await settle(400);
        expect(r.mount).toHaveBeenCalledTimes(1);                               // the auto-START: no gesture on this page
        expect(fe).not.toBeNull();
        expect(unlock).toHaveBeenCalledWith(document);                          // the front end's own call
        expect(PolicyContext.last!.state).toBe('suspended');
        expect(music).not.toHaveBeenCalled();
        // The browser's rule: the press is the page's activation.
        activation.hasBeenActive = true;
        document.dispatchEvent(new Event(gesture));
        await settle();
        expect(PolicyContext.last!.state).toBe('running');
        expect(music).toHaveBeenCalledTimes(1);
        page = null;
      } finally {
        (fe as FrontEndMount | null)?.stop();
        g.AudioContext = was;
        delete (navigator as unknown as { userActivation?: unknown }).userActivation;
      }
    });
  }
});

describe('part B: the invite channel', SLOW, () => {
  const ask = (r: Rig): Promise<unknown> => handOff(LINK, { open: r.bus.open, id: 'asker', wait: () => settle() });

  it('signed in and ready: ping -> held (free) -> offer -> taken; START into main/online with the invite\'s keys', async () => {
    const r = await rig({ address: '/?menuflow=x', state: 'whole', kept: record(), signedIn: true });
    expect(r.ctl.S.start).toBe('idle');                                         // a plain visit: no auto-START
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    expect(await ask(r)).toBe('taken');
    expect(r.bus.log.map((m) => m.type)).toEqual(['ping', 'held', 'offer', 'taken']);
    expect(r.bus.log[1]).toEqual({ type: 'held', from: 'console', busy: null });
    expect(focus).toHaveBeenCalled();
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(mounted(r)).toEqual({ kind: 'stored', identity: ID });
    expect(r.at[0]!.path).toBe('/main/online');
    expect(r.at[0]!.search).toBe('?menuflow=x&invite=1234&game=Bravo+Team&universe=US+East');
    expect(inviteOf(r.at[0]!.search)).toEqual(LINK);
    expect(r.bus.ends.size).toBe(0);                                            // the console's channel closed at the hand-over
    page = null;
  });

  it('INVITE-SKIP-FOLLOW: a signed-in launcher that cannot take it now (a dialog up, or no disc) answers held \'asking\' and is never offered: the asker ends busy, never a login', async () => {
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: true });
    r.ctl.openSignIn();
    expect(await ask(r)).toBe('busy');
    expect(r.bus.log.map((m) => m.type)).toEqual(['ping', 'held']);            // no offer: it said it cannot take one
    expect(r.bus.log[1]).toEqual({ type: 'held', from: 'console', busy: 'asking' });
    page?.dispose(); page = null;
    mountShell(document);
    publishDisc(document, { state: 'empty', filename: null });
    const n = await rig({ address: '/', state: 'none', signedIn: true });
    expect(await ask(n)).toBe('busy');
    expect(n.bus.log.map((m) => m.type)).toEqual(['ping', 'held']);
    expect(n.bus.log[1]).toEqual({ type: 'held', from: 'console', busy: 'asking' });
    expect(n.mount).not.toHaveBeenCalled();
  });

  it('INVITE-SKIP-FOLLOW: a busy launcher beside a free game tab -- the launcher answers \'asking\', the game tab is offered the invite and takes it', async () => {
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: true });
    r.ctl.openSignIn();                                                         // the launcher cannot take one now
    const took: InviteLink[] = [];
    const game = answerInvites({ open: r.bus.open, id: 'game', holds: () => true, busy: () => null, take: (l) => { took.push(l); return true; } });
    try {
      expect(await ask(r)).toBe('taken');
      expect(took).toEqual([LINK]);
      const held = r.bus.log.filter((m) => m.type === 'held');
      expect(held).toEqual(expect.arrayContaining([
        { type: 'held', from: 'console', busy: 'asking' },
        { type: 'held', from: 'game', busy: null },
      ]));
      expect(r.bus.log.filter((m) => m.type === 'offer')).toHaveLength(1);
      expect(r.bus.log.filter((m) => m.type === 'taken')).toEqual([{ type: 'taken', from: 'game' }]);
      expect(r.mount).not.toHaveBeenCalled();                                   // the launcher started nothing
      expect(r.ctl.S.start).toBe('idle');
    } finally { game.close(); }
  });

  it('INVITE-FOLLOW: the taken invite is marked before the address is rewritten -- the mount on that address finds it, so no re-offer', async () => {
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: true });
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    expect(await ask(r)).toBe('taken');
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);
    const search = r.at[0]!.search;                                             // the address gamePage hands to the mount
    expect(pageInvite(search, window as never).took).toBe(true);                // the mark matches it (used once)
    expect(pageInvite(search, window as never).took).toBe(false);
    page = null;
  });

  it('INVITE-FOLLOW: after a take the answerer is closed at START, so a second asker finds no answer and only one taken is posted; a launch that does not mount drops the mark', async () => {
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: true, mount: () => null });
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    expect(await ask(r)).toBe('taken');
    const again = await ask(r);                                                 // the answerer closed at START
    expect(again).toBeNull();
    expect(r.bus.log.filter((m) => m.type === 'taken')).toHaveLength(1);
    await settle(400);
    expect(r.mount).toHaveBeenCalledTimes(1);                                   // tried, and it did not mount
    expect(pageInvite(r.at[0]!.search, window as never).took).toBe(false);      // the mark dropped
  });

  it('INVITE-START F1 pinned (INVITE-DECLINE\'s mark): A opens the link, B (a free launcher) takes it, C (a free launcher) is pinged, never offered -- nobody stranded', async () => {
    // Tab B: this rig's launcher, signed in and free. Its mount stands in for `mountFrontEnd`'s invite steps, in its
    // order (frontEnd.ts: `pageInvite` at the mount, then `offerInvite`, then `guardInviteLogin` around the login).
    const fe: { b: InviteMount | null } = { b: null };
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: true, onMount: () => { fe.b = pageInvite(window.location.search, window as never); } });
    vi.spyOn(window, 'focus').mockImplementation(() => {});
    const wait = (): Promise<void> => settle();
    const sent: { type: string; from: string; to?: string; busy?: unknown }[] = [];
    const tap = r.bus.open();                                                   // a listener only: every message, with its `to`
    tap.onmessage = (e) => { sent.push(e.data as never); };
    // Tab C: a second launcher in its own window (plain address, START idle and ready, the disc ready), signed in: free.
    const cWin = { location: { pathname: '/', search: '', hash: '' }, history: { replaceState: vi.fn() }, focus: () => {} };
    const cPage = { S: { start: 'idle' as const, overlay: null }, ready: () => true, start: vi.fn() };
    const c = liveInvite(cWin as never, { session: { state: () => 'signed-in' as SessionState }, disc: { state: () => 'ready' }, base: '/', open: r.bus.open, id: 'C' }).attach(cPage as never);
    // Tab A: a front end on the invite link (its own window), offering the address's invite first.
    const aWin = { location: { origin: 'http://localhost', pathname: '/main/online', search: INVITE_Q, hash: '' }, history: { state: null, replaceState: vi.fn() } };
    const a: InviteMount = { ...pageInvite(INVITE_Q, aWin as never), open: r.bus.open, wait };
    try {
      const handedA = await offerInvite(a);
      const lineA = handedA ? endHandOff(a, handedA) : null;
      await settle(400);                                                        // B's START, its sign-out, its mount
      expect(r.mount).toHaveBeenCalledTimes(1);
      const b: InviteMount = { ...fe.b!, open: r.bus.open, wait };
      const atMount = sent.length;
      const handedB = await offerInvite(b);                                     // B's front end's first step
      const sentAtMount = sent.length - atMount;
      const logins: string[] = [], guardHanded: string[] = [];
      const svc: LobbyService = {
        login: (q) => { logins.push(q.name); return Promise.resolve({ status: 0, ticket: 'T' }); },
        register: () => Promise.resolve({ status: 0 }), logout: () => Promise.resolve({ status: 0 }),
      };
      void guardInviteLogin(svc, b, (h) => { guardHanded.push(h); }).login({ name: 'b', password: 'p' });   // B's LOGIN: a ping only
      await settle(400);
      expect({
        a: { handed: handedA, line: lineA, address: aWin.history.replaceState.mock.calls.map((x) => inviteOf(new URL(String(x[2]), 'http://localhost').search)) },
        b: { took: fe.b!.took, path: r.at[0]!.path, invite: inviteOf(r.at[0]!.search), handed: handedB, sentAtMount, logins, guardHanded },
        c: {
          offered: sent.filter((m) => m.type === 'offer' && m.to === 'C').length, held: sent.filter((m) => m.type === 'held' && m.from === 'C').map((m) => m.busy),
          started: cPage.start.mock.calls.length, address: cWin.history.replaceState.mock.calls.length,
        },
        offers: sent.filter((m) => m.type === 'offer').map((m) => m.to), taken: sent.filter((m) => m.type === 'taken').map((m) => m.from),
      }).toEqual({
        a: { handed: 'taken', line: INVITE_HANDOFF_LINES.taken, address: [null] },              // A's link resolved: taken, its keys stripped
        b: { took: true, path: '/main/online', invite: LINK, handed: null, sentAtMount: 0, logins: ['b'], guardHanded: [] },   // B marked, rewrote, started; no re-offer, logs in
        c: { offered: 0, held: [null, null], started: 0, address: 0 },                           // C pinged twice (A's ask, B's login), free, untouched on the invite channel
        // ("nobody stranded" is the invite channel's: B's login then takes over C's sign-in, newest wins -- INVITE-DECLINE's
        // ruling in sprint 41's Log; `svc.login` is stubbed here, so this test neither shows nor rules out that takeover)
        offers: ['console'], taken: ['console'],
      });
      page = null;
    } finally { c.detach(); tap.close(); clearInviteTaken(); }
  });

  it('no sign-in: silent', async () => {
    const r = await rig({ address: '/', state: 'whole', kept: record(), signedIn: false });
    expect(await ask(r)).toBeNull();
    expect(r.bus.log.map((m) => m.type)).toEqual(['ping']);
    expect(r.mount).not.toHaveBeenCalled();
  });

  it('itself on an invite address (before its START): it answers held \'asking\', never offered, even with START ready again -- the asker ends busy', async () => {
    const r = await rig({ state: 'whole', kept: record(), signedIn: true, mount: () => null });
    await settle(400);
    r.ctl.press('circle');                                                      // its own START refused, Back: ready, idle
    expect([r.ctl.S.start, r.ctl.S.overlay]).toEqual(['idle', null]);
    expect(await ask(r)).toBe('busy');                                          // the hard rule: never a login over its session
    expect(r.bus.log.map((m) => m.type)).toEqual(['ping', 'held']);            // 'asking': never offered
    expect(r.mount).toHaveBeenCalledTimes(1);
  });
});
