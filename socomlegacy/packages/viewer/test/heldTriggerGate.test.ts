// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { GAME_FRAME_DT } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { Fire } from '../src/fire';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm, type MatchFirearmDeps } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';
import { nextEdge } from '../src/weaponRaise';

/**
 * RAISE-1577 part 1 (LATER 1577; IQ-R1RAISE-PC2, r0004: R1 held from spawn, the original raises the rifle at frame 1-2
 * and fires; PC 4: the page never raised while the button stayed held). The original reads the pad as a LEVEL each frame
 * in the player control (`FUN_00594cf0`'s trigger step, D:L453543-453567); while the control's gate is shut it returns
 * before the trigger and the raise (D:L453067-453070) -- the pad not read, nothing fired, no edge -- and once it runs a
 * held button counts as held. The page's gates (the loading screen's hold, a screen holding the input, the round
 * screens) dropped the press and the feeds send only changes, so the level was lost for good.
 */

afterEach(() => { vi.restoreAllMocks(); });

function rig(o: { blocked?: () => boolean; screenUp?: () => boolean } = {}) {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const net = {
    client: { id: 3, role: 'player', team: 'seal', healthOf: () => null },
    nameOf: (id: number) => `Player${id}`, rows: [], hostages: () => new Map(), gameType: () => null,
    screenUp: () => o.screenUp?.() ?? false,
  };
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud: new Hud(), loadouts: new PlayerLoadout(), view: () => null, map: () => null, body: () => null,
    net: () => (o.screenUp ? net as unknown as ReturnType<MatchFirearmDeps['net']> : null),
    blocked: () => o.blocked?.() ?? false, refreshFog: () => {},
  });
  /** The raise's trigger feed (`Play`'s weapon input: `Fire.padHeldRead`). */
  const feed = (): boolean => (play as unknown as { weaponInput: () => { trigger: boolean } }).weaponInput().trigger;
  /** One page frame in `main.ts`'s order: the kit (before the raise ticks), then the fire's step. */
  const frame = (): void => { firearm.kitFrame(GAME_FRAME_DT, true); firearm.fireFrame(GAME_FRAME_DT, true); };
  return { firearm, feed, frame };
}

describe('RAISE-1577: a trigger held through a gate counts as held once the gate lifts', () => {
  it('RED: pressed while blocked (the loading screen\'s completion hold), held through the unblock: held on the first unblocked frame, the raise\'s edge 0 -> 2', () => {
    let blocked = true;
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame } = rig({ blocked: () => blocked });
    firearm.trigger(true);                                // dropped: the gate is shut
    frame(); frame();
    expect(pull).not.toHaveBeenCalled();                  // nothing fires or counts while blocked
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(feed()).toBe(false);
    blocked = false;                                      // R1 still down, no new edge from the page's feed
    firearm.kitFrame(GAME_FRAME_DT, true);                // the first unblocked frame, before the raise ticks
    expect(firearm.fire.triggerHeld()).toBe(true);        // was: false -- the level lost with the dropped press
    expect(pull).toHaveBeenCalledTimes(1);
    firearm.fireFrame(GAME_FRAME_DT, true);               // the kit's first read of the held pad
    expect(feed()).toBe(true);
    expect(nextEdge(0, feed())).toBe(2);                  // the raise's edge: pressed, the rifle asked up
  });
  it('RED: pressed under the round screens, held as they come down: held on the first frame after', () => {
    let up = true;
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame } = rig({ screenUp: () => up });
    firearm.trigger(true);
    frame();
    expect(pull).not.toHaveBeenCalled();
    up = false;
    firearm.kitFrame(GAME_FRAME_DT, true);
    expect(firearm.fire.triggerHeld()).toBe(true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(feed()).toBe(true);
  });
  it('a release during the block is a release: nothing held after it', () => {
    let blocked = true;
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame } = rig({ blocked: () => blocked });
    firearm.trigger(true);
    frame();
    firearm.trigger(false);
    frame();
    blocked = false;
    frame(); frame();
    expect(pull).not.toHaveBeenCalled();
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(feed()).toBe(false);
  });
  it('RED: the loading hold\'s level (`holdLevel`, fed by `padFrame` under the hold): held through it is held after; let go in it is not', () => {
    let blocked = true;
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, frame } = rig({ blocked: () => blocked });
    const f = firearm as unknown as { holdLevel: (down: boolean) => void };
    f.holdLevel(true);
    frame();
    expect(pull).not.toHaveBeenCalled();
    blocked = false;
    firearm.kitFrame(GAME_FRAME_DT, true);
    expect(firearm.fire.triggerHeld()).toBe(true);
    firearm.trigger(false);
    blocked = true;
    f.holdLevel(true);
    f.holdLevel(false);                                   // let go inside the hold
    blocked = false;
    frame();
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(pull).toHaveBeenCalledTimes(1);
  });
  it('a press caught up once -- a page edge on the same frame is not pulled twice', () => {
    let blocked = true;
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm } = rig({ blocked: () => blocked });
    firearm.trigger(true);
    blocked = false;
    firearm.trigger(true);                                // the page's own edge got through first
    firearm.kitFrame(GAME_FRAME_DT, true);
    expect(pull).toHaveBeenCalledTimes(1);
  });
  it('RED: `main.ts`\'s `padFrame` hands the firearm the pad\'s level under the loading hold', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
    const start = src.indexOf('function padFrame(');
    const hold = src.slice(src.indexOf('if (loadingJoin.blocked) {', start), src.indexOf('return;', start));
    expect(hold).toContain('firearm.holdLevel(padMerged.fire)');
  });
  it('RED: the match page (`./matchMount`) hands the firearm THIS frame\'s merged level under its hold, for any page', () => {
    // seat-shots' glance F1 / F1b: the served page runs its own copy of `padFrame`'s hold. `humanHeld` is written only with a
    // Forge play port (undefined on a plain served match) and before this frame's pad is read, so the level must be the
    // merged pad's, set after the hold's flush, as `./main` :1747 does with `padMerged.fire`.
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/matchMount.ts'), 'utf-8');
    const flush = src.indexOf('({ merged: padMerged, game: padGame } = flushedPad(');
    expect(flush).toBeGreaterThan(0);
    const after = src.slice(flush, src.indexOf('fireModeInputFor(', flush));
    expect(after).toContain('if (held) firearm.holdLevel(padMerged.fire)');
    expect(src).not.toContain('holdLevel(humanHeld');
  });
});
