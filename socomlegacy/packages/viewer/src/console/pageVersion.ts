import { version } from '../../../../package.json';

/**
 * LR-40 (6): the page's own version -- the release the build named (`../../releaseVersion.ts`, written in by Vite's `define`
 * as `__VIEWER_VERSION__`), else the package's (vitest defines nothing; a build with no tag to name). The header's badge
 * (LP.R7; LR.R27 (a)'s page side, `./render/header.ts`) and App's Version row (`./adapters/options.ts`) read it. The
 * `typeof` guard keeps a bare reference safe where nothing was defined. A browser adaptation.
 */
declare const __VIEWER_VERSION__: string | undefined;

export function pageVersion(): string {
  const v = typeof __VIEWER_VERSION__ === 'string' ? __VIEWER_VERSION__.trim().replace(/^v/, '') : '';
  return /^\d+\.\d+\.\d+/.test(v) ? v : version;
}
