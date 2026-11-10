import { describe, expect, it } from 'vitest';
import { BOT_GOLD, botDisplayName } from '../src/botPresentation';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DoubleSide, LinearFilter, NearestFilter, Mesh, Vector2, type MeshBasicMaterial, type Scene } from 'three';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { parseTextureRecord } from '@s2u/gs';
import { readReticle } from '../src/hudBitmaps';
import { UI_SAMPLING_DEFAULTS } from '../src/experimentalUiSampling';
import {
  ARM_TINT, BINOCULAR_BITMAPS, BINOCULAR_UV, binocularsLayout, CONSOLE_RETICLE, Reticle, RETICLE_SETS, reticleLayout, reticleTint, reticleType,
  reticleShown, pageSpawned, scopeLayout, nightLayout, type ReticleMode, reticleShape, SHOTGUN_CORNER_READING, LAUNCHER_CORNER_SCALE, LAUNCHER_SIGHT_READING,
  C4_RETICLE_READING, GRENADE_METER_BITMAP_READING, GRENADE_METER_CENTRE_READING, GRENADE_METER_COLOUR_READING, handReticleType,
  meterLayout, meterPower, meterTint, type MeterQuad,
  reticleTargetState, targetLayout, targetName, TARGET_BAR,
  ESCORT_GAME_TYPE, Perception, PERCEPTION, perceptionLook, perceptionMagnification, PERCEPTION_QUERY_PLACEHOLDER,
  PERCEPTION_SEEN_RATE_PLACEHOLDER, PERCEPTION_SIGHT_READING, PERCEPTION_VETO_PLACEHOLDER, type PerceptionLook,
  PERCEPTION_RECORD_LIFE_READING,
  TARGET_NAME_LOOK_READING, TARGET_NAME_SCALE, TARGET_RANGE, TEAMMATE_NAMES_OPTION_READING, type ReticleTarget,
  EMPTY_RETICLE_COLOUR_READING, CLIMB_GREY_CLIPS, reticleClimbing, reticleGameColour,
} from '../src/reticle';
import { ENEMY_COUNT_FILTER_READING, enemyCount, escorteeWord, SEAT_WORD, seatWord } from '../src/reticle';
import { TRAVERSAL_CLIP } from '../src/traversal';
import { taggedName } from '../src/hud';
import { FONT_TEXT_01, layoutText } from '../src/hudFont';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * The reticle's place and size (web sprint 2, W2.4), against the console frame at spawn
 * (`scripts/parity/refs/console_spawn_slot8.png`, 640x448): the yellow-green cross's pixels span x 288-352 and
 * y 192-256 (65 x 65, the faint ends included), its centre (320.5, 224.5) -- the frame's centre within a pixel.
 */

const PS2 = { width: 640, height: 448 };
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1;
/** A bitmap of `w` x `h` texels, every texel inked. */
const rgbaOf = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });

describe('reticleLayout', () => {
  it('at 640x448 with the aim point at the centre, the quads cover the console frame\'s cross within a pixel', () => {
    const { rect, scale } = reticleLayout(PS2, [0.5, 0.5], 0);
    expect(scale).toBe(1);
    const m = CONSOLE_RETICLE.rect;
    expect(m).toEqual({ x: 288, y: 192, width: 65, height: 65 });
    expect(near(rect.x, m.x) && near(rect.y, m.y) && near(rect.width, m.width) && near(rect.height, m.height),
      JSON.stringify(rect)).toBe(true);
    expect(near(rect.x + rect.width / 2, CONSOLE_RETICLE.centre[0])).toBe(true);
    expect(near(rect.y + rect.height / 2, CONSOLE_RETICLE.centre[1])).toBe(true);
  });

  it('the fixed part is ret_rifle_01 at its own 64 pixels; the four arms are ret_rifle_02 turned a quarter each', () => {
    const { quads } = reticleLayout(PS2, [0.5, 0.5], 0);
    const fixed = quads.filter((q) => q.part === 'fixed');
    const arms = quads.filter((q) => q.part === 'floating');
    expect(fixed).toEqual([{ part: 'fixed', x: 320, y: 224, width: 64, height: 64, turns: 0 }]);
    expect(arms.map((q) => q.turns)).toEqual([0, 1, 2, 3]);
    for (const a of arms) expect([a.width, a.height]).toEqual([32, 32]);
    // The arm's core (texel column 30) lies on the axis through the aim point; its outer end 32 pixels out.
    const [down, left, up, right] = arms;
    expect([down!.x, down!.y]).toEqual([320 - 14.5, 224 + 16]);
    expect([left!.x, left!.y]).toEqual([320 - 16, 224 - 14.5]);
    expect([up!.x, up!.y]).toEqual([320 + 14.5, 224 - 16]);
    expect([right!.x, right!.y]).toEqual([320 + 16, 224 + 14.5]);
  });

  it('follows the aim point; the HUD size pushes each arm out by its own pixels; the knock moves the whole reticle', () => {
    const moved = reticleLayout(PS2, [0.25, 0.75], 0).rect;
    expect([moved.x, moved.y]).toEqual([160 - 32, 336 - 32]);
    // FUN_00215250: each arm's quad starts `size` pixels from the centre, so the outer ends sit at 32 + size.
    const wide = reticleLayout(PS2, [0.5, 0.5], 16).rect;
    expect(wide).toEqual({ x: 320 - 48, y: 224 - 48, width: 96, height: 96 });
    // TargetMax 26, drawn full in first person: the outer ends 58 out.
    expect(reticleLayout(PS2, [0.5, 0.5], 26).rect.width).toBe(116);
    expect(reticleLayout(PS2, [0.5, 0.5], -3).rect.width).toBe(64);       // never inside the rest
    // The knock (FUN_00216770: centre + kit+0x20/+0x24): 12 pixels up moves ring and arms alike.
    const { centre, quads } = reticleLayout(PS2, [0.5, 0.5], 0, [0, -12]);
    expect(centre).toEqual([320, 212]);
    expect(quads.find((q) => q.part === 'fixed')).toMatchObject({ x: 320, y: 212 });
  });

  it('lays another set by its own bitmaps: the sidearm ring of 32 pixels and arms of 16 (research 84 section 9)', () => {
    const { quads, rect } = reticleLayout(PS2, [0.5, 0.5], 5, [0, 0], { fixed: 32, arm: 16 });
    expect(quads[0]).toMatchObject({ part: 'fixed', width: 32, height: 32 });
    const down = quads[1]!;
    // The quad 16 across, its core (column 14.5) on the centre line: x 320 + 1.5 - 8; its outer end 16 + 5 out.
    expect([down.x, down.y, down.width]).toEqual([320 - 6.5, 224 + 5 + 8, 16]);
    expect(rect.height).toBe(2 * 21);
  });

  it('the rest in third person: TargetMin 1 halved is the console frame within its pixel', () => {
    const { rect } = reticleLayout(PS2, [0.5, 0.5], 0.5);
    const m = CONSOLE_RETICLE.rect;
    expect(near(rect.x, m.x) && near(rect.width, m.width)).toBe(true);
  });

  it('keeps the console\'s proportion on any frame: the PS2 pixel scaled by the frame height / 448', () => {
    const { rect, scale } = reticleLayout({ width: 1920, height: 1080 }, [0.5, 0.5], 0);
    expect(scale).toBeCloseTo(1080 / 448, 12);
    expect(rect.width).toBeCloseTo(64 * scale, 9);
    expect(rect.x + rect.width / 2).toBeCloseTo(960, 9);
    expect(rect.y + rect.height / 2).toBeCloseTo(540, 9);
  });
});

/**
 * NU-3a C1 (research 321 section 2.2, D1): set 2 -- the shotguns -- lays the floating bitmap at the four diagonal corners
 * of the square of half side `size` (`FUN_00215250` D:L69799-69823), each mirrored by `SHOTGUN_CORNER_READING`; the ring
 * at its own size on the centre as set 1's. Was, before NU-3a: every set laid as the cross.
 */
describe('NU-3a C1: the shotguns\' corners (set 2)', () => {
  it('reticleShape: set 2 the corners, 3 the launcher\'s; 0, 1 (and the others laid with arms) the cross', () => {
    expect([0, 1, 2, 3, 9].map(reticleShape)).toEqual(['cross', 'cross', 'corners', 'launcher', 'cross']);
  });

  it('the corners go out on the diagonals with the size, the knock moving them all; no corner on a centre line', () => {
    const sizes = { fixed: 64, arm: 32, fixedH: 64, armH: 32 };
    for (const size of [0, 12.5, 25, 52]) {
      const { quads } = reticleLayout(PS2, [0.5, 0.5], size, [3, -12], sizes, 2);
      const corners = quads.filter((q) => q.part === 'floating');
      const cx = 323, cy = 212;
      expect(corners.map((q) => [q.x, q.y])).toEqual([
        [cx + size + 16, cy - size - 16], [cx - size - 16, cy - size - 16], [cx - size - 16, cy + size + 16], [cx + size + 16, cy + size + 16],
      ]);
      expect(quads.find((q) => q.part === 'fixed')).toEqual({ part: 'fixed', x: cx, y: cy, width: 64, height: 64, turns: 0 });
    }
    // A served bitmap not square: W across, H down, read at the draw.
    const tall = reticleLayout(PS2, [0.5, 0.5], 10, [0, 0], { fixed: 64, arm: 16, armH: 24 }, 2).quads[2]!;   // the upper left
    expect([tall.x, tall.y, tall.width, tall.height]).toEqual([320 - 10 - 8, 224 - 10 - 12, 16, 24]);
  });

  it('drawn by Reticle under set 2: the corners mirrored as SHOTGUN_CORNER_READING reads (the upper right across and down)', () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: null,
      sets: { 'ret_shotgun_01.tif': rgbaOf(64, 64), 'ret_shotgun_02.tif': rgbaOf(32, 32) },
    });
    r.setVisible(true);
    expect(r.setSet(2)).toBe(true);
    r.setSize(25);
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (s) => { scene = s; } });
    const meshes: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
    const arms = meshes.filter((m) => m.renderOrder === 1);
    expect(arms.map((m) => [m.position.x, m.position.y, Math.sign(m.scale.x), Math.sign(m.scale.y), m.rotation.z])).toEqual([
      [361, 183, -1, -1, 0], [279, 183, 1, -1, 0], [279, 265, 1, 1, 0], [361, 265, -1, 1, 0],
    ]);
    expect(SHOTGUN_CORNER_READING).toEqual([[true, true], [false, true], [false, false], [true, false]]);
    expect(r.state().rect).toEqual({ x: 263, y: 167, width: 114, height: 114 });
  });
});

/**
 * NU-3a C2 (research 321 section 2.3, D2 and D7): set 3 -- a launcher, or an M203 rifle or the F2000 in a round mode --
 * hides the ring (`ChangeReticule` D:L69604) and shows the fixed bitmap as four quads of 0.7 its size, each with a corner
 * on the frame's centre (320, 224) and never moved by the knock (D:L69595-69652), coloured with the arms (D:L70278-70283)
 * and sampled at 0.01-0.99; the corners at 0.7 of the floating bitmap (D:L69800-69822); the pip faded after
 * `FUN_00215250`'s own step (D:L70435-70445). Was, before NU-3a: the cross of `ret_rocket_01/02` at full size.
 */
describe('NU-3a C2: the launchers\' sight (set 3)', () => {
  const launcher = () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: rgbaOf(16, 16),
      sets: { 'ret_rocket_01.tif': rgbaOf(64, 64), 'ret_rocket_02.tif': rgbaOf(64, 64), 'ret_rifle_01.tif': rgbaOf(64, 64), 'ret_rifle_02.tif': rgbaOf(32, 32) },
    });
    r.setVisible(true);
    const render = (): Mesh[] => {
      let scene: Scene | null = null;
      r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (s) => { scene = s; } });
      const out: Mesh[] = [];
      (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) out.push(o); });
      return out;
    };
    return { r, render };
  };

  it('the layout: no ring; four sight quads of 0.7 x 64 about (320, 224), turned a quarter and mirrored (LAUNCHER_SIGHT_READING)', () => {
    const { quads } = reticleLayout(PS2, [0.5, 0.5], 4, [0, -20], { fixed: 64, arm: 64 }, 3);
    expect(quads.filter((q) => q.part === 'fixed')).toEqual([]);
    const sight = quads.filter((q) => q.part === 'sight');
    const h = 0.7 * 64 / 2;
    expect(sight.map((q) => [q.x, q.y, q.width, q.height, q.turns, !!q.flipX, !!q.flipY])).toEqual([
      [320 - h, 224 - h, 44.8, 44.8, 1, false, false], [320 + h, 224 - h, 44.8, 44.8, 1, false, true],
      [320 - h, 224 + h, 44.8, 44.8, 1, true, false], [320 + h, 224 + h, 44.8, 44.8, 1, true, true],
    ]);
    expect(LAUNCHER_SIGHT_READING).toEqual([[false, false], [false, true], [true, false], [true, true]]);
    expect(LAUNCHER_CORNER_SCALE).toBe(0.7);
    // The corners at 0.7 of the floating bitmap, on the knock's centre (320, 204), `size` 4 out on the diagonals.
    const arms = quads.filter((q) => q.part === 'floating');
    expect(arms.map((q) => [q.x, q.y, q.width])).toEqual([[324 + h, 200 - h, 44.8], [316 - h, 200 - h, 44.8], [316 - h, 208 + h, 44.8], [324 + h, 208 + h, 44.8]]);
    // The sight's place is the frame's centre on any frame (a wide one too), not the aim point's.
    const wide = reticleLayout({ width: 1920, height: 1080 }, [0.4, 0.6], 4, [10, 10], { fixed: 64, arm: 64 }, 3).quads.filter((q) => q.part === 'sight');
    const s = 1080 / 448;
    expect(wide[0]!.x + (0.7 * 64 * s) / 2).toBeCloseTo(960, 9);
    expect(wide[0]!.y + (0.7 * 64 * s) / 2).toBeCloseTo(540, 9);
  });

  it('drawn by Reticle: the sight\'s four meshes, the arms\' tint (the arming grey too), the 0.01-0.99 window; the ring hidden', () => {
    const { r, render } = launcher();
    expect(r.setSet(3)).toBe(true);
    r.setSize(6, [0, -12]);
    const meshes = render();
    const sight = meshes.filter((m) => m.userData.sight === true);
    expect(sight).toHaveLength(4);
    expect(sight.map((m) => [Math.round(m.position.x * 10) / 10, Math.round(m.position.y * 10) / 10, Math.sign(m.scale.x), Math.sign(m.scale.y), m.rotation.z]))
      .toEqual([[297.6, 201.6, 1, 1, Math.PI / 2], [342.4, 201.6, 1, -1, Math.PI / 2], [297.6, 246.4, -1, 1, Math.PI / 2], [342.4, 246.4, -1, -1, Math.PI / 2]]);
    const material = sight[0]!.material as MeshBasicMaterial;
    expect(material.color.toArray().map((c) => Math.round(c * 1e6) / 1e6)).toEqual(reticleTint('rest').map((c) => Math.round(c * 1e6) / 1e6));
    expect([material.map!.offset.x, material.map!.offset.y, material.map!.repeat.x, material.map!.repeat.y].map((v) => Math.round(v * 100) / 100)).toEqual([0.01, 0.01, 0.98, 0.98]);
    expect(material.opacity).toBe(1);                                     // PS2 alpha 128 (D:L69606)
    r.setColour('range');
    expect(material.color.toArray().map((c) => Math.round(c * 1e6) / 1e6)).toEqual(reticleTint('range').map((c) => Math.round(c * 1e6) / 1e6));
    // Five textured quads besides the sight: none is the ring -- four corners only (and no pip).
    const others = meshes.filter((m) => m.userData.sight !== true);
    expect(others).toHaveLength(4);
    expect(others.every((m) => m.renderOrder === 1)).toBe(true);
    // Back to the rifle's set: no sight, the ring again.
    expect(r.setSet(1)).toBe(true);
    const back = render();
    expect(back.filter((m) => m.userData.sight === true)).toEqual([]);
    expect(back).toHaveLength(5);
  });

  it('the pip under set 3: never rises from rest; a shown one held at its alpha (at most 96) while blocked, 64 a frame down once clear', () => {
    const { r } = launcher();
    expect(r.setSet(3)).toBe(true);
    for (let i = 0; i < 6; i++) r.setPip([200, 0], false);
    expect(r.state().pip.alpha).toBe(0);                                  // +32 in FUN_00215250, -32 after (D:L70435-70445)
    expect(r.setSet(1)).toBe(true);
    for (let i = 0; i < 6; i++) r.setPip([200, 0], false);
    expect(r.state().pip.alpha).toBe(128);
    expect(r.setSet(3)).toBe(true);
    const held: number[] = [];
    for (let i = 0; i < 3; i++) { r.setPip([200, 0], false); held.push(r.state().pip.alpha); }
    expect(held).toEqual([96, 96, 96]);                                   // not under 128: no rise; then -32; then +32 -32
    const clear: number[] = [];
    for (let i = 0; i < 3; i++) { r.setPip(null, false); clear.push(r.state().pip.alpha); }
    expect(clear).toEqual([32, 0, 0]);
  });
});

describe('the reticle set, colour and scope (research 84)', () => {
  it('picks the set by the view, then the weapon ID (FUN_005be300)', () => {
    expect(reticleType(62, 0, 1)).toBe(1);        // the M4A1 SD: a rifle
    expect(reticleType(54, 1, 1.01)).toBe(1);     // first person is still the rifle's
    expect(reticleType(62, 5, 3)).toBe(5);        // scoped: the scope
    expect(reticleType(62, 4, 9)).toBe(7);        // the 9x view
    expect(reticleType(5, 0, 1)).toBe(0);         // the M9: the sidearm's
    expect(reticleType(84, 0, 1)).toBe(2);        // the 870: the shotgun's
    expect(reticleType(101, 0, 1)).toBe(1);       // the M82A1A unscoped: a rifle's
    expect(reticleType(121, 0, 1)).toBe(4);       // the M67: the grenade's
    expect(reticleType(11, 0, 1)).toBe(9);        // the designator
    expect(reticleType(0x98, 0, 1)).toBe(-1);
    expect(RETICLE_SETS[1]).toEqual({ fixed: 'ret_rifle_01.tif', floating: 'ret_rifle_02.tif' });
  });

  it('colours the arms as FUN_00215c10 does, the rest one the measured tint', () => {
    expect(reticleTint('rest')).toEqual(ARM_TINT);
    const [r, g, b] = reticleTint('friendly');
    expect(g).toBeCloseTo(ARM_TINT[1], 9);
    expect(r).toBeLessThan(0.15);
    expect(b).toBeGreaterThan(ARM_TINT[2]);
    expect(reticleTint('hostile')[1]).toBeLessThan(0.15);
  });

  it('lays the scope as four 320-pixel quads around the frame centre, mirrored to meet there', () => {
    const { quads, bars } = scopeLayout(PS2);
    expect(quads.map((q) => [q.x, q.y, q.size])).toEqual([[160, 64, 320], [480, 64, 320], [160, 384, 320], [480, 384, 320]]);
    expect(quads.map((q) => [q.flipX, q.flipY])).toEqual([[false, true], [true, true], [false, false], [true, false]]);
    expect(bars).toEqual([]);
    const wide = scopeLayout({ width: 1920, height: 1080 });
    const s = 1080 / 448;
    expect(wide.quads[0]!.size).toBeCloseTo(320 * s, 9);
    expect(wide.bars[0]!.width).toBeCloseTo(960 - 320 * s, 9);
  });

  it('lays the night goggles as four mirrored 320x224 quads over the whole frame (Init 70940-70975)', () => {
    const { quads, bars } = nightLayout(PS2);
    expect(quads.map((q) => [q.x, q.y, q.width, q.height])).toEqual([[160, 112, 320, 224], [480, 112, 320, 224], [160, 336, 320, 224], [480, 336, 320, 224]]);
    expect(bars).toEqual([]);
  });
});

const rgba = (w: number, h: number, alpha = 255) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(alpha) });
/** The HUD pass drawn on a `width` x `height` buffer: the meshes it would draw, by the scene it is handed. */
const drawn = (width: number, height: number, mode: ReticleMode, night = false): Mesh[] => {
  const r = new Reticle();
  r.setBitmaps({
    fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
    sets: {
      'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128, 0), 'nvg_part.tif': rgba(256, 256),
      'ret_binocs.tif': rgba(128, 128), 'ret_binocs2.tif': rgba(128, 128, 40),
    },
  });
  r.setVisible(true);
  r.setMode(mode);
  r.setNight(night);
  let scene: Scene | null = null;
  r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(width, height), render: (s) => { scene = s; } });
  const out: Mesh[] = [];
  (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) out.push(o); });
  return out;
};

/**
 * LATER 164 (research 321 s2.5): set 0 laid in view state 2 -- a THERMAL turret's -- shows the scope's tube `ret_scope_01`
 * (`hud+0x11f0..`) beside the cross (`ChangeReticule` D:L69663-69670); the soft ring `ret_scope_02` stays hidden
 * (D:L69576-69594). The tube is drawn after the ring and before the arms (`FUN_002151f0` D:L69697-69702: the lists
 * `+0x1c`, `+0x34`, `+0x4c`).
 */
describe('LATER 164: the scope\'s tube over set 0\'s cross in view state 2', () => {
  const tubeDrawn = (width: number, height: number, tube: boolean): Mesh[] => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null,
      sets: {
        'ret_sidearm_01.tif': rgba(64, 64), 'ret_sidearm_02.tif': rgba(32, 32),
        'ret_scope_01.tif': rgba(128, 128), 'ret_scope_02.tif': rgba(128, 128, 0),
      },
    });
    r.setVisible(true);
    expect(r.setSet(0)).toBe(true);
    r.setMode('reticle');
    r.setTube(tube);
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(width, height), render: (sc) => { scene = sc; } });
    expect(r.state().tube).toBe(tube);
    const out: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) out.push(o); });
    return out;
  };
  const tubes = (meshes: Mesh[]) => meshes.filter((m) => m.userData.bitmap === 'ret_scope_01.tif');

  it('the tube\'s four quads with the ring and the arms; no ret_scope_02; none without it (RED before: no setTube)', () => {
    const on = tubeDrawn(640, 448, true), off = tubeDrawn(640, 448, false);
    expect(tubes(on)).toHaveLength(4);
    expect(on.filter((m) => m.userData.bitmap === 'ret_scope_02.tif')).toEqual([]);
    const cross = (meshes: Mesh[]) => meshes.filter((m) => m.userData.bitmap === undefined && (m.material as MeshBasicMaterial).map !== null);
    expect(cross(on).length).toBe(cross(off).length);                 // the ring and the arms as without it
    expect(cross(on).length).toBeGreaterThan(0);
    expect(tubes(off)).toEqual([]);
    // Laid as the scope's (`scopeLayout`): 320 PS2 pixels a side about the frame's centre.
    expect(tubes(on).map((m) => [m.position.x, m.position.y, Math.abs(m.scale.x)]).sort()).toEqual(
      [[160, 64, 320], [160, 384, 320], [480, 64, 320], [480, 384, 320]].sort());
  });

  it('drawn after the ring (0) and before the arms (1): renderOrder 0.5; the scope\'s black beside it on a wide frame', () => {
    const on = tubeDrawn(1920, 1080, true);
    for (const m of tubes(on)) expect(m.renderOrder).toBe(0.5);
    expect(on.filter((m) => (m.material as MeshBasicMaterial).map === null && m.userData.bar === undefined)).toHaveLength(2);
    expect(tubeDrawn(1920, 1080, false).filter((m) => (m.material as MeshBasicMaterial).map === null && m.userData.bar === undefined)).toEqual([]);
  });
});

describe('the scope drawn on a wide frame (the owner, 2026-09-29: the world showed beside the scope at 16:9)', () => {
  it('samples both scope layers inside the recorded UV window with their authored bilinear filters', () => {
    const meshes = drawn(640, 448, 'scope');
    expect(meshes).toHaveLength(8);
    for (const mesh of meshes) {
      const map = (mesh.material as MeshBasicMaterial).map!;
      expect([map.offset.x, map.offset.y, map.repeat.x, map.repeat.y]).toEqual([0.01, 0.01, 0.98, 0.98]);
      expect([map.minFilter, map.magFilter, map.generateMipmaps]).toEqual([LinearFilter, LinearFilter, false]);
    }
  });

  it('fills the sides beyond the scope with its black, drawn from both faces (the HUD camera looks with y down)', () => {
    const meshes = drawn(1920, 1080, 'scope');
    const s = 1080 / 448, side = 960 - 320 * s;
    const bars = meshes.filter((m) => (m.material as MeshBasicMaterial).map === null);
    expect(bars.map((m) => [m.position.x, m.scale.x, m.scale.y])).toEqual([[side / 2, side, 1080], [1920 - side / 2, side, 1080]]);
    // The y-down orthographic camera turns every quad's winding: a one-sided material is culled, and the bars were --
    // the world showed through them. Every quad the pass draws is two-sided.
    for (const m of meshes) expect((m.material as MeshBasicMaterial).side, m.name).toBe(DoubleSide);
    expect(bars.every((m) => (m.material as MeshBasicMaterial).color.getHex() === 0x000000)).toBe(true);
    // The scope's quads and the bars together span the frame: no column of the world left between them.
    const quads = meshes.filter((m) => (m.material as MeshBasicMaterial).map !== null);
    const spans = [...bars, ...quads].map((m) => [m.position.x - Math.abs(m.scale.x) / 2, m.position.x + Math.abs(m.scale.x) / 2]).sort((a, b) => a[0]! - b[0]!);
    let reach = 0;
    for (const [a, b] of spans) { expect(a!).toBeLessThanOrEqual(reach + 1e-6); reach = Math.max(reach, b!); }
    expect(reach).toBeGreaterThanOrEqual(1920 - 1e-6);
  });

  it('keeps the PS2 frame as it was: no bars at 640x448; a phone held upright neither', () => {
    expect(drawn(640, 448, 'scope').filter((m) => (m.material as MeshBasicMaterial).map === null)).toEqual([]);
    expect(drawn(1080, 1920, 'scope').filter((m) => (m.material as MeshBasicMaterial).map === null)).toEqual([]);
  });

  it('fills the night goggles\' sides the same way', () => {
    const bars = drawn(1920, 1080, 'reticle', true).filter((m) => (m.material as MeshBasicMaterial).map === null);
    expect(bars).toHaveLength(2);
    for (const m of bars) expect((m.material as MeshBasicMaterial).side).toBe(DoubleSide);
  });
});

const scopeDisc = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : '');
const scopeRun = scopeDisc ? resolve(scopeDisc, 'RUN') : '';
const scopeMaps = scopeRun && existsSync(scopeRun) ? readdirSync(scopeRun).filter((n) => /^MP\d+\.ZDB$/i.test(n)).sort() : [];
describe.skipIf(scopeMaps.length === 0)('SCUV-1: scope sampling over every multiplayer map on the dev disc (skipped without SOCOM_DISC)', () => {
  it('reads both layers\' bilinear bind packets and preserves the decoded aiming stroke, including after experiments', () => {
    expect(scopeMaps).toHaveLength(22);
    for (const name of scopeMaps) {
      const bytes = readFileSync(resolve(scopeRun, name)), toc = parseZdb(bytes);
      const txr = Zar.parse(zdbMember(bytes, toc, 'HUD2_TXR.ZED'));
      const read = readReticle(bytes, toc);
      expect(read.diagnostics, name).toEqual([]);
      const r = new Reticle();
      r.setBitmaps(read.bitmaps);
      r.setVisible(true);
      r.setMode('scope');
      const render = (): Mesh[] => {
        const meshes: Mesh[] = [];
        r.render({ autoClear: true, getDrawingBufferSize: (v) => v.set(640, 448), render: (s) => {
          s.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
        } });
        return meshes;
      };
      const meshes = render();
      for (const bitmap of ['ret_scope_01.tif', 'ret_scope_02.tif']) {
        const key = txr.find('textures')!.children.find((k) => k.name.toLowerCase() === bitmap)!;
        const record = parseTextureRecord(bitmap, txr.data(txr.child(key, 'texdat')!));
        expect([record.bilinear, record.gs?.bilinear, record.gs?.mipmaps], `${name}/${bitmap}`).toEqual([true, true, false]);
        expect([record.width, record.height]).toEqual([128, 128]);
        const quads = meshes.filter((m) => m.userData.bitmap === bitmap);
        expect(quads).toHaveLength(4);
        const map = (quads[0]!.material as MeshBasicMaterial).map!;
        expect(map.image).toMatchObject(read.bitmaps!.sets![bitmap]!);
        expect([map.minFilter, map.magFilter]).toEqual([LinearFilter, LinearFilter]);
        expect(map.offset.x + map.repeat.x).toBeCloseTo(0.99);
      }
      // The inner aiming stroke survives the inset: columns 126/127 and rows 0/1 meet at the mirrored corner.
      const bitmap = read.bitmaps!.sets!['ret_scope_01.tif']!;
      const pixel = (x: number, y: number) => Array.from(bitmap.data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
      expect(pixel(126, 30), name).toEqual([79, 78, 77, 187]);
      expect(pixel(127, 30), name).toEqual(pixel(126, 30));
      expect(pixel(100, 0), name).toEqual(pixel(126, 30));
      expect(pixel(100, 1), name).toEqual(pixel(126, 30));
      expect(pixel(125, 30), name).toEqual([0, 0, 0, 0]);
      expect(pixel(100, 2), name).toEqual([0, 0, 0, 0]);
      const map = (meshes[0]!.material as MeshBasicMaterial).map!;
      // Linear sampling's x = u * width - 0.5 lies between the two inked columns, never beyond the stroke.
      const x = (map.offset.x + map.repeat.x) * bitmap.width - 0.5;
      expect(Math.floor(x)).toBe(126);
      expect(Math.ceil(x)).toBe(127);
      const y = map.offset.y * bitmap.height - 0.5;
      expect([Math.floor(y), Math.ceil(y)]).toEqual([0, 1]);
      r.setExperimentalSampling({ ...UI_SAMPLING_DEFAULTS, enabled: true, mode: 'nearest' });
      expect((render()[0]!.material as MeshBasicMaterial).map!.magFilter).toBe(NearestFilter);
      r.setExperimentalSampling(UI_SAMPLING_DEFAULTS);
      for (const mesh of render()) {
        const restored = (mesh.material as MeshBasicMaterial).map!;
        expect([restored.minFilter, restored.magFilter]).toEqual([LinearFilter, LinearFilter]);
        expect([restored.offset.x, restored.offset.y, restored.repeat.x, restored.repeat.y]).toEqual([0.01, 0.01, 0.98, 0.98]);
      }
      r.setMode('reticle');
      for (const mesh of render()) {
        const unscoped = (mesh.material as MeshBasicMaterial).map;
        if (unscoped) expect([unscoped.minFilter, unscoped.magFilter]).toEqual([NearestFilter, NearestFilter]);
      }
      r.setBitmaps(null);
    }
  }, 30000);
});

describe('the binoculars (ChangeReticule type 7, decomp 69510-69572)', () => {
  it('lays ret_binocs then ret_binocs2 as (0, 0)-(320, 448) as stored and (319, 0)-(640, 448) mirrored, sampled 0.01-0.97 x 0.01-0.99', () => {
    const { quads, bars } = binocularsLayout(PS2);
    expect(BINOCULAR_BITMAPS).toEqual(['ret_binocs.tif', 'ret_binocs2.tif']);
    expect(RETICLE_SETS[7]).toEqual({ fixed: 'ret_binocs.tif', floating: 'ret_binocs2.tif' });
    const edges = quads.map((q) => [q.bitmap, q.x - q.width / 2, q.y - q.height / 2, q.x + q.width / 2, q.y + q.height / 2, q.flipX]);
    expect(edges).toEqual([
      ['ret_binocs.tif', 0, 0, 320, 448, false], ['ret_binocs.tif', 319, 0, 640, 448, true],
      ['ret_binocs2.tif', 0, 0, 320, 448, false], ['ret_binocs2.tif', 319, 0, 640, 448, true],
    ]);
    expect(BINOCULAR_UV).toEqual({ u0: 0.01, u1: 0.97, v0: 0.01, v1: 0.99 });   // 0x3c23d70a, 0x3f7851ec, 0x3f7d70a4
    expect(bars).toEqual([]);
    // Modern 16:9: the mask keeps the 640x448 frame's shape at the frame's height, black beside it as the scope's.
    const wide = binocularsLayout({ width: 1920, height: 1080 });
    const s = 1080 / 448, side = 960 - 320 * s;
    expect(wide.quads[0]!.x - wide.quads[0]!.width / 2).toBeCloseTo(side, 9);
    expect(wide.quads[1]!.x + wide.quads[1]!.width / 2).toBeCloseTo(1920 - side, 9);
    expect(wide.quads[0]!.height).toBeCloseTo(1080, 9);
    expect(wide.bars.map((b) => [b.x, b.width, b.height])).toEqual([[0, side, 1080], [1920 - side, side, 1080]]);
  });

  it('draws the mask alone -- no ring, no arms, no scope, no goggles -- its two layers and the bars spanning a wide frame', () => {
    const meshes = drawn(1920, 1080, 'binoculars');
    const named = meshes.map((m) => m.userData.bitmap as string | undefined).filter((n) => n !== undefined);
    expect(named.sort()).toEqual(['ret_binocs.tif', 'ret_binocs.tif', 'ret_binocs2.tif', 'ret_binocs2.tif']);
    const textured = meshes.filter((m) => (m.material as MeshBasicMaterial).map !== null);
    expect(textured).toHaveLength(4);                                     // the reticle's ring and arms are hidden
    const layer2 = textured.filter((m) => m.userData.bitmap === 'ret_binocs2.tif');
    expect(layer2.every((m) => m.renderOrder > textured.find((t) => t.userData.bitmap === 'ret_binocs.tif')!.renderOrder)).toBe(true);
    const map = (textured[0]!.material as MeshBasicMaterial).map!;
    expect([map.offset.x, map.offset.y, map.repeat.x, map.repeat.y].map((v) => Math.round(v * 100) / 100)).toEqual([0.01, 0.01, 0.96, 0.98]);
    expect(textured.filter((m) => m.scale.x < 0)).toHaveLength(2);         // the right lens mirrored
    const bars = meshes.filter((m) => (m.material as MeshBasicMaterial).map === null);
    expect(bars).toHaveLength(2);
    const spans = meshes.map((m) => [m.position.x - Math.abs(m.scale.x) / 2, m.position.x + Math.abs(m.scale.x) / 2]).sort((a, b) => a[0]! - b[0]!);
    let reach = 0;
    for (const [a, b] of spans) { expect(a!).toBeLessThanOrEqual(reach + 1e-6); reach = Math.max(reach, b!); }
    expect(reach).toBeGreaterThanOrEqual(1920 - 1e-6);
    expect(drawn(640, 448, 'binoculars').filter((m) => (m.material as MeshBasicMaterial).map === null)).toEqual([]);
    expect(drawn(640, 448, 'reticle').filter((m) => m.userData.bitmap?.startsWith('ret_binocs'))).toEqual([]);
  });

  it('set 7 never swaps the ring and the arms for its bitmaps (its draw is its own), as the scope set does not', () => {
    const r = new Reticle();
    const rgba = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
    r.setBitmaps({ fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null, sets: { 'ret_binocs.tif': rgba(128, 128), 'ret_binocs2.tif': rgba(128, 128) } });
    expect(r.setSet(7)).toBe(false);
    expect(r.currentSet()).toBe(1);
    expect(reticleType(15, 4, 9, 1)).toBe(7);                             // FUN_005be300: state 4 first, the pistol too
    expect(reticleType(121, 4, 9, 1)).toBe(7);                            // and a grenade in the hand
  });
});

/**
 * The owner, 2026-10-02: "on the death cam, the crosshair should be hidden and not shown." The HUD's frame
 * (`FUN_00216770` L70391-70413) sets the weapon's reticle (`FUN_00213e20`, ChangeReticule) only while the player is alive
 * (`+0xe1` bit 4); dead it sets -1, which draws nothing (L70427) -- from the death, through the death camera, to the
 * spawn that makes it alive again. The page's gate: the walk's dead flag (the net client's `kill` to its `spawn`).
 */
describe('reticleShown: no reticle while dead (FUN_00216770 L70391-70413: ChangeReticule -1)', () => {
  // PAR-94 B2: `spawned` beside `walking` (was: `{ walking: true, dead: false, tacMap: false, scoreboard: false, screenUp: false }`).
  const alive = { walking: true, spawned: true, dead: false, tacMap: false, scoreboard: false, screenUp: false };

  it('alive and walking: shown, as before', () => {
    expect(reticleShown(alive)).toBe(true);
  });

  // PAR-94 B2 (research 322 §4.1 B2, D2): the original's HUD update -- the reticle's set and update with it -- runs only
  // under the camera's actor (`FUN_001f7ff0` D:L56540, the gate D:L56631), which the load has made before the first frame
  // (R322.3). The port's page has no actor of the room's until the room's `spawn` for it: no reticle of the default kit.
  it('PAR-94 B2: walking but not yet spawned by the room this match (no actor, D:L56631): hidden', () => {
    expect(reticleShown({ ...alive, spawned: false })).toBe(false);
  });
  it('PAR-94 B2 pin: a dead seat spawned before keeps today\'s gate (hidden while dead), a respawned one is shown', () => {
    expect(reticleShown({ ...alive, dead: true })).toBe(false);
    expect(reticleShown({ ...alive, spawned: true, dead: false })).toBe(true);
  });

  it('dead (the death camera, a classic bench before the teammates\' cycle): hidden', () => {
    expect(reticleShown({ ...alive, dead: true })).toBe(false);
  });

  it('the other gates as before: not walking (fly, a spectator\'s follow), the tac map, the scoreboard, a round screen', () => {
    expect(reticleShown({ ...alive, walking: false })).toBe(false);
    expect(reticleShown({ ...alive, tacMap: true })).toBe(false);
    expect(reticleShown({ ...alive, scoreboard: true })).toBe(false);
    expect(reticleShown({ ...alive, screenUp: true })).toBe(false);
  });

  // MATCH-FIX review 2, finding 3: the call site, pinned -- the page's reticle goes through the gate with the walk's dead
  // flag (a return to the old expression, or a dropped `dead`, turns this red).
  // ONE-WIRE (research 222): the call is the one firearm's (`./matchFirearm` `showReticle`), which both pages mount.
  it('the match\'s firearm sets the reticle\'s visibility by reticleShown, dead from the walk; neither page sets it itself', () => {
    const read = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    const calls = read('matchFirearm.ts').match(/reticle\.setVisible\([^;]*;/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^reticle\.setVisible\(reticleShown\(\{[^}]*\bdead: walk\.isDead\(\)[^}]*\}\)\);$/);
    expect(calls[0]).toMatch(/^reticle\.setVisible\(reticleShown\(\{ walking, spawned, /);   // PAR-94 B2: the page's own spawn beside the walk
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(read(f), f).not.toMatch(/reticle\.setVisible\(/);
      expect(read(f), f).toMatch(/firearm\.showReticle\(/);
    }
  });
});

/**
 * PAR-94 B3 (research 322 §4.1 B3, D5): `/testroom`'s walker's kit -- its HUD and its reticle -- under the offline
 * ARMORY. The original has no HUD while an equipment screen is up (the lobby's ARMORY is a menu state's, offline the
 * mission's selection comes before the load; R322.7), and the HUD's update runs only under the camera's actor
 * (`FUN_001f7ff0` D:L56631, as B2). `pageSpawned` is the page's `spawned` (B2's): the ARMORY shut and, where the page has a
 * room, that room's own `spawn` heard; a page with no room (the test room's free walk, which no room ever spawns) draws
 * as before.
 */
describe('PAR-94 B3: pageSpawned -- no kit drawn under the offline ARMORY, none before the room\'s spawn', () => {
  it('the ARMORY open: not spawned, whatever the room', () => {
    for (const room of [false, true]) for (const spawned of [false, true]) {
      expect(pageSpawned({ room, spawned, armoryOpen: true }), `room ${room}, spawned ${spawned}`).toBe(false);
    }
  });
  it('the ARMORY shut, a room: spawned only once the room has spawned the page', () => {
    expect(pageSpawned({ room: true, spawned: false, armoryOpen: false })).toBe(false);
    expect(pageSpawned({ room: true, spawned: true, armoryOpen: false })).toBe(true);
  });
  it('the ARMORY shut, no room (the free walk): drawn as before', () => {
    expect(pageSpawned({ room: false, spawned: false, armoryOpen: false })).toBe(true);
  });
  it('through reticleShown: the ARMORY open hides the reticle of a walking, living seat', () => {
    const shown = (armoryOpen: boolean): boolean => reticleShown({
      walking: true, spawned: pageSpawned({ room: true, spawned: true, armoryOpen }), dead: false, tacMap: false, scoreboard: false, screenUp: false,
    });
    expect([shown(false), shown(true)]).toEqual([true, false]);
  });
  it('both pages\' frames gate the HUD and the reticle on the same spawned; /testroom\'s on pageSpawned', () => {
    const read = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    const main = read('main.ts'), mount = read('matchMount.ts');
    expect(main).toMatch(/const spawned = pageSpawned\(\{ room: net !== null, spawned: ownSpawned, armoryOpen: armory\.isOpen\(\) \}\);/);
    expect(main).toMatch(/firearm\.showReticle\(created\.renderer, walking, tacMap\.isOpen\(\), scoreboard, spawned\);/);
    expect(main).toMatch(/hud\.setVisible\(walking && spawned\);/);
    expect(main).toMatch(/respawned: \(\) => \{ ownSpawned = true;/);
    expect(mount).toMatch(/firearm\.showReticle\(renderer\.renderer, walking, false, scoreboard, spawned\);/);
    expect(mount).toMatch(/hud\.setVisible\(walking && spawned\);/);
    expect(mount).toMatch(/respawned: \(\) => \{ spawned = true;/);
    for (const [f, text] of [['main.ts', main], ['matchMount.ts', mount]] as const) expect(text, f).not.toMatch(/hud\.setVisible\(walking\);/);
  });
});

/**
 * NU-2 (research 320 section 8.1 G1-G3; the owner's "Grenade aiming crosshair"): with a throwable or a charge in the hand
 * the reticle's set is the hand's item's (`FUN_005be300` D:L474896-474951), and set 4 is the throw meter, not a cross --
 * `ChangeReticule` (`FUN_00213e20` D:L69389-69431) hides the ring and the arms and shows `ret_grenade_02` twice (the
 * frame) and `ret_grenade_01` twice (the fill), laid by `FUN_00213a60` (D:L69177-69255) about the reticle's centre with
 * the controller's power `ctrl+0x11c` (`FUN_001f7ff0` D:L56673-56688). Under set 4 the HUD lays no size and moves no
 * centre (`FUN_00216770` D:L70415-70434).
 */
describe('NU-2 G1: the reticle\'s set from the hand\'s item (FUN_005be300, research 320 section 1)', () => {
  it('an M67 up with the M4A1 SD in the kit: set 4, not the rifle\'s 1', () => {
    expect(reticleType(62, 0, 1)).toBe(1);                                // the firearm's own, as before
    expect(handReticleType(121, 62, 0, 1, 1)).toBe(4);                    // the M67 in the hand
  });

  it('every hand grenade 4, the claymore and the PMN 4, the C4 and the satchel none (-1), the Detonator the sidearm\'s 0', () => {
    for (const id of [121, 122, 123, 126, 127, 128]) expect(handReticleType(id, 62, 0, 1, 1), String(id)).toBe(4);
    expect(handReticleType(153, 62, 0, 1, 1)).toBe(4);                    // the claymore
    expect(handReticleType(158, 62, 0, 1, 1)).toBe(4);                    // the PMN Mine
    expect(handReticleType(151, 62, 0, 1, 1)).toBe(-1);                   // the C4 (D:L474926-474928)
    expect(handReticleType(152, 62, 0, 1, 1)).toBe(-1);                   // the satchel
    expect(handReticleType(193, 62, 0, 1, 1)).toBe(0);                    // the Detonator: gear 190-253
  });

  it('no item up: the firearm\'s set as before (its scope, its launcher round\'s mode); the 9x view first whatever is held', () => {
    expect(handReticleType(null, 62, 0, 1, 1)).toBe(1);
    expect(handReticleType(null, 62, 5, 3, 1)).toBe(5);
    expect(handReticleType(null, 0x34, 0, 1, 5)).toBe(3);                 // the M203's round mode
    expect(handReticleType(121, 62, 4, 9, 1)).toBe(7);                    // state 4 first (D:L474912-474915; was: D:L474896-474899)
  });

  it('a throwable never takes the scope\'s set: its record has NumZoomModes 1, the magnification stays 1 (D:L474917-474921)', () => {
    expect(handReticleType(121, 62, 5, 3, 1)).toBe(4);
    expect(handReticleType(193, 62, 5, 3, 1)).toBe(0);
  });
});

/** A Reticle with the rifle's, the sidearm's and the grenade's bitmaps (64x64 frame and fill, every texel inked); its draw. */
const meterReticle = (frameW = 64, frameH = 64) => {
  const r = new Reticle();
  r.setBitmaps({
    fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: rgba(16, 16),
    sets: {
      'ret_grenade_02.tif': rgba(frameW, frameH), 'ret_grenade_01.tif': rgba(64, 64),
      'ret_sidearm_01.tif': rgba(32, 32), 'ret_sidearm_02.tif': rgba(16, 16),
    },
  });
  r.setVisible(true);
  const render = (width = 640, height = 448): Mesh[] => {
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(width, height), render: (s) => { scene = s; } });
    const out: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) out.push(o); });
    return out;
  };
  return { r, render };
};
/** A quad's edges, frame pixels: [x0, y0, x1, y1]. */
const edges = (q: MeterQuad): number[] => [q.x - q.width / 2, q.y - q.height / 2, q.x + q.width / 2, q.y + q.height / 2];

describe('NU-2 G2: the throw meter (FUN_00213a60 D:L69177-69255, research 320 section 2)', () => {
  it('at 640x448 about (320, 224), power 0: the frame twice -- above and its mirror below -- and no fill', () => {
    const { quads, rect } = meterLayout(PS2, [320, 224], 0, { width: 64, height: 64 });
    const frame = quads.filter((q) => q.bitmap === 'frame'), fill = quads.filter((q) => q.bitmap === 'fill' && q.height > 0);
    expect(frame.map((q) => [q.half, ...edges(q)])).toEqual([['top', 288, 192, 352, 224], ['bottom', 288, 224, 352, 256]]);
    expect(frame.map((q) => q.rows)).toEqual([[0, 1], [0, 1]]);           // the whole bitmap each, mirrored about the line
    expect(fill).toEqual([]);
    expect(rect).toEqual({ x: 288, y: 192, width: 64, height: 64 });
  });

  it('power 0.5 and 1: the fill from the centre line up and down together, W/4 then W/2 each way, rows 0 to the power', () => {
    for (const [power, half] of [[0.5, 16], [1, 32]] as const) {
      const fill = meterLayout(PS2, [320, 224], power, { width: 64, height: 64 }).quads.filter((q) => q.bitmap === 'fill');
      expect(fill.map((q) => [q.half, ...edges(q)])).toEqual([['top', 288, 224 - half, 352, 224], ['bottom', 288, 224, 352, 224 + half]]);
      expect(fill.map((q) => q.rows)).toEqual([[0, power], [0, power]]);  // at the frame's density: half x 2 rows of 64
    }
    // The order ChangeReticule lists them (D:L69399-69402): +0x270 and +0x460 the fill, +0x650 and +0x840 the frame.
    expect(meterLayout(PS2, [320, 224], 1, { width: 64, height: 64 }).quads.map((q) => `${q.bitmap} ${q.half}`))
      .toEqual(['fill top', 'fill bottom', 'frame top', 'frame bottom']);
  });

  it('W and H are the served frame bitmap\'s: the bar H wide and W tall (no 64 assumed)', () => {
    const { quads, rect } = meterLayout(PS2, [320, 224], 1, { width: 64, height: 32 });
    expect(rect).toEqual({ x: 304, y: 192, width: 32, height: 64 });
    expect(quads.filter((q) => q.bitmap === 'fill').map(edges)).toEqual([[304, 192, 336, 224], [304, 224, 336, 256]]);
  });

  it('on a scaled frame (the Modern presentation): the PS2 pixel at height / 448, about the centre handed', () => {
    const s = 1080 / 448;
    const { quads, rect, scale } = meterLayout({ width: 1920, height: 1080 }, [960, 540], 0.5, { width: 64, height: 64 });
    expect(scale).toBeCloseTo(s, 12);
    expect(rect.width).toBeCloseTo(64 * s, 9);
    expect(rect.x + rect.width / 2).toBeCloseTo(960, 9);
    expect(rect.y + rect.height / 2).toBeCloseTo(540, 9);
    expect(quads[0]!.height).toBeCloseTo(16 * s, 9);
  });

  it('the colours: the frame (200, 200, 0) at alpha 36/128, the fill (128, 70, 32) at 64/128, by reticleTint\'s one scale', () => {
    expect(GRENADE_METER_COLOUR_READING).toEqual({ frame: { rgb: [200, 200, 0], alpha: 36 }, fill: { rgb: [128, 70, 32], alpha: 64 } });
    const frame = meterTint('frame'), fill = meterTint('fill');
    expect(frame.opacity).toBe(36 / 128);
    expect(fill.opacity).toBe(64 / 128);
    frame.rgb.forEach((c, i) => expect(c).toBeCloseTo([ARM_TINT[0], ARM_TINT[1], 0][i]!, 12));   // the rest's scale: 200 -> the measured 204/255
    expect(fill.rgb[0]).toBeCloseTo((128 / 200) * ARM_TINT[0], 12);
    expect(fill.rgb[1]).toBeCloseTo((70 / 200) * ARM_TINT[1], 12);
    expect(fill.rgb[2]).toBeCloseTo((32 / 24) * ARM_TINT[2], 12);
  });

  it('the decoded rows: the first row on the centre line, the last at the outer edge (GRENADE_METER_BITMAP_READING)', () => {
    expect(GRENADE_METER_BITMAP_READING).toBe('first row on the centre line');
  });
});

describe('NU-2 G2: the meter drawn by Reticle under set 4 (ChangeReticule D:L69389-69431)', () => {
  it('set 4 is taken: the ring, the arms and the pip hidden; the frame\'s two quads drawn at its alpha, its top one mirrored', () => {
    const { r, render } = meterReticle();
    expect(r.setSet(4)).toBe(true);
    expect(r.currentSet()).toBe(4);
    r.setMeter(0);
    const meshes = render();
    const meter = meshes.filter((m) => m.userData.meter !== undefined);
    expect(meter.map((m) => `${m.userData.meter} ${m.userData.half}`).sort()).toEqual(['frame bottom', 'frame top']);
    expect(meshes.filter((m) => m.userData.meter === undefined)).toEqual([]);   // no ring, no arms, no pip
    const top = meter.find((m) => m.userData.half === 'top')!, bottom = meter.find((m) => m.userData.half === 'bottom')!;
    expect([top.position.x, top.position.y, top.scale.x, top.scale.y]).toEqual([320, 208, 64, -32]);
    expect([bottom.position.x, bottom.position.y, bottom.scale.x, bottom.scale.y]).toEqual([320, 240, 64, 32]);
    const material = top.material as MeshBasicMaterial;
    expect(material.opacity).toBe(36 / 128);
    expect(material.side).toBe(DoubleSide);
    expect(material.color.toArray().map((c) => Math.round(c * 1e6) / 1e6)).toEqual(meterTint('frame').rgb.map((c) => Math.round(c * 1e6) / 1e6));
  });

  it('power 0.5: the fill\'s two quads, W/4 each way, sampling the rows 0 to 0.5', () => {
    const { r, render } = meterReticle();
    r.setSet(4);
    r.setMeter(0.5);
    const fill = render().filter((m) => m.userData.meter === 'fill');
    expect(fill.map((m) => [m.userData.half, m.position.y, m.scale.x, m.scale.y]).sort()).toEqual([['bottom', 232, 64, 16], ['top', 216, 64, -16]]);
    const map = (fill[0]!.material as MeshBasicMaterial).map!;
    expect([map.offset.y, map.repeat.y]).toEqual([0, 0.5]);
    expect((fill[0]!.material as MeshBasicMaterial).opacity).toBe(64 / 128);
    expect(r.state().meter).toMatchObject({ power: 0.5, fill: 16, rect: { x: 288, y: 192, width: 64, height: 64 } });
  });

  it('the C4 (set -1): nothing drawn (C4_RETICLE_READING); the firearm\'s set again: its ring and arms', () => {
    const { r, render } = meterReticle();
    expect(C4_RETICLE_READING).toBe('nothing');
    expect(r.setSet(-1)).toBe(true);
    expect(render()).toEqual([]);
    expect(r.setSet(4)).toBe(true);
    expect(r.setSet(1)).toBe(true);
    const meshes = render();
    expect(meshes.filter((m) => m.userData.meter !== undefined)).toEqual([]);
    expect(meshes).toHaveLength(5);                                       // the ring and the four arms
    expect(r.setSet(0)).toBe(true);                                       // the Detonator's: the sidearm's bitmaps
    expect(render()).toHaveLength(5);
  });

  it('no meter bitmaps served: set 4 is refused and the drawn set kept, as any set whose bitmaps the map lacks', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: rgba(64, 64), floating: rgba(32, 32), accuracy: null, sets: {} });
    expect(r.setSet(4)).toBe(false);
    expect(r.currentSet()).toBe(1);
  });
});

describe('NU-2 G3: the power fed each frame; no size, no knock, no move under set 4', () => {
  it('meterPower: the controller\'s power, 0 when the hand has none left (FUN_001f7ff0 D:L56673-56688, FUN_005c3890)', () => {
    expect(meterPower(0.7, 2)).toBe(0.7);
    expect(meterPower(0.7, 0)).toBe(0);
    expect(meterPower(0.7, 1)).toBe(0.7);
  });

  it('the meter keeps the centre the last firearm frame left -- the knock in it -- through a walk, a turn and a climb', () => {
    const { r, render } = meterReticle();
    r.setSize(10, [0, -12]);                                              // the firearm's last frame: knocked 12 up
    render();
    expect(GRENADE_METER_CENTRE_READING).toBe('the last firearm frame\'s');
    r.setSet(4);
    r.setMeter(1);
    r.setAimPoint(0.6, 0.4);                                              // a turn, a walk's bloom, a climb: none moves it
    r.setSize(26, [5, -30]);
    render();
    expect(r.state().meter!.rect).toEqual({ x: 288, y: 180, width: 64, height: 64 });
    expect(r.state().rect).toEqual({ x: 288, y: 180, width: 64, height: 64 });
  });

  it('the pip fades under set 4 whatever offset it is handed (D:L70435-70445)', () => {
    const { r, render } = meterReticle();
    for (let i = 0; i < 4; i++) r.setPip([40, 40], false);
    expect(r.state().pip.alpha).toBe(128);
    r.setSet(4);
    for (let i = 0; i < 4; i++) r.setPip([40, 40], false);
    expect(r.state().pip.alpha).toBe(0);
    expect(render().filter((m) => m.userData.meter === undefined)).toEqual([]);
  });

  it('over a throw: 0 at the press, rising as 1 - 0.95^n, held at the release\'s power, 0 once the thrower clears it', () => {
    const { r, render } = meterReticle();
    const snap = {
      feet: [100, 50, 200], yaw: 90, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
      landing: null, jumps: 0,
    } as unknown as PlaySnapshot;
    const g = new GrenadeThrower({ grid: () => null, snapshot: () => snap, view: () => 'third' });
    g.select('M67');
    expect(r.setSet(handReticleType(121, 62, 0, 1, 1))).toBe(true);
    const frame = (): number => {
      g.update(1 / 60);
      const s = g.stats();
      r.setMeter(meterPower(s.power, s.left));
      render();
      return r.state().meter!.fill;
    };
    expect(frame()).toBe(0);                                              // up, not held
    g.pull();
    const fills: number[] = [];
    for (let n = 1; n <= 30; n++) fills.push(frame());
    fills.forEach((f, i) => expect(f).toBeCloseTo(32 * (1 - 0.95 ** (i + 1)), 9));
    const atRelease = g.stats().power;
    g.release();
    let held = 0;
    for (;;) {                                                            // the release request to the hand-open
      const f = frame();
      if (g.stats().power === 0) break;
      expect(f).toBeCloseTo(32 * atRelease, 9);
      if (++held > 600) throw new Error('the throw never left the hand');
    }
    expect(held).toBeGreaterThan(0);
    expect(g.stats().phase).not.toBe('throwing');                         // D7: held through the clip (D:L453483-453489)
    // Once the thrower has cleared it the meter is empty. (Was, before D7 was built: "the page's thrower clears it at the
    // hand-open, the original at the clip's end".)
    for (let i = 0; i < 120; i++) frame();
    expect(r.state().meter!.fill).toBe(0);
  });
});

/**
 * NU-3b C4 (research 321 sections 4.1, 4.2 and 7.1 C4; `FUN_00215c10` D:L70094-70219): the actor under the reticle
 * (`FUN_005aa690`), alive, within 320 units across the ground -- 500 under the scope's set 5 (102400 and 250000 against
 * x and z, D:L70100-70105) -- gives a teammate green (24, 200, 44) with its name online and its 60 x 5 health bar, an
 * identified other red (200, 24, 44) with its name, and anything else the rest's colour with no name and no bar. The name
 * "[%s] %s" (0x3e4848) with a clan tag of two characters or more, the bare name under two or on the blank (D:L70189-70200);
 * at 0.7 (D:L70816-70817), its pen at (cx + W/2, cy - H/2) -- W/4, H/4 under set 5 (D:L70201-70212) -- and the bar's
 * corner 15 above it (D:L70213-70218; its size `FUN_00241cb0` D:L70822).
 */
describe('NU-3b C4: the target under the reticle -- its colour, its name and a teammate\'s bar', () => {
  // TEAMMATE NAMES off (`DISPLAY_MP_TEAM_NAMES` 0) unless a case says: the teammate's name then shows under the reticle.
  const base = { blocked: null, size: 1, empty: false, c4: false, scoped: false, online: true, aimed: null, arming: null, climbing: false, teammateNames: false };
  const mate = (ground: number, over: Partial<ReticleTarget> = {}): ReticleTarget => ({ side: 'teammate', ground, name: 'BRAVO', tag: 'NSW', health: 0.5, ...over });
  // AD-3: an other the perception has marked (the record's bit 0x200, `identified`) unless a case says; was, before AD-3,
  // no `identified` -- every other under the reticle was red (ENEMY_IDENTIFIED_PLACEHOLDER, 'under the reticle').
  const enemy = (ground: number, over: Partial<ReticleTarget> = {}): ReticleTarget => ({ side: 'other', ground, name: 'ECHO', tag: 'OPFOR', health: 0.3, identified: true, ...over });

  it('a teammate within 320 across the ground: green, "[tag] name" online, the bar at its health; at 400 rest; scoped at 400 green (500)', () => {
    expect(TARGET_RANGE).toEqual({ unscoped: 320, scoped: 500 });
    expect(reticleTargetState({ ...base, target: mate(200) })).toEqual({ colour: 'friendly', name: '[NSW] BRAVO', bar: 0.5 });
    expect(reticleTargetState({ ...base, target: mate(320) }).colour).toBe('friendly');          // not beyond: 102400 < d^2 is false
    expect(reticleTargetState({ ...base, target: mate(400) })).toEqual({ colour: 'rest', name: null, bar: null });
    expect(reticleTargetState({ ...base, scoped: true, target: mate(400) })).toEqual({ colour: 'friendly', name: '[NSW] BRAVO', bar: 0.5 });
    expect(reticleTargetState({ ...base, scoped: true, target: mate(501) })).toEqual({ colour: 'rest', name: null, bar: null });
    expect(reticleTargetState({ ...base, target: null })).toEqual({ colour: 'rest', name: null, bar: null });
  });

  it('a teammate offline, or online with the HUD\'s +0x17b64 set, shows the blank " " (0x3e4840, D:L70159-70170); the bar still', () => {
    expect(reticleTargetState({ ...base, online: false, target: mate(200) })).toEqual({ colour: 'friendly', name: ' ', bar: 0.5 });
  });

  it('+0x17b64 is the TEAMMATE NAMES option (DISPLAY_MP_TEAM_NAMES, D:L77558-77559), on by default: the blank and the bar; off: "[NSW] BRAVO"', () => {
    expect(TEAMMATE_NAMES_OPTION_READING).toEqual({ valve: 'DISPLAY_MP_TEAM_NAMES', on: true });
    const golden = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/global-valves.json'), 'utf8')) as { valves: { name: string; value: number }[] };
    expect(golden.valves.find((v) => v.name === 'DISPLAY_MP_TEAM_NAMES')?.value).toBe(1);       // the option's default, off the disc
    const { teammateNames: _off, ...unset } = base;
    expect(reticleTargetState({ ...unset, target: mate(200) })).toEqual({ colour: 'friendly', name: ' ', bar: 0.5 });   // the default: on
    expect(reticleTargetState({ ...base, teammateNames: true, target: mate(200) })).toEqual({ colour: 'friendly', name: ' ', bar: 0.5 });
    expect(reticleTargetState({ ...base, teammateNames: false, target: mate(200) })).toEqual({ colour: 'friendly', name: '[NSW] BRAVO', bar: 0.5 });
    expect(reticleTargetState({ ...unset, target: enemy(200) }).name).toBe('[OPFOR] ECHO');                              // an enemy's name whatever the option
  });

  // AD-3 re-pins the two below (was: "an identified other: red with its name and no bar (D:L70172-70176,
  // ENEMY_IDENTIFIED_PLACEHOLDER); beyond the range rest" -- `expect(ENEMY_IDENTIFIED_PLACEHOLDER).toBe('under the
  // reticle')`, every other under the reticle red; and "a body no seat's side holds (a hostage): the rest, no name, no bar
  // (TARGET_KIND_PLACEHOLDER)" -- `expect(TARGET_KIND_PLACEHOLDER).toBe('rest')`).
  it('AD-3: an other is red with its name and no bar only while the record carries bit 0x200 (D:L70119-70130, D:L70172-70176); unmarked, or beyond the range, the rest', () => {
    expect(reticleTargetState({ ...base, target: enemy(200) })).toEqual({ colour: 'hostile', name: '[OPFOR] ECHO', bar: null });
    expect(reticleTargetState({ ...base, target: enemy(200, { tag: null }) })).toEqual({ colour: 'hostile', name: 'ECHO', bar: null });
    expect(reticleTargetState({ ...base, target: enemy(200, { identified: false }) })).toEqual({ colour: 'rest', name: null, bar: null });
    expect(reticleTargetState({ ...base, target: enemy(200, { identified: undefined }) })).toEqual({ colour: 'rest', name: null, bar: null });
    expect(reticleTargetState({ ...base, target: enemy(330) })).toEqual({ colour: 'rest', name: null, bar: null });
  });

  it('AD-3: a hostage (online, the escortee bit 17, D:L70115-70118) is green with its record\'s name and its bar, marked or not, whatever the side (D:L70137-70158, D:L70213)', () => {
    const hostage: ReticleTarget = { side: 'unseated', ground: 100, name: 'Hostage', tag: null, health: 1, kind: 'hostage' };
    expect(reticleTargetState({ ...base, target: hostage })).toEqual({ colour: 'friendly', name: 'Hostage', bar: 1 });
    expect(reticleTargetState({ ...base, gameType: 4, observerTerrorist: true, target: hostage })).toEqual({ colour: 'friendly', name: 'Hostage', bar: 1 });
    expect(reticleTargetState({ ...base, target: { ...hostage, health: null } })).toEqual({ colour: 'friendly', name: 'Hostage', bar: null });
    expect(reticleTargetState({ ...base, target: { ...hostage, ground: 330 } })).toEqual({ colour: 'rest', name: null, bar: null });
    // A body on no seat's side that is not flagged goes by the record's bit like any other (was: the rest, always).
    expect(reticleTargetState({ ...base, target: { ...hostage, kind: undefined } })).toEqual({ colour: 'rest', name: null, bar: null });
  });

  it('the tag: "[%s] %s" from two characters; the bare name with a one-character tag or on the blank (FUN_00199288 < 2, D:L70193-70198)', () => {
    expect(targetName('X', 'BRAVO')).toBe('BRAVO');                                           // the info box's rule would give "[X] BRAVO"
    expect(taggedName('X', 'BRAVO')).toBe('[X] BRAVO');
    expect(targetName('XY', 'BRAVO')).toBe(taggedName('XY', 'BRAVO'));
    expect(targetName('XY', 'BRAVO')).toBe('[XY] BRAVO');
    expect(targetName('', 'BRAVO')).toBe('BRAVO');
    expect(targetName(null, 'BRAVO')).toBe('BRAVO');
    expect(targetName('NSW', ' ')).toBe(' ');
    expect(reticleTargetState({ ...base, target: mate(200, { tag: 'X' }) }).name).toBe('BRAVO');
  });

  it('a teammate whose health the room has not sent yet: no bar (NU-3c: null until his `health` event; was the placeholder)', () => {
    expect(reticleTargetState({ ...base, target: mate(200, { health: null }) })).toEqual({ colour: 'friendly', name: '[NSW] BRAVO', bar: null });
  });

  it("NU-3c retired the unknown health's placeholder: the module holds no such constant, the health is the room's", async () => {
    const mod: Record<string, unknown> = await import('../src/reticle');
    expect(Object.keys(mod).filter((k) => /^TARGET_HEALTH_/.test(k))).toEqual([]);
  });

  it('targetLayout: the pen at (cx + W/2, cy - H/2), W/4 and H/4 scoped; the bar 60 x 5 its corner 15 above the pen', () => {
    expect(TARGET_NAME_SCALE).toBe(0.7);
    expect(TARGET_BAR).toEqual({ width: 60, height: 5, above: 15 });
    expect(targetLayout(PS2, [320, 224], { width: 32, height: 32 }, false)).toEqual({ scale: 1, pen: [336, 208], bar: { x: 336, y: 193, width: 60, height: 5 }, fill: 60 });
    expect(targetLayout(PS2, [320, 224], { width: 128, height: 128 }, true).pen).toEqual([352, 192]);
    expect(targetLayout(PS2, [310.5, 230.25], { width: 32, height: 32 }, false).pen).toEqual([326, 214]);    // the pen's (int)s
    const s = 1080 / 448, wide = targetLayout({ width: 1920, height: 1080 }, [960, 540], { width: 32, height: 32 }, false);
    expect(wide.scale).toBeCloseTo(s, 12);
    expect(wide.bar.width).toBeCloseTo(60 * s, 9);
    expect(wide.bar.height).toBeCloseTo(5 * s, 9);
  });

  const drawn = () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: null,
      sets: {
        'ret_rifle_01.tif': rgbaOf(64, 64), 'ret_rifle_02.tif': rgbaOf(32, 32), 'ret_binocs.tif': rgbaOf(128, 128), 'ret_binocs2.tif': rgbaOf(128, 128),
        'ret_scope_01.tif': rgbaOf(128, 128), 'ret_scope_02.tif': rgbaOf(128, 128),
      },
    }, rgbaOf(512, 128));
    r.setVisible(true);
    const render = (): Mesh[] => {
      let scene: Scene | null = null;
      r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
      const out: Mesh[] = [];
      (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) out.push(o); });
      return out;
    };
    return { r, render };
  };

  it('authored bot target names draw a gold initial and restore native white ink when a human is targeted', () => {
    const { r, render } = drawn();
    r.setTarget(botDisplayName('Jester', true), 1);
    const text = render().filter((mesh) => mesh.userData.glyph === 'text');
    expect(text).toHaveLength(6);
    expect(text.slice(0, 1).map((mesh) => (mesh.material as MeshBasicMaterial).color.toArray())).toEqual(Array(1).fill(BOT_GOLD.map((channel) => channel / 128)));
    expect(text.slice(1).every((mesh) => (mesh.material as MeshBasicMaterial).color.toArray().join() === TARGET_NAME_LOOK_READING.text.slice(0, 3).join())).toBe(true);
    r.setTarget('BOT Human', 1);
    expect(render().filter((mesh) => mesh.userData.glyph === 'text').every((mesh) => (mesh.material as MeshBasicMaterial).color.toArray().join() === TARGET_NAME_LOOK_READING.text.slice(0, 3).join())).toBe(true);
  });

  // Authored adaptation: only the first character is gold; remaining letters retain the reticle's text colour.
  it('a bot target\'s name is drawn in the reticle\'s text colour after its gold initial, whatever the name', () => {
    const { r, render } = drawn();
    const ink = TARGET_NAME_LOOK_READING.text.slice(0, 3).join();
    for (const name of ['Freq', 'Cav', 'Orion', 'Botty McBotface', 'CPU 1']) {
      r.setTarget(botDisplayName(name, true), 1);
      const text = render().filter((mesh) => mesh.userData.glyph === 'text');
      expect(text.slice(0, 1).map((m) => (m.material as MeshBasicMaterial).color.toArray())).toEqual(Array(1).fill(BOT_GOLD.map((c) => c / 128)));
      expect(text.slice(1).every((m) => (m.material as MeshBasicMaterial).color.toArray().join() === ink), name).toBe(true);
      expect(r.state().target!.name).toBe(name);
    }
    r.setTarget('Freq', 1);
    expect(render().filter((m) => m.userData.glyph === 'text').every((m) =>
      (m.material as MeshBasicMaterial).color.toArray().join() === ink)).toBe(true);
  });

  it('drawn by Reticle: the name\'s glyphs at 0.7 off the font (and their shadow), the bar\'s fill and loss; nothing without a target', () => {
    const { r, render } = drawn();
    r.setTarget('[NSW] BRAVO', 0.5);
    const meshes = render();
    const t = r.state().target!;
    expect(t.name).toBe('[NSW] BRAVO');
    expect(t.pen).toEqual([336, 208]);
    expect(t.bar).toEqual({ rect: { x: 336, y: 193, width: 60, height: 5 }, health: 0.5, fill: 30 });
    const glyphs = layoutText('[NSW] BRAVO', 336, 208, 0.7).glyphs;
    expect(meshes.filter((m) => m.userData.glyph === 'text')).toHaveLength(glyphs.length);
    expect(meshes.filter((m) => m.userData.glyph === 'shadow')).toHaveLength(glyphs.length);
    const first = meshes.find((m) => m.userData.glyph === 'text')!;
    expect(first.position.x).toBeCloseTo(glyphs[0]!.x + glyphs[0]!.w / 2, 9);
    expect(first.position.y).toBeCloseTo(glyphs[0]!.y + glyphs[0]!.h / 2, 9);
    expect((first.material as MeshBasicMaterial).opacity).toBeCloseTo(TARGET_NAME_LOOK_READING.text[3], 9);
    const fill = meshes.find((m) => m.userData.bar === 'fill')!, lost = meshes.find((m) => m.userData.bar === 'lost')!;
    expect([fill.position.x, fill.position.y, fill.scale.x, fill.scale.y]).toEqual([351, 195.5, 30, 5]);
    expect([lost.position.x, lost.position.y, lost.scale.x, lost.scale.y]).toEqual([381, 195.5, 30, 5]);
    expect(FONT_TEXT_01.texture).toBe('font_text_01.tif');
    r.setTarget(null, null);
    const none = render();
    expect(r.state().target).toBeNull();
    expect(none.filter((m) => m.userData.glyph || m.userData.bar)).toEqual([]);
  });

  // The review's F2 (NU-3b, 2026-10-15): `FUN_00241cc0` splits the fill from the loss at `(int)(x + 60 h)` on the bar's
  // untruncated x (D:L90004-90008); the page truncated x first, then the sum.
  it('the fill\'s split is (int)(x + 60 h) on the untruncated x (D:L90005): x 352.6 at 0.99 splits at 412, not 411', () => {
    const l = targetLayout(PS2, [320.6, 224], { width: 64, height: 64 }, false, 0.99);
    expect(l.bar.x).toBe(352);                                              // (int)352.6, the bar's left (D:L90006)
    expect(l.fill).toBe(60);                                                // 412 - 352: (int)(352.6 + 59.4)
    expect(targetLayout(PS2, [320, 224], { width: 32, height: 32 }, false, 0.5).fill).toBe(30);
    expect(targetLayout(PS2, [320, 224], { width: 32, height: 32 }, false, 0).fill).toBe(0);
    expect(targetLayout(PS2, [320, 224], { width: 32, height: 32 }, false).fill).toBe(60);   // no health given: whole
    const { r, render } = drawn();
    r.setSet(1);
    r.setSize(0, [0, 0]);
    r.setAimPoint(320.6 / 640, 0.5);
    r.setTarget('X', 0.99);
    const fill = render().find((m) => m.userData.bar === 'fill')!;
    expect(r.state().target!.bar!.fill).toBe(60);
    expect(fill.scale.x).toBe(60);
  });

  it('a name with no bar (an enemy): the glyphs alone', () => {
    const { r, render } = drawn();
    r.setTarget('ECHO', null);
    const meshes = render();
    expect(r.state().target!.bar).toBeNull();
    expect(meshes.filter((m) => m.userData.bar)).toEqual([]);
    expect(meshes.filter((m) => m.userData.glyph === 'text').length).toBeGreaterThan(0);
  });

  it('D10: in the binoculars (ret_binocs2\'s W and H) and in the scope (ret_scope_02\'s, halved) the name and the bar still show', () => {
    const { r, render } = drawn();
    r.setTarget('BRAVO', 1);
    r.setMode('binoculars');
    render();
    expect(r.state().target!.pen).toEqual([384, 160]);                    // 320 + 128/2, 224 - 128/2
    expect(r.state().target!.bar!.rect.y).toBe(145);
    r.setMode('scope');
    render();
    expect(r.state().target!.pen).toEqual([352, 192]);                    // 320 + 128/4, 224 - 128/4
  });
});

describe('NU-3b G4 (research 320 section 8.1): the bar under the meter, handed (cx + W/2, cy - H/2 - 15) with ret_grenade_02\'s W and H', () => {
  it('set 4 at the frame\'s centre: the pen (352, 192), the bar 60 x 5 at (352, 177) filled to the health', () => {
    const r = new Reticle();
    r.setBitmaps({
      fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: null,
      sets: { 'ret_rifle_01.tif': rgbaOf(64, 64), 'ret_rifle_02.tif': rgbaOf(32, 32), 'ret_grenade_01.tif': rgbaOf(64, 64), 'ret_grenade_02.tif': rgbaOf(64, 64) },
    }, rgbaOf(512, 128));
    r.setVisible(true);
    expect(r.setSet(4)).toBe(true);
    r.setTarget('BRAVO', 0.25);
    r.setColour('friendly');
    let scene: Scene | null = null;
    r.render({ autoClear: true, getDrawingBufferSize: (v: Vector2) => v.set(640, 448), render: (sc) => { scene = sc; } });
    const t = r.state().target!;
    expect(t.pen).toEqual([352, 192]);
    expect(t.bar).toEqual({ rect: { x: 352, y: 177, width: 60, height: 5 }, health: 0.25, fill: 15 });
    const meshes: Mesh[] = [];
    (scene as Scene | null)?.traverse((o) => { if (o instanceof Mesh && o.visible) meshes.push(o); });
    const fill = meshes.find((m) => m.userData.bar === 'fill')!;
    expect([fill.position.x, fill.scale.x]).toEqual([352 + 7.5, 15]);
    for (const m of meshes.filter((x) => x.userData.meter === 'frame')) {
      expect((m.material as MeshBasicMaterial).color.toArray().map((c) => Math.round(c * 1e6) / 1e6)).toEqual(meterTint('frame').rgb.map((c) => Math.round(c * 1e6) / 1e6));
    }
  });
});

/**
 * NU-3b C5 (research 321 sections 4.1 and 7.1 C5, D5, D6, D8): `FUN_00215c10`'s other colour states in its order -- a
 * blocked muzzle past the unhalved size (D:L69983-69992: the grey, the name and the bar hidden, the target skipped), nothing
 * left to fire (D:L70064-70072: the black, `EMPTY_RETICLE_COLOUR_READING`, the target skipped), the arming grey
 * (D:L70229-70259), and a climb or a ladder's start on top last (D:L70260-70266: the grey over everything).
 */
describe('NU-3b C5: the blocked-muzzle grey, the empty black and the climbing grey, in FUN_00215c10\'s order', () => {
  const base = { blocked: null, size: 26, empty: false, c4: false, scoped: false, online: true, aimed: null, arming: null, climbing: false, target: null, teammateNames: false };
  const mate: ReticleTarget = { side: 'teammate', ground: 200, name: 'BRAVO', tag: 'NSW', health: 0.5 };

  it('a blocked muzzle at (40, 0) with size 26: the grey, the name and the bar hidden; inside the size, or up and left, not', () => {
    expect(reticleTargetState({ ...base, blocked: [40, 0] })).toEqual({ colour: 'blocked', name: null, bar: null });
    expect(reticleTargetState({ ...base, blocked: [40, 0], target: mate })).toEqual({ colour: 'blocked', name: null, bar: null });
    expect(reticleTargetState({ ...base, blocked: [0, 27] }).colour).toBe('blocked');
    expect(reticleTargetState({ ...base, blocked: [26, 26] }).colour).toBe('rest');            // not past the size
    expect(reticleTargetState({ ...base, blocked: [-40, -40] }).colour).toBe('rest');          // signed, as the pip's test
    expect(reticleTargetState({ ...base, blocked: [10, 0], target: mate }).colour).toBe('friendly');
    // The unhalved size: a third-person reticle drawn at 13 still greys only past 26 (D:L69985 reads hud+0x44b4 whole).
    expect(reticleTargetState({ ...base, size: 26, blocked: [20, 0] }).colour).toBe('rest');
    expect(reticleGameColour('blocked')).toEqual([130, 130, 130]);
    expect(reticleTint('blocked')).toEqual(reticleTint('range'));
  });

  it('nothing left to fire: the black (EMPTY_RETICLE_COLOUR_READING), the target skipped; the arming grey still over it', () => {
    expect(EMPTY_RETICLE_COLOUR_READING).toEqual([0, 0, 0]);
    expect(reticleGameColour('empty')).toEqual([0, 0, 0]);
    expect(reticleTint('empty')).toEqual([0, 0, 0]);
    expect(reticleTargetState({ ...base, empty: true, target: mate })).toEqual({ colour: 'empty', name: null, bar: null });
    expect(reticleTargetState({ ...base, empty: true, aimed: 50, arming: 100 }).colour).toBe('range');
    expect(reticleTargetState({ ...base, empty: true, blocked: [40, 0] }).colour).toBe('blocked');   // the blocked test first
  });

  it('a climb or a ladder\'s start on top: the grey over every other colour, the name and the bar kept (D:L70260-70266)', () => {
    expect(reticleTargetState({ ...base, climbing: true })).toEqual({ colour: 'climbing', name: null, bar: null });
    expect(reticleTargetState({ ...base, climbing: true, target: mate })).toEqual({ colour: 'climbing', name: '[NSW] BRAVO', bar: 0.5 });
    expect(reticleTargetState({ ...base, climbing: true, empty: true }).colour).toBe('climbing');
    expect(reticleGameColour('climbing')).toEqual([130, 130, 130]);
  });

  it('the climbs FUN_005a78d0 asks for: Climb crate, Climb medium, Stand -> Hang, Climb over, Step up, Stand -> Ladder (D:L462449-462466)', () => {
    expect([...CLIMB_GREY_CLIPS].sort()).toEqual([
      TRAVERSAL_CLIP.climbLow, TRAVERSAL_CLIP.climbMed, TRAVERSAL_CLIP.toHang, TRAVERSAL_CLIP.over, TRAVERSAL_CLIP.stepUp, TRAVERSAL_CLIP.toLadder,
    ].sort());
    for (const c of CLIMB_GREY_CLIPS) expect(reticleClimbing(c), c).toBe(true);
    for (const c of [TRAVERSAL_CLIP.hang, TRAVERSAL_CLIP.hangUp, TRAVERSAL_CLIP.ladder, TRAVERSAL_CLIP.slide, TRAVERSAL_CLIP.dive, null]) expect(reticleClimbing(c), String(c)).toBe(false);
  });

  it('drawn: the arms take the grey and the black (FUN_003590e0 on the four arms)', () => {
    const r = new Reticle();
    r.setBitmaps({ fixed: rgbaOf(64, 64), floating: rgbaOf(32, 32), accuracy: null });
    for (const c of ['blocked', 'climbing', 'empty'] as const) {
      r.setColour(c);
      expect(r.state().colour).toBe(c);
    }
  });
});

/**
 * AD-3 (research 321 sections 4.1 and 7.5; the reconciliation's C88, chunk 07): the perception that marks an other for the
 * reticle -- the human's controller (tables 0x6694b0 / 0x6699f0, slot +0x3c `FUN_005970b0` -> `FUN_005c9b30`, slot +0xac
 * `FUN_005ca170`) keeps a record per actor: a completed query adds the rate times its elapsed time to `+0x18`, clamps it
 * to [0, 2] and marks the record (`+0x2c` bit 0x200) while it is at 1 or more and the target carries no veto
 * (D:L482197-482220, D:L482279-482283); the enqueue pass (`FUN_005ca9f0` D:L482547-482571, `FUN_005cc120`
 * D:L483169-483305) clears a record it rejects at once and decays it by -0.15 of itself a second; the dispatcher clears an
 * inactive one (D:L482176). The special actors (D:L70107-70158): a body carrying the escortee bit 17 online is green with
 * its name and bar -- red only in ESCORT (game type 3) for a Terrorist-side observer (`FUN_002c30b0`).
 */
describe('AD-3: the perception that marks an other, and the special actors', () => {
  it('the constants as read: the clamp [0, 2] and the threshold 1 (DAT_00650998/9c/90), the rejected decay -0.15 (DAT_006509e0), the unseen rate -1 times the scale 1 (D:L516159, D:L516248, D:L454716), the reach 1000 at most 0.95 of the MID (D:L454794-454802), the cone 25 + tan(fov / 2) out to fov 80 degrees (D:L481854-481857, D:L454793), the mover 50 a second (DAT_006509e8)', () => {
    expect(PERCEPTION).toEqual({
      min: 0, max: 2, threshold: 1, rejectedDecay: -0.15, unseenRate: -1, rateScale: 1, range: 1000, rangeOfMid: 0.95,
      apex: 25, fov: 1.3962634, fastSquared: 2500,
    });
  });

  it('a seen query fills the record by the rate times its elapsed time; at 1 the record is marked (>=, D:L482210); the clamp holds it at 2', () => {
    const p = new Perception();
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 0]);
    p.step(9, 'seen', 0.75, { seenRate: 1 });
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 0.75]);
    p.step(9, 'seen', 0.25, { seenRate: 1 });
    expect([p.identified(9), p.accumulator(9)]).toEqual([true, 1]);
    p.step(9, 'seen', 5, { seenRate: 1 });
    expect(p.accumulator(9)).toBe(2);
    expect(p.identified(7)).toBe(false);                                  // a record per actor
  });

  it('an unseen query (FUN_0060b120 at 0 or less): the rate -1 a second -- from 2 the mark holds through one second and clears below 1; the clamp at 0', () => {
    expect(PERCEPTION_SEEN_RATE_PLACEHOLDER).toBe(Number.POSITIVE_INFINITY);
    const p = new Perception();
    p.step(9, 'seen', 1 / 60);                                            // the placeholder's rate: full on the first query
    expect([p.identified(9), p.accumulator(9)]).toEqual([true, 2]);
    p.step(9, 'unseen', 0.5);
    expect([p.identified(9), p.accumulator(9)]).toEqual([true, 1.5]);
    p.step(9, 'unseen', 0.5);
    expect([p.identified(9), p.accumulator(9)]).toEqual([true, 1]);
    p.step(9, 'unseen', 0.25);
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 0.75]);
    p.step(9, 'unseen', 5);
    expect(p.accumulator(9)).toBe(0);
  });

  it('rejected by the enqueue pass (out of the cone and slow): the mark cleared at once, the record decayed by -0.15 of itself a second (D:L482556-482566); a seen query marks it again', () => {
    const p = new Perception();
    p.step(9, 'seen', 1 / 60);
    p.step(9, 'rejected', 1);
    expect(p.identified(9)).toBe(false);
    expect(p.accumulator(9)).toBeCloseTo(1.7, 12);                        // 2 + (-0.15 x 2) x 1
    p.step(9, 'unseen', 0.5);
    expect(p.identified(9)).toBe(true);                                   // still at 1 or more: marked by the next query
    expect(p.accumulator(9)).toBeCloseTo(1.2, 12);
  });

  it('inactive (dead or gone: the dispatcher\'s else, D:L482176): the mark cleared, the record kept; beyond the reach: untouched (FUN_005ca9f0 returns, D:L482552-482553)', () => {
    const p = new Perception();
    p.step(9, 'seen', 1 / 60);
    p.step(9, 'beyond', 1);
    expect([p.identified(9), p.accumulator(9)]).toEqual([true, 2]);
    p.step(9, 'inactive', 1);
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 2]);
  });

  it('the veto (the target body\'s +0x105c bit 4, D:L482214-482218): the record fills, the mark stays clear; PERCEPTION_VETO_PLACEHOLDER false', () => {
    expect(PERCEPTION_VETO_PLACEHOLDER).toBe(false);
    const p = new Perception();
    p.step(9, 'seen', 1 / 60, { veto: true });
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 2]);
    p.step(9, 'seen', 1 / 60);
    expect(p.identified(9)).toBe(true);
  });

  it('perceptionLook (FUN_005ca9f0, FUN_005cc120 for the human: slot +0x2c 1, slot +0x38 none): inactive, beyond the reach, the cone, the fast mover in front', () => {
    const tan = Math.tan(1.3962634 / 2);
    const look = (o: Partial<Parameters<typeof perceptionLook>[0]> = {}): PerceptionLook => perceptionLook({
      alive: true, distance: 200, apex: [0, 0, 0], forward: [0, 0, -1], target: [0, 0, -200], magnification: 1, mid: null,
      speedSquared: 0, seen: true, ...o,
    });
    expect(look()).toBe('seen');
    expect(look({ seen: false })).toBe('unseen');
    expect(look({ alive: false })).toBe('inactive');
    expect(look({ distance: 1000 })).toBe('seen');
    expect(look({ distance: 1001 })).toBe('beyond');
    expect(look({ mid: 1000, distance: 951 })).toBe('beyond');            // 0.95 of the MID
    expect(look({ mid: 1000, distance: 949 })).toBe('seen');
    const edge = 25 + 200 * tan;                                          // the cone's radius 200 out
    expect(look({ target: [edge - 0.5, 0, -200] })).toBe('seen');
    expect(look({ target: [edge + 0.5, 0, -200] })).toBe('rejected');
    expect(look({ target: [edge + 0.5, 0, -200], speedSquared: 2501 })).toBe('seen');     // in front, faster than 50
    expect(look({ target: [edge + 0.5, 0, -200], speedSquared: 2500 })).toBe('rejected');
    expect(look({ target: [0, 0, 10], speedSquared: 1e6 })).toBe('rejected');             // behind: no near test for the human
    // The magnification (body +0x204) narrows it: 25 + p x tan / m^2 above 1 (D:L481801-481806, D:L481854-481857).
    expect(look({ target: [30, 0, -200] })).toBe('seen');
    expect(look({ target: [30, 0, -200], magnification: 9 })).toBe('rejected');
    expect(look({ target: [26, 0, -200], magnification: 9 })).toBe('seen');
    expect([0, 1, 2, 3, 4, 5, 6].map((s) => perceptionMagnification(s, 4))).toEqual([1, 1.01, 1.01, 1.01, 9, 4, 4]);   // FUN_005448a0 D:L410961-411008
  });

  it('the special actors online (bit 17): a hostage green on every type; the escort\'s VIP green, red only in ESCORT for a Terrorist-side observer (D:L70137-70158, FUN_002c30b0)', () => {
    expect(ESCORT_GAME_TYPE).toBe(3);
    const base = { blocked: null, size: 1, empty: false, c4: false, scoped: false, online: true, aimed: null, arming: null, climbing: false, teammateNames: false };
    const vip: ReticleTarget = { side: 'unseated', ground: 100, name: 'VIP1', tag: null, health: 0.8, kind: 'vip' };
    expect(reticleTargetState({ ...base, gameType: 3, observerTerrorist: false, target: vip })).toEqual({ colour: 'friendly', name: 'VIP1', bar: 0.8 });
    expect(reticleTargetState({ ...base, gameType: 3, observerTerrorist: true, target: vip })).toEqual({ colour: 'hostile', name: 'VIP1', bar: 0.8 });
    expect(reticleTargetState({ ...base, gameType: 1, observerTerrorist: true, target: vip })).toEqual({ colour: 'friendly', name: 'VIP1', bar: 0.8 });
    expect(reticleTargetState({ ...base, observerTerrorist: true, target: vip })).toEqual({ colour: 'friendly', name: 'VIP1', bar: 0.8 });
    const hostage: ReticleTarget = { side: 'unseated', ground: 100, name: 'Hostage2', tag: null, health: null, kind: 'hostage' };
    expect(reticleTargetState({ ...base, gameType: 3, observerTerrorist: true, target: hostage })).toEqual({ colour: 'hostile', name: 'Hostage2', bar: null });
    expect(reticleTargetState({ ...base, gameType: 4, observerTerrorist: true, target: hostage })).toEqual({ colour: 'friendly', name: 'Hostage2', bar: null });
  });

  it('offline the flag is bit 31 without bits 1 and 18 (D:L70109-70113): the hostages\' 0xc0020000 flagged -- its name, not the blank; the VIPs\' 0x40020000 not -- it goes by its side', () => {
    const base = { blocked: null, size: 1, empty: false, c4: false, scoped: false, online: false, aimed: null, arming: null, climbing: false };
    const hostage: ReticleTarget = { side: 'unseated', ground: 100, name: 'Hostage', tag: null, health: 1, kind: 'hostage' };
    expect(reticleTargetState({ ...base, target: hostage })).toEqual({ colour: 'friendly', name: 'Hostage', bar: 1 });
    const vip: ReticleTarget = { side: 'teammate', ground: 100, name: 'VIP1', tag: null, health: 1, kind: 'vip' };
    expect(reticleTargetState({ ...base, target: vip })).toEqual({ colour: 'friendly', name: ' ', bar: 1 });
    expect(reticleTargetState({ ...base, target: { ...vip, side: 'other' } })).toEqual({ colour: 'rest', name: null, bar: null });
  });

  // The re-check of AD-3's F2 (2026-10-16) flips the fold's pin (was: "the records ... outlive a death and a round --
  // marked, dead, back in the cone unseen: marked again until the record falls under 1", no `clear`): the observing
  // body's rebuild (`FUN_00599b60`) empties its list at every online round start and at its respawn.
  it("AD-3's re-check of F2: the observing body's rebuild empties its records (PERCEPTION_RECORD_LIFE_READING) -- marked, a round start, back in the cone unseen: the rest; one actor's record dropped alone", () => {
    expect(PERCEPTION_RECORD_LIFE_READING).toEqual({
      owner: 'the observing body (+0xd0)', created: 'zeroed at an actor\'s entry into the world and at the body\'s rebuild',
      emptied: 'at the observing body\'s rebuild: every online round start, its respawn',
      kept: 'across the observed body\'s rebuild alone (its leave cancelled)',
    });
    const p = new Perception();
    p.step(9, 'seen', 1 / 60);
    p.step(7, 'seen', 1 / 60);
    p.clear();                                                            // the round start: the observer rebuilt
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 0]);
    p.step(9, 'unseen', 0.5);
    expect([p.identified(9), p.accumulator(9)]).toEqual([false, 0]);
    p.step(9, 'seen', 1 / 60);
    p.step(7, 'seen', 1 / 60);
    p.keepOnly(new Set([7]));                                             // 9 gone from the page (the page's bookkeeping)
    expect([p.identified(9), p.accumulator(9), p.identified(7)]).toEqual([false, 0, true]);
  });

  it('AD-3 retired ENEMY_IDENTIFIED_PLACEHOLDER and TARGET_KIND_PLACEHOLDER; the unread parts are named apart', async () => {
    const mod: Record<string, unknown> = await import('../src/reticle');
    expect(Object.keys(mod).filter((k) => /^(ENEMY_IDENTIFIED|TARGET_KIND)_/.test(k))).toEqual([]);
    // SIGHT-POINTS (LATER 793): the sight's two points are the original's posed nodes (head to neck), so the constant is a
    // reading now; its surfaces' rule and the record's distance stay the page's stand-ins (was: PERCEPTION_SIGHT_PLACEHOLDER,
    // from the aim's eye to the feet raised by EYE_HEIGHT).
    expect(Object.keys(mod)).not.toContain('PERCEPTION_SIGHT_PLACEHOLDER');
    expect(PERCEPTION_SIGHT_READING).toEqual({ surfaces: 'the eye query\'s kept surfaces', from: 'the observer\'s posed head node', to: 'the target\'s posed neck node', record: 'feet to feet' });
    expect(PERCEPTION_QUERY_PLACEHOLDER).toBe('one query a body a frame, its elapsed time the frame\'s');
  });
});

/**
 * ENEMY-RAISE ER-1 (SCOPE.md s3.4 tests 4 and 5; reading, pending review): the controller's `ctrl+0xc0` counts the body's
 * records that pass four tests (`FUN_005c9b30` D:L482101-482132) -- the team words share no bit
 * (`(body+0xc8 & target+0xc8) == 0`, D:L482112), the target active (`+0xe1` bit 4, D:L482115; the room's alive flag
 * here), of kind 2 (every body the page perceives, D:L419419) and marked (`+0x2c` bit 0x200, D:L482131). The seat words
 * are SEAL 0x40000001 and Terrorist 0x80000100 (`FUN_002c32c0` / `FUN_002c32e0` D:L164772-164793, exchanged under
 * `DAT_004412d8`); the escortees' are the map records' -- a hostage 0xc0020000, a VIP 0x40020000 (research 175 s2,
 * research 321 s4.1.1 point 4) -- bits 30 and 31 exchanged at the spawn under the swap (`FUN_002b28d0` D:L155859-155867).
 */
describe('ENEMY-RAISE ER-1: the marked-enemy count (FUN_005c9b30 D:L482090-482132)', () => {
  /** Seats 7 (SEAL) and 9 (Terrorist), hostage 240, all marked by a seen query (the placeholder rate: at once). */
  const marked = (ids: readonly number[]): Perception => {
    const p = new Perception();
    for (const id of ids) p.step(id, 'seen', 1 / 60);
    return p;
  };

  it('the words as read: the seats 0x40000001 / 0x80000100, exchanged under the swap; a hostage 0xc0020000 either way; a VIP 0x40020000, 0x80020000 under the swap', () => {
    expect(SEAT_WORD).toEqual({ seal: 0x40000001, terrorist: 0x80000100 });
    expect([seatWord('seal'), seatWord('terrorist'), seatWord('seal', true), seatWord('terrorist', true)]).toEqual([0x40000001, 0x80000100, 0x80000100, 0x40000001]);
    expect([escorteeWord(4), escorteeWord(4, true)]).toEqual([0xc0020000, 0xc0020000]);
    expect([escorteeWord(ESCORT_GAME_TYPE), escorteeWord(ESCORT_GAME_TYPE, true)]).toEqual([0x40020000, 0x80020000]);
  });

  it('RED 4: a marked teammate gives 0, a marked enemy 1, a dead enemy 0, a free hostage 0 for either side, an enemy beyond the reach (never marked) 0', () => {
    const word = (id: number): number | null => (id === 7 ? seatWord('seal') : id === 9 ? seatWord('terrorist') : id === 240 ? escorteeWord(4) : null);
    const alive = (): boolean => true;
    const seal = seatWord('seal'), terrorist = seatWord('terrorist');
    expect(enemyCount(marked([7]), seal, word, alive)).toBe(0);                       // the teammate shares bit 30
    expect(enemyCount(marked([9]), seal, word, alive)).toBe(1);
    expect(enemyCount(marked([7, 9]), seal, word, alive)).toBe(1);
    expect(enemyCount(marked([7, 9]), terrorist, word, alive)).toBe(1);
    expect(enemyCount(marked([9]), seal, word, (id) => id !== 9)).toBe(0);            // dead: not active
    expect(enemyCount(marked([240]), seal, word, alive)).toBe(0);                     // 0xc0020000 meets both seat words
    expect(enemyCount(marked([240]), terrorist, word, alive)).toBe(0);
    expect(enemyCount(marked([99]), seal, word, alive)).toBe(0);                      // no word known: not counted
    // in the cone but past the reach (1000): FUN_005ca9f0 stops there, the record never marked
    const look = perceptionLook({ alive: true, distance: 1200, apex: [0, 60, 0], forward: [0, 0, -1], target: [0, 60, -1200], magnification: 1, mid: null, speedSquared: 0, seen: true });
    expect(look).toBe('beyond');
    const p = new Perception();
    p.step(9, look, 1 / 60);
    expect([...p.marked()]).toEqual([]);
    expect(enemyCount(p, seal, word, alive)).toBe(0);
  });

  it('RED 5: the escort VIP (0x40020000) counts for a Terrorist observer and not a SEAL; under the swap (0x80020000) for the SEAL word 0x40000001 and not 0x80000100', () => {
    const vip = (swapped: boolean) => (id: number): number | null => (id === 241 ? escorteeWord(ESCORT_GAME_TYPE, swapped) : null);
    const alive = (): boolean => true;
    expect(enemyCount(marked([241]), 0x80000100, vip(false), alive)).toBe(1);
    expect(enemyCount(marked([241]), 0x40000001, vip(false), alive)).toBe(0);
    expect(enemyCount(marked([241]), 0x40000001, vip(true), alive)).toBe(1);
    expect(enemyCount(marked([241]), 0x80000100, vip(true), alive)).toBe(0);
    // by side: the page's seats and the VIP exchanged together, the VIP stays the Terrorists' enemy
    expect(enemyCount(marked([241]), seatWord('terrorist', true), vip(true), alive)).toBe(1);
    expect(enemyCount(marked([241]), seatWord('seal', true), vip(true), alive)).toBe(0);
  });

  it('Perception.marked lists the marked records only; the count reads no record twice', () => {
    const p = marked([7, 9]);
    p.step(7, 'rejected', 1 / 60);                                                  // 7's mark cleared at once
    expect([...p.marked()]).toEqual([9]);
  });

  it('names its reading: ENEMY_COUNT_FILTER_READING', () => {
    expect(ENEMY_COUNT_FILTER_READING).toEqual({
      kind: 'every perceived body kind 2', active: "the room's alive flag", ledHostage: "the welcome list's word, no leader rewrite",
      swap: "the page's seats and escortees unswapped", observer: 'a seated player only',
    });
  });
});
