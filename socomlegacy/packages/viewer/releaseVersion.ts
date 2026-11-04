/**
 * LR-40 (6; the close run's F7: the badge read v0.1.0 while the release was v0.3.34): the launcher's version, written in at
 * build time (`vite.config.ts`'s `__VIEWER_VERSION__`, read by `src/console/pageVersion.ts`). A release is the annotated tag
 * `v<semver>` on `main`'s merge (v0.3.34 on 60b9d7b49); `socomlegacy/package.json`'s version (0.1.0) is never bumped with it.
 * In order: `VIEWER_VERSION` (a build told its version, a tree without git), the nearest `v`-tag reachable from the build's
 * commit (`git describe --tags --abbrev=0 --match v[0-9]*`), else `fallback` (the package's). A build after a release but
 * before the next tag names the last release, so LR.R27's mismatch pair can show equal names for different code (central
 * and the page each built past the same tag); the revision, `__VIEWER_REV__`, tells the builds apart. A browser adaptation
 * (LP.R7's badge, LR.R27).
 */
const SEMVER = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?)$/;

export function releaseVersion(git: (...args: string[]) => string, env: Record<string, string | undefined>, fallback: string): string {
  const told = SEMVER.exec((env['VIEWER_VERSION'] ?? '').trim());
  if (told) return told[1]!;
  try {
    const tag = SEMVER.exec(git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*').trim());
    if (tag) return tag[1]!;
  } catch {
    // no git, or no tag reachable: the package's version
  }
  return fallback;
}
