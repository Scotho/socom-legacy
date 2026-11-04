/**
 * How much of an extent a chunked read asks for at a time: 512 sectors. The ISO source's `read` with progress reads by
 * it, and every `stream` defaults to it (`StreamOptions.chunkSize`). A leaf module, so that `assetSource.ts` and
 * `isoAssetSource.ts` both take it without importing each other; `isoAssetSource.ts` re-exports it.
 */
export const ISO_READ_CHUNK = 1 << 20;
