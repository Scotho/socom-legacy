import { Object3D } from 'three';
import {
  BEHAVIOUR_CAPABILITIES, BEHAVIOUR_SLOTS, RULE_ACTION_SPECS, RULE_COMPARE_OPS, RULE_CONDITIONS, RULE_EVENT_SPECS, RULE_SCOPES, RULE_VALUE_TYPES,
  RULES_VOCABULARY_VERSION, type InstalledRulesPack, type PackRef,
} from '@s2u/creator-contracts';
import type { LoadedMap } from '../../loadMap';
import { previewStarter, STARTERS, type StarterContext, type StarterId } from '../../creator/examples';
import type { createCreatorCatalogue, CreatorAssetQuery } from '../../creator/catalogue';
import type { ArchiveEntry } from '../archives';
import type { ShotBounds, ShotDriver } from '../camera/driver';
import type { AssetFilter } from '../favourites';
import { yawOf, type Quat, type Vec3 } from '../group';
import { decodeHistoryStep, type History } from '../history';
import { placementOf } from '../hide';
import { parseCamera, serializeLayout, type Layout, type LayoutBase, type LayoutCamera, type Piece } from '../layout';
import type { PaletteEntry } from '../library';
import type { BombMarkerKind } from '../pieces';
import { boundStep, GRID_STEP_MAX, GRID_STEP_MIN, pastedPlaces, TURN_STEP_MAX, TURN_STEP_MIN } from '../placement';
import { recordOfLayout } from '../record';
import {
  checkForgeRecord, checkForgeRules, exportRulesPack, FORGE_AUTHORING_SCHEMA, FORGE_AUTHORING_VERSION, forgeModeList, importRulesPack, layoutOfAuthoring,
  parseForgeLayout, RulesPackError, sealForgeRules, spawnerSources, type ForgeLayout, type RulesPackFile,
} from '../rulesAuthoring';
import { checkRulesScript, ruleNamesOf, runRulesTest, type RulesTestScript } from '../matchRules';
import { deleteNamed, renameNamed, saveNamedRules, type NamedSave } from '../saves';
import type { OperationRegistry, OperationStep } from '../shell/operations';
import type { MapCheck } from '../validate';
import {
  ForgeAgentError, type ForgeAgentFacade, type ForgeAgentPrepared, type ForgeAgentSnapshot, type ForgeAgentStatus, type ForgeAgentView,
  type ForgeAgentViewToggle,
} from './api';
import { adoptForgeRules, FORGE_LAYOUT_OPERATIONS, importedLayout, planForgeLayout } from './commands';
import { FORGE_PLAY_OPERATIONS, type createForgePlayDriver } from './play';

/**
 * LATER 422 (browser adaptation; no original, no game controls): the Forge agent's editor facade, lifted out of
 * `../page` `mountForge`. It was built in the page's closure over its locals; it is built here over an explicit
 * `ForgeAgentEditor` -- what the facade reads of the page and what it asks the page to do -- so it can be tested and
 * changed apart from the page (`test/forgeEditorFacade.test.ts`). A pure move: the same reads in the same order, the same
 * refusals (codes and words), the same side effects in the same order, the same revision bookkeeping.
 */

type Side = 'seal' | 'terrorist';
type Placements = { key: string; model: string; at: number[] }[];

/**
 * Browser adaptation: the facade's revisions, made by the page before its first edit (`agentMark` / `agentChanged`).
 * The LAYOUT revision is monotonic across human/agent edits, undo, selection, settings, saves and every base
 * replacement -- never an index epoch, and never the view's (camera, palette, tool), which is its own revision.
 */
export interface ForgeAgentRevisions {
  /** A layout change not yet counted (`changed`, settings, hidden keys, saves); the next read counts it. */
  mark(): void;
  /** The layout revision advanced now; a marked change counted (the issues dropped); the listeners told. */
  changed(): void;
  /** The listeners told, no revision advanced (the page's frame, a view change). */
  notify(): void;
  subscribe(listener: () => void): () => void;
  /**
   * The layout revision as of now: a marked human change, a selection change or a mode change since the last read
   * advances it once. Cheap: a flag, the mode and the picked objects compared, no layout serialized.
   */
  layout(mode: ForgeAgentSnapshot['mode'], picks: readonly unknown[]): number;
  /** The view revision as of now: a print of the view's own state, advanced when it differs from the last. */
  view(print: string): number;
  /** The latest map check, dropped when the layout revision advances. */
  issues: MapCheck | null;
}

export function createForgeAgentRevisions(): ForgeAgentRevisions {
  let revision = 0, viewRevision = 0, dirty = false, issues: MapCheck | null = null;
  let seenMode: ForgeAgentSnapshot['mode'] | null = null;
  let seenPicks: unknown[] = [];
  let viewPrint = '';
  const listeners = new Set<() => void>();
  return {
    mark: () => { dirty = true; },
    changed: () => {
      revision++;
      if (dirty) { dirty = false; issues = null; }
      for (const listener of listeners) listener();
    },
    notify: () => { for (const listener of listeners) listener(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    layout: (m, now) => {
      const picked = now.length !== seenPicks.length || now.some((r, i) => r !== seenPicks[i]);
      if (dirty || picked || m !== seenMode) {
        dirty = false; seenMode = m; seenPicks = [...now]; revision++; issues = null;
      }
      return revision;
    },
    view: (print) => {
      if (print !== viewPrint) { viewPrint = print; viewRevision++; }
      return viewRevision;
    },
    get issues() { return issues; },
    set issues(found) { issues = found; },
  };
}

/** The editor clipboard's rows the paste reads (`../page` `ClipItem`). */
export interface ForgeAgentClip { asset: string | null; team: 'A' | 'B' | null; npc: { side: Side; type: number } | null; offset: Vec3; q: Quat; content: Piece['content'] | null }
type CreatorCatalogue = ReturnType<typeof createCreatorCatalogue>;

/** LATER 422: what the facade needs from the page -- its reads, then its actions (each the page's own code). */
export interface ForgeAgentEditor {
  revisions: ForgeAgentRevisions;
  /** The private Forge Play driver (`./play`). */
  play: Pick<ReturnType<typeof createForgePlayDriver>, 'execute' | 'status' | 'read' | 'cancel'>;
  /** FUI-6: the page's operation registry (`../shell/operations`). */
  operations: OperationRegistry;
  /** R5-B: the agent's camera shot on the page's fly camera, and the base map's world box. */
  shotDriver: ShotDriver | null;
  mapBounds: () => ShotBounds | null;
  /** The page's words for a list written elsewhere first (`../page` `SAVED_ELSEWHERE`). */
  savedElsewhereWords: string;
  // ---- reads
  /** The surface as the agent names it (`../shell/state` `agentModeOf`). */
  mode(): ForgeAgentSnapshot['mode'];
  /** The picked objects, in pick order. */
  picks(): readonly Object3D[];
  base(): LayoutBase | null;
  busy(): boolean;
  checking(): boolean;
  layoutName(): string;
  /** The layout as of now, camera included (FCW-32: its rules with it); null without a base. */
  layoutNow(): ForgeLayout | null;
  selectionIds(): string[];
  placementIds(): Map<string, Object3D>;
  npcOf(r: Object3D): { side: Side; type: number } | undefined;
  bombKindOf(r: Object3D): BombMarkerKind | null;
  lockedOf(r: Object3D): boolean;
  entries(): readonly ArchiveEntry[];
  /** The palette archive's props. */
  palette(): PaletteEntry[];
  characters(): { side: Side; type: number }[];
  charLabel(side: Side, type: number): string;
  absent(): ReadonlySet<string>;
  paletteArchive(): string;
  chosen(): string | null;
  npcChoice(): { side: Side; type: number } | null;
  favourites(): ReadonlySet<string>;
  filter(): AssetFilter;
  showChars(): boolean;
  query(): string;
  hiddenKeys(): ReadonlySet<string>;
  baseMap(): LoadedMap | null;
  charMap(): LoadedMap | null;
  /** The view's switches (every one the page has, the agent's among them). */
  view(): Readonly<Record<ForgeAgentViewToggle, boolean>>;
  snap(): boolean;
  gridStep(): number;
  turnStep(): number;
  tool(): ForgeAgentView['tool'];
  gizmoMode(): string;
  camera(): LayoutCamera;
  named(): readonly NamedSave[];
  /** The saves' generation the named copy was read at. */
  namedAt(): number;
  history: Pick<History<string>, 'canUndo' | 'canRedo' | 'peekUndo' | 'peekRedo' | 'undo' | 'redo'>;
  inMatch(): boolean;
  matchOfLobby(): boolean;
  playing(): boolean;
  /** The status line's words (a refused Play's reason). */
  statusText(): string;
  clipboard(): readonly ForgeAgentClip[];
  queryAssets(query: CreatorAssetQuery, cursor: string | undefined): ReturnType<CreatorCatalogue['queryCreatorAssets']>;
  checkPlacement(ref: string, transform: { at: Vec3; yaw?: number }): ReturnType<CreatorCatalogue['checkPlacement']>;
  starterContext(guard: () => void): Promise<StarterContext>;
  missingPacks(): PackRef[];
  missingPacksWords(what: string, packs: readonly PackRef[]): string;
  /** FCW-32 round 2 (F2; spec §7): the rules packs installed here, offered to the mode catalogue beside the draft; absent, none. */
  installedRules?(): readonly InstalledRulesPack[];
  // ---- actions
  /** Stage a layout's real pieces (and its base) without touching the scene; `strict` refuses an absent asset. */
  prepareLayout(l: Layout, strict?: boolean): Promise<{ missing: number; commit(): void; dispose(): void }>;
  applyPicked(ids: readonly string[]): void;
  changed(): void;
  refreshUndo(): void;
  /** An edit made: saved and one history step (`before` the selection at the edit). */
  edit(before: readonly string[], step: OperationStep | null): void;
  noteMissingPacks(): void;
  /** A staged layout's camera taken (when it has one: posed, settled and written), and the camera ready. */
  adoptLayoutCamera(camera: LayoutCamera | undefined): void;
  copySelection(): void;
  collectCheck(): Promise<MapCheck | null>;
  loadArchive(stem: string): Promise<LoadedMap>;
  /** The palette's archive set to `stem`, its props `map`'s, drawn. */
  setPalette(stem: string, map: LoadedMap): void;
  lookAtPoint(at: [number, number, number]): void;
  /** An explicit camera command settled and saved as a human camera settle is. */
  saveCamera(): void;
  persistNamed(saves: NamedSave[], at: number): Promise<'written' | 'conflict' | 'refused'>;
  startMatch(guard: () => void): Promise<void>;
  startPlay(guard: () => void): Promise<void>;
  setView(toggle: string, on: boolean): void;
  setCameraPose(pose: LayoutCamera): void;
  lookFrom(from: Vec3, to: Vec3): void;
  focusOn(r: Object3D): void;
  setQuery(query: string): void;
  setPaletteFilter(showChars: boolean, filter: AssetFilter): void;
  choose(asset: string): void;
  setFavourite(asset: string, on: boolean): void;
  /** The snap's steps set (already bounded) and the snap switched. */
  setSnap(grid: number, turn: number, on: boolean): void;
  setTool(tool: ForgeAgentView['tool'], gizmo: 'translate' | 'rotate' | undefined): void;
  stopPlay(): void;
  endMatch(): void;
  /** The named lists read again from the store (another writer's), and taken in once they are. */
  rereadLists(): void;
}

/** LATER 422: the facade `createForgeAgentApi` is handed, and what the page reads of it beside (its frame, its shell). */
export interface ForgeEditorFacade extends ForgeAgentFacade {
  status(): ForgeAgentStatus;
  prepare(operation: string, args: Record<string, unknown>, guard: () => void, signal?: AbortSignal, step?: OperationStep | null): Promise<ForgeAgentPrepared>;
  subscribe(listener: () => void): () => void;
  layoutRevision(): number;
  ready(): boolean;
}

/** The agent's view operations: they need the current layout revision (the guard) but advance only the view's. */
const AGENT_VIEW_OPERATIONS = new Set(['view.set', 'camera.pose', 'camera.look', 'camera.focus', 'palette.search', 'palette.filter', 'palette.choose',
  'palette.favourite', 'snap.set', 'tool.set']);

export function createForgeEditorFacade(editor: ForgeAgentEditor): ForgeEditorFacade {
  const { revisions } = editor;
  let agentOwnBusy = false;
  const agentPlacementsCache = new WeakMap<LoadedMap, Placements>();
  const agentBasePlacements = (): Placements => {
    const baseMap = editor.baseMap();
    if (baseMap && agentPlacementsCache.has(baseMap)) return agentPlacementsCache.get(baseMap)!;
    const found = new Map<string, { key: string; model: string; at: number[] }>();
    for (const p of baseMap?.props ?? []) for (let i = 0; i < p.matrices.length; i += 16) {
      const m = p.matrices.subarray(i, i + 16);
      const placement = baseMap ? placementOf(baseMap, p.modelName, m) : null;
      if (placement) found.set(placement.key, { key: placement.key, model: p.modelName, at: [m[12]!, m[13]!, m[14]!] });
    }
    const rows = [...found.values()];
    if (baseMap) agentPlacementsCache.set(baseMap, rows);
    return rows;
  };
  const agentLayoutRevision = (): number => revisions.layout(editor.mode(), editor.picks());
  const installed = (): readonly InstalledRulesPack[] => editor.installedRules?.() ?? [];
  /** The view revision as of now: a small print of the view's own state (the fly camera moves it while a human orbits). */
  const agentViewRevision = (): number => revisions.view(JSON.stringify([editor.view(), editor.snap(), editor.gridStep(), editor.turnStep(), editor.tool(),
    editor.gizmoMode(), editor.chosen(), editor.camera(), editor.paletteArchive(), editor.query(), editor.filter(), editor.showChars(), [...editor.favourites()]]));
  const agentReady = (): boolean => !!editor.base() && (!editor.busy() || agentOwnBusy) && !editor.checking();
  const agentStatus = (): ForgeAgentStatus => {
    const ready = agentReady(), mode = editor.mode(), revision = agentLayoutRevision(), viewRevision = agentViewRevision(), base = editor.base();
    return { ready, mode, revision, viewRevision,
      name: base ? editor.layoutName().trim() || 'Layout' : 'Forge',
      map: base ? (base.kind === 'map' ? base.archive : base.kind === 'content' ? `content:${base.ref.id}@${base.ref.version}/${base.mapId}` : `blank:${base.library}`) : null };
  };
  const agentSnapshot = (): ForgeAgentSnapshot => {
    const l = editor.layoutNow();
    const revision = agentLayoutRevision();
    return { ready: agentReady(), mode: editor.mode(), revision,
      layout: l ? recordOfLayout(l, l.name || 'Layout') : null,
      selection: editor.selectionIds(), refs: [...editor.placementIds()].map(([ref, r]) => ({ ref, revision,
        scope: 'revision', asset: r.userData['forgePiece'] ?? null, team: r.userData['forgeSpawn'] ?? null,
        npc: editor.npcOf(r) ?? null, bomb: editor.bombKindOf(r) ?? null, locked: editor.lockedOf(r),
        at: [r.position.x, r.position.y, r.position.z], yaw: r.rotation.y })),
      catalogue: { archives: editor.entries().map(({ stem, label, campaign }) => ({ stem, label, campaign })),
        palette: editor.palette(), characters: editor.characters().map((c) => ({ ...c, label: editor.charLabel(c.side, c.type) })),
        absent: [...editor.absent()], paletteArchive: editor.paletteArchive(), chosen: editor.chosen(), npcChoice: editor.npcChoice(), favourites: [...editor.favourites()],
        filter: editor.showChars() ? 'characters' : editor.filter(), query: editor.query(), loading: editor.busy(), baseReady: !!editor.base(),
        basePlacements: agentBasePlacements(),
        hidden: [...editor.hiddenKeys()], objectives: { bombStart: editor.baseMap()?.bombStart ?? null,
          bombSites: (editor.baseMap()?.actions ?? []).filter((a) => a.type === 'MPBOMB') },
      }, issues: revisions.issues?.issues ?? [], view: { ...editor.view(), revision: agentViewRevision(), snap: editor.snap(), gridStep: editor.gridStep(),
        turnStep: editor.turnStep(), tool: editor.tool(), gizmo: editor.gizmoMode(),
        camera: editor.camera(), scenario: editor.play.status(), saves: editor.named().map(({ id, name, savedAt }) => ({ id, name, savedAt })),
        issuesRevision: revisions.issues ? revision : null, notes: revisions.issues?.notes ?? [] },
      canUndo: editor.history.canUndo(), canRedo: editor.history.canRedo(), play: editor.play.read(), rules: l?.rules ?? null };
  };
  const agentRef = (ref: string, allowLocked = false): Object3D => {
    const r = editor.placementIds().get(ref);
    if (!r) throw new ForgeAgentError('INVALID_REFERENCE', `Unknown revision-scoped reference ${ref}`);
    if (!allowLocked && editor.lockedOf(r)) throw new ForgeAgentError('LOCKED', `${ref} is locked`);
    return r;
  };
  const agentStage = async (l: Layout, guard: () => void, picked: readonly string[] = [], step: OperationStep | null = null): Promise<ForgeAgentPrepared> => {
    const before = editor.selectionIds();
    const prepared = await editor.prepareLayout(l, true);
    return { dispose: prepared.dispose, commit: () => {
      guard(); prepared.commit();
      editor.applyPicked(picked.filter((ref) => editor.placementIds().has(ref)));
      editor.adoptLayoutCamera(l.camera);
      editor.edit(before, step ?? editor.operations.active());
      revisions.issues = null;
      editor.noteMissingPacks();
      return { selection: editor.selectionIds(), missing: prepared.missing };
    } };
  };
  const agentViewChanged = (): void => { agentViewRevision(); revisions.notify(); };
  const agentPrepare = async (operation: string, args: Record<string, unknown>, guard: () => void, signal?: AbortSignal,
    step: OperationStep | null = null): Promise<ForgeAgentPrepared> => {
    const noop = (data: unknown): ForgeAgentPrepared => ({ commit: () => data, dispose: () => undefined });
    const immediate = (action: () => unknown | Promise<unknown>): ForgeAgentPrepared => ({ dispose: () => undefined,
      commit: () => { guard(); return action(); } });
    const current = (): ForgeLayout => { const l = editor.layoutNow(); if (!l) throw new ForgeAgentError('NOT_READY', 'Open a base first'); return l; };
    /** FCW-32: the planned layout's rules sealed (their pack's digest the reference the layout requires) before it is staged. */
    const sealed = async (l: ForgeLayout): Promise<ForgeLayout> => {
      try { return await sealForgeRules(l); } catch (e) { throw new ForgeAgentError('INVALID_RULES', e instanceof Error ? e.message : String(e)); }
    };
    if ((FORGE_PLAY_OPERATIONS as readonly string[]).includes(operation)) {
      if (!['scenario.status', 'scenario.cancel', 'input.release', 'action.cancel'].includes(operation) && (!editor.inMatch() || editor.matchOfLobby() || editor.mode() !== 'forge-play')) throw new ForgeAgentError('PLAY_NOT_READY', 'Start a private offline Forge Play match first');
      return immediate(() => {
        const result = editor.play.execute(operation, args, signal);
        if (!result.ok) throw new ForgeAgentError(result.code ?? 'REFUSED', result.message ?? 'Normal input was refused');
        if (operation !== 'scenario.status') revisions.changed();
        return result.data;
      });
    }
    if (operation === 'layout.read') return noop(agentSnapshot());
    if (operation === 'layout.export') {
      // FCW-32: a layout with rules exports its authoring envelope (the record and its rules), which layout.import reads.
      const l = current(), record = recordOfLayout(l, editor.layoutName() || 'Layout');
      return noop(l.rules ? { schema: FORGE_AUTHORING_SCHEMA, version: FORGE_AUTHORING_VERSION, record, rules: l.rules } : record);
    }
    // FCW-32 (a browser adaptation, the Forge's own authoring): discover, read, check, export and import the layout's rules.
    if (operation === 'rules.read') {
      const l = current();
      switch (args['section'] ?? 'spec') {
        case 'vocabulary': return noop({ vocabulary: RULES_VOCABULARY_VERSION, events: RULE_EVENT_SPECS, conditions: RULE_CONDITIONS, actions: RULE_ACTION_SPECS,
          scopes: RULE_SCOPES, valueTypes: RULE_VALUE_TYPES, compareOps: RULE_COMPARE_OPS, slots: BEHAVIOUR_SLOTS.map(({ id, kind, exclusive }) => ({ id, kind, exclusive })),
          capabilities: BEHAVIOUR_CAPABILITIES });
        case 'modes': return noop(forgeModeList(l, installed()));
        case 'entities': {
          const sources = spawnerSources(l);
          return noop({ zones: l.zones ?? [], markers: l.markers ?? [], spawners: (l.spawners ?? []).map((sp) => ({ ...sp, source: sources.get(sp.id) })),
            refs: [...(l.zones ?? []).map((z) => `zone:${z.id}`), ...(l.markers ?? []).map((m) => `marker:${m.id}`), ...(l.spawners ?? []).map((sp) => `spawner:${sp.id}`)] });
        }
        default: return noop({ rules: l.rules ?? null, mode: l.mode ?? null });
      }
    }
    if (operation === 'rules.check') { const l = current(); return noop({ report: checkForgeRules(l, installed()), record: checkForgeRecord(l, installed()) }); }
    if (operation === 'rules.export') {
      const rules = current().rules;
      if (!rules) throw new ForgeAgentError('NO_RULES', 'The layout has no rules to export');
      try {
        // F1 (round 2): an imported pack still unedited is given back as it came, its own reference; else the Forge's own
        const pack = await exportRulesPack(rules);
        guard();
        return noop({ ref: pack.ref, files: pack.files });
      } catch (e) { if (e instanceof RulesPackError) throw new ForgeAgentError('INVALID_RULES', e.message); throw e; }
    }
    if (operation === 'rules.import') {
      let draft: Awaited<ReturnType<typeof importRulesPack>>;
      try { draft = await importRulesPack(args['files'] as RulesPackFile[]); } catch (e) { throw new ForgeAgentError('INVALID_RULES', e instanceof Error ? e.message : String(e)); }
      guard();
      // F1 (round 2): adopted with its own reference and digest (`sealed` keeps an unedited imported pack as it is)
      return agentStage(await sealed(adoptForgeRules(current(), draft, installed())), guard, editor.selectionIds(), step);
    }
    if (operation === 'rules.test') {
      // F2 (round 2; RULES_TEST_ADAPTATION): the layout's rules mode on the room's rule host over a scripted run, the
      // base map's doors and switches as Play's room names them (the blank floor has none); nothing is applied.
      const l = current(), b = editor.base(), map = editor.baseMap();
      const names = ruleNamesOf(b, map);
      const badScript = checkRulesScript(args as RulesTestScript);
      if (badScript) throw new ForgeAgentError('INVALID_ARGUMENT', badScript);                       // re-look F7: the caller's mistake
      let out: ReturnType<typeof runRulesTest>;
      try { out = runRulesTest(l, names, args as RulesTestScript, installed()); } catch (e) { throw new ForgeAgentError('INVALID_RULES', e instanceof Error ? e.message : String(e)); }
      if (!out) throw new ForgeAgentError('NO_RULES', 'The layout plays no rules mode: make its rules first (rules.new), or choose an installed rules mode');
      return noop(out);
    }
    if (operation === 'catalogue.read') return noop(agentSnapshot().catalogue);
    if (operation === 'starters.list') return noop(STARTERS);
    if (operation === 'starters.preview' || operation === 'starters.apply') {
      const { id, ...choices } = args;
      const preview = await previewStarter(id as StarterId, { ...await editor.starterContext(guard), ...choices });
      guard();
      if (operation === 'starters.preview') {
        if (new TextEncoder().encode(JSON.stringify(preview)).length > 48_000) throw new ForgeAgentError('OUTPUT_TOO_LARGE', 'Starter preview exceeds the bounded reply.');
        return noop(preview);
      }
      if (!preview.record || preview.diagnostics.length) throw new ForgeAgentError('REQUIREMENTS_UNMET', preview.diagnostics.map((d) => d.message).join('; ').slice(0, 2048));
      return agentStage(importedLayout(preview.record), guard, [], step);
    }
    if (operation === 'assets.query') {
      const { cursor, ...query } = args;
      return immediate(() => editor.queryAssets(query as CreatorAssetQuery, cursor as string | undefined));
    }
    if (operation === 'placement.check') return immediate(() => editor.checkPlacement(args['ref'] as string,
      { at: args['at'] as Vec3, ...(args['yaw'] === undefined ? {} : { yaw: args['yaw'] as number }) }));
    if (operation === 'issues.read') return noop({ issues: revisions.issues?.issues ?? [], notes: revisions.issues?.notes ?? [] });
    if (operation === 'saves.list') return noop(editor.named().map(({ id, name, savedAt, record }) => ({ id, name, savedAt, record })));
    if (operation === 'undo' || operation === 'redo') {
      const raw = operation === 'undo' ? editor.history.peekUndo() : editor.history.peekRedo();
      if (raw === null) throw new ForgeAgentError('NO_HISTORY', `Nothing to ${operation}`);
      const step = decodeHistoryStep(raw);
      const prepared = await editor.prepareLayout(parseForgeLayout(step.text));
      return { dispose: prepared.dispose, commit: () => {
        guard(); prepared.commit();
        if (operation === 'undo') editor.history.undo(); else editor.history.redo();
        editor.applyPicked(step.picked); editor.changed(); editor.refreshUndo(); revisions.issues = null; revisions.changed();
      } };
    }
    if (operation === 'saves.load') {
      const saved = editor.named().find((s) => s.id === args['id']);
      if (!saved) throw new ForgeAgentError('NOT_FOUND', 'No saved layout with that ID');
      return agentStage(layoutOfAuthoring(saved), guard, [], step);
    }
    if (FORGE_LAYOUT_OPERATIONS.has(operation)) {
      const l = current();
      // Do not confuse an arbitrary string that fits a key's grammar with a real base placement.
      if (operation === 'piece.hide' && editor.baseMap()) {
        const known = new Set(agentBasePlacements().map((p) => p.key));
        if ((args['keys'] as string[]).some((key) => !known.has(key))) throw new ForgeAgentError('INVALID_REFERENCE', 'Unknown base placement key');
      }
      if (operation === 'npc.place' && !editor.charMap()?.types?.[args['side'] as Side]?.[args['type'] as number]) throw new ForgeAgentError('ABSENT_ASSET', 'That character is not available on this base');
      const next = await sealed(planForgeLayout(l, operation, args, editor.selectionIds(), [editor.gridStep() * 2, 0, 0], installed()));
      let picked = editor.selectionIds();
      if (operation === 'piece.place') picked = [`piece:${next.pieces.length - 1}`];
      else if (operation === 'spawn.place') picked = [`spawn:${next.spawns.length - 1}`];
      else if (operation === 'npc.place') picked = [`npc:${(next.npcs?.length ?? 1) - 1}`];
      else if (operation === 'door.place') picked = [`door:${(next.doors?.length ?? 1) - 1}`];
      else if (operation === 'gate.place') picked = [`gate:${(next.gates?.length ?? 1) - 1}`];
      else if (operation === 'barrier.place') picked = [`barrier:${(next.barriers?.length ?? 1) - 1}`];
      else if (operation === 'turret.place') picked = [`turret:${(next.turrets?.length ?? 1) - 1}`];
      else if (operation === 'point.place') picked = [`point:${(next.tacPoints?.length ?? 1) - 1}`];
      else if (operation === 'view.place') picked = [`view:${(next.scenicViews?.length ?? 1) - 1}`];
      else if (operation === 'extraction.place') picked = [`zone:${(next.extractionZones?.length ?? 1) - 1}`];
      else if (operation === 'hostage.place') picked = [`hostage:${(next.hostages?.length ?? 1) - 1}`];
      else if (operation === 'bomb.place') picked = [`bomb:${args['kind'] as string}:0`];
      else if (operation === 'piece.delete' || operation === 'layout.new' || operation === 'layout.import') picked = [];
      else if (operation === 'piece.lock') picked = picked.filter((ref) => !(args['refs'] as string[]).includes(ref));
      else if (operation === 'selection.duplicate') picked = [
        ...next.pieces.slice(l.pieces.length).map((_, i) => `piece:${l.pieces.length + i}`),
        ...next.spawns.slice(l.spawns.length).map((_, i) => `spawn:${l.spawns.length + i}`),
        ...(next.npcs ?? []).slice(l.npcs?.length ?? 0).map((_, i) => `npc:${(l.npcs?.length ?? 0) + i}`),
      ];
      return agentStage(next, guard, picked, step);
    }
    if (operation === 'selection.set') {
      const ids = args['refs'] as string[]; ids.forEach((id) => agentRef(id));
      return immediate(() => { editor.applyPicked(ids); revisions.changed(); });
    }
    if (operation === 'selection.copy') {
      const picks = editor.picks();
      if (!picks.length) throw new ForgeAgentError('EMPTY_SELECTION', 'Select placements first');
      if (picks.some((r) => !!editor.bombKindOf(r))) throw new ForgeAgentError('UNSUPPORTED', 'Bomb markers cannot be copied');
      return immediate(() => { editor.copySelection(); revisions.changed(); return { copied: editor.clipboard().length }; });
    }
    if (operation === 'selection.paste') {
      const clipboard = editor.clipboard();
      if (!clipboard.length) throw new ForgeAgentError('EMPTY_CLIPBOARD', 'Copy placements first');
      const l = current();
      const positions = pastedPlaces(clipboard.map((c) => c.offset), args['at'] as Vec3);
      const picked: string[] = [];
      clipboard.forEach((c, i) => {
        const p = positions[i]!;
        if (c.team) { picked.push(`spawn:${l.spawns.length}`); l.spawns.push({ team: c.team, p: [p[0], p[1], p[2]], yaw: yawOf(c.q) }); }
        else if (c.npc) { picked.push(`npc:${l.npcs?.length ?? 0}`); (l.npcs ??= []).push({ ...c.npc, p: [p[0], p[1], p[2]], yaw: yawOf(c.q) }); }
        else if (c.asset) {
          const r = new Object3D(); r.position.set(...p); r.quaternion.set(...c.q); r.updateMatrix();
          picked.push(`piece:${l.pieces.length}`); l.pieces.push({ asset: c.asset, m: r.matrix.toArray(), ...(c.content ? { content: JSON.parse(JSON.stringify(c.content)) as Piece['content'] } : {}) });
        }
      });
      return agentStage(importedLayout(JSON.parse(serializeLayout(l))), guard, picked, step);
    }
    if (operation === 'checkMap') {
      const found = await editor.collectCheck();
      if (!found) throw new ForgeAgentError('NO_GROUND', 'This base has no hull to check');
      return immediate(() => { revisions.issues = found; return found; });
    }
    if (operation === 'palette.set') {
      const stem = args['archive'] as string;
      if (!editor.entries().some((e) => e.stem === stem)) throw new ForgeAgentError('ABSENT_ASSET', 'Unknown archive');
      const map = await editor.loadArchive(stem);
      return immediate(() => { editor.setPalette(stem, map); agentViewChanged(); });
    }
    if (operation === 'camera.objective') {
      const archive = args['archive'] as string | undefined;
      const map = archive ? await editor.loadArchive(archive) : editor.baseMap();
      if (!map) throw new ForgeAgentError('NO_MAP', 'Open a map base or supply an archive');
      const query = (args['name'] as string).toLowerCase().trim();
      const points = [
        ...(map.bombStart ? [{ name: 'bomb start', at: map.bombStart }] : []),
        ...(map.actions ?? []).filter((a) => a.type === 'MPBOMB').map((a) => ({ name: a.node, at: a.at })),
      ];
      const exact = points.filter((p) => p.name.toLowerCase() === query);
      const matches = exact.length ? exact : points.filter((p) => p.name.toLowerCase().includes(query));
      if (matches.length !== 1) throw new ForgeAgentError(matches.length ? 'AMBIGUOUS_OBJECTIVE' : 'NOT_FOUND', `Choose one of: ${points.map((p) => p.name).join(', ')}`);
      const point = matches[0]!;
      const base = editor.base();
      if (archive && (base?.kind !== 'map' || base.archive !== archive)) {
        const l = { ...current(), base: { kind: 'map' as const, archive } };
        const prepared = await agentStage(l, guard, [], step);
        return { dispose: prepared.dispose, commit: () => { const data = prepared.commit(); editor.lookAtPoint(point.at); editor.saveCamera(); agentViewChanged(); return data; } };
      }
      return immediate(() => { editor.lookAtPoint(point.at); editor.saveCamera(); agentViewChanged(); return { objective: point.name, at: point.at }; });
    }
    if (operation === 'palette.choose' || operation === 'palette.favourite') {
      const asset = args['asset'] as string;
      if (!editor.palette().some((e) => e.asset === asset) && !editor.favourites().has(asset)) throw new ForgeAgentError('ABSENT_ASSET', 'Choose an asset present in the palette or favourites');
    }
    if (operation.startsWith('saves.')) {
      const named = editor.named();
      if ((operation === 'saves.rename' || operation === 'saves.delete') && !named.some((s) => s.id === args['id'])) throw new ForgeAgentError('NOT_FOUND', 'No save with that ID');
      const name = args['name'] as string;
      const result = operation === 'saves.save' ? saveNamedRules(named, name, recordOfLayout(current(), name), current().rules)
        : operation === 'saves.rename' ? renameNamed(named, args['id'] as string, name)
          : { error: null, saves: deleteNamed(named, args['id'] as string) };
      if (result.error) throw new ForgeAgentError('SAVE_REFUSED', result.error);
      const at = editor.namedAt();                              // the copy `result` was built from
      return immediate(async () => {
        const out = await editor.persistNamed(result.saves, at);
        if (out !== 'written') throw new ForgeAgentError('SAVE_REFUSED', out === 'conflict' ? editor.savedElsewhereWords : 'Browser storage refused the save');
        revisions.changed();
        return editor.named().map(({ id, name }) => ({ id, name }));
      });
    }
    if (operation === 'play.start') {
      const packs = editor.missingPacks();
      if (packs.length) throw new ForgeAgentError('REQUIREMENTS_UNMET', editor.missingPacksWords('Play', packs));
      const found = await editor.collectCheck();
      if (!found) throw new ForgeAgentError('NO_GROUND', 'This base has no hull to play');
      if (found.issues.length && args['allowIssues'] !== true) throw new ForgeAgentError('MAP_ISSUES', JSON.stringify(found));
      return immediate(async () => {
        agentOwnBusy = true;
        try { await editor.startMatch(guard); if (!editor.inMatch()) throw new ForgeAgentError('PLAY_REFUSED', editor.statusText() || 'The match could not start'); revisions.changed(); }
        finally { agentOwnBusy = false; }
      });
    }
    if (operation === 'walk.start') return immediate(async () => {
      agentOwnBusy = true;
      try { await editor.startPlay(guard); if (!editor.playing()) throw new ForgeAgentError('PLAY_REFUSED', editor.statusText() || 'Walk could not start'); revisions.changed(); }
      finally { agentOwnBusy = false; }
    });
    return immediate(() => {
      switch (operation) {
        case 'view.set': editor.setView(args['toggle'] as string, args['on'] as boolean); break;
        case 'camera.pose': editor.setCameraPose(parseCamera(args)); editor.saveCamera(); break;
        case 'camera.look': editor.lookFrom(args['from'] as Vec3, args['to'] as Vec3); editor.saveCamera(); break;
        case 'camera.focus': editor.focusOn(agentRef(args['ref'] as string, true)); editor.saveCamera(); break;
        case 'palette.search': editor.setQuery(args['query'] as string); break;
        case 'palette.filter': editor.setPaletteFilter(args['filter'] === 'characters', args['filter'] === 'favs' ? 'favs' : 'all'); break;
        case 'palette.choose': editor.choose(args['asset'] as string); break;
        case 'palette.favourite': editor.setFavourite(args['asset'] as string, !!args['on']); break;
        case 'snap.set': {
          const grid = boundStep((args['grid'] as number | undefined) ?? editor.gridStep(), GRID_STEP_MIN, GRID_STEP_MAX, editor.gridStep());
          const turn = boundStep((args['rotation'] as number | undefined) ?? editor.turnStep(), TURN_STEP_MIN, TURN_STEP_MAX, editor.turnStep());
          editor.setSnap(grid, turn, args['on'] as boolean); break;
        }
        case 'tool.set': editor.setTool(args['tool'] as ForgeAgentView['tool'], (args['gizmo'] || undefined) as 'translate' | 'rotate' | undefined); break;
        case 'walk.stop': editor.stopPlay(); break;
        case 'play.stop': if (editor.matchOfLobby()) throw new ForgeAgentError('BLOCKED', 'A server match cannot be controlled'); editor.endMatch(); break;
        default: throw new ForgeAgentError('UNKNOWN_OPERATION', operation);
      }
      if (AGENT_VIEW_OPERATIONS.has(operation)) agentViewChanged(); else revisions.changed();
    });
  };
  return { snapshot: agentSnapshot, status: agentStatus, prepare: agentPrepare, operations: editor.operations, cancel: (reason) => editor.play.cancel(reason),
    shotDriver: editor.shotDriver, mapBounds: editor.mapBounds,                // R5-B: the agent's camera shot
    refreshExternalState: () => { revisions.changed(); editor.rereadLists(); },
    subscribe: (listener) => revisions.subscribe(listener),
    layoutRevision: agentLayoutRevision, ready: agentReady };
}
