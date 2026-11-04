# 131 -- The server's texts: the universe entry, the agreement and the announcement (SVC-05)

Written 2026-10-02 for SVC-05 (`../roadmap/06-online-services.md`, "SVC-05 -- Server texts: universe, policy,
announcements (SERVER NEWS, MESSAGES)"), on the online path the owner set the same day (main menu -> ONLINE -> the
original's flow up to the match's start). The shape is R6's (`../MISSION.md`; research 97 §7): the services live inside
the match server, `packages/server`. The code is `packages/central/src/serverTexts.ts`; the test is
`packages/central/test/serverTexts.test.ts`. Sources: the retail decompilation r0001 (`D:L<line>`, every address
retail), the retail ELF's strings (`S:0x...`) and short strings read from the ELF's bytes at the address named, our
Horizon's sources (`server/horizon-server/` of the recompilation project, `SOCOM_PC_ROOT`: `Constants.cs` is
`RT.Common/Constants.cs`, `Types.cs` `RT.Common/Types.cs`, `MLS.cs` `Server.Medius/Medius/MLS.cs`, `MUIS.cs`
`Server.UniverseInformation/MUIS.cs`, the models under `RT.Models/Lobby/`), research 97 (the message map) and the
online dialogs' read (research 128, on the online path's branch). **No server was contacted** (R293). Every value here
is **reading, pending review**: transcribed from the decompilation and Horizon's models, not yet measured running
(ONL-32's transcripts and the `A_44` / `A_45` captures are the proven level).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R133.1 | **SELECT UNIVERSE asks once, with InfoType 3**: `FUN_002fb340` (D:L198737-198746) clears the two done flags `DAT_0044fd80` / `DAT_0044fd88` and sends LobbyExt 0x03 (`FUN_0064ad98` D:L561889-561912, 0x24 bytes) with InfoType 3, CharacterEncoding 2, Language 1; the screen proceeds once both flags are set (D:L198727) -- the entry list's end (`FUN_002fdaf0`) and the news's end (`FUN_002fded0`) | the server answers both halves, the news even when there is no universe | §1, §2 |
| R133.2 | **SERVER_NEWS on SELECT UNIVERSE is two texts joined**: `UpdateServerInfo` (`FUN_00274c00` D:L121558-121596) writes the selected universe's description (+0x120), `"\n\n"` (ELF 0x3ee8d8) and every news chunk in turn into SERVER_NEWS (S:0x3ee8e0), and the universe's name into SERVER_NAME (S:0x3ee8f0) | the description is per universe, the news one text for all | §2 |
| R133.3 | **The MESSAGES pane's text is the announcement**: GetAnnouncements' callback `FUN_002f77a0` (D:L196542-196627) writes the variable at 0x44f370 + 0xc8, which `FUN_002df6a0` (called with 0x44f370, D:L126448) binds to MEDIUS_MOTD (D:L182209-182210, S:0x3f38e8); the pane's `motd` widget reads MEDIUS_MOTD (research 128 §4.7). The new text, `"\n"`, then the previous MOTD entries as fit, about 800 characters in all; a failure writes "No server messages." (S:0x3f5810) | SVC-05's Unknown ("one text or two") is half answered: MESSAGES' news of the day is GetAnnouncements' text, not the universe news; what the login popup `popup_motd_button` shows is not traced here | §2, §5 |
| R133.4 | **The agreement is joined from chunks**: `FUN_002f79f0` (D:L196630-196652) asks for Policy type 0 (Usage) and shows "Retrieving Usage Policy....." (S:0x3f5840); `FUN_002f7ac0` (D:L196655-196712) appends each reply's +0x1c to TempUsagePolicy and, on EndOfText (+0x11c), copies it to UsagePolicy (S:0x3f5828), the text `dlgUsagePolicy` shows | a long agreement is several replies of at most 255 bytes, the last with EndOfText | §1 |
| R133.5 | **The replies' offsets agree with our Horizon's models** (MessageID 21 bytes, 3 of padding, the status at +0x18): the universe entry `MediusUniverseStatusList_ExtraInfoResponse` (0x338 bytes), `MediusUniverseNewsResponse`, `MediusGetPolicyResponse`, `MediusGetAnnouncementsResponse` | the operations return those fields by name (§1) | §1, §2 |
| R133.6 | **Where our Horizon is not the original, ours departs**: it chunks the policy at 256 characters and its field writer keeps 255 bytes, dropping a byte per full chunk; it sends no policy reply at all for an empty text; its ExtraInfo handler sends no news when it has no universe, so the client would wait for ever | ours cuts at 255 bytes on a character boundary, answers an empty text with one empty chunk, and sends the news in every case | §3 |

## 1. What is built

`ServerTexts` (`serverTexts.ts`) holds the texts and answers three operations; `textsHandler` puts them beside the
WebSocket as `POST /texts/universe`, `/texts/policy` and `/texts/announcement` (a browser adaptation, as SVC-03's login
endpoint: the Origin checked before the body is read; the transport is ours, the replies' fields are the original's).

| operation | request | replies (fields by name, as the client reads them) |
|---|---|---|
| `universeInformation(infoType)` | LobbyExt 0x03, InfoType's bit 0 the entries, bit 1 the news | per universe a LobbyExt 0x04 entry: `status`, `name` (128), `dns` (128), `port`, `description` (256), `universeStatus`, `userCount`, `maxUsers`, `billing` (8), `billingName` (128), `extendedInfo` (128), `endOfList` on the last; no universe: one entry with status NoResult (1) ending the list (`MUIS.cs:345-357`). Then the news as Lobby 0xc9 chunks: `status`, `news` (256), `endOfList` on the last |
| `policy(type)` | Lobby 0x47, type 0 Usage or 1 Privacy (`Types.cs:266-270`) | Lobby 0x48 chunks: `status`, `policy` (256), `endOfText` on the last; another type: one chunk with MediusFail (-966, `MediusGetPolicyRequest.cs:57`) |
| `announcement()` | Lobby 0x4b | one Lobby 0x4d: `status`, `announcementId`, `announcement` (1000), `endOfList` true -- the latest announcement of SVC-04's store in force now (started, not ended; the latest start, then the latest id), as Horizon answers with its latest (`MLS.cs:356-399`); none: success, id 0, an empty text (`MLS.cs:385-396`) |

A text longer than its field goes in several replies of `width - 1` bytes of UTF-8 (the builders' NUL at `width - 1`,
research 97 §1.1), never cut inside a character. The users count is a function the caller passes (the players logged
in); without one it is 0, as Horizon sends (`MUIS.cs:320`).

GetAllAnnouncements (Lobby 0x4c) is not answered: no caller reaches its builder (research 97 §9).

## 2. What the client reads

| reply | read by | offsets |
|---|---|---|
| LobbyExt 0x04 universe entry | `FUN_002fdaf0` D:L199953-200104 | status +0x18; name +0x1c:128; DNS +0x9c:128; port +0x11c; description +0x120:256; status word +0x220; users +0x224; max users +0x228; billing +0x22c:8; billing name +0x234:128; EndOfList +0x2b4; extended info +0x2b5:128, split on `" \t"` (ELF 0x3f5f00, 0x3f5f08) into a 32- and a 128-byte word whose use is not traced. On EndOfList, each SERVER_LIST row (S:0x3f5e08) is the name, `status word == 0`, users and max users |
| Lobby 0xc9 news | `FUN_002fded0` D:L200125-200144 | status +0x18; news +0x1c:256, appended to a list; EndOfList +0x11c |
| Lobby 0x48 policy | `FUN_002f7ac0` D:L196655-196712 | status +0x18; policy +0x1c:256, appended; EndOfText +0x11c |
| Lobby 0x4d announcement | `FUN_002f77a0` D:L196542-196627 | status +0x18 (success or not, research 97 R97.5); the text +0x20 |

The GetAnnouncements request (`FUN_002f7710` D:L196520-196540, 0x2c bytes) carries 0x28e8 (10472, the application id)
at +0x28; the Policy request (`FUN_002f79f0`) carries the type, 0, at +0x28.

## 3. Departures from our Horizon

- The policy and the news are cut at 255 bytes on a character boundary; Horizon's `MediusGetPolicyResponse.FromText`
  cuts at 256 characters, and its `BinaryWriterExt.FixedWidthField` keeps 255 bytes of each, so a full chunk loses its
  last byte.
- An empty policy is one empty chunk with EndOfText; Horizon's `FromText` returns no reply for an empty text, and the
  client would show "Retrieving Usage Policy" for ever.
- No universe: the NoResult entry and the news; Horizon's ExtraInfo handler (`MUIS.cs:298-358`) sends the NoResult
  entry only, while the client waits for both halves (R133.1). Its GetUniverseInformation handler (`MUIS.cs:420-433`)
  sends the news in every case, as ours does.
- Each InfoType bit answers its own half; Horizon's ExtraInfo handler sends the entries whatever bit 0 says. The client
  always sends 3, so the difference is unobservable on the path.
- Horizon composes an announcement as title, `"\n"`, body, `"\n"` (`MLS.cs:380`); SVC-04's store keeps a body only,
  sent as written.
- Horizon refuses these requests without a session (`MLS.cs:309`, `:360`, `:405`); the endpoint answers
  without one, as the universe query (before any login) must. The texts are the server's public texts.

## 4. The owner's texts

The universe entries, the news and the agreement are read from `texts.json` in the server's data directory (beside
SVC-04's `services.json`); a directory without one gets `SERVER_TEXTS_PLACEHOLDER` written there, never over an
existing file, and every text of it says it is a placeholder. The file is refused at the server's start when a text
does not fit its field or a key is unknown. The announcements are SVC-04's store's (`addAnnouncement`, with a start and
an optional end). Writing ours is the owner's: HUMAN_TASKS H72 (and H32 for the rest of the service's data). *Since
SA-43c Part 3 (2026-10-21; product track, an adaptation):* the operator's way in is `main.ts notice announce [--from
now|<UTC>] [--until <UTC>] "<text>"` (`notice announcements` lists, `notice withdraw <key>` removes) into DATA_DIR's
`announcements.json`, the store's whole set of announcements, which a running central reconciles into the store
(`packages/central/src/announcementsFile.ts`; a store announcement the file never named is logged before it is removed;
a missing file leaves the store untouched; an entry written while central is down applies at its start). What the
client shows is unchanged (§2): the latest in force, at SOCOM II ONLINE's entry, heading MEDIUS_MOTD.

## 5. Unknowns

- What the universe entry's status word means: the row carries `status == 0`, Horizon sends 1 and the recompilation's
  SELECT UNIVERSE showed its universe with it (PC handoff of 2026-09-08); what the ONLINE column draws for each value is
  ONL-04's to read, and Sony's value is unobservable.
- What the original servers sent when there was no announcement: Horizon's empty success, or a failure that the client
  shows as "No server messages." -- unobservable; Horizon's is kept, and it is a choice of Horizon's behaviour, not a
  reading of the original. Its effect on the client: `FUN_002f77a0` (D:L196542-196627) writes "No server messages."
  (0x3f5810) into MEDIUS_MOTD only on a failure status; on a success it puts the text at the reply's +0x20 and the
  separator at 0x3f5808 at the head of MEDIUS_MOTD, so a fresh server's MESSAGES shows an empty line. ONL-09 inherits
  this choice; a failure status instead would show the client's own text.
- The announcement's window is [start, end): one whose end equals now is no longer served (pinned by the tests).
  Horizon's own rule for an end is not read here (its announcements come from its database); Sony's is unobservable.
- Whether the login popup (`popup_motd_button`, `PopupNewsOnce`) shows MEDIUS_MOTD or another variable (R133.3).
- The extended info's two words (R133.2's table, §2): what reads the record's +0x338 and +0x358 is not traced; the
  placeholder sends an empty text.
- The original universe's name, news, agreement and announcements: not on the disc; the owner's.

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `SERVER_TEXTS_PLACEHOLDER` (`packages/central/src/serverTexts.ts`) | one universe named "SOCOM 2 Legacy" since SA-16 (2026-10-18; the owner's name, HUMAN_TASKS "The universe's name on SELECT UNIVERSE"; "PLACEHOLDER UNIVERSE" before) (status 1 and 256 users, Horizon's `MUIS.cs:319`, `:321`; no DNS, port 0), placeholder news, a placeholder agreement and privacy policy, each saying it is a placeholder | the owner's universe, news and agreement (SVC-05's Owner calls); the status word and the user cap (§5) | the owner's texts in `texts.json` (H72); the status word's meaning from ONL-04's read of SERVER_LIST |
