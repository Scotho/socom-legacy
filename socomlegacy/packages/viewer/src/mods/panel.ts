/**
 * The test room's mod panel (`TEST_ROOM_MODS_ADAPTATION`). The visitor picks a zip or a folder. The bytes, the order
 * and the switches are kept in this browser (`store.ts`). Turning a mod on or off, or moving it, does not reload the
 * map; the panel asks for that with a button. The map worker is told the same table `installModOverrides` keeps here.
 */
import { pageIndexedDb, pageSettings } from '../pageStore';
import { EMPTY_MOD_CHOICES, formatModChoices, moveMod, toggleMod, type ModChoices } from './choices';
import { loadMods, overrideLabel, type ModSession, type ModSource } from './load';
import { canonicalDiscPath, type ModManifest } from './manifest';
import { parseModManifestBytes, ModManifestError } from './manifest';
import { installModOverrides, type ModOverrideBytes } from './override';
import { installMemberOverrides, type MemberOverrideBytes } from '@s2u/archive';
import { folderPickProblem, ModPackageError, modPackageFromEntries, modPackageFromZip, zipPickProblem, type ModPackage } from './readPackage';
import { idbModLibrary, lazyModLibrary, ModStoreError, type ModFlags, type ModLibrary, type StoredMod } from './store';
import { foldIntoTip } from '../panelTips';

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

function showBytes(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  return /^[\x20-\x7e]*$/.test(text) ? JSON.stringify(text) : [...bytes.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The active override: a path the table will actually substitute, and a short look at its bytes. A stand-in disc
 * read named whatever file came first, so a map archive on its own was reported as another mod's loose file.
 */
function activeOverride(session: ModSession): { from: 'mod' | 'none'; text: string } {
  const active = session.overrides[0];
  if (!active) {
    const loaded = session.rows.some((row) => row.kind === 'loaded');
    return { from: 'none', text: loaded ? 'No active override.' : 'No mods added.' };
  }
  const more = session.overrides.length > 1 ? ` (+${session.overrides.length - 1} more)` : '';
  return { from: 'mod', text: `${overrideLabel(active)} -> ${showBytes(active.bytes)}${more}` };
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
  const section = el('section');
  section.id = 'mods';
  section.className = 'section';
  section.setAttribute('aria-labelledby', 'mods-label');
  const heading = el('h2', 'Mods');
  heading.id = 'mods-label';
  heading.className = 's2u-field__label';
  const note = el('p', 'A test-room adaptation. A zip or a folder you pick can replace a disc file or add one. Nothing is uploaded, and nothing in a mod is run as code. This browser keeps the files, the order and the on/off switches.');
  note.className = 's2u-field__note';
  const masterLabel = el('label', 'Enable mods');
  masterLabel.className = 's2u-tab';
  const master = el('input') as HTMLInputElement;
  master.type = 'checkbox';
  master.id = 'mods-enabled';
  masterLabel.append(master);
  const zipLabel = el('label', 'Add a mod (.zip)');
  zipLabel.className = 's2u-tab';
  const zipInput = el('input') as HTMLInputElement;
  zipInput.type = 'file';
  zipInput.id = 'mod-zip';
  zipInput.accept = '.zip,application/zip';
  zipLabel.append(zipInput);
  const folderLabel = el('label', 'Add a mod folder');
  folderLabel.className = 's2u-tab';
  const folderInput = el('input') as HTMLInputElement;
  folderInput.type = 'file';
  folderInput.id = 'mod-folder';
  folderInput.multiple = true;
  folderInput.setAttribute('webkitdirectory', '');
  folderLabel.append(folderInput);
  const list = el('ul');
  list.id = 'mod-list';
  const conflicts = el('p');
  conflicts.id = 'mod-conflicts';
  conflicts.className = 's2u-field__note';
  const reload = el('p');
  reload.id = 'mod-reload';
  reload.className = 's2u-field__note';
  reload.hidden = true;
  const reloadWord = el('span', 'Reload map to apply');
  const reloadButton = el('button', 'Reload map');
  reloadButton.type = 'button';
  reloadButton.id = 'mod-reload-map';
  reload.append(reloadWord, el('span', ' '), reloadButton);
  const storeNote = el('p');
  storeNote.id = 'mod-store';
  storeNote.className = 's2u-field__note';
  const read = el('p');
  read.id = 'mod-read';
  read.className = 's2u-status';
  read.setAttribute('role', 'status');
  // TRS-CONDENSE (the owner, 2026-11-01): the explanation behind the heading's info button (`../panelTips`).
  section.append(foldIntoTip(doc, heading, note, 'mods-note', 'Mods'), note, masterLabel, zipLabel, folderLabel, list, conflicts, reload, storeNote, read);
  host.append(section);

  let choices: ModChoices = EMPTY_MOD_CHOICES;
  let held: ModSource[] = [];
  let discPaths = new Set<string>();
  let generation = 0;
  let dirty = false;
  let userChanged = false;
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

  const paint = (session: ModSession): void => {
    master.checked = session.choices.enabled;
    list.replaceChildren();
    const loaded = session.rows.filter((row) => row.kind === 'loaded');
    for (const row of session.rows) {
      const item = el('li');
      if (row.kind === 'invalid') {
        item.dataset['state'] = 'invalid';
        const drop = el('button', 'Remove');
        drop.type = 'button';
        drop.dataset['modDrop'] = row.label;
        item.append(el('span', row.label), el('span', `invalid: ${row.reason}`), drop);
        list.append(item);
        continue;
      }
      item.dataset['state'] = row.enabled ? 'loaded' : 'off';
      item.dataset['modId'] = row.id;
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = row.enabled;
      box.dataset['modToggle'] = row.id;
      box.setAttribute('aria-label', `${row.name} on`);
      const up = el('button', 'Up');
      up.type = 'button';
      up.dataset['modMove'] = row.id;
      up.dataset['dir'] = '-1';
      up.disabled = loaded[0]?.kind === 'loaded' && loaded[0].id === row.id;
      const down = el('button', 'Down');
      down.type = 'button';
      down.dataset['modMove'] = row.id;
      down.dataset['dir'] = '1';
      const last = loaded[loaded.length - 1];
      down.disabled = last?.kind === 'loaded' && last.id === row.id;
      const remove = el('button', 'Remove');
      remove.type = 'button';
      remove.dataset['modRemove'] = row.id;
      const files = el('span', row.paths.map((file) => `${file.path} ${file.role}`).join(', '));
      files.dataset['roles'] = row.paths.map((file) => file.role).join(' ');
      item.append(box, el('span', `${row.name} ${row.version}`), el('span', row.enabled ? 'loaded' : 'off'), files, up, down, remove);
      list.append(item);
    }
    conflicts.textContent = session.conflicts.length === 0 ? '' : session.conflicts
      .map((conflict) => `Conflict ${conflict.path}: ${conflict.winnerId} wins over ${conflict.loserIds.join(', ')}`)
      .join(' ');
    reload.hidden = !userChanged;
    storeNote.textContent = storeMessage;
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
    const shown = activeOverride(session);
    read.dataset['from'] = shown.from;
    read.textContent = shown.text;
  };

  const remember = (source: ModSource): Promise<void> => {
    held.push(source);
    dirty = true;
    userChanged = true;
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

  zipInput.addEventListener('change', () => {
    const file = zipInput.files?.[0];
    zipInput.value = '';
    if (!file) return;
    const why = zipPickProblem(file.size);
    if (why) { void ready.then(() => addPackage(file.name, undefined, why)); return; }
    void file.arrayBuffer().then((buf) => addZip(file.name, new Uint8Array(buf)));
  });
  folderInput.addEventListener('change', () => {
    const files = [...(folderInput.files ?? [])];
    folderInput.value = '';
    if (!files.length) return;
    const name = files[0]?.webkitRelativePath.split(/[\\/]/)[0] || 'folder';
    const why = folderPickProblem(files);
    if (why) { void ready.then(() => addPackage(name, undefined, why)); return; }
    void Promise.all(files.map(async (file) => ({ path: file.webkitRelativePath || file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))
      .then((entries) => addFolder(name, entries));
  });
  master.addEventListener('change', () => {
    choices = { ...choices, enabled: master.checked };
    visitOff = null;                                               // the visitor's own switch: written as it is
    dirty = true;
    userChanged = true;
    touched = true;
    void (library.setMaster?.(master.checked) ?? Promise.resolve()).then(render, (e: unknown) => {
      storeMessage = e instanceof Error ? e.message : 'the master choice could not be saved'; return render();
    });
  });
  list.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset['modToggle']) return;
    choices = toggleMod(choices, input.dataset['modToggle'], input.checked);
    dirty = true;
    userChanged = true;
    touched = true;
    void render();
  });
  list.addEventListener('click', (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset['modMove']) {
      choices = moveMod(choices, button.dataset['modMove'], button.dataset['dir'] === '-1' ? -1 : 1);
      dirty = true;
      userChanged = true;
    touched = true;
      void render();
      return;
    }
    const removeId = button.dataset['modRemove'];
    if (removeId) {
      void library.remove(removeId).then(() => {
        userChanged = true;
        touched = true;
        dirty = true;
        held = held.filter((source) => source.id !== removeId);
        choices = {
          ...choices,
          order: choices.order.filter((id) => id !== removeId),
          disabled: choices.disabled.filter((id) => id !== removeId),
        };
        return render();
      }, (e: unknown) => {
        storeMessage = e instanceof ModStoreError ? e.message : 'the mod could not be removed';
        return render();
      });
      return;
    }
    const drop = button.dataset['modDrop'];
    if (drop) {
      const at = held.findIndex((source) => source.label === drop && source.id === undefined);
      if (at >= 0) held.splice(at, 1);
      void render();
    }
  });
  reloadButton.addEventListener('click', () => {
    userChanged = false;
    reload.hidden = true;
    options.reloadMap?.();
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
        storeMessage = 'Saved mods loaded late, so they stay off for this visit. Turn Enable mods on to use them.';
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
    dirty = false; visitOff = null; userChanged = true; touched = true;
    paint(session); publish(session);
    const shown = activeOverride(session); read.dataset['from'] = shown.from; read.textContent = shown.text;
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
