/**
 * The page's own settings, guarded (PLAT-24; research 99 §2): the per-viewer conveniences that stay on the browser's
 * key-value storage (MISSION R7 / the PLAT-24 block: "localStorage stays only for per-viewer conveniences such as a
 * remembered tab") -- the Mode, Online, the rules, the look, the panel, the volume, the mouse look, the last map, the
 * controls' tab, the phone's tip. None of them is anything the game keeps on its card; that line is research 99 §2.
 *
 * Synchronous, as the storage it wraps and the page's start-up reads are. A read that throws (a private window, blocked
 * site data, no storage in this realm) reads as nothing there. A write that throws is **reported, not silent**: it
 * goes to the `report` the composition root gave (required, so no instance can be built that drops one) and is returned
 * as a typed `WriteResult`.
 *
 * DOM-free (W6.R2): the storage arrives as a getter the viewer passes (`() => localStorage`), asked at each call, so a
 * storage that throws on access, or comes and goes (a test's), is met where it is.
 */
import { storeError, StoreError, type FailureReport, type ReadResult } from './store';

/** The part of a browser `Storage` the settings use. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A settings write: done, or the failure (also handed to the report). */
export type WriteResult = { readonly ok: true } | { readonly ok: false; readonly error: StoreError };

const OK: WriteResult = Object.freeze({ ok: true as const });

/** Guarded string settings over a browser `Storage`, under their keys as named (no prefix, no rewrite). */
export class Settings {
  constructor(
    private readonly storage: () => SettingsStorage | null | undefined,
    private readonly report: FailureReport,
  ) {}

  private reach(): SettingsStorage {
    const s = this.storage();
    if (!s) throw new StoreError('unavailable', 'open', undefined, new TypeError('no storage in this browser'));
    return s;
  }

  /** The value under `key`, or the failure that kept it from being read. Reports nothing (the caller has it). */
  read(key: string): ReadResult<string | null> {
    try {
      return { ok: true, value: this.reach().getItem(key) };
    } catch (e) {
      return { ok: false, error: e instanceof StoreError ? new StoreError(e.kind, 'get', key, e.cause) : storeError('get', key, e) };
    }
  }

  /** The value under `key`, or null -- for nothing there and a storage that cannot be read alike. */
  get(key: string): string | null {
    const r = this.read(key);
    return r.ok ? r.value : null;
  }

  /** Writes `value` under `key`; a failure is reported and returned. */
  set(key: string, value: string): WriteResult {
    return this.attempt('write', key, (s) => s.setItem(key, value));
  }

  /** Removes `key`; a failure is reported and returned. */
  remove(key: string): WriteResult {
    return this.attempt('delete', key, (s) => s.removeItem(key));
  }

  private attempt(operation: 'write' | 'delete', key: string, act: (s: SettingsStorage) => void): WriteResult {
    try {
      act(this.reach());
      return OK;
    } catch (e) {
      const error = e instanceof StoreError ? new StoreError(e.kind, operation, key, e.cause) : storeError(operation, key, e);
      this.report(error);
      return { ok: false, error };
    }
  }
}
