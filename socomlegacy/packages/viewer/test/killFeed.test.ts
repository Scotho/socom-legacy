import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  KILL_FEED_CAP_ROWS, KILL_FEED_MARK_ADAPTATION, KILL_FEED_ORANGE, SIDE_NAME_COLOURS_ADAPTATION, killFeedCapBox, killFeedLine,
  killFeedMarkSpan, killFeedSubject, sideNameRgb, type KillFeedName,
} from '../src/killFeed';
import { DEFAULT_MODEL, HUD_LAYOUT, Hud, hudLayout, MESSAGE_SCALE, type BannerLine, type HudModel, type HudQuad } from '../src/hud';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import { readHud } from '../src/hudAssets';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import { killLine } from '../src/netPage';
import { SIDE_COLOUR } from '../src/forge/pieces';

/**
 * WM-DATA-FEED (INTAKE 47, look 3B2; a BROWSER ADAPTATION, product track): the kill feed's names in the project's side
 * colours, the line's text `killLine`'s exactly, and the local or watched player's line under an orange bar and wash
 * centred on its capitals. Synthetic lines; nothing of the original's measured (the dev-disc test reads the font's rows).
 */
const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'font_text_01.tif': { width: 512, height: 128 }, 'newweapnbkrnd.tif': { width: 128, height: 64 }, white: { width: 1, height: 1 },
};
const model = (lines: BannerLine[]): HudModel => ({ ...DEFAULT_MODEL, banner: [{ alpha: 1, lines }] });
const messageQuads = (lines: BannerLine[]): HudQuad[] => hudLayout(PS2, model(lines), SIZES).quads.filter((q) => q.element === 'message');
const whites = (lines: BannerLine[]): HudQuad[] => messageQuads(lines).filter((q) => q.texture === 'white');
const hex = (n: number): number[] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const ORANGE = [128 / 128, 64 / 128, 32 / 128];

const VIPER: KillFeedName = { name: 'Viper', side: 'seal' };
const COBRA: KillFeedName = { name: 'Cobra', side: 'terrorist' };
const GONE: KillFeedName = { name: 'Ghost', side: null };
const feed = (how: string, k: KillFeedName | null, v: KillFeedName, w: string | null, marked = false): BannerLine =>
  killFeedLine(how, k, v, w, marked, MESSAGE_SCALE);

describe('the side colours: the project\'s own, not round chat\'s pastels (INTAKE 47)', () => {
  it('SEAL (90, 156, 255) and Terrorist (224, 80, 60): the Forge\'s `SIDE_COLOUR` exactly', () => {
    expect(SIDE_NAME_COLOURS_ADAPTATION).toEqual({ seal: [90, 156, 255], terrorist: [224, 80, 60] });
    expect([...SIDE_NAME_COLOURS_ADAPTATION.seal]).toEqual(hex(SIDE_COLOUR.seal));
    expect([...SIDE_NAME_COLOURS_ADAPTATION.terrorist]).toEqual(hex(SIDE_COLOUR.terrorist));
    expect(sideNameRgb('seal').map((c) => c * 255)).toEqual(hex(SIDE_COLOUR.seal));
  });
  it('the mark\'s orange is the message window\'s colour 4', () => {
    expect([...KILL_FEED_ORANGE]).toEqual([...MESSAGE_COLOURS[4]!]);
  });
});

describe('killFeedLine: killLine\'s text in pieces, the names by side, the rest colour 0', () => {
  const cases: [string, KillFeedName | null, KillFeedName, string | null][] = [
    ['weapon', VIPER, COBRA, 'HK5SD'], ['teamkill', VIPER, { name: 'Echo', side: 'seal' }, 'M4A1 SD'],
    ['weapon', COBRA, VIPER, 'AK-47'], ['suicide', COBRA, COBRA, 'M67'], ['weapon', VIPER, VIPER, 'M67'],
    ['weapon', null, VIPER, 'M67'], ['suicide', null, COBRA, null], ['fall', null, VIPER, null],
    ['orphan', VIPER, COBRA, 'M67'], ['orphan', null, COBRA, 'M67'], ['weapon', VIPER, COBRA, null], ['weapon', VIPER, COBRA, ''],
  ];
  it('every branch: the pieces\' text is killLine\'s exactly (the wrap, the readers and the width unchanged)', () => {
    for (const [how, k, v, w] of cases) {
      const l = feed(how, k, v, w);
      expect(l.text, `${how} ${k?.name} ${v.name} ${w}`).toBe(killLine(how as 'weapon', k?.name ?? null, v.name, w));
      expect(l.segments!.map((g) => g.text).join('')).toBe(l.text);
      expect(l.scale).toBe(MESSAGE_SCALE);
      expect(l.rgb).toBeUndefined();
    }
  });
  it('a SEAL killing a Terrorist: the killer blue, " fragged " colour 0, the victim red, " with WEAPON" colour 0', () => {
    expect(feed('weapon', VIPER, COBRA, 'HK5SD').segments).toEqual([
      { text: 'Viper', rgb: sideNameRgb('seal') }, { text: ' fragged ' }, { text: 'Cobra', rgb: sideNameRgb('terrorist') }, { text: ' with HK5SD' },
    ]);
  });
  it('a suicide and a fall: the one who died by side, the words colour 0', () => {
    expect(feed('suicide', COBRA, COBRA, 'M67').segments).toEqual([{ text: 'Cobra', rgb: sideNameRgb('terrorist') }, { text: ' commits suicide with M67' }]);
    expect(feed('fall', null, VIPER, null).segments).toEqual([{ text: 'Viper', rgb: sideNameRgb('seal') }, { text: ' falls to their death' }]);
  });
  it('a name whose side is unknown (a seat that left, a spectator) draws in colour 0', () => {
    expect(feed('weapon', GONE, COBRA, 'M4').segments![0]).toEqual({ text: 'Ghost' });
    expect(feed('orphan', null, COBRA, 'M67').segments).toEqual([{ text: 'fragged ' }, { text: 'Cobra', rgb: sideNameRgb('terrorist') }, { text: ' with M67' }]);
  });
  it('the mark: the window\'s orange on a marked line only', () => {
    expect(feed('weapon', VIPER, COBRA, 'M4', true).feedMark).toEqual(ORANGE);
    expect(feed('weapon', VIPER, COBRA, 'M4').feedMark).toBeUndefined();
  });
});

describe('killFeedSubject: the killer; the one who died for a suicide, a world kill or a fall', () => {
  it('reads the line\'s subject by id', () => {
    expect(killFeedSubject('weapon', 2, 3)).toBe(2);
    expect(killFeedSubject('teamkill', 2, 3)).toBe(2);
    expect(killFeedSubject('suicide', 3, 3)).toBe(3);
    expect(killFeedSubject('weapon', 3, 3)).toBe(3);
    expect(killFeedSubject('weapon', null, 3)).toBe(3);
    expect(killFeedSubject('fall', null, 3)).toBe(3);
    expect(killFeedSubject('orphan', null, 3)).toBeNull();
  });
});

describe('the mark\'s bar: 15 high, centred on the capitals (look 3B2, "visually centered")', () => {
  it('the cap box at the window\'s 0.9: 12.3 above the baseline to 0.3 below it', () => {
    const cap = killFeedCapBox(MESSAGE_SCALE);
    expect(cap.up).toBeCloseTo(12.3, 9);
    expect(cap.down).toBeCloseTo(0.3, 9);
  });
  it('the span: y-13.5..y+1.5, the line pitch high, 1.2 clear of the capitals above and below', () => {
    const cap = killFeedCapBox(MESSAGE_SCALE), span = killFeedMarkSpan(MESSAGE_SCALE);
    expect(KILL_FEED_MARK_ADAPTATION).toEqual({ bar: 2, pad: 3, height: 15, barAlpha: 1, washAlpha: 0.22 });
    expect(span.up + span.down).toBe(HUD_LAYOUT.banner.pitch);
    expect(span.up).toBeCloseTo(13.5, 9);
    expect(span.down).toBeCloseTo(1.5, 9);
    expect(span.up - cap.up).toBeCloseTo(1.2, 9);
    expect(span.down - cap.down).toBeCloseTo(1.2, 9);
  });
  it('the cap rows are the disc font\'s: ink from row 5 to the foot row 20', () => {
    expect(KILL_FEED_CAP_ROWS).toEqual({ top: 5, foot: 20 });
  });
});

describe('the message window draws the mark: the wash, then the bar, behind the marked line only', () => {
  const B = HUD_LAYOUT.banner, base = B.base + B.perScale * MESSAGE_SCALE;
  it('an unmarked feed line draws no white quad', () => {
    expect(whites([feed('weapon', VIPER, COBRA, 'HK5SD')])).toEqual([]);
  });
  it('a marked line: the wash pad-to-pad past the text at 0.22, the 2 px bar at its left at 1, both y-13.5..y+1.5', () => {
    const l = feed('weapon', VIPER, COBRA, 'HK5SD', true);
    const q = whites([l]);
    expect(q).toHaveLength(2);
    const A = KILL_FEED_MARK_ADAPTATION, w = textWidth(l.text, l.scale), pen = B.x - w / 2;
    const [wash, bar] = q as [HudQuad, HudQuad];
    for (const r of q) {
      expect(r.y - r.h / 2).toBeCloseTo(base - 13.5, 9);
      expect(r.y + r.h / 2).toBeCloseTo(base + 1.5, 9);
    }
    expect(wash.x - wash.w / 2).toBeCloseTo(pen - A.pad - A.bar, 9);
    expect(wash.x + wash.w / 2).toBeCloseTo(pen + w + A.pad, 9);
    expect(bar.x - bar.w / 2).toBeCloseTo(pen - A.pad - A.bar, 9);
    expect(bar.w).toBeCloseTo(A.bar, 9);
    expect(wash.rgba).toEqual([...ORANGE, A.washAlpha]);
    expect(bar.rgba).toEqual([...ORANGE, A.barAlpha]);
  });
  it('drawn behind the letters: both before the line\'s first glyph', () => {
    const all = messageQuads([feed('weapon', VIPER, COBRA, 'HK5SD', true)]);
    const firstGlyph = all.findIndex((q) => q.texture === FONT_TEXT_01.texture);
    const lastWhite = all.map((q) => q.texture).lastIndexOf('white');
    expect(lastWhite).toBeGreaterThanOrEqual(0);
    expect(lastWhite).toBeLessThan(firstGlyph);
  });
  it('the mark shares the line\'s fade', () => {
    const l = feed('weapon', VIPER, COBRA, 'HK5SD', true);
    const q = hudLayout(PS2, { ...DEFAULT_MODEL, banner: [{ alpha: 0.5, lines: [l] }] }, SIZES).quads.filter((x) => x.element === 'message' && x.texture === 'white');
    expect(q.map((x) => x.rgba[3])).toEqual([KILL_FEED_MARK_ADAPTATION.washAlpha * 0.5, KILL_FEED_MARK_ADAPTATION.barAlpha * 0.5]);
  });
  it('the glyphs of a feed line sit where the plain killLine line draws them', () => {
    const l = feed('weapon', VIPER, COBRA, 'HK5SD', true);
    const glyphs = (x: BannerLine) => messageQuads([x]).filter((q) => q.texture === FONT_TEXT_01.texture)
      .map((q) => [q.x, q.y, q.u0, q.rgba[3]].join()).sort();   // a piece's shadow and ink draw piece by piece: the set, not the order
    expect(glyphs(l)).toEqual(glyphs({ text: l.text, scale: MESSAGE_SCALE }));
  });
});

describe('the mark draws on any line that carries it, segmented or not (review F1)', () => {
  const B = HUD_LAYOUT.banner, base = B.base + B.perScale * MESSAGE_SCALE;
  const marks = (lines: BannerLine[]): HudQuad[] => hudLayout(PS2, model(lines), SIZES).quads.filter((q) => q.element === 'message' && q.texture === 'white');
  it('a marked line with no segments: the wash and the bar about its centred text, y-13.5..y+1.5', () => {
    const l: BannerLine = { text: 'Viper fragged Cobra with HK5SD', scale: MESSAGE_SCALE, feedMark: ORANGE as [number, number, number] };
    const q = marks([l]);
    expect(q).toHaveLength(2);
    const A = KILL_FEED_MARK_ADAPTATION, w = textWidth(l.text, l.scale), pen = B.x - w / 2;
    const [wash, bar] = q as [HudQuad, HudQuad];
    expect(wash.x - wash.w / 2).toBeCloseTo(pen - A.pad - A.bar, 9);
    expect(wash.x + wash.w / 2).toBeCloseTo(pen + w + A.pad, 9);
    expect(bar.w).toBeCloseTo(A.bar, 9);
    for (const r of q) {
      expect(r.y - r.h / 2).toBeCloseTo(base - 13.5, 9);
      expect(r.y + r.h / 2).toBeCloseTo(base + 1.5, 9);
    }
  });
  it('a piece the wrap posts unsegmented (segments that are not the text: the fallback) keeps its bar and wash', () => {
    const hud = new Hud(); hud.setVisible(true);
    hud.postMessage([{ text: 'Viper fragged Cobra with HK5SD', scale: MESSAGE_SCALE, segments: [{ text: 'not the text' }], feedMark: ORANGE as [number, number, number] }]);
    hud.step(0.5);
    const lines = hud.state().model.banner.flatMap((m) => m.lines);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.segments).toBeUndefined();
    expect(lines[0]!.feedMark).toEqual(ORANGE);
    expect(marks(lines)).toHaveLength(2);
  });
});

describe('a long marked feed line wraps as every post does, keeping its pieces and its mark', () => {
  it('every piece keeps the mark, its colours, and its text in order', () => {
    const hud = new Hud(); hud.setVisible(true);
    const long: KillFeedName = { name: 'AVeryLongCallsignIndeed', side: 'seal' };
    const l = feed('weapon', long, { name: 'AnotherQuiteLongCallsign', side: 'terrorist' }, 'M4A1 SD WITH A SUPPRESSOR AND SCOPE', true);
    hud.postMessage([l]); hud.step(0.5);
    const lines = hud.state().model.banner.flatMap((m) => m.lines);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map((x) => x.text).join(' ').replace(/\s+/g, ' ')).toBe(l.text);   // the wrap's own spaces aside
    for (const x of lines) {
      expect(x.feedMark).toEqual(ORANGE);
      expect(x.segments!.map((g) => g.text).join('')).toBe(x.text);
    }
    expect(lines[0]!.segments![0]).toEqual({ text: 'AVeryLongCallsignIndeed', rgb: sideNameRgb('seal') });
    const q = hudLayout(PS2, { ...DEFAULT_MODEL, banner: [{ alpha: 1, lines }] }, SIZES).quads.filter((x) => x.element === 'message' && x.texture === 'white');
    expect(q).toHaveLength(2 * lines.length);
  });
});

describe('the capture\'s preview hook is a development build\'s only', () => {
  it('the HUD seats it under a literal import.meta.env.DEV (what every vite build folds away)', () => {
    const src = readFileSync(resolve(import.meta.dirname, '..', 'src', 'hud.ts'), 'utf8');
    expect(src).toMatch(/if \(import\.meta\.en[v]\.DEV\) seatKillFeedPreview\(this, MESSAGE_SCALE\);/);
  });
});

const mp2 = fixture('RUN/MP2.ZDB');
describe.skipIf(mp2 === null)(`the cap rows on the disc's atlas${mp2 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('every capital, digit and ascender of a kill line inks rows 5..19 of its 25-row cell', () => {
    const { bitmaps } = readHud(mp2!, parseZdb(mp2!));
    const atlas = bitmaps[FONT_TEXT_01.texture]!;
    const ink = (x: number, y: number): boolean => {
      const i = (y * atlas.width + x) * 4, d = atlas.data;
      return (d[i + 3]! / 255) * ((d[i]! + d[i + 1]! + d[i + 2]!) / 765) >= 0.1;
    };
    for (const c of 'VCEMKHSDR5fdbhkl') {
      const [, x0, y0, x1, y1] = FONT_TEXT_01.glyphs.find((g) => g[0] === c.charCodeAt(0))!;
      const rows: number[] = [];
      for (let y = y0; y < y1; y++) { for (let x = x0; x < x1; x++) if (ink(x, y)) { rows.push(y - y0); break; } }
      expect([rows[0], rows[rows.length - 1]], c).toEqual([KILL_FEED_CAP_ROWS.top, KILL_FEED_CAP_ROWS.foot - 1]);
    }
  });
});
