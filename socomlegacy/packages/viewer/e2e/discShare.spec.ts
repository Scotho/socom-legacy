import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { OpenedContexts } from './openedContexts';

/**
 * DSH-8 (the disc share plan `docs/plans/2026-10-18-disc-share.md`; DSH-4's transfer): two pages, each in its own browser
 * context (each its own origin storage, as two devices), connected over this host with `iceServers: []` -- no STUN, no
 * TURN -- through the transfer's own modules (`src/discShareRtc.ts`, `src/discShareProtocol.ts`, `src/discShare.ts`).
 * The pairing's messages are relayed by this test (no server: central's routes are DSH-3's and tested there).
 *
 * 1. **A loopback transfer**: a small synthetic read set (seeded bytes, never disc data) sent from the sender's page to
 *    the receiver's, stored through DSH-2's streamed write into the receiver's extraction store, its record written once
 *    every file matched; read back there as a whole extraction (`extractionState` -> `whole`), each file's SHA-256 the
 *    sender's. Every peer connection was made with `iceServers: []`. The receiver refuses a manifest that is not exactly
 *    the read set (the disc share review's N2, `fitsReadSet`); the synthetic set is not, so its receiver is given the
 *    protocol's test seam (`ReceiveOptions.isReadSet`): the synthetic set's own paths, exactly (`syntheticPaths`). The
 *    read set's version is the page's own (`READ_SET_VERSION`, read from its source), so that check is the real one.
 * 2. **A relayed pair accepted** (DSH.R15, the owner, 2026-11-07; it was refused under DSH.R2): the same two pages, the
 *    selected pair reported as `relay` (the page's `getStats` answered for it -- this host has no TURN server to make a
 *    real one): both sides accept it, say the path "relay", and the copy completes.
 *
 * Each page's connection is given `iceServers: []` explicitly (as `/api/discshare/ice` would answer an empty list): the
 * default, Cloudflare's STUN, would reach outside this host, which a loopback test does not.
 *
 * A rendered browser run, the product track: nothing of the game is scored. Heavy (a browser): the host's lock rules
 * apply. Chromium is launched as a player's is (DSH.R14): its local addresses hidden behind mDNS names, so `getStats`
 * answers no address -- the case the earlier launch (addresses shown) hid, and the owner's two-tab run of 2026-10-30
 * met; the two pages pair over host candidates on this host.
 */

/** The page's read set's version, read from its source (the receiver refuses a manifest of another). */
const READ_SET_VERSION = Number(/export const READ_SET_VERSION = (\d+)/.exec(readFileSync(fileURLToPath(new URL('../../archive/src/readSet.ts', import.meta.url)), 'utf8'))?.[1] ?? NaN);
/** The synthetic read set: sizes in bytes (a file over one 1 MiB read block, one under a chunk, one empty). */
const SIZES = [1_500_000, 70_001, 0, 300_000];
/** The synthetic set's paths, as `startSender` names its files: the receiver's `isReadSet` seam accepts exactly these. */
const syntheticPaths = (sizes: readonly number[]): string[] => sizes.map((_, i) => `RUN/E2E/F${i}.BIN`);

test.setTimeout(180_000);
test.use({ actionTimeout: 15_000 });

let browser: Browser;
/** Issue #91: each test's two contexts closed at its end, whatever it reached (the launched browser at the file's end). */
const opened = new OpenedContexts();
test.beforeAll(async () => {
  browser = await chromium.launch();
});
test.afterAll(async () => { await browser?.close(); });
test.afterEach(() => opened.closeAll());

/** A page of this site in its own context, every `RTCPeerConnection` it makes recorded with its configuration. */
async function device(baseURL: string): Promise<Page> {
  const context = opened.add(await browser.newContext({ baseURL }));
  const page = await context.newPage();
  await page.addInitScript(() => {
    const Real = window.RTCPeerConnection;
    const made: { config: RTCConfiguration | undefined; pc: RTCPeerConnection }[] = [];
    (window as unknown as { __pcs: typeof made }).__pcs = made;
    window.RTCPeerConnection = class extends Real {
      constructor(config?: RTCConfiguration) { super(config); made.push({ config, pc: this }); }
    } as typeof RTCPeerConnection;
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/** Joins the two pages' signalling through this test: a message one posts is handed to the other's peer. */
async function relay(a: Page, b: Page): Promise<void> {
  await a.exposeFunction('__relay', (json: string) => b.evaluate((j) => { (window as unknown as { __peer: { handle(m: unknown): void } }).__peer.handle(JSON.parse(j)); }, json));
  await b.exposeFunction('__relay', (json: string) => a.evaluate((j) => { (window as unknown as { __peer: { handle(m: unknown): void } }).__peer.handle(JSON.parse(j)); }, json));
}

/**
 * The receiver's side: its peer (answer) and its copy into its own store, started; the outcome kept on `window.__got`.
 * `paths`: the synthetic set's paths, the only manifest its `isReadSet` seam accepts (the module's header, N2).
 */
async function startReceiver(page: Page, readSet: number, paths: string[]): Promise<void> {
  await page.evaluate(async ({ rs, want }) => {
    const rtc = await import(/* @vite-ignore */ '/src/discShareRtc.ts' as string) as typeof import('../src/discShareRtc');
    const proto = await import(/* @vite-ignore */ '/src/discShareProtocol.ts' as string) as typeof import('../src/discShareProtocol');
    const share = await import(/* @vite-ignore */ '/src/discShare.ts' as string) as typeof import('../src/discShare');
    const w = window as unknown as { __peer: unknown; __got: Promise<unknown>; __via: unknown; __relay(j: string): Promise<void> };
    const peer = rtc.rtcPeer('answer', (m) => { void w.__relay(JSON.stringify(m)); }, { iceServers: async () => [] });
    w.__peer = peer;
    const isReadSet = (ps: readonly string[]): boolean => ps.length === want.length && ps.every((p, i) => p === want[i]);
    w.__got = peer.ready.then((pipe) => { w.__via = peer.via?.() ?? null; return proto.receiveFiles(pipe, share.pageReceiveStore(), { readSet: rs, isReadSet }); })
      .then((r) => ({ ok: true, files: r.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })), total: r.total }),
        (e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
  }, { rs: readSet, want: paths });
}

/** The sender's side: a synthetic kept extraction (seeded bytes), its peer (offer) and its send, started. */
async function startSender(page: Page, readSet: number, sizes: number[]): Promise<{ path: string; size: number; sha256: string }[]> {
  return page.evaluate(async ({ rs, sz }) => {
    const rtc = await import(/* @vite-ignore */ '/src/discShareRtc.ts' as string) as typeof import('../src/discShareRtc');
    const proto = await import(/* @vite-ignore */ '/src/discShareProtocol.ts' as string) as typeof import('../src/discShareProtocol');
    const pattern = (seed: number, n: number): Uint8Array<ArrayBuffer> => {
      const b = new Uint8Array(n);
      let x = (seed * 2654435761) >>> 0;
      for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; }
      return b;
    };
    const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((v) => v.toString(16).padStart(2, '0')).join('');
    const files = sz.map((n, i) => ({ path: `RUN/E2E/F${i}.BIN`, data: pattern(i + 1, n) }));
    const listed = await Promise.all(files.map(async (f) => ({ path: f.path, size: f.data.length, sha256: hex(await crypto.subtle.digest('SHA-256', f.data)) })));
    const record = {
      v: 1 as const, readSet: rs, identity: { boot: 'SCUS_973.24', ver: '1.00', vmode: 'NTSC' }, backend: 'opfs' as const, dir: 'E2E',
      files: listed.map((f) => ({ ...f, done: true })), total: listed.reduce((n, f) => n + f.size, 0), persisted: false, started: 1, when: 2,
    };
    const source = {
      record,
      readRange: async (path: string, offset: number, length: number) => files.find((f) => f.path === path)!.data.slice(offset, offset + length),
    };
    const w = window as unknown as { __peer: unknown; __sent: Promise<unknown>; __via: unknown; __relay(j: string): Promise<void> };
    const peer = rtc.rtcPeer('offer', (m) => { void w.__relay(JSON.stringify(m)); }, { iceServers: async () => [] });
    w.__peer = peer;
    w.__sent = peer.ready.then((pipe) => { w.__via = peer.via?.() ?? null; return proto.sendFiles(pipe, source); }).then(() => ({ ok: true }), (e: unknown) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
    return listed;
  }, { rs: readSet, sz: sizes });
}

test('two pages over loopback, iceServers []: the synthetic read set copied, stored whole, every hash the sender\'s', async ({ baseURL }) => {
  expect(Number.isInteger(READ_SET_VERSION)).toBe(true);
  const receiver = await device(baseURL!);
  const sender = await device(baseURL!);
  await relay(receiver, sender);
  await startReceiver(receiver, READ_SET_VERSION, syntheticPaths(SIZES));
  const listed = await startSender(sender, READ_SET_VERSION, SIZES);
  expect(listed.map((f) => f.path)).toEqual(syntheticPaths(SIZES));

  const got = await receiver.evaluate(() => (window as unknown as { __got: Promise<unknown> }).__got) as { ok: boolean; reason?: string; files?: unknown[]; total?: number };
  expect(got, got.reason).toMatchObject({ ok: true });
  expect(got.files).toEqual(listed);
  expect(got.total).toBe(SIZES.reduce((n, s) => n + s, 0));
  expect(await sender.evaluate(() => (window as unknown as { __sent: Promise<unknown> }).__sent)).toEqual({ ok: true });

  // Read back on the receiver as START reads it: a whole extraction, each file's SHA-256 the sender's.
  const back = await receiver.evaluate(async () => {
    const rec = await import(/* @vite-ignore */ '/src/discExtractRecord.ts' as string) as typeof import('../src/discExtractRecord');
    const ex = await import(/* @vite-ignore */ '/src/discExtract.ts' as string) as typeof import('../src/discExtract');
    const state = await rec.extractionState();
    const verified = await ex.verifyExtraction();
    const kept = await rec.storedExtraction();
    return { state, bad: verified.bad, checked: verified.checked.length, files: kept?.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })) };
  });
  expect(back).toEqual({ state: 'whole', bad: [], checked: SIZES.length, files: listed });

  // Every connection either page made had the ICE servers it was given: none (the module's header).
  for (const p of [receiver, sender]) {
    const configs = await p.evaluate(() => (window as unknown as { __pcs: { config?: RTCConfiguration }[] }).__pcs.map((m) => m.config?.iceServers ?? null));
    expect(configs.length).toBeGreaterThan(0);
    for (const c of configs) expect(c).toEqual([]);
  }
});

test('DSH.R15: a relayed pair is accepted on both sides, said through the relay, and the copy completes', async ({ baseURL }) => {
  const receiver = await device(baseURL!);
  const sender = await device(baseURL!);
  // This host has no TURN server to make a real relayed pair: each page's getStats answers one (its addresses made from
  // their octets; a documentation range), as a relayed pair's selection would read.
  for (const p of [receiver, sender]) {
    await p.evaluate(() => {
      const addr = [198, 51, 100, 4].join('.');
      RTCPeerConnection.prototype.getStats = async function getStats(): Promise<RTCStatsReport> {
        return new Map<string, Record<string, unknown>>([
          ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
          ['P', { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', state: 'succeeded', nominated: true }],
          ['L', { id: 'L', type: 'local-candidate', candidateType: 'relay', address: addr }],
          ['R', { id: 'R', type: 'remote-candidate', candidateType: 'relay', address: addr }],
        ]) as unknown as RTCStatsReport;
      };
    });
  }
  await relay(receiver, sender);
  await startReceiver(receiver, READ_SET_VERSION, syntheticPaths([1000]));
  const listed = await startSender(sender, READ_SET_VERSION, [1000]);
  const got = await receiver.evaluate(() => (window as unknown as { __got: Promise<unknown> }).__got) as { ok: boolean; reason?: string; files?: unknown[] };
  const sent = await sender.evaluate(() => (window as unknown as { __sent: Promise<unknown> }).__sent) as { ok: boolean; reason?: string };
  expect(got, got.reason).toMatchObject({ ok: true });
  expect(got.files).toEqual(listed);
  expect(sent).toEqual({ ok: true });
  for (const p of [receiver, sender]) expect(await p.evaluate(() => (window as unknown as { __via: unknown }).__via)).toBe('relay');
  const state = await receiver.evaluate(async () => {
    const rec = await import(/* @vite-ignore */ '/src/discExtractRecord.ts' as string) as typeof import('../src/discExtractRecord');
    return rec.extractionState();
  });
  expect(state).toBe('whole');
});
