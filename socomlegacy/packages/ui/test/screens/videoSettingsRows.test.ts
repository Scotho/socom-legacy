import { describe, expect, it } from 'vitest';
import { buildDialogScreen } from '../../src/compositor/dialogScreen';
import { findNode } from '../../src/compositor/scene';
import type { DialogDesign, DialogRecord } from '../../src/dialog';
import { focusRingRecords, stripBoxAt } from '../../src/input/menuInput';
import { VIDEO_PICTURE_DIALOG } from '../../src/screens/videoPicture';
import { OptionsCommands, type OptionsCommandsOptions } from '../../src/screens/optionsCommands';
import { captionCodes } from '../../src/text/captions';
import { UiCommandHost } from '../../src/uiCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  VIDEO_ROW_HELP, VIDEO_ROW_HELP_ADAPTATION, VIDEO_ROW_HELP_ANIMATION, VIDEO_ROW_HELP_GATE, VIDEO_ROW_HELP_NODE, videoRowHelpGate,
  VIDEO_ROW_CAPTIONS, VIDEO_ROW_SCALE_BOXES, VIDEO_ROW_SCALE_CAPTIONS, VIDEO_ROW_SCALE_STEP_ADAPTATION, VIDEO_ROWS, VIDEO_ROWS_HIDDEN,
  VIDEO_ROWS_SPECTRUM_ADAPTATION, VIDEO_SETTINGS_ROWS_ADAPTATION, isVideoSettingsDesign, videoSettingsDesign, videoSettingsLookup,
  type VideoRowsKeeper, type VideoRowsSettings,
} from '../../src/screens/videoSettingsRows';
import { CheckboxWidget, RadioStripWidget, WidgetSet, widgetPad } from '../../src/widgets/index';
import { textFace } from '../text/fixtures';
import { RecordingHost, design, nodeCmd, r, rec } from '../widgets/fixtures';

/**
 * CPS-4b (CPS.R7 (c); the owner, 2026-11-02: "some of the original unused ones can be hidden and the ui can be adjusted as
 * needed") -- a browser adaptation on the product track: VIDEO OPTIONS (`dlgOptions_Video.rdr`) gains RENDER SCALE,
 * SHADOWS and SHOW FPS, strips bound to the page's video keeper (viewer `./videoSettings`), and HELP WINDOWS is kept for
 * the disc's scripts (its set names `helpwindows`) but hidden and off the focus ring. The design below has the disc's
 * shapes and positions (`tools/dump-dialogs.ts --dialog dlgOptions_Video.rdr`); no disc bytes.
 */

const STATES = ['NORMAL', 'ACTIVE', 'PRESSED', 'DISABLED'] as const;
const looks = () => STATES.flatMap((s) => [s, [r('IMAGE', s === 'ACTIVE' ? 'brown_back_real.tif' : 'brown_back.tif')]]);
const box = (name: string, x: number, caption: string, anim: string, act?: string) => (parent: string) => r(
  'NAME', name, 'XPOS', String(x), 'YPOS', '-5', 'TYPE', 'CHECKBOX', 'SPEC', r(
    'CHILDOF', parent, 'CHECK_X', '7', 'CHECK_Y', '7', 'CHECKSIZE_X', '25', 'CHECKSIZE_Y', '25', 'CHECK_TEXTURE', 'op_check.tif',
    'ONCHECK', r('BUTTON', 'NONE', 'ANIMATION', anim), 'CAPTION', caption, 'SCALE', '1', 'XOFFSET', '35', 'YOFFSET', '30',
    'NORMAL', 'op_checkbox.tif', 'ACTIVE', 'op_checkbox.tif', 'PRESSED', 'op_checkbox.tif', 'XSIZE', '35', 'YSIZE', '35',
    ...(act ? ['ANIMATIONS', [r('EVENT', 'ONACTIVATE', 'ANIMATION', act)]] : []),
  ));
const strip = (name: string, y: number, caption: string, subs: ReturnType<typeof box>[]) =>
  rec(name, 'RADIOSTRIP', 16, y, r('XSIZE', '160', 'YSIZE', '30', 'CAPTION', caption, 'XOFFSET', '10', 'YOFFSET', '28', 'SCALE', '1', ...looks(), 'SUBORDINATES', subs.map((b) => b(name))), 'CHILDOF', name);
const button = (name: string, y: number, caption: string, cross: string) =>
  rec(name, 'BUTTON', 16, y, r('XSIZE', '160', 'YSIZE', '30', 'XOFFSET', '10', 'YOFFSET', '28', 'CAPTION', caption, 'SCALE', '1', ...looks(),
    'ANIMATIONS', [r('BUTTON', 'CROSS', 'ANIMATION', cross)]));
const image = (name: string, x: number, y: number, w: number, h: number, file: string) =>
  rec(name, 'IMAGE', x, y, r('FILENAME', file, 'SIZE', [String(w), String(h)]));

const video = (): DialogDesign => design([
  image('MainWindow', 185, 98, 440, 300, 'backsolid.tif'),
  image('SPassBack', 16, 96, 160, 30, 'brown_back.tif'),
  rec('brightnessbar', 'SLIDERBAR', 236, 99, r('XSIZE', '280', 'YSIZE', '8', 'CAPTION', '_711_BRIGHTNESS_MSG', 'KNOB_TEXTURE', 'op_knob.tif')),
  strip('TeamMateNames', 190, '_677_TeammateNames_MSG', [box('TeamMateNameOn', 200, '_185_ON_MSG', 'Enable_TeamNames'), box('TeamMateNameOff', 320, '_678_OFF_MSG', 'Disable_TeamNames', 'OnTeamMateNamesAct')]),
  strip('video_mode', 220, '_712_VideoMode_MSG', [box('VideoNTSC', 200, '_713_INTERLACED_MSG', 'video_ntsc'), box('VideoDTV', 320, '_714_ProgressiveScan480_MSG', 'video_dtv', 'OnVideoModeAct')]),
  strip('helpwindows', 250, '_715_HelpWindows_MSG', [box('Helpoff', 320, '_678_OFF_MSG', 'disable_Help'), box('Helpon', 200, '_185_ON_MSG', 'enable_Help', 'OnHelpWindowsAct')]),
  strip('headbobbing', 280, '_716_HeadBob_MSG', [box('headboboff', 320, '_678_OFF_MSG', 'disable_headbob'), box('headbobon', 200, '_185_ON_MSG', 'enable_headbob', 'OnOnHeadBobAct')]),
  button('ScreenAdjustBtn', 310, 'SCREEN POSITION', 'GoToScreenAdjust'),
  button('Default', 340, '_201_DefaultSettings_MSG', 'do_video_default'),
  button('SaveAndLeaveBtn', 370, '_202_RETURN_MSG', 'ReturnToOptions'),
], [
  image('eq_Lower_back', 16, 403, 610, 32, 'backsolid.tif'),
  rec('instText', 'TEXT', 320, 92, r('HCENTERED', [], 'COLOR', ['91', '72', '36'], 'SCALE', '1', 'CAPTION', '_710_AdjustBrightnessSo_MSG')),
  image('spectrum', 250, 135, 300, 55, 'spectrum.tif'),
]);

/** A keeper as the page's (`videoSettingsKeeper`): set merges a patch; every set recorded. */
const keeper = (start: Partial<VideoRowsSettings> = {}): VideoRowsKeeper & { sets: Partial<VideoRowsSettings>[]; value: VideoRowsSettings } => {
  const k = {
    value: { renderScale: 'balanced', shadows: true, showFps: false, ...start } as VideoRowsSettings,
    sets: [] as Partial<VideoRowsSettings>[],
    get: () => ({ ...k.value }),
    set: (p: Partial<VideoRowsSettings>) => { k.sets.push(p); k.value = { ...k.value, ...p }; },
  };
  return k;
};
const at = (d: DialogDesign, name: string): DialogRecord => d.controls.find((c) => c.name === name) ?? d.objects.find((c) => c.name === name)!;
const subsOf = (rec_: DialogRecord) => (rec_.widget as Extract<DialogRecord['widget'], { type: 'RADIOSTRIP' }>).subordinates;
const caption = (rec_: { widget: DialogRecord['widget'] }) => (rec_.widget as { button: { caption: string } }).button.caption;
const ROWS_AFTER = ['TeamMateNames', 'video_mode', VIDEO_ROWS.renderScale, VIDEO_ROWS.shadows, VIDEO_ROWS.showFps, 'headbobbing', 'ScreenAdjustBtn', 'Default', 'SaveAndLeaveBtn'];

describe('CPS-4b: VIDEO OPTIONS\' rows on the page\'s video keeper (VIDEO_SETTINGS_ROWS_ADAPTATION)', () => {
  it('is labelled a browser adaptation of CPS.R7', () => {
    expect(VIDEO_SETTINGS_ROWS_ADAPTATION).toContain('CPS.R7');
    expect(VIDEO_ROWS_HIDDEN).toEqual(['helpwindows']);
  });

  it('inserts RENDER SCALE, SHADOWS, SHOW FPS after VIDEO MODE; HELP WINDOWS kept (its scripts name it) and hidden', () => {
    const before = video(), d = videoSettingsDesign(before, keeper());
    expect(d.controls.map((c) => c.name)).toEqual([
      'MainWindow', 'SPassBack', 'brightnessbar', 'TeamMateNames', 'video_mode', VIDEO_ROWS.renderScale, VIDEO_ROWS.shadows, VIDEO_ROWS.showFps,
      'helpwindows', 'headbobbing', 'ScreenAdjustBtn', 'Default', 'SaveAndLeaveBtn',
    ]);
    expect(at(d, 'helpwindows').hidden).toBe(true);
    expect(subsOf(at(d, 'helpwindows')).map((s) => s.name)).toEqual(['Helpoff', 'Helpon']);           // the disc's boxes and scripts kept
    expect(d.controls.filter((c) => c.hidden).map((c) => c.name)).toEqual(['helpwindows']);
    expect(before.controls.map((c) => c.name)).toContain('helpwindows');
    expect(before.controls.some((c) => c.hidden)).toBe(false);                                          // the disc's design untouched
    expect(isVideoSettingsDesign(d)).toBe(true);
    expect(isVideoSettingsDesign(before)).toBe(false);
  });

  it('the rows: the disc\'s HEAD BOB strip\'s look, literal captions, the disc\'s ON / OFF; no disc script on any box', () => {
    const d = videoSettingsDesign(video(), keeper());
    expect([VIDEO_ROWS.renderScale, VIDEO_ROWS.shadows, VIDEO_ROWS.showFps].map((n) => caption(at(d, n)))).toEqual([
      VIDEO_ROW_CAPTIONS.renderScale, VIDEO_ROW_CAPTIONS.shadows, VIDEO_ROW_CAPTIONS.showFps,
    ]);
    expect(VIDEO_ROW_CAPTIONS).toEqual({ renderScale: 'RENDER SCALE', shadows: 'SHADOWS', showFps: 'SHOW FPS' });
    expect(VIDEO_ROW_SCALE_CAPTIONS).toEqual(['PERFORMANCE', 'BALANCED', 'QUALITY']);
    const scale = subsOf(at(d, VIDEO_ROWS.renderScale));
    expect(scale.map((s) => [s.name, s.x, s.y, caption(s)])).toEqual(VIDEO_ROW_SCALE_BOXES.map((n, i) => [n, 200 + VIDEO_ROW_SCALE_STEP_ADAPTATION * i, -5, VIDEO_ROW_SCALE_CAPTIONS[i]]));
    for (const row of [VIDEO_ROWS.shadows, VIDEO_ROWS.showFps]) {
      expect(subsOf(at(d, row)).map((s) => [s.x, caption(s)])).toEqual([[200, '_185_ON_MSG'], [320, '_678_OFF_MSG']]);   // as TEAMMATE NAMES: ON left
    }
    const hb = at(d, 'headbobbing').widget as Extract<DialogRecord['widget'], { type: 'RADIOSTRIP' }>;
    for (const row of [VIDEO_ROWS.renderScale, VIDEO_ROWS.shadows, VIDEO_ROWS.showFps]) {
      const s = at(d, row).widget as Extract<DialogRecord['widget'], { type: 'RADIOSTRIP' }>;
      expect(s.button.normal).toEqual(hb.button.normal);
      expect(s.button.active).toEqual(hb.button.active);
      expect(s.page).toBeDefined();
      for (const b of s.subordinates) {
        expect(b.childOf).toBe(row);
        const w = b.widget as Extract<DialogRecord['widget'], { type: 'CHECKBOX' }>;
        expect([w.onCheck.animation, w.onUncheck.animation, w.button.bindings]).toEqual([null, null, []]);
        expect(w.checkTexture).toBe('op_check.tif');
      }
    }
  });

  it('lays the rows one disc pitch apart from one row higher; the spectrum shortened above them; the lower bar under the window', () => {
    const d = videoSettingsDesign(video(), keeper());
    expect(ROWS_AFTER.map((n) => at(d, n).y)).toEqual([160, 190, 220, 250, 280, 310, 340, 370, 400]);
    expect(ROWS_AFTER.map((n) => at(d, n).x)).toEqual(ROWS_AFTER.map(() => 16));
    const spectrum = at(d, 'spectrum').widget as Extract<DialogRecord['widget'], { type: 'IMAGE' }>;
    expect([at(d, 'spectrum').x, at(d, 'spectrum').y, ...spectrum.image.size]).toEqual([250, VIDEO_ROWS_SPECTRUM_ADAPTATION.y, 300, VIDEO_ROWS_SPECTRUM_ADAPTATION.height]);
    expect(VIDEO_ROWS_SPECTRUM_ADAPTATION.y + VIDEO_ROWS_SPECTRUM_ADAPTATION.height).toBeLessThanOrEqual(160 - 2);   // above TEAMMATE NAMES' boxes (y -2)
    const lower = at(d, 'eq_Lower_back');
    expect([lower.x, (lower.widget as Extract<DialogRecord['widget'], { type: 'IMAGE' }>).image.size]).toEqual([185, [441, 32]]);   // still ends at 626
    // The last row on the frame (448) and clear of the lower bar's span; QUALITY's caption inside MainWindow (x 625).
    expect(400 + 30).toBeLessThanOrEqual(448);
    expect(16 + 200 + 2 * VIDEO_ROW_SCALE_STEP_ADAPTATION + 35 + 59).toBeLessThanOrEqual(625);   // QUALITY measures 59 in font_text_01
    expect(16 + 200 + 35 + 102).toBeLessThan(16 + 200 + VIDEO_ROW_SCALE_STEP_ADAPTATION);         // PERFORMANCE (102) clear of BALANCED's box
  });

  it('a design without the disc\'s rows passes as it is', () => {
    const bare = design([strip('video_mode', 220, 'x', [box('a', 200, 'a', 'a')])]);
    expect(videoSettingsDesign(bare, keeper())).toBe(bare);
  });

  it('the lookup patches VIDEO once (any case), every other dialog as it is', () => {
    const v = video(), other = design([]);
    const look = videoSettingsLookup((n) => (n.toLowerCase() === 'dlgoptions_video.rdr' ? v : n === 'x' ? other : null), keeper());
    expect(look('dlgOptions_Video.rdr')).toBe(look('DLGOPTIONS_VIDEO.RDR'));
    expect(isVideoSettingsDesign(look('dlgOptions_Video.rdr')!)).toBe(true);
    expect(look('x')).toBe(other);
    expect(look('missing')).toBeNull();
  });

  it('HELP WINDOWS: its node not shown (no box tap reaches it) and off the focus ring; the rows on it in order', () => {
    const d = videoSettingsDesign(video(), keeper()), screen = buildDialogScreen(d);
    expect(findNode(screen.root, 'helpwindows')?.visible).toBe(false);
    expect(findNode(screen.root, 'Helpon')?.parent?.name).toBe('helpwindows');                         // its boxes hidden with it
    expect(findNode(screen.root, 'ShadowsOn')?.parent?.name).toBe(VIDEO_ROWS.shadows);
    expect(stripBoxAt(d.controls, screen, 16 + 200 + 5, 250 - 5 + 5)?.box).toBe(0);
    expect(findNode(screen.root, VIDEO_ROWS.shadows)?.visible).toBe(true);
    expect(stripBoxAt(d.controls, screen, 16 + 200 + 5, 250 - 5 + 5)?.name).toBe(VIDEO_ROWS.shadows);   // HELP WINDOWS' old place: SHADOWS now
    const ring = focusRingRecords(d).map((c) => c.name);
    expect(ring).not.toContain('helpwindows');
    expect(ring.slice(ring.indexOf('TeamMateNames'))).toEqual(ROWS_AFTER);
    expect(focusRingRecords(video()).map((c) => c.name)).toContain('helpwindows');                    // a disc design: every control
  });
});

describe('CPS-4b: the strips drive the keeper (RadioStripPage, a browser adaptation)', () => {
  const make = (k: VideoRowsKeeper) => {
    const d = videoSettingsDesign(video(), k), face = textFace();
    const set = WidgetSet.build(d, buildDialogScreen(d), { face: () => face });
    const host = new RecordingHost();
    set.tick(0.016, host);
    host.take();
    return { set, host, strip: (n: string) => set.get(n) as RadioStripWidget, box: (n: string) => set.get(n) as CheckboxWidget };
  };

  it('each strip is built at the keeper\'s value and its first tick checks that box without a set', () => {
    const k = keeper({ renderScale: 'quality', shadows: false, showFps: true });
    const { strip, box } = make(k);
    expect([strip(VIDEO_ROWS.renderScale).selection, strip(VIDEO_ROWS.shadows).selection, strip(VIDEO_ROWS.showFps).selection]).toEqual([2, 1, 0]);
    expect(box(VIDEO_ROW_SCALE_BOXES[2]!).checked).toBe(true);
    expect(k.sets).toEqual([]);                                                                        // the build's own check hands nothing back
  });

  it('RIGHT / LEFT step RENDER SCALE through the keeper at once; CROSS flips a toggle', () => {
    const k = keeper();
    const { strip, host } = make(k);
    const rs = strip(VIDEO_ROWS.renderScale);
    expect(rs.input(widgetPad({ RIGHT: 'FALLING' }), host)).toBe(true);
    expect(k.value.renderScale).toBe('quality');
    expect(rs.input(widgetPad({ LEFT: 'FALLING' }), host)).toBe(true);
    expect(rs.input(widgetPad({ LEFT: 'FALLING' }), host)).toBe(true);
    expect(k.value.renderScale).toBe('performance');
    const sh = strip(VIDEO_ROWS.shadows);
    expect(sh.input(widgetPad({ CROSS: 'FALLING' }), host)).toBe(true);
    expect(k.value.shadows).toBe(false);
    expect(sh.input(widgetPad({ CROSS: 'FALLING' }), host)).toBe(true);
    expect(k.value.shadows).toBe(true);
    const fps = strip(VIDEO_ROWS.showFps);
    expect(fps.input(widgetPad({ RIGHT: 'FALLING' }), host)).toBe(true);
    expect(k.value.showFps).toBe(true);
    expect(fps.choose(1, host)).toBe(true);                                                            // a click on OFF
    expect(k.value.showFps).toBe(false);
    expect(host.take().filter((c) => c.startsWith('anim'))).toEqual([]);                               // no disc script started
  });

  it('a disc strip carries no page: HELP WINDOWS\' scripts still move it (Selection), and nothing is set', () => {
    const k = keeper();
    const { set, host } = make(k);
    const before = k.sets.length;
    set.nodeCommand(nodeCmd('helpwindows', 4, '', 1), host);
    expect((set.get('helpwindows') as RadioStripWidget).selection).toBe(1);
    expect(host.take()).toContain('anim enable_Help');
    expect(k.sets.length).toBe(before);
  });
});

describe("CPS-4b follow-up: the rows' help lines on VIDEO's info line (VIDEO_ROW_HELP_ADAPTATION)", () => {
  const KEYS = ['renderScale', 'shadows', 'showFps'] as const;
  const bindingsOf = (d: DialogDesign, n: string) => (at(d, n).widget as Extract<DialogRecord['widget'], { type: 'RADIOSTRIP' }>).button.bindings
    .map((b) => [b.kind, b.name, b.animation, b.argument]);
  const textOf = (screen: ReturnType<typeof buildDialogScreen>): number[] => {
    const c = findNode(screen.root, VIDEO_ROW_HELP_NODE)?.content;
    return c?.kind === 'text' ? [...c.text.codes] : [];
  };

  it("is labelled a browser adaptation; the words, in the disc's sentence case", () => {
    expect(VIDEO_ROW_HELP_ADAPTATION).toContain('browser adaptation');
    expect(VIDEO_ROW_HELP).toEqual({
      renderScale: 'Pixels for frames: Performance fewer, Balanced up to 1440 lines, Quality all.',
      shadows: "Draw the characters' shadows. Off saves a little time each frame.",
      showFps: 'Show the frame rate and frame time in the corner.',
    });
    expect(VIDEO_ROW_HELP_NODE).toBe('instText');                                                        // the disc's info line on VIDEO
  });

  it("each row's strip names the help animation on its ONACTIVATE with its key; VIDEO MODE keeps the disc's own", () => {
    const d = videoSettingsDesign(video(), keeper());
    for (const k of KEYS) expect(bindingsOf(d, VIDEO_ROWS[k])).toEqual([['event', 'ONACTIVATE', VIDEO_ROW_HELP_ANIMATION, k]]);
    expect(bindingsOf(d, 'video_mode')).toEqual([['event', 'ONACTIVATE', 'OnVideoModeAct', null]]);    // the strip reads its last box's
    expect(bindingsOf(d, 'headbobbing')).toEqual([['event', 'ONACTIVATE', 'OnOnHeadBobAct', null]]);   // the template's own untouched
  });

  it("focus on a row starts its help animation; the gate writes the row's line on instText; others pass", () => {
    const d = videoSettingsDesign(video(), keeper()), screen = buildDialogScreen(d), face = textFace();
    const set = WidgetSet.build(d, screen, { face: () => face });
    const host = new RecordingHost();
    set.tick(0.016, host);
    host.take();
    const gate = videoRowHelpGate((cmd) => set.nodeCommand(cmd, host));
    for (const k of KEYS) {
      (set.get(VIDEO_ROWS[k]) as RadioStripWidget).setActive(host);
      expect(host.take()).toEqual([`anim ${VIDEO_ROW_HELP_ANIMATION}(${k})`]);
      expect(gate({ dialog: 'DLGOPTIONS_VIDEO.RDR', design: d, animation: VIDEO_ROW_HELP_ANIMATION, argument: k })).toBe(true);
      expect(textOf(screen)).toEqual(captionCodes(VIDEO_ROW_HELP[k], null).codes);
    }
    expect(gate({ dialog: VIDEO_PICTURE_DIALOG, design: d, animation: 'OnVideoModeAct', argument: null })).toBe(false);
    expect(gate({ dialog: 'dlgOptions_Audio.rdr', design: d, animation: VIDEO_ROW_HELP_ANIMATION, argument: 'shadows' })).toBe(false);
    expect(textOf(screen)).toEqual(captionCodes(VIDEO_ROW_HELP.showFps, null).codes);
  });

  it("OptionsCommands registers the gate: a row's binding start reaches the host's node handler as instText's Caption", () => {
    const nodes: ZAnimUiCommand[] = [];
    const host = new UiCommandHost({ node: (cmd) => { nodes.push(cmd); return { answer: true }; } });
    new OptionsCommands({} as OptionsCommandsOptions).register(host);
    const d = videoSettingsDesign(video(), keeper());
    expect(host.bindingStart({ dialog: VIDEO_PICTURE_DIALOG, design: d, animation: VIDEO_ROW_HELP_ANIMATION, argument: 'showFps' })).toBe(true);
    expect(nodes.map((c) => [c.node, c.opcodeByte - 0xe8, c.arg, c.loc])).toEqual([[VIDEO_ROW_HELP_NODE, 1, VIDEO_ROW_HELP.showFps, 0]]);
    expect(VIDEO_ROW_HELP_GATE).toContain('CPS-4b');
  });
});
