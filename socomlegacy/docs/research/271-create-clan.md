# 271 -- CREATE CLAN: the page, the name's keyboard and its cap, the create and its answers, the CLAN row (ONL-26)

- Date: 2026-10-13 (web sprint 18, the clans' half, wave 1; the plan `../plans/2026-10-13-web-sprint-18-the-clans-pages.md`,
  W18.R12-R14; the brief `../plans/briefs/2026-10-13-s18c-onl-26-create-clan.md`).
- Status: **reading, reviewed** (ONL-26, 2026-10-13, by a fresh reviewer in two passes -- PASS WITH FINDINGS, then PASS; merged at c16867679 after its fresh review, the clans' plan's Log). Every value of the original below is read from the disc's dialogs through the
  repository's readers (`tools/dump-online-dialogs.ts --dialog dlgCreateClan.rdr` and `--dialog dlgWorldOfSOCOM.rdr`:
  the layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`, the captions of `UIMNLOC`; the `GetTextInput`
  block through `decodeTextInput`), from the retail decompilation (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`;
  cited, never pasted) and from the ELF's strings and data (`S:0x<addr>`, `tools/elfImage.ts`). Unit-tested against
  that reading, and the page replayed over the machine from the disc's own records (§7); nothing here is measured on
  the original running -- ONL-32's capture (PC research 80 H1 "Clan: create") is the proven level.
- Stands on research [262](262-clans.md) (§1 SVC-08's CreateClan and its codes, §2 the clan stats, §3.1 the name's
  rules), [119](119-the-software-keyboard.md) (§4 the block, §5 the call sites: `dlgCreateClan` / `SetVariable`
  `MPPLAYERNAME` 13 / 31, §6 the caps), [97](97-service-shape-and-medius-map.md) (§2 row CreateClan: the TextFilter
  before, UpdateClanStats and UpdateLadderStats after), [158](158-the-socom-ii-online-menu.md) (SOCOM II ONLINE's rows)
  and [269](269-the-players-pages-and-the-medals.md) (§1 the page-over-the-machine pattern, the ticket adaptation), and
  does not restate them.
- Code: `packages/ui/src/screens/createClanCommands.ts` (`CreateClanCommands`, `LobbyClan`, `clanStatsRecord`,
  `playerNameAndTag`, the names of §6); `packages/ui/src/screens/worldOfSocomCommands.ts` (the CLAN row out of
  `PARKED_ROWS`; `WorldOfSocomCommands.clan`; `IsMemberOfClan` / `IsLeaderOfClan` over it; GetClan's no-clan reply
  clearing it; the room list's clan name from it); the page's transport and mount
  `packages/viewer/src/createClanHost.ts` (`fetchCreateClanService`, `sessionCreateClan`, `connectCreateClan`). The
  services are SVC-08's, unchanged (`packages/central/src/clans.ts`: `/clan/create`, `/clan/update-stats`). The mount in
  `packages/viewer/src/frontEnd.ts` (a hot file) is applied under the seat's claim (HANDOFF §3; e870dac52, §4).

## 1. The page as read (the disc's record)

`dlgCreateClan.rdr` (READERC; background `multplay_back.tif`; scripts its own set and `UIanim.rdr`):

- **The layout**: the title `bar_title` #217 "CREATE CLAN"; the wrapped `DescriptionText` #218 (the leader's duties); `txtClanName` on CLANNAMEVAR; two rows, `claname` #219 "SET CLAN NAME" and `createClan` #220 "CREATE
  CLAN"; the foot's #149 / #150 (BACK, SELECT); `playername` on PLAYER_NAME_AND_TAG with the five medals
  (ONL-34's `ActivateMedalOfMerit`); the net monitor.
- **The bindings**: ONSTART `net_monitor`, `disable_create_button`, `ActivateMedalOfMerit`; TRIANGLE
  `goto_menu(PREVIOUS_SCREEN)`; MP_CREATE_CLAN_SUCCESS `goto_menu(dlgManageRosterLeader.rdr)`; MP_CREATE_CLAN_FAILURE
  `create_clan_failure`; MP_FILTER_FAILURE `OnFilterFailure`; MP_MEDIUS_ERROR `OnMultiplayerDisconnect`; ON_SKB_APPLY
  `enable_create_button`; MP_SYSTEM_MESSAGE `OnSystemMessage`; `claname` ONACTIVATE `OnClanNameAct` (#222 "¦ Give your
  Clan a name.") and CROSS `SetVariable(CLANNAMEVAR)`; `createClan` ONACTIVATE `OncreateClanAct` (#221 "¦ Create your new
  Clan.") and CROSS `CreateClan`.
- **The animations**: `disable_create_button` `DisableButton(createClan)`; `enable_create_button`
  `PruneUIVarSpaces(CLANNAMEVAR)`, `IF TestUIVar(CLANNAMEVAR)` `EnableButton(createClan)` `ELSE` `DisableButton` `ENDIF`;
  `SetVariable` `STOP menu_fade_up`, `SOUND .DINK`, `GetTextInput($1)`; `CreateClan` `SOUND .DINK`,
  `PruneUIVarSpaces(CLANNAMEVAR)`, `CreateClan(NA)`; `create_clan_failure` `POPUPDIALOG`, `POPUP #223 buttons none ->
  ConfirmPopup`, the wait, `ActivateButton(claname)`; `OnFilterFailure` `VALVE ConfirmPopup = 0`, `POPUPDIALOG`, `POPUP
  #225 buttons #226 -> ConfirmPopup`, the wait, `ActivateButton(claname)`; `SetFromValve` (`VALVE uiRosterReturnScreen =
  1`) is in the set and bound by no record.
- **The captions** (UIMnLOC): #223 "Clan Creation Failure. It is possible that that name is already in use. ¦
  CONTINUE." (the popup has no button: its own text says CONTINUE); #224 "Create Clan Name" (the keyboard's title, §2.1;
  no widget or script names it); #225 "The Clan name you selected could not be registered due to questionable content in
  the name. Please select another Clan name and try again." with #226 "CONTINUE". All ten of #217-#226 are used: #224
  by the keyboard's block, #226 as #225's button.
- **The one edge out** is the success's, to `dlgManageRosterLeader.rdr` -- the leader's roster, ONL-27's page; TRIANGLE
  returns to the screen before (SOCOM II ONLINE).

## 2. The row and what each answer shows (the C bodies)

### 2.1 The name: the keyboard and its cap

SET CLAN NAME opens PLAT-17's keyboard with `SetVariable`'s `GetTextInput` block (the command's 0xAC bytes,
`decodeTextInput`): `UiVar` `$1` -- the binding's argument, CLANNAMEVAR (research 119 §4) --, `SkbName` `MPPLAYERNAME`,
`Purpose` `_224_CreateClanName_MSG`, **`MaxChars` 13, `MaxBytes` 31**, no recipient, neither `NoDQuote` nor `AllowEmpty`
(research 119 §5's row, re-read here off the disc by `tools/test/createClanDisc.test.ts`). The caps are the block's and
PLAT-17 applies them as the original does (`FUN_00396d40` D:L289553-289608): a fourteenth character is refused with
`.NEG`. The characters are `MPPLAYERNAME`'s grid (research 119 §2); the keyboard opens on an empty buffer. ENTER applies
(ON_SKB_APPLY): `enable_create_button` prunes the spaces (`PruneUIVarSpaces`, ONL-06's body) and enables CREATE CLAN when
the name is not empty (`TestUIVar`, MENU-01a's): a name of spaces only leaves it disabled.

**`CLAN_NAME_CHARS_PLACEHOLDER` stays named** (the server's, `clans.ts`; research 262 §3.1): the client's cap is now
read twice over (research 119 §5 and this note), but the constant stands in for the *original server's* rule for a clan
name, which no client read can show -- the console never sends more than 13 characters, so a server's refusal of a
longer one is unobservable from any console (ONL-33, H85). Its value, 13, is the client's cap, as its doc says; nothing
here changes it.

### 2.2 CreateClan, the filter, the create

- **`FUN_0027a950`** (UICreateClan, D:L124567-124586): CLANNAMEVAR (S:0x3eee68) found or added TEMPORARY (D:L124577); its
  text when it holds a string, else the command's own argument (`FUN_0026ed60` of the record's +8, D:L124578-124580); to
  `FUN_002e7a10`; 1.
- **`FUN_002e7a10`** (D:L187112-187135): only while the lobby session's +0x7d is set and its state +0x60 is 0x0b; a
  0x6c-byte TextFilter request (Lobby 0x98, research 97 §2): the session key at +0x15, +0x28 left 0 (PassFail), the
  name's 32 bytes at +0x2c (D:L187128) -- the whole of any name the keyboard's 31-byte cap lets through --, sent by
  `FUN_00648678` with the callback `FUN_002e7aa0` (D:L187130).
- **`FUN_002e7aa0`** (D:L187137-187165): a result (+0x58) below 0 raises MP_FILTER_FAILURE (S:0x3f4280, D:L187150) and
  sets CLANNAMEVAR (the lobby's +0xf0) "Unaffiliated" (S:0x3f4298) and Clan_Description (+0xf4) " " (S:0x3f3f18); else
  CLANNAMEVAR is set to the reply's text (+0x15, D:L187156) and CreateClan sent (0x4c bytes, the session key, the text's
  32 bytes at +0x2c; `FUN_00645710`, the callback `FUN_002e7b80`). Our services serve no TextFilter:
  `CLAN_NAME_FILTER_PLACEHOLDER` (§6) -- every name passes as typed, as the persona's registration does
  (`NAME_FILTER_PLACEHOLDER`). The page shows #225 only for a service that answers a filter (the tests' fake).
- **`FUN_002e7b80`** (D:L187167-187221): a status (+0x18) not Success ("MediusCreateClan", S:0x3f42b0) raises
  MP_CREATE_CLAN_FAILURE (S:0x3f4340, D:L187186) and sets CLANNAMEVAR "Unaffiliated" and Clan_Description ""
  (S:0x3f3f38). Success keeps the clan id (+0x1c) in `DAT_003df298` and `DAT_0044f59c`, sets the leader id
  `DAT_0044f5c4` to mine (`DAT_0066a4f0`, D:L187193; `CLAN_LEADER_MINE_ADAPTATION`), raises MP_CREATE_CLAN_SUCCESS
  (S:0x3f42d0, D:L187196), copies CLANNAMEVAR's text into the clan's name (0x44f5a4, 32 bytes, D:L187202), empties
  Clan_Description, formats the clan stats and posts them (§2.3), and runs `FUN_002e7f50` (§2.4).

**What each of SVC-08's answers shows** (the console reads success from failure only, research 262 §1.2):

| SVC-08's answer (`clans.ts` `create`) | status | the console | the page |
|---|---|---|---|
| a new clan | Success 0, the id | MP_CREATE_CLAN_SUCCESS | `goto_menu(dlgManageRosterLeader.rdr)`: `SND_DINK`, the leader's roster |
| a standing clan of the name | ClanNameInUse -970 | MP_CREATE_CLAN_FAILURE | #223, no button; CROSS closes it, SET CLAN NAME active, the name "Unaffiliated" |
| the name past the rules (31 bytes, 13 characters) | Fail -966 | MP_CREATE_CLAN_FAILURE | #223 (the console cannot send one: §2.1) |
| the caller leads a standing clan | AlreadyLeaderOfClan -992 (`IN_A_CLAN_CREATE_STATUS_PLACEHOLDER`) | MP_CREATE_CLAN_FAILURE | #223 |
| the caller is a member of one | Fail -966 (the same placeholder) | MP_CREATE_CLAN_FAILURE | #223 |
| a name the text filter refuses | (no create sent) | MP_FILTER_FAILURE | #225 with #226; CROSS closes it, SET CLAN NAME active |

The in-a-clan refusals are reached today: GetClan's stub reads every player as in no clan at each SOCOM II ONLINE
(§3), so a leader or a member can open CREATE CLAN and is refused by the server, #223 -- the original, whose GetMyClans
knows the clan, would have opened the roster instead (owed to ONL-27). *[2026-10-13, ONL-27: GetMyClans in place of the
stub (research 272 §3), so a leader or a member reaches his roster from the CLAN row, as the original; the in-a-clan
refusals stay the server's answer to a client that does not know its clan yet (an accept is known at the next SOCOM II
ONLINE, research 273 §3).]*

### 2.3 The clan stats and the name at the foot

After the success (D:L187203-187216): Clan_Description found or added TEMPORARY (S:0x3f42f0), its text the tag (here
always "", just emptied); `sprintf("%.3d%.12d%s", 0, DAT_0044f770, tag)` (S:0x3f4328, D:L187210; the first call's
`clan_icon_%.2d.tif` of 0, S:0x3f4310, overwritten) into 256 bytes, all 256 copied (D:L187213) into UpdateClanStats
(Lobby 0x84, 300 bytes, the clan id at +0x28; `FUN_00646660`, the callback `FUN_002e7e70`). `DAT_0044f770` lies in the
BSS (0 at boot; the ELF read by the dev-disc test), changed only by the roster's rows and `FUN_002e7f50`, so a new
clan's record reads "000", twelve zeros and "" -- fifteen zeros and the NUL (`clanStatsRecord`; the tail 0 as the
server's `CLAN_STATS_TAIL_READING`). The server stores it as sent (SVC-08's `updateStats`, the leader only).

**`FUN_002e7e70`** (D:L187255-187279): Success ("MediusUpdateClanStats", S:0x3f4360) sets PLAYER_NAME_AND_TAG (S:0x3f4380,
added PERMANENT, D:L187272) to `"%s"` of the account's name (S:0x3f43b8) when the tag is empty, else S:0x3f43a0 (`#C`
0x80 0x40 0x20 `"[%s] "` `#C` 0x80 0x80 0x80 the name: `playerNameAndTag`); a failure is silent. After a create the tag
is empty, so the foot reads the name alone.

### 2.4 The clan's ladder post (`FUN_002e7f50` D:L187285-187326)

The rating recomputed -- the mean of the first eight roster rows' +0x1cc when the roster (`DAT_0044f744`) holds eight
or more, else 0 -- and posted as UpdateLadderStats type 1 (Lobby 0xce, 0x58 bytes, the value at +0x1c;
`FUN_0064b248`). Horizon has no handler for 0xce and our services serve none; the client holds no roster here (ONL-27's) *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]*,
so the value is 0 and the post is not sent: `CLAN_LADDER_POST_PLACEHOLDER` (§6), SVC-11's.

## 3. SOCOM II ONLINE's CLAN row

`create_modify_clan` (CLAN's CROSS, `dlgWorldOfSOCOM.rdr`): `VALVE StartMusic = 1`, `SOUND .DINK`, then `IF
IsMemberOfClan` -> (`IF IsLeaderOfClan` -> `SwitchMenu(dlgManageRosterLeader.rdr)` `ELSE` `SwitchMenu(dlgManageRoster.rdr)`)
`ELSE` `SwitchMenu(dlgCreateClan.rdr)`. CLAN's ONACTIVATE `ClanManageAct` reads the same two rows for its help line
("¦ Create a clan." with no clan, the member's line otherwise; research 158). The row is out of `PARKED_ROWS`: its CROSS runs the set's script
whole.

The two rows read **the client's clan** (`LobbyClan`, one for the session, held by `WorldOfSocomCommands.clan` and handed
to `CreateClanCommands`):

- `IsMemberOfClan` (0x27a910 -> `FUN_002e6830` D:L186491-186497): `DAT_003df298` is not -1. -1 in the ELF's data
  (the dev-disc test reads it) and at the lobby's init (D:L182792); the create sets it.
- `IsLeaderOfClan` (`FUN_0027a890` D:L124550-124564 -> `FUN_002e67d0` D:L186474-186488): the leader id `DAT_0044f5c4`
  is the named roster member's (`FUN_002e9460` on the roster 0x44f740), else mine. The roster is ONL-27's: with none held
  the compare is with mine, which the create sets (`CLAN_LEADER_MINE_ADAPTATION`). *[2026-10-13, ONL-27: the roster held
  in `LobbyClan.roster` and `IsLeaderOfClan` by name, by id, by INPUT_STRING (research 272 §4, §10).]*
- GetClan stays ONL-27's stub (`GET_CLAN_STUB_READING`): it applies GetMyClans' no-clan reply at once, and that reply's
  branch (`FUN_002e8bd0` D:L187786-187802) sets the three ids -1 and zeroes the name -- the client's clan cleared
  (`LobbyClan.none`). The rating `DAT_0044f770` goes to 0 there too, through the roster builder the branch calls last
  (`FUN_002e9740` empties the roster at D:L187801, then `FUN_002e6af0` at D:L187802 writes `DAT_0044f770 = 0` on entry,
  D:L186623, and its mean over no row stays 0, D:L186687-186690); so a rating held before a no-clan reply never reaches
  the next create's stats record (D:L187210). `init_screen` runs GetClan at each arrival on SOCOM II ONLINE, so **a clan created this session is
  forgotten by the client at the next return to the menu**, and one made in an earlier session is never known: the CLAN
  row reaches CREATE CLAN again and the server refuses the second create (#223). Owed to ONL-27's GetMyClans (SVC-08's
  `/clan/my-clans` answers it). *[2026-10-13, ONL-27: built -- GetMyClans replaces the stub (`GET_CLAN_STUB_READING`
  retired), so a clan made in any session is known at each arrival (research 272 §3).]*
- **The roster's seam** (ONL-27): the in-a-clan branch and the create's success switch to `dlgManageRoster.rdr` /
  `dlgManageRosterLeader.rdr`, the disc's pages, drawn and run by their own scripts; their rows' bodies (GetClanRoster,
  GetInvitedPlayers, DisbandClan ...) are ONL-27's and answer the table's declared values until then *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]* (PLAT-08's "not
  implemented"). The leader's page blocks on nothing (its ONSTART asks and loops `GetInvitedPlayers` every 20 ticks) and
  its TRIANGLE is `goto_menu(dlgWorldOfSOCOM.rdr)`, so the way back works today.
- The room list's "+Clan - %s" rule (`roomListRows`, D:L184996-185003) reads the clan's name from the same client clan
  when the page hands no `clanName` in. **It never shows a clan room today**: SOCOM II ONLINE's `init_screen` runs the
  GetClan stub, which clears the client's clan at once (above), so the room list is always drawn for a player in no
  clan -- until ONL-27's GetMyClans. *[2026-10-13, ONL-27: built -- the rule draws the member's clan room (research 272
  §3).]*

## 4. The transport and the mount

`packages/viewer/src/createClanHost.ts`: `POST <base>/clan/create` `{ clanName }` -> `{ status, clanId }` and
`POST <base>/clan/update-stats` `{ clanId, stats }` (the 256 bytes as 512 hex digits, the server's body) -> `{ status }`,
at the page's own origin (`accountServiceBase`) with the session's ticket as the bearer, `credentials: 'omit'`, `cache:
'no-store'`; 401 the session lost (the lobby client's `sessionLost`: MP_MEDIUS_ERROR, `OnMultiplayerDisconnect`); any
other refusal or shape a request never answered; no ticket, no request. `connectCreateClan(host, { uiVars, clan, service,
ticket, sessionLost, event, lobby })` registers the row over the session's lobby state and account name.

**The mount in `frontEnd.ts`** -- the import, the session option `createClan?: CreateClanTransport`, the call
`connectCreateClan(this.host, { ..., clan: this.world.commands.clan, ... })` after `connectWorldOfSocom`, and the page's
`fetchCreateClanService(accountServiceBase(...))` -- is a hot file's four lines, applied under the seat's claim (HANDOFF
§3 on `agent/online`) in e870dac52 and pinned as text by `packages/viewer/test/createClanHost.test.ts`: the shipped
page's CREATE sends SVC-08's create with the session's bearer.

## 5. The deviations

1. **The text filter** (`CLAN_NAME_FILTER_PLACEHOLDER`): not asked; every name passes. The console asked the lobby
   server's TextFilter before every create; its words are unread (H85, SVC-23).
2. **The clan ladder post** (`CLAN_LADDER_POST_PLACEHOLDER`): not sent (no 0xce on our services; SVC-11's).
3. **The leader's id** (`CLAN_LEADER_MINE_ADAPTATION`, a browser adaptation of the representation): kept as the mark
   "mine"; what `IsLeaderOfClan` answers is the original's.
4. **The chain's ticket** (`CREATE_CLAN_TICKET_ADAPTATION`, a browser adaptation): the filter's pass, the create and the
   stats post go on only under the session's ticket they began with, as the ignore list's (research 269 §1.6 item 3).
5. **GetClan's stub** (ONL-27's, §3): the client forgets the clan at each return to SOCOM II ONLINE. *[2026-10-13, ONL-27:
   gone -- GetMyClans transcribed (research 272 §3).]*

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CLAN_NAME_FILTER_PLACEHOLDER` (ui `screens/createClanCommands.ts`) | `'no text filter: every name passes'` | the create's TextFilter (Lobby 0x98 PassFail, `FUN_002e7a10` D:L187112-187135, the reply `FUN_002e7aa0` D:L187137-187165): the server's words, unread (§2.2) | the owner's word list (H85) or SVC-23's filter; ONL-32's transcript of a create | placeholder |
| `CLAN_LADDER_POST_PLACEHOLDER` (ui `screens/createClanCommands.ts`) | `'the clan ladder post (0xce type 1) not sent; the rating 0 with no roster held'` | the create's last step `FUN_002e7f50` (D:L187285-187326): UpdateLadderStats type 1 of the roster's mean, which Horizon and our services do not answer (§2.4) | SVC-11 (the clans' ladder, W18.R13 / H188) | placeholder |
| `CLAN_LEADER_MINE_ADAPTATION` (ui `screens/createClanCommands.ts`) | `'the leader id the create sets kept as "mine": the page holds no account id'` | no original: the console's `DAT_0044f5c4 = DAT_0066a4f0` (D:L187193) with the account id the page does not hold (§5 item 3) | nothing to settle: a labelled adaptation | adaptation |
| `CREATE_CLAN_TICKET_ADAPTATION` (ui `screens/createClanCommands.ts`) | `'a create goes on only under the ticket it began with'` | no original: the console's chain dies with its connection (§5 item 4) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_NAME_CHARS_PLACEHOLDER` (server `clans.ts`, research 262 §6) | 13 | the original server's clan-name rule; the client's cap read here again (§2.1) | the owner (H85), or a period capture of the original refusing a name | kept: listed in research 262, unchanged |

## 7. The tests, and the runs (unit tests, a dev-disc test and the page over the machine; no browser, no capture)

- `packages/ui/test/screens/createClanScreen.test.ts` (new): the row held to the table (id 50, `0x27a950`, ONL-26,
  answer 1) and the ELF's names; the client's clan -- the lobby's init, `IsMemberOfClan` / `IsLeaderOfClan` over it,
  GetClan's no-clan reply clearing it; `CreateClan` -- success (the create, MP_CREATE_CLAN_SUCCESS, the ids, the name, the
  stats record, PLAYER_NAME_AND_TAG), every refusal (-970, -992, -966, 1: MP_CREATE_CLAN_FAILURE, "Unaffiliated"), the
  filter refusing and replacing, the session down or out of state 11, CLANNAMEVAR holding no string, a refused stats
  post, a create answered after the ticket changed; `clanStatsRecord`, `playerNameAndTag`; the unparked row. Over the
  machine from the disc's records (or the fixtures): the CLAN row's CROSS with no clan to CREATE CLAN; the ONSTART, the
  captions #217-#222; SET CLAN NAME's keyboard (`MPPLAYERNAME`, #224, 13 / 31, the fourteenth refused, ENTER enabling
  CREATE CLAN, the spaces pruned); CREATE to the leader's roster; #223 for -970 and -992 with the way back to SET CLAN
  NAME and "Unaffiliated"; #225 with #226; a name of spaces; TRIANGLE back with SND_DINK.
- `packages/viewer/test/createClanHost.test.ts` (new): the two requests' paths, bodies (the 512 hex digits) and bearer;
  401 the session lost, other refusals and shapes rejected; no ticket no request; the mount's row over the transport, the
  lobby down, no transport.
- `tools/test/createClanDisc.test.ts` (new, dev-disc): the layout, the bindings, the animations' ops and the one edge
  off the disc; `SetVariable`'s block decoded; the ELF's strings, 0x3df298's -1 and the BSS words.
- `packages/ui/test/screens/worldOfSocomCommands.test.ts`: the parked rows without CLAN, `create_modify_clan` ungated.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 8. What is left

- ~~**A rendered run** of the page on a lobby-launched persona (the plan's gate) where the merge controller asks for one;~~ *[2026-10-13: rendered -- `e2e/menuClan.spec.ts`, 1 passed at 20261013T1416Z (5dc0a71a2) and
  20261013T1536Z (e0649c544), the clans' plan's Log.]*
  the mount in `frontEnd.ts` is applied (§4).
- **ONL-27**: GetClan's GetMyClans (the client's clan from `/clan/my-clans`, so the CLAN row reaches the roster for a
  member and the leader); the roster pages' rows; the roster held in `LobbyClan` for `IsLeaderOfClan`'s lookup and the
  rating. *2026-10-13: built by ONL-27 (research 272 §3-§4) -- GetMyClans, the roster in `LobbyClan.roster`; the mount in `frontEnd.ts` is the seat's (272 §7).*
- **SVC-11**: the clan's ladder post (`CLAN_LADDER_POST_PLACEHOLDER`).
- **H85 / SVC-23**: the text filter (`CLAN_NAME_FILTER_PLACEHOLDER`).
- **The proven level**: ONL-32's capture of the page (PC research 80 H1 "Clan: create", the title crop) with the
  server's record checked through SVC-08, and its transcript of a create, a refused create and the stats post.
