import { uiCommandFold } from '../uiCommands';
import { VALVE_TYPE } from '../valves';
import { NODE_OP_BASE } from '../widgets/host';
import { SEQ_STATE, ZCMD_RT, type ZAnimRuntime } from '../zanimRuntime';
import type { DialogParts } from './dialogParts';
import { GAME_LOBBY, type LobbyControlRecovery } from './gameLobbyCommands';
import { screenNodeTree } from './screenScripts';

/**
 * OT.R129 (`LOBBY_AFTER_MATCH_FREE_OWNER`, ./gameLobbyCommands; the owner's ruling, a departure from the original): the
 * waits the lobby a match returned to lays aside, each with the count captions it writes -- `ClientDAReadyButton` (the
 * joiner's 10 s READY), `ArmButtonClock` (the 10 s ARMORY), `CountButtonFiveST` and `STCountButtonFiveWS` (the 5 s after a
 * switch), `CountButtonFive` (the 5 s count) and `CycleReadyButton` (READY's 5 s). `firstTick`: stopped only once it has
 * run its first tick (`CycleReadyButton` writes READY's caption there); the others are stopped as soon as they start, so
 * their disables never show. `switch_teams_anim` is not among them: its end re-arms the kit (`rearm`).
 */
const AFTER_MATCH_WAITS: ReadonlyMap<string, { captions: readonly string[]; firstTick: boolean }> = new Map([
  ['clientdareadybutton', { captions: ['TenCountPR'], firstTick: false }], ['armbuttonclock', { captions: ['TenCountWS'], firstTick: false }],
  ['countbuttonfivest', { captions: ['FiveCountST'], firstTick: false }], ['stcountbuttonfivews', { captions: ['TenCountWS'], firstTick: false }],
  ['countbuttonfive', { captions: ['FiveCount'], firstTick: false }], ['cyclereadybutton', { captions: [], firstTick: true }],
]);

/**
 * WM.R21 (the owner's team swap queue, a departure on his word; match `SWAP_QUEUE_OWNER`, research 432): a queued SWITCH
 * TEAMS move lands when the far side frees a seat or a queued seat of the other side presses -- after `switch_teams_anim`
 * (P:L7588-7630) has run out, so the disc never re-arms the kit for it. Here its END alone runs: the animation started
 * and its sequences entered past their `WAIT 5` (P:L7602), as `FUN_0026ae20`'s set-up leaves them (D:L115457-115509:
 * activation-1 sequences started, the others idle, the clock zeroed) -- so `SwitchSides`, `CountButtonFiveST` and the
 * focus moves before the WAIT never run, and the first tick runs the disc's own end: the kit by `player_team`
 * (P:L7603-7621), `FromBriefing`, `.DINK`, SWITCH TEAMS enabled where `IsSwitchTeamsOK` and `mp_x_sec_clock` > 0. True when
 * started or nothing to run; false when the start is refused (asked again).
 */
function switchTeamsEnd(runtime: ZAnimRuntime): boolean {
  const instance = runtime.start('switch_teams_anim');
  if (!instance) return false;
  let entered = false;
  instance.sequences.forEach((seq, i) => {
    if (seq.state === 0) return;
    const def = instance.anim.sequences[i];
    const wait = seq.activation !== 1 || !def ? undefined
      : def.commands.map((c) => c.offset - def.offset).find((pc) => pc >= 0 && pc < seq.img.size && seq.img.type(pc) === ZCMD_RT.WAIT);
    if (wait === undefined) { seq.state = seq.activation === 1 ? SEQ_STATE.DONE : SEQ_STATE.IDLE; return; }
    Object.assign(seq, { state: SEQ_STATE.RUNNING, pc: wait, depth: 0, loopCount: 0, loopTimer: 0, elapsed: 0, cmdElapsed: 0 });
    runtime.advance(seq);                                          // past the WAIT, its begin due
    entered = true;
  });
  if (!entered) { runtime.stop(instance); return true; }
  Object.assign(instance, { state: SEQ_STATE.RUNNING, paused: false, elapsed: 0 });
  return true;
}

/**
 * Browser/server adaptation: recover the native menu after an authoritative countdown cancellation or the end of
 * a late joiner's wait. The original scripts have no handler for these server snapshots. Control choices follow
 * dlgGameLobby's CountDown, CycleReadyButton, SetupNormalJoiner and ArmButtonClock (research 165/314).
 * No dialog rebuild, loadout reset, focus move or socket reconnect. Native entry timers interrupted by CountDown
 * restart only if their NoReadyButton gate is still set; their durations remain in the disc's own animations.
 * OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): the same port draws READY held while the game ends -- disabled, with a line.
 * OT.R129 (`LOBBY_AFTER_MATCH_FREE_OWNER`): with `release`, the waits of the lobby a match returned to stopped first.
 */
export function recoverLobbyControls(parts: DialogParts | null, dialog: string | undefined, state: LobbyControlRecovery): boolean {
  if (!parts || !dialog || uiCommandFold(dialog) !== uiCommandFold(GAME_LOBBY)) return false;
  const { scripts, valves, screen } = parts.dialog;
  if (!scripts) return false;
  if (state.rearm) {
    // OT.R129: switch_teams_anim's WAIT 5 (P:L7602) passed once the room has answered the switch, so its own end runs on
    // the next tick (P:L7603-7628: the kit by `player_team` -- `CharacterProfile` and `EquipCharacterProfileSeal/Merc`, or
    // the side's default type -- then `FromBriefing`, then SWITCH TEAMS enabled). Not yet at its WAIT: false, asked again.
    // Gone (stopped by `CountDown` or `launch_10sec_anim`, as on the console): nothing to run, done.
    const switching = scripts.runtime.running().filter((i) => i.alive && i.name.toLowerCase() === 'switch_teams_anim');
    // WM.R21 (`SWAP_MARK_ADAPTATION`'s ruling, match `SWAP_QUEUE_OWNER`): a queued move that landed later. An animation
    // still alive ends by itself and reads the side now held; none alive, its end alone is run (`switchTeamsEnd`).
    if (state.late) return switching.length > 0 || switchTeamsEnd(scripts.runtime);
    let passed = switching.length === 0;
    for (const instance of switching) {
      for (const seq of instance.sequences) {
        if (seq.state === SEQ_STATE.RUNNING && seq.img.type(seq.pc) === ZCMD_RT.WAIT) { scripts.runtime.advance(seq); passed = true; }
      }
    }
    return passed;
  }
  if (state.release) {
    // OT.R129: while switch_teams_anim waits for the room's answer its controls stay as the disc leaves them (its end
    // re-arms the kit, `rearm`). Else every wait found is stopped -- `CycleReadyButton` only once it has run its first
    // tick (`SEQ_STATE.RUNNING`), the others at once. Nothing found: no write.
    if (scripts.runtime.isRunning('switch_teams_anim')) return false;
    const running = scripts.runtime.running().filter((i) => {
      const wait = AFTER_MATCH_WAITS.get(i.name.toLowerCase());
      return wait !== undefined && i.alive && (!wait.firstTick || i.state === SEQ_STATE.RUNNING);
    });
    if (running.length === 0) return false;
    const captions = new Set<string>();
    for (const instance of running) {
      scripts.runtime.stop(instance);
      for (const node of AFTER_MATCH_WAITS.get(instance.name.toLowerCase())!.captions) captions.add(node);
    }
    if (running.some((i) => i.name.toLowerCase() === 'armbuttonclock')) {
      // As ArmButtonClock's own end leaves them (P:L7035, P:L7045); its ComeFromBriefing 1 (P:L7044) is not written (the trap)
      valves.set('WsCount', 0, VALVE_TYPE.TEMP);
      valves.set('NoReadyButton', 0, VALVE_TYPE.TEMP);
    }
    for (const node of captions) {
      parts.nodeCommand({ anim: 'lobby_recovery', sequence: 'lobby_recovery', nodeIndex: 1, node,
        opcodeByte: NODE_OP_BASE + 1, fn: 'Caption', arg: '', loc: 0, bytes: new Uint8Array(0x10) });
    }
  }
  if (state.reset) {
    // These animations were stopped by CountDown; also stop a late wait's unfinished instance before recovering.
    // LOBBY-STEPS (the re-read's F1; EIGHTY_READY_HOST_PAGE_READING): and the host's `launch_10sec_anim`, queued by the
    // countdown's post and not yet run when the room called the countdown off -- left, it would close BACK and the
    // buttons after this recovery. The runtime's stop takes a queued instance (`ZAnimRuntime.stop`: its entry killed).
    for (const name of ['switch_teams_anim', 'CountButtonFiveST', 'STCountButtonFiveWS', 'CycleReadyButton', 'CountButtonFive', 'ClientDAReadyButton', 'launch_10sec_anim']) {
      const instance = scripts.runtime.find(name);
      if (instance) scripts.runtime.stop(instance);
    }
    const nodes = screenNodeTree(screen);
    const countdown = nodes.node('CountDownFrame');
    if (countdown) countdown.active = false;
    for (const name of ['InfoTextCT', 'InfoTextCO']) {
      const node = nodes.node(name);
      if (node) node.active = true;
    }
    valves.set('NoTriangle', 0, VALVE_TYPE.TEMP);
    for (const node of ['LaunchText', 'SecondText', 'CountDown', 'FiveCount', 'FiveCountST', 'TenCountPR', ...(valves.find('NoReadyButton')?.value === 1 ? [] : ['TenCountWS'])]) {
      parts.nodeCommand({ anim: 'lobby_recovery', sequence: 'lobby_recovery', nodeIndex: 1, node,
        opcodeByte: NODE_OP_BASE + 1, fn: 'Caption', arg: '', loc: 0, bytes: new Uint8Array(0x10) });
    }
  }
  for (const [name, enabled] of [['Glswitchteams', state.switchTeams], ['PlayerReady', state.ready], ['weaponselect', state.armory]] as const) {
    const spec = parts.widgets.specOf(name);
    if (spec && enabled !== undefined) parts.widgets.setEnabled(spec, enabled);
  }
  // OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`, an adaptation): the held READY's one line, in the help line's place (the
  // native DescriptionText, as the lobby's BOTS adaptation writes its own help there), or '' to clear it once let go.
  if (state.line !== undefined) {
    parts.nodeCommand({ anim: 'lobby_recovery', sequence: 'lobby_recovery', nodeIndex: 1, node: 'DescriptionText',
      opcodeByte: NODE_OP_BASE + 1, fn: 'Caption', arg: state.line, loc: 0, bytes: new Uint8Array(0x10) });
  }
  if (state.restartEntryTimers) {
    const armory = scripts.runtime.find('ArmButtonClock');
    if (armory) scripts.runtime.stop(armory);
    scripts.startBinding('ArmButtonClock', null);
    if (!state.host) scripts.startBinding('ClientDAReadyButton', null);
  }
  return true;
}
