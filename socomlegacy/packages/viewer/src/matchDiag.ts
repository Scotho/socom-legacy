import { detectDeviceClass, XBOX_AGENT_TOKEN_ADAPTATION, XBOX_DRIVER_TOKEN_ADAPTATION, type DeviceSignals } from './deviceClass';
import type { SourcesSnapshot } from './inputSources';

/**
 * XBOX-DIAG (product track, **an instrument with no original**; the main controller's order 2026-11-11 for v0.4.19, on
 * b0's field read `agent-mail/evidence/respawn-join-1111/REPORT.md`: no Xbox load since v0.4.16 lasted 5 minutes in a
 * match -- the WebGL2 context lost ~11-12 s after the match's mount, or seated with smooth frames and no input until the
 * idle kick). Two reports on the client error beacon (`./clientErrorBeacon`), its free `kind` and its `message` as compact
 * JSON -- no new field, so central's v1 shape keeps them as it is:
 * - **`contextdiag`**, at a lost WebGL context or WebGPU device, any page: the backend, a sample of the renderer now and
 *   a ring of the last `DIAG_RING_ADAPTATION` samples, one every `DIAG_SAMPLE_MS_ADAPTATION` since the mount (the growth
 *   before the loss, not the moment alone) -- each with the load phase reached (`./loadMarks`: the clock starts at the
 *   mount, so a loss at 12 s may be inside the load's warm) -- the drawing buffer, the shader links, the JS heap, the
 *   device memory; on an Xbox-marked page, the input summary as of the loss too (a page lost at 12 s never reaches the
 *   input report).
 * - **`inputdiag`**, once a match on an Xbox-marked page, at `INPUT_DIAG_AT_MS_ADAPTATION` after the mount or at the
 *   match's end if sooner: `navigator.gamepadInputEmulation`, the pads the match saw (`GamePad`'s connected list), the
 *   first button and stick, the frames the hold held the pad, the match's input frames and how many carried input, focus,
 *   visibility, user activation, pointer lock -- and which input drove the menus before and the match since
 *   (`./inputSources`: Gamepad API, keys, pointer).
 * Xbox-marked: the agent's `Xbox` token, the driver `SraKmd_`, or the device class, each kept as its own flag. Nothing
 * of a player: no account, name, address or agent string; a pad's id is the device's model string, cut. It changes
 * nothing the game does. The sampler reads `renderer.info` into one preallocated ring, allocation-free, and runs only
 * between a match's mount and its end.
 */

/** Between the ring's samples, ms. An adaptation. */
export const DIAG_SAMPLE_MS_ADAPTATION = 2000;
/** The ring's length: 16 s of history before a loss. An adaptation. */
export const DIAG_RING_ADAPTATION = 8;
/** When the input report goes, ms after the mount: well before the room's 240 s idle kick. An adaptation. */
export const INPUT_DIAG_AT_MS_ADAPTATION = 45_000;
/** A pad's id, characters, cut inside the JSON (the report never cut). */
export const DIAG_PAD_ID_CHARS_ADAPTATION = 48;
/** The message's bound: the beacon's message cap (`BEACON_CAPS_ADAPTATION.message`); every report is built under it. */
export const DIAG_MESSAGE_MAX = 1024;

/** A number as the JSON carries it: finite, rounded to `digits`, within [0, `max`]; else null. */
const num = (v: unknown, digits = 0, max = 999_999): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const k = 10 ** digits;
  return Math.round(Math.min(max, Math.max(0, v)) * k) / k;
};
/**
 * A string as the JSON carries it (review F3): cut, then every character JSON would escape (a control, a quote, a
 * backslash) and every one past ASCII put as `?` -- so its JSON length is its length, and the 1024 bound holds whatever
 * a device names itself.
 */
const cut = (s: unknown, n: number): string | null => (typeof s === 'string' ? s.slice(0, n).replace(/[^\x20-\x7e]|["\\]/g, '?') : null);

/** How the page was taken for an Xbox, each signal apart (b0's read could see the driver alone). */
export interface XboxMarks { ua: boolean; sraKmd: boolean; cls: boolean }

export function xboxMarks(s: DeviceSignals): XboxMarks {
  return { ua: XBOX_AGENT_TOKEN_ADAPTATION.test(s.userAgent), sraKmd: XBOX_DRIVER_TOKEN_ADAPTATION.test(s.renderer ?? ''), cls: detectDeviceClass(s) === 'xbox' };
}
export const xboxMarked = (m: XboxMarks): boolean => m.ua || m.sraKmd || m.cls;

/** `renderer.info` as the sampler reads it (three r186's common `Info`, `memory`'s counts); every field optional. */
export interface DiagInfo {
  memory?: { geometries?: number; textures?: number; uniformBuffers?: number; programs?: number; total?: number };
  programs?: { length: number } | null;
}
/** What the match hands the sampler, read at each sample. */
export interface DiagSource {
  info: () => DiagInfo | null | undefined;
  /** The dynamic pixel ratio now, or null. */
  scale: () => number | null | undefined;
  /** The drawing buffer, or null. */
  buffer: () => { w: number; h: number } | null | undefined;
  /** The load phase reached (`./loadMarks` `loadPhaseReached`: an index of `LOAD_PHASES`), -1 none. */
  phase?: () => number;
  /** The shader programs linked since the page began (`./linkLog`'s total), or null. */
  links?: () => number | null | undefined;
}

/** A sample's lanes: seconds after the mount, geometries, textures, uniform buffers, programs, three's bytes (MB), scale, load phase. */
const LANES = 8;

/** The ring: `DIAG_RING_ADAPTATION` samples in one array, written in place. */
export class DiagRing {
  private readonly a = new Float64Array(DIAG_RING_ADAPTATION * LANES);
  private n = 0;
  private next = 0;

  /** One sample, written over the oldest: no allocation. */
  write(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number): void {
    const o = this.next * LANES, a = this.a, m = info?.memory;
    a[o] = t;
    a[o + 1] = m?.geometries ?? -1;
    a[o + 2] = m?.textures ?? -1;
    a[o + 3] = m?.uniformBuffers ?? -1;
    a[o + 4] = info?.programs?.length ?? m?.programs ?? -1;
    a[o + 5] = typeof m?.total === 'number' ? m.total / 1_048_576 : -1;
    a[o + 6] = typeof scale === 'number' ? scale : -1;
    a[o + 7] = phase;
    this.next = (this.next + 1) % DIAG_RING_ADAPTATION;
    if (this.n < DIAG_RING_ADAPTATION) this.n++;
  }

  clear(): void { this.n = 0; this.next = 0; }

  /** The samples, oldest first, each `[t s, geometries, textures, uniform buffers, programs, MB, scale, phase]`; an unread lane null. */
  rows(): (number | null)[][] {
    const out: (number | null)[][] = [];
    for (let i = 0; i < this.n; i++) {
      const o = ((this.next - this.n + i + DIAG_RING_ADAPTATION) % DIAG_RING_ADAPTATION) * LANES;
      const lane = (k: number, digits = 0, max = 999_999): number | null => (this.a[o + k]! < 0 ? null : num(this.a[o + k], digits, max));
      out.push([lane(0, 1, 99_999.9), lane(1), lane(2), lane(3), lane(4), lane(5), lane(6, 2, 9.99), lane(7, 0, 9)]);
    }
    return out;
  }
}

/** The match's own input record, from zero at each mount. */
export class InputTrack {
  /** The most pads one read found, the first pad's id and mapping. */
  pads = 0;
  padId: string | null = null;
  mapping: string | null = null;
  /** The first button pressed and when (s after the mount), and the first stick past 0.05 (s). */
  firstButton: number | null = null;
  firstButtonT: number | null = null;
  firstStickT: number | null = null;
  /** Frames the hold (the load's, `o.blocked`) held the pad. */
  held = 0;
  /** XBOX-PAD-HINT (`./padHint`): the no-controller hint showed this match. */
  hintShown = false;
  /** The match's input frames (the game's lanes as the pad and touch built them), and those with any input. */
  frames = 0;
  framesWithInput = 0;

  reset(): void {
    this.pads = 0; this.padId = null; this.mapping = null;
    this.firstButton = null; this.firstButtonT = null; this.firstStickT = null;
    this.held = 0; this.frames = 0; this.framesWithInput = 0; this.hintShown = false;
  }

  /** The match's connected pads this frame (`ControllerInput.devices`), `t` s after the mount: no allocation past the first pad's strings. */
  poll(pads: ArrayLike<{ id?: string; mapping?: string; buttons?: ArrayLike<{ pressed?: boolean }>; axes?: ArrayLike<number> } | null> | null | undefined, t: number): void {
    if (!pads) return;
    let n = 0;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p) continue;
      n++;
      if (this.padId === null) { this.padId = typeof p.id === 'string' ? p.id : ''; this.mapping = typeof p.mapping === 'string' ? p.mapping : ''; }
      if (this.firstButton === null && p.buttons) {
        for (let b = 0; b < p.buttons.length; b++) if (p.buttons[b]?.pressed) { this.firstButton = b; this.firstButtonT = t; break; }
      }
      if (this.firstStickT === null && p.axes) {
        for (let k = 0; k < p.axes.length; k++) if (Math.abs(p.axes[k] ?? 0) > 0.05) { this.firstStickT = t; break; }
      }
    }
    if (n > this.pads) this.pads = n;
  }

  /** One input frame of the match's game lanes; `input` when it carried a stick, a look or a button. */
  gameFrame(input: boolean): void { this.frames++; if (input) this.framesWithInput++; }
}

/** The match's game lanes as the diagnostic reads them (`./gamepad` `Input`'s axes and buttons). */
export interface GameInputLike {
  moveX: number; moveY: number; lookX: number; lookY: number;
  jump: boolean; crouch: boolean; stance: boolean; boost: boolean; fire: boolean; zoom: boolean; prone: boolean; zoomOut: boolean; fireMode: boolean;
  action: boolean; leanLeft: boolean; leanRight: boolean; mode: boolean; swap1: boolean; swap2: boolean; inventory: boolean; scoreboard: boolean; reload: boolean;
}

/** Any input in the lanes: a stick or the look past 0.05, or any button (the room's idle check counts the same kinds). */
export function gameInputActive(i: GameInputLike): boolean {
  if (Math.abs(i.moveX) > 0.05 || Math.abs(i.moveY) > 0.05 || Math.abs(i.lookX) > 0.05 || Math.abs(i.lookY) > 0.05) return true;
  return i.jump || i.crouch || i.stance || i.boost || i.fire || i.zoom || i.prone || i.zoomOut || i.fireMode || i.action || i.leanLeft || i.leanRight
    || i.mode || i.swap1 || i.swap2 || i.inventory || i.scoreboard || i.reload;
}

/** The page's state the reports read when they go (each part optional: a part that cannot be read is null). */
export interface PageState {
  emulation?: unknown;
  focus?: unknown;
  visibility?: unknown;
  activation?: unknown;
  pointerLock?: unknown;
}

/** The input summary as JSON's object: short keys, every string cut, every number bounded. */
export function inputSummary(i: InputTrack, p: PageState, s: SourcesSnapshot): Record<string, unknown> {
  const flag = (v: unknown): 0 | 1 | null => (typeof v === 'boolean' ? (v ? 1 : 0) : null);
  return {
    emu: cut(p.emulation, 12) ?? (p.emulation === undefined ? 'absent' : null),
    con: num(s.connected), dis: num(s.disconnected), pads: num(i.pads),
    id: cut(i.padId, DIAG_PAD_ID_CHARS_ADAPTATION), map: cut(i.mapping, 12),
    btn: num(i.firstButton), btnT: num(i.firstButtonT, 1, 99_999.9), stkT: num(i.firstStickT, 1, 99_999.9),
    hld: num(i.held), gf: num(i.frames), gfIn: num(i.framesWithInput), hint: i.hintShown ? 1 : 0,
    menu: { pad: num(s.menu.pad), key: num(s.menu.key), ptr: num(s.menu.ptr), last: s.last },
    match: { pad: num(s.match.pad), key: num(s.match.key), ptr: num(s.match.ptr) },
    foc: flag(p.focus), vis: cut(p.visibility, 9), act: flag(p.activation), lock: flag(p.pointerLock),
  };
}

const marksJson = (m: XboxMarks): Record<string, 0 | 1> => ({ ua: m.ua ? 1 : 0, sk: m.sraKmd ? 1 : 0, cl: m.cls ? 1 : 0 });

/** What both reports carry beside their own part. */
export interface DiagCommon { marks: XboxMarks; backend: string | null; heapMB?: number | null; deviceMemory?: number | null }

/**
 * `contextdiag`'s message: why, the backend, the marks, the ring and a sample now, the buffer, the links, the heap, the
 * device memory; with the input summary when `input` is given. Under `DIAG_MESSAGE_MAX` always: the ring's oldest
 * samples go first should it not fit (it does at every bound the fields have; the test holds the worst case).
 */
export function contextDiagMessage(why: string, c: DiagCommon, ring: DiagRing, now: (number | null)[], buffer: { w: number; h: number } | null | undefined,
  links: number | null | undefined, input: Record<string, unknown> | null): string {
  const rows = ring.rows();
  const make = (r: (number | null)[][]): string => JSON.stringify({
    v: 1, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), now, r,
    buf: buffer ? [num(buffer.w), num(buffer.h)] : null, lk: num(links), heap: num(c.heapMB), dm: num(c.deviceMemory, 1, 999.9),
    ...(input ? { in: input } : {}),
  });
  let s = make(rows);
  while (s.length > DIAG_MESSAGE_MAX && rows.length > 0) { rows.shift(); s = make(rows); }
  // Never reached at the fields' bounds (the test's worst case); a message cut by the beacon would be no JSON at all.
  if (s.length > DIAG_MESSAGE_MAX) s = JSON.stringify({ v: 1, why: cut(why, 20), bk: cut(c.backend, 12), m: marksJson(c.marks), cut: 1 });
  return s;
}

/** `inputdiag`'s message: the marks, the backend, seconds after the mount, the input summary. */
export function inputDiagMessage(c: DiagCommon, t: number, input: Record<string, unknown>): string {
  return JSON.stringify({ v: 1, bk: cut(c.backend, 12), m: marksJson(c.marks), t: num(t, 1, 99_999.9), in: input });
}

/** A sample now, as a ring row reads (`DiagRing.rows`), for the loss's own moment. */
export function sampleNow(t: number, info: DiagInfo | null | undefined, scale: number | null | undefined, phase: number): (number | null)[] {
  const r = new DiagRing();
  r.write(t, info, scale, phase);
  return r.rows()[0]!;
}

/** The kinds the two reports go as (`./clientErrorBeacon`'s `BeaconKind`). */
export type DiagKind = 'contextdiag' | 'inputdiag';

export interface MatchDiagOptions {
  marks: () => XboxMarks;
  page: () => PageState;
  sources: () => SourcesSnapshot;
  backend: () => string | null;
  heapMB?: () => number | null;
  deviceMemory?: () => number | null;
  send: (kind: DiagKind, message: string) => void;
}

/**
 * The page's diagnostic: the ring sampled at the match's frames, the input tracked, the two reports sent. Off between
 * matches (`frame` returns at once); one input report a match, on an Xbox-marked page only.
 */
export class MatchDiag {
  readonly ring = new DiagRing();
  readonly input = new InputTrack();
  private origin: number | null = null;
  private lastSample = -Infinity;
  private source: DiagSource | null = null;
  private marks: XboxMarks = { ua: false, sraKmd: false, cls: false };
  private inputSent = false;

  constructor(private readonly o: MatchDiagOptions) {}

  /** The match mounted at `now` (ms): the ring and the match's input from zero. */
  begin(now: number, source: DiagSource): void {
    this.origin = now; this.source = source; this.lastSample = -Infinity; this.inputSent = false;
    this.ring.clear(); this.input.reset();
    this.marks = this.readMarks();
  }

  get running(): boolean { return this.origin !== null; }

  /** The page was taken for an Xbox at this match's mount (any of the three marks). */
  get xboxMarked(): boolean { return xboxMarked(this.marks); }

  /**
   * XBOX-PAD-HINT review F2: the console's own signals only -- the agent's token or the `SraKmd_` driver; never the class
   * alone, which a PC with the saved "Request Game Files (XBOX)" pick also is.
   */
  get xboxConsole(): boolean { return this.marks.ua || this.marks.sraKmd; }

  /** A match frame: a sample every `DIAG_SAMPLE_MS_ADAPTATION`, the input report at its time. Nothing outside a match. */
  frame(now: number): void {
    if (this.origin === null) return;
    if (now - this.lastSample >= DIAG_SAMPLE_MS_ADAPTATION) {
      this.lastSample = now;
      const s = this.source;
      this.ring.write((now - this.origin) / 1000, s?.info(), s?.scale(), s?.phase?.() ?? -1);
    }
    if (!this.inputSent && now - this.origin >= INPUT_DIAG_AT_MS_ADAPTATION) this.sendInput(now);
  }

  /** The match's connected pads this frame, as its reader found them; `held` when the hold flushed the pad. */
  pads(pads: Parameters<InputTrack['poll']>[0], now: number, held = false): void {
    if (this.origin === null) return;
    if (held) this.input.held++;
    this.input.poll(pads, (now - this.origin) / 1000);
  }

  /** The match's game lanes this frame (`./gamepad` `Input`, as the pad and touch built them): counted, with input or not. */
  gameInput(i: GameInputLike): void { if (this.origin !== null) this.input.gameFrame(gameInputActive(i)); }

  /** The match ended: its input report now if it never went; then nothing of it kept (review F2: a later loss is not its). */
  end(now: number): void {
    if (this.origin !== null && !this.inputSent) this.sendInput(now);
    this.origin = null; this.source = null;
    this.ring.clear(); this.input.reset();
  }

  /** A lost WebGL context or WebGPU device (`why`, the beacon's kind): `contextdiag`, in or out of a match. */
  lost(why: string, now: number): void {
    const s = this.source;
    const t = this.origin === null ? null : (now - this.origin) / 1000;
    const read = <T,>(f: (() => T) | undefined): T | null => { try { return f ? f() : null; } catch { return null; } };
    const nowRow = s ? sampleNow(t ?? 0, read(s.info), read(s.scale), read(s.phase) ?? -1) : [];
    if (t === null && nowRow.length > 0) nowRow[0] = null;
    const marks = this.origin === null ? this.readMarks() : this.marks;
    const input = xboxMarked(marks) ? inputSummary(this.input, this.pageState(), this.sourcesNow()) : null;
    this.o.send('contextdiag', contextDiagMessage(why, this.common(marks), this.ring, nowRow, read(s?.buffer), read(s?.links), input));
  }

  private sendInput(now: number): void {
    this.inputSent = true;
    if (!xboxMarked(this.marks) || this.origin === null) return;
    this.o.send('inputdiag', inputDiagMessage(this.common(this.marks), (now - this.origin) / 1000, inputSummary(this.input, this.pageState(), this.sourcesNow())));
  }

  private readMarks(): XboxMarks { try { return this.o.marks(); } catch { return { ua: false, sraKmd: false, cls: false }; } }
  private pageState(): PageState { try { return this.o.page(); } catch { return {}; } }
  private sourcesNow(): SourcesSnapshot {
    try { return this.o.sources(); } catch { return { menu: { pad: 0, key: 0, ptr: 0 }, match: { pad: 0, key: 0, ptr: 0 }, last: null, connected: 0, disconnected: 0 }; }
  }
  private common(marks: XboxMarks): DiagCommon {
    const part = <T,>(f: (() => T) | undefined): T | null => { try { return f ? f() : null; } catch { return null; } };
    return { marks, backend: part(this.o.backend), heapMB: part(this.o.heapMB), deviceMemory: part(this.o.deviceMemory) };
  }
}
