/**
 * LATER 1265 (its pair review's F3; a browser adaptation, product track): the page's record that a front GPU surface was
 * refused WebGL2 (`./uiGpuPresenter`'s `unavailable('no-webgl2')`, the same verdict its `uigpufallback` row reports). Its own
 * module, with no imports, so `./matchEntryGate` (in the front end's chunk) reads it without pulling the presenter in.
 */
let refused = false;

/** The front surface found no WebGL2 (`./uiGpuPresenter`). */
export function noteFrontRefusedWebgl2(): void { refused = true; }
/** Whether a front surface on this page found no WebGL2. */
export function frontRefusedWebgl2(): boolean { return refused; }
/** Tests only. */
export function resetFrontGpuVerdictForTest(): void { refused = false; }
