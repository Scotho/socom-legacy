import { describe, expect, it } from 'vitest';
import { connectionInstructions } from '../src/agent/connection';

/**
 * LATER 425 (browser adaptation): Claude Code's copied setup offers the user scope (every project) and, beside it, the
 * local scope (this project only); the other clients' text is unchanged.
 */
describe('LATER 425: the copied Claude Code setup offers both scopes', () => {
  const at = 'http://127.0.0.1:5360';
  it('the user scope first, then the local scope, each a whole command for the same endpoint', () => {
    const text = connectionInstructions('claude', at, 'INV');
    const user = 'claude mcp add --transport http --scope user socom2legacy http://127.0.0.1:5360/mcp';
    const local = 'claude mcp add --transport http --scope local socom2legacy http://127.0.0.1:5360/mcp';
    expect(text).toContain(user);
    expect(text).toContain(local);
    expect(text.indexOf(user)).toBeLessThan(text.indexOf(local));
    expect(text).toContain(`Or, for this project only:\n${local}\n`);   // the command on its own line, to copy whole
    expect(text).toContain('Then authenticate from /mcp in Claude Code.');
  });
  it('Codex\'s setup names no scope', () => {
    expect(connectionInstructions('codex', at, 'INV')).not.toContain('--scope');
  });
});
