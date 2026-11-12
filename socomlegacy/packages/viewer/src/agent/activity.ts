import { OPERATIONS, type AgentRequest, type AgentResult } from '@s2u/forge-agent-protocol';
import type { HistoryMeta } from '../forge/history';
import type { StatusChipView } from '../forge/shell/statusBar';
import { agentCodeWords } from './codes';
import type { AgentConnectionLine, PageAgentTarget } from './connection';
import type { AgentPanelState } from './panel';

/**
 * FUI-4 (the review's AI-15, the store half; AI-3's rows; a browser adaptation, FG.R2): what the agent did on this page,
 * as one typed store the rest of the page subscribes to -- the dock's feed, the status bar's agent chip, and FUI-11's
 * approval card and receipts after it. Each row names its operation and, when refused, its code read through the one
 * table (`./codes`); consecutive successful reads of one operation merge into one row with a count, so edits are not
 * lost under read noise; about fifty rows are kept. `acting()` is true while a request is with the page. Nothing here
 * changes what the game does.
 */

export type AgentActivityKind = 'success' | 'error' | 'info';

export interface AgentActivityEntry {
  readonly id: number;
  readonly at: number;
  readonly kind: AgentActivityKind;
  readonly text: string;
  /** The protocol operation (absent on the connection's own lines). */
  readonly operation?: string;
  /** The refusal or diagnostic code, as the wire sent it. */
  readonly code?: string;
  /** Merged reads: how many this row stands for. */
  readonly count: number;
  /** AX-15: the agent's request the row answers, and its session (absent on a row the page's target did not answer). */
  readonly requestId?: string;
  readonly sessionId?: string;
  /**
   * AX-15: true only for a successful edit whose history step is the top of the history now (an undo would take it back);
   * a read, a refusal, a step a later edit sits on, or a store with no history is not undoable. Read at `entries()`.
   */
  readonly undoable: boolean;
  /** AX-15: the row's step undone -- exactly it, the page's own undo -- when `undoable`; how many steps were undone. */
  undo(): number;
}

/**
 * AX-15: the page's history as the store reads it -- the meta of the step an undo takes back, the page's undo while the
 * top step matches (`../forge/history` `undoWhile`, through the page's restore), and its changes.
 */
export interface AgentHistoryLink {
  top(): HistoryMeta | null;
  undoWhile(match: (meta: HistoryMeta) => boolean): number;
  subscribe?(listener: () => void): () => void;
}
/** AX-15: the request a row answers, as `observeTarget` sees it. */
export interface AgentActivityRequest { requestId: string; sessionId?: string }

export interface AgentActivityStore {
  /** Oldest first, at most `AGENT_ACTIVITY_LIMIT`. */
  entries(): readonly AgentActivityEntry[];
  /** A request is with the page now. */
  acting(): boolean;
  /** A request began; the function ends it (once). */
  begin(operation: string): () => void;
  /** A request's result, as a row (AX-15: with its request, the row can find its history step). */
  result(operation: string, result: Pick<AgentResult, 'outcome' | 'code'>, request?: AgentActivityRequest): AgentActivityEntry;
  /** A line of the connection's own (connected, a malformed command, a lost response). */
  note(text: string, kind?: AgentActivityKind): AgentActivityEntry;
  subscribe(listener: () => void): () => void;
  /** AX-15: lets go of the page's history (its subscription); the rows stay readable. */
  dispose(): void;
}

/** About fifty rows (the review's AI-3: the 8-entry ring lost the useful rows under reads). */
export const AGENT_ACTIVITY_LIMIT = 50;

/** The person's words for an operation; an unlisted one reads the protocol's own description. */
const LABELS: Readonly<Record<string, string>> = {
  'forge.read': 'Read the map',
  'forge.catalogue': 'Read the asset list',
  'forge.issues': 'Read the map’s issues',
  'forge.assets': 'Looked up assets',
  'forge.starters': 'Read the starters',
  'forge.starter.preview': 'Previewed a starter',
  'forge.starter.apply': 'Applied a starter',
  'forge.placement': 'Checked a placement',
  'forge.edit': 'Changed the map',
  'forge.undo': 'Undid a map edit',
  'forge.redo': 'Redid a map edit',
  'forge.play': 'Started Play',
  'play.stop': 'Returned to Build',
  'forge.input': 'Drove the player',
  'testroom.input': 'Drove the player',
  'testroom.teleport': 'Moved to a destination',
  'testroom.map': 'Loaded a map',
  'target.capture': 'Took a picture of the view',
};

export function activityLabel(operation: string): string {
  const own = LABELS[operation];
  if (own) return own;
  if (operation.startsWith('scenario.')) return 'Play test';
  if (operation.startsWith('packs.')) return 'Local pack';
  if (operation.startsWith('forge.import')) return 'Map import';
  if (operation.startsWith('forge.export')) return 'Map export';
  return OPERATIONS[operation]?.description ?? operation;
}

const isRead = (operation: string): boolean => OPERATIONS[operation]?.mutation === false && operation !== 'target.capture';

const isEdit = (operation: string): boolean => OPERATIONS[operation]?.mutation === true;

/**
 * AX-15: the history step a row's request made. The page's target hands the facade `<session>:<request>` as the step's
 * request ID (`./forgeTarget`; a key past 128 characters is hashed there, and its row is not matched -- not undoable).
 */
export function stepOfRequest(meta: HistoryMeta | null, requestId: string | undefined, sessionId: string | undefined): boolean {
  if (!meta || meta.actor.kind !== 'agent' || !requestId || meta.requestId === undefined) return false;
  if (sessionId !== undefined && meta.actor.sessionId !== null && meta.actor.sessionId !== sessionId) return false;
  return meta.requestId === requestId || (sessionId !== undefined && meta.requestId === `${sessionId}:${requestId}`);
}

type StoredRow = Omit<AgentActivityEntry, 'undoable' | 'undo'>;

export function createAgentActivity(options: { limit?: number; now?: () => number; history?: AgentHistoryLink } = {}): AgentActivityStore {
  const limit = options.limit ?? AGENT_ACTIVITY_LIMIT;
  const now = options.now ?? ((): number => Date.now());
  const history = options.history;
  const rows: StoredRow[] = [];
  const listeners = new Set<() => void>();
  let ids = 0, inFlight = 0;
  const changed = (): void => { for (const listener of [...listeners]) listener(); };
  const offHistory = history?.subscribe?.(changed) ?? ((): void => undefined);
  /** AX-15: a stored row read with its step: undoable while the top step is its own. */
  const view = (row: StoredRow): AgentActivityEntry => {
    const edit = !!history && row.kind === 'success' && row.operation !== undefined && isEdit(row.operation) && row.requestId !== undefined;
    const mine = (meta: HistoryMeta | null): boolean => edit && stepOfRequest(meta, row.requestId, row.sessionId);
    return { ...row, undoable: mine(history?.top() ?? null), undo: () => {
      if (!history || !mine(history.top())) return 0;
      const n = history.undoWhile(mine);
      if (n) changed();
      return n;
    } };
  };
  const push = (row: Omit<StoredRow, 'id' | 'at' | 'count'>): AgentActivityEntry => {
    const entry: StoredRow = { ...row, id: ++ids, at: now(), count: 1 };
    rows.push(entry);
    while (rows.length > limit) rows.shift();
    changed();
    return view(entry);
  };
  return {
    entries: () => rows.map(view),
    acting: () => inFlight > 0,
    begin(operation) {
      void operation;
      inFlight++;
      changed();
      let done = false;
      return () => { if (done) return; done = true; inFlight = Math.max(0, inFlight - 1); changed(); };
    },
    result(operation, result, request) {
      const label = activityLabel(operation);
      const asked = request ? { requestId: request.requestId, ...(request.sessionId ? { sessionId: request.sessionId } : {}) } : {};
      if (result.outcome === 'ok') {
        const last = rows[rows.length - 1];
        if (isRead(operation) && last && last.operation === operation && last.kind === 'success' && last.code === undefined) {
          const merged: StoredRow = { ...last, at: now(), count: last.count + 1, text: `${label} ×${last.count + 1}` };
          rows[rows.length - 1] = merged;
          changed();
          return view(merged);
        }
        return push({ kind: 'success', text: label, operation, ...asked });
      }
      const code = result.code ?? 'ACTION_FAILED';
      return push({ kind: 'error', text: `${label}: ${agentCodeWords(code)}`, operation, code, ...asked });
    },
    note: (text, kind = 'info') => push({ kind, text: text.slice(0, 240) }),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose: () => { offHistory(); },
  };
}

/** The page's target, watched: each request's span marks the store `acting`, and its result becomes a typed row. */
export function observeTarget(target: PageAgentTarget, store: AgentActivityStore): PageAgentTarget {
  return {
    read: () => target.read(),
    async dispatch(request, signal) {
      const end = store.begin(request.operation);
      try {
        const result = await target.dispatch(request, signal);
        store.result(request.operation, result, { requestId: request.requestId, sessionId: request.sessionId });
        return result;
      } catch (error) {
        store.result(request.operation, { outcome: 'unknown', code: 'ACTION_FAILED' }, { requestId: request.requestId, sessionId: request.sessionId });
        throw error;
      } finally { end(); }
    },
    ...(target.capture ? { capture: (request?: AgentRequest) => target.capture!(request) } : {}),   // AX-16: the preset rides the request
    ...(target.revoke ? { revoke: (reason: string) => target.revoke!(reason) } : {}),
    // AX-8 (AX.R4): the hidden tab's pause reaches the page's own target (it stops a running scenario and input).
    ...(target.pause ? { pause: (reason: string) => target.pause!(reason) } : {}),
  };
}

/**
 * The connection's own activity lines (`./connection`'s 8-entry ring), into the store once each. A per-request line
 * ("<label>: complete" / "needs attention") the page's target answered (`request.routed`) is already the store's typed
 * row from `observeTarget` and is not repeated; R3-A: one the connection answered itself, before the target (a
 * permission refused, a lapsed session, a revoked pairing, a capture), is recorded as the typed row it would have been
 * -- its operation and its code, read through the code table -- never dropped. A line in the older shape (no `request`)
 * with a per-request text is taken as the target's. FUI-11 moves the connection onto the store and retires this bridge.
 */
export function connectionNotes(store: AgentActivityStore): (activity: readonly AgentConnectionLine[]) => void {
  const seen = new WeakSet<object>();
  return (activity) => {
    for (const item of activity) {
      if (seen.has(item)) continue;
      seen.add(item);
      const request = item.request;
      if (request) {
        if (!request.routed) store.result(request.operation, { outcome: request.outcome, ...(request.code ? { code: request.code } : {}) });
        continue;
      }
      if (/: (complete|needs attention)$/.test(item.text)) continue;
      store.note(item.text, item.kind);
    }
  };
}

/** The status bar's agent chip (VP-5, AI-2): nothing while idle; else a word -- never the colour alone. */
export function agentPresence(status: AgentPanelState['status'], acting: boolean): StatusChipView {
  switch (status) {
    case 'idle': case 'disconnected': return { text: null, tone: 'empty' };
    case 'creating': case 'waiting': return { text: 'Agent waiting', tone: 'wait' };
    case 'approval': return { text: 'Approval needed', tone: 'alert' };
    case 'connecting': return { text: 'Agent connecting', tone: 'wait' };
    case 'connected': return acting ? { text: 'Agent acting', tone: 'live' } : { text: 'Agent connected', tone: 'ready' };
    case 'paused': return { text: 'Agent paused', tone: 'wait' };
    case 'error': return { text: 'Agent needs attention', tone: 'alert' };
  }
}
