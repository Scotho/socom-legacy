/**
 * The generator's pack builder lives in the viewer since GX-27 (`packages/viewer/src/texturePackBuild.ts`), shared with
 * the test room's pack upload so both build the same pack from the same PNGs; this module keeps the generator's imports.
 */
export * from '../packages/viewer/src/texturePackBuild';
