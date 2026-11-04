import { describe, expect, it } from 'vitest';
import { BOT_MAPS } from '../../packages/match/src/botGates';
import { parseNavigationArgs } from '../botNavigationArgs';

/**
 * P537-L1 (product track, a developer tool): `tools/prepare-bot-navigation.ts`'s arguments. With no map named it builds
 * main's list, the maps public rooms give bots (`BOT_MAPS`: Frostfire, Vigilance) -- what the bot-compare harness and the
 * e2e specs run it for. Any other disc map is built on demand only, named with PR #537's `--maps` (or `--maps all` for every
 * `RUN/MP<n>.ZDB` the disc holds).
 */

describe('P537-L1: prepare-bot-navigation\'s arguments', () => {
  it('no map named: main\'s BOT_MAPS (MP2, MP51), never every disc map', () => {
    expect(parseNavigationArgs([])).toEqual({ disc: undefined, maps: ['MP2', 'MP51'] });
    expect(parseNavigationArgs(['test-fixtures'])).toEqual({ disc: 'test-fixtures', maps: [...BOT_MAPS] });
  });

  it('main\'s positional map is still taken: [disc] [map]', () => {
    expect(parseNavigationArgs(['/disc', 'mp51'])).toEqual({ disc: '/disc', maps: ['MP51'] });
  });

  it('--maps names any maps, on demand (#537), before or after the disc', () => {
    expect(parseNavigationArgs(['--maps', 'mp7, MP12'])).toEqual({ disc: undefined, maps: ['MP7', 'MP12'] });
    expect(parseNavigationArgs(['/disc', '--maps', 'MP7'])).toEqual({ disc: '/disc', maps: ['MP7'] });
  });

  it('--maps all asks for every map the disc holds', () => {
    expect(parseNavigationArgs(['--maps', 'all', '/disc'])).toEqual({ disc: '/disc', maps: 'all' });
  });

  it.each([[['--maps']], [['--maps', ' , ']], [['a', 'MP2', 'b']], [['/disc', 'MP2', '--maps', 'MP7']]])('refuses %j', (argv) => {
    expect(() => parseNavigationArgs(argv)).toThrow(/usage/);
  });
});
