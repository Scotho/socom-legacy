# 365 -- An unknown account at LOGIN: the register question, read at the original (LATER 332, PT195-6)

- Date: 2026-10-24. The deploy seat's debrief of the owner's playtest game 195 (2026-10-22) saw two players refused as
  unknown accounts (-998) five and four times, neither ever creating one, while six others created theirs after one
  refusal (LATER 332, issue #464; the plan `plans/2026-10-22-playtest-195-debrief.md`, PT195-6). The row's order: read
  the original's LOGIN flow first (LOGIN must match, the online path target), then change only where ours differs.
- Track: the reading is the simulation track's rule (the original's client flow); any change it leads to is the product
  track's (the saved-password adaptation, §3).
- Status: **reading, pending review** -- source inspection of the decompilation, the disc's interface script (one probe
  through the repository's readers) and the port; no game, emulator or capture run. Nothing here is proven: no capture of
  state 10 exists (the archive's six frames of the connecting screen are "STATE: LOGGED IN", research 157 §8).
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c`. The disc's `RUN/UIZANIM.ZAR`, set
  `dlgNetConnect.rdr`, read by a throwaway probe (`parseAnimSets`, `decodeUiOp`, `readPopupRecord`; nothing kept in git;
  its output `agent-mail/evidence/later-332/netconnect-popups.json`). The port at `origin/main` 35f088389.

## 0. Answers

1. **The original asks, and its answer under a reflexive CROSS is YES.** AccountLogin's -998 puts the lobby in state 10
   (`FUN_002eefa0` D:L191165-191168; research 157 R157.3). `init_socom_online`'s state-10 branch (op 18-38) sets
   `AreYouSure` to 0, fades the menu to 0.7 and opens a POPUP: the text "Player Name not found. Would you like to
   register this Player Name?", buttons on, the answer valve `AreYouSure`, TRIANGLE off; **slot 1 is #253 (YES), slot 2
   #246 (NO)**, both 50 wide. It waits while `AreYouSure == 0`; `AreYouSure == 1` (slot 1) runs `LobbyRegister`
   (`FUN_0027dde0` D:L126272-126300 -> `FUN_002fa320`: the name filter, AccountRegistration, AccountLogin again); any
   other answer runs `exit_connect_screen`. A popup with buttons opens with **button 1 focused**, the answer 1
   (`FUN_0036da20` D:L266787-267160, as `packages/ui/src/popup/popup.ts` reads it); CROSS answers the focused slot, LEFT
   and RIGHT move between them, CIRCLE is not a popup key. So the original's question, met with CROSS at once,
   registers.
2. **Ours does the same for a typed password.** The page runs the disc's own `init_socom_online`, our popup machinery
   copies `FUN_0036da20`'s focus and keys, and `LobbyRegister` reads PLAYERPASSWORD, which -998 keeps until the question
   is answered (`connectCommands.ts` `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`; `lobbyClient.ts` line 526 drops only the
   client's own copy). The service answers as research 157 R157.12 says (-998; `/account/create`; a second login), and
   `connectScreen.test.ts` holds the error-to-dialog table, -998's question included. **No difference.**
3. **Ours differs for a saved password -- and the difference fits the journal.** A persona record saved under SAVE
   PASSWORD: YES holds no password on the page, only its stand-in (`personaHost.ts` `isSavedPasswordStandIn`), and logs
   in by the remember cookie (`SAVED_PASSWORD_BY_COOKIE_ADAPTATION`). If the server holds no such account (a record saved
   against another server, or one whose account is gone), the login answers -998 and the original's question follows.
   YES then hands `LobbyRegister` the stand-in, and `SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION`
   (`connectHost.ts` `savedPasswordLogin`) answers RegistrationFailed (-994) **without a request**: state 6, "STATE:
   REGISTRATION FAILURE", WAIT 1, back to the form, no popup (research 157 R157.6). There `keepSaved` puts the
   stand-in back in PLAYERPASSWORD, so the form shows the password filled and CONNECT lit -- the adaptation's comment
   says "the player retypes", but nothing asks for it, and CONNECT repeats the loop: -998, the question, YES, the silent
   failure. The original registers with the saved password itself and goes on to the usage policy. The journal's two
   players fit this exactly: four and five -998s a few tens of seconds apart, no `op:create` between (the refusal sends
   none), where a NO would also send none but leaves the form's password to retype.
4. **Not recorded:** whether those two logins were the remember cookie's. The deploy seat's read-only query of central's
   account journal for #464's window (2026-10-22 19:50-21:05Z; relayed by the merge controller, 2026-10-24): 16 logins
   answered -998 (the issue's nine and other names in the window), 1 answered -978, 19 succeeded. The journal does not
   record a login's credentials mode: `cookie` appears only on a success that set the remember cookie (17 of the 19),
   and no -998 line carries a mode. So whether either player had a saved record cannot be read back; the loop in 3 is
   the only path found where a player who answers YES never creates an account -- *inference*, which LATER 400 (the
   journal's login line gains the mode) lets the next case settle.

## 1. What changes (product track; the merge controller's (b), 2026-10-24)

The adaptation stands (the page holds no saved password to register with, OT.R17 / OT.R61); what it left the player was
the defect: a silent failure and a form that invited the same CONNECT. The merge controller chose (b) -- (a) plus the
page's own line -- after the owner's ask for failure text that says what failed:

- `packages/viewer/src/connectHost.ts`: the page's lobby client notes a registration handed a stand-in
  (`registeredStandIn`); at that refusal's answer `connectLobby` skips `keepSaved` (PLAYERPASSWORD stays empty: the
  original's own form script lights PASSWORD and keeps CONNECT dark until one is typed, `OnLoginRoomstart`,
  `CheckConnectEnable`), has the account list let that record's stand-in go (`personaHost.ts` `standInRefused`: HOST,
  PORT and NAME as `savedAtSuccess` finds them; SAVE PASSWORD kept), and shows
  `SAVED_PASSWORD_REGISTER_LINE_ADAPTATION`'s line ("a saved password cannot register a new Player Name: type a
  password, then CONNECT"), labelled, beside the game's screen as `SIGNED_IN_ELSEWHERE_ADAPTATION`'s; the next login
  or registration asked, and the lobby's disconnect, take it down. A password typed then registers as the
  original's would, and logged in under YES becomes the new stand-in.
- Nothing of the original's state-10 flow changes for a typed password: the question, its focus, its answers and the
  three requests are as §0.1 reads them.
- Tests (`packages/viewer/test/connectHost.test.ts`): RED first (`agent-mail/evidence/later-332/red-standin-register.txt`:
  the stand-in back in PLAYERPASSWORD after the refusal) -- a saved record, -998, YES: no `/account/create`, the form's
  and the record's password empty, the next prefill brings none back, the line shown once and taken down at the next
  attempt; and a typed password's -998 and YES: the registration and the second login go out, no line.

**Open (§0.4):** whether game 195's two players logged in by the remember cookie is not recorded in central's journal,
so the fit in §0.3 stays the note's *inference*; LATER 400 makes the journal say it next time (product track, central's
side, outside this change).
