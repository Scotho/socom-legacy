import { DIALOG_BUTTON_STATES, DIALOG_EVENTS, type DialogBinding, type DialogDesign, type DialogRecord, type DialogSubordinate, type DialogWidget, type RadioStripPage } from '../dialog';
import type { UiBindingGate } from '../uiCommands';
import { NODE_OP_BASE } from '../widgets/host';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { VIDEO_PICTURE_DIALOG } from './videoPicture';

/**
 * **VIDEO OPTIONS' browser rows -- a browser adaptation, no original** (CPS-4b, ruling CPS.R7 (c); the owner, Craig,
 * 2026-11-02: "some of the original unused ones can be hidden and the ui can be adjusted as needed"). Product track: it
 * changes nothing the game does.
 *
 * - **Three rows** on `dlgOptions_Video.rdr`, after VIDEO MODE: RENDER SCALE (PERFORMANCE / BALANCED / QUALITY), SHADOWS
 *   (ON / OFF) and SHOW FPS (ON / OFF) -- the page's video keeper's three settings (viewer `./videoSettings`, CPS-4a).
 *   Each is the disc's own HEAD BOB strip and box specs (look, size, check image), cloned, with a literal caption in the
 *   disc's font (as the disc's own SCREEN POSITION is), the disc's ON / OFF captions in TEAMMATE NAMES' order (ON left),
 *   no disc script on any box, and a `RadioStripPage` over the keeper: the strip is made at the keeper's value and a step
 *   sets the keeper at once. They are browser settings, not card options: no valve, no `StoreOptions`, no card save; the
 *   page's SAVE AND LEAVE and DEFAULT SETTINGS keep to the card's rows.
 * - **HELP WINDOWS hidden** (`VIDEO_ROWS_HIDDEN`): inert in the port -- `HelpWindowsEnabled`'s one reader is the
 *   campaign's help pop-up, not in the port (research 302 §4; `./optionsCommands` `OPTIONS_BUILT_ROWS`). The disc's set
 *   `dlgOptions_Video.rdr` names `helpwindows` (`tools/dump-dialogs.ts --set`), so the control is kept -- its widget
 *   built, the scripts' Selection and its boxes' `enable_Help` / `disable_Help` run and the card's value round-trips --
 *   and only hidden: not drawn and off the focus ring (`DialogRecord.hidden`).
 * - **The layout** (two rows more, one less): the rows from TEAMMATE NAMES down are laid one disc pitch apart (the disc's
 *   30, VIDEO MODE's y less TEAMMATE NAMES') from one pitch higher (160), so RETURN ends at 430 on the 448-line frame;
 *   the brightness `spectrum` is shortened to sit above them (`VIDEO_ROWS_SPECTRUM_ADAPTATION`), and the lower bar
 *   `eq_Lower_back` starts at the main window's x so it no longer runs under RETURN (its right end kept).
 */
export const VIDEO_SETTINGS_ROWS_ADAPTATION = 'CPS.R7 (c): VIDEO OPTIONS -- RENDER SCALE, SHADOWS, SHOW FPS on the page\'s video keeper; HELP WINDOWS hidden' as const;

/** The keeper's presets, lowest first (viewer `./videoSettings` `RENDER_SCALES`; ui does not import the viewer). */
export type VideoRowsScale = 'performance' | 'balanced' | 'quality';
export const VIDEO_ROWS_SCALES: readonly VideoRowsScale[] = ['performance', 'balanced', 'quality'];
export interface VideoRowsSettings { renderScale: VideoRowsScale; shadows: boolean; showFps: boolean }
/** The page's video keeper as the rows use it (viewer `./videoSettings` `videoSettingsKeeper`). */
export interface VideoRowsKeeper {
  get(): VideoRowsSettings;
  set(patch: Partial<VideoRowsSettings>): void;
}

/** The three strips' names: none the disc's scripts know. */
export const VIDEO_ROWS = { renderScale: 'RenderScaleRow', shadows: 'ShadowsRow', showFps: 'ShowFpsRow' } as const;
/** The strips' captions, literal, in the disc's font. */
export const VIDEO_ROW_CAPTIONS = { renderScale: 'RENDER SCALE', shadows: 'SHADOWS', showFps: 'SHOW FPS' } as const;
/** RENDER SCALE's boxes and their literal captions, in `VIDEO_ROWS_SCALES`' order. */
export const VIDEO_ROW_SCALE_BOXES: readonly string[] = ['RenderPerformance', 'RenderBalanced', 'RenderQuality'];
export const VIDEO_ROW_SCALE_CAPTIONS: readonly string[] = ['PERFORMANCE', 'BALANCED', 'QUALITY'];
/**
 * RENDER SCALE's box step (an adaptation): wider than the disc's 120 so PERFORMANCE (102 px in `font_text_01`, measured
 * through `measureText` off the disc's face) clears BALANCED's box, and QUALITY (59 px) ends inside the main window (x 625).
 */
export const VIDEO_ROW_SCALE_STEP_ADAPTATION = 150;
/** The toggles' boxes: ON (the disc's `_185_ON_MSG`) at the disc's 200, OFF (`_678_OFF_MSG`) at its 320 -- TEAMMATE NAMES' order. */
export const VIDEO_ROW_TOGGLE_BOXES = { shadows: ['ShadowsOn', 'ShadowsOff'], showFps: ['ShowFpsOn', 'ShowFpsOff'] } as const;
/** The disc's controls hidden (kept for the scripts that name them). */
export const VIDEO_ROWS_HIDDEN: readonly string[] = ['helpwindows'];
/** The brightness `spectrum` (the disc's 300 x 55 at y 135) moved up and shortened to end above TEAMMATE NAMES' boxes (158). */
export const VIDEO_ROWS_SPECTRUM_ADAPTATION = { y: 127, height: 28 } as const;

/**
 * **The rows' help lines -- a browser adaptation, no original** (CPS-4b's follow-up; the owner, 2026-11-02: "the ui can
 * be adjusted as needed"). Product track: it changes nothing the game does. On VIDEO the disc's rows write the page's
 * info line, the TEXT object `instText` (the disc's at (320, 92), HCENTERED, over `InfoWin`, 610 wide), when focused:
 * a strip's ONACTIVATE -- the strip's own `ANIMATIONS` are its last box's, the reader's depth-first find (`../rdrLookup`,
 * `FUN_0032f0e0`) -- runs a script of `dlgOptions_Video.rdr` (`OnVideoModeAct`, `OnOnHeadBobAct`, `OnTeamMateNamesAct`)
 * that names the line by its string id (`tools/dump-dialogs.ts --dialog dlgOptions_Video.rdr`: locs 718,
 * 717, 680). The three rows do the same through the port: each strip's own ONACTIVATE names `VIDEO_ROW_HELP_ANIMATION`
 * (no disc set holds it) with the row's key, and `videoRowHelpGate` (registered by `./optionsCommands`) takes its start
 * and sends `instText` op 1 `Caption` with the literal line -- the base text handler's name path, loc 0 (`FUN_0036fcc0`,
 * `../widgets/button` `baseTextCommand`) -- so the next row's own ONACTIVATE writes its line when the focus moves on.
 * VIDEO MODE's line stays the disc's (OT.R79's strip keeps its ONACTIVATE).
 *
 * The words are in the disc's sentence case and in its `font_text_01`: every character a glyph of the face, and each
 * line within `InfoWin` (measured through `measureText` off the disc's face, source inspection: 589, 512 and 392 px; the
 * disc's widest on the page, BRIGHTNESS', 558). RENDER SCALE's is shorter than the brief's first wording, which measured
 * 790 px and ran off the 640-wide frame.
 */
export const VIDEO_ROW_HELP_ADAPTATION = 'CPS-4b follow-up, a browser adaptation: RENDER SCALE, SHADOWS and SHOW FPS write VIDEO\'s info line (instText) on focus' as const;
/** The rows' lines, literal, in the disc's font. */
export const VIDEO_ROW_HELP = {
  renderScale: 'Pixels for frames: Performance fewer, Balanced up to 1440 lines, Quality all.',
  shadows: 'Draw the characters\' shadows. Off saves a little time each frame.',
  showFps: 'Show the frame rate and frame time in the corner.',
} as const;
/** The strips' ONACTIVATE animation: a name no disc set holds, taken by `videoRowHelpGate`. */
export const VIDEO_ROW_HELP_ANIMATION = 's2u_video_row_help';
/** VIDEO's info line (`dlgOptions_Video.rdr`'s TEXT object). */
export const VIDEO_ROW_HELP_NODE = 'instText';
/** The gate's name in the host (`UiCommandHost.setBindingGate`). */
export const VIDEO_ROW_HELP_GATE = 'CPS-4b video row help';

type HelpKey = keyof typeof VIDEO_ROW_HELP;
const isHelpKey = (k: string | null): k is HelpKey => k !== null && Object.prototype.hasOwnProperty.call(VIDEO_ROW_HELP, k);

/** A strip's ONACTIVATE binding naming the help animation with the row's key. */
const helpBinding = (key: HelpKey): DialogBinding => ({
  kind: 'event', name: 'ONACTIVATE', code: DIALOG_EVENTS.ONACTIVATE!, state: DIALOG_BUTTON_STATES.FALLING!, animation: VIDEO_ROW_HELP_ANIMATION, argument: key,
});

/** `instText.op1("<line>")`: op 1 `Caption` with the literal line as its name and loc 0 (the name path of `baseTextCommand`). */
export function videoRowHelpCommand(key: HelpKey): ZAnimUiCommand {
  return {
    anim: VIDEO_ROW_HELP_ANIMATION, sequence: VIDEO_ROW_HELP_ANIMATION, nodeIndex: 1, node: VIDEO_ROW_HELP_NODE, opcodeByte: NODE_OP_BASE + 1,
    fn: 'Caption', arg: VIDEO_ROW_HELP[key], loc: 0, bytes: new Uint8Array(0x10),
  };
}

/** The page's binding gate for the rows' help (`UiBindingGate`): on VIDEO, the help animation writes its row's line through `node`. */
export function videoRowHelpGate(node: (cmd: ZAnimUiCommand) => unknown): UiBindingGate {
  return (b) => {
    if (b.animation !== VIDEO_ROW_HELP_ANIMATION || b.dialog.toLowerCase() !== VIDEO_PICTURE_DIALOG.toLowerCase() || !isHelpKey(b.argument)) return false;
    node(videoRowHelpCommand(b.argument));
    return true;
  };
}

const FIRST_ROW = 'TeamMateNames', AFTER = 'video_mode', TEMPLATE = 'headbobbing';
const ON_CAPTION = '_185_ON_MSG', OFF_CAPTION = '_678_OFF_MSG';

type Strip = Extract<DialogWidget, { type: 'RADIOSTRIP' }>;
type Box = Extract<DialogWidget, { type: 'CHECKBOX' }>;
type Image = Extract<DialogWidget, { type: 'IMAGE' }>;

const stripOf = (r: DialogRecord | undefined): Strip | null => (r?.widget.type === 'RADIOSTRIP' ? r.widget : null);

/** A box from the template's: renamed, placed, captioned, under `row`, with no disc script (the help line is the strip's). */
function boxFrom(from: DialogSubordinate, name: string, row: string, x: number, caption: string): DialogSubordinate {
  const w = from.widget as Box;
  return {
    ...from, name, x, childOf: row,
    widget: {
      ...w, button: { ...w.button, caption, bindings: [] },
      onCheck: { ...w.onCheck, animation: null, argument: null }, onUncheck: { ...w.onUncheck, animation: null, argument: null },
    },
  };
}

/** A row from the template strip: renamed, captioned, its boxes, bound to the page; its one binding the help line's ONACTIVATE. */
function rowFrom(template: DialogRecord, name: string, caption: string, help: HelpKey, subordinates: DialogSubordinate[], page: RadioStripPage): DialogRecord {
  const s = template.widget as Strip;
  return { ...template, name, childOf: name, widget: { ...s, button: { ...s.button, caption, bindings: [helpBinding(help)] }, subordinates, page } };
}

/** VIDEO's design with the three rows, HELP WINDOWS hidden, and the layout above; a design without the disc's rows as it was. */
export function videoSettingsDesign(design: DialogDesign, keeper: VideoRowsKeeper): DialogDesign {
  const first = design.controls.findIndex((c) => c.name === FIRST_ROW), after = design.controls.findIndex((c) => c.name === AFTER);
  const template = design.controls.find((c) => c.name === TEMPLATE);
  const tStrip = stripOf(template);
  if (first < 0 || after < first || !template || !tStrip || design.controls.some((c) => c.name === VIDEO_ROWS.renderScale)) return design;
  const on = tStrip.subordinates.find((s) => s.x === Math.min(...tStrip.subordinates.map((b) => b.x)));
  const off = tStrip.subordinates.find((s) => s.x === Math.max(...tStrip.subordinates.map((b) => b.x)));
  if (!on || !off || on === off || on.widget.type !== 'CHECKBOX' || off.widget.type !== 'CHECKBOX') return design;
  const pitch = design.controls[after]!.y - design.controls[first]!.y;

  const scaleRow = VIDEO_ROWS.renderScale;
  const rows: DialogRecord[] = [
    rowFrom(template, scaleRow, VIDEO_ROW_CAPTIONS.renderScale, 'renderScale',
      VIDEO_ROW_SCALE_BOXES.map((n, i) => boxFrom(on, n, scaleRow, on.x + VIDEO_ROW_SCALE_STEP_ADAPTATION * i, VIDEO_ROW_SCALE_CAPTIONS[i]!)),
      {
        get: () => { const i = VIDEO_ROWS_SCALES.indexOf(keeper.get().renderScale); return i < 0 ? 1 : i; },
        set: (i) => { const to = VIDEO_ROWS_SCALES[i]; if (to) keeper.set({ renderScale: to }); },
      }),
    ...(['shadows', 'showFps'] as const).map((key) => rowFrom(template, VIDEO_ROWS[key], VIDEO_ROW_CAPTIONS[key], key, [
      boxFrom(on, VIDEO_ROW_TOGGLE_BOXES[key][0], VIDEO_ROWS[key], on.x, ON_CAPTION),
      boxFrom(off, VIDEO_ROW_TOGGLE_BOXES[key][1], VIDEO_ROWS[key], off.x, OFF_CAPTION),
    ], {
      get: () => (keeper.get()[key] ? 0 : 1),
      set: (i) => { keeper.set(key === 'shadows' ? { shadows: i === 0 } : { showFps: i === 0 }); },
    })),
  ];
  const controls = [...design.controls.slice(0, after + 1), ...rows, ...design.controls.slice(after + 1)]
    .map((c): DialogRecord => (VIDEO_ROWS_HIDDEN.includes(c.name) ? { ...c, hidden: true } : c));
  // The rows from TEAMMATE NAMES down, shown ones, one pitch apart from one pitch higher.
  let y = design.controls[first]!.y - pitch;
  const laid = controls.map((c, i) => {
    if (i < first || c.hidden) return c;
    const at = { ...c, y };
    y += pitch;
    return at;
  });
  const main = design.controls.find((c) => c.name === 'MainWindow' && c.widget.type === 'IMAGE');
  const objects = design.objects.map((o): DialogRecord => {
    if (o.widget.type !== 'IMAGE') return o;
    const w: Image = o.widget;
    if (o.name === 'spectrum') return { ...o, y: VIDEO_ROWS_SPECTRUM_ADAPTATION.y, widget: { ...w, image: { ...w.image, size: [w.image.size[0], VIDEO_ROWS_SPECTRUM_ADAPTATION.height] } } };
    if (o.name === 'eq_Lower_back' && main) return { ...o, x: main.x, widget: { ...w, image: { ...w.image, size: [o.x + w.image.size[0] - main.x, w.image.size[1]] } } };
    return o;
  });
  return { ...design, controls: laid, objects };
}

/** A dialog lookup with VIDEO's design passed through `videoSettingsDesign` once (the lookup caches its designs). */
export function videoSettingsLookup(lookup: (name: string) => DialogDesign | null, keeper: VideoRowsKeeper): (name: string) => DialogDesign | null {
  let patched: { from: DialogDesign; to: DialogDesign } | null = null;
  return (name) => {
    const d = lookup(name);
    if (!d || name.toLowerCase() !== VIDEO_PICTURE_DIALOG.toLowerCase()) return d;
    if (patched?.from !== d) patched = { from: d, to: videoSettingsDesign(d, keeper) };
    return patched.to;
  };
}

/** Whether a built design is VIDEO's with the rows. */
export function isVideoSettingsDesign(design: DialogDesign): boolean {
  return design.controls.some((c) => c.name === VIDEO_ROWS.renderScale && c.widget.type === 'RADIOSTRIP');
}
