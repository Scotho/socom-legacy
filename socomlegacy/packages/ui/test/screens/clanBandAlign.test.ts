import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import type { DialogDesign, DialogRecord } from '../../src/dialog';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { CLAN_BAND_ALIGN_ADAPTATION, clanBandAlignDesign, clanBandAlignLookup } from '../../src/screens/clanBandAlign';
import { file, WORLD } from './worldOfSocomRig';

/**
 * CLAN_BAND_ALIGN_ADAPTATION (product track; **an intended divergence**, the owner's word, 2026-11-18, relayed by the main
 * controller: "Please fix that, i know it's an adation from the original and it's a prefered one"): SOCOM II ONLINE's
 * MESSAGES pane draws its "Clan messages" band where the disc puts it -- a child of `motd` at (-14, 75), absolute x 191,
 * 450 wide, so inset 15 from the news band (`DescFieldMid` at x 176, 448 wide) and past the window's right edge; its
 * title and text at x 200, against the news title's 185 and body's 205. The page aligns them: the band at the news
 * band's x and width, the title at the news title's x, the text at the news body's x. The disc's design is untouched
 * underneath (only `dlgWorldOfSOCOM.rdr`'s three `motd` children move, in the page's lookup).
 */

/** The fields that matter, as the disc holds them (`tools/dump-dialogs.ts --dialog dlgWorldOfSOCOM.rdr --tree`). */
const rec = (name: string, x: number, y: number, childOf: string | null, widget: object): DialogRecord => ({ name, type: (widget as { type: string }).type, x, y, opacity: 1, childOf, widget } as DialogRecord);
const image = (w: number, h: number) => ({ type: 'IMAGE', uivar: null, image: { filename: 'x.tif', size: [w, h], pulse: null } });
const text = { type: 'TEXT' };
const wrapped = { type: 'WRAPPEDTEXT', width: 400 };
const world = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], scripts: [], models: [], dropped: [],
  controls: [rec('DescriptionText', 185, 94, null, text), rec('DescFieldMid', 176, 96, null, image(448, 24))],
  objects: [
    rec('motd', 205, 125, null, wrapped),
    rec('ClanMessages', -5, 125, 'motd', wrapped),
    rec('DescFieldMid', -14, 75, 'motd', image(450, 30)),
    rec('ClanMessageText', -5, 103, 'motd', text),
  ],
} as never);
/** A record's absolute x: its own plus its parent's (`motd` sits at the dialog's root). */
const absX = (d: DialogDesign, name: string, childOf: string | null): number => {
  const all = [...d.controls, ...d.objects];
  const r = all.find((x) => x.name === name && x.childOf === childOf)!;
  const parent = r.childOf === null ? null : all.find((x) => x.name === r.childOf && x.childOf === null)!;
  return r.x + (parent?.x ?? 0);
};
const widthOf = (d: DialogDesign, name: string, childOf: string | null): number =>
  (([...d.controls, ...d.objects].find((x) => x.name === name && x.childOf === childOf)!.widget as { image: { size: [number, number] } }).image.size[0]);

describe('CLAN_BAND_ALIGN_ADAPTATION: the clan messages band aligned with the news band (the owner\'s word)', () => {
  it('quotes the owner and names the divergence', () => {
    expect(CLAN_BAND_ALIGN_ADAPTATION).toMatch(/prefered one/);
    expect(CLAN_BAND_ALIGN_ADAPTATION).toMatch(/intended divergence/);
  });

  it('the band flush with the news band (x and width); the title at the news title\'s column; the text at the news body\'s', () => {
    const before = world(), after = clanBandAlignDesign(before);
    expect([absX(before, 'DescFieldMid', 'motd'), absX(before, 'DescFieldMid', null)]).toEqual([191, 176]);   // the disc's inset
    expect(absX(after, 'DescFieldMid', 'motd')).toBe(absX(after, 'DescFieldMid', null));
    expect(widthOf(after, 'DescFieldMid', 'motd')).toBe(widthOf(after, 'DescFieldMid', null));
    expect(absX(after, 'ClanMessageText', 'motd')).toBe(absX(after, 'DescriptionText', null));
    expect(absX(after, 'ClanMessages', 'motd')).toBe(absX(after, 'motd', null));
    // the heights, the rows and everything else as the disc has them
    const y = (d: DialogDesign) => d.objects.map((r) => [r.name, r.y]);
    expect(y(after)).toEqual(y(before));
    expect(after.controls).toEqual(before.controls);
    expect(before.objects.find((r) => r.name === 'DescFieldMid')!.x).toBe(-14);    // the disc's design untouched
  });

  it('only SOCOM II ONLINE: the lookup patches dlgWorldOfSOCOM.rdr once and passes every other dialog through', () => {
    const d = world(), other = world();
    const lookup = clanBandAlignLookup((n) => (n === WORLD ? d : n === 'dlgOther.rdr' ? other : null));
    const a = lookup(WORLD)!;
    expect(absX(a, 'DescFieldMid', 'motd')).toBe(176);
    expect(lookup(WORLD)).toBe(a);                        // cached
    expect(lookup('dlgOther.rdr')).toBe(other);
    expect(lookup('none.rdr')).toBeNull();
  });
});

const READERC = file('RUN/UI/READERC.ZAR');
describe.skipIf(READERC === null)(`CLAN_BAND_ALIGN_ADAPTATION on the disc's dlgWorldOfSOCOM.rdr${READERC ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the disc holds the inset; the page\'s lookup aligns both band edges and both text columns', () => {
    const disc = dialogLookup([Zar.parse(READERC!)]);
    const before = disc(WORLD)!, after = clanBandAlignLookup(disc)(WORLD)!;
    expect(absX(before, 'DescFieldMid', 'motd')).not.toBe(absX(before, 'DescFieldMid', null));
    expect(absX(after, 'DescFieldMid', 'motd')).toBe(absX(after, 'DescFieldMid', null));
    expect(widthOf(after, 'DescFieldMid', 'motd')).toBe(widthOf(after, 'DescFieldMid', null));
    expect(absX(after, 'ClanMessageText', 'motd')).toBe(absX(after, 'DescriptionText', null));
    expect(absX(after, 'ClanMessages', 'motd')).toBe(absX(after, 'motd', null));
  });
});
