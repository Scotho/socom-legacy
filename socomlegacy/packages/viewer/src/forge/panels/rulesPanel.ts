import {
  RULE_SCOPES, RULE_VALUE_TYPES,
  type Diagnostic, type InstalledRulesPack, type LayoutMarker, type LayoutSpawner, type LayoutZone, type RecordMode, type RuleDecl,
  type RulesConfigParam,
} from '@s2u/creator-contracts';
import type { MenuItem } from '../padMenu';
import { checkForgeRules, type ForgeLayout, type ForgeRulesDraft } from '../rulesAuthoring';
import type { ForgePanelContext } from '../shell/context';
import { PAD_FOCUSED_CLASS, PAD_ITEM_ATTR, PadFocus } from '../shell/padFocus';
import { forgeEl, type ForgePanel } from '../shell/panel';

/**
 * FCW-32 step 4 (FUI-18's rules half; FUI.R23 D1, D3; product track, a browser adaptation with no original -- the
 * Forge's own authoring instrument): the right dock's **Rules** panel, under Edit after the Outliner. It edits the
 * layout's rules pack as the agent does -- every edit is one of the planner's (`../agent/commands` `FORGE_RULES_EDITS`,
 * through the page's facade `ctx.forge`, the person's actor), so one undo step takes each back and every refusal is the
 * planner's own words, the validator's diagnostic naming its code and field. It decides nothing: the room runs the
 * rules (FCW-31), and a layout without rules plays as before.
 *
 * Empty, one line and what "New rules" makes (a draft rules pack of this layout's mode, `rules.new`). With rules: the
 * configuration (a row per `config` descriptor: an int the dock's stepper, a bool the switch, an enum the select;
 * `rules.config.set`), the variables (a row each, add and delete), the rules (a row each, "`id` · when `event` · N
 * actions", expandable to a read view; Edit opens the rule as JSON text -- the same `rules.rule.set`, the refusal under
 * it --, Duplicate and Delete), the places of zones, markers and spawners (the page's place mode), "Check rules" (the
 * refusals of `checkForgeRules`, each naming its field and focusable) and Remove rules. Every control is a pad item
 * (`../shell/padFocus`): the START menu's Panels row "Rules" opens it and hands it the pad (the focus lease); the d-pad
 * walks it, Cross presses, Circle gives the pad back. The node editor is later (FCW-30's frozen semantics).
 */
export const RULES_PANEL_ADAPTATION =
  "the Forge's rules panel: a browser adaptation that edits a layout's rules pack through the planner's own edits; it decides no outcome" as const;

export type RulesEntityKind = 'zone' | 'marker' | 'spawner';
export const RULES_ENTITY_KINDS: readonly RulesEntityKind[] = Object.freeze(['zone', 'marker', 'spawner'] as const);
export const RULES_ENTITY_WORD: Readonly<Record<RulesEntityKind, string>> = Object.freeze({ zone: 'Zone', marker: 'Marker', spawner: 'Spawner' });
/**
 * What a placed entity starts as (the Forge's own, no original; edited afterwards by the rules' text or the agent): a
 * zone an upright cylinder of this radius and height in game units, a spawner team A's players, spread over none.
 */
export const RULES_PLACE_DEFAULTS_ADAPTATION = Object.freeze({
  zoneRadius: 50, zoneHeight: 100,
  spawnerSource: 'player' as const, spawnerTeam: 'A' as const, spawnerRadius: 0,
});
/** A new draft's pack version (the planner's own default for `rules.new`). */
export const RULES_DRAFT_VERSION = '1.0.0';
/** The longest name and id a new draft takes from the layout's name (`rules.new`'s `name` bound, 48). */
const NAME_MAX = 48;

/**
 * What "New rules" makes of the layout's name: the pack `rules.<slug>` (a pack id, `creator-contracts` `packs.ts`), the
 * mode `<slug>` (an authored id) and its name the layout's -- "Layout" when it has none.
 */
export function rulesDraftOfName(name: string): { pack: string; version: string; id: string; name: string } {
  const trimmed = name.trim();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, NAME_MAX).replace(/-+$/, '') || 'layout';
  return { pack: `rules.${slug}`, version: RULES_DRAFT_VERSION, id: slug, name: (trimmed || 'Layout').slice(0, NAME_MAX) };
}

/** A rule's event, as its `when` names it. */
export const ruleEvent = (r: RuleDecl): string => (typeof r.when === 'string' ? r.when : String(r.when.event));

/** A rule's row: "`id` · when `event` · N actions" (its `then` and its `else`). */
export function ruleSummary(r: RuleDecl): string {
  const n = (r.then?.length ?? 0) + (r.else?.length ?? 0);
  return `${r.id} · when ${ruleEvent(r)} · ${n} action${n === 1 ? '' : 's'}`;
}

/** The first `<kind><n>` (n from 1) no id of the layout's takes. */
export function freshEntityId(kind: RulesEntityKind, used: Iterable<string>): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${kind}${n}`)) n++;
  return `${kind}${n}`;
}

/** A copy's id: `<id>_2`, `_3`, ... the first the rules do not hold. */
export function duplicateRuleId(id: string, ids: Iterable<string>): string {
  const taken = new Set(ids);
  const base = id.slice(0, 60);
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** A new rule's id: the first `rule<n>` (n from 1) the rules do not hold. */
export function freshRuleId(ids: Iterable<string>): string {
  const taken = new Set(ids);
  let n = 1;
  while (taken.has(`rule${n}`)) n++;
  return `rule${n}`;
}

/** What a new rule's text starts as (a rule that validates, for the creator to change). */
export const newRuleText = (id: string): string =>
  JSON.stringify({ id, when: 'round.start', then: [{ do: 'message.show', text: 'Round on' }] }, null, 2);

/** The page's state the panel draws (cheap to read: the page's own copies). */
export interface RulesPanelState {
  rules: ForgeRulesDraft | null;
  mode: RecordMode | null;
  entities: { zones?: readonly LayoutZone[]; markers?: readonly LayoutMarker[]; spawners?: readonly LayoutSpawner[] };
  /** The layout's name ("New rules" names its pack from it). */
  name: string;
}

export interface RulesPanelHooks {
  state(): RulesPanelState;
  /** The whole layout as of now (its Check), or null with no base. */
  layout(): ForgeLayout | null;
  /** The rules packs installed here (`MountForgeOptions.installedRules`). */
  installed(): readonly InstalledRulesPack[];
  /**
   * Why Play would refuse the layout's rules mode against the map's doors and switches (the room's rule host at enable,
   * `../matchRules`), or null (review F2). Unset, no Play-time line.
   */
  playRefusal?(): string | null;
  /** The page's place mode for an entity (FUI.R23 D4): the next click on the world, or Cross, places it. */
  place(kind: RulesEntityKind): void;
  /** The entity the place mode waits to place, or null. */
  placing(): RulesEntityKind | null;
  /** A change of the layout or of the place mode: the panel redraws. The function lets go. */
  subscribe(listener: () => void): () => void;
}

/** The panel and its START section's rows (the page registers them as a menu section of their own, `rules`). */
export interface RulesForgePanel extends ForgePanel {
  menuRows(): MenuItem[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const newWords = (name: string): string => {
  const d = rulesDraftOfName(name);
  return `Makes a draft rules pack of this layout's mode: the pack ${d.pack}, its mode ${d.name}`;
};
const paramOf = (c: RulesConfigParam, mode: RecordMode | null): unknown => (mode && c.id in mode.params ? mode.params[c.id] : c.default);

interface Live {
  newRules(): Promise<boolean>;
  setParam(id: string, value: unknown): Promise<boolean>;
  enter(): void;
}

export function rulesPanel(hooks: RulesPanelHooks): RulesForgePanel {
  let live: Live | null = null;
  const menuRows = (): MenuItem[] => {
    const s = hooks.state();
    const rows: MenuItem[] = [];
    // A layout without rules has no section of its own: the Panels row "Rules" reaches New rules (the START menu's
    // sections as before, `../menuView` and its tests).
    if (!s.rules) return rows;
    for (const c of s.rules.spec.config ?? []) {
      const v = paramOf(c, s.mode);
      const set = (next: unknown): void => { void live?.setParam(c.id, next); };
      const label = c.label ?? c.id;
      if (c.type === 'bool') {
        const flip = (): void => set(v !== true);
        rows.push({ id: `rules-config-${c.id}`, label, value: v === true ? 'On' : 'Off', keepOpen: true, act: flip, left: flip, right: flip });
      } else if (c.type === 'enum') {
        const values = c.values ?? [];
        const at = Math.max(0, values.indexOf(String(v)));
        const to = (by: number): void => { if (values.length) set(values[(at + by + values.length) % values.length]); };
        rows.push({ id: `rules-config-${c.id}`, label, value: String(v), keepOpen: true, left: () => to(-1), right: () => to(1) });
      } else {
        const n = typeof v === 'number' ? v : 0;
        const to = (by: number): void => {
          const next = Math.min(c.max ?? Number.MAX_SAFE_INTEGER, Math.max(c.min ?? Number.MIN_SAFE_INTEGER, n + by));
          if (next !== n) set(next);
        };
        rows.push({ id: `rules-config-${c.id}`, label, value: String(n), keepOpen: true, left: () => to(-1), right: () => to(1) });
      }
    }
    for (const kind of RULES_ENTITY_KINDS) {
      rows.push({ id: `rules-place-${kind}`, label: `Place ${RULES_ENTITY_WORD[kind].toLowerCase()}`,
        note: 'Then aim: Cross places it at the centre, a click where the pointer is; Esc cancels', act: () => hooks.place(kind) });
    }
    return rows;
  };
  return {
    id: 'rules', title: 'Rules', dock: 'right', order: 36, defaultOpen: false, tab: 'Map',
    padLegend: [{ button: 'dpad', label: 'Move' }, { button: 'cross', label: 'Press' }, { button: 'circle', label: 'Back' }],
    menuRows,
    menuSection: () => {
      const s = hooks.state();
      return [{ id: 'panel-rules', label: 'Rules', value: s.rules ? s.rules.spec.name : 'None',
        note: 'The layout\'s rules · ✕ shows them and hands them the pad (○ gives it back)', act: () => live?.enter() }];
    },
    mount(host: HTMLElement, ctx: ForgePanelContext) {
      const doc = host.ownerDocument;
      const body = forgeEl(doc, 'div', 'fx-section fx-rules');
      body.dataset['forgeRules'] = '';
      host.append(body);
      const walker = new PadFocus(body);
      let stamp = '';
      let disposed = false;
      let lease: (() => void) | null = null;
      const expanded = new Set<string>();
      /** The rule open as text: its id (null: a new rule), the text as typed, and the planner's refusal of it. */
      let editing: { id: string | null; text: string; error: string | null } | null = null;
      let findings: Diagnostic[] | null = null;
      /** The Play-time refusal read with the last Check (review F2), or null. */
      let playWhy: string | null = null;
      let said = '';
      const form = { id: '', scope: 'player', type: 'int', start: '0', min: '0', max: '100', values: '' };

      const keyed = <E extends HTMLElement>(e: E, key: string): E => {
        e.dataset['rulesKey'] = key;
        e.setAttribute(PAD_ITEM_ATTR, '');
        return e;
      };
      const button = (key: string, text: string, cls = 'fx-chip'): HTMLButtonElement => {
        const b = keyed(forgeEl(doc, 'button', cls, text), key);
        b.type = 'button';
        return b;
      };
      const find = (key: string | null | undefined): HTMLElement | null =>
        (key ? [...body.querySelectorAll<HTMLElement>('[data-rules-key]')].find((e) => e.dataset['rulesKey'] === key) ?? null : null);
      const settingRow = (label: string, control: HTMLElement): HTMLLabelElement => {
        const w = forgeEl(doc, 'label', 'fx-setting');
        const head = forgeEl(doc, 'span', 'fx-setting-head');
        head.append(forgeEl(doc, 'span', '', label));
        w.append(head, control);
        return w;
      };

      /** One of the planner's edits through the person's facade; a refusal said in the panel's line and as a refusal. */
      const exec = async (operation: string, args: Record<string, unknown>): Promise<{ ok: boolean; message: string }> => {
        try {
          const r = await ctx.forge.execute(operation, args, ctx.forge.status().revision);
          return { ok: r.ok, message: r.ok ? '' : r.message || r.code || 'Refused' };
        } catch (e) { return { ok: false, message: words(e) }; }
      };
      const run = async (operation: string, args: Record<string, unknown>): Promise<boolean> => {
        const r = await exec(operation, args);
        if (disposed) return r.ok;
        said = r.message;
        if (!r.ok) ctx.ui.refused(r.message);
        draw(true);
        return r.ok;
      };
      const newRules = (): Promise<boolean> => {
        const d = rulesDraftOfName(hooks.state().name);
        return run('rules.new', { pack: d.pack, version: d.version, id: d.id, name: d.name });
      };
      const setParam = (id: string, value: unknown): Promise<boolean> =>
        run('rules.config.set', { params: { ...(hooks.state().mode?.params ?? {}), [id]: value } });

      const save = async (): Promise<void> => {
        const e = editing;
        if (!e) return;
        // Review F7: every refusal of the text is also a refusal (FUI.R19), as the planner's is, besides the line under it.
        const refuse = (why: string): void => { e.error = why; ctx.ui.refused(why); draw(true); };
        let rule: unknown;
        try { rule = JSON.parse(e.text); } catch (x) { refuse(`The rule is not JSON: ${words(x)}`); return; }
        if (!isObj(rule) || typeof rule['id'] !== 'string') { refuse('A rule is an object with its id, its when and its then'); return; }
        const list = hooks.state().rules?.spec.rules ?? [];
        // Review F1: the planner's upsert replaces by id, so an id that belongs to ANOTHER rule (a rename onto it, an add
        // with it) would silently drop one of the two: refused here, naming the field, nothing sent.
        if (list.some((r) => r.id === rule['id'] && r.id !== e.id)) {
          refuse(`The id "${String(rule['id'])}" belongs to another rule (field id): give this rule an id of its own`);
          return;
        }
        const at = e.id === null ? -1 : list.findIndex((r) => r.id === e.id);
        // A renamed rule replaces its old one in its place: one step of the planner's two edits (`layout.batch`).
        const r = e.id !== null && rule['id'] !== e.id && at >= 0
          ? await exec('layout.batch', { edits: [{ operation: 'rules.rule.delete', args: { id: e.id } }, { operation: 'rules.rule.set', args: { rule, index: at } }] })
          : await exec('rules.rule.set', { rule });
        if (disposed) return;
        if (r.ok) { editing = null; said = ''; }
        else { e.error = r.message; ctx.ui.refused(r.message); }
        draw(true);
      };
      const openEditor = (id: string | null, text: string): void => {
        editing = { id, text, error: null };
        draw(true);
        find('rule-text')?.focus();
      };

      /* ---------- the sections ---------- */
      const head = (rules: ForgeRulesDraft): HTMLElement => {
        const h = forgeEl(doc, 'div', 'fx-rules-head');
        h.append(forgeEl(doc, 'strong', 'fx-rules-name', rules.spec.name), forgeEl(doc, 'span', 'fx-dim', `${rules.spec.id}@${rules.pack.version} · ${rules.pack.id}`));
        return h;
      };
      const configRows = (s: RulesPanelState, rules: ForgeRulesDraft): HTMLElement[] => {
        const out: HTMLElement[] = [forgeEl(doc, 'h3', '', 'Configuration')];
        const config = rules.spec.config ?? [];
        if (!config.length) { out.push(forgeEl(doc, 'p', 'fx-dim', 'This mode publishes no configuration values (its text declares them: config)')); return out; }
        for (const c of config) {
          const v = paramOf(c, s.mode);
          const label = c.label ?? c.id;
          if (c.type === 'bool') {
            const w = forgeEl(doc, 'label', 'fx-toggle');
            const i = keyed(forgeEl(doc, 'input'), `config:${c.id}`);
            i.type = 'checkbox';
            i.checked = v === true;
            i.addEventListener('change', () => { void setParam(c.id, i.checked); });
            w.append(i, forgeEl(doc, 'span', '', label));
            out.push(w);
          } else if (c.type === 'enum') {
            const sel = keyed(forgeEl(doc, 'select', 'fx-select'), `config:${c.id}`);
            sel.setAttribute('aria-label', label);
            for (const value of c.values ?? []) { const o = forgeEl(doc, 'option', '', value); o.value = value; sel.append(o); }
            sel.value = String(v);
            sel.addEventListener('change', () => { void setParam(c.id, sel.value); });
            out.push(settingRow(label, sel));
          } else {
            const i = keyed(forgeEl(doc, 'input', 'fx-num fx-setting-num fx-stepper'), `config:${c.id}`);   // FUI-22 (D2): the dock's one stepper
            i.type = 'number';
            i.step = '1';
            if (c.min !== undefined) i.min = String(c.min);
            if (c.max !== undefined) i.max = String(c.max);
            i.value = String(v);
            i.title = label;
            i.setAttribute('aria-label', label);
            i.addEventListener('change', () => {
              const n = Number(i.value);
              if (i.value.trim() === '' || !Number.isInteger(n)) { draw(true); return; }
              void setParam(c.id, n);
            });
            out.push(settingRow(label, i));
          }
        }
        return out;
      };
      const variableRows = (rules: ForgeRulesDraft): HTMLElement[] => {
        const list = forgeEl(doc, 'ul', 'fx-rules-list');
        for (const v of rules.spec.variables ?? []) {
          const li = forgeEl(doc, 'li', 'fx-rules-item');
          li.dataset['rulesVariable'] = v.id;
          li.append(forgeEl(doc, 'span', 'fx-rules-words', `${v.id} · ${v.scope} · ${v.type} · start ${String(v.start)}`));
          const del = button(`variable-delete:${v.id}`, 'Delete');
          del.title = `Delete the variable ${v.id} (refused while a rule names it)`;
          del.addEventListener('click', () => { void run('rules.variable.delete', { id: v.id }); });
          li.append(del);
          list.append(li);
        }
        if (!list.children.length) list.append(forgeEl(doc, 'li', 'fx-empty', 'No variables'));
        const formEl = forgeEl(doc, 'div', 'fx-rules-form');
        const text = (key: keyof typeof form, placeholder: string, label: string): HTMLInputElement => {
          const i = keyed(forgeEl(doc, 'input', 'fx-search'), `variable-new:${key}`);
          i.type = 'text';
          i.placeholder = placeholder;
          i.setAttribute('aria-label', label);
          i.value = form[key];
          i.addEventListener('input', () => { form[key] = i.value; });
          return i;
        };
        const number = (key: 'min' | 'max', label: string): HTMLInputElement => {
          const i = keyed(forgeEl(doc, 'input', 'fx-num fx-stepper'), `variable-new:${key}`);
          i.type = 'number';
          i.step = '1';
          i.title = label;
          i.setAttribute('aria-label', label);
          i.value = form[key];
          i.addEventListener('input', () => { form[key] = i.value; });
          return i;
        };
        const choice = (key: 'scope' | 'type', values: readonly string[], label: string): HTMLSelectElement => {
          const sel = keyed(forgeEl(doc, 'select', 'fx-select'), `variable-new:${key}`);
          sel.setAttribute('aria-label', label);
          for (const value of values) { const o = forgeEl(doc, 'option', '', value); o.value = value; sel.append(o); }
          sel.value = form[key];
          sel.addEventListener('change', () => { form[key] = sel.value; });
          return sel;
        };
        const idIn = text('id', 'id', 'Variable id');
        const scopeSel = choice('scope', RULE_SCOPES, 'Variable scope');
        const typeSel = choice('type', RULE_VALUE_TYPES, 'Variable type');
        const startIn = text('start', 'start', 'Variable start');
        const minIn = number('min', 'Least (an int)');
        const maxIn = number('max', 'Most (an int)');
        const valuesIn = text('values', 'values (an enum): a, b', 'Variable values');
        const add = button('variable-add', 'Add variable');
        add.addEventListener('click', () => {
          const id = idIn.value.trim();
          if (!id) { said = 'A variable needs its id'; ctx.ui.refused(said); draw(true); return; }
          const scope = scopeSel.value, type = typeSel.value, start = startIn.value.trim();
          const values = valuesIn.value.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
          const variable = type === 'int' ? { id, scope, type, start: Number(start), min: Number(minIn.value), max: Number(maxIn.value) }
            : type === 'bool' ? { id, scope, type, start: /^(true|on|yes|1)$/i.test(start) }
            : { id, scope, type, values, start: start || values[0] || '' };
          void run('rules.variable.set', { variable }).then((ok) => { if (ok) { form.id = ''; draw(true); } });
        });
        formEl.append(idIn, scopeSel, typeSel, startIn, minIn, maxIn, valuesIn, add);
        return [forgeEl(doc, 'h3', '', 'Variables'), list, formEl];
      };
      const editor = (): HTMLElement => {
        const e = editing!;
        const box = forgeEl(doc, 'div', 'fx-rules-editor');
        const area = keyed(forgeEl(doc, 'textarea', 'fx-rules-text'), 'rule-text');
        area.rows = 10;
        area.spellcheck = false;
        area.setAttribute('aria-label', e.id === null ? 'The new rule, as JSON' : `The rule ${e.id}, as JSON`);
        area.value = e.text;
        area.addEventListener('input', () => { e.text = area.value; });
        const error = forgeEl(doc, 'p', 'fx-rules-error', e.error ?? '');
        error.dataset['rulesError'] = '';
        error.setAttribute('role', 'alert');
        error.hidden = !e.error;
        const acts = forgeEl(doc, 'div', 'fx-rules-acts');
        const ok = button('rule-save', 'Save rule');
        ok.addEventListener('click', () => { e.text = area.value; void save(); });
        const cancel = button('rule-cancel', 'Cancel');
        cancel.addEventListener('click', () => { editing = null; draw(true); });
        acts.append(ok, cancel);
        box.append(area, error, acts);
        return box;
      };
      const ruleRows = (rules: ForgeRulesDraft): HTMLElement[] => {
        const list = forgeEl(doc, 'ul', 'fx-rules-list');
        const ids = rules.spec.rules.map((r) => r.id);
        const was = editing;
        if (was && was.id !== null && !ids.includes(was.id)) editing = null;      // its rule deleted meanwhile
        rules.spec.rules.forEach((rule, i) => {
          const li = forgeEl(doc, 'li', 'fx-rules-item fx-rules-rule');
          li.dataset['rulesRule'] = rule.id;
          const open = expanded.has(rule.id);
          const row = button(`rule-open:${rule.id}`, ruleSummary(rule), 'fx-rules-row');
          row.setAttribute('aria-expanded', String(open));
          row.title = open ? 'Fold its conditions and actions' : 'Read its conditions and actions';
          row.addEventListener('click', () => { if (open) expanded.delete(rule.id); else expanded.add(rule.id); draw(true); });
          const acts = forgeEl(doc, 'span', 'fx-rules-acts');
          const edit = button(`rule-edit:${rule.id}`, 'Edit');
          edit.title = 'Edit the rule as text (JSON)';
          edit.addEventListener('click', () => openEditor(rule.id, JSON.stringify(rule, null, 2)));
          const dup = button(`rule-duplicate:${rule.id}`, 'Duplicate');
          dup.addEventListener('click', () => {
            const copy = JSON.parse(JSON.stringify(rule)) as Record<string, unknown>;
            void run('rules.rule.set', { rule: { ...copy, id: duplicateRuleId(rule.id, ids) }, index: i + 1 });
          });
          const del = button(`rule-delete:${rule.id}`, 'Delete');
          del.addEventListener('click', () => { void run('rules.rule.delete', { id: rule.id }); });
          acts.append(edit, dup, del);
          li.append(row, acts);
          if (open) {
            const read = forgeEl(doc, 'pre', 'fx-rules-read', JSON.stringify({ ...(rule.if ? { if: rule.if } : {}), then: rule.then, ...(rule.else ? { else: rule.else } : {}) }, null, 1));
            read.dataset['rulesRead'] = rule.id;
            li.append(read);
          }
          if (editing?.id === rule.id) li.append(editor());
          list.append(li);
        });
        if (!list.children.length) list.append(forgeEl(doc, 'li', 'fx-empty', 'No rules yet: Add rule writes one as text'));
        const add = button('rule-add', 'Add rule');
        add.addEventListener('click', () => openEditor(null, newRuleText(freshRuleId(ids))));
        const out: HTMLElement[] = [forgeEl(doc, 'h3', '', 'Rules'), list, add];
        if (editing?.id === null) out.push(editor());
        return out;
      };
      const placeRows = (): HTMLElement[] => {
        const placing = hooks.placing();
        const row = forgeEl(doc, 'div', 'fx-rules-acts fx-rules-place');
        for (const kind of RULES_ENTITY_KINDS) {
          const b = button(`place:${kind}`, `Place ${RULES_ENTITY_WORD[kind].toLowerCase()}`);
          b.setAttribute('aria-pressed', String(placing === kind));
          b.title = `Place a ${kind} for the rules to name: the next click on the world (or Cross) places it`;
          b.addEventListener('click', () => hooks.place(kind));
          row.append(b);
        }
        const note = placing ? `Click the world (or Cross) to place the ${placing}; Esc cancels`
          : 'Zones, markers and spawners the rules name; each lists in the Outliner';
        return [forgeEl(doc, 'h3', '', 'Place'), row, forgeEl(doc, 'p', 'fx-dim fx-setting-note', note)];
      };
      const checkRows = (rules: ForgeRulesDraft): HTMLElement[] => {
        const check = button('check', 'Check rules');
        check.title = 'Check the rules against this layout\'s entities, and against the map\'s doors and switches as Play does: each refusal names its field';
        check.addEventListener('click', () => {
          const l = hooks.layout();
          findings = l ? checkForgeRules(l, hooks.installed()).diagnostics.filter((d) => d.severity === 'error') : [];
          // Step-4 re-look: the line speaks of "this mode" -- the draft's only while the layout plays it (a retail Game type
          // selected, the draft's mode is not what Play would run).
          const plays = !!l?.rules && !!l.mode && l.mode.id === l.rules.spec.id && l.mode.version === l.rules.pack.version;
          playWhy = l && plays ? hooks.playRefusal?.() ?? null : null;
          draw(true);
        });
        const out: HTMLElement[] = [forgeEl(doc, 'h3', '', 'Check'), check];
        if (findings !== null) {
          if (findings.length === 0) {
            const clear = forgeEl(doc, 'p', 'fx-dim', 'No refusals: the rules check against this layout\'s entities');
            clear.dataset['rulesClear'] = '';
            out.push(clear);
          } else {
            const list = forgeEl(doc, 'ul', 'fx-rules-list');
            findings.forEach((d, i) => {
              const b = button(`finding:${i}`, `${d.code}${d.field ? ` at ${d.field}` : ''}: ${d.text}`, 'fx-rules-finding');
              b.dataset['rulesFinding'] = d.severity;
              const at = /^rules\[(\d+)\]/.exec(d.field ?? '');
              const rule = at ? rules.spec.rules[Number(at[1])] : undefined;
              if (rule) { b.title = `Open the rule ${rule.id} as text`; b.addEventListener('click', () => openEditor(rule.id, JSON.stringify(rule, null, 2))); }
              const li = forgeEl(doc, 'li');
              li.append(b);
              list.append(li);
            });
            out.push(list);
          }
          if (playWhy) {
            const play = forgeEl(doc, 'p', 'fx-rules-error', `Play would refuse this mode: ${playWhy}`);
            play.dataset['rulesPlay'] = '';
            out.push(play);
          }
        }
        return out;
      };

      const build = (): HTMLElement[] => {
        const s = hooks.state();
        const out: HTMLElement[] = [];
        if (!s.rules) {
          editing = null;
          const empty = forgeEl(doc, 'p', 'fx-rules-empty');
          empty.append(forgeEl(doc, 'span', '', 'No rules. '));
          const make = button('new', 'New rules ›', 'fx-chip fx-rules-new');
          make.title = newWords(s.name);
          make.addEventListener('click', () => { void newRules(); });
          empty.append(make);
          out.push(empty, forgeEl(doc, 'p', 'fx-dim fx-setting-note', newWords(s.name)));
        } else {
          out.push(head(s.rules), ...configRows(s, s.rules), ...variableRows(s.rules), ...ruleRows(s.rules));
        }
        out.push(...placeRows());
        if (s.rules) {
          out.push(...checkRows(s.rules));
          const clear = button('clear', 'Remove rules');
          clear.title = 'Remove the layout\'s rules, its rules mode and its requirement on their pack (one undo step)';
          clear.addEventListener('click', () => { void run('rules.clear', {}); });
          out.push(clear);
        }
        const line = forgeEl(doc, 'p', 'fx-rules-said', said);
        line.dataset['rulesSaid'] = '';
        line.setAttribute('role', 'status');
        line.hidden = !said;
        out.push(line);
        return out;
      };
      /**
       * Drawn again when the page's state changed (or `force`, the panel's own change): the control holding the focus and
       * the pad's ring are put back on the same control of the new drawing.
       */
      function draw(force = false): void {
        if (disposed) return;
        const s = hooks.state();
        const next = JSON.stringify([s.rules, s.mode, s.entities, s.name, hooks.placing()]);
        if (!force && next === stamp) return;
        if (next !== stamp) { findings = null; playWhy = null; }   // a change makes the last check stale
        stamp = next;
        const active = doc.activeElement;
        const focusKey = active instanceof HTMLElement && body.contains(active) ? active.dataset['rulesKey'] ?? null : null;
        const ringKey = body.querySelector<HTMLElement>(`.${PAD_FOCUSED_CLASS}`)?.dataset['rulesKey'] ?? null;
        body.replaceChildren(...build());
        walker.clear();
        const ring = find(ringKey);
        if (ring) walker.focus(ring, focusKey === ringKey);
        if (focusKey && focusKey !== ringKey) find(focusKey)?.focus({ preventScroll: true });
      }
      live = {
        newRules, setParam,
        enter: () => {
          ctx.ui.reveal('rules');
          lease?.();
          lease = ctx.ui.focus.take('rules');
          // After the menu's row hands the focus to the dock's tab: the pad's ring on the panel's first control.
          queueMicrotask(() => { if (!disposed) walker.focus(0); });
        },
      };
      const off = hooks.subscribe(() => draw());
      draw(true);
      return {
        update: () => draw(),
        pad: (input) => walker.input(input),
        visibility: (shown) => { if (!shown) { lease?.(); lease = null; } },
        dispose: () => { disposed = true; off(); lease?.(); lease = null; live = null; body.remove(); },
      };
    },
  };
}
