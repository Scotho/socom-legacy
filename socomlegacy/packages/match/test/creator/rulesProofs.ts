/**
 * The five proof experiences of `docs/specs/2026-10-27-creator-rules-contract.md` §11, as FCW-30 wrote them for its
 * validator (`packages/creator-contracts/test/rules.test.ts`, 'The five proof experiences', copied here unchanged so the
 * room runs the same data FCW-30 validates; that file is a test module, not importable). Product-track data: example
 * modes with no original.
 */
import { RULES_SCHEMA, RULES_VOCABULARY_VERSION } from '@s2u/creator-contracts';

type Json = Record<string, unknown>;

const ALL_OUT = (team: 'seal' | 'terrorist', winner: 'seal' | 'terrorist'): Json => ({
  id: `${team}-out`, when: 'player.eliminated', if: [{ test: 'alive', team, op: '=', count: 0 }], then: [{ do: 'round.end', winner }],
});

/** Paintball (FCW-13): a hit counts, the last hit eliminates; no damage; one marker; the round ends on a side out. */
const PAINTBALL: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'example.paintball', name: 'Paintball',
  config: [
    { id: 'hitsToOut', type: 'int', default: 1, min: 1, max: 10 },
    { id: 'pointsPerOut', type: 'int', default: 1, min: 0, max: 100 },
    { id: 'friendlyFire', type: 'bool', default: false },
  ],
  variables: [{ id: 'hits', scope: 'player', type: 'int', start: 0, min: 0, max: 10 }],
  rules: [
    { id: 'loadout', when: 'round.start', then: [{ do: 'loadout.restrict', allow: ['paintball.marker'] }] },
    {
      id: 'hit', when: 'player.hit',
      if: [{ test: 'any', of: [{ test: 'compare', left: { param: 'friendlyFire' }, op: '=', right: true }, { test: 'not', of: { test: 'team', who: 'attacker', same: 'victim' } }] }],
      then: [{ do: 'hit.scale', factor: 0 }, { do: 'variable.add', var: 'hits', who: 'victim', amount: 1 }],
      else: [{ do: 'hit.scale', factor: 0 }],
    },
    {
      id: 'out', when: 'player.hit',
      if: [{ test: 'compare', left: { var: 'hits', who: 'victim' }, op: '>=', right: { param: 'hitsToOut' } }],
      then: [{ do: 'player.eliminate', who: 'victim' }, { do: 'score.award', who: 'attacker', points: { param: 'pointsPerOut' } }],
    },
    ALL_OUT('seal', 'terrorist'),
    ALL_OUT('terrorist', 'seal'),
    { id: 'hits-hud', side: 'client', when: 'player.hit', then: [{ do: 'hud.value', var: 'hits', label: 'Hits' }] },
  ],
};

/** Party (FCW-14): a timed beat and a stage zone, presentation only. */
const PARTY: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'example.party', name: 'Party',
  timers: [{ id: 'beat', scope: 'match', seconds: 30, repeat: true }],
  entities: { zones: ['stage'] },
  rules: [
    { id: 'start', when: 'round.start', then: [{ do: 'timer.start', timer: 'beat' }, { do: 'message.show', text: 'Party time' }] },
    { id: 'beat', when: { event: 'timer.fire', timer: 'beat' }, then: [{ do: 'cue.play', cue: 'party.beat' }] },
    {
      id: 'stage', when: { event: 'zone.enter', zone: 'stage' },
      then: [{ do: 'cue.play', cue: 'party.cheer', who: 'player' }, { do: 'message.show', text: 'On stage!', who: 'player' }],
    },
  ],
};

/** Zombies + shop (FCW-15): waves from a spawner with the engine's NPC brain, a bounty in cash, a shop zone. */
const ZOMBIES: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'example.zombies', name: 'Zombies',
  capabilities: [{ slot: 'behaviour.npc', handler: 'behaviour.npc.patrol' }],
  variables: [
    { id: 'cash', scope: 'player', type: 'int', start: 500, min: 0, max: 100000, reset: 'match' },
    { id: 'wave', scope: 'match', type: 'int', start: 0, min: 0, max: 100, reset: 'match' },
  ],
  items: [
    { id: 'rifle', grants: { kind: 'weapon', ref: 'm4a1' }, price: 1000, stock: 99, currency: 'cash' },
    { id: 'medkit', grants: { kind: 'equipment', ref: 'medkit' }, price: 250, stock: 99, currency: 'cash' },
  ],
  entities: { zones: ['shop'], spawners: ['horde'] },
  rules: [
    {
      id: 'first', when: 'round.start',
      then: [{ do: 'variable.set', var: 'wave', value: 1 }, { do: 'spawner.release', spawner: 'horde', count: 8, brain: 'behaviour.npc.patrol' }],
    },
    { id: 'bounty', when: { event: 'npc.death', spawner: 'horde' }, then: [{ do: 'variable.add', var: 'cash', who: 'attacker', amount: 100 }] },
    {
      id: 'next', when: { event: 'spawner.empty', spawner: 'horde' },
      then: [{ do: 'variable.add', var: 'wave', amount: 1 }, { do: 'spawner.release', spawner: 'horde', count: 8, brain: 'behaviour.npc.patrol' }],
    },
    { id: 'buy', when: 'purchase.request', if: [{ test: 'inZone', who: 'player', zone: 'shop' }], then: [{ do: 'purchase.accept' }] },
    { id: 'bought', when: 'purchase.accepted', then: [{ do: 'message.show', text: 'Bought', who: 'player' }] },
    { id: 'broke', when: { event: 'purchase.refused', item: 'rifle' }, if: [{ test: 'compare', left: { field: 'reason' }, op: '=', right: 'funds' }], then: [{ do: 'message.show', text: 'Not enough cash', who: 'player' }] },
    ALL_OUT('seal', 'terrorist'),
    { id: 'cash-hud', side: 'client', when: 'purchase.accepted', then: [{ do: 'hud.value', var: 'cash', label: 'Cash' }] },
  ],
};

/** Battle royale (FCW-16): seeded drops and loot, a ring that reshapes by phase and hurts outside it. */
const RING_STEP = (from: string, to: string): Json => ({
  id: `to-${to}`, when: { event: 'timer.fire', timer: 'ring' }, if: [{ test: 'phase', is: from }], then: [{ do: 'phase.set', phase: to }],
});
const RING_SHAPE = (phase: string, radius: number, again: boolean): Json => ({
  id: `shape-${phase}`, when: { event: 'phase.change', phase },
  then: [{ do: 'zone.reshape', zone: 'ring', radius, at: 'centre', seconds: 60 }, ...(again ? [{ do: 'timer.start', timer: 'ring' }] : [])],
});
const BATTLE_ROYALE: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'example.battle-royale', name: 'Battle royale',
  phases: ['drop', 'shrink1', 'shrink2', 'final'],
  timers: [{ id: 'ring', scope: 'match', seconds: 90 }],
  items: [{ id: 'rifle', grants: { kind: 'weapon', ref: 'm4a1' } }],
  entities: { zones: ['ring'], markers: ['centre'], spawners: ['drops', 'loot'] },
  rules: [
    {
      id: 'start', when: 'round.start',
      then: [
        { do: 'spawner.release', spawner: 'drops' },
        { do: 'spawner.release', spawner: 'loot', item: 'rifle', count: 20 },
        { do: 'zone.hazard', zone: 'ring', perSecond: 5, inside: false },
        { do: 'timer.start', timer: 'ring' },
      ],
    },
    // final-first: state changes are immediate (rules.ts's semantics), so one ring timer.fire takes one step
    RING_STEP('shrink2', 'final'), RING_STEP('shrink1', 'shrink2'), RING_STEP('drop', 'shrink1'),
    RING_SHAPE('shrink1', 600, true), RING_SHAPE('shrink2', 300, true), RING_SHAPE('final', 50, false),
    ALL_OUT('seal', 'terrorist'),
    ALL_OUT('terrorist', 'seal'),
  ],
};

/** Capture the flag (FCW-34): flags as items on stands, a base zone with has-item, team-scoped captures. */
const CAPTURE = (team: 'seal' | 'terrorist', enemy: 'seal' | 'terrorist'): Json[] => [
  {
    id: `capture-${team}`, when: { event: 'zone.enter', zone: `base-${team}` },
    if: [{ test: 'team', who: 'player', is: team }, { test: 'hasItem', who: 'player', item: `flag-${enemy}` }],
    then: [
      { do: 'item.take', who: 'player', item: `flag-${enemy}` },
      { do: 'variable.add', var: 'caps', team, amount: 1 },
      { do: 'score.award', team, points: 1 },
      { do: 'spawner.release', spawner: `stand-${enemy}`, item: `flag-${enemy}` },
      { do: 'message.show', text: 'Flag captured' },
    ],
  },
  {
    id: `win-${team}`, when: { event: 'zone.enter', zone: `base-${team}` },
    if: [{ test: 'compare', left: { var: 'caps', team }, op: '>=', right: { param: 'capsToWin' } }],
    then: [{ do: 'round.end', winner: team }],
  },
  {
    id: `return-${team}`, when: { event: 'item.pickup', item: `flag-${team}` }, if: [{ test: 'team', who: 'player', is: team }],
    then: [{ do: 'item.take', who: 'player', item: `flag-${team}` }, { do: 'spawner.release', spawner: `stand-${team}`, item: `flag-${team}` }],
  },
  {
    id: `drop-${team}`, when: 'player.death', if: [{ test: 'hasItem', who: 'victim', item: `flag-${team}` }],
    then: [{ do: 'item.take', who: 'victim', item: `flag-${team}` }, { do: 'spawner.release', spawner: `stand-${team}`, item: `flag-${team}` }],
  },
];
const CAPTURE_THE_FLAG: Json = {
  schema: RULES_SCHEMA, vocabulary: RULES_VOCABULARY_VERSION, id: 'example.ctf', name: 'Capture the flag',
  config: [{ id: 'capsToWin', type: 'int', default: 3, min: 1, max: 10 }],
  variables: [{ id: 'caps', scope: 'team', type: 'int', start: 0, min: 0, max: 10 }],
  items: [{ id: 'flag-seal', grants: { kind: 'token' } }, { id: 'flag-terrorist', grants: { kind: 'token' } }],
  entities: { zones: ['base-seal', 'base-terrorist'], spawners: ['stand-seal', 'stand-terrorist'] },
  rules: [
    { id: 'place', when: 'round.start', then: [{ do: 'spawner.release', spawner: 'stand-seal', item: 'flag-seal' }, { do: 'spawner.release', spawner: 'stand-terrorist', item: 'flag-terrorist' }] },
    ...CAPTURE('seal', 'terrorist'),
    ...CAPTURE('terrorist', 'seal'),
  ],
};

export { ALL_OUT, BATTLE_ROYALE, CAPTURE_THE_FLAG, PAINTBALL, PARTY, ZOMBIES };
export type { Json };
