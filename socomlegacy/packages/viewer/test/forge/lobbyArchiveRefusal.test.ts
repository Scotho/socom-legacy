import { describe, expect, it } from 'vitest';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { createLobby } from '../../src/forge/lobbyClient';

/**
 * CMV-0 (LATER 963; product track, a browser adaptation): a Forge create refused because its layout names an archive that
 * is not one of SOCOM II's own disc's (central's 400 `{ refused: 'archive', map }`, `forgeLobbyHttp.ts`) is said in words
 * that name the archive -- never the bare "refused" -- and a name not of an archive stem's shape is never shown. A fake
 * fetch answers; names invented.
 */

const BASE = 'https://forge.test';
const layout = (): Layout => emptyLayout({ kind: 'map', archive: 'MP2' });
const answering = (status: number, body: unknown): typeof fetch =>
  (async () => ({ status, ok: false, json: async () => body }) as unknown as Response) as typeof fetch;

describe('CMV-0: the create refused for an archive off the disc\'s list, in words', () => {
  it('400 { refused: archive, map: MP54 } names MP54 and says it is not one of the disc\'s archives', async () => {
    const a = await createLobby(BASE, 'BOXES', layout(), null, answering(400, { refused: 'archive', map: 'MP54' }));
    expect(a).toMatchObject({ ok: false, status: 400 });
    if (a.ok) throw new Error('made');
    expect(a.words).toBe('MP54 is not one of the disc\'s archives: an online lobby plays the disc\'s own maps.');
    expect(a.words).toContain('MP54');
    expect(a.words).toContain('not one of the disc\'s archives');
  });

  it('a map that is not a stem (\'?\', markup) is never shown: the archive is not named', async () => {
    for (const map of ['?', '<b>x</b>']) {
      const a = await createLobby(BASE, 'BOXES', layout(), null, answering(400, { refused: 'archive', map }));
      if (a.ok) throw new Error('made');
      expect(a.words).toBe('The layout names an archive that is not one of the disc\'s archives: an online lobby plays the disc\'s own maps.');
      expect(a.words).not.toContain('<b>');
    }
  });
});
