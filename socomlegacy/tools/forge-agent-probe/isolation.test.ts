import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withIsolatedProfile, clientInvocation } from './isolation';
import { nativeInvocation } from './nativeClient';

describe('temporary real-client profiles', () => {
  it('removes all temporary resources after success or partial setup failure', async () => {
    let location = '';
    await expect(withIsolatedProfile(async dir => { location = dir; writeFileSync(join(dir, 'credential'), 'synthetic-secret'); throw Error('child failed'); })).rejects.toThrow('child failed');
    expect(existsSync(location)).toBe(false);
    await withIsolatedProfile(async dir => { location = dir; writeFileSync(join(dir, 'output'), 'temporary'); });
    expect(existsSync(location)).toBe(false);
  });
  it('keeps tokens out of configuration and arguments and disables persistence', async () => {
    await withIsolatedProfile(async dir => {
      for (const client of ['codex', 'claude'] as const) {
        const synthetic = ['do', 'not', 'write'].join('-');
        const invocation = clientInvocation(client, dir, 'http://127.0.0.1:5400/mcp', 'prompt', { SYNTHETIC_SECRET: synthetic });
        const combined = invocation.args.join(' ') + readFileSync(invocation.configPath, 'utf8');
        expect(combined).not.toContain('do-not-write');
        expect(combined).not.toContain('--scope user');
        expect(invocation.env.CODEX_HOME).toBe(dir);
        expect(invocation.env.CLAUDE_CONFIG_DIR).toBe(dir);
        expect(invocation.args).toContain(client === 'codex' ? '--ephemeral' : '--no-session-persistence');
      }
    });
  });
  it('does not inherit provider credentials or refresh material into either client', async () => {
    await withIsolatedProfile(async dir => {
      const material = ['synthetic', 'refresh'].join('-');
      for (const client of ['codex', 'claude'] as const) {
        const invocation = clientInvocation(client, dir, 'http://127.0.0.1:5400/mcp', 'prompt', {
          PATH: process.env.PATH, CLAUDE_CODE_OAUTH_REFRESH_TOKEN: material, CODEX_API_KEY: material, OPENAI_API_KEY: material,
          ANTHROPIC_API_KEY: material, ANTHROPIC_AUTH_TOKEN: material, CLAUDE_CODE_OAUTH_TOKEN: material,
        });
        expect(Object.values(invocation.env).some(value => value?.includes(material))).toBe(false);
      }
    });
  });
  it('disables supported Codex builtin features and empties Claude builtin tools', async () => {
    await withIsolatedProfile(async dir => {
      const codex = clientInvocation('codex', dir, 'http://127.0.0.1:5400/mcp', '', {});
      const config = readFileSync(codex.configPath, 'utf8');
      for (const feature of ['shell_tool', 'view_image', 'multi_agent']) expect(config).toContain(`${feature} = false`);
      const claude = clientInvocation('claude', dir, 'http://127.0.0.1:5400/mcp', '', {});
      expect(claude.args[claude.args.indexOf('--tools') + 1]).toBe('');
    });
  });
  it('forces native Codex OAuth into the isolated file store and preserves strict model restrictions', async () => {
    await withIsolatedProfile(async dir => {
      const invocation = nativeInvocation('codex', dir, 'http://127.0.0.1:5400/mcp', {}, {});
      const config = readFileSync(invocation.configPath, 'utf8');
      expect(config).toContain('mcp_oauth_credentials_store = "file"');
      expect(config).toContain('cli_auth_credentials_store = "file"');
      expect(config).toContain('shell_tool = false');
      expect(config).not.toMatch(/bearer_token|refresh_token/);
      expect(invocation.args).toContain('--ephemeral');
    });
  });
});
