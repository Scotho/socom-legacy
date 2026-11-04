import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { LoadingSpin } from '@s2u/ui/loading';
import { boundsOf } from '../src/armoryLayout';
import { loadingFromDisc } from '../src/loadingAssets';
import { loadingQuads, type LoadingFrameInput } from '../src/loadingLayout';

/**
 * The loading screen drawn from `dlgLoad.rdr`'s own records (INT-LOADING; research 125): a hand-built `SCREENS` record
 * in its shape first -- the picture, the title, the line under it, the disc under its parent -- then the disc's.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]),
      obj('NAME', ['LoadingBackground'], 'TYPE', ['IMAGE'], 'XPOS', ['337'], 'YPOS', ['108'], 'SPEC', ['XSIZE', ['270'], 'YSIZE', ['6'], 'FILENAME', ['load_back.tif']]),
      obj('NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['COLOR', ['14', '57', '65'], 'SCALE', ['1.2'], 'UIVAR', ['NAME', ['mission_title']]]),
      obj('NAME', ['description'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['357'], 'SPEC', ['UIVAR', ['NAME', ['mission_description']], 'COLOR', ['14', '57', '65']]),
      obj('NAME', ['ReturnToLobby'], 'TYPE', ['TEXT'], 'XPOS', ['320'], 'YPOS', ['420'], 'SPEC', ['SCALE', ['1.2'], 'COLOR', ['14', '57', '65'], 'HCENTERED', [], 'CAPTION', ['_2000_ToReturn_MSG']]),
      obj('NAME', ['load_CD_Parent'], 'TYPE', ['IMAGE'], 'XPOS', ['590'], 'YPOS', ['360'], 'SPEC', ['XSIZE', ['40'], 'YSIZE', ['40']]),
      obj('NAME', ['load_CD_spinning'], 'TYPE', ['IMAGE'], 'XPOS', ['-15'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['load_CD_Parent'], 'FILENAME', ['loading_CD.tif'], 'XSIZE', ['30'], 'YSIZE', ['30']]),
    ],
  ],
]]);

function face(): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}

const SPIN: LoadingSpin = {
  node: 'load_CD_Parent', loops: true, period: 1.5, segments: [
    { from: [1.1, 1.1, 0], to: [0, 1, 0], rate: [-1.1 / 0.75, -0.1 / 0.75, 0], seconds: 0.75 },
    { from: [0, 1, 0], to: [1.1, 1.1, 0], rate: [1.1 / 0.75, 0.1 / 0.75, 0], seconds: 0.75 },
  ],
};

const input = (t: number): LoadingFrameInput => ({
  screen: {
    layout, spin: SPIN, fonts: [face()],
    binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']]) },
    strings: [{ id: 2000, msg: '_2000_ToReturn_MSG', text: 'TO RETURN TO THE LOBBY.' }],
  },
  sizes: Object.fromEntries(['littleblack.tif', 'ld_mp2_prog.tif', 'loading_cd.tif', 'font_text_01.tif'].map((n) => [n, { width: 64, height: 64 }])),
  t,
});

const round = (b: { x: number; y: number; w: number; h: number } | null): number[] | null => b && [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 1000) / 1000);

describe('loadingQuads: dlgLoad.rdr on the 640x448 frame', () => {
  it('draws the background over the frame and the map\'s picture over its object\'s box, through the UIVAR', () => {
    const q = loadingQuads(input(0));
    expect(round(boundsOf(q, 'BACKGROUND'))).toEqual([0, 0, 640, 448]);
    expect(round(boundsOf(q, 'LoadingPicture'))).toEqual([30, 120, 580, 210]);
    expect(q.find((x) => x.object === 'LoadingPicture')!.texture).toBe('ld_mp2_prog.tif');
  });

  it('draws the title in the layout\'s colour at its pen, the lobby line centred on 320; a blank or unheld one draws nothing', () => {
    const q = loadingQuads(input(0));
    const title = q.filter((x) => x.object === 'title');
    expect(title).toHaveLength('FROSTFIRE'.length);
    expect(title.every((g) => g.rgb.join() === '14,57,65')).toBe(true);
    expect(Math.abs(title[0]!.x - 30)).toBeLessThan(1);           // the pen, less the HUD's fitted PEN_NUDGE
    const back = boundsOf(q, 'ReturnToLobby')!;
    expect(Math.abs(back.x + back.w / 2 - 320)).toBeLessThan(6);
    expect(boundsOf(q, 'description')).toBeNull();          // " "
    expect(boundsOf(q, 'LoadingBackground')).toBeNull();    // load_back.tif: on no bank (research 125 §4)
  });

  it('scales the disc with its parent about the parent\'s place (CHILD_SCALE_READING), as SpinLoadingCD runs', () => {
    expect(round(boundsOf(loadingQuads(input(0)), 'load_CD_spinning'))).toEqual([573.5, 343.5, 33, 33]);
    expect(round(boundsOf(loadingQuads(input(0.375)), 'load_CD_spinning'))).toEqual([581.75, 344.25, 16.5, 31.5]);
    expect(boundsOf(loadingQuads(input(0.75)), 'load_CD_spinning')).toBeNull();   // edge-on: no width
    expect(round(boundsOf(loadingQuads(input(1.5 + 0.375)), 'load_CD_spinning'))).toEqual([581.75, 344.25, 16.5, 31.5]);
  });

  it('without a spin the disc stands at its file size', () => {
    const f = input(0.4);
    expect(round(boundsOf(loadingQuads({ ...f, screen: { ...f.screen, spin: null } }), 'load_CD_spinning'))).toEqual([575, 345, 30, 30]);
  });
});

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const HAVE = !!DISC && existsSync(resolve(DISC, 'RUN', 'MP72.ZDB'));

describe.skipIf(!HAVE)(`the disc's dlgLoad.rdr drawn for Crossroads${HAVE ? '' : ' (no SOCOM_DISC)'}`, () => {
  it('draws the background, the picture, the title, the lobby line and the disc where the records put them', async () => {
    const screen = await loadingFromDisc(new FsAssetSource(DISC as string), 'RUN/MP72.ZDB');
    const sizes = Object.fromEntries(screen.bitmaps.map(([n, r]) => [n, { width: r.width, height: r.height }]));
    const q = loadingQuads({ screen, sizes, t: 0.375 });
    expect([...new Set(q.map((x) => x.object))]).toEqual(['BACKGROUND', 'LoadingPicture', 'title', 'ReturnToLobby', 'load_CD_spinning']);
    expect(round(boundsOf(q, 'LoadingPicture'))).toEqual([30, 120, 580, 210]);
    expect(round(boundsOf(q, 'load_CD_spinning'))).toEqual([581.75, 344.25, 16.5, 31.5]);
    // One glyph a letter in the layout's colour, each after its drop shadow (`fonts.rdr`'s face has one).
    expect(q.filter((x) => x.object === 'title' && x.rgb.join() === '14,57,65').length).toBe('CROSSROADS'.length);
    // The lobby line: the triangle's glyph in its own colour, then the words, centred on XPOS 320 (HCENTERED).
    const back = boundsOf(q, 'ReturnToLobby')!;
    expect(Math.abs(back.x + back.w / 2 - 320)).toBeLessThan(8);
    expect(q.some((x) => x.object === 'ReturnToLobby' && x.texture === 'font_special_01.tif')).toBe(true);
  });
});
