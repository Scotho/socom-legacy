// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ calls: [] as string[], failRecorder: false }));
vi.mock('../src/clientErrorBeacon', () => ({ pageClientErrorBeacon: () => ({}),
  installClientErrorBeacon: () => { probe.calls.push('capture'); } }));
vi.mock('../src/pwa/boot', () => ({ startPwa: () => { probe.calls.push('pwa'); } }));
vi.mock('../src/pageEntry', () => ({ bootPage: async () => { probe.calls.push('boot'); } }));
vi.mock('../src/xboxDiagnostics', () => ({ installXboxDiagnostics: () => {
  probe.calls.push('recorder'); if (probe.failRecorder) throw new Error('recorder unavailable');
} }));

afterEach(() => { probe.calls.length = 0; probe.failRecorder = false; window.history.replaceState(null, '', '/'); vi.resetModules(); });

it.each([['', false, ['capture', 'pwa', 'boot']],
  ['?xboxdiag=1', false, ['capture', 'pwa', 'recorder', 'boot']],
  ['?xboxdiag=1', true, ['capture', 'pwa', 'recorder', 'boot']]] as const)(
  'installs error capture before game boot for %s (recorder failure %s)', async (search, failure, expected) => {
    window.history.replaceState(null, '', `/${search}`); probe.failRecorder = failure;
    await import('../src/entry');
    await vi.waitFor(() => expect(probe.calls).toEqual(expected));
  },
);
