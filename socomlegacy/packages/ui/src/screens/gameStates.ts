/**
 * The game object's state machine CG (0x4084c0; PLAT-10, web research 115 §8.1): a 16-slot stack of states fed by a
 * FIFO of requests, one request applied per tick on a tick whose top state is then **not** ticked
 * (`FUN_002ce9e0` D:L171862-171952). The requests: `FUN_002cf2f0` pop (D:L172222-172240), `FUN_002cf380` push
 * (D:L172245-172263), `FUN_002cf410` switch (D:L172271-172296). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * The front end, the load, the round and the end-of-round screens are states of this machine (research 115 §8.2); the
 * menu manager's keywords (`LOAD_SCREEN`, `POP_TO_MENU_STATE`, `MENU_SCREEN`, `SHUTDOWN`) are requests to it.
 *
 * The network half of the tick (`FUN_0030da00`, `FUN_0029dfa0`, `FUN_002ce800` when online) is not this task's.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The stack's slots (+0x14, 16 pointers; the index is clamped to 15, D:L171904-171906 and D:L171933-171935). */
export const GAME_STATE_SLOTS = 16;

/** A state's vtable as CG calls it (research 115 §8.1). */
export interface GameState {
  readonly name: string;
  /** +0xc: told at request time that it is the target of a switch or a push. */
  onRequest?(): void;
  /** +0x10: Init; false keeps the machine where it was (see the requests). */
  init(): boolean;
  /** +0x14: Tick(dt). */
  tick(dt: number): void;
  /** +0x18: told at request time, as the top, that a switch or a pop will take it off. */
  onLeaveRequest?(): void;
  /** +0x1c: UnInit. */
  unInit(): void;
  /** +0x20: OnCover(arg): another state is pushed over it. */
  onCover?(arg: number): void;
  /** +0x24: OnPop(arg): the state over it was popped. */
  onPop?(arg: number): void;
}

/** A queued request (`FUN_002cf700`'s record `{kind, state, arg}`: 0 pop, 1 push, 2 switch). */
export type GameStateRequest =
  | { kind: 'pop'; arg: number }
  | { kind: 'push'; state: GameState; arg: number }
  | { kind: 'switch'; state: GameState };

export interface GameStateMachineOptions {
  /**
   * `FUN_003b05e0()`, called before a switch's and a push's Init (D:L171903, D:L171928): frame and timer bookkeeping
   * (`STATE_CHANGE_FRAME_SYNC_READING`, research 115 §13) -- PLAT-12's `UiClock.frameSync`. Absent, nothing.
   */
  frameSync?: () => void;
}

export class GameStateMachine {
  /** +4: the machine runs only while set (D:L171880). */
  running = true;
  /** +0xc: the top's index (u32; a value of 16 or more reads no top, D:L171873-171878). */
  index = 0;
  /** +0x14. */
  readonly stack: (GameState | null)[] = new Array<GameState | null>(GAME_STATE_SLOTS).fill(null);
  private readonly requests: GameStateRequest[] = [];
  private readonly frameSync?: () => void;

  constructor(opts: GameStateMachineOptions = {}) {
    this.frameSync = opts.frameSync;
  }

  /** The top state (null when the index is outside 0..15 or the slot is empty). */
  top(): GameState | null {
    return this.index >= 0 && this.index < GAME_STATE_SLOTS ? this.stack[this.index] ?? null : null;
  }

  /** Requests queued and not yet applied. */
  get pending(): number { return this.requests.length; }

  /** `FUN_002cf2f0`: a pop queued; the top told (+0x18). Answers the top. */
  pop(arg = 0): GameState | null {
    const top = this.top();
    this.requests.push({ kind: 'pop', arg });
    top?.onLeaveRequest?.();
    return top;
  }

  /** `FUN_002cf380`: a push queued (a null state: nothing); the state told (+0xc). Answers the top. */
  push(state: GameState | null, arg = 0): GameState | null {
    if (!state) return null;
    const top = this.top();
    this.requests.push({ kind: 'push', state, arg });
    state.onRequest?.();
    return top;
  }

  /** `FUN_002cf410`: a switch queued (a null state: nothing); the top told (+0x18), then the state (+0xc). Answers the top. */
  switchTo(state: GameState | null): GameState | null {
    if (!state) return null;
    const top = this.top();
    this.requests.push({ kind: 'switch', state });
    top?.onLeaveRequest?.();
    state.onRequest?.();
    return top;
  }

  /** `FUN_002ce9e0`: with no request pending the top ticks; otherwise the oldest request is applied and nothing ticks. */
  tick(dt: number): void {
    if (!this.running) return;
    const r = this.requests.shift();
    if (!r) { this.top()?.tick(dt); return; }
    const top = this.top();
    switch (r.kind) {
      case 'switch': {                                                    // D:L171899-171913
        top?.unInit();
        this.frameSync?.();
        // the u32 index: a pop from slot 0 wraps it (-1 here, 0xFFFFFFFF there), which the clamp takes to 15 too
        if (this.index < 0 || this.index > GAME_STATE_SLOTS - 1) this.index = GAME_STATE_SLOTS - 1;
        if (r.state.init()) this.stack[this.index] = r.state;
        else top?.init();
        return;
      }
      case 'pop': {                                                       // D:L171915-171921
        top?.unInit();
        if (this.index >= 0 && this.index < GAME_STATE_SLOTS) this.stack[this.index] = null;
        this.index -= 1;
        this.top()?.onPop?.(r.arg);
        return;
      }
      case 'push': {                                                      // D:L171923-171938
        this.frameSync?.();
        this.top()?.onCover?.(r.arg);
        if (r.state.init()) {
          this.index += 1;
          if (this.index < 0 || this.index > GAME_STATE_SLOTS - 1) this.index = GAME_STATE_SLOTS - 1;   // the u32 index, as the switch
          this.stack[this.index] = r.state;
        }
        return;
      }
    }
  }
}
