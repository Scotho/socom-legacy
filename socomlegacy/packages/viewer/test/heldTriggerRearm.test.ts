// @vitest-environment jsdom
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
 * RAISE-1577, the fix forward (LATER 1577 reopened; PC 4's rendered NEXT-SMOKE9-RAISE at next): R1 held across the
 * round's spawn and across a round's end dropped the raise for good. The original (RAISEGATE-WRITER-BP-r0004, a capture):
 * at a round's end with R1 held the pad's edge byte ctl+0x118 reads 03 -> 00 -> 02 -> 01 -- the held button RE-ARMED as a
 * fresh edge with no new press -- and the rifle is up 4 frames into the new round. The firearm's `rearm` lets the held
 * trigger go and keeps its level (`gatedHeld`), so `kitFrame`'s hand-over presses it afresh on the first open frame; the
 * dead keep the level as the other gates do. `test/heldTriggerGate.test.ts`'s rig, with the walker's death and the round
 * screens in the test's hand.
 */

afterEach(() => { vi.restoreAllMocks(); });

function rig() {
  const scene = new Scene();
  const fly = new FlyCamera(document.createElement('canvas'));
  const walk = new WalkMode(fly);
  const play = new Play();
  const remote = new RemotePlayers(scene);
  const s = { dead: false, screen: false };
  vi.spyOn(walk, 'isDead').mockImplementation(() => s.dead);
  const net = {
    client: { id: 3, role: 'player', team: 'seal', healthOf: () => null },
    nameOf: (id: number) => `Player${id}`, rows: [], hostages: () => new Map(), gameType: () => null,
    screenUp: () => s.screen,
    roundSeq: () => null,                                // NetPage.roundSeq: an unwired page's (the spawn's kit asks it)
  };
  const firearm = mountFirearm({
    scene, fly, walk, play, remote, hud: new Hud(), loadouts: new PlayerLoadout(), view: () => null, map: () => null, body: () => null,
    net: () => net as unknown as ReturnType<MatchFirearmDeps['net']>, blocked: () => false, refreshFog: () => {},
  });
  /** The raise's trigger feed (`Play`'s weapon input: `Fire.padHeldRead`). */
  const feed = (): boolean => (play as unknown as { weaponInput: () => { trigger: boolean } }).weaponInput().trigger;
  /** One page frame in `main.ts`'s order: the kit (before the raise ticks), then the net's step, then the fire's. */
  const frame = (): void => { firearm.kitFrame(GAME_FRAME_DT, true); firearm.beforeNet(); firearm.fireFrame(GAME_FRAME_DT, true); };
  const rearm = (): void => { (firearm as unknown as { rearm: () => void }).rearm(); };
  return { firearm, feed, frame, rearm, s };
}

describe('RAISE-1577 fix forward: a held R1 re-armed as a fresh edge at the spawn and across a round end', () => {
  it('RED: pressed while dead, held through the respawn: pressed afresh on the first walking frame, the raise\'s edge 0 -> 2', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame, s } = rig();
    s.dead = true;
    firearm.trigger(true);                                // the dead fire nothing (`FUN_00592560`) -- the level kept
    frame(); frame();
    expect(pull).not.toHaveBeenCalled();
    expect(firearm.fire.triggerHeld()).toBe(false);
    firearm.spawnKit('seal');                             // the room's respawn (`./matchNet` `respawned`)
    s.dead = false;
    expect(feed()).toBe(false);
    firearm.kitFrame(GAME_FRAME_DT, true);                // the first open frame, before the raise ticks
    expect(pull).toHaveBeenCalledTimes(1);                // was: never -- the press dropped with no level kept
    expect(firearm.fire.triggerHeld()).toBe(true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(feed()).toBe(true);
    expect(nextEdge(0, feed())).toBe(2);
  });

  it('RED: held and raised alive, then the spawn\'s fresh kit: let go one read (00), then pressed afresh (02)', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame } = rig();
    firearm.trigger(true);
    frame(); frame();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(feed()).toBe(true);
    firearm.spawnKit('seal');                             // a round's spawn: `refill` lets the trigger go
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(feed()).toBe(false);                           // the 00 read
    firearm.kitFrame(GAME_FRAME_DT, true);
    expect(pull).toHaveBeenCalledTimes(2);                // was: 1 -- the level lost with the refill
    expect(firearm.fire.triggerHeld()).toBe(true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(feed()).toBe(true);                            // the 02: the rifle asked up
  });

  it('RED: held through a round end -- the round screens, the victory release (`rearm`), the next spawn: re-armed and raised', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame, rearm, s } = rig();
    firearm.trigger(true);
    frame();
    expect(pull).toHaveBeenCalledTimes(1);
    s.screen = true;                                      // ROUND COMPLETE: the screens let the firearm go (OBF-31)
    frame();
    expect(firearm.fire.triggerHeld()).toBe(false);
    rearm();                                              // the victory dance's release, R1 still down (`./matchActions`)
    frame();
    firearm.spawnKit('seal');                             // the next round's spawn
    s.screen = false;
    firearm.kitFrame(GAME_FRAME_DT, true);
    expect(pull).toHaveBeenCalledTimes(2);                // was: 1 -- the level cleared by `held()` and the screens
    expect(firearm.fire.triggerHeld()).toBe(true);
    firearm.fireFrame(GAME_FRAME_DT, true);
    expect(feed()).toBe(true);
  });

  it('a let-go inside the round end is a let-go: nothing pressed after the spawn', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, feed, frame, rearm, s } = rig();
    firearm.trigger(true);
    frame();
    s.screen = true;
    frame();
    rearm();
    firearm.trigger(false);                               // R1 let go under the screens
    frame();
    firearm.spawnKit('seal');
    s.screen = false;
    frame(); frame();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(firearm.fire.triggerHeld()).toBe(false);
    expect(feed()).toBe(false);
  });

  it('`rearm` with nothing held is nothing: no press at the next frame', () => {
    const pull = vi.spyOn(Fire.prototype, 'pull');
    const { firearm, frame, rearm } = rig();
    rearm();
    firearm.spawnKit('seal');
    frame(); frame();
    expect(pull).not.toHaveBeenCalled();
    expect(firearm.fire.triggerHeld()).toBe(false);
  });
});
