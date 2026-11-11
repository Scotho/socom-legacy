import type { LocalPackProgress, LocalPackSummary, PackRegistry } from '../../packs/registry';
import type { ModsState } from '../../packs/modsState';
import type { HdPackSource } from '../../hdTexturePackStore';
import { CUSTOM_MAP_ALREADY_HERE } from '../../packs/customMaps';
import { customMapDetail, readinessSentence } from '../../packs/readiness';
import type { ModsAdapter, ModsFile, ModsRowView, ModsView } from '../state';
import { HD_PACK_AUTHOR, HD_PACK_CREDIT } from '../../hdPackCredit';

/**
 * B206 ML-2 (ML.R6, ML.R7): the MODS screen's adapter -- reads and writes only through the one registry (ML-1,
 * `../../packs/registry` `createPackRegistry`), loaded when the screen first opens so the launcher's boot loads no pack
 * code and opens no database. The drop: a drop anywhere on the page while the MODS screen is drawn is the screen's
 * (taken in the capture phase, so the disc prompt's own drop listener never sees a pack as a disc image); a dropped
 * folder is walked through its `DataTransfer` entries. A browser adaptation with no original (OT.R110, ML.R2).
 */

/**
 * The HD pack's Thunderstore page (ML.R16, H413): the owner uploads the pack there; until the page exists this is null
 * and the screen draws no link -- never a made-up address. Listed in research 370's placeholders.
 */
export const HD_PACK_STORE_PAGE_PLACEHOLDER: string | null = null;

/**
 * B206 ML-12 -- TEMPORARY (plan 2026-11-06-mods-loader, ML.R16; the owner, H416: "add a "add test hd texture pack" button
 * temporarily that applies it and adds it to peoples mod list (until we get it on thunderforge and i say remove that)").
 * A browser adaptation, product track (ML.R2): the MODS screen's "Add test HD texture pack" fetches the HD pack we serve
 * (`/experimental-packs/hd/`, H417; `../../hdTexturePackServed` `servedHdSource`), installs it into the HD library a
 * dropped zip reaches (`PackRegistry.hd.installFrom`) and chooses it; every page applies it behind ML-4's overlay.
 * **Removal (ML-13):** once the HD pack is on Thunderstore AND the owner says so -- one commit deleting every use of this
 * constant's name (`test/modsTestHdPack.test.ts` lists the files that hold it).
 */
export const TEST_HD_PACK_BUTTON_ADAPTATION = 'ML-12 (ML.R16): a temporary button that installs the served HD pack, until the pack is on Thunderstore and the owner says to remove it' as const;
/** The HD pack's author, credited in the install area and on an installed HD pack's row (`../../hdPackCredit`; the owner, 2026-11-09). */
export { HD_PACK_AUTHOR, HD_PACK_CREDIT };
/** TEST_HD_PACK_BUTTON_ADAPTATION: the row's words. */
export const TEST_HD_PACK_LABEL = 'Add test HD texture pack';
/** Opens with `HD_PACK_CREDIT` (a plain literal: the modding wiki quotes it, `tools/test/moddingWikiPages.test.ts`). */
export const TEST_HD_PACK_ABOUT = 'HD textures by GoE SouL. Temporary: downloads our test HD pack into this list and chooses it, until the HD pack is on Thunderstore';
export const TEST_HD_PACK_NOT_SERVED = 'The test HD pack is not available yet.';

/** What the adapter uses of the registry (a test hands a fake). `hd`: TEST_HD_PACK_BUTTON_ADAPTATION's `installFrom` alone. */
export type ModsRegistry = Pick<PackRegistry, 'list' | 'remove' | 'importDrop' | 'modsState' | 'subscribe'> & { hd: Pick<PackRegistry['hd'], 'installFrom'> };
export interface ModsDeps {
  /** The registry; absent, the page's (`createPackRegistry()`), imported on first use. */
  registry?: () => Promise<ModsRegistry>;
  /** TEST_HD_PACK_BUTTON_ADAPTATION: the served pack's source; absent, `servedHdSource()`, imported on the press. */
  testHdSource?: () => Promise<HdPackSource>;
}
/** The hidden file input's id (the drop zone's "Choose a file"). */
export const MODS_FILE_INPUT_ID = 'mods-file';

const mb = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
/**
 * ML-9's F3 (TEST_HD_PACK_BUTTON_ADAPTATION): the download's words and bar -- the files fetched of the files to fetch, and
 * the bytes downloaded. Never "of" the manifest's `totalBytes`: that is the decoded size (4.6 GB for the test pack, of
 * some 1.5 GB fetched), so the count would stop near a third. LATER 742: a pack whose manifest names its `packedBytes`
 * gives `ofBytes` (the manifest and the payloads as served), and the words are the bytes downloaded of those.
 */
export function testHdDownloadWords(p: { files: number; ofFiles: number; bytes: number; ofBytes?: number }): { words: string; progress: number | null } {
  const got = p.bytes > 0 ? mb(p.bytes) : '0 KB';
  if (p.ofBytes !== undefined && p.ofBytes > 0) {
    return { words: `Downloading the test HD pack… ${got} of ${mb(p.ofBytes)}`, progress: Math.min(1, p.bytes / p.ofBytes) };
  }
  return { words: `Downloading the test HD pack… ${p.files} of ${p.ofFiles} files, ${p.bytes > 0 ? mb(p.bytes) : '0 KB'} downloaded`,
    progress: p.ofFiles > 0 ? Math.min(1, p.files / p.ofFiles) : null };
}
/** ML-9's F3: an HD pack's size is its manifest's `totalBytes`, the decoded size, said so; another pack's as kept. */
const sizeWords = (p: LocalPackSummary): string => `${mb(p.bytes)}${p.kind === 'hd' ? ' decoded' : ''}`;
const modId = (id: string): string => id.slice('mod:'.length);
/** FP-5 item 4: where a custom map opens (its row's place), and a content pack's -- never "applied" (ML.R3). */
export const CUSTOM_MAP_WHERE = 'Custom map · Forge, test room';
export const CONTENT_PACK_WHERE = 'Forge, test room';
const where = (p: LocalPackSummary): string => {
  if (p.kind === 'custom-map') return CUSTOM_MAP_WHERE;
  if (p.kind === 'hd') return 'Every page, every map';
  if (p.kind === 'texture') return `Every page, on ${p.id.split(':')[1] ?? 'its map'}`;
  if (p.kind === 'mod' || p.kind === 'model') return 'The test room';   // ML.R5, H414: only texture packs apply everywhere
  if (p.packKinds?.includes('content')) return CONTENT_PACK_WHERE;   // FP-5: the Forge and the test room read its content
  return 'Stored, not applied';
};

/**
 * FP-5 item 4: the words for a bundle the drop kept -- added (and what it still needs, in `../../packs/readiness`'s
 * words), or already here (a re-import changes nothing).
 */
export function customMapAdded(result: LocalPackSummary): string {
  if (result.diagnostics.some((d) => d.code === CUSTOM_MAP_ALREADY_HERE)) return `${result.name} is already here: nothing changed.`;
  const missing = result.missing ?? [];
  return `${result.name} added: a custom map for the Forge and the test room.${missing.length ? ` ${readinessSentence(missing)}.` : ''}`;
}

/** The screen's rows from the registry's list and the MODS state (ML.R5, ML.R8). */
export function modsRows(list: readonly LocalPackSummary[], state: ModsState): ModsRowView[] {
  const order = state.mods.order;
  const mods = list.filter((p) => p.kind === 'mod' && !p.staged)
    .sort((x, y) => (order.indexOf(modId(x.id)) + 1 || 1e6) - (order.indexOf(modId(y.id)) + 1 || 1e6));
  const rows: ModsRowView[] = [];
  for (const p of list) {
    if (p.staged || p.kind === 'map' || p.kind === 'mod') continue;
    if (p.kind === 'custom-map') {
      // FP-5 item 4: read-only, no switch; its readiness in the one helper's words (`../../packs/readiness`, FP-6 reuses them).
      rows.push({ id: p.id, name: p.name, kind: 'custom-map', detail: customMapDetail(p.name, p.requires?.length ?? 0, p.missing ?? []), where: where(p), on: null });
      continue;
    }
    const kind = p.kind === 'hd' || p.kind === 'texture' || p.kind === 'model' ? p.kind : p.slot === 'independent' ? 'pack' : null;
    if (!kind) continue;
    const on = kind === 'pack' ? null : kind === 'model' ? (p.slot === 'second' ? state.models.second : state.models.primary) : state.texture === p.id;
    rows.push({ id: p.id, name: p.name, kind, detail: `${plural(p.files, 'file')} · ${sizeWords(p)}`, where: where(p), on,
      ...(kind === 'hd' ? { credit: HD_PACK_AUTHOR } : {}) });
  }
  mods.forEach((p, i) => rows.push({ id: p.id, name: p.name, kind: 'mod', detail: `${plural(p.files, 'file')} · ${mb(p.bytes)}`, where: where(p),
    on: state.mods.enabled && !state.mods.disabled.includes(modId(p.id)), up: i > 0, down: i < mods.length - 1 }));
  return rows;
}

/** A dropped folder's files, each named by its path in the folder (the entries API; `webkitGetAsEntry`). */
interface Entry { isFile: boolean; isDirectory: boolean; name: string; file?(ok: (f: File) => void, no: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (es: Entry[]) => void, no: (e: unknown) => void): void } }
async function walk(entry: Entry, path: string, out: ModsFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((ok, no) => entry.file!(ok, no));
    const rel = `${path}${entry.name}`;
    out.push({ name: f.name, size: f.size, webkitRelativePath: rel, arrayBuffer: () => f.arrayBuffer(), slice: (...args: Parameters<File['slice']>) => f.slice(...args) });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, no) => reader.readEntries(ok, no));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${path}${entry.name}/`, out);
    }
  }
}
/** What a drop carries: a folder walked, or its files as they are. */
export async function droppedFiles(dt: DataTransfer): Promise<ModsFile[]> {
  const entries = Array.from(dt.items ?? []).map((item) => (item as DataTransferItem & { webkitGetAsEntry?(): Entry | null }).webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e?.isDirectory)) {
    const out: ModsFile[] = [];
    for (const e of entries) if (e) await walk(e, '', out);
    return out;
  }
  return Array.from(dt.files ?? []);
}

export function liveMods(doc: Document, notify: () => void, deps: ModsDeps = {}): ModsAdapter & { dispose(): void } {
  const load = deps.registry ?? (async () => (await import('../../packs/registry')).createPackRegistry());
  let registry: Promise<ModsRegistry> | null = null;
  let unsubscribe: (() => void)[] = [];
  let list: LocalPackSummary[] = [];
  let state: ModsState = { texture: null, models: { primary: false, second: false }, mods: { enabled: false, order: [], disabled: [] } };
  let ready = false;
  let busy: ModsView['busy'] = null;
  let message: ModsView['message'] = null;
  let total = 0;
  /** TEST_HD_PACK_BUTTON_ADAPTATION: the served pack is downloading (its words are the files fetched of its files, LATER 742). */
  let downloading = false;
  const reg = (): Promise<ModsRegistry> => registry ??= load().then((r) => {
    unsubscribe.push(r.modsState.subscribe(() => { void refresh(); }));
    unsubscribe.push(r.subscribe((e: LocalPackProgress) => {
      if (!busy || e.operation !== 'import' || downloading) return;   // TEST_HD_PACK_BUTTON_ADAPTATION: its own words
      if (e.phase === 'reading' || e.phase === 'storing') busy = { words: `${e.phase === 'reading' ? 'Reading' : 'Keeping'}… ${plural(e.files, 'file')}`, progress: total ? Math.min(1, e.bytes / total) : null };
      notify();
    }));
    return r;
  });
  const refresh = async (): Promise<void> => {
    const r = await reg();
    [list, state] = await Promise.all([r.list(), r.modsState.read()]);
    ready = true;
    notify();
  };
  const words = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'The change could not be made.');
  /** One change at a time: its words while it runs, the list read again after. */
  const change = (running: string, work: (r: ModsRegistry) => Promise<string | null>): void => {
    if (busy) return;
    busy = { words: running, progress: null }; message = null; notify();
    void reg().then(work).then((done) => { message = done ? { words: done, tone: 'good' } : null; },
      (e: unknown) => { message = { words: words(e), tone: 'bad' }; })
      .then(() => { busy = null; total = 0; return refresh(); })
      .catch(() => { busy = null; notify(); });
  };
  const rows = (): ModsRowView[] => modsRows(list, state);

  let input = doc.getElementById(MODS_FILE_INPUT_ID) as HTMLInputElement | null;
  if (!input) {
    input = doc.createElement('input');
    input.type = 'file'; input.id = MODS_FILE_INPUT_ID; input.multiple = true; input.hidden = true; input.tabIndex = -1;
    doc.body.append(input);
  }
  const picker = input;
  const api: ModsAdapter & { dispose(): void } = {
    open() { void refresh().catch(() => { ready = true; message = { words: 'The packs kept in this browser could not be read.', tone: 'bad' }; notify(); }); },
    view: () => ({ ready, rows: rows(), busy, message, storePage: HD_PACK_STORE_PAGE_PLACEHOLDER, texture: state.texture, testHdPack: true,
      textures: [{ id: null, label: 'Original' }, ...rows().filter((r) => r.kind === 'hd' || r.kind === 'texture').map((r) => ({ id: r.id, label: r.name }))] }),
    // RB-5: the chooser opens only inside a user activation (a click, a tap, a key); the grammar never calls this from a
    // pad's press, whose Cross says how instead (`../grammar` `MODS_CHOOSER_POINTER_WORDS`).
    choose() { picker.value = ''; picker.click(); },
    drop(files) {
      if (!files.length) return;
      total = files.reduce((n, f) => n + f.size, 0);
      change('Reading…', async (r) => {
        const result = await r.importDrop(files);
        if (result.kind === 'custom-map') return customMapAdded(result);
        return `${result.name} added.${result.kind === 'hd' || result.kind === 'texture' ? ' Choose it as the texture pack to see it.' : ''}`;
      });
    },
    toggle(id) {
      const row = rows().find((x) => x.id === id);
      if (!row || row.on === null) return;
      if (row.kind === 'hd' || row.kind === 'texture') change('Choosing…', async (r) => { await r.modsState.setTexture(row.on ? null : id); return null; });
      else if (row.kind === 'model') change('Switching…', async (r) => { await r.modsState.setModel(id === 'model:second' ? 'second' : 'primary', !row.on); return null; });
      else change('Switching…', async (r) => {
        const m = state.mods, key = modId(id), disabled = m.disabled.filter((x) => x !== key);
        await r.modsState.setMods(row.on ? { ...m, disabled: [...disabled, key] } : { ...m, enabled: true, disabled });
        return null;
      });
    },
    remove(id) {
      const row = rows().find((x) => x.id === id);
      if (row) change(`Removing ${row.name}…`, async (r) => {
        await r.remove(id);
        // FP-5 item 2: a custom map's packs stay (other layouts may use them); the words say so.
        return row.kind === 'custom-map' ? `${row.name} removed. Its packs are kept: other layouts may use them.` : `${row.name} removed.`;
      });
    },
    move(id, d) {
      const order = [...state.mods.order], at = order.indexOf(modId(id)), to = at + d;
      if (at < 0 || to < 0 || to >= order.length) return;
      [order[at], order[to]] = [order[to]!, order[at]!];
      change('Moving…', async (r) => { await r.modsState.setMods({ ...state.mods, order }); return null; });
    },
    setTexture(id) { change('Choosing…', async (r) => { await r.modsState.setTexture(id); return null; }); },
    // TEST_HD_PACK_BUTTON_ADAPTATION (ML-12): the served pack installed into the list and chosen; removed by ML-13.
    addTestHdPack() {
      if (busy) return;
      downloading = true;
      change('Downloading the test HD pack…', async (r) => {
        try {
          const source = await (deps.testHdSource ?? (async () => (await import('../../hdTexturePackServed')).servedHdSource()))();
          const result = await r.hd.installFrom(source, { onProgress: (p) => {
            busy = testHdDownloadWords(p); notify();
          } }).catch((e: unknown) => { throw (e as { code?: string }).code === 'NOT_FOUND' ? new Error(TEST_HD_PACK_NOT_SERVED) : e; });
          await r.modsState.setTexture(result.id);
          return `${result.name} ${result.fetched ? 'added and' : 'already here,'} chosen as the texture pack.`;
        } finally { downloading = false; }
      });
    },
    dispose() {
      for (const u of unsubscribe) u();
      unsubscribe = [];
      picker.removeEventListener('change', onPick);
      doc.removeEventListener('dragover', onOver, true);
      doc.removeEventListener('drop', onDrop, true);
    },
  };
  const onPick = (): void => { const files = Array.from(picker.files ?? []); picker.value = ''; api.drop(files); };
  const shown = (): boolean => !!doc.querySelector('[data-key="mods"]');
  const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onOver = (e: DragEvent): void => {
    if (!shown() || !carriesFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent): void => {
    if (!shown() || !carriesFiles(e) || !e.dataTransfer) return;
    e.preventDefault(); e.stopPropagation();
    void droppedFiles(e.dataTransfer).then((files) => { api.drop(files); }, () => { message = { words: 'The dropped folder could not be read.', tone: 'bad' }; notify(); });
  };
  picker.addEventListener('change', onPick);
  doc.addEventListener('dragover', onOver, true);
  doc.addEventListener('drop', onDrop, true);
  return api;
}
