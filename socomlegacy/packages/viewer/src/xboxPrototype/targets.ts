import { rayNearest, rayRecords, type HitBody, type RecordSink } from '../net/hitVolumes';

interface Target { alive: boolean; body: HitBody; node(name: string): [number, number, number] | null }
/** Raw renderer adapter for RemotePlayers' numeric aim path: the same posed bone
 * boxes, nearest entry and sorted strict penetration records. The room still
 * decides damage. Own only CPU rig metadata, never rendered mesh containers.
 */
export function prototypeTargets() {
  const targets = new Map<number, Target>(), records: number[] = [];
  const sink: RecordSink = (_part, distance) => { records.push(distance); };
  return {
    set(id: number, target: Target) { targets.set(id, target); },
    delete(id: number) { targets.delete(id); },
    keep(ids: ReadonlySet<number>) { for (const id of targets.keys()) if (!ids.has(id)) targets.delete(id); },
    clear() { targets.clear(); records.length = 0; },
    distance(eye: [number, number, number], direction: [number, number, number], reach: number): number | null {
      let best: number | null = null;
      for (const target of targets.values()) {
        if (!target.alive) continue;
        const distance = rayNearest(eye, direction, reach, target.body);
        if (distance !== null && (best === null || distance < best)) best = distance;
      }
      return best;
    },
    records(eye: [number, number, number], direction: [number, number, number], reach: number): number[] {
      records.length = 0;
      for (const target of targets.values()) if (target.alive) rayRecords(eye, direction, reach, target.body, sink);
      records.sort((a, b) => a - b);
      let kept = 0, before = 0;
      for (let i = 0; i < records.length; i++) {
        const distance = records[i]!;
        if (i === 0 || distance > before) records[kept++] = distance;
        before = distance;
      }
      records.length = kept; return records;
    },
    alive(id: number) { return targets.get(id)?.alive ?? false; },
    ids() { return targets.keys(); },
    feet(id: number): [number, number, number] | null {
      const feet = targets.get(id)?.body.feet; return feet ? [feet[0]!, feet[1]!, feet[2]!] : null;
    },
    node(id: number, name: string): [number, number, number] | null {
      return targets.get(id)?.node(name) ?? null;
    },
  };
}
