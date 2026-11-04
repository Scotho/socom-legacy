// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bootPage, isForgeAddress, type PageLoaders } from '../../src/pageEntry';

/** FORGE: `<base>forge` (and below it) mounts the forge, a development build's only; every other page is as it was. */
describe('FORGE: the page entry', () => {
  it('reads the forge off the first segment under the base, never elsewhere', () => {
    expect(isForgeAddress('/forge', '/')).toBe(true);
    expect(isForgeAddress('/forge/', '/')).toBe(true);
    expect(isForgeAddress('/socomlegacy/forge?x=1', '/socomlegacy/')).toBe(true);
    expect(isForgeAddress('/testroom', '/')).toBe(false);
    expect(isForgeAddress('/news/forge', '/')).toBe(false);
    expect(isForgeAddress('//evil.com/forge', '/')).toBe(false);          // a path: the slashes collapse, never a host
  });

  it('mounts the forge at /forge when the loader is there (a development build), else the front end as before', async () => {
    const doc = document;
    const mountForge = vi.fn(async () => {});
    const main = vi.fn(async () => ({}));
    const frontEnd = vi.fn(async () => ({ mountFrontEnd: () => null }));
    const withForge: PageLoaders = { main, frontEnd, forge: async () => ({ mountForge }) };
    await expect(bootPage('/forge', doc, withForge, '/')).resolves.toEqual({ entry: 'forge' });
    expect(mountForge).toHaveBeenCalledWith(doc);
    expect(main).not.toHaveBeenCalled();
  });
});
