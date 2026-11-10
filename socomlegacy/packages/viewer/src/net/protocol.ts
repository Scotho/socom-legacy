import type { GameType } from '@s2u/scene';
import type { EquipmentSlotState } from '../equipmentSlots';
import { HOLD_CODES, type HoldClip } from '../mover';
import type { BombWire } from './objective';
import type { TurretWire } from './emplacement';
import type { ReloadItem, ReloadStance } from '../reloadClip';
import { isDead, MP_HEALTH, overall, PARTS, type Health } from './damage';

/**
 * The multiplayer wire protocol (web sprint 3, M3/M4; spec W3.R2-R4, rulings W3.R8-R10 in the sprint spec's section 7).
 *
 * One WebSocket per client. Binary frames carry the hot path -- the client's commands up, the server's snapshots down
 * (`./codec`) -- and text frames carry JSON for everything reliable and rare (`ClientEvent` / `ServerEvent`): the join,
 * names, the queue, kills, respawns, the scoreboard, shots for the effects.
 *
 * The model (W3.R8, the command stream): the client's mover ticks at the game's 60 Hz (`CGame::Tick`, research 71
 * section 1.5) and every tick becomes one `Command`, numbered. The server runs each player's commands through that
 * player's own `Walker` in order, as they arrive -- the same code on the same hull, so the server's mover takes the
 * steps the client predicted, bit for bit (`test/simMap.test.ts`), and a correction is needed only when a command
 * was refused or the two sims disagree. Snapshots carry, per recipient, the last command the server ran and the
 * mover's state after it; the client compares with its own history at that number.
 */

/**
 * Bumped on any change to the frames below; a client and server that disagree refuse each other at the hello.
 * 2 (2026-09-29): the snapshot carries the doors (`Snapshot.doors`), and a client asks for one with a `door` event.
 * 3 (2026-09-29): a command carries the scope's slowed stick (`Button.Scope`) and the kit's hold (`HOLD_SHIFT`).
 * 4 (2026-09-29): the rules -- the hello asks for `respawn` or `classic` (rooms are keyed by map and rules), the welcome
 * and the round start name the rules, the round and the game's round count, and classic's `eliminated` event.
 * 5 (2026-09-29, the launch review): a `fire` names the eye its aim left from and that aim (`eye`, `aim`: the server's
 * accuracy cone, OWNER-3, `./shotCone`); `promoted` says whether the seat is a ghost's; an idle player moved out gets
 * `demoted` (its role is a spectator's from then).
 * 6 (2026-09-29, grenade harm): the snapshot's action codes take the blast's knock (`fallForward`, `fallBackwards`,
 * `landBackwards`, `getUpBackwards`, `./blast`), and the server sends a `blast` event (the ringing ears and the knock).
 * 7 (2026-09-30, review 2 m-13 / review 3 B2): `kill.how` takes 'orphan' (a departed thrower's grenade) with
 * `killerName`; a new `abandoned` event (a classic round abandoned with a side left empty: the page ends the round).
 * 7 (2026-09-30, web sprint 4 M9, the arsenal): the `loadout` request and its answer (the weapon select's picks, replayed
 * by the room: `@s2u/scene` `applyPicks`, W4.R6); a body's weapon is the held item's id (`BodyState.weapon`, one byte more
 * a body) beside its slot; a `spawn` and the welcome's players carry the kit the body spawned with; a `shot` names the
 * item that fired it; a `kill` names the weapon by its record's `DisplayName` (research 91 §10).
 * 8 (2026-09-30, the sprint 4 merge): both 7s together -- review 3's `abandoned` event and 'orphan' kill, and the
 * arsenal's `loadout` request, `BodyState.weapon`, the spawn's and welcome's `kit`, the shot's item, the kill's weapon
 * name. The two branches each took 7 for their own change; a 7 page of either kind speaks to neither 8 room.
 * 9 (2026-09-30, web sprint 5 S2, the character types; research 95 §6, W5.R2): a player is one of its side's ARMORY
 * types (`CharType`, the column within the side, 0-3), each its own body, kit and hit volumes. The hello names the
 * page's type for each side (`types`: the side is the room's to give), a `loadout` request the type its picks replay
 * from (`char`), and the answer the type held; a `spawn` and the welcome's players name the type the body was rebuilt
 * as (`char`), which the others draw. The snapshot does not: a type changes only at a spawn, which is a reliable event.
 * Additive since, the version kept: `Button.Binoculars` / `BodyFlag.Binoculars` (2026-10-01); the `flinch` event
 * (2026-10-02: the others see a hit SEAL flinch); the `reloadSound` event (2026-10-02: the others hear a reload); the
 * `shot`'s `body` and its PERSON material on a body hit, and the shooter's `impact` (2026-10-02: every page sees the
 * blood; the shooter's is an event of its own, which an older page ignores, never its own `shot`); the `combat` report
 * (2026-10-02, INT.R5: a playtest instrument with no original, sent only by a room with `combatReport` on); the `kill`'s
 * `cause` (2026-10-04, PF-10: the game's death cause, for the victim's death voice; a page without it plays none), its
 * `voiced` and the `hurtVoice` event (PF-10's fix round: the voice gate, kept by the room; an older page ignores both).
 * 10 (2026-10-05, web sprint 26 MAP-03; research 209 s11): the world on the wire. Every snapshot ends with the room's
 * environment after the doors (`Snapshot.env`, `EnvWire`: the world's revision, the round epoch and every placed instance
 * whose active state differs from its opening one) -- always present, so a 9 frame is too short for a 10 page and a 10
 * frame has trailing bytes for a 9 one; the welcome carries it too (`env`), with the round epoch (`epoch`), the tick
 * the round began (`startTick`) and the map's game type (`gameType`); the round start names its `epoch` and
 * `startTick`; the client's `loaded` (the loading screen released; no room behaviour yet, ONL-18b's).
 * Additive since, the version kept (PF.R33, PF.R38): `proneCover` appended to `ACTION_CODES` and the `blast` event's
 * `knock.fall` (2026-10-05, PF-19: a living prone SEAL's `Prone cover`; an older page indexes past its table and draws
 * no action for it); the body's hold code in `BodyState.flags` bits 11-14 (`BODY_HOLD_SHIFT`, 2026-10-07: the others see
 * a throw and a placing), its start parity in bit 15 (`BodyFlag.HoldSerial`: the next throw on the same code), and three
 * hold codes appended to `HOLD_CODES` (C4's `Put on wall`, the pistol's toss and plant).
 * 11 (2026-10-07, NET-WIRE; the owner's OT.R38 / H118 "Slim now, spectators 30 Hz"; research 224): a frame-type byte heads
 * every binary frame (`Frame`: the snapshot 0, the voice 1 -- reserved for sprint 20's relay, nothing sends it yet -- the
 * commands 2), and a peer refuses a type it does not know without a throw; the snapshot slimmed -- a body's feet i16 at
 * `FEET_STEP` from an origin the frame carries (the room's map's bounds' centre, `feetOriginOf`), the environment only in
 * a snapshot whose revision or epoch differs from the last one the connection was sent (the welcome still carries it
 * whole), spectators at the full `SNAPSHOT_HZ`; the own state's `facing` (the mover's yaw and pitch, float32), which the
 * page reconciles as it does the position; `BodyState.flags` a u32 (bits 0-10 the flags, 11-14 the hold code, 15 the
 * hold's start parity, as their meanings were). A `.s2r` of protocol 10 still plays (`decodeSnapshotV10`).
 * Additive since, the version kept (PF.R38's precedent): `rifleToLauncher` and `pistolToLauncher` appended to
 * `ACTION_CODES` (2026-10-14, PAR-84: the launcher's raise and, reversed, its still lower holding the body; research 230
 * section 5.2.10); an older page indexes past its table and draws no action for them. `swapRifleExchange` and
 * `swapRifleClaim` appended to `ACTION_CODES` (2026-10-14, NU-5 X1 and research 324 P2; research 323 §1.5, research 324
 * §1.4: the pick-up's `Swap rifle`, the exchange's drawn on the taker alone -- SOLDIER's `Swap rifle` row carries no
 * `network_log` -- and the launcher claim's by every page); an older page indexes past its table and draws no action for
 * them. The `health` event (2026-10-15, NU-3c; research 321 section 4.2.1: another seat's six part bytes, to its side and
 * the spectators, for the reticle's bar over a teammate); an older page's switch has no case for it and passes it by.
 * The `throwStart` event and the `throw`'s `start` (2026-10-16, THROW-INTERRUPT; research 326 §2.4: the throwable in the
 * hand at its release request, kept by the room for the original's drop at a death before the hand opens); an older
 * room's switch has no case for the event and passes it by (`Room.text`'s `default`), and its shape check reads no
 * `start`; an older page sends neither, and the room then drops nothing at such a death, as before.
 * The command's stance code 3, `'pop'` (`COMMAND_STANCE_CODES`; 2026-10-20, OT.R67: the prone-pop, an adaptation on the
 * owner's word); an older room reads it as stand and plays the get-up there, an older page never sends it.
 * The `system` event (2026-10-21, SA-43c Part 2; research 345 sections 1-2: the server's system message on the game
 * connection, a host's restart notice); an older page's switch has no case for it and passes it by, an older room never
 * sends it.
 * The `roundStart`'s `ghosts` (2026-10-21, LATER 85; research 322 section 5.3: the seats the round's start passed by, a late
 * classic seat whose console has not loaded -- no body, a ghost of the round); a page and its room ship together (the web
 * and host images of one release), so an older page never meets it; a newer page against a room that sends none clears
 * the ghost at every round's start, as before.
 * The mount's take word (A1: LATER 239, 217, 218, 243; research 215 s8.6; `./emplacement` MOUNT_GRANT_CHECKS_ADAPTATION,
 * MOUNT_WORD_BOUND_ADAPTATION): the `mount` ask's `word` (the page will name the command it takes the turret on), the
 * `mountTake` event (that command) and the `turret` event's `reserved` (the occupant granted at the ask's command, its body
 * on foot until the take). An older room ignores `word` (its shape check reads `seq` and `turret`) and passes `mountTake`
 * by (`Room.text`'s `default`): it takes at the ask, as before, and the page keys its mount on that take's `steer.after`,
 * as before. An older page sends neither: the room takes its ask at the ask, as before, and no bound applies. An older
 * page reads another seat's `reserved` occupant as the mount (the clip drawn from the reservation, a round trip early).
 * Listed after the `system` event and the `roundStart`'s `ghosts`.
 * The lever gates on `Snapshot.doors` (2026-10-22, MAP-07, PR #427; research 174 §5.1): Death Trap's and Enowapi's
 * gates appended after the doors, one `DoorWire` each (the count is already a byte); an older page's `DoorSet` passes
 * the entries past its own doors by (`applyWire`'s `if (!d) return`), so its gates stay shut; a newer page against a
 * room that sends none sees no tail and keeps them shut. Listed after A1's take word.
 * The score row's round block (2026-10-23, LATER 364; research 216 §8): `roundKills`, `roundDeaths` and `roundScore`
 * beside the match totals, for ROUND COMPLETE's and FINAL ROUND's lists; an older page ignores them, and a page against
 * an older room lists the totals on every screen, as before. Listed after the lever gates.
 * 12 (2026-10-31, SEP-POP, OT.R93; the fresh review's B1 under PF.R33: a per-tick binary field bumps the version): the
 * command's `separate` (`Command.separate`), bit 3 of the stance byte's low nibble -- the page's stance mode, which the
 * room's mover needs every tick to cut the stance clips as the page's does. An 11 room would read a SEPARATE crouch or
 * prone press (codes 9, 10) as stand, and SA-49's release grace (central `directory.ts`) lets a new page meet an old
 * host, so the two refuse each other at the hello (`Room.hello`, the page's version text). The snapshot is unchanged;
 * an 11 `.s2r` still plays (match `replay/format.ts` `DECODERS`: bit 3 was never set before 12).
 * 13 (2026-11-02, PLANT-AIM; the fresh review's F2): the plant needs the page's pick (`bombAction` 'aim'): a 12 page
 * sends none and could never plant on a 13 room, so the two refuse each other at the hello and the old page is told to
 * update, not left holding a plant that never counts. The binary wire is 12's: a 12 `.s2r` plays on the live decoders.
 * Additive since, the version kept: the `shot`'s `through` (2026-11-02, P12; research 219 s3.2, 91 s23: the world
 * surfaces a round struck besides the one `to` names); an older page reads the shot as before and draws none of them,
 * an older room never sends it.
 * Additive since, the version kept: the `shot`'s `end` (2026-11-02, P12b; research 219 s3.2, 91 s23: the round's end
 * when `to` is the first body, the others' tracer drawn to it); an older page draws its tracer to `to` as before, an
 * older room never sends it.
 * Additive since, the version kept: the `grenade` event's `age` (2026-11-02, LATER 643; research 85 §6.1: a hand throw's
 * ticks from its release as the room flew it, so every page starts its copy there); an older page starts its copy at
 * the event as before, an older room never sends it.
 * Additive since, the version kept: the `kitHeld` event (2026-11-06, KIT-HELD: the seat's held type, picks and kit, so
 * the front end's match page opens WEAPON EXCHANGE on them); an older page ignores it, an older room never sends it.
 * 14 (2026-11-09, ENEMY-RAISE ER-2; reading, reviewed: REVIEW-ER2-AND-ER-BATCH.md 1): the owner's raise state, the original's one field -- its
 * console packs its own body's `FUN_005e0010` (`body+0xf74 & 0xef`, 1 up or 2 down) into the player record's byte +0x7e
 * every frame (`FUN_002bd640` D:L161978) and each receiver replays it on the copy (`FUN_002be150` D:L162310-162312).
 * Page to room: the command's `raised` (`Command.raised`), bit 7 of its last byte, the weapon narrowed to the three bits
 * below it (its codes 0 and 1); room to pages: `BodyFlag.Raised`, bit 16 of the u32. A per-tick binary field bumps the
 * version (PF.R33): a 13 room would read the bit as weapon 8 or 9, so the two refuse each other at the hello
 * (`Room.hello`, the page's version text). The binary wire is otherwise 13's: a 13 command never set bit 7 and a 13
 * room never set bit 16, so a 13 `.s2r` plays on the live decoders (match `replay/format.ts` `DECODERS`), its copies on
 * the old inference (`../remotePlayers` `setRaiseField`).
 */
export const PROTOCOL_VERSION = 14;

/** ENEMY-RAISE ER-2: the first protocol whose bodies carry their owners' raise state (`BodyFlag.Raised`). */
export const RAISED_SINCE_PROTOCOL = 14;

/**
 * A hello's `session` token (S2 round 4): base64url, 22 characters (128 bits, the page's own) to 64. Anything else is
 * ignored -- the hello joins as a page without one would.
 */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

/** Whether `v` is a session token's shape (`SESSION_TOKEN_PATTERN`). */
export function isSessionToken(v: unknown): v is string {
  return typeof v === 'string' && SESSION_TOKEN_PATTERN.test(v);
}

/**
 * NCW-10 (an instrument with no original, the product track): a build time, UTC to the minute, `YYYY-MM-DDTHH:MMZ`
 * (`2026-11-05T01:32Z`) -- the hello's `builtAt` (the page's Vite build stamp, its seconds truncated: `viewerBuiltAt`),
 * the same FORMAT as the host's `RELEASE_BUILT_AT` (the web-image grace's, `agent/web-grace`) -- not yet the same VALUE:
 * the page's stamp is Vite's own clock read and the host's a separate one, until one stamp feeds both (filed with the
 * controller for that deploy work). The one pattern the page,
 * the room (`clientBuiltAtOf`) and central's reader validate it with. The day is checked 01-31 only (not against its
 * month): a string, compared stamp for stamp, never a date the room computes with.
 */
export const BUILT_AT_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\dZ$/;

/**
 * The close a connection replaced by its session's newer one gets (a server policy). The replaced page, told `kicked`
 * 'replaced' first, renews its token and joins again as a new joiner (`../netPage` `NetPage`'s `kicked` case: the usual
 * rejoin after the close, its own line in the message window).
 */
export const SESSION_REPLACED_CLOSE = { code: 4006, reason: 'replaced by a newer connection of this page' } as const;

/**
 * SVC-23e (research 264 §4): the VOTE ALL line every console prints for a Spec Vote (`FUN_002b9bd0` D:L159587-159597,
 * `FUN_001988d0`'s format, the voter's name and the votes standing) -- S:0x3f25e0 for a vote against the spectators,
 * S:0x3f2620 for one for them, each with the leading space the ELF's bytes hold (the team vote's own line, S:0x3f26c0,
 * has none). The page's message window draws it (not built).
 */
export const SPECTATOR_VOTE_FORMATS = {
  against: ' %s voting against spectators: %d votes against.',
  for: ' %s voting for spectators: %d votes against.',
} as const;
/** SVC-23e: the line every console prints at the eject (S:0x3f2650; `FUN_002b9bd0` D:L159601, `FUN_002b9d80` D:L159625). */
export const SPECTATORS_EJECTED_TEXT = 'Spectators EJECTED from this game.';
/** SVC-23e: a `spectatorVote` event's line, as the console formats it (`SPECTATOR_VOTE_FORMATS`). */
export function spectatorVoteText(ev: { name: string; against: boolean; count: number }): string {
  // One pass over the format: a name holding `%d` or `$&` is printed as it is.
  return (ev.against ? SPECTATOR_VOTE_FORMATS.against : SPECTATOR_VOTE_FORMATS.for).replace(/%[sd]/g, (m) => (m === '%s' ? ev.name : String(ev.count)));
}

/**
 * HARD-SEAT (the review's fix round, 2026-10-04): the close of a hello the server failed to answer -- the room threw
 * seating it, or the join's own work threw (`server.ts`) -- while the room, and a game, may well live on: a page may
 * try again. 1011 stays the room's own failure (`stepRoom`: the room dropped; a game's game ended) and a map that would
 * not load. A server policy, the transport's code (4010-4019 the server's join range).
 */
export const JOIN_FAILED_CLOSE = { code: 4010, reason: 'join failed' } as const;

/**
 * NET-DRAIN (OT.R38 / H117; web research 223 §7): a hello refused while the server drains for a restart -- the `refused`
 * event with this reason, then the close (4003, as 'not logged in'). The page shows the line and tries again on the drop's
 * backoff (`NetPage`), so it rejoins the restarted server without a reload; any other refusal is final. A server
 * adaptation (the console had no server restart).
 */
export const SERVER_CLOSING_REFUSAL = { code: 4003, reason: 'server closing' } as const;

/**
 * OBF-4 (OBF.R4, the owner 2026-10-30; a browser and service adaptation with no original): a placed game's seats closed at
 * its match's end because its host's update is pending (`match/src/game.ts` `updatePending`) -- in place of the return to
 * the game's lobby. Final for the page (`GAME_FINAL_CLOSES`: no retry); the page shows its post-match warning and reloads
 * (`../serverUpdate`). 4022: past the server's join range (4010-4019) and the map rotation's 4021.
 */
export const SERVER_UPDATE_CLOSE = { code: 4022, reason: 'server updating' } as const;

/**
 * NET-DRAIN: how long the page goes on retrying after its first 'server closing' refusal, ms -- the server's drain bound
 * (`DRAIN_MAX_MS_PLACEHOLDER` in `server.ts`, 1,260,000: the original's longest round and a minute; a server test pins the
 * two together) and a minute for the restart. By time, not by count: the retry's cadence differs (a local server's 3 s,
 * the backoff's 10 s). Past it a refusal is final. A browser adaptation.
 */
export const SERVER_CLOSING_RETRY_MS = (1200 + 60 + 60) * 1000;

/** The game's tick (`CGame::Tick`): the mover's `TICK`, the server's loop. */
export const TICK_HZ = 60;
/** Snapshots a second (W3.R10: every second tick; 30 Hz measured against 20 Hz in the sprint's findings). */
export const SNAPSHOT_HZ = 30;
/** The players a round holds (the owner's ask; the game's own MP limit is 16, research 91). */
export const MAX_PLAYERS = 16;
/** Authored multiplayer-bot extension (FBA.R3); not a retail setting. */
export type BotSetting = 'off' | 'fill' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface BotSettings { seal: BotSetting; terrorist: BotSetting }
/** The spectators a room holds in its queue, past which a join is refused (not the game's: the server's guard). */
export const MAX_SPECTATORS = 32;
/** How many of its last commands a client repeats in each batch, for a lost frame on a lossy transport. */
export const COMMAND_REDUNDANCY = 3;
/**
 * The rewind a shot may ask for (W3.R4): the shooter's view time is clamped to this far behind the server. Since NCW-2
 * B-bound (the owner's OT.R105) it is the FLOOR of the room's per-seat cap: a seat with no measure of its line, or one
 * whose line explains less, keeps this; the room grows a seat's cap above it by the seat's measured round trip
 * (`rewindCapMs`, match `room.ts`) up to `REWIND_CEILING_MS_ADAPTATION`. Its other readers (the crane press's lag bound,
 * `CRANE_PRESS_LAG_BOUND_ADAPTATION`) keep 200.
 */
export const MAX_REWIND_MS = 200;
/**
 * REWIND_CEILING_MS_ADAPTATION (OT.R105, the owner's ruling of 2026-11-05 on LOW-9, verbatim "400 is acceptable yes";
 * research 223 §4 and LOW-9; a simulation-track ruling on a browser adaptation): the most any seat's rewind reaches, ms
 * (24 ticks at `TICK_HZ` 60), however long its measured line. The original had no rewind to bound: its shooter resolved
 * the hit on his own picture and the victim's console applied it (research 193 §12.6). The cost, named in the ruling: a
 * low-ping victim can be struck up to the extra rewind (this less `MAX_REWIND_MS`) behind cover -- 13 units at the run
 * speed's 65 u/s (`seal_run`) -- and a seat that forges its measure buys this, the same as an honest high-ping seat,
 * and no more: `pongSentAt` (match `server.ts`) takes any payload at or before now as the ping's send time, and the ws
 * library emits unsolicited pongs, so a non-browser client can send crafted pongs and move `pingExact` either way in
 * about 25 frames (B-bound's review F5; LATER 717: accept only a pong matching an outstanding ping).
 */
export const REWIND_CEILING_MS_ADAPTATION = 400;
/**
 * The others are drawn this far behind the server: two snapshot intervals and a margin for jitter. Kept here (it was
 * `net/client.ts`'s, which re-exports it) since NCW-2 B-bound: the room's per-seat rewind cap counts it.
 */
export const INTERP_DELAY_MS = 100;

/**
 * SEAT_HOLD_MS_ADAPTATION (NET-RES.R4, the owner's ruling of 2026-10-23 in the deploy seat: "the hold is 3 minutes";
 * OT.R77, an adaptation under OT.R27 -- the original has no reconnect, a lost console is a leave, `FUN_002bc530`
 * D:L161109-161146): how long the room holds an account's seat whose socket closed unannounced (no `bye`), counted from
 * its last frame, ms. Past OT.R59's body hold (`RECONNECT_ALIVE_WINDOW_MS_ADAPTATION`, 10 s) its body is out of the
 * world and the seat alone is held (NET-RES.R5); a held seat counts for its side and the game's player count
 * (NET-RES.R6). The page retries through it (NET-RES.R9). Under central's `SESSION_SILENT_MS_READING` (300 s), so the
 * account's session outlives it. One constant, the room's and the page's.
 */
export const SEAT_HOLD_MS_ADAPTATION = 180_000;

/**
 * Binary frame types: the first byte of every binary frame (protocol 11, NET-WIRE: the snapshot 0, the voice 1). A peer
 * drops a frame of a type it does not take -- an unknown one, or one not meant for it -- and throws nothing.
 */
export const Frame = {
  /** Server -> client: a snapshot (`Snapshot`). */
  Snapshot: 0,
  /**
   * Either way: voice, reserved by protocol 11 for sprint 20's relay, which builds on this byte. Its codec is
   * `./voiceWire`. The room relays it (SVC-20b-relay: the floor's holder to its channel's members, research 225 §4); the
   * page's `NetClient` hands it to its voice client (`onVoice`, SVC-20b-page, research 226 §3).
   */
  Voice: 1,
  /** Client -> server: a batch of commands (`CommandBatch`). */
  Commands: 2,
} as const;
export type Frame = (typeof Frame)[keyof typeof Frame];

/** The buttons a command carries, as bits. Edges (a press) are sent once, on the tick they happened. */
export const Button = {
  /** The jump (pressed this tick). */
  Jump: 1 << 0,
  /** The action button pressed this tick (the ladder's slide, a climb). */
  Action: 1 << 1,
  /** The action button held (the slide from a ladder's head reads it held). */
  ActionHeld: 1 << 2,
  /** The lean held left / right (the peek). */
  LeanLeft: 1 << 3,
  LeanRight: 1 << 4,
  /** A stance change asked this tick: the target in `Command.stance`. */
  Stance: 1 << 5,
  /** The weapon swap asked this tick: to the sidearm when `Command.weapon` is 1, to the rifle when 0. */
  Swap: 1 << 6,
  /** The sprint (the camera's boost; the mover does not read it but the body's run does). */
  Boost: 1 << 7,
  /** The aim held (L1): the body raises the weapon. */
  Aim: 1 << 8,
  /** The trigger held this tick (the body's fire pose; the rounds themselves are `fire` events). */
  Trigger: 1 << 9,
  /**
   * The 9x view or a scope (`./zoom` state 4 and up): the mover's stick x 0.2 (`Walker.scoped`, `FUN_005966a0`). Not
   * `Aim`, which the night vision sets too and which does not slow the stick.
   */
  Scope: 1 << 10,
  /**
   * The binoculars are up (`./zoom` view state 4, `FUN_005b90f0`): the body raises them for the others to see (the
   * `*2binocular` motions) and the room takes no round from it (`FUN_005be9a0` 475305). Additive (2026-10-01): an older
   * room ignores the bit and an older page never sets it, so no version bump.
   */
  Binoculars: 1 << 11,
} as const;
export type Button = (typeof Button)[keyof typeof Button];

/**
 * The kit's hold started this tick (`Walker.hold`: a throw's clip, the claymore's placing, a still reload), in the
 * command's buttons from this bit: four bits, the clip's index in `HOLD_CODES` plus 1; 0 none.
 */
export const HOLD_SHIFT = 12;

/** A hold's bits for `Command.buttons` (`HOLD_SHIFT`). */
export function holdBits(clip: HoldClip): number {
  return (HOLD_CODES.indexOf(clip) + 1) << HOLD_SHIFT;
}

/** The hold a command's buttons carry, or null. */
export function holdOf(buttons: number): HoldClip | null {
  return HOLD_CODES[((buttons >> HOLD_SHIFT) & 0xf) - 1] ?? null;
}

/** The stance codes on the wire. */
export const STANCE_CODES = ['stand', 'crouch', 'prone'] as const;

/**
 * A command's stance codes (`Command.stance`): `STANCE_CODES`, then OT.R67's `'pop'` (3), the prone-pop
 * (`../stanceButton` `PRONE_POP_ADAPTATION`, `popStance`), which the room runs by the page's own rule
 * (`./moverSim` `MoverSim.prepare`). Additive, the version kept, as `Button.Binoculars` was: the nibble had room, an older
 * room reads the unknown code as stand (the get-up clip there), and an older page never sends it. A body's posture
 * (`BodyState.stance`) is never `'pop'`: it keeps `STANCE_CODES`.
 */
export const COMMAND_STANCE_CODES = [...STANCE_CODES, 'pop'] as const;

/** One 60 Hz tick of a client's input: what `Walker.tick` and its buttons take. */
export interface Command {
  /** The tick's number, from 1, per connection; wraps at 2^32 (never in practice: 2.2 years at 60 Hz). */
  seq: number;
  /** The stick, -1..1 each (quantised to 1/127). */
  forward: number;
  right: number;
  /** The look after the tick's look law, degrees (yaw 0..360 to 1/182; pitch -90..90 to 1/100). */
  yaw: number;
  pitch: number;
  /**
   * The look's turn, radians a second, left positive (`Walker.turn`, `actor+0x48`): past 0.1 of `turn_maxrate` it cuts
   * an interruptible action, so the server must see the turn the client's mover saw (to 1/1000).
   */
  turn: number;
  /** `Button` bits. */
  buttons: number;
  /** The stance asked when `Button.Stance` is set: an index into `COMMAND_STANCE_CODES` (OT.R67: 3, the prone-pop). */
  stance: number;
  /** The weapon asked when `Button.Swap` is set: 0 the rifle, 1 the sidearm. Also the weapon in hand otherwise. */
  weapon: number;
  /**
   * SEP-POP (OT.R93): the page's stance mode is SEPARATE -- the room's mover takes SEPARATE's own as the page's does
   * (`Walker.stanceSeparate`: the velocity left at a push, the pop's code ignored), and, a stating command, the stick's
   * cut of the stance clips in either mode unless the room has marked the seat AI -- a CPU's connection (`Conn.cpu`,
   * match `room.ts` `newSim`) or a seat the bots' brain adopts while it drives it (match `MatchBots.adopt`, a Forge
   * NPC) -- not this bit (COMBINED-CUT: `Walker.stanceCut`, `MoverSim.ai`; both laid by `./moverSim` `prepare`). On the wire bit 3 of the stance nibble (`./codec`); decoded
   * always, true or false. Absent (a command the room makes itself, a test's): the mover keeps what the last command
   * said. Protocol 12 (`PROTOCOL_VERSION`'s history): an 11 peer is refused at the hello.
   */
  separate?: boolean;
  /**
   * ENEMY-RAISE ER-2 (protocol 14; reading, reviewed): the page's own raise state is up -- its `../weaponRaise`
   * `WeaponRaise` after every term (the enemy count, the scope, the trigger's edges, the hand grenade's lower, the 5.0 s
   * countdown), as the original's owner packs `FUN_005e0010` into byte +0x7e every frame (`FUN_002bd640` D:L161978). The
   * room relays it on `BodyFlag.Raised`. On the wire bit 7 of the last byte (`./codec`); decoded only when set. Absent
   * (a CPU's command, a test's, a 13 page's): down.
   */
  raised?: boolean;
}

/** A batch: the newest commands, oldest first; the server skips the ones it has run. */
export interface CommandBatch {
  /** The client's estimate of the server tick it is drawing the others at (lag compensation, W3.R4), in ticks. */
  viewTick: number;
  commands: Command[];
}

/** The mover's state after a command, as the server ran it: what the client reconciles against. */
export interface OwnState {
  /** The last command run. */
  ack: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /**
   * Protocol 11 (NET-WIRE; NET-LOOK's design call, research 223 s8): where the room's mover faced after `ack`, degrees --
   * its yaw and pitch after the look gate (`./lookGate`). The page reconciles its own facing against it as it does its
   * position (`./client`), so a look the room held (a stall's, a skipped number's) is the page's within a snapshot.
   */
  facing: { yaw: number; pitch: number };
}

/**
 * Another player's body, as the animator takes it (`./animator` `MoverSnapshot`, `./mover` `PlaySnapshot`): what
 * the clips play by, quantised (`./codec`). The page interpolates `feet`, `yaw`, `pitch` between two snapshots and
 * takes the rest from the newer.
 */
export interface BodyState {
  id: number;
  feet: [number, number, number];
  yaw: number; pitch: number;
  vx: number; vy: number; vz: number;
  /**
   * `BodyFlag` bits, a u32 on the wire since protocol 11 (NET-WIRE): bits 0-10 the flags below, 11-14 the kit's hold code
   * and 15 the hold's start parity (the equip-anim fix's `BODY_HOLD_SHIFT` and `BodyFlag.HoldSerial`, their meanings kept),
   * 16 the owner's raise state (`BodyFlag.Raised`, protocol 14), 17-31 free. Protocol 10's u16 was full.
   */
  flags: number;
  /** `STANCE_CODES` index: the posture the body uses. */
  stance: number;
  /** `LANDING_CODES` index + 1, 0 none. */
  landing: number;
  /** The jumps taken, mod 256 (the animator sees a take-off by the count). */
  jumps: number;
  /** The ground state: 0 idle, 1 + stance code. */
  ground: number;
  groundForward: number; groundRight: number; groundCls: number;
  /** The action: `ACTION_CODES` index + 1 (0 none), its serial mod 256, its clock and length (s; length -1 none). */
  action: number; actionSerial: number; actionT: number; actionSeconds: number;
  /** The swap overlay: 0 none, else its serial mod 255 + 1; its clock and length. */
  overlay: number; overlayT: number; overlaySeconds: number;
  /** The turn, radians a second, left positive. */
  turnRate: number;
  /** The traversal clip: `TRAVERSAL_CLIPS` index + 1, 0 none; its key, its root (NaN none), its blend. */
  trav: number; travFrame: number; travRootY: number; travBlend: number; travBlendWeight: number;
  /** The peek: -1, 0, 1. */
  peek: number;
  /**
   * Protocol 7: the item in hand, its id (`ZWEAPON` `ID`, the kit's slot's item -- the game's current item,
   * `FUN_005c89d0`, in the character message, research 94 §A6): what the others draw, fire and hear. 255 none.
   */
  weapon: number;
  /** The firearm slot in hand: 0 the primary (the rifle's mounts), 1 the secondary (the sidearm's). */
  slot: number;
  /** `PlaySnapshot.stickSnaps`' low bit (the packed byte's spare bit 7): a flip starts the snap's 0.2 s cross-fade. */
  stickSnaps?: number;
}

/** `BodyState.flags`. */
export const BodyFlag = {
  Airborne: 1 << 0,
  Crouched: 1 << 1,
  ActionReversed: 1 << 2,
  OverlayReversed: 1 << 3,
  TravLoop: 1 << 4,
  TravHoldRootTurn: 1 << 5,
  /** Alive: a dead body plays its death and fades (research 91a section 3). */
  Alive: 1 << 6,
  Aiming: 1 << 7,
  Trigger: 1 << 8,
  Boost: 1 << 9,
  /** The binoculars are up (`Button.Binoculars`): the others play the body's `*2binocular` motion (additive, 2026-10-01). */
  Binoculars: 1 << 10,
  /**
   * The hold's start parity (`PlaySnapshot.holdSerial`'s low bit; additive, 2026-10-07): a flip under the same hold code
   * is the next throw, so the others restart its clip (`../throwPose` `follow`). The last of protocol 10's u16 (11-14 are
   * the hold code, `BODY_HOLD_SHIFT`); protocol 11's u32 keeps it here, with bits 16-31 free.
   */
  HoldSerial: 1 << 15,
  /**
   * ENEMY-RAISE ER-2 (protocol 14; reading, reviewed): the owner's raise state is up (`FUN_005e0010` 1; clear, 2 --
   * down), the original's byte +0x7e of the player record (`FUN_002bd640` D:L161978), which the copy replays as a request
   * (`FUN_002be150` D:L162310-162312 -> `FUN_005dfe30`) and runs its own envelope from (`../remotePlayers` ->
   * `../weaponRaise` `RaiseInput.raised`). Set by the room from the page's `Command.raised`, or a bot's controller
   * (`Player.raise`); never for a dead body.
   */
  Raised: 1 << 16,
} as const;
export type BodyFlag = (typeof BodyFlag)[keyof typeof BodyFlag];

/**
 * The kit's hold on a body (additive, the version kept: research 85 s8.1): the mover's held one-shot -- a throw, a
 * placing, a still reload -- as its `HOLD_CODES` index plus 1 in `BodyState.flags`' four bits from here (0 none), so the
 * others' animators play the throw's and the placing's clip (`./body` `snapshotOf`, `../throwPose` `follow`). An older
 * page reads no flag there and draws no clip for it.
 */
export const BODY_HOLD_SHIFT = 11;

/** A body's hold bits (`BODY_HOLD_SHIFT`) for a hold clip, 0 for none. */
export function bodyHoldBits(clip: HoldClip | null | undefined): number {
  const i = clip ? HOLD_CODES.indexOf(clip) : -1;
  return i < 0 ? 0 : (i + 1) << BODY_HOLD_SHIFT;
}

/** The hold a body's flags carry, or null. */
export function bodyHoldOf(flags: number): HoldClip | null {
  return HOLD_CODES[((flags >> BODY_HOLD_SHIFT) & 0xf) - 1] ?? null;
}

export const LANDING_CODES = ['soft', 'hard', 'harder'] as const;
export const ACTION_CODES = [
  'jump', 'launch', 'fall', 'land', 'landHard', 'standToCrouch', 'crouchToProne', 'standToProne',
  'hit', 'hitStomach', 'landDeath', 'getUp', 'swapStand', 'swapCrouch', 'swapProne',
  'fallForward', 'fallBackwards', 'landBackwards', 'getUpBackwards',               // the blast's knock (`./blast`)
  'proneCover',                       // PF-19 (PF.R38): appended -- every earlier code keeps its byte (`./blast`)
  'rifleToLauncher', 'pistolToLauncher',   // PAR-84 (research 230 s5.2.10): appended, as PF.R38's -- no byte moves
  'swapRifleExchange', 'swapRifleClaim',   // NU-5 (research 323 s1.5, 324 s1.4): appended, as PAR-84's -- no byte moves
] as const;

/** One snapshot, for one recipient. */
export interface Snapshot {
  /** The server tick it was taken at. */
  tick: number;
  /** The recipient's own mover (absent for a spectator, or a player waiting to respawn). */
  own: OwnState | null;
  /** Every body in the round but the recipient's own. */
  bodies: BodyState[];
  /**
   * DOORS (`../doors`, socomlegacy/docs/research/92-doors.md), then MAP-07's gates (`../gates`): every door in `actions.rdr`
   * order, then each lever gate (`gate_move*`) in `readGates` order. The same `DoorWire`. For a gate, `valve` is the
   * leaf's pose (1 open, 0 shut) and `phase` is the slide (`PHASE_REST` through the lever's lead-in, and at rest). The
   * page's `DoorSet` reads the head and its `GateSet` the tail (`doorCount`). Absent when the map has neither.
   */
  doors?: DoorWire[];
  /**
   * Chain Reaction's hooks (`../cranes`, research 176 §9): every hook, in spec order. Present only on a map that has
   * them, so a snapshot of any other map keeps the bytes it had. The room runs them; the page copies this.
   */
  cranes?: CraneWire[];
  /**
   * Protocol 10 (MAP-03): the room's world (`../worldState` `WorldState.wireAll`). Protocol 11 (NET-WIRE, the owner's
   * OT.R38 / H118): on the wire only in a snapshot whose revision or round epoch differs from the last the connection was
   * sent -- the welcome's or an earlier snapshot's (`Room.snapshots`) -- and absent otherwise, the page keeping the last
   * (`epochNewer` still guards the round's boundary). The page lays it on its world before the snapshot corrects its
   * prediction (`./client`).
   */
  env?: EnvWire;
}

/**
 * Protocol 10 (MAP-03; research 209 s11): the world as the room has it -- a design, not the game's (research 175 s7
 * "proposed": the original replays every non-zero valve to a joiner, `FUN_002b4440` D:L156767, research 92 s1; the web
 * sends the instances' states, which its bridges and barriers need, research 171 s4).
 *
 * - `revision`: the room's `Grid.revision` (`WorldState.revision`), one more at every change and at every round's reset;
 *   u32 on the wire. Informational to the page, whose own grid keeps its own count.
 * - `epoch`: the round serial (`Room.roundSerial`: one more at every round's start, never reset), u16 on the wire (it
 *   wraps after 65 536 rounds: compare with `epochNewer`). 0 before the first `startRound`.
 * - `states`: every placed instance whose own active flag differs from its flag after `applyInitial`, by instance id
 *   (ruling PF.R15; a path that repeats is listed once, under its first id: research 209 s8) -- the WHOLE difference,
 *   never a delta (`WorldState.apply` puts every node not listed back at its opening flag). Ids u16, count u16.
 */
export interface EnvWire { revision: number; epoch: number; states: { id: number; active: boolean }[] }

/** Whether round epoch `a` is later than `b`, on the wire's 16 bits (a serial-number comparison: a wrap is later). */
export function epochNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

/**
 * One door on the wire, two bytes: its valve (the game's `CValve` value: 0 shut, 1 open, clamped to a byte) and how far
 * its swing has run, 0..255 of the swing's seconds -- 255 at rest.
 */
export interface DoorWire { valve: number; phase: number }

/**
 * One Chain Reaction hook on the wire (research 176 §9.3): valve 0 moving, valve 1 paused, the leg index, the
 * milliseconds into that leg, the milliseconds into the 2 s swing (`swingMs`, 0..1999), and which control meshes are
 * drawn (`mesh`: 0 both, 1 `go_on_switch` only, 2 `go_off_now` only). Seven bytes. A late join copies these; it does
 * not restart the leg. The mesh is not the valve: a hook starts moving with `go_on_switch` shown and `go_off_now`
 * hidden, and a pause is paused with only `go_off_now`. The mesh swap is the lever.
 */
export interface CraneWire { valve: number; leg: number; ms: number; swingMs: number; mesh: number }

// ---- the JSON events --------------------------------------------------------------------------------------------

export type Team = 'seal' | 'terrorist';
/**
 * Protocol 9: a character type on the wire -- the ARMORY's column within the player's side (`MpCharSet` - 1, less 4 for
 * the Terrorists; research 95 §4.2), 0 SEAL 1 / TERRORIST 1 (the default, R95.5) to 3.
 */
export type CharType = number;
export type Role = 'player' | 'spectator';

/**
 * A room's rules (`./rules`). `respawn`: SUPPRESSION with RESPAWN on, one timed round that is the match (W3.R11).
 * `classic`: respawn off, the create-game default ("Respawn is disabled.", UIMnLOC 249-250; research 91 section 9):
 * 11 rounds, first to 6, a round ended by elimination or by the clock (a draw), the dead spectating their living
 * teammates until the next round.
 */
export type Rules = 'respawn' | 'classic';
export const RULES_CHOICES: readonly Rules[] = ['respawn', 'classic'];
/** A value off the wire or the address as rules, or null. */
export function parseRules(value: unknown): Rules | null {
  return value === 'respawn' || value === 'classic' ? value : null;
}

/**
 * Whether the respawn rules are offered. On since OT.R71 (the owner, 2026-10-22: "the intention is to have respawn
 * functional as a match option on live match creation (as well as the test room)"), which lifts the ruling of
 * 2026-09-29 that switched it off. CREATE GAME's RESPAWN row on every server that hosts games, the page's `rules=` and
 * remembered choice (`../rules`, the test room), the offline match (`./loopback`) and the match server's rooms
 * (`@s2u/match` `server.ts`) all play what is asked. A test may still pass `false` to pin the classic-only path.
 */
export const RESPAWN_RULES_ENABLED = true;

/**
 * The rules a room is opened under for `asked` (a hello's, the page's, the environment's; null or undefined: none
 * named): with respawn off always classic; with it on, what was asked, and classic when nothing was -- the original's
 * default, respawn off: the create screen's first arrival (`init_cg_screen`) and RESTORE DEFAULTS both set respawn 0
 * (research 163 R163.2; before OT.R71 this default was respawn, the web sprint's own).
 */
export function offeredRules(asked: Rules | null | undefined, respawnEnabled: boolean = RESPAWN_RULES_ENABLED): Rules {
  if (!respawnEnabled) return 'classic';
  return asked ?? 'classic';
}

/** Client -> server, text frames. */
export type ClientEvent =
  /**
   * Research 303 (additive under protocol 11): the VICTORY DANCE asked of the room -- the release of the action on it
   * (`./victory` `VictoryPage`). `request` rises per press; the room checks the corpse in reach, the actor's state and
   * its rate, picks the variant (`FUN_005e5970`) and answers `victory` to every page, or `victoryOffer`.
   */
  | { type: 'victory'; request: number }
  | ({ type: 'taunt' } & import('../taunts').TauntRequest)
  | ({ type: 'communication' } & import('../communications').CommunicationRequest)
  /**
   * Sprint 20, SVC-20b-relay (additive, the version kept; research 225 §4): the page's talk on / off -- the only floor
   * requests (the plan's constraint 4: the original's types 1 and 2, `FUN_0030e8e0` D:L210896-210964). The room names
   * the channel and the speaker; the page names neither.
   */
  | { type: 'voiceTalk'; on: boolean }
  /**
   * Sprint 20, SVC-20b-relay (additive): RADIO ON / OFF, or the ACTIVE CHANNEL 0 TEAM, 1 DEFENSE, 2 OFFENSE (W20.R4:
   * validated 0..2 by the room as `FUN_0022f950` does, D:L81576-81592; anything else dropped). In the game lobby, where
   * the radio is not drawn, the room takes only the lobby ARMORY's two, which the page sends as `GoneToArmory` goes 1
   * and 0: `{on: false}` its entry (11), `{on: true}` from 11 its return (9) -- the close review's F2, research 225 §4.2.
   */
  | { type: 'voiceRadio'; on: boolean }
  | { type: 'voiceRadio'; active: 0 | 1 | 2 }
  /**
   * `watch` (the map viewer's Online setting, 2026-09-29): join as a spectator that watches and never takes a player's
   * place -- not queued, never promoted. Optional, so a page that leaves it out (and a server that does not know it) is
   * as before.
   */
  | {
    type: 'hello'; version: number; name: string; map: string; watch?: boolean;
    /** Protocol 4: the rules of the room to join (the server's default when absent). */
    rules?: Rules;
    /**
     * Protocol 9: the page's character type for each side (its ARMORY record per side, research 95 §4.4) -- the room
     * seats the player on a side of its own choosing and rebuilds it as that side's type. Absent, or a type the map's
     * side does not offer: the default (R95.5).
     */
    types?: { seal?: CharType; terrorist?: CharType };
    /**
     * Protocol 9 (S2 round 4; additive, the version kept): the page's per-tab session token (`./session`,
     * `isSessionToken`: 128 random bits and more, base64url), the room's key for a departed player's record (its type,
     * its picks, the round it spawned in: `KEPT_RECONNECT_READING`) and for a takeover -- a hello whose token a live
     * connection of the room holds replaces that connection (`kicked` 'replaced', `SESSION_REPLACED_CLOSE`) and is seated
     * from its state. Absent or malformed: a new joiner, no record. Not a credential for anything else, never logged.
     */
    session?: string;
    /**
     * Web sprint 5, the S3 review (additive, the version kept): the page opens the ARMORY on its seats (W5.R1). The room
     * then says which seats open it (the welcome's and the promotion's `armory`) and holds their first spawn until the
     * page's `ready` (`ARMORY_SEAT_READING`, `../../../match/src/room`). Absent: every seat spawns as before.
     */
    armory?: boolean;
    /**
     * The S3 repair (additive, the version kept): the page's ARMORY is open as this hello goes -- a rejoin after a drop,
     * or a takeover, under the screen the page still shows. The room holds the seat it gives (`Player.arming`) as it
     * holds a first seat's, whether or not it took a record, so the screen's changes are still taken and the spawn
     * waits for its `ready` (`ARMORY_SEAT_READING`). Read only with `armory`.
     */
    armoryOpen?: boolean;
    /**
     * SVC-07a (additive, the version kept; research 159 §4): the game this hello joins -- a game made through the room
     * service (`/lobby/create-game`), the account seated in it by `/lobby/join-game` -- with the login's `ticket`, the
     * session's bearer (`/account/login`'s answer). The server seats the page in the game's match room under the
     * account's name (the hello's `name` is not read) and as the seat's join type (`watch` is not read); `map` and
     * `rules` are the game's. Absent: a map's room by `map`, as ever (the test room).
     */
    game?: number;
    ticket?: string;
    /**
     * SA-6b (the server split, SA.R22 (6); additive, the version kept; a browser adaptation, `../connectHost`
     * `GAME_DOOR_ADAPTATION`): a **placed** game's hello -- sent to the door central named -- carries the game token
     * central issued (SA-4's envelope, `packages/match/src/ticket.ts`) in place of `ticket`: with `game` only, never with
     * `ticket`; the login's bearer never goes to a door. A local game's hello is as above. SA-7h (S5, `../connectHost`
     * `ROOM_DOOR_ADAPTATION`): or with a standing room's `map` (and its `rules`, classic) -- the room pass's token, sent to
     * the room's door central named; no `game`, no `ticket`. LATER 275 (SA-7i): or with `forge` (its `id` only) -- a placed
     * forge lobby's token, signed by central at the create or at `POST /lobby/forge/lobby/<id>/token`, sent to the lobby's
     * door; never with a ticket (forge.ticket and the account's `forgeAccount` are not sent).
     */
    token?: string;
    /**
     * FG-25 (FG.R20, FG.R21; additive, the version kept; a browser adaptation with no original): the forge lobby this
     * hello joins (`POST /forge/lobby`'s `id`), and `ticket` the lobby's host ticket that create answered (the host's
     * page only: a wrong one is refused). The hello's own `ticket` above, when present, is the account's seat (its
     * name); absent, the page is a guest of the lobby (`Guest-<n>`). `map`, `name` and `rules` are not read.
     */
    forge?: { id: string; ticket?: string };
    /**
     * #337 (additive, the version kept; research 176 §9.3): the page reads the snapshot's Cranes section (bit 2,
     * `CraneWire`). The room sets the section for that connection only; absent, the page gets MP81's snapshots without
     * it -- the hooks stand still on its screen, nothing throws (a page from before #337 refuses an unknown bit).
     */
    cranes?: boolean;
    /**
     * NCW-10 (an instrument with no original, the product track; additive, the version kept): the page's build,
     * `viewerRev()` (`../revision`), and its build time, `viewerBuiltAt()` (`BUILT_AT_PATTERN`), each absent when Vite
     * wrote none. The room keeps them for the seat's round signals only (`build` bounded,
     * `CLIENT_BUILD_MAX_CHARS_ADAPTATION`); a malformed one is ignored, never refused, and a page that sends neither is
     * welcomed as before. Nothing played or scored reads them.
     */
    build?: string;
    builtAt?: string;
  }
  /** The ARMORY a seat opened on (`armory`) left: the seat's first spawn (web sprint 5, the S3 review; additive). */
  | { type: 'ready' }
  /**
   * Protocol 10 (agreed with the online lane for ONL-18, research 166): the page's loading screen has released, sent
   * once a load (`NetClient.reportLoaded`). No fields; the room reads none. ONL-18b (research 221): a launched game's
   * round 1 is held until every seated non-spectator has sent it (`FUN_002c4020` D:L165414-165441); outside that hold,
   * from a spectator, an unseated socket or twice, it is ignored.
   */
  | { type: 'loaded' }
  /**
   * LATER 64 (research 315 §12.1; additive, no version: the room ignores it): a late seat's READY -- its load started (the
   * console's `ReadyToLoad` late branch, major state 2, 314 §4.2). The original's console keeps its own late flag +0xcc
   * through that load and puts nothing on the wire; the services, which keep the flag for it (central `bridge.ts`
   * `SeatEntry.late`), learn the load's start from this, sent once (`NetClient.reportLateLoad`).
   */
  | { type: 'lateLoad' }
  /**
   * SVC-07a, a game's room before its launch (additive; research 159 §5): the GAME LOBBY's READY (`ReadyToLoad`, a
   * toggle), SWITCH TEAMS (`SwitchSides`) and the host's launch (`ForceMPLaunch`). Each is answered with `gameLobby`.
   */
  | { type: 'lobbyReady' }
  | { type: 'switchTeams' }
  | { type: 'launch' }
  /** FBA.R3: the lobby host's per-team bot choice, accepted only before launch. */
  | { type: 'lobbyBots'; team: Team; setting: BotSetting }
  /**
   * CLAN-SWAP (additive, protocol 11 kept; research 309 §4-§5): the host page's `ClanGameSwapSides(FINISH)` in the lobby a
   * full game returned to -- "Alternate teams"' swap (`FUN_002bada0` -> `FUN_002c0040` D:L162973-162982). No fields. The
   * room takes it only from the host, in affiliation 4, once per return, and answers with `gameLobby` (every side flipped)
   * or its `refused`; a server without it ignores it (the room's `text` drops an unknown type).
   */
  | { type: 'clanSwap' }
  /**
   * SVC-18 (additive; research 263 §1): a line in the game's lobby -- `SendChatText` with no recipient, which the original
   * sends to the game session's peers (`FUN_002ba870` D:L160067-160114). A game seat's only: the bridge cuts it to 63
   * characters and relays it as `chat` to the game's other seats its scope reaches, in every state (SVC-19, research 266
   * §3.1); the maps' rooms ignore it. A whisper is the lobby's (`/lobby/chat`), never this. SVC-19 (additive): `team`,
   * the sender's `ChatRecipient` non-zero (the keyboard's TEAM/ALL key, D:L160079-160081) -- the server gives the line
   * its scope from the seat's side (`chat.ts` `gameChatScope`); absent, ALL.
   */
  | { type: 'chat'; text: string; team?: boolean }
  | { type: 'name'; name: string }
  | { type: 'ping'; t: number }
  /**
   * OT.R59 (RECONNECT-GHOST step 2; additive under protocol 11, a labelled adaptation): the page's own leave said before
   * its socket closes (`NetClient.close`, its pagehide's capture listener `NetPage.onPageHideBye`): the room never parks a
   * seat whose socket said it (`server.ts` `session.bye`); an unannounced close, whatever its code, may park it.
   */
  | { type: 'bye' }
  /**
   * A round fired (W3.R4): the tick it left on, where from and along what (the client's cone and kick already in),
   * the weapon, and the view tick the shooter saw the others at. Protocol 5: `eye` and `aim`, the eye's ray the round
   * was aimed down (the camera's eye and its look after the cone, `./fire`): the server checks them against its own
   * run of the cone (`./shotCone`) and that the round goes where that ray points. The server takes the weapon from its
   * own mover, not from `weapon` (kept for the wire's shape).
   */
  | {
    type: 'fire'; seq: number; from: [number, number, number]; dir: [number, number, number]; weapon: number; viewTick: number;
    eye: [number, number, number]; aim: [number, number, number];
    /**
     * NCW-17 (additive under protocol 13, no bump; an instrument, a labelled adaptation with no original): the page's
     * displayed tick at the round's firing (`NetClient.shownTick`: the snapshot tick its drawn others stand at -- the view
     * tick while two snapshots bracket it, the held snapshot's in a gap). The room only counts it (`room.ts` `noteRewind`):
     * nothing is judged by it, a bad one is ignored, and a round without it (an older page, a bot) is taken as before.
     */
    shownTick?: number;
  }
  | { type: 'reload'; seq: number }
  /**
   * LATER 72 (additive under protocol 11; research 313 s8.3): a reload's press, at the command it rode -- the start of its
   * delay timer (`ReloadDelay`, `kit+0x820`), which the room cannot otherwise see (the `reload` comes at the clip's
   * start). The room uses it for the climb's offer lock alone (`FUN_005a7ab0` D:L469416): refused from this command for
   * the delay's commands. An older room ignores it.
   */
  | { type: 'reloadPress'; seq: number }
  /**
   * A throw (research 85): the grenade's kind, launch point and velocity as the client's `launchGrenade` made them.
   * PF-13 (additive under protocol 10, no bump): C4's plant names its `target` (a `SceneDestructible.id`) and the
   * `surface` the aim ray struck (the polygon owner's path and the point); the room checks both (ruling PF.R18).
   */
  | {
    type: 'throw'; seq: number; kind: string; from: [number, number, number]; velocity: [number, number, number];
    target?: number; surface?: { path: string; point: [number, number, number] };
    /** THROW-INTERRUPT (additive, protocol 11 kept): a hand throwable's `throwStart` seq, echoed when the hand opens. */
    start?: number;
    /** MLS-EQ (additive, protocol kept): exact absolute kit slot 2-4; legacy requests omit it (research 361 §3). */
    slot?: number;
    /**
     * LATER 305 (additive, protocol 11 kept): C4's plant -- the camera eye the page's aim ray left when it struck `surface`
     * (`WalkMode.fireAim`, the plant's start). The room holds it to the camera's locus before it uses it for the point's
     * line (`lookFitsPoint` with an eye); without it, the room's own rule as before. An older room ignores it.
     */
    eye?: [number, number, number];
  }
  /**
   * THROW-INTERRUPT (research 326 §2.4; additive, protocol 11 kept): a hand throwable's release request -- the kind in
   * the hand and the command it was asked on -- which the room keeps until the hand opens (the `throw` echoing `seq` as
   * `start`), for the original's drop at a death before then (`FUN_00547af0` -> `FUN_005b8920`, D:L413023, D:L471751-471870).
   */
  | { type: 'throwStart'; seq: number; kind: string; slot?: number }
  /** The scoreboard asked for (Select/Tab): the server answers with `score`. */
  | { type: 'score' }
  /** W3.R13, research 91 section 17: "VOTE RETAIN:REMOVE" on a teammate, toggled; `remove` false retains. */
  | { type: 'vote'; target: number; remove: boolean }
  /**
   * SVC-23e (additive, protocol 11 kept; research 91 section 17 1.1, research 264 §4): "VOTE ALL ON:OFF" under the TCM's
   * SPECTATORS, toggled (`FUN_0022f0f0` D:L81252-81280); `on` true votes the spectators out ("VOTE ALL REMOVE",
   * S:0x3e5cc0), false retains them ("VOTE ALL RETAIN", S:0x3e5cb0). The page's menu entry is not built.
   */
  | { type: 'voteAll'; on: boolean }
  /**
   * DOORS: the action button on the door under the reticle (`FUN_005aa240`'s pick), by its index in `actions.rdr`; the
   * command number it was pressed on. The server checks the reach and runs it (`DoorSet.use`). LATER 362 (additive):
   * `press`, the action button's chased pressure at the release (`chaseActionPress`), from which the room picks the
   * kick (`doorPick`); an older page sends none -- the open. The network's bookkeeping: the room sees no pad.
   */
  | { type: 'door'; seq: number; door: number; press?: number }
  /**
   * XR-04 (additive under protocol 10, PF.R33): the action button on a map action under the reticle that is no door -- a
   * Crossroads switch (`./actionPage`) -- by its index in `MapMeta.actions`, with the `surface` the aim ray struck (the
   * polygon owner's path and the point), as C4's plant names it. The room checks the reach from the point
   * (`actionAtPick`, `FUN_005aa240`), the head's line to it, the use this round, and runs the action's program. A gate
   * lever (MAP-07) is the exception: the room toggles it without marking it used, and the slide rides `Snapshot.doors`.
   */
  | {
    type: 'action'; seq: number; action: number; surface: { path: string; point: [number, number, number] };
    /**
     * LATER 305 (additive, protocol 11 kept): the camera eye the page's aim ray left at the press (`WalkMode.fireAim`).
     * The room holds it to the camera's locus before it uses it for the point's line (`lookFitsPoint` with an eye);
     * without it, the room's own rule as before. An older room ignores it.
     */
    eye?: [number, number, number];
  }
  /**
   * XR-05 (additive JSON, protocol 10 kept: PF.R33; research 214 s1): the bomb's manual drop (action 6, mask 0x40,
   * `FUN_005937c0` D:L452458-452473), at command `seq`. The room judges it on its own state -- the bomb carried, the
   * cooldown, the last command's stick and aim (`./objective` `canDrop`). The plant's and the defuse's holds need no
   * event: the room counts them from `Button.ActionHeld` on the commands it runs.
   */
  | { type: 'bombAction'; seq: number; action: 'drop' }
  /**
   * PLANT-AIM (additive JSON, protocol kept; research 214 §2, `./objective` `PLANT_REACH_READING`): the page's pick for the
   * plant -- the surface its action ray strikes (`actionRayPick`, the polygon owner's path and the point) and the eye the
   * ray left -- named while it carries the bomb and that pick offers its side's site, `surface` null once it does not. The
   * room keeps the last one and re-picks it, every tick it reads it, along the newest command's look on its own grid
   * (`match/src/room.ts` `plantAimSees`); the plant's hold counts only while that strikes it. Protocol 13 (the review's
   * F2): a page that cannot send it cannot plant, so an older one is refused at the hello. Named when the struck node
   * changes, else at most past `../bombPage` `PLANT_AIM_RESEND_ADAPTATION` (F3).
   */
  | { type: 'bombAction'; seq: number; action: 'aim'; surface: { path: string; point: [number, number, number] } | null; eye?: [number, number, number] }
  /**
   * MAP-10b (additive under protocol 10, PF.R33; ruling PF.R31): the action button on a manual turret in reach (`mount`,
   * `./emplacement` `canMount`) or on the one the page holds (`dismount`), by its id (`TurretPlacement.id`), at the
   * command number it was pressed on. The room owns the occupant: it checks the reach and the facing, the first
   * request of a step by the lower seat id (`FIRST_REQUEST_WINS_READING`), and answers with a `turret` event.
   * LATER 104 (research 215 s7.9; `./emplacement` TURRET_RELEASE_SEQ_ADAPTATION): a `dismount` is taken on the first command
   * above its `seq` the room runs, not at its arrival; refused 'mounting' iff `seq` is below the mount's `steer.after` +
   * `SeatSteer.ends` (the 16 steer steps and the hold's command: the page's own clip still on by its count), the occupant
   * told (`turret`'s `refused`);
   * held while the room's own steer still runs (a command lost) and taken on the first command after its hold. One
   * pending a seat. The page predicts the release at the press when its own clip is off (`../turretPage` `action`).
   */
  | {
    type: 'mount' | 'dismount'; seq: number; turret: number;
    /**
     * A1 (additive, protocol 11 kept): on a `mount`, this page will name its take (`mountTake`). The room reserves the
     * turret at `seq` (`turret`'s `reserved`) and takes the body before the command the word names. Absent (an older
     * page): taken at the ask, as before. Ignored on a `dismount`.
     */
    word?: true;
  }
  /**
   * A1 (additive, protocol 11 kept; `./emplacement` MOUNT_WORD_BOUND_ADAPTATION): the command `seq` on which this page took
   * the turret reserved for it -- the next it sent after it heard the reservation (`../turretPage` `takeOwn`). The room runs
   * the page's commands below `seq` on foot and takes the body before `seq` (`room.ts` `takeMount`). It refuses a word at
   * or below the ask's command ('stale') or past the seat's newest command + FIRE_ARRIVAL_JITTER_TICKS ('ahead'). With
   * none inside the ask's window (2 s), it takes the body at the bound. An older room passes it by.
   */
  | { type: 'mountTake'; seq: number; turret: number }
  /**
   * PF-34 (additive under protocol 10, PF.R33; ruling PF.R54; research 234 s3): the action button on a weapon drop in
   * reach (`../drops` `WorldDrops.prompt`), by its `did`, at the command number it was pressed on. The room is the one
   * arbiter (the original routes the request to the actor the pickup's composite id names, `FUN_0059f610`
   * D:L458314-458332 -- `PICKUP_ROUTE_READING`): it judges the claim against that command's frame and resolves the tick's
   * claims by the lower seat id (`DROP_SAME_TICK_READING`). An ammunition bundle is never claimed: it is taken by walking.
   */
  | { type: 'pickup'; seq: number; did: number }
  /**
   * HX-4a (additive under protocol 10, ruling HX.R7; research 239 s3): the page's order to a hostage -- FOLLOW! (`cmd` 4)
   * or HOLD POSITION (5) -- with the page's aim (`eye`, `dir` unit, as `fire` carries them), at the command number it
   * was pressed on. The original forwards {issuer, hostage, cmd} to the host (`FUN_002bb970` D:L160726-160750, 8 bytes),
   * which applies it unchecked (`FUN_002bb8e0` D:L160706-160721); the room runs the issuer's console's test itself
   * (`ORDER_VALIDATION_READING`: `./hostageOrder` `orderTestRefusal`) and tells the outcome as `hostageState`.
   */
  | { type: 'hostageOrder'; seq: number; hostage: number; cmd: 4 | 5; eye: [number, number, number]; dir: [number, number, number] }
  /**
   * Protocol 7 (web sprint 4 M9; `PICK_WIRE_READING`): the weapon select's confirmed picks (`@s2u/scene` `Pick`: a slot
   * 0-4 and an item id), every one since the map's match began for the page's side, in order -- the room replays them
   * from the character type's own kit (`applyPicks`, W4.R6) and keeps the result as the next round's (R94.3). The
   * whole list each time, so a request lost, repeated or sent again after a reconnect lands on the same kit.
   */
  | {
    type: 'loadout'; picks: { slot: number; id: number }[];
    /**
     * Protocol 9: the character type the picks replay from and the next spawn rebuilds the body as (the ARMORY's
     * `ChangeCharacterType`, research 95 §4.2 S1a); absent, the type held. One the side does not offer is refused (`type`).
     */
    char?: CharType;
    /**
     * Protocol 9: a spectator's ARMORY choice for each side (its `picks` empty; not answered): the room keeps it as the
     * hello's `types`, and seats a promotion as it. One reaching the room after the promotion (a player's, with no
     * `char`) is taken as the player's side's type under the request's gates, still unanswered (`Room.lateTypes`).
     */
    types?: { seal?: CharType; terrorist?: CharType };
  };

/**
 * A row of the scoreboard (research 87 section 12, 91). CLAN-TAG-ROUND (additive, the version kept; research 275 §2.1):
 * `clan`, the seat's clan tag as the server read it at the seat (`CLAN_TAG_AT_SEAT_READING`), absent with none; an older
 * page ignores it.
 */
export interface ScoreRow {
  id: number; name: string; team: Team; kills: number; deaths: number; score: number; alive: boolean; ping: number; clan?: string;
  /**
   * The round block (additive, the version kept; research 216 §8): this round's kills (+0x598), deaths (+0x59e) and
   * score (+0x5c8, the +5 and +1 bonuses in it) beside the match totals the three above are (+0x550, +0x556, +0x580;
   * the SELECT board draws the sum of both, `FUN_0022a290` D:L79060-79084). ROUND COMPLETE's and FINAL ROUND's lists
   * draw these (`RoundStatLbContents*`: the getter 0x225fe0 = `+0x58c`; `FUN_00223680` D:L75946-75947), GAME COMPLETE's
   * the totals (`GameSealsTotLbContents` / `GameTerrsTotLbContents`, filled by `FUN_00225bc0` via `FUN_002241c0`
   * D:L76208-76214 from the match block, the `+0x544` sum at D:L76987; PR #484's review F1). Absent from an older room:
   * the page lists the totals there, as before.
   */
  roundKills?: number; roundDeaths?: number; roundScore?: number;
  /** FBA.R12: trusted CPU identity, independent of display name/skin. */
  bot?: true;
}

/**
 * PF-26 (web sprint 26; research 216, 179 s10 s6): a seat's match counters, the rows of GAME COMPLETE's YOUR STATS beyond
 * the score row's three (`FUN_00225a00` D:L76886-76933 reads the totals block): rounds the room took and resolved
 * (+0x54c) and the ones that met a living enemy (+0x548) -- `HIT_COUNT_READING`; kills by the head (+0x544,
 * `HEADSHOT_COUNT_READING`); team kills (+0x55a) and suicides (+0x558, a fall one) beside their -2 (research 91 s8);
 * primary and bonus objectives (+0x576 / +0x578), 0 until the objective modes score them (XR-05 / PF-14). Additive on
 * `roundOver`: an older room sends none and the page shows the row's three and zeros.
 */
export interface MatchStats {
  shotsFired: number; shotsHit: number; headshots: number; teamKills: number; suicides: number; primaryObjs: number; bonusObjs: number;
  /**
   * HX-5 (research 239 s4; HX.R7, additive under protocol 10; sent by an EXTRACTION room only): the match's brought out
   * -- the round block's +0x1c summed, which the online record's HOSTAGES RESCUED (+0x24) takes in every type but ESCORT
   * (`FUN_00225070` D:L76619-76632; `HOSTAGES_RESCUED_STAT_READING`). No screen of the port draws it yet (PLAYER INFO's
   * line 0x3f4e30 is the stats record's, research 155, owed).
   */
  hostagesRescued?: number;
  /**
   * HX-5: the match's escortees killed (+0x18, `FUN_00545390` D:L411546), carried and drawn nowhere: YOUR STATS reads
   * +0x576 / +0x578 only (research 216) and the online record keeps +0x18 only in ESCORT (`ESCORTEES_KILLED_STAT_READING`).
   */
  escorteesKilled?: number;
}

/**
 * The combat report (INT.R5, research 127; ported from Chris's browser-beta-v5, chris/browser-beta-integration d578f347:
 * his `CombatEvent` and `docs/DAMAGE-REPORTING.md`). A PLAYTEST INSTRUMENT WITH NO ORIGINAL: the game tells a player
 * none of this -- it is the room's account of what it did with a request, for a playtester to see whether a round
 * registered and why a request was refused. Sent only by a room whose `combatReport` option is on (the server's
 * `COMBAT_REPORT=1`, off by default), and never to every page: an `applied` report goes to the attacker and the
 * target only, a `miss` and a refused request (a friendly-fire refusal too) to the requester only (a third page learns no
 * more of another's health from it than the `health` event gives its side; a blast's miss on another's body is not sent:
 * it would show a SEAL behind cover). (2026-10-15, NU-3c; was: "a third page never learns another's health" -- since the
 * `health` event a seat's side and the spectators hold its six part bytes, research 321 section 4.2.1.)
 * Additive under protocol 9: an older page ignores it, and nothing in the game's own behaviour reads it. The page
 * keeps the last `../net/client` `COMBAT_REPORT_RING` for the playtest report.
 */
export interface CombatReport {
  type: 'combat';
  /** The room's count of reports, from 1; `tick` the room's tick, `round` its round, `map` its stem. */
  eventId: number; tick: number; round: number; map: string;
  /**
   * `applied`: the room laid the hit or the blast on the target (`damageApplied` may still be 0: an armour's whole take,
   * a flashbang). `miss`: a round or a blast that harmed no one -- the round's end, a body past the weapon's reach, a
   * blast at the thrower's own feet whose line to the head was walled or which did no damage (another's is not sent).
   * `rejected`: a request the room refused (`reason` the room's own `dropped()` reason) or friendly fire (`reason`
   * 'friendly fire', the target untouched).
   */
  status: 'applied' | 'miss' | 'rejected';
  /** What the room was deciding: 'fire', 'throw', 'reload' (a request; a refusal's `dropped()` kind), 'blast', 'impact'. */
  request: string;
  /** Why: a refusal's `dropped()` reason, 'friendly fire', or a miss's ('beyond range', 'occluded', 'no damage'...); else null. */
  reason: string | null;
  /** The item's id (as the `shot`'s and the `reloadSound`'s), or null when the refusal came before the room knew it. */
  weapon: number | null;
  attacker: { id: number; team: Team } | null;
  target: { id: number; team: Team } | null;
  /** The struck part (`./damage` `PART`), null with none or with a blast's many (`hitLocations`). */
  part: number | null;
  /** A blast's fragments: each part struck and the damage it carried, in order. */
  hitLocations: { part: number; rawDamage: number }[] | null;
  /** From the round's or blast's origin to the struck point (world units), and the same in the weapon tables' metres. */
  distance: number | null; distanceMetres: number | null;
  /** The target's six parts' health and armour before and after (`./damage` `Health`), on an `applied` report only. */
  healthBefore: number[] | null; healthAfter: number[] | null; armourBefore: number[] | null; armourAfter: number[] | null;
  /** The damage the room passed to the damage model (`bulletDamage`; a blast's fragments summed), before the armour. */
  rawDamage: number | null;
  /** The health taken, summed over the six parts (`totalBodyPartHealthChange` when known); 0 when nothing was taken. */
  damageApplied: number;
  killed: boolean; selfDamage: boolean; friendlyFire: boolean;
  /** The struck point, or the round's end on a miss; the round's direction (a unit vector), null for a blast. */
  point: [number, number, number] | null; direction: [number, number, number] | null;
  /** `./combatHealth` `combatHealthSummary`: the part names and the two changes, null for not known. */
  hitLocation: string | null; hitLocationNames: string[];
  struckPartHealthChange: number | null; totalBodyPartHealthChange: number | null;
}

/**
 * NU-3c (research 321 section 4.2.1): who is told a seat's `health` -- A BROWSER ADAPTATION of the recipients only (the
 * brief's term, under OT.R27 / OT.R26): the original's DME gives every console every SealObject (research 193 section
 * 2.4); the room tells a seat's part bytes to its side and to the spectators, never to the other side's seats. Nothing a
 * player sees changes: the reticle draws the bar over a teammate or the escortee kind (D:L70213), never over an enemy
 * seat, whose team word never meets the HUD body's nor carries bit 17 (research 321 section 4.2.1, part 2).
 */
export const TEAM_HEALTH_RECIPIENTS_ADAPTATION = 'the seat\'s side and the spectators, never the other side' as const;

/** Whether a page whose seat is on `recipient` (null: a spectator) is told the `health` of a seat on `seat` (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`). */
export function healthTold(seat: Team, recipient: Team | null): boolean {
  return recipient === null || recipient === seat;
}

/**
 * NU-3c (research 321 section 4.2.1): how soon a part's byte may change again for the others, in the room's 60 Hz ticks.
 * The original's policy for the six part bytes is 100 ms online (research 193 section 12.4, correcting its section 2.3's
 * table), tested `lastSent + 100 < now` strictly in the DME's millisecond clock (`FUN_0061a488` D:L526672-526674), each
 * byte its own field with its own time (D:L526693). The room tests `tick - told >= 7`: a byte may go on the 7th tick after
 * its last. The quantisation is the reading (reading, pending review): the clock is whole milliseconds -- seconds x 1000
 * plus microseconds / 1000, cut (`FUN_0063d2d8` D:L552697), advanced by whole deltas (`FUN_0061bee8` D:L527618-527619) --
 * so the strict test needs 101 counted; six of the console's 59.94 Hz frames (100.1 ms) count 101 only when the stamp
 * fell within 0.1 ms of a millisecond's end (about one time in ten), seven (116.8 ms) always do: a field goes again on
 * the 7th frame, the 6th the rare case. The room's 60 Hz tick stands for a frame. That the pump runs once a frame was not
 * read. Settled by a two-console capture timing a wounded seat's field updates. (Was 6, on 100.1 ms passing the strict
 * 100 with the clock taken as continuous; NU-3c's review, F1, 2026-10-15.)
 */
export const PART_HEALTH_INTERVAL_TICKS_READING = 7;

/** The reader's 1/255 as the single the decompilation shows (`FUN_002be150` D:L162325-162347: `byte x 0.003921569`). */
const PART_BYTE_SCALE = Math.fround(0.003921569);

/**
 * NU-3c: a body's six part bytes as its owner writes them (`FUN_002bd640` D:L161982-162034): `ceilf(clamp(hp / max, 0,
 * 1) x 255)` in single precision (the clamp `FUN_00267a60`, its bounds 0.0 and 1.0 at `0x3de768` / `0x3de770`;
 * `FUN_001b3470` is `ceilf`), in `./damage` `PART` order (the wire's 0x82-0x87 are the head, body, left leg, right leg,
 * left arm, right arm). `max` is the body's own (`Health.max`; a seat's, `MP_HEALTH`); a part with no maximum writes 0
 * (no seat's).
 */
export function partHealthBytes(h: Health): number[] {
  const max = h.max ?? MP_HEALTH;
  const out: number[] = [];
  for (let i = 0; i < PARTS; i++) {
    const m = max[i] ?? 0;
    const r = m > 0 ? Math.min(1, Math.max(0, Math.fround(Math.fround(h.hp[i] ?? 0) / m))) : 0;
    out.push(Math.ceil(Math.fround(r * 255)));
  }
  return out;
}

/**
 * NU-3c: the bar's fill another console draws from a seat's six bytes, 0..1: each part `max x byte x 0.003921569` in
 * single precision (`FUN_002be150` D:L162325-162347 -> `FUN_005a5790` D:L461441-461464), then 0 with the head or the body
 * at 0 (`FUN_005a54d0` D:L461376-461380), else the weighted total (`FUN_005a56d0` D:L461416-461437, `./damage`
 * `overall`), over a seat's maxima (`MP_HEALTH`).
 */
export function partHealthOf(parts: readonly number[]): number {
  const h: Health = { hp: MP_HEALTH.map((m, i) => Math.fround(m * Math.fround((parts[i] ?? 0) * PART_BYTE_SCALE))), armour: [] };
  return isDead(h) ? 0 : overall(h);
}

/**
 * NU-3c: a `health` event's `parts` as the page takes them -- six integers 0..255, copied -- or null for anything else
 * (a malformed frame is kept by no page: the wire's six bytes can hold nothing else). A page check, no original.
 */
export function partHealthWire(parts: unknown): number[] | null {
  if (!Array.isArray(parts) || parts.length !== PARTS) return null;
  for (const b of parts) if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 255) return null;
  return [...(parts as number[])];
}

/**
 * ONL-18b: the room's round state as the welcome names it (`Room`'s `RoundState`): `waiting` -- no round yet (the sides,
 * the launch, its countdown); `loading` -- launched, round 1 held for the pages' `loaded`; `play`; `expired` -- TIME
 * EXPIRED's play-on; `decided` -- a side eliminated or the bomb's result, held before the round's end; `over` -- the
 * round screens before the next.
 */
export type RoomPhase = 'waiting' | 'loading' | 'play' | 'expired' | 'decided' | 'over';

/**
 * LATER 155 (additive under protocol 11): what decided the round, for a page joining or resuming in its decided hold (the
 * welcome's `decided`, with `phase: 'decided'` only) -- the side, and the room's own word for the path, the one its event
 * named to the pages there: an elimination's `eliminated.reason` ('elimination', absent on the event; EXTRACTION's and
 * ESCORT's 'rescue' and 'hostageKills'), the clock's end ('timeout', the `timedOut` event's), or the bomb's result ('bomb':
 * defused or detonated, the welcome's `objective` says which). The first decision: nothing re-decides a hold.
 */
export interface DecidedWire { winner: Team; reason: 'elimination' | 'rescue' | 'hostageKills' | 'timeout' | 'bomb' }

/**
 * PF-28 (ruling PF.R47; web research 231 s1): the join envelope's version. A page reads an envelope of this version only
 * (`../joinState` `applyJoinState`); a later shape takes a new number, never a protocol bump (additive JSON, PF.R33).
 */
export const JOIN_STATE_VERSION = 1;
/**
 * PF-28: the envelope's clock is the room's tick (`TICK_HZ` a second), as `startTick`'s: every age, fuse and removal
 * below is in ticks (fractional where the projectile's own clock runs in game frames), `at` a room tick; the welcome's
 * `tick` is the joiner's "now". A choice of the port: the original replicates no such age (research 195 s4, s6).
 */
export const JOIN_CLOCK_UNIT = 'tick' as const;

/**
 * PF-28: a projectile or charge the room flies (`Room.flying`), for a joiner: its stable `pid` (the `grenade` event's),
 * its owner's player id, its kind (the wire's name), where it is and how fast, its state (`removed` ones are not sent),
 * its age since the launch and its fuse and removal left, in ticks; its bounces and dud; a placed charge's `facing` (a unit vector, the
 * `grenade` event's velocity for one). The original's GrenadeState (`FUN_002c1850` D:L163774+, published by
 * `FUN_002c1420` D:L163598+: position, velocity, owner, a monotonic state) carries no fuse age (research 195 s4).
 */
export interface JoinProjectileWire {
  pid: number; owner: number; kind: string;
  pos: [number, number, number]; vel: [number, number, number];
  state: 'flight' | 'rest' | 'detonated';
  age: number; fuse: number; removal: number;
  /**
   * PF-28 fix round: the bounces so far (the first's extra damping, `FIRST_BOUNCE_DAMPING`, is spent once `bounces` > 0)
   * and whether a launched round has dudded (its fuse 9999999, it bounces and never goes off by impact): without them a
   * joiner's copy would damp its next bounce again, or come back armed.
   */
  bounces: number; dud: boolean;
  facing?: [number, number, number];
}
/**
 * PF-28: a dead player's body, for a joiner: the death clip the room chose (`kill`'s `clip`; null for none), its cause
 * (`kill`'s) and its age in ticks since the death. The original has no replicated death time (`FUN_002be150`
 * D:L162596-162602 lays the full state, D:L162386-162395 state 8 from a flag; research 195 s6).
 */
export interface JoinCorpseWire { id: number; clip: string | null; cause?: number; age: number }
/** PF-28: the standing result -- the `roundOver` as the room sent it -- and the room tick it was sent at. */
export interface JoinResultWire {
  round: number; winner: Team | null; wins: { seal: number; terrorist: number }; matchOver: boolean;
  screens: { screen: 'roundComplete' | 'finalRound' | 'gameComplete'; seconds: number }[];
  stats?: Record<number, MatchStats>;
  at: number;
}
/**
 * PF-28 (ruling PF.R47; research 231 s1, 195 s4-s6, 198 s4.4): what the event stream cannot rebuild for a page joining
 * mid-round, in one versioned member of the welcome (`welcome.join`): the live projectiles and charges, the standing
 * result while the round screens run (absent otherwise), the corpses, and the ghosts -- the seats dead with no body (seated
 * in a classic round in play, never spawned in it; research 91 s12), drawn as nothing. The page lays it silently and
 * once (by `pid` and seat id): no kill line, hurt, blast, score or round audio is replayed. The original sends every
 * owned object whole to a new client (`FUN_0061ba10` D:L527450-527468).
 */
export interface JoinWire {
  v: typeof JOIN_STATE_VERSION;
  result?: JoinResultWire;
  projectiles: JoinProjectileWire[];
  corpses: JoinCorpseWire[];
  ghosts: number[];
  /**
   * PF-34 (ruling PF.R54; research 234 s1): the world drops lying in the room, each the `drop` event's body, for a
   * joiner. Optional -- an older room sends none, and an envelope with no drops leaves it out -- so `v` stays 1.
   */
  drops?: DropWire[];
}

/**
 * PF-34 (ruling PF.R54; research 234 s1, 194 s2): one entry of an ammunition bundle -- the weapon (`item`, the record id
 * whose ring the rounds came from) and its magazines' rounds, the ring's non-empty slots in ring order
 * (`MagazineRing.entries`). The original's bundle (`FUN_005ba040` D:L472580-472672 -> `FUN_003cfef0`) records each
 * slot's weapon, its ammo item and the slot's ten entries **summed**; the port keeps the split because the original's
 * redistribution into magazines (`FUN_005bb000`/`FUN_005ba770`) is not read (`AMMO_TRANSFER_PLACEHOLDER`). The total is
 * the same, round for round.
 */
export interface BundleEntryWire { item: number; rounds: number[] }
/**
 * PF-34 (ruling PF.R54; research 234 s1-s2): a world drop -- a weapon (`item`, its ring empty: `WEAPON_DROP_AMMO_READING`)
 * or an ammunition bundle (`entries`) -- by its stable per-round id (`did`: a serial from 0 at each cleared air, never
 * given twice within it, as `pid`), where it lies and its yaw in degrees, the body's (`DROP_PLACEMENT_PLACEHOLDER`), and
 * the player it came from (`from`). The original's pickup is a 0x20-byte object, kind 8 a weapon and 9 a bundle, its id the owner's id and
 * a local serial packed (`FUN_00542b90` D:L409779-409845, `FUN_005416c0` D:L408842-408845); `did` is the port's.
 */
export interface DropWire {
  did: number; kind: 'weapon' | 'ammo';
  item?: number; entries?: BundleEntryWire[];
  at: [number, number, number]; yaw: number; from: number;
}

/** LATER 131: the escort script's in-round lines the room tells (`escort`): RescueN's, VIPcheck's, EndRescueN's. */
export type EscortLine = 'staged' | 'aborted' | 'extracted';

/** Server -> client, text frames. */
/**
 * HX-1 (ruling HX.R7; research 237 s4): a hostage's state as `hostageState` and the welcome carry it -- the AI word's
 * fields (191 s3.1-3.2: bits 0-7 the state, 8-23 the leader's or rescuer's id, 24-27 the opacity nibble) and its life.
 */
export interface HostageStateWire {
  /** Its body id (from 240, the server's `HOSTAGE_ID_BASE`). */
  id: number;
  alive: boolean;
  /** The AI's top state: 0x17 hostage, 9 follow, 0x11 rescued, 2 hold (0 none). */
  ai: number;
  /** The leading seat's id while it follows (state 9), else null. */
  leader: number | null;
  /** The rescuer's seat id once rescued (state 0x11), else null. */
  rescuer: number | null;
  /** 1 shown .. 0 hidden, in fifteenths (the AI word's nibble). */
  opacity: number;
  /**
   * The unit it is in: 17 the escortees', else its leader's -- HX-4a: the seat's id + 0x20, as the host numbers a
   * player's unit (`./hostageOrder` `unitOfSeat`, `UNIT_PER_PLAYER_READING`; never 17 for seats 1..48). A change into
   * or out of 17 is an order's (or the UnitTick's) YES (`../netPage` `escorteeVoice`).
   */
  unit: number;
}

/** HX-1: a hostage for the joiner (`welcome.hostages`): its record and where it stands, and its state. */
export interface HostageWire extends HostageStateWire {
  /** The record's name (`Hostage`, `Hostage2`, `Hostage3`) and character (`mp_fem1`-`3`). */
  name: string;
  character: string;
  at: [number, number, number];
  yaw: number;
  /**
   * A dead hostage's death, as the join envelope's corpses carry a seat's (research 231 s4, `JoinCorpseWire`): its clip
   * (null for none) and its age in room ticks since the kill -- the joiner lays the corpse at that age. Absent alive.
   */
  deathClip?: string | null;
  age?: number;
}

/**
 * RESUME-MOUNTED (additive under protocol 11; PB-2c's review F1, research 215 s7.1): a turret on the wire with the room's
 * gun yaw (`TurretState.gunYaw`, degrees, the body's) -- its occupant's aim each mounted tick, kept after the release, the
 * placement's facing before any: the facing the next mount records (`FUN_005463c0` D:L412268-412297) and its steer turns
 * toward. Absent from an older room: the page keeps the yaw it last drew. A1 (additive): `reserved` -- the occupant
 * granted at its ask's command and not yet taken (its body on foot until its page's `mountTake` or the bound); absent once
 * taken, on a release, and from an older room.
 */
export type TurretWireYaw = TurretWire & { gunYaw?: number; reserved?: true };

/**
 * TURRET-AMMO (additive under protocol 11; issue #284, research 215 s8, `TURRET_RELOAD_READING`): the occupant's kit slot
 * holding the turret's rounds -- all ten magazines (`m_reloads[slot][10]`, `kit+0x1d4 + slot x 0x28`, zeros in place),
 * the one in the weapon (`current`, `kit+0x684 + slot x 4`) and whether the reload's timer runs (`reloading`, the kit's
 * `+0x820` armed at the magazine's last round or R, `FUN_005c32b0`). On the `turret` event to the occupant alone: with its
 * rounds tell, at the reload's arm and its landing, and right after a resume; never on the mount's broadcast, a release
 * or a welcome's turrets. Absent from an older room.
 */
export interface TurretMags { rounds: number[]; current: number; reloading: boolean }

export type ServerEvent =
  /** Research 303 (additive under protocol 11): whether the VICTORY DANCE is offered to this seat now, the room's answer. */
  | { type: 'victoryOffer'; status: import('../victory').VictoryEligibility }
  /**
   * Research 303 (additive under protocol 11): a dance started (`clip`, the room's variant, `elapsed` seconds in for a
   * joiner) or stopped (`clip` null), to every page; `seq`, the dancer's last command the room had run -- at a start, and
   * at the stop too (PAR-49, 2e84e901d: the last command run at the stop, omitted when the player is gone) -- so the
   * dancer's page runs the ticks it sent past it (`WalkMode.syncVictoryMotion`).
   */
  | { type: 'victory'; id: number; serial: number; clip: string | null; elapsed: number; seq?: number }
  | { type: 'taunt'; sender: number; name: string; team: Team; char: number; request: number; vocal: number | null; text: string | null; at: [number, number, number] }
  | { type: 'communication'; sender: number; name: string; team: Team; char: number; request: number; command: number | null; text: string | null; at: [number, number, number] }
  /**
   * Sprint 20, SVC-20b-relay (additive; W20.R6, research 225 §4): the member's own voice channel's floor entry -- its
   * holder's member id, or null when free -- sent to that member alone on every change of the entry or of its channel,
   * never broadcast (the original broadcast the twelve-entry table, R170.2).
   */
  | { type: 'voiceFloor'; channel: number; holder: number | null }
  /**
   * AD-14 (additive; C92, research 227 §2.11): the member's own voice channel's member count -- every member the room
   * holds on that channel, the member itself included -- sent to that member alone, after the `voiceFloor` that names
   * the channel, whenever its channel or the count changes (a channel change, RADIO OFF / ON, a death into the dead zone
   * and the way out of it, an arrival, a departure). The original's number beside the HUD's channel icon is `voice+0x5c`,
   * the network library's member count of the page's own channel (`FUN_0030ec10` D:L211004 -> `FUN_00623ae8` ->
   * `FUN_006432c8` D:L556962-556990). A page older than it ignores it; a page before its first one draws 0, the voice
   * object's init's (`../hudVoice` `voiceCount`, LATER 77).
   */
  | { type: 'voiceMembers'; channel: number; members: number }
  | {
    type: 'welcome'; id: number; version: number; map: string; tick: number; role: Role; team: Team | null;
    queue: number; name: string;
    /** Protocol 7: each player's kit as its body carries it (`kit`, five item ids, slot order), for the others' holsters. */
    players: { id: number; name: string; team: Team; kit?: number[]; /** Protocol 9: the type its body was rebuilt as. */ char?: CharType; /** FBA.R10: trusted CPU appearance key, independent of its weapon type. */ character?: string; bot?: true }[];
    /**
     * Protocol 4: the room's rules, the round in play (`mp_round_count` + 1) and the game's round count (`mp_max_rounds`,
     * the create-game default 11: the round-start banner's second number, `FUN_001fb420`); `ghost` for a player who
     * joined a classic round in play and plays from the next ("You are a ghost.", research 91 section 12).
     */
    rules: Rules; round: number; rounds: number; ghost: boolean;
    /** CREATE GAME's trusted EQlimit, GameStats byte 5 (research 362 §3). Optional under this protocol; absent: 0. */
    eqLimit?: number;
    /** OT.R59 (RECONNECT-GHOST; additive): a resumed seat -- its own id, its body alive -- and `resume` follows: no banner, no ghost. */
    resumed?: true;
    /**
     * A classic room waiting for both sides (2026-09-30; research 91 section 19.1, `CLASSIC_WAITING_PLACEHOLDER`): the
     * round has not launched, so the page shows the waiting line (`WAITING_LINE_READING`), not the round-start banner. Optional:
     * absent is false (a server before it).
     */
    waiting?: boolean;
    /**
     * Protocol 9 (S2 round 3; additive, the version kept): a player's own seat's character type -- the hello's, or the
     * one a reconnect under the round's lock holds (W5.R1) -- so the page holds the room's type, not the one it sent.
     * Absent for a spectator, and from a server before it (the page then keeps the hello's).
     */
    char?: CharType;
    /** The ARMORY opens on this seat (a page whose hello said `armory`; `ARMORY_SEAT_READING`); its spawn waits for `ready`. */
    armory?: true;
    /**
     * The owner's launch countdown (`./rules` `OWNER_LAUNCH_COUNTDOWN_S`, 2026-10-01; additive, the version kept): both
     * sides are seated and the round starts in this many seconds -- the page shows the countdown, not the round's
     * banner nor the waiting line. Absent: no countdown runs.
     */
    countdown?: number;
    /**
     * The match server's name (`serverNameOf`; additive, the version kept): the ARMORY title bar's `MEDIUS_LOBBY_NAME`,
     * over the room's name (ARMORY_SERVER_NAME_READING). Absent from an older server: the page shows the default.
     */
    server?: string;
    /**
     * Protocol 10 (MAP-03): the room's world as it stands (`EnvWire`, the full `WorldState.states()`): the joiner lays it
     * on its world silently (the game's `skip_effects`; `JOIN_SILENT_READING`, `./client`).
     */
    env: EnvWire;
    /** Protocol 10: the round epoch (`EnvWire.epoch`; 0 before the first round starts). */
    epoch: number;
    /**
     * V13-3c (additive under protocol 13; `SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold'): the scene objects whose death
     * the room ran this round, by `MapMeta.scene` record id (`sceneDeath`'s), which the joiner takes silently
     * (`JOIN_SILENT_READING`). Absent: none, or an older room.
     */
    sceneDead?: number[];
    /**
     * Protocol 10 (for ONL-18): the room tick (`tick`'s clock) at which the current round began. ABSENT, never 0,
     * while no round has begun -- a classic room waiting for its sides or after an abandon (tick 0 is a tick: a respawn
     * room's first round begins at its construction, `startTick` 0).
     */
    startTick?: number;
    /**
     * Protocol 10 (MAP-03; PF-12 `SimMap.gameType`, `missionlist.rdr`, `FUN_002c9540`): the map's game type, the
     * objective section's first field (XR-05 adds the bomb). Absent: a map whose type the server did not read.
     */
    gameType?: GameType;
    /**
     * XR-05 (additive JSON, PF.R33; research 214 s1): DEMOLITION's bomb as it stands (`./objective` `BombWire`) for the
     * joiner; absent on a map without the bomb.
     */
    objective?: BombWire;
    /**
     * MAP-10b (additive under protocol 10, PF.R33): the occupied turrets as they stand (`TurretWire`), for the late
     * joiner; absent when none is occupied or turned, or the map has none. RESUME-MOUNTED (additive; PB-2c's review F1):
     * each with its gun's yaw (`gunYaw`), and a free turret whose gun its last occupant left turned (its yaw off its
     * placement's facing) listed too, so the joiner's next mount steers toward it as the room's does.
     */
    turrets?: TurretWireYaw[];
    /**
     * HX-1 (additive under protocol 10, ruling HX.R7; research 237 s4): EXTRACTION's hostages as they stand, for the
     * joiner -- each a body in the snapshot's list with this `id` (from 240), a dead one as dead (191 s6). Absent on a map
     * without them.
     */
    hostages?: HostageWire[];
    /**
     * ONL-18b (additive under protocol 10, as PF.R33's JSON; research 221): the room's state for the joiner (`RoomPhase`)
     * -- so a page joining an elimination's decided hold is not taken to be in play (XR-06's join reading,
     * retired). Absent from a server before it.
     */
    phase?: RoomPhase;
    /**
     * LATER 155 (additive under protocol 11; `DecidedWire`): with `phase: 'decided'`, what decided the round -- so a page
     * joining or resuming in the hold marks its round audio decided by it (`../roundAudio` `markDecided`, nothing played)
     * and its bomb takes the hold's rule (`../bombPage` `decidedRound`). Absent from an older room: the page's bomb takes an
     * elimination's, its round audio unmarked (as before).
     */
    decided?: DecidedWire;
    /**
     * PF-28 (additive under protocol 10, PF.R33; ruling PF.R47, research 231 s1): the join envelope (`JoinWire`) -- the
     * projectiles, the standing result and the corpses as the room has them, laid once and silently (research 195
     * s4-s6). Absent from a server before it: the page then sees what it saw before (nothing of them).
     */
    join?: JoinWire;
  }
  /**
   * REFUSED-MAP (additive; the merge controller's note for TR-2, 2026-10-12): `map`, the hello's map, on a refusal that
   * names one (`server.ts` `refuse`: 4004 "no such map" among them); absent on a game's hello's refusal.
   */
  | { type: 'refused'; reason: string; map?: string }
  | { type: 'pong'; t: number; tick: number }
  /**
   * XR-04 (additive under protocol 10, PF.R33; S27 s1.3): the room started action `action`'s program (`MapMeta.actions`)
   * for player `by`. The page runs the same program as a presentation run (PF.R26: its sounds and effects, no node or
   * valve changed -- the state comes in the snapshot's `env`); a late joiner gets none (`JOIN_SILENT_READING`).
   */
  | { type: 'action'; action: number; by: number }
  /**
   * MAP-10b (additive under protocol 10, PF.R33; PF.R31): a turret's occupant changed (a mount, a dismount, the
   * occupant's death or leave, the round's start) -- to every page -- or its rounds after a shot -- to the occupant only,
   * at most once a tick. The aim is not here: it rides the occupant's `BodyState.yaw/pitch`, clamped by the room.
   * RESUME-MOUNTED (additive): the gun's yaw as the room holds it (`gunYaw`, `TurretWireYaw`). TURRET-STEER-TICK (LATER 91,
   * additive): on a mount's broadcast while the mount's steer runs (`Player.seat`), `steer.ticks`, the steps the room's
   * steer has run by the send (`SeatSteer.steered()`); the mount's broadcast precedes the tick's commands (`room.ts`
   * `resolveMounts` before `run`), so 0 from this room, and the steer's first step lands later on the same tick. A page
   * dates the mount's own steer `now() - (ticks + 1) / TICK_HZ`, unlike `resume.steer` (sent after the room has stepped:
   * `ticks / TICK_HZ`). Absent from a room without the clips (no steer), on a release, an ammunition tell and a welcome's
   * turrets, and from an older room. TURRET-AMMO (additive): to the occupant alone, its magazines (`mags`,
   * `TurretMags`). TURRET-STEER-SEQ (LATER 96, additive; research 215 s7.9): beside `ticks`, `steer.after` -- the room's
   * command count for the mounting seat at the send (`room.ts` `Player.sim.seq`), in the numbers that seat's page sent
   * (`NetClient.lastSeq()`'s), never lower than an earlier send's for that seat: the highest command the room has run, or
   * passed over, before the steer's first step. The steer steps once on each command the room RUNS with a seq above it
   * and on no other: a command at or below it never runs (`Room.binary` ignores it), one lost past the gap's wait
   * (`GAP_WAIT`), refused 'ahead', trimmed from a flood or dropped from a backlog (`dropBacklog`) is passed over
   * unrun, so unstepped; a timed event's refusal
   * (`stale`, 'too many waiting', 'its command never ran') is no command and moves nothing. The clip comes off on the
   * 17th command run above `after` (research 215 s7.1), and the hold places the body each command after. Only on the
   * mount's broadcast: `resume.steer` carries none. Absent from an older room (the page keeps `ticks`' dating).
   * Read since LATER 96's page half: `turretPage.ts` keys this page's own mount on `after` (`holdTick`, one step a command sent above it).
   * LATER 104 (additive): `refused: 'mounting'` on the occupant's own event when the room refuses its dismount inside the
   * mount's window (`room.ts` `takeDismount`, TURRET_RELEASE_SEQ_ADAPTATION) -- the occupant unchanged; a page that predicted
   * the release undoes it (`../turretPage` `take`). LATER 219 (additive): 'reload', a dismount asked while the turret's own
   * reload timer runs, undone the same way. Absent from every other event and from an older room.
   * A1 (additive): the reservation's broadcast (`reserved`, `TurretWireYaw`) at the ask's command; the take's broadcast
   * follows at the page's word (`steer.after` the command before it), or at the bound. A refusal at the take, a death, a
   * leave or a resume before it broadcasts a release.
   */
  | ({ type: 'turret'; steer?: { ticks: number; after?: number }; refused?: 'mounting' | 'reload' } & TurretWireYaw & { mags?: TurretMags })
  | { type: 'joined'; id: number; name: string; team: Team; character?: string; bot?: true }
  | { type: 'left'; id: number }
  /** Authored extension FBA.R10: server-assigned regional appearance, null back in the lobby. */
  | { type: 'botCharacter'; id: number; character: string | null }
  /**
   * LATER 266 (additive): a late respawn console's load publishes its local actor dead, with model alpha zero
   * (research 322 §5.3, FUN_002b7d60 D:L158634-158642; FUN_00543d50 D:L410440). Sent to that seat only at `loaded`:
   * no kill, killer, corpse pose or score change; its fresh Action can revive it after >5 s, without a fade wait.
   * Re-told after the initial round start if it loaded over the hold: `age` is the room's ticks since that same death.
   * Additive `at`/`yaw`: its original connection start, applied before the death (FUN_002b7d60 D:L158619-158628).
   * Absent from the earlier dead-at-load message; the client retains its current placement in that case.
   */
  | { type: 'deadAtLoad'; id: number; age?: number; at?: [number, number, number]; yaw?: number }
  | { type: 'renamed'; id: number; name: string }
  /** The recipient's place in the spectators' queue (1 = next), or 0 when promoted. */
  | { type: 'queue'; position: number }
  /**
   * The recipient became a player: its team, and (protocol 5) whether it is seated as a ghost -- a classic round in
   * play, "You are a ghost." until the next round (research 91 section 12), as the welcome's `ghost`.
   */
  | {
    type: 'promoted'; team: Team; ghost: boolean; waiting?: boolean;
    /** Protocol 9 (S2 round 3; additive): the type the seat took, as the welcome's `char`. */
    char?: CharType;
    /** The ARMORY opens on this seat, as the welcome's `armory`. */
    armory?: true;
    /** The launch countdown's seconds left, as the welcome's `countdown`. */
    countdown?: number;
  }
  /**
   * W3.R13, protocol 5: the recipient, idle past the kick with someone waiting, was moved out to the back of the
   * spectators' queue (`position`): a spectator from now, its mover no longer run.
   */
  | { type: 'demoted'; position: number }
  /**
   * A mover placed (a spawn or a respawn): the recipient's own when `id` is its own, the commands after `after` run on
   * the new mover (the client rewinds and replays them).
   */
  | {
    type: 'spawn'; id: number; at: [number, number, number]; yaw: number; after: number;
    /**
     * Protocol 7: the kit the body spawned with (`FUN_00599f00`, R94.3: the type's pick, else its own), five item ids --
     * the page's own kit when `id` is its own, and every page's picture of the others' weapons. The room always sends
     * it; a page given none (a hand-made event) keeps the kit it has.
     */
    kit?: number[];
    /** Protocol 9: the character type the body was rebuilt as (its body, its hit volumes): the others draw it. */
    char?: CharType;
    /** Authored extension FBA.R10: independent regional CPU appearance. */
    character?: string;
    /** FBA.R12: trusted CPU marker persists after character assignment. */
    bot?: true;
  }
  /** A throw by another player (research 85): the page flies the same grenade for its looks, sounds and blast. */
  | {
    type: 'grenade'; id: number; kind: string; from: [number, number, number]; velocity: [number, number, number];
    /**
     * PF-28 (additive, PF.R47; research 231 s2): the projectile's stable id, the one `welcome.join` names it by -- per
     * round, never reused within it (`PROJECTILE_ID_READING`). Absent on a Detonator's fire (a verb, no object) and
     * from a server before it.
     */
    pid?: number;
    /**
     * LATER 643 (additive, the version kept; research 85 §6.1): a hand throw's age, whole ticks of the room's clock from
     * its release at the room's decision, as the room flies it (the date-back, `THROW_DATE_BACK_TICKS_ADAPTATION`,
     * included), made from the room's frame count so `round(age / TICK_HZ / GAME_FRAME_DT)` is that count, at most
     * 300 frames (`ROOM_FLIGHT_MAX_FRAMES_ADAPTATION`, the page's own `REMOTE_AGE_MAX_FRAMES_ADAPTATION`) -- the page
     * starts its copy that far into its flight (`GrenadeThrower.launchRemote`'s `ageTicks`), a game frame at a time.
     * Absent under a game frame (a healthy throw), and from a server before it; an older page ignores it and starts its
     * copy at the event, as before.
     */
    age?: number;
  }
  /**
   * PF-36 (additive under protocol 10, PF.R56; research 235 s4): to the thrower or placer alone, the room's `pid` for
   * the throw or the charge it just took (the `grenade` broadcast skips him), so the page names its own copy
   * (`OWN_PID_READING`, a port rule: the original's placer holds its own object). An older page ignores it.
   */
  | { type: 'placed'; pid: number; kind: string; from: [number, number, number] }
  /**
   * PF-36 (additive, PF.R56; research 235 s4): the resting charge with this `pid` was damaged and goes off on the next
   * game frame (`FUN_003c69c0` L318215-318216, `VOLATILE_CHAIN_TIMING_READING`): every page sets its copy off (a verb,
   * as the Detonator's `grenade`; no projectile is created). `by` the shooter or the blast's owner, null for a departed
   * one. An older page ignores it.
   *
   * Research 209 §18: a placed C4's blast uses the same message, `by: null`, in the tick of that blast, the owner
   * included. The page holds its named C4 until this arrives, then explodes on that detonation. A chain-set-off C4
   * can be told twice; an older page ignores both.
   */
  | { type: 'detonate'; pid: number; by: number | null }
  /**
   * Research 386 §3.2 (LATER 63): a scene program's `FIRE_WEAPON` round went off at `at` -- Blizzard's outhouse's `C4` at
   * its toilet, Crossroads' bridges' and the bases' `MPBOMB` -- by the item's name (`kind`), for its explosion's effects and
   * sound (`GrenadeThrower.fireScene`); the room dealt its blast. An older page ignores it.
   */
  | { type: 'sceneRound'; kind: string; at: [number, number, number] }
  /**
   * V13-3c (additive under protocol 13; research 386 §3.5, `SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold'): a scene
   * object's death the room ran -- its `MapMeta.scene` record id, in round `epoch` (`EnvWire.epoch`) -- told to every
   * page at once, as the original's flagged death sends its type-8 record to every console (`FUN_002734b0`
   * D:L120782-120797; research 376 §3). The page takes it (`applySceneDeath`): spent, its death run for presentation
   * (PF.R26). An older page ignores it (the target's state still tells it the deaths that switch their target off).
   */
  | { type: 'sceneDeath'; id: number; epoch: number }
  /**
   * A round fired by another player, for its muzzle, tracer and sound (the hit's decal where it struck the world).
   * Protocol 7: `weapon` is the firing item's id (the record the page draws and hears it by), no longer a slot.
   *
   * INT-NET-2 (2026-10-02; additive, the version kept; research 91 section 23): a round a body stopped carries the body's
   * point (`to`), the normal back along the round and `material` the PERSON byte (13), so every page plays the
   * original's `bullet_hit_person` through the material table (`FUN_003c8920`) -- and `body`, the struck player's id.
   * Never sent to the shooter's own page: that one is sent the `impact` below.
   *
   * P12 (2026-11-02; additive, the version kept; research 219 s3.2, 91 s23; match `room.ts`
   * `SHOT_EVENT_THROUGH_READING`): `through`, every world surface the round struck besides the one `to` names, in the
   * walk's order -- its point, the normal toward the shooter and the polygon's material byte -- so every page plays an
   * impact at each, as every console that walks the round does (`FUN_003c8920` D:L319497-319500). Bodies never (the first
   * body's blood is `to`'s). Absent when there is none; an older page ignores it.
   *
   * P12b (2026-11-02; additive, the version kept; research 219 s3.2, 91 s23; match `room.ts` `SHOT_EVENT_BODIES_READING`):
   * `end`, the round's end -- where the walk stopped, else where its range ran out, the point the shooter's page draws
   * its own tracer to -- when it is not `to` (a round that struck a body names the body as `to`). Every page draws the
   * round's tracer to `end ?? to`; the impact, its normal and material, the body and the report stay `to`'s. Absent when
   * the round ended at `to`; never on the shooter's `impact`; an older page ignores it.
   */
  | {
    type: 'shot'; id: number; weapon: number; from: [number, number, number]; to: [number, number, number]; normal: [number, number, number] | null; material: number | null;
    body?: number;
    through?: { point: [number, number, number]; normal: [number, number, number]; material: number | null }[];
    end?: [number, number, number];
  }
  /**
   * INT-NET-2 (2026-10-02; research 91 section 23): the recipient's own round that the room found a body stopped -- the
   * `shot` the others are sent, as its own type: the page plays the impact alone (`NetPageDeps.roundImpact`), having
   * drawn its muzzle, tracer and report. Its own type, not the shooter's own `shot` (review finding 1): a page of
   * protocol 9 built before it draws a `shot` of its own id as another player's round (a second muzzle, tracer and
   * report) and ignores an unknown type. Additive: an older page ignores it, an older room never sends it.
   */
  | {
    type: 'impact'; id: number; weapon: number; from: [number, number, number]; to: [number, number, number]; normal: [number, number, number] | null; material: number | null;
    body: number;
  }
  /** The recipient was hit: health left per part, and where from (research 91a section 7). */
  | { type: 'hurt'; health: number[]; from: [number, number, number]; part: number }
  /**
   * NU-3c (additive under protocol 11; research 321 section 4.2.1): another seat's part health as the others' consoles
   * hold it -- the SealObject's six bytes 0x82-0x87 (research 193 section 4.1), `partHealthBytes`, in `./damage` `PART`
   * order -- each byte changed only after its own `PART_HEALTH_INTERVAL_TICKS_READING`; sent on a change (and whole to a
   * page newly entitled to it) to the seat's side and the spectators, never to the other side's seats
   * (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`) nor back to the seat (its `hurt` holds its own); sent, not broadcast, so a
   * `.s2r` never holds it. The reticle's bar over a teammate reads it (`partHealthOf`); an older page ignores the type.
   */
  | { type: 'health'; id: number; parts: number[] }
  /**
   * LOW-2 (web research 223 s6; additive under protocol 10): the room refused this page's own `fire`, `reload` or
   * `throw` as stale -- decided more than `FIRE_ARRIVAL_JITTER_TICKS` after its command ran, a dropped backlog's command
   * among them -- told to that page alone, with the seq the event named, so its magazine and kit reconcile: the page
   * takes the named reload back (`Fire.restoreReload`), gives the round back to the magazine that fired it
   * (`Fire.refundRound`: its ring's journal replayed without it; nothing once that kit is refilled) and a throw's item
   * back to the pouch (`GrenadeThrower.giveBack`), once a seq (`../netPage`, `../matchNet`).
   * A server adaptation (the game has no server, research 91 §15). An older page ignores it; an older room never sends it.
   */
  | { type: 'stale'; request: 'fire' | 'reload' | 'throw'; seq: number }
  /**
   * A player flinched (the owner, 2026-10-02; research 91 section 21): a non-lethal round's clip (`./deaths`
   * `flinchClip`, the room's draw), which the page plays on that player's body -- the victim's console plays it on its
   * own actor and sends the motion to every other (`FUN_005a2690` -> `FUN_00588ab0` -> `FUN_002bbaf0`, kind 0xf). Sent
   * to every page, the victim's own too since MATCH-FIX-2 (2026-10-02), which plays it on its own body (`../walk`
   * `setFlinchPose`). Additive (2026-10-02): an older page ignores the event (and its own id's: the first round's page
   * dropped those), an older room never sends it or not to the victim, so no version bump.
   */
  | {
    type: 'flinch'; id: number; clip: string;
    /**
     * PF-18 (PF.R37; research 218 §2.1; additive under protocol 10, PF.R33): the room's flinch window on the victim's
     * commands' seqs -- `from` the first inside, `until` the first past -- in which it drops a reload `'flinch'`. The
     * victim's page undoes a reload it sent inside it before the event arrived (`./flinchReload`). Absent from an older
     * room, or one without `motion.rdr` (no window held).
     */
    from?: number; until?: number;
  }
  /**
   * DOORS (research 92 section 2; 2026-10-23): a one-shot a map program pushed on a player's body -- the door program's
   * `ai::ANIMATE` type 63 `Open door` on the presser (`FUN_005d2f30` -> `FUN_00588bc0(actor, type, stance, 0, 0)`,
   * D:L487256-487260), which that call sends to every console itself (its 5th argument 0: D:L446413-446414, a Push
   * Blend). The room tells every page, the presser's own included, which plays it on its own body as its flinch is
   * played but with no reload gate (no motion flag 0x4 set); the others play it on that body (`RemotePlayers.pushMotion`).
   * `from` / `until`: the clip's window on the presser's commands, for the page's stick cut (`./flinchReload`
   * `flinchCutWindow`), and `cutFrom` the first command the clip's `NoInterrupt` lets the cut through (`seal_open_door`'s
   * 0.5: `FUN_00587c20` D:L445550-445556; `pushedWindow`); all absent from a room without `motion.rdr`. Additive under
   * protocol 11 (`PROTOCOL_VERSION`; PF.R33's rule): an older page ignores it, an older room never sends it.
   */
  | { type: 'motion'; id: number; clip: string; from?: number; until?: number; cutFrom?: number }
  /**
   * LATER 362 (additive; the network's bookkeeping): the room's pick for a door's use -- 0 the open, 1 the kick -- sent to
   * every page at the use, ahead of the snapshot that shows the swing, so a page follows it with the same program
   * (`DoorSet.followPick`). The snapshot's door carries no pick: a page that misses it (a late joiner mid-swing) follows
   * the open's program for that swing. An older page ignores it.
   */
  | { type: 'doorUse'; door: number; pick: 0 | 1 }
  /**
   * Another player's reload was taken (2026-10-02, ported from Chris's browser-beta-v5, d578f347; research 91 section
   * 22.2): the page plays the item's `ReloadSound` at that player's body -- `FUN_005c2a90` plays it at the actor
   * (`+0x1c`, 477484-477537) in the kit's frame, which the actor update runs with no locality test (`FUN_005506a0` L417907;
   * REMOTE_RELOAD_SOUND_READING). `weapon` the item's id (as the shot's), `at` the room's feet of the body. Sent to every
   * page but the reloader's, whose own reload plays its sound already. Additive: an older page ignores it.
   *
   * REMOTE-RELOAD (additive under protocol 14, `PROTOCOL_VERSION` kept; REMOTE_RELOAD_MOTION_READING): the hand's reload
   * also names the take the room's lock was set from -- `posture` the stance, `moving` the body over 20 a second
   * (`reloadMoving`), `family` the clip family (`reloadFamily`), `seconds` the clip's length (`reloadLockSeconds`) -- so
   * the page starts that body's reload clip (`RemotePlayers.reload`): `FUN_005c2a90` starts the motion (`FUN_005a82e0`,
   * D:L477479) and plays the sound (D:L477484) in one step. A turret's reload sends none of them; an older page ignores
   * them, and an event without them (an older room) plays the sound alone.
   */
  | {
    type: 'reloadSound'; id: number; weapon: number; at: [number, number, number];
    posture?: ReloadStance; moving?: boolean; family?: ReloadItem; seconds?: number;
  }
  /** A combat report (INT.R5): a playtest instrument with no original, sent only by a room with the option on. */
  | CombatReport
  /**
   * A blast reached the recipient (`./blast`, `FUN_005a0e70`): the ringing ears (`ring`: seconds at `volume`), and the
   * knock laid on its mover after command `after` -- the page lays the same on its prediction -- or null. A living prone
   * SEAL's knock is `fall` 'proneCover' at no velocity (PF-19, PF.R38: additive). P2 (the online-parity sweep's TB-1,
   * research 85 s9.5): `flash`, a flashbang's white-out level the room resolved on the recipient (`./blast`
   * `blastFlashLevel`; `FUN_005a5250`'s slot 0 from `FUN_005a0e70` D:L459228), null for any other blast. Additive (the
   * sweep's Q11, no version bump): an older room never sends it, an older page ignores it.
   */
  | { type: 'blast'; ring: { seconds: number; volume: number } | null; knock: { velocity: [number, number, number]; fall: 'fallForward' | 'fallBackwards' | 'proneCover' } | null; after: number; flash?: 1 | 2 | 3 | null }
  /** A kill, for the message window (research 87 section 14, 91): `how` names the game's line. */
  | {
    type: 'kill'; killer: number | null; victim: number; weapon: string | null; how: KillHow;
    /** The death clip the victim plays (`./deaths`), or null (a fall or a blast plays its own). */
    clip: string | null;
    /** `how` 'orphan' (m-13 of review 2): the name of the thrower who left before its grenade went off. */
    killerName?: string;
    /**
     * PF-10: the game's death cause (`./deaths` `DEATH_CAUSE`, the actor's `+0xfb0`): 5 a bullet, 3 its head, 4 a
     * blast, 7 a fall -- the victim's voice (`deathVoiceSlot`), played on the victim's own page and, for a bot, on the
     * offline match's page that runs the room (LATER 657; `FUN_005714b0`). Absent from a room before it: no voice.
     */
    cause?: number;
    /**
     * PF-10: false when the body's voice gate withheld the death voice (`FUN_0053b710`, `./deaths` `VOICE_GATE_S`: within
     * 3 s of its hurt voice); the page then plays none.
     */
    voiced?: boolean;
    /**
     * HX-1 (additive under protocol 10, HX.R7; research 237 s4): 'hostage' -- the victim is a hostage's body (`victim`
     * from 240): no kill line (`./rules` `HOSTAGE_KILL_LINE_READING`), its body plays the clip. Absent: a player.
     */
    victimKind?: 'player' | 'hostage';
  }
  /**
   * PF-10: a body's hurt voice (`FUN_00597b00`, 0x3b `CHRSND_DAMAGE`): a health drop that left it alive with its voice
   * gate open; every page plays its character's at the body, the body's own page too.
   */
  | { type: 'hurtVoice'; id: number }
  | {
    type: 'score'; rows: ScoreRow[]; timeLeft: number | null; spectators: string[]; wins: { seal: number; terrorist: number };
    /**
     * LATER 152 (additive, the version kept; `DEFUSE_CLOCK_HELD_READING`): the round clock is stopped at `timeLeft` -- a
     * defuse clears its running flag (`FUN_002c1c30` D:L163937) -- held there until the round's end. An older page counts
     * it down until the next `score`.
     */
    clockHeld?: true;
    /**
     * PF-14 (additive, the version kept; JSON only; TEAM_SCORE_READING, research 214 s5): each side's team score this
     * round, the objectives' carry (`FUN_00544d60`). Nothing draws it; an older room sends none.
     */
    teamScore?: { seal: number; terrorist: number };
  }
  /**
   * SVC-18 (V25; research 263 §1): another seat's line in the game -- `sender` its seat id (as `gameLobby`'s), `name` its
   * account's name, `text` at most 63 characters. The receiver draws it as "%s (All): %s" (`FUN_002ba9d0` D:L160181)
   * into the game lobby's panel (ONL-23), in the round too (SVC-19: the match hands it to the panel, never the HUD).
   * SVC-19 (additive; research 266 §3.1): `team` on a line of a team scope (1-3, D:L160079-160102), drawn
   * "%s (Team): %s" (S:0x3f2700, D:L160184); absent, scope 0.
   */
  | { type: 'chat'; sender: number; name: string; text: string; team?: true }
  /**
   * SA-43c RESTART-NOTICE, Part 2 (additive, protocol 11 kept; research 345 sections 1-2): the server's system message on
   * the game connection -- RT_MSG_SERVER_SYSTEM_MESSAGE's severity (a byte) and text, which the original's network library
   * hands to `FUN_0030dce0` from the game server's connection as from the lobby server's. The room sends it to each of its
   * connections (`Room.tellSystem`: a host's restart notice, from its supervisor), never broadcast or recorded; the page
   * routes it as `FUN_0030dce0` does through `BriefingRoomChat.systemMessage` (Part 1's): the round's HUD line, dropped
   * while a match loads, the front end's MP_SYSTEM_MESSAGE in the game lobby. An older page passes it by.
   */
  | { type: 'system'; severity: number; text: string }
  /** W3.R13: the votes against the recipient ("Voting: You have %d votes against you.", 0x3f26c0 -- no leading space, research 263 §5.2). */
  | { type: 'votes'; count: number }
  /**
   * SVC-23e (additive, protocol 11 kept; research 264 §4): a player's VOTE ALL, to every console -- one per spectator its
   * toggle passed over (the room's `VOTE_ALL_LINE_PER_SPECTATOR_READING`). `name` the voter's, `against` its state,
   * `count` the votes standing; every console prints it into its message window (`FUN_002b9bd0` D:L159587-159597):
   * `spectatorVoteText`. The page's drawing of it is not built.
   */
  | { type: 'spectatorVote'; name: string; against: boolean; count: number }
  /**
   * SVC-23e: the spectators ejected -- the host's "Reject" (S:0x3f23b8), on which every console prints "Spectators EJECTED
   * from this game." (S:0x3f2650; `FUN_002b9bd0` D:L159598-159601, `FUN_002b9d80` D:L159625):
   * `SPECTATORS_EJECTED_TEXT`. Each spectator is then `kicked` 'vote' and closed (its dlgNetBanned.rdr, S:0x3f26a0). The
   * page's drawing of the line is not built.
   */
  | { type: 'spectatorsEjected' }
  /**
   * W3.R13: removed by its team's vote (UIMnLOC 539) or idle; the socket closes after. S2 round 4: 'replaced' -- a
   * newer connection of this page's session (the same `session` token: a reload, a duplicated tab, the page's own
   * reconnect) took the seat; the socket closes with `SESSION_REPLACED_CLOSE`.
   */
  | { type: 'kicked'; reason: 'vote' | 'idle' | 'replaced' }
  /** W3.R11: the clock at 00:00 -- "TIME EXPIRED" (`mp51LOC` 5108) -- and play goes on 15 s (research 91 section 18). */
  | { type: 'timeExpired' }
  /**
   * W3.R11: a round's end, and the match's when `matchOver`; `screens` are the game's screens to show and how long
   * each holds, in order (ROUND COMPLETE between rounds; FINAL ROUND then GAME COMPLETE after a match).
   */
  | {
    type: 'roundOver'; round: number; winner: Team | null; wins: { seal: number; terrorist: number }; matchOver: boolean;
    screens: { screen: 'roundComplete' | 'finalRound' | 'gameComplete'; seconds: number }[];
    /** PF-26 (additive, the version kept; JSON only): each seat's match counters, by its id (`MatchStats`). */
    stats?: Record<number, MatchStats>;
  }
  /**
   * Protocol 7 (review 3 B2): the classic round was abandoned -- a side left empty by a leave, a kick or a demotion
   * (a departure is a leave: `FUN_002bc530` D:L161109-161146, research 315 §3.3; `dlgNetAbandoned`) -- and the room waits for both sides
   * again. Sent before the score that carries `timeLeft: null`; the page ends the round on it (its decals go).
   */
  | { type: 'abandoned' }
  /**
   * The owner's launch countdown (`./rules` `OWNER_LAUNCH_COUNTDOWN_S`, 2026-10-01; additive, the version kept): a classic
   * room waiting for both sides has them both, and its first round starts in `seconds` (the `roundStart` follows); null,
   * a side emptied before it ran out and the room waits for both sides again.
   */
  | { type: 'countdown'; seconds: number | null }
  /**
   * SVC-07a (additive; research 159 §5): a game room's GAME LOBBY as the server holds it, to every seat on each change --
   * the seats (the room's id, the account's name, the side or null for a watcher, READY, the host's star, the whole
   * seconds until the seat's READY is available), the launch countdown's seconds or null, whether the match has started.
   * `refused` (to the requester only): why its `lobbyReady` / `switchTeams` / `launch` / `clanSwap` was not taken.
   */
  | {
    type: 'gameLobby';
    /** Server prepares a new mission; the completed map's load must end before reconnect. */
    nextMap?: string;
    seats: { id: number; name: string; team: Team | null; ready: boolean; host: boolean; readyIn: number; bot?: true }[];
    botSettings?: BotSettings;
    countdown: number | null; launched: boolean; refused?: string;
    /** The staging room's authoritative equipment limit; absent: unrestricted (research 362 §3). */
    eqLimit?: number;
  }
  /**
   * SVC-07c SEAT-TOLD (additive, protocol 11 kept; research 264 §2): each seat's new rating and medal after a round's
   * result is applied -- the results queue's `SeatTold` (`central/src/stats/results.ts`: the rating the store committed,
   * the medal `medalOf` at the account's standing), named by its seat id in the game's room (the account id stays on
   * the server), to every socket of the game, players and spectators alike, once per counted round (none for a respawn
   * round; no entry for a seat whose account left) and at each seat's join (research 155 §4.4) -- each event every
   * account seated in the game now, the rest at their stored pair, so it replaces the last whole. The original's player state carries both -- +0x42 the medal
   * (`FUN_002c5360` D:L166200-166201; the name `oop9` forced to 4, D:L166202-166205, which the medal here already
   * carries) and +8 the rating from the record (D:L166208-166209); research 155 §2.3, §4.4 -- and the message that
   * carried them between consoles is unread (`SEAT_TOLD_BETWEEN_ROUNDS_READING`). The page keeps
   * the last (`./seatTold`); nothing draws it yet (ONL-34).
   */
  | { type: 'seatTold'; seats: { id: number; rating: number; medal: number }[] }
  /**
   * AD-13 (additive, protocol 11 kept; research 275 §5): each seat's clan tag as the room holds it -- the bridge's read at
   * the seat (`Room.tellClan`, `CLAN_TAG_AT_SEAT_READING`), players' and watchers' alike, as the original writes a
   * watcher's published state's +0x2e as a player's (`FUN_002c5450` D:L166281-166293) -- the room's whole set of the
   * seats with a tag (a seat with none absent), replacing the last: to every connection and into the recording at each
   * change (a tag told or forgotten, a tagged seat's leave), and to a seat alone at its own seat when its own changes
   * nothing. Not the score's: no row is made for a watcher. To every connection, the other side's included: the same
   * tag the score rows already carry to every page (`ScoreRow.clan`), and the original's player state is public -- every
   * console holds every slot's +0x2e (`FUN_002c5450` D:L166281-166293, read by `FUN_002c3ac0` D:L165206-165222). The page
   * keeps it (`./seatClans`, `NetClient.clans`) for the speaker line and the game lobby's lists and talker bar; an older
   * page's switch has no case for it and passes it by.
   */
  | { type: 'seatClans'; seats: { id: number; clan: string }[] }
  /**
   * W3.R11: a round begins (its number, its length in seconds, the match's wins so far, the game's round count).
   * Protocol 10: its `epoch` (the round serial, `EnvWire.epoch`: the page resets its world and takes no older round's
   * state after it) and `startTick`, the room tick it began on (the welcome's `tick` clock). LATER 85 (additive under
   * protocol 11): `ghosts`, the seats the start passed by -- a late classic seat whose console has not loaded, no body --
   * absent when none; a page named there stays a ghost of the round (`NetPage`'s `seatGhost`).
   */
  | { type: 'roundStart'; round: number; seconds: number; wins: { seal: number; terrorist: number }; rounds: number; epoch: number; startTick: number; ghosts?: number[] }
  /**
   * Classic: a side has no living player (the maps' `objectives` script, sequence `start`): the winner, whose lines the
   * page posts (`./rules` `eliminationLines`); the round's result follows the map's hold later (`eliminatedHoldS`).
   */
  | {
    type: 'eliminated'; winner: Team;
    /**
     * HX-1 (additive under protocol 10, HX.R7): which of `start`'s branches decided -- 'elimination' (absent: an older
     * room), EXTRACTION's 'rescue' (`rescuecount >= 2 AND rescuecheck`) or 'hostageKills' (`mp_hostages_by_seals >= 2`).
     * The page posts the elimination's lines meanwhile; the branches' own are HX-5's. An older page posts the
     * elimination's two lines on a rescue win.
     */
    reason?: 'elimination' | 'rescue' | 'hostageKills';
  }
  /**
   * LATER 127 / 138 (additive, the version kept): the clock's end decided the round for a side -- ESCORT's SEALs
   * (`mission_timer`'s `mp_winner = 0`), BREACH's Terrorists (`mp_winner = 8`) -- the room's decided hold then runs
   * (`timeoutHoldS`) and the page plays the map's `*_success` lines (`RoundCues.decided.timeout`). Its own event, never an
   * `eliminated` reason: an older page drops a type it does not know and posts nothing (not the elimination's lines).
   */
  | { type: 'timedOut'; winner: Team }
  /**
   * LATER 131 (additive, the version kept; research 175 §4): ESCORT's script lines at the room's own moments -- 'staged'
   * RescueN's latch (`rescuecount += 1`), 'aborted' VIPcheck's `killcount >= 2` while it runs (before SEALcheck's gate
   * and before any decision), 'extracted' EndRescueN's `truecount += 1`. `vip` is the escortee
   * record's name (`VIP1`..`VIP3`) and nothing else; the page finds RescueN / EndRescueN by its `<vip>_valve_alive`.
   * Absent on 'aborted'. An older page drops a type it does not know.
   */
  | { type: 'escort'; kind: EscortLine; vip?: string }
  /** HX-1 (additive under protocol 10, HX.R7; research 237 s4): a hostage's state, on change (`HostageStateWire`). */
  | ({ type: 'hostageState' } & HostageStateWire)
  /**
   * HX-1 (additive under protocol 10, HX.R7; research 237 s3): the round's total, in seconds from its start, after a
   * SEAL's hostage kill took its minute off (`FUN_002a6960` D:L148936-148949): the page's clock is the new total less
   * the time elapsed. An older page ignores it (the next `score`'s `timeLeft` corrects its clock).
   */
  | { type: 'roundTime'; seconds: number }
  /**
   * XR-05 (additive JSON, PF.R33; research 214 s1): the bomb, on every transition and every hold's begin and end --
   * text frames ride the socket in order with the snapshots, so none is missed or reordered.
   */
  | ({ type: 'bomb' } & BombWire)
  /**
   * Protocol 7: the answer to a `loadout` request -- the kit the room holds for the recipient's next round (`kit`, five
   * item ids: what it will spawn with), and when the picks were refused, why and at which (`@s2u/scene`
   * `PickRefusal`: `slot` a slot past 0-4 or a malformed list, `unknown` an id with no record, `locked` a locked slot,
   * `refused` an item the side or the slot does not take, `alive` a living player's in a round -- the menu opens only
   * dead --, `rate` one past the request budget, `type` (protocol 9) a character type the side does not offer, `round` (protocol 9)
   * a new type in a round the player has spawned in); refused,
   * the kit and the type are the ones held before.
   */
  | {
    type: 'loadout'; kit: number[]; refused: { reason: LoadoutRefusal; at: number } | null;
    /** Protocol 9: the character type held for the next spawn (the kit's). */
    char?: CharType;
  }
  /**
   * KIT-HELD (additive, the version kept): to one seat, the type, the picks and the kit the room holds for its next
   * spawn (`Room.tellKitHeld`: `Player.nextChar`, `picks`, `next` or the type's own kit) -- at the launch, at the page's
   * `loaded` (the front end's match page after the lobby's hand-off) and after the welcome of a seat whose kept record
   * restored its picks -- so the page's WEAPON EXCHANGE opens on the kit the player holds and its next confirm extends
   * the list the room holds (`PlayerLoadout.held`), as the original's menu reads the type's kit (`FUN_0023e5e0`
   * D:L88379; research 94 §A6, R94.3). Its own type, never an unsolicited `loadout`: the page pairs each `loadout`
   * answer with its requests in order (`NetPage.inFlight`), and takes a `kitHeld` only with none in flight. An older
   * page ignores it (its event switch's default); an older room never sends it.
   */
  | { type: 'kitHeld'; team: Team; char: CharType; picks: { slot: number; id: number }[]; kit: number[] }
  /**
   * PF-34 (additive JSON, PF.R33; ruling PF.R54; research 234 s1-s2): a world drop laid -- a classic death's (one bundle
   * and the weapons, `FUN_005a0040` D:L458646-458706), a claim's replaced slot, or a bundle's residual told again under
   * its `did` (the page replaces by `did`). The original announces kind 8 and kind 9 objects through `FUN_00541700`
   * D:L408884-408919 ("Wep PU").
   */
  | ({ type: 'drop' } & DropWire)
  /**
   * PF-34: a drop gone -- a weapon claimed, or a bundle emptied by walking -- by whom; after a weapon claim, the taker's
   * live kit (`kit`, five item ids: the observers' `RemotePlayers.setKit`). The saved pick is not changed.
   */
  | { type: 'taken'; did: number; by: number; kit?: number[] }
  /**
   * OT.R59 (RECONNECT-GHOST; additive under protocol 11, a labelled adaptation): to a page whose newer connection the
   * room resumed (`Room.handBack`), right after its welcome (`resumed`): its body as the room holds it -- where it stands
   * and its posture (the snapshot's), its facing, the room's command count it numbers on from, its six parts' health and
   * armour, its live kit and both firearm rings' slots (`MagazineRing.state`, as `kit`'s), the pouch's throwables and
   * charges left by name, the firearm in the hand (0 the rifle, 1 the sidearm) and the launcher held (its item id, or
   * null). The page stands its walk there with no spawn's reset and lays the counts (no refill). RESUME-MOUNTED
   * (OT.R59's follow-up, additive): `turret`, the turret the seat holds (`Player.mounted`), or null -- the page keeps its
   * walk locked and its turret page's hold -- and, while the mount's steer still runs (`Player.seat`), `steer`: its ticks
   * so far (`SeatSteer.steered`) and the facing it turns toward (`SeatSteer.toward`, degrees), so the page resumes the
   * clip and the look's turn at the room's tick. Absent from an older room: unmounted.
   */
  | {
    type: 'resume'; id: number; at: [number, number, number]; yaw: number; posture: 'stand' | 'crouch' | 'prone'; seq: number;
    health: number[]; armour: number[]; loadout: number[]; rounds: [number[], number[]];
    pouch: Record<string, number>; weapon: 0 | 1; held: number | null;
    /** MLS-EQ: exact throwable/charge rings; older rooms send the aggregate pouch only (research 361 §3). */
    equipmentSlots?: EquipmentSlotState[];
    turret: number | null; steer?: { ticks: number; toward: number };
    /**
     * LATER 154 (additive under protocol 11): with `turret`, the mount's window end in the page's numbering (`Room`'s
     * `Player.seatOff`: the mount's `after` + max(`SeatSteer.ends`, `TURRET_RELEASE_WAIT_TICKS`)) -- the first command a
     * dismount may name and be taken -- so the page offers the release on the room's count (`../turretPage`
     * `releaseOffered`), not 1.25 s from the welcome. Absent unmounted and from an older room (the page waits from the welcome).
     */
    seatOff?: number;
    /**
     * OBF-20 (the review's F1; additive under protocol 11): the seat's last taunt and communication requests the room took
     * (`TauntRequests.last`, `CommunicationRequests.last`), which a reloaded page numbers on from (`NetClient.requestFloor`)
     * -- the other pages keep the (sender, request) pairs they heard. Absent from an older room: 0.
     */
    taunt?: number; communication?: number;
  }
  /**
   * PF-34: to the taker only, after a claim or an ammunition transfer: his live kit, the firearm slot a claim replaced
   * (absent for ammunition), and both firearm rings' ten slots exactly as the room holds them (`MagazineRing.state`) --
   * no round is created on the page (`Fire.takeWeapon`, never `fillMags`).
   */
  | {
    type: 'kit'; loadout: number[]; slot?: 0 | 1; rounds: [number[], number[]];
    /**
     * PF-34 review: after an ammunition transfer, each ring's slots the transfer wrote -- the only ones the page sets
     * (`Fire.setRing`'s `only`): the page's magazine in the weapon falls as it fires, ahead of the room's, so the room's
     * other values are not newer than the page's. Absent after a claim (the claimed ring is new, the other untouched).
     */
    filled?: [number[], number[]];
  };

/** Why a `loadout` request was refused (`@s2u/scene` `PickRefusal`). */
export type LoadoutRefusal = 'slot' | 'unknown' | 'locked' | 'refused'
  /** Protocol 9: a character type the player's side does not offer on the map (`armoryTypeAllowed`). */
  | 'type'
  /** The player is alive: the menu opens only dead or a ghost (`canOpen`, research 94 §B2). */
  | 'alive'
  /**
   * Protocol 9 (W5.R1): a new character type in a round from a player that has spawned in it -- the ARMORY is between
   * rounds only; the dead player's WEAPON EXCHANGE changes the kit, never the type (research 94 §B2, research 95 §8
   * `ARMORY_OUTSIDE_ROUND_READING`).
   */
  | 'round'
  /**
   * Past the request budget (`LOADOUT_BURST` / `LOADOUT_EVERY`): answered, not dropped, so that the page's answers stay
   * paired one to one with its requests (the M10 review); the kit held is unchanged.
   */
  | 'rate';
/** The most picks a `loadout` request may carry (the server's guard: the page compacts its list, `../loadout`). */
export const MAX_LOADOUT_PICKS = 64;

/**
 * ARMORY_SERVER_NAME_READING (research 95 §8; the controller's ruling under the owner's mandate, 2026-10-01): the ARMORY
 * title bar's `roomname` text ((200,46), x0.6, research 95 §2.2) shows the UIVAR `MEDIUS_LOBBY_NAME` -- the Medius lobby
 * world's name (registered with `GAMENAMEVAR` in the online lobby's init, `FUN_002e0450` L182779-182781; reCOM
 * `zNetMedius.cpp` L27-28 names them `uiv_LobbyWorldNameVar` / `uiv_GameNameVar`), the server's region in the owner's
 * capture ("US East (Ohio)" over the game's name). The viewer has no Medius lobby: online the match server's own name
 * stands in, as its operator configures it (`SERVER_NAME`), and this default when none is set (a local server).
 */
export const ARMORY_SERVER_NAME_READING = 'LOCAL';
/** The longest server name the welcome carries (a server policy: the title bar's line, never a flood). */
export const SERVER_NAME_MAX = 32;
/** A configured server name as the welcome carries it: control characters dropped, trimmed, cut; blank is the default. */
export function serverNameOf(raw: unknown): string {
  // eslint-disable-next-line no-control-regex
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, SERVER_NAME_MAX).trim() : '';
  return s || ARMORY_SERVER_NAME_READING;
}

/**
 * Which of the game's kill lines (research 91b section 3). 'orphan' (m-13 of review 2): a grenade whose thrower left
 * the room before it went off -- no one's kill, scored to no one (never the victim's suicide); `killerName` names it.
 */
export type KillHow = 'weapon' | 'grenade' | 'suicide' | 'fall' | 'teamkill' | 'orphan';

/** The name a guest takes before setting one (W3.R5; research 91b section 6 for the limit and the character set). */
export const GUEST_PREFIX = 'GUEST';
