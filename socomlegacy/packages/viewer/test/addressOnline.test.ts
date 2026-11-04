// test/addressOnline.test.ts -- the address's one online rule (ADDR-ONLINE, web sprint 15; research 243 §8)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addressOnline } from '../src/addressOnline';
import { ADDRESS_ONLINE_TABLE } from './addressOnlineTable';

describe('addressOnline (the page\'s online rule on its address)', () => {
  it.each(ADDRESS_ONLINE_TABLE)('%j -> %s', (search, online) => {
    expect(addressOnline(search)).toBe(online);
  });

  it('a search that is not a string (a caller outside the types) is not online, never a throw', () => {
    expect(addressOnline(undefined as unknown as string)).toBe(false);
    expect(addressOnline({ toString() { throw new Error('x'); } } as unknown as string)).toBe(false);
  });

  it('the module imports nothing (the Node CLI imports it with no page behind it)', () => {
    const src = readFileSync(new URL('../src/addressOnline.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/\bimport\s*\(/);
    expect(src).not.toMatch(/import\.meta|\brequire\s*\(/);
  });
});
