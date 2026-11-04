import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
const state = { directories: [] as string[], calls: [] as string[], failLogout: false, failLogin: false };
// Explicit process-only seam: the ordinary tools gate shares a module graph, so module mocks are unsafe here.
const runtime = { installedClient: () => ({ executable: 'synthetic-client', prefix: [] }), launchChild: async (options: any) => {
  state.directories.push(options.directory); state.calls.push(options.args.join(' '));
  if (options.args.includes('login')) await options.dialogue('http://127.0.0.1:5400/authorize?state=s&redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fcallback&code_challenge=c&code_challenge_method=S256&response_type=code');
  if (options.args.includes('login') && state.failLogin) return { exitCode: 1, timedOut: false, outputError: false };
  if (options.args.includes('logout') && state.failLogout) return { exitCode: 1, timedOut: false, outputError: false };
  return { exitCode: 0, timedOut: false, outputError: false };
}, loadAccessOnlySubscription: async () => ({}), nativeGuestConsent: async () => 'http://127.0.0.1:54321/callback?state=s&code=synthetic' };
import { withNativeClient } from './nativeClient';
it('logs out and removes the restricted native profile after successful work and partial work failure', async () => {
  for (const fail of [false, true]) {
    state.calls = []; state.directories = [];
    const run = withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, phase: () => {} }, async client => {
      await client.run('synthetic prompt'); if (fail) throw Error('synthetic work failure'); return 'done';
    }, runtime);
    if (fail) await expect(run).rejects.toThrow('synthetic work failure'); else expect(await run).toBe('done');
    expect(state.calls.some(call => call.includes('mcp login --no-browser socom2legacy'))).toBe(true);
    expect(state.calls.at(-1)).toBe('mcp logout socom2legacy');
    for (const directory of state.directories) expect(existsSync(directory)).toBe(false);
  }
  // Two complete profile lifecycles include Windows ACL subprocesses and bounded cleanup retries.
}, 30_000);
it('refuses a nonzero native login before work and removes its partial credential directory', async () => {
  state.failLogin = true; state.directories = []; let workRan = false;
  try {
    await expect(withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, phase: () => {} },
      async () => { workRan = true; }, runtime)).rejects.toThrow('NATIVE_CLIENT_OAUTH_FAILED');
    expect(workRan).toBe(false);
    for (const directory of state.directories) expect(existsSync(directory)).toBe(false);
  } finally { state.failLogin = false; }
});
it('fails logout without keeping the native OAuth credential directory', async () => {
  state.failLogout = true; state.directories = [];
  try {
    await expect(withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, phase: () => {} }, async () => 'done', runtime))
      .rejects.toThrow('NATIVE_CLIENT_LOGOUT_FAILED');
    for (const directory of state.directories) expect(existsSync(directory)).toBe(false);
  } finally { state.failLogout = false; }
});
it('LATER 448: bounds every step by the client profile lifetime budget, not one step each', async () => {
  const timeouts: number[] = []; const directories: string[] = [];
  const slow = { ...runtime, launchChild: async (options: any) => {
    timeouts.push(options.timeoutMs); directories.push(options.directory);
    if (!options.args.includes('login') && !options.args.includes('logout')) await new Promise(done => setTimeout(done, 400));
    return runtime.launchChild(options);
  } };
  await expect(withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, budgetMs: 600, phase: () => {} },
    async client => { await client.run('first'); await client.run('second'); return 'done'; }, slow)).rejects.toThrow('NATIVE_CLIENT_BUDGET_EXHAUSTED');
  // Each launch is given at most what is left of the profile's budget, so the whole profile ends within it.
  expect(timeouts.length).toBeGreaterThan(1);
  for (const timeout of timeouts) expect(timeout).toBeLessThanOrEqual(600);
  for (const directory of directories) expect(existsSync(directory)).toBe(false);
}, 30_000);
it('reserves one step of the budget for the logout, so spent work still logs the guest token out', async () => {
  const calls: string[] = []; const directories: string[] = [];
  const timed = (work: number) => ({ ...runtime, launchChild: async (options: any) => {
    calls.push(options.args.join(' ')); directories.push(options.directory);
    if (!options.args.includes('login') && !options.args.includes('logout')) await new Promise(done => setTimeout(done, work));
    return runtime.launchChild(options);
  } });
  // The work spends past its share (the budget minus the logout's step): its next run is refused, the logout runs.
  await expect(withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, budgetMs: 2000, phase: () => {} },
    async client => { await client.run('first'); await client.run('second'); return 'done'; }, timed(1300))).rejects.toThrow('NATIVE_CLIENT_BUDGET_EXHAUSTED');
  expect(calls.at(-1)).toBe('mcp logout socom2legacy');
  for (const directory of directories) expect(existsSync(directory)).toBe(false);
}, 30_000);
it('keeps the work\'s own error first when the logout fails too, the logout\'s attached as the second', async () => {
  const slow = { ...runtime, launchChild: async (options: any) => {
    if (!options.args.includes('login') && !options.args.includes('logout')) await new Promise(done => setTimeout(done, 2300));
    return runtime.launchChild(options);
  } };
  const failure = await withNativeClient({ client: 'codex', endpoint: 'http://127.0.0.1:5400/mcp', context: {} as any, timeoutMs: 5000, budgetMs: 2000, phase: () => {} },
    async client => { await client.run('first'); throw Error('synthetic work failure'); }, slow).then(() => undefined, (error: unknown) => error);
  expect((failure as Error).message).toBe('synthetic work failure');
  expect(((failure as { logoutError?: Error }).logoutError)?.message).toBe('NATIVE_CLIENT_BUDGET_EXHAUSTED');
}, 30_000);
