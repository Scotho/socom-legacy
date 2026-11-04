import { LocalFileError } from './localFiles';
import { ChunkAssembler, decodeBase64, encodeBase64, LIMITS, OPERATIONS, bytes,
  type AgentRequest, type AgentResult } from '@s2u/forge-agent-protocol';
import { FORGE_AGENT_OPERATIONS, RULES_INLINE_BYTES, type ForgeAgentApi, type ForgeAgentSnapshot } from '../forge/agent/api';
import { FORGE_AUTHORING_SCHEMA, FORGE_AUTHORING_VERSION } from '../forge/rulesAuthoring';
import type { PageAgentTarget } from './connection';
import type { LocalPackApi, LocalPackImport } from './localPacks';
import { page, PagingRefusal as Refusal } from './paging';
import { createReceiptStore } from './receipts';

export interface ForgePageTargetOptions { api: ForgeAgentApi; build: string; packs?: LocalPackApi; capture?: () => Promise<Blob> }
function argsOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Refusal('INVALID_ARGUMENT');
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 256): string { if (typeof value !== 'string' || !value || value.length > maximum) throw new Refusal('INVALID_ARGUMENT'); return value; }

export function createForgePageTarget(options: ForgePageTargetOptions): PageAgentTarget {
  const { api } = options;
  const imports = new ChunkAssembler();
  let imported: { id: string; revision: number; digest: string } | undefined;
  let exported: { id: string; revision: number; data: Uint8Array; at: number } | undefined;
  // Browser adaptation: the connection reads this per request and per capture chunk; the cheap status, never a cloned snapshot.
  const read = (): ReturnType<PageAgentTarget['read']> => {
    const status = api.status();
    return { surface: status.mode, revision: status.revision, build: options.build, name: status.name, map: status.map };
  };
  const wrap = (request: AgentRequest, result: { ok: boolean; revision: number; code?: string; message?: string; data?: unknown }): AgentResult => ({
    requestId: request.requestId, revision: result.revision, outcome: result.ok ? 'ok' : 'refused',
    ...(result.code ? { code: result.code } : {}), ...(result.data !== undefined ? { data: result.data } : result.message ? { data: { message: result.message } } : {}),
  });
  async function perform(request: AgentRequest, signal: AbortSignal): Promise<AgentResult> {
    const fail = (code: string): AgentResult => ({ requestId: request.requestId, revision: api.status().revision, outcome: 'refused', code });
    try {
      if (signal.aborted) return fail('CANCELLED');
      // The full snapshot (a clone of the layout, catalogue and refs) is read only by the operations that use it.
      const status = api.status(), definition = OPERATIONS[request.operation];
      let full: ForgeAgentSnapshot | undefined;
      const snapshot = (): ForgeAgentSnapshot => (full ??= api.read());
      if (status.mode === 'blocked' || !definition?.surfaces.includes(status.mode)) return fail('SURFACE_DENIED');
      if (definition.mutation && request.expectedRevision !== status.revision) return fail('REVISION_CONFLICT');
      const args = argsOf(request.args);
      const success = (data?: unknown): AgentResult => ({ requestId: request.requestId, revision: api.status().revision, outcome: 'ok', ...(data === undefined ? {} : { data }) });
      const execute = async (operation: string, value: unknown = {}) => {
        const key = `${request.sessionId}:${request.requestId}`;
        const id = key.length <= 128 ? key : '#' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, '0')).join('');
        return wrap(request, await api.execute(operation, value, request.operation === 'scenario.cancel' ? api.status().revision : request.expectedRevision, id, { signal, sessionId: request.sessionId }));
      };
      switch (request.operation) {
        case 'target.status': { const s = snapshot(); return success({ ...read(), ready: s.ready, viewRevision: status.viewRevision, canUndo: s.canUndo, canRedo: s.canRedo, selection: s.selection, ...(s.play ? { play: s.play } : {}) }); }
        case 'forge.read': {
          const section = typeof args['section'] === 'string' ? args['section'] : 'pieces';
          if (section === 'view') return success(snapshot().view);
          const layout = snapshot().layout;
          if (!layout) return fail('NOT_READY');
          if (section === 'metadata') { const { pieces, spawns, assets, hidden, npcs, missing, ...metadata } = layout; return success({ ...metadata, revision: status.revision, counts: { pieces: pieces.length, spawns: spawns.length, assets: assets.length, hidden: hidden?.length ?? 0, npcs: npcs?.length ?? 0, missing: missing?.length ?? 0 } }); }
          const value = section === 'refs' ? snapshot().refs : (layout as unknown as Record<string, unknown>)[section];
          if (!Array.isArray(value)) return fail('INVALID_SECTION');
          return success(page(value, args, status.revision, section));
        }
        case 'forge.catalogue': {
          const section = typeof args['section'] === 'string' ? args['section'] : 'operations';
          if (section === 'saves') {
            const revision = status.revision;
            const result = await execute('saves.list');
            if (signal.aborted) return fail('CANCELLED');
            if (result.outcome !== 'ok') return result;
            if (api.status().revision !== revision || result.revision !== revision) return fail('REVISION_CONFLICT');
            if (!Array.isArray(result.data)) return fail('INVALID_RESULT');
            // Native save records may be large. This inspect alias exposes only IDs and list metadata.
            const saves = result.data.map((value) => {
              const saved = argsOf(value);
              if (typeof saved['savedAt'] !== 'number' || !Number.isFinite(saved['savedAt'])) throw new Refusal('INVALID_RESULT');
              return { id: text(saved['id']), name: text(saved['name'], 48), savedAt: saved['savedAt'] };
            });
            return success(page(saves, args, revision, section));
          }
          const values = section === 'operations' ? FORGE_AGENT_OPERATIONS : argsOf(snapshot().catalogue)[section];
          if (!Array.isArray(values)) return fail('INVALID_SECTION');
          return success(page(values, args, status.revision, section));
        }
        case 'forge.issues': return success(page(snapshot().issues, args, status.revision, 'issues'));
        case 'forge.starters': return execute('starters.list', args);
        case 'forge.starter.preview':
        case 'forge.starter.apply': {
          if (request.expectedRevision !== undefined && request.expectedRevision !== status.revision) return fail('STALE_REVISION');
          return execute(request.operation === 'forge.starter.preview' ? 'starters.preview' : 'starters.apply', args);
        }
        case 'forge.assets':
        case 'forge.placement': {
          if (request.expectedRevision !== undefined && request.expectedRevision !== status.revision) return fail('STALE_REVISION');
          return execute(request.operation === 'forge.assets' ? 'assets.query' : 'placement.check', args);
        }
        case 'forge.edit': {
          const operation = text(args['operation']);
          const nested = FORGE_AGENT_OPERATIONS.find(def => def.name === operation);
          if (!nested || nested.permission !== 'edit') return fail('PERMISSION_DENIED');
          return execute(operation, args['arguments'] ?? {});
        }
        case 'forge.input': {
          const operation = text(args['operation']);
          if (!['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'armory.key'].includes(operation)) return fail('PERMISSION_DENIED');
          return execute(operation, args['arguments'] ?? {});
        }
        case 'scenario.start': case 'scenario.status': case 'scenario.cancel': return execute(request.operation, args);
        // R5-B (a browser adaptation): the agent's camera shot, the facade's own three operations. R8-4: camera.stop is the
        // stop lane here too -- the facade runs it at once, never behind a slow command on its serial queue.
        case 'camera.shot': case 'camera.stop': case 'camera.status': return execute(request.operation, args);
        case 'forge.undo': return execute('undo');
        case 'forge.redo': return execute('redo');
        case 'forge.check': {
          const result = await execute('checkMap');
          if (result.outcome === 'ok') result.data = { issues: api.read().issues.length, detailsOperation: 'forge.issues' };
          return result;
        }
        // FCW-32 (a browser adaptation): discover/read, check, export and import the layout's rules; their writes ride forge.edit.
        case 'forge.rules': return execute('rules.read', args);
        case 'forge.rules.check': return execute('rules.check', args);
        case 'forge.rules.export': {
          // F3 (round 2): a pack past the inline bound is refused by name, with the bound and the chunked route
          const result = await execute('rules.export', args);
          const size = result.outcome === 'ok' ? bytes(result.data) : 0;
          if (size <= RULES_INLINE_BYTES) return result;
          return { requestId: request.requestId, revision: api.status().revision, outcome: 'refused', code: 'RULES_TOO_LARGE', data: { bytes: size, limit: RULES_INLINE_BYTES,
            message: `The rules pack is ${size} bytes; forge.rules.export carries at most ${RULES_INLINE_BYTES} inline. Export the layout with forge.export.begin (chunked): its envelope carries the rules.` } };
        }
        case 'forge.rules.test': return execute('rules.test', args);
        case 'forge.rules.import': {
          // F3 (re-look): the bound is the whole request's JSON-escaped size (every member), not one member's characters
          const size = bytes(args);
          if (size <= RULES_INLINE_BYTES) return execute('rules.import', args);
          return { requestId: request.requestId, revision: api.status().revision, outcome: 'refused', code: 'RULES_TOO_LARGE', data: { bytes: size, limit: RULES_INLINE_BYTES,
            message: `The rules pack's files are ${size} bytes JSON-escaped; forge.rules.import carries at most ${RULES_INLINE_BYTES} inline. Import the layout with forge.import.begin (chunked): its envelope carries the rules.` } };
        }
        case 'forge.play': return execute('play.start');
        case 'play.stop': return execute('play.stop');
        case 'request.receipt': return execute('request.receipt', { requestId: text(args['requestId']) });
        case 'forge.import.begin': {
          const id = text(args['transferId']);
          if (!Number.isSafeInteger(args['size']) || !/^[a-f0-9]{64}$/.test(String(args['digest']))) return fail('INVALID_ARGUMENT');
          imports.begin(id, Number(args['size'])); imported = { id, revision: status.revision, digest: String(args['digest']) };
          return success({ transferId: id });
        }
        case 'forge.import.chunk': {
          const id = text(args['transferId']);
          if (!imported || imported.id !== id || imported.revision !== status.revision) return fail('REVISION_CONFLICT');
          imports.chunk(id, Number(args['index']), decodeBase64(text(args['data'], 32768), LIMITS.chunkBytes)); return success();
        }
        case 'forge.import.finish': {
          const id = text(args['transferId']);
          if (!imported || imported.id !== id || imported.revision !== status.revision) return fail('REVISION_CONFLICT');
          const staged = imported; const data = imports.finish(id); imported = undefined;
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
          if (digest !== staged.digest) return fail('DIGEST_MISMATCH');
          if (signal.aborted) return fail('CANCELLED');
          const layout: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
          return execute('layout.import', { layout });
        }
        case 'forge.import.cancel': imports.cancel(); imported = undefined; return success();
        case 'forge.export.begin': {
          const layout = snapshot().layout, rules = snapshot().rules;
          if (!layout) return fail('NOT_READY');
          // FCW-32: a layout with rules exports its authoring envelope (the record and its rules); forge.import reads it back.
          const doc = rules ? { schema: FORGE_AUTHORING_SCHEMA, version: FORGE_AUTHORING_VERSION, record: layout, rules } : layout;
          const data = new TextEncoder().encode(JSON.stringify(doc)); if (data.length > LIMITS.transferBytes) return fail('TRANSFER_TOO_LARGE');
          const id = crypto.randomUUID(); exported = { id, revision: status.revision, data, at: Date.now() };
          return success({ transferId: id, size: data.length, chunkBytes: LIMITS.chunkBytes, revision: status.revision });
        }
        case 'forge.export.chunk': {
          if (!exported || exported.id !== args['transferId']) return fail('NO_TRANSFER');
          if (exported.revision !== status.revision) { exported = undefined; return fail('REVISION_CONFLICT'); }
          if (Date.now() - exported.at > LIMITS.transferAbsoluteMs) { exported = undefined; return fail('TRANSFER_EXPIRED'); }
          const index = Number(args['index']); if (!Number.isSafeInteger(index) || index < 0 || index * LIMITS.chunkBytes >= exported.data.length) return fail('INVALID_ARGUMENT');
          return success({ index, data: encodeBase64(exported.data.subarray(index * LIMITS.chunkBytes, (index + 1) * LIMITS.chunkBytes)) });
        }
        case 'packs.list': return options.packs ? success(page(await options.packs.list(), args, status.revision, 'packs')) : fail('LOCAL_FILES_UNAVAILABLE');
        case 'packs.import': {
          if (!options.packs) return fail('LOCAL_FILES_UNAVAILABLE');
          // `pack` (FCW-33): a v2 pack, reaching the registry's install; the surface's own allowedSurface still decides.
          if (!['map', 'mod', 'model', 'texture', 'pack'].includes(String(args['kind']))) return fail('INVALID_ARGUMENT');
          const input: LocalPackImport = { kind: args['kind'] as LocalPackImport['kind'],
            ...(args['path'] !== undefined ? { path: text(args['path']) } : {}), ...(args['stagedId'] !== undefined ? { stagedId: text(args['stagedId']) } : {}),
            ...(args['name'] !== undefined ? { name: text(args['name']) } : {}), ...(args['apply'] === true ? { apply: true } : {}) };
          try { return success(await options.packs.import(input, { signal, check: () => { if (api.status().revision !== request.expectedRevision) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed during import.'); } })); } finally { api.refreshExternalState(); }
        }
        case 'packs.remove': { if (!options.packs) return fail('LOCAL_FILES_UNAVAILABLE'); try { return success(await options.packs.remove(text(args['id']), { signal, check: () => { if (api.status().revision !== request.expectedRevision) throw new LocalFileError('REVISION_CONFLICT', 'The editor changed during removal.'); } })); } finally { api.refreshExternalState(); } }
        default: return fail('UNSUPPORTED_OPERATION');
      }
    } catch (error) {
      const result = fail(error instanceof Refusal ? error.code : error instanceof Error && 'code' in error ? String(error.code) : 'INVALID_ARGUMENT');
      if (error && typeof error === 'object' && 'result' in error && error.result !== undefined) result.data = { result: error.result };
      return result;
    }
  }
  const receipts = createReceiptStore(LIMITS.receipts);   // LATER 420: the one store both page targets keep
  async function dispatch(request: AgentRequest, signal: AbortSignal): Promise<AgentResult> {
    const fail = (code: string): AgentResult => ({ requestId: request.requestId, revision: api.status().revision, outcome: 'refused', code });
    if (signal.aborted) return fail('CANCELLED');
    if (api.status().mode === 'blocked') return fail('SURFACE_DENIED');
    const key = `${request.sessionId}:${request.requestId}`;
    if (request.operation === 'request.receipt') {
      const id = (request.args as { requestId?: unknown })?.requestId;
      if (typeof id !== 'string') return fail('INVALID_ARGUMENT');
      return { requestId: request.requestId, revision: api.status().revision, outcome: 'ok', data: { receipt: receipts.get(`${request.sessionId}:${id}`) } };
    }
    const bounded = (value: AgentResult): AgentResult => bytes({ type: 'result', result: value }) <= LIMITS.controlBytes - 2048 ? value : fail('OUTPUT_TOO_LARGE');
    if (!OPERATIONS[request.operation]?.mutation) return bounded(await perform(request, signal));
    const fingerprint = JSON.stringify([request.operation, request.args, request.expectedRevision]);
    const answer = await receipts.run(key, fingerprint, async () => {
      const value = bounded(await perform(request, signal)); value.revision = api.status().revision;
      return value;
    }, signal);
    return 'refused' in answer ? fail(answer.refused) : answer;
  }
  return { read, dispatch, ...(options.capture ? { capture: options.capture } : {}), revoke() {
    // R6 (the round 5b review): the revoked pairing's shot ends `revoked` first; the reset's `disconnected` then finds none.
    receipts.clear(); api.stopShot?.('revoked'); api.resetSession(); imports.cancel(); imported = undefined; exported = undefined;
  } };
}
