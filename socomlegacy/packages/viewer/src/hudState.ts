// Shared original HUD state and timing, independent of the graphics backend.

import {
  GAME_FRAME_DT,
} from '@s2u/scene';
import {
  type HudBitmaps,
} from './hudAssets';

import {
  messageMeasureScale, wrapMessageLine, type KeepClear,
} from './hudMessagePanel';

import {
  scoreboardLayout, type GameDetails, type DamageBoardReport, type ScoreRowInfo,
} from './scoreboard';
import type {
  Presentation,
} from './renderer';
import {
  roundScreenLayout, type RoundScreen,
} from './roundScreens';


import {
  VOICE_ICON_RAMP, voiceIconStep, type VoiceElementView,
} from './hudVoice';
import type {
  TeamTagsView,
} from './hudTags';


import {
  plainBotText,
} from './botPresentation';
import {
  TEXT_LINE_LAYOUT, windowLines, MESSAGE_SCALE, capLines, ACTION_COLOURS, ACTION_PULSE_RATE,
  ACTION_PROMPT_COLOUR, MAP_ACTION_PROMPTS, ACTION_ICON_FADE, actionCaptionOf, HOLD_BAR_FADE, SPAWN_FADE,
  STANCE_FADE, ROUND_START, DEFAULT_ROUND, roundStartAt, messageAlpha, OBJECTIVE_MARK_PULSE_READING,
  gameCaption, SCOREBOARD_HIDES, ROUND_SCREEN_HIDES, DEFAULT_MODEL, DEAD_HELP_GHOST_CLOCK_READING, helpAlpha,
  hudLayout, hudPass, boardLayout, SMALL_MESSAGES, SMALL_MESSAGE_WRAP_WIDTH,
} from './hudLayout';
import type {
  FireMode, ActionPrompt, ClimbPrompt, HudStance, BannerLine, ActionEntry,
  ActionFeed, RoundInfo, CompassMark, HudOverlay, HudModel, HudTiming,
  HudSpectatorView, HudSources, HudPatch, HudView,
} from './hudLayout';
export abstract class HudState {
  protected abstract build(): void;
  protected abstract clear(): void;
  protected abstract hasDrawables(): boolean;
  abstract sizes(): Record<string, { width: number; height: number }>;

  /** Shared frame clock/layout. A backend consumes the returned borrowed frame synchronously. */
  layoutFrame(frame: { width: number; height: number }, real: number): ReturnType<typeof hudPass> {
    this.step(Math.min(0.1, Math.max(0, real)), Math.max(0, real));
    this.frame = frame;
    if ((!this.on && !this.model.spectator) || !this.hasDrawables()) return { quads: [], tris: [] };
    return hudPass(frame, this.model, this.sizes(), this.timing(), this.tacOpen, this.overlay, this.presentation);
  }

  protected model: HudModel = { ...DEFAULT_MODEL };
  protected on = false;
  protected frame = { width: 0, height: 0 };
  /**
   * The HUD's clock (`sinceOn`): seconds drawn since its map's init (`setBitmaps`), run while on or a spectator's
   * (PAR-94c; was: since the HUD came on); the fader runs on it. PAR-94d (R322.8, D6): a round's start no longer zeroes
   * it (was: "or the round's start (`startRound`)"); the round's banner runs from `roundFrom`. The stance word's alpha;
   * the prompt's pulse.
   */
  protected sinceOn = 0;
  /**
   * PAR-94d: the HUD's clock (`sinceOn`) at the round's start (`startRound`): the round start's banner and objective are
   * scheduled from it (`FUN_001fb420` posts the banner at the round's start, D:L57632-57649), the fader and the box's fade
   * not (their one start is the HUD's init, D:L57476, D:L57489).
   */
  protected roundFrom = 0;
  /** PAR-94d F1: the last round begun on this level (`startRound`), 0 at a map's init (`setBitmaps`). */
  protected lastRound = 0;
  protected stanceAlpha = 0;
  protected pulse = 0;
  protected pulseUp = true;
  /** HX-5: the compass marks' pulse (`DAT_0040c070`), in GS units 64..128, and its direction (`DAT_0040c078`). */
  protected markPulse: number = OBJECTIVE_MARK_PULSE_READING.min;
  protected markPulseDown = false;
  /** AD-7 (C93): the voice element's two icon sprites' alphas, GS units (`./hudVoice` `VOICE_ICON_RAMP`): made at 0. */
  protected voiceIconAlpha: number = VOICE_ICON_RAMP.from;
  protected voiceTalkAlpha: number = VOICE_ICON_RAMP.from;
  protected messageLeft = 0;
  protected posts: { at: number; lines: BannerLine[] }[] = [];
  /** PICKUP-LINE: the small message window's posts (`postSmallMessage`), each with the text it was posted as. */
  protected smallPosts: { at: number; text: string; lines: BannerLine[] }[] = [];
  /** PICKUP-LINE correction 5: the small window's stored last text (`FUN_002b6530`'s copy, D:L157941), leading spaces skipped. */
  protected smallLast = '';
  protected frozen = false;
  protected last = -1;

  /**
   * LATER 1040 (simulation track: it changes what the HUD draws on a menu launch; no constant or timing of the original
   * changes): the HUD's clock brought to now before a mark is stamped on it -- `startRound`'s `roundFrom`, a post's `at`
   * (`postMessage`), the tactical map's close (`fadeFrom`, `setTacMapOpen`). The frame clock (`last`) moves here, so the
   * time since the last drawn frame is counted once, from this moment, never into the mark; while the HUD is on (or a
   * spectator's) those seconds go to `sinceOn` first, as `render`'s step would add them. Without it a mark stamped after a
   * gap in the frames took the last frame's clock and the next frame counted the whole gap past it. The cause on a menu
   * launch: the prepared match draws the HUD while it is off (`./matchMount`'s `setVisible(walking && spawned)`, no net
   * yet), which sets `last`; its frames stop at its gate through the loading hold; at the attach the room's buffered
   * `roundStart` is replayed (the HUD still off) and the replayed spawn turns the HUD on, so the first frame back counted
   * the whole gap into the round, past its banner (`ROUND_START`'s 0.36 s post). On that path `on` is false here, so
   * nothing is added to `sinceOn`: only the frame clock moves, keeping the gap out of the round. Its consequence, seen on
   * a menu launch: the level's fade-up from black (`ROUND_START.fader`) and the ammo box's fade (`SPAWN_FADE`), both on
   * `sinceOn` from the level's init (`setBitmaps`; `FUN_001fa360` D:L57476, D:L57489), now play at the first frames back,
   * where the gap used to swallow them. Nothing before the first frame (`last` < 0), as `render`. The animations' clamped
   * step (`render`'s `dt`) loses the part of a frame before a stamp, at most one frame's per stamp.
   */
  protected catchUp(): void {
    if (this.last < 0) return;
    const now = performance.now() / 1000;
    if (this.on || this.model.spectator) this.sinceOn += Math.max(0, now - this.last);
    this.last = now;
  }
  protected manual: ActionPrompt | null = null;
  protected round: RoundInfo = DEFAULT_ROUND;
  protected tacOpen = false;
  /** When the ammo box's fade last began: the map's init, or the tactical map's close (PAR-94d; was: "the round start"). */
  protected fadeFrom = 0;
  protected climbing = false;
  protected nearby: ActionPrompt | null = null;
  /** LkPaioX5 part 2 (a): the picker's list as last fed (`setNearbyAction`), its head first; [] with one prompt or none. */
  protected nearbyList: readonly ActionEntry[] = [];
  /**
   * LkPaioX5 part 2 (a): each record's sprite alpha, GS units (`ACTION_ICON_FADE`), by its prompt -- the original's alpha
   * is the record's own sprite's (`FUN_003642d0` on the record's `+0x10`), so a turn keeps it; review fold F2: no prompt
   * is drawn in two slots (`showPrompt`), so a side's cap never reaches the head's record.
   */
  protected actionAlpha = new Map<ActionPrompt, number>();
  /** The records the list last held, sorted (a change is `FUN_0021f850`'s rebuild, which starts each at 0). */
  protected actionSet = '';
  /** LkPaioX5 part 2 (b): HudCLOC's strings (`setLocCaptions`), for the bomb's caption and the message names; none, null. */
  protected locCaptions: Readonly<Record<string, string>> | null = null;
  protected overlay: HudOverlay | null = null;
  protected presentation: Presentation = 'native';
  /** ONL-19 (research 269 §5): GAME DETAILS' source, read when the board opens (`FUN_0022be20` builds the lines on the press only; the 1.0 s rebuild never touches them); null, the LAN fill. */
  protected detailsOf: (() => GameDetails | null) | null = null;
  /** PAR-48: the help lines' clock (`CHUD +0x1a0e8`), seconds: zeroed as the HUD becomes a spectator's and at a round start. */
  protected helpAt = 0;
  /** KEYBOARD-WHISPER: the text line's text and its two alphas (`FUN_002c9e90`'s +0xa0 and +0x13c). */
  protected lineText = '';
  protected lineBox = 0;
  protected lineInk = 0;
  protected starts = 0;
  /**
   * PAR-94c (issue #262): a round has started on this HUD since its map's init (`startRound`, or the test hook's
   * `roundTime`). The round start's banner is the round's -- "STARTING ROUND %d OF %d" is posted by the round's HUD reset
   * `FUN_001fb420` (D:L57632-57648), called by `FUN_002a7d40` (D:L149755-149758; itself called from the level's init
   * `FUN_001ec480` D:L50946 and an MP state D:L75935) and directly by `FUN_001ecb10` (D:L51046-51052): posted at a
   * round's or a level's (re)start, never at a show -- the HUD's show (`FUN_001f7a90`, D:L56366-56447) posts none. So
   * it is drawn only once a round has started.
   */
  protected roundBegun = false;

  /**
   * KEYBOARD-WHISPER (`./roundTextLine`): the round's text line now (the line's set text, its vtable +0x70); `step` fades
   * it in while it holds text and out once it is empty (`TEXT_LINE_LAYOUT`).
   */
  setTextLine(text: string): void { this.lineText = text; }
  /** OT.R82: the page's touch controls over the picture (`./hudMessagePanel` `touchKeepClear`), the message panel kept off them. */
  setKeepClear(clear: readonly KeepClear[]): void { this.model.keepClear = clear; }
  /** KEYBOARD-WHISPER: the text line's text now (the line's own, `./roundTextLine`, reads it here). */
  textLineText(): string { return this.lineText; }
  /** KEYBOARD-WHISPER: the round starts the HUD has had (`startRound`): a development build's open line closes at the next. */
  roundStarts(): number { return this.starts; }

  /**
   * The bitmaps of the map just loaded (`./hudAssets`), or none: the HUD then draws nothing. PAR-94c: a map's bitmaps
   * are the HUD's init for its level (`FUN_001fa360`), which starts the fader (`FUN_00228b80(0.5)`, D:L57476; research
   * 87 §8) and the ammo box's fade (`DAT_003dc380` = 0, D:L57489; research 322 R322.4): the HUD's clock from 0 at the
   * level's first drawn frame, and no round started yet (`roundBegun`). The message window starts empty (the review's
   * F4): the level's init allocates a new HUD (D:L50903-50908, its init at D:L50912) and re-inits the window
   * (`FUN_002b6fc0(0x4366a0, ...)` D:L57423, which zeroes the window's counters +0x454, +0x458, +0x45c, D:L158296-158298,
   * but frees no line); the lines themselves go at the old level's teardown -- `FUN_001eb8c0` D:L50610 ->
   * `FUN_001fcb70` D:L58245, `FUN_002b6de0(0x4366a0)`, which walks the window's list releasing each line (its vtable
   * +8 with 1, read as the deleting destructor) and zeroes the same counters (D:L158146-158162). The port has no
   * teardown call, so the new map's init clears them.
   */
  setBitmaps(bitmaps: HudBitmaps | null | undefined): void {
    this.base = bitmaps ?? null;
    this.build();
    if (!bitmaps) return;
    this.posts = []; this.smallPosts = [];
    this.sinceOn = 0; this.fadeFrom = 0; this.roundFrom = 0; this.roundBegun = false; this.lastRound = 0;
  }

  /**
   * PF-26 (PF.R22): bitmaps from beyond the map's HUD libraries -- the round screens' `multplay_back.tif` and
   * `backsolid.tif` (`./roundScreens` `ROUND_SCREEN_BITMAPS`, UIMP's copies) -- kept across maps and drawn with the HUD's
   * own (which win a name both hold) once a map's are set. Without them the screens draw their colour-exact shapes.
   */
  addBitmaps(extra: HudBitmaps): void {
    this.extra = { ...this.extra, ...extra };
    if (this.base) this.build();
  }

  protected base: HudBitmaps | null = null;
  protected extra: HudBitmaps = {};

  /**
   * Extra quads and shapes drawn with the HUD (the tactical map's layer), asked for each frame with the frame's size
   * and the bitmaps' sizes; null or a null answer draws none.
   */
  setOverlay(overlay: HudOverlay | null): void { this.overlay = overlay; }

  /**
   * PAR-48 (research 282 §5; the playtest lane's research 276 §7) -- the spectator switch, the API the pages and the
   * replay's watcher wire. `view` is what a seat that is not a walker viewing himself sees (`HudSpectatorView`: the
   * original's path, the viewed body, the panel's words); null gives the walker's HUD back exactly as it was -- a view
   * never writes the walker's model.
   * - A set-state, not an event: call it as often as wanted (each frame, at any seek); the same view twice changes
   *   nothing. The view is copied, not held.
   * - Drawn whether or not `setVisible` is on: a page with no walker draws a view alone.
   * - The round timer is the HUD's own (`setTimer`) unless the view gives `roundTimer`; the message window, the round
   *   start, the voice element and the scoreboard (`setScoreboard`: SELECT, `FUN_0022be20` tests no seat) are drawn as
   *   for a walker. The help lines' clock starts as a 'spectator' view first arrives, as the view moves from a living
   *   body onto the dead own one (LATER 118 F1: the camera's edge, D:L56631-56645, D:L56754), at a ghost's or a promoted
   *   spectator's first dead view (DEAD_HELP_GHOST_CLOCK_READING) and at `startRound`.
   */
  setSpectator(view: HudSpectatorView | null): void {
    const was = this.model.spectator ?? null, path = view ? view.path ?? 'spectator' : null;
    const wasPath = was ? was.path ?? 'spectator' : null;
    if (path === 'spectator' && wasPath !== 'spectator') this.helpAt = 0;
    // LATER 118 (the review's F1): the edge is the camera's -- last frame's viewed actor alive (`DAT_00408f08`, D:L56754),
    // this frame's the local body, dead (D:L56631-56645, D:L56642 the local test). Onto 'own' from a living body: the
    // walker's own (null), a living watched teammate, a spectator's view; not from a dead watched one (`watchedDead`),
    // and never onto a teammate (alive, not local). A ghost's or a promoted spectator's first dead view, own or
    // teammate, starts it too (DEAD_HELP_GHOST_CLOCK_READING).
    else if (path === 'own' && (wasPath === null || wasPath === 'spectator' || (wasPath === 'teammate' && !was?.watchedDead))) this.helpAt = 0;
    else if (path === 'teammate' && (wasPath === null || wasPath === 'spectator') && DEAD_HELP_GHOST_CLOCK_READING === 'first dead view') this.helpAt = 0;
    this.model.spectator = view
      ? {
        ...view, followed: view.followed ? { ...view.followed } : null, stats: view.stats ? { ...view.stats } : null,
        ...(view.help ? { help: [...view.help] } : {}),
      } : null;
  }

  /**
   * Walking or not. PAR-94c (issue #262): a show restarts nothing -- the original's show of the HUD's parts
   * (`FUN_001f7a90`, D:L56366-56398) posts no line and writes no clock. The fader and the ammo box's fade play from the
   * HUD's clock, which a map's init (`setBitmaps`) zeroes and which runs while the HUD is on; the banner from a round's
   * start (`startRound`, PAR-94d); the message window's lines keep their ages across a show. Was: coming on zeroed
   * the clock, so the waiting room's spawn (PAR-94 B2/B3) played the round start in the launch countdown and a line
   * posted before it (the countdown's) was dropped, its age negative.
   */
  setVisible(on: boolean): void {
    this.on = on;
  }
  /** The map's nav points (`./tacMap`'s `TacData.points` of kind 1): the compass marks them. */
  setNavPoints(points: { name: string; x: number; z: number }[]): void { this.model.navPoints = points; }
  /** The tactical map is open: the HUD and the compass hide (`FUN_001f71c0`); a close brings them back through the fade. */
  setTacMapOpen(open: boolean): void {
    if (!open && this.tacOpen) { this.catchUp(); this.fadeFrom = this.sinceOn; }   // LATER 1040: the close is now's
    this.tacOpen = open;
  }
  /** What the round-start banner says (`DEFAULT_ROUND` until set). */
  setRound(round: RoundInfo): void { this.round = { ...round, objective: round.objective.map((l) => ({ ...l, text: l.text.toUpperCase() })) }; }
  /**
   * A round begins online (the server's `roundStart`, or a join): "STARTING ROUND r OF n" and the objective play from
   * the round's start (`FUN_001fb420` D:L57632-57649), and the message window's earlier lines go, as the MP exit state
   * clears the three windows between rounds (`FUN_00223970` L76084-76086). PAR-94d (research 322 R322.8, D6; reading,
   * pending review): not the fader nor the ammo box's fade -- their one start is the HUD's init for the level
   * (`FUN_001fa360` D:L57476, D:L57489; `setBitmaps`), which a round's start does not re-run: `CMPExitState`'s
   * `FUN_00223680` calls `FUN_002a7d40` (D:L75935; it writes neither) and pops itself (D:L75936), resuming CoreState
   * through its OnPop `FUN_001ecb10`, not its Init `FUN_001ec480` (CoreState's vtable 0x404f60, +0x24 and +0x10). Was:
   * the HUD's clock and the box's fade zeroed here, so both replayed at every round (`ROUND_TWO_FADE_READING`: its
   * capture still owed).
   *
   * PAR-94d F1 (the fresh review): but a new match started in place -- a round no later than the last begun on this
   * level -- restarts the level's fades, as `setBitmaps` does (no bitmaps; the message window empties below, as at every
   * round). The port's room starts its next match on the same map (`room.ts` `startRound(st.matchOver)`; research 309
   * §7.1 item 1); the original's goes back through the menu and a new load: `CMPExitState` on game state 1 pops and
   * switches to the menu state 0x408538 (D:L75915-75917; the host's `CloseAndSwitch`, `FUN_00281a70` D:L128127-128128),
   * and CoreState 0x4085d0 is entered only from the load state (D:L55753), whose Init runs the HUD's init again. The first
   * match's round 1 after a map's init is not one (`roundBegun` false: the init's fades already run).
   */
  startRound(round: RoundInfo): void {
    this.model.c4FuseBar = null;
    this.catchUp();                                      // LATER 1040: the round starts now, not at the last drawn frame
    if (this.roundBegun && round.round <= this.lastRound) { this.sinceOn = 0; this.fadeFrom = 0; }
    this.lastRound = round.round;
    this.setRound(round);
    this.roundFrom = this.sinceOn;
    this.posts = []; this.smallPosts = [];
    this.helpAt = 0;                                    // PAR-48: the help lines' clock (`FUN_001fb420` D:L57663)
    // KEYBOARD-WHISPER: `FUN_001fb420` clears the text line (`FUN_002ca0b0(0x437540)` D:L57631: the text set to none,
    // +0xa0 and +0x13c zeroed and the box's alpha set, D:L169276-169286) -- gone at once, no fade out.
    this.lineText = ''; this.lineBox = 0; this.lineInk = 0; this.model.textLine = null;
    // NU-9 (c): the round's reset clears the eight tags' texts (`FUN_002271d0` D:L77486-77501) and its start hides the two
    // sprites (`FUN_00227240` D:L77506-77519), back to back online (D:L149757-149758); the next frame's tags come anew.
    this.model.teamTags = null;
    // AD-7 (C93): the round's reset puts the voice icons' alphas back to 0 (`FUN_001fb420` D:L57618 -> `FUN_00238710`
    // D:L85621 -> `FUN_00238d00` D:L85737-85748).
    this.voiceIconAlpha = VOICE_ICON_RAMP.from; this.voiceTalkAlpha = VOICE_ICON_RAMP.from;
    this.roundBegun = true;                              // PAR-94c: the banner is this round's (`FUN_001fb420` D:L57632-57648)
    this.starts++;
  }
  setAmmo(rounds: number, capacity: number, spare: number, reloading = false, magsHidden = false): void {
    Object.assign(this.model, { rounds, capacity, spare, reloading, magsHidden });   // NET-REFILL N4: `magsHidden`
  }
  setFireMode(mode: FireMode): void { this.model.fireMode = mode; this.model.fireModeIcon = null; }
  /** M4: a launcher's round mode -- the round's icon in the first fire-mode cell (`HudModel.fireModeIcon`); null clears it. */
  setFireModeIcon(icon: string | null): void { this.model.fireModeIcon = icon ? icon.toLowerCase() : null; }
  /** The fire-mode row shown or not (`HudModel.fireModeRow`): off while a throwable, a charge or the Detonator is up. */
  setFireModeRow(on: boolean): void { this.model.fireModeRow = on; }
  /** The weapon's HUDW icon by file name (`m4carbine_icon.tif` for the M4A1). */
  setWeaponIcon(icon: string): void { this.model.weaponIcon = icon.toLowerCase(); }
  /** The camera's heading, degrees (`fly.pose().yaw`). */
  setHeading(yaw: number): void { this.model.yaw = yaw; }
  /**
   * A context prompt by kind, or none; `allowed` false greys a map action's (`MAP_ACTION_PROMPTS`, `ACTION_COLOURS.grey`)
   * and no other (LkPaioX5: `FUN_0021f210` D:L73957-73959).
   */
  setAction(action: ActionPrompt | null, allowed = true): void {
    this.manual = action;
    this.manualAllowed = allowed;
    this.showPrompt();
  }
  /**
   * The traversal's ledge prompt: the game's climb icon while visible, unless a caller's prompt or the picker's list
   * holds the slot (LATER 636: the list's own climb entry is then the climb drawn).
   */
  setClimbPrompt(state: ClimbPrompt | null): void {
    this.climbing = state?.visible === true;
    this.showPrompt();
  }
  /**
   * The map's own action in reach (`./mapActions`: a door's node within its `range`), or none; `allowed` as `setAction`'s.
   * LkPaioX5 part 2 (a): or the picker's whole list (`./matchActions` `prompt`), its head the prompt, list[1] and list[2]
   * drawn beside it (`HudModel.actionSides`), each entry's own `allowed`.
   */
  setNearbyAction(action: ActionFeed, allowed = true): void {
    if (Array.isArray(action)) {
      const list = action as readonly ActionEntry[];
      this.nearbyList = list;
      this.nearby = list[0]?.prompt ?? null;
      this.nearbyAllowed = list[0]?.allowed ?? true;
    } else {
      this.nearbyList = [];
      this.nearby = action as ActionPrompt | null;
      this.nearbyAllowed = allowed;
    }
    this.showPrompt();
  }
  protected manualAllowed = true;
  protected nearbyAllowed = true;
  /**
   * The prompt shown -- a caller's `setAction` over the picker's list's head (`setNearbyAction`'s list) over the
   * traversal's ledge over the map's own single action -- and its colour: its record's (`ACTION_PROMPT_COLOUR`), grey for
   * a map action the player may not use.
   *
   * LATER 636 (reading, pending review): with the picker's list fed, its head is the head -- the original keeps one list
   * (`DAT_0040d558`), whose head `FUN_0021f210` draws (D:L73945-73950) and `FUN_0021d9d0` fires (D:L73398-73401); the
   * climb is one of its entries (bit 0x4), so the climb feed draws only for a page that feeds no list. Was: the climb
   * feed over the list's head, so a bomb carrier at a site with a ledge in reach saw CLIMB while the press planted.
   */
  protected showPrompt(): void {
    const listed = this.nearbyList.length > 0;
    const climb = this.climbing && !listed;
    const action = this.manual ?? (climb ? 'climb' : this.nearby);
    const allowed = this.manual ? this.manualAllowed : climb ? true : this.nearbyAllowed;
    const colour = (p: ActionPrompt, ok: boolean): keyof typeof ACTION_COLOURS => (!ok && MAP_ACTION_PROMPTS.has(p) ? 'grey' : ACTION_PROMPT_COLOUR[p]);
    this.model.action = action;
    if (action) this.model.actionColour = colour(action, allowed);
    // LkPaioX5 part 2 (a): list[1] and list[2] beside the head (`FUN_0021f210` D:L73987-74000); list[3] on hidden (D:L74028).
    // Review fold F2: relative to the head shown -- the list turned to it (as the d-pad's turn would, `FUN_00595320`), the
    // next two, no prompt twice; a head the list does not hold (a caller's or the climb feed's alone) has none.
    const at = action ? this.nearbyList.findIndex((e) => e.prompt === action) : -1;
    const turned = at < 0 ? [] : [...this.nearbyList.slice(at), ...this.nearbyList.slice(0, at)];
    const sides: ActionEntry[] = [];
    for (const e of turned.slice(1)) if (sides.length < 2 && e.prompt !== action && !sides.some((x) => x.prompt === e.prompt)) sides.push(e);
    this.model.actionSides = sides.map((e) => ({ prompt: e.prompt, colour: colour(e.prompt, e.allowed ?? true) }));
    // LkPaioX5 part 2 (b): the head's caption -- the list's own entry when the head is the list's, else the record's.
    const head: ActionEntry | null = !action ? null : !this.manual && at >= 0 ? this.nearbyList[at]! : { prompt: action, allowed };
    this.model.actionCaption = head ? actionCaptionOf(head, this.locCaptions) : null;
    // A record new to the list, or one gone, is `FUN_0021f850`'s rebuild: every listed record starts at 0
    // (`FUN_002209c0` D:L74589) and the rebuild's frame steps it once (`FUN_0021f210`, `ACTION_ICON_FADE`); a turn of the
    // same records (`FUN_00595320`) keeps their alphas.
    const shown = action ? [action, ...sides.map((e) => e.prompt)] : [];
    const set = [...new Set([...(action ? [action] : []), ...this.nearbyList.map((e) => e.prompt)])].sort().join(',');
    if (set !== this.actionSet) {
      this.actionSet = set;
      this.actionAlpha.clear();
      shown.forEach((p, i) => this.actionAlpha.set(p, i === 0 ? ACTION_ICON_FADE.primary.step : ACTION_ICON_FADE.side.step));
    }
  }
  /**
   * LkPaioX5 part 2 (b): HudCLOC's strings by id and by message name (`./tauntData` `tauntCaptions`, the page's sound data's
   * `taunts.captions`), for the bomb's caption (`ACTION_BOMB_CAPTION_IDS`); null, none.
   */
  setLocCaptions(captions: Readonly<Record<string, string>> | null): void {
    this.locCaptions = captions;
    this.showPrompt();
  }
  /** LkPaioX5 part 2 (a): the alphas `frames` game frames on, each slot's step held at its cap (`FUN_003642d0`). */
  protected stepActionAlpha(frames: number): void {
    const shown = this.model.action ? [this.model.action, ...(this.model.actionSides ?? []).map((e) => e.prompt)] : [];
    shown.forEach((p, i) => {
      const f = i === 0 ? ACTION_ICON_FADE.primary : ACTION_ICON_FADE.side;
      this.actionAlpha.set(p, Math.min((this.actionAlpha.get(p) ?? 0) + f.step * frames, f.cap, 128));
    });
  }
  /** The slots' alphas now, 0..1: the head, list[1], list[2] (`HudTiming.actionAlpha`). */
  protected actionAlphas(): number[] {
    const shown = this.model.action ? [this.model.action, ...(this.model.actionSides ?? []).map((e) => e.prompt)] : [];
    return shown.map((p, i) => {
      const f = i === 0 ? ACTION_ICON_FADE.primary : ACTION_ICON_FADE.side;
      return Math.min(this.actionAlpha.get(p) ?? 0, f.cap) / 128;
    });
  }
  /** The stance: a change shows its word (`STANCE_FADE`). */
  setStance(stance: HudStance): void {
    if (stance !== this.model.stance) this.stanceAlpha = STANCE_FADE.start;
    this.model.stance = stance;
  }
  /** The view's magnification (the zoom's `magnification()`): the readout and the scope's range over 1.01. */
  /** The zoom readout's value (`./zoom` `hudZoom`) and whether it is the binoculars' (the RANGE line's place). */
  setZoom(zoom: number, binoculars = false): void { if (!this.frozen) { this.model.zoom = zoom; this.model.binoculars = binoculars; } }
  /** SELECT (Tab) held or let go: the scoreboard shows while it is held (research 87 §12). */
  setScoreboard(held: boolean): void {
    // ONL-19 (research 269 §5.1): the details are built at the open only (D:L79676-79866) and kept until the close (D:L79529)
    if (held && !this.model.scoreboard) this.model.scoreboardDetails = this.detailsOf?.() ?? null;
    else if (!held) this.model.scoreboardDetails = null;
    this.model.scoreboard = held;
  }
  /** WM-13 (a browser adaptation, `HudModel.damagePanel`): the damage report panel in the board's place, or null for the board. */
  setDamagePanel(panel: { report: DamageBoardReport | null; hint: string | null } | null): void { this.model.damagePanel = panel; }
  /** MATCH-01: the START menu opened or closed (`./startMenu`; the hide-all `FUN_001f77c0`, the show `FUN_001f7a90`). */
  setStartMenu(open: boolean): void { this.model.startMenu = open; }
  /** MATCH-01: the START menu's SPECTATOR HUD on or off (`DAT_003dc3e0`; D:L56803-56827). */
  setSpectatorHud(on: boolean): void { this.model.spectatorHud = on; }
  /** The page's presentation (`main`'s `fit`): the Modern one raises the scoreboard by `MODERN_SCOREBOARD_LIFT`. */
  setPresentation(presentation: Presentation): void { this.presentation = presentation; }
  /** The game the scoreboard names: the viewer's map, and its game type (`./mapOrder`'s `mode`). */
  setGame(name: string, type: string): void { this.model.game = { name, type: gameCaption(type) }; }   // HX-5: EXTRACT_CAPTION_READING
  /** ONL-19: the online GAME DETAILS' source (`./scoreboard` `sessionGameDetails` / `servedRoomDetails`); null, the LAN fill. */
  setGameDetails(of: (() => GameDetails | null) | null): void { this.detailsOf = of; }
  /** The round's players for the scoreboard (`net`'s rows with `self`), the spectators' names and the rounds won; null rows: the single SEAL. */
  setScoreRows(rows: ScoreRowInfo[] | null, spectators: string[], wins?: { seal: number; terrorist: number }): void {
    this.model.scoreRows = { rows, spectators, wins };
  }
  /**
   * BOMB-MARKS (`./bombPage` `hudFrame`, once a frame): the bomb carrier's id, or null -- his scoreboard row takes the
   * satchel (`./scoreboard` `SCOREBOARD_SATCHEL_RECT`), for every viewer as the original (OT.R109 as amended).
   */
  setBombCarrier(id: number | null): void { this.model.bombCarrier = id; }
  /**
   * WM-DATA (a browser adaptation, `HudModel.pointer`): the pointer in frame (drawing-buffer) pixels, or null when it
   * leaves the page or none is there; the scoreboard shows the hovered row's ping.
   */
  setPointer(p: { x: number; y: number } | null): void { this.model.pointer = p ? { x: p.x, y: p.y } : null; }
  /**
   * A round's end screen (research 91 §18: ROUND COMPLETE, FINAL ROUND, GAME COMPLETE), or null to take it down. While
   * set it is drawn over everything in this pass and the in-round HUD, the scoreboard and the tactical map give way
   * (`ROUND_SCREEN_HIDES`); the reticle is the page's to hide.
   */
  setRoundScreen(screen: RoundScreen | null): void { this.model.roundScreen = screen; }
  /**
   * NU-9 N1 (research 327 §5): the walker's own name and clan tag (`ownHudName`), apart -- the info box draws
   * "[tag] name", the scoreboard's fallback row the name alone (327 F4). Set once a frame by the pages; '' for none.
   */
  setPlayerName(name: string, tag = ''): void { this.model.name = name; this.model.tag = tag; }
  setHealth(health: number): void { this.model.health = health; }
  setTimer(seconds: number): void { this.model.timer = seconds; }
  /** XR-06: the objective's compass marks (`./bombPage` `hudFrame`), replacing the last; an empty list clears them. */
  setExtraMarks(marks: readonly CompassMark[]): void { this.model.extraMarks = marks.map((m) => ({ ...m })); }
  /** HX-5: the hostages' and the zones' compass marks (`NetPage.hostageMarks`), replacing the last; the bomb's untouched. */
  setHostageMarks(marks: readonly CompassMark[]): void { this.model.hostageMarks = marks.map((m) => ({ ...m })); }
  /** MATCH-05: the voice element's view (`./hudVoice` `voiceHudFrame`), or null: not drawn. */
  setVoice(view: VoiceElementView | null): void { this.model.voice = view ? { ...view } : null; }
  /**
   * NU-9 (c) T3 (research 329 §5 T3): the over-head tags this frame (`./hudTags` `teamTags`), replacing the last, copied;
   * null: none. Laid out and drawn by `hudLayout` (`teamTagLayout`).
   */
  setTeamTags(view: TeamTagsView | null): void {
    this.model.teamTags = view ? {
      points: view.points.map((p) => ({ ...p })), holder: view.holder, self: view.self, ...(view.scale === undefined ? {} : { scale: view.scale }),
      ...(view.atHead ? { atHead: true } : {}),   // NAME-TAGS-AT-HEAD: the Modern look's mark
    } : null;
  }
  /**
   * NU-9 (c) T4: the TEAMMATE NAMES option (`DISPLAY_MP_TEAM_NAMES`), read once at the match's mount as the HUD's set-up
   * reads it (D:L77558-77559; research 329 §1.8): off hides the name texts only, the talk sprites drawn still.
   * LATER 671 (OT.R101; a browser adaptation): `original`, the "original" look -- SS-2: this browser's Name tags
   * (`./nameTags` `readNameTags`), the card holding only on / off -- the original's tags, `teammateNamesOriginal()`;
   * else the adaptation's.
   */
  setTeammateNames(on: boolean, original = false): void { this.model.teammateNames = on; this.model.teammateNamesOriginal = on && original; }
  /** LATER 671, SS-2: the "original" look as set (`setTeammateNames`); false by default (the adaptation, OT.R101). */
  teammateNamesOriginal(): boolean { return this.model.teammateNamesOriginal === true; }
  /**
   * NU-9 (c) T4: the TEAMMATE NAMES option as set (`setTeammateNames`), on unless set off -- one value for the tags and the
   * reticle's teammate name (`./reticle` `ReticleTargetInputs.teammateNames`): the reticle's flag `+0x17b64` is the tags'
   * part's `+0x5e4` (`+0x17580 + 0x5e4`, research 329 §4.3).
   */
  teammateNamesOn(): boolean { return this.model.teammateNames !== false; }
  /** NU-9 (c) T3: the Chat menu open or closed (the command menu, control state 2): open hides the tags' texts (D:L56617-56623). */
  setCommandMenu(open: boolean): void { this.model.commandMenu = open; }
  /** MATCH-05: the talk mark (`./hudVoice` `voiceHudFrame`), replacing the last; an empty list clears it. */
  setTalkMarks(marks: readonly CompassMark[]): void { this.model.talkMarks = marks.map((m) => ({ ...m })); }
  /** MATCH-05: how many spectators the scoreboard's rows name (the room's `scores`): the voice count on 10, without a layout. */
  spectatorCount(): number { return this.model.scoreRows.spectators.length; }
  /** XR-06: the bomb's fuse in the round timer's place (DEFUSE_TIMER_LAYOUT_READING); null gives the slot back. */
  setDefuseTimer(seconds: number | null): void { this.model.defuseTimer = seconds; }
  /** Presentation only: replace the view each frame; null removes it without a fade or independent clock. */
  setC4FuseBar(view: { fill: number } | null): void { this.model.c4FuseBar = view ? { ...view } : null; }

  /**
   * PB-8: the bomb's hold bar (`./bombPage` `hudFrame`, once a frame): the fill's share while a hold plays, drawn live;
   * null when none, and a bar drawn live starts its fade from the fill's alpha (`HOLD_BAR_FADE`, run by `step`).
   */
  setHoldBar(fill: number | null): void {
    if (fill !== null) this.model.holdBar = { fill };
    else if (this.model.holdBar && this.model.holdBar.fade === undefined) {
      this.model.holdBar = { fill: this.model.holdBar.fill, fade: HOLD_BAR_FADE.from };
    }
  }
  setRange(metres: number | null): void { this.model.range = metres; }
  /** HUD-ALIVE B: the info box's number (`infoNumberText`): the consoles' count and the session master; null, none (no room). */
  setInfoNumber(count: number | null, master: boolean): void { this.model.infoNumber = count === null ? null : { count, master }; }
  /** HUD-ALIVE C (`./rangeReadout`, a browser adaptation): this browser's range readout on -- the range in the count's spot. */
  setRangeReadout(on: boolean): void { this.model.rangeReadout = on; }
  /**
   * A message on the message window (the round start's), as the game posts one: in over 0.36 s, out 7 s later, the
   * newest at the bottom (research 87 §14 lists what the game posts). TAUNT-WRAP (research 87 §14.1; reading, pending
   * review): a line wider than the window's 297 is broken at a space into lines of the window, as `FUN_002b6530` posts
   * it (`./hudMessagePanel` `wrapMessageLine`) -- every post, the kill feed's, the chat's and the taunts' alike; each piece
   * keeps its line's scale and colour and counts as a line of the window (`capLines`). The wrap is measured at the
   * original's scale (`messageMeasureScale`): a line's `post`, absent the window's own; a text given with a `scale` is a
   * script's post (`./roundAudio`'s and the bomb's lines) at that scale, drawn at it and measured at it x 1.1429.
   */
  postMessage(lines: string | BannerLine[], scale?: number): void {
    const list = (typeof lines === 'string' ? [{ text: lines, scale: scale ?? MESSAGE_SCALE }] : lines).flatMap((l) =>
      typeof lines === 'string' && scale !== undefined
        ? wrapMessageLine(l.text, messageMeasureScale(scale)).map((text) => ({ ...l, text }))
        : windowLines(l));
    if (list.length > 0) { this.catchUp(); this.posts.push({ at: this.sinceOn, lines: list }); }   // a break at 0 posts nothing (D:L158034)
  }
  /**
   * PICKUP-LINE (research 234 §7 `PICKUP_TEXT_READING`; research 87 §14): a line on the small message window
   * (`SMALL_MESSAGES`), as `FUN_005bb000` posts a take's item name (D:L473369-473374). Two compares, in the original's
   * order (correction 5):
   * - the take's: not posted when the text equals the window's NEWEST LINE case-insensitively -- `FUN_002b6d60` walks
   *   to the window's last line node and gives its text (an empty one with none), `FUN_00198b80` compares ignoring case
   *   (D:L473369-473371); for a wrapped post the newest line is its last piece;
   * - the window's own (`FUN_002b6530`): the text's leading spaces skipped (D:L157930-157931); the same bytes as its
   *   last post while it holds a line add no line (D:L157932-157969; `SMALL_MESSAGE_REPEAT_RESET_PLACEHOLDER`: what it
   *   does to that post's lines is not built).
   * Else wrapped at the window's 92 (`SMALL_MESSAGE_WRAP_WIDTH`) at its own scale and faded on its fadetime 5. Colour 0,
   * the HUD's text colour.
   */
  postSmallMessage(text: string): void {
    const fold = (t: string): string => t.replace(/[A-Z]/g, (c) => c.toLowerCase());   // `FUN_00198b80`: ASCII case only
    const newest = this.smallPosts[this.smallPosts.length - 1];
    const newestLine = newest?.lines[newest.lines.length - 1]?.text ?? '';
    if (fold(newestLine) === fold(text)) return;
    const shown = text.replace(/^ +/, '');
    const repeat = this.smallPosts.length > 0 && this.smallLast === shown;
    this.smallLast = shown;
    if (repeat) return;
    const lines = wrapMessageLine(shown, messageMeasureScale(0), SMALL_MESSAGE_WRAP_WIDTH).map((t) => ({ text: t, scale: MESSAGE_SCALE }));
    if (lines.length > 0) { this.catchUp(); this.smallPosts.push({ at: this.sinceOn, text: shown, lines }); }
  }
  /**
   * RV-1 (the playtest lane's dev read, `./devSeen`, as PAR-41's accessors): the message window's posts held now, oldest
   * first -- each one's lines' text (newline-joined) and its age on the HUD's own clock (`sinceOn` less its `at`, s),
   * copied at the call. Read only; a browser adaptation, changing nothing drawn.
   */
  /** ROUND-CHAT's look sheet (a test instrument, `./main` `roundChatPreviewLines`, devmode only): the window's posts let go. */
  clearPostsForDev(): void { this.posts = []; this.smallPosts = []; }
  postsForDev(): { text: string; age: number }[] {
    return this.posts.map((p) => ({ text: p.lines.map((l) => plainBotText(l.text)).join('\n'), age: this.sinceOn - p.at }));
  }
  /**
   * OT.R59 (RECONNECT-GHOST (B), a labelled adaptation): a line the page holds on the message window -- drawn after the
   * posts at full alpha, for as long as it is set (`RECONNECT_GHOST_LINE_ADAPTATION`); null lets it go.
   */
  setNotice(text: string | null): void { this.notice = text; }
  protected notice: string | null = null;
  /** A line on the event banner for `seconds`. */
  flashMessage(text: string, seconds = 3): void {
    this.model.message = text.toUpperCase();
    this.messageLeft = seconds;
  }

  /**
   * The page's once-a-frame feed from the live state: the magazine (`fire.state().magazine`), the heading
   * (`fly.pose().yaw`), the stance (`walk.stance()`, the stance taken: LATER 403), the range, and the traversal's ledge
   * prompt when it has one.
   */
  feed(src: HudSources): void {
    if (this.frozen) return;
    const m = src.magazine;
    this.setAmmo(m.rounds, m.capacity, m.spare, m.reloading, m.magsHidden === true);
    this.setHeading(src.yaw);
    if (src.stance !== undefined) this.setStance(src.stance);
    if (src.stanceTaken !== undefined) { this.stanceAlpha = STANCE_FADE.start; this.model.stance = src.stanceTaken; }   // LATER 414
    if (src.climb !== undefined) this.setClimbPrompt(src.climb);
    if (src.nearby !== undefined) this.setNearbyAction(src.nearby);
    if (src.position !== undefined) this.model.position = src.position;
    if (src.range !== undefined) this.setRange(src.range);
    if (src.fireMode !== undefined) this.setFireMode(src.fireMode);
  }

  /** Several inputs at once (the test hook's `setHud`). */
  patch(p: HudPatch): void {
    if (p.fireMode) this.setFireMode(p.fireMode);
    if (p.weaponIcon) this.setWeaponIcon(p.weaponIcon);
    if (p.action !== undefined) this.setAction(p.action);
    if (p.climb !== undefined) this.setClimbPrompt(p.climb);
    if (p.message !== undefined) { if (p.message === null) this.model.message = null; else this.flashMessage(p.message, 3600); }
    if (p.zoom !== undefined) this.model.zoom = p.zoom;
    if (p.name !== undefined) this.setPlayerName(p.name);
    if (p.health !== undefined) this.setHealth(p.health);
    if (p.timer !== undefined) this.setTimer(p.timer);
    if (p.range !== undefined) this.setRange(p.range);
    if (p.stance !== undefined) this.setStance(p.stance);
    if (p.yaw !== undefined) this.setHeading(p.yaw);
    if (p.scoreboard !== undefined) this.setScoreboard(p.scoreboard);
    if (p.rounds !== undefined) this.model.rounds = p.rounds;
    if (p.capacity !== undefined) this.model.capacity = p.capacity;
    if (p.spare !== undefined) this.model.spare = p.spare;
    if (p.frozen !== undefined) this.frozen = p.frozen;
    if (p.settled) {
      // Past the round start: no fader, no banner, the ammo box in.
      this.sinceOn = 60;
      this.fadeFrom = 0; this.roundFrom = 0;
      this.pulse = 0;
      this.model.banner = []; this.model.fader = 0;
      if (this.model.smallBanner !== undefined) this.model.smallBanner = [];
      this.posts = []; this.smallPosts = [];
    }
    if (p.roundTime !== undefined) {
      this.sinceOn = p.roundTime; this.roundFrom = 0;    // PAR-94d: the level's and the round's clocks together
      this.roundBegun = true;                            // PAR-94c: the hook's round start `roundTime` s in
      const start = roundStartAt(this.sinceOn, this.round);
      this.model.banner = start.banner; this.model.fader = start.fader;
    }
  }

  /** The fades now. */
  timing(): HudTiming {
    const t = this.sinceOn - this.fadeFrom - SPAWN_FADE.hold;
    return {
      fade: Math.min(1, Math.max(0, t / SPAWN_FADE.ramp)), stance: this.stanceAlpha, pulse: this.pulse, marks: this.markPulse / 128,
      help: helpAlpha(this.helpAt), voice: { icon: this.voiceIconAlpha / 128, talk: this.voiceTalkAlpha / 128 },   // AD-7
      actionAlpha: this.actionAlphas(),                                                                             // LkPaioX5 (a)
    };
  }

  /** What is drawn and where, in the drawing buffer's pixels (y down) of the last frame. */
  state(): HudView {
    const visible = (this.on || !!this.model.spectator) && this.hasDrawables() && this.frame.height > 0;   // PAR-48: a view draws alone
    const timing = this.timing();
    const laid = visible ? hudLayout(this.frame, this.model, this.sizes(), timing) : null;
    const rects = laid ? laid.rects : {};
    if (visible && this.model.roundScreen) {
      const q = roundScreenLayout(this.model.roundScreen, this.frame, this.sizes()).quads;
      for (const e of ROUND_SCREEN_HIDES) delete rects[e];
      // The screen covers the frame (its backdrop).
      if (q.length) rects.roundScreen = { x: 0, y: 0, width: this.frame.width, height: this.frame.height };
    } else if (visible && this.model.scoreboard && !this.tacOpen) {
      const q = this.board().quads;
      const x0 = Math.min(...q.map((b) => b.x - b.w / 2)), y0 = Math.min(...q.map((b) => b.y - b.h / 2));
      const x1 = Math.max(...q.map((b) => b.x + b.w / 2)), y1 = Math.max(...q.map((b) => b.y + b.h / 2));
      if (q.length) rects.scoreboard = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      for (const e of SCOREBOARD_HIDES) delete rects[e];
    }
    // LATER 117: the icon's bitmap while it is drawn (after the round screen's and the board's hides).
    const icon = rects.icon && laid ? laid.quads.find((q) => q.element === 'icon')?.texture ?? null : null;
    return { visible, frame: { ...this.frame }, model: { ...this.model }, timing, rects, icon };
  }

  /**
   * Steps the fades by `dt` seconds (called by `render` from the frame clock). PAR-34 (research 252 s3; ACT.R8): `real`,
   * the frame's real seconds (default `dt`), is what the round's clock counts -- `sinceOn`, zeroed at the map's init
   * (`setBitmaps`), on which the fader, the ammo box's fade, the message window's lines and (from `roundFrom`, the
   * round's start: PAR-94d; was: `sinceOn` zeroed there) the round start's banner are scheduled -- so below 10 fps it
   * keeps the room's round time. The animations (the stance fade, the pulses, the
   * help lines, the event banner's seconds, the hold bar's fade) are presentation and keep the clamped `dt`.
   */
  step(dt: number, real = dt): void {
    if (this.on || this.model.spectator) this.sinceOn += real;   // PAR-48: a spectator's round start and messages run too
    this.helpAt += dt;
    // PAR-94d: the banner on the round's clock, the fader on the level's (one fade a level, R322.8).
    const start = roundStartAt(this.sinceOn - this.roundFrom, this.round), fader = Math.max(0, 1 - this.sinceOn / ROUND_START.fader);
    this.posts = this.posts.filter((m) => messageAlpha(this.sinceOn - m.at) !== null);
    const posted = this.posts.map((m) => ({ lines: m.lines, alpha: messageAlpha(this.sinceOn - m.at)! }));
    // PICKUP-LINE: the small window's posts on its own fadetime (`SMALL_MESSAGES`), its newest `maxsize` lines. Only
    // while a post is held or a line is still on the model: with neither, nothing is made and the model is not touched.
    if (this.smallPosts.length > 0 || (this.model.smallBanner !== undefined && this.model.smallBanner.length > 0)) {
      const fade = SMALL_MESSAGES.fadetime;
      this.smallPosts = this.smallPosts.filter((m) => messageAlpha(this.sinceOn - m.at, fade) !== null);
      this.model.smallBanner = capLines(this.smallPosts.map((m) => ({ lines: m.lines, alpha: messageAlpha(this.sinceOn - m.at, fade)! })));
    }
    // OT.R59: held; wrapped as a post is (TAUNT-WRAP), so it stays in the window too.
    if (this.notice) posted.push({ lines: windowLines({ text: this.notice, scale: MESSAGE_SCALE }), alpha: 1 });
    // PAR-94c: the round start's banner once a round has started (`roundBegun`). PAR-94d (research 322 D7): a spectator's
    // view too -- `FUN_001fb420` posts it on every console at a round's start (D:L57632-57649; no seat tested), and the
    // page starts a spectator's round as a player's (`NetPage.roundBanner`). Was (PAR-48): a spectator's view drew the
    // banner off the HUD's own clock with no round begun, so a map's init (`setBitmaps`) replayed the last round's.
    const banner = this.roundBegun ? start.banner : [];
    this.model.banner = capLines([...banner, ...posted]);
    this.model.fader = fader;
    this.stanceAlpha = Math.max(0, this.stanceAlpha - STANCE_FADE.perSecond * dt);
    // HX-5: the marks' pulse, as the compass's update moves it (D:L68043-68050): up, then down, clamped at each end.
    const M = OBJECTIVE_MARK_PULSE_READING;
    this.markPulse += M.rate * dt * (this.markPulseDown ? -1 : 1);
    if (this.markPulse < M.min) { this.markPulse = M.min; this.markPulseDown = false; } else if (this.markPulse > M.max) { this.markPulse = M.max; this.markPulseDown = true; }
    // AD-7 (C93): the voice element's update steps each icon on a frame it has a texture (`FUN_002393f0` D:L85925-85939,
    // `FUN_00239250` D:L85867-85881); a frame without one hides it and holds its alpha. The update runs before the
    // scoreboard's hide (D:L56758, D:L56811), so the board up does not stop it. The clamped `dt`, as the other animations.
    // VOICE_UNNAMED_HOLDER_READING (research 227 §2.8): while another holds the floor and no slot names him, the original
    // returns before the icons' updates (`FUN_00238ac0` D:L85679-85684) and holds them; the port still steps the busy icon.
    const voice = this.model.voice;
    if (voice && dt > 0) {
      const frames = dt / GAME_FRAME_DT;
      if (voice.icon) this.voiceIconAlpha = voiceIconStep(this.voiceIconAlpha, frames);
      if (voice.talk) this.voiceTalkAlpha = voiceIconStep(this.voiceTalkAlpha, frames);
    }
    if (this.model.action && dt > 0) this.stepActionAlpha(dt / GAME_FRAME_DT);   // LkPaioX5 (a): ACTION_ICON_FADE, a frame's step
    if (this.model.action) {
      this.pulse += (this.pulseUp ? 1 : -1) * ACTION_PULSE_RATE * dt;
      if (this.pulse >= 1) { this.pulse = 1; this.pulseUp = false; }
      if (this.pulse <= 0) { this.pulse = 0; this.pulseUp = true; }
    } else { this.pulse = 0; this.pulseUp = true; }
    if (this.model.message) {
      this.messageLeft -= dt;
      if (this.messageLeft <= 0) this.model.message = null;
    }
    // KEYBOARD-WHISPER: the text line's fade (`FUN_002c9e90` D:L169201-169254), on the clamped `dt` as the other animations.
    const TL = TEXT_LINE_LAYOUT, has = this.lineText.length > 0;
    this.lineBox = has ? Math.min(TL.boxAlpha, this.lineBox + dt * TL.boxRate) : Math.max(0, this.lineBox - dt * TL.boxRate);
    this.lineInk = has ? Math.min(TL.inkAlpha, this.lineInk + dt * TL.inkRate) : Math.max(0, this.lineInk - dt * TL.inkRate);
    this.model.textLine = has || this.lineBox > 0 || this.lineInk > 0 ? { text: this.lineText, box: this.lineBox, ink: this.lineInk } : null;
    // PB-8: the hold bar's fade (`HOLD_BAR_FADE`): hidden once its alpha goes under 0 (D:L74450-74454).
    const bar = this.model.holdBar;
    if (bar && bar.fade !== undefined) {
      const fade = bar.fade - HOLD_BAR_FADE.perSecond * dt;
      this.model.holdBar = fade < 0 ? null : { fill: bar.fill, fade };
    }
  }

  /** The scoreboard's quads and shapes on the last frame's size. */
  protected board(): ReturnType<typeof scoreboardLayout> { return boardLayout(this.frame, this.model, this.sizes(), this.presentation); }

  /** ONL-18c: the HUD's textures, materials and buffers freed (the front end's match lets its HUD go at the match's end). */
  dispose(): void { this.clear(); }
}
