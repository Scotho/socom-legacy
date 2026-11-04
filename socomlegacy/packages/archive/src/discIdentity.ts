import type { AssetSource } from './assetSource';

/**
 * The executable the retail SOCOM II (USA) disc boots: `SYSTEM.CNF`'s `BOOT2 = cdrom0:\SCUS_972.75;1`
 * (`socomlegacy/docs/roadmap/02-boot.md` B1, from `game/disc/SYSTEM.CNF`). The release parity is measured against.
 */
export const SOCOM2_US_BOOT = 'SCUS_972.75';

/** One release of SOCOM II: the serials printed on its discs and what it is. */
export interface Socom2Release {
  readonly serials: readonly string[];
  readonly region: string;
  readonly edition: string;
}

/**
 * Every dumped retail release of SOCOM II, by the executable its `SYSTEM.CNF` boots (DA.R8 as amended 2026-10-28: the
 * page only extracts the disc's files, so any retail release is taken; the betas and the demo are not). From
 * redump.org's PS2 entries (discs 5230, 5220, 47394, 52692, 23093, 55124; read 2026-10-28): the boot name is the
 * "Internal Serial" with `-` as `_` and a `.` after its third digit. SCKA-20053 (BigHit) carries SCKA-20020's.
 */
export const SOCOM2_RELEASES: Readonly<Record<string, Socom2Release>> = {
  'SCUS_972.75': { serials: ['SCUS-97275', 'SCUS-97275GH'], region: 'USA', edition: 'retail, Greatest Hits (1.02)' },
  'SCES_519.04': { serials: ['SCES-51904', 'SCES-51904/GER', 'SCES-51904/P'], region: 'Europe', edition: 'retail, Platinum, headset bundle (1.01)' },
  'SCES_523.06': { serials: ['SCES-52306'], region: 'Australia', edition: 'retail (1.00)' },
  'SCPS_150.65': { serials: ['SCPS-15065'], region: 'Japan', edition: 'retail (1.00)' },
  'SCKA_200.20': { serials: ['SCKA-20020', 'SCKA-20053'], region: 'Korea', edition: 'retail, headset bundle (1.01), BigHit (2.00)' },
};

/** The release of SOCOM II whose disc boots `boot` (any case), or null when no release does. */
export function socom2Release(boot: string): Socom2Release | null {
  return Object.hasOwn(SOCOM2_RELEASES, boot.toUpperCase()) ? SOCOM2_RELEASES[boot.toUpperCase()]! : null;
}

/** What a disc's `SYSTEM.CNF` says: the boot executable's name, and its `VER` and `VMODE` lines (null when absent). */
export interface DiscIdentity {
  boot: string;
  ver: string | null;
  vmode: string | null;
}

/**
 * The disc behind `source`, from its `SYSTEM.CNF` alone (disc-access plan DA-2, DA.R8: identity before use) -- no other
 * file is read, so a wrong folder is refused before a map or a movie is touched. A **browser adaptation** (DA.R2): the
 * PS2's boot ROM reads the same file to find the executable; here it only tells a SOCOM II disc from anything else.
 * Throws when there is no `SYSTEM.CNF` (not a PS2 disc's root), when it has no `BOOT2` line, and when the boot name is
 * none of `SOCOM2_RELEASES`, naming what it found.
 */
export async function discIdentity(source: AssetSource): Promise<DiscIdentity> {
  let bytes: Uint8Array;
  try {
    bytes = await source.read('SYSTEM.CNF');
  } catch (e) {
    throw new Error(
      `no SYSTEM.CNF here, so this is not a PS2 disc's root: choose the disc itself, or the folder that holds its files (${e instanceof Error ? e.message : String(e)})`,
      { cause: e },
    );
  }
  const lines = new Map<string, string>();
  for (const line of new TextDecoder('latin1').decode(bytes).split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    if (!lines.has(key)) lines.set(key, line.slice(eq + 1).trim());
  }
  const boot2 = lines.get('BOOT2');
  if (boot2 === undefined) throw new Error('SYSTEM.CNF has no BOOT2 line, so it names no game to boot: this is not a PS2 game disc');
  // `cdrom0:\SCUS_972.75;1` -> `SCUS_972.75`: the name after the device and its last separator, without the version.
  const name = boot2.slice(Math.max(boot2.lastIndexOf('\\'), boot2.lastIndexOf('/'), boot2.lastIndexOf(':')) + 1);
  const boot = (name.includes(';') ? name.slice(0, name.indexOf(';')) : name).toUpperCase();
  if (socom2Release(boot) === null) {
    throw new Error(`this disc boots ${boot || JSON.stringify(boot2)}; this game needs a SOCOM U.S. Navy SEALs II disc (any release: ${Object.keys(SOCOM2_RELEASES).join(', ')})`);
  }
  return { boot, ver: lines.get('VER') ?? null, vmode: lines.get('VMODE') ?? null };
}
