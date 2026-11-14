/**
 * A plugin reply, parsed back from JSON so the module holds no room object (design section 4). Product-track
 * adaptation. `hit.scale` is not a plugin action: the room asks the factor before it lays the hit.
 */
import {
  PACK_RULES_MEMBER_BYTES_ADAPTATION, PURCHASE_REFUSALS, RULE_ACTIONS, RULE_ACTIONS_PER_EVENT_ADAPTATION, RULE_ACTION_SPECS, RULES_INT_ADAPTATION, RULES_TEXT_CHARS_ADAPTATION,
  type RuleAction, type RuleActionName, type RuleParamSpec,
} from '@s2u/creator-contracts';
import type { RuleRoom } from '../rules/seam';

const ACTIONS: ReadonlySet<string> = new Set(RULE_ACTIONS);
const NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/;
/** The same coordinate bound a rules pack's `zone.reshape` uses (`rules.ts` `COORD`). */
const COORD = 100_000;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v) && Math.abs(v as number) <= RULES_INT_ADAPTATION;
/** A seat id: a positive whole number inside the rules' integer bound. Not any finite number. */
const isSeat = (v: unknown): boolean => isInt(v) && (v as number) >= 1;

/**
 * The reply as the worker posted it: a JSON string. Over the rules member's bound, it is refused before it is
 * parsed. `null` is a refusal (too long, or not JSON).
 */
export function pluginReplyJson(json: string): unknown | null {
  if (json.length > PACK_RULES_MEMBER_BYTES_ADAPTATION) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/** The reply's actions, or null when the reply is not an array of `RULE_ACTIONS` inside the per-event budget. */
export function pluginActionsOf(value: unknown): RuleAction[] | null {
  if (!Array.isArray(value) || value.length > RULE_ACTIONS_PER_EVENT_ADAPTATION) return null;
  let cloned: unknown;
  try {
    cloned = JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
  if (!Array.isArray(cloned)) return null;
  const out: RuleAction[] = [];
  for (const item of cloned) {
    if (!isObj(item)) return null;
    const name = item['do'];
    if (typeof name !== 'string' || !ACTIONS.has(name)) return null;
    if (name === 'hit.scale') continue;
    if (!actionParamsOk(name as RuleActionName, item)) return null;
    out.push(item as RuleAction);
  }
  return out;
}

/** The same parameter shapes `RULE_ACTION_SPECS` gives a rules pack. A plugin's `who` is a seat id. */
function actionParamsOk(name: RuleActionName, item: Record<string, unknown>): boolean {
  if (name === 'hud.value') return hudOk(item);
  if (name === 'spawner.release') return releaseOk(item);
  const spec = RULE_ACTION_SPECS[name];
  const allowed = new Set(['do', ...Object.keys(spec.params)]);
  if (Object.keys(item).some((key) => !allowed.has(key))) return false;
  for (const [key, param] of Object.entries(spec.params)) {
    if (!Object.prototype.hasOwnProperty.call(item, key) || item[key] === undefined) {
      if (param.required) return false;
      continue;
    }
    if (!paramOk(param, item[key])) return false;
  }
  if (name === 'score.award' && item['who'] === undefined && item['team'] === undefined) return false;
  if (item['who'] !== undefined && item['team'] !== undefined) return false;
  return true;
}

/** A plugin respawn is a seat, a point and a yaw. `count`, `item` and `brain` are a rules pack's release, and are refused. */
function releaseOk(item: Record<string, unknown>): boolean {
  if (Object.keys(item).some((key) => key !== 'do' && key !== 'spawner' && key !== 'who' && key !== 'at' && key !== 'yaw')) return false;
  return paramOk({ kind: 'spawner', required: true }, item['spawner']) && isSeat(item['who']) && pointOk(item['at']) && coordOk(item['yaw']);
}

function paramOk(param: RuleParamSpec, value: unknown): boolean {
  const min = param.min ?? -RULES_INT_ADAPTATION;
  const max = param.max ?? RULES_INT_ADAPTATION;
  switch (param.kind) {
    case 'who': return isSeat(value);
    case 'team': return value === 'seal' || value === 'terrorist' || (isObj(value) && Object.keys(value).length === 1 && isSeat(value['of']));
    case 'winner': return value === 'none' || value === 'seal' || value === 'terrorist' || (isObj(value) && Object.keys(value).length === 1 && isSeat(value['of']));
    case 'reason': return typeof value === 'string' && (PURCHASE_REFUSALS as readonly string[]).includes(value);
    case 'text': return typeof value === 'string' && value.length >= 1 && value.length <= RULES_TEXT_CHARS_ADAPTATION && PRINTABLE.test(value);
    case 'int': case 'intOperand': return isInt(value) && (value as number) >= min && (value as number) <= max;
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    case 'bool': return typeof value === 'boolean';
    case 'names': return Array.isArray(value) && value.length >= 1 && value.length <= 32 && value.every((name) => typeof name === 'string' && NAME.test(name));
    case 'operand': return operandOk(value);
    case 'var': case 'timer': case 'phase': case 'zone': case 'marker': case 'spawner': case 'item': case 'door': case 'brain': case 'name':
      return typeof value === 'string' && NAME.test(value);
    default: return false;
  }
}

function operandOk(value: unknown): boolean {
  if (isInt(value) || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length >= 1 && value.length <= RULES_TEXT_CHARS_ADAPTATION && PRINTABLE.test(value);
  if (!isObj(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  const key = keys[0]!;
  return (key === 'var' || key === 'field' || key === 'param') && typeof value[key] === 'string' && NAME.test(value[key]);
}

/** A pack shows a declared variable. A plugin may show a literal value. The label is the pack's text bound either way. */
function hudOk(item: Record<string, unknown>): boolean {
  if (Object.keys(item).some((key) => key !== 'do' && key !== 'var' && key !== 'label' && key !== 'value')) return false;
  if (!paramOk({ kind: 'text', required: true }, item['label'])) return false;
  if (item['var'] !== undefined && !paramOk({ kind: 'var', required: true }, item['var'])) return false;
  const value = item['value'];
  if (value !== undefined) {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') return paramOk({ kind: 'text', required: true }, value);
    if (!(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= RULES_INT_ADAPTATION)) return false;
  }
  return item['var'] !== undefined || value !== undefined;
}

function coordOk(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= COORD;
}

function pointOk(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(coordOk);
}

const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const idOf = (v: unknown): number | undefined => {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
};
const teamOf = (v: unknown): 'seal' | 'terrorist' | undefined => v === 'seal' || v === 'terrorist' ? v : undefined;
const atOf = (v: unknown): [number, number, number] | undefined => {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const x = num(v[0]), y = num(v[1]), z = num(v[2]);
  return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
};

const present = (room: RuleRoom, show: { kind: 'message'; text: string } | { kind: 'cue'; cue: string } | { kind: 'hud'; label: string; value: number | boolean | string }): void => {
  room.tell({ type: 'rulesPresent', mode: 'plugin', shows: [show] });
};

/**
 * Room actions. A plugin's `who` is a seat id. A host with a plugin does not take a rules pack, so these actions
 * are not read as rule subjects.
 */
export function applyPluginRoomAction(room: RuleRoom, action: RuleAction): void {
  switch (action.do) {
    case 'player.damage': {
      const id = idOf(action['who']);
      const amount = num(action['amount']);
      if (id !== undefined && amount !== undefined && amount > 0) room.damage(id, amount, typeof action['cause'] === 'string' ? action['cause'] : 'plugin');
      return;
    }
    case 'player.eliminate': {
      const id = idOf(action['who']);
      if (id !== undefined) room.eliminate(id);
      return;
    }
    case 'score.award': {
      const points = num(action['points']);
      if (points === undefined) return;
      const id = idOf(action['who']);
      if (id !== undefined) { room.award({ player: id }, points); return; }
      const team = teamOf(action['team']);
      if (team) room.award({ team }, points);
      return;
    }
    case 'round.end': {
      const team = teamOf(action['winner']);
      room.endRound(action['winner'] === 'none' || action['winner'] === undefined ? null : team ?? null);
      return;
    }
    case 'match.end': {
      const team = teamOf(action['winner']);
      room.endMatch(action['winner'] === 'none' || action['winner'] === undefined ? null : team ?? null);
      return;
    }
    case 'door.open':
    case 'door.close': {
      if (typeof action['door'] === 'string') room.door(action['door'], action.do === 'door.open');
      return;
    }
    case 'spawner.release': {
      const id = idOf(action['who']);
      const at = atOf(action['at']);
      const yaw = num(action['yaw']);
      if (id !== undefined && at && yaw !== undefined && typeof action['spawner'] === 'string') room.respawn(id, at, yaw, action['spawner']);
      return;
    }
    case 'message.show': {
      if (typeof action['text'] === 'string') present(room, { kind: 'message', text: action['text'] });
      return;
    }
    case 'cue.play': {
      if (typeof action['cue'] === 'string') present(room, { kind: 'cue', cue: action['cue'] });
      return;
    }
    case 'hud.value': {
      const value = action['value'];
      if (typeof action['label'] === 'string' && (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) {
        present(room, { kind: 'hud', label: action['label'], value });
      }
      return;
    }
    default:
      return;
  }
}
