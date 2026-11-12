/**
 * FORGE (FG-15; a browser adaptation, no original): undo and redo over the layout's states. A state is a snapshot (the
 * page records the layout's text at the end of each edit: a placement, a gizmo drag, a field, a delete), so an undo is
 * the layout opened again in its earlier state -- one path for every kind of edit.
 */
export class History<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];

  constructor(private now: T, private readonly limit = 100) {}

  current(): T { return this.now; }
  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  /** Stage asynchronous restores without moving the history pointer until the real scene can commit. */
  peekUndo(): T | null { return this.past[this.past.length - 1] ?? null; }
  peekRedo(): T | null { return this.future[this.future.length - 1] ?? null; }

  /** A new state after an edit; the same state as now is not a step. The redo branch goes. */
  record(state: T): void {
    if (state === this.now) return;
    this.past.push(this.now);
    if (this.past.length > this.limit) this.past.shift();
    this.now = state;
    this.future.length = 0;
  }

  /** The state before, made current; null with none, or while `busy` (the pointer moves only with the scene). */
  undo(busy = false): T | null {
    if (busy) return null;
    const s = this.past.pop();
    if (s === undefined) return null;
    this.future.push(this.now);
    this.now = s;
    return s;
  }

  /** The state undone last, made current again; null with none, or while `busy`. */
  redo(busy = false): T | null {
    if (busy) return null;
    const s = this.future.pop();
    if (s === undefined) return null;
    this.past.push(this.now);
    this.now = s;
    return s;
  }

  /** Nothing to undo or redo: `state` is where the history starts (a layout opened, a new one). */
  reset(state: T): void {
    this.past.length = 0;
    this.future.length = 0;
    this.now = state;
  }

  /**
   * The current state replaced, with no step. An edit writes the selection from before it onto the step that is current,
   * then records the state after (`recordEdit`).
   */
  retarget(state: T): void { this.now = state; }

  /** AX-15: every state an undo can reach, oldest first, and the current one last (the redo branch not included). */
  states(): readonly T[] { return [...this.past, this.now]; }
}

/**
 * One undo step of the forge: the layout's text, and the placements selected when that state is shown again. A placement
 * is `piece:N`, `spawn:N` or `npc:N` — the nth of its kind in the layout, which a rebuild keeps (pieces, then spawns,
 * then NPCs). A row index does not: the list is rebuilt in that order, so a row that was last becomes a spawn. The
 * selection rides with the step (`decodeHistoryStep`); a step from before that, or a bare layout text, has none.
 */
export interface HistoryStep {
  text: string;
  picked: string[];
  /**
   * FUI-6 (the review's AI-1; a browser adaptation, FG.R2): what made this state -- the edit's words, who made it and in
   * which domain. Absent on a step saved before FUI-6 (and on a bare layout text): `historyMetaOf` reads that as a
   * person's layout edit.
   */
  label?: string;
  actor?: HistoryActor;
  domain?: HistoryDomain;
  /** The agent's request the step was made by (its receipt's ID), when it carried one. */
  requestId?: string;
}

/** FUI-6: who made a step -- a person at this page, or a paired agent (its session, when the connection names it). */
export type HistoryActor = { kind: 'human' } | { kind: 'agent'; sessionId: string | null };
/** FUI-6: the history a step belongs to: the layout's (every step today); the packs', missions' and campaigns' to come. */
export type HistoryDomain = 'layout' | 'packs' | 'mission' | 'campaign';
export const HISTORY_DOMAINS: readonly HistoryDomain[] = ['layout', 'packs', 'mission', 'campaign'];
/** FUI-6: the words, the actor and the domain of one step (`encodeHistoryStep`'s `meta`). */
export interface HistoryMeta {
  label: string;
  actor: HistoryActor;
  domain: HistoryDomain;
  requestId?: string;
}
export const HUMAN_ACTOR: HistoryActor = Object.freeze({ kind: 'human' as const });
/** The words of a step that names none (one saved before FUI-6, or an edit made outside the operation registry). */
export const HISTORY_EDIT_LABEL = 'Edit';
const LABEL_MAX = 80;
const ID_MAX = 160;

/** A step's meta with the defaults filled: a step from before FUI-6 is a person's layout edit. */
export function historyMetaOf(step: HistoryStep): HistoryMeta {
  return { label: step.label ?? HISTORY_EDIT_LABEL, actor: step.actor ?? HUMAN_ACTOR, domain: step.domain ?? 'layout',
    ...(step.requestId === undefined ? {} : { requestId: step.requestId }) };
}

/** `Place spawn A`, or `Place spawn A (agent)` for an agent's step: what Undo and Redo name. */
export function historyCaption(meta: HistoryMeta): string {
  return meta.actor.kind === 'agent' ? `${meta.label} (agent)` : meta.label;
}

const actorOf = (v: unknown): HistoryActor | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as { kind?: unknown; sessionId?: unknown };
  if (a.kind === 'human') return HUMAN_ACTOR;
  if (a.kind !== 'agent') return undefined;
  return { kind: 'agent', sessionId: typeof a.sessionId === 'string' && a.sessionId.length > 0 && a.sessionId.length <= ID_MAX ? a.sessionId : null };
};
/** The meta fields of a decoded object that are well formed; a malformed one is dropped, never the step. */
const metaFields = (v: { label?: unknown; actor?: unknown; domain?: unknown; requestId?: unknown }): Partial<HistoryMeta> => {
  const actor = actorOf(v.actor);
  return {
    ...(typeof v.label === 'string' && v.label.length > 0 ? { label: v.label.slice(0, LABEL_MAX) } : {}),
    ...(actor ? { actor } : {}),
    ...(typeof v.domain === 'string' && (HISTORY_DOMAINS as readonly string[]).includes(v.domain) ? { domain: v.domain as HistoryDomain } : {}),
    ...(typeof v.requestId === 'string' && v.requestId.length > 0 && v.requestId.length <= ID_MAX ? { requestId: v.requestId } : {}),
  };
};

/**
 * `piece:0`, `spawn:1`, `npc:2`, and FG-51's bomb markers `bomb:start:0`, `bomb:seal:1`, `bomb:terrorist:0` (the nth of
 * its kind, `page.ts` `placementIds`; a file may name two sites of a team): a placement's identity. A row index is not one.
 */
const PLACEMENT_ID = /^(?:(?:piece|spawn|npc)|bomb:(?:start|seal|terrorist)):\d+$/;

/** A step: the layout's text and its selection, and (FUI-6) the edit's meta when given; a step without one reads as before. */
export function encodeHistoryStep(text: string, picked: readonly string[], meta?: Partial<HistoryMeta>): string {
  return JSON.stringify({ text, picked: picked.filter((id) => PLACEMENT_ID.test(id)), ...(meta ? metaFields(meta) : {}) });
}

/**
 * A step encoded by `encodeHistoryStep`, or a bare layout text whose selection is empty. FUI-6: a step saved before the
 * meta (`{text, picked}` only) decodes as it did -- no label, actor or domain, which `historyMetaOf` reads as a person's
 * layout edit.
 */
export function decodeHistoryStep(raw: string): HistoryStep {
  try {
    const v = JSON.parse(raw) as { text?: unknown; picked?: unknown; forge?: unknown; label?: unknown; actor?: unknown; domain?: unknown; requestId?: unknown };
    if (v && v.forge === undefined && typeof v.text === 'string' && Array.isArray(v.picked)) {
      return { text: v.text, picked: v.picked.filter((id): id is string => typeof id === 'string' && PLACEMENT_ID.test(id)), ...metaFields(v) };
    }
  } catch { /* a layout's own text */ }
  return { text: raw, picked: [] };
}

/** Two selections as a step stores them (the placement identities only, in order). */
const sameIds = (a: readonly string[], b: readonly string[]): boolean => {
  const x = a.filter((id) => PLACEMENT_ID.test(id)), y = b.filter((id) => PLACEMENT_ID.test(id));
  return x.length === y.length && x.every((id, i) => id === y[i]);
};

/**
 * An edit. The step that is current restores `before` (the selection at the moment of the edit, which a click may have
 * changed since that step was recorded). The new step restores `after`. Undo lands on `before`; redo lands on `after`.
 * FUI-6: the new step carries `meta` (its words, actor and domain); true when a step was recorded.
 */
export function recordEdit(history: History<string>, text: string, before: readonly string[], after: readonly string[], meta?: Partial<HistoryMeta>): boolean {
  const cur = decodeHistoryStep(history.current());
  history.retarget(encodeHistoryStep(cur.text, before, metaFields(cur)));
  // FUI-6: the same state as now is no step, whatever its meta says (the meta is not the state), as before the meta.
  if (cur.text === text && sameIds(before, after)) return false;
  history.record(encodeHistoryStep(text, after, meta));
  return true;
}

/**
 * FUI-6: a further edit inside the operation whose step is current (`./shell/operations` `recordOperationStep`: one
 * history step per operation). The current step takes the state after, its meta kept; no step is added, so one undo goes
 * back past every edit of the operation.
 */
export function amendEdit(history: History<string>, text: string, after: readonly string[]): void {
  history.retarget(encodeHistoryStep(text, after, metaFields(decodeHistoryStep(history.current()))));
}

/** FUI-6: the meta of the step an undo takes back (the current one), or null with nothing to undo. */
export function undoMeta(history: History<string>): HistoryMeta | null {
  return history.canUndo() ? historyMetaOf(decodeHistoryStep(history.current())) : null;
}

/** FUI-6: the meta of the step a redo makes again, or null with nothing to redo. */
export function redoMeta(history: History<string>): HistoryMeta | null {
  const raw = history.peekRedo();
  return raw === null ? null : historyMetaOf(decodeHistoryStep(raw));
}

/**
 * AX-15 (a browser adaptation, FG.R2): the current step taken back while `match` holds for it, one undo per step -- each
 * undone step keeps its redo, the order of the history is never changed. `state` is the state now current (the scene to
 * restore), null when nothing was undone; `stoppedAt` the meta of the step that stopped it (null at the history's start).
 * While `busy` nothing moves: the pointer moves only with the scene (`History.undo`).
 */
export interface UndoWhileResult { undone: number; state: string | null; stoppedAt: HistoryMeta | null }
export function undoWhile(history: History<string>, match: (meta: HistoryMeta) => boolean, busy = false): UndoWhileResult {
  if (busy) return { undone: 0, state: null, stoppedAt: undoMeta(history) };
  let undone = 0;
  for (let meta = undoMeta(history); meta && match(meta); meta = undoMeta(history)) {
    if (history.undo() === null) break;
    undone++;
  }
  return { undone, state: undone ? history.current() : null, stoppedAt: undoMeta(history) };
}

/** AX-15: a step made by an agent -- the session given, or any agent's when none is. */
export function isAgentStep(meta: HistoryMeta, sessionId?: string | null): boolean {
  return meta.actor.kind === 'agent' && (sessionId === undefined || sessionId === null || meta.actor.sessionId === sessionId);
}

/** AX-15: how many of the history's steps (the current one included) are the agent's -- that session's, or any agent's. */
export function agentStepCount(history: History<string>, sessionId?: string | null): number {
  return history.states().slice(1).filter((raw) => isAgentStep(historyMetaOf(decodeHistoryStep(raw)), sessionId)).length;
}

/** AX-15: why an agent run's undo stopped: a person's step, another agent session's, the history's start, or a busy page. */
export type AgentRunStop = 'person' | 'other-agent' | 'start' | 'busy';
export interface AgentRunUndo { undone: number; stopped: AgentRunStop; state: string | null; message: string }

const changes = (n: number): string => (n === 0 ? 'no agent changes' : `${n} agent change${n === 1 ? '' : 's'}`);

/**
 * AX-15: "Undo the agent's changes" -- the agent's steps on top of the history undone (that session's, or any agent's
 * when none is given), stopping at the first step that is not the agent's, which is never undone. The words say how
 * many and why it stopped ("Stopped at your own edit: 3 agent changes undone").
 */
export function undoAgentRun(history: History<string>, sessionId?: string | null, busy = false): AgentRunUndo {
  if (busy) return { undone: 0, stopped: 'busy', state: null, message: 'The Forge is busy: no agent changes undone' };
  const out = undoWhile(history, (meta) => isAgentStep(meta, sessionId));
  const at = out.stoppedAt;
  const stopped: AgentRunStop = at === null ? 'start' : at.actor.kind === 'human' ? 'person' : 'other-agent';
  const message = stopped === 'start'
    ? (out.undone ? `Nothing older to undo: ${changes(out.undone)} undone` : 'No agent changes to undo')
    : `Stopped at ${stopped === 'person' ? 'your own edit' : 'another agent’s edit'}: ${changes(out.undone)} undone`;
  return { undone: out.undone, stopped, state: out.state, message };
}

/**
 * AX-15: a layout array and the prefix of its placements' identities, as the page's `placementIds` names them (the nth
 * of its kind). FG-51's bomb markers (`bomb:<kind>:N`, under `objectives.bomb`) are not diffed here.
 */
const PLACEMENT_KINDS: readonly (readonly [string, string])[] = [
  ['pieces', 'piece'], ['spawns', 'spawn'], ['respawns', 'respawn'], ['flares', 'flare'], ['npcs', 'npc'], ['hostages', 'hostage'],
  ['extractionZones', 'xzone'], ['turrets', 'turret'], ['doors', 'door'], ['gates', 'gate'], ['barriers', 'barrier'],
  ['tacPoints', 'point'], ['scenicViews', 'view'],
];
/** Each kind's rows as their identity (the row's own text), in order; an unreadable text has none. */
const rowsOf = (text: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  let l: Record<string, unknown> | null = null;
  try { const v = JSON.parse(text) as unknown; l = v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { /* no layout */ }
  for (const [key, kind] of PLACEMENT_KINDS) {
    const rows = l?.[key];
    out.set(kind, Array.isArray(rows) ? rows.map((r) => JSON.stringify(r)) : []);
  }
  return out;
};
/** The rows of `after` not in `before`, as a multiset by identity (a row placed, or a row moved: its new text). */
const added = (before: readonly string[], after: readonly string[]): Map<string, number> => {
  const left = new Map<string, number>();
  for (const r of before) left.set(r, (left.get(r) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const r of after) {
    const n = left.get(r) ?? 0;
    if (n > 0) left.set(r, n - 1); else out.set(r, (out.get(r) ?? 0) + 1);
  }
  return out;
};

/**
 * AX-15: the placements of the current layout the agent's steps still in the history made or changed (that session's,
 * or any agent's) -- each agent step diffed against the step before it by row identity, so a row shifted by a delete is
 * not the agent's change; a row the person changed since, or a step undone, no longer counts. A deleted row has no ref.
 * The editor's highlight reads it; the rendering is the page's.
 */
export function agentChangedRefs(history: History<string>, sessionId?: string | null): string[] {
  const states = history.states().map((raw) => decodeHistoryStep(raw));
  const made = new Map<string, Map<string, number>>();
  for (let i = 1; i < states.length; i++) {
    if (!isAgentStep(historyMetaOf(states[i]!), sessionId)) continue;
    const before = rowsOf(states[i - 1]!.text), after = rowsOf(states[i]!.text);
    for (const [, kind] of PLACEMENT_KINDS) {
      const mine = made.get(kind) ?? new Map<string, number>();
      for (const [row, n] of added(before.get(kind)!, after.get(kind)!)) mine.set(row, (mine.get(row) ?? 0) + n);
      made.set(kind, mine);
    }
  }
  const refs: string[] = [];
  const now = rowsOf(states[states.length - 1]!.text);
  for (const [, kind] of PLACEMENT_KINDS) {
    const mine = made.get(kind);
    if (!mine?.size) continue;
    const rows = now.get(kind)!;
    // The latest copies of a row the agent made: an identical row the person had before keeps its earlier index.
    for (let i = rows.length - 1; i >= 0; i--) {
      const n = mine.get(rows[i]!) ?? 0;
      if (n > 0) { mine.set(rows[i]!, n - 1); refs.push(`${kind}:${i}`); }
    }
  }
  return refs.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
