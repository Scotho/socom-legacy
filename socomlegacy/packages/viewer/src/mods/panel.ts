/**
 * The test room's mod panel (`TEST_ROOM_MODS_ADAPTATION`). The bytes, the order and the switches are kept in this
 * browser (`store.ts`); since B206 ML-7 they are added, switched, ordered and removed in Home > Experiments > Mods, and
 * this panel is one line ("Mods: N on -- Home > Experiments > Mods") and Reload map, which reads them again and reloads
 * the map. The map worker is told the same table `installModOverrides` keeps here.
 */
import { pageIndexedDb, pageSettings } from '../pageStore';
import { EMPTY_MOD_CHOICES, formatModChoices, type ModChoices } from './choices';
import { loadMods, type ModSession, type ModSource } from './load';
import { canonicalDiscPath, type ModManifest } from './manifest';
import { parseModManifestBytes, ModManifestError } from './manifest';
import { installModOverrides, type ModOverrideBytes } from './override';
import { installMemberOverrides, type MemberOverrideBytes } from '@s2u/archive';
import { ModPackageError, modPackageFromEntries, modPackageFromZip, type ModPackage } from './readPackage';
import { idbModLibrary, lazyModLibrary, ModStoreError, type ModFlags, type ModLibrary, type StoredMod } from './store';

export interface ModWorkerPort {
  postMessage(message: { kind: 'mods'; entries: ModOverrideBytes[]; members: MemberOverrideBytes[] } | { kind: 'mod-disc' }): void;
  addEventListener?(type: 'message', listener: (event: MessageEvent<{ kind?: string; paths?: string[] }>) => void): void;
}

export interface ModPanelOptions {
  /** Reloads the map on screen. The panel never calls it except from its button. */
  reloadMap?: () => void;
  /** Defaults to this browser's mod library. A test passes its own. */
  library?: ModLibrary;
}

export interface ModPanel {
  /** The same path the zip picker takes, for a test that already holds the bytes. */
  addZip(name: string, bytes: Uint8Array): Promise<void>;
  addFolder(name: string, entries: readonly { path: string; bytes: Uint8Array }[]): Promise<void>;
  /** Browser adaptation: activate an already validated/stored local import through the panel's real tables. */
  activateStored(pack: ModPackage, manifest: ModManifest, alive: () => boolean): Promise<void>;
  deactivateStored(id: string, alive: () => boolean): Promise<void>;
  isApplied(id: string): boolean;
  /**
   * Resolves once the stored mods have been read and the first paint is done, or after `MODS_READY_WAIT_ADAPTATION`
   * with mods off when the store never answers (`MODS_SCOPE_ADAPTATION`): a store cannot hold the test room's boot.
   */
  ready: Promise<void>;
  /** Whether the panel wants the disc's listing: only while this browser holds a mod. */
  wantsDisc(): boolean;
}

/** How long the boot waits for the saved mods before it goes on with mods off (#342's review, the medium). A browser adaptation. */
export const MODS_READY_WAIT_ADAPTATION = 2000;
/** B206 ML-7 (ML.R14): the panel's one line, "Mods: N on -- Home > Experiments > Mods". */
export const MODS_LINE_PREFIX = 'Mods: ';
export const MODS_LINE_WHERE = ' -- Home > Experiments > Mods.';

/** The mods flag in the page's own settings (`../pageStore` `pageSettings`, which already answers a refusing storage). */
const pageFlags: ModFlags = {
  getItem: (key) => pageSettings.get(key),
  setItem: (key, value) => { pageSettings.set(key, value); },
  removeItem: (key) => { pageSettings.remove(key); },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function storedOf(id: string, label: string, files: ReadonlyMap<string, Uint8Array>): StoredMod {
  return { id, label, files: [...files].map(([name, bytes]) => ({ name, bytes })) };
}

function filesOf(pack: StoredMod): Map<string, Uint8Array> {
  return new Map(pack.files.map((file) => [file.name, file.bytes]));
}

/** Mounts the panel into `#panel-body`. Absent host: nothing. A second call does nothing. */
export function mountModPanel(doc: Document, worker: ModWorkerPort | null, options: ModPanelOptions = {}): ModPanel | null {
  const host = doc.getElementById('panel-body');
  if (!host || doc.getElementById('mods')) return null;
  const library = options.library ?? lazyModLibrary(pageFlags, () => idbModLibrary(pageIndexedDb));
  // B206 ML-7 (plan 2026-11-06-mods-loader, ML.R14; OT.R110): the panel is one line and Reload map. The mods are added,
  // switched, ordered and removed in Home > Experiments > Mods (the one loader); this page applies them at a map's load,
  // and Reload map reads the kept mods and choices again first. The tables, the worker and the store are unchanged.
  const section = el('section');
  section.id = 'mods';
  section.className = 'section';
  section.setAttribute('aria-label', 'Mods');
  const line = el('p');
  line.id = 'mods-line';
  line.className = 's2u-field__note';
  line.setAttribute('role', 'status');
  const reloadButton = el('button', 'Reload map');
  reloadButton.type = 'button';
  reloadButton.id = 'mod-reload-map';
  reloadButton.className = 's2u-button';
  section.append(line, reloadButton);
  host.append(section);

  let choices: ModChoices = EMPTY_MOD_CHOICES;
  let held: ModSource[] = [];
  let discPaths = new Set<string>();
  let generation = 0;
  let dirty = false;
  /** The visitor changed something this visit; a Reload does not forget it (the re-review's N2). */
  let touched = false;
  /** A late answer kept mods off for this visit; the saved switch is written back as it was (the re-review's N1). */
  let visitOff: { enabled: boolean } | null = null;
  let storeMessage = '';
  let appliedIds = new Set<string>();

  const publish = (session: ModSession): void => {
    appliedIds = new Set(session.choices.enabled ? session.rows.filter((row) => row.kind === 'loaded' && row.enabled).map((row) => row.kind === 'loaded' ? row.id : '') : []);
    const entries: ModOverrideBytes[] = [];
    const members: MemberOverrideBytes[] = [];
    for (const entry of session.overrides) {
      if (entry.kind === 'file') entries.push({ path: entry.path, bytes: entry.bytes });
      else members.push({ archive: entry.archive, member: entry.member, bytes: entry.bytes });
    }
    installModOverrides(entries);
    installMemberOverrides(members);
    worker?.postMessage({ kind: 'mods', entries, members });
    if (held.length > 0) worker?.postMessage({ kind: 'mod-disc' });
  };

  /** The one line: the mods on and where they are managed; a conflict and the store's words after it. */
  const paint = (session: ModSession): void => {
    const on = session.choices.enabled ? session.rows.filter((row) => row.kind === 'loaded' && row.enabled).length : 0;
    const conflicts = session.conflicts.length ? ` ${session.conflicts.length} conflict${session.conflicts.length === 1 ? '' : 's'}: ${session.conflicts
      .map((conflict) => `${conflict.path}, ${conflict.winnerId} wins over ${conflict.loserIds.join(', ')}`).join('; ')}.` : '';
    line.textContent = `${MODS_LINE_PREFIX}${on} on${MODS_LINE_WHERE}${conflicts}${storeMessage ? ` ${storeMessage}` : ''}`;
  };

  const render = async (): Promise<void> => {
    const gen = ++generation;
    const session = loadMods(held, choices, discPaths);
    if (dirty || formatModChoices(session.choices) !== formatModChoices(choices)) {
      const keep = visitOff ? { ...session.choices, enabled: visitOff.enabled } : session.choices;
      try { await library.writeChoices(keep); }
      catch (e) { storeMessage = e instanceof ModStoreError ? e.message : 'the mod choices could not be saved'; }
    }
    dirty = false;
    choices = session.choices;
    paint(session);
    publish(session);
    if (gen !== generation) return;
  };

  const remember = (source: ModSource): Promise<void> => {
    held.push(source);
    dirty = true;
    touched = true;
    return render();
  };

  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });

  const addPackage = async (label: string, files: ReadonlyMap<string, Uint8Array> | undefined, error?: string): Promise<void> => {
    if (error || !files) { await remember({ label, error: error ?? 'the package has no files' }); return; }
    let id = '';
    try {
      const manifestBytes = files.get('mod.json');
      if (!manifestBytes) throw new ModManifestError('mod.json is missing');
      id = parseModManifestBytes(manifestBytes).id;
    } catch (e) {
      await remember({ label, error: e instanceof Error ? e.message : String(e), files });
      return;
    }
    if (held.some((source) => source.id === id)) {
      await remember({ label, files });
      return;
    }
    try {
      await library.put(storedOf(id, label, files));
      const saved = await library.read();
      if (!saved.unavailable) choices = saved.choices;
    } catch (e) {
      const reason = e instanceof ModStoreError ? e.message : 'the mod could not be saved';
      storeMessage = reason;
      if (e instanceof ModStoreError && e.kind === 'quota') {
        await remember({ label, error: reason });
        return;
      }
    }
    // This picker/drop is the person's explicit package choice. Agent imports keep the store's disabled default.
    choices = { ...choices, disabled: choices.disabled.filter(disabled => disabled !== id) };
    await remember({ id, label, files });
  };

  const addZip = async (name: string, bytes: Uint8Array): Promise<void> => {
    await ready;
    try {
      const pack = await modPackageFromZip(name, bytes);
      await addPackage(name, pack.files);
    } catch (e) {
      await addPackage(name, undefined, e instanceof ModPackageError || e instanceof Error ? e.message : String(e));
    }
  };

  const addFolder = async (name: string, entries: readonly { path: string; bytes: Uint8Array }[]): Promise<void> => {
    await ready;
    try {
      const pack = modPackageFromEntries(name, entries);
      await addPackage(name, pack.files);
    } catch (e) {
      await addPackage(name, undefined, e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * B206 ML-7: Reload map reads the kept mods and choices again -- what Home > Experiments > Mods changed since this page
   * read them -- applies them to the tables and the worker, then reloads the map (a data mod applies at a map's load).
   */
  const reread = async (): Promise<void> => {
    await ready;
    try {
      const saved = await library.read();
      if (!saved.unavailable) {
        choices = saved.choices;
        held = saved.packages.map((pack) => ({ id: pack.id, label: pack.label, files: filesOf(pack) }));
        visitOff = null;
        storeMessage = '';
      }
    } catch (e) {
      storeMessage = e instanceof ModStoreError ? e.message : 'saved mods could not be read';
    }
    await render();
  };
  reloadButton.addEventListener('click', () => {
    void reread().then(() => { options.reloadMap?.(); });
  });
  worker?.addEventListener?.('message', (event) => {
    const data = event.data;
    if (data?.kind !== 'mod-disc' || !Array.isArray(data.paths)) return;
    const next = new Set(data.paths.flatMap((path) => {
      const canonical = canonicalDiscPath(path);
      return canonical ? [canonical] : [];
    }));
    if (next.size === discPaths.size && [...next].every((path) => discPaths.has(path))) return;
    discPaths = next;
    void render();
  });

  let booted = false;
  const wait = setTimeout(() => {
    if (booted) return;
    booted = true;
    storeMessage = 'Saved mods did not load in time, so mods are off for this visit.';
    void render().finally(resolveReady);
  }, MODS_READY_WAIT_ADAPTATION);
  void (async () => {
    let saved: Awaited<ReturnType<ModLibrary['read']>> | null = null;
    try {
      saved = await library.read();
    } catch (e) {
      storeMessage = e instanceof ModStoreError ? e.message : 'saved mods could not be read';
    }
    if (booted) {
      // Late (the review's F1): the boot went on with mods off, so they stay off for this visit -- the list shows them,
      // nothing the visitor added or switched meanwhile is replaced, and the saved switches stand for the next visit.
      if (saved) {
        const known = new Set(held.map((source) => source.id));
        held = [...held, ...saved.packages.filter((pack) => !known.has(pack.id)).map((pack) => ({ id: pack.id, label: pack.label, files: filesOf(pack) }))];
        if (!touched) {
          choices = { ...saved.choices, enabled: false };
          visitOff = { enabled: saved.choices.enabled };
        }
        storeMessage = 'Saved mods loaded late, so they stay off for this visit. Reload map to use them.';
      }
      await render();
      return;
    }
    if (saved) {
      choices = saved.choices;
      held = saved.packages.map((pack) => ({ id: pack.id, label: pack.label, files: filesOf(pack) }));
    }
    booted = true;
    clearTimeout(wait);
    await render();
    resolveReady();
  })();

  const commitLive = async (nextHeld: ModSource[], nextChoices: ModChoices, alive: () => boolean, expectedGeneration?: number): Promise<void> => {
    const gen = generation;
    if (!alive()) throw new ModPackageError('the test-room build session changed');
    const session = loadMods(nextHeld, nextChoices, discPaths);
    if (session.rows.some((row) => row.kind === 'invalid')) throw new ModPackageError('a stored mod could not be activated');
    await library.writeChoices(session.choices, { expectedGeneration });
    // The saved choices may have completed while Play started, access was revoked, or another panel edit won.
    // Never publish a stale async continuation into either the page's or the worker's override table.
    if (!alive() || gen !== generation) throw new ModPackageError('the test-room build session changed');
    generation++;
    held = nextHeld; choices = session.choices;
    dirty = false; visitOff = null; touched = true;
    paint(session); publish(session);
  };
  const activateStored = async (pack: ModPackage, manifest: ModManifest, alive: () => boolean): Promise<void> => {
    await ready;
    const actual = parseModManifestBytes(pack.files.get('mod.json')!);
    if (actual.id !== manifest.id) throw new ModPackageError('stored mod identity changed');
    const saved = await library.read();
    if (saved.unavailable || !saved.choices.enabled) throw new ModPackageError('Turn Enable mods on before applying this mod.');
    await commitLive([...held.filter((source) => source.id !== actual.id), { id: actual.id, label: pack.label, files: pack.files }],
      { ...saved.choices, order: saved.choices.order.includes(actual.id) ? saved.choices.order : [...saved.choices.order, actual.id],
        disabled: saved.choices.disabled.filter((id) => id !== actual.id) }, alive, saved.generation);
  };
  const deactivateStored = async (id: string, alive: () => boolean): Promise<void> => {
    await ready;
    await commitLive(held.filter((source) => source.id !== id), { ...choices, order: choices.order.filter((key) => key !== id), disabled: choices.disabled.filter((key) => key !== id) }, alive);
  };
  return { addZip, addFolder, activateStored, deactivateStored, isApplied: (id) => appliedIds.has(id), ready, wantsDisc: () => held.length > 0 };
}
