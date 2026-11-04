import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, readZarMembers, readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import { arsenalOf, missionValves } from '@s2u/scene';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { armoryFromDisc, type ArmoryData } from '../src/armoryData';
import { Armory } from '../src/armory';
import type { ArmoryQuad } from '../src/armoryLayout';

/**
 * The ARMORY's polish pass (web sprint 5 addendum; research 95 §2.7): the owner's play-test of 2026-10-01 saw the row
 * highlight above its text, the weapon captions low in their bars, the instruction strip low in its bar and the stat
 * labels below their bars. One rule moved them all: a TEXT's `YPOS` is the bottom of its face's cell, not its letters'
 * foot (`UI_TEXT_ORIGIN`). These pin the drawn positions on Frostfire's own dialog, scripts, fonts and atlases: where the
 * letters' ink lands (read from the atlas texels under each glyph's quad) against the boxes the dialog draws round them.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const present = ['RUN/MP2.ZDB', 'RUN/UIZANIM.ZAR', 'RUN/UI/READERC.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/READERC.ZAR', 'RUN/UI/UIMP_TXR.ZED']
  .every((p) => existsSync(resolve(FIXTURES, p)));

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxOf = (q: ArmoryQuad): Box => ({ x0: q.x, y0: q.y, x1: q.x + q.w, y1: q.y + q.h });
const centre = (b: Box): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

/** The ink of an object's glyphs (no drop shadows): each quad's texel rows/columns with alpha, mapped onto the frame. */
function inkOf(quads: readonly ArmoryQuad[], object: string, atlases: ReadonlyMap<string, Rgba>): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of quads) {
    if (q.object !== object) continue;
    const a = atlases.get(q.texture);
    if (!a || !q.texture.startsWith('font_')) continue;
    if (q.rgb[0] === 0 && q.rgb[1] === 0 && q.rgb[2] === 0) continue;          // a drop shadow
    const v0 = Math.round(q.v0), v1 = Math.round(q.v1), u0 = Math.round(q.u0), u1 = Math.round(q.u1);
    for (let v = v0; v < v1; v++) {
      for (let u = u0; u <= u1; u++) {
        if (a.data[(v * a.width + u) * 4 + 3]! < 0x40) continue;
        const fy0 = q.y + ((v - v0) / (v1 - v0)) * q.h, fy1 = q.y + ((v + 1 - v0) / (v1 - v0)) * q.h;
        const fx0 = q.x + ((u - u0) / (u1 - u0 + 1)) * q.w, fx1 = q.x + ((u + 1 - u0) / (u1 - u0 + 1)) * q.w;
        x0 = Math.min(x0, fx0); x1 = Math.max(x1, fx1); y0 = Math.min(y0, fy0); y1 = Math.max(y1, fy1);
      }
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

const one = (quads: readonly ArmoryQuad[], object: string): Box => {
  const q = quads.filter((x) => x.object === object);
  expect(q.length, object).toBeGreaterThan(0);
  return { x0: Math.min(...q.map((x) => x.x)), y0: Math.min(...q.map((x) => x.y)), x1: Math.max(...q.map((x) => x.x + x.w)), y1: Math.max(...q.map((x) => x.y + x.h)) };
};
const inside = (a: Box, b: Box, slack = 0): boolean => a.x0 >= b.x0 - slack && a.y0 >= b.y0 - slack && a.x1 <= b.x1 + slack && a.y1 <= b.y1 + slack;

describe.skipIf(!present)(`the ARMORY's text against its boxes, on Frostfire's own dialog${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let held: Promise<{ quads: ArmoryQuad[]; atlases: Map<string, Rgba>; data: ArmoryData }> | null = null;
  const primaryRow = (): Promise<{ quads: ArmoryQuad[]; atlases: Map<string, Rgba>; data: ArmoryData }> => (held ??= (async () => {
    const src = new FsAssetSource(FIXTURES);
    const data = await armoryFromDisc(src, 'RUN/MP2.ZDB', 'MP2', { models: false });
    const zw = (await readZarMembers(src, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!;
    const rm = Zar.parse((await readZdbMember(src, 'RUN/MP2.ZDB', 'READERM.ZAR'))!);
    const mission = parseRdr(rm.data(rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!));
    const t = { now: 0 };
    const a = new Armory({ clock: () => t.now, change: () => {} });
    a.setData(data);
    a.setWorld({ arsenal: arsenalOf(parseRdr(zw)), valves: missionValves(mission), side: 'terrorist', map: 'MP2', archive: 'MP2' });
    const run = (s: number): void => { for (let i = 0; i < Math.round(s * 60); i++) { t.now += 1 / 60; a.frame(1 / 60); } };
    a.open(null); run(0.5); a.input('cross'); a.frame(0); run(1);                // Terrorist 1 committed: the Primary row
    const sizes = Object.fromEntries(data.bitmaps.map(([n, b]) => [n, { width: b.width, height: b.height }]));
    return { quads: a.quads(sizes), atlases: new Map(data.bitmaps), data };
  })());

  it('the row highlight holds its row\'s text: the letters inside the Primary pane, centred on it within 2 px', async () => {
    const { quads, atlases } = await primaryRow();
    const pane = one(quads, 'Merc1Primarypane');
    expect([pane.x0, pane.y0, pane.x1 - pane.x0, pane.y1 - pane.y0]).toEqual([15, 110, 165, 21]);   // in EquipLoadInfoWin
    const ink = inkOf(quads, 'Merc1PrimText', atlases)!;
    expect(inside(ink, pane), JSON.stringify(ink)).toBe(true);
    // Drawn at the face's opacity, 0.7 (`textAlpha`, FUN_00362b20): the captures' letters peak at 0.67-0.73 of full.
    expect(new Set(quads.filter((q) => q.object === 'Merc1PrimText' && q.rgb[0] !== 0).map((q) => q.alpha))).toEqual(new Set([0.7 * 128]));
    // Each glyph's rows whole (GLYPH_ROW_SNAP: the emitter truncates its corners).
    for (const q of quads.filter((x) => x.object === 'Merc1PrimText' && x.rgb[0] !== 0)) expect([Number.isInteger(q.y), Number.isInteger(q.h)]).toEqual([true, true]);
    expect(Math.abs(centre(ink)[1] - centre(pane)[1])).toBeLessThanOrEqual(2);
    // The next rows' texts keep the 20-row pitch, each inside where its pane would be (y 130, 150, ...).
    for (const [i, o] of ['Merc1SecText', 'Merc1Eq1Text', 'Merc1Eq2Text', 'Merc1Eq3Text'].entries()) {
      const row = inkOf(quads, o, atlases);
      if (!row) continue;                                                        // an empty slot draws nothing
      expect(row.y0, o).toBeGreaterThanOrEqual(110 + 20 * (i + 1));
      expect(row.y1, o).toBeLessThanOrEqual(131 + 20 * (i + 1));
    }
  });

  it('the weapon\'s name and WEAPON DATA sit inside their caption bars, centred on XPOS 500 (the bars\' own centre 497.5)', async () => {
    const { quads, atlases } = await primaryRow();
    for (const [text, bar] of [['weapmodeltext', 'EquipWeapCaptionWin'], ['WeapDataText', 'WeapDataCapWin'], ['TipText', 'WeapTipCapWin']] as const) {
      const ink = inkOf(quads, text, atlases)!, box = one(quads, bar);
      expect(inside(ink, box), `${text} ${JSON.stringify(ink)} in ${JSON.stringify(box)}`).toBe(true);
      expect(Math.abs(centre(ink)[1] - centre(box)[1]), text).toBeLessThanOrEqual(2);
      if (text !== 'TipText') expect(Math.abs(centre(ink)[0] - 500), text).toBeLessThanOrEqual(1.5);   // HCENTERED on its XPOS
    }
  });

  it('the instruction strip ([square] STORE LOADOUT [circle] SELECT DEFAULT WEAPONS) lies inside its bar, glyphs and words', async () => {
    const { quads, atlases } = await primaryRow();
    const bar = one(quads, 'eq_inst_back');
    expect([bar.x0, bar.y0, bar.x1, bar.y1]).toEqual([16, 65, 631, 97]);
    const strip = quads.filter((q) => q.object === 'InstructionText');
    expect(strip.filter((q) => q.texture === 'font_special_01.tif')).toHaveLength(2);   // the square and the circle
    for (const q of strip) expect(inside(boxOf(q), bar), JSON.stringify(q)).toBe(true);
    const ink = inkOf(quads, 'InstructionText', atlases)!;
    expect(Math.abs(centre(ink)[1] - centre(bar)[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(centre(ink)[0] - 320)).toBeLessThanOrEqual(1.5);
  });

  it('the stat bars lie in the weapon-data panel, each label on its bar\'s row, FIRE MODES above the panel\'s foot', async () => {
    const { quads, atlases } = await primaryRow();
    const panel = one(quads, 'EquipWeapDescWin');
    for (const [label, n] of [['Wvolume', ''], ['Accuracy', '2'], ['FRange', '3'], ['FireRate', '4']] as const) {
      const frame = one(quads, `eq_wep_comp_range${n}`), bar = one(quads, `eq_wep_comp_bar${n}`);
      expect(inside(frame, panel), label).toBe(true);
      expect(inside(bar, frame), label).toBe(true);
      const ink = inkOf(quads, label, atlases)!;
      expect(inside(ink, panel), label).toBe(true);
      expect(ink.x1, label).toBeLessThan(frame.x0);                              // the label ends before its bar
      expect(Math.abs(centre(ink)[1] - centre(bar)[1]), label).toBeLessThanOrEqual(1.5);
    }
    for (const o of ['FireModes', 'FireMode1']) expect(inside(inkOf(quads, o, atlases)!, panel), o).toBe(true);
  });

  it('the tips (WRAPPEDTEXT) lifted by DAT_003e0390: their first line\'s letters on rows 289-300, as the capture shows', async () => {
    const { quads, atlases } = await primaryRow();
    const ink = inkOf(quads, 'WepInstText', atlases)!;
    expect(ink.y0).toBeGreaterThanOrEqual(287);
    expect(ink.y0).toBeLessThanOrEqual(291);
    expect(inside(ink, one(quads, 'EquipLoadInstWin'))).toBe(true);
  });

  it('the title row inside the frame and its back: ARMORY and the game\'s name within eq_title_back', async () => {
    const { quads, atlases } = await primaryRow();
    const back = one(quads, 'eq_title_back');
    for (const o of ['bar_title', 'MPgamename']) {
      const ink = inkOf(quads, o, atlases)!;
      expect(ink.y0, o).toBeGreaterThanOrEqual(0);
      expect(inside(ink, back), `${o} ${JSON.stringify(ink)}`).toBe(true);
    }
    // The bottom strip: the prompt and BACK inside eq_Lower_back.
    const lower = one(quads, 'eq_Lower_back');
    for (const o of ['CrossFieldText', 'TriFieldText']) expect(inside(inkOf(quads, o, atlases)!, lower), o).toBe(true);
  });

  it('the faces\' ink, read off the atlases: font_text_01\'s capitals on rows 5-20 of 25, font_titlebar_01\'s on 9-38 of 51', async () => {
    const { data, atlases } = await primaryRow();
    const rows = (faceName: string, code: number): [number, number] => {
      const f = data.fonts.find((x) => x.name === faceName)!, g = f.glyphs.find((x) => x.code === code)!;
      const a = atlases.get(f.textures[g.texture - 1]!.toLowerCase())!;
      let top = -1, foot = -1;
      for (let v = g.ul[1]; v < g.lr[1]; v++) {
        let any = false;
        for (let u = g.ul[0]; u < g.lr[0]; u++) if (a.data[(v * a.width + u) * 4 + 3]! >= 0x40) any = true;
        if (any) { if (top < 0) top = v - g.ul[1]; foot = v - g.ul[1] + 1; }
      }
      return [top, foot];
    };
    const e = rows('font_text_01', 69), t = rows('font_titlebar_01', 69);
    // 'E' and 'A' alike: the letters stand on rows 5-20 of font_text_01's 25 and 9-38 of font_titlebar_01's 51.
    expect([e, rows('font_text_01', 65), t, rows('font_titlebar_01', 65)]).toEqual([[5, 20], [5, 20], [9, 38], [9, 38]]);
  });
});

describe.skipIf(!present || !existsSync(resolve(FIXTURES, 'RUN/MP72.ZDB')))(`Crossroads' ARMORY against the owner's capture (2026-10-01)${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** `campaignUnlocks`: OT.R91's ruling (absent, `CAMPAIGN_UNLOCKS_EARNED_RULING`); false, the original's fresh card. */
  async function crossroads(campaignUnlocks?: boolean, side: 'seal' | 'terrorist' = 'terrorist'): Promise<{ a: Armory; t: { now: number }; sounds: string[]; sizes: Record<string, { width: number; height: number }> }> {
    const src = new FsAssetSource(FIXTURES);
    const data = await armoryFromDisc(src, 'RUN/MP72.ZDB', 'MP72', { models: false });
    const zw = (await readZarMembers(src, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!;
    const rm = Zar.parse((await readZdbMember(src, 'RUN/MP72.ZDB', 'READERM.ZAR'))!);
    const mission = parseRdr(rm.data(rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!));
    const t = { now: 0 }, sounds: string[] = [];
    const a = new Armory({ clock: () => t.now, change: () => {}, sound: (s) => sounds.push(s), ...(campaignUnlocks === undefined ? {} : { campaignUnlocks }) });
    a.setData(data);
    a.setWorld({ arsenal: arsenalOf(parseRdr(zw)), valves: missionValves(mission), side, map: 'MP72', archive: 'MP72' });
    const sizes = Object.fromEntries(data.bitmaps.map(([n, b]) => [n, { width: b.width, height: b.height }]));
    return { a, t, sounds, sizes };
  }
  const run = (a: Armory, t: { now: number }, s: number): void => { for (let i = 0; i < Math.round(s * 60); i++) { t.now += 1 / 60; a.frame(1 / 60); } };

  it('the original: the 4th Terrorist is ALG OFFICER under the LOCKED stamp (InWhichAOP 70, SetOfficer 0); the pad steps over it', async () => {
    const { a, t } = await crossroads(false);
    expect(a.open(null)).toBe(true);
    run(a, t, 0.7);
    const r = a.scripts()!;
    expect(a.text(r.node('Merc4Text').caption)).toBe('ALG OFFICER');
    expect([r.node('Terr4Dis').visible, r.node('Terr4Lock').visible]).toEqual([true, true]);
    expect(r.valve('DisableFourthChar')).toBe(1);
    // Right from TERRORIST 1: 2, 3, then back to 1 -- never the 4th.
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { t.now += 1; a.input('right'); a.frame(0); run(a, t, 0.2); seen.push(a.state()!.column); }
    expect(seen).toEqual([1, 2, 0]);
  });

  it('the original: a tap on the locked column is refused with .NEG and moves nothing', async () => {
    const { a, t, sounds, sizes } = await crossroads(false);
    a.open(null);
    run(a, t, 0.7);
    const win = a.quads(sizes).find((q) => q.object === 'eq_Merc4_win')!;
    const before = a.state()!.column;
    sounds.length = 0;
    a.tap(win.x + win.w / 2, win.y + win.h / 2);
    expect(sounds).toEqual(['.NEG']);
    expect(a.state()!.column).toBe(before);
    expect(a.state()!.screen).toBe('select');
  });

  it('OT.R91: SetOfficer reads 1, so UnlockMPChar takes its unlocked branch -- ALG OFFICER with no LOCKED stamp; the pad reaches it', async () => {
    const { a, t } = await crossroads();
    expect(a.open(null)).toBe(true);
    run(a, t, 0.7);
    const r = a.scripts()!;
    expect(r.valve('SetOfficer')).toBe(1);
    expect(a.text(r.node('Merc4Text').caption)).toBe('ALG OFFICER');
    expect([r.node('Terr4Dis').visible, r.node('Terr4Lock').visible]).toEqual([false, false]);
    expect(r.valve('DisableFourthChar')).toBe(0);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { t.now += 1; a.input('right'); a.frame(0); run(a, t, 0.2); seen.push(a.state()!.column); }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it('OT.R91, the SEAL side: SetReaver reads 1 -- SAS (REAVER) with no LOCKED stamp; a tap on its column is no refusal', async () => {
    const { a, t, sounds, sizes } = await crossroads(undefined, 'seal');
    a.open(null);
    run(a, t, 0.7);
    const r = a.scripts()!;
    expect(a.text(r.node('Seal4Text').caption)).toBe('SAS (REAVER)');
    expect([r.node('Seal4Dis').visible, r.node('Seal4Lock').visible]).toEqual([false, false]);
    expect(r.valve('DisableFourthChar')).toBe(0);
    const win = a.quads(sizes).find((q) => q.object === 'eq_Seal4_win')!;
    sounds.length = 0;
    t.now += 1;
    a.tap(win.x + win.w / 2, win.y + win.h / 2);
    expect(sounds).not.toContain('.NEG');
  });

  it('the columns list each kit by the items\' Description: FRAG and HE GRENADE, not M67 and HE', async () => {
    const { a, t } = await crossroads();
    a.open(null);
    run(a, t, 0.7);
    expect(['Char5PrimaryWeaponDescr', 'Char5SecondaryWeaponDescr', 'Char5Equip1Descr', 'Char5Equip2Descr', 'Char5Equip3Descr'].map((n) => a.uivar(n)))
      .toEqual(['552', 'M9', 'FRAG', 'HE GRENADE', 'PMN Mine']);
    expect(['Char6PrimaryWeaponDescr', 'Char6SecondaryWeaponDescr'].map((n) => a.uivar(n))).toEqual(['TA 12 GAUGE', 'DE .50']);
  });
});
