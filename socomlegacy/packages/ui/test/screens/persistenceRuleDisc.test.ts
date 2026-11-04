import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import type { DialogDesign, DialogUiVar } from '../../src/dialog';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { SYSTEM_TUNERS, UIVAR_LONGEVITY, serializeUiVars, uiVarModule } from '../../src/uiVars';
import { VALVE_TYPE } from '../../src/valves';
import { DISC, HAVE_DISC, netLoginRig } from './netLoginRig';

/**
 * OPT-03 over the disc (a dev-disc test; research 229 §4; web research 302 §4): the UI variables the card's
 * `CUIVarManager` module holds are the longevity-3 ones (`CUIVarManager_Serialize` `FUN_00385670` D:L279389), and the
 * disc's dialogs are what make them so. `dlgNetLogin.rdr`'s ten TEXT objects bind `MPLOCALSOP1-5` and `MPTAUNTMSG1-5`
 * with a `UIVAR` spec of `LONGEVITY PERSISTENT` and a HudCLOC key 60757-60766 as `VALUE` (the spec's reader
 * `CUIVariableSpec` `FUN_00386ff0` D:L280288-280349, PERSISTENT 3 at D:L280328-280346); the options pages' sliders
 * bind the eight system tuners with `LONGEVITY PERSISTENT` too (`FUN_003724f0` adds the var at D:L269307 through
 * `CUIVarManager_Add`, which raises: D:L279438-279440). Read through the repository's readers (`@s2u/archive`'s ZAR,
 * `@s2u/ui`'s `loadDialog` by `dialogLookup`), and the page's own path (`netLoginRig`: `dlgNetLogin.rdr` opened as the
 * page opens it). The disc is `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither every test skips -- a skip,
 * not a pass. The reading level: nothing here is measured on the original running (OPT-19, H25).
 */

const lookup = HAVE_DISC
  ? dialogLookup(['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR'].map((p) => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))))))
  : null;

/** Every record's `UIVAR` spec in a dialog -- its controls and its objects -- by the widget's type. */
function uiVarSpecs(design: DialogDesign): { type: string; uivar: DialogUiVar }[] {
  return [...design.controls, ...design.objects].flatMap((r) => {
    const w = r.widget as { type: string; uivar?: DialogUiVar | null };
    return w.uivar ? [{ type: w.type, uivar: w.uivar }] : [];
  });
}

const TEN = [1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`).concat([1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`));
const HUDCLOC_KEYS = [60757, 60758, 60759, 60760, 60761, 60762, 60763, 60764, 60765, 60766];
/** The HudCLOC key a `_<id>_<name>_MSG` string names. */
const keyOf = (v: unknown): number => Number(/^_(\d+)_/.exec(String(v))?.[1]);

describe.skipIf(!HAVE_DISC)(`OPT-03: what the disc makes persistent${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('dlgNetLogin.rdr: MPLOCALSOP1-5 and MPTAUNTMSG1-5 are TEXT UIVARs of LONGEVITY PERSISTENT, each HudCLOC 60757-60766 (302 §4)', () => {
    expect(existsSync(join(DISC, 'RUN/UI/READERC.ZAR'))).toBe(true);
    const specs = uiVarSpecs(lookup!('dlgNetLogin.rdr')!).filter((s) => TEN.includes(s.uivar.name ?? ''));
    expect(specs.map((s) => s.uivar.name)).toEqual(TEN);
    expect(specs.map((s) => s.type)).toEqual(TEN.map(() => 'TEXT'));
    expect(specs.map((s) => s.uivar.longevity)).toEqual(TEN.map(() => UIVAR_LONGEVITY.PERSISTENT));
    expect(specs.map((s) => keyOf(s.uivar.value))).toEqual(HUDCLOC_KEYS);
  });

  it('the options pages\' sliders bind the eight system tuners at LONGEVITY PERSISTENT: a built slider makes its tuner persistent (R104.10 revised)', () => {
    const sliders = ['dlgOptions_Audio.rdr', 'dlgOptions_Video.rdr', 'dlgControllerSelection.rdr'].map((d) => ({
      dialog: d, specs: uiVarSpecs(lookup!(d)!).filter((s) => s.type === 'SLIDERBAR'),
    }));
    const names = sliders.flatMap((s) => s.specs.map((x) => x.uivar.name));
    expect(new Set(names)).toEqual(new Set(SYSTEM_TUNERS.map((t) => t.name)));
    expect(sliders.map((s) => s.specs.length)).toEqual([4, 1, 3]);
    for (const s of sliders) for (const x of s.specs) expect(x.uivar.longevity, `${s.dialog} ${x.uivar.name}`).toBe(UIVAR_LONGEVITY.PERSISTENT);
  });

  it('the page opens dlgNetLogin.rdr: the ten are longevity 3 and its card module holds exactly them, each the HudCLOC key', () => {
    const t = netLoginRig();
    t.run(1);
    for (const name of TEN) expect(t.uiVars.find(name)?.longevity, name).toBe(UIVAR_LONGEVITY.PERSISTENT);
    t.m.valves.set('SecurePassword', 1, VALVE_TYPE.PERSIST);
    const module = uiVarModule(serializeUiVars(t.uiVars, t.m.valves));
    expect(Object.keys(module)).toEqual(TEN);
    expect(Object.values(module).map((v) => (v.type === 'string' ? keyOf(v.value) : NaN))).toEqual(HUDCLOC_KEYS);
  }, 120_000);
});
