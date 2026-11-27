/**
 * `decals.rdr`'s `PERM_DECAL_POOL` `BASE 30, OVERFLOW 0` (read into `0x4b5050`, decomp 324141-324148): the permanent
 * pool the grenade's blast set goes to (`FUN_003b3800` 306401-306402, a negative size), one entry per kept world
 * triangle. `FUN_003bf1a0` (313254-313262) refuses once `count >= base + overflow`; nothing trims it (`FUN_003bf110`
 * runs on `0x4b5030` only: 218207, 219048, 236776) until `FUN_003bf050` empties it: at the level's teardown
 * (`FUN_0031af70`, 218218-218219) and at every MP round's end (CMPExitState `FUN_00223970` L76084 -> `FUN_0031c880`,
 * 219059-219060, which empties the temporary pool too). So a round keeps its first 30 scorch triangles and refuses the
 * rest (`GrenadeThrower.clearScorches`, `Fire.clearMarks`, `Effects.clearFootprints` at each round's start).
 */
export const PERM_DECAL_TRIANGLES = 30;
