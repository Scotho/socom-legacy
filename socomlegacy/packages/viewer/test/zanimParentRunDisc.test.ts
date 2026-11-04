// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import type { EffectProgram } from '@s2u/scene';
import type { EffectRun } from '../src/effectRunner';
import { loadMap } from '../src/loadMap';
import { buildPageWorld, type PageWorldHooks } from '../src/matchWorld';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * PAR-92 B2 at run time (PARITY-2; research 319 §4.1, §4.2 U4): the world's three `placeRefs` calls -- `runDisplay`
 * (no scope), `executeAction` (the action's node) and `CALL_ANIMATION` (the caller's root) -- read each reference's
 * parent (`ZANIM_PARENT_SCOPE_READING`; `FUN_0026f4e0` D:L118221-118228: a non-zero parent is resolved first and the
 * name looked up beneath it only). Off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and
 * said so -- without it), on the only maps whose run-time placements a parent moves (research 319 §4.2's reach):
 *
 * - MP62's `gate_openclose2` (ENOWAPI's two wood-gate switches, `woodgate` and `woodgate2`): its reference 6
 *   `gatehand` has parent 5 `lever_3`, the handle its `relatedopen` sequence turns -- `lever_3`'s, not the root
 *   `lever_2`'s; its reference 2 `gatehand` (parent 0, search 1) stays `lever_2`'s.
 * - MP11's and MP62's `action_reset`: each `gatehand` (parent `lever_N`) beneath its own lever, not all at `lever_1`'s;
 *   and the room's map saves each of them (`MapMeta.initial`, its transform).
 *
 * The world runs no motion command (`OBJECT_MOTION_FROM_TO` falls through its host, `worldState.ts` `sceneHost`), so
 * what is asserted is the node each reference of the run names (the run's context, `EffectRun.context.nodes`) -- the
 * node a motion would turn. The room is `simMapFromBytes` + `WorldState` (as `match/src/room.ts` builds it); the
 * page is `loadMap` + `buildPageWorld` (`matchWorld.ts`), the same command, and must name the same nodes.
 * `action_reset` (a pause only, never started by an action) is started through `runDisplay`, the world's one entry
 * that starts a set program by name with no scope; `CALL_ANIMATION` through a hand-built caller run on the disc's world.
 * LATER 409 (AS-1): MP62's `action_reset` is flags 0x21 -- kind 1, so its set's activation starts it at load
 * (`FUN_002713f0` D:L119327-119333: an instance idle or done, kind 1; research 106's reading of the set activation,
 * research 237 §0), and the page's world runs it already (`WorldState.startAutostarts`, the same `placeRefs` with no
 * scope); its references are read off that run. MP11's is flags 0x22 (kind 2) and the room's world runs no autostart:
 * both start it by name.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['MP11', 'MP62'].every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

const hand = (lever: number): string => `worldmodel/lever_${lever}/gateswitch=gateswitch/gatehand`;
type Ctx = { root: string | null; nodes: readonly (string | null)[] };
/** The world's running programs (private: read here for the run's context, which is what a reference resolved to). */
const runsOf = (world: WorldState): EffectRun[] => (world as unknown as { runs: { run: EffectRun }[] }).runs.map((r) => r.run);
const lastRun = (world: WorldState, name: string): Ctx => {
  const run = runsOf(world).filter((r) => r.program.name === name).pop();
  expect(run, `a run of ${name}`).toBeDefined();
  return run!.context as Ctx;
};
const room = (stem: string): WorldState => {
  const map = simMapFromBytes(new Uint8Array(readFileSync(join(DISC, 'RUN', `${stem}.ZDB`))), `RUN/${stem}.ZDB`, null);
  return new WorldState(map.meta!, map.ground, map.grid);
};
const page = async (stem: string): Promise<WorldState> => {
  const noop = (): void => {};
  const hooks = { setNodeActive: noop, setNodeOpacity: noop, sound: noop, effect: noop, log: noop } as unknown as PageWorldHooks;
  return buildPageWorld(await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`), hooks)!.world;
};
/** A hand-built caller: one `CALL_ANIMATION` of `anim`, run with no root (the world's `call`, `worldState.ts`). */
const caller = (anim: string): EffectProgram => ({ name: 'par92_caller', root: 0, flags: 0x22, nodes: ['NA'], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'call', anim }] }] });

describe.skipIf(!HAVE_DISC)(`PAR-92 B2 at run time: a reference's parent in the room's and the page's world${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  for (const [valve, panel] of [['woodgate', 'epanel_di2'], ['woodgate2', 'epanel_di3']] as const) {
    it(`MP62: the ${panel} switch (${valve}) runs gate_openclose2 -- reference 6 is lever_3's gatehand, reference 2 lever_2's; the page names the same`, async () => {
      const worlds = [room('MP62'), await page('MP62')];
      const named: Ctx[] = [];
      for (const world of worlds) {
        expect(world.executeAction(valve)).toBe(true);
        const ctx = lastRun(world, 'gate_openclose2');
        expect(ctx.root).toBe('worldmodel/lever_2');
        expect(ctx.nodes[2], 'reference 2, gatehand beneath the root (parent 0, search 1)').toBe(hand(2));
        expect(ctx.nodes[5]).toBe('worldmodel/lever_3');
        expect(ctx.nodes[6], 'reference 6, gatehand beneath its parent lever_3').toBe(hand(3));
        named.push(ctx);
      }
      expect(named[1]!.nodes, 'the page against the room').toEqual(named[0]!.nodes);
    }, 300_000);
  }

  it('MP62: CALL_ANIMATION gate_openclose2 places its reference 6 beneath lever_3 too (the world\'s call path)', () => {
    const world = room('MP62');
    world.runProgram(caller('gate_openclose2'), { root: null, nodes: [], caller: null, valve: null, silent: false });
    expect(lastRun(world, 'gate_openclose2').nodes[6]).toBe(hand(3));
  }, 300_000);

  // Which worlds start `action_reset` with the set (flags & 7 == 1): only MP62's page (the room runs no autostart).
  const autostarted = { MP11: [false, false], MP62: [false, true] } as const;
  for (const [stem, levers] of [['MP11', [1, 2]], ['MP62', [1, 2, 3]]] as const) {
    it(`${stem}: action_reset's gatehand references lie beneath their own levers (${levers.join(', ')}), and the room's map saves each`, async () => {
      // action_reset's references: lever_N at 5, 7, 9 and each gatehand, its parent, at 6, 8, 10 (research 319 §4.2 U4).
      const want = levers.map((n) => hand(n));
      const worlds = [room(stem), await page(stem)];
      const named: Ctx[] = [];
      for (const [i, world] of worlds.entries()) {
        expect(world.running('action_reset'), `${stem}: action_reset started with the set (${i ? 'page' : 'room'})`).toBe(autostarted[stem][i]);
        if (!autostarted[stem][i]) expect(world.runDisplay('action_reset')).toBe(true);
        const ctx = lastRun(world, 'action_reset');
        expect(levers.map((_, k) => ctx.nodes[6 + 2 * k]), `${stem}: each gatehand beneath its lever`).toEqual(want);
        named.push(ctx);
      }
      expect(named[1]!.nodes, 'the page against the room').toEqual(named[0]!.nodes);
      const saved = worlds[0]!.meta.initial.filter((e) => e.saveTransform).map((e) => e.path);
      for (const path of want) expect(saved, `${stem}: the room saves ${path}`).toContain(path);
    }, 300_000);
  }
});
