/** Original ids/field bounds: ISO game ELF 002344e0; dlgSetTaunts/do_chat GetTextInput.
 * Research 301 distinguishes these readings from transport safeguards. No game assets here. */
export const TAUNT_SLOTS = 5;
export const TAUNT_MAX_CHARS = 45;
export const TAUNT_MAX_BYTES = 46;
/** ISO ELF232240 stores five seconds on the selected node, not on the entire menu. */
export const TAUNT_DELAY_SECONDS = 5;
export type TauntChoice = { kind: 'vocal' } | { kind: 'custom'; slot: number; text: string };
export type TauntRequest = TauntChoice & { request: number };
export function validTauntText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= TAUNT_MAX_CHARS
    && new TextEncoder().encode(value).length < TAUNT_MAX_BYTES && !/[\u0000-\u001f\u007f]/.test(value);
}
/** Native per-node delay enforced authoritatively. Monotonic request ids and shape checks are browser safeguards. */
export class TauntRequests {
  private held = new Map<number, { request: number; until: number[] }>();
  forget(id: number): void { this.held.delete(id); }
  /**
   * OBF-20: a new match -- every page mounts anew, numbering from 1 with an empty heard list: each seat's last request
   * forgotten, each node's delay kept (the original's, `FUN_00232240`). A reload's resumed seat is not renumbered: the
   * others' pages still hold its requests heard, so its page numbers on from `last` (the `resume` event's `taunt`).
   */
  renumber(): void { for (const v of this.held.values()) v.request = 0; }
  /** OBF-20 (the review's F1): the seat's last request taken, 0 for none -- the `resume` event's `taunt`. */
  last(id: number): number { return this.held.get(id)?.request ?? 0; }
  accept(id: number, raw: unknown, now: number): TauntRequest | null {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>;
    if (Object.keys(v).some(k => !['type', 'kind', 'request', 'slot', 'text'].includes(k))) return null;
    if (!Number.isSafeInteger(v.request) || (v.request as number) < 1) return null;
    const previous = this.held.get(id);
    if (previous && (v.request as number) <= previous.request) return null;
    let choice: TauntChoice;
    if (v.kind === 'vocal' && v.slot === undefined && v.text === undefined) choice = { kind: 'vocal' };
    else if (v.kind === 'custom' && Number.isInteger(v.slot) && (v.slot as number) >= 0 && (v.slot as number) < TAUNT_SLOTS && validTauntText(v.text) && v.text.length) {
      choice = { kind: 'custom', slot: v.slot as number, text: v.text };
    } else return null;
    const node = choice.kind === 'vocal' ? 0 : choice.slot + 1;
    const until = previous?.until ?? Array<number>(6).fill(-Infinity);
    if (now < until[node]!) return null;
    until[node] = now + TAUNT_DELAY_SECONDS * 1000;
    this.held.set(id, { request: v.request as number, until });
    return { ...choice, request: v.request as number };
  }
}
