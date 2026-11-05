/**
 * The GPU menus' switch (GM-10; the plan `docs/plans/2026-11-01-gpu-menus.md`, "Rollout per surface: switch and
 * rollback"; research 380 §5). PRODUCT TRACK, a browser adaptation with no original: it decides only WHICH drawer
 * (today's software rasterizer, or the WebGL2 one) makes a surface's frame; the frame's pixels are the parity
 * contract's business (research 380 §1-§2), never this file's.
 *
 * Resolution, per surface and per scale (first match wins):
 * 1. the URL `?uiGpu=off|shadow|on`, limited by `&uiGpuSurface=front,armory,overlay,loading` when given. It works in
 *    release builds without `devmode`, as `?hdMenuScale=` does (the owner's question O9; default yes);
 * 2. the support-only `localStorage` kill `s2u.uiGpu = 'off'` (GM.R13; no Settings entry), read once per session
 *    through the page's settings path (`./pageStore` `pageSettings`, its key in `PAGE_SETTING_KEYS`);
 * 3. the session kill -- the loss limit or a guard trip (fallback level L3, "for the rest of the session"). It also
 *    overrides a URL `on`/`shadow`: the plan's L3 binds the rest of the session, and a URL that kept a looping context
 *    alive would defeat the loss limit. A URL `off` still answers as the URL's;
 * 4. `UI_GPU_SURFACES_ADAPTATION[surface][hd|sd]` -- every cell `off` until a landed flip (GM.R8). The test room's
 *    Settings overlay has no HD and reads `overlay.sd` (`resolveTestRoomOverlay`). GM-16b: a page served by the Vite
 *    dev server reads `UI_GPU_DEV_SURFACES_ADAPTATION` instead (`front.hd` `shadow`); no built page does (`uiGpuDevEnv`);
 * 5. the capability gate (`auto`) on a requested `on`/`shadow`: WebGL2, not a software adapter (SwiftShader, llvmpipe,
 *    the Microsoft Basic Render Driver) unless `?uiGpuAllowSoftwareAdapter=1`, `MAX_TEXTURE_SIZE >= 4096`, every
 *    program linked. A failure is fallback level L4: today's path, unchanged.
 *
 * `off`, by any route, is today's code (GM.R16). Nothing in the page reads this module at GM-10: it changes no frame.
 * GM-16: `shadow` -- the software's frame shown, the GPU's drawn offscreen beside it and compared by the guard
 * (`./uiGpuGuard`, `./uiGpuPresenter`) -- is honoured by the front end's surface; a guard trip escalates the surface's
 * blend (`escalateBlend`) or kills it for the session (`guard-trip`), and every record reaches the read-out (`guarded`).
 */

import { pageSettings } from './pageStore';
import { devSwitches } from './source';
import type { UiGpuGuardRecord } from './uiGpuGuard';

/** The surfaces the GPU drawer may draw (the plan, "Architecture"). The loader screens belong to `front`. */
export const UI_GPU_SURFACES = Object.freeze(['front', 'armory', 'overlay', 'loading'] as const);
export type UiGpuSurface = (typeof UI_GPU_SURFACES)[number];

/** `off`: today's software path. `shadow`: software shown, the GPU drawn beside it and compared. `on`: the GPU shown. */
export type UiGpuMode = 'off' | 'shadow' | 'on';
const MODES: readonly UiGpuMode[] = ['off', 'shadow', 'on'];

/** `hd`: a surface drawn above scale 1 under the HD picture; `sd`: scale 1, the original menus. */
export type UiGpuScaleKey = 'hd' | 'sd';

/** `ff`: fixed-function blending; `exact`: every quad through the programmable path (GM.R6). */
export type UiGpuBlend = 'ff' | 'exact';
const BLENDS: readonly UiGpuBlend[] = ['ff', 'exact'];

export type UiGpuSurfaceTable = Readonly<Record<UiGpuSurface, Readonly<Record<UiGpuScaleKey, UiGpuMode>>>>;
export type UiGpuBlendTable = Readonly<Record<UiGpuSurface, Readonly<Record<UiGpuScaleKey, UiGpuBlend>>>>;

const freezeTable = <T>(t: Record<UiGpuSurface, Record<UiGpuScaleKey, T>>): Readonly<Record<UiGpuSurface, Readonly<Record<UiGpuScaleKey, T>>>> => {
  for (const s of UI_GPU_SURFACES) Object.freeze(t[s]);
  return Object.freeze(t);
};

/**
 * UI_GPU_SURFACES_ADAPTATION: no original; bounds which browser drawer makes each surface's frame. Per surface and
 * per scale (GM.R8): HD goes on first, scale 1 last and only on the owner's word in the seat. Every cell is `off` until
 * its rollout step lands (GM-16b, GM-17, GM-18, GM-19a/b, GM-21, GM-23); a flip is a landed line here, never a write.
 */
export const UI_GPU_SURFACES_ADAPTATION: UiGpuSurfaceTable = freezeTable<UiGpuMode>({
  front: { hd: 'off', sd: 'off' },
  armory: { hd: 'off', sd: 'off' },
  overlay: { hd: 'off', sd: 'off' },
  loading: { hd: 'off', sd: 'off' },
});

/**
 * UI_GPU_DEV_SURFACES_ADAPTATION: no original; bounds which browser drawer a development build's surfaces use (GM-16b;
 * the plan's rollout, "GM-16b: front end, dev builds, `front.hd: 'shadow'` in dev only; guard records start"): the landed
 * table with the front end at HD in `shadow` -- the software's frame shown, today's bytes, and the GPU's drawn offscreen
 * and compared by the guard (GM.R11: shadow is a dev and canary instrument). Scale 1 stays `off` (GM.R8). Only a page
 * the Vite dev server serves reads it (`uiGpuDevEnv`: DEV and MODE `development`). Every built page reads
 * `UI_GPU_SURFACES_ADAPTATION` (every cell `off`) and makes no canvas and no context (GM.R16) -- `npm run build`
 * (DEV false) and the nightly too, which builds with `NODE_ENV=development` (deploy/nightly.sh, OT.R47) and so has DEV
 * true but MODE `production` (review F1: DEV alone is not false in every built page).
 */
export const UI_GPU_DEV_SURFACES_ADAPTATION: UiGpuSurfaceTable = freezeTable<UiGpuMode>({
  front: { hd: 'shadow', sd: 'off' },
  armory: { hd: 'off', sd: 'off' },
  overlay: { hd: 'off', sd: 'off' },
  loading: { hd: 'off', sd: 'off' },
});

/**
 * GM-16b (review F1): whether Vite's env is the dev server's -- DEV true **and** MODE `development`. `vite build`'s
 * mode is `production` whatever `NODE_ENV` says, so the nightly (`NODE_ENV=development npx vite build`: DEV true, MODE
 * `production`) and `npm run build` (DEV false) both answer false; vitest's mode `test` answers false (a test that wants
 * a table gives its own); no Vite env (Node) answers false.
 */
export function uiGpuDevEnv(env: { readonly DEV?: unknown; readonly MODE?: unknown }): boolean {
  return env.DEV === true && env.MODE === 'development';     // 'test' (vitest) and 'production' (every build) excluded
}

/** GM-16b: the page's answer, read once by `pageUiGpuSwitch` -- Vite replaces both values in every build. */
export function uiGpuDevBuild(): boolean {
  return uiGpuDevEnv({ DEV: import.meta.env.DEV, MODE: import.meta.env.MODE });
}

/** GM-16b: the page's surfaces table -- the development one on a development build, the landed one otherwise. */
export function uiGpuPageTable(dev: boolean): UiGpuSurfaceTable {
  return dev ? UI_GPU_DEV_SURFACES_ADAPTATION : UI_GPU_SURFACES_ADAPTATION;
}

/**
 * UI_GPU_BLEND_ADAPTATION: no original; bounds the browser's blend rounding on the GPU path (GM.R6). Scale 1 is
 * `exact` (the original transcription gets the widest exact class); HD is `ff` unless the twin, a real-GPU bound or a
 * field trip escalates that surface to `exact` (GM.R5).
 */
export const UI_GPU_BLEND_ADAPTATION: UiGpuBlendTable = freezeTable<UiGpuBlend>({
  front: { hd: 'ff', sd: 'exact' },
  armory: { hd: 'ff', sd: 'exact' },
  overlay: { hd: 'ff', sd: 'exact' },
  loading: { hd: 'ff', sd: 'exact' },
});

/** The support-only kill switch's key (GM.R13); only the value `'off'` means anything. */
export const UI_GPU_KILL_STORAGE_KEY = 's2u.uiGpu';

/** The capability floor of the GPU path (the plan, switch resolution 5): an HD image is up to 4096 wide. */
export const UI_GPU_MIN_MAX_TEXTURE_SIZE = 4096;

/** Scale 1 reads `sd`; every whole scale above it `hd`. Anything else is not an HD scale and reads `sd`. */
export function uiGpuScaleKey(scale: number): UiGpuScaleKey {
  return Number.isInteger(scale) && scale > 1 ? 'hd' : 'sd';
}

/** The URL's part, parsed: `mode` null when absent or not one of the three; `surfaces` the ones it applies to. */
export interface UiGpuUrl {
  readonly mode: UiGpuMode | null;
  readonly surfaces: readonly UiGpuSurface[];
  readonly allowSoftwareAdapter: boolean;
  /** `?uiGpuBlend=`, as given; honoured only under the developer's tools (`devSwitches(search).tools`). */
  readonly blend: UiGpuBlend | null;
}

/** Parse the page's address for the switch's keys. A malformed query asks for nothing. */
export function parseUiGpuUrl(search: string): UiGpuUrl {
  let mode: UiGpuMode | null = null;
  let surfaces: readonly UiGpuSurface[] = UI_GPU_SURFACES;
  let allowSoftwareAdapter = false;
  let blend: UiGpuBlend | null = null;
  try {
    const q = new URLSearchParams(search);
    const m = q.get('uiGpu');
    mode = MODES.find((x) => x === m) ?? null;
    const list = q.get('uiGpuSurface');
    if (list !== null && list.trim() !== '') {
      // A list naming no known surface (a typo) applies the URL to none, never to all (GM-10 review F2, the Log).
      const named = list.split(',').map((s) => s.trim());
      surfaces = UI_GPU_SURFACES.filter((s) => named.includes(s));
    }
    allowSoftwareAdapter = q.get('uiGpuAllowSoftwareAdapter') === '1';
    const b = q.get('uiGpuBlend');
    blend = BLENDS.find((x) => x === b) ?? null;
  } catch { /* a malformed query asks for nothing */ }
  return { mode, surfaces, allowSoftwareAdapter, blend };
}

/** The renderer strings of software adapters (case aside): SwiftShader, llvmpipe, the Microsoft Basic Render Driver. */
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|microsoft basic render driver/i;

/**
 * Whether a WebGL renderer string (`UNMASKED_RENDERER_WEBGL`, else `RENDERER`) names a software adapter. It sees only
 * the string it is given: a masked `RENDERER` ("WebKit WebGL") does not name SwiftShader, so the caller that fills
 * `UiGpuCaps` (GM-12a) handles a missing unmasked string deliberately (GM-10 review F3, owed on GM-12a's row).
 */
export function isSoftwareAdapter(renderer: string | null | undefined): boolean {
  return typeof renderer === 'string' && SOFTWARE_ADAPTER.test(renderer);
}

/** What a made context reports; the presenter (GM-12a) fills it. */
export interface UiGpuCaps {
  readonly webgl2: boolean;
  readonly renderer: string | null;
  /**
   * GM-12a: where `renderer` came from -- `unmasked` (`UNMASKED_RENDERER_WEBGL`), `renderer` (the plain `RENDERER`, which
   * a browser may mask: then no software adapter can be seen in it), `none`. Absent: not said (a caller before GM-12a).
   */
  readonly rendererSource?: 'unmasked' | 'renderer' | 'none';
  readonly maxTextureSize: number;
  readonly programsLinked: boolean;
}

export type UiGpuCapabilityReason = 'no-webgl2' | 'software-adapter' | 'max-texture-size' | 'program-link';

/** The capability gate (resolution 5), in the order a context is checked. */
export function uiGpuCapability(caps: UiGpuCaps, allowSoftwareAdapter: boolean):
{ readonly ok: true } | { readonly ok: false; readonly reason: UiGpuCapabilityReason } {
  if (!caps.webgl2) return { ok: false, reason: 'no-webgl2' };
  if (!allowSoftwareAdapter && isSoftwareAdapter(caps.renderer)) return { ok: false, reason: 'software-adapter' };
  if (!(caps.maxTextureSize >= UI_GPU_MIN_MAX_TEXTURE_SIZE)) return { ok: false, reason: 'max-texture-size' };
  if (!caps.programsLinked) return { ok: false, reason: 'program-link' };
  return { ok: true };
}

/**
 * Why a session was killed: the loss limit (3 in 5 minutes, GM-12a), a lost context the browser did not restore within
 * `UI_GPU_RESTORE_WAIT_MS_ADAPTATION` (GM-12a), or a guard trip (GM-16).
 */
export type UiGpuKillReason = 'loss-limit' | 'restore-timeout' | 'guard-trip';

/** Where an answer came from: the resolution step that decided it. */
export type UiGpuSource = 'url' | 'storage' | 'session' | 'table' | 'capability';

export interface UiGpuResolution {
  readonly surface: UiGpuSurface;
  readonly scaleKey: UiGpuScaleKey;
  /** The drawer to use. */
  readonly mode: UiGpuMode;
  readonly source: UiGpuSource;
  /** What steps 1-4 asked for, before the session kill and the capability gate. */
  readonly requested: UiGpuMode;
  /** The session kill's or the capability gate's reason, when one of them decided. */
  readonly reason?: UiGpuKillReason | UiGpuCapabilityReason;
  /** `unchecked` when no capabilities were given (no context made yet): the gate is still owed. */
  readonly capability: 'ok' | 'failed' | 'unchecked' | 'not-needed';
}

/** The fallback ladder's levels (the plan, "The fallback ladder"), each counted on `window.__uiGpu`. */
export type UiGpuLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** The storage the kill is read from: a thunk, so a throwing `window.localStorage` accessor is caught too. */
export type UiGpuStorage = () => { getItem(key: string): string | null } | null | undefined;

export interface UiGpuSwitchOptions {
  readonly search: string;
  readonly storage: UiGpuStorage;
  /** `devSwitches(search).tools`: honours the dev and test only keys (`uiGpuBlend`). */
  readonly devTools: boolean;
  /** The surfaces table; the landed `UI_GPU_SURFACES_ADAPTATION` unless a test gives another. */
  readonly table?: UiGpuSurfaceTable;
  /** The blend table; the landed `UI_GPU_BLEND_ADAPTATION` unless a test gives another. */
  readonly blendTable?: UiGpuBlendTable;
}

/** The read-out published as `window.__uiGpu` (a playtest and test instrument; nothing of the game). */
export interface UiGpuReadout {
  readonly modes: Record<UiGpuSurface, Record<UiGpuScaleKey, UiGpuMode>>;
  readonly levels: Record<UiGpuLevel, number>;
  readonly contexts: number;
  readonly kills: readonly { readonly reason: UiGpuKillReason; readonly surface: UiGpuSurface | null }[];
  readonly storageKill: boolean;
  readonly url: UiGpuUrl;
  readonly blend: Record<UiGpuSurface, Record<UiGpuScaleKey, UiGpuBlend>>;
  /** GM-16: the guard's compares this session, every trip (with its renderer), and the last record. */
  readonly guard: { readonly compares: number; readonly trips: readonly UiGpuGuardRecord[]; readonly last: UiGpuGuardRecord | null };
  /** GM-16c: why frames were L1 -- the last refusal and each reason's frames (`UI_GPU_REFUSAL_KEYS_MAX` keys at most). */
  readonly refusals: { readonly last: UiGpuRefusal | null; readonly counts: Record<string, number> };
}

/**
 * GM-16c: one L1 frame's refusal as the read-out shows it -- the surface, the present record's reasons (`why`, a copy),
 * and the switch's L1 count when it was told (the surface counts the frame first, so `at` is that frame's L1 number).
 * A test and playtest instrument (a browser adaptation): it records, it decides nothing.
 */
export interface UiGpuRefusal {
  readonly surface: UiGpuSurface;
  readonly why: readonly string[];
  readonly at: number;
}

/**
 * GM-16c: the read-out's bound on its refusal counts (a test instrument's, a browser adaptation): at most 16 distinct
 * reasons keyed per session, every further distinct reason counted under `(other)` -- a reason may carry a
 * number (`textures uploading: <n> bytes ...`), and an unbounded map would grow with every frame of a long session.
 */
export const UI_GPU_REFUSAL_KEYS_MAX = 16;
const REFUSAL_OTHER = '(other)';
const REFUSAL_NONE = '(none)';

function readStorageKill(storage: UiGpuStorage): boolean {
  try {
    return storage()?.getItem(UI_GPU_KILL_STORAGE_KEY) === 'off';
  } catch {
    return false; // blocked storage (a private window, cleared site data) is no kill
  }
}

/** One page session's switch: the URL and the stored kill read once, the session kills and the counters held. */
export class UiGpuSwitch {
  private readonly url: UiGpuUrl;
  private readonly storageKill: boolean;
  private readonly devTools: boolean;
  private readonly table: UiGpuSurfaceTable;
  private readonly blendTable: UiGpuBlendTable;
  private readonly killed = new Map<UiGpuSurface, UiGpuKillReason>();
  private readonly kills: { reason: UiGpuKillReason; surface: UiGpuSurface | null }[] = [];
  private readonly escalated = new Set<UiGpuSurface>();
  private readonly levels: Record<UiGpuLevel, number> = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 };
  private contexts = 0;
  private guardCompares = 0;
  private readonly guardTrips: UiGpuGuardRecord[] = [];
  private guardLast: UiGpuGuardRecord | null = null;
  private refusalLast: UiGpuRefusal | null = null;
  private readonly refusalCounts = new Map<string, number>();

  constructor(opts: UiGpuSwitchOptions) {
    this.url = parseUiGpuUrl(opts.search);
    this.storageKill = readStorageKill(opts.storage);
    this.devTools = opts.devTools;
    this.table = opts.table ?? UI_GPU_SURFACES_ADAPTATION;
    this.blendTable = opts.blendTable ?? UI_GPU_BLEND_ADAPTATION;
  }

  /** The drawer for `surface` at `scale`; `caps`, once a context is made, applies the capability gate. */
  resolve(surface: UiGpuSurface, scale: number, caps?: UiGpuCaps): UiGpuResolution {
    return this.resolveKey(surface, uiGpuScaleKey(scale), caps);
  }

  /** The test room's Settings overlay: it has no HD, so it reads `overlay.sd` at any scale (GM.R8). */
  resolveTestRoomOverlay(caps?: UiGpuCaps): UiGpuResolution {
    return this.resolveKey('overlay', 'sd', caps);
  }

  private resolveKey(surface: UiGpuSurface, scaleKey: UiGpuScaleKey, caps?: UiGpuCaps): UiGpuResolution {
    let requested: UiGpuMode;
    let source: UiGpuSource;
    if (this.url.mode !== null && this.url.surfaces.includes(surface)) { requested = this.url.mode; source = 'url'; }
    else if (this.storageKill) { requested = 'off'; source = 'storage'; }
    else { requested = this.table[surface][scaleKey]; source = 'table'; }
    const base = { surface, scaleKey, requested };
    if (requested === 'off') return { ...base, mode: 'off', source, capability: 'not-needed' };
    const kill = this.killed.get(surface);
    if (kill !== undefined) return { ...base, mode: 'off', source: 'session', reason: kill, capability: 'not-needed' };
    if (caps === undefined) return { ...base, mode: requested, source, capability: 'unchecked' };
    const gate = uiGpuCapability(caps, this.url.allowSoftwareAdapter);
    if (!gate.ok) return { ...base, mode: 'off', source: 'capability', reason: gate.reason, capability: 'failed' };
    return { ...base, mode: requested, source, capability: 'ok' };
  }

  /** The blend mode for `surface` at `scale` (GM.R6): the dev URL, then a session escalation, then the table. */
  blend(surface: UiGpuSurface, scale: number): UiGpuBlend {
    if (this.devTools && this.url.blend !== null) return this.url.blend;
    if (this.escalated.has(surface)) return 'exact';
    return this.blendTable[surface][uiGpuScaleKey(scale)];
  }

  /** A trip beyond the pinned bound escalates that surface to `exact` for the session (GM.R5). */
  escalateBlend(surface: UiGpuSurface): void {
    this.escalated.add(surface);
  }

  /** The session kill (L3): one surface, or every surface when none is named. */
  kill(reason: UiGpuKillReason, surface?: UiGpuSurface): void {
    for (const s of surface === undefined ? UI_GPU_SURFACES : [surface]) if (!this.killed.has(s)) this.killed.set(s, reason);
    this.kills.push({ reason, surface: surface ?? null });
  }

  /** Count one frame or event at a fallback level. */
  count(level: UiGpuLevel): void {
    this.levels[level] += 1;
  }

  /** GM-16: one guard record from a surface (`./uiGpuGuard`): counted, a trip kept for the session's read-out. */
  guarded(record: UiGpuGuardRecord): void {
    this.guardCompares += 1;
    this.guardLast = record;
    if (record.trip) this.guardTrips.push(record);
  }

  /**
   * GM-16c: a surface's L1 frame, refused by its plan (a software verdict, `uiFramePlan.ts`) or by the backend
   * (`UiGpuBackend.refusal`, a texture upload wait): kept as the last refusal and each reason counted once for the frame
   * (a frame with no reason under `(none)`; past `UI_GPU_REFUSAL_KEYS_MAX` distinct reasons, under `(other)`).
   */
  refused(surface: UiGpuSurface, why: readonly string[]): void {
    this.refusalLast = { surface, why: why.slice(), at: this.levels.L1 };
    for (const w of why.length ? why : [REFUSAL_NONE]) {
      const keyed = this.refusalCounts.size - (this.refusalCounts.has(REFUSAL_OTHER) ? 1 : 0);
      const key = this.refusalCounts.has(w) || keyed < UI_GPU_REFUSAL_KEYS_MAX ? w : REFUSAL_OTHER;
      this.refusalCounts.set(key, (this.refusalCounts.get(key) ?? 0) + 1);
    }
  }

  /** The live UI GPU contexts (GM-12a). */
  setContexts(n: number): void {
    this.contexts = n;
  }

  /** GM-12a: one context made live (+1) or let go (-1) by a surface's lifecycle. */
  adjustContexts(delta: number): void {
    this.contexts = Math.max(0, this.contexts + delta);
  }

  /** A snapshot of the switch, as `window.__uiGpu` shows it. */
  readout(): UiGpuReadout {
    const modes = {} as Record<UiGpuSurface, Record<UiGpuScaleKey, UiGpuMode>>;
    const blend = {} as Record<UiGpuSurface, Record<UiGpuScaleKey, UiGpuBlend>>;
    for (const s of UI_GPU_SURFACES) {
      modes[s] = { hd: this.resolveKey(s, 'hd').mode, sd: this.resolveKey(s, 'sd').mode };
      blend[s] = { hd: this.blend(s, 2), sd: this.blend(s, 1) };
    }
    return {
      modes, blend, levels: { ...this.levels }, contexts: this.contexts,
      kills: this.kills.map((k) => ({ ...k })), storageKill: this.storageKill, url: this.url,
      guard: { compares: this.guardCompares, trips: this.guardTrips.slice(), last: this.guardLast },
      refusals: {
        last: this.refusalLast && { ...this.refusalLast, why: this.refusalLast.why.slice() },
        counts: Object.fromEntries(this.refusalCounts),
      },
    };
  }

  /** Publish the read-out as a live `__uiGpu` getter on `target` (the window); a refusing target is left alone. */
  expose(target: object): void {
    try {
      Object.defineProperty(target, '__uiGpu', { configurable: true, enumerable: false, get: () => this.readout() });
    } catch { /* a frozen or foreign target: no read-out, no failure */ }
  }
}

let page: UiGpuSwitch | null = null;

/** The page's switch, made once from its address and storage, and exposed as `window.__uiGpu`. */
export function pageUiGpuSwitch(): UiGpuSwitch {
  if (page !== null) return page;
  const search = typeof location === 'undefined' ? '' : location.search;
  page = new UiGpuSwitch({
    search,
    storage: () => ({ getItem: (key: string) => pageSettings.get(key) }), // the page's settings path (pageStore.ts)
    devTools: devSwitches(search).tools,
    table: uiGpuPageTable(uiGpuDevBuild()),                               // GM-16b: front.hd shadow on a development build only
  });
  if (typeof window !== 'undefined') page.expose(window);
  return page;
}
