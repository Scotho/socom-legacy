import { expect, it } from 'vitest';
import { unexpectedToolEvent, safeClientEvents, observeClientEvidence, type ClientEvents } from './events';
import { classify, safeReport } from './acceptance';

it('classifies unexpected client items using fixed enums without copying names or content', () => {
  expect(unexpectedToolEvent({ type: 'item.started', item: { type: 'todo_list', text: 'synthetic-private-text' } })).toEqual({ kind: 'TODO_LIST' });
  expect(unexpectedToolEvent({ type: 'item.started', item: { type: 'command_execution', command: 'synthetic-private-command' } })).toEqual({ kind: 'COMMAND_EXECUTION' });
  expect(unexpectedToolEvent({ type: 'item.started', item: { type: 'synthetic-private-type' } })).toEqual({ kind: 'UNKNOWN_TYPE' });
  expect(unexpectedToolEvent({ type: 'item.started', item: { type: 'mcp_tool_call', server: 'synthetic-private-server', tool: 'agent_capabilities' } }))
    .toEqual({ kind: 'MCP_TOOL_CALL', serverMatch: false, toolMatch: true });
});
it('summarizes exact known tool calls, refusal codes and client failure signals without retaining explanation text', () => {
  const state: ClientEvents = { jsonLines: 0, nonJsonLines: 0, unexpectedEvents: 0, warningEvents: 0 };
  observeClientEvidence(state, { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_pair',
    error: { message: 'MCP tool call requires approval, but approval policy is never; synthetic-private' } } });
  observeClientEvidence(state, { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_request',
    result: { structured_content: { outcome: 'refused', code: 'NOT_PAIRED' } } } });
  observeClientEvidence(state, { type: 'item.completed', item: { type: 'agent_message', text: 'Tool call blocked by approval policy; synthetic-private' } });
  const report = safeClientEvents({ ...state, mcpTools: { ...state.mcpTools, 'synthetic-private': 123 }, refusalCodes: [...state.refusalCodes!, 'synthetic-private'] });
  expect(report.mcpTools?.agent_pair).toBe(1); expect(report.mcpTools?.agent_request).toBe(1);
  expect(report.refusalCodes).toEqual(['NOT_PAIRED']); expect(report.failureSignals).toContain('MCP_APPROVAL_REQUIRED');
  expect(JSON.stringify(report)).not.toContain('synthetic-private');
});
it('persists only bounded numeric counts, fixed enums and MCP match booleans', () => {
  const raw = { jsonLines: 3, nonJsonLines: 1, unexpectedEvents: 1, stdout: 'synthetic-private-stdout',
    firstUnexpected: { kind: 'MCP_TOOL_CALL', serverMatch: false, toolMatch: true, server: 'synthetic-private-server' } };
  const expected = { jsonLines: 3, nonJsonLines: 1, unexpectedEvents: 1, warningEvents: 0, firstUnexpected: { kind: 'MCP_TOOL_CALL', serverMatch: false, toolMatch: true } };
  expect(safeClientEvents(raw)).toEqual(expected);
  const report = safeReport({ client: 'codex', classification: classify([], { exitCode: 1, approved: false }), clientEvents: raw });
  expect(report.clientEvents).toEqual(expected); expect(JSON.stringify(report)).not.toContain('synthetic-private');
  expect(safeClientEvents({ jsonLines: NaN, nonJsonLines: 'secret', unexpectedEvents: -1, firstUnexpected: { kind: 'synthetic-private-type' } }))
    .toEqual({ jsonLines: 0, nonJsonLines: 0, unexpectedEvents: 0, warningEvents: 0, firstUnexpected: { kind: 'UNKNOWN_TYPE' } });
});
it('classifies provider error items only through fixed known codes and never echoes their message', () => {
  for (const [code, errorKind] of [['invalid_api_key', 'AUTH_REQUIRED'], ['rate_limit_exceeded', 'RATE_LIMIT'],
    ['unsupported_model', 'UNSUPPORTED_MODEL'], ['ECONNRESET', 'NETWORK'], ['synthetic-sensitive-code', 'UNKNOWN_ERROR']]) {
    const summary = unexpectedToolEvent({ type: 'item.completed', item: { type: 'error', code, message: 'synthetic-sensitive-message' } });
    expect(summary).toEqual({ kind: 'ERROR_ITEM', errorKind });
    expect(JSON.stringify(summary)).not.toContain('synthetic-sensitive');
  }
});
