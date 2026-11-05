/**
 * The release's build time (NCW-13; a deploy adaptation on the product track, OT.R53: nothing the game does changes).
 * `RELEASE_NAME` is day-only (`<yyyymmdd>-<sha>`); `RELEASE_BUILT_AT` stamps the build to the minute, UTC, in one form
 * everywhere -- `YYYY-MM-DDTHH:MMZ`, e.g. `2026-11-05T01:32Z` -- written into `release.env` by `deploy/central/stage.sh`
 * and `deploy/nightly.sh`, passed to both host images by `deploy/host/update-host.sh` (and `deploy/release.sh`), and
 * named `builtAt` by central's and the door's `/health` and the page's `/release.json`. This is the one pattern its
 * readers check it with (the web image's Dockerfile mirrors it, held equal by `packages/host/test/hostWeb.test.ts`); a
 * value of another form is null, so nothing else of the environment reaches a public answer. A later "older page" check
 * compares the page's stamp with central's.
 */
export const RELEASE_BUILT_AT_FORM = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\dZ$/;

/** `RELEASE_BUILT_AT` as given when it has the stamp's form, else null (unset, empty or malformed). */
export function releaseBuiltAt(value: string | undefined): string | null {
  return value !== undefined && RELEASE_BUILT_AT_FORM.test(value) ? value : null;
}
