import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, extname, join } from 'node:path';
import type { SiteServer } from '../../siteServer';
import {
  CLOCK_TICK_MS, DEFAULT_PACK_BUILD, GUI_PORT, HEARTBEAT_MS, PACK_BUILDS, PACK_CHORDS, PACK_PATHS, PAD_LAYOUT_NAMES, PAD_PRESETS, PORT_TRIES, SITE_PORT,
  STATE_SLOTS, packPath, type PackBuild, type PackChord, type PackPadLayout, type PadPreset, type PadPresetName,
} from './layout';
import { PrepareBusy, type Preparer } from './prepare';
import { SaveRefused, save, type WriteZipFile } from './save';
import { HarnessSession, newestRunDirIn, type SessionKind, type SessionView, type SpawnFn } from './session';
import { canPlay, checklist, findBrowser, firstRefusal, keyTable, withBios, type BrowserChoice, type CheckLine, type KeyRow } from './state';
import type { SystemFacts } from './system';

/** The clips' bytes at which the GUI warns (design 5): the Save file refuses at 4 GB (LATER 666). */
export const CLIP_WARN_BYTES = 3 * 1024 * 1024 * 1024;

/**
 * The parity pack's GUI server (PK-5; docs/specs/2026-11-03-parity-pack-design.md 5, 10 and 11). Product track (OT.R53):
 * the GUI of a validation instrument, an adaptation with no original, never in a build and never changing the game's
 * behaviour. Node `http` on 127.0.0.1 only (GUI_PORT; a port in use: the next two, said in the log), the page at `/`,
 * the state as `GET /api/status` and as server-sent events (`GET /api/events`: the same object on every change, a
 * heartbeat comment every HEARTBEAT_MS), the commands as `POST /api/<verb>` with a JSON body; every refusal a 409 with one
 * sentence. The pack's site server (`../../siteServer`) runs beside it on SITE_PORT once the maps are prepared.
 *
 * The local guards (an adaptation's, against another page in the tester's browser driving this one): the Host header must
 * be this server's own address; a POST must be `application/json` (a cross-origin form cannot send it without a
 * preflight, which is never answered) and, when it carries an Origin, this server's origin.
 *
 * Commands: prepare (the maps from the image, once), play (a session when none; resumes a paused one), pause, record
 * ({ on }), save (ends the session, waits for its record, zips it), stop (PK-8: ends the session, its record kept as the
 * unsaved one, no zip), reset (PK-8: stop, then a new session with the same settings), boot (the mark flow: PCSX2 with
 * the image and no state), mark, settings ({ build, layout, chord, chordSolo, preset, notes }), pad ({ seen, id,
 * mapping }: the page's own navigator.getGamepads, for the checklist's pad line only), open-folder (handoff/ in
 * Explorer).
 */

export interface GuiDeps {
  readonly packRoot: string;
  /** The folder holding index.html (pack/harness/gui). */
  readonly guiDir: string;
  /** The design system's css, served under /ds/ (pack/harness/gui/ds), or null. */
  readonly dsDir?: string | null;
  /** The fonts the design system's fonts.css names under /fonts/ (pack/site/fonts), or null. */
  readonly fontsDir?: string | null;
  readonly harnessEntry: string;
  readonly nodePath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
  /** tools/eph/run.ts findOnPath (injected: only ../harness.ts imports run.ts). */
  readonly findOnPath: (name: string, env: Readonly<Record<string, string | undefined>>, exists: (p: string) => boolean) => string | null;
  readonly readElfCrc: (iso: string) => Promise<string>;
  readonly spawn: SpawnFn;
  readonly killTree: (pid: number) => void;
  readonly preparer: Preparer;
  readonly writeZipFile: WriteZipFile;
  readonly systemFacts: () => Promise<SystemFacts>;
  readonly openFolder: (path: string) => void;
  readonly startSite: (o: { site: string; maps: string; host: string; port: number }) => Promise<SiteServer>;
  readonly log: (line: string) => void;
  readonly now?: () => Date;
  /** How long Save waits for the session to end before it is refused (the child's own grace is END_GRACE_MS). */
  readonly saveWaitMs?: number;
}

export interface GuiOptions {
  readonly host?: string;
  /** 0 for any free port (tests). */
  readonly port?: number;
  readonly sitePort?: number;
}

export interface Settings { build: PackBuild; layout: PackPadLayout; chord: PackChord; chordSolo: boolean; notes: string }
/** What a session was launched with: the settings Save writes into its system.json, whatever the controls say by then. */
export type LaunchSettings = Readonly<Pick<Settings, 'build' | 'layout' | 'chord' | 'chordSolo'>>;

/** Stop's words (PK-8), the notice after a Stop. */
export const STOPPED_WORDS = 'Stopped. Save keeps this session as a file, or Play starts a new one.';

export interface GuiStatus {
  readonly checklist: readonly CheckLine[];
  readonly canPlay: boolean;
  readonly settings: Settings;
  readonly session: Omit<SessionView, 'exitCode'> & { readonly words: string; readonly active: boolean; readonly clipBytes: number };
  readonly prepare: { running: boolean; done: number; total: number; file: string | null; line: string | null; error: string | null };
  readonly saved: { path: string; bytes: number } | null;
  /** The ended run directory Save would take when no session plays (PK-8: after a Stop or a Reset), or null. */
  readonly unsaved: string | null;
  /** A Reset from its start until the new session reports live (or ends). */
  readonly resetting: boolean;
  /** The pad presets the page offers (PK-8), in order. */
  readonly padPresets: readonly ({ readonly name: PadPresetName } & PadPreset)[];
  readonly pack: { name: string; pageTag: string; pageSha: string; build: PackBuild };
  readonly keys: readonly KeyRow[];
  /** The last refusal or result in one sentence, or null. */
  readonly notice: string | null;
}

class Refusal extends Error {}

const NO_SESSION: GuiStatus['session'] = {
  kind: 'live', phase: 'idle', paused: false, recording: false, clip: null, clips: 0, activeMs: 0, saved: false, repair: false, clipBytes: 0,
  refusal: null, lines: [], words: 'no session', active: false,
};

/** The session's phase in plain words (design 5: the tester reads sentences, not fields). */
export function phaseWords(kind: SessionKind, phase: string, refusal: string | null): string {
  if (kind === 'mark') {
    switch (phase) {
      case 'starting': case 'setup': return 'starting PCSX2 with your image';
      case 'ready': return 'PCSX2 is up: play to the starting point with the keys below, then press Mark starting point';
      case 'saving': return 'saving the starting point';
      case 'ending': return 'closing PCSX2';
      default: return refusal ? `PCSX2 stopped: ${refusal}` : 'PCSX2 closed';
    }
  }
  switch (phase) {
    case 'starting': case 'setup': return 'starting PCSX2 and the page: leave both windows alone until they say play';
    case 'live': return 'playing';
    case 'paused': return 'paused';
    case 'ending': return 'ending the session and writing its record';
    default: return refusal ? `the session stopped: ${refusal}` : 'the session ended';
  }
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, or: string): string => (typeof v === 'string' && v.trim() !== '' ? v : or);

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
};

export interface Gui {
  readonly url: string;
  readonly port: number;
  status(): GuiStatus;
  /** Ends the session child first (its `end`, then its PID tree after the grace), then both servers. */
  close(): Promise<void>;
}

/** Listen on `port`, else the next PORT_TRIES - 1 (each one in use said); port 0 takes any free port. */
async function listenFrom(server: Server, host: string, port: number, log: (l: string) => void, what: string): Promise<number> {
  const tries = port === 0 ? 1 : PORT_TRIES;
  for (let i = 0; i < tries; i++) {
    const p = port === 0 ? 0 : port + i;
    try {
      await new Promise<void>((ok, fail) => {
        server.once('error', fail);
        server.listen(p, host, () => { server.off('error', fail); ok(); });
      });
      const a = server.address();
      return typeof a === 'object' && a ? a.port : p;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || i === tries - 1) throw err;
      log(`${what}: port ${p} is in use, trying ${p + 1}`);
    }
  }
  throw new Error(`${what}: no port free`);
}

export async function startGui(d: GuiDeps, o: GuiOptions = {}): Promise<Gui> {
  const host = o.host ?? '127.0.0.1';
  const root = d.packRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const at = (rel: string): string => packPath(root, rel);
  const now = d.now ?? (() => new Date());
  const versionPath = at(PACK_PATHS.version);
  const version = readJson(versionPath);
  const settings: Settings = {
    build: DEFAULT_PACK_BUILD, layout: PAD_PRESETS.standard.layout, chord: PAD_PRESETS.standard.chord, chordSolo: PAD_PRESETS.standard.chordSolo, notes: '',
  };
  const padPresets = (Object.keys(PAD_PRESETS) as PadPresetName[]).map((name) => ({ name, ...PAD_PRESETS[name] }));
  const keys = keyTable();
  let session: HarnessSession | null = null;
  /** The last live session's record, not yet saved. */
  let unsaved: string | null = null;
  /**
   * The settings that session was launched with (PR #648 P2: once it ends -- by Stop, Reset, the page closing or an
   * error -- the controls open again, and a change made before Save must not relabel the ended session's record).
   */
  let unsavedLaunch: LaunchSettings | null = null;
  const launchOf = (sp: HarnessSession['spec']): LaunchSettings => ({ build: sp.build, layout: sp.layout, chord: sp.chord, chordSolo: sp.chordSolo });
  const keepUnsaved = (sp: HarnessSession['spec'], runDir: string | null): void => {
    if (!runDir) return;
    unsaved = runDir;
    unsavedLaunch = launchOf(sp);
  };
  /** The clock tick while a session plays (CLOCK_TICK_MS), or null. */
  let clock: NodeJS.Timeout | null = null;
  let saved: GuiStatus['saved'] = null;
  let saving = false;
  let padSeen: boolean | null = null;
  let padId: string | null = null;
  let padMapping: string | null = null;
  let resetting = false;
  let notice: string | null = null;
  /** When the live session started (for the clips' bytes); null between sessions. */
  let liveSince: Date | null = null;
  let prepareLine: string | null = null;
  let site: SiteServer | null = null;
  let siteStarting: Promise<void> | null = null;
  const crcCache = new Map<string, { crc: string | null; error: string | null }>();
  const clients = new Set<ServerResponse>();
  let lastSent = '';

  const listFiles = (dir: string): string[] => {
    try {
      return readdirSync(dir).filter((n) => { try { return statSync(join(dir, n)).isFile(); } catch { return false; } });
    } catch {
      return [];
    }
  };
  const runtimeEnv = (): Record<string, string | undefined> => {
    const pathKey = Object.keys(d.env).find((k) => k.toUpperCase() === 'PATH');
    const sep = d.platform === 'win32' ? ';' : ':';
    const path = pathKey ? d.env[pathKey] : '';
    return { ...d.env, PATH: path ? `${at(PACK_PATHS.runtime)}${sep}${path}` : at(PACK_PATHS.runtime) };
  };
  const isos = (): { name: string; size: number; path: string }[] => listFiles(at(PACK_PATHS.dropHere))
    .filter((n) => extname(n).toLowerCase() === '.iso').sort()
    .map((n) => { const path = `${at(PACK_PATHS.dropHere)}/${n}`; return { name: n, size: statSync(path).size, path }; });
  const biosFiles = (): string[] => listFiles(at(PACK_PATHS.dropBios)).filter((n) => extname(n).toLowerCase() === '.bin').sort();
  /** The BIOS files the pack itself carries (built --with-bios, PK.R6). */
  const shippedBios = (): string[] => listFiles(at(PACK_PATHS.bios)).filter((n) => extname(n).toLowerCase() === '.bin').sort();

  const crcOf = (iso: { path: string; size: number }): { crc: string | null; error: string | null } => {
    let key: string;
    try { key = `${iso.path}|${iso.size}|${statSync(iso.path).mtimeMs}`; } catch { key = `${iso.path}|${iso.size}`; }
    const hit = crcCache.get(key);
    if (hit) return hit;
    const pending = { crc: null, error: null };
    crcCache.set(key, pending);
    d.readElfCrc(iso.path).then(
      (crc) => { crcCache.set(key, { crc, error: null }); push(); },
      (err: Error) => { crcCache.set(key, { crc: null, error: err.message.split('\n')[0] ?? 'unreadable' }); push(); },
    );
    return pending;
  };

  const facts = (): { list: CheckLine[]; browser: BrowserChoice | null; iso: string | null } => {
    const found = isos();
    const one = found.length === 1 ? found[0]! : null;
    const crc = one ? crcOf(one) : { crc: null, error: null };
    const p = d.preparer.state;
    const browser = findBrowser(d.env, existsSync, root);
    const list = checklist({
      isos: found, elfCrc: crc.crc, elfCrcError: crc.error, biosFiles: biosFiles(), shippedBios: shippedBios(),
      mapsIndexExists: existsSync(at(PACK_PATHS.mapsIndex)), preparing: p.running ? { done: p.done, total: p.total } : null,
      ffmpegFound: d.findOnPath('ffmpeg', runtimeEnv(), existsSync) !== null, browser, padSeen, padId, padMapping,
    });
    return { list, browser, iso: one?.path ?? null };
  };

  const ensureSite = (): Promise<void> => {
    if (site || !existsSync(at(PACK_PATHS.mapsIndex))) return Promise.resolve();
    siteStarting ??= (async () => {
      let lastErr: unknown = null;
      for (let i = 0; i < (o.sitePort === 0 ? 1 : PORT_TRIES); i++) {
        const port = o.sitePort === 0 ? 0 : (o.sitePort ?? SITE_PORT) + i;
        try {
          site = await d.startSite({ site: at(PACK_PATHS.site), maps: at(PACK_PATHS.maps), host, port });
          d.log(`the site is served at ${site.url}`);
          return;
        } catch (err) {
          lastErr = err;
          if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') break;
          d.log(`the site: port ${port} is in use, trying ${port + 1}`);
        }
      }
      d.log(`the site could not start: ${(lastErr as Error)?.message ?? 'unknown'}`);
    })().finally(() => { siteStarting = null; });
    return siteStarting;
  };

  /** The clips' bytes so far in the live run directory while recording (design 5: the GUI warns at 3 GB; LATER 666). */
  const clipBytes = (): number => {
    const v = session?.view();
    if (!v || v.kind !== 'live' || !session!.running || !liveSince) return 0;
    const dir = newestRunDirIn(at(PACK_PATHS.runs), listFilesAndDirs(at(PACK_PATHS.runs)), liveSince);
    if (!dir) return 0;
    let total = 0;
    for (const n of listFiles(dir)) if (/^clip-\d+\.mp4$/i.test(n)) { try { total += statSync(join(dir, n)).size; } catch { /* a clip mid-write */ } }
    return total;
  };
  const status = (): GuiStatus => {
    const f = facts();
    const v = session?.view();
    const p = d.preparer.state;
    const bytes = v?.recording || (v && v.clips > 0) ? clipBytes() : 0;
    if (bytes >= CLIP_WARN_BYTES && notice === null) notice = 'the clips pass 3 GB: press Save soon (the Save file stops at 4 GB)';
    if (resetting && (!session?.running || v?.phase === 'live')) resetting = false;
    return {
      checklist: f.list,
      canPlay: canPlay(f.list),
      settings: { ...settings },
      session: v
        ? { kind: v.kind, phase: v.phase, paused: v.paused, recording: v.recording, clip: v.clip, clips: v.clips, activeMs: v.activeMs,
          clipBytes: bytes, saved: v.saved, repair: v.repair, refusal: v.refusal, lines: v.lines, words: phaseWords(v.kind, v.phase, v.refusal),
          active: session!.running }
        : NO_SESSION,
      prepare: { running: p.running, done: p.done, total: p.total, file: p.file, line: prepareLine, error: p.error },
      saved,
      unsaved,
      resetting,
      padPresets,
      pack: {
        name: str(version?.pack, basename(root)), pageTag: str(version?.pageTag, 'unknown'), pageSha: str(version?.pageSha, 'unknown'),
        build: settings.build,
      },
      keys,
      notice,
    };
  };

  function push(): void {
    if (clients.size === 0) return;
    const body = JSON.stringify(status());
    if (body === lastSent) return;
    lastSent = body;
    for (const c of clients) c.write(`data: ${body}\n\n`);
  }

  /** The start step (design 5): the pack's folders made, the BIOS copied in and named in the ini. */
  const startStep = (): void => {
    for (const rel of [PACK_PATHS.bios, PACK_PATHS.runs, PACK_PATHS.logs, PACK_PATHS.handoff]) mkdirSync(at(rel), { recursive: true });
    const bins = biosFiles();
    const shipped = shippedBios();
    if (!bins.length && !shipped.length) throw new Refusal('put your PS2 BIOS dump (.bin) in drop-here\\bios');
    for (const n of listFiles(at(PACK_PATHS.dropBios))) {
      if (extname(n).toLowerCase() === '.txt') continue;
      copyFileSync(`${at(PACK_PATHS.dropBios)}/${n}`, `${at(PACK_PATHS.bios)}/${n}`);
    }
    const ini = at(PACK_PATHS.ini);
    if (!existsSync(ini)) throw new Refusal('the pack is incomplete: PCSX2\'s settings file is missing; unzip the pack again');
    writeFileSync(ini, withBios(readFileSync(ini, 'utf8'), (bins[0] ?? shipped[0])!));
  };

  const startSession = (kind: SessionKind, iso: string, browser: BrowserChoice | null): void => {
    startStep();
    const s = new HarnessSession({
      kind, packRoot: root, nodePath: d.nodePath, harnessEntry: d.harnessEntry, build: settings.build, layout: settings.layout,
      chord: settings.chord, chordSolo: settings.chordSolo, siteUrl: site?.url ?? '', iso, browser, pageSha: str(version?.pageSha, 'unknown'),
    }, {
      spawn: d.spawn, env: d.env, killTree: d.killTree, platform: d.platform, now,
      newestRunDir: (since) => newestRunDirIn(at(PACK_PATHS.runs), listFilesAndDirs(at(PACK_PATHS.runs)), since),
    });
    s.onChange(push);
    session = s;
    liveSince = kind === 'live' ? new Date(now()) : null;
    saved = null;
    notice = null;
    s.start();
    if (clock) clearInterval(clock);
    clock = setInterval(push, CLOCK_TICK_MS);
    void s.ended.then((e) => {
      if (clock) { clearInterval(clock); clock = null; }
      if (kind === 'live') keepUnsaved(s.spec, e.runDir);
      d.log(`the ${kind === 'live' ? 'session' : 'mark flow'} ended (exit ${e.code ?? 'signal'})`);
      push();
    });
    d.log(`started the ${kind === 'live' ? `session (${settings.build})` : `mark flow (${settings.build})`}`);
  };

  const live = (): HarnessSession | null => (session && session.running && session.spec.kind === 'live' ? session : null);

  /** Ends the live session `s` as Save does (its `end`, waited up to saveWaitMs); its run directory becomes the unsaved one. */
  const endLive = async (s: HarnessSession, again: string): Promise<string | null> => {
    const wait = d.saveWaitMs ?? 60_000;
    let timer: NodeJS.Timeout | undefined;
    const e = await Promise.race([s.end(), new Promise<null>((ok) => { timer = setTimeout(() => ok(null), wait); })]);
    clearTimeout(timer);
    if (e === null) throw new Refusal(`the session did not end: close the PCSX2 window and press ${again} again`);
    keepUnsaved(s.spec, e.runDir);
    return e.runDir;
  };

  /** A new live session with the settings as they stand, after the checks Play makes. */
  const playNew = async (): Promise<void> => {
    const f = facts();
    if (!canPlay(f.list)) throw new Refusal(firstRefusal(f.list) ?? 'not ready to play');
    await ensureSite();
    if (!site) throw new Refusal('the page could not be served: see the log');
    startSession('live', f.iso!, f.browser);
  };

  const verbs: Record<string, (body: Record<string, unknown>) => Promise<unknown> | unknown> = {
    prepare: () => {
      if (d.preparer.state.running) throw new Refusal('the maps are being prepared already');
      const f = facts();
      const image = f.list.find((l) => l.id === 'image')!;
      if (!image.ok || !f.iso) throw new Refusal(image.text);
      mkdirSync(at(PACK_PATHS.maps), { recursive: true });
      d.preparer.prepare({
        iso: f.iso, maps: at(PACK_PATHS.maps), log: d.log,
        onProgress: (line) => { prepareLine = line; push(); },
      }).then(
        () => { notice = 'the maps are prepared'; void ensureSite().then(push); },
        (err: Error) => { if (!(err instanceof PrepareBusy)) notice = `preparing the maps stopped: ${err.message.split('\n')[0]}`; push(); },
      );
      return { started: true };
    },
    play: async () => {
      const s = live();
      if (s) {
        if (!s.view().paused) throw new Refusal('the session is playing already');
        s.resume();
        return { resumed: true };
      }
      if (session?.running) throw new Refusal('PCSX2 is open for the starting point: press Mark starting point or close it first');
      if (saving) throw new Refusal('the session is being saved');
      if (resetting) throw new Refusal('the session is being reset');
      await playNew();
      return { started: true };
    },
    stop: async () => {
      const s = live();
      if (!s) throw new Refusal('nothing is playing');
      if (saving) throw new Refusal('the session is being saved');
      const runDir = await endLive(s, 'Stop');
      notice = STOPPED_WORDS;
      d.log(`stopped the session${runDir ? `: kept unsaved in ${runDir}` : ''}`);
      return { stopped: true, runDir };
    },
    reset: async () => {
      const s = live();
      if (!s) throw new Refusal('nothing is playing');
      if (saving || resetting) throw new Refusal(saving ? 'the session is being saved' : 'the session is being reset already');
      resetting = true;
      push();
      try {
        const runDir = await endLive(s, 'Reset');
        d.log(`reset: the session ended${runDir ? ` (kept unsaved in ${runDir})` : ''}; starting a new one`);
        await playNew();
      } catch (err) {
        resetting = false;
        throw err;
      }
      return { reset: true, unsaved };
    },
    pause: () => {
      const s = live();
      if (!s) throw new Refusal('nothing is playing');
      if (s.view().paused) throw new Refusal('the session is paused already');
      s.pause();
      return { paused: true };
    },
    record: (b) => {
      if (typeof b.on !== 'boolean') throw new Refusal('say on or off');
      const s = live();
      if (!s) throw new Refusal('nothing is playing: press Play first');
      s.record(b.on);
      return { recording: b.on };
    },
    save: async () => {
      if (saving) throw new Refusal('the session is being saved already');
      if (resetting) throw new Refusal('the session is being reset: Save once it plays');
      if (session?.running && session.spec.kind === 'mark') throw new Refusal('PCSX2 is open for the starting point: there is no session to save');
      saving = true;
      push();
      try {
        let runDir: string | null = unsaved;
        const s = live();
        if (s) runDir = await endLive(s, 'Save');
        if (!runDir) throw new Refusal('there is no session to save: press Play first');
        const launch: LaunchSettings = unsavedLaunch ?? settings;
        const f = facts();
        const out = await save({
          runDir, notes: settings.notes, system: await d.systemFacts(),
          session: {
            browser: f.browser?.name ?? null, build: launch.build, stateSlot: STATE_SLOTS[launch.build], padLayout: launch.layout,
            chord: launch.chord, chordSolo: launch.chordSolo, pad: padId,
            pageBuild: str(version?.pageSha, 'unknown'), pcsx2Version: str(version?.pcsx2Version, 'unknown'),
            elfCrc: [...crcCache.values()].find((c) => c.crc)?.crc ?? null,
          },
          versionPath, version, emulog: at(PACK_PATHS.emulog), handoffDir: at(PACK_PATHS.handoff), writeZipFile: d.writeZipFile, now: now(),
        });
        unsaved = null;
        unsavedLaunch = null;
        saved = { path: out.path, bytes: out.bytes };
        notice = null;
        d.log(`saved ${out.path} (${out.bytes} bytes, ${out.entries} files)`);
        return saved;
      } catch (err) {
        if (err instanceof SaveRefused) throw new Refusal(err.message);
        throw err;
      } finally {
        saving = false;
        push();
      }
    },
    boot: () => {
      if (session?.running || resetting) throw new Refusal('a session is open: save it or close PCSX2 first');
      const f = facts();
      for (const id of ['image', 'bios'] as const) {
        const l = f.list.find((x) => x.id === id)!;
        if (!l.ok) throw new Refusal(l.text);
      }
      startSession('mark', f.iso!, f.browser);
      return { started: true };
    },
    mark: () => {
      if (!session?.running || session.spec.kind !== 'mark') throw new Refusal('press Boot the original first');
      session.mark();
      return { marking: true };
    },
    settings: (b) => {
      if (b.build !== undefined) {
        if (!(PACK_BUILDS as readonly unknown[]).includes(b.build)) throw new Refusal('the build is r0004 or r0001');
        if (session?.running && b.build !== settings.build) throw new Refusal('the build changes once the session is saved');
        settings.build = b.build as PackBuild;
      }
      if (b.layout !== undefined) {
        if (!(PAD_LAYOUT_NAMES as readonly unknown[]).includes(b.layout)) throw new Refusal('the pad layout is standard or machete');
        if (session?.running && b.layout !== settings.layout) throw new Refusal('the pad layout changes once the session is saved');
        settings.layout = b.layout as PackPadLayout;
      }
      const padLocked = (): void => { if (session?.running) throw new Refusal('the pad changes once the session is saved'); };
      if (b.preset !== undefined) {
        if (typeof b.preset !== 'string' || !Object.hasOwn(PAD_PRESETS, b.preset)) throw new Refusal('the pad preset is standard or machete');
        const p = PAD_PRESETS[b.preset as PadPresetName];
        if (p.layout !== settings.layout || p.chord !== settings.chord || p.chordSolo !== settings.chordSolo) padLocked();
        settings.layout = p.layout;
        settings.chord = p.chord;
        settings.chordSolo = p.chordSolo;
      }
      if (b.chord !== undefined) {
        if (!(PACK_CHORDS as readonly unknown[]).includes(b.chord)) throw new Refusal('the chord is l2 or touchpad');
        if (b.chord !== settings.chord) padLocked();
        settings.chord = b.chord as PackChord;
      }
      if (b.chordSolo !== undefined) {
        if (typeof b.chordSolo !== 'boolean') throw new Refusal('say whether the chord works alone');
        if (b.chordSolo !== settings.chordSolo) padLocked();
        settings.chordSolo = b.chordSolo;
      }
      if (b.notes !== undefined) {
        if (typeof b.notes !== 'string' || b.notes.length > 100_000) throw new Refusal('the notes are text, up to 100,000 characters');
        settings.notes = b.notes;
      }
      return { ...settings };
    },
    pad: (b) => {
      if (typeof b.seen !== 'boolean') throw new Refusal('say whether a pad is seen');
      const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null);
      padSeen = b.seen;
      padId = b.seen ? text(b.id, 200) : null;
      padMapping = b.seen && typeof b.mapping === 'string' ? b.mapping.slice(0, 40) : null;
      return { seen: padSeen, id: padId, mapping: padMapping };
    },
    'open-folder': () => {
      mkdirSync(at(PACK_PATHS.handoff), { recursive: true });
      d.openFolder(at(PACK_PATHS.handoff));
      return { opened: true };
    },
  };

  let port = 0;
  const own = (): string[] => [`${host}:${port}`, `localhost:${port}`];
  const json = (res: ServerResponse, code: number, body: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  const file = (res: ServerResponse, path: string): void => {
    try {
      const body = readFileSync(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  };
  const readBody = (req: IncomingMessage): Promise<string> => new Promise((ok, fail) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > 256 * 1024) { fail(new Refusal('the request is too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
    req.on('error', fail);
  });

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (!own().includes(String(req.headers.host ?? ''))) { res.writeHead(421); res.end(); return; }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (url.pathname === '/' || url.pathname === '/index.html') { file(res, join(d.guiDir, 'index.html')); return; }
        if (url.pathname === '/api/status') { json(res, 200, status()); return; }
        if (url.pathname === '/api/events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
          res.write(`data: ${JSON.stringify(status())}\n\n`);
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }
        const m = /^\/(ds|fonts)\/([A-Za-z0-9._-]+)$/.exec(url.pathname);
        const dir = m ? (m[1] === 'ds' ? d.dsDir : d.fontsDir) : null;
        if (m && dir && !m[2]!.startsWith('.')) { file(res, join(dir, m[2]!)); return; }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'GET, HEAD, POST' }); res.end(); return; }
      const verb = /^\/api\/([a-z-]+)$/.exec(url.pathname)?.[1];
      const run = verb && Object.hasOwn(verbs, verb) ? verbs[verb]! : null;
      if (!run) { json(res, 404, { error: 'no such command' }); return; }
      if (!/^application\/json\b/.test(String(req.headers['content-type'] ?? ''))) { json(res, 415, { error: 'commands are JSON' }); return; }
      const origin = req.headers.origin;
      if (origin !== undefined && !own().map((h) => `http://${h}`).includes(origin)) { json(res, 403, { error: 'not this page' }); return; }
      try {
        const text = await readBody(req);
        let body: unknown = {};
        if (text.trim() !== '') {
          try { body = JSON.parse(text); } catch { throw new Refusal('the command is not JSON'); }
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Refusal('the command is not an object');
        const out = await run(body as Record<string, unknown>);
        push();
        json(res, 200, { ok: true, result: out });
      } catch (err) {
        if (err instanceof Refusal) {
          notice = err.message;
          push();
          json(res, 409, { error: err.message });
          return;
        }
        d.log(`${verb}: ${(err as Error).stack ?? String(err)}`);
        json(res, 500, { error: `something went wrong: ${(err as Error).message}` });
      }
    })();
  });

  port = await listenFrom(server, host, o.port ?? GUI_PORT, d.log, 'the GUI');
  const url = `http://${host}:${port}/`;
  d.log(`the GUI is at ${url}`);
  facts();                                                 // the image's CRC read starts at once
  await ensureSite();
  const tick = setInterval(push, 1000);
  const beat = setInterval(() => { for (const c of clients) c.write(': heartbeat\n\n'); }, HEARTBEAT_MS);
  tick.unref?.();
  beat.unref?.();

  let closing: Promise<void> | null = null;
  return {
    url,
    port,
    status,
    close: () => {
      closing ??= (async () => {
        clearInterval(tick);
        clearInterval(beat);
        if (clock) { clearInterval(clock); clock = null; }
        if (session?.running) await session.end();
        for (const c of clients) c.end();
        clients.clear();
        await site?.close();
        await new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); });
      })();
      return closing;
    },
  };
}

function listFilesAndDirs(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
