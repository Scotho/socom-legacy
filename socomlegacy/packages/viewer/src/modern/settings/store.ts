import { Libmc, MC_RESULT, PersonaCard, UI_VAR_MODULE, type CardSlots } from '@s2u/card';
import { TUNER_RANGE, VALVE_TYPE, ValveStore, type ValveEntry } from '@s2u/ui';
import { bootValves, restoreValveModule, valveModule, VALVE_MODULE } from '../../originalOptions';
import { pageCard } from '../../pageStore';
import { saveWithinCard } from '../cardSave';
import { liveOptionValue, optionCommitted } from '../../nativeOptionsContext';

/**
 * Where the settings page's values live (MU-5; MU.R2): the card's save file `BASCUS-97275SOCOMII`, as the original keeps
 * them -- the option valves in its `CValveSaveManager` module, the system tuners (the volumes, the brightness, the stick
 * tuners) in its `CUIVarManager` module (`./originalOptions` for both; research 229 §1, 302 §4). No second store, no
 * browser key. The page reads and writes through the same functions the original's save path runs:
 *
 * - **A valve** is read by `restoreValveModule` into a `ValveStore` (`CValveSaveManager_UnSerialize`, `FUN_00352960`
 *   D:L251422-251443: every entry `set` at PERSIST, a value held to its low 16 bits), written by `ValveStore.set` at
 *   PERSIST and the module rebuilt by `valveModule` (`CValveSaveManager_Serialize`, `FUN_00352a90` D:L251470-251480),
 *   which keeps the names the module held.
 * - **A tuner** is read as `restoreUiVarModule` reads it (a `real` clamped into `TUNER_RANGE`; any other record skipped)
 *   and written as that module's own shape, `{ type: 'real', value }`, beside the module's other variables.
 * - The file is read and written by `PersonaCard` over the page's `Libmc`, the personas as the file held them: the same
 *   calls the persona form's `LoadConfig` and `SaveConfig` make. A malformed file is refused (`PersonaCard.save` throws
 *   until the page's own "Error loading data" path has discarded it), never overwritten from here.
 *
 * **The registry under the card (MU-5b).** With the disc in, `seed` hands the store `global_valves.rdr` whole (the page's
 * `valveDefaults`, `./index`), and every read and write starts from the registry the original's boot makes of it --
 * `bootValves`, as `CValve_Open` (`FUN_00351d40`, the call D:L152619) loads it before the card's restore (OPT-02b,
 * research 229 §1) -- then restores the card's module over it and, for a write, rebuilds the module by `valveModule`:
 * the very calls of the front end's save path (`../../personaHost` `saveValves`). So a first-time card's first write
 * saves every PERSIST valve at the table's default with the one change over it, and an older module gains the PERSIST
 * names it lacks -- the module the original writes for that registry, its names, values and order. A valve a session
 * sets at PERSIST beyond the table (a script's own) is not in this page's registry: the page runs no session.
 * Unseeded (no disc), the registry is empty: a first-time card's first write holds that one valve, as before.
 *
 * **The card-save boundary (MU-F2b).** A write saves through `../cardSave` `saveWithinCard`: the original's space rule
 * (`IsSpaceForSaveGameFile`, `FUN_0027b3d0`) and libmc's Write rule for the enlarged file, counting what releasing
 * `SCRATCHPAD.DAT` frees (`SaveConfig`'s `FUN_003a1c60`), are asked before the writer deletes the old file; a refused
 * write leaves the old file and its modules as they were, and `refusal()` says why. The card is opened, changed and
 * saved over the boundary's staged copy and persisted once (MU-F2d): a browser refusal or another tab's save in
 * between writes nothing.
 *
 * Outside a running game this is the card alone. The Home overlay shares the running page's applied values through
 * `nativeOptionsContext`: a successful one-field card write updates that field in the same live managers, while
 * unrelated native NO-save changes stay active. Session disposal removes that browser-adaptation connection.
 */
export interface OptionStore {
  /** Whether the card can be read and written (a malformed file or a failing card says false). */
  usable(): boolean;
  /** An option valve's value as the card holds it, or undefined. */
  valve(name: string): number | undefined;
  /** A system tuner's value as the card holds it (a real in [0, 1]), or undefined. */
  tuner(name: string): number | undefined;
  /** Writes one valve; false when nothing was written. */
  setValve(name: string, value: number): boolean;
  /** Writes one tuner; false when nothing was written. */
  setTuner(name: string, value: number): boolean;
  /** Reads the card again (the next reads see what another writer saved). Optional: a fake has nothing to re-read. */
  reload?(): void;
  /** The disc's `global_valves.rdr` rows the registry starts from (`bootValves`), or null without the disc. Optional. */
  seed?(table: readonly ValveEntry[] | null): void;
  /**
   * Which card slot holds the file the page reads (LU-3: the Memory card group's `s2u-slot` head): 1 or 2, as `open`
   * below picks it (slot 1's file, else slot 2's; neither, slot 1, where a first save makes it); null when no card can
   * be opened. Optional: absent, the head says slot 1.
   */
  slot?(): 1 | 2 | null;
  /** Why the last write was refused (`../cardSave` `CARD_SAVE_REFUSED`), '' when it saved or was not tried. Optional. */
  refusal?(): string;
}

interface Opened { card: PersonaCard; malformed: boolean; port: 0 | 1; mc: Libmc }

/** The card as the page's persona form reads it: slot 1's file, else slot 2's; neither: slot 1, to be made. */
function open(slots: CardSlots): Opened | null {
  try {
    const mc = new Libmc(slots, { log: () => {} });
    let first: Opened | null = null;
    for (const port of [0, 1] as const) {
      const card = new PersonaCard(mc, port);
      const read = card.load();
      if (read.result >= 0) return { card, malformed: read.malformed !== undefined, port, mc };
      if (read.result === MC_RESULT.NoEntry && first === null) first = { card, malformed: false, port, mc };
    }
    return first;   // no file on either card: a first save makes it (what the original's SaveConfig does)
  } catch { return null; }
}

export function cardOptionStore(slots: CardSlots = pageCard): OptionStore {
  let snap: Opened | null | undefined;
  let table: readonly ValveEntry[] | null = null;
  let refused = '';
  const view = (): Opened | null => (snap === undefined ? (snap = open(slots)) : snap);

  const valves = (card: PersonaCard): ValveStore | null => {
    const store = table ? bootValves(table) : new ValveStore();
    return restoreValveModule(store, card.part(VALVE_MODULE)) ? store : null;
  };
  const write = (change: (card: PersonaCard) => boolean): boolean => {
    refused = '';
    snap = undefined;
    try {
      const out = saveWithinCard(slots, (staged) => {
        const fresh = open(staged);
        if (!fresh || fresh.malformed || !change(fresh.card)) return null;
        const card = fresh.card;
        return { mc: fresh.mc, port: fresh.port, size: card.contents().size, commit: () => card.save() };
      });
      if (out === null) return false;
      if (!out.ok) refused = out.message;
      return out.ok;
    } catch { return false; }
  };

  return {
    usable(): boolean { const v = view(); return v !== null && !v.malformed; },
    valve(name: string): number | undefined {
      const live = liveOptionValue(slots, 'valve', name);
      if (live !== undefined) return live;
      const v = view();
      return v && !v.malformed ? valves(v.card)?.find(name)?.value : undefined;
    },
    tuner(name: string): number | undefined {
      const live = liveOptionValue(slots, 'tuner', name);
      if (live !== undefined) return live;
      const v = view();
      if (!v || v.malformed) return undefined;
      const part = v.card.part(UI_VAR_MODULE);
      if (typeof part !== 'object' || part === null || Array.isArray(part)) return undefined;
      const hit = Object.entries(part as Record<string, unknown>).find(([k]) => k.toUpperCase() === name.toUpperCase())?.[1] as { type?: unknown; value?: unknown } | undefined;
      if (!hit || hit.type !== 'real' || typeof hit.value !== 'number' || !Number.isFinite(hit.value)) return undefined;
      return Math.min(TUNER_RANGE[1], Math.max(TUNER_RANGE[0], hit.value));
    },
    setValve(name: string, value: number): boolean {
      let committed: number | undefined;
      const saved = write((card) => {
        const held = card.part(VALVE_MODULE);
        const store = valves(card);
        if (!store) return false;
        store.set(name, value, VALVE_TYPE.PERSIST);
        committed = store.find(name)?.value;
        card.setPart(VALVE_MODULE, valveModule(store, held));
        return true;
      });
      if (saved && committed !== undefined) optionCommitted(slots, 'valve', name, committed);
      return saved;
    },
    setTuner(name: string, value: number): boolean {
      let committed: number | undefined;
      const saved = write((card) => {
        const held = card.part(UI_VAR_MODULE);
        if (held !== undefined && (typeof held !== 'object' || held === null || Array.isArray(held))) return false;
        const clamped = Math.min(TUNER_RANGE[1], Math.max(TUNER_RANGE[0], value));
        committed = clamped;
        const key = Object.keys((held ?? {}) as object).find((k) => k.toUpperCase() === name.toUpperCase()) ?? name;
        card.setPart(UI_VAR_MODULE, { ...(held as Record<string, unknown> | undefined), [key]: { type: 'real', value: clamped } });
        return true;
      });
      if (saved && committed !== undefined) optionCommitted(slots, 'tuner', name, committed);
      return saved;
    },
    reload(): void { snap = undefined; },
    slot(): 1 | 2 | null { const v = view(); return v ? (v.port === 0 ? 1 : 2) : null; },
    seed(rows: readonly ValveEntry[] | null): void { table = rows; },
    refusal(): string { return refused; },
  };
}
