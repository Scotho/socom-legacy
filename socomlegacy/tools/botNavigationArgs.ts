import { BOT_MAPS } from '../packages/match/src/botGates';

/**
 * P537-L1 (product track, a developer tool; an adaptation of PR #537's `--maps`): what `tools/prepare-bot-navigation.ts`
 * builds. `[extracted-disc-directory] [map]` as on main, or `--maps MP7,MP12` (#537) for any maps, or `--maps all` for
 * every `RUN/MP<n>.ZDB` the disc holds. With no map named it is main's list, `BOT_MAPS` (the maps public rooms give bots),
 * never every disc map: the others are built on demand only (the owner, 2026-10-31, relayed by 6d: "it won't be enabled
 * for public use. Only FF and VIG respawn to start").
 */
export interface NavigationRequest { disc: string | undefined; maps: readonly string[] | 'all' }

export const NAVIGATION_USAGE = 'usage: prepare-bot-navigation.ts [extracted-disc-directory] [map] | [--maps MP2,MP7 | --maps all]';

export function parseNavigationArgs(argv: readonly string[]): NavigationRequest {
  const args = [...argv];
  const flag = args.indexOf('--maps');
  let named: string[] | 'all' | undefined;
  if (flag >= 0) {
    const value = args.splice(flag, 2)[1];
    const list = (value ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!list.length) throw new Error(NAVIGATION_USAGE);
    named = list.length === 1 && list[0] === 'ALL' ? 'all' : list;
  }
  if (args.length > 2 || (named !== undefined && args.length > 1)) throw new Error(NAVIGATION_USAGE);
  const [disc, map] = args;
  return { disc, maps: named ?? (map ? [map.toUpperCase()] : [...BOT_MAPS]) };
}
