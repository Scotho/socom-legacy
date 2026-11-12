import {
  contentBaseRef, layoutOfRecord, parseAssetId, readContentMapDefinition,
  type AnyLayoutRecord, type ContentMapDefinition, type ContentRef, type Layout, type PackRef,
} from '@s2u/creator-contracts';
import { collisionLines } from '@s2u/scene';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { CONTENT_VALUE_PREFIX, contentMapValue, customMapRows, customRowLabel, customRowSentence, CUSTOM_MAPS_GROUP, CUSTOM_VALUE_PREFIX, SAVE_VALUE_PREFIX, type CustomMapRow } from './forge/customMaps';
import { layoutGround, prototypePolygons, type PieceHull } from './forge/ground';
import { composeMatchMap } from './forge/matchMap';
import { FORGE_SAVES_KEY, readSaveList, type NamedSave } from './forge/saves';
import { SAVES_DB_NAME, SavesStore } from './forge/savesStore';
import type { LoadedMap } from './loadMap';
import { groundPolygons } from './mover';
import type { AssetDefinition } from './packs/content/assets';
import { CONTENT_METRES_PER_UNIT_ADAPTATION, type ContentPiece, type ContentResolver } from './packs/content/collision';
import { ContentMapLoadError, contentMapPieces, loadContentMap } from './packs/content/map';
import type { CustomMapRecord } from './packs/customMaps';
import { CUSTOM_MAPS_OFFLINE_WORDS } from './customOffline';
import type { RegistryContentSource } from './packs/content/source';

/** The page's one shared content source (the Forge's own), handed on so the room's chunk carries it (`./main`). */
export { pageContentSource } from './packs/content/source';

/**
 * FP-6 item 5 (FP.R13; product track, a test instrument -- a browser adaptation with no original, the original has no
 * custom maps): the test room walks an authored map. The room's disc maps come through its worker (`./main` `load`, the
 * answer at `show(message.map)`); an authored map (`../packs/content/map` `loadContentMap`) is built here, on the main
 * thread, from the page's shared content source (`./packs/content/source` `pageContentSource`, the Forge's own), and
 * handed to the same `show` under the same load hold (`./loadingJoin` `LoadingJoin`, begun by the page's `begin`).
 *
 * What it is NOT: no rules, no NPCs, no objectives of a layout and none of Forge Play's machinery (FP.R13) -- the map
 * as its loader gives it (its hull, its spawns, its props), and only what the room already does with a map.
 *
 * The hold's lanes (`./loadingJoin` `pageLanes`): sound, effects and the ARMORY are asked of the worker by a map's path
 * and archive, which an authored map has not. `contentLaneAnswers`: with a library (the disc map whose characters, kits
 * and HUD the authored map takes, `LoadContentMapOptions.library`) they are asked of the library as a disc map's are of
 * its own; without one each lane is answered at once for this load with no data -- the way a lane's failed request is
 * answered (`./main`, the worker's `error` reply: `loadedSound = soundLane.answers(id)`), so the screen never waits on a
 * request nobody made. The load screen always releases: every refusal, every throw (the page's `show` included) ends the
 * hold through `fail` with the refusal's words; a load superseded by a newer one leaves the hold to the newer.
 */

/** The shared source as this module reads it (`../forge/page` `ForgeContentSource`'s reading half). */
export interface TestroomContentSource {
  map(ref: ContentRef): unknown;
  asset(ref: ContentRef): AssetDefinition | null;
  ready?(packs: PackRef | readonly PackRef[]): Promise<void>;
}

/** An authored map to open: its reference, the library its base names (null: none named), and the row's name. */
export interface ContentOpen {
  ref: ContentRef;
  library: string | null;
  name?: string;
}

/** A pack prop to draw where its hull stands: its definition and its column-major matrix (game units). */
export interface ContentPropPlacement { def: AssetDefinition; m: readonly number[] }

/** The page's side (`./main` `loadContent`). */
export interface TestroomContentDeps {
  /** A new load asked: the page's load counter bumped, the hold begun, the screen covered; the load's id. */
  begin(): number;
  /** The load the page wants now (a newer load, disc or authored, supersedes this one). */
  wanted(): number;
  source(): Promise<TestroomContentSource>;
  /** The library: the disc map `stem` names, or with null the room's own shown disc map; null when there is none. */
  library(stem: string | null): Promise<LoadedMap | null>;
  /** The map on screen for `load` (the page's `show`). */
  show(map: LoadedMap, load: number): void;
  /** The hold's sound, effects and ARMORY lanes answered for `load` (`contentLaneAnswers`). */
  answer(load: number, library: LoadedMap | null): void;
  /** The pack props drawn for `load` (the hull already holds them). */
  drawProps(load: number, props: readonly ContentPropPlacement[]): void;
  /** The load refused: the hold ended for `load`, `words` in the room's message line. */
  fail(load: number, words: string): void;
}

/** How the page answers the hold's three worker lanes for an authored map's load (see the module's note). */
export type ContentLaneAnswers =
  | { kind: 'ask'; path: string; archive: string }
  | { kind: 'none'; loadedSound: number; loadedEffects: number; loadedArmory: number };
export function contentLaneAnswers(load: number, library: Pick<LoadedMap, 'path' | 'archive'> | null): ContentLaneAnswers {
  return library ? { kind: 'ask', path: library.path, archive: library.archive } : { kind: 'none', loadedSound: load, loadedEffects: load, loadedArmory: load };
}

/** A refusal whose words are the room's message line as they stand. */
class Refusal extends Error {}

const wordsOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Opens `open` in the room: begins the hold, reads the map from the shared source, loads it with its library, shows it,
 * answers the lanes and hands its props to the draw. Resolves `shown`, `refused` (the hold ended, said) or `superseded`.
 */
export async function loadTestroomContent(open: ContentOpen, deps: TestroomContentDeps, layout: Layout | null = null): Promise<'shown' | 'refused' | 'superseded'> {
  // Review N3: `begin` inside the try -- one that throws after the page's hold began still ends that hold through `fail`
  // (its load is then the page's wanted one, which `begin` had just made).
  let load = -1;
  const stale = (): boolean => load >= 0 && deps.wanted() !== load;
  let name = open.name ?? open.ref.assetId;
  try {
    load = deps.begin();
    const src = await deps.source();
    if (stale()) return 'superseded';
    const json: unknown = await Promise.resolve(src.map(open.ref));
    if (stale()) return 'superseded';
    if (json === null || json === undefined) throw new Refusal(`its pack ${open.ref.pack.id}@${open.ref.pack.version} is not on this device`);
    const read = readContentMapDefinition(json, open.ref);
    if (Array.isArray(read)) throw new ContentMapLoadError(read);
    const def = read as ContentMapDefinition;
    name = open.name ?? def.name;
    const library = await deps.library(open.library).catch(() => null);
    if (stale()) return 'superseded';
    const resolve: ContentResolver = (r) => { try { return src.asset(r); } catch { return null; } };
    const authored = await loadContentMap(def, { resolveAsset: resolve, ...(library ? { library } : {}) });
    if (stale()) return 'superseded';
    const props: ContentPropPlacement[] = contentMapPieces(def).flatMap((p) => { const d = resolve(p.content); return d ? [{ def: d, m: p.m }] : []; });
    // A bundle's or a save's layout: its static pieces on the base (the library's own archive the one disc source here).
    const pieced = layout ? composeStaticPieces(authored, layout, library ? new Map([[library.archive, library]]) : new Map(), resolve) : null;
    const map = pieced?.map ?? authored;
    if (pieced) props.push(...pieced.props);
    deps.show(map, load);
    deps.answer(load, library);
    deps.drawProps(load, props);
    return 'shown';
  } catch (e) {
    if (stale()) return 'superseded';
    deps.fail(load >= 0 ? load : deps.wanted(), `${name} did not load: ${wordsOf(e)}`);
    return 'refused';
  }
}

/**
 * The stand-in's colour where a prop's visual will not read: the Forge's own (`../forge/page`
 * `CONTENT_STANDIN_COLOUR_ADAPTATION`, 0xc4a226), so a prop looks alike in both instruments. An adaptation, no original.
 */
export const TESTROOM_CONTENT_STANDIN_COLOUR_ADAPTATION = 0xc4a226;

/**
 * The pack props drawn as the Forge draws a base's own props (`../forge/page` `newContentPiece`): each its GLB (the
 * definition's visual member, read through `./modelPackRuntime` `parseGlb`) scaled once from metres to game units, else
 * its bounds' wireframe stand-in, placed by its matrix. `member` answers the visual's bytes (null: not here). The group's
 * `userData.dispose` frees what it built.
 */
export async function contentPropsObject(props: readonly ContentPropPlacement[],
  member: (def: AssetDefinition) => Uint8Array | null | Promise<Uint8Array | null>): Promise<Group> {
  const g = new Group();
  g.name = 'testroom-content-props';
  const u = 1 / CONTENT_METRES_PER_UNIT_ADAPTATION;
  for (const p of props) {
    const r = new Group();
    r.name = `${p.def.ref.pack.id}:${p.def.ref.assetId}`;
    let visual: Object3D | null = null;
    const bytes = await Promise.resolve(member(p.def)).catch(() => null);
    if (bytes) {
      try { visual = await (await import('./modelPackRuntime')).parseGlb(bytes); } catch { visual = null; }
    }
    if (visual) visual.scale.setScalar(u);
    else {
      const { min, max } = p.def.boundsMetres;
      const box = new Mesh(new BoxGeometry(Math.max((max[0] - min[0]) * u, 1), Math.max((max[1] - min[1]) * u, 1), Math.max((max[2] - min[2]) * u, 1)),
        new MeshBasicMaterial({ color: TESTROOM_CONTENT_STANDIN_COLOUR_ADAPTATION, wireframe: true, fog: false }));
      box.position.set(((min[0] + max[0]) / 2) * u, ((min[1] + max[1]) / 2) * u, ((min[2] + max[2]) / 2) * u);
      visual = box;
    }
    r.add(visual);
    r.matrix.fromArray(p.m as number[]);
    r.matrix.decompose(r.position, r.quaternion, r.scale);
    g.add(r);
  }
  // PR #756 P2 (2): every geometry, material AND texture under the group freed (`./modelPackRuntime` `disposeObject`): each
  // `parseGlb` makes fresh textures, and a material's dispose does not free its textures, so each open would grow GPU memory.
  const runtime = await import('./modelPackRuntime');
  g.userData['dispose'] = () => { runtime.disposeObject(g); };
  return g;
}

/**
 * A layout's STATIC PIECES on `base`, and nothing else of it (FP.R13): the hull through the Forge's provider
 * (`./forge/ground` `layoutGround`: a pack piece's by the content provider, a disc piece's by its prototype's polygons in
 * `libraries`), the drawn props through the Forge's piece compose (`./forge/matchMap` `composeMatchMap`) given the pieces
 * alone -- no spawns (the base's own slots stand), no NPCs, no respawns; the layout's objectives, rules, hidden props and
 * environment are never read. A piece whose archive is not in `libraries`, or whose pack does not resolve, is left out
 * and counted in `missing`. The pack pieces come back in `props` for the page's draw.
 */
export function composeStaticPieces(base: LoadedMap, layout: Pick<Layout, 'pieces'> & Partial<Layout>, libraries: ReadonlyMap<string, LoadedMap>,
  resolve: ContentResolver | null): { map: LoadedMap; props: ContentPropPlacement[]; missing: number } {
  if (!layout.pieces.length || !base.ground) return { map: base, props: [], missing: layout.pieces.length };
  const hulls: (PieceHull | ContentPiece)[] = [];
  layout.pieces.forEach((p, i) => {
    const owner = `forge/piece_${i}`;
    if (p.content) { hulls.push({ owner, content: p.content, m: p.m }); return; }
    const id = parseAssetId(p.asset);
    const lib = id ? libraries.get(id.archive) : undefined;
    const polys = lib && id ? prototypePolygons(lib, id.model) : null;
    if (polys) hulls.push({ owner, polys, m: p.m });
  });
  const ground = layoutGround(base.ground, hulls, resolve);
  const piecesOnly: Layout = {
    forge: layout.forge ?? (1 as Layout['forge']), base: layout.base ?? { kind: 'map', archive: base.archive }, pieces: layout.pieces, spawns: [],
  };
  const c = composeMatchMap(base, piecesOnly, libraries, ground, 'seal', resolve);
  return {
    map: { ...c.map, collision: collisionLines(groundPolygons(ground)) },
    props: c.content.map((p) => ({ def: p.def, m: p.m })),
    missing: c.missing,
  };
}

/** What a Custom Maps row opens: an authored map (with a layout's pieces, or none), a disc map with pieces, or a refusal. */
export type CustomPlan =
  | { kind: 'content'; open: ContentOpen; layout: Layout | null }
  | { kind: 'disc'; archive: string; name: string; layout: Layout }
  | { kind: 'refused'; words: string };
export interface CustomPlanInput {
  records: readonly Pick<CustomMapRecord, 'digest' | 'name' | 'layout'>[];
  mapIndex: readonly { ref: ContentRef; name: string }[];
  saves: readonly Pick<NamedSave, 'id' | 'name' | 'record'>[];
}

/** A kept layout's base as the room opens it: an authored map with its library, a disc map, never the blank floor. */
function layoutPlan(record: AnyLayoutRecord, name: string): CustomPlan {
  const layout = layoutOfRecord(record);
  const b = layout.base;
  if (b.kind === 'content') return { kind: 'content', open: { ref: contentBaseRef(b), library: b.library, name }, layout };
  if (b.kind === 'map') return { kind: 'disc', archive: b.archive, name, layout };
  return { kind: 'refused', words: `${name} stands on the Forge's blank floor: open it in the Forge` };
}

/**
 * A row's value (`./forge/customMaps` `customMapRows`: `custom:<digest>`, `content:<pack>@<version>/<map>`, `save:<id>`)
 * to what it opens -- the Forge's own reading of the same rows (`../forge/page` `customLayoutFor`), less what the room
 * does not do: a blank-floor layout is the Forge's, refused here in words.
 */
export function customPlan(value: string, input: CustomPlanInput): CustomPlan {
  try {
    if (value.startsWith(CUSTOM_VALUE_PREFIX)) {
      const r = input.records.find((x) => `${CUSTOM_VALUE_PREFIX}${x.digest}` === value);
      return r ? layoutPlan(r.layout, r.name) : { kind: 'refused', words: 'That custom map is no longer installed' };
    }
    if (value.startsWith(SAVE_VALUE_PREFIX)) {
      const s = input.saves.find((x) => `${SAVE_VALUE_PREFIX}${x.id}` === value);
      return s ? layoutPlan(s.record as AnyLayoutRecord, s.name) : { kind: 'refused', words: 'That save is no longer in this browser' };
    }
    if (value.startsWith(CONTENT_VALUE_PREFIX)) {
      const m = input.mapIndex.find((x) => contentMapValue(x.ref) === value);
      return m ? { kind: 'content', open: { ref: m.ref, library: null, name: m.name }, layout: null } : { kind: 'refused', words: 'That content map is no longer installed' };
    }
  } catch (e) {
    return { kind: 'refused', words: `That custom map would not read: ${wordsOf(e)}` };
  }
  return { kind: 'refused', words: 'That is not a custom map' };
}

/** The packs a layout's pieces and its content base stand on, each once (for the source's `ready`). */
export function layoutPacks(layout: Pick<Layout, 'pieces' | 'base'>): PackRef[] {
  const all: PackRef[] = [...layout.pieces.flatMap((p) => (p.content ? [p.content.pack] : [])), ...(layout.base.kind === 'content' ? [layout.base.ref] : [])];
  return all.filter((r, i) => all.findIndex((q) => q.id === r.id && q.version === r.version && q.hash === r.hash) === i);
}

/**
 * The Forge's named saves, read and never written (`./forge/savesStore` `SavesStore.read`, the `saves` list, read by
 * `./forge/saves` `readSaveList`): the room makes no database -- with none there it reads none -- and runs no migration
 * and no hand-off (the Forge's own `ForgeSaves.open` does those). A save still only in the old settings store is not
 * listed here until the Forge has opened once. Never throws.
 */
export async function readTestroomSaves(factory: IDBFactory | null | undefined): Promise<NamedSave[]> {
  if (!factory) return [];
  try {
    const known = typeof factory.databases === 'function' ? await factory.databases() : null;
    if (known && !known.some((d) => d.name === SAVES_DB_NAME)) return [];
  } catch { return []; }
  const store = new SavesStore(factory, SAVES_DB_NAME);
  try {
    await store.open();
    const { text } = await store.read('saves');
    return readSaveList({ get: (k) => (k === FORGE_SAVES_KEY ? text : null), set: () => undefined }).saves;
  } catch {
    return [];
  } finally {
    store.close();
  }
}

/** The select's rows: the Forge's own listing (`./forge/customMaps` `customMapRows`) over the shared source and the saves. */
export async function listCustomMaps(src: Pick<RegistryContentSource, 'customMaps' | 'mapIndex' | 'availablePacks'>,
  factory: IDBFactory | null | undefined): Promise<CustomMapRow[]> {
  return customMapRows({ records: src.customMaps(), mapIndex: src.mapIndex(), saves: await readTestroomSaves(factory), available: src.availablePacks() });
}

/**
 * The room's Custom Maps select: a second field after the map select's (`anchor`), so the map select (Crispy's, OT.R112)
 * stays as it is. Hidden while there is no row; each row by the Forge's label (`customRowLabel`, its readiness sentence
 * the title); choosing a row hands its value to `choose` (the prompt row opens nothing).
 */
export function mountCustomMapsSelect(doc: Document, anchor: Element | null, choose: (value: string) => void): {
  set(rows: readonly CustomMapRow[]): void; setOnline(on: boolean): void; select: HTMLSelectElement;
} {
  const field = doc.createElement('div');
  field.className = 's2u-field';
  field.id = 'custom-maps-field';
  field.hidden = true;
  const label = doc.createElement('label');
  label.className = 's2u-field__label';
  label.htmlFor = 'custom-maps';
  label.textContent = CUSTOM_MAPS_GROUP;
  const select = doc.createElement('select');
  select.id = 'custom-maps';
  // The batch review's F2 (`./customOffline`): while Online names a server the select is disabled, and says why.
  const note = doc.createElement('p');
  note.className = 's2u-status';
  note.id = 'custom-maps-note';
  note.textContent = CUSTOM_MAPS_OFFLINE_WORDS;
  note.hidden = true;
  field.append(label, select, note);
  if (anchor) anchor.after(field);
  // PR #756 P2: back on the prompt once a choice is handed on, so the same row chosen again (after a disc map) is a change.
  select.addEventListener('change', () => {
    const v = select.value;
    select.value = '';
    if (v && !select.disabled) choose(v);
  });
  return {
    select,
    setOnline(on) {
      select.disabled = on;
      select.title = on ? CUSTOM_MAPS_OFFLINE_WORDS : '';
      note.hidden = !on;
    },
    set(rows) {
      const keep = select.value;
      const prompt = doc.createElement('option');
      prompt.value = '';
      prompt.textContent = 'Choose a custom map';
      select.replaceChildren(prompt, ...rows.map((r) => {
        const o = doc.createElement('option');
        o.value = r.value;
        o.textContent = customRowLabel(r);
        o.title = customRowSentence(r);
        o.dataset['kind'] = r.kind;
        return o;
      }));
      select.value = rows.some((r) => r.value === keep) ? keep : '';
      field.hidden = rows.length === 0;
    },
  };
}

/** The page's side of a Custom Maps selection (`./main` `openCustom`). */
export interface OpenCustomDeps {
  /** Whether this selection is still the latest (PR #756's P2: a disc map or another row chosen since takes the token). */
  current(): boolean;
  source(): Promise<Pick<RegistryContentSource, 'customMaps' | 'mapIndex' | 'asset'> & { ready?(packs: PackRef | readonly PackRef[]): Promise<void> }>;
  saves(): Promise<NamedSave[]>;
  say(words: string, error: boolean): void;
  /** The room's path of a disc map by its archive stem, or null when this source does not list it. */
  pathOf(archive: string): string | null;
  loadContent(open: ContentOpen, layout: Layout | null): void;
  /** The disc map loaded through the room's own load, its pieces composed by `compose` when the worker gives it. */
  loadDisc(path: string, compose: (map: LoadedMap) => { map: LoadedMap; props: ContentPropPlacement[] }): void;
}

/**
 * A Custom Maps row opened (`customPlan`): a content row by `loadContent`, a disc save by `loadDisc` with its static
 * pieces' compose, a refusal said. PR #756's second P2: after each read (the source, the saves, the required packs) the
 * selection is checked again, and one a newer selection superseded is abandoned silently -- no load, no words -- so an
 * older selection never resumes over the newer load.
 */
export async function openCustomRow(value: string, deps: OpenCustomDeps): Promise<'content' | 'disc' | 'refused' | 'superseded'> {
  let src: Awaited<ReturnType<OpenCustomDeps['source']>>;
  let saves: NamedSave[];
  try {
    src = await deps.source();
    if (!deps.current()) return 'superseded';
    saves = await deps.saves();
  } catch {
    if (!deps.current()) return 'superseded';
    deps.say('the custom maps would not read', true);
    return 'refused';
  }
  if (!deps.current()) return 'superseded';
  const plan = customPlan(value, { records: src.customMaps(), mapIndex: src.mapIndex(), saves });
  if (plan.kind === 'refused') { deps.say(plan.words, true); return 'refused'; }
  if (plan.layout && src.ready) await src.ready(layoutPacks(plan.layout)).catch(() => undefined);
  if (!deps.current()) return 'superseded';
  if (plan.kind === 'content') {
    deps.say(`loading ${plan.open.name ?? plan.open.ref.assetId} ...`, false);
    deps.loadContent(plan.open, plan.layout);
    return 'content';
  }
  const path = deps.pathOf(plan.archive);
  if (!path) { deps.say(`${plan.name} stands on ${plan.archive}, which this disc does not list`, true); return 'refused'; }
  deps.say(`loading ${plan.name} ...`, false);
  const layout = plan.layout;
  const resolve: ContentResolver = (r) => { try { return src.asset(r); } catch { return null; } };
  deps.loadDisc(path, (map) => composeStaticPieces(map, layout, new Map([[map.archive, map]]), resolve));
  return 'disc';
}
