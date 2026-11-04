/**
 * The visitor's mod choices: which ids are on, and the panel order. The lower id wins a conflict. The bytes and these
 * choices are kept by `store.ts` (`TEST_ROOM_MODS_ADAPTATION`).
 */

export interface ModChoices {
  /** Master switch. Off: the disc is read as usual. */
  enabled: boolean;
  /** Ids, top to bottom. The lower id wins a conflict. */
  order: readonly string[];
  /** Ids in `order` that are turned off. */
  disabled: readonly string[];
}

export const EMPTY_MOD_CHOICES: ModChoices = { enabled: false, order: [], disabled: [] };

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MAX_CHOICES = 8192;

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && ID.test(item) && !out.includes(item)) out.push(item);
    if (out.length === 32) break;
  }
  return out;
}

/** A stored JSON value, or the default when it is missing or not this shape. Never throws. */
export function parseModChoices(raw: string | null): ModChoices {
  if (!raw || raw.length > MAX_CHOICES) return EMPTY_MOD_CHOICES;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o === null || typeof o !== 'object' || o.version !== 1) return EMPTY_MOD_CHOICES;
    const order = ids(o.order);
    return { enabled: o.enabled === true, order, disabled: ids(o.disabled).filter((id) => order.includes(id)) };
  } catch {
    return EMPTY_MOD_CHOICES;
  }
}

export function formatModChoices(choices: ModChoices): string {
  return JSON.stringify({ version: 1, enabled: choices.enabled, order: choices.order, disabled: choices.disabled });
}

export function moveMod(choices: ModChoices, id: string, dir: -1 | 1): ModChoices {
  const order = [...choices.order];
  const at = order.indexOf(id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return choices;
  const swap = order[to]!;
  order[to] = order[at]!;
  order[at] = swap;
  return { ...choices, order };
}

export function toggleMod(choices: ModChoices, id: string, on: boolean): ModChoices {
  if (!choices.order.includes(id)) return choices;
  const disabled = choices.disabled.filter((item) => item !== id);
  if (!on) disabled.push(id);
  return { ...choices, disabled };
}
