// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStatusChips } from '../../src/forge/shell/statusBar';
import { createRulesPresenter, RULES_HUD_CHIP, RULES_MESSAGE_CHIP } from '../../src/forge/rulesPresent';

/**
 * FCW-32 round 2, held item 2 (product track; FORGE_RULES_PRESENT_ADAPTATION, a browser adaptation with no original):
 * what the room tells the page for its rules (`rulesPresent`, `match/src/creator/rules/seam.ts` `RulesWire`) shows on the
 * Forge's match surface -- the status chips mirrored beside the match's Back -- as text: a pack's message is a chip's
 * word (`textContent`), never markup. A `hud` value reads `label value` on a second chip; a `cue` shows no chip of its
 * own here: FUI-23 hears it on the match's audio once that is handed over (`./rulesCues.test.ts`).
 */

const present = (shows: unknown[]): unknown => ({ type: 'rulesPresent', mode: 'vault.run', shows });

describe('FCW-32 round 2: the rules\' messages as text', () => {
  it('a message of markup shows as its literal characters and adds no element of its own', () => {
    const chips = createStatusChips(document);
    const rules = createRulesPresenter(chips);
    rules.take(present([{ kind: 'message', text: '<img src=x onerror=alert(1)>' }]));
    const chip = chips.matchElement.querySelector<HTMLElement>(`[data-forge-chip="${RULES_MESSAGE_CHIP}"]`)!;
    expect(chip.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(chips.matchElement.querySelector('img')).toBeNull();
    rules.take(present([{ kind: 'message', text: '<b>x</b>' }]));
    expect(chip.textContent).toBe('<b>x</b>');
    expect(chips.matchElement.querySelector('b')).toBeNull();
    expect(chips.element.querySelector(`[data-forge-chip="${RULES_MESSAGE_CHIP}"]`)!.textContent).toBe('<b>x</b>');   // the strip's copy too
  });

  it('a hud value reads label and value on its own chip, the latest per label; a cue (no audio handed) and another wire show nothing', () => {
    const chips = createStatusChips(document);
    const rules = createRulesPresenter(chips);
    rules.take(present([{ kind: 'hud', label: 'Gold', value: 5 }, { kind: 'hud', label: '<i>Lives</i>', value: true }, { kind: 'cue', cue: 'beep' }]));
    rules.take(present([{ kind: 'hud', label: 'Gold', value: 9 }]));
    rules.take({ type: 'rulesPurchase', seq: 1, item: 'medkit', result: 'accepted' });
    rules.take({ type: 'snapshot' });
    rules.take(null);
    const hud = chips.matchElement.querySelector<HTMLElement>(`[data-forge-chip="${RULES_HUD_CHIP}"]`)!;
    expect(hud.textContent).toBe('Gold 9 · <i>Lives</i> true');
    expect(chips.matchElement.querySelector('i')).toBeNull();
    expect(chips.ids()).toEqual([RULES_HUD_CHIP]);
  });

  it('FCW-32 step 4 (FUI.R23 D5): a rules mode\'s Play reads "PLAY · <mode name>" beside Back, as text; gone at the end', async () => {
    const mod = await import('../../src/forge/rulesPresent') as typeof import('../../src/forge/rulesPresent') & { RULES_MODE_CHIP?: string };
    const chips = createStatusChips(document);
    const rules = createRulesPresenter(chips) as ReturnType<typeof createRulesPresenter> & { mode?(name: string): void };
    expect(mod.RULES_MODE_CHIP).toBe('rules-mode');
    rules.mode!('<b>Vault</b> run');
    const chip = chips.matchElement.querySelector<HTMLElement>('[data-forge-chip="rules-mode"]')!;
    expect(chip.textContent).toBe('PLAY · <b>Vault</b> run');
    expect(chips.matchElement.querySelector('b')).toBeNull();
    expect(chips.ids()).toEqual(['rules-mode']);
    rules.take(present([{ kind: 'message', text: 'Find the vault' }]));
    expect(chips.ids()).toEqual(['rules-mode', RULES_MESSAGE_CHIP]);                      // the mode first, beside Back
    rules.clear();
    expect(chips.ids()).toEqual([]);
  });

  it('cleared at the match\'s end: its chips gone, none registered before the first wire', () => {
    const chips = createStatusChips(document);
    const rules = createRulesPresenter(chips);
    expect(chips.ids()).toEqual([]);
    rules.take(present([{ kind: 'message', text: 'Find the vault' }, { kind: 'hud', label: 'Gold', value: 0 }]));
    expect(chips.ids()).toEqual([RULES_MESSAGE_CHIP, RULES_HUD_CHIP]);
    rules.clear();
    expect(chips.ids()).toEqual([]);
    expect(chips.matchElement.textContent).toBe('');
  });
});
