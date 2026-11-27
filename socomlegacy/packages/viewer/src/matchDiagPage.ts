import { pageBeaconContext, pageClientErrorBeacon, setBeaconLossDiag } from './clientErrorBeacon';
import { pageDeviceSignals } from './deviceClass';
import { inputSources } from './inputSources';
import { loadStartedAt, setLoadMarkListener } from './loadMarks';
import { MatchDiag, xboxMarks, type DiagStage, type PageState } from './matchDiag';
import { bufferPayloadBytes } from './payloadBytes';
import { pageSoftwareProbe } from './softwareRenderer';

/**
 * XBOX-DIAG's page side (`./matchDiag`; product track, an instrument): the page's one diagnostic, made by the match's
 * chunk -- since XBOX-790-LOADDIAG with its match loader, not at the first mount, so a loss during the first load
 * reports and the load's stages follow (`followLoad`) -- which also hands the error beacon its loss hook
 * (`setBeaconLossDiag`), so the entry imports none of it (OT.R12). The page's state is read when a report goes: `navigator.gamepadInputEmulation` (Edge on
 * Xbox's; absent elsewhere), focus, visibility, `navigator.userActivation.hasBeenActive`, pointer lock.
 */

interface DiagNavigator { gamepadInputEmulation?: unknown; userActivation?: { hasBeenActive?: boolean }; deviceMemory?: number }

/** The page's state now, each part read alone (a part that throws is left out). */
export function readPageState(nav: DiagNavigator | undefined, doc: { hasFocus?(): boolean; visibilityState?: string; pointerLockElement?: unknown } | undefined): PageState {
  const out: PageState = {};
  const part = (f: () => void): void => { try { f(); } catch { /* left out */ } };
  part(() => { if (nav && 'gamepadInputEmulation' in nav) out.emulation = nav.gamepadInputEmulation ?? null; });
  part(() => { if (doc?.hasFocus) out.focus = doc.hasFocus(); });
  part(() => { if (doc?.visibilityState !== undefined) out.visibility = doc.visibilityState; });
  part(() => { const a = nav?.userActivation?.hasBeenActive; if (typeof a === 'boolean') out.activation = a; });
  part(() => { if (doc && 'pointerLockElement' in doc) out.pointerLock = doc.pointerLockElement != null; });
  return out;
}

let page: MatchDiag | null = null;

export function pageMatchDiag(): MatchDiag {
  if (page) return page;
  const nav = (): DiagNavigator | undefined => (globalThis as { navigator?: DiagNavigator }).navigator;
  const made = new MatchDiag({
    marks: () => xboxMarks(pageDeviceSignals()),
    page: () => readPageState(nav(), (globalThis as { document?: Document }).document),
    sources: inputSources,
    backend: () => pageBeaconContext().backend,
    heapMB: () => {
      const m = (globalThis.performance as { memory?: { usedJSHeapSize?: number } } | undefined)?.memory;
      return typeof m?.usedJSHeapSize === 'number' ? m.usedJSHeapSize / 1_048_576 : null;
    },
    deviceMemory: () => (typeof nav()?.deviceMemory === 'number' ? nav()!.deviceMemory! : null),
    parallelCompile: () => pageSoftwareProbe().parallelCompile ?? null,   // XBOX-WARM: the page's one probe context (GM-XBOX1), never a second
    send: (kind, message) => { pageClientErrorBeacon().reportDiag(kind, message); },
  });
  page = made;
  setBeaconLossDiag((why) => { made.lost(why, globalThis.performance?.now() ?? 0); });
  followLoad(made);
  return made;
}

const pageNow = (): number => globalThis.performance?.now() ?? 0;

/**
 * XBOX-790-LOADDIAG (`./matchDiag`'s stage lane): `d` follows the load's phases through `./loadMarks`' listener -- a
 * load already started when `d` was made (the front end's `load-start` comes before the match's chunk) caught up from
 * its start, the heap not read then (it is not the start's).
 */
export function followLoad(d: MatchDiag, now: () => number = pageNow): void {
  const at = loadStartedAt();
  if (at !== null) d.loadBegin(at, false);
  setLoadMarkListener((phase) => { const t = now(); if (phase === 'load-start') d.loadBegin(t); else d.loadStage(phase, t); });
}

/**
 * XBOX-790-LOADDIAG: one of the loader's stages (`./matchMount` `matchLoader`) on the page's diagnostic (`d`, else the
 * page's, looked up inside the `try`: review L2). Never throws.
 */
export function noteLoadStage(stage: DiagStage, d?: MatchDiag, now: () => number = pageNow): void {
  try { (d ?? pageMatchDiag()).loadStage(stage, now()); } catch { /* an instrument never stops the load */ }
}

/**
 * XBOX-790-LOADDIAG review M1: the loader's load settled with no mount (a prepare let go, a load failed, the loader
 * disposed) -- the diagnostic's stage lane closed (`MatchDiag.loadClose`; a mounted match's kept). Never throws.
 */
export function noteLoadClosed(d?: MatchDiag): void {
  try { (d ?? pageMatchDiag()).loadClose(); } catch { /* an instrument never stops the load */ }
}

/** The reply kinds that are stages (`DIAG_LOADER_STAGES`): what the loader asks of the worker, and its error. */
const REPLY_STAGES: ReadonlySet<string> = new Set<DiagStage>(['map', 'play', 'effects', 'sound', 'soundLoops', 'error']);

/**
 * XBOX-790-LOADDIAG: a worker reply the loader took (`matchLoader`'s `ask`), as a stage: a reply of the loader's kinds
 * with the bytes it carries (`./payloadBytes`: each backing buffer once, a lower bound when the walk is capped); an
 * `error` reply with none, and nothing of its text; progress, loading and any other kind none. Never throws.
 */
export function noteLoadReply(reply: { kind: string; [key: string]: unknown }, d?: MatchDiag, now: () => number = pageNow): void {
  try {
    const kind = reply.kind;
    if (!REPLY_STAGES.has(kind)) return;
    (d ?? pageMatchDiag()).loadStage(kind as DiagStage, now(), kind === 'error' ? null : bufferPayloadBytes(reply));
  } catch { /* an instrument never stops the load */ }
}

/** Tests only. */
export function resetPageMatchDiagForTest(): void { page = null; setBeaconLossDiag(null); setLoadMarkListener(null); }
