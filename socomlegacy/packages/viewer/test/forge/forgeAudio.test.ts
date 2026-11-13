import { describe, expect, it } from 'vitest';
import { scriptOfAudio, type ScriptStep } from '@s2u/creator-contracts';
import type { EffectProgram } from '@s2u/scene';
import { forgeAmbientEmitters, forgeScriptEmitters, scriptObjectData, scriptOfProgram } from '../../src/forge/forgeObjects';
import { FORGE_SCRIPT_SELF_START_FLAGS, scriptPrograms, type ScriptResolve } from '../../src/forge/placedAccess';
import { lentScriptAssets } from '../../src/forge/scriptAssets';

/**
 * The one script (the owner, 2026-11-13: "one script format ... a fully generic scripting way of doing things that is
 * unified"): an effect object's steps are a switch's and a trigger's -- the game's own program commands one to one, SOUND,
 * CALL, WAIT with its random range, LOOP, WHILE / END_WHILE, IF / ELSEIF on RANDOM_WEIGHT or a flag -- made a
 * self-starting program at the object, and its `~` sounds the emitters, as every ambient program's.
 */
describe('the one script on an effect object', () => {
  const path = 'forge/object_1';
  const steps: ScriptStep[] = [
    { do: 'sound', name: '~FIRE_SM', from: 'MP6', volume: 3 },
    { do: 'if', chance: 0.25 }, { do: 'sound', name: '.LIGHTNING', from: 'MP61' }, { do: 'wait', seconds: 10 },
    { do: 'elseif', chance: 0.5 }, { do: 'sound', name: '.DIST_THUNDER', volume: 0.35 },
    { do: 'else' }, { do: 'wait', seconds: 6, random: 2 }, { do: 'end' },
    { do: 'while' }, { do: 'effect', name: 'fire_explode_med' }, { do: 'wait', seconds: 1 }, { do: 'endWhile' },
    { do: 'loop' },
  ];
  const resolve: ScriptResolve = { target: () => null, barrierValve: () => null, action: () => null };

  it('compiles one to one to the game commands at the object, a self-starting program', () => {
    const { main } = scriptPrograms('forge_object_1', path, { steps }, resolve, FORGE_SCRIPT_SELF_START_FLAGS);
    expect(main.nodes).toEqual(['NA', path]);
    expect(main.root).toBe(1);
    expect(main.flags & 3).toBe(1);
    expect(main.sequences[0]!.activation).toBe(1);
    expect(main.sequences[0]!.ops).toEqual([
      { op: 'sound', sound: '~FIRE_SM', node: 1, volume: 3, newPlay: true },
      { op: 'if', conditions: [{ kind: 'random', p: 0.25 }] },
      { op: 'sound', sound: '.LIGHTNING', node: 1, volume: 1, newPlay: true },
      { op: 'wait', seconds: 10, range: 0, frames: null },
      { op: 'elseif', conditions: [{ kind: 'random', p: 0.5 }] },
      { op: 'sound', sound: '.DIST_THUNDER', node: 1, volume: 0.35, newPlay: true },
      { op: 'else' },
      { op: 'wait', seconds: 6, range: 2, frames: null },
      { op: 'endif' },
      { op: 'while', forever: true },
      { op: 'call', anim: 'fire_explode_med' },
      { op: 'wait', seconds: 1, range: 0, frames: null },
      { op: 'endWhile' },
      { op: 'loop', count: -1, seconds: null },
    ]);
    const one = (s: ScriptStep[]) => scriptPrograms('x', path, { steps: s }, resolve).main.sequences[0]!.ops;
    expect(one([{ do: 'loop', times: 3 }])).toEqual([{ op: 'loop', count: 3, seconds: null }]);
    expect(one([{ do: 'loop', seconds: 30 }])).toEqual([{ op: 'loop', count: null, seconds: 30 }]);
    // A switch's own flag test, unchanged.
    expect(one([{ do: 'if', flag: 'power', equals: 1 }, { do: 'end' }])[0]).toEqual({ op: 'if', conditions: [{ kind: 'valve', valve: 'forge_flag_power', operation: 2, operand: 1 }] });
  });

  it("its `~` sounds are its emitters from the start, once each, at their volume; they stand in for its program's", () => {
    expect(forgeScriptEmitters(path, [1, 2, 3], [...steps, { do: 'sound', name: '~FIRE_SM' }])).toEqual([
      { anim: `${path}_script`, sound: '~FIRE_SM', node: path, position: [1, 2, 3], volume: 3 },
    ]);
    const program = { name: 'flame_in_barrel', root: 'x', particles: true, sound: true, light: false, sounds: ['~FIRE_SM'], loops: [{ sound: '~FIRE_SM', volume: 1 }] };
    expect(forgeAmbientEmitters([{ kind: 'ambient', source: 'MP6', name: 'flame_in_barrel', at: [0, 0, 0], yaw: 0 }], () => program))
      .toEqual([{ anim: 'flame_in_barrel', sound: '~FIRE_SM', node: path, position: [0, 0, 0] }]);
    expect(forgeAmbientEmitters([{ kind: 'ambient', source: 'MP6', name: 'flame_in_barrel', at: [0, 0, 0], yaw: 0, script: { steps: [{ do: 'sound', name: '.X' }] } }], () => program)).toEqual([]);
  });

  it("a program's own sound commands become its script, where they are those commands alone", () => {
    const prog = (sequences: EffectProgram['sequences']): EffectProgram => ({ name: 'p', root: 1, flags: 1, nodes: ['NA', 'n'], sequences });
    // Sujo's lightning_flashes' shape: one sequence of IF on RANDOM_WEIGHT, SOUND, WAIT, LOOP -1.
    const lightning = prog([{ name: 's', activation: 1, ops: [
      { op: 'if', conditions: [{ kind: 'random', p: 0.2 }] }, { op: 'sound', sound: '.LIGHTNING', node: 1, volume: 1 }, { op: 'wait', seconds: 10, range: 0, frames: null },
      { op: 'else' }, { op: 'wait', seconds: 6, range: 0, frames: null }, { op: 'endif' }, { op: 'loop', count: -1, seconds: null },
    ] }]);
    expect(scriptOfProgram(lightning, 'MP61')).toEqual({ whole: true, steps: [
      { do: 'if', chance: 0.2 }, { do: 'sound', name: '.LIGHTNING', from: 'MP61' }, { do: 'wait', seconds: 10 },
      { do: 'else' }, { do: 'wait', seconds: 6 }, { do: 'end' }, { do: 'loop' },
    ] });
    // A fire's: its loop in a sequence of its own beside its particles; a trailing PAUSE_ANIMATION left out.
    const fire = prog([{ name: 'a', activation: 1, ops: [{ op: 'sound', sound: '~FIRE_SM', node: 1, volume: 3 }, { op: 'pauseAnimation', anim: 'NA' }] },
      { name: 'b', activation: 1, ops: [{ op: 'particles', source: {} as never }] }]);
    expect(scriptOfProgram(fire, 'MP6')).toEqual({ whole: true, steps: [{ do: 'sound', name: '~FIRE_SM', from: 'MP6', volume: 3 }] });
    // A call among its sounds: not those commands alone -- its loops only.
    const called = prog([{ name: 'a', activation: 1, ops: [{ op: 'sound', sound: '~HUM', node: 1, volume: 1 }, { op: 'call', anim: 'x' }, { op: 'sound', sound: '.ZAP', node: 1, volume: 1 }] }]);
    expect(scriptOfProgram(called, 'MP73')).toEqual({ whole: false, steps: [{ do: 'sound', name: '~HUM', from: 'MP73' }] });
  });

  it("an older file's audio script reads into the one script", () => {
    expect(scriptOfAudio([
      { do: 'play', sound: '~FIRE_SM', from: 'MP6', volume: 3 }, { do: 'if', chance: 0.5 }, { do: 'effect', effect: 'dust', from: 'MP1' },
      { do: 'endif' }, { do: 'wait', seconds: 2, random: 1 }, { do: 'loop' },
    ])).toEqual([
      { do: 'sound', name: '~FIRE_SM', from: 'MP6', volume: 3 }, { do: 'if', chance: 0.5 }, { do: 'effect', name: 'dust', from: 'MP1' },
      { do: 'end' }, { do: 'wait', seconds: 2, random: 1 }, { do: 'loop' },
    ]);
  });

  it("a single sound's or effect's tile starts its object running it, then again", () => {
    expect(scriptObjectData({ kind: 'ambient', source: 'MP2', name: '=effect:fire_explode_med' }))
      .toEqual({ kind: 'ambient', source: 'MP2', name: '=script', script: { steps: [{ do: 'effect', name: 'fire_explode_med', from: 'MP2' }, { do: 'wait', seconds: 5 }, { do: 'loop' }] } });
    expect(scriptObjectData<{ kind: 'ambient'; source: string; name: string; script?: { steps: ScriptStep[] } }>({ kind: 'ambient', source: 'MP2', name: '=sound:~WIND' }).script).toEqual({ steps: [{ do: 'sound', name: '~WIND', from: 'MP2' }] });
  });

  it('lends each sound from its own map, the home map for one with none, and an effect from another map', () => {
    expect(lentScriptAssets(steps, 'MP2')).toEqual({
      sounds: [{ from: 'MP2', names: ['.DIST_THUNDER'] }, { from: 'MP6', names: ['~FIRE_SM'] }, { from: 'MP61', names: ['.LIGHTNING'] }],
      effects: [],
    });
  });
});
