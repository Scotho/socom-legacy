/** Build/test instrument only; it changes no game rule. Written by the separate Xbox Vite config. */
export interface XboxBuildIdentity {
  schema: 1;
  flavor: 'xbox-webgl2-experiment';
  commit: string;
  revision: string;
  dirty: boolean;
  builtAt: string;
}
declare const __XBOX_TEST_BUILD__: unknown;

export function parseBuildIdentity(value: unknown): XboxBuildIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  if (b.schema !== 1 || b.flavor !== 'xbox-webgl2-experiment' || typeof b.commit !== 'string'
    || !/^[a-f0-9]{40}$/.test(b.commit) || typeof b.dirty !== 'boolean'
    || b.revision !== `${b.commit.slice(0, 12)}${b.dirty ? '-dirty' : ''}`
    || typeof b.builtAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(b.builtAt)
    || !Number.isFinite(Date.parse(b.builtAt))) return null;
  return { schema: 1, flavor: b.flavor, commit: b.commit, revision: b.revision as string, dirty: b.dirty, builtAt: b.builtAt };
}
export function xboxBuildIdentity(): XboxBuildIdentity | null {
  return parseBuildIdentity(typeof __XBOX_TEST_BUILD__ === 'undefined' ? null : __XBOX_TEST_BUILD__);
}
export function buildLabel(build: XboxBuildIdentity | null, backend: 'raw' | 'current'): string {
  const renderer = backend === 'raw' ? 'Lightweight WebGL2' : 'Current renderer WebGL2 comparison';
  return build ? `${renderer} | ${build.commit} | ${build.dirty ? 'UNCOMMITTED local test' : 'committed test build'} | ${build.builtAt}`
    : `${renderer} | Unverified development build; use the separate Xbox build for console comparisons`;
}
