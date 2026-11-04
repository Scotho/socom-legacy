import { Libmc, PersonaCard, UI_VAR_MODULE, type CardSlots } from '@s2u/card';
import { CARD_PASSWORD_UI_VARS_PLACEHOLDER, OPTION_VALVES, UI_VAR_MODULE_TUNERS_READING, VALVE_TYPE, type UiVarManager } from '@s2u/ui';
import type { NativeOptionsState } from './nativeOptionsHost';
import { VALVE_MODULE } from './originalOptions';

/** MLS.R7 browser adaptation: Home and native Options share applied state while taking turns editing. A successful
 * Home card write publishes only that field; it never reloads the card over unrelated unsaved session options.
 */
const contexts = new WeakMap<CardSlots, Set<NativeOptionsState>>();
export type NativeOptionField = 'valve' | 'tuner';
export interface OptionCommit { field: NativeOptionField; name: string; value: number }
const commits = new WeakMap<CardSlots, Set<(commit: OptionCommit) => void>>();
/** The test room can hear successful Home writes before its first native Options state has been constructed. */
export function observeOptionCommits(slots: CardSlots, callback: (commit: OptionCommit) => void): () => void {
  const set = commits.get(slots) ?? new Set<(commit: OptionCommit) => void>();
  set.add(callback); commits.set(slots, set);
  let active = true;
  return () => { if (!active) return; active = false; set.delete(callback); if (!set.size) commits.delete(slots); };
}
/** The existing live-tuner assignment, shared with the test room's pre-native manager. No effect or slider law. */
export function applyCommittedTuner(vars: Pick<UiVarManager, 'add' | 'set'>, name: string, value: number): void {
  const variable = vars.add(name, null, 3);
  vars.set(variable, { type: 'real', value });
}
const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

export function liveOptionValue(slots: CardSlots, field: NativeOptionField, name: string): number | undefined {
  const state = [...(contexts.get(slots) ?? [])].at(-1);
  if (!state) return undefined;
  if (field === 'valve') {
    const canonical = OPTION_VALVES.find(n => same(n, name));
    return canonical ? state.globals.value(canonical) : undefined;
  }
  if (!UI_VAR_MODULE_TUNERS_READING.some(n => same(n, name))) return undefined;
  const value = state.uiVars.find(name)?.value;
  return value?.type === 'real' ? value.value : undefined;
}

/** Called only after the existing card-save boundary confirms persistence. All conversions stay in the original
 * stores/managers: ValveStore's persistent word and UiVarManager's real node, followed by existing option observers.
 */
export function optionCommitted(slots: CardSlots, field: NativeOptionField, name: string, value: number): void {
  const canonical = (field === 'tuner' ? UI_VAR_MODULE_TUNERS_READING : OPTION_VALVES).find(n => same(n, name));
  if (!canonical) return;
  for (const state of contexts.get(slots) ?? []) {
    if (field === 'tuner') {
      applyCommittedTuner(state.uiVars, canonical, value);
    } else {
      state.valves.set(canonical, value, VALVE_TYPE.PERSIST);
      // Store this applied field alone. Other valves can contain a native draft that was never applied.
      state.globals.store({ find: key => key === canonical ? state.valves.find(canonical) : undefined });
    }
  }
  for (const callback of [...(commits.get(slots) ?? [])]) callback({ field, name: canonical, value });
}

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
/** Same slot selection as cardOptionStore: slot 1's valid file, else slot 2's. Reading changes no live manager. */
function cardData(slots: CardSlots): Record<string, unknown> | null {
  const mc = new Libmc(slots, { log: () => {} });
  for (const port of [0, 1] as const) {
    const card = new PersonaCard(mc, port), read = card.load();
    if (read.result >= 0 && !read.malformed) return object(card.contents().data);
  }
  return null;
}

/** Only Options fields belong to this editor. Keep newer non-option data from another card writer, alongside the
 * full session serializer (including locally held personas when the card's persona module has not changed).
 */
function keepNewerCardData(current: Record<string, unknown>, before: Record<string, unknown> | null, latest: Record<string, unknown> | null): Record<string, unknown> {
  if (!latest) return current;
  const out = { ...current };
  if (latest.CAcctDB !== undefined && !equal(before?.CAcctDB, latest.CAcctDB)) out.CAcctDB = latest.CAcctDB;
  for (const [module, own] of [[UI_VAR_MODULE, UI_VAR_MODULE_TUNERS_READING], [VALVE_MODULE, OPTION_VALVES]] as const) {
    const previous = object(before?.[module]), fresh = object(latest[module]);
    if (!fresh) continue;
    const merged = { ...object(current[module]) };
    for (const [name, value] of Object.entries(fresh)) {
      if (!own.some(n => same(n, name)) && !equal(previous?.[name], value)) merged[name] = value;
    }
    if (module === UI_VAR_MODULE) for (const name of Object.keys(merged)) {
      if (CARD_PASSWORD_UI_VARS_PLACEHOLDER.some(n => same(n, name))) delete merged[name];
    }
    out[module] = merged;
  }
  return out;
}

/** Attach once for the running session/page, rather than once per modal. Closing native Options keeps its applied
 * NO-save values available to Home. Disposing the session removes the bridge and its original observer cleanup.
 */
export function connectNativeOptions(slots: CardSlots, state: NativeOptionsState): NativeOptionsState {
  const before = cardData(slots), source = state.config;
  const live: NativeOptionsState = {
    ...state,
    config: {
      contents: () => {
        const current = source.contents(), data = object(current.data);
        if (!data) return current;
        const merged = keepNewerCardData(data, before, cardData(slots));
        // PersonaCard computes the save size from the resulting registered modules and persona count.
        const file = new PersonaCard(new Libmc(slots, { log: () => {} }), 0);
        return file.restore(merged) ? file.contents() : current;
      },
      restore: data => source.restore(data),
    },
    dispose: () => {
      contexts.get(slots)?.delete(live);
      if (contexts.get(slots)?.size === 0) contexts.delete(slots);
      state.dispose?.();
    },
  };
  const set = contexts.get(slots) ?? new Set<NativeOptionsState>();
  set.add(live); contexts.set(slots, set);
  return live;
}
