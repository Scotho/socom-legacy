/**
 * The menu input (PLAT-11; web research 116): the pad's button states and flush, the stick's hysteresis, the focus
 * ring, the dispatch `FUN_00368650`, and its connection to the front end (`MenuInput`). The page's keys, pad and touch
 * enter through `MenuInputSource` (`packages/viewer/src/menuInput.ts`); the widgets answer the record (PLAT-15).
 */
export * from './padStates';
export * from './stick';
export * from './focusRing';
export * from './dispatch';
export * from './menuInput';
