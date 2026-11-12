import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapRow } from '@s2u/archive/mapNames';
import { FsAssetSource } from '@s2u/archive/node';
import { createGameRig, HAVE as HAVE_RIG } from '../../ui/test/screens/createGameRig';
import { pageUiTextures } from '../src/frontEndAssets';
import { loadingFromDisc } from '../src/loadingAssets';

/**
 * DF-11 (the Desert Glory / Fish Hook release, 2026-11-08): the two maps' lobby card and loading picture resolve on the
 * disc, before CREATE GAME offers them (DF-14). A dev-disc test: it reads `SOCOM_DISC` (else `<SOCOM_PC_ROOT>/game/disc`)
 * and skips without it; a skip is not a pass.
 *
 * - The name rows: `MAP_TABLE` (`@s2u/archive/mapNames`) rows 6 DESERT GLORY and 71 FISH HOOK, type 4 (Extraction).
 * - The lobby card: CREATE GAME's (`dlgCreateGame.rdr`) `CGPic6` / `CGPic71` show `mp6MissPic.tif` / `mp71MissPic.tif`
 *   (`DisplayGamePic`, research 164 R164.6), held by the bank the dialog's `LIBRARIES` names, `RUN/UI/UICG_TXR.ZED`
 *   (`pageUiTextures`); `createGamePictureDisc.test.ts` draws the offered rows and takes these two when DF-14 lists them.
 * - The loading screen: each map's `mission.rdr` binds `ld_mp<n>_prog.tif` in its `LoadingScreenAssets` library (OM06,
 *   LP71) and `loadingFromDisc` resolves it at 512 x 256 with nothing missing (research 125 §2; the 22-map case is
 *   `loadingAssets.test.ts`'s, this the two maps' titles beside it).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/UICG_TXR.ZED', 'RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP71.ZDB'].every((f) => existsSync(join(DISC, f)));

const MAPS = [[6, 'DESERT GLORY'], [71, 'FISH HOOK']] as const;

describe('the name rows (no game data)', () => {
  it('MAP_TABLE rows 6 and 71: DESERT GLORY and FISH HOOK, type 4 (Extraction)', () => {
    expect(MAPS.map(([n]) => [n, mapRow(n)?.name, mapRow(n)?.type])).toEqual([[6, 'DESERT GLORY', 4], [71, 'FISH HOOK', 4]]);
  });
});

describe.skipIf(!HAVE_DISC || !HAVE_RIG)(`the lobby card and the loading picture on the disc${HAVE_DISC && HAVE_RIG ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it("CREATE GAME's CGPic6 / CGPic71 name mp6MissPic.tif / mp71MissPic.tif, and UICG holds both bitmaps", async () => {
    const r = createGameRig();
    await r.enter();
    const file = (name: string): string | null => { const c = r.node(name)?.content; return c?.kind === 'sprite' ? c.sprite.texture : null; };
    expect(MAPS.map(([n]) => file(`CGPic${n}`)?.toLowerCase())).toEqual(['mp6misspic.tif', 'mp71misspic.tif']);
    const banks = pageUiTextures(new FsAssetSource(DISC), ['UICG'], null);
    expect(await banks.ready).toEqual([]);
    for (const [n] of MAPS) {
      const got = banks.textures(`mp${n}MissPic.tif`);
      expect(got, `mp${n}MissPic.tif`).not.toBeNull();
      expect(got!.width * got!.height, `mp${n}MissPic.tif`).toBeGreaterThan(0);
    }
  });

  it('each map binds ld_mp<n>_prog.tif in OM06 / LP71, resolved at 512 x 256 with nothing missing, under its own title', async () => {
    const source = new FsAssetSource(DISC);
    for (const [n, name] of MAPS) {
      const d = await loadingFromDisc(source, `RUN/MP${n}.ZDB`);
      expect(d.missing, `MP${n}`).toEqual([]);
      expect([d.binding?.picture, d.binding?.stem, d.binding?.title?.trim()]).toEqual([`ld_mp${n}_prog.tif`, n === 6 ? 'OM06' : 'LP71', name]);
      const pic = d.bitmaps.find(([b]) => b === `ld_mp${n}_prog.tif`)?.[1];
      expect(pic && [pic.width, pic.height], `MP${n}`).toEqual([512, 256]);
    }
  }, 60_000);
});
