import { describe, expect, it } from 'vitest';
import type { CreatorLayoutRecord, PackRef } from '@s2u/creator-contracts';
import { emptyLayout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import { CUSTOM_MAPS_GROUP, customMapRows, type CustomMapListInput } from '../../src/forge/customMaps';
import { MAP_PACK } from '../../../creator-contracts/test/contentMapFixtures';

/**
 * FP-6 item 1 (FP.R4; product track, a browser adaptation with no original): the Custom Maps group of the Forge's base
 * list, a pure listing over (the registry's custom-map records, the content source's map index, the player's saves):
 * installed bundles first, then bare content maps no bundle covers, then saved layouts; empty when nothing is there.
 */
const OTHER: PackRef = { id: 'example.other', version: '2.0.0', hash: 'e'.repeat(64) };
const onYard = (): CreatorLayoutRecord => recordOfLayout({ ...emptyLayout({ kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP2' } as never), name: 'Sample Yard' }, 'Sample Yard') as CreatorLayoutRecord;
const input = (over: Partial<CustomMapListInput> = {}): CustomMapListInput => ({ records: [], mapIndex: [], saves: [], available: [], ...over });

describe('FP-6 1: the Custom Maps listing', () => {
  it('is empty when nothing is installed and nothing is saved', () => {
    expect(customMapRows(input())).toEqual([]);
    expect(CUSTOM_MAPS_GROUP).toBe('Custom Maps');
  });

  it('lists bundles, then content maps no bundle covers, then saves, each by its value and name', () => {
    const rows = customMapRows(input({
      records: [{ digest: 'abc123', name: 'Sample Yard', layout: onYard() }],
      mapIndex: [
        { ref: { kind: 'pack', pack: MAP_PACK, assetId: 'yard' }, name: 'Yard' },          // the bundle's own base: covered
        { ref: { kind: 'pack', pack: OTHER, assetId: 'dunes' }, name: 'Dunes' },
      ],
      saves: [{ id: 's1', name: 'My layout', record: recordOfLayout(emptyLayout({ kind: 'blank', library: 'MP2' }), 'My layout') }],
      available: [MAP_PACK, OTHER],
    }));
    expect(rows.map((r) => [r.kind, r.value, r.name])).toEqual([
      ['bundle', 'custom:abc123', 'Sample Yard'],
      ['content', `content:${OTHER.id}@${OTHER.version}/dunes`, 'Dunes'],
      ['save', 'save:s1', 'My layout'],
    ]);
  });

  it('a content map of another version or another map of the bundle\'s pack is not covered', () => {
    const rows = customMapRows(input({
      records: [{ digest: 'd', name: 'Sample Yard', layout: onYard() }],
      mapIndex: [
        { ref: { kind: 'pack', pack: MAP_PACK, assetId: 'quarry' }, name: 'Quarry' },
        { ref: { kind: 'pack', pack: { ...MAP_PACK, version: '0.9.0', hash: 'd'.repeat(64) }, assetId: 'yard' }, name: 'Yard (old)' },
      ],
    }));
    expect(rows.map((r) => r.name)).toEqual(['Sample Yard', 'Quarry', 'Yard (old)']);
  });

  it('2: each row carries what it still needs against the packs here -- a bundle, a save; a listed content map is here', () => {
    const rows = customMapRows(input({
      records: [{ digest: 'd', name: 'Sample Yard', layout: onYard() }],
      mapIndex: [{ ref: { kind: 'pack', pack: OTHER, assetId: 'dunes' }, name: 'Dunes' }],
      saves: [{ id: 's1', name: 'On the yard', record: onYard() }],
      available: [OTHER],
    }));
    expect(rows.map((r) => [r.name, r.missing.map((p) => p.id)])).toEqual([['Sample Yard', [MAP_PACK.id]], ['Dunes', []], ['On the yard', [MAP_PACK.id]]]);
    expect(customMapRows(input({ records: [{ digest: 'd', name: 'Sample Yard', layout: onYard() }], available: [MAP_PACK] }))[0]!.missing).toEqual([]);
  });
});
