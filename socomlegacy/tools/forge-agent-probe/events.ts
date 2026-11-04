/** Product adaptation: fixed stdout event taxonomy; never retain event content, tool names or provider text. */
export const EVENT_KINDS = ['COMMAND_EXECUTION', 'FILE_CHANGE', 'WEB_SEARCH', 'COLLAB_TOOL_CALL', 'TODO_LIST', 'ERROR_ITEM',
  'MCP_TOOL_CALL', 'CLAUDE_TOOL_USE', 'CLAUDE_TOOL_PROGRESS', 'UNKNOWN_TYPE'] as const;
export type EventKind = typeof EVENT_KINDS[number];
const ERROR_KINDS = ['AUTH_REQUIRED', 'RATE_LIMIT', 'UNSUPPORTED_MODEL', 'NETWORK', 'UNKNOWN_ERROR'] as const;
export type ErrorKind = typeof ERROR_KINDS[number];
export interface UnexpectedEvent { kind: EventKind; serverMatch?: boolean; toolMatch?: boolean; errorKind?: ErrorKind }
export interface ClientEvents { jsonLines: number; nonJsonLines: number; unexpectedEvents: number; warningEvents: number; firstUnexpected?: UnexpectedEvent; firstWarning?: UnexpectedEvent;
  mcpTools?: Record<string, number>; refusalCodes?: string[]; failureSignals?: string[] }
const MCP_TOOLS = ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'];
const REFUSAL_CODES = ['NOT_PAIRED', 'INVITATION_EXPIRED', 'INVITATION_INVALID', 'PERMISSION_DENIED', 'UNSUPPORTED_SURFACE', 'STALE_REVISION', 'ABORTED', 'TARGET_GONE', 'SESSION_REVOKED'];
const FAILURE_SIGNALS = ['MCP_APPROVAL_REQUIRED', 'CODE_MODE_HOST_DISABLED', 'MCP_TOOLS_UNAVAILABLE'];
/** Observational diagnostics only: these do not satisfy any acceptance assertion. */
export function observeClientEvidence(state: ClientEvents, event: any): void {
  const item = event?.item;
  let tool: string | undefined, result: any, message = '';
  if (event?.type === 'item.completed' && item?.type === 'mcp_tool_call' && item.server === 'socom2legacy' && MCP_TOOLS.includes(item.tool)) {
    tool = item.tool; result = item.result?.structured_content;
    if (!result) try { result = JSON.parse(item.result?.content?.find((b: any) => b.type === 'text')?.text ?? 'null'); } catch { /* no structured refusal */ }
    message = typeof item.error?.message === 'string' ? item.error.message : '';
  }
  if (event?.type === 'assistant' && Array.isArray(event.message?.content)) for (const block of event.message.content) {
    if (block.type === 'tool_use' && MCP_TOOLS.some(name => block.name === `mcp__socom2legacy__${name}`)) {
      const name = block.name.replace('mcp__socom2legacy__', ''); state.mcpTools ??= {}; state.mcpTools[name] = Math.min((state.mcpTools[name] ?? 0) + 1, 1_000_000);
    }
  }
  if (tool) { state.mcpTools ??= {}; state.mcpTools[tool] = Math.min((state.mcpTools[tool] ?? 0) + 1, 1_000_000); }
  if (REFUSAL_CODES.includes(result?.code)) { state.refusalCodes ??= []; if (!state.refusalCodes.includes(result.code)) state.refusalCodes.push(result.code); }
  if (event?.type === 'item.completed' && ['error', 'agent_message'].includes(item?.type)) message = item.message ?? item.text ?? '';
  if (event?.type === 'assistant') message += (event.message?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const signals = [
    /\b(?:requires approval|approval policy|approval is required|blocked by.{0,30}approval)\b/i.test(message) && 'MCP_APPROVAL_REQUIRED',
    /code.mode host is disabled/i.test(message) && 'CODE_MODE_HOST_DISABLED',
    /(?:no .{0,40}tools (?:are )?(?:directly )?(?:exposed|available)|tools? (?:is|are) unavailable)/i.test(message) && 'MCP_TOOLS_UNAVAILABLE',
  ].filter(Boolean) as string[];
  for (const signal of signals) { state.failureSignals ??= []; if (!state.failureSignals.includes(signal)) state.failureSignals.push(signal); }
}
function providerError(value: any): ErrorKind {
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (['invalid_api_key', 'token_expired', 'authentication_required'].includes(code)
    || /\b(?:invalid_api_key|token_expired|authentication_required|401 Unauthorized)\b/i.test(message)) return 'AUTH_REQUIRED';
  if (['rate_limit_exceeded', 'rate_limit_error', 'usage_limit_reached'].includes(code)
    || /\b(?:rate_limit_exceeded|rate_limit_error|usage_limit_reached|429 Too Many Requests)\b/i.test(message)) return 'RATE_LIMIT';
  if (['model_not_found', 'unsupported_model'].includes(code)
    || /\b(?:model_not_found|unsupported_model|model is not supported)\b/i.test(message)) return 'UNSUPPORTED_MODEL';
  if (['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)
    || /\b(?:ECONNRESET|ENOTFOUND|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b/.test(message)) return 'NETWORK';
  return 'UNKNOWN_ERROR';
}
export function unexpectedToolEvent(event: any): UnexpectedEvent | undefined {
  if (typeof event?.type === 'string' && event.type.startsWith('item.') && event.item) {
    const item = event.item;
    if (['agent_message', 'reasoning'].includes(item.type)) return undefined;
    if (item.type === 'mcp_tool_call') {
      const serverMatch = item.server === 'socom2legacy', toolMatch = MCP_TOOLS.includes(item.tool);
      return serverMatch && toolMatch ? undefined : { kind: 'MCP_TOOL_CALL', serverMatch, toolMatch };
    }
    const kind = { command_execution: 'COMMAND_EXECUTION', file_change: 'FILE_CHANGE', web_search: 'WEB_SEARCH',
      collab_tool_call: 'COLLAB_TOOL_CALL', todo_list: 'TODO_LIST', error: 'ERROR_ITEM' }[String(item.type)] as EventKind | undefined;
    return { kind: kind ?? 'UNKNOWN_TYPE', ...(kind === 'ERROR_ITEM' ? { errorKind: providerError(item) } : {}) };
  }
  const allowed = (name: unknown): boolean => typeof name === 'string' && MCP_TOOLS.some(tool => name === `mcp__socom2legacy__${tool}`);
  if (event?.type === 'tool_progress') return allowed(event.tool_name) ? undefined : { kind: 'CLAUDE_TOOL_PROGRESS' };
  const blocks = event?.message?.content;
  if (Array.isArray(blocks) && blocks.some(block => ['tool_use', 'server_tool_use'].includes(block.type) && !allowed(block.name))) return { kind: 'CLAUDE_TOOL_USE' };
  const block = event?.event?.content_block;
  return block && ['tool_use', 'server_tool_use'].includes(block.type) && !allowed(block.name) ? { kind: 'CLAUDE_TOOL_USE' } : undefined;
}
export function safeClientEvents(value: any): ClientEvents {
  const count = (number: unknown): number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000 ? number : 0;
  const first = value?.firstUnexpected;
  const kind: EventKind = EVENT_KINDS.includes(first?.kind) ? first.kind : 'UNKNOWN_TYPE';
  return { jsonLines: count(value?.jsonLines), nonJsonLines: count(value?.nonJsonLines), unexpectedEvents: count(value?.unexpectedEvents), warningEvents: count(value?.warningEvents),
    ...(value?.mcpTools ? { mcpTools: Object.fromEntries(MCP_TOOLS.map(name => [name, count(value.mcpTools[name])])) } : {}),
    ...(Array.isArray(value?.refusalCodes) ? { refusalCodes: REFUSAL_CODES.filter(code => value.refusalCodes.includes(code)) } : {}),
    ...(Array.isArray(value?.failureSignals) ? { failureSignals: FAILURE_SIGNALS.filter(code => value.failureSignals.includes(code)) } : {}),
    ...(value?.firstWarning ? { firstWarning: { kind: 'ERROR_ITEM' as const,
      errorKind: ERROR_KINDS.includes(value.firstWarning.errorKind) ? value.firstWarning.errorKind as ErrorKind : 'UNKNOWN_ERROR' as const } } : {}),
    ...(first ? { firstUnexpected: { kind, ...(kind === 'MCP_TOOL_CALL' ? { serverMatch: first.serverMatch === true, toolMatch: first.toolMatch === true } : {}),
      ...(kind === 'ERROR_ITEM' ? { errorKind: ERROR_KINDS.includes(first.errorKind) ? first.errorKind as ErrorKind : 'UNKNOWN_ERROR' as const } : {}) } } : {}) };
}
