# 274 -- the clan messages: the MESSAGES band, the leader's EDIT NEWS, the keyboard's cap (ONL-29)

- Date: 2026-10-13 (web sprint 18, the clans' half, wave 2; the plan `../plans/2026-10-13-web-sprint-18-the-clans-pages.md`,
  W18.R12-R14; the brief `../plans/briefs/2026-10-13-s18c-onl-29-clan-messages.md`).
- Status: **reading, reviewed** (ONL-29, 2026-10-13, by a fresh reviewer -- PASS WITH FINDINGS; merged at a41ce242c after its fresh review, the clans' plan's Log). Every value of the original below is read from the disc's dialogs through the
  repository's readers (`tools/dump-online-dialogs.ts --dialog dlgWorldOfSOCOM.rdr`, `--dialog dlgManageRosterLeader.rdr`,
  `--dialog dlgManageRoster.rdr`: the layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`, the captions of
  `UIMNLOC`; the `GetTextInput` block through `decodeTextInput`), from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and from the ELF's strings and data
  (`S:0x<addr>`, `tools/elfImage.ts`). Unit-tested against that reading, and both pages replayed over the machine from
  the disc's own records (§7); nothing here is measured on the original running -- ONL-32's capture (PC research 80 H1
  "Clan: messages") is the proven level.
- Stands on research [262](262-clans.md) (§5 SVC-10: the five pairs, the cap, the order, the empty text, the cut, the
  delete), [271](271-create-clan.md) (§3 the client's clan `LobbyClan`, the GetClan stub; §4 the transport pattern),
  [273](273-clan-invitations.md) (§5 the transport and the mount, the page-over-the-machine pattern),
  [119](119-the-software-keyboard.md) (§5 the call sites' caps, §6 the caps and the fit) and
  [158](158-the-socom-ii-online-menu.md) (SOCOM II ONLINE's rows, MEDIUS_MOTD), and does not restate them.
- Code: `packages/ui/src/screens/clanMessagesCommands.ts` (`ClanMessagesCommands`: the five rows, the member's pane, the
  leader's kept list; `clanLeaderMessageRows`, `clanMessagesPane`; the names of §6); the page's transport and mount
  `packages/viewer/src/clanMessagesHost.ts` (`fetchClanMessagesService`, `sessionClanMessages`, `connectClanMessages`).
  The services are SVC-10's, unchanged (`packages/central/src/clans.ts`: `/clan/messages`, `/clan/all-messages`,
  `/clan/send-message`, `/clan/modify-message`, `/clan/delete-message`). The mount in `packages/viewer/src/frontEnd.ts` (a
  hot file) is applied under the seat's claim (HANDOFF §3 on `agent/online`), pinned as text by the host's test (§4).

## 1. The MESSAGES band (SOCOM II ONLINE, the member's pane)

### 1.1 As read (the disc's record)

`dlgWorldOfSOCOM.rdr` holds the band under the `motd` WRAPPEDTEXT (on MEDIUS_MOTD, the server's news, research 158):
its children `ClanMessages` (a WRAPPEDTEXT on **MEDIUS_CLAN_MESSAGES**), `DescFieldMid` (`brown_back.tif`) and
`ClanMessageText` (#775 "Clan messages"). MESSAGES (`newsandmessages`, #776) shows it: its ONACTIVATE `OnNewsbtn`
writes #781 ("News of the day. ¶ and ¼ buttons to scroll up/down") and `SHOW motd` with the other panes hidden. No row
of SOCOM II ONLINE's chapter asks the band: its commands name none of the five rows, and `init_screen` asks
`GetMediusAnnouncements`, `CheckMyInvites`, the room list and, last, `GetClan`.

### 1.2 Who writes MEDIUS_CLAN_MESSAGES

The variable is the lobby's +0xcc (S:0x3f3900, added TEMPORARY and set to the empty string S:0x3f38f8 at the session's
start, `FUN_002df6a0` D:L182212-182214; `DAT_0044f43c`). Its writers:

- **GetMyClans' success** (`FUN_002e8bd0` D:L187824-187831): the retrieving text "Retrieving messages from server..."
  (S:0x3f4460) and GetMyClanMessages sent with the clan id the reply just set (`DAT_0044f59c`). SOCOM II ONLINE's
  `init_screen` runs it at each arrival through `GetClan` (`FUN_002e8a90`).
- **`GetClanMessages`** (row 138, `FUN_00279790` D:L123936-123943 -> `FUN_002e8460` D:L187484-187504): the same text
  and the same request -- with no check of the session. Bound by one record only: the member's roster's ONSTART
  (`dlgManageRoster.rdr`, `OnMRosterStart`: `GetClanRoster`, `GetClanMessages`, `GetClan`), a page that draws no
  widget on the variable (a refresh for the next SOCOM II ONLINE).
- **The reply** `FUN_002e84e0` (D:L187508-187560), one per Lobby 0x6d response: a status not Success (`FUN_002f42d0`
  "GetMyClanMessages", S:0x3f4490) sets "No clan messages." (S:0x3f3f60, D:L187521-187523); a Success builds a new array
  of the string elements the variable holds when it is an array (D:L187529-187553) -- none when it holds the retrieving
  string -- then "\n" (S:0x3f44a8) and the reply's text (+0x20), and sets it (D:L187554-187557). **The text form**: an
  array `["\n", m1, "\n", m2, ...]` in the replies' order (SVC-10's `CLAN_MESSAGES_ORDER_PLACEHOLDER`: oldest first), each
  message after a line break; a refusal after successes replaces the whole pane with "No clan messages.".
- **A disband's success** (`FUN_002e68e0` D:L186542) and **a quit's** (`FUN_002e8f70` D:L187889) set "No clan
  messages." -- ONL-27's rows.

GetMyClans' no-clan branch (D:L187786-187802) does not touch it.

**How many, and when**: one request at each arrival on SOCOM II ONLINE for a player in a clan (start 1, page 999: all
of them, SVC-10's `MY_CLAN_MESSAGES_PAGE_READING`), and one at each member's roster; every reply drawn, uncapped (the
leader keeps at most five, §2.3).

### 1.3 The entry: a seam owed to ONL-27 (`MY_CLAN_MESSAGES_ENTRY_READING`)

Both senders are ONL-27's: `GetClan` is today the stub that applies the no-clan reply at once (`GET_CLAN_STUB_READING`,
research 271 §3) -- its success branch, which sends the band's request, is never taken -- and `dlgManageRoster.rdr` is
reached only through ONL-27's GetMyClans (a member's CLAN row) or TransferLeadership. So **the band keeps the
session's empty string today**, as `worldOfSocomScreen.test.ts`'s band over the machine shows it. The request and its
replies are built: `ClanMessagesCommands.myClanMessages()` is `FUN_002e8460`'s body (the same statements as
D:L187824-187831), the call ONL-27's GetMyClans makes from its success branch; `connectClanMessages` returns the rows'
object for it. `GetClanMessages` (row 138) is registered and answers as read. *[2026-10-13, ONL-27: built -- GetMyClans
in place of the stub, its success calls `myClanMessages`, and the member's roster asks `GetClanMessages`, so the band is
asked as the original asks it (`MY_CLAN_MESSAGES_ENTRY_READING` retired, research 272 §3).]*

**What each of SVC-10's answers shows** (`clans.ts` `myMessages`; the console reads success from failure only):

| SVC-10's answer | the console | the band |
|---|---|---|
| the caller's clan's messages, each a Success (the session's clan, not the request's id) | each "\n" and its text added | the messages, oldest first, one after each line break |
| none: one NoResult with the clan id | "No clan messages." | "No clan messages." |
| the caller in no clan: one NoResult (Horizon's catch, research 262 §5.5) | "No clan messages." | "No clan messages." |
| a request never answered | the retrieving text stays | "Retrieving messages from server..." |

## 2. The leader's EDIT NEWS (`dlgManageRosterLeader.rdr`)

### 2.1 As read (the disc's record)

- **The layout** (the parts of it the messages use): the row `EditNews` #475 "EDIT NEWS"; the LISTBOX `ClanMessageList`
  on **ClanLeaderMessages**; the WRAPPEDTEXT `motd` on MEDIUS_MOTD (the server's news, asked at the ONSTART: the leader
  sees it beside the list); `DescriptionText`, the help line.
- **The bindings**: ONSTART `MRosterLeaderStartData` (`GetClanRoster`, **`GetLeaderMessages`**, `GetMediusAnnouncements`,
  `GetClanRanking`) and `OnMRosterLeaderStart` (which activates EDIT NEWS and hides `motd` and the list); EditNews
  ONACTIVATE `OnEditNewsBtn` -- #485 "¦ Edit your Clan news.", `SHOW motd`, `SHOW ClanMessageList`, the list disabled --
  and CROSS `OnEditNewsPress` -- the list enabled and active, #498 "¦ Edit. · Delete. ¬ Cancel."; the list's CROSS
  `SendClanMessage` (the animation), TRIANGLE `OnMRosterLeaderStart`, CIRCLE `DeleteClanMessage` (the animation);
  CLAN_MESSAGE_ID_ERR `ClanMessageIDErr`, CLAN_MESSAGE_EMPTY `ClanMessageEmpty`; L1 / L2 scroll `motd`.
- **The animations**: `SendClanMessage` -- `STOP menu_fade_up`, `ClearUIVar(SEND_CLAN_MESSAGE)`,
  `GetTextInput(SEND_CLAN_MESSAGE)`, `WHILE skb_done != 1`, then `ModifyClanMessage(INPUT_STRING)`: **the post and the
  edit are one row**, told apart by the selected row's first cell; `DeleteClanMessage` -- `DeleteClanMessage(INPUT_STRING)`;
  `ClanMessageIDErr` -- `POPUP #503` ("That message could not be deleted. ¦ CONTINUE."); `ClanMessageEmpty` -- `POPUP #504`
  ("You cannot post blank messages. ¦ CONTINUE."). #503's words are the original's for an edit of a stale row.
- **The command `SendClanMessage`** (row 81, `FUN_002797f0` D:L123956-123994) is bound by no dialog of the online
  chapter (`tools/test/clanMessagesDisc.test.ts` reads every chapter's commands): the leader's post goes through
  `ModifyClanMessage` on the "-1" row. The row is filled as read (`FUN_002e8310` D:L187434-187458).
- **How the page is reached**: CREATE CLAN's success (`goto_menu(dlgManageRosterLeader.rdr)`, research 271 §1) -- the
  route that works today -- or SOCOM II ONLINE's CLAN row while the client's clan holds the leader, which the GetClan
  stub forgets at the next SOCOM II ONLINE (research 271 §3); with ONL-27's GetMyClans, the CLAN row of any leader. *[2026-10-13, ONL-27: built -- GetMyClans keeps the clan, the rosters and their rows are 272's (§3, §4).]*
  EDIT NEWS is the page's own row: **the edit needs no entry of ONL-27's**, and the page's other rows stay ONL-27's
  (the table's declared answers until then).

### 2.2 The rows (the C bodies)

- **`GetLeaderMessages`** (row 159, `FUN_0027a0b0` D:L124272-124280 -> `FUN_002e6310` D:L186303-186321), with no check of
  the session: the kept list 0x44f760 emptied (`FUN_002e66f0`), GetAllClanMessages sent (Lobby 0x7e, 0x30 bytes: start 1
  at +0x28, page 999 at +0x2c; `FUN_00646520`), the callback `FUN_002e6390` (D:L186325-186345): a status not Success
  ("GetLeaderMessages", S:0x3f3ee0) draws the list as kept; a Success is kept (`FUN_002e65b0` D:L186393-186450: by its id
  +0x1c unless a record holds it; the record 0xf0 bytes -- the status, the id, the text +0x20:200, the state +0xe8, the
  end +0xec) and the list drawn when the reply ends it.
- **The rows drawn** (`FUN_002e6400` D:L186347-186390, into ClanLeaderMessages S:0x3f3f20, TEMPORARY): per kept message
  [its id "%d" (S:0x3f3ef8), its text, "Message %d:" (S:0x3f3f00) from 1]; then, **only below five** (D:L186377), the row
  ["-1" (S:0x3f3f10), " " (S:0x3f3f18), "Message %d:"] -- the row a new message is written on (`clanLeaderMessageRows`;
  the server's `leaderMessageRows` is the same transcription, research 262 §5.2).
- **`ModifyClanMessage`** (row 160, `FUN_0027a0e0` D:L124282-124302): the argument, INPUT_STRING (S:0x3ee898) replaced by
  the running animation's input string -- the row's first cell -- read by `strtol` (`FUN_00191490`); SEND_CLAN_MESSAGE
  (S:0x3eedb0, added TEMPORARY when absent) when it holds a string, with the id to **`FUN_002e60c0`** (D:L186223-186284):
  an empty text raises CLAN_MESSAGE_EMPTY (S:0x3f3e80, D:L186239-186242) whatever the session; the id -1, only while the
  session is up in state 11 (D:L186245), SendClanMessage (Lobby 0x6e, 0xee bytes, the text at +0x26:200; `FUN_00645f60`,
  D:L186250-186255) with the callback `FUN_002e83f0` (D:L187462-187480: Success, "SendClanMessage" S:0x3f4420, asks the
  list again; a failure formats "Failed To Send Message. Error -> %s", S:0x3f4430, into a buffer nothing draws); an id
  the kept list does not hold raises CLAN_MESSAGE_ID_ERR (S:0x3f3ea0, D:L186261-186270); else ModifyClanMessage (Lobby
  0x70, 0xf4 bytes: the id at +0x28, the text at +0x2c:200; `FUN_00646008`, D:L186272-186280), with no check of the
  session, the callback `FUN_002e62d0` (D:L186287-186300: Success, "ModifyClanMessage" S:0x3f3ec0, asks the list again;
  a failure is silent). 1.
- **`DeleteClanMessage`** (row 161, `FUN_0027a1c0` D:L124304-124321): the row's first cell by `strtol` to `FUN_002e6010`
  (D:L186187-186204): any id but -1, with no check of the session or the kept list, DeleteClanMessage (Lobby 0x72, 0x2c
  bytes: the id at +0x28; `FUN_006460b0`), the callback `FUN_002e6080` (D:L186207-186220: Success, "DeleteClanMessage"
  S:0x3f3e60, asks the list again; a failure is silent). 1.
- **`SendClanMessage`** (row 81, `FUN_002797f0` -> `FUN_002e8310`): SEND_CLAN_MESSAGE when it holds a string, only while
  the session is up in state 11: empty, CLAN_MESSAGE_EMPTY; else the post as above. 1.

### 2.3 What each case shows (the page as built, over SVC-10)

| the case | the console | the page |
|---|---|---|
| ONSTART, SVC-10's `allMessages` Success rows | kept, drawn, the "-1" row below five | the same |
| ONSTART, none (one NoResult) | the "-1" row alone, "Message 1:" | the same |
| the "-1" row, a text; SVC-10's `send` Success | the list asked again | the new row |
| the "-1" row; `send` refused (not the leader -990, no clan -971, a full list -956 `CLAN_MESSAGES_CAP_PLACEHOLDER`) | nothing shown | nothing -- the full list's refusal unreachable from the page: no "-1" row at five |
| the "-1" row, the session down or out of state 11 | nothing sent | the same |
| a kept row, a text; `modify` Success / refused | the list asked again / nothing | the same |
| a row no longer kept (the list asked again, not yet answered) | CLAN_MESSAGE_ID_ERR, nothing sent | #503 |
| an empty text, the post or the edit | CLAN_MESSAGE_EMPTY, nothing sent | #504 |
| CIRCLE on a row; `delete` Success / refused | the list asked again / nothing | the same (`DELETE_CLAN_MESSAGE_PLACEHOLDER`: ours deletes) |
| CIRCLE on the "-1" row | nothing sent | the same |

**#504 is reached after a first text**: `ClearUIVar` empties SEND_CLAN_MESSAGE only when it exists (MENU-01a's body), and
the keyboard's ENTER on an empty text is a cancel without `AllowEmpty` (research 119 §6: `FUN_0038c040`) -- `skb_done`
is 1 and the variable keeps what it held. A first CROSS cancelled leaves no string (nothing happens); a later one
leaves the cleared empty string, and `ModifyClanMessage` raises CLAN_MESSAGE_EMPTY.

## 3. The keyboard and its cap -- the roadmap's unknown, read

`SendClanMessage`'s `GetTextInput` block (the command's 0xAC bytes, `decodeTextInput`, re-read by
`tools/test/clanMessagesDisc.test.ts`): `UiVar` SEND_CLAN_MESSAGE, `SkbName` **`ChatSkb`**, `Purpose`
`_497_EnterMessageClan_MSG` (#497 "Enter a Message to Send to Clan."), **`MaxChars` 199, `MaxBytes` 199**, the recipient
edit's 14 / 31 with its titles `_331_EnterName_MSG` / `_332_EnterIgnore_MSG` (the layout's message mode), neither
`NoDQuote` nor `AllowEmpty` (research 119 §5's row). PLAT-17's keyboard applies the caps as the original does
(`FUN_00396d40` D:L289553-289608) and the fit to the layout's lines (`SKB_FIT_READING`, research 119 §6), whichever
bites first. **The cap is 199 characters of 199 bytes**: the record's field is 200 bytes with its NUL at the last
(SVC-10's `clanMessageCut`, `WIDTHS.clanMessage`), so every text the keyboard lets through fits it whole; the page sends
the text as typed and the server's cut stands for a text no console sends.

The layout's message mode (SELECT, research 119 R119.7) and its Action2 ENTER raise `ON_SKB_APPLY2`, which this page
binds to `on_skb_apply_2` (`CopyUIVar`, `AddToIgnore`): the original's script, run as the page's other rows answer it.

## 4. The transport and the mount

`packages/viewer/src/clanMessagesHost.ts`: `fetchClanMessagesService(base)` posts `/clan/messages`
`{ clanId, start, pageSize }`, `/clan/all-messages` `{ start, pageSize }`, `/clan/send-message` `{ message }`,
`/clan/modify-message` `{ clanMessageId, newMessage }` and `/clan/delete-message` `{ clanMessageId }`, each with the
session's ticket as the bearer, `credentials: 'omit'`, `cache: 'no-store'`, at the page's own origin
(`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`); the replies checked field by field; 401 the session
lost (the lobby client's `sessionLost`), any other refusal or shape a request never answered; no ticket, no request.
`connectClanMessages(host, { uiVars, clan, service, ticket, sessionLost, event, inputString, lobby })` registers the five
rows and returns them (the band's seam, §1.3).

**The mount in `frontEnd.ts` -- a hot file's four hunks, applied under the seat's claim** (by content, as ONL-26's and
ONL-28's):
1. a new import line after `./clanInvitationsHost`'s: `import { connectClanMessages, fetchClanMessagesService, type
   ClanMessagesTransport } from './clanMessagesHost';`;
2. the session option, after `clanMembership?: ClanMembershipTransport;`: `/** ONL-29: SVC-10's clan messages
   (./clanMessagesHost); absent, never answered. */ clanMessages?: ClanMessagesTransport;`;
3. after `connectClanInvitations(...)`: `connectClanMessages(this.host, { uiVars: this.uiVars, clan:
   this.world.commands.clan, service: o.clanMessages, ticket: () => this.lobby?.ticket() ?? null, sessionLost: (t) => {
   this.lobby?.sessionLost(t); }, event: lobbyEventInto(() => this.machine, this.parts), inputString: (cmd) =>
   this.machine.shell()?.inputString(cmd.anim) ?? null, lobby: this.connect?.lobby ?? null });   // ONL-29 (research 274)`;
4. the page's `clanMessages: fetchClanMessagesService(accountServiceBase(search, win.location, devBuild())),   // ONL-29:
   the clan messages, the same base and bearer` after `clanMembership: ...`.
`packages/viewer/test/clanMessagesHost.test.ts` pins the four lines as text (the import after the invitations' host's,
the option, the call after `connectClanInvitations`, the page's transport): the shipped page mounts the five rows over
SVC-10 with the session's bearer.

## 5. The deviations

1. **The band's entry** (`MY_CLAN_MESSAGES_ENTRY_READING`, ONL-27's): the band is not asked until GetMyClans' success
   calls `myClanMessages` (§1.3). *[2026-10-13, ONL-27: gone -- the success calls it (research 272 §3).]*
2. **The reads' replies** (`CLAN_MESSAGES_LATEST_REPLY_ADAPTATION`, a browser adaptation): a read's replies are taken only
   for the latest request of its kind, under the ticket still held.
3. **The writes' chains** (`CLAN_MESSAGE_TICKET_ADAPTATION`, a browser adaptation): a post's, an edit's or a delete's
   Success asks the list again only under the ticket the request began with.
4. **The page's text** is sent as typed (§3): no client-side cut, the keyboard's cap and the server's `clanMessageCut`
   hold the field.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `MY_CLAN_MESSAGES_ENTRY_READING` (ui `screens/clanMessagesCommands.ts`) | `'the band asked by GetMyClans\' success (ONL-27\'s GetClan) through myClanMessages; until then the session\'s empty string'` | the band's two senders, GetMyClans' success (`FUN_002e8bd0` D:L187824-187831) and the member's roster's `GetClanMessages`, both ONL-27's routes; the GetClan stub's no-clan branch writes nothing to the pane (§1.3) | ONL-27's GetMyClans calling `myClanMessages` from its success branch | retired 2026-10-13: GetMyClans' success calls `myClanMessages` (ONL-27, research 272 §3) |
| `CLAN_MESSAGES_LATEST_REPLY_ADAPTATION` (ui `screens/clanMessagesCommands.ts`) | `'a read\'s replies taken only for the latest request, under the ticket still held'` | no original: the console's replies come in order on one connection (§5 item 2) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_MESSAGE_TICKET_ADAPTATION` (ui `screens/clanMessagesCommands.ts`) | `'a post, an edit or a delete asks the list again only under the ticket it began with'` | no original: the console's chains die with its connection (§5 item 3) | nothing to settle: a labelled adaptation of the transport | adaptation |
| `CLAN_MESSAGES_CAP_PLACEHOLDER` (server `clans.ts`, research 262 §6) | five, -956 | the original server's cap; the client's five slots read again (§2.2) | an ONL-32 transcript of a leader posting past five, or the owner | kept: listed in research 262, unchanged |
| `CLAN_MESSAGES_ORDER_PLACEHOLDER` (server `clans.ts`, research 262 §6) | oldest first | the order the band and the list draw (§1.2) | an ONL-32 transcript | kept: listed in research 262, unchanged |
| `DELETE_CLAN_MESSAGE_PLACEHOLDER` (server `clans.ts`, research 262 §6) | the leader deletes by id | the delete's answer; the console's CIRCLE (§2.2) | an ONL-32 transcript, or the owner | kept: listed in research 262, unchanged |
| `GET_CLAN_STUB_READING` (ui `screens/worldOfSocomCommands.ts`, research 158) | the no-clan reply at once | GetMyClans; why the band is not asked today (§1.3) | ONL-27 | retired 2026-10-13 (ONL-27's GetMyClans, research 272 §3) |

The roadmap's unknown -- the message's length cap -- is settled at the reading level (§3): 199 characters of 199 bytes,
the field's 200 with its NUL; no constant stands in for it.

## 7. The tests, and the runs (unit tests, a dev-disc test and the pages over the machine; no browser, no capture)

- `packages/ui/test/screens/clanMessagesScreen.test.ts` (new): the five rows held to the table (81, 138, 159, 160, 161,
  ONL-29's) and the ELF's names; the member's pane -- the request and its words, the retrieving text, the replies' form,
  "No clan messages." for none and a refusal, a request never answered, no session check, the latest-reply and ticket
  adaptations; the leader's list -- the request, the rows and the "-1" row, five held, the keep rule, a failure, the
  list emptied at the request; `ModifyClanMessage` -- the post on "-1" and its list again, a refusal, the session down,
  an edit of a kept id, CLAN_MESSAGE_EMPTY, CLAN_MESSAGE_ID_ERR, no string, `strtol` of the argument, the ticket
  adaptation; `DeleteClanMessage` and `SendClanMessage`. Over the machine from the disc's records (or the fixtures): the
  band today (nothing asked, the empty string), the band through the seam (the messages under #775, "No clan
  messages."); the leader's page reached as ONL-26's create leaves the client's clan -- ONSTART's request, #485, #498,
  the post through the keyboard (`ChatSkb`, #497, 199 / 199, 14 / 31), an edit, a delete, #504 after a first text,
  #503 on a stale row.
- `packages/viewer/test/clanMessagesHost.test.ts` (new): each request's path, body, bearer, credentials and cache; 401 the
  session lost, the other refusals and shapes rejected; no ticket no request; the mount's rows over the transport, the
  lobby's state, no transport; `frontEnd.ts`'s four lines pinned as text.
- `tools/test/clanMessagesDisc.test.ts` (new, dev-disc): the band's widgets and MESSAGES' ONACTIVATE; no row of SOCOM II
  ONLINE asking it; the leader's layout, bindings and animations' ops; the member's roster's `GetClanMessages`; the
  command `SendClanMessage` bound by no chapter; `SendClanMessage`'s block decoded; the captions' texts; the ELF's
  strings and the kept list's BSS words.
- The runs and their counts: the task's report (RED, then GREEN, one file per run).

## 8. What is left

- **ONL-27**: GetMyClans calling `myClanMessages` from its success branch (the band, §1.3) -- `frontEnd.ts` keeps no
  handle to it today (`connectClanMessages(...)`'s return is dropped at the mount, its review's F1), so ONL-27 keeps the
  returned rows on the session or passes them into the GetClan wiring, a claimed `frontEnd.ts` hunk; the member's roster
  (`GetClanMessages` is registered); the disband's and the quit's "No clan messages.". *2026-10-13: built by ONL-27 (research 272 §3, §5, §6) -- GetMyClans' success calls `myClanMessages`, the quit and the disband write "No clan messages."; the handle kept by 272 §7's hunk, applied under the seat's claim.*
- **A rendered run** of the band and the leader's EDIT NEWS on a lobby-launched persona pair where the merge controller
  asks for one.
- **The proven level**: ONL-32's capture (PC research 80 H1 "Clan: messages") -- the band with two messages, the leader's
  list, a post, an edit and a delete -- with the server's records checked through SVC-10.

## 9. The leader's list as drawn (NU-13, 2026-10-15; reading, pending review)

The owner's playtest (2026-10-15 ~01:00Z, the next-update checklist's NU.R4): "some centering issues with the messages in
clan main page", his frame of MANAGE CLAN > EDIT NEWS showing "Message 1:" / "Message 2:" at the pane's left, the text
"Sup nerds" well to the right of its label and the bar across the pane.

**The layout** (`dlgManageRosterLeader.rdr` through `loadDialog`; `tools/test/clanMessagesDisc.test.ts`): the LISTBOX
`ClanMessageList` at (180, 183), 447 x 270, `SPACING` 17, `SCALE` 0.8, `TOP_MARGIN` 25, `LEFT_MARGIN` 10,
`HIGHLIGHT_OFFSET` -6, no `OPTIONS`; its `COLUMNS` the id (`POSITION` -300, off the frame), the message (`WRAPPED_TEXT`,
`POSITION` 90, `TOP_OFFSET` 3, `MAXWIDTH` 330) and "Message n:" (`POSITION` 0) -- the order of `FUN_002e6400`'s cells (§2.2).
It is the one LISTBOX of `READERC.ZAR` and `READERX.ZAR` with a `WRAPPED_TEXT` column (the same test scans both).

**What the port drew, and why.** The places were the layout's: the row's pen (x + `LEFT_MARGIN`, y + `TOP_MARGIN`) =
(190, 208), each cell at the column's `POSITION` / `TOP_OFFSET` from it (`FUN_0037ab90` D:L273841), the bar from the
list's x across its width (`FUN_00373850` D:L269968-269991) -- so the label at 190, the message 90 to its right and the
bar across the pane are the original's. What differed was the message's cell: the page drew a `WRAPPED_TEXT` column as a
plain text at (280, 211), in the row's colour, on one line. The original's cell is a CListItemWrappedTextTypeImpl
(vtable 0x407140; `FUN_0037ae10` D:L274029-274037 with `FUN_0036b210` D:L265449-265468): a CWrappedText (`FUN_0027f250`,
HEIGHT -1 at D:L126950) given the list's font and `SCALE`, the list's `SPACING` (+0x48 -> its +0xbc, 0x37be50) and the
column's `MAXWIDTH` (+0x4c -> its +0xc0, 0x37be70), its text wrapped by `FUN_00379f70` into lines in the colour it holds
then, 255 x 3 (`FUN_0037a770` D:L273681-273683; the row's colour, written into the text's +0x48..+0x50 with a call of
its +0xa0 by `FUN_0037ab90` D:L273850-273857, never reaches the lines: the class's +0xa0 is 0x37a630, `jr ra`). Its draw (`FUN_0037be90` D:L274473-274489 -> `FUN_003794b0`) puts line k's pen at
(x, int(y + k x 17 - 3)) (D:L273144): the layout's `TOP_OFFSET` 3 cancels the wrapped text's lift, so the message's first
line stands on its label's row at (280, 208), at the face's opacity x 128 (`FUN_00362b20` D:L260718-260721). The item
takes the rows its cell's last draw counted (`FUN_0037cdc0` D:L274866-274885, 0x37be30), so a long message pushes the
rows below it down and the bar is as tall as the focus item; after a wrapped cell the scissor is the whole frame
(D:L273163). The vtable words and the instruction words cited are held by `tools/test/clanMessagesDisc.test.ts`.

**The fix, at the root**: the shared LISTBOX widget (`packages/ui/src/widgets/listbox.ts`: `ListboxWrappedCell`,
`LISTBOX_WRAPPED_TEXT_COLOR`, `listboxItemRows`, the draw's `drawWrapped`) draws every `WRAPPED_TEXT` column so; on the
disc that is EDIT NEWS alone. `LISTBOX_ITEM_ROWS_READING` (research 117 §12) is retired by the read. No new name.

**The other clan message rows**: the member's band (`dlgWorldOfSOCOM.rdr`, the WRAPPEDTEXT `ClanMessages` under `motd`)
is a WRAPPEDTEXT object, drawn by the screen's wrapped path (`placeWrapped`, the same lift) -- untouched; the member's
roster (`dlgManageRoster.rdr`) draws no widget on the messages (§2.1); the roster's own lists have no wrapped column.

**What the owner sees on a build** (his item answered, NU.R3):
- **Won't change**: the gap from "Message n:" to its text (`POSITION` 90 from the label's 0), the bar across the whole
  list and the labels' x (`LEFT_MARGIN` 10) are the original's layout -- pinned by the tests below, closed under NU.R3.
- **Will change**: the message moves up 3 units (of the 640 x 448 frame) onto its label's row, drawn white rather than
  in the row's grey or brown; a long message wraps at 330 with the rows below it moved down.
- **Why the messages sit mid-pane**: EDIT NEWS also shows `motd` (`OnEditNewsBtn`: `SHOW motd`, §2.1), a WRAPPEDTEXT on
  MEDIUS_MOTD at (195, 153), `WIDTH` 370, `SPACING` 18, `HEIGHT` 54, `SCALE` 0.8 (read through `loadDialog`, held by
  `tools/test/clanMessagesDisc.test.ts`): a three-line band of the server's news directly above the list, filled by the
  page's ONSTART `GetMediusAnnouncements`. With no announcement in force our server answers an empty success, so
  MEDIUS_MOTD holds an empty line (research 133 R133.3 and its open questions) and the band is blank: the messages sit
  under empty space where the original showed the news. That is data (an announcement in SVC-04's store fills it), not
  the drawing.
- **The member's band** (SOCOM II ONLINE's MESSAGES, if "clan main page" meant it): drawn as laid out -- pinned by
  `clanMessagesScreen.test.ts` (`ClanMessages` at (200, 250) under `motd` (205, 125), its lines at (200, 247 + 16 k)
  under the scissor (200, 230)-(600, 390), "Clan messages" at (200, 228)); no gap of its own, nothing changed.

**Tests**: `packages/ui/test/widgets/listbox.test.ts` (a `WRAPPED_TEXT` column: the lines, their pens, colour and alpha,
the rows from the last draw, the bar's height, the scissor after the cell); `packages/ui/test/screens/clanMessagesScreen.test.ts`
(EDIT NEWS over the machine from the disc's records or the fixtures: the bar (180, 189) 447 x 17, "Message 1:" at
(190, 208), the message's first line at (280, 208), "Message 2:" at (190, 225); the member's band's lines and title as laid out); `tools/test/clanMessagesDisc.test.ts`
(dev-disc: the list's fields, `motd`'s, the scan of both archives, the classes' vtable and instruction words). Nothing measured on
the original running: ONL-32's capture of EDIT NEWS is the proven level.
