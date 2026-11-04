// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CardSlots, Libmc, PersonaCard } from '@s2u/card';
import { FsAssetSource } from '@s2u/archive/node';
import { VALVE_TYPE, type ValveEntry } from '@s2u/ui';
import { bootValves, readGlobalValves, restoreValveModule, valveModule, VALVE_MODULE } from '../../src/originalOptions';
import { cardOptionStore } from '../../src/modern/settings/store';

/**
 * MU-5b: the card store (`src/modern/settings/store.ts`, the console's Options' store, CX.R5) seeds its
 * registry with the table as `CValve_Open` does at the game's start (`bootValves`; `FUN_00351d40`, the call D:L152619),
 * so a first write saves the whole `CValveSaveManager` module the original's save path writes for that registry
 * (`personaHost` `saveValves`: `valveModule(registry, held)`, `CValveSaveManager_Serialize` `FUN_00352a90`
 * D:L251470-251480) -- the same names, values and order. CX-25 retired the modern Settings section that read the table
 * through the launcher's seam; the console's Options read it now (`test/console/adapters/options.test.ts`).
 */
const memory = () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
const moduleOf = (slots: CardSlots): unknown => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
  card.load();
  return card.part(VALVE_MODULE);
};
/** The module the original's save path writes (`personaHost` `saveValves`) over the boot registry, after one change. */
function originalModule(table: readonly ValveEntry[], held: unknown, change: [string, number]): Record<string, number> {
  const registry = bootValves(table);
  restoreValveModule(registry, held);
  registry.set(change[0], change[1], VALVE_TYPE.PERSIST);
  return valveModule(registry, held);
}
/** A table in `global_valves.rdr`'s shape: PERSIST rows among untyped (PERM) ones, the option valves among them. */
const TABLE: ValveEntry[] = [
  { name: 'SetSabre', value: 0, type: 'PERSIST' },
  { name: 'PopupNewsOnce', value: 0 },
  { name: 'AutoAim', value: 1, type: 'PERSIST' },
  { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' },
  { name: 'ScreenOriginX', value: 128, type: 'PERSIST' },
  { name: 'ScreenOriginY', value: 128, type: 'PERSIST' },
  { name: 'GameComplete', value: 0, type: 'PERSIST' },
];

describe('the card store seeded with the disc\'s table', () => {
  it('a first-time card: the first write saves every PERSIST valve at its default, the one change over it -- the original\'s module byte for byte', () => {
    const slots = memory();
    const s = cardOptionStore(slots);
    s.seed!(TABLE);
    expect(s.valve('AutoAim')).toBe(1);                  // the table's default, before any save
    expect(s.setValve('AutoAim', 0)).toBe(true);
    const want = originalModule(TABLE, undefined, ['AutoAim', 0]);
    expect(JSON.stringify(moduleOf(slots))).toBe(JSON.stringify(want));
    expect(Object.keys(want)).toEqual(['SetSabre', 'AutoAim', 'BOBBING_1ST_PERSON', 'ScreenOriginX', 'ScreenOriginY', 'GameComplete']);
  });
  it('an older module: its names kept in its order, the table\'s PERSIST valves it lacks added, as the original\'s next save', () => {
    const slots = memory();
    const c = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), 0);
    const held = { GameComplete: 1, AutoAim: 1, Unlisted: 7 };
    c.load(); c.setPart(VALVE_MODULE, held); c.save();
    const s = cardOptionStore(slots);
    s.seed!(TABLE);
    expect(s.setValve('BOBBING_1ST_PERSON', 0)).toBe(true);
    expect(JSON.stringify(moduleOf(slots))).toBe(JSON.stringify(originalModule(TABLE, held, ['BOBBING_1ST_PERSON', 0])));
  });
  it('unseeded (no disc), a first write is the one valve, as before; seed(null) unseeds', () => {
    const slots = memory();
    const s = cardOptionStore(slots);
    s.seed!(TABLE); s.seed!(null);
    expect(s.valve('AutoAim')).toBeUndefined();
    expect(s.setValve('AutoAim', 0)).toBe(true);
    expect(moduleOf(slots)).toEqual({ AutoAim: 0 });
  });
});

const DISC = process.env.SOCOM_DISC ?? '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'READERC.ZAR'));

describe.skipIf(!HAVE_DISC)(`the first-time seed on the dev disc${HAVE_DISC ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it('a first write over the real global_valves.rdr saves the 65 PERSIST valves in the table\'s order, the original\'s module byte for byte', async () => {
    const table = await readGlobalValves(new FsAssetSource(DISC));
    const slots = memory();
    const s = cardOptionStore(slots);
    s.seed!(table);
    expect(s.setValve('INVERT_PITCH_CONTROLLER', 1)).toBe(true);
    const want = originalModule(table, undefined, ['INVERT_PITCH_CONTROLLER', 1]);
    expect(Object.keys(want)).toHaveLength(65);
    expect(Object.keys(want)).toEqual(table.filter((r) => r.type === 'PERSIST').map((r) => r.name));
    expect(JSON.stringify(moduleOf(slots))).toBe(JSON.stringify(want));
  });
});
