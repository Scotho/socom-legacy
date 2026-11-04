import { autosaveUnreadable, checkRecord, layoutOfRecord, RECORD_LIMITS, type LayoutRecord } from './record';
import { checkForgeRules, draftModes, readRulesDraft, refusalWords, type ForgeRulesDraft } from './rulesAuthoring';

/**
 * FORGE: named layouts kept in this browser, beside the autosave. A browser adaptation with no original. The account
 * list (FG-13, FG-14) is not this: an account row would keep the same `LayoutRecord` plus its own owner and time, not
 * this list's id or `savedAt`.
 */

/** The key the list lives under (`../pageStore` `PAGE_SETTING_KEYS`). */
export const FORGE_SAVES_KEY = 's2u-forge-saves';
/** Where a saved list this build cannot read is set aside, as it was (`setAsideSaves`). */
export const FORGE_SAVES_ASIDE_KEY = 's2u-forge-saves-aside';
/** LATER 193: where the autosaves this build cannot read are set aside, as they were: a JSON list of texts (`setAsideAutosave`). */
export const FORGE_AUTOSAVE_ASIDE_KEY = 's2u-forge-layout-aside';
/**
 * LATER 193, ADAPTATION (no original; the forge is the port's own): how many unreadable autosaves are kept aside. Past
 * it the set-aside refuses -- none is dropped for another -- and the page keeps the autosave in place instead.
 */
export const AUTOSAVE_ASIDE_LIMIT_ADAPTATION = 8;

/** How many named layouts one browser keeps. Past this, a new name is refused; replacing one is not. */
export const SAVE_LIMIT = 40;

/**
 * The name an unnamed layout's autosave record takes. It is not a name the builder typed: the joiner's Save box shows
 * the lobby's name instead (`joinerSavePreset`).
 */
export const AUTOSAVE_NAME = 'Autosave';

/** The joiner's Save box: the layout's name, or the lobby's when the layout has none. `Autosave` counts as none. */
export function joinerSavePreset(layoutName: string | undefined, lobbyName: string, max = RECORD_LIMITS.name): string {
  const given = layoutName?.trim() ?? '';
  const name = given !== '' && given !== AUTOSAVE_NAME ? given : lobbyName;
  return name.slice(0, max);
}

/** The page's store as the list uses it (`../pageStore` `pageSettings`). */
export interface Store { get(key: string): string | null; set(key: string, value: string): unknown }

export interface NamedSave {
  id: string;
  /** The record's `name`, what the list shows. */
  name: string;
  /** This browser's clock when it was written. Not part of the layout. */
  savedAt: number;
  record: LayoutRecord;
  /**
   * FCW-32: the layout's rules (`./rulesAuthoring` `ForgeRulesDraft`) beside its record, which has no field for them;
   * the record's mode is checked with their modes. Absent: none. An earlier build reads a save naming a rules mode as
   * unreadable and keeps it as it was.
   */
  rules?: ForgeRulesDraft;
}

/**
 * A save's record checked with the modes of its own rules (FCW-32); null, or why not. FCW-32 round 2 (the review's F5):
 * and its rules checked against its layout as the Forge refuses an edit (`checkForgeRules`: the validator against the
 * layout's entities, F2's release checks, the mode's pack among its requirements), so a save the editor could not edit
 * is set aside as unreadable (kept as it was), never opened to refuse every edit after.
 */
const checkSaved = (record: unknown, rules: ForgeRulesDraft | undefined): string | null =>
  checkRecord(record, { modes: draftModes(rules) }) ?? (rules ? refusalWords(checkForgeRules({ ...layoutOfRecord(record as LayoutRecord), rules })) : null);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * An entry this build cannot read (#348's re-review): a hand edit, or a later build's field. It is kept as it was
 * (`raw`) and written back by `writeSaves`, never dropped; the list names it (`name`, `why`).
 */
export interface UnreadableSave {
  name: string;
  why: string;
  raw: unknown;
  /** The whole store, not one entry: a shape this build does not read as a list. `writeSaves` then writes nothing. */
  whole?: true;
}

/** An unreadable entry's name for the list: its record's name, its own, or a stand-in. */
function nameOfUnreadable(item: unknown): string {
  if (isObj(item)) {
    const r = item['record'];
    if (isObj(r) && typeof r['name'] === 'string' && r['name'].trim()) return r['name'].trim();
    if (typeof item['name'] === 'string' && item['name'].trim()) return item['name'].trim();
  }
  return 'an unnamed entry';
}

/**
 * The list: the entries that read, and the ones that do not, kept as they were. A missing store, or one that throws,
 * reads as none. A store this build cannot read as a list (broken JSON, a later build's shape) is one unreadable
 * `whole` entry, and nothing is written over it (the fold's review, low 4).
 */
export function readSaveList(store: Store): { saves: NamedSave[]; unreadable: UnreadableSave[] } {
  let raw: string | null;
  try { raw = store.get(FORGE_SAVES_KEY); } catch { return { saves: [], unreadable: [] }; }
  if (!raw) return { saves: [], unreadable: [] };
  const whole = (why: string): { saves: NamedSave[]; unreadable: UnreadableSave[] } =>
    ({ saves: [], unreadable: [{ name: 'the saved list', why, raw, whole: true }] });
  try {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return whole('not JSON'); }
    const list = Array.isArray(parsed) ? parsed : (isObj(parsed) && Array.isArray(parsed['saves']) ? parsed['saves'] : null);
    if (!list) return whole('not a list this build reads');
    const saves: NamedSave[] = [];
    const unreadable: UnreadableSave[] = [];
    for (const item of list as unknown[]) {
      let rules: ForgeRulesDraft | undefined;
      let why = !isObj(item) || typeof item['id'] !== 'string' || typeof item['savedAt'] !== 'number' ? 'not a save' : null;
      if (!why && (item as Record<string, unknown>)['rules'] !== undefined) {
        try { rules = readRulesDraft((item as Record<string, unknown>)['rules']); } catch (e) { why = e instanceof Error ? e.message : String(e); }
      }
      why ??= checkSaved((item as Record<string, unknown>)['record'], rules);
      if (why) { unreadable.push({ name: nameOfUnreadable(item), why, raw: item }); continue; }
      const it = item as Record<string, unknown>;
      const record = it['record'] as LayoutRecord;
      saves.push({ id: it['id'] as string, name: record.name, savedAt: it['savedAt'] as number, record, ...(rules ? { rules } : {}) });
    }
    return { saves, unreadable };
  } catch {
    return { saves: [], unreadable: [] };
  }
}

/** The entries that read (`readSaveList`'s `saves`). */
export function readSaves(store: Store): NamedSave[] {
  return readSaveList(store).saves;
}

/**
 * Writes the list, the unreadable entries after it as they were. False when the store throws or refuses the write (a
 * private window, the quota) -- read back, since the page's store refuses without throwing (LATER 213) -- and when
 * the store is one this build cannot read as a list (a `whole` entry): it is never written over.
 */
export function writeSaves(saves: readonly NamedSave[], store: Store, unreadable: readonly UnreadableSave[] = []): boolean {
  if (unreadable.some((u) => u.whole)) return false;
  try {
    const text = JSON.stringify({ v: 1, saves: [...saves, ...unreadable.map((u) => u.raw)] });
    store.set(FORGE_SAVES_KEY, text);
    return store.get(FORGE_SAVES_KEY) === text;
  } catch {
    return false;
  }
}

/**
 * Moves a saved list this build cannot read to `FORGE_SAVES_ASIDE_KEY`, as it was, so saving works again (the fold's
 * re-review, finding A). Never over an earlier set-aside list; false then, or when the store throws or refuses a write.
 * LATER 213: each write is read back (the page's store refuses without throwing), and the list is cleared only once
 * its copy is kept -- a refused copy followed by a taken clear erased the whole list.
 */
export function setAsideSaves(store: Store): boolean {
  try {
    if (store.get(FORGE_SAVES_ASIDE_KEY)) return false;
    const raw = store.get(FORGE_SAVES_KEY);
    if (!raw) return false;
    store.set(FORGE_SAVES_ASIDE_KEY, raw);
    if (store.get(FORGE_SAVES_ASIDE_KEY) !== raw) return false;
    store.set(FORGE_SAVES_KEY, '');
    return store.get(FORGE_SAVES_KEY) === '';
  } catch {
    return false;
  }
}

/** The autosaves set aside, oldest first (`setAsideAutosave`); none when the key is absent or cannot be read. */
export function readAutosaveAside(store: Store): string[] {
  try {
    const raw = store.get(FORGE_AUTOSAVE_ASIDE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.every((t) => typeof t === 'string') ? list : [];
  } catch {
    return [];
  }
}

/**
 * LATER 193: sets an autosave this build cannot read aside, as it was, appended to `FORGE_AUTOSAVE_ASIDE_KEY`'s list, so
 * the page's next write (a share link's layout, a fresh one) replaces nothing the player made -- `setAsideSaves`' rule
 * for the saved list, each one kept (the batch review's F1, F4). True when it is kept: set aside now, or already. False
 * for an empty text, a full list (`AUTOSAVE_ASIDE_LIMIT_ADAPTATION`), a list this build cannot read (left as it is), or
 * a write the store refused -- read back, since the page's store refuses without throwing (the review's F2).
 */
export function setAsideAutosave(store: Store, text: string): boolean {
  try {
    if (!text) return false;
    const raw = store.get(FORGE_AUTOSAVE_ASIDE_KEY);
    const list = readAutosaveAside(store);
    if (raw && list.length === 0) return false;                     // a list this build cannot read: left alone
    if (list.includes(text)) return true;
    if (list.length >= AUTOSAVE_ASIDE_LIMIT_ADAPTATION) return false;
    const next = JSON.stringify([...list, text]);
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, next);
    return store.get(FORGE_AUTOSAVE_ASIDE_KEY) === next;
  } catch {
    return false;
  }
}

/**
 * LATER 214: one copy kept aside -- an autosave (`setAsideAutosave`), the autosave list whole when this build cannot
 * read it as a list, or the saved list (`setAsideSaves`) -- as the Saves card shows it. `readable`: whether this build
 * reads it now (each was set aside unreadable; a later build may read one).
 */
export interface KeptAside { id: string; name: string; text: string; readable: boolean }

/** LATER 214: what is kept aside, the autosaves oldest first, then the saved list; none when nothing is, or the store throws. */
export function keptAside(store: Store): KeptAside[] {
  const out: KeptAside[] = [];
  try {
    const raw = store.get(FORGE_AUTOSAVE_ASIDE_KEY);
    const list = readAutosaveAside(store);
    if (raw && list.length === 0 && raw !== '[]') out.push({ id: 'autosaves', name: 'Earlier autosaves', text: raw, readable: false });
    list.forEach((text, i) => out.push({ id: `autosave:${i}`, name: `Earlier autosave ${i + 1}`, text, readable: !autosaveUnreadable(text) }));
    const saves = store.get(FORGE_SAVES_ASIDE_KEY);
    if (saves) {
      const readable = !readSaveList({ get: () => saves, set: () => undefined }).unreadable.some((u) => u.whole);
      out.push({ id: 'saves', name: 'Earlier saved list', text: saves, readable });
    }
  } catch { /* a store that throws keeps nothing this page can show */ }
  return out;
}

/**
 * LATER 214: removes the kept copy `k`, the rest left as they were; each write read back (the page's store refuses
 * without throwing, LATER 213). 'dropped' when it is gone now; 'gone' when the store no longer held it (another tab
 * took it: nothing written -- the review's L1, not a refusal); 'refused' when the store refused or threw. The keys
 * emptied read as free again (`setAsideSaves`, `setAsideAutosave`).
 */
export function dropKeptAside(store: Store, k: KeptAside): 'dropped' | 'gone' | 'refused' {
  try {
    const clear = (key: string): 'dropped' | 'gone' | 'refused' => {
      if (store.get(key) !== k.text) return 'gone';
      store.set(key, '');
      return store.get(key) === '' ? 'dropped' : 'refused';
    };
    if (k.id === 'saves') return clear(FORGE_SAVES_ASIDE_KEY);
    if (k.id === 'autosaves') return clear(FORGE_AUTOSAVE_ASIDE_KEY);
    const list = readAutosaveAside(store);
    const at = list.indexOf(k.text);
    if (at < 0) return 'gone';
    // The last one gone: '' -- not '[]', which `setAsideAutosave` reads as a list it cannot read (the review's B1).
    const rest = list.filter((_, i) => i !== at);
    const next = rest.length ? JSON.stringify(rest) : '';
    store.set(FORGE_AUTOSAVE_ASIDE_KEY, next);
    return store.get(FORGE_AUTOSAVE_ASIDE_KEY) === next ? 'dropped' : 'refused';
  } catch {
    return 'refused';
  }
}

export interface SaveResult { saves: NamedSave[]; error: string | null }

/**
 * Saves `record` under `name` (the record's name becomes `name`). The same name replaces that save; a new one past
 * `SAVE_LIMIT` is refused.
 */
export function saveNamed(saves: readonly NamedSave[], name: string, record: LayoutRecord, now = Date.now(), id = newId()): SaveResult {
  return saveNamedRules(saves, name, record, undefined, now, id);
}

/** FCW-32: `saveNamed` with the layout's rules beside the record (`NamedSave.rules`); its mode checked with their modes. */
export function saveNamedRules(saves: readonly NamedSave[], name: string, record: LayoutRecord, rules: ForgeRulesDraft | undefined,
  now = Date.now(), id = newId()): SaveResult {
  const next: LayoutRecord = { ...record, name };
  const why = checkSaved(next, rules);
  if (why) return { saves: [...saves], error: why };
  const at = saves.findIndex((s) => s.name === name);
  if (at < 0 && saves.length >= SAVE_LIMIT) return { saves: [...saves], error: `this browser keeps ${SAVE_LIMIT} layouts; delete one first` };
  const row: NamedSave = { id: at < 0 ? id : saves[at]!.id, name, savedAt: now, record: next, ...(rules ? { rules: JSON.parse(JSON.stringify(rules)) as ForgeRulesDraft } : {}) };
  const copy = [...saves];
  if (at < 0) copy.push(row);
  else copy[at] = row;
  return { saves: copy, error: null };
}

/** Renames one save. The new name must be free and a record name. */
export function renameNamed(saves: readonly NamedSave[], id: string, name: string): SaveResult {
  const at = saves.findIndex((s) => s.id === id);
  if (at < 0) return { saves: [...saves], error: 'no save with that id' };
  if (saves.some((s) => s.id !== id && s.name === name)) return { saves: [...saves], error: 'a save already has that name' };
  const next: LayoutRecord = { ...saves[at]!.record, name };
  const why = checkSaved(next, saves[at]!.rules);
  if (why) return { saves: [...saves], error: why };
  const copy = saves.map((s) => (s.id === id ? { ...s, name, record: next } : s));
  return { saves: copy, error: null };
}

export function deleteNamed(saves: readonly NamedSave[], id: string): NamedSave[] {
  return saves.filter((s) => s.id !== id);
}
