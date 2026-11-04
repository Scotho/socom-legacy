import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService, parseAnimSets } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { UI_TICK_SECONDS } from '../../packages/ui/src/clock/uiClock';
import { UiCommandHost } from '../../packages/ui/src/uiCommands';
import { UiVarManager } from '../../packages/ui/src/uiVars';
import { MenuInput } from '../../packages/ui/src/input/menuInput';
import type { PadSlotName } from '../../packages/ui/src/input/padStates';
import { dialogLookup } from '../../packages/ui/src/screens/dialogArchive';
import { DialogPartsHost } from '../../packages/ui/src/screens/dialogParts';
import { DNAS_HOLD_TICKS, DnasCommands } from '../../packages/ui/src/screens/dnasCommands';
import { FrontEndMachine } from '../../packages/ui/src/screens/frontEndMachine';
import { MenuCommands } from '../../packages/ui/src/screens/menuCommands';
import { PopupSlot } from '../../packages/ui/src/screens/popupSlot';
import { UniverseCommands, UniverseList, type UniverseReply } from '../../packages/ui/src/screens/universeCommands';
import type { MovieService } from '../../packages/ui/src/movie/movieCommands';
import type { UiDrawItem } from '../../packages/ui/src/compositor/drawList';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { decodePng, rgbToRgba, rgbaToRgb, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import { judge, resample, toGrey, type Rect } from '../captureScore';

/**
 * ONL-04's score, taken at sprint 11's close (web research 147 §5, R147.10; the golden manifest's row
 * `online.select-universe`): SELECT UNIVERSE (`dlgNetServerSelect.rdr`) run through the front end on the disc -- the
 * dialog built from `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` with the screens', MENU-01a's, ONL-03's and ONL-04's
 * rows in PLAT-08's host, the rig of `packages/ui/test/screens/universeScreen.test.ts` with the disc's faces and the
 * MP2 captions -- drawn by PLAT-14's drawer with the page's UIMP bank (`frontEndAssets.ts`), and scored by PLAT-30's
 * scorer against the console's `A_34_universe.png` (PCSX2, 640 x 480, the 4:3 correction, W7.R7) and the harness's
 * title crop `scripts/parity/refs/universe.png` (245 x 24 at `refs.json`'s `universe` box). Reached by the deep link
 * (the list read before the build) and the original's way, through the DNAS screen's `init_socom_online`.
 *
 * The one visible difference is the texts: the universe's name, description and news are the placeholder's
 * (`SOCOM II Local`, H73: the owner's texts.json), not our Horizon's of `A_34`. The recomp's `01_universe.png` frames
 * are the DNAS screen's LOCATING stage (`online.locating-universes`), never this state. The numbers are the record: a
 * drawing change that moves one moves the note with it. Needs the disc and `SOCOM_PC_ROOT`'s captures; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : ROOT ? join(ROOT, 'game', 'disc') : '';
const A34 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_34_universe.png') : null;
const TITLE = ROOT ? resolve(ROOT, 'scripts/parity/refs/universe.png') : null;
const DISC_FILES = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR', FONTS_RDR.archive, 'RUN/MP2.ZDB'];
const ready = DISC !== '' && DISC_FILES.every((f) => existsSync(join(DISC, f))) && A34 !== null && [A34, TITLE!].every((p) => existsSync(p));
const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

/** The harness's title box (`scripts/parity/refs/refs.json` `universe.box`), on the frame in grey at 320 x 224. */
export const UNIVERSE_TITLE_BOX: Rect = [5, 8, 250, 32];

/** The placeholder universe (H73), the fields as SVC-05's `serverTexts.ts` answers them and universeScreen.test.ts holds. */
const ONE: UniverseReply = {
  universes: [{
    status: 0, name: 'SOCOM II Local', dns: '', port: 0, description: 'Local universe for SOCOM II', universeStatus: 1, userCount: 0, maxUsers: 256,
    billing: '', billingName: '', extendedInfo: '', endOfList: true,
  }],
  news: [{ status: 0, news: 'Welcome to SOCOM II.', endOfList: true }],
};

const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};
/** The harness's view of a 640 x 448 frame: grey, 320 x 224 (bicubic), as an RGB image for the scorer. */
const harnessGrey = (img: Rgb): Rgb => {
  const g = resample(toGrey(img), 320, 224, 'bicubic');
  const data = new Uint8Array(g.width * g.height * 3);
  for (let i = 0; i < g.width * g.height; i++) { data[i * 3] = g.data[i]!; data[i * 3 + 1] = g.data[i]!; data[i * 3 + 2] = g.data[i]!; }
  return { width: g.width, height: g.height, data };
};

async function universeRig(viaDnas: boolean) {
  const src = new FsAssetSource(DISC);
  const fz = zar(FONTS_RDR.archive);
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const face = (n: string) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null;
  const { service: captions } = await loadLocService(src, 'RUN/MP2.ZDB');
  const banks = pageUiTextures(src, ['UIMP']);
  expect(await banks.ready).toEqual([]);
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  let m!: FrontEndMachine;
  const uiVars = new UiVarManager();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face, captions, uiVars, hasTexture: (n) => banks.textures(n) !== null });
  const host = new UiCommandHost({ node: parts.nodeCommand });
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  let down = new Set<PadSlotName>();
  input.source = { read: () => ({ down, stickX: 0, stickY: 0 }) };
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); } }).register(host);
  const list = new UniverseList({ uiVars });
  new DnasCommands({ valves: () => m.valves, getServerList: () => list.job({ query: () => Promise.resolve(ONE) }) }).register(host);
  new UniverseCommands({ valves: () => m.valves, uiVars, list, lobbyDisconnect: () => {} }).register(host);
  if (!viaDnas) { for (const e of ONE.universes) list.entry(e); for (const n of ONE.news) list.newsChunk(n); }
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const lookup = dialogLookup([zar('RUN/UI/READERC.ZAR')]);
  let last: UiDrawItem[] = [];
  m = new FrontEndMachine({
    dialog: (n) => lookup(n), sets, host, popups: slot, startDialog: viaDnas ? 'dlgNetAuthenticate.rdr' : 'dlgNetServerSelect.rdr', build: { face, captions },
    built: (b) => { parts.built(b); }, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: input.activate, movie,
  });
  m.boot();
  const tick = async (): Promise<void> => { last = m.frame(UI_TICK_SECONDS); await Promise.resolve(); };
  const run = async (n: number): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };
  const press = async (name: PadSlotName): Promise<void> => { down = new Set([name]); await tick(); down = new Set(); };
  const draw = (): { frame: Rgb; undrawn: string[] } => {
    const r = rasterizeUiDrawList(last, banks.textures);
    return { frame: rgbaToRgb(640, 448, r.frame.data), undrawn: r.undrawn };
  };
  return { m, input, run, press, draw };
}

/** The two scores of one frame: `A_34` 4:3-corrected, and the title crop. */
function scores(frame: Rgb) {
  const a34 = png(A34!);
  expect([a34.width, a34.height]).toEqual([640, 480]);
  const corrected = judge(a34, frame, { pcsx2Letterbox: true });
  const title = png(TITLE!);
  expect([title.width, title.height]).toEqual([245, 24]);
  const titled = judge(title, crop(harnessGrey(frame), UNIVERSE_TITLE_BOX));
  return { corrected, titled };
}
const out = (name: string, frame: Rgb): void => {
  if (!process.env.ONL04_SCORE_OUT) return;
  mkdirSync(process.env.ONL04_SCORE_OUT, { recursive: true });
  writeFileSync(resolve(process.env.ONL04_SCORE_OUT, name), encodePng(frame.width, frame.height, rgbToRgba(frame)));
};

describe.skipIf(!ready)(`ONL-04's scores against the SELECT UNIVERSE captures${ready ? '' : ' (no disc or no SOCOM_PC_ROOT captures)'}`, () => {
  it('the deep link, settled: the list holds the focus and its row is lit on arrival, as A_34 shows it; against A_34 (4:3 corrected) and the title crop', async () => {
    const r = await universeRig(false);
    await r.run(60);
    expect(r.m.shell()?.currentName).toBe('dlgNetServerSelect.rdr');
    // The build's focus (research 116 §17, FOCUS-RING 2026-10-03): `MainWindow`, an IMAGE, is built disabled and the
    // LISTBOX takes the focus with no press. Until then the port rested on `MainWindow` and this frame scored 98.9,
    // the lit row (99.0) only "after one DOWN": the arrival frame is now the lit one.
    expect(r.input.ring()!.focused!.name).toBe('SERVERLIST');
    const settled = r.draw();
    expect(settled.undrawn).toEqual(['models']);                       // no bitmap or glyph left undrawn; the 3D pass is not this drawer's
    out('universe_settled.png', settled.frame);
    const s = scores(settled.frame);
    console.info(`settled: A_34 corrected ${JSON.stringify(s.corrected)}; title crop ${JSON.stringify(s.titled)}`);
    expect([s.corrected.score, s.corrected.control, s.corrected.matched]).toEqual([99.0, 72.9, true]);
    expect([s.titled.score, s.titled.control, s.titled.matched]).toEqual([95.3, 80.0, true]);

    // One universe: DOWN on its only row moves nothing (PADHOG keeps the press), and the frame's score stands.
    await r.press('DOWN');
    await r.run(12);
    expect(r.input.ring()!.focused!.name).toBe('SERVERLIST');
    const after = r.draw();
    expect(after.undrawn).toEqual(['models']);
    out('universe_down.png', after.frame);
    const l = scores(after.frame);
    console.info(`after DOWN: A_34 corrected ${JSON.stringify(l.corrected)}; title crop ${JSON.stringify(l.titled)}`);
    expect([l.corrected.score, l.corrected.control, l.corrected.matched]).toEqual([99.0, 72.9, true]);
  }, 180_000);

  it('through the DNAS screen\'s init_socom_online (the original\'s way): the same frame as the deep link\'s', async () => {
    const r = await universeRig(true);
    await r.run(83 + DNAS_HOLD_TICKS + 60);                          // OT.R20: the DNAS screen held 90 ticks more
    expect(r.m.shell()?.currentName).toBe('dlgNetServerSelect.rdr');
    const viaDnas = r.draw();
    expect(viaDnas.undrawn).toEqual(['models']);
    const d = await universeRig(false);
    await d.run(60);
    expect(Buffer.from(viaDnas.frame.data).equals(Buffer.from(d.draw().frame.data))).toBe(true);
    const s = scores(viaDnas.frame);
    expect([s.corrected.score, s.titled.score]).toEqual([99.0, 95.3]);
  }, 180_000);
});
