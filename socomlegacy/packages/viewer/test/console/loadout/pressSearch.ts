import { pick, type Loadout } from '@s2u/scene';
import { nextRow, rowUi, stepItem, type ArmoryContext } from '../../../src/armoryState';

/**
 * The tests' own search over the ARMORY's presses on one row, written apart from `../../../src/console/loadoutModel`'s
 * (a depth-first walk by iterative deepening, not a queue): every sequence of Right / Left presses, each one
 * `stepArmory`'s S2 (`stepItem`, then `pick` into the whole kit as it stands), deepened one press at a time until a
 * depth adds no kit the shallower ones had not. Answers, for each item the row comes to show (the start's own item
 * left out), the fewest presses that show it.
 */
export function fewestPresses(ctx: ArmoryContext, start: Loadout, row: number): Map<number, number> {
  const press = (kit: Loadout, dir: 1 | -1): Loadout | null => {
    const id = stepItem(ctx, kit, row, dir);
    return id === null ? null : pick(ctx.arsenal, ctx.valves, ctx.side, kit, row - 1, id).loadout;
  };
  const best = new Map<number, number>();
  const shallowest = new Map<string, number>();   // a kit's fewest presses found, to cut a walk that comes back deeper
  const walk = (kit: Loadout, depth: number, left: number): void => {
    const k = kit.join(',');
    const seen = shallowest.get(k);
    if (seen !== undefined && seen <= depth) return;           // walked already with as many presses left, or more
    shallowest.set(k, depth);
    if (depth > 0 && rowUi(kit, row) !== rowUi(start, row)) {
      const ui = rowUi(kit, row), had = best.get(ui);
      if (had === undefined || had > depth) best.set(ui, depth);
    }
    if (left === 0) return;
    for (const dir of [-1, 1] as const) {
      const next = press(kit, dir);
      if (next) walk(next, depth + 1, left - 1);
    }
  };
  let known = -1;
  for (let limit = 1; ; limit++) {
    shallowest.clear();
    walk(start, 0, limit);
    if (shallowest.size === known) return best;   // no kit needs this many presses: every kit is found
    known = shallowest.size;
  }
}

/**
 * The row's expected items, read without the editor's labels: none when the cursor never comes to the row (`nextRow`
 * from the row above passes it -- an item 253-255), else what `fewestPresses` finds.
 */
export function expectedPresses(ctx: ArmoryContext, start: Loadout, row: number): { cursorSkips: boolean; want: Map<number, number> } {
  const cursorSkips = nextRow(start, row === 1 ? 6 : row - 1, 1) !== row;
  return { cursorSkips, want: cursorSkips ? new Map() : fewestPresses(ctx, start, row) };
}

/** The labels checked apart: `skipped` exactly where the cursor passes the row; `locked` only where no press moves it. */
export function labelHolds(ctx: ArmoryContext, start: Loadout, row: number, fixed: 'locked' | 'skipped' | null, cursorSkips: boolean): boolean {
  if ((fixed === 'skipped') !== cursorSkips) return false;
  if (fixed === 'locked') return stepItem(ctx, start, row, 1) === null && stepItem(ctx, start, row, -1) === null;
  return true;
}
