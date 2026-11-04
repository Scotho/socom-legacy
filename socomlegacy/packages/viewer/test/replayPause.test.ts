// @vitest-environment jsdom
// test/replayPause.test.ts -- CPS.R9 (e): the replay mode's `pause` (the frame identity gate's hold, `../src/frameHash`)
import { describe, expect, it } from 'vitest';
import { replayClient, replayPauseAsked } from '../src/replay/mount';
import type { ReplayClient } from '../src/replay/replayClient';
import { fakeFetch, fixtureBytes } from './replayFixture';

/**
 * The recording plays from its open (`ReplayClient`'s `clock.play()`) and a `tick=` seek keeps it playing; `pause` in the
 * address pauses it at the open, before the seek, so the tick is the asked one exactly and stays so (a test-only
 * instrument's switch; REPLAY_ADAPTATION, no game value). The fixture: MP2, ticks 0-500 (`./replayFixture`).
 */
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const open = async (search: string): Promise<ReplayClient> => {
  const make = replayClient(search, { document, location: { search, pathname: '/testroom', hash: '', replace: () => {} }, fetch: fakeFetch(fixtureBytes()), frame: () => {} });
  const c = make({ url: 'replay:', map: 'MP2', name: 'W', watch: true }, {} as never) as unknown as ReplayClient;
  await c.ready;
  await wait(0);
  return c;
};

describe('CPS.R9 (e): the replay\'s pause at the open', () => {
  it('replayPauseAsked: `pause` in the address, with or without a value; absent, no', () => {
    expect(replayPauseAsked('?devmode&replay=u&tick=300&pause')).toBe(true);
    expect(replayPauseAsked('?devmode&replay=u&pause=1')).toBe(true);
    expect(replayPauseAsked('?devmode&replay=u&tick=300')).toBe(false);
    expect(replayPauseAsked('')).toBe(false);
  });
  it('without it the recording plays on from the tick= seek (as before)', async () => {
    const c = await open('?devmode&replay=http://localhost:5303/segments/1.s2r&tick=300');
    expect(c.state).toBe('open');
    expect(c.playing()).toBe(true);
    const at = c.serverTick();
    await wait(60);
    expect(c.serverTick()).toBeGreaterThan(at);
    c.close();
  });
  it('with it the clock stands paused at exactly the asked tick, frame after frame', async () => {
    const c = await open('?devmode&replay=http://localhost:5303/segments/2.s2r&tick=300&pause');
    expect(c.state).toBe('open');
    expect(c.playing()).toBe(false);
    expect(c.serverTick()).toBe(300);
    await wait(60);
    expect(c.serverTick()).toBe(300);
    expect(c.dtScale()).toBe(0);
    c.close();
  });
  it('cps-frame-hash-5: a paused seek applies the target tick state -- the bodies are that tick snapshot, not the open one', async () => {
    // The fixture's snapshots carry player 1 at x = tick and player 2 at x = -tick (both until 300, then player 1 alone).
    for (const [n, tick] of [[4, 100], [5, 250], [6, 400]] as const) {
      const c = await open(`?devmode&replay=http://localhost:5303/segments/${n}.s2r&tick=${tick}&pause`);
      expect(c.serverTick()).toBe(tick);
      expect(c.bodies().map((b) => [b.id, b.feet[0]])).toEqual(tick < 300 ? [[1, tick], [2, -tick]] : [[1, tick]]);
      await wait(60);
      expect(c.bodies().map((b) => b.feet[0])[0]).toBe(tick);
      c.close();
    }
  });
  it('without tick= it stands paused at the open', async () => {
    const c = await open('?devmode&replay=http://localhost:5303/segments/3.s2r&pause');
    expect(c.playing()).toBe(false);
    const at = c.serverTick();
    await wait(60);
    expect(c.serverTick()).toBe(at);
    c.close();
  });
});
