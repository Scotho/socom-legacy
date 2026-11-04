import { uiCommandFold } from '../uiCommands';

/**
 * The menu command object M (0x414ed0; `FUN_00274930` D:L121462-121467 returns it): the queue of 0x34-byte records the
 * menu commands push and the dialog host's tick consumes, the history stack `PREVIOUS_SCREEN` pops, and the popup
 * object (PLAT-10; web research 115 §1.1, §2). `D:L<line>` = a line of `socom2_game.elf.decomp.c` (retail).
 *
 * Layout (constructor `FUN_0027f760` D:L127097-127115, pool `FUN_0027ec60` D:L126682-126711): 40 records
 * `{u32 type; char name[0x30]}` at +0, the count at +0x820, the top index at +0x824 (pre-incremented by every push, so
 * slot 0 is never written), the history -- a vector of 32 pooled 0x30-byte buffers, `DAT_004156fc` its depth and
 * `DAT_00415700` its data -- and the popup object at +0xe40, made on demand (`FUN_0027f190` D:L126907-126934).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The record types the commands queue (research 115 R115.2): 2 switch, 3 popup, 5 back, 6/7/8 activate/enable/disable a button. */
export const MENU_RECORD = { SWITCH: 2, POPUP: 3, BACK: 5, ACTIVATE: 6, ENABLE: 7, DISABLE: 8 } as const;

/** The records in M (+0 .. +0x820 at 0x34 each). */
export const MENU_QUEUE_SLOTS = 40;
/** The history's pooled buffers (`FUN_0027ec60` reserves 32, D:L126682-126711). */
export const MENU_HISTORY_BUFFERS = 32;
/** An empty record's name (the string at 0x3ed680, `PTR_s_NO_ARG_003dd048`). */
export const NO_ARG = 'NO_ARG';
/** SwitchMenu's back target (the string at 0x3ef3a0, compared with `strcmp` `FUN_00198f18`, D:L126571). */
export const PREVIOUS_SCREEN = 'PREVIOUS_SCREEN';

/**
 * MENU_QUEUE_OVERFLOW_READING: the most records pending. Every push pre-increments the top index with no bound
 * (`FUN_0027e720` D:L126574, `FUN_0027eff0` D:L126872); a record at index 40 would land on the count (+0x820). Reading:
 * a push past 39 pending is refused (no script on the disc reaches it, research 115 §1.1). [reading]
 */
export const MENU_QUEUE_OVERFLOW_READING = MENU_QUEUE_SLOTS - 1;
/**
 * MENU_HISTORY_OVERFLOW_READING: the deepest history. `FUN_0027f3f0` (D:L126984-126997) takes the free list's last of
 * the 32 buffers unchecked, so a 33rd push reads below the free list. Reading: the newest 32 are kept. [reading]
 */
export const MENU_HISTORY_OVERFLOW_READING = MENU_HISTORY_BUFFERS;
/**
 * MENU_NAME_LENGTH_READING: the longest name a record holds. The records are written with `strcpy` into 0x30 bytes
 * (D:L126582, D:L126636); a longer name runs into the next record. Reading: names are cut at 47 characters (the
 * disc's are shorter). [reading]
 */
export const MENU_NAME_LENGTH_READING = 0x30 - 1;

/** One record: its type (-1 empty) and its name. */
export interface MenuRecord { type: number; name: string }

/**
 * The popup object at M+0xe40 (0xbf0 bytes): what the dialog host ticks with its step on every frame that consumes no
 * switch (`FUN_003654c0` A6, D:L262348-262350). PLAT-16's component fills it; until it is connected the object does
 * nothing (`../screens/popupSlot.ts`).
 */
export interface PopupObject { tick(step: number): void }

const cut = (name: string): string => (name.length > MENU_NAME_LENGTH_READING ? name.slice(0, MENU_NAME_LENGTH_READING) : name);

export class MenuQueue {
  readonly records: MenuRecord[] = Array.from({ length: MENU_QUEUE_SLOTS }, () => ({ type: -1, name: NO_ARG }));
  /** +0x820: records pending. */
  count = 0;
  /** +0x824: the top record's index. */
  top = 0;
  /** +0x828..: the history, oldest first. */
  readonly history: string[] = [];
  /** +0xe40: the popup object, null until made. */
  popupObject: PopupObject | null = null;

  /** `DAT_004156fc`. */
  get depth(): number { return this.history.length; }

  /**
   * A push (`FUN_0027e720` D:L126574-126589 and D:L126632-126636; `FUN_0027c160/260/360`; `FUN_0027eff0`): top += 1, the
   * record's type and name written, count += 1. False, nothing changed, past MENU_QUEUE_OVERFLOW_READING.
   */
  push(type: number, name: string): boolean {
    if (this.top + 1 > MENU_QUEUE_OVERFLOW_READING) return false;
    this.top += 1;
    this.records[this.top] = { type, name: cut(name) };
    this.count += 1;
    return true;
  }

  /** The record the consumer reads (`FUN_003654c0` D:L262288-262290: the top), or null with none pending. */
  peek(): MenuRecord | null {
    return this.count !== 0 ? this.records[this.top] ?? null : null;
  }

  /** `FUN_0027f460` (D:L127000-127037): the top record consumed. */
  consume(): void {
    const r = this.records[this.top];
    if (r) {
      r.name = NO_ARG;
      switch (r.type) {
        case 0: r.type = -1; break;
        case 1: this.top -= 1; break;
        case 2: case 3: case 4: case 5: case 6: case 7: case 8: r.type = -1; this.top -= 1; break;
        default: break;
      }
    }
    this.count -= 1;
  }

  /** `FUN_0027f3f0` (D:L126984-126997): a buffer from the free list, appended, the name copied in. */
  pushHistory(name: string): void {
    if (this.history.length >= MENU_HISTORY_OVERFLOW_READING) this.history.shift();
    this.history.push(cut(name));
  }

  /** The history pop inside SwitchMenu (D:L126583-126588): the newest name, its buffer back to the free list. */
  popHistory(): string | null {
    return this.history.pop() ?? null;
  }

  /** The history's top (D:L126577-126580), null when empty. */
  historyTop(): string | null {
    return this.history.length ? this.history[this.history.length - 1]! : null;
  }

  /**
   * `FUN_0027edf0(M, killPopup)` (D:L126747-126779): all 40 names to `NO_ARG` (types, count and top unchanged), the
   * history popped into the free list; with `killPopup` the popup object destroyed. Called with 1 by the menu state's,
   * the exit state's and the MP exit state's UnInit.
   */
  flush(killPopup: boolean): void {
    for (const r of this.records) r.name = NO_ARG;
    this.history.length = 0;
    if (killPopup) this.popupObject = null;
  }

  /** `FlushMenuHistory` (`FUN_0027c7f0` D:L125492-125512): the same, the popup kept. */
  flushHistory(): void { this.flush(false); }

  /**
   * SwitchMenu's body (`FUN_0027e720` D:L126570-126638), its argument already resolved (`INPUT_STRING` replaced):
   * - `PREVIOUS_SCREEN` (strcmp): with a history, a type-5 record naming its top and the top popped **now**; with or
   *   without one, MS's BACK sound (`playBack`, D:L126591-126598);
   * - a target equal to the history's top under `FUN_00198b80` (case-insensitive, D:L126608): the same back, no sound;
   * - anything else: a type-2 record (`sprintf("%s")`, D:L126632-126636), the history untouched.
   * Always answers 1.
   */
  switchMenu(target: string, playBack?: () => void): boolean {
    if (target === PREVIOUS_SCREEN) {
      this.back();
      playBack?.();
      return true;
    }
    const top = this.historyTop();
    if (top !== null && uiCommandFold(target) === uiCommandFold(top)) {
      this.back();
      return true;
    }
    this.push(MENU_RECORD.SWITCH, target);
    return true;
  }

  private back(): void {
    const top = this.historyTop();
    if (top === null) return;
    if (this.push(MENU_RECORD.BACK, top)) this.popHistory();
  }

  /** `DisableButton` (`FUN_0027c160` D:L125335-125353). */
  disableButton(name: string): boolean { this.push(MENU_RECORD.DISABLE, name); return true; }
  /** `EnableButton` (`FUN_0027c260` D:L125355-125373). */
  enableButton(name: string): boolean { this.push(MENU_RECORD.ENABLE, name); return true; }
  /** `ActivateButton` (`FUN_0027c360` D:L125375-125393). */
  activateButton(name: string): boolean { this.push(MENU_RECORD.ACTIVATE, name); return true; }
  /** `PopUpDialog`'s record (`FUN_0027eff0` D:L126872-126882): type 3, consumed later with no effect (`POPUP_NAME_UNUSED_READING`). */
  queuePopup(name: string): boolean { return this.push(MENU_RECORD.POPUP, name); }
}
