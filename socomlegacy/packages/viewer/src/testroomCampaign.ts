import { CAMPAIGN_STEMS, type MapInfo } from '@s2u/archive';
import type { SpawnSlot } from '@s2u/scene';
import type { DevSpot } from './devSpot';
import { withPlayerHere } from './forge/playFromHere';
import { campaignPathsOf } from './forge/servedPaths';
import { devMode } from './source';

/**
 * EPH campaign stand (a browser adaptation, a development instrument with no original; product track). The owner,
 * 2026-10-31: "might as well add the fix to bring both to the same location. i think i'd rather we just include the
 * campaign maps in the playtest room if we can and use that." The emulator parity harness (`tools/eph/run.ts`) compares
 * PCSX2 in the campaign's first mission with this page, so the devmode test room can load a campaign mission
 * (`RUN/M<NN>.ZDB`) and stand the player at the mission's start. The campaign is not a game mode here (MISSION): nothing
 * outside a development build's `/testroom?devmode` lists, loads or stands one, and nothing of the game's own behaviour
 * changes -- the room is the offline room it always is, only its round-1 slots are given where the disc's are not read.
 *
 * Why slots are given: the campaign's `AIMAPS` is not the multiplayer layout (research 200 U6), so `parseAiMaps` refuses
 * it and a loaded mission has no spawn slots; the room would stand the player at [0, 0, 0] (`match/src/room.ts`
 * `spawn`). The forge's Play from here (`./forge/playFromHere` `withPlayerHere`) gives index 0 of a side at a spot; this
 * gives it on both sides, before the room is made -- `&at=` (`./devSpot`) moves the walker only after the spawn, too late.
 */

/** A stand: feet x, y, z and `Pose.yaw` in degrees -- `./devSpot`'s `&at=`/`&yaw=` spot. */
export type CampaignSpot = DevSpot;

/** Where the instrument may run: a development build, the bare `?devmode`, the test room's path. */
export interface CampaignGate { devBuild: boolean; search: string; pathname: string }

const TESTROOM_PATH = /(?:^|\/)testroom(?:\/|$)/i;

export function campaignInstrumentOn(gate: CampaignGate): boolean {
  return gate.devBuild && devMode(gate.search) && TESTROOM_PATH.test(gate.pathname);
}

/** The campaign stem `wanted` names (`M51`, case aside), or null when it is not one of the disc's twelve. */
export function campaignStemOf(wanted: string): string | null {
  const stem = wanted.trim().toUpperCase();
  return (CAMPAIGN_STEMS as readonly string[]).includes(stem) ? stem : null;
}

/** The campaign mission archives among a listing (`./forge/servedPaths`; the worker reads it there, off this module's graph). */
export { campaignPathsOf };

/**
 * The picker's entry for the campaign mission `wanted` asks for (`?map=M51`), when the instrument is on and the source
 * holds `RUN/<stem>.ZDB` (`paths`: the worker's campaign list); null otherwise, and the picker is the allowlist's alone.
 */
export function campaignEntry(wanted: string, paths: readonly string[], name: string, gate: CampaignGate): MapInfo | null {
  if (!campaignInstrumentOn(gate)) return null;
  const stem = campaignStemOf(wanted);
  if (!stem) return null;
  const path = paths.find((p) => p.toUpperCase() === `RUN/${stem}.ZDB`);
  return path ? { archive: stem, path, name } : null;
}

/**
 * M51 Seeding Chaos's start, MEASURED, not read: the console's spawn feet (939.44, -145.87, 857.07) off PCSX2's memory,
 * `logs/parity/spawn_pcsx2.rdram` (research 82 §1.1, the slot-8 reference frame; research 201 §14 Stage A, :457-458).
 * The facing is the same dump's camera: eye (939.439, -126.264, 832.160) to target (939.439, -130.489, 858.341) runs
 * along +z, which the page's `Pose.yaw` (facing (-sin yaw, -cos yaw), `match/src/room.ts` `spawn`) calls 180. The
 * player stood crouched there; this stand does not set the stance.
 *
 * The build: research 201 reads that dump against the r0001 build's addresses ("r0001, the disc the console boots",
 * research 201 :20-21, :527, :661); no record names which image PCSX2 booted for the capture itself, and one of the
 * owner's PCSX2 instances boots r0004 (HAZARDS, "Which image the emulator ran"). A labelled measured adaptation of the
 * instrument; reading it off the disc (the campaign AIMAPS, research 200 U6) is owed, LATER 592.
 */
export const M51_INSERTION_MEASURED: Readonly<DevSpot> = { x: 939.44, y: -145.87, z: 857.07, yaw: 180 };

/** The campaign stems with a measured stand. Every other stem stands only at an `&at=` spot. */
const MEASURED: Readonly<Record<string, Readonly<DevSpot>>> = { M51: M51_INSERTION_MEASURED };

/**
 * Index 0 of side 0 and of side 1 at `spot`, each facing `spot.yaw` (degrees, `Pose.yaw`'s sense) -- the forge's
 * `withPlayerHere` slot, whose marker yaw is in radians with the step turning the other way (`./forge/matchMap`
 * `stepOfYaw`); the room turns a step back into `wrapYaw(-step * 45)`, so a yaw on a 45-degree step comes back whole and
 * any other to its nearest step (an `&at=` link's exact yaw is then placed by the page's own dev spot, after the spawn).
 */
export function standSlots(spot: Readonly<DevSpot>): SpawnSlot[] {
  const at: [number, number, number] = [spot.x, spot.y, spot.z];
  const yaw = (spot.yaw * Math.PI) / 180;
  return withPlayerHere(withPlayerHere([], 0, at, yaw), 1, at, yaw);
}

/**
 * The round-1 slots for a campaign load: null when nothing changes (not a campaign stem, or the map has slots of its
 * own); else the slots at `asked` (an `&at=` spot) over the stem's measured stand; with neither, a refusal the page
 * shows -- never a guessed spawn.
 */
export function campaignStand(
  stem: string, slots: readonly SpawnSlot[], asked: Readonly<DevSpot> | null,
): { slots: SpawnSlot[] } | { refused: string } | null {
  const campaign = campaignStemOf(stem);
  if (!campaign || slots.length > 0) return null;
  const spot = asked ?? MEASURED[campaign] ?? null;
  if (!spot) return { refused: `${campaign} has no measured start: add &at=x,y,z&yaw=d to stand the player (EPH campaign stand)` };
  return { slots: standSlots(spot) };
}
