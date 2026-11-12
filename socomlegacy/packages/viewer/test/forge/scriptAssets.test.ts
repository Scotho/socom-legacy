import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { EffectProgram } from '@s2u/scene';
import { COMMON_SCRIPT_EFFECTS, commonScriptNames, lentAccessAssets, lentScriptAssets, mergeLent, scriptEffectsOf, scriptSoundsOf, scriptSteps } from '../../src/forge/scriptAssets';

/** A program of one sequence (`EffectProgram`): rooted at `root`, its ops as given. */
const prog = (name: string, root: number, ops: EffectProgram['sequences'][number]['ops']): EffectProgram =>
  ({ name, root, flags: 0, nodes: ['NA', 'node'], sequences: [{ name: 's', activation: 1, ops }] });
const particles = { op: 'particles', source: { textures: [] } } as never;

describe("a switch's sounds and effects from any map (the owner, 2026-11-10)", () => {
  it("a map's sounds: its programs' SOUND names, each once, sorted", () => {
    const ps = [prog('a', 1, [{ op: 'sound', sound: '.EXP_2', node: 1, volume: 1 }, { op: 'sound', sound: '.ALARM', node: 1, volume: 1 }]),
      prog('b', 1, [{ op: 'sound', sound: '.EXP_2', node: 1, volume: 1 }])];
    expect(scriptSoundsOf(ps)).toEqual(['.ALARM', '.EXP_2']);
  });

  it("a map's effects: the common ones it calls, its own node-less drawing programs; never one rooted at its own node", () => {
    const ps = [
      prog('switch1', 1, [{ op: 'call', anim: 'spark_shower' }, { op: 'call', anim: 'boom' }]),   // spark_shower: the common set's
      prog('boom', 0, [{ op: 'call', anim: 'smoke' }]),            // node-less, draws through a call
      prog('smoke', 0, [particles]),                               // node-less, draws
      prog('lamp_glow', 1, [particles]),                           // its own node's: left out
      prog('quiet', 0, [{ op: 'wait', seconds: 1, range: 0, frames: null }]),   // node-less, draws nothing
    ];
    expect(scriptEffectsOf(ps)).toEqual([...new Set([...COMMON_SCRIPT_EFFECTS, 'boom', 'smoke', 'spark_shower'])].sort());
    expect(scriptEffectsOf([])).toEqual([...COMMON_SCRIPT_EFFECTS].sort());
  });

  it('lends each sound by its map (the base for one with none), and only the effects taken from another map, each once', () => {
    const steps = scriptSteps([
      { script: { steps: [{ do: 'sound', name: '.EXP_1' }, { do: 'sound', name: '.ALARM', from: 'MP72' }, { do: 'effect', name: 'boom', from: 'mp6' },
        { do: 'effect', name: 'boom', from: 'MP6' }, { do: 'effect', name: 'smoke', from: 'MP6' }, { do: 'sound', name: '.HORN', from: 'MP2' }] } },
      {},
    ]);
    expect(lentScriptAssets(steps, 'MP2')).toEqual({ sounds: [{ from: 'MP2', names: ['.EXP_1', '.HORN'] }, { from: 'MP72', names: ['.ALARM'] }], effects: [{ from: 'MP6', names: ['boom', 'smoke'] }] });
    expect(lentScriptAssets([], 'MP2')).toEqual({ sounds: [], effects: [] });
  });

  it("an explosion lends Demolition's base_explosion1 from MP1 (MPBOMB's record and its satchel come with it); MP1 itself lends none", () => {
    expect(lentScriptAssets([{ do: 'blast' }, { do: 'blast', at: { piece: 0 } }], 'MP2')).toEqual({ sounds: [], effects: [{ from: 'MP1', names: ['base_explosion1'] }] });
    expect(lentScriptAssets([{ do: 'blast' }], 'MP1')).toEqual({ sounds: [], effects: [] });
  });

  it("the Common category: what every map's list has, sorted; none of no maps", () => {
    expect(commonScriptNames([
      { sounds: ['.EXP_1', '.BELL', '~WIND'], effects: ['smoke', 'boom'] },
      { sounds: ['~WIND', '.EXP_1'], effects: ['boom', 'smoke', 'f18contrail'] },
      { sounds: ['.EXP_1', '~WIND', '.CHOP'], effects: ['smoke'] },
    ])).toEqual({ sounds: ['.EXP_1', '~WIND'], effects: ['smoke'] });
    expect(commonScriptNames([])).toEqual({ sounds: [], effects: [] });
  });

  it("a copied trigger from another map lends its deaths' sounds and the effects its own set lacks; the base's own lends none", () => {
    const death = prog('truck1', 1, [{ op: 'sound', sound: '.EXP_3', node: 1, volume: 1 }, { op: 'call', anim: 'truck_fire' }, { op: 'call', anim: 'truck1_wreck' }]);
    const copies = [
      { lib: { archive: 'MP6' }, programs: [death], set: new Set(['truck1', 'truck1_wreck']) },
      { lib: { archive: 'MP2' }, programs: [prog('own', 1, [{ op: 'sound', sound: '.OWN', node: 1, volume: 1 }])], set: new Set<string>() },
    ];
    const lent = lentAccessAssets(copies, 'MP2');
    expect(lent).toEqual({ sounds: [{ from: 'MP6', names: ['.EXP_3'] }], effects: [{ from: 'MP6', names: ['truck_fire'] }] });
    expect(mergeLent(lent, { sounds: [{ from: 'MP6', names: ['.ALARM', '.EXP_3'] }], effects: [{ from: 'MP6', names: ['boom'] }, { from: 'MP11', names: ['x'] }] }))
      .toEqual({ sounds: [{ from: 'MP6', names: ['.ALARM', '.EXP_3'] }], effects: [{ from: 'MP11', names: ['x'] }, { from: 'MP6', names: ['boom', 'truck_fire'] }] });
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))("a switch's sounds and effects from any map, on the disc (SOCOM_ISO)", () => {
  it("Crossroads' bank sounds and streams, and Desert Glory's effects, lent into Frostfire's match where it lacks them", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { soundFromDisc, bankSoundNames } = await import('../../src/soundData');
    const { effectsFromDisc, effectProgramsFromDisc } = await import('../../src/effectData');
    const { parseBankFile } = await import('@s2u/sound');
    const source = new IsoAssetSource(fsBlob(ISO!));
    const names = async (stem: string) => {
      const fx = await effectProgramsFromDisc(source, `RUN/${stem}.ZDB`);
      return { sounds: [...new Set([...await bankSoundNames(source, stem), ...scriptSoundsOf(fx.mission)])], effects: scriptEffectsOf(fx.all) };
    };
    const [n2, n72, n6] = [await names('MP2'), await names('MP72'), await names('MP6')];
    expect(n72.sounds.length).toBeGreaterThan(100);                      // every bank sound, not the programs' few
    const lacks = n72.sounds.filter((n) => !n2.sounds.includes(n));
    const bank = lacks.filter((n) => !n.startsWith('MUS') && !n.startsWith('^')).slice(0, 3), streams = lacks.filter((n) => n.startsWith('MUS')).slice(0, 2);
    expect(bank.length && streams.length).toBeTruthy();
    const sd = await soundFromDisc(source, 'RUN/MP2.ZDB', 'MP2', undefined, [{ from: 'MP72', names: [...bank, ...streams] }]);
    for (const n of bank) expect(sd.banks.some((b) => [...parseBankFile(b.bytes).names.keys()].some((x) => x.trim() === n) && (!b.only || b.only.some((o) => o.trim() === n))), n).toBe(true);
    for (const n of streams) expect(sd.lentStreams, n).toContain(n);
    const fx = n6.effects.filter((n) => !n2.effects.includes(n)).slice(0, 4);
    expect(fx.length).toBeGreaterThan(0);
    const ed = await effectsFromDisc(source, 'RUN/MP2.ZDB', 'MP2', [{ path: 'RUN/MP6.ZDB', names: fx }]);
    for (const n of fx) expect(ed.programs.some((p) => p.name.toLowerCase() === n.toLowerCase()), n).toBe(true);
  }, 240_000);
});
