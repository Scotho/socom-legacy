import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { sealForgeRules, type ForgeLayout } from '../../src/forge/rulesAuthoring';

/**
 * FCW-32 step 4's fixture (product track; a browser adaptation, no original): a blank-floor layout named "Vault" with a
 * spawn and a vault zone, and a rules mode on it -- three configuration values (an int, a bool, an enum), a variable,
 * two rules -- its reward configured to 9, sealed as the facade seals every rules edit.
 */
export const VAULT_SPEC = Object.freeze({
  schema: 's2u-rules', vocabulary: 0, id: 'vault.run', name: 'Vault run',
  config: [
    { id: 'reward', type: 'int', default: 5, min: 0, max: 50 },
    { id: 'doubled', type: 'bool', default: false },
    { id: 'pace', type: 'enum', default: 'slow', values: ['slow', 'fast'] },
  ],
  variables: [{ id: 'gold', scope: 'player', type: 'int', start: 0, min: 0, max: 1000 }],
  entities: { zones: ['vault'] },
  rules: [
    { id: 'pay', when: { event: 'zone.enter', zone: 'vault' }, then: [
      { do: 'variable.add', var: 'gold', who: 'player', amount: { param: 'reward' } }, { do: 'message.show', text: 'Paid' }] },
    { id: 'score', when: 'player.kill', then: [{ do: 'score.award', who: 'attacker', points: 1 }] },
  ],
});

export const vaultFloor = (): Layout => ({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Vault',
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }],
});

export async function vaultLayout(): Promise<ForgeLayout> {
  let l = planForgeLayout(vaultFloor(), 'zone.place', { id: 'vault', shape: 'cylinder', at: [0, 0, 0], radius: 5, height: 3 }, []);
  l = planForgeLayout(l, 'rules.new', { pack: 'my.vault', version: '1.0.0', id: 'vault.run', name: 'Vault run' }, []);
  l = planForgeLayout(l, 'rules.set', { spec: JSON.parse(JSON.stringify(VAULT_SPEC)) as Record<string, unknown> }, []);
  l = planForgeLayout(l, 'rules.config.set', { params: { reward: 9 } }, []);
  return sealForgeRules(l as ForgeLayout);
}
