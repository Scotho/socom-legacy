import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import { Zar, parseRdr } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots } from '@s2u/card';
import { BlackPictureSource } from '@s2u/fmv';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import {
  LOADER_SEQUENCE, LoaderScreens, RAW_BLITS, UI_TICK_SECONDS, composeLoaderFrame, decodeRaw, loaderTextures, readTextFaces,
  type RawImage, type RawName, type UiDrawItem,
} from '@s2u/ui';
import { Armory } from '../src/armory';
import { armoryFromDisc } from '../src/armoryData';
import { ARMORY_WHITE, WHITE_TEXEL } from '../src/armoryLayout';
import { armoryDrawList, armoryTextures } from '../src/armoryRaster';
import { ControllerConfigs } from '../src/controllerConfigs';
import { FrontEndSession, readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import { pageUiTextures } from '../src/frontEndAssets';
import { missionMapPath } from '../src/lobbyMatch';
import { withMenuArt } from '../src/menuArt';
import { pageNativeOptionsState } from '../src/nativeOptionsState';
import { NativeSettings, readNativeOptionsAssets } from '../src/nativeSettings';
import type { UiTextures } from '../src/uiCompositorView';
import { createGameRig } from '../../ui/test/screens/createGameRig';

/**
 * GM-04's corpus (research 380 §3; the plan `docs/plans/2026-11-01-gpu-menus.md`, GM-04's and GM-07's rows): the
 * menus' draw lists as the page makes them from the dev disc -- the 114 dialogs of READERC and READERX (each a deep link
 * run 60 frames), dlgMenu with MENULOOP (300 frames, the roller turning), CREATE GAME (the rig's PLAY LIST, four maps),
 * the shared ARMORY (MP51, both sides), the in-match Settings overlay (its pages) and the loader screens (the whole
 * sequence). Moved out of `uiGpuTally.disc.test.ts` (GM-07) so the tally (GM-04) and the executor's corpus equality
 * (GM-07) walk the same frames; not rewritten. The movie pictures are the black stand-in (`BlackPictureSource`).
 *
 * The Settings overlay's frames are taken where it hands them to the drawer: the calling test file mocks
 * `../src/uiCompositorView`'s `rasterizeUiDrawList` with a recorder (a `vi.mock` must sit in the test file) and passes
 * it here.
 */

export const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
export const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
export const CORPUS_NEEDS = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/UI/UI_GEO.ZED', 'RUN/RAW/LOADING.RAW', 'RUN/MP51.ZDB', 'RUN/MP2.ZDB'];
export const HAVE_CORPUS_DISC = DISC !== '' && CORPUS_NEEDS.every((p) => existsSync(join(DISC, p)));
/** Why the corpus is skipped, said in the describe's name. */
export const CORPUS_SKIP = HAVE_CORPUS_DISC ? '' : ` -- SKIPPED: no disc (SOCOM_DISC / SOCOM_PC_ROOT, needs ${CORPUS_NEEDS.join(', ')})`;

const FRAME_MS = 1000 / 30;

/** A frame the drawer was handed: its list, its lookup and the options the caller drew it with. */
export interface RecordedFrame { items: readonly UiDrawItem[]; textures: UiTextures; transparent: boolean }
/** The calling test's recorder around `rasterizeUiDrawList`. */
export interface DrawRecorder { start(): void; stop(): RecordedFrame[] }

/** One entry of the corpus: its frames in order, the lookup they are drawn with, and whether over a transparent frame. */
export interface CorpusEntry { name: string; frames: (readonly UiDrawItem[])[]; textures: UiTextures; transparent: boolean }

/** The front end's own texture lookup (the art, the banks, the loader's), as `FrontEndSession.render` draws with. */
const sessionTextures = (s: FrontEndSession): UiTextures => (s as unknown as { textures: UiTextures }).textures;

/** GM-13's rewrite pin: each frame as it is made, with the lookup it is drawn with (before the next frame runs). */
export type CorpusFrameHook = (items: readonly UiDrawItem[], textures: UiTextures) => void;

function runSession(s: FrontEndSession, n: number, frame?: CorpusFrameHook): UiDrawItem[][] {
  const out: UiDrawItem[][] = [];
  let now = 0;
  s.advance(now);
  for (let i = 0; i < n; i++) { s.advance(now += FRAME_MS); const items = s.last.slice(); frame?.(items, sessionTextures(s)); out.push(items); }
  return out;
}

/**
 * The corpus, entry by entry, handed to `each` as it is made (an entry's frames are dropped by the caller once used:
 * the whole corpus at once would hold every frame's list). Resolves when the last entry is handed over. `frame`
 * (GM-13's rewrite pin): each frame the moment it is made, with its lookup -- the Settings overlay's excepted, which the
 * caller's `record` sees at the drawer's call.
 */
export async function walkMenuCorpus(record: DrawRecorder, each: (e: CorpusEntry) => void, frame?: CorpusFrameHook): Promise<void> {
  const src = new FsAssetSource(DISC);

  // The 114 dialogs, each a deep link run 60 frames, drawn with the page's lookups.
  const base = await readFrontEndDisc(src);
  const names = [...Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERC.ZAR')))).root.children,
    ...Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERX.ZAR')))).root.children].map((k) => k.name);
  expect(names).toHaveLength(114);
  // READERX's four are READERC members too; a deep link builds the one `dialogLookup` finds first (READERC's).
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  expect(twice).toEqual(['dlgExitState.rdr', 'dlgMultiplayerFinal.rdr', 'dlgMultiplayerFinalReally.rdr', 'dlgMultiplayerRound.rdr']);
  const disc: FrontEndDisc = await withMenuArt(src, base, names);
  const banks = pageUiTextures(src);
  await banks.ready;
  for (const name of names.filter((n, i) => names.indexOf(n) === i)) {
    const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: name, textures: banks.textures });
    each({ name, frames: runSession(s, 60, frame), textures: sessionTextures(s), transparent: false });
  }

  // dlgMenu with MENULOOP: 300 frames from the build (the fades, the roller's turn, the movie's pictures).
  {
    const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: 'dlgMenu.rdr', loader: false, textures: banks.textures });
    each({ name: 'dlgMenu + MENULOOP (300 frames)', frames: runSession(s, 300, frame), textures: sessionTextures(s), transparent: false });
  }

  // CREATE GAME: the rig's PLAY LIST, each of its four maps focused.
  {
    const fz = Zar.parse(new Uint8Array(readFileSync(join(DISC, FONTS_RDR.archive))));
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
    const r = createGameRig({ face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
    const frames: UiDrawItem[][] = [];
    await r.enter();
    frames.push(r.last().slice());
    frame?.(frames[0]!, banks.textures);
    r.go('SelectGames');
    r.press('CROSS', 10);
    for (let k = 0; k < 4; k++) {
      if (k > 0) r.press('DOWN', 3);
      for (let i = 0; i < 30; i++) { r.run(1); const items = r.last().slice(); frame?.(items, banks.textures); frames.push(items); }
    }
    each({ name: 'CREATE GAME (PLAY LIST, four maps)', frames, textures: banks.textures, transparent: false });
  }

  // The shared ARMORY on MP51, each side, as the lobby opens it (`LobbyArmory.open`): 60 frames, then into the kit.
  for (const side of ['seal', 'terrorist'] as const) {
    const mission = 'MP51';
    const data = await armoryFromDisc(src, missionMapPath(mission)!, mission, { models: false, world: true });
    const art = disc.art!;
    let now = 0;
    const a = new Armory({ clock: () => now, change: () => {}, modelParts: (m) => art.model(m)?.parts.map((p) => p.node) ?? null });
    const bitmaps = new Map<string, { width: number; height: number; data: Uint8ClampedArray }>();
    for (const [n, rgba] of data.bitmaps) bitmaps.set(n.toLowerCase(), rgba);
    const sizes: Record<string, { width: number; height: number }> = { [ARMORY_WHITE]: { width: WHITE_TEXEL.width, height: WHITE_TEXEL.height } };
    for (const [n, rgba] of bitmaps) sizes[n] = { width: rgba.width, height: rgba.height };
    a.setData(data);
    a.setWorld({ arsenal: data.world!.arsenal, valves: data.world!.valves, side, map: mission, archive: data.archive, eqLimit: 0 });
    expect(a.open(null), `ARMORY ${side}`).toBe(true);
    const textures = armoryTextures(bitmaps, art.textures);
    const frames: UiDrawItem[][] = [];
    const step = (pressed: string[]): void => {
      a.pad(new Set(pressed) as never);
      now += 1 / 30; a.frame(1 / 30);
      const items = armoryDrawList(a.quads(sizes), a.models(), sizes, (n) => art.model(n));
      frame?.(items, textures);
      frames.push(items);
    };
    for (let i = 0; i < 60; i++) step([]);
    // Cross takes the first row (its weapon's model shows); Right through its choices, Down to the next rows.
    for (const key of ['Cross', 'Right', 'Right', 'Down', 'Right', 'Down', 'Right', 'Down', 'Right', 'Circle']) { step([key]); for (let i = 0; i < 20; i++) step([]); }
    each({ name: `ARMORY (MP51, ${side})`, frames, textures, transparent: false });
  }

  // The Settings overlay over a match: its first page 40 frames, then down its rows and into each.
  {
    const assets = await readNativeOptionsAssets(src);
    const state = pageNativeOptionsState(assets.disc, new CardSlots(() => null, () => {}), new ControllerConfigs());
    const target = { createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} };
    const doc = {
      createElement: () => ({ width: 300, height: 150, dataset: {}, style: { filter: '', removeProperty() {} }, isConnected: true, addEventListener() {}, remove() {},
        getContext: () => target, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 448 }) }),
      body: { append() {} },
    } as unknown as Document;
    const settings = new NativeSettings({ doc, load: async () => ({ assets, state }) });
    await settings.preload();
    record.start();
    settings.open();
    let now = 1000;
    const frame = (pressed: string[]): void => { settings.frame(now += 33.4, new Set(pressed) as never); };
    for (let i = 0; i < 40; i++) frame([]);
    for (const key of ['Down', 'Cross', 'Down', 'Down', 'Circle', 'Down', 'Cross', 'Down', 'Circle']) { frame([key]); for (let i = 0; i < 15; i++) frame([]); }
    const got = record.stop();
    settings.close(); state.dispose?.();
    expect(got.length).toBeGreaterThan(0);
    // One lookup and one frame mode over the overlay's frames (the editor's assets; `transparent: true` at
    // `nativeSettings.ts`'s drawer call): a frame that differs would be drawn here with the wrong ones.
    expect(got.every((f) => f.textures === got[0]!.textures && f.transparent === got[0]!.transparent), 'the overlay draws with one lookup and one mode').toBe(true);
    each({ name: 'Settings overlay (in match)', frames: got.map((r) => r.items), textures: got[0]!.textures, transparent: got[0]!.transparent });
  }

  // The loader screens: the whole sequence at the page's 30 Hz.
  {
    const images: Partial<Record<RawName, RawImage>> = {};
    for (const n of LOADER_SEQUENCE) images[n] = decodeRaw(new Uint8Array(readFileSync(join(DISC, RAW_BLITS[n].path))), RAW_BLITS[n]);
    const l = new LoaderScreens();
    const frames: UiDrawItem[][] = [];
    const textures = loaderTextures(images);
    for (let t = 0; t <= l.duration; t += UI_TICK_SECONDS) { const items = composeLoaderFrame(l.frame(t)); frame?.(items, textures); frames.push(items); }
    each({ name: 'Loader screens (the sequence)', frames, textures, transparent: false });
  }
}
