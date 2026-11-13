import { ForgeAgentError } from '../agent/api';
import { amendEdit, HISTORY_EDIT_LABEL, HUMAN_ACTOR, recordEdit, type History, type HistoryActor, type HistoryDomain, type HistoryMeta } from '../history';

/**
 * FUI-6 (the review's principle 5, AI-1; a browser adaptation, FG.R2): the Forge's one command layer for people and
 * agents. An operation is registered once -- its id, its history domain, whether it changes the layout, its words -- and
 * every caller runs that one entry: the agent's facade (`../agent/api`, a layout edit's `prepare`) and the page's own
 * toolbar, pad, menu and dock handlers (`perform`). The registry owns what they share: the admission (the host's refusal
 * of a person's edit, the lobby's hold today), the revision guard, and ONE history step per operation that names its
 * actor (a person, or an agent and its session) and its domain (`../history` `HistoryMeta`).
 *
 * What an edit does is unchanged, and is the entry's `run`: an agent's JSON arguments are planned and staged as before
 * (`../agent/commands` `planForgeLayout`, `../agent/editorFacade`'s `agentStage`); a person's handler hands its own scene edit as
 * `perform` (a drag that already moved, a click that places), which the entry runs at once, as the handler did before.
 * Nothing here changes what the game does.
 */

/** A person at this page. */
export const HUMAN: HistoryActor = HUMAN_ACTOR;
/** A paired agent; its session's ID when the connection names one. */
export const agentActor = (sessionId?: string | null): HistoryActor => ({ kind: 'agent', sessionId: sessionId ?? null });

/** The step an operation writes: its meta, and whether its first edit has recorded it yet (a later edit amends it). */
export interface OperationStep extends HistoryMeta {
  recorded: boolean;
}

export interface OperationContext {
  readonly actor: HistoryActor;
  /** The operation's one history step (`recordOperationStep`). */
  readonly step: OperationStep;
  /** The revision guard (and the agent facade's own, when it called): call it before every commit after an `await`. */
  guard(): void;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  /** A person's handler's own scene edit (`OperationRegistry.perform`); absent on the agent's path. */
  readonly perform?: (ctx: OperationContext) => unknown;
}

/** What a run stages: the commit, and the clean-up the caller always calls (as `../agent/api` `ForgeAgentPrepared`). */
export interface OperationPrepared {
  commit(): unknown | Promise<unknown>;
  dispose(): void;
}

export interface OperationSpec<A extends Record<string, unknown> = Record<string, unknown>> {
  /** The operation's name: the agent's (`../agent/api` `FORGE_AGENT_OPERATIONS`) for a layout edit. */
  id: string;
  domain: HistoryDomain;
  /** It changes what the history holds: the revision guard binds it. */
  mutates: boolean;
  /** The step's words (`Place spawn A`), from the arguments when a function. */
  label: string | ((args: A) => string);
  run(args: A, ctx: OperationContext): OperationPrepared | Promise<OperationPrepared>;
}

export interface OperationRequest {
  actor: HistoryActor;
  /** The layout revision the caller read; a mutating operation refuses another (`STALE_REVISION`). */
  expectedRevision?: number;
  requestId?: string;
  signal?: AbortSignal;
  /** The caller's own guard (the agent facade's: disposal, cancellation, Play, readiness), run before the registry's. */
  guard?(): void;
}

export interface PerformRequest {
  /** A person, unless said. */
  actor?: HistoryActor;
  requestId?: string;
  /**
   * The handler admitted the edit itself before the scene changed (a gizmo drag or a pad grab let go, a slider's input):
   * the entry records the step and asks the host no refusal, as the handler did before.
   */
  admitted?: boolean;
  /** The handler's scene edit, run at once; an asynchronous one records with `ctx.step` (the active step is gone by then). */
  perform(ctx: OperationContext): unknown;
}

export interface OperationResult { ok: boolean; code?: string; message?: string; revision: number; data?: unknown }
export interface OperationRefusal { code: string; message: string }

export interface OperationRegistryOptions {
  /** The layout revision now (the page's `agentLayoutRevision`). */
  revision(): number;
  /** The host's refusal of `actor`'s operation now, or null (the page: a person's edit while a lobby holds the layout). */
  refusal?(spec: OperationSpec, actor: HistoryActor): OperationRefusal | null;
  /** A refusal said (the page's notifier). */
  onRefused?(refusal: OperationRefusal, actor: HistoryActor, spec: OperationSpec): void;
}

export interface OperationRegistry {
  /** Register an entry; the function unregisters it. An id is registered once. */
  register<A extends Record<string, unknown>>(spec: OperationSpec<A>): () => void;
  get(id: string): OperationSpec | undefined;
  ids(): string[];
  /** The step of the operation whose commit is running now (synchronously), or null: an edit outside one names none. */
  active(): OperationStep | null;
  /** The agent's path: admitted, guarded and staged; the caller guards and commits (one step), then disposes. */
  prepare(id: string, args: Record<string, unknown>, request: OperationRequest): Promise<OperationPrepared>;
  /** `prepare`, the guard again, the commit and the disposal, as one result (a panel's or a test's call). */
  execute(id: string, args: Record<string, unknown>, request: OperationRequest): Promise<OperationResult>;
  /** A person's handler: the entry's admission and step, its scene edit performed at once. False when refused (and said). */
  perform(id: string, args: Record<string, unknown>, request: PerformRequest): boolean;
}

const labelOf = (spec: OperationSpec, args: Record<string, unknown>): string => {
  const words = typeof spec.label === 'function' ? spec.label(args) : spec.label;
  return words || HISTORY_EDIT_LABEL;
};
const isThenable = (v: unknown): v is PromiseLike<unknown> => !!v && typeof (v as { then?: unknown }).then === 'function';

export function createOperationRegistry(options: OperationRegistryOptions): OperationRegistry {
  const specs = new Map<string, OperationSpec>();
  let active: OperationStep | null = null;
  const stepOf = (spec: OperationSpec, args: Record<string, unknown>, actor: HistoryActor, requestId?: string): OperationStep =>
    ({ label: labelOf(spec, args), actor, domain: spec.domain, ...(requestId ? { requestId } : {}), recorded: false });
  /** Run `fn` with `step` as the active one; an asynchronous continuation of it runs with none. */
  const during = <T>(step: OperationStep, fn: () => T): T => {
    const was = active;
    active = step;
    try { return fn(); } finally { active = was; }
  };
  const specOf = (id: string): OperationSpec => {
    const spec = specs.get(id);
    if (!spec) throw new ForgeAgentError('UNKNOWN_OPERATION', `No such Forge operation: ${id}`);
    return spec;
  };
  const admit = (spec: OperationSpec, actor: HistoryActor): void => {
    const refusal = options.refusal?.(spec, actor) ?? null;
    if (!refusal) return;
    options.onRefused?.(refusal, actor, spec);
    throw new ForgeAgentError(refusal.code, refusal.message);
  };
  const guardOf = (spec: OperationSpec, request: OperationRequest) => (): void => {
    request.guard?.();
    if (spec.mutates && request.expectedRevision !== undefined && request.expectedRevision !== options.revision()) {
      throw new ForgeAgentError('STALE_REVISION', 'Read the editor again before writing');
    }
  };
  const staged = async (id: string, args: Record<string, unknown>, request: OperationRequest): Promise<{ prepared: OperationPrepared; guard: () => void }> => {
    const spec = specOf(id);
    admit(spec, request.actor);
    const guard = guardOf(spec, request);
    guard();
    const step = stepOf(spec, args, request.actor, request.requestId);
    const ctx: OperationContext = { actor: request.actor, step, guard, ...(request.signal ? { signal: request.signal } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {}) };
    const prepared = await spec.run(args, ctx);
    return { guard, prepared: { dispose: () => prepared.dispose(), commit: () => during(step, () => prepared.commit()) } };
  };
  return {
    register(spec) {
      if (specs.has(spec.id)) throw new Error(`The Forge operation ${spec.id} is already registered`);
      const entry = spec as unknown as OperationSpec;
      specs.set(spec.id, entry);
      return () => { if (specs.get(spec.id) === entry) specs.delete(spec.id); };
    },
    get: (id) => specs.get(id),
    ids: () => [...specs.keys()],
    active: () => active,
    prepare: async (id, args, request) => (await staged(id, args, request)).prepared,
    async execute(id, args, request) {
      let prepared: OperationPrepared | undefined;
      try {
        const out = await staged(id, args, request);
        prepared = out.prepared;
        out.guard();
        const data = await prepared.commit();
        return { ok: true, revision: options.revision(), ...(data === undefined ? {} : { data }) };
      } catch (e) {
        return { ok: false, code: e instanceof ForgeAgentError ? e.code : 'REFUSED', message: e instanceof Error ? e.message : String(e), revision: options.revision() };
      } finally { prepared?.dispose(); }
    },
    perform(id, args, request) {
      const spec = specs.get(id);
      if (!spec) throw new Error(`The Forge has no operation ${id} registered`);
      const actor = request.actor ?? HUMAN;
      if (!request.admitted) {
        const refusal = options.refusal?.(spec, actor) ?? null;
        if (refusal) { options.onRefused?.(refusal, actor, spec); return false; }
      }
      const step = stepOf(spec, args, actor, request.requestId);
      const ctx: OperationContext = { actor, step, guard: () => undefined, perform: request.perform, ...(request.requestId ? { requestId: request.requestId } : {}) };
      const prepared = spec.run(args, ctx);
      if (isThenable(prepared)) throw new Error(`The Forge operation ${id} stages asynchronously: a handler performs it at once`);
      try { during(step, () => prepared.commit()); } finally { prepared.dispose(); }
      return true;
    },
  };
}

/** An entry's run that performs a person's scene edit when given one, and stages the agent's arguments otherwise. */
export function performedOr(stage: OperationSpec['run']): OperationSpec['run'] {
  return (args, ctx) => (ctx.perform ? { commit: () => ctx.perform!(ctx), dispose: () => undefined } : stage(args, ctx));
}

/**
 * An edit of an operation into the history: its first edit records the operation's step (with its meta), a later one
 * amends that step (`../history` `amendEdit`), so one undo takes the whole operation back. An edit that changed nothing
 * records nothing, as before.
 */
export function recordOperationStep(history: History<string>, step: OperationStep, text: string, before: readonly string[], after: readonly string[]): void {
  if (step.recorded) { amendEdit(history, text, after); return; }
  const { label, actor, domain, requestId } = step;
  step.recorded = recordEdit(history, text, before, after, { label, actor, domain, ...(requestId ? { requestId } : {}) });
}

/** One of the Forge's layout edits as the registry names it: the agent's operation id, its domain, its words. */
export interface ForgeEditOperation {
  id: string;
  domain: HistoryDomain;
  label(args: Record<string, unknown>): string;
}
const countOf = (args: Record<string, unknown>, key: string): number => (Array.isArray(args[key]) ? (args[key] as unknown[]).length : 0);
/** `Delete`, `Delete 2`: a count past one. */
const counted = (word: string, key = 'refs') => (args: Record<string, unknown>): string => { const n = countOf(args, key); return n > 1 ? `${word} ${n}` : word; };
const fixed = (word: string) => (): string => word;
const BOMB_WORDS: Record<string, string> = { start: 'Place the bomb start', seal: 'Place the SEAL site', terrorist: 'Place the Terrorist site' };

/**
 * The layout edits, one row each (a browser adaptation's own words, no original): every operation the agent's layout
 * planner takes (`../agent/commands` `FORGE_LAYOUT_OPERATIONS`), and the agent's other staged edits (a paste, a starter,
 * a named save loaded, an objective on another map). The page registers each once; `../agent/api` lists them all.
 */
export const FORGE_EDIT_OPERATIONS: readonly ForgeEditOperation[] = [
  { id: 'layout.import', domain: 'layout', label: fixed('Import layout') },
  { id: 'layout.new', domain: 'layout', label: fixed('New layout') },
  { id: 'layout.base', domain: 'layout', label: fixed('Change base') },
  { id: 'layout.name', domain: 'layout', label: fixed('Rename layout') },
  { id: 'layout.batch', domain: 'layout', label: (args) => { const n = countOf(args, 'edits'); return `Batch of ${n} edit${n === 1 ? '' : 's'}`; } },
  { id: 'piece.place', domain: 'layout', label: fixed('Place piece') },
  { id: 'piece.move', domain: 'layout', label: counted('Move') },
  { id: 'piece.rotate', domain: 'layout', label: counted('Rotate') },
  { id: 'piece.delete', domain: 'layout', label: counted('Delete') },
  { id: 'piece.lock', domain: 'layout', label: counted('Lock') },
  { id: 'piece.unlock', domain: 'layout', label: counted('Unlock') },
  { id: 'piece.hide', domain: 'layout', label: (args) => { const n = countOf(args, 'keys'); return n > 1 ? `Hide ${n} map props` : 'Hide map prop'; } },
  { id: 'piece.restore', domain: 'layout', label: (args) => { const n = countOf(args, 'keys'); return n > 1 ? `Show ${n} map props` : 'Show map prop'; } },
  { id: 'selection.move', domain: 'layout', label: fixed('Move') },
  { id: 'selection.rotate', domain: 'layout', label: fixed('Rotate') },
  { id: 'selection.duplicate', domain: 'layout', label: fixed('Duplicate') },
  { id: 'selection.paste', domain: 'layout', label: fixed('Paste') },
  { id: 'spawn.place', domain: 'layout', label: (args) => (args['team'] === 'A' || args['team'] === 'B' ? `Place spawn ${args['team']}` : 'Place spawn') },
  { id: 'npc.place', domain: 'layout', label: fixed('Place NPC') },
  { id: 'hostage.place', domain: 'layout', label: fixed('Place hostage') },
  { id: 'extraction.place', domain: 'layout', label: fixed('Place extraction zone') },
  { id: 'door.place', domain: 'layout', label: fixed('Place door') },   // a browser adaptation: `Layout.doors`
  { id: 'gate.place', domain: 'layout', label: fixed('Place gate') },   // a browser adaptation: `Layout.gates`
  { id: 'barrier.place', domain: 'layout', label: fixed('Place damage trigger') },
  { id: 'switch.place', domain: 'layout', label: fixed('Place switch') },   // a browser adaptation: `Layout.switches`   // a browser adaptation: `Layout.barriers`
  { id: 'turret.place', domain: 'layout', label: fixed('Place turret') },   // a browser adaptation: `Layout.turrets`
  { id: 'flare.place', domain: 'layout', label: fixed('Place flare') },   // a browser adaptation: `Layout.flares`
  { id: 'respawn.place', domain: 'layout', label: (args) => (args['team'] === 'A' || args['team'] === 'B' ? `Place respawn point ${args['team']}` : 'Place respawn point') },   // a browser adaptation: `Layout.respawns`
  { id: 'point.place', domain: 'layout', label: fixed('Place tactical point') },
  { id: 'object.place', domain: 'layout', label: fixed('Place object') },   // a browser adaptation: `Layout.objects`   // a browser adaptation: `Layout.tacPoints`
  { id: 'view.place', domain: 'layout', label: fixed('Place spectator view') },   // a browser adaptation: `Layout.scenicViews`
  { id: 'placement.set', domain: 'layout', label: (args) => `Set ${String(args['field'] ?? 'a field')}` },   // the Inspector's Data   // a browser adaptation: `Layout.extractionZones`   // a browser adaptation: `Layout.hostages`
  { id: 'bomb.place', domain: 'layout', label: (args) => BOMB_WORDS[String(args['kind'])] ?? 'Place a bomb marker' },
  { id: 'objectives.set', domain: 'layout', label: fixed('Set objectives') },
  { id: 'settings.set', domain: 'layout', label: fixed('Change settings') },
  { id: 'type.set', domain: 'layout', label: fixed('Set the game type') },
  { id: 'starters.apply', domain: 'layout', label: fixed('Apply starter') },
  { id: 'saves.load', domain: 'layout', label: fixed('Load save') },
  { id: 'camera.objective', domain: 'layout', label: (args) => (typeof args['archive'] === 'string' ? 'Change base' : 'Focus objective') },
  // FCW-32: the rules entities and the layout's rules pack, each one undoable step of the layout's history.
  { id: 'zone.place', domain: 'layout', label: fixed('Place zone') },
  { id: 'marker.place', domain: 'layout', label: fixed('Place marker') },
  { id: 'spawner.place', domain: 'layout', label: fixed('Place spawner') },
  { id: 'rules.new', domain: 'layout', label: fixed('New rules') },
  { id: 'rules.set', domain: 'layout', label: fixed('Set rules') },
  { id: 'rules.rule.set', domain: 'layout', label: (args) => (typeof (args['rule'] as { id?: unknown } | undefined)?.id === 'string' ? `Set rule ${(args['rule'] as { id: string }).id}` : 'Set rule') },
  { id: 'rules.rule.delete', domain: 'layout', label: fixed('Delete rule') },
  { id: 'rules.variable.set', domain: 'layout', label: fixed('Set variable') },
  { id: 'rules.variable.delete', domain: 'layout', label: fixed('Delete variable') },
  { id: 'rules.config.set', domain: 'layout', label: fixed('Set mode values') },
  { id: 'rules.clear', domain: 'layout', label: fixed('Remove rules') },
  { id: 'rules.import', domain: 'layout', label: fixed('Import rules') },
];

/** The words of a layout edit's step (`Edit` for an id the table does not hold). */
export function forgeEditLabel(id: string, args: Record<string, unknown>): string {
  return FORGE_EDIT_OPERATIONS.find((o) => o.id === id)?.label(args) ?? HISTORY_EDIT_LABEL;
}
