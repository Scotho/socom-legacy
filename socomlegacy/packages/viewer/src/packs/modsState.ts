/**
 * B206 ML-1 (ML.R7, ML.R8): the MODS state, a browser adaptation (OT.R110; ML.R2: product track -- what this browser
 * draws, never the game's data or the wire). One record in the common database `s2u-packs` (`./storage` `PACKS_DB`),
 * its own scope `state`: the chosen texture pack (Original, or ONE installed texture pack: a GX per-map pack's id or the
 * HD pack's, ML.R8 -- never two packs on one texture, by construction) and the model slots' switches. The data mods'
 * order and switches (`ModChoices`) are read and written through this API too, kept where the mods' bytes already keep
 * them -- the `mods` scope of the same database, one transaction with their packages (the implementer's choice, logged
 * in the plan's Log: one record per fact, no copy to keep in step, the test room's panel unchanged until ML-7).
 *
 * The lazy contract (MODS_SCOPE_ADAPTATION's `lazyModLibrary`, widened to every kind): two hints in `localStorage`,
 * set with the record inside its write's transaction (LATER 773) and cleared only by the write that turns their fact off (the merge review's F1) -- `PACKS_ENABLED_KEY`, "a texture pack is chosen" (the one `collectOnHint` reads, so
 * a model slot never wakes the texture registry: ML.R9, the ML-10 review's F2), and `MODELS_ENABLED_KEY`, "a model slot
 * is on"; with neither of them nor the mods' own flag (`MODS_PRESENT_KEY`) a page's read opens no database. One change notice: a
 * `BroadcastChannel` of the origin (`MODS_CHANNEL`), so a change made on Home is heard by every open page at once; a
 * page that missed it reads the record at its next map load.
 */
import { EMPTY_MOD_CHOICES, type ModChoices } from '../mods/choices';
import type { PackDatabase, PackScope } from './storage';

export type { ModChoices } from '../mods/choices';
export interface ModelSwitches { primary: boolean; second: boolean }
/** What `s2u-packs`' `state` scope keeps (the mods' choices are the `mods` scope's). */
export interface StoredModsState { version: 1; texture: string | null; models: ModelSwitches }
/** The whole MODS state as a page reads it. */
export interface ModsState { texture: string | null; models: ModelSwitches; mods: ModChoices }

/** The texture hint (`../pageStore` `PAGE_SETTING_KEYS`): '1' while a texture pack is chosen (ML-10 F2: texture packs only). */
export const PACKS_ENABLED_KEY = 's2u.packs.enabled.v1';
/** The models hint (`../pageStore` `PAGE_SETTING_KEYS`; ML-10 F2): '1' while a model slot is on. */
export const MODELS_ENABLED_KEY = 's2u.packs.models.v1';
/** The origin's change notice (ML.R7). */
export const MODS_CHANNEL = 's2u.packs.v1';
export const EMPTY_STORED_STATE: StoredModsState = Object.freeze({ version: 1, texture: null, models: Object.freeze({ primary: false, second: false }) }) as StoredModsState;
/** The ids a texture choice may name: an installed GX pack (`texture:<map>:<id>`) or the HD pack (`hd:<id>`). */
const TEXTURE_ID = /^(?:texture:[A-Za-z0-9]{1,16}:[a-f0-9]{64}|hd:[a-f0-9]{64})$/;
export const isTextureChoice = (id: unknown): id is string => typeof id === 'string' && TEXTURE_ID.test(id);

/** A stored value as the state, or the empty state for anything else. Never throws. */
export function parseStoredModsState(raw: unknown): StoredModsState {
  if (!raw || typeof raw !== 'object') return EMPTY_STORED_STATE;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return EMPTY_STORED_STATE;
  const m = (o.models && typeof o.models === 'object' ? o.models : {}) as Record<string, unknown>;
  return { version: 1, texture: isTextureChoice(o.texture) ? o.texture : null, models: { primary: m.primary === true, second: m.second === true } };
}
/** The texture hint's value: a texture pack is chosen (ML-10 F2: the model slots are not counted). */
export const textureChosen = (s: StoredModsState): boolean => s.texture !== null;
/** The models hint's value: a model slot is on. */
export const modelsOn = (s: StoredModsState): boolean => s.models.primary || s.models.second;

/** The hint's store: `localStorage`'s three calls as `../pageStore` `pageSettings` gives them (any may throw). */
export interface PackFlags { get(key: string): string | null; set(key: string, value: string): unknown; remove(key: string): unknown }
/** The notice's channel (a `BroadcastChannel`); a test hands a fake. */
export interface ModsChannel { postMessage(message: unknown): void; close(): void; onmessage: ((event: { data: unknown }) => void) | null }
export type ChannelFactory = (name: string) => ModsChannel | null;
export const browserChannel: ChannelFactory = (name) => {
  try {
    const C = (globalThis as { BroadcastChannel?: new (name: string) => ModsChannel & { unref?(): void } }).BroadcastChannel;
    if (!C) return null;
    const channel = new C(name);
    channel.unref?.();   // Node's (the tests'): never hold the process open for a notice
    return channel;
  } catch { return null; }
};

export interface ModsStateStore {
  /** The stored part. With no hint, answers the empty state and opens nothing. */
  read(): Promise<StoredModsState>;
  /** One edit, written whole; the hint follows it, and the notice goes out. */
  write(edit: (state: StoredModsState) => StoredModsState): Promise<StoredModsState>;
  /** Tells every other page of the origin that the packs changed (an install, a removal, a choice). */
  notify(): void;
  /** Called when another page says the packs changed. */
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function modsStateStore(database: PackDatabase, flags: PackFlags, channel: ChannelFactory = browserChannel): ModsStateStore {
  const hinted = (key: string): boolean => { try { return flags.get(key) === '1'; } catch { return false; } };
  const hint = (key: string, on: boolean): void => {
    if (hinted(key) === on) return;
    try { if (on) flags.set(key, '1'); else flags.remove(key); } catch { /* the record stays the truth */ }
  };
  // The ML-10 merge review's F1: a hint is cleared only by the write that turned its fact off, never by a read -- a read
  // finishes after an `await`, and another page may have chosen a pack since (a cleared texture hint then hid the choice
  // from every page). A read or a write only SETS a hint its record calls for.
  const raise = (s: StoredModsState): void => { if (textureChosen(s)) hint(PACKS_ENABLED_KEY, true); if (modelsOn(s)) hint(MODELS_ENABLED_KEY, true); };
  const lower = (before: StoredModsState, after: StoredModsState): void => {
    if (textureChosen(before) && !textureChosen(after)) hint(PACKS_ENABLED_KEY, false);
    if (modelsOn(before) && !modelsOn(after)) hint(MODELS_ENABLED_KEY, false);
  };
  // The one migration (ML-10 F2): ML-1 set the texture hint for a model slot alone and never the models hint. That shape
  // -- the models hint missing while the record has a slot on and no texture -- is put right once; the models hint it
  // sets marks it done, so no later read clears anything.
  const migrate = (s: StoredModsState): void => {
    if (modelsOn(s) && !textureChosen(s) && !hinted(MODELS_ENABLED_KEY) && hinted(PACKS_ENABLED_KEY)) hint(PACKS_ENABLED_KEY, false);
  };
  const listeners = new Set<() => void>();
  let open: ModsChannel | null | undefined;
  const ch = (): ModsChannel | null => {
    if (open !== undefined) return open;
    open = channel(MODS_CHANNEL);
    if (open) open.onmessage = () => { for (const l of [...listeners]) { try { l(); } catch { /* a listener's fault is its own */ } } };
    return open;
  };
  const empty = async (): Promise<StoredModsState> => EMPTY_STORED_STATE;
  return {
    async read() {
      if (!hinted(PACKS_ENABLED_KEY) && !hinted(MODELS_ENABLED_KEY)) return EMPTY_STORED_STATE;
      const scope = await database.read<StoredModsState>('state', empty);
      const state = parseStoredModsState(scope.data);
      migrate(state);
      raise(state);
      return state;
    },
    async write(edit) {
      // LATER 773: the hints follow the record inside its own transaction. The edit runs in the `state` scope's readwrite
      // transaction, and two pages' transactions there run one after the other, so hints moved here move in commit order
      // and the last write's stand. After the `await` another page's write may already have committed, and a hint moved
      // there (as before this row) could undo the later page's. A transaction that fails after its edit puts back what its
      // committed record (`before`) calls for -- sets only, never a clear, so a later page's hint is never removed.
      let before: StoredModsState = EMPTY_STORED_STATE;
      let edited = false;
      let scope: PackScope<StoredModsState>;
      try {
        scope = await database.update<StoredModsState>('state', empty, (data) => {
          const after = parseStoredModsState(edit(before = parseStoredModsState(data)));
          lower(before, after);
          raise(after);
          edited = true;
          return after;
        });
      } catch (e) {
        if (edited) raise(before);
        throw e;
      }
      const next = parseStoredModsState(scope.data);
      this.notify();
      return next;
    },
    notify() { try { ch()?.postMessage({ type: 'packs-changed' }); } catch { /* a closed channel: the next map load reads the record */ } },
    subscribe(listener) { listeners.add(listener); ch(); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); if (open) { try { open.close(); } catch { /* closed */ } } open = null; },
  };
}

export const emptyModsState = (): ModsState => ({ texture: null, models: { primary: false, second: false }, mods: EMPTY_MOD_CHOICES });
