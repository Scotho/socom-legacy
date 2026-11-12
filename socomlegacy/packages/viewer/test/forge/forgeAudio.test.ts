import { describe, expect, it } from 'vitest';
import type { AudioStep } from '@s2u/creator-contracts';
import type { EffectProgram } from '@s2u/scene';
import { audioOfProgram, audioProgram, audioScriptSounds, forgeAmbientEmitters, forgeAudioEmitters } from '../../src/forge/forgeObjects';

/**
 * An ambient's audio script (the owner, 2026-11-10: "fully scriptable ... I don't want to have any custom behaviour"): the
 * game's own program commands one to one -- SOUND, WAIT with its random range, LOOP, WHILE / END_WHILE, IF / ELSEIF on
 * RANDOM_WEIGHT -- and its `~` sounds the emitters, as every ambient program's.
 */
describe('ambient audio scripts', () => {
  const path = 'forge/object_1';
  const steps: AudioStep[] = [
    { do: 'play', sound: '~FIRE_SM', from: 'MP6', volume: 3 },
    { do: 'if', chance: 0.25 }, { do: 'play', sound: '.LIGHTNING', from: 'MP61' }, { do: 'wait', seconds: 10 },
    { do: 'elseif', chance: 0.5 }, { do: 'play', sound: '.DIST_THUNDER', volume: 0.35 },
    { do: 'else' }, { do: 'wait', seconds: 6, random: 2 }, { do: 'endif' },
    { do: 'while' }, { do: 'wait', seconds: 1 }, { do: 'endWhile' },
    { do: 'loop' },
  ];

  it('compiles one to one to the game commands at the object', () => {
    const p = audioProgram(path, steps);
    expect(p.nodes).toEqual(['NA', path]);
    expect(p.root).toBe(1);
    expect(p.sequences[0]!.activation).toBe(1);
    expect(p.sequences[0]!.ops).toEqual([
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
      { op: 'wait', seconds: 1, range: 0, frames: null },
      { op: 'endWhile' },
      { op: 'loop', count: -1, seconds: null },
    ]);
    expect(audioProgram(path, [{ do: 'loop', times: 3 }]).sequences[0]!.ops).toEqual([{ op: 'loop', count: 3, seconds: null }]);
    expect(audioProgram(path, [{ do: 'loop', seconds: 30 }]).sequences[0]!.ops).toEqual([{ op: 'loop', count: null, seconds: 30 }]);
  });

  it("its `~` sounds are its emitters from the start, once each, at their volume; they stand in for its program's", () => {
    expect(forgeAudioEmitters(path, [1, 2, 3], [...steps, { do: 'play', sound: '~FIRE_SM' }])).toEqual([
      { anim: `${path}_audio`, sound: '~FIRE_SM', node: path, position: [1, 2, 3], volume: 3 },
    ]);
    const program = { name: 'flame_in_barrel', root: 'x', particles: true, sound: true, light: false, sounds: ['~FIRE_SM'], loops: [{ sound: '~FIRE_SM', volume: 1 }] };
    expect(forgeAmbientEmitters([{ kind: 'ambient', source: 'MP6', name: 'flame_in_barrel', at: [0, 0, 0], yaw: 0 }], () => program))
      .toEqual([{ anim: 'flame_in_barrel', sound: '~FIRE_SM', node: path, position: [0, 0, 0] }]);
    expect(forgeAmbientEmitters([{ kind: 'ambient', source: 'MP6', name: 'flame_in_barrel', at: [0, 0, 0], yaw: 0, audio: [{ do: 'play', sound: '.X' }] }], () => program)).toEqual([]);
  });

  it("a program's own sound commands become its script, where they are those commands alone", () => {
    const prog = (sequences: EffectProgram['sequences']): EffectProgram => ({ name: 'p', root: 1, flags: 1, nodes: ['NA', 'n'], sequences });
    // Sujo's lightning_flashes' shape: one sequence of IF on RANDOM_WEIGHT, SOUND, WAIT, LOOP -1.
    const lightning = prog([{ name: 's', activation: 1, ops: [
      { op: 'if', conditions: [{ kind: 'random', p: 0.2 }] }, { op: 'sound', sound: '.LIGHTNING', node: 1, volume: 1 }, { op: 'wait', seconds: 10, range: 0, frames: null },
      { op: 'else' }, { op: 'wait', seconds: 6, range: 0, frames: null }, { op: 'endif' }, { op: 'loop', count: -1, seconds: null },
    ] }]);
    expect(audioOfProgram(lightning, 'MP61')).toEqual({ whole: true, steps: [
      { do: 'if', chance: 0.2 }, { do: 'play', sound: '.LIGHTNING', from: 'MP61' }, { do: 'wait', seconds: 10 },
      { do: 'else' }, { do: 'wait', seconds: 6 }, { do: 'endif' }, { do: 'loop' },
    ] });
    // A fire's: its loop in a sequence of its own beside its particles; a trailing PAUSE_ANIMATION left out.
    const fire = prog([{ name: 'a', activation: 1, ops: [{ op: 'sound', sound: '~FIRE_SM', node: 1, volume: 3 }, { op: 'pauseAnimation', anim: 'NA' }] },
      { name: 'b', activation: 1, ops: [{ op: 'particles', source: {} as never }] }]);
    expect(audioOfProgram(fire, 'MP6')).toEqual({ whole: true, steps: [{ do: 'play', sound: '~FIRE_SM', from: 'MP6', volume: 3 }] });
    // A call among its sounds: not those commands alone -- its loops only.
    const called = prog([{ name: 'a', activation: 1, ops: [{ op: 'sound', sound: '~HUM', node: 1, volume: 1 }, { op: 'call', anim: 'x' }, { op: 'sound', sound: '.ZAP', node: 1, volume: 1 }] }]);
    expect(audioOfProgram(called, 'MP73')).toEqual({ whole: false, steps: [{ do: 'play', sound: '~HUM', from: 'MP73' }] });
  });

  it('lends each sound from its own map, the home map for one with none', () => {
    expect(audioScriptSounds(steps, 'MP2')).toEqual([{ from: 'MP6', names: ['~FIRE_SM'] }, { from: 'MP61', names: ['.LIGHTNING'] }, { from: 'MP2', names: ['.DIST_THUNDER'] }]);
  });
});
