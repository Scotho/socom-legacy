import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { decodeUiProgram, FONTS_RDR, loadLocService, parseAnimSets, type LocService } from '@s2u/scene';
import { readTextFaces, type TextFace } from '../../src/index';
import { dialogLookup } from '../../src/screens/dialogArchive';
import type { MenuCardIo } from '../../src/screens/menuCommands';
import { POPUP_RECORD_AT, readPopupRecord, type PopupRecord } from '../../src/popup/record';
import type { ZAnimRtSet } from '../../src/zanimRuntime';
import {
  DESKTOP_SCREEN_CONTINUE_LABEL, DESKTOP_SCREEN_HOOKS, DESKTOP_SCREEN_RECORD, DESKTOP_SCREEN_TEMPLATE, checkDesktopHook,
  desktopHookRig,
} from '../../src/desktopScreen/index';

/**
 * PLAT-28's harness on the real main menu (web research 142 §4-§5): `dlgMenu.rdr` from `RUN/UI/READERC.ZAR` with its
 * scripts from `RUN/UIZANIM.ZAR`, the fonts and the UIMnLOC strings, every hook of MENU-03 and MENU-08 pressed as the
 * player would -- DOWN along the menu's own `OnMenuBtnDown` to the row, CROSS, CONTINUE -- on an empty card and on a
 * card with saves (M3's two item orders: `GotSaveGames` 0 puts NEW GAME first, 1 LOAD GAME). The notice's chrome held to
 * the disc's own record. Names, ids and decoded values only (RS.R8).
 *
 * The files come from the disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures
 * (`S2U_TEST_FIXTURES`, else `test-fixtures/`): CI runs it on the fixtures. With neither, every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const NEEDED = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR', FONTS_RDR.archive, 'RUN/MP2.ZDB', 'RUN/LOCALE/STATES/UIMNLOC.ZAR'];
const ROOT = [DISC, FIXTURES].find((r) => r !== '' && NEEDED.every((p) => existsSync(join(r, p)))) ?? '';
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(join(ROOT, p)));

let env: { sets: ZAnimRtSet[]; lookup: ReturnType<typeof dialogLookup>; faces: TextFace[]; loc: LocService } | null = null;
async function environment() {
  if (env) return env;
  const sets = parseAnimSets(Zar.parse(read('RUN/UIZANIM.ZAR'))).sets;
  const lookup = dialogLookup([Zar.parse(read('RUN/UI/READERC.ZAR'))]);
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(new FsAssetSource(ROOT), 'RUN/MP2.ZDB');
  return (env = { sets, lookup, faces, loc: service });
}

/**
 * A card behind MENU-01a's rows (`MenuCardIo`): port 0 a formatted PS2 card, its directories and files a table the
 * rows only read; `saves` puts `SaveGame0` in the save folder with a header text the count accepts (`m...`, R138.4).
 * Its content serialised is the card diff.
 */
function card(saves: boolean): { io: MenuCardIo; state: () => string } {
  const dirs = new Set<string>(['BASCUS-97275SOCOMII']);
  const files = new Map<string, string>();
  if (saves) files.set('SaveGame0', 'mission 1');
  let cwd = '/';
  const exists = (path: string): boolean => path === '..' || dirs.has(path) || (cwd !== '/' && files.has(path));
  const io: MenuCardIo = {
    getInfo: (port) => (port === 0 ? { result: 0, type: 2, format: 1 } : { result: -4, type: 0, format: 0 }),
    getDir: (port, _slot, path) => ({ result: port === 0 && exists(path) ? 1 : 0 }),
    chdir: (port, _slot, path) => { if (port !== 0 || !(path === '..' || dirs.has(path))) return { result: -4 }; cwd = path === '..' ? '/' : path; return { result: 0 }; },
    mkdir: (port, _slot, path) => { if (port !== 0) return -4; if (dirs.has(path)) return -4; dirs.add(path); return 0; },
    saveHeaderText: (port, _slot, path) => (port === 0 ? files.get(path) ?? null : null),
  };
  return { io, state: () => JSON.stringify({ dirs: [...dirs].sort(), files: [...files], cwd }) };
}

const FIVE: [string, string][] = [
  ['NEW GAME', 'new_game_button'], ['LOAD GAME', 'load_game_button'], ['OPTIONS', 'options_button'], ['EXTRAS', 'Extras_button'], ['LAN', 'LAN_button'],
];

const rigFor =(saves: boolean) => async () => {
  const e = await environment();
  return () => {
    const c = card(saves);
    return desktopHookRig({
      dialog: e.lookup, sets: e.sets, startDialog: 'dlgMenu.rdr', card: c.io, cardState: c.state,
      face: (n) => e.faces.find((f) => f.name === n) ?? null, locText: (id) => e.loc.text(id) ?? null,
    });
  };
};

describe.skipIf(ROOT === '')(`PLAT-28 on the real dlgMenu (research 142 §5)${ROOT === '' ? ' (no disc, no fixtures)' : ''}`, () => {
  it('the notice\'s chrome is dlgMenu.rdr\'s LoadGameOnListBox record 517, field for field (its name indices aside)', async () => {
    const { sets, loc } = await environment();
    const set = sets.find((s) => s.name === DESKTOP_SCREEN_TEMPLATE.set)!;
    const anim = set.anims.find((a) => a.name === DESKTOP_SCREEN_TEMPLATE.animation)!;
    const found: { r: PopupRecord; names: readonly string[] }[] = [];
    for (const seq of decodeUiProgram(anim as never).sequences) for (const op of seq.ops) {
      if (op.op !== 'ui' || op.command.node !== 'POPUP') continue;
      const b = new Uint8Array(POPUP_RECORD_AT + op.command.extra.length);
      b.set(op.command.extra, POPUP_RECORD_AT);
      const r = readPopupRecord(b);
      if (r.textId === DESKTOP_SCREEN_TEMPLATE.textId) found.push({ r, names: anim.names });
    }
    expect(found).toHaveLength(1);
    const { r: disc, names } = found[0]!;
    const mine = DESKTOP_SCREEN_RECORD;
    const fields = (x: PopupRecord) => ({ ...x, textName: 0, textId: 0, panel: 0, valve: 0, buttons: x.buttons.map((b, k) => (k === 0 ? { ...b, focused: 0, normal: 0, pressed: 0, labelName: 0 } : b.w)) });
    expect(fields(mine)).toEqual(fields(disc));
    expect([names[disc.panel], names[disc.buttons[0].focused], names[disc.buttons[0].normal], names[disc.buttons[0].pressed]])
      .toEqual(['popupOp.tif', 'active_back.tif', 'pop_butt.tif', 'pop_butt.tif']);
    expect(disc.buttons[0].labelId).toBe(DESKTOP_SCREEN_CONTINUE_LABEL);
    expect(loc.text(DESKTOP_SCREEN_CONTINUE_LABEL)).toBe('CONTINUE');
  });

  // POPUP-PLACE (owner's report 2026-10-04: the notice "stuck" in a corner). The original places a popup at its record's
  // x, y: `FUN_0036da20` moves the record's node, when its name is `POPUP`, to (+8, +12) (`FUN_003157d0`,
  // D:L266844-266848), and the draw `FUN_00370690` puts the panel at the node's place and each button at the node's
  // place plus its own (D:L268434-268444). Record 517: the panel 340 x 120 at (150, 180), CONTINUE 85 x 25 at
  // (150 + 125, 180 + 80). No centring: the place is the record's (research 118 §3, 142 §3).
  it("NEW GAME on the drawn machine: the notice's panel at (150, 180) 340 x 120, CONTINUE at (275, 260); CONTINUE closes it", async () => {
    const rig = (await rigFor(false)())();
    rig.run(90);
    expect(rig.focused()).toBe('new_game_button');
    rig.press('CROSS');
    rig.run(2);
    expect(rig.screen.current?.control).toBe('new_game_button');
    const box = (texture: string) => rig.last().filter((d) => d.kind === 'sprite' && d.node === 'POPUP' && d.texture === texture)
      .map((d) => (d.kind === 'sprite' ? [d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0] : []));
    expect(box('popupOp.tif')).toEqual([[150, 180, 340, 120]]);
    expect(box('active_back.tif')).toEqual([[275, 260, 85, 25]]);              // CONTINUE, focused (button 1)
    rig.run(15);
    rig.press('CROSS');                                                        // CONTINUE
    rig.run(15);
    expect(rig.screen.current).toBeNull();
    expect(rig.last().some((d) => 'node' in d && d.node === 'POPUP')).toBe(false);
    expect(rig.focused()).toBe('new_game_button');
    expect(rig.state().dialog).toBe('dlgMenu.rdr');
  }, 120_000);

  for (const saves of [false, true]) {
    const label = saves ? 'a card with a save (LOAD GAME first)' : 'an empty card (NEW GAME first)';
    it(`${label}: the menu's first row, as M3 orders it`, async () => {
      const rig = (await rigFor(saves)())();
      rig.run(90);
      expect(rig.state().dialog).toBe('dlgMenu.rdr');
      expect(rig.state().valves).toContain(`GotSaveGames:2=${saves ? 1 : 0}`);
    }, 120_000);

    // The five written out, not read from the list: a hook dropped from `DESKTOP_SCREEN_HOOKS` fails here.
    for (const [feature, control] of FIVE) {
      it(`${label}: ${feature} -- the screen at CROSS, CONTINUE back to ${control}, the valves, UI variables and card as the twin's`, async () => {
        const hook = DESKTOP_SCREEN_HOOKS.find((h) => h.feature === feature);
        expect(hook, feature).toBeDefined();
        if (!hook) return;
        expect(hook.control).toBe(control);
        const make = await rigFor(saves)();
        const c = checkDesktopHook(make, hook);
        expect(c.failures).toEqual([]);
        expect([c.bound, c.reached, c.shown, c.drawn, c.closed]).toEqual([hook.replaces, true, true, true, true]);
        expect(c.after).toEqual(c.twin);
        expect(c.after.card).toBe(c.before.card);                                  // the card diff: no byte changed
        expect(c.chain).toEqual([]);
        expect(c.extra).toEqual([]);
        expect(c.shared).toEqual([]);                                             // the disc's dlgMenu binds the animation once
      }, 120_000);
    }
  }
});
