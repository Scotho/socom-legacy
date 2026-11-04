// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { pinnedMatchSocket } from '../../src/connectHost';
import type { SourceRequest } from '../../src/discSource';
import type { LoadedMap } from '../../src/loadMap';
import type { NetClient } from '../../src/net/client';
import type { ForgeLobbyHandOff } from '../../src/forge/lobbyClient';
import { forgeMatchSounds, setForgeMatchSounds } from '../../src/forge/matchState';
import { mountMatch } from '../../src/matchMount';
import type { ForgeLightingOptions } from '../../src/forge/lighting';

/**
 * F7 (a) of OVERLAY-CONSOLE (MISSION OT.R60 (e), the owner: "ensure we add a sound effect for the transition. pick one
 * from the base game that seems appropriate"; product track, OT.R53; a browser adaptation, OT.R28): over the forge's Play
 * match and a forge lobby's match the overlay's open and close play the menus' cues as over the front end's match. The
 * forge loads no menu bank and its match audio is private, so `../../src/forge/match` builds the cues itself -- the disc's
 * `RUN/SOUNDRDR.ZAR`, `HUDUI.bnk` and `RUN/UI/READERC.ZAR` (`../../src/uiSoundHost` `readUiSoundFiles`, `makeUiSoundHost`)
 * on a `GameAudio` of their own over an output sharing the match's context (`new WebAudioOut(matchOut)`, as
 * `../../src/frontEnd` `frontEndMatchSound` puts the match beside the menus), so HUDUI never replaces the map's banks and
 * the cues' data never touches the match's reverb or one-shots -- and holds them in `../../src/forge/matchState` for the
 * overlay while the match runs. Released with the match, on its close and on every throw before the mount.
 */

interface Out { shared: Out | null; disposed: boolean; unlocked: boolean; unlocks: number; resumes: number }
interface Game { out: Out; data: unknown[]; names: Set<string>; calls: unknown[][]; map: string | null }
const seen = vi.hoisted(() => ({
  outs: [] as Out[], games: [] as Game[], order: [] as string[], throwMount: false, mountedWith: null as unknown,
  files: true, hostArgs: [] as unknown[][], cues: { popup: () => ({ kind: 'no-name' }), back: () => ({ kind: 'no-name' }) } as unknown,
}));

vi.mock('../../src/matchMount', () => ({
  mountMatch: vi.fn((_t: unknown, o: { audio?: { release(): void } }) => {
    if (seen.throwMount) throw new Error('no mount');
    seen.order.push('mount');
    seen.mountedWith = o.audio;
    return { ended: () => null, close: () => { seen.order.push('unmount'); o.audio?.release(); } };
  }),
}));
vi.mock('../../src/audio', () => ({
  WebAudioOut: class {
    shared: unknown; disposed = false; unlocked = false; unlocks = 0; resumes = 0;
    constructor(shared: unknown = null) { this.shared = shared; seen.outs.push(this as unknown as Out); }
    dispose(): void { this.disposed = true; }
    unlock(): void { this.unlocks++; }                           // FUI-23: the rules' cues' gesture
    resumeIfAllowed(): void { this.resumes++; }                  // FUI-23: the pad's Cross
  },
  GameAudio: class {
    out: unknown; data: unknown[] = []; names = new Set<string>(); calls: unknown[][] = []; map: string | null = null;
    constructor(out: unknown) { this.out = out; seen.games.push(this as unknown as Game); }
    setData(d: unknown): void { this.data.push(d); }
    has(n: string): boolean { return this.names.has(n); }        // FUI-23: the rules' cues ask the match's audio
    play(...a: unknown[]): boolean { this.calls.push(a); return true; }
    stats(): { map: string | null } { return { map: this.map }; }
  },
}));
vi.mock('../../src/net/loopback', () => ({ LoopbackMatch: class { socket = null; room = { player: () => null, stats: () => null }; stop(): void { seen.order.push('stop'); } }, simClipsOfPlay: () => null, simMapOfLoaded: () => null }));
vi.mock('../../src/net/client', () => ({
  NetClient: class {
    id = 1;
    on(cb: (ev: unknown) => void): () => void { queueMicrotask(() => cb({ type: 'welcome' })); return () => {}; }
    close(): void { seen.order.push('close'); }
  },
}));
vi.mock('../../src/uiSoundHost', async (actual) => {
  const a = await actual<typeof import('../../src/uiSoundHost')>();
  return {
    ...a,
    readUiSoundFiles: vi.fn(async (s: AssetSource) => (seen.files
      ? { files: { soundRdr: new Uint8Array(1), hudui: null, readerc: new Uint8Array(1) }, huduiBytes: new Uint8Array([7]), missing: [] }
      : a.readUiSoundFiles(s))),
    makeUiSoundHost: vi.fn((...args: unknown[]) => { seen.hostArgs.push(args); return { table: null, cues: seen.cues, output: null }; }),
  };
});

const { forgeMatchCues, startForgeLobbyMatch, startForgeMatch } = await import('../../src/forge/match');

const SERVED: SourceRequest = { kind: 'http', baseUrl: '/maps' };
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const handOff = (): ForgeLobbyHandOff => ({
  client: { reportLoaded: () => { seen.order.push('loaded'); }, close: () => { seen.order.push('close'); } } as unknown as NetClient,
  welcome: null, roundStart: null, events: [],
});
const lobby = (source?: SourceRequest | null, forgeLighting?: ForgeLightingOptions) => startForgeLobbyMatch({} as HTMLElement, {
  map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, handOff: handOff(),
  pinned: pinnedMatchSocket('', { protocol: 'http:', host: '127.0.0.1:5303' }, false),
  gameName: 'Forge: FROSTFIRE', lateJoiner: false, ...(source === undefined ? {} : { source }), forgeLighting,
});
const play = (source?: SourceRequest | null, forgeLighting?: ForgeLightingOptions) => startForgeMatch({} as HTMLElement, {
  map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, name: 'FORGE', ...(source === undefined ? {} : { source }), forgeLighting,
});

afterEach(() => {
  seen.outs.length = 0; seen.games.length = 0; seen.order.length = 0; seen.hostArgs.length = 0;
  seen.throwMount = false; seen.files = true; seen.mountedWith = null;
  setForgeMatchSounds(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('F7 (a): the holder the overlay reads (`forge/matchState`)', () => {
  it('passes the same base-world lighting calibration through local Play and the lobby mount; Original omits it', async () => {
    const forgeLighting = { timeOfDay: 0.3, baseline: 0.06 };
    for (const start of [lobby, play]) {
      const match = await start(null, forgeLighting);
      expect(vi.mocked(mountMatch).mock.calls.at(-1)![1].forgeLighting).toBe(forgeLighting);
      match.close();
      const original = await start(null);
      expect(vi.mocked(mountMatch).mock.calls.at(-1)![1]).not.toHaveProperty('forgeLighting');
      original.close();
    }
  });
  it('holds what it is set to, and nothing once cleared', () => {
    expect(forgeMatchSounds()).toBeNull();
    const c = {} as never;
    setForgeMatchSounds(c);
    expect(forgeMatchSounds()).toBe(c);
    setForgeMatchSounds(null);
    expect(forgeMatchSounds()).toBeNull();
  });
});

describe('F7 (a): a forge match\'s cues are built over the match\'s own output and released with it', () => {
  for (const [name, start] of [['the lobby\'s match', async (s?: SourceRequest | null) => lobby(s)], ['Play\'s match', play]] as const) {
    it(`${name}: HUDUI on a GameAudio of the cues' own, over an output on the match's context; held while it runs; let go at its close`, async () => {
      const m = await start(SERVED);
      await flush();
      const [matchOut, cueOut] = seen.outs;
      expect(seen.outs).toHaveLength(2);
      expect(matchOut!.shared).toBeNull();                       // the match's output, its own context
      expect(cueOut!.shared).toBe(matchOut);                     // the cues' output: the match's context, a master of its own
      const cueGame = seen.games.find((g) => g.out === cueOut)!;
      const matchGame = seen.games.find((g) => g.out === matchOut)!;
      expect(cueGame).toBeDefined();
      expect(cueGame).not.toBe(matchGame);                       // HUDUI never goes into the match's GameAudio
      expect(matchGame.data).toEqual([]);
      expect((cueGame.data[0] as { archive: string; banks: { file: string }[] }).archive).toBe('FRONTEND');
      expect((cueGame.data[0] as { banks: { file: string }[] }).banks.map((b) => b.file)).toEqual(['HUDUI.bnk']);
      expect(seen.hostArgs[0]![1]).toBe(cueGame);                // the cues play through the cues' GameAudio
      expect(forgeMatchSounds()).toBe(seen.cues);
      m.close();
      expect(forgeMatchSounds()).toBeNull();
      expect(cueOut!.disposed).toBe(true);
      expect(cueGame.data.at(-1)).toBeNull();
      expect(matchOut!.disposed).toBe(true);
    });

    it(`${name}: a mount that throws releases the cues -- nothing held, even once the read lands after it`, async () => {
      seen.throwMount = true;
      await expect(Promise.resolve().then(() => start(SERVED))).rejects.toThrow('no mount');
      await flush();
      expect(forgeMatchSounds()).toBeNull();
      expect(seen.outs.every((o) => o.disposed)).toBe(true);
      expect(seen.hostArgs).toEqual([]);                         // never built for a match that never ran
    });

    it(`${name}: no source handed in, or a source without the menus' sound files: no cues and no error`, async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = await start(undefined);
      await flush();
      expect(forgeMatchSounds()).toBeNull();
      a.close();
      seen.files = false;                                        // the real reader over a source that has none of them
      vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
      const b = await start(SERVED);
      await flush();
      expect(forgeMatchSounds()).toBeNull();
      b.close();
      expect(errors).not.toHaveBeenCalled();
    });
  }

  it('forgeMatchCues over a source that lacks the files: nothing held and nothing thrown; the release lets the output go', async () => {
    seen.files = false;
    const empty: AssetSource = { read: async (p: string) => { throw new Error(`no ${p}`); } } as unknown as AssetSource;
    const { WebAudioOut } = await import('../../src/audio');
    const out = new WebAudioOut();
    const c = forgeMatchCues(empty, out);
    await flush();
    expect(forgeMatchSounds()).toBeNull();
    c.release();
    expect(seen.outs[1]!.disposed).toBe(true);
    expect(seen.outs[0]!.disposed).toBe(false);                  // the match's own output is the match's to let go
  });

  it('FUI-23: Play hands the rules\' cues the match\'s own audio -- the map\'s banks first, the menus\' HUDUI after -- and null at the close', async () => {
    const handed: unknown[] = [];
    const m = await startForgeMatch({} as HTMLElement, {
      map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: { data: {}, loops: [] } as never, name: 'FORGE', source: SERVED,
      onRulesAudio: (a: unknown) => { handed.push(a); },
    } as Parameters<typeof startForgeMatch>[1]);
    await flush();
    expect(handed).toHaveLength(1);
    const a = handed[0] as { loaded(): boolean; has(n: string): boolean; play(n: string): boolean; unlocked(): boolean; unlock(fromPad?: boolean): void };
    const [matchOut, cueOut] = seen.outs;
    const matchGame = seen.games.find((g) => g.out === matchOut)!;
    const cueGame = seen.games.find((g) => g.out === cueOut)!;
    matchGame.names.add('.BEEP');
    cueGame.names.add('.MENU_POPUP');
    expect(a.loaded()).toBe(false);                              // the map's sound not yet in the match's audio
    matchGame.map = 'MP2';
    expect(a.loaded()).toBe(true);
    expect([a.has('.BEEP'), a.has('.MENU_POPUP'), a.has('.NONE')]).toEqual([true, true, false]);
    expect(a.play('.BEEP')).toBe(true);
    expect(matchGame.calls).toEqual([['.BEEP', null, 'play', 1]]);    // placed nowhere, at the bank's own group (`play`)
    a.play('.MENU_POPUP');
    expect(cueGame.calls).toEqual([['.MENU_POPUP', null, 'play', 1]]);
    expect(a.play('.NONE')).toBe(false);
    expect(a.unlocked()).toBe(false);
    matchOut!.unlocked = true;
    expect(a.unlocked()).toBe(true);
    a.unlock();
    a.unlock(true);
    expect([matchOut!.unlocks, matchOut!.resumes]).toEqual([1, 1]);   // a click's resume; the pad's, asked only with an activation
    m.close();
    expect(handed).toEqual([a, null]);
  });

  it('FUI-23: a map with no sound reads as loaded (every cue then "not on this map"); a mount that throws hands null', async () => {
    const handed: unknown[] = [];
    const m = await startForgeMatch({} as HTMLElement, {
      map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, name: 'FORGE', onRulesAudio: (a: unknown) => { handed.push(a); },
    } as Parameters<typeof startForgeMatch>[1]);
    expect((handed[0] as { loaded(): boolean }).loaded()).toBe(true);
    m.close();
    seen.throwMount = true;
    handed.length = 0;
    await expect(startForgeMatch({} as HTMLElement, {
      map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, name: 'FORGE', onRulesAudio: (a: unknown) => { handed.push(a); },
    } as Parameters<typeof startForgeMatch>[1])).rejects.toThrow('no mount');
    expect(handed.at(-1)).toBeNull();
  });

  it('a later match\'s cues are not cleared by an earlier match\'s release', async () => {
    const first = lobby(SERVED);
    await flush();
    const own = { popup: () => ({ kind: 'no-name' }), back: () => ({ kind: 'no-name' }) };
    const was = seen.cues;
    seen.cues = own;
    try {
      const second = lobby(SERVED);
      await flush();
      expect(forgeMatchSounds()).toBe(own);
      first.close();
      expect(forgeMatchSounds()).toBe(own);
      second.close();
      expect(forgeMatchSounds()).toBeNull();
    } finally { seen.cues = was; }
  });
});
