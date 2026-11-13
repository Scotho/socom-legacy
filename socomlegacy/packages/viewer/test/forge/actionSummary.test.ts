import { describe, expect, it } from 'vitest';
import type { EffectProgram, WorldPoly } from '@s2u/scene';
import { actionTeamText, actionTriggerText, aimPointOf, bitmapWords, damageTriggerText, linkTargets, programEffects } from '../../src/forge/actionSummary';

/**
 * The Outliner's context-action summary (a browser adaptation, FG.R2): what an action's program does, read off the
 * decoded zAnim program (research 209 s2-s4, 171 s4, 213 s4), never run.
 */
const prog = (name: string, nodes: string[], ops: EffectProgram['sequences'][number]['ops']): EffectProgram =>
  ({ name, root: 0, flags: 0, nodes, sequences: [{ name: 's', activation: 1, ops }] });

describe('programEffects', () => {
  // Crossroads' shape (research 171 s4): the bridge swap, the switch hidden through a called program, two blasts,
  // a common effect the map's set does not hold.
  const demo = prog('seal_demo_site1', ['NA', 'destroyed', 'parts', 'healthy', 'damage_point'], [
    { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 4, f1: 0.001, f2: 0.01 },
    { op: 'wait', seconds: 0.1, range: 0, frames: null },
    { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 4, f1: 0.001, f2: 0.01 },
    { op: 'call', anim: 'fire_explode_med' },
    { op: 'active', node: 1, on: true },
    { op: 'active', node: 2, on: true },
    { op: 'active', node: 3, on: false },
    { op: 'call', anim: 'seal_callstrike1' },
  ]);
  const strike = prog('seal_callstrike1', ['NA', 'seal_callstrike_1'], [{ op: 'active', node: 1, on: false }, { op: 'call', anim: 'seal_demo_site1' }]);
  const programs = new Map([[demo.name, demo], [strike.name, strike]]);

  it('names the nodes turned on and off, the weapons fired, and the common effects called, following the set\'s own calls', () => {
    const e = programEffects(['seal_demo_site1'], programs);
    expect(e.shows).toEqual(['destroyed', 'parts']);
    expect(e.hides).toEqual(['healthy', 'seal_callstrike_1']);
    expect(e.weapons).toEqual(['MPBOMB']);                 // each once
    expect(e.effects).toEqual(['fire_explode_med']);        // not in the set: a common effect
    expect(e.runs).toEqual(['seal_demo_site1', 'seal_callstrike1']);   // a call back to the first is not followed twice
  });

  it('follows an EXECUTE_ACTION to the action of that valve and its programs (a barrier: health -> set_access1 -> destroy_access1)', () => {
    const hit = prog('access1', ['NA'], [{ op: 'executeAction', anim: 'set_access1' }]);
    const wreck = prog('destroy_access1', ['NA', 'good_parts', 'whats_left'], [{ op: 'active', node: 1, on: false }, { op: 'active', node: 2, on: true }]);
    const e = programEffects(['access1'], new Map([[hit.name, hit], [wreck.name, wreck]]), { actionAnims: (valve) => (valve === 'set_access1' ? ['destroy_access1'] : []) });
    expect(e.actions).toEqual(['set_access1']);
    expect(e.hides).toEqual(['good_parts']);
    expect(e.shows).toEqual(['whats_left']);
  });

  it('a node moved, a message shown; a context or NA node reference is no name', () => {
    const p = prog('move', ['NA', 'gate_move1'], [
      { op: 'translate', node: 1, ref: 0, flags: 1, xyz: [0, 35, 0] },
      { op: 'active', node: 0, on: false },
      { op: 'active', node: -7, on: false },
      { op: 'message', text: 'AIRSTRIKE INBOUND', locId: null, scale: 1 },
    ]);
    const e = programEffects(['move'], new Map([[p.name, p]]));
    expect(e.moves).toEqual(['gate_move1']);
    expect(e.hides).toEqual([]);
    expect(e.messages).toEqual(['AIRSTRIKE INBOUND']);
  });

  it('an animation the set does not hold runs nothing it can read', () => {
    expect(programEffects(['nothing_here'], new Map())).toMatchObject({ runs: [], shows: [], hides: [], effects: ['nothing_here'] });
  });
});

describe('programEffects: where the nodes are placed (the guide lines)', () => {
  // The world's own placing (`../sceneHealth` `placeRefs`) stands in as a table: a program's references by its scope.
  const demo = prog('demo', ['NA', 'arch', 'healthy', 'destroyed'], [{ op: 'active', node: 2, on: false }, { op: 'active', node: 3, on: true }, { op: 'call', anim: 'hide' }]);
  const hide = prog('hide', ['NA', 'switch'], [{ op: 'active', node: 1, on: false }]);
  demo.root = 1;
  const programs = new Map([[demo.name, demo], [hide.name, hide]]);
  const scopes: string[] = [];
  const place = (p: EffectProgram, scope: string | null): (string | null)[] => {
    scopes.push(`${p.name}@${scope}`);
    return p.name === 'demo' ? [null, 'w/bridge', 'w/bridge/healthy', 'w/bridge/destroyed'] : [null, 'w/switch'];
  };

  it("each node turned on, off or moved, placed as the world places it; a call scoped at its caller's root", () => {
    const e = programEffects(['demo'], programs, { place, scope: 'w/switch' });
    expect(e.paths).toEqual(['w/bridge/healthy', 'w/bridge/destroyed', 'w/switch']);
    expect(scopes).toEqual(['demo@w/switch', 'hide@w/bridge']);
  });

  it("a destructible's first program takes its own placed nodes; an executed action runs at its own node", () => {
    const hit = prog('hit', ['NA', 'part'], [{ op: 'active', node: 1, on: false }, { op: 'executeAction', anim: 'v1' }]);
    const e = programEffects(['hit'], new Map([...programs, [hit.name, hit]]), {
      nodes: [null, 'w/barrier/part'], place, actionAnims: (v) => (v === 'v1' ? ['hide'] : []), actionPath: (v) => (v === 'v1' ? 'w/radio' : null),
    });
    expect(e.paths).toEqual(['w/barrier/part', 'w/switch']);
    expect(scopes.at(-1)).toBe('hide@w/radio');
  });

  it('no placing given, no paths', () => {
    expect(programEffects(['demo'], programs).paths).toEqual([]);
  });
});

describe('linkTargets', () => {
  it("the places a guide line reaches: none near its own mark, near ones merged (a bridge's healthy and destroyed)", () => {
    expect(linkTargets([0, 0, 0], [[3, 0, 0], [100, 0, 0], [102, 0, 0], [0, 0, 50]], 5)).toEqual([[100, 0, 0], [0, 0, 50]]);
  });
});

describe('the words', () => {
  it('a typed record is the Action button\'s; a type-less one has no prompt (research 209 s3, 176 s7.1)', () => {
    expect(actionTriggerText({ type: 'SWITCH', typeCode: 2 })).toBe('Action button (SWITCH)');
    expect(actionTriggerText({ type: '', typeCode: 8 })).toMatch(/no prompt/);
  });

  it('the team: none is anyone; 0 the SEALs, 8 the Terrorists (research 174: Sujo\'s and Sandstorm\'s radios)', () => {
    expect(actionTeamText(null)).toBe('anyone');
    expect(actionTeamText(0)).toBe('SEALs (team 0)');
    expect(actionTeamText(8)).toBe('Terrorists (team 8)');
    expect(actionTeamText(3)).toBe('team 3');
  });

  it('a prompt icon in words', () => {
    expect(bitmapWords('action_pull_lever.tif')).toBe('pull lever');
    expect(bitmapWords('action_helo.tif')).toBe('helo');
    expect(bitmapWords('')).toBe('');
  });

  it('a destructible with health takes C4 and damage; one at 0 is set off by any hit, never C4 (research 174, 175 s5.4)', () => {
    expect(damageTriggerText(2, 21)).toMatch(/C4/);
    expect(damageTriggerText(0, 0)).toMatch(/any hit/);
    expect(damageTriggerText(0, 0)).toMatch(/no C4/);
  });
});

describe('aimPointOf', () => {
  const poly = (path: string, pts: number[]): WorldPoly =>
    ({ modelName: 'm', path, region: 0, ditype: 2, material: 0, ptcount: pts.length / 3, cameratype: 0, points: new Float32Array(pts) });

  it('the middle of the collision at or under the node (what the player aims at), not its origin (research 171 s3)', () => {
    const polys = [
      poly('worldmodel/switch', [10, 0, 10, 20, 0, 10, 20, 20, 20]),
      poly('worldmodel/switch=sw/panel', [30, 0, 10]),
      poly('worldmodel/switches', [999, 999, 999]),       // a sibling of a longer name is not under it
    ];
    expect(aimPointOf(polys, 'worldmodel/switch')).toEqual([20, 10, 15]);
  });

  it('none with no collision under it', () => {
    expect(aimPointOf([], 'worldmodel/switch')).toBeNull();
  });
});
