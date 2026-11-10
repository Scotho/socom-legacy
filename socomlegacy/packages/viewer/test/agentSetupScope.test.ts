import { describe, expect, it } from 'vitest';
import { agentSetupRows } from '../src/agent/setup';

/**
 * LATER 425 (browser adaptation): Claude Code's setup offers the user scope (every project) and, beside it, the local
 * scope (this project only); Codex's names no scope. FP-14: step 1's rows (`agentSetupRows`), each a whole command.
 */
describe('LATER 425: the Claude Code setup offers both scopes', () => {
  const at = 'http://127.0.0.1:5360';
  it('the user scope first, then the local scope, each a whole command for the same endpoint', () => {
    const rows = agentSetupRows('claude', at);
    expect(rows.map((r) => r.text)).toEqual([
      'claude mcp add --transport http --scope user socom2legacy http://127.0.0.1:5360/mcp',
      'claude mcp add --transport http --scope local socom2legacy http://127.0.0.1:5360/mcp',
    ]);
    expect(rows.map((r) => r.caption)).toEqual(['Every project', 'Or this project only']);
  });
  it('Codex\'s setup names no scope', () => {
    expect(agentSetupRows('codex', at).map((r) => r.text).join('\n')).not.toContain('--scope');
  });
});
