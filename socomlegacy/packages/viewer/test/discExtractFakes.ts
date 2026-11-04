import { CAMPAIGN_ARCHIVES, SOCOM2_US_BOOT } from '@s2u/archive';
import type { CopyStorage } from '../src/discCopy';
import type { CopySyncAccess } from '../src/discCopyProtocol';
import type { ExtractWorker } from '../src/discExtract';
import { serveDiscExtract, type ExtractPort } from '../src/discExtractProtocol';
import { opfsExtractStore } from '../src/discExtractStore';

/**
 * DX-1's fakes (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`): an origin private file system in
 * memory (DA-8's `discCopy.test.ts` fake, with the page-side `createWritable` and a file that loses bytes), the browser's
 * `StorageManager`, and the extraction's worker run in-process (`serveDiscExtract` behind a fake port). A disc listing in
 * the retail disc's own names (the `SOCOM_DISC` directory listing, names only) with synthetic bytes: no game data.
 */

const domError = (name: string, message = name): DOMException => new DOMException(message, name);

export class FakeFileHandle {
  readonly kind = 'file' as const;
  data = new Uint8Array(0);
  open = 0;
  constructor(readonly name: string, readonly fs: FakeOpfs) {}
  async getFile(): Promise<File> {
    const lose = this.fs.lose.get(this.name) ?? 0;
    return new File([this.data.slice(0, Math.max(0, this.data.length - lose))], this.name);
  }
  async createSyncAccessHandle(): Promise<CopySyncAccess> {
    if (this.open) throw domError('NoModificationAllowedError', 'an access handle is open');
    this.open++;
    let closed = false;
    const live = (): void => { if (closed) throw domError('InvalidStateError', 'closed'); };
    return {
      write: (buffer, options) => {
        live();
        if (this.fs.quotaAt !== null && this.fs.written >= this.fs.quotaAt) throw domError('QuotaExceededError', 'the disk is full');
        const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
        const at = options?.at ?? 0;
        const end = at + src.length;
        if (end > this.data.length) { const grown = new Uint8Array(end); grown.set(this.data); this.data = grown; }
        this.data.set(src, at);
        this.fs.written += src.length;
        return src.length;
      },
      flush: () => { live(); },
      truncate: (size) => { live(); this.data = this.data.slice(0, size); },
      getSize: () => { live(); return this.data.length; },
      close: () => { if (!closed) { closed = true; this.open--; } },
    };
  }
  async createWritable(): Promise<{ write(d: Blob | Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> {
    const parts: Uint8Array[] = [];
    return {
      write: async (d) => { parts.push(d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d.slice()); },
      close: async () => {
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        this.data = out;
      },
      abort: async () => undefined,
    };
  }
}

export class FakeDirHandle {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeDirHandle | FakeFileHandle>();
  constructor(readonly name: string, readonly fs: FakeOpfs) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirHandle> {
    const have = this.children.get(name);
    if (have?.kind === 'directory') return have;
    if (have) throw domError('TypeMismatchError');
    if (!options?.create) throw domError('NotFoundError', `no directory ${name}`);
    const made = new FakeDirHandle(name, this.fs);
    this.children.set(name, made);
    return made;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    const have = this.children.get(name);
    if (have?.kind === 'file') return have;
    if (have) throw domError('TypeMismatchError');
    if (!options?.create) throw domError('NotFoundError', `no file ${name}`);
    const made = new FakeFileHandle(name, this.fs);
    this.children.set(name, made);
    return made;
  }
  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const have = this.children.get(name);
    if (!have) throw domError('NotFoundError', `no entry ${name}`);
    if (have.kind === 'directory' && have.children.size && !options?.recursive) throw domError('InvalidModificationError');
    if (anyOpen(have)) throw domError('NoModificationAllowedError', `${name} has an open access handle`);
    this.children.delete(name);
  }
  async *values(): AsyncGenerator<FakeDirHandle | FakeFileHandle> { yield* [...this.children.values()]; }
}
export const anyOpen = (h: FakeDirHandle | FakeFileHandle): boolean =>
  h.kind === 'file' ? h.open > 0 : [...h.children.values()].some(anyOpen);

export class FakeOpfs {
  readonly root: FakeDirHandle;
  /** Files (by name) whose `getFile()` answers this many bytes short: a store that lost bytes. */
  readonly lose = new Map<string, number>();
  /** Bytes written through sync handles so far, and the count past which a write is refused as the disk full (null: never). */
  written = 0;
  quotaAt: number | null = null;
  constructor() { this.root = new FakeDirHandle('', this); }
  /** Every stored file, by path from the origin root, and its bytes. */
  files(): Map<string, Uint8Array> {
    const out = new Map<string, Uint8Array>();
    const walk = (d: FakeDirHandle, at: string): void => {
      for (const c of d.children.values()) {
        const p = at ? `${at}/${c.name}` : c.name;
        if (c.kind === 'file') out.set(p, c.data); else walk(c, p);
      }
    };
    walk(this.root, '');
    return out;
  }
  /** The file handle at `path` from the origin root, or undefined. */
  handle(path: string): FakeFileHandle | undefined {
    let at: FakeDirHandle | FakeFileHandle | undefined = this.root;
    for (const part of path.split('/')) at = at?.kind === 'directory' ? at.children.get(part) : undefined;
    return at?.kind === 'file' ? at : undefined;
  }
}

export class FakeStorage implements CopyStorage {
  quota = 100 * 1024 ** 3;
  usage = 1024;
  persistAnswer = true;
  persistCalls = 0;
  estimates = 0;
  /** A `getDirectory()` refusal (a private window's `SecurityError`), or null. */
  refuse: DOMException | null = null;
  constructor(readonly fs: FakeOpfs) {}
  async getDirectory(): Promise<FakeDirHandle> { if (this.refuse) throw this.refuse; return this.fs.root; }
  async estimate(): Promise<{ quota: number; usage: number }> { this.estimates++; return { quota: this.quota, usage: this.usage }; }
  async persist(): Promise<boolean> { this.persistCalls++; return this.persistAnswer; }
}

export type WorkerLog = { count: number; terminated: number; files: number };
export type WorkerOptions = {
  /** The probe's answer: a sync access handle on offer. Default true. */
  readonly sync?: boolean;
  /** The file (counted from 0 across the worker's life) at whose first chunk the worker dies: a tab closed mid-file. */
  readonly dieAt?: number;
};

/** The worker, run in-process: the page's end and the worker's end of a fake channel, `serveDiscExtract` on the far one. */
export function fakeWorker(log: WorkerLog, fs: FakeOpfs, options: WorkerOptions = {}): ExtractWorker {
  log.count++;
  let dead = false;
  let file = -1;
  const port: ExtractPort = {
    onmessage: null,
    postMessage(m) {
      if (dead) return;
      if (m.kind === 'progress' && options.dieAt !== undefined && file === options.dieAt) {
        dead = true;                                            // the tab closes: the page hears no more, the loop stops
        queueMicrotask(() => port.onmessage?.({ data: { kind: 'cancel' } } as MessageEvent));
        queueMicrotask(() => page.onerror?.({ message: 'the tab was closed' } as unknown as Event));
        return;
      }
      queueMicrotask(() => page.onmessage?.({ data: m } as MessageEvent));
    },
  };
  const page: ExtractWorker = {
    onmessage: null,
    onerror: null,
    postMessage(m) {
      if (dead) return;
      if (m.kind === 'file') {
        // Model a browser that refuses to serialize filesystem handles, rather than silently sharing them in-process.
        if ('target' in m) throw domError('DataCloneError', 'The object can not be cloned.');
        file++; log.files++;
      }
      queueMicrotask(() => port.onmessage?.({ data: m } as MessageEvent));
    },
    terminate() { log.terminated++; dead = true; },
  };
  serveDiscExtract(port, (dir, path) => opfsExtractStore(async () => fs.root, dir).target(path), () => options.sync ?? true);
  return page;
}

// ---- a disc ----------------------------------------------------------------------------------------------------

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
/** A `SYSTEM.CNF` booting `boot`, in the retail line's form (`docs/roadmap/02-boot.md` B1). */
export const systemCnf = (boot = SOCOM2_US_BOOT, ver = '1.02'): Uint8Array<ArrayBuffer> =>
  text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = ${ver}\r\nVMODE = NTSC\r\n`);

/** The read set on a disc shaped as the retail one: one or more files of every class in scope, the commons, three maps. */
export const READ_PATHS: readonly string[] = [
  'SYSTEM.CNF',
  'RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_TXR.ZED',
  'RUN/UI/UI_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED', 'RUN/UI/JUNK_TXR.ZED',
  'RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR',
  'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR', 'RUN/LOCALE/STATES/HUDCLOC.ZAR',
  'RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS',
  'RUN/COMMON/FONT_TXR.ZED', 'RUN/COMMON/FONT_PAL.ZED',
  'RUN/RAW/LOADING.RAW',
  'RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR',
  'RUN/ICONS/LIST.ICO', 'RUN/ICONS/HDD/ICON.SYS',
  'RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/MOTION_P.ZAR', 'RUN/SOUNDRDR.ZAR', 'RUN/IRX/LIBSD.IRX',
  'RUN/MP1.ZDB', 'RUN/MP2.ZDB', 'RUN/MP72.ZDB',
  ...CAMPAIGN_ARCHIVES,                                                    // the forge's single-player maps (FI.R6)
];
/** Beside it, files the set leaves out: the executable, a per-map UI set, a stream driver. */
export const OTHER_PATHS: readonly string[] = ['SCUS_972.75', 'RUN/UI/BF51_TXR.ZED', 'RUN/IRX/CDVDSTM.IRX'];

/** Bytes that say which file and which offset they are, so a wrong file or a shifted range cannot pass. */
export const filler = (length: number, seed: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 13 + seed * 29 + (i >>> 7) * 7) & 0xff;
  return out;
};

export type Member = { path: string; bytes: Uint8Array<ArrayBuffer> };
/** The disc: `SYSTEM.CNF` (of `cnf`), then each other file 300 + 211 * i bytes (VAGSTORE and a movie a few chunks long). */
export function discMembers(cnf: Uint8Array<ArrayBuffer> = systemCnf(), drop: readonly string[] = []): Member[] {
  const out: Member[] = [];
  for (const [i, path] of [...READ_PATHS, ...OTHER_PATHS].entries()) {
    if (drop.includes(path)) continue;
    if (path === 'SYSTEM.CNF') { out.push({ path, bytes: cnf }); continue; }
    const size = path.endsWith('VAGSTORE.ZAR') ? 9_000 : path.endsWith('.PSS') ? 5_000 : 300 + 211 * i;
    out.push({ path, bytes: filler(size, i) });
  }
  return out;
}
