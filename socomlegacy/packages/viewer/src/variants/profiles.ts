import { MAP_VARIANTS, mapVariant, type MapVariant } from '@s2u/archive';
import type { VariantProfile } from './profile';

/**
 * The variant profiles (DAY-3; DAY.R2: a variant is the pair stem and time). Each a browser adaptation with its own data
 * under `./data/` (DAY.R1's simulation-track tasks, never presented as the original). Built: Abandoned (Day) (MP5 day,
 * DAY-P1b, `./abandonedDay`); Rat's Nest (Day) (MP8 day, DAY-RN1 B3, `./ratsNestDay`, accepted: MISSION OT.R158). To come: DAY-P2 Shadow Falls (Day) (MP64 day); DAY-P3 Desert Glory (Night) (MP6 night).
 *
 * **Lazy, and gated by acceptance** (DAY.R9; DAY-R1b). A profile's data is read only when that variant is asked for, by
 * `loadVariantProfile` (a dynamic import of the profile's module, then one fetch a data file). A variant whose
 * `MAP_VARIANTS` row is accepted (Abandoned (Day), MP5 day, DAY-R1) has its data in every build, the release and the
 * public export included (the owner's exception, H490/H491, 2026-11-23T15:49Z: "Yes, all builds once accepted"); any
 * other variant's only where the development switch is on (`VARIANT_DATA`: a development build, which the test room is,
 * or `VITE_S2U_VARIANT_DATA=on`). `profileFor` stays synchronous (DAY-3's registry contract, `./testroomSwitch`
 * `VariantRegistry`) and answers the profiles loaded so far: undefined for every pair until `loadVariantProfile` has
 * resolved it, and always for a pair not accepted with the switch off. A page that wants a variant awaits
 * `loadVariantProfile(stem, variant)` before it asks.
 */
export const VARIANT_DATA_ADAPTATION =
  'a browser adaptation: a map variant\'s data is fetched only when the variant is asked for; an accepted variant (its MAP_VARIANTS row: MP5 day, MP8 day) in every build and the public export (the owner\'s exception, H490/H491: all builds once accepted; OT.R158 for MP8 day), any other only where VITE_S2U_VARIANT_DATA is on (a development build: dev and the test room); off, a pair not accepted is no profile and none of its data is emitted' as const;

/**
 * The switch (DAY.R9): on in a development build (`import.meta.env.DEV`: the dev server, the test room) or a build made
 * with `VITE_S2U_VARIANT_DATA=on` (test and nightly hosts); off in any other build. Read once, as `./main`'s
 * `VITE_S2U_*` switches are; the bundler replaces both operands with literals at build, so with it off the guarded
 * `import.meta.glob` below is dead code and no file of `./data/` is emitted (reasoned from how the bundler folds the
 * replaced constants, not measured on a build).
 */
const VARIANT_DATA: boolean = import.meta.env.DEV || import.meta.env.VITE_S2U_VARIANT_DATA === 'on';

/**
 * The data directories under `./data/` of the accepted variants (`<stem>-<variant>`: `MP5-day`), `MAP_VARIANTS`'
 * accepted rows (DAY-R1b). The release glob in `dataUrls` names each literally (a bundler glob is a literal); a test
 * holds the two equal, so accepting a variant means adding its directory to that glob, and one not accepted is never named.
 */
export const ACCEPTED_VARIANT_DATA_DIRS: readonly string[] = MAP_VARIANTS.filter((v) => v.accepted).map((v) => `${v.stem}-${v.variant}`);

/** Whether a data file's name under `./data/` (`MP5-day/pack.rgb8`) is an accepted variant's: its first segment, exactly. */
export function isAcceptedVariantData(name: string): boolean {
  const parts = name.split('/');
  return parts.length > 1 && ACCEPTED_VARIANT_DATA_DIRS.includes(parts[0]!) && !parts.some((p) => p === '..' || p === '.' || p === '');
}

/**
 * The switch for one pair (DAY-R1b): on, in every build, for a pair whose `MAP_VARIANTS` row is accepted; otherwise the
 * development switch (`VARIANT_DATA` for the page).
 */
export function variantDataOn(stem: string, variant: MapVariant, devSwitch: boolean): boolean {
  return mapVariant(stem.toUpperCase(), variant)?.accepted === true || devSwitch;
}

/** Reads one file under `./data/` (`MP5-day/pack.rgb8`); undefined when it is absent (the public export carries none). */
export type VariantDataReader = (name: string) => Promise<Uint8Array | undefined>;

/** The variants a profile is built for, each with the module that assembles it (imported only when asked for). */
const BUILT: readonly { stem: string; variant: MapVariant; load: (read: VariantDataReader) => Promise<VariantProfile | undefined> }[] = [
  { stem: 'MP5', variant: 'day', load: async (read) => (await import('./abandonedDay')).abandonedDayProfile(read) },
  // DAY-RN1 B3; accepted (MISSION OT.R158): read in every build, its data an owner-named exception as MP5-day's
  { stem: 'MP8', variant: 'day', load: async (read) => (await import('./ratsNestDay')).ratsNestDayProfile(read) },
];

/**
 * The data files a page can fetch, by their name under `./data/` -> a loader of the file's URL. In every build: the
 * accepted variants' files (the release globs name `MP5-day` and `MP8-day` literally, and each name is checked against
 * `ACCEPTED_VARIANT_DATA_DIRS`). With the development switch on as well: every file under `./data/` (that glob is never
 * reached with it off, and folded away at build, so no directory not accepted is emitted -- reasoned from how the
 * bundler folds the replaced constants, not measured on a build). Empty where `./data/` is absent.
 */
function dataUrls(devSwitch: boolean = VARIANT_DATA): Record<string, () => Promise<string>> {
  const out: Record<string, () => Promise<string>> = {};
  const name = (path: string) => path.replace(/^\.\/data\//, '');
  // one literal glob an accepted directory (a bundler glob is a literal): MP5-day (DAY-R1b), MP8-day (OT.R158)
  const accepted = {
    ...import.meta.glob<string>('./data/MP5-day/**/*', { query: '?url', import: 'default' }),
    ...import.meta.glob<string>('./data/MP8-day/**/*', { query: '?url', import: 'default' }),
  };
  for (const [path, url] of Object.entries(accepted)) if (isAcceptedVariantData(name(path))) out[name(path)] = url;
  if (VARIANT_DATA && devSwitch) {
    const found = import.meta.glob<string>('./data/**/*', { query: '?url', import: 'default' });
    for (const [path, url] of Object.entries(found)) out[name(path)] = url;
  }
  return out;
}

/** The data files under `./data/` the page can fetch (the accepted variants' only, with the development switch off). */
export function variantDataFiles(devSwitch: boolean = VARIANT_DATA): string[] {
  return Object.keys(dataUrls(devSwitch));
}

/** The page's reader: the file's URL from the glob, then one fetch. */
const fetchReader: VariantDataReader = async (name) => {
  const url = dataUrls()[name];
  if (!url) return undefined;
  const res = await fetch(await url());
  if (!res.ok) return undefined;
  return new Uint8Array(await res.arrayBuffer());
};

export interface VariantRegistryOptions {
  /** The development switch (`VARIANT_DATA` for the page's own registry); an accepted pair is on without it (DAY-R1b). */
  variantData: boolean;
  /** How a data file is read (the page's fetch by default; a test reads the files from disk). */
  read?: VariantDataReader;
}

/** A registry: `load` reads a variant's data once (when built and on: accepted, or the switch); `profileFor` answers what is loaded. */
export function createVariantRegistry(opts: VariantRegistryOptions) {
  const read = opts.read ?? fetchReader;
  const loaded = new Map<string, VariantProfile>();
  const pending = new Map<string, Promise<VariantProfile | undefined>>();
  const id = (stem: string, variant: MapVariant) => `${stem.toUpperCase()} ${variant}`;
  const built = (stem: string, variant: MapVariant) => BUILT.find((b) => b.stem === stem.toUpperCase() && b.variant === variant);
  return {
    profileFor(stem: string, variant: MapVariant): VariantProfile | undefined {
      return variantDataOn(stem, variant, opts.variantData) ? loaded.get(id(stem, variant)) : undefined;
    },
    load(stem: string, variant: MapVariant): Promise<VariantProfile | undefined> {
      const b = built(stem, variant);
      if (!variantDataOn(stem, variant, opts.variantData) || !b) return Promise.resolve(undefined);
      const k = id(stem, variant);
      let p = pending.get(k);
      if (!p) {
        p = b.load(read).then((profile) => { if (profile) loaded.set(k, profile); else pending.delete(k); return profile; },
          (e: unknown) => { pending.delete(k); throw e; });
        pending.set(k, p);
      }
      return p;
    },
  };
}

const PAGE = createVariantRegistry({ variantData: VARIANT_DATA });

/** The built profile for a stem (`MP5`, any case) and a time, once loaded; undefined otherwise (DAY-3's contract). */
export function profileFor(stem: string, variant: MapVariant): VariantProfile | undefined {
  return PAGE.profileFor(stem, variant);
}

/** Loads a variant's profile for `profileFor` (the data fetched once); undefined when none is built, or it is not accepted and the switch is off. */
export function loadVariantProfile(stem: string, variant: MapVariant): Promise<VariantProfile | undefined> {
  return PAGE.load(stem, variant);
}
