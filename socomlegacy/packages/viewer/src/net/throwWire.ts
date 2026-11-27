import type { NetClient } from './client';
import { rememberCommand } from './firearmWire';

/** Browser transport adaptation shared by NetPage and the experimental renderer.
 * This owns only the existing throw packet and bounded refund journal. The
 * caller still owns command order, throw timing, and authoritative kit resets.
 */
export type ThrowWireClient = Pick<NetClient, 'state' | 'lastSeq' | 'send'>;
export interface ThrowWireDeps {
  client(): ThrowWireClient;
  staleThrow?(kind: string, slot?: number, shot?: number): void;
}

export class ThrowWire {
  /** LOW-2 (research 223 s6): the exact item/slot/shot spent at a command. */
  private readonly sentThrows = new Map<number, { kind: string; slot?: number; shot?: number }>();
  constructor(private readonly deps: ThrowWireDeps) {}
  private get client(): ThrowWireClient { return this.deps.client(); }

  /** Own spawn/resume: old predicted throws cannot refund the authoritative kit. */
  clearPending(): void { this.sentThrows.clear(); }

  /**
   * The page's own throw, to the server (`GrenadeThrower.on('throw')`). PF-13: C4's carries the plant's `target` and the
   * struck `surface` (`GrenadeThrower.on('place')`). LATER 503: `shot`, a rocket's launch id, journalled only (page-local).
   */
  throwEvent(
    kind: string, from: readonly number[], velocity: readonly number[],
    c4?: { target?: number; surface?: { path: string; point: readonly number[] }; eye?: readonly number[]; slot?: number },
    start?: number, slot?: number, shot?: number,
  ): void {
    if (this.client.state !== 'open') return;
    const p = c4?.surface?.point;
    const at = c4?.slot ?? slot;
    rememberCommand(this.sentThrows, this.client.lastSeq(), { kind, ...(at !== undefined ? { slot: at } : {}), ...(shot !== undefined ? { shot } : {}) });
    this.client.send({
      type: 'throw', seq: this.client.lastSeq(), kind,
      from: [from[0]!, from[1]!, from[2]!], velocity: [velocity[0]!, velocity[1]!, velocity[2]!],
      ...(c4?.target !== undefined ? { target: c4.target } : {}),
      ...(c4?.surface && p ? { surface: { path: c4.surface.path, point: [p[0]!, p[1]!, p[2]!] as [number, number, number] } } : {}),
      // LATER 305: the eye C4's aim ray left (the room adds it to its own eyes once it has held it to the camera's locus).
      ...(c4?.surface && p && c4.eye ? { eye: [c4.eye[0]!, c4.eye[1]!, c4.eye[2]!] as [number, number, number] } : {}),
      ...(start !== undefined ? { start } : {}),
      ...(at !== undefined ? { slot: at } : {}),
    });
  }

  /**
   * THROW-INTERRUPT (research 326 §2.4): a hand throwable's release request, on the page's last command; the seq it named,
   * which the `throw` echoes as `start`, or null when no room is open. `hurt` (LATER 1456, a network adaptation): the
   * serial of the last `hurt` the page heard, sent only when known (research 85 §4.3).
   */
  throwStartEvent(kind: string, slot?: number, hurt?: number): number | null {
    if (this.client.state !== 'open') return null;
    const seq = this.client.lastSeq();
    this.client.send({ type: 'throwStart', seq, kind, ...(slot !== undefined ? { slot } : {}), ...(hurt !== undefined ? { hurt } : {}) });
    return seq;
  }

  /** LOW-2 (research 223 s6): refund the named throw once, preserving the
   * existing callback arity for an item, its exact slot, or a rocket's shot. */
  stale(seq: number): void {
    const use = this.sentThrows.get(seq);
    if (!use) return;
    this.sentThrows.delete(seq);
    if (use.shot !== undefined) this.deps.staleThrow?.(use.kind, use.slot, use.shot);   // LATER 503: a rocket's
    else if (use.slot === undefined) this.deps.staleThrow?.(use.kind);
    else this.deps.staleThrow?.(use.kind, use.slot);
    return;
  }
}
