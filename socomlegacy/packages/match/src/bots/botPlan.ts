import { matches, planActions, type PlanningAction, type PlanningState } from './planner';

/** Facts supplied by perception, native weapon state and checked navigation, never enemy truth positions. */
export interface BotObservation {
  active: boolean; contact: boolean; visible: boolean; atContact: boolean; inRange: boolean; lane: boolean;
  loaded: boolean; needsReload: boolean; reloading: boolean; canReload: boolean;
  cover: boolean; protected: boolean; pressure: boolean; opening: boolean; pathFailed: boolean;
  contactKey: string | null;
  supporting?: boolean;
  /** Authored weapon preference also bounds opening opportunities and suppression when set. */
  rangeRestricted?: boolean;
}
export type BotAction = 'patrol' | 'investigate' | 'search' | 'approach' | 'fire' | 'suppress' | 'take-cover' | 'hold-cover' | 'peek' | 'reload';
type Goal = 'idle' | 'patrol' | 'find-contact' | 'engage' | 'resupply' | 'survive' | 'support-partner';
export interface BotPlanSnapshot {
  goal: Goal; action: BotAction | null; plan: BotAction[]; reason: string;
  revision: number; expanded: number; status: 'idle' | 'found' | 'unreachable' | 'budget';
}
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Costs express our input-controller preferences; none is a F.E.A.R. or SOCOM transcription. */
const ACTION_COST_ADAPTATION = { patrol: 1, investigate: 2, search: 1, approach: 3, fire: 1, cover: 2, hold: 1, peek: 1, reload: 1 };
const sustained = new Set(['patrol', 'search', 'fire', 'suppress', 'hold-cover']);
function domain(observation: BotObservation): PlanningAction[] {
  const a = (name: BotAction, requires: PlanningState, effects: PlanningState, cost: number): PlanningAction =>
    ({ name, requires: { active: true, ...requires }, effects, cost });
  const c = ACTION_COST_ADAPTATION;
  return [
    a('patrol', {}, { patrolled: true }, c.patrol),
    a('investigate', { contact: true, visible: false, pathFailed: false }, { atContact: true }, c.investigate),
    a('search', { contact: true, visible: false, ...(observation.pathFailed ? { pathFailed: true } : { atContact: true }) }, { searched: true }, c.search),
    a('approach', { contact: true, visible: true, pathFailed: false }, { inRange: true, lane: true }, c.approach),
    a('fire', { visible: true, ...(observation.opening && !observation.rangeRestricted ? {} : { inRange: true }), lane: true, loaded: true }, { engaged: true }, c.fire),
    a('suppress', { supporting: true, visible: true, ...(observation.rangeRestricted ? { inRange: true } : {}), lane: true, loaded: true }, { supported: true }, c.fire),
    a('take-cover', { contact: true, cover: true }, { protected: true }, c.cover),
    a('hold-cover', { protected: true, pressure: true }, { safe: true }, c.hold),
    a('peek', { cover: true, loaded: true, pressure: false }, { lane: true, protected: false }, c.peek),
    a('reload', { ...(observation.reloading ? { reloading: true } : { canReload: true }),
      ...(observation.cover && observation.contact ? { protected: true } : {}) },
      { loaded: true, needsReload: false, reloading: false }, c.reload),
  ];
}
function goalOf(o: BotObservation): { name: Goal; wanted: PlanningState } {
  if (!o.active) return { name: 'idle', wanted: {} };
  if (o.reloading || (o.needsReload && o.canReload)) return { name: 'resupply', wanted: { loaded: true, needsReload: false, reloading: false } };
  if (o.pressure && o.cover) return { name: 'survive', wanted: { safe: true } };
  if (o.supporting && (!o.rangeRestricted || o.inRange)) return { name: 'support-partner', wanted: { supported: true } };
  // A committed team route owns locomotion; a legal shot of opportunity must not replace that route with pursuit.
  if (o.opening && !(o.visible && o.lane && o.loaded && (!o.rangeRestricted || o.inRange))) return { name: 'patrol', wanted: { patrolled: true } };
  if (o.visible) return { name: 'engage', wanted: { engaged: true } };
  if (o.contact) return { name: 'find-contact', wanted: { searched: true } };
  return { name: 'patrol', wanted: { patrolled: true } };
}

/** Plans predict, executors act, observations confirm. No predicted effect is written back to the adapter. */
export class BotPlan {
  private actions: PlanningAction[] = [];
  private contactKey: string | null = null;
  private pendingReason: string | null = 'start';
  private observationKey = '';
  private state: BotPlanSnapshot = { goal: 'idle', action: null, plan: [], reason: 'start', revision: 0, expanded: 0, status: 'idle' };

  reset(reason: string): void {
    this.actions = []; this.contactKey = null; this.pendingReason = reason; this.observationKey = '';
    this.state = { ...this.state, goal: 'idle', action: null, plan: [], reason, status: 'idle', expanded: 0 };
  }
  invalidate(reason: string): void { this.actions = []; this.pendingReason = reason; }
  snapshot(): BotPlanSnapshot { return { ...this.state, plan: [...this.state.plan] }; }

  update(observation: BotObservation): BotPlanSnapshot {
    const { contactKey, supporting = false, rangeRestricted = false, ...facts } = observation;
    const observed = { ...facts, supporting, rangeRestricted, patrolled: false, searched: false, engaged: false, safe: false, supported: false };
    const observationKey = JSON.stringify(observed), unchanged = observationKey === this.observationKey;
    this.observationKey = observationKey;
    const goal = goalOf(observation), current = this.actions[0];
    const available = domain(observation);
    // Preconditions are partly contextual (opening fire, sheltered reload, failed-path search).
    // Validate against today's domain, including queued actions, rather than yesterday's relaxed definition.
    const changedDomain = this.actions.some((action) => JSON.stringify(action)
      !== JSON.stringify(available.find((candidate) => candidate.name === action.name)));
    let reason = this.pendingReason;
    if (!reason && contactKey !== this.contactKey) reason = 'contact-changed';
    if (!reason && current && !matches(observed, current.requires)) reason = `precondition:${current.name}`;
    if (!reason && changedDomain) reason = 'domain-changed';
    if (!reason && goal.name !== this.state.goal) reason = `goal:${goal.name}`;
    this.pendingReason = null; this.contactKey = contactKey;
    if (goal.name === 'idle') { this.reset(observation.active ? 'idle' : 'inactive'); return this.snapshot(); }
    // An unchanged unreachable observation is not a reason to spend the search budget again every tick.
    if (!reason && !current && unchanged && this.state.status !== 'found') return this.snapshot();
    if (!reason && current && !sustained.has(current.name) && matches(observed, current.effects)) {
      this.actions.shift();
      if (!this.actions.length || !matches(observed, this.actions[0]!.requires)) reason = `completed:${current.name}`;
    }
    if (reason || !this.actions.length) {
      const result = planActions(observed, goal.wanted, available);
      this.actions = result.actions;
      this.state = { ...this.state, goal: goal.name, reason: reason ?? 'plan-exhausted', revision: this.state.revision + 1,
        expanded: result.expanded, status: result.status };
    }
    this.state.action = (this.actions[0]?.name as BotAction | undefined) ?? null;
    this.state.plan = this.actions.map((a) => a.name as BotAction);
    return this.snapshot();
  }
}
