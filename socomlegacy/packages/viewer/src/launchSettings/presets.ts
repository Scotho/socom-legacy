/**
 * The launch settings' presets (web sprint 37 PTT-9, W37.R6: "launch settings that save locally for reusability";
 * research 243 §9). LAUNCH_SETTINGS_ADAPTATION: a browser adaptation on a development build only, a per-viewer
 * convenience on the page's own key-value storage (MISSION R7, as `../pageStore` keeps the page's others); nothing of
 * the game's card.
 *
 * One record per sheet, under `presetKey(sheet)` (`s2u.launch.v1.testroom`, `s2u.launch.v1.playtest`): named presets,
 * the last used, and the recent launches, as JSON
 * `{ v: 1, presets: { <name>: { <key>: <value> } }, last: { ... } | null, recent: [ { <key>: <value> }, ... ] }`.
 * `recent` was added after the named presets: a record saved before it has none, and it still loads. The store is
 * handed in (the sheet passes `../pageStore` `pageSettings`, so the browser's storage is named only there); every
 * access is wrapped, and the record is kept in memory too, so with storage that throws, refuses or is absent the
 * presets live for the visit and a save says it was not kept. A record that does not read is no presets.
 */

/** How many recent launches the sheet keeps (newest first). */
const RECENT_LIMIT = 6;

/** The part of `@s2u/card` `Settings` the presets use (a write may report failure by its result or by throwing). */
export interface PresetStore {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
}

export type LaunchSheetKind = 'testroom' | 'playtest';

/** The storage key of a sheet's presets. */
export function presetKey(sheet: LaunchSheetKind): string {
  return `s2u.launch.v1.${sheet}`;
}

type Fields = Record<string, string>;
interface PresetRecord { v: 1; presets: Record<string, Fields>; last: Fields | null; recent: Fields[] }

/** The same fields in one order, so a repeat launch replaces its chip instead of adding another. */
function canonical(values: Fields): string {
  return JSON.stringify(Object.keys(values).sort().map((key) => [key, values[key]]));
}

function recentOf(raw: unknown): Fields[] {
  if (!Array.isArray(raw)) return [];
  const out: Fields[] = [];
  for (const item of raw) { const v = fields(item); if (v) out.push(v); }
  return out.slice(0, RECENT_LIMIT);
}

/** Only string values; anything else in a stored record is dropped. */
function fields(raw: unknown): Fields | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Fields = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}

export class LaunchPresets {
  private record: PresetRecord = { v: 1, presets: {}, last: null, recent: [] };

  constructor(private readonly store: PresetStore | null, private readonly sheet: LaunchSheetKind) {
    try {
      const text = store?.get(presetKey(sheet)) ?? null;
      if (text === null) return;
      const raw = JSON.parse(text) as { presets?: unknown; last?: unknown; recent?: unknown };
      const presets: Record<string, Fields> = {};
      if (typeof raw.presets === 'object' && raw.presets !== null) {
        for (const [name, f] of Object.entries(raw.presets as Record<string, unknown>)) { const v = fields(f); if (v) presets[name] = v; }
      }
      this.record = { v: 1, presets, last: fields(raw.last), recent: recentOf(raw.recent) };
    } catch {
      this.record = { v: 1, presets: {}, last: null, recent: [] };
    }
  }

  /** Writes the record; true when the store took it. */
  private persist(): boolean {
    if (!this.store) return false;
    try {
      const r = this.store.set(presetKey(this.sheet), JSON.stringify(this.record));
      return !(typeof r === 'object' && r !== null && (r as { ok?: unknown }).ok === false);
    } catch {
      return false;
    }
  }

  /** The presets' names, in the order they were saved. */
  names(): string[] {
    return Object.keys(this.record.presets);
  }

  load(name: string): Fields | null {
    const f = this.record.presets[name];
    return f ? { ...f } : null;
  }

  /** Saves (or replaces) `name`; true when it was kept in the storage, false when for this visit only. */
  save(name: string, values: Readonly<Fields>): boolean {
    this.record.presets[name] = { ...values };
    return this.persist();
  }

  /** Deletes `name`; true when the storage took the change. */
  remove(name: string): boolean {
    delete this.record.presets[name];
    return this.persist();
  }

  lastUsed(): Fields | null {
    return this.record.last ? { ...this.record.last } : null;
  }

  /** The fields of the last launch (written at Launch). */
  setLastUsed(values: Readonly<Fields>): boolean {
    this.record.last = { ...values };
    return this.persist();
  }

  /** The recent launches, newest first. */
  recent(): Fields[] {
    return this.record.recent.map((v) => ({ ...v }));
  }

  /** Remembers a launch (newest first, a repeat moved to the front, capped). True when the storage took it. */
  remember(values: Readonly<Fields>): boolean {
    const key = canonical(values);
    const rest = this.record.recent.filter((v) => canonical(v) !== key);
    this.record.recent = [{ ...values }, ...rest].slice(0, RECENT_LIMIT);
    return this.persist();
  }
}
