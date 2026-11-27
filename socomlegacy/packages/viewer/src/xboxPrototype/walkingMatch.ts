import type { FlyCamera } from '../camera';
import type { Input } from '../gamepad';
import type { NetClient } from '../net/client';
import { RESPAWN_FADE_S, RESPAWN_PROMPT_S } from '../net/deaths';
import { BodyFlag, JOIN_STATE_VERSION, STANCE_CODES, TICK_HZ, type Rules, type ScoreRow, type ServerEvent, type Team } from '../net/protocol';
import { eliminationLines } from '../net/rules';
import { rootY } from '../mover';
import { GAME_ASPECT, INIT_AIM_PITCH, PlayerCamera } from '../playerCamera';
import { respawnHelpLines } from '../respawnPrompt';
import { ENGINE_READ_S, roundScreenAt, roundScreensElapsed, type RoundPresentation } from '../roundPresentation';
import { cameraEye, SpectatorView, type SpectatorKey } from '../spectatorView';
import type { WalkMode } from '../walk';
import type { PrototypeHud } from './sceneFrame';
import type { WalkingSound } from './sound';
import type { PlayClips } from '../play';
import { deathPose, flinchPose } from '../motionPose';
import { flinchCutWindow, type FlinchWindow } from '../net/flinchReload';
import { killFeedLine, killFeedSubject } from '../killFeed';
import { botDisplayName, plainBotText } from '../botPresentation';
import { MESSAGE_SCALE } from '../hudLayout';

export interface WalkingMatchDeps {
  client(): Pick<NetClient, 'id' | 'role' | 'team' | 'state' | 'bodies' | 'roomSecondsDead' | 'replayed' | 'healthOf'> | null;
  walk: Pick<WalkMode, 'mode' | 'isDead' | 'setDead' | 'setMode' | 'resumeBody' | 'gridOfGround' | 'queueRespawnAction' | 'setDeathKiller' | 'setDeathPose' | 'setFlinchPose' | 'pushHeard'>;
  fly: Pick<FlyCamera, 'camera' | 'setPose' | 'setMagnification' | 'aspect'>;
  hud?: Pick<PrototypeHud, 'setSpectator' | 'setRoundScreen' | 'startRound' | 'postMessage'>;
  ownCorpseExpired(): boolean;
  rootOf(id: number): number | null;
  clips?(): PlayClips | null;
  flinch?(window: FlinchWindow): void;
  now?(): number;
}

/** Experimental renderer adapter for the existing room events, SpectatorView,
 * PlayerCamera, RoundAudioHost and HUD. Rules, delays and camera math stay with
 * their shared owners. It does not load another scene or resume a combat seat. */
export function walkingMatch(p: WalkingMatchDeps) {
  const now = p.now ?? (() => performance.now()), joinedAt = now();
  const teams = new Map<number, Team>(), names = new Map<number, string>(), hostages = new Set<number>();
  /** XBOX-TAGS-FEED: the seats the room names bots (`../netPage` `seatBot`: welcome, joined, spawn and score rows). */
  const bots = new Set<number>();
  const seatBot = (id: number, bot?: true) => { if (bot === true) bots.add(id); else bots.delete(id); };
  /** `../netPage` `nameOf` / `displayNameOf`: a seat's name, `Player<id>` unknown, a bot's marker kept. */
  const nameOf = (id: number) => names.get(id) ?? `Player${id}`;
  const displayNameOf = (id: number) => botDisplayName(nameOf(id), bots.has(id));
  /** `../netPage` `sideOf`: the score rows' side, else the room's roster. */
  const sideOf = (id: number): Team | null => rows.find(row => row.id === id)?.team ?? teams.get(id) ?? null;
  let rules: Rules = 'classic', rounds = 0, waiting = true, ghost = false, clockKnown = false;
  let dead: { at: number; atLoad: boolean; help: boolean } | null = null;
  let rows: ScoreRow[] = [], screens: RoundPresentation | null = null, sound: WalkingSound | null = null;
  let lastAction = false, following: { id: number; grid: ReturnType<WalkMode['gridOfGround']>; camera: PlayerCamera } | null = null;
  const localTeam = () => p.client()?.role === 'player' ? p.client()!.team : null;
  const resetFollow = () => { following = null; };
  const spectator = new SpectatorView({
    bodies: () => p.client()?.bodies() ?? [],
    seat: () => ({ role: p.client()?.role ?? 'player', self: p.client()?.id ?? null, team: localTeam(), teams, rules, ghost }),
    spectate: pose => { resetFollow(); if (pose) p.fly.setPose(pose); },
    resetFollow,
    leaveSelf: () => { p.walk.setMode('fly'); },
    returnSelf: () => { p.walk.resumeBody(); },
    escortee: id => hostages.has(id),
    magnify: value => p.fly.setMagnification(value),
    follow: (body, dt, ease) => {
      // Same collision and eased dead-teammate camera as matchNet.spectateFollow.
      const grid = p.walk.gridOfGround();
      if (!following || following.id !== body.id || following.grid !== grid) following = { id: body.id, grid, camera: new PlayerCamera(grid) };
      const camera = following.camera;
      camera.ease = ease === true; camera.nearAspect = p.fly.aspect() ?? GAME_ASPECT; camera.peek = body.peek ?? 0;
      const posed = p.rootOf(body.id), traversal = body.travRootY;
      const root = posed ?? (traversal !== undefined && Number.isFinite(traversal) ? traversal : rootY(STANCE_CODES[body.stance ?? 0] ?? 'stand'));
      camera.tick(body.feet, body.yaw, body.pitch ?? INIT_AIM_PITCH, root, Math.max(0, dt), posed !== null);
      const view = camera.view(1), dx = view.target[0] - view.eye[0], dy = view.target[1] - view.eye[1], dz = view.target[2] - view.eye[2];
      p.fly.setPose({ x: view.eye[0], y: view.eye[1], z: view.eye[2],
        yaw: Math.atan2(-dx, -dz) * 180 / Math.PI, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI });
    },
  });
  const screenAt = (at: number) => roundScreenAt(screens, roundScreensElapsed(screens, at), rows, p.client()?.id ?? -1, (at - joinedAt) / 1000);
  const post = (text: string, scale?: number) => p.hud?.postMessage(text, scale);
  const clearDeath = () => { dead = null; ghost = false; spectator.reset(); p.walk.setDeathPose(null); p.hud?.setSpectator(null); };
  const benchGhost = () => { ghost = true; spectator.bench(); p.walk.setDead(true); };
  const banner = (round: number) => {
    const code = localTeam() === 'seal' ? 0 : localTeam() === 'terrorist' ? 8 : 16;
    const objective: { text: string; scale: number; waitBefore: number }[] = [];
    let carried = 0;
    for (const line of sound?.audio.roundCues()?.objective?.[code] ?? []) {
      if (line.text === null) { carried += line.waitBefore; continue; }
      objective.push({ text: line.text, scale: line.scale, waitBefore: carried + line.waitBefore }); carried = 0;
    }
    p.hud?.startRound({ round, rounds, objective });
  };
  // Same controller ownership as NetPage.respawnInputActive, before the help/
  // eligibility checks. The world action pressure must not chase this route.
  const respawnInputActive = () => rules === 'respawn' && dead !== null && p.client()?.role === 'player'
    && !ghost && !spectator.benched && spectator.watching === null;
  const respawnReady = () => {
    const c = p.client();
    if (rules !== 'respawn' || !dead?.help || ghost || spectator.benched || spectator.watching !== null || c?.role !== 'player'
      || c.state !== 'open' || p.walk.mode() !== 'walk' || !p.walk.isDead() || (now() - dead.at) / 1000 <= RESPAWN_PROMPT_S
      || (!dead.atLoad && !p.ownCorpseExpired()) || screenAt(now())) return false;
    const seconds = c.roomSecondsDead();
    return seconds === null || (dead.atLoad ? seconds > RESPAWN_PROMPT_S : seconds >= Math.max(RESPAWN_PROMPT_S, RESPAWN_FADE_S));
  };
  return {
    setSound(next: WalkingSound | null) { sound = next; sound?.screen(!!screenAt(now())); },
    /** XBOX-TAGS-FEED: the names and bot marks the standard tag input reads (`../hudTags` `TeamTagPage`). */
    nameOf, isBot: (id: number) => bots.has(id),
    rules: () => rules, waiting: () => waiting, ghost: () => ghost || dead?.atLoad === true,
    camera: () => spectator.benched || p.client()?.role === 'spectator',
    following: () => spectator.watching !== null,
    screenUp: () => !!screenAt(now()), respawnReady, respawnInputActive,
    event(event: ServerEvent, at = now()) {
      const self = p.client()?.id;
      if (event.type === 'welcome') {
        teams.clear(); names.clear(); hostages.clear(); bots.clear(); rows = []; screens = null; clockKnown = false; clearDeath();
        names.set(event.id, event.name);   // `../netPage`: the page's own seat named too, for its kill lines
        rules = event.rules; rounds = event.rounds; waiting = event.waiting === true || event.phase === 'waiting' || event.phase === 'loading';
        for (const player of event.players) { teams.set(player.id, player.team); names.set(player.id, player.name); seatBot(player.id, player.bot); }
        for (const hostage of event.hostages ?? []) hostages.add(hostage.id);
        if (event.ghost) benchGhost();
        if (!event.resumed && !waiting) banner(event.round);
        if (event.join?.v === JOIN_STATE_VERSION && event.join.result) {
          const result = event.join.result;
          screens = { ...result, list: result.screens, start: Math.max(at - (event.tick - result.at) / TICK_HZ * 1000, joinedAt - ENGINE_READ_S * 1000) };
        }
        if (event.decided) sound?.roundAudio.markDecided(event.decided, localTeam());
      } else if (event.type === 'joined') { teams.set(event.id, event.team); names.set(event.id, event.name); seatBot(event.id, event.bot); }
      // `../netPage` `case 'left'`: the name is kept, so a later kill line still names a seat that left.
      else if (event.type === 'left') { teams.delete(event.id); bots.delete(event.id); }
      else if (event.type === 'renamed') names.set(event.id, event.name);
      else if (event.type === 'score') { for (const row of event.rows) seatBot(row.id, row.bot); rows = event.rows; if (event.timeLeft !== null) clockKnown = true; }
      if (event.type === 'spawn') seatBot(event.id, event.bot);
      if (event.type === 'kill' && event.victimKind !== 'hostage') {
        // XBOX-TAGS-FEED (OT.R148): the standard engine's kill-feed post (`../netPage` `case 'kill'`, WM-DATA-FEED look
        // 3B2, a browser adaptation): `killFeedLine` over the same names, sides and subject mark. A hostage's kill posts none.
        const kept = (event as { killerName?: unknown }).killerName;
        const killerName = event.killer === null ? plainBotText(typeof kept === 'string' ? kept : '') || null : displayNameOf(event.killer);
        const side = (id: number): Team | null => id === self ? localTeam() : sideOf(id);
        const subject = killFeedSubject(event.how, event.killer, event.victim), bound = spectator.boundId();
        const marked = subject !== null && (subject === self || subject === bound);
        p.hud?.postMessage([killFeedLine(event.how, killerName === null ? null : { name: killerName, side: event.killer === null ? null : side(event.killer) },
          { name: displayNameOf(event.victim), side: side(event.victim) }, event.weapon, marked, MESSAGE_SCALE)]);
      }
      if (event.type === 'kill' && event.victim === self) {
        dead = { at, atLoad: false, help: true };
        const clip = event.clip;
        p.walk.setDeathPose(clip ? () => deathPose(clip, (now() - at) / 1000, p.clips?.() ?? null) : null);
        if (rules === 'classic') spectator.bench();
        const killer = event.killer;
        p.walk.setDeathKiller(killer !== null && killer !== self ? () => {
          const body = p.client()?.bodies().find(b => b.id === killer);
          return body ? [...body.feet] : null;
        } : null);
      } else if (event.type === 'deadAtLoad' && event.id === self) {
        spectator.reset(); ghost = false;
        dead = { at: at - Math.max(0, event.age ?? 0) / TICK_HZ * 1000, atLoad: true, help: true };
        p.walk.setDeathPose(null); p.walk.setDeathKiller(null); p.walk.resumeBody();
      } else if (event.type === 'spawn' && event.id === self) clearDeath();
      else if (event.type === 'flinch' && event.id === self && !dead) {
        let started = at;
        const pose = Object.assign(() => flinchPose(event.clip, (now() - started) / 1000, p.clips?.() ?? null),
          { at: (seconds: number) => { started = now() - seconds * 1000; } });
        const cut = p.walk.setFlinchPose(pose, flinchCutWindow(event, event.clip, p.clips?.() ?? null)) ?? null;
        p.flinch?.(cut === null ? event : { from: event.from, until: cut });
      } else if (event.type === 'motion' && event.id === self && !dead) {
        const cut = flinchCutWindow(event, event.clip, p.clips?.() ?? null);
        p.walk.setFlinchPose(() => flinchPose(event.clip, (now() - at) / 1000, p.clips?.() ?? null), cut, { reloadGate: false, pushed: true, clip: event.clip });
        p.walk.pushHeard(cut, after => p.client()?.replayed(after));
      }
      else if (event.type === 'roundStart') {
        screens = null; sound?.screen(false); rounds = event.rounds; waiting = false; clockKnown = true; spectator.reset(); ghost = false;
        // The spawn still owns body/kit revival; clearing dead here would admit
        // input before a delayed or refused spawn (NetPage's RSP-6 rule).
        if (dead && rules === 'respawn') dead.help = false;
        if (event.ghosts?.includes(self ?? -1)) benchGhost();
        banner(event.round); sound?.roundAudio.roundStart(localTeam(), rules === 'respawn');
      } else if (event.type === 'roundOver') {
        screens = { start: at, list: event.screens, winner: event.winner, wins: event.wins, stats: event.stats };
        sound?.roundAudio.roundOver();
      } else if (event.type === 'abandoned') {
        screens = null; waiting = true; clockKnown = false; clearDeath(); sound?.roundAudio.reset();
      } else if (event.type === 'eliminated') {
        const reason = event.reason === 'rescue' || event.reason === 'hostageKills' ? event.reason
          : event.winner === 'seal' ? 'elimination' : 'terroristElimination';
        if (!sound?.roundAudio.decided(reason, localTeam(), post)) { p.hud?.postMessage(eliminationLines(event.winner)); sound?.roundAudio.eliminated(event.winner, localTeam()); }
      } else if (event.type === 'timedOut') {
        if (!sound?.roundAudio.decided('timeout', localTeam(), post)) sound?.roundAudio.roundOver();
      } else if (event.type === 'timeExpired') sound?.roundAudio.timeExpired();
      else if (event.type === 'escort') sound?.roundAudio.escort(event.kind, event.vip ?? null, localTeam(), post);
    },
    input(input: Input, blocked: boolean) {
      spectator.pad(input, blocked);
      if (input.action && !lastAction && !blocked && respawnReady()) p.walk.queueRespawnAction();
      lastAction = input.action;
    },
    key(event: SpectatorKey, blocked: boolean) {
      if (!blocked && event.type === 'keydown' && event.code === 'KeyX' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && respawnReady()) {
        if (p.walk.queueRespawnAction()) { event.preventDefault(); return true; }
      }
      return spectator.key(event, blocked);
    },
    frame(dt: number, at = now()) {
      const screen = screenAt(at); p.hud?.setRoundScreen(screen); sound?.screen(!!screen);
      p.fly.camera.updateMatrixWorld(); spectator.frame(cameraEye(p.fly.camera), dt);
      const watched = spectator.watching;
      // A dead view draws independently of setVisible. Preserve the walking
      // HUD's unknown-clock guard so a load death never exposes fixture values.
      if (!clockKnown && !screen) p.hud?.setSpectator(null);
      else if (watched !== null) {
        const body = p.client()?.bodies().find(b => b.id === watched);
        p.hud?.setSpectator({ path: 'teammate', followed: { name: names.get(watched) ?? `Player${watched}`, health: p.client()?.healthOf(watched) ?? null },
          stats: null, help: [], ...(!body || !(body.flags & BodyFlag.Alive) ? { watchedDead: true } : {}) });
      } else if (dead || ghost) p.hud?.setSpectator({ path: 'own', followed: null, stats: null,
        help: rules === 'respawn' ? respawnHelpLines('pad', respawnReady()).map((line, index) => index === 1 ? line : '') : [], respawnReady: respawnReady() });
      else p.hud?.setSpectator(null);
    },
    report() { return { rules, waiting, ghost, dead: dead !== null, watching: spectator.watching, benched: spectator.benched,
      screen: screenAt(now())?.kind ?? null, respawnReady: respawnReady() }; },
    dispose() { sound?.roundAudio.reset(); sound = null; teams.clear(); names.clear(); hostages.clear(); bots.clear(); rows = []; screens = null;
      clearDeath(); p.walk.setDeathKiller(null); p.hud?.setRoundScreen(null); },
  };
}
