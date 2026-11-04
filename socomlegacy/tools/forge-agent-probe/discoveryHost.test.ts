import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { clientInvocation, withIsolatedProfile } from './isolation';
import { isUnexpectedToolEvent } from './client';
it('keeps the host required for deferred MCP discovery while removing external builtin tool surfaces', async () => {
  await withIsolatedProfile(async directory => {
    const invocation = clientInvocation('codex', directory, 'http://127.0.0.1:5400/mcp', '', {});
    const config = readFileSync(invocation.configPath, 'utf8');
    expect(config).toContain('code_mode_host = true');
    for (const feature of ['code_mode', 'shell_tool', 'view_image', 'apps', 'browser_use', 'computer_use']) expect(config).toContain(`${feature} = false`);
    expect(config).toContain('web_search = "disabled"');
    for (const type of ['command_execution', 'file_change', 'web_search', 'unknown_tool_search'])
      expect(isUnexpectedToolEvent({ type: 'item.started', item: { type } })).toBe(true);
  });
});
