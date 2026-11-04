// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Zar, parseRdr, rdrGet, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  AN_M8, BOUNCE_LIFT, CLAYMORE, CLAYMORE_RULES, decalSetRows, explosionDamage, GRENADE_BLAST, HE, heldPower,
  launchGrenade, M67, MARK141, materialAnim, materialTable, maxThrowSpeed, parseMotionZar, PLACE_CLAYMORE_ANIM, releaseSeconds, SOILS,
  soilsTable, stepGrenade, surfaceMaterial, THROW_ANIMS, throwableRecord, throwClipSeconds, throwVelocity, impactRange,
  type Grenade, type GrenadeEvent, type HullCast, type SurfaceMaterial, type ThrowableRecord, type ThrowAnim,
} from '../src/index';

/**
 * TA-COMBATFX: the grenades' parity pins (socomlegacy/docs/research/85-grenades.md), registered in
 * docs/parity/registry/combatfx.json. The values decoded from the disc are pinned in `test/golden/*.json` (TA.R3): the
 * unit tests below drive the projectile code from those pins on small synthetic worlds and run with no game data (CI);
 * the last block re-derives each pin from the extracted files through the repository's readers and compares it whole,
 * so the pin cannot rot (it skips without the fixtures).
 */

const golden = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), 'utf8')) as T;
const THROWABLES = golden<{ records: Record<string, ThrowableRecord>; detonator: { id: number; model: string; icon: string } }>('throwables.json');
const SOILS_PIN = golden<{ soils: SurfaceMaterial[] }>('soils.json').soils;
const DECALS = golden<{ GRENADE_BLAST: { material: string; texture: string; minSize: number; maxSize: number }[] }>('decals.json');
const CLIPS = golden<{ clips: Record<string, { playback: number; frames: number }> }>('throwClips.json').clips;
const FX = golden<{ grenadeHits: string[]; fragMaterials: string[] }>('effectsFrostfire.json');

const rec = (name: string): ThrowableRecord => THROWABLES.records[name]!;
const soil = (name: string): SurfaceMaterial => SOILS_PIN.find((m) => m.name === name)!;

/** A synthetic world: one level plane at y 0 of `material`, its normal up (what the hull cast answers for a floor). */
function plane(material: SurfaceMaterial, y = 0): HullCast {
  return (a, b) => {
    if (!(a[1] >= y && b[1] < y) && !(a[1] > y && b[1] <= y)) return [];
    const t = (a[1] - y) / (a[1] - b[1]);
    return [{ point: [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t], normal: [0, 1, 0], material, t }];
  };
}
const nothing: HullCast = () => [];

/** Steps at 60 Hz until removed or `seconds` pass: every event with its time. */
function fly(g: Grenade, cast: HullCast, seconds: number, dt = 1 / 60): { t: number; e: GrenadeEvent }[] {
  const out: { t: number; e: GrenadeEvent }[] = [];
  for (let i = 1; i <= Math.round(seconds / dt) && g.state !== 'removed'; i++) for (const e of stepGrenade(g, dt, cast)) out.push({ t: i * dt, e });
  return out;
}

/** A clip as `GetThrowAnim` hands it, its `playback` and keys the pinned disc's. */
const clipOf = (a: ThrowAnim): ThrowAnim => ({ ...a, playback: CLIPS[a.clip]!.playback, frames: CLIPS[a.clip]!.frames });

describe('the throwables\' records (zweapon.rdr, pinned)', () => {
  it('the M67, HE, AN-M8, Mark141 and Claymore the code carries are zweapon.rdr\'s records, and the Detonator is ID 193', () => {
    expect({ M67, HE, 'AN-M8': AN_M8, Mark141: MARK141, Claymore: CLAYMORE }).toEqual(THROWABLES.records);
    expect(CLAYMORE_RULES.detonator).toEqual(THROWABLES.detonator);
  });

  it('every hand grenade goes off at its Timer1 from the release and is removed at its Timer2, at rest or in the air', () => {
    for (const name of ['M67', 'HE', 'AN-M8', 'Mark141']) {
      const r = rec(name);
      for (const cast of [plane(soil('STONE')), nothing]) {
        const g = launchGrenade([0, 20, 0], [30, 40, 0], r);
        const ev = fly(g, cast, r.removal + 0.5);
        const boom = ev.find((x) => x.e.kind === 'explode')!;
        expect(boom.t, name).toBeGreaterThanOrEqual(r.fuse - 1e-9);
        expect(boom.t, name).toBeLessThan(r.fuse + 1 / 60 + 1e-9);
        const gone = ev.find((x) => x.e.kind === 'remove')!;
        expect(gone.t, name).toBeGreaterThanOrEqual(r.removal - 1e-9);
        expect(gone.t, name).toBeLessThan(r.removal + 1 / 60 + 1e-9);
      }
    }
    // The pinned fuses themselves: 3 s (M67, HE, the smoke), 1.5 s (the flashbang); removal 3.1, 3.1, 40, 1.6.
    expect(['M67', 'HE', 'AN-M8', 'Mark141'].map((n) => [rec(n).fuse, rec(n).removal])).toEqual([[3, 3.1], [3, 3.1], [3, 40], [1.5, 1.6]]);
  });

  it('the claymore never goes off by its fuse: it waits for the Detonator (no Timer1, ID 0x99)', () => {
    const g = launchGrenade([0, 0.05, 0], [0, 0, 0], rec('Claymore'));
    expect(fly(g, plane(soil('STONE')), 20).some((x) => x.e.kind === 'explode')).toBe(false);
    // Its Timer1 run out changes nothing: the placed-explosive tick holds it while +0xc5 (type 0x99) is up.
    g.fuse = 0;
    expect(stepGrenade(g, 1 / 60, plane(soil('STONE'))).some((e) => e.kind === 'explode')).toBe(false);
    g.trigger = true;
    expect(stepGrenade(g, 1 / 60, plane(soil('STONE'))).some((e) => e.kind === 'explode')).toBe(true);
  });

  it('the blast: Explosion_Damage in full to half of Explosion_Radius, falling linearly to 0 at it (M67 10/150, HE 11/100, claymore 16/250)', () => {
    expect(['M67', 'HE', 'Claymore'].map((n) => [rec(n).explosionDamage, rec(n).explosionRadius])).toEqual([[10, 150], [11, 100], [16, 250]]);
    for (const n of ['M67', 'HE', 'Claymore']) {
      const r = rec(n), R = r.explosionRadius, D = r.explosionDamage;
      expect(explosionDamage(0, r), n).toBe(D);
      expect(explosionDamage(R / 2, r), n).toBe(D);
      expect(explosionDamage(0.55 * R, r), n).toBeCloseTo(0.9 * D, 12);
      expect(explosionDamage(0.75 * R, r), n).toBeCloseTo(D / 2, 12);
      expect(explosionDamage(R, r), n).toBe(0);
      expect(explosionDamage(R + 1, r), n).toBe(0);
    }
    // The smoke and the flashbang hurt no one.
    expect(explosionDamage(0, rec('AN-M8'))).toBe(0);
    expect(explosionDamage(0, rec('Mark141'))).toBe(0);
  });
});

describe('the throw (FUN_00594cf0, GetThrowAnim, CZKit_TickExplosives)', () => {
  it('a held digital button\'s power: 0.265 at 0.1 s, 0.537 at 0.25 s, 0.785 at 0.5 s, 0.954 at 1 s, 0.998 at 2 s', () => {
    expect([0.1, 0.25, 0.5, 1, 2].map((s) => +heldPower(s).toFixed(3))).toEqual([0.265, 0.537, 0.785, 0.954, 0.998]);
  });

  it('ComputeMaxVel: 238.66 u/s from the standing hand (600 units), 167.2 crouched (300)', () => {
    // The note writes 238.66 (the speed truncated: 238.669...) and 167.2 (rounded: 167.175...).
    const stand = maxThrowSpeed(600, THROW_ANIMS.standThrow.offset[1]).speed;
    expect(stand).toBeGreaterThanOrEqual(238.66);
    expect(stand).toBeLessThan(238.67);
    expect(maxThrowSpeed(300, THROW_ANIMS.crouchThrow.offset[1]).speed).toBeCloseTo(167.2, 1);
  });

  it('where a standing throw lands, over the ground from the hand: research 85 section 4\'s table, held 0 to 2 s, aimed 0 and 30 degrees', () => {
    const hand = THROW_ANIMS.standThrow.offset;
    // held s, aim degrees -> launch pitch degrees, speed, where it lands (research 85 §4; the last row its "443").
    const table: [number, number, number, number, number][] = [
      [0, 0, 10.0, 12.0, 7.7], [0.1, 0, 10.5, 59.0, 43.4], [0.25, 0, 11.1, 127.6, 116.0], [0.5, 0, 11.6, 213.9, 252.2],
      [1, 0, 11.9, 238.7, 305.3], [1, 30, 41.9, 238.7, 598.7], [2, 30, 42.0, 238.7, 598.8],
    ];
    for (const [held, aim, pitch, speed, lands] of table) {
      const l = throwVelocity(heldPower(held), Math.sin((aim * Math.PI) / 180), hand, 600);
      const vh = Math.hypot(l.velocity[0], l.velocity[2]);
      expect(+((l.pitch * 180) / Math.PI).toFixed(1), `${held} s, ${aim} deg`).toBe(pitch);
      expect(+l.speed.toFixed(1), `${held} s, ${aim} deg`).toBe(speed);
      expect(+impactRange(vh, l.velocity[1], hand[1]).toFixed(1), `${held} s, ${aim} deg`).toBe(lands);
    }
    const mid = throwVelocity(heldPower(0.25), Math.sin(Math.PI / 6), hand, 600);
    expect(Math.floor(impactRange(Math.hypot(mid.velocity[0], mid.velocity[2]), mid.velocity[1], hand[1]))).toBe(443);
  });

  it('the release and the clip\'s length from motion.rdr\'s playback and the clip\'s keys: 0.71 s standing, 1.07 s the toss, 0.73 s crouched; 1.49 s the whole standing clip', () => {
    for (const a of Object.values(THROW_ANIMS)) expect([a.playback, a.frames], a.clip).toEqual([CLIPS[a.clip]!.playback, CLIPS[a.clip]!.frames]);
    expect(+releaseSeconds(clipOf(THROW_ANIMS.standThrow)).toFixed(2)).toBe(0.71);
    expect(+releaseSeconds(clipOf(THROW_ANIMS.standToss)).toFixed(2)).toBe(1.07);
    expect(+releaseSeconds(clipOf(THROW_ANIMS.crouchThrow)).toFixed(2)).toBe(0.73);
    expect(+throwClipSeconds(clipOf(THROW_ANIMS.standThrow)).toFixed(2)).toBe(1.49);
  });

  it('the claymore\'s placing: seal_place_claymore plays 2.60 s and the charge is down at 1.3 s, phase 0.49', () => {
    const a = clipOf(PLACE_CLAYMORE_ANIM);
    expect([PLACE_CLAYMORE_ANIM.playback, PLACE_CLAYMORE_ANIM.frames]).toEqual([a.playback, a.frames]);
    expect(+throwClipSeconds(a).toFixed(2)).toBe(2.6);
    expect(releaseSeconds(a)).toBeCloseTo(CLAYMORE_RULES.placeSeconds, 12);
    expect(+a.release.toFixed(2)).toBe(0.49);
    expect([CLAYMORE_RULES.maxPlaced, CLAYMORE_RULES.maxWaterDepth, CLAYMORE_RULES.placeDrop, CLAYMORE_RULES.detonateRange]).toEqual([4, 3.2, 10, 500]);
  });
});

describe('the bounce on the disc\'s materials (HandleIntersections, HandleBounce)', () => {
  it('the materials are materials.rdr\'s SOILS as pinned, after UNKNOWN and PARTICLE_SYSTEM: 46 in all', () => {
    expect(SOILS).toEqual(SOILS_PIN);
    expect(materialTable(SOILS_PIN).map((m) => m.name).slice(0, 2)).toEqual(['UNKNOWN', 'PARTICLE_SYSTEM']);
    expect(materialTable(SOILS_PIN)).toHaveLength(46);
  });

  it('a grenade passes through only WATER and GLASS, never sees the PENETRATION-1 materials, and bounces off every other', () => {
    const outcome = (m: SurfaceMaterial): string => {
      const g = launchGrenade([0, 5, 0], [0, -300, 0]);
      const ev = stepGrenade(g, 1 / 60, plane(m));
      return ev[0]?.kind ?? 'none';
    };
    const by = (kind: string): string[] => materialTable(SOILS_PIN).filter((m) => outcome(m) === kind).map((m) => m.name);
    expect(by('pass')).toEqual(['GLASS', 'WATER']);
    expect(by('none')).toEqual(['PARTICLE_SYSTEM', 'ACTION', 'INVISIBLE_DI', 'ITEM', 'GRASS_VOL', 'BUSH_VOL', 'SNOWY_GRASS_VOL']);
    expect(by('bounce')).toHaveLength(46 - 2 - 7);
    for (const m of ['GLASS_MEDIUM', 'CAMO_NET', 'CHAINLINK_FENCE', 'METAL_RAILING']) expect(by('bounce'), m).toContain(m);
  });

  it('each bounce keeps ELASTICITY_COEFF of the reflected speed, x0.75 on the first: research 85 section 5.3\'s values', () => {
    const note: Record<string, number> = {
      STONE: 0.5, METAL_THICK: 0.5, PLASTER: 0.5, CARPET: 0.5, BARREL: 0.5, ASPHALT: 0.45, DIRT: 0.3, WOOD_THICK: 0.3, WOOD_THIN: 0.3,
      GRASS: 0.2, SAND: 0.1, MUD: 0.1, SNOW: 0.15, ICE: 0.15, GRAVEL: 0.15, LEAVES: 0.15, GLASS_THICK: 0.8, GLASS_OPAQUE: 0.8,
    };
    for (const [name, e] of Object.entries(note)) {
      const g = launchGrenade([0, 5, 0], [0, -300, 0]);
      const v = -300 - 98 / 60;
      const ev = stepGrenade(g, 1 / 60, plane(soil(name)));
      expect(ev[0], name).toMatchObject({ kind: 'bounce', material: name });
      expect(g.vel[1] / -v, name).toBeCloseTo(e * 0.75, 12);
      expect(g.pos[1], name).toBeCloseTo(BOUNCE_LIFT, 12);
      // The second bounce: the coefficient alone.
      g.vel = [0, -300, 0];
      g.pos = [0, 5, 0];
      stepGrenade(g, 1 / 60, plane(soil(name)));
      expect(g.vel[1] / -v, name).toBeCloseTo(e, 12);
    }
  });

  it('a default material the table lacks is UNKNOWN, ELASTICITY 0.3: MP11\'s "none" and MP64\'s lower-case "stone"', () => {
    const table = materialTable(SOILS_PIN);
    for (const name of ['none', 'stone']) {
      const m = surfaceMaterial(0, name, table);
      expect(m.name, name).toBe('UNKNOWN');
      expect(m.elasticity).toBe(0.3);
    }
    expect(surfaceMaterial(0, 'STONE', table).name).toBe('STONE');
  });

  it('the bounce\'s and the explosion\'s zAnims are the names materialAnim builds: every grenade_hit_* of Frostfire\'s archive but grenade_hit_grating, every frag_grenade_*', () => {
    const names = materialTable(SOILS_PIN).map((m) => m.name);
    const built = (stem: string): Set<string> => new Set(names.map((n) => materialAnim(stem, n)));
    expect(FX.grenadeHits.filter((a) => !built(M67.hitAnim).has(a))).toEqual(['grenade_hit_grating']);
    expect(FX.fragMaterials.filter((a) => !built(M67.materialAnim!).has(a))).toEqual([]);
    // No bounce zAnim for the glass, the mud, the gas tank, the snowy tree, the railing, the thin grate, the chain-link
    // fence (research 85 section 9.9): the game looks the name up, finds none and plays nothing.
    for (const m of ['GLASS', 'GLASS_THICK', 'GLASS_MEDIUM', 'GLASS_OPAQUE', 'MUD', 'GASTANK', 'SNOWY_TREE', 'METAL_RAILING', 'METAL_GRATE_THIN', 'CHAINLINK_FENCE']) {
      expect(FX.grenadeHits, m).not.toContain(materialAnim(M67.hitAnim, m));
    }
  });

  it('the scorch is GRENADE_BLAST\'s grenade_mark.tif, its size per material as decals.rdr gives it', () => {
    expect(Object.fromEntries(DECALS.GRENADE_BLAST.map((r) => [r.material, [r.minSize, r.maxSize]]))).toEqual(GRENADE_BLAST);
    expect(new Set(DECALS.GRENADE_BLAST.map((r) => r.texture))).toEqual(new Set(['grenade_mark.tif']));
    expect(M67.decalSet).toBe('GRENADE_BLAST');
  });
});

// ---- the data-backed half: each pin re-derived from the extracted files ----------------------------------------------

const script = (bytes: Uint8Array, name: string): RdrNode => {
  const zar = Zar.parse(bytes);
  return parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === name)!));
};
const zweapon = fixture('RUN/ZWEAPON.ZAR'), readerc = fixture('RUN/READERC.ZAR'), motion = fixture('RUN/MOTION_P.ZAR');
const absent = (b: unknown): string => (b ? '' : ` (${FIXTURES_ABSENT})`);

describe(`the grenades' pins against the game's files${absent(zweapon && readerc && motion)}`, () => {
  it.skipIf(!zweapon)("throwables.json is zweapon.rdr's records, re-read through throwableRecord", () => {
    const zw = script(zweapon!, 'zweapon.rdr');
    const records = Object.fromEntries(Object.keys(THROWABLES.records).map((n) => [n, throwableRecord(zw, n)]));
    const det = (rdrGet(zw, 'ZWEAPON') as RdrNode[]).filter((r) => Array.isArray(r)).find((r) => rdrGet(r, 'InternalName') === 'Detonator')!;
    expect({ records, detonator: { id: Number(rdrGet(det, 'ID')), model: rdrGet(det, 'ModelName'), icon: rdrGet(det, 'IconTextureName') } })
      .toEqual({ records: THROWABLES.records, detonator: THROWABLES.detonator });
  });

  it.skipIf(!readerc)("soils.json and decals.json are materials.rdr's SOILS and decals.rdr's sets, re-read", () => {
    expect(soilsTable(script(readerc!, 'materials.rdr'))).toEqual(SOILS_PIN);
    const decals = script(readerc!, 'decals.rdr');
    expect({ GRENADE_BLAST: decalSetRows(decals, 'GRENADE_BLAST'), BULLET_MARK_SMALL: decalSetRows(decals, 'BULLET_MARK_SMALL') })
      .toEqual({ GRENADE_BLAST: DECALS.GRENADE_BLAST, BULLET_MARK_SMALL: golden<{ BULLET_MARK_SMALL: unknown }>('decals.json').BULLET_MARK_SMALL });
  });

  it.skipIf(!readerc || !motion)("throwClips.json is motion.rdr's playback and MOTION_P.ZAR's keys, re-read", () => {
    const animations = rdrGet(script(readerc!, 'motion.rdr'), 'animations') as RdrNode[];
    const clips = parseMotionZar(Zar.parse(motion!));
    const read = Object.fromEntries(Object.keys(CLIPS).map((clip) => {
      const entry = animations.find((r) => Array.isArray(r) && rdrGet(r, 'anim_name') === clip) as RdrNode;
      return [clip, { playback: Number(rdrGet(entry, 'playback')), frames: Math.round(clips.find((c) => c.name === clip)!.duration * 30) }];
    }));
    expect(read).toEqual(CLIPS);
  });
});

