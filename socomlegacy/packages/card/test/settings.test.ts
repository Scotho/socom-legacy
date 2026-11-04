import { describe, expect, it } from 'vitest';
import { Settings, StoreError, type SettingsStorage } from '../src/index';

/** A `Storage`-shaped map, as `localStorage` is to the page. */
function memory(): SettingsStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** A storage whose every call throws, as a private window's or a blocked site's does. */
function throwing(name = 'SecurityError'): SettingsStorage {
  const fail = (): never => { throw new DOMException('refused', name); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe('Settings: the page\'s own keys, guarded', () => {
  it('reads and writes through the storage it was given, under the key as named', () => {
    const store = memory();
    const settings = new Settings(() => store, () => { throw new Error('nothing should fail'); });
    expect(settings.get('s2u.viewer.volume')).toBeNull();
    expect(settings.set('s2u.viewer.volume', '0.4')).toEqual({ ok: true });
    expect(store.data.get('s2u.viewer.volume')).toBe('0.4');
    expect(settings.get('s2u.viewer.volume')).toBe('0.4');
    expect(settings.remove('s2u.viewer.volume')).toEqual({ ok: true });
    expect(store.data.has('s2u.viewer.volume')).toBe(false);
  });

  it('a storage that throws reads as nothing there, and a write that throws is reported and returned, not silent', () => {
    const heard: StoreError[] = [];
    const settings = new Settings(() => throwing(), (e) => heard.push(e));
    expect(settings.get('k')).toBeNull();
    const result = settings.set('k', 'v');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(StoreError);
    expect(result.error).toMatchObject({ kind: 'unavailable', operation: 'write', key: 'k' });
    expect(heard).toEqual([result.error]);
    expect(settings.remove('k').ok).toBe(false);
    expect(heard.map((e) => e.operation)).toEqual(['write', 'delete']);
  });

  it('a full storage is a quota failure', () => {
    const heard: StoreError[] = [];
    const settings = new Settings(() => throwing('QuotaExceededError'), (e) => heard.push(e));
    expect(settings.set('k', 'v')).toMatchObject({ ok: false, error: { kind: 'quota' } });
    expect(heard).toHaveLength(1);
  });

  it('no storage at all (none in this realm, or reaching it throws) reads as nothing and reports writes', () => {
    const heard: StoreError[] = [];
    const none = new Settings(() => undefined, (e) => heard.push(e));
    expect(none.get('k')).toBeNull();
    expect(none.set('k', 'v')).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    const refused = new Settings(() => { throw new DOMException('no', 'SecurityError'); }, (e) => heard.push(e));
    expect(refused.get('k')).toBeNull();
    expect(refused.set('k', 'v')).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    expect(heard).toHaveLength(2);
  });

  it('asks for the storage at each call, so a storage that comes or goes later is seen', () => {
    let current: SettingsStorage | undefined;
    const settings = new Settings(() => current, () => undefined);
    expect(settings.get('k')).toBeNull();
    current = memory();
    expect(settings.set('k', 'v').ok).toBe(true);
    expect(settings.get('k')).toBe('v');
  });
});
