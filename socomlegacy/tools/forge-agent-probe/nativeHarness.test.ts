import { expect, it } from 'vitest';
import { nativeCaseBudgetMs } from './nativeHarness';
it('LATER 448: a native case budget covers every bounded step of the client profile', () => {
  const step = 240_000;
  // Claude registers the server first; every case logs in and logs out around its model invocations.
  expect(nativeCaseBudgetMs('claude', 'creator', step)).toBeGreaterThanOrEqual(4 * step);
  expect(nativeCaseBudgetMs('codex', 'creator', step)).toBeGreaterThanOrEqual(3 * step);
  expect(nativeCaseBudgetMs('claude', 'reconnect', step)).toBeGreaterThanOrEqual(5 * step);
  expect(nativeCaseBudgetMs('codex', 'expiry', step)).toBeGreaterThanOrEqual(3 * step + 301_000);
});
it('the access-snapshot validity the run notes document at the default step (run.ts HELP)', () => {
  const validity = (client: 'codex' | 'claude', name: string) => (nativeCaseBudgetMs(client, name, 240_000) + 300_000) / 1000;
  expect(['creator', 'denial', 'reconnect', 'expiry'].map(name => validity('claude', name))).toEqual([1320, 1320, 1560, 1621]);
  expect(['creator', 'denial', 'reconnect', 'expiry'].map(name => validity('codex', name))).toEqual([1080, 1080, 1320, 1381]);
});
