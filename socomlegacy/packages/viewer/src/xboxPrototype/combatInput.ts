import type { Input } from '../gamepad';
import { hotkey, type Firearm } from '../kit';
import { FireModeInput } from '../fireModeInput';

export interface CombatActions {
  trigger(on: boolean): void; reload(): void; select(item: Firearm): void;
  stepZoom?(how: 'in' | 'out' | 'cycle'): unknown;
  switchFireMode?(): unknown;
}
const pressLanes = ['reload', 'swap1', 'swap2', 'zoom', 'zoomOut', 'fireMode'] as const;
type PressLane = typeof pressLanes[number];

/** Browser adaptation: one trigger level across mouse and pad. A focus/round/death
 * gate releases it and requires a fresh press; it never resumes a held control
 * after returning from another window. Gameplay gates stay in FireCore/Kit.
 */
export class PrototypeCombatInput {
  private mouse = false;
  private pad = false;
  private held = false;
  private fresh = false;
  private padBlocked = false;
  private before: Pick<Input, PressLane> = { reload: false, swap1: false, swap2: false, zoom: false, zoomOut: false, fireMode: false };
  private readonly blocked = new Set<PressLane>();
  private readonly fireMode = new FireModeInput();
  constructor(private readonly actions: CombatActions) {}
  private trigger() {
    const on = !this.fresh && (this.mouse || this.pad);
    if (on !== this.held) { this.held = on; this.actions.trigger(on); }
  }
  suspend() {
    this.mouse = false; this.pad = false; this.fresh = true;
    this.padBlocked = true;
    for (const lane of pressLanes) this.blocked.add(lane);
    this.fireMode.flush(false); this.trigger();
  }
  pointer(on: boolean, enabled: boolean) {
    if (!enabled) { this.suspend(); return; }
    this.mouse = on;
    if (!on && !this.pad) this.fresh = false;
    this.trigger();
  }
  key(code: string, enabled: boolean): boolean {
    if (!enabled) return false;
    if (code === 'KeyR') { this.actions.reload(); return true; }
    if (code === 'KeyB') { this.actions.switchFireMode?.(); return true; }
    const key = hotkey(code);
    if (key && 'firearm' in key) { this.actions.select(key.firearm); return true; }
    return false;
  }
  zoom(enabled: boolean) { if (enabled) this.actions.stepZoom?.('cycle'); }
  frame(input: Input, enabled: boolean, dt = 0, padLive = true) {
    if (!enabled) {
      this.suspend(); this.before = input;
      this.fireMode.flush(input.fireMode); return;
    }
    // No physical poll is not a release. Mouse input may resume independently,
    // but a reconnecting pad must release the controls held across the loss.
    const modeBlocked = this.blocked.has('fireMode');
    for (const lane of pressLanes) if (padLive && !input[lane]) this.blocked.delete(lane);
    const pressed = (lane: PressLane) => input[lane] && !this.before[lane] && !this.blocked.has(lane);
    if (padLive && !input.fire) this.padBlocked = false;
    this.pad = input.fire && !this.padBlocked;
    if (!this.pad && !this.mouse) this.fresh = false;
    this.trigger();
    // MatchLanes order: shoulders, zoom, the shared default fire-mode consumer,
    // then reload. No alternate single-press setting is silently substituted.
    if (pressed('swap1')) this.actions.select('rifle');
    if (pressed('swap2')) this.actions.select('pistol');
    if (pressed('zoom')) this.actions.stepZoom?.('in');
    if (pressed('zoomOut')) this.actions.stepZoom?.('out');
    if (modeBlocked) this.fireMode.flush(input.fireMode);
    else if (this.fireMode.step(input.fireMode, dt, { setting: 'default', consumer: true })) this.actions.switchFireMode?.();
    if (pressed('reload')) this.actions.reload();
    this.before = input;
  }
}

export function bindPrototypeCombat(canvas: HTMLCanvasElement, input: PrototypeCombatInput, enabled: () => boolean): () => void {
  const down = (event: PointerEvent) => {
    if (event.button === 0) input.pointer(true, enabled());
    else if (event.button === 2) input.zoom(enabled());
  };
  const up = (event: PointerEvent) => { if (event.button === 0) input.pointer(false, enabled()); };
  const key = (event: KeyboardEvent) => { if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && input.key(event.code, enabled())) event.preventDefault(); };
  const menu = (event: Event) => event.preventDefault();
  const blur = () => input.suspend();
  const visibility = () => { if (document.hidden) input.suspend(); };
  canvas.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
  canvas.addEventListener('keydown', key); canvas.addEventListener('blur', blur); window.addEventListener('blur', blur);
  canvas.addEventListener('contextmenu', menu);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    input.suspend(); canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up);
    canvas.removeEventListener('keydown', key); canvas.removeEventListener('blur', blur); window.removeEventListener('blur', blur);
    canvas.removeEventListener('contextmenu', menu);
    document.removeEventListener('visibilitychange', visibility);
  };
}

/** The hands the trigger may belong to before the firearm (`./walkingGrenades`): an item or a launcher up, the firearm
 * still coming back up after a launcher's lower, and the rockets they have launched (the hold's count, below). */
export interface TriggerHands { equipped(): boolean; firearmWaits(): boolean; trigger(on: boolean): void; cancelHold(): void; rocketsLaunched(): number }
/** The firearm's half (`./combatRuntime`): the trigger as pressed, whether it is held, its pull's count, a handed press. */
export interface TriggerFirearm { trigger(on: boolean): void; held(): boolean; pulls(): number; pull(carried: number): void }

/**
 * Who the trigger belongs to on the Lightweight page: the hands while an item or a launcher is up, else the firearm.
 * TRIGGER-SWAP, the standard page's rule (`../matchFirearm` `triggerOwed`, `suspendTrigger` and `fireFrame`'s hand-over;
 * `../matchThrow` `heldPulls`; research 211 s10, reading, pending review there): a press the hands took, still held, is
 * the firearm's once they hand it over -- as a press landing then, with the pull's count the hold raised (`FireCore.pull`'s
 * `carried`: the firearm's own when an item came up over its held trigger, 1 once a rocket left in the hold) -- so it fires
 * on the first kit step the raise reads 1 (LATER 180, no new press; `FUN_005c4b10` leaves the pad's button and the count).
 * Was (SWAPFIRE-XBOX-HELD-TRIGGER, PC 4's rendered runs): the press went to the hands alone and was dropped at the
 * put-away, R1 had to be let go and pressed again.
 */
export class TriggerOwner {
  private owed = false;
  private owedPulls = 0;
  private rocketsAtOwe = 0;
  constructor(private readonly hands: TriggerHands, private readonly firearm: TriggerFirearm) {}
  private owe(pulls: number): void { this.owed = true; this.owedPulls = pulls; this.rocketsAtOwe = this.hands.rocketsLaunched(); }
  /** The input's trigger level (`PrototypeCombatInput`): a let-go ends what was owed, whoever had it. */
  trigger(on: boolean, enabled: boolean): void {
    if (!on) { this.owed = false; this.owedPulls = 0; }
    if (!this.hands.equipped()) {
      if (!on || !this.hands.firearmWaits()) { this.firearm.trigger(on); return; }
      this.owe(0); return;                              // M7: the firearm still coming back up after a launcher: owed
    }
    if (on) this.owe(0);
    // A let-go the input's gate made (focus lost, a screen up, a death) throws nothing.
    if (!on && !enabled) this.hands.cancelHold(); else this.hands.trigger(on);
  }
  /** An item or a launcher taken up or put away: the firearm lets go; a held trigger is owed back with its count. */
  suspendFirearm(): void {
    if (this.firearm.held()) this.owe(this.firearm.pulls());
    this.firearm.trigger(false);
  }
  /** Before the firearm's frame: the owed press handed over once nothing of the hands owns it; `live` false (out of the
   * walk, the input gated, the dead) lets it go. */
  handOver(live: boolean): void {
    if (!live) { this.owed = false; this.owedPulls = 0; return; }
    if (!this.owed || this.hands.equipped() || this.hands.firearmWaits() || this.firearm.held()) return;
    const carried = this.owedPulls + (this.hands.rocketsLaunched() > this.rocketsAtOwe ? 1 : 0);
    this.owed = false; this.owedPulls = 0;
    this.firearm.pull(carried);
  }
}
