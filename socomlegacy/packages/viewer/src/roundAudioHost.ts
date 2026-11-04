import type { GameAudio } from './audio';
import type { DecidedWire, EscortLine, Team } from './net/protocol';
import { decidedReason, RoundAudio, type DecidedReason } from './roundAudio';
import type { BombCueKind, HostageCueKind, RoundCues } from './roundCues';

/**
 * The page's round audio (socomlegacy/docs/research/124 §6): `RoundAudio` bound to the page's `GameAudio` -- the slot's
 * music to `playMusic`, the result line to `playStream` -- on the page's clock, the cues following the map whose sound
 * data `GameAudio` holds (a new map's data replaces them, and the slot stops). `NetPage` calls the event methods as the
 * room's events arrive and `frame` once a frame (the controller's wiring: research 124 §9).
 */
export class RoundAudioHost {
  readonly round: RoundAudio;
  private cues: RoundCues | null = null;

  constructor(private readonly audio: Pick<GameAudio, 'playMusic' | 'playStream' | 'stopMusic' | 'roundCues'> & Partial<Pick<GameAudio,'stopTransient'>>,
              private readonly clock: () => number = () => performance.now() / 1000) {
    this.round = new RoundAudio({ music: (n) => audio.playMusic(n), voice: (n) => audio.playStream(n), stopMusic: () => audio.stopMusic() });
  }

  /** The map's cues, taken up when `GameAudio`'s data changes (after a `roundStart`, too: that round's intro follows). */
  private sync(): void {
    const c = this.audio.roundCues();
    if (c !== this.cues) { this.cues = c; this.round.setCues(c, this.clock()); }
  }

  /**
   * `GameAudio` took new sound data (the page calls this as `setData` returns): the cues are taken up now, so a late
   * intro's moment is compared with the data's arrival and not with the next frame (`LATE_STREAM_DATA_READING`).
   */
  dataChanged(): void { this.sync(); }
  /** `roundStart`: the local seat's side (null for a spectator) and whether the room respawns. */
  roundStart(team: Team | null, respawn: boolean): void { this.audio.stopTransient?.(); this.sync(); this.round.roundStart(team, respawn, this.clock()); }
  /** `eliminated` (classic): the winner, and the local seat's side (null for a spectator). */
  eliminated(winner: Team, team: Team | null): void { this.sync(); this.round.eliminated(winner, team, this.clock()); }
  /** `timeExpired` (respawn). */
  timeExpired(): void { this.sync(); this.round.timeExpired(this.clock()); }
  /**
   * XR-06 (research 214 s3): the bomb's cue, as `./bombPage` sees the room's `bomb` event change state -- `owner` the
   * bomb's side (`bomb_owner`), `team` the local seat's (null for a spectator), its lines to `post` (the HUD's
   * `postMessage`).
   */
  bomb(kind: BombCueKind, owner: Team, team: Team | null, post?: (text: string, scale: number) => void): void {
    this.sync();
    this.round.bomb(kind, owner, team, this.clock(), post);
  }
  /** HX-5 (research 239 s6): a hostage one-shot's cue, its lines to `post` (the HUD's `postMessage`). */
  hostage(kind: HostageCueKind, post?: (text: string, scale: number) => void): void {
    this.sync();
    this.round.hostage(kind, this.clock(), post);
  }
  /**
   * HX-5: `eliminated` with a hostage `reason` -- the script's branch for it; false when the map's cues have none. LATER
   * 125: `elimination`, a SEAL elimination on ESCORT (`start`'s line then `escort_success`'s).
   */
  decided(reason: DecidedReason, team: Team | null, post?: (text: string, scale: number) => void): boolean {
    this.sync();
    return this.round.decidedBy(reason, team, this.clock(), post);
  }
  /** LATER 131: the room's `escort` -- ESCORT's RescueN / EndRescueN steps for the VIP it names, VIPcheck's for the local team. */
  escort(kind: EscortLine, vip: string | null, team: Team | null, post?: (text: string, scale: number) => void): void {
    this.sync();
    this.round.escort(kind, vip, team, this.clock(), post);
  }
  /** LATER 155: a welcome into a decided hold (its `decided`): the round marked decided by it, nothing played. */
  markDecided(decided: DecidedWire, team: Team | null): void { this.sync(); this.round.markDecided(decidedReason(decided), team); }
  /** `roundOver`: the round closed; nothing of its own plays. */
  roundOver(): void { this.sync(); this.round.roundOver(this.clock()); }
  /** A close, an abandoned round. */
  reset(): void { this.audio.stopTransient?.(); this.round.reset(); }
  /** Once a frame: what is due plays. */
  frame(): void { this.sync(); this.round.frame(this.clock()); }
}
