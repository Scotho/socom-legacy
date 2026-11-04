/** Product adaptation: assert observed real-client MCP results, never the model's final prose. */
import { safeClientEvents } from './events';
export interface Exchange { method: string; params?: Record<string, any>; result?: any; error?: boolean }
export interface ChildResult { exitCode: number | null; approved: boolean; timedOut?: boolean; outputError?: boolean }
export interface Classification { status: 'pass' | 'fail'; checks: Record<string, boolean>; childExit: number | null; timedOut: boolean }
export function failurePhase(result: Classification): string | undefined {
  const phases = { child: 'CLIENT_EXECUTION', discovery: 'TOOL_DISCOVERY', capabilities: 'CAPABILITY_DISCOVERY', approval: 'PAGE_APPROVAL',
    read: 'READ_METADATA', edit: 'EDIT_READBACK', undo: 'UNDO_READBACK', image: 'MCP_IMAGE', importApply: 'IMPORT_APPLY_READBACK',
    remove: 'REMOVE_READBACK', disconnect: 'DISCONNECT_REVOCATION', pageErrors: 'PAGE_ERROR' };
  return Object.entries(phases).find(([check]) => result.checks[check] === false)?.[1];
}
export const EDITED_NAME = 'FCW acceptance edited';
export const IMPORTED_NAME = 'FCW imported fixture';
export const BASELINE_NAME = 'FCW baseline';
export function payload(event: Exchange | undefined): any {
  const result = event?.result;
  if (result?.structuredContent) return result.structuredContent;
  try { return JSON.parse(result?.content?.find((block: any) => block.type === 'text')?.text ?? 'null'); } catch { return null; }
}
export function pngImage(event: Exchange): Buffer | null {
  if (payload(event)?.outcome !== 'ok' || event.result?.isError) return null;
  for (const block of event.result?.content ?? []) {
    if (block.type !== 'image' || block.mimeType !== 'image/png' || typeof block.data !== 'string' || block.data.length > 3 * 1024 * 1024) continue;
    const bytes = Buffer.from(block.data, 'base64');
    if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return bytes;
  }
  return null;
}
export function classify(events: readonly Exchange[], child: ChildResult, discoverySource: 'proxy-tools-list' | 'native-client-results' = 'proxy-tools-list'): Classification {
  const tools = (name: string) => (e: Exchange): boolean => e.method === 'tools/call' && e.params?.name === name && !e.error && !e.result?.isError;
  let identity: { sessionId: string; targetId: string; epoch: string } | undefined;
  const bound = (e: Exchange): boolean => {
    const request = e.params?.arguments;
    return !!identity && tools('agent_request')(e) && request?.version === 1 && typeof request.requestId === 'string'
      && request.requestId.length > 0 && request.requestId.length <= 128 && request.args !== null && typeof request.args === 'object' && !Array.isArray(request.args)
      && request.sessionId === identity.sessionId && request.targetId === identity.targetId && request.epoch === identity.epoch;
  };
  const operation = (name: string) => (e: Exchange): boolean => bound(e) && e.params?.arguments?.operation === name && payload(e)?.outcome === 'ok';
  let at = -1;
  const next = (predicate: (event: Exchange) => boolean): Exchange | undefined => {
    const index = events.findIndex((event, index) => index > at && predicate(event));
    if (index < 0) return undefined;
    at = index; return events[index];
  };
  const names = ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'];
  // Native stdout does not expose tools/list. Require actual successful calls to all five tools instead;
  // never synthesize a network exchange or let login alone count as end-to-end discovery.
  const discovery = discoverySource === 'native-client-results' ? names.every(name => events.some(e => tools(name)(e) && payload(e) !== null))
    : !!next(e => e.method === 'tools/list' && names.every(name => e.result?.tools?.some((t: any) => t.name === name)));
  const capabilities = !!next(e => tools('agent_capabilities')(e) && !!payload(e)?.operations?.['forge.read']);
  const pair = next(e => tools('agent_pair')(e) && payload(e)?.state === 'pending'
    && ['sessionId', 'targetId', 'epoch'].every(field => typeof payload(e)[field] === 'string' && payload(e)[field].length > 0));
  identity = pair ? payload(pair) : undefined;
  const before = next(e => operation('forge.read')(e) && e.params?.arguments?.args?.section === 'metadata' && payload(e)?.data?.name === BASELINE_NAME);
  const original = before && payload(before).data.name;
  const edit = next(e => operation('forge.edit')(e) && e.params?.arguments?.args?.operation === 'layout.name' && e.params.arguments.args.arguments?.name === EDITED_NAME);
  const edited = next(e => operation('forge.read')(e) && payload(e)?.data?.name === EDITED_NAME);
  const undo = next(operation('forge.undo'));
  const restored = next(e => operation('forge.read')(e) && payload(e)?.data?.name === original);
  const image = next(e => operation('target.capture')(e) && pngImage(e) !== null);
  const staged = next(e => operation('packs.list')(e) && payload(e)?.data?.items?.some((item: any) => item.staged));
  const imported = next(e => operation('packs.import')(e) && e.params?.arguments?.args?.kind === 'map' && e.params.arguments.args.apply === true
    && payload(e)?.data?.stored === true && payload(e)?.data?.applied === true && typeof payload(e)?.data?.id === 'string'
    && payload(staged!)?.data?.items?.some((item: any) => item.staged && item.id === e.params?.arguments?.args?.stagedId));
  const appliedRead = next(e => operation('forge.read')(e) && payload(e)?.data?.name === IMPORTED_NAME);
  const importedId = imported && payload(imported).data.id;
  const removed = next(e => operation('packs.remove')(e) && e.params?.arguments?.args?.id === importedId && payload(e)?.data?.id === importedId
    && payload(e)?.data?.removed === true && payload(e)?.data?.stored === false && payload(e)?.data?.applied === false);
  const removedRead = next(e => operation('packs.list')(e) && Array.isArray(payload(e)?.data?.items)
    && !payload(e).data.items.some((item: any) => item.id === importedId));
  const disconnect = next(e => tools('agent_disconnect')(e) && e.params?.arguments?.sessionId === payload(pair!)?.sessionId && payload(e)?.disconnected === true);
  const disconnectedAt = at;
  const successfulReplay = !!disconnect && events.some((event, index) => index > disconnectedAt && bound(event) && payload(event)?.outcome === 'ok');
  const revoked = next(e => bound(e) && e.params?.arguments?.operation === 'forge.read' && payload(e)?.outcome === 'refused' && payload(e)?.code === 'NOT_PAIRED');
  const checks = { child: child.exitCode === 0 && !child.timedOut && !child.outputError, discovery, capabilities, approval: child.approved && !!pair,
    read: !!before, edit: !!edit && !!edited, undo: !!undo && !!restored, image: !!image,
    importApply: !!staged && !!imported && !!appliedRead, remove: !!removed && !!removedRead, disconnect: !!disconnect && !!revoked && !successfulReplay };
  return { status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks, childExit: child.exitCode, timedOut: !!child.timedOut };
}
export function safeReport(input: { client: string; classification: Classification; [key: string]: unknown }) {
  // Intentionally no raw child output, prompts, errors, identities, URLs or transcript in durable reports.
  const checks = Object.fromEntries(Object.entries(input.classification.checks).map(([key, value]) => [key, value === true]));
  return { adaptation: true, client: input.client === 'claude' ? 'claude' : 'codex', evidence: 'actual-cli-via-loopback-proxy',
    status: input.classification.status, checks, childExit: input.classification.childExit, timedOut: input.classification.timedOut,
    ...(input.clientEvents ? { clientEvents: safeClientEvents(input.clientEvents) } : {}),
    unmeasured: ['copied-blurb-oauth', 'client-ui-image-display', 'other-profile', 'lan', 'separate-network', 'turn'] };
}
