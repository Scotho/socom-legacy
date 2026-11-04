/**
 * A disc mounted from a file pick lives only in this page (PWA update, a browser adaptation).
 * A reload drops it: the launcher returns to "Disc needed", and the forge asks again after Play.
 * The kept extraction and the served tree are not marked; a reload does not drop those.
 */

let held = false;

export function noteDiscSource(source: { kind: string } | null | undefined): void {
  if (source && (source.kind === 'iso' || source.kind === 'dir')) held = true;
}

export function fileDiscMounted(): boolean {
  return held;
}

/** Tests that open a disc and then assert the update decision. */
export function resetFileDiscForTest(): void {
  held = false;
}
