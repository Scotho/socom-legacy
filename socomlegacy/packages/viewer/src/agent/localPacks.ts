/** Product adaptation: compatibility facade over the one browser-local pack registry. */
export * from '../packs/registry';
import { createPackRegistry, type LocalPackApi, type LocalPackOptions } from '../packs/registry';
/** Existing map import/removal keeps its existing saves writer until FCW07a supplies the common writer. */
export function createLocalPackApi(options: LocalPackOptions = {}): LocalPackApi {
  return createPackRegistry({ ...options, legacyMapWrites: true });
}
