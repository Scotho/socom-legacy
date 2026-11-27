import { describe, expect, it, vi } from 'vitest';
import { pinnedMatchSocket } from '../../src/connectHost';
import type { LoadedMap } from '../../src/loadMap';
import type { NetClient } from '../../src/net/client';
import type { ForgeLobbyHandOff } from '../../src/forge/lobbyClient';

/**
 * FORGE (FG-40; FG.R20, a browser adaptation with no original): the forge lobby's match on the lobby's client
 * (`../../src/forge/match` `startForgeLobbyMatch`). The forge loads the match's map, clips, effects and sound before
 * the hand-off, so the match is loaded when it mounts; the room holds round 1 until every launched page reports its load
 * (`loaded`, ONL-18b, research 221; `NetClient.reportLoaded`, as `../../src/lobbyMatch` reports the game lobby's), else
 * for the load barrier's ceiling (`LOAD_BARRIER_TIMEOUT_PLACEHOLDER`, 90 s). FG-30c's joiner sat in that hold on the
 * page's pre-spawn default kit (Terrorist 1's 552) because the forge never reported it: round 1's spawn, which carries
 * the room's type and kit (the ARMORY's pick), never came while the run lasted.
 */

const seen = vi.hoisted(() => ({ order: [] as string[], throwMount: false, throwAudio: false }));

vi.mock('../../src/matchMount', () => ({
  mountMatch: vi.fn(() => {
    if (seen.throwMount) throw new Error('no mount');
    seen.order.push('mount');
    return { ended: () => null, close: () => { seen.order.push('unmount'); } };
  }),
}));
vi.mock('../../src/audio', () => ({
  WebAudioOut: class { constructor() { if (seen.throwAudio) throw new Error('no audio'); } dispose(): void {} },
  GameAudio: class { setData(): void {} },
}));
vi.mock('../../src/net/loopback', () => ({ LoopbackMatch: class {}, simClipsOfPlay: () => null, simMapOfLoaded: () => null }));

const { startForgeLobbyMatch } = await import('../../src/forge/match');
const { graphicsRecoveryNoticeHeld, resetGraphicsRecordForTest } = await import('../../src/graphicsLost');

function handOff(): ForgeLobbyHandOff {
  const client = {
    reportLoaded: () => { seen.order.push('loaded'); },
    close: () => { seen.order.push('close'); },
  } as unknown as NetClient;
  return { client, welcome: null, roundStart: null, events: [] };
}

const start = (h: ForgeLobbyHandOff) => startForgeLobbyMatch({} as HTMLElement, {
  map: { archive: 'MP2' } as LoadedMap, clips: null, effects: null, sound: null, handOff: h,
  pinned: pinnedMatchSocket('', { protocol: 'http:', host: '127.0.0.1:5303' }, false),
  gameName: 'Forge: FROSTFIRE', lateJoiner: false,
});

describe('FG-40: the forge lobby\'s match reports its load', () => {
  it('reports `loaded` on the lobby\'s client once the match is mounted (round 1 is not held for the barrier\'s ceiling)', () => {
    seen.order.length = 0;
    seen.throwMount = false;
    const m = start(handOff());
    expect(seen.order).toEqual(['mount', 'loaded']);
    m.close();
    expect(seen.order).toEqual(['mount', 'loaded', 'unmount']);
  });

  it('a mount that throws reports nothing: the client is closed', () => {
    seen.order.length = 0;
    seen.throwMount = true;
    expect(() => start(handOff())).toThrow('no mount');
    expect(seen.order).toEqual(['close']);
  });

  it('FG-48 re-review F2: a throw before the mount (the audio\'s) closes the handed client too, never left open and owned by none', () => {
    seen.order.length = 0;
    seen.throwMount = false;
    seen.throwAudio = true;
    try {
      expect(() => start(handOff())).toThrow('no audio');
      expect(seen.order).toEqual(['close']);
    } finally { seen.throwAudio = false; }
  });
});

/**
 * The owner's word (via the main controller, 2026-11-25): "Leave the Forge out". A Forge custom match holds the graphics
 * notice for as long as it is mounted (`../../src/graphicsLost` `holdGraphicsRecoveryNotice`): a loss shows the notice and
 * nothing reloads by itself; the hold goes with the match's close, its release and a mount that throws. The Forge's Play
 * mount (`startForgePlay`'s `mountMatch`) takes the same hold: both mounts name it.
 */
describe("GRAPHICS-RECOVERY: the Forge's mounts hold the notice (the owner's word, 2026-11-25)", () => {
  it('a custom match holds it while mounted; its close lets it go', () => {
    resetGraphicsRecordForTest();
    seen.throwMount = false;
    const m = start(handOff());
    expect(graphicsRecoveryNoticeHeld()).toBe(true);
    m.close();
    expect(graphicsRecoveryNoticeHeld()).toBe(false);
  });

  it('a mount that throws holds nothing after it', () => {
    resetGraphicsRecordForTest();
    seen.throwMount = true;
    try {
      expect(() => start(handOff())).toThrow('no mount');
      expect(graphicsRecoveryNoticeHeld()).toBe(false);
    } finally { seen.throwMount = false; }
  });

  // The glance's F1 (2026-11-25): a throw AFTER a good mount (the load report, the return listener) let the hold go
  // with the mount, so every later normal match on the page still reloads by itself.
  it.each(['reportLoaded', 'on'] as const)('a throw from the client\'s %s after the mount lets the hold and the mount go, then rethrows', (which) => {
    resetGraphicsRecordForTest();
    seen.order.length = 0;
    seen.throwMount = false;
    const h = handOff();
    const client = h.client as unknown as Record<string, unknown>;
    client[which] = () => { throw new Error(`no ${which}`); };
    expect(() => start(h)).toThrow(`no ${which}`);
    expect(graphicsRecoveryNoticeHeld()).toBe(false);
    expect(seen.order).toContain('unmount');
  });

  it("both of forge/match.ts's mounts take the hold (its Play and its custom matches)", async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../../src/forge/match.ts', import.meta.url), 'utf8');
    expect(text.match(/mountMatch\(target,/g)).toHaveLength(2);
    expect(text.match(/= holdGraphicsRecoveryNotice\(\);/g)).toHaveLength(2);
  });
});
