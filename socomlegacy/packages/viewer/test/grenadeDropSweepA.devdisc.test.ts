// @vitest-environment node
import { defineDropSweep } from './helpers/grenadeDropSweep';

/**
 * GRENADE-ONE-SIDED's real-map drop sweep, group A (the main controller's merge bar, 2026-11-25T05:50Z; the method, the
 * pass-through rule and the counts: `./helpers/grenadeDropSweep.ts`). A dev-disc test: it skips without `SOCOM_DISC`
 * (or `<SOCOM_PC_ROOT>/game/disc`), and a map of the group not on the disc is skipped by name. It FAILS on any
 * pass-through. The day/night variants (`@s2u/archive` `MAP_VARIANTS`: MP5 day, MP64 day, MP6 night) change the
 * picture only (`src/variants/withVariant.ts` touches no collision), so their hulls are their maps' and are swept here.
 * Run (from socomlegacy/packages/viewer): `npx vitest run test/grenadeDropSweepA.devdisc.test.ts`.
 */
defineDropSweep('A', ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8'], 8);
