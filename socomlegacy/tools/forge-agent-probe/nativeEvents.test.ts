import { expect, it } from 'vitest';
import { nativeEventRecorder } from './nativeEvents';
import { payload } from './acceptance';

it('records only completed calls from the configured server, preserving actual image blocks', () => {
  const recorder = nativeEventRecorder();
  const item = { id: 'one', type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_request', arguments: { operation: 'target.capture' },
    result: { content: [{ type: 'image', mimeType: 'image/png', data: 'synthetic-image' }], structured_content: { outcome: 'ok' } } };
  recorder.consume({ type: 'item.started', item }); expect(recorder.events).toHaveLength(0);
  recorder.consume({ type: 'item.completed', item }); recorder.consume({ type: 'item.completed', item });
  expect(recorder.events).toHaveLength(1); expect(payload(recorder.events[0])).toEqual({ outcome: 'ok' });
  expect(recorder.events[0]?.result.content[0].type).toBe('image');
  recorder.consume({ type: 'item.completed', item: { ...item, id: 'two', server: 'unrelated' } });
  expect(recorder.events).toHaveLength(1);
});
it('correlates Claude tool results with the exact prior tool use and translates actual image blocks', () => {
  const recorder = nativeEventRecorder();
  recorder.consume({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'call', name: 'mcp__socom2legacy__agent_request', input: { operation: 'target.capture' } }] } });
  recorder.consume({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'unknown', content: 'ignored' },
    { type: 'tool_result', tool_use_id: 'call', content: [{ type: 'text', text: '{"outcome":"ok"}' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'synthetic-image' } }] }] } });
  expect(recorder.events).toHaveLength(1); expect(payload(recorder.events[0])).toEqual({ outcome: 'ok' });
  expect(recorder.events[0]?.result.content[1]).toEqual({ type: 'image', mimeType: 'image/png', data: 'synthetic-image' });
});
it('refuses ambiguous duplicate identities and partial or failed calls cannot become successful evidence', () => {
  const recorder = nativeEventRecorder();
  recorder.consume({ type: 'item.completed', item: { id: 'bad', type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_request', arguments: {}, error: { message: 'private' } } });
  expect(recorder.events[0]?.error).toBe(true); expect(payload(recorder.events[0])).toBeNull();
  expect(JSON.stringify(recorder.events)).not.toContain('private');
  recorder.consume({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'same', name: 'mcp__socom2legacy__agent_pair', input: {} },
    { type: 'tool_use', id: 'same', name: 'mcp__socom2legacy__agent_request', input: {} }] } });
  expect(recorder.invalid()).toBe(true);
});
it('does not mistake item identifiers reused by a fresh CLI invocation for replayed results', () => {
  const recorder = nativeEventRecorder();
  const event = { type: 'item.completed', item: { id: 'item_0', type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_status', arguments: {}, result: { content: [{ type: 'text', text: '{}' }] } } };
  recorder.consume(event); recorder.beginInvocation(); recorder.consume(event);
  expect(recorder.events).toHaveLength(2);
});
