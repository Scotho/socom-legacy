import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { parseMotionClip, type MotionClip } from '@s2u/scene';
import { fadd } from '@s2u/ui';
import { motionTableFromArchive, type MotionEntry } from './motionTable';

/**
 * Research 303: the dances off the disc -- `READERC.ZAR/animset.rdr`'s GLOBAL `victory_dance` mode `default` (the seven
 * clips and their weights, inherited by the Seal and Guard anim sets), each clip out of the map's own `MOTION_S.ZAR` and
 * its `motion.rdr` row (playback, `NoFire`, `looped(0)`). A clip or row missing disables the action: nothing stands in.
 */
export interface VictoryVariant { name: string; weight: number; clip: MotionClip; motion: MotionEntry }
export interface VictoryData { variants: VictoryVariant[]; missing: string[] }

export function victoryModes(rdr: RdrNode): { name: string; weight: number }[] {
  if (!Array.isArray(rdr)) return [];
  if (rdrGet(rdr, 'type_name') === 'victory_dance') {
    const modes = rdrGet(rdr, 'modes');
    if (!Array.isArray(modes) || modes[0] !== 'default') return [];
    return modes.slice(1).flatMap(v => Array.isArray(v) && typeof v[0] === 'string' && Number.isFinite(Number(v[1]))
      ? [{ name: v[0], weight: Number(v[1]) }] : []);
  }
  for (const v of rdr) { const found = victoryModes(v); if (found.length) return found; }
  return [];
}

/** Missing data disables the action: never substitutes another clip. */
export function victoryFromBytes(map: Uint8Array, readerc: Uint8Array | null): VictoryData {
  const out: VictoryData = { variants: [], missing: [] };
  try {
    if (!readerc) throw Error('RUN/READERC.ZAR unavailable');
    const r = Zar.parse(readerc), key = r.find('animset.rdr');
    if (!key) throw Error('READERC.ZAR/animset.rdr unavailable');
    const modes = victoryModes(parseRdr(r.data(key)));
    if (!modes.length) throw Error('animset.rdr/victory_dance/default unavailable');
    const table = motionTableFromArchive(readerc);
    const pack = Zar.parse(zdbMember(map, parseZdb(map), 'MOTION_S.ZAR'));
    for (const mode of modes) {
      const k = pack.find(mode.name), motion = table?.get(mode.name);
      if (!k || !motion || motion.playback === null || motion.looped !== false) {
        out.missing.push(`MOTION_S.ZAR or motion.rdr: ${mode.name}`); continue;
      }
      out.variants.push({ ...mode, clip: parseMotionClip(pack.data(k), mode.name), motion });
    }
    if (out.missing.length) out.variants = [];
  } catch (e) { out.variants = []; out.missing.push(String(e)); }
  return out;
}

/**
 * The room's pick (`FUN_0057dcc0` D:L440577-440613 -> `FUN_005e3da0`, whose weighted pick is `FUN_005e5970`
 * D:L497005+): the first variant whose cumulative single-precision weight is at least the draw, the last one past them.
 */
export function chooseVictory(variants: readonly Pick<VictoryVariant, 'weight'>[], random: number): number {
  if (!variants.length || !Number.isFinite(random) || random < 0 || random > 1) return -1;
  let sum = 0;
  for (let i = 0; i < variants.length; i++) {
    sum = fadd(sum, Math.fround(variants[i]!.weight));
    if (Math.fround(random) <= sum) return i;
  }
  return variants.length - 1;
}

/**
 * Research 303: the play clips with the map's dances in (their clips and `motion.rdr` rows), so a body -- the page's own
 * (`Play`), the others' (`./remotePlayers`) -- draws the room's variant; the clips unchanged for a map without them.
 */
export function withVictoryClips<T extends { clips: MotionClip[]; table: [string, MotionEntry][] | null }>(clips: T | null, victory: VictoryData | null | undefined): T | null {
  const v = victory?.variants ?? [];
  if (!clips || !v.length) return clips;
  const have = new Set(clips.clips.map((c) => c.name));
  const add = v.filter((x) => !have.has(x.name));
  if (!add.length) return clips;
  return { ...clips, clips: [...clips.clips, ...add.map((x) => x.clip)], table: [...(clips.table ?? []), ...add.map((x): [string, MotionEntry] => [x.name, x.motion])] };
}
