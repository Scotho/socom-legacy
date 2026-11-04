// @vitest-environment jsdom
import { version as packageVersion } from '../../../../package.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseVersion } from '../../releaseVersion';
import { pageVersion } from '../../src/console/pageVersion';
import { headerHtml } from '../../src/console/render/header';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState } from '../../src/console/state';

/**
 * LR-40 (6; the side-by-side's F7): the badge read v0.1.0 -- `socomlegacy/package.json`'s version, never bumped -- while the
 * running release was v0.3.34. A release is the annotated tag `v<semver>` on `main`'s merge (`git tag`: v0.3.34 on
 * 60b9d7b49); the build writes the nearest one in (`../../releaseVersion.ts`, `vite.config.ts`'s `__VIEWER_VERSION__`)
 * and the page reads it (`src/console/pageVersion.ts`), the package's version only where the build had no tag to name
 * (vitest, a checkout without tags). LP.R7's badge, LR.R27's page side. A browser adaptation.
 */
afterEach(() => { vi.unstubAllGlobals(); });

describe('LR-40 (6): the build names the nearest release tag', () => {
  it('asks git for the nearest v-tag reachable from HEAD and drops its v', () => {
    const calls: string[][] = [];
    const git = (...args: string[]): string => { calls.push(args); return 'v0.3.34\n'; };
    expect(releaseVersion(git, {}, '0.1.0')).toBe('0.3.34');
    expect(calls).toEqual([['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']]);
  });
  it('a build told its version (VIEWER_VERSION, a tree without git) takes it before git', () => {
    const git = (): string => { throw new Error('not asked'); };
    expect(releaseVersion(git, { VIEWER_VERSION: 'v0.4.0' }, '0.1.0')).toBe('0.4.0');
  });
  it('no git, no tag or a tag that is no version: the package version', () => {
    expect(releaseVersion(() => { throw new Error('no git'); }, {}, '0.1.0')).toBe('0.1.0');
    expect(releaseVersion(() => '', {}, '0.1.0')).toBe('0.1.0');
    expect(releaseVersion(() => 'nightly-1', {}, '0.1.0')).toBe('0.1.0');
    expect(releaseVersion(() => 'v0.3.34', { VIEWER_VERSION: 'junk' }, '0.1.0')).toBe('0.3.34');
  });
});

describe('LR-40 (6): the page reads the build\'s version', () => {
  it('the defined version, without its v', () => {
    vi.stubGlobal('__VIEWER_VERSION__', 'v0.3.34');
    expect(pageVersion()).toBe('0.3.34');
  });
  it('nothing defined (vitest) or junk: the package version', () => {
    expect(pageVersion()).toBe(packageVersion);
    vi.stubGlobal('__VIEWER_VERSION__', 'unknown');
    expect(pageVersion()).toBe(packageVersion);
  });
  it('the header badge and its label show it while central is unreachable (LR.R27 (a): the page\'s own, greyed)', () => {
    vi.stubGlobal('__VIEWER_VERSION__', '0.3.34');
    const A = sampleAdapters();
    A.server = { ...A.server, centralVersion: () => null };
    const d = document.createElement('div');
    d.innerHTML = headerHtml(createState(A), A);
    const badge = d.querySelector<HTMLElement>('.cx-version')!;
    expect(badge.textContent).toBe('v0.3.34');
    expect(badge.getAttribute('aria-label')).toBe('Version 0.3.34');
    expect(badge.classList.contains('is-unreached')).toBe(true);
  });
});
