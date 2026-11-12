import { describe, expect, it } from 'vitest';
import { ActionSelection, pickContext } from '../src/actionContext';
import { actionInputs, type ActionSources } from '../src/actionWiring';

/**
 * R4B-16 (G8, research 389; reading, pending review): r0004's demolition-bomb drop offer (action 6, bit 0x40) is built
 * only in the else-branch of the turret-mount offer (action 19, bit 0x80000) -- r4 0x599488-0x5994b0, the drop's test
 * moved into the new function 0x599cd0 -- where r0001 tested the drop inline and then the mount, so both could be offered
 * (`FUN_005937c0` D:L452456-452475). And a SEAL holding a turret is offered its release alone in both builds
 * (`FUN_005a8850` D:L452334-452338; r4 0x599074-0x599088), which the port holds by its mounted rule.
 */

function sources(over: Partial<ActionSources> = {}): ActionSources {
  return {
    canAct: () => true, mounted: () => false, locked: () => false,
    door: () => false, switch: () => false, bombPrompt: () => null, c4: () => false, turret: () => false, traversal: () => false,
    ...over,
  };
}

describe('R4B-16: the bomb drop offer is exclusive with the turret mount offer (r0004 0x599488-0x5994b0)', () => {
  it('the turret mount offered: no drop in the list, so the d-pad cannot turn to it', () => {
    const inputs = actionInputs(sources({ turret: () => true, bombPrompt: () => 'bomb_drop' }));
    expect(inputs.turret).toBe(true);
    expect(inputs.bombDrop).toBe(false);
    const sel = new ActionSelection();
    expect(sel.pick(inputs)).toBe('turret');
    expect(sel.list()).toEqual(['turret']);
  });

  it('no mount offered: the drop is offered as before (the gate open, the drop gate open)', () => {
    const inputs = actionInputs(sources({ bombPrompt: () => 'bomb_drop' }));
    expect(inputs.bombDrop).toBe(true);
    expect(pickContext(inputs)).toBe('bombDrop');
  });

  it('the common gate shut: neither (both are built past it)', () => {
    const inputs = actionInputs(sources({ turret: () => true, bombPrompt: () => 'bomb_drop', gateShut: () => true }));
    expect(inputs.turret).toBe(false);
    expect(inputs.bombDrop).toBe(false);
  });

  it('the exclusion is the mount offer only: C4 and a door beside the drop keep the drop in the list', () => {
    const sel = new ActionSelection();
    sel.pick(actionInputs(sources({ c4: () => true, door: () => true, bombPrompt: () => 'bomb_drop' })));
    expect(sel.list()).toEqual(['door', 'c4', 'bombDrop']);
  });

  it('holding a turret (b): the release alone, never the drop -- already so in the port (r0001 and r0004 alike)', () => {
    const inputs = actionInputs(sources({ mounted: () => true, turret: () => true, bombPrompt: () => 'bomb_drop' }));
    expect(inputs).toEqual({ turret: true });
  });
});
