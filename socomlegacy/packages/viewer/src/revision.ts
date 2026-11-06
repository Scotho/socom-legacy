/**
 * The build's own name: the git revision it came from and when it was built, written in by Vite's
 * `define` (see `../vite.config.ts`), the way the s2u site stamps its footer. Shown in the panel's About
 * so a bug report can say which viewer it was.
 */
declare const __VIEWER_REV__: string | undefined;
declare const __BUILD_STAMP__: string | undefined;
/** `git rev-parse HEAD` of the build (`vite.config.ts`). `__VIEWER_REV__` is the short hash and may carry `-dirty`. */
declare const __VIEWER_COMMIT__: string | undefined;

/**
 * `rev a1b2c3d · built 2026-09-27 15:10 UTC`. The stamp is `YYYY-MM-DD HH:MM:SS` in UTC and is shown to
 * the minute; a missing or malformed value reads as unknown rather than as an empty gap.
 */
export function revisionLabel(rev: string, stamp: string): string {
  const name = rev.trim() || 'unknown';
  const minute = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.exec(stamp.trim())?.[0];
  return `rev ${name} · ${minute ? `built ${minute} UTC` : 'build time unknown'}`;
}

/** `rev a1b2c3d`: the About summary's chip, which has no room for the date. */
export function revisionBadge(rev: string): string {
  return `rev ${rev.trim() || 'unknown'}`;
}

/**
 * The label for this build. The `typeof` guards are what keep it safe where nothing was defined --
 * vitest does not run Vite's `define`, and a bare reference to an undefined global would throw.
 */
/** The release id Vite wrote in, or empty where nothing was defined (vitest, a page built without it). */
export function viewerRev(): string {
  return typeof __VIEWER_REV__ === 'string' ? __VIEWER_REV__ : '';
}

/**
 * The full commit this build came from, or '' where Vite wrote none or the value is not 40 hex (vitest, unless its
 * config defines it; a build without git). A plain pack records this as `provenance.toolCommit`.
 */
export function viewerCommit(): string {
  const commit = typeof __VIEWER_COMMIT__ === 'string' ? __VIEWER_COMMIT__ : '';
  return /^[a-f0-9]{40}$/.test(commit) ? commit : '';
}

/**
 * NCW-10 (an instrument with no original, the product track): this build's time, UTC to the minute,
 * `YYYY-MM-DDTHH:MMZ` -- Vite's `__BUILD_STAMP__` (`YYYY-MM-DD HH:MM:SS`) with its seconds truncated, never rounded and
 * never a second clock read here. The same FORMAT as the host's `RELEASE_BUILT_AT` (`./net/protocol`
 * `BUILT_AT_PATTERN`), not yet the same VALUE: Vite's stamp is its own clock read (`../vite.config.ts` `buildStamp`) and
 * the host's is a separate read in the deploy scripts, so the two agree only once one stamp feeds both (filed with the
 * controller for the web-image grace's deploy work). '' where Vite wrote none or the stamp is not of that shape. Only the shape is
 * changed here: the hello validates the result with `BUILT_AT_PATTERN` before it sends it (`./net/client`), so this
 * module, which the PWA's boot loads, imports no protocol.
 */
export function viewerBuiltAt(): string {
  const stamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}$/.exec(stamp);
  return m ? `${m[1]}T${m[2]}Z` : '';
}

export function viewerRevision(): string {
  const stamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';
  return revisionLabel(viewerRev(), stamp);
}

/** The chip's text for this build, with the same fallback as the label. */
export function viewerRevisionBadge(): string {
  return revisionBadge(viewerRev());
}
