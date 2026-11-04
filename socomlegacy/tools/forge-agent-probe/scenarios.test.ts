import { expect, it } from 'vitest';
import { creatorPrompt, pairPrompt, reconnectPrompt } from './scenarios';
import { isUnexpectedToolEvent } from './client';

it('permits only read-only discovery of this server while keeping creator operations restricted', () => {
  for (const prompt of [creatorPrompt('test'), pairPrompt('test', 'denial'), reconnectPrompt('test', {})]) {
    expect(prompt).toContain("client's read-only tool discovery/search");
    expect(prompt).toContain('agent_capabilities, agent_status, agent_pair, agent_request, agent_disconnect');
    expect(prompt).toContain('Never use shell, local file tools, web search, other apps, or Play');
  }
  for (const type of ['web_search', 'command_execution', 'file_change', 'unknown_tool_search']) {
    expect(isUnexpectedToolEvent({ type: 'item.started', item: { type } })).toBe(true);
  }
});
