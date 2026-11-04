import { POPUP_NODE } from '../popup/popup';
import { POPUP_BUTTON_SLOTS, POPUP_COMMAND_SIZE, POPUP_RECORD_AT, type PopupButtonSlot, type PopupRecord } from '../popup/record';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The desktop-recompilation screen's content (PLAT-28; web research 142 §3): one notice in PLAT-16's popup, its chrome
 * the original's own. **New text, the owner's to approve** (HUMAN_TASKS H76): no LOC string of the disc says it.
 *
 * The record is the main menu's own one-button popup -- `dlgMenu.rdr`'s `LoadGameOnListBox`, the record over UIMnLOC
 * 517 ("No saved game in that slot. Load will be aborted. CONTINUE.") in `RUN/UIZANIM.ZAR` -- with its text replaced:
 * the panel `popupOp.tif` (all 285 records', research 118 §2), its place and size, the text's margins and colour, and
 * its one button: `active_back.tif` / `pop_butt.tif` / `pop_butt.tif`, labelled by UIMnLOC 226 ("CONTINUE"), at the
 * record's place, size, label offset, colours and scale. Every field is that record's, read with `readPopupRecord`
 * (`FUN_0036da20` D:L266787-267160) and held to the disc by `desktopScreenFixtures.test.ts`; the name indices are this
 * notice's own table (`DESKTOP_SCREEN_NAMES`), since the record's are into its animation's.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/**
 * DESKTOP_SCREEN_TEXT_PLACEHOLDER: the notice's sentence -- the block's own words, not the original's (no LOC string
 * exists, PLAT-28 "Gap"). The owner approves or replaces it (H76). [placeholder]
 */
export const DESKTOP_SCREEN_TEXT_PLACEHOLDER = 'available in the desktop recompilation or with emulators';

/**
 * DESKTOP_SCREEN_LOOK_PLACEHOLDER: the look -- the original's popup chrome (`popupOp.tif`, POPUPDIALOG), the least-
 * invented option PLAT-28's block names, taken whole from the main menu's own one-button record (`LoadGameOnListBox`,
 * UIMnLOC 517), opened as `PopUpDialog` opens a popup (the node shown, `.METAL`). The owner signs the look off (H76);
 * the chrome is compared with a console popup frame when one is scored (PLAT-28 "Acceptance"). [placeholder]
 */
export const DESKTOP_SCREEN_LOOK_PLACEHOLDER = 'dlgMenu.rdr LoadGameOnListBox record 517, its text replaced' as const;

/** Where the chrome is taken from: the set, the animation, the record's own text id (the disc's). */
export const DESKTOP_SCREEN_TEMPLATE = { archive: 'RUN/UIZANIM.ZAR', set: 'dlgMenu.rdr', animation: 'LoadGameOnListBox', textId: 517 } as const;

/** UIMnLOC 226, the label of the template's button: "CONTINUE" (`RUN/LOCALE/STATES/UIMNLOC.ZAR`). */
export const DESKTOP_SCREEN_CONTINUE_LABEL = 226;

/**
 * The answer valve of the notice's popup. It lives in the notice's own valve store, never the game's: the screen
 * writes nothing any script reads (PLAT-28's acceptance: every valve unchanged).
 */
export const DESKTOP_SCREEN_ANSWER_VALVE = 'DesktopScreenContinue';

/** `PopUpDialog`'s argument for the notice: unused by the original (`POPUP_NAME_UNUSED_READING`), `NA` as the disc's records pass. */
export const DESKTOP_SCREEN_POPUP_NAME = 'NA';

/** The notice's name table: what the record's name indices point at (`FUN_0026ed60`'s table, here the notice's own). */
export const DESKTOP_SCREEN_NAMES: readonly string[] = [
  'NA', DESKTOP_SCREEN_TEXT_PLACEHOLDER, 'popupOp.tif', DESKTOP_SCREEN_ANSWER_VALVE, 'active_back.tif', 'pop_butt.tif',
];
const N = (s: string): number => DESKTOP_SCREEN_NAMES.indexOf(s);

const NO_BUTTON: PopupButtonSlot = {
  // The template's second slot: every index 255 (past the table), the rest 0, the scale 1 (width 0: unreachable).
  focused: 255, normal: 255, pressed: 255, x: 0, y: 0, w: 0, h: 0, labelName: 255, labelId: 0, labelOffset: [0, 0],
  colors: { focused: [0, 0, 0], normal: [0, 0, 0], pressed: [0, 0, 0] }, centred: false, scale: 1,
};

/** The template's fields (the disc's record 517, decoded), with this notice's name indices. */
export const DESKTOP_SCREEN_RECORD: PopupRecord = {
  textName: N(DESKTOP_SCREEN_TEXT_PLACEHOLDER), textId: 0, panel: N('popupOp.tif'),
  x: 150, y: 180, h: 120, w: 340, textY: 45, textX: 25,
  textScale: 1, textColor: [128, 128, 128],
  triangle: false, keep: false, hasButtons: true, valve: N(DESKTOP_SCREEN_ANSWER_VALVE),
  buttons: [
    {
      focused: N('active_back.tif'), normal: N('pop_butt.tif'), pressed: N('pop_butt.tif'),
      x: 125, y: 80, w: 85, h: 25, labelName: 0, labelId: DESKTOP_SCREEN_CONTINUE_LABEL, labelOffset: [15, 25],
      colors: { focused: [91, 72, 36], normal: [128, 128, 128], pressed: [102, 87, 38] },
      centred: false, scale: Math.fround(0.9),
    },
    NO_BUTTON,
  ],
};

/** A record's bytes as `readPopupRecord` reads them, behind the dispatcher's 16-byte header (research 118 §1-§2). */
export function writePopupRecord(r: PopupRecord): Uint8Array {
  const b = new Uint8Array(POPUP_COMMAND_SIZE), v = new DataView(b.buffer), at = POPUP_RECORD_AT;
  const rgb = (o: number, c: readonly number[]): void => { for (let i = 0; i < 3; i++) v.setInt32(at + o + 4 * i, c[i]!, true); };
  v.setUint8(at + 0, r.textName); v.setInt16(at + 2, r.textId, true); v.setUint8(at + 4, r.panel);
  v.setInt32(at + 8, r.x, true); v.setInt32(at + 12, r.y, true); v.setInt32(at + 16, r.h, true); v.setInt32(at + 20, r.w, true);
  v.setInt32(at + 24, r.textY, true); v.setInt32(at + 28, r.textX, true); v.setFloat32(at + 32, r.textScale, true);
  rgb(36, r.textColor);
  v.setUint8(at + 64, r.triangle ? 1 : 0); v.setUint8(at + 65, r.keep ? 1 : 0); v.setUint8(at + 66, r.hasButtons ? 1 : 0);
  v.setUint8(at + 67, r.valve);
  r.buttons.forEach((s, k) => {
    const o = POPUP_BUTTON_SLOTS[k]!;
    v.setUint8(at + o, s.focused); v.setUint8(at + o + 1, s.normal); v.setUint8(at + o + 2, s.pressed);
    v.setInt32(at + o + 4, s.x, true); v.setInt32(at + o + 8, s.y, true); v.setInt32(at + o + 12, s.w, true); v.setInt32(at + o + 16, s.h, true);
    v.setUint8(at + o + 20, s.labelName); v.setInt16(at + o + 22, s.labelId, true);
    v.setInt32(at + o + 24, s.labelOffset[0], true); v.setInt32(at + o + 28, s.labelOffset[1], true);
    rgb(o + 32, s.colors.focused); rgb(o + 44, s.colors.normal); rgb(o + 56, s.colors.pressed);
    v.setUint8(at + o + 68, s.centred ? 1 : 0); v.setFloat32(at + o + 72, s.scale, true);
  });
  return b;
}

/** The notice's own animation name (no set holds it: the command is the notice's, never a script's). */
export const DESKTOP_SCREEN_ANIMATION = 'DesktopScreenNotice';

/** The command that fills the notice's popup: the record on the node `POPUP` (op 0, byte +6 = 0xE8). */
export function desktopNoticeCommand(record: PopupRecord = DESKTOP_SCREEN_RECORD): ZAnimUiCommand {
  const bytes = writePopupRecord(record);
  bytes[4] = 1; bytes[6] = 0xe8;
  return { anim: DESKTOP_SCREEN_ANIMATION, sequence: 'main', nodeIndex: 1, node: POPUP_NODE, opcodeByte: 0xe8, fn: null, arg: 'NA', loc: 0, bytes };
}
