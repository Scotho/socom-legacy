// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { M67, type V3 } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { GrenadeThrower } from '../src/grenade';
import { groundGrid } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';
import { type PlaySnapshot } from '../src/walk';
import { forkGround, WorldState } from '../src/worldState';

/**
 * LATER 851 on the page (research 85 §5.2): the page's own copy, offline, hands every contact -- bounce or pass -- to the
 * struck node, as the room's `sceneContact` does (`FUN_003c8f50` D:L319747-319750 -> `FUN_00273a50` -> `FUN_003c7490`'s
 * impact branch: the M67's 0.2 x 14 = 2.8 on a health-1 pane). Online the room applies it and the page's copy is
 * presentation (as `explode`'s blast, LATER 102). Frostfire's `bdoor_4` pane (the fixture; research 176 s4.1).
 */
const MP2 = fixture('RUN/MP2.ZDB');
const PANE = 'worldmodel/bdoor_4/door1=door1/door_slab/pane1';

describe(`LATER 851: the page's own M67 through Frostfire's bdoor_4 pane${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2).each([false, true])('offline it breaks the pane at the pass, before the fuse; online (%s) the page leaves it to the room', (online) => {
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB');
    const ground = forkGround(map.ground);
    const grid = groundGrid(ground);
    const w = new WorldState(map.meta!, ground, grid, {});
    w.applyInitial();
    const id = w.health.list.findIndex((d) => d.targetPath === PANE);
    expect(w.health.hp(id)).toBe(1);
    const from: V3 = [582.257, 157.312, 1135];
    const g = new GrenadeThrower({
      grid: () => grid, view: () => 'third', online: () => online,
      snapshot: () => ({ feet: [from[0], 142, from[2]], yaw: 0, pitch: 0, stance: 'stand', airborne: false } as PlaySnapshot),
    });
    g.setWorld(() => w);
    const booms: string[] = [];
    g.on('explode', (e) => booms.push(e.item));
    g.launchRound(M67, from, [0, 0, -200]);
    for (let i = 0; i < 30; i++) g.update(1 / 60);                     // half a second: past the pane, the fuse 3 s off
    expect(booms).toEqual([]);
    expect(w.isActive(PANE)).toBe(online);
    expect(w.health.hp(id)).toBe(online ? 1 : 0);
    g.clearAir();
  });
});
