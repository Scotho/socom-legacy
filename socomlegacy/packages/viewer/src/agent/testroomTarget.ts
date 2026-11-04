import { LocalFileError } from './localFiles';
import { bytes, LIMITS, OPERATIONS, type AgentRequest, type AgentResult } from '@s2u/forge-agent-protocol';
import type { SoloTestroomTarget } from '../testroom/agent/target';
import type { PageAgentTarget } from './connection';
import type { LocalPackApi, LocalPackImport } from './localPacks';
import { page } from './paging';
import { createReceiptStore } from './receipts';

/** Browser adaptation: the solo room's public tools delegate to its normal input and loading lanes. */
export function createTestroomPageTarget(api: SoloTestroomTarget, packs: LocalPackApi,
  capture?: () => Promise<Blob>): PageAgentTarget {
  const receipts = createReceiptStore(LIMITS.receipts);   // LATER 420: the one store both page targets keep
  const read = (): ReturnType<PageAgentTarget['read']> => {
    const s = api.read(); return { surface: s.mode, revision: s.revision, name: s.name || 'Solo test room', build: 'forge-agent-v1', map: s.map?.name ?? null };
  };
  const bounded = (request: AgentRequest, value: AgentResult): AgentResult => bytes({ type: 'result', result: value }) <= LIMITS.controlBytes - 2048
    ? value : { requestId: request.requestId, revision: read().revision, outcome: 'refused', code: 'OUTPUT_TOO_LARGE' };

  /** One request's work, after the store has let it through; never throws (a failure is a refused answer). */
  async function perform(request: AgentRequest, signal: AbortSignal, args: Record<string, unknown>, mutation: boolean): Promise<AgentResult> {
    const refuse = (code: string): AgentResult => ({ requestId: request.requestId, revision: api.read().revision, outcome: 'refused', code });
    if (mutation && request.expectedRevision !== read().revision) return refuse('REVISION_CONFLICT');
    if (['packs.import', 'packs.remove'].includes(request.operation) && !api.read().buildAllowed) return refuse('BUILD_LOCKED');
    const key = `${request.sessionId}:${request.requestId}`;
    const cancelled = (): void => api.cancel('Connection cancelled');
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      let operation: string, value: unknown = args;
      switch (request.operation) {
        case 'target.status': return { requestId: request.requestId, revision: read().revision, outcome: 'ok', data: read() };
        case 'testroom.read': operation = 'testroom.read'; value = {}; break;
        case 'testroom.map': operation = args['list'] === true ? 'map.list' : 'map.load'; value = args['list'] === true ? {} : args; break;
        case 'testroom.teleport': operation = 'teleport'; break;
        case 'testroom.input': {
          operation = typeof args['operation'] === 'string' ? args['operation'] : 'input.set';
          if (!['input.set', 'input.release', 'equipment.equip', 'armory.key', 'action.press', 'action.hold', 'action.release', 'action.cancel'].includes(operation)) return refuse('PERMISSION_DENIED');
          value = args['arguments'] ?? (args['operation'] ? {} : args); break;
        }
        case 'testroom.settings': {
          operation = String(args['operation']);
          if (!['camera.set', 'session.play'].includes(operation)) return refuse('UNSUPPORTED_OPERATION');
          value = args['arguments'] ?? {}; break;
        }
        // R5-B (a browser adaptation): the agent's camera shot, the room target's own three operations.
        case 'camera.shot': case 'camera.stop': case 'camera.status': operation = request.operation; break;
        case 'scenario.start': case 'scenario.status': case 'scenario.cancel':
          operation = request.operation;
          if (request.operation === 'scenario.start' && Array.isArray(args['steps']) && args['steps'].some(step => (step as { operation?: unknown })?.operation === 'camera.set')) return refuse('PERMISSION_DENIED');
          break;
        case 'packs.list': {   // browser adaptation: revision-bound pages, as the Forge target serves them
          const items = await packs.list(), revision = read().revision;
          return { requestId: request.requestId, revision, outcome: 'ok', data: page(items, args, revision, 'packs') };
        }
        case 'packs.import': case 'packs.remove': {
          let result: unknown; try { result = request.operation === 'packs.import' ? await packs.import(args as unknown as LocalPackImport, { signal, check: () => { if (api.read().revision !== request.expectedRevision) throw new LocalFileError('REVISION_CONFLICT', 'The room changed during import.'); } }) : await packs.remove(String(args['id']), { signal, check: () => { if (api.read().revision !== request.expectedRevision) throw new LocalFileError('REVISION_CONFLICT', 'The room changed during removal.'); } });
          } finally { api.refreshExternalState(); }
          return { requestId: request.requestId, revision: read().revision, outcome: 'ok', data: result };
        }
        default: return refuse('UNSUPPORTED_OPERATION');
      }
      const id = key.length <= 128 ? key : '#' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, '0')).join('');
      const result = await api.execute(operation, value, request.expectedRevision, id, { signal });
      const answer: AgentResult = { requestId: request.requestId, revision: result.revision, outcome: result.ok ? 'ok' : 'refused',
        ...(result.code ? { code: result.code } : {}), ...(result.data !== undefined ? { data: result.data } : {}) };
      if (request.operation === 'testroom.read' && result.ok) {
        const snapshot = api.read();
        let offset = 0;
        if (args['cursor'] !== undefined) {
          const cursor = args['cursor'] as { revision?: unknown; offset?: unknown };
          if (!cursor || cursor.revision !== snapshot.revision || !Number.isSafeInteger(cursor.offset) || Number(cursor.offset) < 0) return refuse('REVISION_CONFLICT');
          offset = Number(cursor.offset);
        }
        answer.data = { snapshot: { ...snapshot, objectives: snapshot.objectives.slice(offset, offset + 100) }, operations: api.operations,
          objectivesTotal: snapshot.objectives.length, nextCursor: offset + 100 < snapshot.objectives.length ? { revision: snapshot.revision, offset: offset + 100 } : null };
      }
      return answer;
    } catch (error) {
      const answer = refuse(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'ACTION_FAILED');
      if (error && typeof error === 'object' && 'result' in error && error.result !== undefined) answer.data = { result: error.result };
      return answer;
    }
    finally { signal.removeEventListener('abort', cancelled); }
  }

  async function dispatch(request: AgentRequest, signal: AbortSignal): Promise<AgentResult> {
    const refuse = (code: string): AgentResult => ({ requestId: request.requestId, revision: api.read().revision, outcome: 'refused', code });
    if (signal.aborted) return refuse('CANCELLED');
    if (read().surface === 'blocked') return refuse('SURFACE_DENIED');
    const args = request.args as Record<string, unknown>;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return refuse('INVALID_ARGUMENT');
    if (request.operation === 'request.receipt') return { requestId: request.requestId, revision: read().revision, outcome: 'ok', data: { receipt: receipts.get(`${request.sessionId}:${String(args['requestId'])}`) } };
    const definition = OPERATIONS[request.operation];
    if (!definition?.surfaces.includes('testroom-solo')) return refuse('SURFACE_DENIED');
    if (!definition.mutation) return bounded(request, await perform(request, signal, args, false));
    const signature = JSON.stringify([request.operation, request.args, request.expectedRevision]);
    const answer = await receipts.run(`${request.sessionId}:${request.requestId}`, signature,
      async () => bounded(request, await perform(request, signal, args, true)), signal);
    return 'refused' in answer ? refuse(answer.refused) : answer;
  }
  return { read, dispatch: async (request, signal) => bounded(request, await dispatch(request, signal)), ...(capture ? { capture } : {}),
    revoke() { receipts.clear(); api.stopShot?.('revoked'); api.resetSession(); } };   // R6: the shot ends `revoked`, then the reset
}
