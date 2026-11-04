import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExtractedMissError, EXTRACTED_GONE_WORDS } from '../src/discExtractSource';
import { STORED_GONE } from '../src/discStored';
import { EVICTED_LINE } from '../src/discStart';
import { MOVIE_GONE_LINE, movieMissLine, movieMissTeller } from '../src/frontEndMovies';

/**
 * LATER 67 (the merge controller's call, product track; a browser adaptation): a kept movie gone from this browser's
 * storage mid-session said only a console line and ended like a skip. The page now says it once, in the launcher's
 * CHECK DISC words -- only for a `gone` miss, never an `outside` one (a movie cut by design) nor any other failure.
 */
describe('LATER 67: a kept movie gone from storage is said once, in the launcher\'s words', () => {
  it('the line: the launcher\'s CHECK DISC chip and its evicted words, and where to choose the disc again', () => {
    expect(MOVIE_GONE_LINE.startsWith('CHECK DISC: ')).toBe(true);
    expect(MOVIE_GONE_LINE).toContain(EVICTED_LINE.split(':')[0]!.toLowerCase().replace(/^this/, 'this'));
    expect(MOVIE_GONE_LINE).toMatch(/launcher/);
  });

  it('a gone miss is told -- as thrown on the page, and as its words arrive from the movie worker (a message alone)', () => {
    const gone = new ExtractedMissError('MOVIES/SONY448.PSS', 'gone', `MOVIES/SONY448.PSS ${EXTRACTED_GONE_WORDS} (cleared or evicted)`);
    expect(movieMissLine(gone)).toBe(MOVIE_GONE_LINE);
    // The review's F1: the worker hands back the message as a string (`@s2u/fmv` decodeStream's `(e as Error).message`,
    // the page's `pictures.lastEnd.error`), the pictures' only path before the first gesture and at MENULOOP's re-read.
    expect(movieMissLine(`RUN/MOVIES/SONY448.PSS ${EXTRACTED_GONE_WORDS} (cleared or evicted)`), 'the worker\'s string').toBe(MOVIE_GONE_LINE);
    expect(movieMissLine(STORED_GONE), 'the whole extraction gone, from the worker\'s own stored source').toBe(MOVIE_GONE_LINE);
    expect(movieMissLine(new Error(`MOVIES/INTRO_2.PSS ${EXTRACTED_GONE_WORDS} (cleared or evicted)`))).toBe(MOVIE_GONE_LINE);
    expect(movieMissLine(new Error(STORED_GONE)), 'the whole extraction gone').toBe(MOVIE_GONE_LINE);
  });

  it('no line for a movie cut by design (outside), one not extracted yet, a changed file, or any other failure', () => {
    expect(movieMissLine(new ExtractedMissError('MOVIES/X.PSS', 'outside', 'MOVIES/X.PSS is not among the disc\'s files kept in this browser'))).toBeNull();
    expect(movieMissLine(new ExtractedMissError('MOVIES/X.PSS', 'not-done', 'MOVIES/X.PSS is not extracted yet'))).toBeNull();
    expect(movieMissLine(new ExtractedMissError('MOVIES/X.PSS', 'changed', 'MOVIES/X.PSS is stored as 1 bytes, not the disc\'s 2'))).toBeNull();
    for (const e of [new Error('no decoder served'), 'the movie was superseded', 'MOVIES/X.PSS is not among the disc\'s files kept in this browser', null, undefined, 42]) expect(movieMissLine(e), String(e)).toBeNull();
  });

  it('told once a session: the first gone miss shows the line, later ones and the others show nothing', () => {
    const shown: string[] = [];
    const tell = movieMissTeller((line) => shown.push(line));
    tell(new Error('no decoder served'));
    expect(shown).toEqual([]);
    tell(new Error(STORED_GONE));
    tell(new Error(`MOVIES/MENULOOP.PSS ${EXTRACTED_GONE_WORDS}`));
    expect(shown).toEqual([MOVIE_GONE_LINE]);
  });

  it('the front end\'s movie errors go through the teller to the page line, the console line kept (source pin: mountFrontEnd builds the page)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/frontEnd.ts'), 'utf-8');
    expect(src).toMatch(/const tellMovieMiss = movieMissTeller\(\(line\) => showPageLine\(doc, line\)\);/);
    expect(src).toMatch(/onError: \(path, e\) => \{ console\.warn\('front end: movie', path, why\(e\)\); tellMovieMiss\(e\); \},/);
  });
});
