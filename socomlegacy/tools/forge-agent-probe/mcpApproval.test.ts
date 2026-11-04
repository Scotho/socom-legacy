import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { clientInvocation, withIsolatedProfile } from './isolation';
const tools = ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'];
it('preapproves exactly the five isolated loopback MCP tools while retaining global and builtin restrictions', async () => {
  await withIsolatedProfile(async directory => {
    const invocation = clientInvocation('codex', directory, 'http://127.0.0.1:5400/mcp', '', {});
    const config = readFileSync(invocation.configPath, 'utf8');
    expect(config).toContain('approval_policy = "never"');
    expect(JSON.parse(config.match(/^enabled_tools = (.+)$/m)?.[1] ?? 'null')).toEqual(tools);
    const tables = [...config.matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map(match => match[1]);
    expect(tables).toEqual(['socom2legacy', ...tools.map(name => `socom2legacy.tools.${name}`)]);
    for (const name of tools) expect(config).toContain(`[mcp_servers.socom2legacy.tools.${name}]\napproval_mode = "approve"`);
    expect(config.match(/approval_mode = "approve"/g)).toHaveLength(5);
    expect(config).not.toContain('default_tools_approval_mode');
    expect(invocation.args.slice(invocation.args.indexOf('--sandbox'), invocation.args.indexOf('--sandbox') + 2)).toEqual(['--sandbox', 'read-only']);
    for (const name of ['shell_tool', 'view_image', 'apps', 'browser_use', 'computer_use', 'multi_agent']) expect(config).toContain(`${name} = false`);
    for (const endpoint of ['http://unrelated.invalid/mcp', 'http://name:password@127.0.0.1:5400/mcp', 'http://127.0.0.1:5400/mcp?token=synthetic'])
      expect(() => clientInvocation('codex', directory, endpoint, '', {})).toThrow('PROXY_MUST_BE_LOOPBACK');
  });
});
