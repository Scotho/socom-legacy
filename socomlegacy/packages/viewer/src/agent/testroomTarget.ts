import { LocalFileError } from './localFiles';
import { admitRevision, bytes, CaptureRefusal, LIMITS, OPERATIONS, parseCaptureArgs, TESTROOM_INPUT_OPERATIONS, TESTROOM_SETTINGS_OPERATIONS, teach,
  type AgentRequest, type AgentResult } from '@s2u/forge-agent-protocol';
import { pointViewPose } from '../forge/camera/framing';
import { canvasOptionsOf, captureFramed, savedPose } from './capturePreset';
import type { CaptureCanvasOptions } from './install';
import type { SoloSnapshot, SoloTestroomTarget } from '../testroom/agent/target';
import type { PageAgentTarget } from './connection';
import type { LocalPackApi, LocalPackImport } from './localPacks';
import { page } from './paging';
import { createReceiptStore } from './receipts';

/**
 * REVIEW-2 22 (a browser adaptation): the steps a `scenario.start` over the wire admits -- the room's own scenario steps
 * (`testroom/agent/target.ts` `scenarioOperations`) less `camera.set`, which the wire refuses (the manual's
 * `scenario.start` words); answered as `data.admitted` when a camera.set step is refused.
 */
export const SCENARIO_WIRE_STEPS = ['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'teleport', 'observe', 'wait'] as const;

/**
 * AX-13 (plan item 13, a browser adaptation): `testroom.focus` -- where the player is: their feet (null in the fly camera),
 * their look and the camera (`SoloSnapshot.pose`, the fly camera's pose), and the nearest of the loaded map's named
 * objectives (`SoloSnapshot.objectives`, the destinations `testroom.teleport` takes) measured in game units from the
 * feet, or from the camera when there are none. Read only, off one snapshot.
 */
export function roomFocus(snapshot: SoloSnapshot) {
  const from = snapshot.feet ?? (snapshot.pose ? [snapshot.pose.x, snapshot.pose.y, snapshot.pose.z] as const : null);
  let nearest: (SoloSnapshot['objectives'][number] & { distance: number }) | null = null;
  if (from) for (const objective of snapshot.objectives) {
    const distance = Math.round(Math.hypot(objective.feet[0] - from[0], objective.feet[1] - from[1], objective.feet[2] - from[2]) * 100) / 100;
    if (!nearest || distance < nearest.distance) nearest = { ...objective, distance };
  }
  return { map: snapshot.map?.name ?? null, feet: snapshot.feet, look: snapshot.pose ? { yaw: snapshot.pose.yaw, pitch: snapshot.pose.pitch } : null,
    camera: snapshot.pose, nearest, revision: snapshot.revision };
}

/** Browser adaptation: the solo room's public tools delegate to its normal input and loading lanes. */
export function createTestroomPageTarget(api: SoloTestroomTarget, packs: LocalPackApi,
  capture?: (options?: CaptureCanvasOptions) => Promise<Blob>): PageAgentTarget {
  const receipts = createReceiptStore(LIMITS.receipts);   // LATER 420: the one store both page targets keep
  const read = (): ReturnType<PageAgentTarget['read']> => {
    const s = api.read(); return { surface: s.mode, revision: s.revision, name: s.name || 'Solo test room', build: 'forge-agent-v1', map: s.map?.name ?? null };
  };
  const bounded = (request: AgentRequest, value: AgentResult): AgentResult => bytes({ type: 'result', result: value }) <= LIMITS.controlBytes - 2048
    ? value : { requestId: request.requestId, revision: read().revision, outcome: 'refused', code: 'OUTPUT_TOO_LARGE' };

  /** One request's work, after the store has let it through; never throws (a failure is a refused answer). */
  async function perform(incoming: AgentRequest, signal: AbortSignal, args: Record<string, unknown>, mutation: boolean): Promise<AgentResult> {
    const refuse = (code: string): AgentResult => ({ requestId: incoming.requestId, revision: api.read().revision, outcome: 'refused', code });
    // AX-3 (C2): expectedRevision "current" is the revision just read, admitted in this synchronous step with its check.
    const revision = read().revision, request = admitRevision(incoming, revision);
    if (mutation && request.expectedRevision !== revision) return refuse('REVISION_CONFLICT');
    if (['packs.import', 'packs.remove'].includes(request.operation) && !api.read().buildAllowed) return refuse('BUILD_LOCKED');
    const key = `${request.sessionId}:${request.requestId}`;
    const cancelled = (): void => api.cancel('Connection cancelled');
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      let operation: string, value: unknown = args;
      switch (request.operation) {
        case 'target.status': return { requestId: request.requestId, revision: read().revision, outcome: 'ok', data: read() };
        case 'testroom.focus': return { requestId: request.requestId, revision: read().revision, outcome: 'ok', data: roomFocus(api.read()) };
        case 'testroom.read': operation = 'testroom.read'; value = {}; break;
        case 'testroom.map': operation = args['list'] === true ? 'map.list' : 'map.load'; value = args['list'] === true ? {} : args; break;
        case 'testroom.teleport': operation = 'teleport'; break;
        case 'testroom.input': {
          operation = typeof args['operation'] === 'string' ? args['operation'] : 'input.set';
          // AX-1: the manual's list. REVIEW-1 9: an inner operation not admitted is unsupported, with the admitted list.
          if (!(TESTROOM_INPUT_OPERATIONS as readonly string[]).includes(operation)) return { ...refuse('UNSUPPORTED_OPERATION'), data: { admitted: [...TESTROOM_INPUT_OPERATIONS] } };
          value = args['arguments'] ?? (args['operation'] ? {} : args); break;
        }
        case 'testroom.settings': {
          operation = String(args['operation']);
          if (!(TESTROOM_SETTINGS_OPERATIONS as readonly string[]).includes(operation)) return { ...refuse('UNSUPPORTED_OPERATION'), data: { admitted: [...TESTROOM_SETTINGS_OPERATIONS] } };
          value = args['arguments'] ?? {}; break;
        }
        // R5-B (a browser adaptation): the agent's camera shot, the room target's own three operations.
        case 'camera.shot': case 'camera.stop': case 'camera.status': operation = request.operation; break;
        case 'scenario.start': case 'scenario.status': case 'scenario.cancel':
          operation = request.operation;
          // REVIEW-2 22: no grant admits a camera.set step over the wire (the camera is testroom.settings'), so it is
          // unsupported, with the steps the wire admits -- never PERMISSION_DENIED, whose way is to re-pair.
          if (request.operation === 'scenario.start' && Array.isArray(args['steps']) && args['steps'].some(step => (step as { operation?: unknown })?.operation === 'camera.set')) return { ...refuse('UNSUPPORTED_OPERATION'), data: { admitted: [...SCENARIO_WIRE_STEPS] } };
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
  /**
   * AX-16 (plan item 16; a browser adaptation): one `target.capture` in the room. `current` (or no request) is the canvas
   * as it is; `named` frames a named objective (`testroom.read`'s objectives, by name or path, as `teleport` matches a
   * destination) through the room's own `camera.set` (Build only; it ends a running shot `stopped` first) and restores
   * the room's camera pose after, on error too. `top` and `refs` frame a Forge layout the room does not have: UNSUPPORTED.
   */
  async function framedCapture(request?: AgentRequest): Promise<Blob> {
    const take = capture!, args = parseCaptureArgs(request?.args ?? {}), canvas = canvasOptionsOf(args);
    if (args.view === 'current') return take(canvas);
    if (args.view !== 'named')
      throw new CaptureRefusal('UNSUPPORTED', 'The test room takes target.capture view "current" or "named" (name: an objective from testroom.read); "top" and "refs" frame a Forge layout.');
    const snapshot = api.read(), normal = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase(), name = normal(args.name ?? '');
    const choices = snapshot.objectives.filter((d) => normal(d.name) === name || normal(d.path) === name);
    if (choices.length !== 1) {
      const listed = (choices.length ? choices : snapshot.objectives).slice(0, 24).map((d) => d.name).join(', ') || 'none';
      throw new CaptureRefusal('INVALID_REFERENCE', `${choices.length ? 'Several objectives are named' : 'No objective is named'} "${args.name}": choose one of ${listed} (testroom.read lists them, with their paths).`);
    }
    const saved = savedPose(snapshot.pose);
    return captureFramed((pose) => api.execute('camera.set', pose), pointViewPose(choices[0]!.feet), saved, () => take(canvas));
  }
  // AX-3 (C3): every refusal this target returns carries its hint (REFUSAL_HINTS) and, for a revision, the current one.
  return { read, dispatch: async (request, signal) => teach(bounded(request, await dispatch(request, signal))), ...(capture ? { capture: framedCapture } : {}),
    // AX-8 (AX.R4): a hidden tab keeps the pairing; the shot ends `stopped`, the room's cancel ends a running scenario and
    // releases the agent's held inputs (`../testroom/agent/target` `cancel`). No reset: receipts and the session stay.
    pause() { api.stopShot?.('stopped'); api.cancel('Paused while the tab is hidden'); },
    revoke() { receipts.clear(); api.stopShot?.('revoked'); api.resetSession(); } };   // R6: the shot ends `revoked`, then the reset
}
