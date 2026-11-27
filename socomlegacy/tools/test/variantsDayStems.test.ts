// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDayVariant, DAY_STEMS, S1_INPUT_SHA256, skyColourOf, skySwapTexture } from '../variants/buildAbandonedDay';
import { RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER } from '../../packages/viewer/src/variants/ratsNestDay';

/**
 * DAY-RN1 B2 (product track: a tool, DAY.R1): the day builder, generalised per stem -- Abandoned (Day), MP5, as it was;
 * Rat's Nest (Day), MP8, beside it. With no disc: the stem table, the refusals, the sky-colour rule. The MP8 build on
 * the dev disc is `variantsRatsNestDay.test.ts`; MP5's is `variantsAbandonedDay.test.ts`, unchanged.
 */
const TMP = mkdtempSync(join(tmpdir(), 'day-stems-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('the day builder per stem (DAY-RN1 B2)', () => {
  it('holds MP5 with its pins unchanged and MP8 with the study package pinned file by file', () => {
    expect(Object.keys(DAY_STEMS)).toEqual(['MP5', 'MP8']);
    expect(DAY_STEMS.MP5.inputs).toBe(S1_INPUT_SHA256);
    expect(DAY_STEMS.MP5.skyTextures).toEqual(['sky01.tif']);
    expect(DAY_STEMS.MP5.skyColour).toBe('one');
    expect(DAY_STEMS.MP5.envVar).toBe('SOCOM1_MP5_DIR');
    expect(DAY_STEMS.MP8.inputs).toEqual({
      's1-MP8.world-verts.f32': 'edfd4283cf74bd611852d2193e24c50a1f6a1dd2411b41fd5bb43688241f42b9',
      's1-MP8.world-attrs.f32': '1f057e2f80d24c9e536091a0fdf683ba77891c9c4420947e11c85dc45cb369e8',
      's1-MP8.json': '2783541ecbe74818bab82af705060399b671eab1769f5fe4d160fc683a1d9541',
      'dumps/s1-MP8.render.json': '407ef03f84f29b06c7e4cc81d26dff8f1195cf5a54f10475c85cbbd56359532d',
      'dumps/s1-MP8.render.bin': 'e8f745e5c9c0067ccf3e9e61698dd730076b511477ae8112d86daacff013caa1',
    });
    // SOCOM II's MP8 draws its dome as world parts textured gen_cloudy_blue_sky.tif; SOCOM 1's is its `sky` prop alone
    expect(DAY_STEMS.MP8.skyTextures).toEqual(['gen_cloudy_blue_sky.tif']);
    expect(DAY_STEMS.MP8.skyColour).toBe('mode');
    expect(DAY_STEMS.MP8.envVar).toBe('SOCOM1_MP8_DIR');
    expect(DAY_STEMS.MP8.lightRayTexture).toBeNull();
  });

  it("the sky swap: MP8 draws another SOCOM II map's sky texture in its dome's place, from the one named choice; MP5 none", () => {
    // a browser adaptation's art choice (SOCOM II has no daytime Rat's Nest): the owner's pick, MP2's sky (MISSION OT.R158)
    expect(RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER).toEqual({ map: 'RUN/MP2.ZDB', texture: 'cuba1a_sky01.tif', as: 'gen_cloudy_blue_sky.tif' });
    expect(DAY_STEMS.MP8.skySwap).toBe(RATS_NEST_DAY_SKY_CHOICE_PLACEHOLDER);
    expect(DAY_STEMS.MP8.skySwap?.as).toBe(DAY_STEMS.MP8.skyTextures[0]);
    expect(DAY_STEMS.MP5.skySwap).toBeUndefined();
    expect('skySwap' in DAY_STEMS.MP5).toBe(false);
  });

  it('the sky swap takes the texture as the map decoded it, at its native size, and refuses a missing one by name', () => {
    const rgba = { width: 4, height: 2, data: new Uint8ClampedArray(32).map((_, i) => i) };
    const choice = { map: 'RUN/MP2.ZDB', texture: 'cuba1a_sky01.tif', as: 'gen_cloudy_blue_sky.tif' };
    expect(skySwapTexture({ 'cuba1a_sky01.tif': rgba }, choice, 'buildRatsNestDay')).toBe(rgba);
    expect(() => skySwapTexture({ 'other.tif': rgba }, choice, 'buildRatsNestDay'))
      .toThrow(/buildRatsNestDay: RUN\/MP2\.ZDB holds no texture cuba1a_sky01\.tif/);
    expect(() => skySwapTexture({ 'cuba1a_sky01.tif': { ...rgba, data: new Uint8ClampedArray(31) } }, choice, 'buildRatsNestDay'))
      .toThrow(/31 bytes, not 32/);
  });

  it('refuses a changed MP8 input before any map load, and a stem off the table', async () => {
    const s1Dir = join(TMP, 's1');
    for (const f of Object.keys(DAY_STEMS.MP8.inputs)) {
      mkdirSync(dirname(join(s1Dir, f)), { recursive: true });
      writeFileSync(join(s1Dir, f), 'not the study\'s file');
    }
    const disc = join(TMP, 'no-disc-here');
    await expect(buildDayVariant('MP8', { disc, s1Dir, out: join(TMP, 'out') }))
      .rejects.toThrow(/s1-MP8\.world-verts\.f32 has sha256 [0-9a-f]{64}, pinned edfd4283/);
    await expect(buildDayVariant('MP2' as 'MP5', { disc, s1Dir, out: join(TMP, 'out') })).rejects.toThrow(/no day builder for MP2/);
  });

  it("the sky colour: 'one' refuses a second colour; 'mode' takes the colour on most vertices, a tie to the first", () => {
    const parts = (...cs: number[][]) => cs.map((rgb) => new Float32Array([...rgb, 1]));
    expect(skyColourOf(parts([1, 1, 1], [1, 1, 1]), 'one')).toEqual({ colour: [1, 1, 1], vertices: 2, share: 1 });
    expect(() => skyColourOf(parts([1, 1, 1], [0.5, 0.5, 0.5]), 'one')).toThrow(/not one colour/);
    expect(skyColourOf(parts([0.25, 0.25, 0.25], [1, 1, 1], [1, 1, 1]), 'mode')).toEqual({ colour: [1, 1, 1], vertices: 3, share: 2 / 3 });
    expect(skyColourOf(parts([0.25, 0.25, 0.25], [1, 1, 1]), 'mode').colour).toEqual([0.25, 0.25, 0.25]);
    // within one PS2 byte counts as the same colour (the study's test), the first seen standing for it
    expect(skyColourOf(parts([1, 1, 1], [1 - 0.5 / 128, 1, 1], [0.25, 0.25, 0.25]), 'mode')).toEqual({ colour: [1, 1, 1], vertices: 3, share: 2 / 3 });
    expect(() => skyColourOf([], 'mode')).toThrow(/no vertex/);
  });
});
