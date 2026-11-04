// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';
import config from '../vite.config';
import { DEV_LOCAL_PROXY_PREFIXES, DEV_PROXY_PORT_VAR, devLocalProxy } from '../devProxy';

/**
 * MU-6's dev-only proxy (a development adaptation, no original): with its own opt-in `S2U_DEV_PROXY_PORT` set (never
 * `VITE_S2U_LOCAL_PORT`, which the owner's dev server and the e2e run already set for another purpose), the dev server --
 * and only the dev server, never a build or `vite preview` -- forwards the modern Lobby tab's same-origin requests to a
 * local match server, keeping the page's `Origin` (`changeOrigin: false`) so the server's `ALLOWED_ORIGINS` check is
 * the real one. Unset, nothing changes.
 */
const PORT_VAR = 'S2U_DEV_PROXY_PORT';
const LOCAL_VAR = 'VITE_S2U_LOCAL_PORT';
const held = { [PORT_VAR]: process.env[PORT_VAR], [LOCAL_VAR]: process.env[LOCAL_VAR] };
afterEach(() => {
  for (const [k, v] of Object.entries(held)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

type ConfigFn = (env: { command: 'build' | 'serve'; mode: string; isPreview?: boolean }) => UserConfig;
const resolveConfig = (command: 'build' | 'serve', isPreview = false): UserConfig => (config as unknown as ConfigFn)({ command, mode: command === 'build' ? 'production' : 'development', isPreview });

describe('the dev-only local proxy (MU-6)', () => {
  it('names exactly the Lobby tab\'s prefixes', () => {
    expect([...DEV_LOCAL_PROXY_PREFIXES]).toEqual(['/account', '/lobby', '/modern', '/rooms', '/health', '/texts', '/replays', '/api']);
  });

  it('the dev server proxies exactly those prefixes to the local port, Origin unchanged, when the variable is set', () => {
    process.env[PORT_VAR] = '5424';
    const proxy = resolveConfig('serve').server?.proxy as Record<string, { target: string; changeOrigin: boolean; ws?: boolean }>;
    expect(proxy).toBeDefined();
    expect(Object.keys(proxy).sort()).toEqual(['/account', '/api', '/health', '/lobby', '/modern', '/replays', '/rooms', '/texts'])
    expect(Object.keys(proxy)).not.toContain('/ws');
    for (const p of Object.values(proxy)) {
      expect(p.target).toBe('http://localhost:5424');
      expect(p.changeOrigin).toBe(false);
      expect(p.ws ?? false).toBe(false);
    }
  });

  it('no proxy when the variable is unset', () => {
    delete process.env[PORT_VAR];
    expect(resolveConfig('serve').server?.proxy).toBeUndefined();
  });

  it("VITE_S2U_LOCAL_PORT alone never turns the proxy on (the owner's dev server and the e2e run set it)", () => {
    delete process.env[PORT_VAR];
    process.env[LOCAL_VAR] = '8787';
    expect(resolveConfig('serve').server?.proxy).toBeUndefined();
    expect(devLocalProxy({ [LOCAL_VAR]: '8787' }, 'serve', false)).toBeUndefined();
  });

  it("the opt-in is not VITE_-prefixed, so it never reaches the page's bundle", () => {
    expect(DEV_PROXY_PORT_VAR).toBe('S2U_DEV_PROXY_PORT');
    expect(DEV_PROXY_PORT_VAR.startsWith('VITE_')).toBe(false);
  });

  it('a build and the preview server never proxy, the variable set or not', () => {
    process.env[PORT_VAR] = '5424';
    for (const c of [resolveConfig('build'), resolveConfig('serve', true)]) {
      expect(c.server?.proxy).toBeUndefined();
      expect(c.preview?.proxy).toBeUndefined();
    }
  });

  it('the rest of the dev server is unchanged (its port and strictness)', () => {
    process.env[PORT_VAR] = '5424';
    const on = resolveConfig('serve').server;
    delete process.env[PORT_VAR];
    const off = resolveConfig('serve').server;
    expect({ ...on, proxy: undefined }).toEqual({ ...off, proxy: undefined });
  });

  it('refuses a value that is not a port', () => {
    for (const bad of ['abc', '0', '70000', '5424; rm']) {
      expect(() => devLocalProxy({ [PORT_VAR]: bad }, 'serve', false)).toThrow(/S2U_DEV_PROXY_PORT/);
    }
    expect(devLocalProxy({}, 'serve', false)).toBeUndefined();
    expect(devLocalProxy({ [PORT_VAR]: '' }, 'serve', false)).toBeUndefined();
    expect(devLocalProxy({ [PORT_VAR]: '5424' }, 'build', false)).toBeUndefined();
    expect(devLocalProxy({ [PORT_VAR]: '5424' }, 'serve', true)).toBeUndefined();
  });
});
