# 363 -- Native UI CALL inputs belong to animation instances

Written 2026-10-23 for MLS-PASS in the [native Settings and lobbies plan](../plans/2026-10-23-native-settings-and-lobbies.md).
This is a simulation correction to the generic UI runtime. Confidence: **reading**. Independent source/code review
PASS (high) at `864603c5ff0c0f7c882a6b0399e9beff0535a558`, with 131/131 focused checks; the
[plan Log](../plans/2026-10-23-native-settings-and-lobbies.md#log) records the evidence and remaining checks. The sources are
the retail `socom2_game.elf.decomp.c` (`D:L<n>`) and the original `RUN/UIZANIM.ZAR`, read through `Zar.parse` and
`parseAnimSets`. No original game was run and no capture comparison was made.

## 1. The caller and callee own separate input records

`FUN_0025d5c0` D:L107577-107592 implements CALL_ANIMATION flag 1 by copying the caller instance's input records,
held at instance `+0x18`, into the call's parameter list. The start uses `FUN_002734b0` without parameters when the
list is empty, or `FUN_00272bb0` with the copied records when it is not (D:L107763-107770). The latter delegates to
`FUN_00272c30` (D:L120333-120358). That function selects an available instance, releases its old input list and
sets the list pointer to zero (D:L120405-120414), installs the new records, then starts it through `FUN_002734b0`
(D:L120615-120620). The type-8 string record is allocated and copied at D:L120544-120568; the copied-record case
is D:L120596-120614. Thus a parameterized start installs inputs before `FUN_002734b0` checks the set's active flag
(D:L120734-120737), even if that gate then refuses execution.

The input is installed before the activation guard, which `FUN_002734b0` runs at D:L120741-120747. A start refused
because no instance is available cannot change the inputs of a live instance (`FUN_00270ef0` D:L119142-119216).
A plain start does not replace the existing input list (`FUN_002734b0` D:L120717-120801). In particular, CALL with
flag 1 clear supplies no caller inputs; it does not mean clearing a reused callee's previous records. The runtime
keeps this distinction between a missing string argument and a supplied empty string.

The screen's binding/event start supplies type 8: `FUN_00367810` D:L263376-263386 prefers event text when present,
then the binding's ARGUMENT, otherwise uses a plain start. The runtime currently models this first string record;
other argument-producing CALL flags and the `+0x10` argument block remain explicitly unsupported.

## 2. INPUT_STRING reads the instance executing the command

`DAT_00414be8` is the current animation instance. `FUN_00270220` D:L118623-118662 saves its previous value, installs
the instance being ticked and restores it afterward. `FUN_0026d870` D:L117109-117124 does the same around an
activation, execution or cleanup guard sequence, including nested starts.

`FUN_00272480` D:L119977-120010 walks the input list and returns the requested type-8 string, or null when none
exists. For example, the `JoinMPGame` wrapper `FUN_0027d730` D:L126023-126041 passes the current instance's
`+0x18` list with index 0 for INPUT_STRING. This is not a screen-wide list and has no latest-event fallback.
The runtime stores the string on `ZAnimInstance`, scopes the current instance around ticks and guards, and the
screen host's existing name-based interface delegates to it. Its existing diagnostic lookup outside a command can
inspect a named instance's retained input while its set is active, including after completion; during execution the
current instance is used, including when copies share an animation name.

## 3. The original briefing-room calls

Reading every `join_game` animation in `RUN/UIZANIM.ZAR` through the repository readers found four calls to
`aux_join_game`. All have a 20-byte command, flags `0x201` and zero `+0x10` argument-block offset:

| Set | Animation | Sequence | Command offsets in Seq_Data | Flags |
|---|---|---|---|---|
| `dlgMPBriefingRoom.rdr` | `join_game` | `NA` | 100, 144 | `0x201` |
| `dlgLANBriefingRoom.rdr` | `join_game` | `NA` | 100, 144 | `0x201` |

Flag 1 copies the selected game name; `0x200` waits while the called animation is alive (`FUN_0025d550`
D:L107473-107481). While `aux_join_game` waits for the password keyboard, APPLY starts `send_chat` with its own
text. It must not replace the waiting animation's game name. This retires research 165's
`INPUT_STRING_CALLED_READING`, which incorrectly treated the current-instance pointer as a screen-wide input list.

The reviewer also checked the friend-list call referenced by research 269: `dlgFriendList.rdr/OnConfirmListPress`,
sequence `NA`, CALL to `AskToAddFriend` at `Seq_Data` 68, size 20, flags `0x1`, argument block 0. It copies the
ConfirmationList caller's inputs without the `0x200` blocking bit. A latest-binding argument is not its source.

A fresh review's scan (2026-10-24; `UIZANIM`, `MPZANIM` and `EXTZANIM` through the repository readers) found 62, 42
and 21 animations reading the input string or `$1`, and every one of the 12 CALLs into such an animation with flag 1.
Three callers this section did not list: `DoSomething` -> `playerinfo_activate` (flags `0x1`), `OnFriendListPress` ->
`playerinfo_activate` (`0x1`), and `OnDNASError` -> `OnDNASErrorContinue` / `OnDNASErrorHalt` (`0x201`). No test
drives `playerinfo_activate`, and `OnDNASError` is never raised in the port (its DNAS step is bypassed,
`dnasCommands.ts`), so those three are read off the data, not exercised.

## 4. Tests and limits of this evidence

`packages/ui/test/zanimRuntime.test.ts` holds nested blocking inheritance, independent inputs, an explicit empty
string, a CALL without inheritance, refusal and restart, reuse without replacement, same-name copies, nested guard
context, parameter installation before the active-set gate, and the existing refusals for unsupported arguments. `screens/screenScripts.test.ts` checks the binding
bridge with an independent keyboard event and with flag 1 clear. `screens/gameLobbyRig.ts` now delivers the actual
APPLY text through the same event port as the real soft keyboard; the former text-free stand-in hid this error.
The original-script game-lobby tests cover private player/spectator joins, wrong and empty passwords, cancellation
and retry. These are unit and original-data script tests, not rendered-browser or physical-controller evidence.

## 5. Readings and placeholders

No new stand-in is introduced. `INPUT_STRING_ARGUMENT_READING` remains the screen bridge's named reading, with
its description corrected in research 115. `INPUT_STRING_CALLED_READING` is retired in research 165. The current-set
lookup and the runtime's other unresolved behaviours remain as recorded in research 106; this change does not
settle unsupported input record types, argument-producing flags or argument blocks. A fresh reviewer reread the
cited functions and archive fields; the revised ownership/inheritance claims are reviewed readings. An original
trace or scored capture comparison is still needed to raise confidence to proven.
