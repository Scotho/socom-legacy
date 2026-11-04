import { describe, expect, it } from 'vitest';
import { devSpotSearch, formatDevSpot, readDevSpot, writeDevSpot } from '../src/devSpot';
import { readShare } from '../src/shareUrl';

describe('a developer spot in the address', () => {
  it('reads at and yaw, and refuses a spot that is missing or not a plain number', () => {
    expect(readDevSpot('?devmode&at=1.5,2,-3&yaw=90')).toEqual({ x: 1.5, y: 2, z: -3, yaw: 90 });
    expect(readDevSpot('?at=1,2,3')).toBeNull();
    expect(readDevSpot('?yaw=10')).toBeNull();
    expect(readDevSpot('?at=1,2&yaw=0')).toBeNull();
    expect(readDevSpot('?at=1,2,no&yaw=0')).toBeNull();
    expect(readDevSpot('?at=1,2,3&yaw=1e2')).toBeNull();
    expect(readDevSpot('?%E0%A4%A')).toBeNull();
  });

  it('rounds into the query and keeps a bare flag bare', () => {
    expect(formatDevSpot({ x: 1.234, y: -0, z: 8, yaw: 180.04 })).toEqual({ at: '1.23,0,8', yaw: '180' });
    expect(formatDevSpot({ x: Number.NaN, y: 0, z: 0, yaw: 0 })).toBeNull();
    expect(writeDevSpot('?devmode&mode=play&fly', { x: 1.234, y: 2, z: 3, yaw: 45.06 })).toBe('?devmode&mode=play&fly&at=1.23,2,3&yaw=45.1');
    expect(writeDevSpot('?at=9,9,9&yaw=1&devmode', { x: 1, y: 2, z: 3, yaw: 4 })).toBe('?devmode&at=1,2,3&yaw=4');
  });

  it('writes mode and map through the share table, and does not add a field that table reads', () => {
    const search = devSpotSearch('?devmode&view=ps2', true, 'MP2', { x: 10, y: 20, z: 30, yaw: -15 });
    expect(search).toBe('?mode=play&map=MP2&view=ps2&devmode&at=10,20,30&yaw=-15');
    expect(readShare(search!)).toEqual({ play: true, map: 'MP2', view: 'ps2', online: null });
    expect(readDevSpot(search!)).toEqual({ x: 10, y: 20, z: 30, yaw: -15 });
    expect(devSpotSearch('?map=MP1', false, null, { x: 0, y: 0, z: 0, yaw: 0 })).toBe('?mode=explore&map=MP1&at=0,0,0&yaw=0');
  });
});
