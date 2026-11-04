import { describe, expect, it } from 'vitest';
import { checkCreatorRecord, recordOfLayout, validatePack, ENGINE_CONTRACT_VERSION, PACK_TARGET_US, type RulesSpec } from '@s2u/creator-contracts';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { decodeHistoryStep, encodeHistoryStep, History, recordEdit } from '../../src/forge/history';
import { emptyLayout, serializeLayout, type Layout } from '../../src/forge/layout';
import { layoutOfRecord, readSaved, savedLayoutHasWork } from '../../src/forge/record';
import {
  buildRulesPack, exportRulesPack, checkForgeRecord, checkForgeRules, FORGE_RULES_CODES, forgeAuthoringText, forgeModeList, importRulesPack,
  parseForgeLayout, readForgeAuthoring, sealForgeRules, UNSEALED_HASH, type ForgeLayout,
} from '../../src/forge/rulesAuthoring';
import { FORGE_SAVES_KEY, readSaveList, saveNamedRules, writeSaves, type Store } from '../../src/forge/saves';

/**
 * FCW-32 (steps 1-3; the creator rules spec `docs/specs/2026-10-27-creator-rules-contract.md` §3-§4, §7, §11): the
 * Forge's model of a layout's zones, markers, spawners and rules pack. Product track: the Forge's own authoring
 * instrument, a browser adaptation with no original; it decides no outcome (the room does, FCW-31).
 */

type Json = Record<string, unknown>;
const blank = (): Layout => emptyLayout({ kind: 'blank', library: 'floor' });
const memoryStore = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

/** The two-rule mode the acceptance names: a vault zone pays a configured reward, a kill scores. */
const twoRules = (over: Json = {}): Json => ({
  schema: 's2u-rules', vocabulary: 0, id: 'vault.run', name: 'Vault run',
  config: [{ id: 'reward', type: 'int', default: 5, min: 0, max: 50 }],
  variables: [{ id: 'gold', scope: 'player', type: 'int', start: 0, min: 0, max: 1000 }],
  entities: { zones: ['vault'] },
  rules: [
    { id: 'pay', when: { event: 'zone.enter', zone: 'vault' }, then: [{ do: 'variable.add', var: 'gold', who: 'player', amount: { param: 'reward' } }] },
    { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] },
  ],
  ...over,
});

/** A blank layout with a vault zone, an NPC spawner, an item spawner, a player spawner and an exit marker. */
function withEntities(): Layout {
  let l = blank();
  l = planForgeLayout(l, 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
  l = planForgeLayout(l, 'marker.place', { id: 'exit', at: [1, 2, 3], yaw: 0 }, []);
  l = planForgeLayout(l, 'spawner.place', { id: 'guards', source: 'npc', side: 'terrorist', type: 0, at: [10, 0, 0], yaw: 0, radius: 2 }, []);
  l = planForgeLayout(l, 'spawner.place', { id: 'crates', source: 'item', at: [20, 0, 0], yaw: 0, radius: 1 }, []);
  l = planForgeLayout(l, 'spawner.place', { id: 'drop', source: 'player', team: 'A', at: [30, 0, 0], yaw: 0, radius: 1 }, []);
  return l;
}
function withRules(spec: Json = twoRules()): ForgeLayout {
  let l = planForgeLayout(withEntities(), 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
  l = planForgeLayout(l, 'rules.set', { spec }, []);
  return l as ForgeLayout;
}
const codes = (l: ForgeLayout): string[] => checkForgeRules(l).diagnostics.map((d) => d.code);

describe('FCW-32 the model: zones, markers and spawners as the layout\'s other entities', () => {
  it('places, moves, locks and deletes them by their authored ids, and an undo restores the exact bytes', () => {
    const start = blank();
    const history = new History(encodeHistoryStep(serializeLayout(start), []));
    let l = withEntities();
    expect(l.zones?.map((z) => z.id)).toEqual(['vault']);
    expect(l.markers?.map((m) => m.id)).toEqual(['exit']);
    expect(l.spawners?.map((s) => [s.id, s.source])).toEqual([['guards', 'npc'], ['crates', 'item'], ['drop', 'player']]);
    recordEdit(history, serializeLayout(l), [], []);
    l = planForgeLayout(l, 'piece.move', { refs: ['zone:vault', 'marker:exit'], delta: [1, 0, 0] }, []);
    expect(l.zones![0]!.at).toEqual([1, 0, 0]);
    expect(l.markers![0]!.at).toEqual([2, 2, 3]);
    l = planForgeLayout(l, 'piece.lock', { refs: ['spawner:guards'] }, []);
    expect(l.spawners![0]!.locked).toBe(true);
    expect(() => planForgeLayout(l, 'piece.move', { refs: ['spawner:guards'], delta: [1, 0, 0] }, [])).toThrow(/locked/);
    l = planForgeLayout(l, 'piece.delete', { refs: ['marker:exit'] }, []);
    expect(l.markers).toBeUndefined();
    expect(() => planForgeLayout(l, 'piece.delete', { refs: ['zone:nowhere'] }, [])).toThrow(/reference/);
    expect(() => planForgeLayout(l, 'zone.place', { id: 'guards', shape: 'cylinder', at: [0, 0, 0], radius: 1, height: 1 }, [])).toThrow(/duplicate id guards/);
    recordEdit(history, serializeLayout(l), [], []);
    history.undo();
    expect(decodeHistoryStep(history.undo()!).text).toBe(serializeLayout(start));
  });
});

describe('FCW-32 the model: the layout\'s rules pack', () => {
  it('makes a two-rule mode: the draft, its mode and the pack the layout requires', async () => {
    const l = await sealForgeRules(withRules());
    expect(l.rules!.spec.rules.map((r) => r.id)).toEqual(['pay', 'score']);
    expect(l.mode).toEqual({ id: 'vault.run', version: '1.0.0', params: {} });
    expect(l.requires).toEqual([l.rules!.pack]);
    expect(l.rules!.pack.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.rules!.pack.hash).not.toBe(UNSEALED_HASH);                // the review's F8: the regex alone matches the unsealed hash
    expect(checkForgeRules(l).status).toBe('pass');
    expect(checkForgeRecord(l)).toBeNull();
  });

  it('refuses a broken id reference: a rule naming a zone the layout lacks, and deleting a zone a rule names', () => {
    expect(() => withRules(twoRules({ entities: { zones: ['nowhere'] } }))).toThrow(/rules\.ENTITY_MISSING at entities\.zones\[0\]/);
    const l = withRules();
    expect(() => planForgeLayout(l, 'piece.delete', { refs: ['zone:vault'] }, [])).toThrow(/rules\.ENTITY_MISSING/);
  });

  it('refuses an invalid rule by the validator\'s own diagnostic, naming the field', () => {
    const l = withRules();
    expect(() => planForgeLayout(l, 'rules.rule.set', { rule: { id: 'slam', when: 'round.start', then: [{ do: 'door.slam' }] } }, []))
      .toThrow(/rules\.ACTION_UNKNOWN at rules\[2\]\.then\[0\]\.do/);
    expect(() => planForgeLayout(l, 'rules.variable.delete', { id: 'gold' }, [])).toThrow(/rules\.REFERENCE_UNKNOWN at rules\[0\]\.then\[0\]\.var/);
    expect(l.rules!.spec.rules).toHaveLength(2);
    const added = planForgeLayout(l, 'rules.rule.set', { rule: { id: 'start', when: 'round.start', then: [{ do: 'message.show', text: 'Find the vault' }] }, index: 0 }, []) as ForgeLayout;
    expect(added.rules!.spec.rules.map((r) => r.id)).toEqual(['start', 'pay', 'score']);
    const removed = planForgeLayout(added, 'rules.rule.delete', { id: 'start' }, []) as ForgeLayout;
    expect(removed.rules!.spec.rules.map((r) => r.id)).toEqual(['pay', 'score']);
  });

  it('F2: refuses a brain that is no brain, and a release whose kind does not match its spawner\'s source', () => {
    const release = (spawner: string, extra: Json): Json => twoRules({
      entities: { zones: ['vault'], spawners: [spawner] },
      capabilities: [{ slot: 'behaviour.bomb', handler: 'behaviour.bomb.authority' }, { slot: 'behaviour.npc', handler: 'behaviour.npc.patrol' }],
      items: [{ id: 'medkit', grants: { kind: 'token' } }],
      rules: [...(twoRules()['rules'] as Json[]), { id: 'wave', when: 'round.start', then: [{ do: 'spawner.release', spawner, ...extra }] }],
    });
    const base = withRules();
    const check = (spec: Json): ForgeLayout => ({ ...base, rules: { ...base.rules!, spec: spec as unknown as RulesSpec } });
    expect(checkForgeRules(check(release('guards', { brain: 'behaviour.npc.patrol' }))).status).toBe('pass');
    const bomb = checkForgeRules(check(release('guards', { brain: 'behaviour.bomb.authority' })));
    expect(bomb.diagnostics.map((d) => [d.code, d.field])).toEqual([[FORGE_RULES_CODES.brainKind, 'rules[2].then[0].brain']]);
    expect(codes(check(release('crates', { brain: 'behaviour.npc.patrol' })))).toEqual([FORGE_RULES_CODES.releaseSource]);
    expect(codes(check(release('drop', { item: 'medkit' })))).toEqual([FORGE_RULES_CODES.releaseSource]);
    expect(codes(check(release('guards', { item: 'medkit' })))).toEqual([FORGE_RULES_CODES.releaseSource]);
    expect(checkForgeRules(check(release('crates', { item: 'medkit' }))).status).toBe('pass');
    expect(() => planForgeLayout(base, 'rules.set', { spec: release('guards', { brain: 'behaviour.bomb.authority' }) }, [])).toThrow(/forge\.rules\.BRAIN_KIND/);
  });

  it('refuses a mode whose rules pack the layout does not depend on', async () => {
    const l = await sealForgeRules(withRules());
    const loose: ForgeLayout = { ...l, requires: [] };
    expect(checkForgeRules(loose).diagnostics.map((d) => [d.code, d.field])).toEqual([[FORGE_RULES_CODES.packNotRequired, 'requires']]);
    expect(() => planForgeLayout(blank(), 'layout.import', { layout: JSON.parse(serializeLayout(loose)) }, [])).toThrow(/forge\.rules\.PACK_NOT_REQUIRED/);
  });

  it('wires the mode catalogue: the record checks with the layout\'s modes, the mode list is retail then rules, params by the config', async () => {
    const l = await sealForgeRules(withRules());
    expect(checkCreatorRecord(recordOfLayout(l, 'Vault'))).toBe('unknown game mode vault.run@1.0.0');
    expect(checkForgeRecord(l)).toBeNull();
    expect(forgeModeList(l)).toEqual([
      ...[1, 2, 3, 4, 5].map((gameType) => ({ kind: 'retail', gameType })),
      { kind: 'rules', id: 'vault.run', version: '1.0.0', name: 'Vault run', pack: l.rules!.pack },
    ]);
    expect(() => planForgeLayout(l, 'rules.config.set', { params: { reward: 99 } }, [])).toThrow(/reward is a whole number in 0\.\.50/);
    expect(planForgeLayout(l, 'rules.config.set', { params: { reward: 10 } }, []).mode).toEqual({ id: 'vault.run', version: '1.0.0', params: { reward: 10 } });
    const cleared = planForgeLayout(l, 'rules.clear', {}, []) as ForgeLayout;
    expect([cleared.rules, cleared.mode, cleared.requires]).toEqual([undefined, undefined, undefined]);
  });
});

describe('FCW-32 the model: save and reload keep every rule and declaration', () => {
  it('the undo step, the autosave text and a named save each round-trip the rules and the variables', async () => {
    const l = await sealForgeRules(withRules());
    const again = parseForgeLayout(serializeLayout(l));
    expect(again.rules).toEqual(l.rules);
    const made = forgeAuthoringText(l, 'Vault');
    if (!('text' in made)) throw new Error(made.why);
    const read = readForgeAuthoring(made.text, 'Autosave');
    expect(read.rules).toEqual(l.rules);
    expect(read.rules!.spec.variables).toEqual(twoRules()['variables']);
    expect(layoutOfRecord(read.record).zones).toEqual(l.zones);
    expect(readSaved(made.text, 'Autosave').mode).toEqual(l.mode);
    expect(savedLayoutHasWork(made.text)).toBe(true);
    const store = memoryStore();
    const saved = saveNamedRules([], 'Vault', recordOfLayout(l, 'Vault'), l.rules, 1, 'save-1');
    expect(saved.error).toBeNull();
    expect(writeSaves(saved.saves, store)).toBe(true);
    const list = readSaveList(store);
    expect(list.unreadable).toEqual([]);
    expect(list.saves[0]!.rules).toEqual(l.rules);
  });

  it('a layout without rules writes the record exactly as before', () => {
    const l = withEntities();
    const made = forgeAuthoringText(l, 'Plain');
    expect(made).toEqual({ text: JSON.stringify(recordOfLayout(l, 'Plain')) });
  });

  it('the review\'s F5: a named save whose rules fail the Forge\'s check is set aside as unreadable, as an unreadable save is', async () => {
    const l = await sealForgeRules(withRules());
    const { zones: _zones, ...noVault } = l;                      // its rules name the vault zone the record no longer holds
    const store = memoryStore();
    store.data.set(FORGE_SAVES_KEY, JSON.stringify([
      { id: 'good', savedAt: 1, record: recordOfLayout(l, 'Vault'), rules: l.rules },
      { id: 'bad', savedAt: 2, record: recordOfLayout(noVault as ForgeLayout, 'Broken'), rules: l.rules },
    ]));
    const list = readSaveList(store);
    expect(list.saves.map((s) => s.id)).toEqual(['good']);
    expect(list.unreadable).toHaveLength(1);
    expect(list.unreadable[0]!.name).toBe('Broken');
    expect(list.unreadable[0]!.why).toMatch(/rules\.ENTITY_MISSING at entities\.zones\[0\]/);
  });
});

describe('FCW-32 export: the rules as a v2 rules pack, and back', () => {
  it('builds a pack that validates, whose ref is the draft\'s, and imports it again', async () => {
    const l = await sealForgeRules(withRules());
    const pack = await buildRulesPack(l.rules!.pack, l.rules!.spec);
    expect(pack.ref).toEqual(l.rules!.pack);
    const files = pack.files.map((f) => ({ path: f.path, bytes: new TextEncoder().encode(f.text) }));
    const checked = await validatePack(files, { target: PACK_TARGET_US, contract: ENGINE_CONTRACT_VERSION });
    expect(checked.ok && checked.ref).toEqual(l.rules!.pack);
    const back = await importRulesPack(pack.files);
    expect({ pack: back.pack, spec: back.spec }).toEqual(l.rules);
    expect(back.files).toEqual(pack.files);                              // F1 (round 2): the pack kept as it came
  });

  it('round-2 re-look F2: kept files are checked against the reference they keep -- a hand-edited hash is resealed, the files dropped', async () => {
    const sealed = await sealForgeRules(withRules());
    const pack = await buildRulesPack(sealed.rules!.pack, sealed.rules!.spec);
    const back = await importRulesPack(pack.files);
    const kept = { ...sealed, rules: back };
    expect((await sealForgeRules(kept)).rules).toBe(kept.rules);          // intact: kept as it came (green on the base by design)
    const forged = 'a'.repeat(64);
    const edited = { ...kept, requires: [{ ...back.pack, hash: forged }], rules: { ...back, pack: { ...back.pack, hash: forged } } };
    const out = await sealForgeRules(edited);
    expect(out.rules!.files).toBeUndefined();                              // the files are dropped
    expect(out.rules!.pack.hash).toBe(back.pack.hash);                     // the Forge's own pack of the same spec
    expect(out.requires).toEqual([out.rules!.pack]);
    await expect(exportRulesPack(out.rules!)).resolves.toMatchObject({ ref: out.rules!.pack });   // no PACK_CHANGED
  });
});
