/**
 * The POPUP record (web research 118 §2): the 220 bytes past the 16-byte header of a `ui::UI_COMMAND` aimed at the
 * node `POPUP`, as the popup's command handler `FUN_0036da20` (D:L266787-267160; vtable 0x4073a0 +0x64) reads them.
 * The handler does not test the opcode byte: any command on `POPUP` is a record (all 285 on the disc are op 0 and 220
 * bytes). Offsets here are into the record; the command's are 0x10 more. Name fields are indices into the running
 * animation's name table (`FUN_0026ed60`), text ids UIMnLOC ids (`FUN_00361b40`); neither is resolved here.
 */

/** Where the record starts in the command: the dispatcher's 16-byte header comes first (research 118 §1). */
export const POPUP_RECORD_AT = 0x10;
/** The record's size (`UiCommand.extra` is 220 bytes on all 285 records). */
export const POPUP_RECORD_SIZE = 220;
/** The whole command: header and record. */
export const POPUP_COMMAND_SIZE = POPUP_RECORD_AT + POPUP_RECORD_SIZE;
/** The two 76-byte button slots, at record +68 (button 1, popup +0x340) and +144 (button 2, popup +0x790). */
export const POPUP_BUTTON_SLOTS = [68, 144] as const;

type Rgb = [number, number, number];

/** A button slot (research 118 §2, "A button slot"; button 1 at D:L266864-267005, button 2 at D:L267006-267135). */
export interface PopupButtonSlot {
  /** +0, +1, +2: the focused, normal and pressed bitmaps (name indices; the states at button +0xfc, +0x130, +0xc8). */
  focused: number; normal: number; pressed: number;
  /** +4, +8: the button's place in the panel (popup +0x780/+0x784, +0xbd0/+0xbd4). */
  x: number; y: number;
  /** +12, +16: the quad's size (button +0x240/+0x244 as floats). A width of 0 makes the button unreachable. */
  w: number; h: number;
  /** +20: the label as a name index (used when +22 is 0); +22 s16: its UIMnLOC id. */
  labelName: number; labelId: number;
  /** +24, +28: the label's pen in the button (button +0xb4/+0xb8). */
  labelOffset: [number, number];
  /** +32, +44, +56: the label's colour in the focused, normal and pressed state (ints, read as floats). */
  colors: { focused: Rgb; normal: Rgb; pressed: Rgb };
  /** +68 == 1 (D:L267003-267005): button +0xbc and +0x85, the quad shifted left by half its width, the label centred. */
  centred: boolean;
  /** +72 f32: the label's scale, every state's +0x30 and button +0x5c. */
  scale: number;
}

export interface PopupRecord {
  /** +0: the text as a name index (used when +2 is 0); +2 s16: its UIMnLOC id. */
  textName: number; textId: number;
  /** +4: the panel's bitmap (a name index). */
  panel: number;
  /** +8, +12: the `POPUP` node's place; +16 the panel's height, +20 its width. */
  x: number; y: number; h: number; w: number;
  /** +24: the text's y offset in the panel (popup +0x308); +28: its x offset and side margin (popup +0x304). */
  textY: number; textX: number;
  /** +32 f32: the text object's +0x40 (`POPUP_TEXT_SCALE_READING`). */
  textScale: number;
  /** +36, +40, +44: the text object's colour (+0x48..+0x50), ints read as floats. */
  textColor: Rgb;
  /** +64: TRIANGLE answers (popup +0x339); +65: keep open on CROSS (+0xbe0); +66: the popup has buttons. */
  triangle: boolean; keep: boolean; hasButtons: boolean;
  /** +67: the answer valve (a name index), read only when +66 is set. */
  valve: number;
  buttons: [PopupButtonSlot, PopupButtonSlot];
}

/** The record of a command's bytes (header included); bytes past the end read as 0. */
export function readPopupRecord(bytes: Uint8Array): PopupRecord {
  const at = POPUP_RECORD_AT;
  const u8 = (o: number): number => bytes[at + o] ?? 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const has = (o: number, n: number): boolean => at + o + n <= bytes.byteLength;
  const s16 = (o: number): number => (has(o, 2) ? view.getInt16(at + o, true) : 0);
  const i32 = (o: number): number => (has(o, 4) ? view.getInt32(at + o, true) : 0);
  const f32 = (o: number): number => (has(o, 4) ? view.getFloat32(at + o, true) : 0);
  const rgb = (o: number): Rgb => [i32(o), i32(o + 4), i32(o + 8)];
  const slot = (b: number): PopupButtonSlot => ({
    focused: u8(b), normal: u8(b + 1), pressed: u8(b + 2),
    x: i32(b + 4), y: i32(b + 8), w: i32(b + 12), h: i32(b + 16),
    labelName: u8(b + 20), labelId: s16(b + 22),
    labelOffset: [i32(b + 24), i32(b + 28)],
    colors: { focused: rgb(b + 32), normal: rgb(b + 44), pressed: rgb(b + 56) },
    centred: u8(b + 68) === 1,
    scale: f32(b + 72),
  });
  return {
    textName: u8(0), textId: s16(2), panel: u8(4),
    x: i32(8), y: i32(12), h: i32(16), w: i32(20), textY: i32(24), textX: i32(28),
    textScale: f32(32), textColor: rgb(36),
    triangle: u8(64) !== 0, keep: u8(65) !== 0, hasButtons: u8(66) !== 0, valve: u8(67),
    buttons: [slot(POPUP_BUTTON_SLOTS[0]), slot(POPUP_BUTTON_SLOTS[1])],
  };
}
