import { OPERATIONS, type AgentResult } from '@s2u/forge-agent-protocol';
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
}

export interface AgentActivityStore {
  /** Oldest first, at most `AGENT_ACTIVITY_LIMIT`. */
  entries(): readonly AgentActivityEntry[];
  /** A request is with the page now. */
  acting(): boolean;
  /** A request began; the function ends it (once). */
  begin(operation: string): () => void;
  /** A request's result, as a row. */
  result(operation: string, result: Pick<AgentResult, 'outcome' | 'code'>): AgentActivityEntry;
  /** A line of the connection's own (connected, a malformed command, a lost response). */
  note(text: string, kind?: AgentActivityKind): AgentActivityEntry;
  subscribe(listener: () => void): () => void;
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

export function createAgentActivity(options: { limit?: number; now?: () => number } = {}): AgentActivityStore {
  const limit = options.limit ?? AGENT_ACTIVITY_LIMIT;
  const now = options.now ?? ((): number => Date.now());
  const rows: AgentActivityEntry[] = [];
  const listeners = new Set<() => void>();
  let ids = 0, inFlight = 0;
  const changed = (): void => { for (const listener of [...listeners]) listener(); };
  const push = (row: Omit<AgentActivityEntry, 'id' | 'at' | 'count'>): AgentActivityEntry => {
    const entry: AgentActivityEntry = { ...row, id: ++ids, at: now(), count: 1 };
    rows.push(entry);
    while (rows.length > limit) rows.shift();
    changed();
    return entry;
  };
  return {
    entries: () => rows.slice(),
    acting: () => inFlight > 0,
    begin(operation) {
      void operation;
      inFlight++;
      changed();
      let done = false;
      return () => { if (done) return; done = true; inFlight = Math.max(0, inFlight - 1); changed(); };
    },
    result(operation, result) {
      const label = activityLabel(operation);
      if (result.outcome === 'ok') {
        const last = rows[rows.length - 1];
        if (isRead(operation) && last && last.operation === operation && last.kind === 'success' && last.code === undefined) {
          const merged: AgentActivityEntry = { ...last, at: now(), count: last.count + 1, text: `${label} ×${last.count + 1}` };
          rows[rows.length - 1] = merged;
          changed();
          return merged;
        }
        return push({ kind: 'success', text: label, operation });
      }
      const code = result.code ?? 'ACTION_FAILED';
      return push({ kind: 'error', text: `${label}: ${agentCodeWords(code)}`, operation, code });
    },
    note: (text, kind = 'info') => push({ kind, text: text.slice(0, 240) }),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
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
        store.result(request.operation, result);
        return result;
      } catch (error) {
        store.result(request.operation, { outcome: 'unknown', code: 'ACTION_FAILED' });
        throw error;
      } finally { end(); }
    },
    ...(target.capture ? { capture: () => target.capture!() } : {}),
    ...(target.revoke ? { revoke: (reason: string) => target.revoke!(reason) } : {}),
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
