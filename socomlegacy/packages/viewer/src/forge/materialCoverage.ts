/**
 * What each material of the table (`@s2u/scene` `materialTable`, by SOILS name) has on the disc (the Forge's owner (crispy, OT.R112),
 * 2026-11-20: "for each one that is broken or doesn't have sound or hit effects, label it"): read off the disc once and
 * transcribed here; `test/forge/materialCoverage.test.ts` reads the disc again and holds this to it (SOCOM_ISO).
 * - **steps**: `materials.rdr`'s step sounds (STEPSOUND, STEALTH_STEPSOUND, CRAWLSOUND, LANDSOUND): `'yes'` held by
 *   some bank of `RUN/SOUNDS/BNKSTORE.ZAR`; `'none'` the record names none (a wall's, a volume's); `'missing'` it names
 *   sounds no bank on the disc holds (BROKEN GLASS: `.STEP_GLASS`, `.STEALTH_GLASS`, `.GLASS_JUMP`) -- silent on the
 *   console too.
 * - **hitEffect**: a `bullet_hit_<material>` zAnim on the maps (the common set's, on every map that reads).
 * - **hitSound**: the sound script's `bullet_hit_<material>` callback.
 * - **mark**: `decals.rdr`'s BULLET_MARK_SMALL row for the material.
 * A material absent here (none is) is taken as having everything.
 */
export interface MaterialCoverage { steps: 'yes' | 'none' | 'missing'; hitEffect: boolean; hitSound: boolean; mark: boolean }

const ALL: MaterialCoverage = { steps: 'yes', hitEffect: true, hitSound: true, mark: true };
const row = (steps: MaterialCoverage['steps'], hitEffect: 0 | 1, hitSound: 0 | 1, mark: 0 | 1): MaterialCoverage =>
  ({ steps, hitEffect: !!hitEffect, hitSound: !!hitSound, mark: !!mark });

export const MATERIAL_COVERAGE: Readonly<Record<string, MaterialCoverage>> = {
  UNKNOWN: row('none', 0, 0, 0), PARTICLE_SYSTEM: row('none', 0, 0, 0), ACTION: row('none', 0, 0, 0), INVISIBLE_DI: row('none', 0, 0, 0),
  GRASS: ALL, SAND: ALL, MUD: row('yes', 1, 1, 0), STONE: ALL, DIRT: ALL,
  GLASS: row('none', 1, 1, 1), GLASS_THICK: row('none', 1, 1, 1),
  WATER: row('yes', 1, 1, 0), UNDERWATER: row('yes', 0, 0, 0), PERSON: row('none', 1, 1, 1),
  'BROKEN GLASS': row('missing', 0, 0, 0),
  LEAVES: row('yes', 1, 1, 0), ICE: ALL, SNOW: ALL, GRAVEL: row('yes', 1, 1, 0),
  WOOD_THICK: ALL, WOOD_THIN: ALL, RUBBER: row('none', 1, 1, 0), ASPHALT: ALL,
  LEAFY_TREE: row('none', 1, 1, 0), SNOWY_TREE: row('none', 0, 0, 0),
  METAL_THICK: ALL, METAL_THIN: ALL, METAL_RAILING: row('none', 0, 0, 0),
  METAL_GRATE: row('yes', 0, 0, 0), METAL_GRATE_THIN: row('yes', 0, 0, 0),
  FABRIC_HEAVY: ALL, PIPE_STEAM: row('none', 1, 1, 1), GASTANK: row('none', 1, 1, 1), ITEM: row('none', 0, 0, 0),
  CAMO_NET: row('none', 0, 0, 0), THATCH: row('yes', 1, 1, 0), CHAINLINK_FENCE: row('none', 0, 0, 0),
  LEATHER: row('none', 1, 1, 1), BARREL: row('none', 1, 1, 1), PLASTER: ALL, CARPET: ALL,
  GRASS_VOL: row('none', 0, 0, 0), BUSH_VOL: row('none', 0, 0, 0), SNOWY_GRASS_VOL: row('none', 0, 0, 0),
  GLASS_OPAQUE: row('none', 1, 1, 1), GLASS_MEDIUM: row('none', 1, 1, 1),
};

export const coverageOf = (name: string): MaterialCoverage => MATERIAL_COVERAGE[name.toUpperCase()] ?? ALL;

/**
 * What a material lacks, in words, or '' for nothing: "broken" first where the disc names sounds it does not hold;
 * the bullet hit's three parts said as one when all are absent.
 */
export function coverageWords(name: string): string {
  const c = coverageOf(name);
  const parts: string[] = [];
  if (c.steps === 'missing') parts.push('broken: its footstep sounds are not on the disc');
  else if (c.steps === 'none') parts.push('no footsteps');
  if (!c.hitEffect && !c.hitSound && !c.mark) parts.push('no bullet hits');
  else {
    const lack = [!c.hitEffect && 'hit effect', !c.hitSound && 'hit sound', !c.mark && 'bullet mark'].filter(Boolean) as string[];
    if (lack.length) parts.push(`no ${lack.join(', no ')}`);
  }
  return parts.join('; ');
}
