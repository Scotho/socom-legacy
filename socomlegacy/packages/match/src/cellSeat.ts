/**
 * CPS cell-alive (2026-11-03; product track, a dev-only switch of the client performance sprint's live cell, with no
 * original): `S2U_CELL_DEATHLESS_SEAT=<player name>` read by the central process the cell spawns
 * (`tools/perf/cpf/live.ts` `treeServerSpecs`, set by `tools/perf/cpf/liveRun.ts` to its seat's own name unless
 * `--mortal`) into the server's room options, `RoomOptions.deathlessSeat` (`./room.ts`): that one player's health is
 * never reduced. Window 2's nine runs (07:34-08:03Z) were not comparable -- the seat's fake pad walked it into 15 bots
 * and it was dead or spectating most of the 60 s window in several. Unset or empty -- every deployment, every other
 * run -- no option at all: the room is what it was. Not a deployment setting (no `deploy/env.example` row).
 */
import type { RoomOptions } from './room';

export const CELL_DEATHLESS_SEAT_ENV = 'S2U_CELL_DEATHLESS_SEAT';

/** The room option the environment names, or none. */
export function cellDeathlessSeat(env: Readonly<Record<string, string | undefined>>): Pick<RoomOptions, 'deathlessSeat'> {
  const seat = env[CELL_DEATHLESS_SEAT_ENV];
  return seat ? { deathlessSeat: seat } : {};
}
