// @vitest-environment node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadSimMap } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * LATER 976 (3) (the bodies seat, 2026-11-20; reading, pending review): what ends a multiplayer switch's use. The original
 * refuses a second use only while the action's program runs (`FUN_002b44e0` D:L156798) or, for a `one_shot` record, once a
 * run has completed (D:L156799-156800), and no multiplayer record carries `one_shot`; the record's `+0x3f` bit 1 stops a
 * second SCORE only (D:L160627-160646). So a disc switch's use ends where its own program turns its node off -- the pick
 * then finds nothing -- and a switch whose node is on again once its program has ended is used again. Here, on the disc,
 * every multiplayer SWITCH record that takes the room's generic path (not a gate lever, not a crane control) is run to its
 * program's end: eight keep their node off; MP73's two radios turn off their shared parent `radio_call`, which their
 * program turns back on (research 174 s5), so they are called again (match `roomSwitchAgain.devdisc.test.ts`). The room
 * and the page follow that (no blanket once-a-round use for a disc switch). Dev-disc test.
 */
const DISC = process.env.SOCOM_DISC;
const MAPS = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];
const has = !!DISC && MAPS.every((m) => existsSync(resolve(DISC, `RUN/${m}.ZDB`)));

describe.skipIf(!has)(`LATER 976 (3): what ends a multiplayer switch's use${has ? '' : ' (SOCOM_DISC with the 22 MP maps absent)'}`, () => {
  it('run to its end, every generic SWITCH keeps its node off but MP73\'s two radios, which come back on', async () => {
    const off: string[] = [], on: string[] = [];
    for (const stem of MAPS) {
      const m = await loadSimMap(new FsAssetSource(DISC!), `RUN/${stem}.ZDB`);
      const actions = m.meta?.actions ?? [];
      const levers = new Set((m.gates ?? []).flatMap((g) => g.levers.map((l) => l.action)));
      const cranes = new Set((m.cranes ?? []).map((c) => c.control.valve.toLowerCase()));
      for (const [i, a] of actions.entries()) {
        if (a.typeCode !== 2 || levers.has(i) || cranes.has(a.valve.toLowerCase())) continue;
        expect(a.oneShot ?? false, `${stem} ${a.node}: no multiplayer record is one_shot`).toBe(false);
        const world = new WorldState(m.meta!, m.ground, m.grid);
        world.applyInitial();
        expect(world.isActive(a.path), `${stem} ${a.node}: on before its use`).toBe(true);
        expect(world.executeAction(a.valve), `${stem} ${a.node}: its program starts`).toBe(true);
        let t = 0;
        for (; world.busy && t < 120; t += 1 / 30) world.step(1 / 30);
        expect(world.busy, `${stem} ${a.node}: its program ended within 120 s`).toBe(false);
        (world.isActive(a.path) ? on : off).push(`${stem}:${a.node}`);
      }
    }
    console.log(`LATER 976 (3): off after the run ${off.join(' ')}; on again ${on.join(' ')}`);
    expect(off).toEqual(['MP61:radio_call_1', 'MP61:radio_call_2', 'MP62:epanel_light_di', 'MP62:radio_call_1', 'MP62:radio_call_2',
      'MP72:seal_callstrike_1', 'MP72:terrorist_callstrike_1', 'MP82:radio_call']);
    expect(on).toEqual(['MP73:radio_call_1', 'MP73:radio_call_2']);
  }, 600_000);
});
