// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPUT_HEARTBEAT_S, MARK_KEY, MARK_PAD_CHORD_PLACEHOLDER, mountPlaytestSession, RETEST_PLACE_PLACEHOLDER, wsSocket } from '../src/playtestSession';
/** A fake recorder's k-th chunk: a 4-byte header then a Cluster in the first, a Cluster in each after (the ring cuts at Clusters). */
const webmChunk = (k: number): Blob => new Blob([new Uint8Array(k === 0 ? [0x1a, 0x45, 0xdf, 0xa3, 0x1f, 0x43, 0xb6, 0x75, 7, 7] : [0x1f, 0x43, 0xb6, 0x75, 7, 7])]);
import type { CollisionOwner, GridParams, SpawnSlot, WorldPoly } from '@s2u/scene';
import { packGround } from '../src/sim';
import { decodeRecords, type ReplayRecord } from '../../match/src/replay/format';
import type { RoomOptions } from '../../match/src/room';
import { LoopbackMatch, setLoopbackDefaults, simMapOfLoaded } from '../src/net/loopback';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { ADDRESS_ONLINE_TABLE } from './addressOnlineTable';

function fakeHost(search = '?devmode&playtest=ws://127.0.0.1:5303/session') {
  const sent: object[] = []; let onMsg: ((m: { type: string }) => void) | null = null;
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4;
  // jsdom has no toBlob: the module falls back to toDataURL when toBlob is absent; the test gives it toBlob.
  (canvas as HTMLCanvasElement & { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  const hook = { stats: () => ({ map: 'MP2' }), net: () => null, camera: () => ({ x: 0 }) } as unknown as import('../src/hook').ViewerHook;
  let t = 0; let pads: (Gamepad | null)[] = [];
  const host = {
    document, search, now: () => t, canvas: () => canvas, hook: () => hook,
    socket: () => ({ send: (m: object) => sent.push(m), onMessage: (fn: (m: { type: string }) => void) => { onMsg = fn; } }),
    frame: (cb: () => void) => cb(), pads: () => pads,
  };
  return { host, sent, hook, canvas, open: () => onMsg!({ type: 'session', id: '20261006-1a2b', segment: 0, badge: { branch: 'agent/playtest', created: null, commit: 'abc1234', dirty: true } } as never), inactivity: (closesInMinutes: number) => onMsg!({ type: 'inactivity', closesInMinutes } as never), tick: (dt: number) => { t += dt * 1000; }, setPads: (p: (Gamepad | null)[]) => { pads = p; } };
}

/**
 * What a mount sent beside PT-03's recording: its `segment`/`segmentEnd` messages and the one binary frame of the
 * recorder's closing flush at dispose (`end`) are taken out; any other binary frame (a clip's) is kept.
 */
function sentButRecording(sent: object[]): object[] {
  const out = sent.filter((s) => !['segment', 'segmentEnd'].includes((s as { type: string }).type));
  const i = sent.findIndex((s) => (s as { type: string }).type === 'segmentEnd');
  if (i > 0 && (sent[i - 1] as { type: string }).type === '<binary>') out.splice(out.indexOf(sent[i - 1]!), 1);
  return out;
}

describe('the playtest-room instruments', () => {
  // Each test's badge and button gone before the next; PT-03's loopback defaults cleared (a mount with sendBinary sets them).
  afterEach(() => { document.body.replaceChildren(); setLoopbackDefaults({}); });
  it('draws the badge from the session message, with Created: unknown when null', () => {
    const f = fakeHost(); mountPlaytestSession(f.host); f.open();
    const badge = document.getElementById('playtest-badge')!;
    expect(badge.textContent).toContain('agent/playtest');
    expect(badge.textContent).toContain('Created: unknown');
    expect(badge.textContent).toContain('abc1234*');
  });
  it('F8 sends a mark with the frame, the telemetry and the segment', async () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: MARK_KEY }));
    await vi.waitFor(() => expect(f.sent.some((s) => (s as { type: string }).type === 'mark')).toBe(true));
    const mark = f.sent.find((s) => (s as { type: string }).type === 'mark') as { bundle: { segment: number; frame: string | null; telemetry: { stats: { map: string } } } };
    expect(mark.bundle.segment).toBe(0);
    expect(mark.bundle.frame).toMatch(/^data:image\/png;base64,/);
    expect(mark.bundle.telemetry.stats.map).toBe('MP2');
    expect(m.dispose).toBeTypeOf('function');
  });
  it('the pad chord marks once per hold after holdSeconds', async () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const held = { buttons: [10, 11].reduce((a, i) => { a[i] = { pressed: true, touched: true, value: 1 }; return a; }, [] as GamepadButton[]) } as unknown as Gamepad;
    f.setPads([held]);
    for (let i = 0; i < 40; i++) { f.tick(1 / 60); (m as unknown as { poll(): void }).poll(); }     // 0.67 s > holdSeconds
    // The bundle is sent once the frame's PNG is encoded (a Blob reads asynchronously): wait, then settle and count again.
    const marks = () => f.sent.filter((s) => (s as { type: string }).type === 'mark');
    await vi.waitFor(() => expect(marks()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(marks()).toHaveLength(1);
    expect(MARK_PAD_CHORD_PLACEHOLDER.holdSeconds).toBe(0.5);
  });
  it('a playtest= that is no socket URL neither throws nor kills the mount: the real wsSocket drops, mark() resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fakeHost('?devmode&playtest=5303');
    let m: ReturnType<typeof mountPlaytestSession> | null = null;
    expect(() => { m = mountPlaytestSession({ ...f.host, socket: wsSocket }); }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('5303');
    const bundle = await m!.mark('button');
    expect(bundle.observation).toBe('local-1');
    m!.dispose();
    warn.mockRestore();
  });
  it('the video ring: a clip message and its bytes follow the mark once the after-window is recorded; ringSeconds grows', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported(m: string) { return m === 'video/webm;codecs=vp8'; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive'; timeslice = 0;
      constructor(public stream: object, public options?: { mimeType?: string }) { FakeRecorder.made.push(this); }
      start(ms: number) { this.state = 'recording'; this.timeslice = ms; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: (fps: number) => object }).captureStream = () => ({});
      const binary: (Blob | Uint8Array)[] = [];
      const host = { ...f.host, socket: () => ({ ...f.host.socket(), sendBinary: (d: Blob | Uint8Array) => { binary.push(d); f.sent.push({ type: '<binary>' }); } }) };
      const m = mountPlaytestSession(host); f.open();
      expect(FakeRecorder.made).toHaveLength(1);
      const rec = FakeRecorder.made[0]!;
      expect(rec.options?.mimeType).toBe('video/webm;codecs=vp8');   // vp9 refused here: vp8
      expect(rec.timeslice).toBe(1000);
      // the test is the recorder's clock: a second passes, then that second's chunk arrives
      let k = 0;
      const second = (): void => { f.tick(1); rec.ondataavailable!({ data: webmChunk(k++) }); };
      const ringSeconds = () => (f.hook as unknown as { playtest(): { ringSeconds: number } }).playtest().ringSeconds;
      for (let i = 0; i < 5; i++) second();
      await vi.waitFor(() => expect(ringSeconds()).toBe(5));   // each Blob is read to bytes first (asynchronously)
      const bundle = await m.mark('button');
      expect(bundle.telemetry.clip).not.toBe('unsupported');
      // PT-03's recording messages (`segment`, `segmentEnd`) share the socket; this case reads the mark and its clip.
      const types = () => f.sent.map((s) => (s as { type: string }).type).filter((t) => t !== 'segment' && t !== 'segmentEnd');
      expect(types()).toEqual(['mark']);
      for (let i = 0; i < 9; i++) second();
      await new Promise((r) => setTimeout(r, 10));
      expect(types()).toEqual(['mark']);                       // 9 s after the mark: the after-window is still open
      second();
      await vi.waitFor(() => expect(types()).toEqual(['mark', 'clip', '<binary>']));
      const clip = f.sent.find((s) => (s as { type: string }).type === 'clip') as { observation: string; from: number; to: number; mime: string; cut: boolean };
      expect(clip).toMatchObject({ observation: 'local-1', from: 0, to: 15, mime: 'video/webm;codecs=vp8', cut: false });   // the clip's cut: the first Cluster to the last chunk
      const bytes = binary[0] as Uint8Array;                   // one binary frame: the init segment, then whole clusters
      expect(bytes.length).toBe(4 + 6 * 15);
      expect([...bytes.subarray(0, 8)]).toEqual([0x1a, 0x45, 0xdf, 0xa3, 0x1f, 0x43, 0xb6, 0x75]);
      await vi.waitFor(() => expect(ringSeconds()).toBe(15));
      m.dispose();
      expect(rec.state).toBe('inactive');
    } finally {
      g.MediaRecorder = saved;
    }
  });
  it('a segment message from the service neither rotates the segment nor restarts the ring: the rotation is the page\'s', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      constructor() { FakeRecorder.made.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      let onMsg: ((m: { type: string; [k: string]: unknown }) => void) | null = null;
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      const host = { ...f.host, socket: () => ({ send: (msg: object) => f.sent.push(msg), sendBinary: () => {}, onMessage: (fn: typeof onMsg) => { onMsg = fn; } }) };
      const m = mountPlaytestSession(host);
      onMsg!({ type: 'session', id: 's', segment: 0, badge: {} });
      for (let i = 0; i < 3; i++) { f.tick(1); FakeRecorder.made[0]!.ondataavailable!({ data: webmChunk(i) }); }
      await new Promise((r) => setTimeout(r, 10));            // the chunks read to bytes
      await m.mark('key');
      f.tick(2);
      onMsg!({ type: 'segment', segment: 1 });
      await new Promise((r) => setTimeout(r, 10));
      expect(f.sent.some((s) => (s as { type: string }).type === 'clip')).toBe(false);   // the pin is still open: nothing cut it
      expect(f.sent.some((s) => (s as { type: string }).type === 'segmentEnd')).toBe(false);
      expect(FakeRecorder.made).toHaveLength(1);
      expect(FakeRecorder.made[0]!.state).toBe('recording');
      expect((f.hook as unknown as { playtest(): { segment: number } }).playtest().segment).toBe(0);
      m.dispose();
    } finally {
      g.MediaRecorder = saved;
    }
  });
  it('without MediaRecorder the telemetry says clip: unsupported and no clip is sent', async () => {
    expect((globalThis as { MediaRecorder?: unknown }).MediaRecorder).toBeUndefined();   // jsdom has none
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const bundle = await m.mark('button');
    expect(bundle.telemetry.clip).toBe('unsupported');
    const mark = f.sent.find((s) => (s as { type: string }).type === 'mark') as { bundle: { telemetry: { clip: string } } };
    expect(mark.bundle.telemetry.clip).toBe('unsupported');
    f.tick(60);
    await new Promise((r) => setTimeout(r, 10));
    expect(f.sent.some((s) => (s as { type: string }).type === 'clip')).toBe(false);
    expect((f.hook as unknown as { playtest(): { ringSeconds: number } }).playtest().ringSeconds).toBe(0);
    m.dispose();
  });
  it('a socket with no binary channel gets no clip message: the telemetry says clip: unsent', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      constructor() { FakeRecorder.made.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      const f = fakeHost();                                    // its socket has no sendBinary
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      const m = mountPlaytestSession(f.host); f.open();
      const bundle = await m.mark('button');
      expect(bundle.telemetry.clip).toBe('unsent');
      for (let i = 0; i < 15; i++) { f.tick(1); FakeRecorder.made[0]!.ondataavailable!({ data: new Blob([new Uint8Array([1])]) }); }
      await new Promise((r) => setTimeout(r, 10));
      expect(f.sent.map((s) => (s as { type: string }).type)).toEqual(['mark']);
      m.dispose();
    } finally {
      g.MediaRecorder = saved;
    }
  });
  it('a dispose during the frame grab sends nothing: no mark, no clip; the bundle says clip: stopped', async () => {
    class FakeRecorder {
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      let held: ((b: Blob | null) => void) | null = null;
      (f.canvas as unknown as { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => { held = cb; };
      const host = { ...f.host, socket: () => ({ ...f.host.socket(), sendBinary: () => { f.sent.push({ type: '<binary>' }); } }) };
      const m = mountPlaytestSession(host); f.open();
      const p = m.mark('button');
      await vi.waitFor(() => expect(held).not.toBeNull());
      m.dispose();
      held!(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      const bundle = await p;
      expect(bundle.telemetry.clip).toBe('stopped');
      await new Promise((r) => setTimeout(r, 10));
      expect(sentButRecording(f.sent)).toEqual([]);
    } finally {
      g.MediaRecorder = saved;
    }
  });
  it('a dispose while the frame is encoded (after the pin) sends nothing either: the ring\'s cut clip is dropped', async () => {
    class FakeRecorder {
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      let release: ((b: ArrayBuffer) => void) | null = null;
      const png = new Blob([new Uint8Array([1])], { type: 'image/png' });
      (png as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () => new Promise((r) => { release = r; });
      (f.canvas as unknown as { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(png);
      const host = { ...f.host, socket: () => ({ ...f.host.socket(), sendBinary: () => { f.sent.push({ type: '<binary>' }); } }) };
      const m = mountPlaytestSession(host); f.open();
      const p = m.mark('button');
      await vi.waitFor(() => expect(release).not.toBeNull());   // pinned; the PNG is being read
      m.dispose();                                              // the ring stops: the pin resolves cut
      release!(new Uint8Array([1]).buffer);
      await p;
      await new Promise((r) => setTimeout(r, 10));
      expect(sentButRecording(f.sent)).toEqual([]);
    } finally {
      g.MediaRecorder = saved;
    }
  });
  it('a clip with no bytes (no Cluster recorded yet) sends no clip message, so no binary frame is mispaired', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      constructor() { FakeRecorder.made.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      const host = { ...f.host, socket: () => ({ ...f.host.socket(), sendBinary: () => { f.sent.push({ type: '<binary>' }); } }) };
      const m = mountPlaytestSession(host); f.open();
      await m.mark('button');
      for (let i = 0; i < 12; i++) { f.tick(1); FakeRecorder.made[0]!.ondataavailable!({ data: new Blob([new Uint8Array([0x1a])]) }); }
      await vi.waitFor(() => expect(warn.mock.calls.some((c) => String(c[0]).includes('no clip for local-1'))).toBe(true));
      const types = f.sent.map((s) => (s as { type: string }).type);
      expect(types).not.toContain('clip');
      expect(types).not.toContain('<binary>');
      m.dispose();
    } finally {
      g.MediaRecorder = saved;
      warn.mockRestore();
    }
  });
  it('the input heartbeat: a keydown sends one input; another within INPUT_HEARTBEAT_S sends none; one after it sends one', () => {
    expect(INPUT_HEARTBEAT_S).toBe(5);
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const inputs = () => f.sent.filter((s) => (s as { type: string }).type === 'input');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(inputs()).toEqual([{ type: 'input' }]);
    f.tick(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(inputs()).toHaveLength(1);                                   // 1 s later: inside the throttle window
    f.tick(5);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(inputs()).toHaveLength(2);                                   // 6 s after the first
    f.tick(10);
    document.dispatchEvent(new Event('pointerdown'));
    expect(inputs()).toHaveLength(3);
    m.dispose();
    f.tick(10);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(inputs()).toHaveLength(3);                                   // disposed: no listener left
  });

  it('a pad stick past 0.2 in poll() sends one input; a resting pad sends none', () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const poll = () => (m as unknown as { poll(): void }).poll();
    const inputs = () => f.sent.filter((s) => (s as { type: string }).type === 'input');
    f.setPads([{ buttons: [], axes: [0.1, -0.15, 0, 0] } as unknown as Gamepad]);
    poll();
    expect(inputs()).toHaveLength(0);                                   // inside the dead zone: no input
    f.setPads([{ buttons: [], axes: [0, 0, 0.5, 0] } as unknown as Gamepad]);
    poll(); f.tick(1 / 60); poll();
    expect(inputs()).toHaveLength(1);
    m.dispose();
  });

  it('the inactivity message shows the grace line; the next keydown removes it and sends input at once', () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const inputs = () => f.sent.filter((s) => (s as { type: string }).type === 'input');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(inputs()).toHaveLength(1);
    f.tick(1);
    f.inactivity(2);
    const line = document.getElementById('playtest-inactivity');
    expect(line?.textContent).toBe('No input for a while: this playtest closes in 2 minutes unless you move or press a key');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(document.getElementById('playtest-inactivity')).toBeNull();
    expect(inputs()).toHaveLength(2);                                   // 1 s after the last: the throttle bypassed
    m.dispose();
  });

  it('PT-13: closing stops the ring, sends the pinned clip in flight (cut), then answers flushed; with nothing pending, flushed at once', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      constructor() { FakeRecorder.made.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      let onMsg: ((m: { type: string; [k: string]: unknown }) => void) | null = null;
      const f = fakeHost();
      (f.canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      const host = { ...f.host, socket: () => ({ send: (msg: object) => f.sent.push(msg), sendBinary: () => { f.sent.push({ type: '<binary>' }); }, onMessage: (fn: typeof onMsg) => { onMsg = fn; } }) };
      const m = mountPlaytestSession(host);
      onMsg!({ type: 'session', id: 's', segment: 0, badge: {} });
      for (let i = 0; i < 3; i++) { f.tick(1); FakeRecorder.made[0]!.ondataavailable!({ data: webmChunk(i) }); }
      await new Promise((r) => setTimeout(r, 10));            // the chunks read to bytes
      await m.mark('key');
      const types = () => sentButRecording(f.sent).map((s) => (s as { type: string }).type);
      await new Promise((r) => setTimeout(r, 10));
      expect(types()).toEqual(['mark']);                       // the pin's after-window is still open: no clip yet
      onMsg!({ type: 'closing' });
      await vi.waitFor(() => expect(types()).toEqual(['mark', 'clip', '<binary>', 'flushed']));
      expect((f.sent.find((s) => (s as { type: string }).type === 'clip') as { cut: boolean }).cut).toBe(true);
      expect(FakeRecorder.made[0]!.state).toBe('inactive');    // the ring stopped
      m.dispose();
    } finally {
      g.MediaRecorder = saved;
    }
    const f2 = fakeHost();
    let onMsg2: ((m: { type: string }) => void) | null = null;
    const m2 = mountPlaytestSession({ ...f2.host, socket: () => ({ send: (msg: object) => f2.sent.push(msg), onMessage: (fn: typeof onMsg2) => { onMsg2 = fn; } }) });
    onMsg2!({ type: 'session', id: 's', segment: 0, badge: {} } as never);
    onMsg2!({ type: 'closing' });
    await vi.waitFor(() => expect(f2.sent.map((s) => (s as { type: string }).type)).toContain('flushed'));
    m2.dispose();
  });

  it('mounts nothing without playtest= in the address', () => {
    const f = fakeHost('?devmode'); mountPlaytestSession(f.host);
    expect(document.getElementById('playtest-badge')).toBeNull();
  });
});

// ---- PT-03: the page's room recorded through the loopback seam, streamed as segments (research 240 §5) ----

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
/** `./loopback.test.ts`'s flat map, copied (a test file's helper is not importable). */
function flatMap() {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
  };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const slot = (side: 0 | 1, x: number): SpawnSlot => ({ side, index: 0, position: [x, 0, 0], onFloor: true, step: 2, facing: [1, 0], loc: { map: 0, x: 0, z: 0 } });
  return { path: 'RUN/MP99.ZDB', name: 'FLAT', ground: packGround(PARAMS, [floor], owners), slots: [slot(0, -100), slot(1, 100)], respawns: [], doors: [] };
}

/** A host whose socket has `sendBinary` (the PT-06 wsSocket's), its map and its address changeable. */
function recordingHost(search = '?devmode&playtest=ws://127.0.0.1:5303/session') {
  const sent: { type: string; [k: string]: unknown }[] = []; const binary: Uint8Array[] = [];
  let onMsg: ((m: { type: string }) => void) | null = null;
  let map = 'MP2', live = search;
  const hook = { stats: () => ({ map }), net: () => null, camera: () => ({ x: 0 }) } as unknown as import('../src/hook').ViewerHook;
  const host = {
    document, search, now: () => 0, canvas: () => null, hook: () => hook, liveSearch: () => live,
    socket: () => ({
      send: (m: object) => sent.push(m as { type: string }), sendBinary: (b: Uint8Array) => binary.push(new Uint8Array(b)),
      onMessage: (fn: (m: { type: string }) => void) => { onMsg = fn; },
    }),
    frame: (cb: () => void) => cb(), pads: () => [],
  };
  const open = () => onMsg!({ type: 'session', id: '20261006-1a2b', segment: 0, badge: { branch: 'agent/playtest', created: '2026-10-06T10:00:00Z', commit: 'abc1234', dirty: true } } as never);
  const records = (): ReplayRecord[] => {
    const all = new Uint8Array(binary.reduce((n, b) => n + b.byteLength, 0)); let at = 0;
    for (const b of binary) { all.set(b, at); at += b.byteLength; }
    const d = decodeRecords(all); expect(d.truncated).toBe(false); return d.records;
  };
  return { host, sent, binary, open, records, setMap: (m: string) => { map = m; }, setSearch: (s: string) => { live = s; }, message: (m: object) => onMsg!(m as never) };
}
const flushTicks = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
/** The page's room as `main.ts` builds it (no recorder of its own), joined, stepped `n` ticks. */
async function pageRoom(n: number): Promise<LoopbackMatch> {
  const match = new LoopbackMatch(simMapOfLoaded(flatMap()), null, { auto: false });
  const sock = match.socket('loopback:');
  await flushTicks();
  sock.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name: 'Solo', map: 'MP99' }));
  for (let i = 0; i < n; i++) match.step();
  await flushTicks();
  return match;
}
const poll = (m: unknown): void => (m as { poll(): void }).poll();
type Header = Extract<ReplayRecord, { kind: 'header' }>;

describe('the recording (PT-03)', () => {
  afterEach(() => { document.body.replaceChildren(); setLoopbackDefaults({}); });

  it("the session message registers a recorder the page's next LoopbackMatch takes; its first frame is the header of segment 0", async () => {
    const f = recordingHost(); const m = mountPlaytestSession(f.host); f.open();
    const seg = f.sent.find((s) => s.type === 'segment') as unknown as { header: Header['header'] };
    expect(seg.header).toMatchObject({ map: 'MP2', kind: 'solo', rules: 'classic', session: { id: '20261006-1a2b', segment: 0 }, build: { commit: 'abc1234', dirty: true, branch: 'agent/playtest', branchCreated: '2026-10-06T10:00:00Z' } });
    const match = await pageRoom(60);
    expect((match.room as unknown as { opts: RoomOptions }).opts.recorder).toBeTruthy();
    expect(f.binary).toHaveLength(1);                                   // one flush: 30 snapshots
    const first = f.records()[0] as Header;
    expect(first.kind).toBe('header');
    expect(first.header.session).toEqual({ id: '20261006-1a2b', segment: 0 });
    expect(first.header).toEqual(seg.header);                           // the segment message carried the same header
    expect(f.sent.findIndex((s) => s.type === 'segment')).toBe(0);      // sent before any binary frame
    match.stop(); m.dispose();
  });

  it('a mark writes a mark record at the last tick recorded; a map change ends segment 0 and opens 1', async () => {
    const f = recordingHost(); const m = mountPlaytestSession(f.host); f.open();
    const match = await pageRoom(60);
    const bundle = await m.mark('button');
    expect(bundle.tick).toBe(60);                                       // the last snapshot's tick
    expect(bundle.telemetry['recording']).toBe('streaming');
    f.setMap('MP5'); poll(m);
    const kinds = f.sent.map((s) => s.type).filter((t) => t === 'segment' || t === 'segmentEnd');
    expect(kinds).toEqual(['segment', 'segmentEnd', 'segment']);
    expect(f.sent.find((s) => s.type === 'segmentEnd')).toEqual({ type: 'segmentEnd', segment: 0, reason: 'context changed' });
    const next = f.sent.filter((s) => s.type === 'segment')[1] as unknown as { header: Header['header'] };
    expect(next.header).toMatchObject({ map: 'MP5', session: { segment: 1 } });
    const recs = f.records();
    expect(recs.filter((r) => r.kind === 'mark')).toEqual([{ kind: 'mark', tick: 60, observation: 'local-1', at: bundle.at }]);
    expect(recs.at(-1)).toMatchObject({ kind: 'end', reason: 'context changed' });
    expect(f.host.hook().playtest!()).toMatchObject({ segment: 1, tick: 60 });
    // The room built before the change keeps its old (closed) recorder; the page's next room takes segment 1's.
    const after = await pageRoom(60);
    const headers = f.records().filter((r): r is Header => r.kind === 'header');
    expect(headers.map((r) => r.header.session!.segment)).toEqual([0, 1]);
    match.stop(); after.stop(); m.dispose();
  });

  it('a mode or an online change rotates the segment (online opens none page-side); a service segment message does not; dispose ends it and clears the seam', () => {
    const f = recordingHost(); const m = mountPlaytestSession(f.host); f.open();
    f.setSearch('?devmode&mode=play&playtest=x'); poll(m);              // segment 1
    f.setSearch('?devmode&mode=play&online=shared&playtest=x'); poll(m); // segment 2: online, the server records it
    expect(f.host.hook().playtest!()).toMatchObject({ segment: 2 });
    f.message({ type: 'segment', segment: 7 });                         // the service sends none; one is ignored
    poll(m);                                                            // nothing changed since: no new segment
    f.setSearch('?devmode&mode=play&playtest=x'); poll(m);              // segment 3: offline again, recorded here
    expect(f.sent.filter((s) => s.type === 'segmentEnd').map((e) => e['segment'])).toEqual([0, 1]);
    expect(f.sent.filter((s) => s.type === 'segment').map((s) => (s['header'] as Header['header']).session!.segment)).toEqual([0, 1, 3]);
    m.dispose();
    expect(f.sent.at(-1)).toEqual({ type: 'segmentEnd', segment: 3, reason: 'disposed' });
    const match = new LoopbackMatch(simMapOfLoaded(flatMap()), null, { auto: false });
    expect((match.room as unknown as { opts: RoomOptions }).opts.recorder).toBeUndefined();
    match.stop();
  });

  it('PT-23b: closing closes the recording before flushed -- the unflushed tail, a mark just made and the end record reach the service', async () => {
    const f = recordingHost();
    const order: string[] = [];
    const host = {
      ...f.host,
      socket: () => {
        const s = f.host.socket();
        return { ...s, send: (msg: object) => { order.push((msg as { type: string }).type); s.send(msg); }, sendBinary: (b: Uint8Array) => { order.push('<binary>'); s.sendBinary(b); } };
      },
    };
    const m = mountPlaytestSession(host); f.open();
    const match = await pageRoom(45);                                   // under 30 snapshots (one each 2 ticks): none flushed yet
    const bundle = await m.mark('key');                                 // a mark in the buffered second
    const t = bundle.tick!;
    expect(t).toBeGreaterThan(30);
    const sentBefore = f.binary.length;
    f.message({ type: 'closing' });
    await vi.waitFor(() => expect(order).toContain('flushed'));
    expect(f.binary.length).toBeGreaterThan(sentBefore);                // the tail went out
    const recs = f.records();
    expect(recs.filter((r) => r.kind === 'snap').at(-1)!.tick).toBe(t);
    expect(recs.filter((r) => r.kind === 'mark')).toEqual([{ kind: 'mark', tick: t, observation: 'local-1', at: bundle.at }]);
    expect(recs.at(-1)).toEqual({ kind: 'end', tick: t, reason: 'closed' });
    // The end's bytes, then segmentEnd, both before flushed: the service closes the segment on segmentEnd.
    const end = order.lastIndexOf('<binary>'), segEnd = order.indexOf('segmentEnd'), flushed = order.indexOf('flushed');
    expect(end).toBeLessThan(segEnd);
    expect(segEnd).toBeLessThan(flushed);
    expect(f.sent.filter((s) => s.type === 'segmentEnd')).toEqual([{ type: 'segmentEnd', segment: 0, reason: 'closed' }]);
    // Nothing is recorded after it, and the dispose ends nothing a second time.
    const frames = f.binary.length;
    for (let i = 0; i < 60; i++) match.step();
    await flushTicks();
    expect(f.binary.length).toBe(frames);
    m.dispose();
    expect(f.sent.filter((s) => s.type === 'segmentEnd')).toHaveLength(1);
    match.stop();
  });

  it('a map change restarts the video ring with the segment: an open pin is sent cut at the boundary', async () => {
    class FakeRecorder {
      static made: FakeRecorder[] = [];
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      state = 'inactive';
      constructor() { FakeRecorder.made.push(this); }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    }
    const g = globalThis as { MediaRecorder?: unknown };
    const saved = g.MediaRecorder;
    g.MediaRecorder = FakeRecorder;
    try {
      const f = recordingHost(); let t = 0;
      const canvas = document.createElement('canvas');
      (canvas as unknown as { captureStream: () => object }).captureStream = () => ({});
      (canvas as HTMLCanvasElement & { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(new Blob([new Uint8Array([1])], { type: 'image/png' }));
      const m = mountPlaytestSession({ ...f.host, canvas: () => canvas, now: () => t }); f.open();
      for (let i = 0; i < 3; i++) { t += 1000; FakeRecorder.made[0]!.ondataavailable!({ data: webmChunk(i) }); }
      await new Promise((r) => setTimeout(r, 10));            // the chunks read to bytes
      await m.mark('key');
      f.setMap('MP5'); poll(m);
      await vi.waitFor(() => expect(f.sent.some((s) => s.type === 'clip')).toBe(true));
      expect((f.sent.find((s) => s.type === 'clip') as unknown as { cut: boolean }).cut).toBe(true);
      expect(FakeRecorder.made).toHaveLength(2);
      expect(FakeRecorder.made[0]!.state).toBe('inactive');
      expect(f.sent.filter((s) => s.type === 'segmentEnd')).toEqual([{ type: 'segmentEnd', segment: 0, reason: 'context changed' }]);
      m.dispose();
    } finally {
      g.MediaRecorder = saved;
    }
  });

  it('the header map is the address map stem; a room built in the tick its map changes, before any poll, takes segment 1', async () => {
    const f = recordingHost('?devmode&mode=play&map=MP2&playtest=ws://127.0.0.1:5303/session');
    const m = mountPlaytestSession(f.host); f.open();
    const first = f.sent.find((s) => s.type === 'segment') as unknown as { header: Header['header'] };
    expect(first.header.map).toBe('MP2');                               // the stem, not the hook's mission name
    const old = await pageRoom(60);
    f.setMap('Frostfire');                                              // the hook's name is not the context while map= is there
    f.setSearch('?devmode&mode=play&map=MP5&playtest=ws://127.0.0.1:5303/session');
    const next = await pageRoom(60);                                    // no poll between: main.ts builds the room in show()
    expect((next.room as unknown as { opts: RoomOptions }).opts.recorder).not.toBe((old.room as unknown as { opts: RoomOptions }).opts.recorder);
    const segs = f.sent.filter((s) => s.type === 'segment').map((s) => (s['header'] as Header['header']));
    expect(segs.map((h) => [h.session!.segment, h.map])).toEqual([[0, 'MP2'], [1, 'MP5']]);
    const recs = f.records();
    const h1 = recs.findIndex((r) => r.kind === 'header' && r.header.session!.segment === 1);
    expect(h1).toBeGreaterThan(0);
    expect(recs.slice(h1 + 1).filter((r) => r.kind === 'snap')).toHaveLength(30);   // the new room records into segment 1
    poll(m);
    expect(f.sent.filter((s) => s.type === 'segment')).toHaveLength(2);           // the poll after finds nothing new
    old.stop(); next.stop(); m.dispose();
  });

  it('a refused segment index is resumed on the next free one: the same rooms record into it', async () => {
    const f = recordingHost(); const m = mountPlaytestSession(f.host); f.open();
    const match = await pageRoom(2);
    f.message({ type: 'segmentRefused', index: 0, next: 3 });
    const segs = f.sent.filter((s) => s.type === 'segment').map((s) => (s['header'] as Header['header']).session!.segment);
    expect(segs).toEqual([0, 3]);
    expect(f.sent.some((s) => s.type === 'segmentEnd')).toBe(false);   // nothing was opened under 0 to end
    for (let i = 0; i < 60; i++) match.step();
    const recs = f.records();
    expect(recs[0]).toMatchObject({ kind: 'header', header: { session: { segment: 3 } } });
    expect(f.host.hook().playtest!()).toMatchObject({ segment: 3 });
    match.stop(); m.dispose();
    expect(f.sent.at(-1)).toEqual({ type: 'segmentEnd', segment: 3, reason: 'disposed' });
  });

  it('online=off (the page writes its Online setting into the address) is offline: the page records, as in the e2e', async () => {
    // The e2e's address once the page has written its Online setting (`./shareUrl`, `online=off`): not online.
    const f = recordingHost('?mode=play&devmode&noarmory&map=MP2&online=off&playtest=ws://127.0.0.1:5308/session');
    const m = mountPlaytestSession(f.host); f.open();
    expect(f.sent.filter((s) => s.type === 'segment')).toHaveLength(1);
    const match = await pageRoom(60);
    const bundle = await m.mark('button');
    expect(bundle.tick).toBe(60);
    expect(bundle.telemetry['recording']).toBe('streaming');
    match.stop(); m.dispose();
  });

  it('online is the address\'s server or mp, or online=shared or local: each opens no page-side recording', () => {
    for (const q of ['server=ws://x', 'mp', 'online=shared', 'online=local']) {
      const f = recordingHost(`?devmode&mode=play&map=MP2&${q}&playtest=ws://127.0.0.1:5303/session`);
      const m = mountPlaytestSession(f.host); f.open();
      expect(f.sent.some((s) => s.type === 'segment'), q).toBe(false);
      m.dispose();
    }
  });

  it('ADDR-ONLINE: the recording reads online by the one rule (`./addressOnline`), row for row of its table', () => {
    const read: [string, boolean][] = [];
    for (const [search] of ADDRESS_ONLINE_TABLE) {
      const f = recordingHost(`?devmode&mode=play&map=MP2&playtest=ws://127.0.0.1:5303/session&${search.replace(/^\?/, '')}`);
      const m = mountPlaytestSession(f.host); f.open();
      read.push([search, !f.sent.some((s) => s.type === 'segment')]);   // online: no page-side segment
      m.dispose();
    }
    expect(read).toEqual(ADDRESS_ONLINE_TABLE);
  });

  it('online (online, server or mp in the address) the page records nothing: no segment, recording: server; a mark still goes out', async () => {
    const f = recordingHost('?devmode&online&server=ws://x&playtest=ws://127.0.0.1:5303/session');
    const m = mountPlaytestSession(f.host); f.open();
    const match = await pageRoom(60);
    expect((match.room as unknown as { opts: RoomOptions }).opts.recorder).toBeUndefined();
    const bundle = await m.mark('button');
    expect(bundle.telemetry['recording']).toBe('server');
    expect(f.sent.some((s) => s.type === 'segment')).toBe(false);
    expect(f.sent.some((s) => s.type === 'mark')).toBe(true);
    expect(f.binary).toHaveLength(0);
    match.stop(); m.dispose();
    expect(f.sent.some((s) => s.type === 'segmentEnd')).toBe(false);
  });

  it('a socket without sendBinary records nothing and says unsent', async () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const match = new LoopbackMatch(simMapOfLoaded(flatMap()), null, { auto: false });
    expect((match.room as unknown as { opts: RoomOptions }).opts.recorder).toBeUndefined();
    const bundle = await m.mark('button');
    expect(bundle.telemetry['recording']).toBe('unsent');
    expect(f.sent.some((s) => (s as { type: string }).type === 'segment')).toBe(false);
    match.stop(); m.dispose();
  });
});

// PT-22 (web sprint 35; spec 4.8, W35.R7; research 243 §7): a mark's telemetry gains `kit` and `feet`; the focused
// retest's `&retest-at=` places the player, offline, through the devmode teleport, after the room's first round starts,
// checked a frame or two later and placed again if the round's respawn undid it (the review's F1).
describe('the focused retest on the page (PT-22)', () => {
  afterEach(() => { document.body.replaceChildren(); setLoopbackDefaults({}); });
  type Teleport = (x: number, y: number, z: number, yaw?: number) => boolean;
  const START: [number, number, number] = [-100, 0, 0];
  /**
   * A page with the recording's binary channel (the round is seen through its seam) and a fake walk: `feet` is where the
   * walk stands, and the default teleport moves it to the target. `respawns` is how many teleports a round's respawn
   * undoes (the feet put back at the start before the check).
   */
  function retestHost(search: string, over: { teleport?: Teleport; net?: () => unknown; binary?: boolean; respawns?: number; feet?: [number, number, number] | null; loading?: () => unknown } = {}) {
    const f = fakeHost(search);
    const calls: unknown[][] = [];
    let feet: [number, number, number] | null = over.feet === undefined ? [...START] : over.feet;
    let undo = over.respawns ?? 0;
    const teleport: Teleport = over.teleport ?? ((x, y, z) => { feet = [x, y, z]; if (undo > 0) { undo--; feet = [...START]; } return true; });
    Object.assign(f.hook as object, {
      loadout: () => ({ loadout: [11, 22, 33, 194, 255], records: [], models: [], pending: null, type: 0, bodyType: 0, model: null }),
      feet: () => feet,
      pose: () => ({ x: 0, y: 0, z: 0, yaw: 90, pitch: 0 }),
      net: over.net ?? (() => null),
      ...(over.loading ? { loading: over.loading } : {}),
      teleport: (...a: Parameters<Teleport>) => { calls.push(a); return teleport(...a); },
    });
    const host = over.binary === false ? f.host : { ...f.host, socket: () => ({ ...f.host.socket(), sendBinary: () => {} }) };
    const m = mountPlaytestSession(host) as ReturnType<typeof mountPlaytestSession> & { poll(): void };
    f.open();
    return {
      f, m, calls, setFeet: (v: [number, number, number] | null) => { feet = v; },
      stats: () => (f.hook as unknown as { playtest(): { retest?: string } }).playtest(),
      polls: (n: number) => { for (let i = 0; i < n; i++) m.poll(); },
    };
  }
  const SEARCH = '?devmode&mode=play&map=MP2&retest-at=1.5,2,-3.25,90&playtest=ws://127.0.0.1:5303/session';

  it('a mark\'s telemetry carries the kit on the body and the feet with the look\'s yaw', async () => {
    const { m } = retestHost('?devmode&playtest=ws://127.0.0.1:5303/session', { feet: [10.5, 0.25, 20.75] });
    const bundle = await m.mark('key');
    expect(bundle.telemetry['kit']).toEqual([11, 22, 33, 194, 255]);
    expect(bundle.telemetry['feet']).toEqual({ at: [10.5, 0.25, 20.75], yaw: 90 });
    m.dispose();
  });
  it('a hook with no loadout and no feet (fly mode) gives null for both, never a guess', async () => {
    const f = fakeHost(); const m = mountPlaytestSession(f.host); f.open();
    const bundle = await m.mark('button');
    expect(bundle.telemetry['kit']).toBeNull();
    expect(bundle.telemetry['feet']).toBeNull();
    m.dispose();
  });
  it('F1: not between the join and the first round (the solo room never waits); once the room starts it, placed and held', async () => {
    const r = retestHost(SEARCH);
    const match = await pageRoom(0);                         // joined: the walk stands, no round yet
    r.polls(3);
    expect(r.calls).toEqual([]);
    expect(r.stats().retest).toBe('waiting');
    match.step(); await flushTicks();                        // the room's first round: its roundStart reaches the seam
    r.m.poll();
    expect(r.calls).toEqual([[1.5, 2, -3.25, 90]]);
    expect(r.stats().retest).toBe('waiting');                // being checked
    r.polls(RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(r.stats().retest).toBe('placed');
    r.polls(5);
    expect(r.calls).toHaveLength(1);
    match.stop(); r.m.dispose();
  });
  it('F1: a respawn that undoes the teleport is caught by the check and placed again; one that always does is failed after the tries', async () => {
    const once = retestHost(SEARCH, { respawns: 1 });
    const match = await pageRoom(1);                         // the first round has started
    once.polls(1 + RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(once.calls).toHaveLength(2);                      // the check saw the start, not the target: placed again
    once.polls(RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(once.stats().retest).toBe('placed');
    match.stop(); once.m.dispose(); setLoopbackDefaults({});

    const always = retestHost(SEARCH, { respawns: 99 });
    const match2 = await pageRoom(1);
    always.polls(20);
    expect(always.calls).toHaveLength(RETEST_PLACE_PLACEHOLDER.tries);
    expect(always.stats().retest).toBe('failed');
    always.polls(10);
    expect(always.calls).toHaveLength(RETEST_PLACE_PLACEHOLDER.tries);   // never again
    match2.stop(); always.m.dispose();
    expect(RETEST_PLACE_PLACEHOLDER).toEqual({ reach: 5, verifyFrames: 2, tries: 3 });
  });
  it('not while the page holds its loading screen (the play clips not yet in: main.ts makes its room again when they come)', async () => {
    let blocked = true;
    const r = retestHost(SEARCH, { loading: () => ({ blocked }) });
    const match = await pageRoom(1);                         // the room's first round has started, the page still held
    r.polls(4);
    expect(r.calls).toEqual([]);
    expect(r.stats().retest).toBe('waiting');
    blocked = false;                                         // the hold released: the clips in, the room final
    r.m.poll();
    expect(r.calls).toEqual([[1.5, 2, -3.25, 90]]);
    r.polls(RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(r.stats().retest).toBe('placed');
    match.stop(); r.m.dispose();
  });
  it('a room built again after its first round (main.ts connectNet: the clips came late) is waited on: its own round, then placed', async () => {
    const r = retestHost(SEARCH);
    const first = await pageRoom(1);                         // the first room's round started
    first.stop();
    const again = await pageRoom(0);                         // the page's room made again: joined, its round not yet started
    r.polls(3);
    expect(r.calls).toEqual([]);                             // the old room's round start does not place in the new room
    expect(r.stats().retest).toBe('waiting');
    again.step(); await flushTicks();                        // the new room's first round
    r.m.poll();
    expect(r.calls).toEqual([[1.5, 2, -3.25, 90]]);
    r.polls(RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(r.stats().retest).toBe('placed');
    again.stop(); r.m.dispose();
  });
  it('a teleport the page refuses (no room body yet), or a room waiting for its round, is tried again later and is not a try', async () => {
    let ok = false, waiting = true;
    const r = retestHost('?devmode&mode=play&map=MP2&retest-at=1,2,3&playtest=x', { teleport: () => ok, net: () => ({ waiting }) });
    const match = await pageRoom(1);
    r.polls(2);
    expect(r.calls).toEqual([]);                             // the page says the round is waiting
    waiting = false;
    r.polls(4);
    expect(r.calls).toHaveLength(4);                         // refused each frame
    expect(r.calls[0]).toEqual([1, 2, 3, undefined]);        // no facing recorded: the look's own yaw
    expect(r.stats().retest).toBe('waiting');
    ok = true; r.setFeet([1, 2, 3]);
    r.polls(1 + RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(r.stats().retest).toBe('placed');
    match.stop(); r.m.dispose();
  });
  it("the re-review's nit: waiting, then a new segment on another map -- failed, and that map's first round teleports nobody", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = retestHost(SEARCH);
    let map = 'MP2';
    Object.assign(r.f.hook as object, { stats: () => ({ map }) });       // the recording's map, as the page reports it
    r.polls(3);
    expect(r.stats().retest).toBe('waiting');                            // no round seen yet (a room before the recorder)
    map = 'MP5';
    r.m.poll();                                                          // the context changed: a new segment
    expect(r.f.sent.filter((x) => (x as { type: string }).type === 'segmentEnd')).toHaveLength(1);
    expect(r.stats().retest).toBe('failed');
    const match = await pageRoom(1);                                     // the new map's room starts its first round
    r.polls(10);
    expect(r.calls).toEqual([]);
    expect(r.stats().retest).toBe('failed');
    match.stop(); r.m.dispose();
    warn.mockRestore();
  });
  it('a placement already held is kept when the map changes later', async () => {
    const r = retestHost(SEARCH);
    let map = 'MP2';
    Object.assign(r.f.hook as object, { stats: () => ({ map }) });
    const match = await pageRoom(1);
    r.polls(1 + RETEST_PLACE_PLACEHOLDER.verifyFrames);
    expect(r.stats().retest).toBe('placed');
    map = 'MP5';
    r.polls(3);
    expect(r.stats().retest).toBe('placed');
    expect(r.calls).toHaveLength(1);
    match.stop(); r.m.dispose();
  });
  it('no recording to see a round by (no binary channel): failed at once, never teleported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = retestHost(SEARCH, { binary: false });
    r.polls(5);
    expect(r.calls).toEqual([]);
    expect(r.stats().retest).toBe('failed');
    warn.mockRestore();
    r.m.dispose();
  });
  it('no &retest-at=: nothing is teleported, and the hook says nothing of a retest', async () => {
    const r = retestHost('?devmode&mode=play&map=MP2&playtest=ws://127.0.0.1:5303/session');
    const match = await pageRoom(1);
    r.polls(5);
    expect(r.calls).toEqual([]);
    expect(r.stats().retest).toBeUndefined();
    match.stop(); r.m.dispose();
  });
  it('online (a server named), without ?devmode, or a malformed value: never placed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const search of [
      '?devmode&mode=play&map=MP2&server=ws%3A%2F%2F127.0.0.1%3A5305%2Fws&retest-at=1,2,3,90&playtest=x&online',
      '?mode=play&map=MP2&retest-at=1,2,3,90&playtest=x',
      '?devmode&mode=play&map=MP2&retest-at=1,2,nope&playtest=x',
      '?devmode&mode=play&map=MP2&retest-at=1,2&playtest=x',
    ]) {
      const r = retestHost(search);
      const match = await pageRoom(1);
      r.polls(3);
      expect(r.calls, search).toEqual([]);
      expect(r.stats().retest, search).toBeUndefined();
      match.stop(); r.m.dispose(); setLoopbackDefaults({});
    }
    warn.mockRestore();
  });
  it('ADDR-ONLINE: the placement is offline by the one rule (`./addressOnline`) -- a bare online or online=yes is offline and placed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const read: [string, boolean][] = [];
    for (const [search] of ADDRESS_ONLINE_TABLE) {
      const r = retestHost(`?devmode&mode=play&map=MP2&retest-at=1,2,3&playtest=x&${search.replace(/^\?/, '')}`);
      const match = await pageRoom(1);
      r.polls(3);
      read.push([search, r.calls.length === 0]);                       // online: never placed
      match.stop(); r.m.dispose(); setLoopbackDefaults({});
    }
    expect(read).toEqual(ADDRESS_ONLINE_TABLE);
    warn.mockRestore();
  });
});
