// @vitest-environment node
/**
 * LCM-16 (the LCM plan; LCM.R18 (e)): the dev server still serves `/match/<id>` and `/player/<name>` now that each is its
 * own document (`leaderboard/match/index.html`, `leaderboard/player/index.html`) -- central injects the head in
 * production; in development and preview `statsDocumentFor` rewrites the page's address to its document. A development
 * adaptation (product track): nothing of the game.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { statsDocumentFor } from '../vite.config';

describe('LCM-16: the dev rewrite of /match/<id> and /player/<name> to their documents', () => {
  it('a page request under the base is rewritten to its document, the query kept', () => {
    expect(statsDocumentFor('/match/41-3-5', '/', 'text/html,application/xhtml+xml')).toBe('/leaderboard/match/index.html');
    expect(statsDocumentFor('/match/41-3-5?x=1', '/', 'text/html')).toBe('/leaderboard/match/index.html?x=1');
    expect(statsDocumentFor('/player/Ghost%20Line', '/', undefined)).toBe('/leaderboard/player/index.html');
    expect(statsDocumentFor('/socomlegacy/player/Ghostline/', '/socomlegacy/', 'text/html')).toBe('/socomlegacy/leaderboard/player/index.html');
  });

  it('anything else is left alone: the bare segment, a nested path, another base, a fetch for JSON, another page', () => {
    for (const [url, prefix, accept] of [
      ['/match', '/', 'text/html'], ['/match/', '/', 'text/html'], ['/match/a/b', '/', 'text/html'], ['/matches/1', '/', 'text/html'],
      ['/player/x', '/socomlegacy/', 'text/html'], ['/match/41-3-5', '/', 'application/json'], ['/leaderboard', '/', 'text/html'],
      ['/api/stats/match/41-3-5', '/', 'text/html'],
    ] as const) expect(statsDocumentFor(url, prefix, accept), url).toBeNull();
  });

  it('the rewrite runs in the dev server and in preview, and the two documents are build inputs', () => {
    const src = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(src.match(/statsPageRoutes\(server\.middlewares, server\.config\.base\)/g)).toHaveLength(2);
    expect(src).toMatch(/match: join\(here, 'leaderboard\/match\/index\.html'\)/);
    expect(src).toMatch(/player: join\(here, 'leaderboard\/player\/index\.html'\)/);
  });
});
