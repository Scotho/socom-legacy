// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CARD_SLOT_KEYS, CardSlots, IdbStore, Settings, StoreError, type SettingsStorage } from '@s2u/card';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROLS_TAB_KEY } from '../src/controlsList';
import { PLAY_KEY, readPlayChoice, writePlayChoice } from '../src/features';
import { TIP_DISMISSED_KEY, TIP_SEEN_KEY } from '../src/mobileTip';
import { ONLINE_KEY, readOnline, writeOnline } from '../src/online';
import {
  DISC_COPY_SLOT, DISC_EXTRACT_SLOT, DISC_HANDLE_SLOT, LAST_MAP_KEY, openPageRecords, openParkedIdbStore, PAGE_RECORD_SLOTS, PAGE_RECORDS_DB, PAGE_SETTING_KEYS, pageCard, pageReport, pageSettings, readLastMap, reportOnce,
  tabSettings, tipStoreOf, writeLastMap,
} from '../src/pageStore';
import { readRules, RULES_KEY } from '../src/rules';
import { PAD_SELECTION_KEY } from '../src/setupPad';
import { OVERLAY_BUTTON_KEY } from '../src/modern/overlay/binding';

/**
 * The page's storage through `@s2u/card` (PLAT-24; research 99 §2-§4). The page's own keys migrate **in place**: each
 * is read through the new settings path under the name it always had, so what a visitor stored before is what the
 * page reads now, the old key is never moved or removed, and nothing is imported twice (W6.R5, the owner 2026-10-01).
 */

const SRC = resolve(import.meta.dirname, '../src');

function memory(initial: Record<string, string> = {}): SettingsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

describe('the page\'s keys: the inventory', () => {
  it('names every page key the modules declare', () => {
    for (const key of [PLAY_KEY, ONLINE_KEY, RULES_KEY, CONTROLS_TAB_KEY, TIP_DISMISSED_KEY, TIP_SEEN_KEY, LAST_MAP_KEY]) {
      expect(PAGE_SETTING_KEYS, key).toContain(key);
    }
    for (const key of ['s2u.viewer.panelOpen', 's2u.viewer.look', 's2u.viewer.volume', 's2u.viewer.muted', 's2u.viewer.mouseLook']) {
      expect(PAGE_SETTING_KEYS, key).toContain(key);
    }
    // MU2-16's review F8: the overlay's opening button, beside the pad selection (`modern/overlay/binding.ts`).
    for (const key of [PAD_SELECTION_KEY, OVERLAY_BUTTON_KEY]) expect(PAGE_SETTING_KEYS, key).toContain(key);
  });

  it('holds every `s2u.viewer.*` key the viewer\'s sources name, so none is added outside it', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) ? [p] : [];
    });
    const named = new Set<string>();
    for (const f of files(SRC)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(s2u\.viewer\.[A-Za-z]+)'/g)) named.add(m[1]!);
    }
    expect(named.size).toBeGreaterThanOrEqual(12);
    expect([...named].filter((k) => !PAGE_SETTING_KEYS.includes(k))).toEqual([]);
  });

  it('reaches the browser\'s storages only through pageStore.ts, the two keys OPT-04 and OPT-20 own aside', () => {
    const offenders: string[] = [];
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(n) ? [p] : [];
    });
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      if (rel === 'pageStore.ts') continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/`[^`]*`/g, '');
        // `navigator.storage` too (DA-8: the origin private file system, `pageOriginStorage`).
        if (!/\b(localStorage|sessionStorage|indexedDB)\b|\bnavigator\??\.storage\b/.test(code)) return;
        // Left in place by the block: the MP name (OPT-04), the ARMORY profile (OPT-20), the tab's session token.
        if (rel === 'main.ts' && /s2u\.mp\.name|storeOf\(\(\) => localStorage\)/.test(code)) return;
        if (rel === 'net/session.ts') return;
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('the page\'s keys migrate in place', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('present: each old key reads through the settings path as stored, and stays exactly where it was', () => {
    const stored = Object.fromEntries(PAGE_SETTING_KEYS.map((k, i) => [k, `v${i}`]));
    for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(stored)) {
      if (k === TIP_SEEN_KEY) continue;                         // the tab's key: sessionStorage
      expect(pageSettings.get(k), k).toBe(v);
    }
    for (const [k, v] of Object.entries(stored)) expect(localStorage.getItem(k), k).toBe(v);
    expect(localStorage.length).toBe(PAGE_SETTING_KEYS.length);  // nothing added beside them
  });

  it('the readers the page starts with read the old keys', () => {
    localStorage.setItem(PLAY_KEY, '1');
    localStorage.setItem(ONLINE_KEY, 'local');
    localStorage.setItem(RULES_KEY, 'respawn');
    localStorage.setItem(LAST_MAP_KEY, 'mp7');
    expect(readPlayChoice()).toBe('1');
    expect(readOnline()).toBe('local');
    expect(readRules()).toBe('respawn');
    expect(readLastMap()).toBe('mp7');
  });

  it('absent: nothing there reads as nothing, and reading writes nothing', () => {
    expect(readPlayChoice()).toBeNull();
    expect(readOnline()).toBeNull();
    expect(readRules()).toBeNull();
    expect(readLastMap()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('malformed: an old value is handed on as it is, for the reader that always judged it (the same as before)', () => {
    localStorage.setItem(PLAY_KEY, 'maybe');
    localStorage.setItem(LAST_MAP_KEY, '');
    expect(readPlayChoice()).toBe('maybe');                    // `playOn` is `=== '1'`: off, as before
    expect(readLastMap()).toBe('');                            // `wantedArchive` skips an empty one, as before
    expect(localStorage.getItem(PLAY_KEY)).toBe('maybe');
  });

  it('a new write lands under the old key, and a later load reads it: nothing re-imported over it', () => {
    localStorage.setItem(ONLINE_KEY, 'shared');
    expect(writeOnline('off')).toEqual({ ok: true });
    expect(localStorage.getItem(ONLINE_KEY)).toBe('off');
    const nextLoad = new Settings(() => localStorage, () => undefined);
    expect(nextLoad.get(ONLINE_KEY)).toBe('off');
    expect(writeLastMap('MP2')).toEqual({ ok: true });
    expect(localStorage.getItem(LAST_MAP_KEY)).toBe('MP2');
  });

  it('storage throwing: reads as nothing, and a write is returned failed and reported once, not dropped', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('refused', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('refused', 'SecurityError'); });
    expect(readPlayChoice()).toBeNull();
    expect(readOnline()).toBeNull();
    const r = writePlayChoice(true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'unavailable', operation: 'write', key: PLAY_KEY });
  });
});

describe('the reporter and the injected stores', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('reportOnce warns at the first failure of a page and counts the rest', () => {
    const warn = vi.fn();
    const report = reportOnce(warn);
    report(new StoreError('quota', 'write', 'a'));
    report(new StoreError('quota', 'write', 'b'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('a');
    expect(report.failures()).toBe(2);
  });

  it('the readers and writers take another settings path (a test\'s memory) in place of the page\'s', () => {
    const held = memory({ [PLAY_KEY]: '1' });
    const mine = new Settings(() => held, () => undefined);
    expect(readPlayChoice(mine)).toBe('1');
    expect(writeOnline('local', mine)).toEqual({ ok: true });
    expect(readOnline(mine)).toBe('local');
    expect(localStorage.getItem(ONLINE_KEY)).toBeNull();
  });

  it('the tip\'s stores are the settings paths, guarded both ways', () => {
    const throwing = new Settings(() => { throw new DOMException('no', 'SecurityError'); }, () => undefined);
    const tip = tipStoreOf(throwing);
    expect(tip.get(TIP_DISMISSED_KEY)).toBeNull();
    expect(() => tip.set(TIP_DISMISSED_KEY, '1')).not.toThrow();
    expect(tabSettings).toBeInstanceOf(Settings);
  });

  it('the card is two virtual slots on the page\'s localStorage (R7; PLAT-25): read without a write, saved under its key', () => {
    expect(pageCard).toBeInstanceOf(CardSlots);
    expect(pageCard.slot(1).info()).toEqual({ state: 'formatted', rev: 0, freeClusters: 8000, usedClusters: 0 });
    expect(pageCard.slot(2).info()).toMatchObject({ state: 'formatted', rev: 0 });
    expect(localStorage.length).toBe(0);
    expect(pageCard.slot(2).writeFile('BASCUS-97275SOCOMII', 4_784, { personas: [] }, 0)).toMatchObject({ ok: true, rev: 1 });
    expect(JSON.parse(localStorage.getItem(CARD_SLOT_KEYS[1])!)).toMatchObject({ v: 1, rev: 1, present: true, formatted: true });
    expect(localStorage.getItem(CARD_SLOT_KEYS[0])).toBeNull();
  });

  it('a card save the browser refuses goes to the page\'s report', () => {
    const before = pageReport.failures();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(pageCard.slot(1).writeFile('f', 1, null, 0)).toMatchObject({ ok: false, failure: { kind: 'write-failed', error: { kind: 'quota' } } });
    expect(pageReport.failures()).toBe(before + 1);
  });

  it('the parked IndexedDB store (not the card\'s) is built from the browser\'s IndexedDB; with none (jsdom), it reads empty and refuses writes', async () => {
    const store = openParkedIdbStore();
    expect(store).toBeInstanceOf(IdbStore);
    expect(await store.get('slot/0/image')).toBeUndefined();
    await expect(store.put('slot/0/image', new Uint8Array(4))).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('the page\'s records (DA-7, DA-8): one IndexedDB object store of structured values, named slots only', () => {
  const fresh = (): IDBFactory => new FakeFactory() as unknown as IDBFactory;

  it('the slots are the remembered disc\'s, the stored copy\'s and the extraction\'s (DX-1)', () => {
    expect(PAGE_RECORD_SLOTS).toEqual([DISC_HANDLE_SLOT, DISC_COPY_SLOT, DISC_EXTRACT_SLOT]);
    expect(DISC_EXTRACT_SLOT).toBe('disc.extract');
    expect(PAGE_RECORDS_DB).not.toBe('s2u.card');               // not the parked card store's database
  });

  it('put, get and delete a structured value; an empty slot reads as undefined', async () => {
    const factory = fresh();
    const records = openPageRecords(() => factory);
    expect(await records.get(DISC_HANDLE_SLOT)).toBeUndefined();
    await records.put(DISC_HANDLE_SLOT, { v: 1, meta: { name: 'SOCOM2', kind: 'folder' } });
    expect(await openPageRecords(() => factory).get(DISC_HANDLE_SLOT)).toEqual({ v: 1, meta: { name: 'SOCOM2', kind: 'folder' } });
    expect(await records.get(DISC_COPY_SLOT)).toBeUndefined();
    await records.delete(DISC_HANDLE_SLOT);
    expect(await records.get(DISC_HANDLE_SLOT)).toBeUndefined();
  });

  it('a slot not in the inventory is refused', async () => {
    const records = openPageRecords(fresh);
    await expect(records.put('disc.other', 1)).rejects.toThrow(/slot/);
    await expect(records.get('disc.other')).rejects.toThrow(/slot/);
  });

  it('no IndexedDB (jsdom has none): a read is undefined and reported, a write refused as unavailable', async () => {
    const report = vi.fn();
    const records = openPageRecords(() => globalThis.indexedDB, report);
    expect(await records.get(DISC_HANDLE_SLOT)).toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toMatchObject({ kind: 'unavailable', operation: 'open' });
    await expect(records.put(DISC_HANDLE_SLOT, 1)).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(openPageRecords(() => { throw new DOMException('no', 'SecurityError'); }, () => undefined).delete(DISC_COPY_SLOT))
      .rejects.toMatchObject({ kind: 'unavailable' });
  });
});
