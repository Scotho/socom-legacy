# 360 -- Three scoring rules from playtest game 195, read at the original (LATER 328, PT195-2)

- Date: 2026-10-23. The deploy seat's debrief of the owner's playtest game 195 (2026-10-22) saw three scoring behaviours
  in the server's log and the replay: a player killed by the bomb scored as a suicide; team kills counted during the
  post-round hold; a team's score carried into the next match's opening scoreboard (LATER 328, issue #457; the plan
  `plans/2026-10-22-playtest-195-debrief.md`, PT195-2). Each might be the original's or ours; nothing changes until the
  original is read. Branch `agent/later-328` from `5704735c5`.
- Track: simulation. One note, three sections (the merge controller's numbering, 2026-10-23).
- Status: **reading, pending review** for rules 1 and 2 (source inspection of the decompilation and the port; no game,
  emulator or capture run); rule 3 **settled as no scoring rule** (§3: the replay file's cut, LATER 349). Nothing here is proven: no capture of either case exists. A step marked
  *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (as research 332 names it). The port at
  `5704735c5`.

## 0. Answers

1. **A bomb victim scored as a suicide -- the original's.** Already a reading on main (research 332 §1.4,
   `MPBOMB_BLAST_OWNER_READING`): each console fires its own MPBOMB round, owned by its own SEAL, and hurts only that
   SEAL with it; `FUN_005a0e70` credits the round's owner (D:L459286-459300), the victim, so the death is a suicide:
   `FUN_00545c90` (D:L411874-411891) adds one to the victim's suicides (`+0x14`) and -2 to his score (`+0x3c`). The room
   does the same (`room.ts` `bombBlast` -> `blastPlayers`, each victim his own hit's owner). **No change.** What settles
   it: capture B item 9 (research 213 §3) -- the death line and the score after a detonation with a player in reach.
2. **Team kills counted in the post-round hold -- the original's.** The death's scorer has no round-state gate (§2), and
   the original's host keeps running the round through a decided hold. The room counts them alike (`decided` is
   in-round). **No change.** What settles it: a capture of a team kill after a round's decision (its score line and the
   round's result screen).
3. **A team's score carried into the next match -- no scoring rule: where the room's replay file is cut.** Match 4's
   recording opens during match 3's GAME COMPLETE hold, so its first `score` is match 3's end state; live, the pages
   showed match 3's results through the hold, as they should, and match 4 opened zeroed (§3). It leaves LATER 328 as
   LATER 349 (product track: the replay recording).

## 1. The bomb victim (cross-reference)

Research 332 §1.1-§1.4 is the reading; this note adds nothing to it but the scorer's lines: `FUN_00545c90` is called
from the death's scorer `FUN_0059ee20` when the killer is the victim (D:L458084-458085, below), and counts the suicide
and the -2 only on the scoring machine (`DAT_0045a0c1` offline, or the host's own `FUN_002b3580` -- D:L411880-411885).

## 2. Team kills after the round's decision

**The scorer** (`FUN_0059ee20`, D:L458059 on): on a death with a credited killer (`param_2` not 0xff and not the body's
last-credited `+0xfc4`, D:L458073), and the victim's team word (`+0xc8`) without its `0x20000` bit (D:L458083):

- the killer is the victim -> `FUN_00545c90`, a suicide (D:L458084-458085);
- the killer's and the victim's team masks share no bit -> the enemy's kill path (`FUN_00545290`, D:L458087-458090, the
  headshot and the kit's counts after it);
- else (the same side) -> `FUN_00545c10`, a team kill (D:L458113): one to the killer's team kills (`+0x16`) and -2 to
  his score (`+0x3c`), on the scoring machine only (D:L411852-411869).

Neither `FUN_0059ee20` nor the two scorers read any round or game state: no phase, no round-over flag. So a team kill
counts whenever a body dies to a teammate's credited hit.

**The hold.** When a round is decided the original's host does not stop the round's update: only `start` and
`mission_timer` stop, and the round's clock, the bomb and the hostages run on (research 237, the penalty minute:
"the host's update keeps running when only `start` and `mission_timer` have stopped"; research 214 §6,
`DECIDED_HOLD_BOMB_READING`). The bodies still take damage and die there, and each death goes through the scorer above.
*Inference:* a team kill in the hold counts as one in play does.

**The port.** The room's phase `decided` is in-round (`inRound`, `live`), its damage and `kill` unchanged there, and
`kill` scores a team kill as `FUN_00545c10` does (`teamKills` +1, -2). The two agree.

## 3. A team's score at the next match: the replay file's cut (LATER 349)

**Game 195's record** (the deploy seat, 2026-10-23: FIREHUGE1's recording, replay analysis only). The carry is at
**match 4's** start, not match 2's. Match 4's file (`2026-10-22T20-57-59.558Z.s2r`: MP72, classic, DEMOLITION, build
`4a0f4f215`) opens at 20:57:59.54, the moment match 3 ended. Its first `score` is match 3's end state -- every row's
kills, deaths and score (e.g. 7/6/42), every row dead, teamScore SEAL 4 -- and the next, at 20:58:22.54 (23 s later,
with the round's spawns), is zeroed.

**The mechanism** (source inspection, `match/src/replay/files.ts` `RoomRecording`, at `5704735c5`). A room's recording
closes its file on the room's own broadcast of a `roundOver` whose `matchOver` is set (`match-over`) and opens the next
file at the room's **next snapshot**, writing the events broadcast since the close first. The room steps on through
GAME COMPLETE's hold, so the next file opens at once and begins with the match's final `score` (broadcast right after
the `roundOver`: `roundOver > score`, the probe's order) and the hold's snapshots. A placed game's held room returns to
its lobby after the hold (`returnToLobby`: `resetMatch`, then a zeroed `score` -- game 195's 20:58:22) and the lobby's
launch starts the next match (`launch` -> `resetMatch`). On the room's unheld path the next match's first `roundStart`
is followed in the same tick by a zeroed `score` (a unit probe on `central/test/helpers/flatRoom`: classic, one round a
match).

**What players saw.** Live, the pages show match 3's results through the hold (GAME COMPLETE) -- the original's -- and
every match opens zeroed: nothing carries into play. The carry is only at the head of the next match's replay file: a
replay viewer opening match 4 shows match 3's end scoreboard until 20:58:22. So it is no scoring rule; it leaves
LATER 328 as **LATER 349** (product track, the match server's replay recording; the merge controller's number and
owner, 2026-10-23).

## 4. Readings

| Name | What it stands for | Settles it | Status |
|---|---|---|---|
| `MPBOMB_BLAST_OWNER_READING` (cross-reference; research 332 §6's row) | a bomb death is the victim's own: a suicide, -2 | capture B item 9 | reading, pending review |
| *(no constant)* the team kill in a decided hold | `FUN_0059ee20` -> `FUN_00545c10` with no round-state gate; the host's update running through the hold: a team kill there counts | a capture of a team kill after a round's decision | reading, pending review |
