import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LoadingJoin, soloLoadHold, type JoinLanes } from '../src/loadingJoin';
import { LOAD_STATE_FADE_SECONDS } from '@s2u/ui/loading';

const ready: JoinLanes = { playOn: false, scene: 'done', play: 'none', walkWarmed: true,
  armory: 'off', effects: true, sound: true, url: false, net: null };

// Every page mount, the test room and replays included, keeps the original completion hold (LOAD_STATE_FADE_SECONDS,
// FUN_001f5e70); the constructor's hold parameter is for instruments only and no page passes it.
describe('LoadingJoin completion hold parameter (instruments only)', () => {
  it('releases on the frame all actual preparation finishes when an instrument passes a zero hold', () => {
    const join = new LoadingJoin(0); join.begin(1);
    expect(join.frame(1, { ...ready, scene: 'pending' }, 10)).toBe('hold');
    expect(join.frame(1, ready, 10.01)).toBe('released');
    expect(join.blocked).toBe(false);
  });
  it('retains the original completion hold by default for game mounts', () => {
    const join = new LoadingJoin(); join.begin(1);
    expect(join.frame(1, ready, 10)).toBe('hold');
    expect(join.blocked).toBe(true);
  });
  it('still waits for actual sound, scene and room readiness with the presentation hold disabled', () => {
    const join = new LoadingJoin(0); join.begin(1);
    expect(join.frame(1, { ...ready, sound: false }, 10)).toBe('hold');
    expect(join.frame(1, { ...ready, url: true, net: 'connecting' }, 11)).toBe('hold');
    expect(join.frame(1, { ...ready, url: true, net: 'online' }, 12)).toBe('released');
  });
});

describe('the presentation hold is decided per load (MCW.R8)', () => {
  it('a solo load passes 0 and releases on the frame preparation finishes; the next load decides again', () => {
    const join = new LoadingJoin(); join.begin(1, undefined, 0);
    expect(join.frame(1, ready, 10, 0)).toBe('released');      // the page passes the live kind each frame: still solo
    join.begin(2);                                          // a later load with no hold named: the original default
    expect(join.frame(2, ready, 20)).toBe('hold');
    expect(join.blocked).toBe(true);
  });
  const solo = { testroomPage: true, replay: false, netClientOnline: false, netUrl: false, roomOpen: false, networkAddress: false };
  it('soloLoadHold is 0 only for an actual solo test-room load', () => {
    expect(soloLoadHold(solo)).toBe(0);
    expect(soloLoadHold({ ...solo, replay: true })).toBeUndefined();                 // a replay on /testroom
    expect(soloLoadHold({ ...solo, netClientOnline: true })).toBeUndefined();        // a net client up (switched to Online)
    expect(soloLoadHold({ ...solo, netUrl: true })).toBeUndefined();                 // a remembered or chosen Online server
    expect(soloLoadHold({ ...solo, roomOpen: true })).toBeUndefined();               // a room ask open
    expect(soloLoadHold({ ...solo, networkAddress: true })).toBeUndefined();         // ?server= / ?mp / ?room=
    expect(soloLoadHold({ ...solo, testroomPage: false })).toBeUndefined();          // any other page
  });
  it('a solo load that goes online before it shows is promoted to the original hold; a hold is never demoted', () => {
    const solo = { testroomPage: true, replay: false, netClientOnline: false, netUrl: false, roomOpen: false, networkAddress: false };
    const join = new LoadingJoin(); join.begin(1, undefined, soloLoadHold(solo));
    expect(join.frame(1, { ...ready, scene: 'pending' }, 10, soloLoadHold(solo))).toBe('hold');   // still preparing, solo
    // Enter on the focused Online control mid-load: NET changes, no new begin; the page passes the live kind, now
    // `undefined` (not solo), which means the original's hold.
    const online = soloLoadHold({ ...solo, netClientOnline: true });
    expect(online).toBeUndefined();
    expect(join.frame(1, ready, 10.2, online)).toBe('hold');                                      // promoted
    expect(join.frame(1, ready, 10.2 + LOAD_STATE_FADE_SECONDS - 0.01, online)).toBe('hold');     // for the whole original hold
    expect(join.frame(1, ready, 10.2 + LOAD_STATE_FADE_SECONDS + 0.01, soloLoadHold(solo))).toBe('released'); // a later 0 cannot demote
    join.begin(2);                                                                                // a network load, the default
    expect(join.frame(2, ready, 20, soloLoadHold(solo))).toBe('hold');                            // 0 cannot demote the default
  });
  it('the page constructs the default join and names the hold at begin from the live load kind', async () => {
    const { resolve } = await import('node:path');
    const main = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');
    expect(main).toContain('new LoadingJoin();');
    expect(main).toMatch(/loadingJoin\.begin\(wantedMap,/);
    expect(main).toContain('}, soloLoadHold(loadKindNow()));');
    expect(main).toContain('performance.now() / 1000, soloLoadHold(loadKindNow()));');
    expect(main).not.toContain('new LoadingJoin(0)');
  });
});
