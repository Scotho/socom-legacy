import { describe, expect, it, vi } from 'vitest';
import { xboxBuildStamp, xboxBuildManifest } from '../xboxTestBuild';
import { bindDiagnosticCopy, diagnosticExport, diagnosticReason } from '../src/xboxPrototype/diagnostics';
import { buildLabel, parseBuildIdentity } from '../src/xboxPrototype/buildIdentity';

const commit = 'a'.repeat(40), builtAt = '2026-11-13T18:00:00.000Z';
const clean = () => xboxBuildStamp(args => args[0] === 'rev-parse' ? commit : '', () => new Date(builtAt));

describe('separate Xbox build identity', () => {
  it('requires an actual full Git commit and records a single build clock', () => {
    const clock = vi.fn(() => new Date(builtAt)), git = vi.fn((args: readonly string[]) => args[0] === 'rev-parse' ? `${commit}\n` : '');
    const build = xboxBuildStamp(git, clock);
    expect(build).toEqual({ schema: 1, flavor: 'xbox-webgl2-experiment', commit, revision: `${'a'.repeat(12)}`, dirty: false, builtAt });
    expect(clock).toHaveBeenCalledOnce();
    expect(git.mock.calls).toEqual([[['rev-parse', '--verify', 'HEAD']], [['status', '--porcelain', '--untracked-files=normal']]]);
  });
  it('refuses unknown identity and dirty distribution unless explicitly requested for local checks', () => {
    expect(() => xboxBuildStamp(() => { throw new Error('untrusted repository'); })).toThrow('Cannot identify Xbox test build');
    expect(() => xboxBuildStamp(() => 'unknown')).toThrow('Cannot identify Xbox test build');
    const dirtyGit = (args: readonly string[]) => args[0] === 'rev-parse' ? commit : ' M src/example.ts';
    expect(() => xboxBuildStamp(dirtyGit)).toThrow('uncommitted');
    expect(xboxBuildStamp(dirtyGit, () => new Date(builtAt), true)).toMatchObject({ dirty: true, revision: `${'a'.repeat(12)}-dirty` });
  });
  it('uses the same verified identity in the manifest and the visible backend label', () => {
    const build = clean();
    expect(JSON.parse(xboxBuildManifest(build))).toEqual(build);
    expect(parseBuildIdentity(build)).toEqual(build);
    expect(buildLabel(build, 'raw')).toContain(`Lightweight WebGL2 | ${commit}`);
    expect(buildLabel({ ...build, dirty: true, revision: `${'a'.repeat(12)}-dirty` }, 'current')).toContain('UNCOMMITTED');
    expect(parseBuildIdentity({ ...build, revision: 'some-other-revision' })).toBeNull();
    expect(buildLabel(null, 'raw')).toContain('Unverified development build');
  });
});

describe('Xbox diagnostic export', () => {
  it('exports bounded sound phase numbers while dropping arbitrary stage text and nested payloads', () => {
    const result = diagnosticExport({ sound: { loadPhases: [
      { phase: 'worker-data-ready', atUnixMs: 1000, sourceBytes: 42, file: 'private', data: { bytes: new Uint8Array(50) } },
      { phase: 'private', atUnixMs: 1001 },
      { phase: 'main-first-queues-idle', atUnixMs: 1002, decodePending: 0, jobsPending: 0, nativeBytes: 300 },
    ] } }, clean(), { status: 'active', vendor: 'unknown', renderer: 'unknown' }, 'desktop');
    expect(result.sound).toHaveProperty('loadPhases', [
      { phase: 'worker-data-ready', atUnixMs: 1000, sourceBytes: 42 },
      { phase: 'main-first-queues-idle', atUnixMs: 1002, decodePending: 0, jobsPending: 0 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/private|nativeBytes|Uint8Array/);
  });
  it('copies only the exported object and leaves selectable text when clipboard permission is denied', async () => {
    const button = {} as HTMLButtonElement, text = { hidden: true, value: '', focus: vi.fn(), select: vi.fn() };
    const status = { textContent: '' }, writeText = vi.fn(async () => {});
    const safe = { schema: 1, stage: 'rendering' };
    bindDiagnosticCopy(button, text as unknown as HTMLTextAreaElement, status as HTMLElement, () => safe, () => ({ writeText }));
    await button.onclick!.call(button, {} as PointerEvent);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(safe, null, 2));
    expect(status.textContent).toBe('Test diagnostics copied.');
    writeText.mockRejectedValueOnce(new Error('Permission denied'));
    await button.onclick!.call(button, {} as PointerEvent);
    expect(text.hidden).toBe(false); expect(JSON.parse(text.value)).toEqual(safe);
    expect(text.select).toHaveBeenCalledTimes(2); expect(status.textContent).toContain('Select and copy');
  });
  it('keeps useful measurements while dropping names, URLs, paths and arbitrary failure text', () => {
    const privateMarker = 'do-not-export-this';
    const report = { backend: 'raw', mode: 'walk', map: 'MP2', stage: 'failed', failureStage: 'decoding map', error: `Source failed ${privateMarker}`,
      frames: 8, elapsedMs: 32, jsHeapPeakSampledBytes: 400, builtAt,
      movement: { state: 'open', name: privateMarker, id: 13, players: 2, locked: false, feet: [0, 1, 2],
        lobby: { seats: [{ name: privateMarker }], ready: true, loaded: true, launched: true, error: privateMarker },
        combat: { counts: { rounds: 2, serverAccepted: 1 }, magazine: { rounds: 29, reloading: false }, weaponName: privateMarker } },
      sound: { stage: 'ready', stats: { state: 'running', played: 4, tokens: privateMarker },
        loopPayloadSample: { loadedSourceBytes: 100, currentSourceBytes: 20, releasedSourceBytes: 80 } },
      resources: { gpuPayloadBytes: 32, gpuPayloadLimitBytes: 96, textures: 4, url: privateMarker }, password: privateMarker, url: privateMarker, source: privateMarker };
    const exported = diagnosticExport(report, clean(), { status: 'lost', vendor: 'unknown', renderer: 'unknown' }, 'series-x');
    const text = JSON.stringify(exported);
    expect(text).not.toContain(privateMarker); expect(text).not.toContain('"feet"'); expect(text).not.toContain('"id"');
    expect(exported).toMatchObject({ build: clean(), testerHardware: 'series-x', failure: 'source', map: 'MP2', stage: 'failed', failureStage: 'decoding map',
      graphics: { status: 'lost' }, memory: { jsHeapPeakSampledBytes: 400 },
      sound: { loopPayloadSample: { loadedSourceBytes: 100, currentSourceBytes: 20, releasedSourceBytes: 80 } },
      movement: { players: 2, lobby: { ready: true }, combat: { counts: { rounds: 2, serverAccepted: 1 } } } });
  });
  it('retains an audio-only failure as a category while removing its detail', () => {
    const result = diagnosticExport({ stage: 'rendering', error: '', sound: { stage: 'failed: Asset worker failed /private/source' } },
      clean(), { status: 'active', vendor: 'unknown', renderer: 'unknown' }, 'desktop');
    expect(result).toMatchObject({ stage: 'rendering', failure: null, sound: { stage: 'failed', failure: 'asset-load' } });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('normalizes failures without exporting error text and rejects invalid numeric/build fields', () => {
    expect(diagnosticReason('WebGL context lost')).toBe('webgl-context-lost');
    expect(diagnosticReason('Prototype GPU payload budget exceeded')).toBe('gpu-payload-limit');
    expect(diagnosticReason('Game connection closed (1006); reload to rejoin')).toBe('disconnected');
    expect(diagnosticReason('Asset worker failed')).toBe('asset-load');
    const result = diagnosticExport({ map: '../private.iso', backend: 'bogus', stage: 'private failure text',
      frames: Infinity, resources: { textures: -1 }, error: 'arbitrary private message' }, null,
      { status: 'not-created', vendor: 'unknown', renderer: 'unknown' }, 'unreported');
    expect(result).toMatchObject({ build: null, backend: 'unknown', stage: 'unknown', map: null, failure: 'other' });
    expect(result).not.toHaveProperty('frames');
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
