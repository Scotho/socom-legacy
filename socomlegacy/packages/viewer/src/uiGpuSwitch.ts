/**
 * The GPU menus' switch (GM-10; the plan `docs/plans/2026-11-01-gpu-menus.md`, "Rollout per surface: switch and
 * rollback"; research 380 §5). PRODUCT TRACK, a browser adaptation with no original: it decides only WHICH drawer
 * (today's software rasterizer, or the WebGL2 one) makes a surface's frame; the frame's pixels are the parity
 * contract's business (research 380 §1-§2), never this file's.
 *
 * Resolution, per surface and per scale (first match wins):
 * 1. the URL `?uiGpu=off|shadow|on`, limited by `&uiGpuSurface=front,armory,overlay,loading` when given. It works in
 *    release builds without `devmode`, as `?hdMenuScale=` does (the owner's question O9; default yes). Since the flip
 *    (GM.R18) `uiGpuSurface` no longer isolates a surface: the surfaces it does not name fall through to the table, now
 *    `on`; and `?uiGpuAllowSoftwareAdapter=1` applies to every surface of the page (the flip's review F4);
 * 2. the support-only `localStorage` kill `s2u.uiGpu = 'off'` (GM.R13; no Settings entry), read once per session
 *    through the page's settings path (`./pageStore` `pageSettings`, its key in `PAGE_SETTING_KEYS`);
 * 3. the session kill -- the loss limit or a guard trip (fallback level L3, "for the rest of the session"). It also
 *    overrides a URL `on`/`shadow`: the plan's L3 binds the rest of the session, and a URL that kept a looping context
 *    alive would defeat the loss limit. A URL `off` still answers as the URL's;
 * 4. `UI_GPU_SURFACES_ADAPTATION[surface][hd|sd]` -- every cell `on` since the flip (GM-17, GM-18, GM-19a/b, GM-21,
 *    GM-23 in one change; GM.R18, the owner's word in the seat; GM.R8's order done). The test room's Settings overlay has
 *    no HD and reads `overlay.sd` (`resolveTestRoomOverlay`). GM-16b: a page served by the Vite dev server reads
 *    `UI_GPU_DEV_SURFACES_ADAPTATION` instead (since the flip the same cells); no built page does (`uiGpuDevEnv`);
 * 5. the capability gate (`auto`) on a requested `on`/`shadow`: WebGL2, not a software adapter (SwiftShader, llvmpipe,
 *    the Microsoft Basic Render Driver) unless `?uiGpuAllowSoftwareAdapter=1`, `MAX_TEXTURE_SIZE >= 4096`, every
 *    program linked. A failure is fallback level L4: the software path, at HD the 1x frame (GM-28, GM.R19).
 *
 * `off`, by any route, is the software path; at HD it draws the original 1x frame, not the player's scale (GM-28: GM.R19
 * withdraws GM.R16's "today's code at the chosen scale", as `./uiGpuFront` says; `UI_GPU_LOSS_FALLBACK_ADAPTATION` below).
 * Nothing in the page read this module at GM-10: it changed no frame. Since the flip (GM.R18) a page with a hardware
 * adapter draws every surface on the GPU, and the software path is only the fallback (L1-L4, `off`), at 1x under HD.
 * GM-16: `shadow` -- the software's frame shown, the GPU's drawn offscreen beside it and compared by the guard
 * (`./uiGpuGuard`, `./uiGpuPresenter`) -- is honoured by the front end's surface; a guard trip escalates the surface's
 * blend (`escalateBlend`) or kills it for the session (`guard-trip`), and every record reaches the read-out (`guarded`).
 */

import { pageSettings } from './pageStore';
import { devSwitches } from './source';
import type { UiGpuGuardRecord } from './uiGpuGuard';
import { uiGpuRefusalKey } from './uiGpuTextures';

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
 * per scale (GM.R8): HD went on first, scale 1 last and only on the owner's word in the seat -- given 2026-11-09 (GM.R18:
 * "I want the GPU menu work done and turned on by default and the old menu path only existing when fallbacks occur and
 * no GPU is found. Both when the pack is on and off."). The rollout is done: every cell `on` (GM-17 `front.hd`, GM-18
 * `armory.hd`, GM-19a `overlay.hd`, GM-19b `overlay.sd`, GM-21 `front.sd` and `armory.sd`, GM-23 `loading`), flipped in
 * one change. `on` asks for the GPU; the capability gate (resolution 5) still sends a page with no WebGL2, a software
 * adapter, `MAX_TEXTURE_SIZE < 4096` or a link failure to the software path at 1x (L4, GM-28, GM.R19), as does a session
 * kill (L3). `?uiGpu=off` and the storage kill stay the rollback (GM.R13); a landed rollback reverts a line here.
 */
export const UI_GPU_SURFACES_ADAPTATION: UiGpuSurfaceTable = freezeTable<UiGpuMode>({
  front: { hd: 'on', sd: 'on' },
  armory: { hd: 'on', sd: 'on' },
  overlay: { hd: 'on', sd: 'on' },
  loading: { hd: 'on', sd: 'on' },
});

/**
 * UI_GPU_DEV_SURFACES_ADAPTATION: no original; bounds which browser drawer a development build's surfaces use. GM-16b
 * made it the landed table with `front.hd` in `shadow` (the guard's records started there, GM.R11). Since the flip
 * (GM.R18) it holds the built table's cells -- every cell `on` -- so the dev server shows what a player sees; the guard's
 * HD compare stays reachable there by `?uiGpuGuard=on` (GM-14c, `guardOn`) and a `shadow` frame by `?uiGpu=shadow`.
 * Only a page the Vite dev server serves reads it (`uiGpuDevEnv`: DEV and MODE `development`); every built page reads
 * `UI_GPU_SURFACES_ADAPTATION` -- `npm run build` (DEV false) and the nightly too, which builds with
 * `NODE_ENV=development` (deploy/nightly.sh, OT.R47) and so has DEV true but MODE `production` (review F1).
 */
export const UI_GPU_DEV_SURFACES_ADAPTATION: UiGpuSurfaceTable = freezeTable<UiGpuMode>({
  front: { hd: 'on', sd: 'on' },
  armory: { hd: 'on', sd: 'on' },
  overlay: { hd: 'on', sd: 'on' },
  loading: { hd: 'on', sd: 'on' },
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
 * The loading screen is escalated at HD by a real-GPU bound (the flip's 4070 evidence, 2026-11-09, at f85dc01e1,
 * evidence/gpu-menus/gm-flip-4070): under `ff` on ANGLE D3D11 its panel ran up to ~9.5% of the 4x frame at |d| 1 and
 * one pixel at |d| 2 in each of two runs (`loading.up@4x`, `loading.fade32@4x`): the |d| 1 counts past the SwiftShader
 * bound, the |d| 2 pixels past the pinned tolerance's |d| <= 1 rule (GM-27); `exact` stayed within the SwiftShader bound.
 */
export const UI_GPU_BLEND_ADAPTATION: UiGpuBlendTable = freezeTable<UiGpuBlend>({
  front: { hd: 'ff', sd: 'exact' },
  armory: { hd: 'ff', sd: 'exact' },
  overlay: { hd: 'ff', sd: 'exact' },
  loading: { hd: 'exact', sd: 'exact' },
});

/**
 * UI_GPU_LOSS_FALLBACK_ADAPTATION: no original; bounds the browser's software frame whenever a menu surface's GPU path
 * does not present (the plan's ladder; GM.R9, GM.R12; GM-28 under GM.R19, the owner's "the original 1x frame"): the
 * software draws the frame at scale 1 -- the original frame, byte for byte -- with no HD lookup and no quad cache (both
 * belong to the HD scale), so no fallback puts the 4x software path (GM-02: 150-183 ms a frame) on the player's frame.
 * GM-12a made it L2/L3's (the GPU lost); GM-28 extends it to every state that does not present: L4 (no WebGL2, a software
 * adapter, `MAX_TEXTURE_SIZE`, a link failure), waiting for the links, released in a match, before the surface's module
 * lands, a guard trip, and `off` (URL, storage kill, table). The canvas's CSS box shows it at the same size. Moved here
 * from `./uiGpuPresenter` (re-exported there) so the page's frame loop, which imports no GPU module (GM.R15), uses the
 * same rule. The 4x software path stays for tests and the guard only (GM.R19).
 */
export const UI_GPU_LOSS_FALLBACK_ADAPTATION = Object.freeze({ scale: 1 } as const);

/** What a frame's options carry that the fallback drops: the HD scale's lookup and quad cache. */
export interface UiGpuFallbackable { readonly scale?: number; readonly hd?: unknown; readonly quadCache?: unknown }

/**
 * The options of a software frame drawn while the GPU path does not present: `UI_GPU_LOSS_FALLBACK_ADAPTATION` over the
 * frame's own -- scale 1, the HD lookup and the quad cache dropped, everything else (`transparent`, `movie`, `version`)
 * kept.
 */
export function uiGpuLossFallbackOptions<O extends UiGpuFallbackable>(options: O): Omit<O, 'hd' | 'quadCache' | 'scale'> & { scale: number } {
  const rest: { hd?: unknown; quadCache?: unknown } = { ...options };
  delete rest.hd;
  delete rest.quadCache;
  return { ...(rest as Omit<O, 'hd' | 'quadCache' | 'scale'>), scale: UI_GPU_LOSS_FALLBACK_ADAPTATION.scale };
}

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
  /** GM-14c: `?uiGpuGuard=on`, as given; honoured only on the Vite dev server (`UiGpuSwitchOptions.devBuild`). */
  readonly guard: boolean;
  /** GM-14c: `?uiGpuGuardPlant=<byte offset>` (a whole number), as given; honoured only with `guard` on the dev server. */
  readonly guardPlant: UiGpuGuardPlant | null;
}

/**
 * GM-14c: a test's plant -- a byte offset of the guard's rastered reference, or (review fold F1) `exact`: the red byte
 * of the first pixel the frame's own plan puts in the exact class (`uiGpuExactMask`), so the plant trips on any frame.
 * GM batch 2 part B (a browser adaptation, a dev-server test instrument; 6d's decision for the owner): with an `@<scale>`
 * suffix (`exact@4`, `<byte>@4`) the plant applies only to frames whose plan targets that scale (`{ at, scale }`); any
 * other frame's reference is not planted, its record saying so. Without the suffix, as before.
 */
export type UiGpuGuardPlant = number | 'exact' | { readonly at: number | 'exact'; readonly scale: number };

/** Parse the page's address for the switch's keys. A malformed query asks for nothing. */
export function parseUiGpuUrl(search: string): UiGpuUrl {
  let mode: UiGpuMode | null = null;
  let surfaces: readonly UiGpuSurface[] = UI_GPU_SURFACES;
  let allowSoftwareAdapter = false;
  let blend: UiGpuBlend | null = null;
  let guard = false;
  let guardPlant: UiGpuGuardPlant | null = null;
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
    guard = q.get('uiGpuGuard') === 'on';
    const plant = q.get('uiGpuGuardPlant');
    if (plant !== null && /^\d+$/.test(plant.trim())) guardPlant = Number(plant.trim());
    else if (plant?.trim() === 'exact') guardPlant = 'exact';
    else {
      // Part B: `<exact|byte>@<scale>`, the scale a whole number >= 1; anything else (`exact@`, `@4`, `12@0`) asks for nothing.
      const scoped = plant === null ? null : /^(exact|\d+)@([1-9]\d*)$/.exec(plant.trim());
      if (scoped) guardPlant = { at: scoped[1] === 'exact' ? 'exact' : Number(scoped[1]), scale: Number(scoped[2]) };
    }
  } catch { /* a malformed query asks for nothing */ }
  return { mode, surfaces, allowSoftwareAdapter, blend, guard, guardPlant };
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

/**
 * UI_GPU_RENDERER_GATE_ADAPTATION (LATER 927): no original; the renderers whose GPU menus are known to mis-draw with no
 * error, gated at L4 before any compile (`renderer-gate`). One family, on one report: a MacBook Air in Chrome, "ANGLE
 * (Intel Inc., Intel(R) HD Graphics 6000, OpenGL 4.1)", whose menus showed the backdrop and no rows or text; the player
 * said, relayed from Discord, that `?uiGpu=off` let him in (central's rows: `agent-mail/evidence/v0419-window/
 * MAC-BLANK-MENU-READ.md`). With no `chrome://gpu` from him the pattern is a best reading of that one string: this GPU on
 * ANGLE's OpenGL back end, on any OS -- the Mac's, Chrome on Linux (where OpenGL is the default back end: a Broadwell HD
 * 6000 box gets the software menus too) and Windows Chrome forced to `--use-angle=gl`; there the cost is speed only. Not
 * its Metal back end, not another Intel GPU, until a report says more. Read from `readUiGpuCaps`' string: the unmasked
 * renderer where the browser gives it, else the plain `RENDERER`; a masked one ("WebKit WebGL") names no GPU and is not
 * gated. A gated device sends no row, so central cannot count them.
 * The general catch is the self-check at each link (UIGPU-SELFCHECK, `./uiGpuSelfCheck`).
 */
export const UI_GPU_RENDERER_GATE_ADAPTATION: readonly RegExp[] = Object.freeze([/Intel\(R\) HD Graphics 6000\b.*\bOpenGL\b/]);

/** Whether `renderer` is one the gate keeps off the GPU menus (`UI_GPU_RENDERER_GATE_ADAPTATION`). */
export function isGatedRenderer(renderer: string | null | undefined): boolean {
  return typeof renderer === 'string' && UI_GPU_RENDERER_GATE_ADAPTATION.some((r) => r.test(renderer));
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

/**
 * Why a surface's GPU path is unavailable (L4). `no-parallel-link` (GM-23 / GM-19a review fold 4): a surface that must not
 * stall (`UiGpuSurfacePresenter.prepare`: the loading screen, the overlay) found no `KHR_parallel_shader_compile` and let
 * its context go before compiling; the gate (`uiGpuCapability`) never answers it. `self-check` (UIGPU-SELFCHECK,
 * `./uiGpuSelfCheck`): the surface's drawer drew the self-check's scene unlike the software; the gate never answers it.
 * `renderer-gate`: a renderer `UI_GPU_RENDERER_GATE_ADAPTATION` names (the gate's, after the software adapter).
 */
export type UiGpuCapabilityReason = 'no-webgl2' | 'software-adapter' | 'max-texture-size' | 'program-link' | 'no-parallel-link' | 'self-check' | 'renderer-gate';

/** The capability gate (resolution 5), in the order a context is checked. */
export function uiGpuCapability(caps: UiGpuCaps, allowSoftwareAdapter: boolean):
{ readonly ok: true } | { readonly ok: false; readonly reason: UiGpuCapabilityReason } {
  if (!caps.webgl2) return { ok: false, reason: 'no-webgl2' };
  if (!allowSoftwareAdapter && isSoftwareAdapter(caps.renderer)) return { ok: false, reason: 'software-adapter' };
  if (isGatedRenderer(caps.renderer)) return { ok: false, reason: 'renderer-gate' };        // UIGPU-SELFCHECK's narrow gate
  if (!(caps.maxTextureSize >= UI_GPU_MIN_MAX_TEXTURE_SIZE)) return { ok: false, reason: 'max-texture-size' };
  if (!caps.programsLinked) return { ok: false, reason: 'program-link' };
  return { ok: true };
}

/**
 * Why a session was killed: the loss limit (3 in 5 minutes, GM-12a), a lost context the browser did not restore within
 * `UI_GPU_RESTORE_WAIT_MS_ADAPTATION` (GM-12a), a guard trip (GM-16), or a failed self-check (UIGPU-SELFCHECK: every
 * surface at once, as one device's drawer drew the self-check's scene unlike the software).
 */
export type UiGpuKillReason = 'loss-limit' | 'restore-timeout' | 'guard-trip' | 'self-check';

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

/**
 * GM-30: a frame a surface's read-out counts -- a ladder level, or `waiting` (the software while the surface's module
 * loads, its links run after no loss, or its context is released in a match). A test and playtest instrument.
 */
export type UiGpuFallbackLevel = UiGpuLevel | 'waiting';

/**
 * GM-30 (a browser adaptation, a test and playtest instrument): what a surface's mount tells the switch of a frame it
 * sends to the page's own software (`./uiGpuSurfaceMount` `UiGpuCanvasMount.readyOn`) -- the level and its reason (L4's
 * capability reason, `no-parallel-link` and `load-failed` included; L3's kill reason; `waiting`'s `module`, `links` or
 * `released`; L2 none). The switch's `hostFor(surface)` is one.
 */
export interface UiGpuLadder {
  fallback(level: UiGpuFallbackLevel, reason: string | null): void;
}

/**
 * GM-30: one surface's counts on `window.__uiGpu` (`surfaces[surface]`): its frames by level -- the ones the surface
 * counts itself through `hostFor` (L0-L4) and the ones its mount sends to the page's software (`fallback`) --, its waiting
 * frames, each reason's frames keyed `<level>:<reason>` (the reasons are closed sets: the bound is theirs), and the last
 * frame counted. The aggregate `levels` keeps counting every level as before; `waiting` is per surface only.
 */
export interface UiGpuSurfaceLadderReadout {
  readonly levels: Record<UiGpuLevel, number>;
  readonly waiting: number;
  readonly reasons: Record<string, number>;
  readonly last: { readonly level: UiGpuFallbackLevel; readonly reason: string | null } | null;
}

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
  /**
   * GM-14c: a page the Vite dev server serves (`uiGpuDevBuild`: DEV and MODE `development`, as GM-16b's table) -- the
   * only page that honours `?uiGpuGuard=on` and `?uiGpuGuardPlant=`. Absent or false (every built page, the nightly
   * included): both keys do nothing.
   */
  readonly devBuild?: boolean;
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
  /**
   * GM-16: the guard's compares this session, every trip (with its renderer), and the last record; GM-14c: the surfaces
   * whose `on` frames the dev server's `?uiGpuGuard=on` guards (`armed`), and the test's plant (`plant`, a byte offset or
   * `exact`). Review fold F3: a compare skipped (an HD image not resident) is counted in `skips`, never in `compares`.
   */
  readonly guard: {
    readonly compares: number; readonly skips: number; readonly trips: readonly UiGpuGuardRecord[]; readonly last: UiGpuGuardRecord | null;
    readonly armed: readonly UiGpuSurface[]; readonly plant: UiGpuGuardPlant | null;
  };
  /** GM-16c: why frames were L1 -- the last refusal and each reason's frames (`UI_GPU_REFUSAL_KEYS_MAX` keys at most). */
  readonly refusals: { readonly last: UiGpuRefusal | null; readonly counts: Record<string, number> };
  /**
   * GM-30: the counts per surface (`UiGpuSurfaceLadderReadout`), every surface present. Added beside the older keys, whose
   * shapes are unchanged: a surface whose frames reach the switch only through `count(level)` (a host made from the
   * switch itself) moves the aggregate `levels` and not its entry here. The flip's change (GM-30 review finding 1): the
   * front end's own presenter takes `hostFor('front')`, so its frames count in `surfaces.front` as well.
   */
  readonly surfaces: Record<UiGpuSurface, UiGpuSurfaceLadderReadout>;
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
  private readonly devBuild: boolean;
  private readonly table: UiGpuSurfaceTable;
  private readonly blendTable: UiGpuBlendTable;
  private readonly killed = new Map<UiGpuSurface, UiGpuKillReason>();
  private readonly kills: { reason: UiGpuKillReason; surface: UiGpuSurface | null }[] = [];
  private readonly escalated = new Set<UiGpuSurface>();
  private readonly levels: Record<UiGpuLevel, number> = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 };
  private contexts = 0;
  private guardCompares = 0;
  private guardSkips = 0;
  private readonly guardTrips: UiGpuGuardRecord[] = [];
  private guardLast: UiGpuGuardRecord | null = null;
  private refusalLast: UiGpuRefusal | null = null;
  private readonly refusalCounts = new Map<string, number>();
  private readonly ladders = new Map<UiGpuSurface, {
    levels: Record<UiGpuLevel, number>; waiting: number; reasons: Map<string, number>; last: UiGpuSurfaceLadderReadout['last'];
  }>(UI_GPU_SURFACES.map((s) => [s, { levels: { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 }, waiting: 0, reasons: new Map(), last: null }]));

  constructor(opts: UiGpuSwitchOptions) {
    this.url = parseUiGpuUrl(opts.search);
    this.storageKill = readStorageKill(opts.storage);
    this.devTools = opts.devTools;
    this.devBuild = opts.devBuild === true;
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

  /**
   * GM-14c: whether `surface`'s `on` frames are guarded (`UiGpuSurfacePresenter`, the guard's idle raster at the shown
   * scale): `?uiGpuGuard=on` on the Vite dev server, for the surfaces the address names (`uiGpuSurface`). It turns no
   * surface on -- the mode is `resolve`'s -- and a built page never answers true.
   */
  guardOn(surface: UiGpuSurface): boolean {
    return this.devBuild && this.url.guard && this.url.surfaces.includes(surface);
  }

  /** GM-14c: the test's plant for `surface` (`?uiGpuGuardPlant=`): a byte offset of the reference, only where `guardOn`. */
  guardPlant(surface: UiGpuSurface): UiGpuGuardPlant | null {
    return this.guardOn(surface) ? this.url.guardPlant : null;
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

  /**
   * Count one frame or event at a fallback level. GM-30: with `surface` (a surface's host from `hostFor`), counted in that
   * surface's entry too; without it (the front end's presenter, a test's), the aggregate only, as before.
   */
  count(level: UiGpuLevel, surface?: UiGpuSurface): void {
    this.levels[level] += 1;
    if (surface !== undefined) this.counted(surface, level, null);
  }

  /**
   * GM-30: a frame `surface`'s mount sent to the page's own software (`UiGpuCanvasMount.readyOn`), at `level` for
   * `reason`: a ladder level counted in the aggregate and the surface, `waiting` in the surface only.
   */
  fallback(surface: UiGpuSurface, level: UiGpuFallbackLevel, reason: string | null): void {
    if (level !== 'waiting') this.levels[level] += 1;
    this.counted(surface, level, reason);
  }

  private counted(surface: UiGpuSurface, level: UiGpuFallbackLevel, reason: string | null): void {
    const l = this.ladders.get(surface)!;
    if (level === 'waiting') l.waiting += 1;
    else l.levels[level] += 1;
    if (reason !== null) { const k = `${level}:${reason}`; l.reasons.set(k, (l.reasons.get(k) ?? 0) + 1); }
    l.last = { level, reason };
  }

  /**
   * GM-30: the switch as one surface's host (`./uiGpuPresenter` `UiGpuSurfaceHost`) and ladder (`UiGpuLadder`): its
   * frames counted under `surface` too (`count`, `fallback`); every other call is the switch's own, unchanged.
   * `./uiGpuSurfaceMount` `uiGpuSurfaceLoader` hands it to the overlay's and the loading panel's surfaces and mounts.
   */
  hostFor(surface: UiGpuSurface) {
    return {
      kill: (reason: UiGpuKillReason, s?: UiGpuSurface): void => { this.kill(reason, s); },
      count: (level: UiGpuLevel): void => { this.count(level, surface); },
      fallback: (level: UiGpuFallbackLevel, reason: string | null): void => { this.fallback(surface, level, reason); },
      adjustContexts: (delta: number): void => { this.adjustContexts(delta); },
      resolve: (s: UiGpuSurface, scale: number): UiGpuResolution => this.resolve(s, scale),
      escalateBlend: (s: UiGpuSurface): void => { this.escalateBlend(s); },
      guarded: (record: UiGpuGuardRecord): void => { this.guarded(record); },
      refused: (s: UiGpuSurface, why: readonly string[]): void => { this.refused(s, why); },
      guardOn: (s: UiGpuSurface): boolean => this.guardOn(s),
      guardPlant: (s: UiGpuSurface): UiGpuGuardPlant | null => this.guardPlant(s),
    };
  }

  /**
   * GM-16: one guard record from a surface (`./uiGpuGuard`): counted, a trip kept for the session's read-out. Review fold
   * F3: a skipped record (GM-14c, `record.skipped`) is counted in `skips`, not as a compare.
   */
  guarded(record: UiGpuGuardRecord): void {
    if (record.skipped) this.guardSkips += 1;
    else this.guardCompares += 1;
    this.guardLast = record;
    if (record.trip) this.guardTrips.push(record);
  }

  /**
   * GM-16c: a surface's L1 frame, refused by its plan (a software verdict, `uiFramePlan.ts`) or by the backend
   * (`UiGpuBackend.refusal`, a texture upload wait): kept as the last refusal and each reason counted once for the frame
   * (a frame with no reason under `(none)`; past `UI_GPU_REFUSAL_KEYS_MAX` distinct reasons, under `(other)`; GM-14b's
   * route under its one reason, `uiGpuRefusalKey`, its per-image detail kept in `last`).
   */
  refused(surface: UiGpuSurface, why: readonly string[]): void {
    this.refusalLast = { surface, why: why.slice(), at: this.levels.L1 };
    for (const reason of why.length ? why : [REFUSAL_NONE]) {
      const w = uiGpuRefusalKey(reason);   // GM-14b review F2: the large-image route under its one key, its detail in `last`
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
      guard: {
        compares: this.guardCompares, skips: this.guardSkips, trips: this.guardTrips.slice(), last: this.guardLast,
        armed: UI_GPU_SURFACES.filter((s) => this.guardOn(s)), plant: this.guardPlant('front'),
      },
      refusals: {
        last: this.refusalLast && { ...this.refusalLast, why: this.refusalLast.why.slice() },
        counts: Object.fromEntries(this.refusalCounts),
      },
      surfaces: Object.fromEntries(UI_GPU_SURFACES.map((s) => {
        const l = this.ladders.get(s)!;
        return [s, { levels: { ...l.levels }, waiting: l.waiting, reasons: Object.fromEntries(l.reasons), last: l.last && { ...l.last } }];
      })) as Record<UiGpuSurface, UiGpuSurfaceLadderReadout>,
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
    table: uiGpuPageTable(uiGpuDevBuild()),                               // GM-16b's split; since the flip (GM.R18) both tables every cell on
    devBuild: uiGpuDevBuild(),                                             // GM-14c: ?uiGpuGuard / ?uiGpuGuardPlant on the dev server only
  });
  if (typeof window !== 'undefined') page.expose(window);
  return page;
}
