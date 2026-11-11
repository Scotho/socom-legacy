import { pageBeaconContext, pageClientErrorBeacon, setBeaconLossDiag } from './clientErrorBeacon';
import { pageDeviceSignals } from './deviceClass';
import { inputSources } from './inputSources';
import { MatchDiag, xboxMarks, type PageState } from './matchDiag';

/**
 * XBOX-DIAG's page side (`./matchDiag`; product track, an instrument): the page's one diagnostic, made by the match's
 * chunk at its first mount, which also hands the error beacon its loss hook (`setBeaconLossDiag`) -- so the entry
 * imports none of it (OT.R12). The page's state is read when a report goes: `navigator.gamepadInputEmulation` (Edge on
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
    send: (kind, message) => { pageClientErrorBeacon().reportDiag(kind, message); },
  });
  page = made;
  setBeaconLossDiag((why) => { made.lost(why, globalThis.performance?.now() ?? 0); });
  return made;
}

/** Tests only. */
export function resetPageMatchDiagForTest(): void { page = null; setBeaconLossDiag(null); }
