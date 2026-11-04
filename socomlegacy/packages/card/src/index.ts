/**
 * @s2u/card -- the memory card (web sprint 6, ruling W6.R2; PLAT-02).
 *
 * Holds the simulated memory card as the owner's ruling R7 makes it (2026-10-01; it replaced R4): the browser storage
 * interface (PLAT-24), the card as two virtual slots in localStorage in redotcom's own JSON (PLAT-25), and libmc's
 * commands, result codes and free space over that file table (PLAT-26). Nothing here knows the PS2's card byte
 * formats: the reader of a game-written save is a dev tool, `tools/cardFile.ts`, which no package may import; the
 * card filesystem (PLAT-37) and the card file codec (PLAT-27) were dropped by R7.
 *
 * The boundary: pure, DOM-free, testable under Node. Never `@s2u/viewer`, never `three`, never a browser global: a
 * `Storage`, an `IDBFactory` or a `StorageManager` enters as a parameter and the viewer passes the real one (an
 * in-memory stand-in serves the tests). Enforced by `tools/test/packageBoundaries.test.ts`. The spec:
 * `docs/specs/2026-10-01-web-sprint-6-package-boundaries.md`.
 *
 * PLAT-24 (research 99): `ByteStore` and its two backends (`MemoryStore`, and `IdbStore`, parked by R7: built and
 * reviewed, unused by the card), the page's guarded `Settings`, and `migrateOnce` for an old key that changes home.
 *
 * PLAT-25 (research 99 §7): `CardSlots`, the two slots -- one versioned JSON record each (`s2u.card.v1.slot1`/`2`): the
 * card's state, its files and folders with the original's nominal sizes counted against the stub's 8000 clusters,
 * `ext` beside the card, and a revision that refuses another tab's stale save as `changed`.
 *
 * OPT-04a (research 135): `PersonaCard`, the persona records as R7's JSON in the `BASCUS-97275SOCOMII` file, saved and
 * loaded over `Libmc` in the original's command order; the password kept as its length only.
 *
 * ONL-01a (research 136): the saved network configuration -- Sony's `BWNETCNF` folder with our JSON naming our server
 * -- written at first use (`ensureNetCnf`) and read back as LOGIN's `NetCnfOpen` reads it (`netCnfOpen`).
 */
export * from './store';
export * from './idbStore';
export * from './settings';
export * from './migrate';
export * from './cardSlots';
export * from './libmc';
export * from './persona';
export * from './netcnf';
