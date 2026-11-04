/** Product adaptation: temporary client configuration; never mutates the user's real profiles. */
import { mkdtemp, chmod, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { accessOnlyCredential } from './credentials';
import { setupStage } from './diagnostics';
export type ClientName = 'codex' | 'claude';
const execute = promisify(execFile);
async function restrictDirectory(directory: string): Promise<void> {
  if (process.platform !== 'win32') { await chmod(directory, 0o700); return; }
  // Git Bash also ships whoami.exe; shell PATH must not choose a different tool for Windows ACL setup.
  const system = join(process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows', 'System32');
  const { stdout } = await execute(join(system, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { windowsHide: true });
  const sid = stdout.match(/S-1-[\d-]+/)?.[0];
  if (!sid) throw Error('PROFILE_PERMISSIONS_FAILED');
  await execute(join(system, 'icacls.exe'), [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { windowsHide: true });
}
export async function withIsolatedProfile<T>(work: (directory: string) => Promise<T>): Promise<T> {
  await setupStage('CLIENT_PROFILE_LOCATION', 'PROFILE_LOCATION_UNSAFE', () => rejectGitAncestor(tmpdir()));
  const directory = await setupStage('CLIENT_PROFILE_CREATE', 'PROFILE_CREATE_FAILED', () => mkdtemp(join(tmpdir(), 'fcw-client-')));
  try { await setupStage('CLIENT_PROFILE_PERMISSIONS', 'PROFILE_PERMISSIONS_FAILED', () => restrictDirectory(directory)); return await work(directory); }
  finally { await setupStage('CLIENT_PROFILE_CLEANUP', 'PROFILE_CLEANUP_FAILED', () => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })); }
}
function rejectGitAncestor(directory: string): void {
  for (let current = resolve(directory); ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) throw Error('EVIDENCE_MUST_BE_OUTSIDE_REPOSITORY');
    if (dirname(current) === current) return;
  }
}
export function clientInvocation(client: ClientName, directory: string, endpoint: string, prompt: string, environment: NodeJS.ProcessEnv, accessEnvironment: NodeJS.ProcessEnv = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/mcp'
    || url.username || url.password || url.search || url.hash) throw Error('PROXY_MUST_BE_LOOPBACK');
  const configPath = join(directory, client === 'codex' ? 'config.toml' : 'mcp.json');
  const operational = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'TERM']);
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(environment).filter(([name]) => operational.has(name.toUpperCase())));
  Object.assign(env, { CODEX_HOME: directory, CLAUDE_CONFIG_DIR: directory, XDG_CONFIG_HOME: directory, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  if (client === 'claude' && accessEnvironment.CLAUDE_CODE_OAUTH_TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = accessEnvironment.CLAUDE_CODE_OAUTH_TOKEN;
  if (client === 'codex') {
    // Effective flags verified with isolated `codex features list`. unified_exec remains client-enforced true;
    // shell_tool=false removes its tool surface, and observed non-MCP execution still fails the run.
    const disabled = ['shell_tool', 'view_image', 'multi_agent', 'multi_agent_v2', 'apps', 'plugins',
      'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'code_mode', 'skill_search', 'sleep_tool', 'goals'];
    // Installed 0.162.1 capability diagnostic: deferred MCP discovery fails closed when this host is disabled.
    // Keep its discovery runtime, while code_mode and external builtin tool surfaces remain disabled; actual
    // command/file/web/unrelated MCP events still terminate the child. This does not grant shell or file access.
    const tools = ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'];
    // Native acceptance measured headless approval blocking agent_pair. Approve only these five tools on this
    // isolated loopback server; browser comparison/grants still authorize page access. Official policy semantics:
    // openai/codex@970111f6cb62cc02fe36a82ea7d71b37a2889c97 core/src/mcp_tool_call.rs:L2439-L2449;
    // server-specific configuration lookup is at L1234-L1248.
    const approvals = tools.map(name => `[mcp_servers.socom2legacy.tools.${name}]\napproval_mode = "approve"`).join('\n');
    writeFileSync(configPath, `approval_policy = "never"\nweb_search = "disabled"\n[features]\ncode_mode_host = true\n${disabled.map(name => `${name} = false`).join('\n')}\n[mcp_servers.socom2legacy]\nurl = ${JSON.stringify(endpoint)}\nenabled_tools = ${JSON.stringify(tools)}\n${approvals}\n`, { mode: 0o600 });
    return { configPath, env, args: ['exec', '--strict-config', '--ephemeral', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', directory, '-'] };
  }
  writeFileSync(configPath, JSON.stringify({ mcpServers: { socom2legacy: { type: 'http', url: endpoint } } }), { mode: 0o600 });
  return { configPath, env, args: ['--print', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--strict-mcp-config', '--mcp-config', configPath, '--setting-sources', '', '--tools', '',
    '--allowedTools', 'mcp__socom2legacy__*', '--permission-mode', 'dontAsk'] };
}
/** Snapshot only an existing sufficiently long-lived access token; original credentials/config are read-only. */
export async function loadAccessOnlySubscription(client: ClientName, directory: string, environment: NodeJS.ProcessEnv, budgetMs: number): Promise<NodeJS.ProcessEnv> {
  const home = environment.USERPROFILE ?? environment.HOME;
  if (!home) throw Error('EXISTING_SUBSCRIPTION_REQUIRED');
  const original = client === 'codex' ? join(environment.CODEX_HOME ?? join(home, '.codex'), 'auth.json')
    : join(environment.CLAUDE_CONFIG_DIR ?? join(home, '.claude'), '.credentials.json');
  let raw: unknown;
  try { raw = JSON.parse(await readFile(original, 'utf8')); } catch { throw Error('EXISTING_SUBSCRIPTION_REQUIRED'); }
  const selected = accessOnlyCredential(client, raw, budgetMs);
  if (selected.claudeAccessToken) return { CLAUDE_CODE_OAUTH_TOKEN: selected.claudeAccessToken };
  await writeFile(join(directory, 'auth.json'), JSON.stringify(selected.codexAuth), { mode: 0o600 });
  return {};
}
export async function outsideRepository(directory: string, repository: string): Promise<string> {
  const target = resolve(directory), root = resolve(repository);
  if (target.toLowerCase() === root.toLowerCase() || target.toLowerCase().startsWith(root.toLowerCase() + sep)) throw Error('EVIDENCE_MUST_BE_OUTSIDE_REPOSITORY');
  rejectGitAncestor(target);
  await mkdir(target, { recursive: true }); return target;
}
