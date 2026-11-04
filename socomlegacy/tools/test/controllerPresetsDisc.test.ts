import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { decodeUiSet, parseAnimSets, type UiOp } from '@s2u/scene';
import {
  CONTROLLER_CONFIG_NAMES, CONTROLLER_CONFIGS_READING, controllerConfigRecord, controllerConfigsOf, PRESET_PAGE_CONFIG,
} from '../../packages/viewer/src/controllerConfigs';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { readGlobalValves } from '../../packages/viewer/src/originalOptions';
import { VOICE_ROUND_TALK_BUTTON_READING } from '../../packages/viewer/src/voice/talkInput';
import { CONTROLLER_RDR_BUTTON } from '../../packages/viewer/src/gamepad';
import { discRoot } from '../dump-dialogs';

/**
 * OPT-14's dev-disc checks (issue #87; web research 344): the port's transcription of `controller.rdr`'s four
 * `ControllerConfigs` (`CONTROLLER_CONFIGS_READING`) against the disc's file, read with `parseRdr` as `FUN_002c5e70`
 * reads it (D:L166542-166598); research 197 §2's TeamCommand and SwapWeapon2 per preset (`talkInput.ts`) against the
 * same parse; CONTROLLER PRESETS' four `PressPreset<n>` (`RUN/UIZANIM.ZAR :: dlgControllerPresets.rdr`) against the page
 * -> config table; the presets' two valves' defaults (`global_valves.rdr`); and the four pictures decoded through the
 * front end's `uiop` bank. The disc is `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; without it every test skips.
 * Reading, pending review: nothing here is measured on the original running.
 */
const DISC = discRoot();

describe.skipIf(!DISC)(`CONTROLLER PRESETS on the disc${DISC ? '' : ' (no disc: skipped)'}`, () => {
  it('controller.rdr holds the four configs as transcribed, in its order, every mapping', () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/READERC.ZAR'))));
    const key = zar.find('controller.rdr');
    expect(key, 'RUN/READERC.ZAR :: controller.rdr').toBeTruthy();
    const configs = controllerConfigsOf(parseRdr(zar.data(key!)));
    expect(configs.map((c) => c.name)).toEqual([...CONTROLLER_CONFIG_NAMES]);
    for (const c of configs) expect(c.mappings, c.name).toEqual(CONTROLLER_CONFIGS_READING[c.name as keyof typeof CONTROLLER_CONFIGS_READING]);
    // Every control the file names is one the pad's map places (its sticks aside).
    const sticks = new Set(['LeftStickVert', 'LeftStickHoriz', 'RightStickVert', 'RightStickHoriz']);
    for (const c of configs) for (const m of c.mappings) if (!sticks.has(m.control)) expect(CONTROLLER_RDR_BUTTON[m.control], `${c.name} ${m.control}`).toBeDefined();
  });

  it('research 197 §2\'s talk buttons agree with the parse: TeamCommand and SwapWeapon2 per preset', () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/READERC.ZAR'))));
    for (const c of controllerConfigsOf(parseRdr(zar.data(zar.find('controller.rdr')!)))) {
      const r = controllerConfigRecord(c.name, c.mappings);
      const talk = VOICE_ROUND_TALK_BUTTON_READING[c.name as keyof typeof VOICE_ROUND_TALK_BUTTON_READING];
      const pad = (control: string | null) => (control === null ? null : CONTROLLER_RDR_BUTTON[control] ?? null);
      expect({ teamCommand: pad(r.buttons.TeamCommand), swapWeapon2: pad(r.buttons.SwapWeapon2) }, c.name).toEqual(talk);
    }
  });

  it('PressPreset<n> sets SelectedControllerConfig n after SetControllerConfig of the page\'s config', () => {
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    const set = sets.find((s) => s.name === 'dlgControllerPresets.rdr');
    expect(set).toBeTruthy();
    const programs = decodeUiSet(set!);
    for (const n of [1, 2, 3, 4] as const) {
      const ops: UiOp[] = programs.get(`PressPreset${n}`)!.sequences.flatMap((s) => s.ops);
      const config = ops.flatMap((o) => (o.op === 'ui' && o.command.fn === 'SetControllerConfig' ? [o.command.arg] : []));
      const valve = ops.flatMap((o) => (o.op === 'valve' && o.valve === 'SelectedControllerConfig' ? [o.operand] : []));
      expect([config, valve], `PressPreset${n}`).toEqual([[PRESET_PAGE_CONFIG[n]], [n]]);
    }
  });

  it('the two valves are PERSIST, SelectedControllerConfig 1 and ChosePresetOnce 0 by default (global_valves.rdr)', async () => {
    const rows = await readGlobalValves(new FsAssetSource(DISC!));
    expect(rows.filter((r) => r.name === 'SelectedControllerConfig' || r.name === 'ChosePresetOnce')).toEqual([
      { name: 'SelectedControllerConfig', value: 1, type: 'PERSIST' }, { name: 'ChosePresetOnce', value: 0, type: 'PERSIST' },
    ]);
    expect(rows.some((r) => r.name === 'CameFromNewGameButton')).toBe(false);   // research 344 R344.5
  });

  it('ContPic1-4 decode through the front end\'s uiop bank', async () => {
    const page = pageUiTextures(new FsAssetSource(DISC!), ['UIOP'], null, []);
    expect(await page.ready).toEqual([]);
    for (const n of [1, 2, 3, 4]) {
      const img = page.textures(`ContPic${n}.tif`);
      expect(img, `ContPic${n}.tif`).not.toBeNull();
      expect(img!.width * img!.height, `ContPic${n}.tif`).toBeGreaterThan(0);
      expect(img!.data.length).toBe(img!.width * img!.height * 4);
    }
  });
});
