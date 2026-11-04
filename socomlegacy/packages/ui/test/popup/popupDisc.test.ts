import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { decodeUiProgram, FONTS_RDR, loadLocService, parseAnimSets, type LocService, type UiCommand, type ZAnimAnimation } from '@s2u/scene';
import { layoutText, loadDialog, readTextFaces, ValveStore, type TextFace, type UiDrawItem, type ZAnimUiCommand } from '../../src/index';
import { widgetPad } from '../../src/widgets/index';
import { Popup, POPUP_RECORD_AT, POPUP_RECORD_SIZE, readPopupRecord, type PopupContext, type PopupRecord, type PopupSound } from '../../src/popup/index';

/**
 * PLAT-16's dev-disc checks (web research 118 §2, §7): every POPUP record of `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR` and
 * `RUN/MPZANIM.ZAR` read and applied, the note's tallies pinned, and the logoff (`dlgWorldOfSOCOM` `exit_lobby`) driven
 * through the component. Names, ids, counts and decoded values only (RS.R8); no game bytes.
 *
 * The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const ARCHIVES = ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR'] as const;
const HAVE_DISC = DISC !== '' && ARCHIVES.every((a) => existsSync(join(DISC, 'RUN', a)));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, p)));

interface Found { archive: string; set: string; anim: ZAnimAnimation; sequence: string; command: UiCommand; record: PopupRecord; cmd: ZAnimUiCommand }

/** A POPUP command as PLAT-07's runtime hands it on: the header (+4 the node index, +6 the op byte), then the record. */
const asCommand = (anim: ZAnimAnimation, sequence: string, c: UiCommand): ZAnimUiCommand => {
  const bytes = new Uint8Array(POPUP_RECORD_AT + c.extra.length);
  bytes[4] = Math.max(1, anim.nodeRefs.findIndex((r) => r.name === c.node));
  bytes.set(c.extra, POPUP_RECORD_AT);
  return { anim: anim.name, sequence, nodeIndex: bytes[4]!, node: c.node, opcodeByte: 0, fn: null, arg: c.arg, loc: c.loc, bytes };
};

let all: { records: Found[]; popUp: Record<string, number>; kill: Record<string, number> } | null = null;
const scan = () => {
  if (all) return all;
  const records: Found[] = [], popUp: Record<string, number> = {}, kill: Record<string, number> = {};
  for (const archive of ARCHIVES) {
    popUp[archive] = 0; kill[archive] = 0;
    const a = parseAnimSets(Zar.parse(read(`RUN/${archive}`)));
    for (const set of a.sets) {
      for (const anim of set.anims) {
        for (const seq of decodeUiProgram(anim).sequences) {
          for (const op of seq.ops) {
            if (op.op !== 'ui') continue;
            const c = op.command;
            if (c.fn !== null && /^popupdialog$/i.test(c.fn)) popUp[archive]! += 1;
            if (c.fn !== null && /^killpopup$/i.test(c.fn)) kill[archive]! += 1;
            if (c.node !== 'POPUP') continue;
            const cmd = asCommand(anim, seq.name, c);
            records.push({ archive, set: set.name, anim, sequence: seq.name, command: c, record: readPopupRecord(cmd.bytes), cmd });
          }
        }
      }
    }
  }
  return (all = { records, popUp, kill });
};

let env: { faces: TextFace[]; loc: LocService } | null = null;
const environment = async () => {
  if (env) return env;
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(new FsAssetSource(DISC), 'RUN/MP2.ZDB');
  return (env = { faces, loc: service });
};

const popupFor = async (f: Pick<Found, 'anim'>, font: string | null, valves = new ValveStore()) => {
  const { faces, loc } = await environment();
  const ctx: PopupContext = {
    face: (n) => faces.find((x) => x.name === n) ?? null, font, captions: loc, uiVars: null, valves,
    locText: (id) => loc.text(id) ?? null, name: (_c, i) => f.anim.names[i] ?? null, hasTexture: () => true, inputString: () => null,
  };
  return { popup: new Popup(ctx), valves };
};

const tally = <T>(xs: readonly T[], key: (x: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) { const k = key(x); out[k] = (out[k] ?? 0) + 1; }
  return out;
};

describe.skipIf(!HAVE_DISC)(`the disc's POPUP records (research 118 §2, §7)${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('285 records, op 0 and 220 bytes each: UIZANIM 240, EXTZANIM 15, MPZANIM 30; 252 PopUpDialog, 48 KillPopUp', () => {
    const { records, popUp, kill } = scan();
    expect(tally(records, (r) => r.archive)).toEqual({ 'UIZANIM.ZAR': 240, 'EXTZANIM.ZAR': 15, 'MPZANIM.ZAR': 30 });
    expect(records.every((r) => r.command.op === 0 && r.command.extra.length === POPUP_RECORD_SIZE)).toBe(true);
    expect(popUp).toEqual({ 'UIZANIM.ZAR': 207, 'EXTZANIM.ZAR': 15, 'MPZANIM.ZAR': 30 });
    expect(kill).toEqual({ 'UIZANIM.ZAR': 48, 'EXTZANIM.ZAR': 0, 'MPZANIM.ZAR': 0 });
  });

  it('the record\'s fields: popupOp.tif, scale 1.0 and colour 128 on all; 213 with buttons, 54 keep, 5 TRIANGLE; 114 literal texts, 36 INPUT_STRING', () => {
    const rs = scan().records;
    const name = (f: Found, i: number) => f.anim.names[i] ?? null;
    expect(tally(rs, (f) => String(name(f, f.record.panel)))).toEqual({ 'popupOp.tif': 285 });
    expect(rs.every((f) => f.record.textScale === 1 && f.record.textColor.every((c) => c === 128))).toBe(true);
    expect(rs.filter((f) => f.record.hasButtons)).toHaveLength(213);
    expect(rs.filter((f) => f.record.keep)).toHaveLength(54);
    expect(rs.filter((f) => f.record.keep && !f.record.hasButtons)).toHaveLength(30);
    expect(rs.filter((f) => f.record.triangle)).toHaveLength(5);
    const literal = rs.filter((f) => f.record.textId === 0);
    expect(literal).toHaveLength(114);
    expect(literal.filter((f) => name(f, f.record.textName) === 'INPUT_STRING')).toHaveLength(36);
    // Every record with buttons names its valve.
    expect(rs.filter((f) => f.record.hasButtons && name(f, f.record.valve) === null)).toEqual([]);
  });

  it('the buttons: 72 records with button 1 hidden, 83 with one, 58 with two; every present button 25 high, its bitmaps and colours the same', () => {
    const rs = scan().records.filter((f) => f.record.hasButtons);
    const shape = (f: Found) => { const [a, b] = f.record.buttons; return a.w <= 0 ? 'hidden' : b.w <= 0 ? 'one' : 'two'; };
    expect(tally(rs, shape)).toEqual({ hidden: 72, one: 83, two: 58 });
    const present = rs.flatMap((f) => f.record.buttons.filter((b) => b.w > 0).map((b) => ({ f, b })));
    expect(present).toHaveLength(83 + 2 * 58);
    expect(present.every(({ b }) => b.h === 25)).toBe(true);
    expect(tally(present, ({ f, b }) => [b.focused, b.normal, b.pressed].map((i) => f.anim.names[i]).join('/'))).toEqual({ 'active_back.tif/pop_butt.tif/pop_butt.tif': 199 });
    expect(present.every(({ b }) => `${b.colors.focused}|${b.colors.normal}|${b.colors.pressed}` === '91,72,36|128,128,128|102,87,38')).toBe(true);
    expect(tally(present, ({ b }) => String(b.scale))).toEqual({ [String(Math.fround(0.9))]: 189, 1: 10 });
    expect(present.filter(({ b }) => b.centred)).toHaveLength(23);
    expect(tally(present, ({ b }) => String(b.labelOffset[1]))).toEqual({ 25: 188, 24: 10, 26: 1 });
    // A hidden button names no label: its index lies past the name table and its id is 0, so nothing is drawn there.
    const hidden = rs.flatMap((f) => f.record.buttons.filter((b) => b.w <= 0).map((b) => ({ f, b })));
    expect(hidden.filter(({ f, b }) => b.labelId !== 0 || f.anim.names[b.labelName] !== undefined)).toEqual([]);
  });

  it('the two-button records: (NO, YES) 36 and (YES, NO) 11 by label id; button 1 the right-hand one in 40', () => {
    const two = scan().records.filter((f) => f.record.hasButtons && f.record.buttons.every((b) => b.w > 0));
    expect(two).toHaveLength(58);
    const ids = tally(two, (f) => f.record.buttons.map((b) => b.labelId).join(','));
    expect([ids['246,253'], ids['253,246']]).toEqual([36, 11]);
    expect(two.filter((f) => f.record.buttons[0].x > f.record.buttons[1].x)).toHaveLength(40);
  });

  it('every record applies to a popup and draws without a throw; one with buttons focuses button 1 and makes its valve TEMP', async () => {
    for (const f of scan().records) {
      const { popup, valves } = await popupFor(f, 'font_t');
      popup.show({ sound: () => undefined });
      expect(popup.command(f.cmd)).toEqual({ answer: true });
      expect(popup.answer).toBe(f.record.hasButtons ? 1 : 0);
      if (f.record.hasButtons) {
        expect(popup.buttons.map((b) => b.look.state)).toEqual(['ACTIVE', 'NORMAL']);
        expect(valves.find(f.anim.names[f.record.valve]!)?.type).toBe(2);
      }
      popup.draw();
    }
  });

  it('the logoff (dlgWorldOfSOCOM exit_lobby, 793): NO focused at open, LEFT to YES, CROSS answers 2; laid out as the capture (research 118 §8.1)', async () => {
    const f = scan().records.find((r) => r.archive === 'UIZANIM.ZAR' && r.set === 'dlgWorldOfSOCOM.rdr' && r.anim.name === 'exit_lobby' && r.record.textId === 793)!;
    expect(f).toBeDefined();
    const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
    const font = loadDialog(parseRdr(z.data(z.find('dlgWorldOfSOCOM.rdr')!))).font;
    const { popup, valves } = await popupFor(f, font);
    const sounds: PopupSound[] = [];
    const host = { sound: (s: PopupSound) => { sounds.push(s); } };
    popup.show(host);
    popup.command(f.cmd);
    expect(f.record.buttons.map((b) => b.labelId)).toEqual([246, 253]);
    // The ids resolve in UIMnLOC to the words the capture shows (research 118 R118.7), so "NO first" is the disc's.
    const { loc } = await environment();
    expect(f.record.buttons.map((b) => loc.text(b.labelId))).toEqual(['NO', 'YES']);
    expect(popup.answer).toBe(1);                                         // NO
    const items = popup.draw();
    const sprites = items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');
    expect(sprites.map((s) => [s.texture, s.x0, s.y0, s.x1, s.y1])).toEqual([
      ['popupOp.tif', 150, 180, 490, 310], ['active_back.tif', 375, 270, 425, 295], ['pop_butt.tif', 215, 270, 265, 295],
    ]);
    const { faces } = await environment();
    const face = faces.find((x) => x.name === font)!;
    expect(face).toBeDefined();
    expect(popup.text.lines.length).toBeGreaterThan(1);
    const first = items.filter((i) => i.kind === 'glyphs')[2];
    // The line's alpha is its face's opacity x 128 (FUN_00362b20 at the setter's D:L273492; research 157 R157.10): 0.7 on the disc.
    expect(face.opacity).toBeCloseTo(0.7, 6);
    expect(first).toEqual({ kind: 'glyphs', node: 'POPUP', clip: null, quads: layoutText(face, popup.text.lines[0]!.codes, 175, 222, { scale: face.scale, color: [255, 255, 255], alpha: Math.fround(face.opacity * 128), bold: false }).quads });
    popup.input(widgetPad({ LEFT: 'FALLING' }), host);
    expect(popup.answer).toBe(2);                                         // YES, to the left
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect(valves.find('AreYouSure')!.value).toBe(2);
    expect(popup.visible).toBe(false);
    expect(sounds).toEqual(['.METAL', 'SELECTION', 'SELECTION']);
  });
});
