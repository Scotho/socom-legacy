/**
 * The focus ring (PLAT-11; web research 116 §4): the dialog host's control list (`CGameMenu`+0x290, each `CONTROLS`
 * entry appended in file order by `CGameMenu_LoadFromDesign` `FUN_00367950`, D:L263628-263651) and the focus index
 * `CGameMenu`+0x6d0. There is no neighbour field: the default navigation walks the list, a screen that wants another
 * order binds the directions itself (R116.5).
 *
 * - **At load** (D:L263735-263745, after the screen's `ONSTART`): index 0; the first control activated (vtable +0x50)
 *   when enabled, else a step forward without the sound.
 * - **Next / previous** (`FUN_003670d0` D:L263102-263176 / `FUN_00366d70` D:L263021-263097): nothing on an empty
 *   list; the focused control deactivated (+0x54); the index stepped with wrap; the new control enabled -- activated
 *   when the index changed, and `SELECTION` when asked (`DAT_00408564`, D:L263082-263085); not enabled -- when any
 *   control of the list is enabled, the step again without the sound, and `SELECTION` when asked and the index ended
 *   away from where this step began; none enabled -- the index rests on a disabled control and nothing is active.
 * - **ActivateButton** (the queue's record 6, `FUN_00366b60` D:L262962-263016): the focused control deactivated; the
 *   named control found in the dialog (vtable +0x24 with recursion), activated and `SELECTION` played; the index moved
 *   to it when it is on the ring.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** A control as the ring drives it: its enabled bit (+0x14 bit 7, slot +0x48), its activate (+0x50) and deactivate (+0x54). */
export interface RingControl {
  readonly name: string;
  enabled(): boolean;
  activate(): void;
  deactivate(): void;
}

/**
 * SINGLE_CONTROL_FOCUS_READING (research 116 §4.2): UP or DOWN on a ring of one enabled control deactivates it and does
 * not activate it again -- the index did not change, so step 4 skips the activation. Transcribed as read. [reading]
 */
export const SINGLE_CONTROL_FOCUS_READING = 'deactivated, not re-activated' as const;

export class FocusRing {
  /** +0x6d0. */
  index = 0;

  /** `sound`: `SELECTION` (`DAT_00408564`, vtable +0x1c with (1, 0, 0xff)). */
  constructor(readonly controls: readonly RingControl[], private readonly sound: () => void = () => {}) {}

  get focused(): RingControl | null { return this.controls[this.index] ?? null; }

  /** D:L263735-263745: the build's focus. */
  start(): void {
    if (this.controls.length === 0) return;
    this.index = 0;
    const first = this.controls[0]!;
    if (first.enabled()) first.activate();
    else this.next(false);
  }

  /** `FUN_003670d0(G, sound)`: the next control (DOWN). */
  next(sound: boolean): void { this.step(1, sound); }

  /** `FUN_00366d70(G, sound)`: the previous control (UP). */
  previous(sound: boolean): void { this.step(-1, sound); }

  private step(dir: 1 | -1, sound: boolean): void {
    const n = this.controls.length;
    if (n === 0) return;
    const from = this.index;
    this.controls[from]?.deactivate();
    this.index = dir === 1 ? (this.index + 1) % n : this.index - 1 < 0 ? n - 1 : this.index - 1;
    const c = this.controls[this.index]!;
    if (c.enabled()) {
      if (this.index !== from) {
        c.activate();
        if (sound) this.sound();
      }
      return;
    }
    if (!this.controls.some((x) => x.enabled())) return;
    this.step(dir, false);
    if (this.index !== from && sound) this.sound();
  }

  /** `FUN_00366b60(G, name)`: `found` the named control (found anywhere in the dialog), or null when there is none. */
  activateNamed(name: string, found: RingControl | null): void {
    if (this.controls.length === 0) return;
    this.focused?.deactivate();
    if (!found) return;
    found.activate();
    this.sound();
    const i = this.controls.findIndex((c) => c.name === name);
    if (i >= 0) this.index = i;
  }
}
