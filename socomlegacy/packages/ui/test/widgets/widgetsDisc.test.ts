import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { buildDialogScreen, composeScreen, findNode, loadDialog, readTextFaces, UiVarManager, type DialogDesign, type UiDrawItem } from '../../src/index';
import {
  ButtonWidget, CheckboxWidget, CounterWidget, ListboxWidget, ProgressBarWidget, RadioStripWidget, SliderWidget, STICK, WidgetSet, widgetPad,
  type WidgetOptions,
} from '../../src/widgets/index';
import { RecordingHost } from './fixtures';

/**
 * PLAT-15's dev-disc checks (web research 117): every dialog of `RUN/UI/READERC.ZAR` (110) and `RUN/UI/READERX.ZAR`
 * (4) builds its widgets from PLAT-05's records -- each of the seven types from real records -- and every `widget`
 * item of PLAT-14's draw list but the MAPCONTROLs (MENU-16's) becomes quads and glyphs. Names, counts and the
 * decoded values the tests pin only (RS.R8).
 *
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) every test skips.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));

let opts: WidgetOptions | null = null;
const options = async (): Promise<WidgetOptions> => {
  if (opts) return opts;
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(new FsAssetSource(DISC ?? ''), 'RUN/MP2.ZDB');
  return (opts = { face: (n) => faces.find((f) => f.name === n) ?? null, captions: service });
};
const dialog = (name: string): DialogDesign => {
  const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
  return loadDialog(parseRdr(z.data(z.find(name)!)));
};
const built = async (name: string) => {
  const d = dialog(name), o = await options();
  const screen = buildDialogScreen(d, o);
  return { d, screen, set: WidgetSet.build(d, screen, o) };
};

describe.skipIf(DISC === null)(`the widget set over the disc's dialogs${DISC === null ? ' (no SOCOM_DISC / SOCOM_PC_ROOT)' : ''}`, () => {
  it('all 114: the seven types made from their records, every widget item drawn but the 36 MAPCONTROLs', async () => {
    const o = await options();
    const counts: Record<string, number> = {}, undrawn: Record<string, number> = {};
    let drawn = 0;
    for (const archive of ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']) {
      const z = Zar.parse(read(archive));
      for (const k of z.root.children) {
        const d = loadDialog(parseRdr(z.data(k)));
        const screen = buildDialogScreen(d, o);
        const set = WidgetSet.build(d, screen, o);
        for (const w of set.all()) counts[w.type] = (counts[w.type] ?? 0) + 1;
        set.tick(1 / 60, new RecordingHost());
        const r = set.draw(composeScreen(screen));
        for (const u of r.undrawn) { const t = /\((.*)\)$/.exec(u)![1]!; undrawn[t] = (undrawn[t] ?? 0) + 1; }
        drawn += r.items.filter((i) => i.kind === 'sprite' || i.kind === 'glyphs').length;
      }
    }
    // PLAT-14's undrawn `widget` items by type (compositorDisc.test.ts): BUTTON 298, LISTBOX 66, CHECKBOX 42, RADIOSTRIP
    // 18, SLIDERBAR 8, COUNTER 8, PROGRESSBAR 1 -- every one now a widget -- and MAPCONTROL 36.
    expect(counts).toEqual({ BUTTON: 298, LISTBOX: 66, CHECKBOX: 42, RADIOSTRIP: 18, SLIDERBAR: 8, COUNTER: 8, PROGRESSBAR: 1 });
    expect(undrawn).toEqual({ MAPCONTROL: 36 });
    expect(drawn).toBeGreaterThan(0);
  });

  it('the eight sliders: NUM_INTERVALS 2, CENTER_VALUE 0.5 (unset); the audio page\'s 290-px track, 50 LEFT presses from full to empty', async () => {
    const sliders: SliderWidget[] = [];
    for (const n of ['dlgOptions_Audio.rdr', 'dlgOptions_Video.rdr', 'dlgControllerSelection.rdr']) {
      sliders.push(...(await built(n)).set.all().filter((w): w is SliderWidget => w instanceof SliderWidget));
    }
    expect(sliders.map((s) => [s.name, s.step, s.centerValue, s.size[0]])).toEqual([
      ['music_bar', 2, 0.5, 290], ['sound_bar', 2, 0.5, 290], ['dialog_bar', 2, 0.5, 290], ['headset_bar', 2, 0.5, 290],
      ...sliders.slice(4).map((s) => [s.name, 2, 0.5, 280]),
    ]);
    expect(sliders).toHaveLength(8);
    const { set } = await built('dlgOptions_Audio.rdr');
    const music = set.get('music_bar') as SliderWidget, h = new RecordingHost();
    while (music.position < 1) music.input(widgetPad({ RIGHT: 'FALLING' }), h);
    const knobX = (): number => {
      const k = music.draw(211, 99, 1).find((i) => i.kind === 'sprite' && i.texture === 'op_knob.tif');
      return k && k.kind === 'sprite' ? k.x0 : NaN;
    };
    expect(knobX()).toBe(501);                                        // XPOS + XSIZE (research 117 §4.3)
    let presses = 0;
    while (knobX() > 211) { music.input(widgetPad({ LEFT: 'FALLING' }), h); presses++; }
    expect(presses).toBe(50);                                         // the PCSX2 frames' count (research 117 §11.1)
  });

  it('dlgMenu: six buttons NORMAL at first; set active, the caption\'s ACTIVE glow runs 0.3 .. 1 over a 1.6-s cycle (5-fps samples)', async () => {
    const { set } = await built('dlgMenu.rdr');
    const buttons = set.all().filter((w): w is ButtonWidget => w instanceof ButtonWidget);
    expect(buttons.map((b) => [b.name, b.look.state])).toEqual(
      ['new_game_button', 'load_game_button', 'multiplayer_button', 'options_button', 'Extras_button', 'LAN_button'].map((n) => [n, 'NORMAL']),
    );
    const b = buttons[0]!, h = new RecordingHost();
    b.setActive(h);
    expect([b.look.color, b.look.scale]).toEqual([[12, 68, 78], 0.75]);
    b.tick(0.05, h);
    const samples: number[] = [];
    for (let i = 0; i < 8; i++) { b.tick(0.2, h); samples.push(b.look.alpha); }
    const want = Array.from({ length: 8 }, (_, k) => (0.025 + 0.1 * (k + 1)) % 0.8).map((p) => 128 * (0.3 + 0.7 * Math.sin((3.14 * p) / 0.8)));
    samples.forEach((s, i) => expect(s).toBeCloseTo(want[i]!, 1));
  });

  it('dlgOptions_Menu: the HDD strip\'s first tick checks HDD_On and starts its ONCHECK, Enable_HDD; RIGHT moves it to HDD_Off', async () => {
    const { set } = await built('dlgOptions_Menu.rdr');
    const strip = set.get('HDDOnOff') as RadioStripWidget, h = new RecordingHost();
    expect(strip.children.map((c) => c.name)).toEqual(['HDD_On', 'HDD_Off']);
    set.tick(1 / 60, h);
    expect(h.take()).toEqual(['anim Enable_HDD']);
    expect((strip.children as CheckboxWidget[]).map((c) => [c.checked, c.look.state])).toEqual([[true, 'ACTIVE'], [false, 'NORMAL']]);
    strip.input(widgetPad({ RIGHT: 'FALLING' }), h);
    expect((strip.children as CheckboxWidget[]).map((c) => c.checked)).toEqual([false, true]);
  });

  it('dlgLoad\'s bar is full from the first tick (PROGRESSBAR_UNSET_READING); dlgMultiplayerFinalReally\'s counters count by StartTime / EndTime', async () => {
    const load = (await built('dlgLoad.rdr')).set.get('load_progress_filling') as ProgressBarWidget;
    load.tick(1 / 60, new RecordingHost());
    expect(load.fill).toBe(1);
    const { set } = await built('dlgMultiplayerFinalReally.rdr');
    const counters = set.all().filter((w): w is CounterWidget => w instanceof CounterWidget);
    expect(counters.map((c) => [c.name, c.startTime, c.endTime, c.target])).toEqual([
      ['RoundsWonSeals', 3.5, 4, 0], ['RoundsLostSeals', 3.5, 4, 0], ['RoundsWonTerrs', 4, 4.5, 0], ['RoundsLostTerrs', 4, 4.5, 0],
    ]);
  });

  it('dlgMenu\'s first button: each stick edge fires the binding of its own direction (UP and LEFT up, DOWN and RIGHT down)', async () => {
    const b = (await built('dlgMenu.rdr')).set.get('new_game_button') as ButtonWidget, h = new RecordingHost();
    const fired = [STICK.UP, STICK.DOWN, STICK.LEFT, STICK.RIGHT, STICK.CENTRED].map((s) => { b.input(widgetPad({}, s), h); return h.take().join(); });
    expect(fired).toEqual(['anim OnMenuBtnUp', 'anim OnMenuBtnDown', 'anim OnMenuBtnUp', 'anim OnMenuBtnDown', '']);
  });

  it('dlgLoad\'s TEXT and IMAGE follow their UIVARs (FUN_00379260, FUN_00379160); a Caption command on a real TEXT', async () => {
    const d = dialog('dlgLoad.rdr'), o = await options(), uiVars = new UiVarManager();
    const screen = buildDialogScreen(d, o);
    const set = WidgetSet.build(d, screen, { ...o, uiVars });
    const text = (n: string): string | null => { const c = findNode(screen.root, n)?.content; return c?.kind === 'text' ? String.fromCharCode(...c.text.codes) : null; };
    const tex = (n: string): string | null | undefined => { const c = findNode(screen.root, n)?.content; return c?.kind === 'sprite' ? c.sprite.texture : undefined; };
    uiVars.set('mission_title', { type: 'string', value: 'SEALS' });
    expect(text('title')).toBe('SEALS');
    uiVars.set('load_picture', { type: 'string', value: 'brief_pic.tif' });
    expect(tex('LoadingPicture')).toBe('brief_pic.tif');
    expect(set.nodeCommand({ anim: 'a', sequence: 's', nodeIndex: 1, node: 'RateLevel', opcodeByte: 0xe9, fn: null, arg: 'AB', loc: 0, bytes: new Uint8Array(16) }, new RecordingHost())).toEqual({ answer: true });
    expect(text('RateLevel')).toBe('AB');
  });

  it('no IMAGE of the 114 dialogs carries a PULSE (the IMAGE pulse is held by the unit test); 41 of the 49 WRAPPEDTEXTs carry a UIVAR', () => {
    let pulses = 0, images = 0, wrapped = 0, wrappedVars = 0;
    for (const archive of ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']) {
      const z = Zar.parse(read(archive));
      for (const k of z.root.children) {
        const d = loadDialog(parseRdr(z.data(k)));
        for (const r of [...d.controls, ...d.objects]) {
          if (r.widget.type === 'IMAGE') { images++; if (r.widget.image.pulse !== null) pulses++; }
          if (r.widget.type === 'WRAPPEDTEXT') { wrapped++; if (r.widget.uivar?.name) wrappedVars++; }
        }
      }
    }
    expect(images).toBeGreaterThan(0);
    expect([pulses, wrapped, wrappedVars]).toEqual([0, 49, 41]);
  });

  it('dlgGameLobby\'s B_CHATLIST (WRAPPEDTEXT, 430 wide, SPACING 20, HEIGHT 60): its UIVAR wraps, Scroll_Down / Scroll_Up move it a line', async () => {
    const d = dialog('dlgGameLobby.rdr'), o = await options(), uiVars = new UiVarManager();
    const screen = buildDialogScreen(d, o);
    const set = WidgetSet.build(d, screen, { ...o, uiVars });
    const node = findNode(screen.root, 'B_CHATLIST')!;
    const c = (): Extract<NonNullable<typeof node.content>, { kind: 'wrapped' }> => {
      if (node.content?.kind !== 'wrapped') throw new Error('not wrapped');
      return node.content;
    };
    expect([c().spec.width, c().spec.spacing, c().spec.height, c().spec.autoScroll]).toEqual([430, 20, 60, true]);
    const said = Array.from({ length: 6 }, (_, i) => `PLAYER${i}: ROGER THAT\n`).join('');
    uiVars.set('BCHATLISTVAR', { type: 'string', value: said });
    expect(c().lines.map((l) => String.fromCharCode(...l.codes))).toEqual(Array.from({ length: 6 }, (_, i) => `PLAYER${i}: ROGER THAT`));
    set.draw(composeScreen(screen));                                  // 6 rows: the bound is 6 x 20 - 60 = 60
    const h = new RecordingHost();
    const op = (n: number): number => { set.nodeCommand({ anim: 'a', sequence: 's', nodeIndex: 1, node: 'B_CHATLIST', opcodeByte: 0xe8 + n, fn: null, arg: '', loc: 0, bytes: new Uint8Array(16) }, h); return c().scroll; };
    expect([op(5), op(5), op(5), op(5)]).toEqual([20, 40, 60, 60]);
    expect([op(4), op(4), op(4), op(4)]).toEqual([40, 20, 0, 0]);
  });

  it('dlgDownloadPatch\'s AvailableText (a literal caption, 420 wide): wrapped at spaces, every word kept', async () => {
    const { d, screen } = await built('dlgDownloadPatch.rdr');
    const rec = d.objects.find((r) => r.name === 'AvailableText')!;
    const node = findNode(screen.root, 'AvailableText')!;
    const lines = node.content?.kind === 'wrapped' ? node.content.lines.map((l) => String.fromCharCode(...l.bytes)) : [];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(rec.widget.type === 'WRAPPEDTEXT' ? rec.widget.text.caption : null);
  });

  it('the three SECURETEXTs draw stars; every LISTBOX is built NORMAL, its focus 0', async () => {
    const { screen, set } = await built('dlgCreateGame.rdr');
    const pw = findNode(screen.root, 'password_val')!;
    const before = pw.content?.kind === 'text' ? pw.content.text.codes : null;
    set.nodeCommand({ anim: 'a', sequence: 's', nodeIndex: 1, node: 'password_val', opcodeByte: 0xe9, fn: null, arg: 'ABC', loc: 0, bytes: new Uint8Array(16) }, new RecordingHost());
    expect(pw.content?.kind === 'text' ? pw.content.text.codes : null).toEqual([0x2a, 0x2a, 0x2a]);
    expect(before === null || before.every((c) => c === 0x2a)).toBe(true);
    const lists = set.all().filter((w): w is ListboxWidget => w instanceof ListboxWidget);
    expect(lists.every((l) => l.state === 'normal' && l.focus === 0)).toBe(true);
    const items: UiDrawItem[] = set.draw(composeScreen(screen)).items;
    expect(items.some((i) => i.kind === 'widget')).toBe(false);
  });
});
