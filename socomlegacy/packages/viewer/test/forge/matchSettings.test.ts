// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardSlots, Libmc, PersonaCard, UI_VAR_MODULE } from '@s2u/card';
import { pinnedMatchSocket } from '../../src/connectHost';
import type { LoadedMap } from '../../src/loadMap';
import type { NetClient } from '../../src/net/client';
import type { ForgeLobbyHandOff } from '../../src/forge/lobbyClient';
import type { SourceRequest } from '../../src/discSource';
import type { MatchMountOptions } from '../../src/matchMount';
import { matchOptions } from '../../src/matchOptions';
import { cardOptionStore } from '../../src/modern/settings/store';
import { NativeSettings } from '../../src/nativeSettings';
import { VALVE_MODULE } from '../../src/originalOptions';
import { tunersOfVars } from '../../src/audio';

/**
 * RB-10 (PS-2, PS-3; the replay batch, product track -- a browser adaptation: the Forge's Play takes the player's own
 * settings, nothing of the game changes): the Forge's Play and lobby match (`../../src/forge/match`) mount the front end's
 * match with the deps the page card answers (`../../src/playerSettings` `pageMatchDeps`) -- the OPTIONS, the five taunts
 * and messages, the START menu's store, the valves (TEAMMATE NAMES), native Options over the match, the VIDEO picture --
 * and apply the card's volumes, SOUND MODE and BRIGHTNESS; a card write mid-match (the launcher's Settings over the Forge)
 * reaches the running match.
 */

const seen = vi.hoisted(() => ({
  mounts: [] as unknown[], soundModes: [] as number[], tuners: [] as (() => unknown)[], brightness: [] as number[],
}));

vi.mock('../../src/matchMount', () => ({
  mountMatch: vi.fn((_t: unknown, o: unknown) => { seen.mounts.push(o); return { ended: () => null, close: () => {} }; }),
}));
vi.mock('../../src/audio', async (actual) => ({
  ...await actual<typeof import('../../src/audio')>(),
  WebAudioOut: class {
    dispose(): void {}
    setSoundMode(mode: number): void { seen.soundModes.push(mode); }
  },
  GameAudio: class {
    setData(): void {}
    setTunerVars(vars: () => unknown): void { seen.tuners.push(vars); }
  },
}));
vi.mock('../../src/brightness', async (actual) => ({
  ...await actual<typeof import('../../src/brightness')>(),
  setBrightness: (b: number) => { seen.brightness.push(b); },
}));
vi.mock('../../src/net/loopback', () => ({ LoopbackMatch: class { socket = null; room = { player: () => null, stats: () => null }; stop(): void {} }, simClipsOfPlay: () => null, simMapOfLoaded: () => null }));
vi.mock('../../src/net/client', () => ({
  NetClient: class {
    id = 1;
    on(cb: (ev: unknown) => void): () => void { queueMicrotask(() => cb({ type: 'welcome' })); return () => {}; }
    close(): void {}
  },
}));

const { startForgeLobbyMatch, startForgeMatch } = await import('../../src/forge/match');
const { pageMatchDeps } = await import('../../src/playerSettings');

const memory = (): CardSlots => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
/** A saved persona file on slot 1 holding the player's settings, as the launcher's Settings and ONLINE > OPTIONS leave them. */
const seeded = (): CardSlots => {
  const slots = memory();
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
  card.load();
  card.setPart(VALVE_MODULE, { INVERT_PITCH_CONTROLLER: 0, BOBBING_1ST_PERSON: 0, DISPLAY_MP_TEAM_NAMES: 0, STEREO_CONTROLLER: 0, EnableExternalWhispers: 0 });
  card.setPart(UI_VAR_MODULE, {
    BRIGHTNESS: { type: 'real', value: 0.8 }, MUSIC_VOLUME: { type: 'real', value: 0.25 },
    MPTAUNTMSG1: { type: 'string', value: 'HOLD THE LINE' }, MPLOCALSOP1: { type: 'string', value: 'ON ME' },
  });
  expect(card.save()).toBeGreaterThanOrEqual(0);
  return slots;
};

const SERVED: SourceRequest = { kind: 'http', baseUrl: '/maps' };
const MAP = { archive: 'MP2', name: 'Frostfire' } as LoadedMap;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const lastMount = (): MatchMountOptions => seen.mounts.at(-1) as MatchMountOptions;
const play = (player?: ReturnType<typeof pageMatchDeps>) => startForgeMatch({} as HTMLElement, {
  map: MAP, clips: null, effects: null, sound: null, name: 'FORGE', source: SERVED, ...(player ? { player } : {}),
});
const lobby = (player?: ReturnType<typeof pageMatchDeps>) => startForgeLobbyMatch({} as HTMLElement, {
  map: MAP, clips: null, effects: null, sound: null, source: SERVED,
  handOff: { client: { reportLoaded: () => {}, close: () => {} } as unknown as NetClient, welcome: null, roundStart: null, events: [] } as ForgeLobbyHandOff,
  pinned: pinnedMatchSocket('', { protocol: 'http:', host: '127.0.0.1:5303' }, false),
  gameName: 'Forge: FROSTFIRE', lateJoiner: false, ...(player ? { player } : {}),
});

afterEach(() => {
  seen.mounts.length = 0; seen.soundModes.length = 0; seen.tuners.length = 0; seen.brightness.length = 0;
});

describe("RB-10: the Forge's matches mount with the player's settings (PS-2)", () => {
  for (const [name, start] of [["Play's match", async (p?: ReturnType<typeof pageMatchDeps>) => play(p)], ["the lobby's match", async (p?: ReturnType<typeof pageMatchDeps>) => lobby(p)]] as const) {
    it(`${name}: the injected mount receives options, taunts, messages, gameVars, the START store, settings and the picture`, async () => {
      const slots = seeded();
      const match = await start(pageMatchDeps(slots));
      const o = lastMount();
      expect(matchOptions(o.options).current()).toMatchObject({ invertPitch: false, headBob: false });
      expect(o.taunts?.()[0]).toBe('HOLD THE LINE');
      expect(o.messages?.()[0]).toBe('ON ME');
      expect(o.gameVars?.valve('DISPLAY_MP_TEAM_NAMES')).toBe(0);
      expect(o.externalWhispers?.()).toBe(0);
      expect(o.startMenuOptions?.value('BOBBING_1ST_PERSON')).toBe(0);
      expect(o.settings).toBeInstanceOf(NativeSettings);
      expect(typeof o.picture?.get()).toBe('string');
      expect(typeof o.picture?.observe).toBe('function');
      // GAME DETAILS keep the LAN fill the Forge drew before (`scoreboard.ts` `gameDetailLines`): LAN, the map's name.
      expect([o.gameVars?.valve('ComeFromLan'), o.gameVars?.uiVar('GAMENAMEVAR'), o.gameVars?.uiVar('MEDIUS_LOBBY_NAME')]).toEqual([1, 'Frostfire', null]);
      match.close();
    });

    it(`${name}: the card's volumes, SOUND MODE and BRIGHTNESS are applied (PS-3)`, async () => {
      const match = await start(pageMatchDeps(seeded()));
      expect(seen.soundModes.at(-1)).toBe(0);
      expect(seen.tuners).toHaveLength(1);
      expect(tunersOfVars(seen.tuners[0]!() as Parameters<typeof tunersOfVars>[0]).music).toBeCloseTo(0.25);
      expect(seen.brightness.at(-1)).toBeCloseTo(0.8);
      match.close();
    });
  }

  it('a card write mid-match changes `current()` and the applied settings; heard no more after the close', async () => {
    const slots = seeded();
    const match = await play(pageMatchDeps(slots));
    const o = lastMount();
    const options = matchOptions(o.options);
    expect(options.current().invertPitch).toBe(false);
    const store = cardOptionStore(slots);
    expect(store.setValve('INVERT_PITCH_CONTROLLER', 1)).toBe(true);
    expect(options.current().invertPitch).toBe(true);
    expect(store.setValve('STEREO_CONTROLLER', 1)).toBe(true);
    expect(seen.soundModes.at(-1)).toBe(1);
    expect(store.setValve('DISPLAY_MP_TEAM_NAMES', 1)).toBe(true);
    expect(o.gameVars?.valve('DISPLAY_MP_TEAM_NAMES')).toBe(1);
    expect(store.setTuner('BRIGHTNESS', 0.3)).toBe(true);
    expect(seen.brightness.at(-1)).toBeCloseTo(0.3);
    expect(tunersOfVars(seen.tuners[0]!() as Parameters<typeof tunersOfVars>[0]).music).toBeCloseTo(0.25);
    match.close();
    const modes = seen.soundModes.length;
    expect(store.setValve('STEREO_CONTROLLER', 0)).toBe(true);
    expect(seen.soundModes).toHaveLength(modes);
  });

  it('with no deps handed, the match builds them off the page card itself', async () => {
    const match = await play();
    await flush();
    const o = lastMount();
    expect(typeof o.options).toBe('function');
    expect(typeof o.taunts).toBe('function');
    expect(o.gameVars?.valve('ComeFromLan')).toBe(1);
    expect(o.settings).toBeInstanceOf(NativeSettings);
    match.close();
  });
});
