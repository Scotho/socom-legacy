import { heldInviteAddress } from './inviteAddressHold';
import { lobbyInviteOf, uiCommandFold } from '@s2u/ui';
import type { WebAudioOut } from './audio';
import { deployPanelHtml, deploySteps } from './console/deployPanel';
import { routeSegmentsOfPath } from './menuRoutes';

/**
 * LOAD_IN_COVER_ADAPTATION -- WM-37, the direct link's load-in (the owner, 2026-11-15, verbatim: "12 b approved on
 * both"; MEGA-MOCK call 12B, the look prototype at `agent/spc-mega-mock-launch` d16e9705b4, built for real with no look
 * switch; a BROWSER ADAPTATION, product track: the console had no links). The owner's ask (call 12): the black wall with
 * white text replaced by a polished load-in following the launcher's conventions, and "the sounds happening in the
 * background are a bit jarring too".
 *
 * OT.R121's cover (`./lobbyLinkCover`) -- the same element, shown and taken away at the same moments by `./frontEnd` --
 * draws the launcher's DEPLOYING panel (`./console/deployPanel`), and the launcher's own hand-over
 * (`./console/render/overlay` `launchHtml`) draws its first stage on a lobby link's address, so the two read as one
 * sequence of four stages:
 *
 *   1 Disc    -- the launcher reads the disc kept in this browser and hands over (its DEPLOYING screen);
 *   2 Load    -- the front end boots under the cover, its screen not yet on the login path (the boot's screens, and
 *                `dlgMPswitch.rdr`, the path's first, where the boot hands to the login screens): the game's own files
 *                read. No map loads before the lobby on a direct link (it loads after both sides READY, on the disc's
 *                own loading screen, which nothing here draws over);
 *   3 Connect -- the hidden login path and the join (`./lobbyLinkDirect`'s screens): LOGIN, DNAS, the universe, the
 *                persona, CONNECTING, the agreement, SOCOM II ONLINE, the briefing room;
 *   4 Lobby   -- the GAME LOBBY built: the cover's last frame, then it fades out over the lobby, which is the game's own.
 *
 * Sound: the panel plays nothing, and while the cover stands the front end's output is held SILENT by its level
 * (`LoadInHold`) -- the hidden path's button sounds and the menus' music are not heard -- until the cover goes. Nothing
 * of the game changes: the presses, requests, screens and every sound's start time under the cover are today's.
 */
export const LOAD_IN_COVER_ADAPTATION = "a lobby link's load-in draws the launcher's DEPLOYING panel over the hidden path in four stages (Disc, Load, Connect, Lobby) and holds the front end's output at level 0 while the cover stands, its clock running" as const;

export type LoadInStage = 'disc' | 'load' | 'connect' | 'lobby';
/** The four stages in order: the step's label and the status line. A browser adaptation's own words. */
export const LOAD_IN_STAGES: readonly { key: LoadInStage; label: string; line: string }[] = [
  { key: 'disc', label: 'Disc', line: 'Reading your disc' },
  { key: 'load', label: 'Load', line: 'Loading the game' },
  { key: 'connect', label: 'Connect', line: 'Connecting to your game' },
  { key: 'lobby', label: 'Lobby', line: 'Into the game lobby' },
];

/**
 * The hidden path in its order: `./lobbyLinkDirect.ts`'s own `PATH` (module-private there; `../test/loadIn.test.ts`
 * reads that file and holds this copy to it).
 */
export const LOAD_IN_HIDDEN_PATH = [
  'dlgMPswitch.rdr', 'dlgNetLogin.rdr', 'dlgNetAuthenticate.rdr', 'dlgNetServerSelect.rdr', 'dlgNetPlayerName.rdr',
  'dlgNetConnect.rdr', 'dlgUsagePolicy.rdr', 'dlgWorldOfSOCOM.rdr', 'dlgMPBriefingRoom.rdr',
] as const;
const FOLDED_PATH = LOAD_IN_HIDDEN_PATH.map(uiCommandFold);
const FOLDED_LOBBY = uiCommandFold('dlgGameLobby.rdr');

/** Where the load-in stands: its stage and the bar's share (the look's own pacing, not a measured progress). */
export interface LoadInAt { stage: LoadInStage; share: number }
/** The launcher's hand-over: the disc. */
export const LOAD_IN_DISC: LoadInAt = { stage: 'disc', share: 0.12 };
/** The front end booting under the cover, before its login screens. */
const LOAD_IN_BOOT: LoadInAt = { stage: 'load', share: 0.28 };
/** The Connect stage's span of the bar: from its start, over the path's screens after the boot's hand-off. */
const CONNECT_FROM = 0.36;
const CONNECT_SPAN = 0.56;

/** The stage a hidden screen is on: the GAME LOBBY Lobby at 1; a login-path screen Connect; anything else (none yet, the boot) Load. */
export function loadInAt(dialog: string | null): LoadInAt {
  if (dialog === null) return LOAD_IN_BOOT;
  const d = uiCommandFold(dialog);
  if (d === FOLDED_LOBBY) return { stage: 'lobby', share: 1 };
  const i = FOLDED_PATH.indexOf(d);
  if (i < 1) return LOAD_IN_BOOT;                                  // off the path, or `dlgMPswitch.rdr`: the boot's
  return { stage: 'connect', share: CONNECT_FROM + (CONNECT_SPAN * i) / (FOLDED_PATH.length - 1) };
}

/** The foot line of the direct link's load-in. A browser adaptation's own words. */
export const LOAD_IN_FOOT = "The game opens at your game's lobby by itself. Nothing to press.";

/** The cover's fade at the hand-off (ms): `./lobbyLinkCover.css`'s `lobby-link-cover-out`, `--s2u-dur-lx-slide`'s 450 ms. */
export const LOAD_IN_LEAVE_MS = 450;

const stageIndex = (s: LoadInStage): number => LOAD_IN_STAGES.findIndex((x) => x.key === s);

/** What a caller adds to the panel (the hand-over's head, foot class and Back; the cover adds nothing). */
export type LoadInPanelExtra = { enter?: boolean; titleId?: string; close?: string; headClass?: string; footClass?: string; after?: string; foot?: string };

/** The direct link's panel at `at` (`./console/deployPanel`): "Direct link · n of 4", DEPLOYING, the stage's line, the steps. */
export function loadInPanelHtml(at: LoadInAt, extra: LoadInPanelExtra = {}): string {
  const n = stageIndex(at.stage);
  return deployPanelHtml({
    kicker: `Direct link · ${n + 1} of ${LOAD_IN_STAGES.length}`, title: 'DEPLOYING', share: at.share, line: `${LOAD_IN_STAGES[n]!.line}…`,
    steps: deploySteps(LOAD_IN_STAGES.map((s) => s.label), n), foot: LOAD_IN_FOOT, ...extra,
  });
}

/**
 * Whether `pathname` (under `base`) is a lobby link's address, `/online/lobby/<id>` (`@s2u/ui` `lobbyInviteOf`) -- or,
 * while Streamer mode holds an invite (`./inviteAddressHold`), whether the held address is: `pathname` is then not read
 * (the one caller passes the live address, which the hold bared).
 */
export function loadInLobbyLinkAt(pathname: string, base: string): boolean {
  // STREAMER-P1 1b (`./inviteAddressHold`): a lobby link held while Streamer mode bared the address still counts.
  const held = heldInviteAddress();
  return lobbyInviteOf(routeSegmentsOfPath(held ? held.pathname : pathname, base)) !== null;
}

/**
 * The silence while the cover stands -- held by LEVEL, never by the clock (the controller's condition: the hold must not
 * change WHEN the game's own first sound plays once the cover is gone). The context is never suspended: a suspended
 * context's clock stops, so sounds asked meanwhile would queue and burst at the resume and anything scheduled by context
 * time would shift; a resume is asynchronous; and the page resumes its context on any gesture or pad frame (`./audio`
 * `PageAudioOutput.resumeIfAllowed`), so the hold would not hold.
 *
 * The node held: the front end's `WebAudioOut` master -- through which its menu sounds (`GameAudio` over it), the menus'
 * music (`./menuMusic` `frontEndMusicOut`) and the movies' PCM (`./frontEndMovies` `frontEndMovieOut`) all reach the
 * destination. Its own gain is the player's level (`setGain`, the OPTIONS masters), so it is never written here: a gate
 * of gain 0 is put between it and the destination while held, and at `release` the master feeds the destination
 * straight again and the gate is let go -- the graph as it was, the player's level whatever it is then (a change made
 * meanwhile kept). Every source starts when it was asked, inaudibly; nothing is queued, nothing replays at the reveal.
 * `WebAudioOut` keeps its context and master private and `./audio.ts` is a hot file this task does not claim: they are
 * read here by name, as `./frontEndMovies` `webAudioOutContext` reads them (the getter it names as owed by `audio.ts`).
 */
export class LoadInHold {
  private held: { out: WebAudioOut; ctx: AudioContext; master: GainNode; gate: GainNode } | null = null;
  private released = false;

  /** Holds `out` silent (once; again only if its master was made anew). False: nothing to hold yet, or released. */
  hold(out: WebAudioOut | null | undefined): boolean {
    if (this.released || !out) return false;
    const o = out as unknown as { ctx?: AudioContext | null; master?: GainNode | null };
    const ctx = o.ctx ?? null, master = o.master ?? null;
    if (!ctx || !master) return false;                              // no output made yet: held at a later frame
    if (this.held?.master === master) return true;
    this.restore();
    try { master.disconnect(ctx.destination); } catch { return false; }   // not fed straight: not ours to rewire
    const gate = ctx.createGain();
    gate.gain.value = 0;
    gate.connect(ctx.destination);
    master.connect(gate);
    this.held = { out, ctx, master, gate };
    return true;
  }

  /** Whether the output is held now. */
  get holding(): boolean { return this.held !== null; }

  /** The hold let go for good: the master straight into the destination again, the gate gone. */
  release(): void {
    this.released = true;
    this.restore();
  }

  private restore(): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const live = (h.out as unknown as { master?: GainNode | null }).master === h.master;   // a disposed output's master stays off
    if (live) h.master.connect(h.ctx.destination);
    try { h.master.disconnect(h.gate); } catch { /* already off (a disposed output) */ }
    h.gate.disconnect();
  }
}
