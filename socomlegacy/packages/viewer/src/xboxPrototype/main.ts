import { PerspectiveCamera } from 'three';
import { prototypeAnimationClips } from './animationAssets';
import type { SourceRequest } from '../discSource';
import type { LoadedMap } from '../loadMap';
import type { PlayData } from '../motionTable';
import { viewerCommit, viewerRev, viewerBuiltAt } from '../revision';
import { prototypePose, PROTOTYPE_OMISSIONS } from './model';
import { sceneFrame, type SceneRenderer } from './sceneFrame';
import type { walkingRuntime } from './walkingRuntime';
import type { WebAudioOut } from '../audio';
import type { WalkingSound } from './sound';
import type { SoundData } from '../soundData';
import { typedModels, walkingAssets } from './runtimeAssets';
import { PROTOTYPE_BONE_LIMIT_ADAPTATION } from './model';
import type { PrototypeLobbyGame, PrototypeLobbyConnection } from './lobbySession';
import type { createPrototypeLobbySession } from './lobbySession';
import { prototypeAudioOptions, trackLoopPayload } from './audioResidency';
import { buildLabel, xboxBuildIdentity } from './buildIdentity';
import { bindDiagnosticCopy, diagnosticExport, readGraphicsIdentity, type GraphicsIdentity } from './diagnostics';
import { soundLoadHistory, soundPayload, soundQueueSample, type SoundLoadPhaseSample } from '../soundLoadProfile';
import { prepareTestroomVariant } from '../variants/testroomSwitch';   // DAY-3: `?variant=`, VARIANT_TESTROOM_ADAPTATION

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('view'), status = element('status'), reportNode = element('report');
const startButton = element<HTMLButtonElement>('start'), stopButton = element<HTMLButtonElement>('stop');
const query = new URLSearchParams(location.search);
const backend = query.get('backend') === 'current' ? 'current' : 'raw';
const walking = query.get('mode') === 'walk';
const profileSoundLoads = query.get('soundprofile') === '1';
const build = xboxBuildIdentity();
element('build').textContent = `${buildLabel(build, backend)} | ${walking ? 'walking' : 'fixed comparison'}`;
let graphics: GraphicsIdentity = { status: 'not-created', vendor: 'unknown', renderer: 'unknown' };
const stopAtFrame = query.get('capture') === '120' ? 120 : Infinity;
// Instrument adaptation: an allocation refusal threshold, not a claim about Xbox's browser allowance.
const payloadLimit = 96 * 1024 * 1024;
const report = { revision: viewerCommit(), buildRevision: viewerRev(), builtAt: viewerBuiltAt(), backend, mode: walking ? 'walk' : 'benchmark', map: '', dropped: '', resolution: [640, 448], frames: 0,
  build,
  movement: {} as object, sound: { stage: 'off', stats: {} as object,
    loopPayloadSample: null as ReturnType<ReturnType<typeof trackLoopPayload>['snapshot']> | null,
    loadPhases: [] as SoundLoadPhaseSample[] },
  stage: 'ready', failureStage: null as string | null, error: '', elapsedMs: 0, firstFrameMs: null as number | null,
  jsHeapPeakSampledBytes: null as number | null, renderCpuMsTotal: 0, renderCpuMsMax: 0,
  poseChanged: false, resources: {} as object, omissions: PROTOTYPE_OMISSIONS,
  comparisonLimits: 'Same decoded map and animation; feature subsets differ. No GPU completion timing. JS heap samples exclude workers, GPU and browser. Sound phases count inspected source buffers, not worker scratch/caches or native audio; categories may overlap. Queue-idle is an observed snapshot. No retail Xbox memory limit is simulated.' };
for (const omission of PROTOTYPE_OMISSIONS) { const li = document.createElement('li'); li.textContent = omission; element('omissions').append(li); }
let worker: Worker | null = null, rejectWorker: ((e: Error) => void) | null = null, stopped = false, raf = 0, started = 0;
let renderer: SceneRenderer | null = null;
let runtime: ReturnType<typeof walkingRuntime> | null = null, sound: WalkingSound | null = null, audioOut: WebAudioOut | null = null;
let loopPayload: ReturnType<typeof trackLoopPayload> | null = null;
let soundHistory: ReturnType<typeof soundLoadHistory> | null = null;
function recordSoundPhase(sample: unknown) {
  if (!soundHistory) return;
  soundHistory.record(sample); report.sound.loadPhases = soundHistory.snapshot();
}
let lobbySession: ReturnType<typeof createPrototypeLobbySession> | null = null;
let games: PrototypeLobbyGame[] = [], selectedGame: PrototypeLobbyGame | null = null;
const lobbyControls = element<HTMLFieldSetElement>('lobby-controls'), lobbyStatus = element('lobby-status');
const readyButton = element<HTMLButtonElement>('ready'), switchButton = element<HTMLButtonElement>('switch-team');
const findButton = element<HTMLButtonElement>('find-games'), joinButton = element<HTMLButtonElement>('join-game');
lobbyControls.disabled = !walking;
readyButton.onclick = () => { runtime?.ready(); publish(); };
switchButton.onclick = () => { runtime?.switchTeams(); publish(); };
const soundButton = element<HTMLButtonElement>('sound');
const publish = () => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (memory) report.jsHeapPeakSampledBytes = Math.max(report.jsHeapPeakSampledBytes ?? 0, memory.usedJSHeapSize);
  report.elapsedMs = started ? performance.now() - started : 0;
  const movement = runtime?.report();
  if (movement) report.movement = movement;
  const lobby = movement?.lobby;
  readyButton.disabled = !lobby?.canReady; switchButton.disabled = !lobby?.canSwitch;
  readyButton.textContent = lobby?.ready ? 'Not ready' : `Ready${lobby?.readyIn ? ` (${lobby.readyIn}s)` : ''}`;
  if (lobby) lobbyStatus.textContent = `${selectedGame?.name ?? 'Game'}: ${lobby.error || lobby.refused || (lobby.launched ? 'match launched' : 'lobby')} | ${lobby.seats.map(seat => `${seat.name} (${seat.team ?? 'spectator'}, ${seat.ready ? 'ready' : 'not ready'})`).join('; ')}`;
  if (sound) report.sound.stats = sound.audio.stats();
  if (loopPayload) report.sound.loopPayloadSample = loopPayload.snapshot();
  if (soundHistory && sound && report.sound.stage === 'ready' && !soundHistory.has('main-first-queues-idle')) {
    const queues = soundQueueSample(report.sound.stats);
    if (queues.decodePending === 0 && queues.jobsPending === 0) recordSoundPhase({ phase: 'main-first-queues-idle', atUnixMs: Date.now(),
      ...queues, loopBytes: loopPayload?.snapshot().currentSourceBytes });
  }
  status.textContent = `${backend}: ${report.stage}${report.error ? ` — ${report.error}` : ''}`;
  reportNode.textContent = JSON.stringify(report, null, 2);
};
bindDiagnosticCopy(element<HTMLButtonElement>('copy-diagnostics'), element<HTMLTextAreaElement>('diagnostics-text'),
  element('diagnostics-status'), () => {
    publish();
    return diagnosticExport(report, build, graphics, element<HTMLSelectElement>('tester-hardware').value);
  });
async function stop() {
  stopped = true; cancelAnimationFrame(raf); worker?.terminate(); worker = null;
  rejectWorker?.(new Error('Stopped')); rejectWorker = null;
  runtime?.dispose(); runtime = null; sound?.dispose(); sound = null; audioOut?.dispose(); audioOut = null;
  loopPayload = null;
  const session = lobbySession; lobbySession = null;
  // Close may await an in-flight sign-in/join; release graphics immediately.
  const logout = session?.close();
  lobbyControls.disabled = true; readyButton.disabled = true; switchButton.disabled = true;
  soundButton.disabled = true; soundButton.onclick = null;
  const owned = renderer; renderer = null; await owned?.dispose();
  canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  if (graphics.status === 'active') graphics.status = 'stopped';
  stopButton.disabled = true;
  await logout;
}
findButton.onclick = async () => {
  findButton.disabled = true; joinButton.disabled = true; stopButton.disabled = false;
  const password = element<HTMLInputElement>('player-password').value;
  element<HTMLInputElement>('player-password').value = '';
  try {
    await lobbySession?.close();
    if (stopped) return;
    const { createPrototypeLobbySession: createSession } = await import('./lobbySession');
    if (stopped) return;
    const session = createSession(location.origin); lobbySession = session;
    lobbyStatus.textContent = 'Signing in';
    await session.login(element<HTMLInputElement>('player-name').value.trim(), password, element<HTMLInputElement>('register-player').checked);
    games = await session.games(Number(element<HTMLInputElement>('channel').value));
    if (stopped) return;
    const select = element<HTMLSelectElement>('games'); select.replaceChildren();
    for (const game of games) select.add(new Option(`${game.name} — ${game.map} (${game.players} players)`, String(game.id)));
    select.disabled = games.length === 0; joinButton.disabled = games.length === 0;
    lobbyStatus.textContent = games.length ? 'Choose a game, then load it with your disc.' : 'No existing games in this briefing room.';
  } catch (error) {
    if (!stopped) lobbyStatus.textContent = error instanceof Error ? error.message : 'Sign-in failed';
    await lobbySession?.close(); lobbySession = null;
  } finally { findButton.disabled = stopped; }
};
joinButton.onclick = () => {
  selectedGame = games.find(game => game.id === Number(element<HTMLSelectElement>('games').value)) ?? null;
  if (!selectedGame || stopped || startButton.disabled) return;
  const select = element<HTMLSelectElement>('map');
  if (![...select.options].some(option => option.value === selectedGame!.map)) select.add(new Option(selectedGame.map, selectedGame.map));
  select.value = selectedGame.map;
  startButton.click();
};
function request<T>(message: object, terminal: 'map' | 'play' | 'soundLoops' | 'effects', interim?: (data: SoundData) => void,
  phase?: (sample: unknown) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const owned = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    let done = false;
    const finish = () => { done = true; owned.onmessage = null; owned.onerror = null; owned.onmessageerror = null;
      owned.terminate(); if (worker === owned) { worker = null; rejectWorker = null; } };
    worker = owned; rejectWorker = error => { finish(); reject(error); };
    owned.onerror = () => { finish(); reject(new Error('Asset worker failed')); };
    owned.onmessageerror = () => { finish(); reject(new Error('Asset worker message could not be read')); };
    owned.onmessage = ({ data }) => {
      if (done) return;
      try {
      if (data.kind === 'error') { finish(); reject(new Error(String(data.message ?? data.error ?? 'Asset read failed'))); }
      else if (data.kind === 'sound') interim?.(data.data as SoundData);
      else if (data.kind === 'soundPhase') phase?.(data.sample);
      else if (data.kind === terminal) { finish(); resolve((terminal === 'map' ? data.map : terminal === 'soundLoops' ? data.loops : data.data) as T); }
      } catch (error) { finish(); reject(error); }
    };
    try { owned.postMessage(message); } catch (error) { finish(); reject(error); }
  });
}
startButton.onclick = async () => {
  startButton.disabled = true; stopButton.disabled = false; started = performance.now();
  lobbyControls.disabled = true;
  try {
    report.stage = 'opening source'; publish();
    const file = element<HTMLInputElement>('disc').files?.[0];
    let source: SourceRequest;
    if (file) source = { kind: 'iso', file };
    // Experiment-only (`?served=1`): a tree served beside this page under /maps, for a device that cannot pick a file
    // and holds no stored disc on this origin (the console's diagnostic host on a private LAN server).
    else if (query.get('served') === '1') source = { kind: 'http', baseUrl: '/maps' };
    else {
      const { storedExtraction } = await import('../discExtractRecord');
      const kept = await storedExtraction();
      if (!kept) throw new Error('Choose a disc image or prepare a stored disc on this same site first');
      source = { kind: 'stored', identity: kept.identity };
    }
    if (stopped) return;
    report.map = element<HTMLSelectElement>('map').value;
    report.stage = 'decoding map'; publish();
    let map: LoadedMap | null = await request<LoadedMap>({ kind: 'load', id: 1, source, path: `RUN/${report.map}.ZDB` }, 'map');
    // DAY-3 (VARIANT_TESTROOM_ADAPTATION, a development instrument): `?variant=day|night`, its profile awaited first (DAY-3b).
    const variant = await prepareTestroomVariant(location.search, map, { online: walking && (!!selectedGame || !!element<HTMLInputElement>('server').value.trim()) });
    if (variant) { map = variant.map; Object.assign(report, { variant: variant.line }); report.stage = variant.line; publish(); }
    if (!map.body) throw new Error('Map contains no player body');
    report.stage = 'decoding animation'; publish();
    const play = await request<PlayData | null>({ kind: 'play', id: 2, source, clips: prototypeAnimationClips(walking) }, 'play');
    if (!play?.clips.length) throw new Error('Animation data unavailable');
    const pose = prototypePose(map.body, play); pose.step(0);
    // Experiment-only (`?types=0`): the two base bodies alone, for a before-and-after measure of the character types.
    const typed = walking && query.get('types') !== '0' ? typedModels(map, PROTOTYPE_BONE_LIMIT_ADAPTATION) : null;
    const models = typed ? typed.models : walking && map.terrorist ? [map.body, map.terrorist] : [map.body];
    let firstPose = pose.palette.slice();
    const at = map.body.at?.position ?? map.origin;
    // Fixed inspection camera is a test adaptation, deliberately identical in both paths.
    const camera = new PerspectiveCamera(55, 640 / 448, map.camera?.nearPlane ?? 1, map.camera?.farPlane ?? 10000);
    const height = map.body.height;
    camera.position.set(at[0] + height, at[1] + height, at[2] + height * 2);
    camera.lookAt(at[0], at[1] + height * 0.5, at[2]); camera.updateMatrixWorld();
    report.stage = 'building renderer'; publish();
    const built = backend === 'raw'
      ? await (await import('./raw')).rawPrototype(canvas, map, models, payloadLimit, walking ? Object.keys(map.weapons ?? {}) : [], walking)
      : await (await import('./reference')).referencePrototype(canvas, map, models, walking);
    if (stopped) { await built.dispose(); return; }
    renderer = built; report.resources = built.stats; graphics = readGraphicsIdentity(canvas);
    const renderFrame = sceneFrame(camera, map.body, pose, map.origin);
    const archive = map.archive;
    if (walking) {
      const [{ walkingRuntime: mountWalking }, { GameAudio, WebAudioOut }, { walkingSound }] = await Promise.all([
        import('./walkingRuntime'), import('../audio'), import('./sound')]);
      if (stopped) return;
      const url = element<HTMLInputElement>('server').value.trim();
      let gameConnection: PrototypeLobbyConnection | undefined;
      if (selectedGame) {
        if (!lobbySession) throw new Error('Sign in before joining a game');
        report.stage = 'joining game lobby'; publish();
        gameConnection = await lobbySession.join(selectedGame.id, report.map);
        if (stopped) return;
      }
      const assets = walkingAssets(map, models, typed?.types);
      // Experiment-only (`?effects=0`): the match without its effects, for a before-and-after measure.
      const effectData = query.get('effects') === '0' ? null
        : await request<import('../effectData').EffectData>({ kind: 'effects', id: 4, source, path: `RUN/${report.map}.ZDB`, archive }, 'effects');
      if (stopped) return;
      runtime = mountWalking(canvas, assets.map, play, assets.models,
        gameConnection ?? (url ? { url, map: report.map, name: 'Renderer test' } : undefined), built.hud, effectData,
        { without: { menus: query.get('menus') === '0', talk: query.get('talk') === '0', voice: query.get('voice') === '0', voiceHud: query.get('voicehud') === '0', voicePermission: query.get('voiceperm') === '0' } });
      soundButton.disabled = false;
      soundButton.onclick = async () => {
        if (stopped) return;
        if (audioOut) { audioOut.unlock(); return; }
        try {
        soundHistory = profileSoundLoads ? soundLoadHistory() : null; report.sound.loadPhases = [];
        audioOut = new WebAudioOut(null, prototypeAudioOptions(backend)); audioOut.unlock(); // Resume in the gesture, before any worker await.
        const game = new GameAudio(audioOut, undefined, { inline: false });
        sound = walkingSound(game, runtime!.walk, runtime!.fly);
        runtime!.setSound(sound); report.sound.stage = 'loading'; publish();
          const loops = await request<Parameters<WalkingSound['setLoops']>[0]>(
            { kind: 'sound', id: 3, source, path: `RUN/${report.map}.ZDB`, archive, ...(profileSoundLoads ? { profileSound: true } : {}) },
            'soundLoops', data => {
              sound?.setData(data);
              if (soundHistory) recordSoundPhase({ phase: 'main-data-installed', atUnixMs: Date.now(), ...soundPayload(data), ...soundQueueSample(game.stats()) });
            }, profileSoundLoads ? recordSoundPhase : undefined);
          if (stopped) return;
          loopPayload = trackLoopPayload(loops);
          if (soundHistory) recordSoundPhase({ phase: 'main-loops-received', atUnixMs: Date.now(), loopBytes: loopPayload.snapshot().loadedSourceBytes, ...soundQueueSample(game.stats()) });
          sound!.setLoops(loops); game.endLoad();
          if (soundHistory) recordSoundPhase({ phase: 'main-loops-installed', atUnixMs: Date.now(), loopBytes: loopPayload.snapshot().currentSourceBytes, ...soundQueueSample(game.stats()) });
          report.sound.stage = 'ready'; publish();
        } catch (error) {
          if (stopped) return;
          runtime?.setSound(null); sound?.dispose(); sound = null; audioOut?.dispose(); audioOut = null;
          loopPayload = null;
          report.sound.stage = `failed: ${error instanceof Error ? error.message : String(error)}`; publish();
        }
      };
    }
    // Reference backend keeps its own asset ownership; raw has uploaded everything.
    // Clear this setup scope explicitly before the long-lived frame/audio callbacks.
    map = null;
    let last = performance.now();
    // Experiment-only (`?fps=30`): frames drawn no faster than this; unset, every animation frame (as before).
    const frameCap = Number(query.get('fps')) || 0;
    let dropVoiceAt = Number(query.get('dropvoice')) || 0, dropTalkAt = Number(query.get('droptalk')) || 0;
    const frame = () => {
      if (stopped) return;
      if (frameCap > 0 && performance.now() - last < 1000 / frameCap - 2) { raf = requestAnimationFrame(frame); return; }
      // A live walk waits on the GPU's last frame (`./raw` ready); a counted capture draws every frame.
      if (walking && 'ready' in built && !built.ready()) { raf = requestAnimationFrame(frame); return; }
      try {
        const now = performance.now(), real = (now - last) / 1000, dt = Math.min(real, 0.1); last = now;
        if (!walking) pose.step(1 / 60);
        // Experiment-only (`?dropvoice=N`, `?droptalk=N`): the part let go N seconds into the run, for a measure within one match.
        if (dropVoiceAt > 0 && now - started > dropVoiceAt * 1000) { dropVoiceAt = 0; runtime?.dropVoice(); report.dropped = 'voice@' + report.frames; }
        if (dropTalkAt > 0 && now - started > dropTalkAt * 1000) { dropTalkAt = 0; runtime?.dropTalk(); report.dropped = 'talk@' + report.frames; }
        const current = runtime?.step(dt, now, real) ?? renderFrame;
        current.realDeltaSeconds = report.frames === 0 ? 0 : real;
        if (report.frames === 0 && walking) firstPose = current.body.palette.slice();
        if (!report.poseChanged) report.poseChanged = current.body.palette.some((value, i) => Math.abs(value - firstPose[i]!) > 0.00001);
        const before = performance.now(); built.render(current); const duration = performance.now() - before;
        report.renderCpuMsTotal += duration; report.renderCpuMsMax = Math.max(report.renderCpuMsMax, duration);
        report.frames++;
        if (report.firstFrameMs === null) { report.firstFrameMs = performance.now() - started; runtime?.loaded(); }
        report.stage = 'rendering';
        if (report.frames === stopAtFrame) { report.stage = 'capture ready'; publish(); return; }
        if (report.frames === 1 || report.frames % 30 === 0) publish();
        raf = requestAnimationFrame(frame);
      } catch (error) { void fail(error); }
    };
    raf = requestAnimationFrame(frame);
  } catch (error) { if (!stopped) await fail(error); }
};
async function fail(error: unknown) {
  if (report.stage !== 'failed') report.failureStage = report.stage;
  report.stage = 'failed'; report.error = error instanceof Error ? error.message : String(error); publish(); await stop();
}
canvas.addEventListener('webglcontextlost', () => { if (!stopped) { graphics.status = 'lost'; void fail(new Error('WebGL context lost')); } });
stopButton.onclick = async () => { await stop(); report.stage = 'stopped; reload for a fresh run'; publish(); };
window.addEventListener('pagehide', () => { void stop(); });
// Explicit read-only test snapshot; no disc contents or personal paths.
Object.assign(window, { xboxPrototypeReport: () => structuredClone(report),
  xboxPrototypeMotion: () => runtime?.motion() ?? null });
publish();
