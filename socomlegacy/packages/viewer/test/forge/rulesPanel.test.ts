// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ForgeLayout } from '../../src/forge/rulesAuthoring';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import { vaultLayout } from './rulesFixture';

/**
 * FCW-32 step 4 (FUI.R23 D1, D3; product track, a browser adaptation with no original): the Rules panel on its own, its
 * page replaced by hooks and a facade that records each call. Every edit is one of the planner's operations
 * (`FORGE_RULES_EDITS`) with the exact arguments the agent would send; a refusal is said in the panel's line (and the
 * text editor's under it); every control is a pad item the walker reaches. The mounted page's own run of the same edits
 * is `./pageRulesPanel.test.ts`.
 */

/** Read at run time (the RED run of a module not written yet fails per case, not at the file's import). */
const at = (name: string): string => `../../src/forge/${name}`;
const panelModule = () => import(/* @vite-ignore */ at('panels/rulesPanel')) as Promise<typeof import('../../src/forge/panels/rulesPanel')>;

type Answer = { ok: boolean; code?: string; message?: string };

async function rig(layout: ForgeLayout | null, name = 'Vault', extra: { playRefusal?: () => string | null } = {}) {
  const { rulesPanel } = await panelModule();
  const calls: [string, Record<string, unknown>, number | undefined][] = [];
  let answer: Answer = { ok: true };
  const refused: string[] = [];
  const placed: string[] = [];
  const listeners = new Set<() => void>();
  let l = layout;
  const hooks = {
    state: () => ({ rules: l?.rules ?? null, mode: l?.mode ?? null, entities: { zones: l?.zones, markers: l?.markers, spawners: l?.spawners }, name }),
    layout: () => l,
    installed: () => [],
    place: (kind: 'zone' | 'marker' | 'spawner') => { placed.push(kind); },
    placing: () => null,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    ...extra,
  };
  const ctx = {
    forge: {
      status: () => ({ revision: 7 }),
      execute: vi.fn(async (operation: string, args: unknown, revision?: number) => { calls.push([operation, args as Record<string, unknown>, revision]); return { ...answer, revision: 7 }; }),
    },
    ui: { refused: (m: string) => { refused.push(m); }, reveal: vi.fn(), focus: { take: vi.fn(() => () => undefined), holder: () => null } },
  } as unknown as ForgePanelContext;
  const panel = rulesPanel(hooks);
  const host = document.createElement('details');
  host.open = true;
  document.body.replaceChildren(host);
  const instance = panel.mount(host, ctx);
  const q = <E extends HTMLElement = HTMLElement>(key: string): E => {
    const e = [...host.querySelectorAll<E>('[data-rules-key]')].find((x) => x.dataset['rulesKey'] === key);
    if (!e) throw new Error(`no control ${key}`);
    return e;
  };
  return {
    panel, instance, host, calls, refused, placed, q,
    answer: (a: Answer) => { answer = a; },
    change: (next: ForgeLayout | null) => { l = next; for (const fn of listeners) fn(); },
    said: () => host.querySelector<HTMLElement>('[data-rules-said]')!.textContent ?? '',
  };
}
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

describe('FCW-32 step 4: the Rules panel\'s words', () => {
  it('a new draft is named from the layout: the pack rules.<slug>, the mode <slug>, its name the layout\'s', async () => {
    const { rulesDraftOfName, ruleSummary, freshEntityId, duplicateRuleId, freshRuleId } = await panelModule();
    expect(rulesDraftOfName('Vault run')).toEqual({ pack: 'rules.vault-run', version: '1.0.0', id: 'vault-run', name: 'Vault run' });
    expect(rulesDraftOfName('  ')).toEqual({ pack: 'rules.layout', version: '1.0.0', id: 'layout', name: 'Layout' });
    expect(rulesDraftOfName('Mod: Ärena!')).toEqual({ pack: 'rules.mod-rena', version: '1.0.0', id: 'mod-rena', name: 'Mod: Ärena!' });
    const l = await vaultLayout();
    expect(l.rules!.spec.rules.map(ruleSummary)).toEqual(['pay · when zone.enter · 2 actions', 'score · when player.kill · 1 action']);
    expect(freshEntityId('zone', ['vault', 'zone1', 'zone2'])).toBe('zone3');
    expect(freshEntityId('marker', [])).toBe('marker1');
    expect(duplicateRuleId('score', ['pay', 'score', 'score_2'])).toBe('score_3');
    expect(freshRuleId(['rule1', 'pay'])).toBe('rule2');
  });
});

describe('FCW-32 step 4 fold F4: the placement defaults', () => {
  it('RULES_PLACE_DEFAULTS_ADAPTATION holds every default the doc names: the zone\'s radius and height, the spawner\'s source, team and radius', async () => {
    const { RULES_PLACE_DEFAULTS_ADAPTATION: d } = await panelModule();
    expect({ ...d }).toEqual({ zoneRadius: 50, zoneHeight: 100, spawnerSource: 'player', spawnerTeam: 'A', spawnerRadius: 0 });
    expect(Object.isFrozen(d)).toBe(true);
  });
});

describe('FCW-32 step 4: the Rules panel on its own (FUI.R23 D1, D3)', () => {
  it('D1: no rules -- one line, New rules ›, and what it makes; New rules is rules.new named from the layout', async () => {
    const r = await rig(null);
    const body = r.host.querySelector<HTMLElement>(':scope > .fx-section[data-forge-rules]')!;
    expect(body).not.toBeNull();
    expect(body.textContent).toContain('No rules.');
    expect(r.q('new').textContent).toBe('New rules ›');
    expect(body.textContent).toContain('a draft rules pack of this layout\'s mode');
    r.q('new').click();
    await flush();
    expect(r.calls).toEqual([['rules.new', { pack: 'rules.vault', version: '1.0.0', id: 'vault', name: 'Vault' }, 7]]);
    expect(r.panel.menuRows(), 'no section of its own without rules: the Panels row reaches New rules').toEqual([]);
    expect(r.panel.menuSection!().map((m) => [m.id, m.value])).toEqual([['panel-rules', 'None']]);
  });

  it('D3 (a): a row per configuration value -- the int the dock\'s stepper, the bool the switch, the enum the select -- each rules.config.set', async () => {
    const r = await rig(await vaultLayout());
    const reward = r.q<HTMLInputElement>('config:reward');
    expect(reward.type).toBe('number');
    expect(reward.classList.contains('fx-stepper')).toBe(true);
    expect([reward.value, reward.min, reward.max]).toEqual(['9', '0', '50']);
    const doubled = r.q<HTMLInputElement>('config:doubled');
    expect([doubled.type, doubled.checked]).toEqual(['checkbox', false]);
    expect(doubled.closest('label')!.classList.contains('fx-toggle')).toBe(true);
    const pace = r.q<HTMLSelectElement>('config:pace');
    expect([...pace.options].map((o) => o.value)).toEqual(['slow', 'fast']);
    expect(pace.value).toBe('slow');
    reward.value = '12';
    reward.dispatchEvent(new Event('change'));
    await flush();
    r.q<HTMLInputElement>('config:doubled').click();
    await flush();
    const sel = r.q<HTMLSelectElement>('config:pace');
    sel.value = 'fast';
    sel.dispatchEvent(new Event('change'));
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([
      ['rules.config.set', { params: { reward: 12 } }],
      ['rules.config.set', { params: { reward: 9, doubled: true } }],
      ['rules.config.set', { params: { reward: 9, pace: 'fast' } }],
    ]);
    // The START menu's rows step the same values (the pad's way, no keyboard).
    const rows = r.panel.menuRows();
    expect(rows.map((m) => [m.id, m.value])).toEqual([
      ['rules-config-reward', '9'], ['rules-config-doubled', 'Off'], ['rules-config-pace', 'slow'],
      ['rules-place-zone', undefined], ['rules-place-marker', undefined], ['rules-place-spawner', undefined],
    ]);
    rows[0]!.right!();
    await flush();
    expect(r.calls.at(-1)).toEqual(['rules.config.set', { params: { reward: 10 } }, 7]);
  });

  it('D3 (b): a row per variable (id, scope, type, start); Add and Delete are rules.variable.set and .delete', async () => {
    const r = await rig(await vaultLayout());
    expect(r.host.querySelector('[data-rules-variable="gold"]')!.textContent).toContain('gold · player · int · start 0');
    r.q<HTMLInputElement>('variable-new:id').value = 'lives';
    r.q<HTMLInputElement>('variable-new:start').value = '3';
    r.q<HTMLInputElement>('variable-new:min').value = '0';
    r.q<HTMLInputElement>('variable-new:max').value = '9';
    r.q('variable-add').click();
    await flush();
    r.q('variable-delete:gold').click();
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([
      ['rules.variable.set', { variable: { id: 'lives', scope: 'player', type: 'int', start: 3, min: 0, max: 9 } }],
      ['rules.variable.delete', { id: 'gold' }],
    ]);
  });

  it('D3 (c): a row per rule, expandable to a read view; Duplicate and Delete; Edit is the rule as text, its refusal under it', async () => {
    const l = await vaultLayout();
    const r = await rig(l);
    expect(r.q('rule-open:pay').textContent).toBe('pay · when zone.enter · 2 actions');
    expect(r.q('rule-open:pay').getAttribute('aria-expanded')).toBe('false');
    r.q('rule-open:pay').click();
    expect(r.q('rule-open:pay').getAttribute('aria-expanded')).toBe('true');
    expect(r.host.querySelector('pre[data-rules-read="pay"]')!.textContent).toContain('variable.add');
    r.q('rule-duplicate:score').click();
    await flush();
    r.q('rule-delete:score').click();
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([
      ['rules.rule.set', { rule: { ...l.rules!.spec.rules[1]!, id: 'score_2' }, index: 2 }],
      ['rules.rule.delete', { id: 'score' }],
    ]);
    r.calls.length = 0;
    // Edit: the rule as JSON text.
    r.q('rule-edit:pay').click();
    const area = r.q<HTMLTextAreaElement>('rule-text');
    expect(JSON.parse(area.value)).toEqual(l.rules!.spec.rules[0]);
    expect(document.activeElement).toBe(area);
    area.value = '{ not json';
    area.dispatchEvent(new Event('input'));
    r.q('rule-save').click();
    await flush();
    expect(r.calls).toEqual([]);
    expect(r.host.querySelector('[data-rules-error]')!.textContent).toContain('not JSON');
    // The planner's refusal shows under the text, naming the field; the text stays as typed.
    const bad = { ...l.rules!.spec.rules[0]!, then: [{ do: 'no.such.action' }] };
    r.answer({ ok: false, code: 'INVALID_RULES', message: 'rules.ACTION_UNKNOWN at rules[0].then[0].do: There is no action "no.such.action".' });
    const area2 = r.q<HTMLTextAreaElement>('rule-text');
    area2.value = JSON.stringify(bad);
    area2.dispatchEvent(new Event('input'));
    r.q('rule-save').click();
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([['rules.rule.set', { rule: bad }]]);
    const error = r.host.querySelector<HTMLElement>('[data-rules-error]')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('rules.ACTION_UNKNOWN at rules[0].then[0].do: There is no action "no.such.action".');
    expect(r.refused).toContain(error.textContent);
    expect(JSON.parse(r.q<HTMLTextAreaElement>('rule-text').value)).toEqual(bad);
    // A rule renamed replaces its old one in its place: one step of the planner's two edits.
    r.answer({ ok: true });
    r.calls.length = 0;
    const renamed = { ...l.rules!.spec.rules[0]!, id: 'payout' };
    r.q<HTMLTextAreaElement>('rule-text').value = JSON.stringify(renamed);
    r.q<HTMLTextAreaElement>('rule-text').dispatchEvent(new Event('input'));
    r.q('rule-save').click();
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([['layout.batch', { edits: [
      { operation: 'rules.rule.delete', args: { id: 'pay' } }, { operation: 'rules.rule.set', args: { rule: renamed, index: 0 } }] }]]);
    expect(r.host.querySelector('[data-rules-key="rule-text"]')).toBeNull();
    // Add rule opens a new rule's text that validates as it stands.
    r.q('rule-add').click();
    expect(JSON.parse(r.q<HTMLTextAreaElement>('rule-text').value)).toEqual({ id: 'rule1', when: 'round.start', then: [{ do: 'message.show', text: 'Round on' }] });
  });

  it('D3 (d): Check rules lists checkForgeRules\' refusals, each naming its field and focusable; a clean layout says so', async () => {
    const l = await vaultLayout();
    const broken: ForgeLayout = { ...l, rules: { ...l.rules!, spec: { ...l.rules!.spec, entities: { zones: ['vault', 'gone'] } } } };
    const r = await rig(broken);
    r.q('check').click();
    const findings = [...r.host.querySelectorAll<HTMLButtonElement>('button[data-rules-finding]')];
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.textContent).some((t) => /^rules\.ENTITY_MISSING at entities\.zones\[1\]: /.test(t ?? '')), findings.map((f) => f.textContent).join(' | ')).toBe(true);
    for (const f of findings) { expect(f.hasAttribute('data-pad-item')).toBe(true); expect(f.tabIndex).toBeGreaterThanOrEqual(0); }
    r.change(l);
    expect(r.host.querySelector('button[data-rules-finding]'), 'a change makes the last check stale').toBeNull();
    r.q('check').click();
    expect(r.host.querySelector('[data-rules-clear]')!.textContent).toBe('No refusals: the rules check against this layout\'s entities');   // review F2: reworded
    expect(r.host.querySelector('[data-rules-play]'), 'no Play-time hook, no Play-time line').toBeNull();
  });

  it('step-4 review F2: Check rules lists the Play-time refusal (the map\'s doors and switches) too, beside the entity check, and a change makes it stale', async () => {
    const l = await vaultLayout();
    const why = 'rules.ENTITY_MISSING at entities.doors[0]: The layout has no door bdoor_4';
    let play: string | null = why;
    const r = await rig(l, 'Vault', { playRefusal: () => play });
    r.q('check').click();
    expect(r.host.querySelector('[data-rules-clear]')!.textContent).toBe('No refusals: the rules check against this layout\'s entities');
    expect(r.host.querySelector('[data-rules-play]')!.textContent).toBe(`Play would refuse this mode: ${why}`);
    r.change({ ...l, mode: { ...l.mode!, params: { reward: 3 } } });
    expect(r.host.querySelector('[data-rules-play]'), 'stale after a change').toBeNull();
    play = null;
    r.q('check').click();
    expect(r.host.querySelector('[data-rules-play]')).toBeNull();
  });

  it('step-4 re-look: with a retail type selected (the mode of the layout is not the draft one) Check rules shows no Play-time line', async () => {
    const l = await vaultLayout();
    const why = 'rules.ENTITY_MISSING at entities.doors[0]: The layout has no door bdoor_4';
    const { mode: _drop, ...retail } = l;
    const r = await rig(retail as ForgeLayout, 'Vault', { playRefusal: () => why });
    r.q('check').click();
    expect(r.host.querySelector('[data-rules-play]'), 'the line is about the mode of the layout, which is a retail type here').toBeNull();
    r.change(l);
    r.q('check').click();
    expect(r.host.querySelector('[data-rules-play]')!.textContent, 'the draft is the mode of the layout: shown').toBe(`Play would refuse this mode: ${why}`);
  });

  it('a refusal (an edit during Play, the facade\'s PLAYING) is said in the panel\'s line and as a refusal; the page\'s state is not touched', async () => {
    const r = await rig(await vaultLayout());
    r.answer({ ok: false, code: 'PLAYING', message: 'Stop offline play before editing' });
    r.q('rule-delete:score').click();
    await flush();
    expect(r.said()).toBe('Stop offline play before editing');
    expect(r.host.querySelector<HTMLElement>('[data-rules-said]')!.hidden).toBe(false);
    expect(r.refused).toEqual(['Stop offline play before editing']);
    expect(r.host.querySelector('[data-rules-rule="score"]')).not.toBeNull();
  });

  it('D4: Place zone / marker / spawner enter the page\'s place mode; Remove rules is rules.clear', async () => {
    const r = await rig(await vaultLayout());
    r.q('place:zone').click();
    r.q('place:marker').click();
    r.q('place:spawner').click();
    expect(r.placed).toEqual(['zone', 'marker', 'spawner']);
    r.q('clear').click();
    await flush();
    expect(r.calls.map(([op, args]) => [op, args])).toEqual([['rules.clear', {}]]);
  });

  it('step-4 review F1: Edit-as-text refuses an id that belongs to ANOTHER rule (a rename onto it, an add with it), naming the field id; nothing is sent', async () => {
    const l = await vaultLayout();
    const r = await rig(l);
    const type = (rule: unknown): void => {
      const area = r.q<HTMLTextAreaElement>('rule-text');
      area.value = JSON.stringify(rule);
      area.dispatchEvent(new Event('input'));
      r.q('rule-save').click();
    };
    // Rename pay onto score, which exists: refused, no layout.batch (the batch would drop pay and replace score).
    r.q('rule-edit:pay').click();
    type({ ...l.rules!.spec.rules[0]!, id: 'score' });
    await flush();
    expect(r.calls).toEqual([]);
    const error = r.host.querySelector<HTMLElement>('[data-rules-error]')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/"score".*another rule/);
    expect(error.textContent).toMatch(/field id\b/);
    expect(r.refused).toContain(error.textContent);
    expect(JSON.parse(r.q<HTMLTextAreaElement>('rule-text').value).id, 'the text stays as typed').toBe('score');
    // Saving a rule under its own id is not a clash.
    type({ ...l.rules!.spec.rules[0]!, id: 'pay' });
    await flush();
    expect(r.calls.map(([op]) => op)).toEqual(['rules.rule.set']);
    r.calls.length = 0;
    r.refused.length = 0;
    // Add rule with a taken id: refused the same way.
    r.q('rule-add').click();
    type({ id: 'score', when: 'round.start', then: [{ do: 'message.show', text: 'x' }] });
    await flush();
    expect(r.calls).toEqual([]);
    expect(r.host.querySelector('[data-rules-error]')!.textContent).toMatch(/"score".*another rule.*field id\b/);
    expect(r.refused).toHaveLength(1);
  });

  it('step-4 review F7: a text that is not JSON, and a rule without its id, are also refusals (ui.refused, FUI.R19), besides the line under the text', async () => {
    const r = await rig(await vaultLayout());
    r.q('rule-edit:pay').click();
    const type = (text: string): void => {
      const area = r.q<HTMLTextAreaElement>('rule-text');
      area.value = text;
      area.dispatchEvent(new Event('input'));
      r.q('rule-save').click();
    };
    const line = (): string => r.host.querySelector<HTMLElement>('[data-rules-error]')!.textContent ?? '';
    type('{ not json');
    await flush();
    expect(line()).toContain('not JSON');
    expect(r.refused).toEqual([line()]);
    type(JSON.stringify({ when: 'round.start', then: [] }));
    await flush();
    expect(line()).toContain('with its id');
    expect(r.refused).toHaveLength(2);
    expect(r.refused[1]).toBe(line());
    expect(r.calls).toEqual([]);
  });

  it('pad: every control is a pad item the walker reaches in order, with no keyboard; Cross presses; Tab reaches each', async () => {
    const r = await rig(await vaultLayout());
    const controls = [...r.host.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter((e) => !e.closest('[hidden]'));
    expect(controls.length).toBeGreaterThan(15);
    expect(controls.filter((e) => !e.hasAttribute('data-pad-item')).map((e) => e.outerHTML)).toEqual([]);
    for (const c of controls) expect(c.tabIndex, c.dataset['rulesKey']).toBeGreaterThanOrEqual(0);
    const seen: string[] = [];
    for (let i = 0; i < controls.length; i++) {
      expect(r.instance.pad!('down')).toBe(true);
      seen.push(r.host.querySelector<HTMLElement>('.is-pad-focused')!.dataset['rulesKey']!);
    }
    expect(seen).toEqual(controls.map((c) => c.dataset['rulesKey']));
    // Cross on Check rules runs it.
    while (r.host.querySelector<HTMLElement>('.is-pad-focused')!.dataset['rulesKey'] !== 'check') r.instance.pad!('down');
    expect(r.instance.pad!('act')).toBe(true);
    expect(r.host.querySelector('[data-rules-clear]')).not.toBeNull();
    // The ring stays on the same control across the redraw.
    expect(r.host.querySelector<HTMLElement>('.is-pad-focused')!.dataset['rulesKey']).toBe('check');
  });
});
