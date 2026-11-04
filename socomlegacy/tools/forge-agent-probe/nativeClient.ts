/** Product adaptation: one isolated installed-client profile across native OAuth, real tools and logout. */
import { readFileSync, writeFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';
import { clientInvocation, loadAccessOnlySubscription, withIsolatedProfile, type ClientName } from './isolation';
import { installedClient, launchChild, type CliResult, type ClientMessage } from './client';
import { authorizationFromLine, nativeGuestConsent } from './nativeOAuth';
import { nativeEventRecorder } from './nativeEvents';
import { setupStage } from './diagnostics';
import { launchPtyLogin } from './ptyLogin';
interface NativeRuntime {
  installedClient: typeof installedClient; launchChild: typeof launchChild;
  loadAccessOnlySubscription: typeof loadAccessOnlySubscription; nativeGuestConsent: typeof nativeGuestConsent;
  launchLogin?: typeof launchChild;
}
const installedRuntime: NativeRuntime = { installedClient, launchChild, loadAccessOnlySubscription, nativeGuestConsent, launchLogin: launchPtyLogin };

export function nativeInvocation(client: ClientName, directory: string, endpoint: string, environment: NodeJS.ProcessEnv, access: NodeJS.ProcessEnv) {
  // Claude's file storage is verified on Windows. Other platforms may use OS keychains; refuse until measured.
  if (client === 'claude' && process.platform !== 'win32') throw Error('NATIVE_CLAUDE_FILE_STORE_UNVERIFIED');
  const invocation = clientInvocation(client, directory, endpoint, '', environment, access);
  if (client === 'codex') writeFileSync(invocation.configPath,
    'cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n' + readFileSync(invocation.configPath, 'utf8'), { mode: 0o600 });
  return invocation;
}
export async function withNativeClient<T>(options: { client: ClientName; endpoint: string; context: BrowserContext; timeoutMs: number;
  budgetMs?: number; signal?: AbortSignal; onMessage?: (message: ClientMessage) => void; phase: (phase: string) => void }, work: (client: { events: ReturnType<typeof nativeEventRecorder>['events'];
  run: (prompt: string) => Promise<CliResult>; invalid: () => boolean }) => Promise<T>, runtime: NativeRuntime = installedRuntime): Promise<T> {
  const environment = process.env;
  const binary = await setupStage('CLIENT_LOOKUP', 'INSTALLED_CLIENT_REQUIRED', () => runtime.installedClient(options.client, environment));
  return withIsolatedProfile(async directory => {
    const access = await setupStage('CLIENT_AUTH_SNAPSHOT', 'ACCESS_SNAPSHOT_FAILED', () => runtime.loadAccessOnlySubscription(options.client, directory, environment, options.budgetMs ?? options.timeoutMs));
    const invocation = await setupStage('CLIENT_CONFIG_WRITE', 'CLIENT_CONFIG_WRITE_FAILED', () => nativeInvocation(options.client, directory, options.endpoint, environment, access));
    const lifetime = new AbortController(), recorder = nativeEventRecorder();
    const abort = () => lifetime.abort(); options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    // The budget bounds the profile's whole lifetime (the access snapshot's validity), not each step: every launch,
    // logout included, gets at most what is left of it, and none starts once it is spent (LATER 448). The last step
    // is the logout's: the login and the work end one launch step before the deadline (half the budget when it is
    // under two steps), so spent work still revokes the guest token.
    const budget = options.budgetMs ?? options.timeoutMs, deadline = Date.now() + budget;
    const workDeadline = deadline - Math.min(options.timeoutMs, budget / 2);
    const launch = (args: string[], prompt = '', onEvent?: (event: any) => void, dialogue?: (line: string) => Promise<string | undefined>) => {
      const remaining = (args.includes('logout') ? deadline : workDeadline) - Date.now();
      if (remaining <= 0) return Promise.reject(Error('NATIVE_CLIENT_BUDGET_EXHAUSTED'));
      return (options.client === 'claude' && args.includes('login') ? runtime.launchLogin ?? runtime.launchChild : runtime.launchChild)({ executable: binary.executable, args: [...binary.prefix, ...args], directory, env: invocation.env,
        prompt, timeoutMs: Math.min(options.timeoutMs, remaining), signal: lifetime.signal, onEvent, dialogue, onMessage: options.onMessage });
    };
    let loggedIn = false, failed: { error: unknown } | undefined;
    try {
      options.phase('NATIVE_CLIENT_OAUTH');
      // Use explicit no-browser login rather than `mcp add`, whose Codex implementation auto-opens an OS browser.
      // Piped callback input: pinned codex-rs/cli/src/mcp_login.rs:L135-L189 at 970111f6cb62cc02fe36a82ea7d71b37a2889c97.
      // Endpoint config matches the validated copied setup; no bearer token is injected into the connection.
      if (options.client === 'claude') {
        const added = await launch(['mcp', 'add', '--transport', 'http', '--scope', 'user', 'socom2legacy', options.endpoint]);
        if (added.exitCode !== 0 || added.outputError || added.timedOut) throw Error('NATIVE_SERVER_REGISTRATION_FAILED');
      }
      let authorizationSeen = false;
      const login = await launch(['mcp', 'login', '--no-browser', 'socom2legacy'], '', undefined, async line => {
        // Ignore non-authorization status URLs, which may appear in CLI guidance.
        if (!line.includes('redirect_uri=')) return undefined;
        const auth = authorizationFromLine(line, new URL(options.endpoint).origin);
        if (!auth) return undefined;
        if (authorizationSeen) throw Error('NATIVE_OAUTH_REPEATED_AUTHORIZATION');
        authorizationSeen = true;
        return runtime.nativeGuestConsent(options.context, auth, lifetime.signal);
      });
      if (!authorizationSeen || login.exitCode !== 0 || login.outputError || login.timedOut) throw Error('NATIVE_CLIENT_OAUTH_FAILED');
      loggedIn = true;
      return await work({ events: recorder.events, invalid: recorder.invalid, run: prompt => { recorder.beginInvocation(); return launch(invocation.args, prompt, recorder.consume); } });
    } catch (error) { failed = { error }; throw error; }
    finally {
      try {
        if (loggedIn && !lifetime.signal.aborted) {
          options.phase('NATIVE_CLIENT_LOGOUT');
          const logout = await launch(['mcp', 'logout', 'socom2legacy']);
          if (logout.exitCode !== 0 || logout.outputError || logout.timedOut) throw Error('NATIVE_CLIENT_LOGOUT_FAILED');
        }
      } catch (logoutError) {
        // A failed logout after failed work keeps the work's error first, the logout's attached as the second.
        if (!failed) throw logoutError;
        if (failed.error && typeof failed.error === 'object') Object.assign(failed.error, { logoutError });
      } finally { lifetime.abort(); options.signal?.removeEventListener('abort', abort); }
    }
  });
}
