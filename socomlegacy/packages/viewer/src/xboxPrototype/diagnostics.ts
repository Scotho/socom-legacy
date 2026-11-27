import { parseBuildIdentity, type XboxBuildIdentity } from './buildIdentity';
import { soundLoadPhases } from '../soundLoadProfile';

type ObjectRecord = Record<string, unknown>;
const object = (v: unknown): ObjectRecord => v && typeof v === 'object' && !Array.isArray(v) ? v as ObjectRecord : {};
function numbers(value: unknown, keys: readonly string[]): Record<string, number> {
  const source = object(value), result: Record<string, number> = {};
  for (const key of keys) { const n = source[key]; if (typeof n === 'number' && Number.isFinite(n) && n >= 0) result[key] = n; }
  return result;
}
function flags(value: unknown, keys: readonly string[]): Record<string, boolean> {
  const source = object(value), result: Record<string, boolean> = {};
  for (const key of keys) if (typeof source[key] === 'boolean') result[key] = source[key] as boolean;
  return result;
}
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;
const STAGES = ['ready', 'opening source', 'decoding map', 'decoding animation', 'building renderer',
  'joining game lobby', 'rendering', 'capture ready', 'failed', 'stopped; reload for a fresh run', 'unknown'] as const;
export function diagnosticReason(error: unknown): string | null {
  if (typeof error !== 'string' || !error) return null;
  if (/webgl.*(context.*lost|unavailable|stopped)/i.test(error)) return 'webgl-context-lost';
  if (/gpu payload budget|payload limit/i.test(error)) return 'gpu-payload-limit';
  if (/connection.*(closed|refused)|disconnect/i.test(error)) return 'disconnected';
  if (/asset worker|animation data|map contains/i.test(error)) return 'asset-load';
  if (/source|disc image|stored disc/i.test(error)) return 'source';
  if (/resume|resuming|map change|match returned/i.test(error)) return 'unsupported-lifecycle';
  return 'other';
}
export interface GraphicsIdentity { status: 'not-created' | 'active' | 'lost' | 'stopped'; vendor: string; renderer: string }
const graphicsText = (v: unknown) => typeof v === 'string' ? v.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 200) : 'unknown';
export function readGraphicsIdentity(canvas: HTMLCanvasElement): GraphicsIdentity {
  const gl = canvas.getContext('webgl2');
  if (!gl || gl.isContextLost()) return { status: 'lost', vendor: 'unknown', renderer: 'unknown' };
  try {
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { status: 'active', vendor: graphicsText(gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
      renderer: graphicsText(gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) };
  } catch {
    // A privacy restriction on driver strings must never stop the game.
    return { status: 'active', vendor: 'unknown', renderer: 'unknown' };
  }
}

/** Explicit export whitelist: never serialize arbitrary strings from a lobby,
 * error, asset source, socket or input. This object is separate from the local
 * developer report, which may contain names. No network/upload action is here. */
export function diagnosticExport(value: unknown, identity: XboxBuildIdentity | null, graphics: GraphicsIdentity, hardware: unknown) {
  const r = object(value), movement = object(r.movement), combat = object(movement.combat), lobby = object(movement.lobby);
  const match = object(movement.match), sound = object(r.sound), audio = object(sound.stats);
  const soundError = typeof sound.stage === 'string' && sound.stage.startsWith('failed:') ? sound.stage.slice(7).trim() : null;
  return {
    schema: 1, build: parseBuildIdentity(identity),
    testerHardware: choice(hardware, ['unreported', 'desktop', 'series-x', 'series-s'], 'unreported'),
    backend: choice(r.backend, ['raw', 'current', 'unknown'], 'unknown'),
    mode: choice(r.mode, ['walk', 'benchmark', 'unknown'], 'unknown'),
    map: typeof r.map === 'string' && /^MP[A-Z0-9_]{1,24}$/.test(r.map) ? r.map : null,
    stage: choice(r.stage, STAGES, 'unknown'),
    failureStage: r.failureStage === null || r.failureStage === undefined ? null : choice(r.failureStage, STAGES, 'unknown'),
    failure: diagnosticReason(r.error || movement.error || lobby.error),
    graphics: { status: choice(graphics.status, ['not-created', 'active', 'lost', 'stopped'], 'not-created'),
      vendor: graphicsText(graphics.vendor), renderer: graphicsText(graphics.renderer) },
    ...numbers(r, ['frames', 'elapsedMs', 'firstFrameMs', 'renderCpuMsTotal', 'renderCpuMsMax']),
    memory: numbers(r, ['jsHeapPeakSampledBytes']),
    resources: numbers(r.resources, ['programs', 'buffers', 'geometryBuffers', 'bufferSourceRanges', 'geometryPayloadBytes',
      'textures', 'batches', 'drawCalls', 'culledBatches', 'lodHiddenBatches', 'fadingBatches', 'collapsedFacades', 'triangles',
      'actors', 'worldPlacementCpuBytes', 'gpuPayloadBytes', 'gpuPayloadLimitBytes']),
    movement: { state: choice(movement.state, ['offline', 'connecting', 'open', 'closed', 'refused', 'unknown'], 'unknown'),
      ...numbers(movement, ['players']), ...flags(movement, ['locked']),
      lobby: { ...flags(lobby, ['ready', 'loaded', 'launched']), ...numbers(lobby, ['readyIn', 'countdown']) },
      combat: { ...numbers(combat, ['weapon', 'weaponId', 'mode']), ...flags(combat, ['held']),
        magazine: { ...numbers(combat.magazine, ['rounds', 'capacity', 'spare']), ...flags(combat.magazine, ['reloading']) },
        counts: numbers(combat.counts, ['rounds', 'reloads', 'staleFire', 'staleReload', 'serverAccepted', 'serverRejected', 'hits']) },
      match: { rules: choice(match.rules, ['classic', 'respawn', 'unknown'], 'unknown'),
        ...flags(match, ['waiting', 'ghost', 'dead', 'benched', 'respawnReady']) } },
    sound: { stage: soundError !== null ? 'failed' : choice(sound.stage, ['off', 'loading', 'ready', 'unknown'], 'unknown'),
      failure: diagnosticReason(soundError),
      state: choice(audio.state, ['running', 'suspended', 'closed', 'unknown'], 'unknown'),
      ...numbers(audio, ['played', 'voices', 'streams', 'loops']),
      loopPayloadSample: numbers(sound.loopPayloadSample, ['loadedSourceBytes', 'currentSourceBytes', 'releasedSourceBytes']),
      loadPhases: soundLoadPhases(sound.loadPhases) },
    measurementLimits: 'Payload is not total GPU memory. JS heap excludes workers, native audio, GPU and browser. Sound phase bytes count inspected source buffers; categories may overlap and queue-idle is only an observed snapshot. Worker decoded caches and scratch are excluded. Desktop job limits do not emulate Xbox. Hardware is tester-reported.',
  };
}

/** Clipboard can be unavailable on a console; always leave selectable text. */
export function bindDiagnosticCopy(button: HTMLButtonElement, text: HTMLTextAreaElement, status: HTMLElement,
  read: () => unknown, clipboard: () => Pick<Clipboard, 'writeText'> | undefined = () => navigator.clipboard): void {
  button.onclick = async () => {
    text.hidden = false; text.value = JSON.stringify(read(), null, 2); text.focus(); text.select();
    try {
      const target = clipboard();
      if (!target) throw new Error('Clipboard unavailable');
      await target.writeText(text.value); status.textContent = 'Test diagnostics copied.';
    } catch { status.textContent = 'Select and copy the diagnostic text below.'; }
  };
}
