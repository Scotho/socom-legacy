// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { ACTION_TYPE_CODES } from '../../src/mapActions';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout } from '../../src/forge/layout';
import { forgePlayRules, forgeRuleHost, ruleMapNames, ruleNamesOf } from '../../src/forge/matchRules';
import { sealForgeRules, type ForgeLayout } from '../../src/forge/rulesAuthoring';
import { startForgeMatch } from '../../src/forge/match';

/**
 * FCW-32 round 2, held item 1 (product track; a browser adaptation with no original, FORGE_PLAY_RULES_ADAPTATION): Play
 * runs the layout's rules with the map's doors and switches. The room's rule host is built with the loaded map's doors
 * (each door spec's scene node, as `room.ts`'s seam `door(id)` and its `interact` name them) and switches (each
 * `SWITCH` action record's valve, as its `interact` names one), so a door or switch the map has is accepted and one it
 * lacks is refused at enable by the host's own check, naming its code and field. A layout with no rules mode has no host.
 */

type Json = Record<string, unknown>;
/** A map holding one door `bdoor_4` and one switch `valve_a` (and a door's own record, which is no switch). */
const map = {
  doors: [{ index: 0, node: 'bdoor_4', path: 'scene/bdoor_4', valve: 'dv_4' }],
  meta: { actions: [
    { node: 'lever_1', type: 'SWITCH', typeCode: ACTION_TYPE_CODES['SWITCH'], valve: 'valve_a' },
    { node: 'bdoor_4', type: 'DOOR', typeCode: ACTION_TYPE_CODES['DOOR'], valve: 'dv_4' },
  ] },
} as unknown as LoadedMap;
/** A two-rule mode on a door and a switch: the switch opens the door, a round's start shuts it. */
const gate = (door: string, sw: string): Json => ({
  schema: 's2u-rules', vocabulary: 0, id: 'gate.run', name: 'Gate run',
  entities: { doors: [door], switches: [sw] },
  rules: [
    { id: 'pull', when: { event: 'interact', target: sw }, then: [{ do: 'door.open', door }] },
    { id: 'shut', when: 'round.start', then: [{ do: 'door.close', door }] },
  ],
});
const rules = (spec: Json) => ({ spec, seed: 7, params: {}, layout: {} });
/** A one-rule mode on a switch alone (no door): what a blank floor that leaked the metadata's switches would let through. */
const switchOnly = (sw: string): Json => ({
  schema: 's2u-rules', vocabulary: 0, id: 'switch.only', name: 'Switch only',
  entities: { switches: [sw] },
  rules: [{ id: 'pull', when: { event: 'interact', target: sw }, then: [{ do: 'message.show', text: 'pulled' }] }],
});

describe('FCW-32 round 2: the map\'s doors and switches, as the room names them', () => {
  it('reads each door by its scene node and each SWITCH record by its valve, once each; none on a map without them', () => {
    expect(ruleMapNames(map)).toEqual({ doors: ['bdoor_4'], switches: ['valve_a'] });
    expect(ruleMapNames({} as LoadedMap)).toEqual({ doors: [], switches: [] });
  });

  it('the host accepts a door and a switch the map has, and refuses one it lacks with its own diagnostic', () => {
    const names = ruleMapNames(map);
    expect(forgeRuleHost(rules(gate('bdoor_4', 'valve_a')), names).snapshot().state).toBe('pending');
    expect(() => forgeRuleHost(rules(gate('bdoor_9', 'valve_a')), names)).toThrow(/rules\.ENTITY_MISSING at entities\.doors\[0\]: The layout has no door bdoor_9/);
    expect(() => forgeRuleHost(rules(gate('bdoor_4', 'valve_z')), names)).toThrow(/rules\.ENTITY_MISSING at entities\.switches\[0\]: The layout has no switch valve_z/);
    // the blank floor: no doors and no switches, so a pack naming one is refused, never let through unchecked
    expect(() => forgeRuleHost(rules(gate('bdoor_4', 'valve_a')), ruleMapNames({} as LoadedMap))).toThrow(/rules\.ENTITY_MISSING/);
  });

  it('review F1: one derivation of the names -- a library-backed blank floor has none, though the library map metadata holds a switch and a door', () => {
    // `map` stands for the library's archive map: doors and a SWITCH record in its metadata. The blank floor plays on it with
    // none of its world (page.ts clears the doors), so Play and rules.test both name nothing for it; a map base names the map's.
    expect(ruleNamesOf({ kind: 'blank' }, map)).toEqual({ doors: [], switches: [] });
    expect(ruleNamesOf({ kind: 'map' }, map)).toEqual({ doors: ['bdoor_4'], switches: ['valve_a'] });
    expect(ruleNamesOf(null, map)).toEqual({ doors: [], switches: [] });
    expect(ruleNamesOf({ kind: 'map' }, null)).toEqual({ doors: [], switches: [] });
    // the same pack is refused alike on the blank floor by either path (Play's start takes `names`; rules.test takes the same value)
    const names = ruleNamesOf({ kind: 'blank' }, map);
    expect(() => forgeRuleHost(rules(gate('bdoor_4', 'valve_a')), names)).toThrow('rules.ENTITY_MISSING at entities.doors[0]: The layout has no door bdoor_4');
    // a switch-only pack: were the doors cleared but the metadata's switches leaked, this one would be let through
    expect(() => forgeRuleHost(rules(switchOnly('valve_a')), names)).toThrow('rules.ENTITY_MISSING at entities.switches[0]: The layout has no switch valve_a');
  });

  it('startForgeMatch builds its rule host with the loaded map\'s doors and switches: a door the map lacks refuses the Play', async () => {
    const start = (spec: Json): Promise<unknown> => startForgeMatch(document.createElement('div'), {
      map, clips: null, effects: null, sound: null, name: 'FORGE', rules: rules(spec),
    });
    await expect(start(gate('bdoor_9', 'valve_a'))).rejects.toThrow(/rules pack was refused: rules\.ENTITY_MISSING at entities\.doors\[0\]/);
    await expect(start(gate('bdoor_4', 'valve_z'))).rejects.toThrow(/rules\.ENTITY_MISSING at entities\.switches\[0\]/);
    // accepted, the start goes on to the room (this stand-in map has no hull: the room's own refusal, past the rules)
    await expect(start(gate('bdoor_4', 'valve_a'))).rejects.toThrow(/no hull/);
    // review F1: Play's blank floor hands its own (empty) names, though this map's metadata holds the switch
    const blank = ruleNamesOf({ kind: 'blank' }, map);
    await expect(startForgeMatch(document.createElement('div'), { map, clips: null, effects: null, sound: null, name: 'FORGE', rules: { ...rules(gate('bdoor_4', 'valve_a')), names: blank } }))
      .rejects.toThrow('rules.ENTITY_MISSING at entities.doors[0]: The layout has no door bdoor_4');
    await expect(startForgeMatch(document.createElement('div'), { map, clips: null, effects: null, sound: null, name: 'FORGE', rules: { ...rules(switchOnly('valve_a')), names: blank } }))
      .rejects.toThrow('rules.ENTITY_MISSING at entities.switches[0]: The layout has no switch valve_a');
  });
});

describe('FCW-32 round 2: the rules a layout plays', () => {
  const withRules = async (): Promise<ForgeLayout> => {
    let l = emptyLayout({ kind: 'blank', library: 'floor' });
    l = planForgeLayout(l, 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
    l = planForgeLayout(l, 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
    l = planForgeLayout(l, 'rules.set', { spec: {
      schema: 's2u-rules', vocabulary: 0, id: 'vault.run', name: 'Vault run',
      config: [{ id: 'reward', type: 'int', default: 5, min: 0, max: 50 }],
      variables: [{ id: 'gold', scope: 'player', type: 'int', start: 0, min: 0, max: 1000 }],
      entities: { zones: ['vault'] },
      rules: [
        { id: 'pay', when: { event: 'zone.enter', zone: 'vault' }, then: [{ do: 'variable.add', var: 'gold', who: 'player', amount: { param: 'reward' } }] },
        { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] },
      ],
    } }, []);
    l = planForgeLayout(l, 'rules.config.set', { params: { reward: 9 } }, []);
    return sealForgeRules(l as ForgeLayout);
  };

  it('a layout with a rules mode plays its spec, its params, its seed and its zones, markers and spawners', async () => {
    const l = await withRules();
    const r = forgePlayRules(l, 42)!;
    expect(r.spec).toEqual(l.rules!.spec);
    expect(r.params).toEqual({ reward: 9 });
    expect(r.seed).toBe(42);
    expect(r.layout).toEqual({ zones: l.zones });
    expect(forgeRuleHost(r, ruleMapNames({} as LoadedMap)).snapshot().state).toBe('pending');
  });

  it('no rules mode, no rules: none, a retail type, and a mode no draft or installed pack offers', async () => {
    const l = await withRules();
    expect(forgePlayRules(emptyLayout({ kind: 'blank', library: 'floor' }), 1)).toBeNull();
    const { mode: _mode, ...noMode } = l;
    expect(forgePlayRules(noMode as ForgeLayout, 1)).toBeNull();
    expect(forgePlayRules({ ...noMode, objectives: { gameType: 1 } } as ForgeLayout, 1)).toBeNull();
    expect(forgePlayRules({ ...l, mode: { id: 'other.mode', version: '1.0.0', params: {} } }, 1)).toBeNull();
  });

  it('a mode an installed rules pack offers plays that pack\'s spec', async () => {
    const l = await withRules();
    const installed = [{ ref: l.rules!.pack, spec: l.rules!.spec }];
    const { rules: _drop, ...bare } = l;
    expect(forgePlayRules(bare as ForgeLayout, 3, installed)!.spec).toEqual(l.rules!.spec);
    expect(forgePlayRules(bare as ForgeLayout, 3)).toBeNull();
  });
});
