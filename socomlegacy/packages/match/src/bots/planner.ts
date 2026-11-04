/** Independent, bounded forward planning for authored CPU inputs. No game-state objects enter this module. */
export type PlanningState = Readonly<Record<string, boolean>>;
export interface PlanningAction {
  readonly name: string;
  readonly requires: PlanningState;
  readonly effects: PlanningState;
  readonly cost: number;
}
export interface PlanningResult {
  status: 'found' | 'unreachable' | 'budget';
  actions: PlanningAction[];
  cost: number;
  expanded: number;
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Controller CPU budget, not a recovered game constant. */
export const PLANNING_BUDGET_ADAPTATION = 64;
export const matches = (state: PlanningState, wanted: PlanningState): boolean =>
  Object.entries(wanted).every(([key, value]) => state[key] === value);

/** Uniform-cost search: stable insertion order breaks ties, and visited states terminate zero-cost cycles. */
export function planActions(observed: PlanningState, goal: PlanningState, actions: readonly PlanningAction[],
  budget = PLANNING_BUDGET_ADAPTATION): PlanningResult {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('Planning budget must be a positive integer');
  if (actions.some((a) => !Number.isFinite(a.cost) || a.cost < 0)) throw new Error('Planning costs must be finite and nonnegative');
  const keys = [...new Set([...Object.keys(observed), ...Object.keys(goal),
    ...actions.flatMap((a) => [...Object.keys(a.requires), ...Object.keys(a.effects)])])].sort();
  const keyOf = (state: PlanningState): string => keys.map((key) => state[key] === undefined ? '?' : state[key] ? '1' : '0').join('');
  const open = [{ state: { ...observed }, actions: [] as PlanningAction[], cost: 0, order: 0 }];
  const best = new Map([[keyOf(observed), 0]]);
  let expanded = 0, order = 1;
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost || a.order - b.order);
    const node = open.shift()!;
    if (node.cost !== best.get(keyOf(node.state))) continue;
    if (matches(node.state, goal)) return { status: 'found', actions: node.actions, cost: node.cost, expanded };
    if (expanded >= budget) return { status: 'budget', actions: [], cost: 0, expanded };
    expanded++;
    for (const action of actions) {
      if (!matches(node.state, action.requires)) continue;
      const state = { ...node.state, ...action.effects }, key = keyOf(state), cost = node.cost + action.cost;
      if (cost >= (best.get(key) ?? Infinity)) continue;
      best.set(key, cost);
      open.push({ state, actions: [...node.actions, action], cost, order: order++ });
    }
  }
  return { status: 'unreachable', actions: [], cost: 0, expanded };
}
