import type { ForgeAgentApi } from '../forge/agent/api';
import { checkLocalRead, LocalFileError } from './localFiles';
import type { LocalPackOptions } from './localPacks';

/**
 * Product adaptation: a Forge map is a saved recipe, copied into an independent editor by layout.import.
 * A v2 `pack` is admitted for storage only (FCW-33). It installs no renderer/model/texture runtime. Removing that library entry must leave the working layout,
 * undo history and subsequent human edits intact. LocalPackApi owns detaching its applied bookkeeping and
 * deleting the unchanged saved entry; this map-only driver never undoes or clears an editor/runtime.
 */
export function forgeMapPackDrivers(api: ForgeAgentApi): Pick<LocalPackOptions, 'allowedSurface' | 'applyMap' | 'deactivate'> {
  const build = (): void => {
    if (api.read().mode !== 'forge-editor') throw new LocalFileError('UNSUPPORTED_SURFACE', 'Saved Forge recipes can change only in Build.');
  };
  return {
    // `pack` (FCW-33): a v2 pack is stored only (no driver applies one), as the solo room's surface admits it.
    allowedSurface: kind => (kind === 'map' || kind === 'pack') && api.read().mode === 'forge-editor',
    async applyMap(layout, signal) {
      checkLocalRead({ signal }); build();
      const result = await api.execute('layout.import', { layout }, api.read().revision, undefined, { signal });
      if (!result.ok) throw new Error(result.code ?? 'MAP_IMPORT_FAILED');
    },
    deactivate(kind, id, signal) {
      checkLocalRead({ signal }); build();
      if (kind !== 'map' || !id.startsWith('map:')) throw new LocalFileError('UNSUPPORTED_SURFACE', 'This driver detaches saved map recipes only.');
      // No live payload is attached to this saved recipe. The API deletes only its own library bookkeeping.
    },
  };
}
