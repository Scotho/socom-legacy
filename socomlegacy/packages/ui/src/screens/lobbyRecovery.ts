import { uiCommandFold } from '../uiCommands';
import { VALVE_TYPE } from '../valves';
import { NODE_OP_BASE } from '../widgets/host';
import type { DialogParts } from './dialogParts';
import { GAME_LOBBY, type LobbyControlRecovery } from './gameLobbyCommands';
import { screenNodeTree } from './screenScripts';

/**
 * Browser/server adaptation: recover the native menu after an authoritative countdown cancellation or the end of
 * a late joiner's wait. The original scripts have no handler for these server snapshots. Control choices follow
 * dlgGameLobby's CountDown, CycleReadyButton, SetupNormalJoiner and ArmButtonClock (research 165/314).
 * No dialog rebuild, loadout reset, focus move or socket reconnect. Native entry timers interrupted by CountDown
 * restart only if their NoReadyButton gate is still set; their durations remain in the disc's own animations.
 */
export function recoverLobbyControls(parts: DialogParts | null, dialog: string | undefined, state: LobbyControlRecovery): boolean {
  if (!parts || !dialog || uiCommandFold(dialog) !== uiCommandFold(GAME_LOBBY)) return false;
  const { scripts, valves, screen } = parts.dialog;
  if (!scripts) return false;
  if (state.reset) {
    // These animations were stopped by CountDown; also stop a late wait's unfinished instance before recovering.
    for (const name of ['switch_teams_anim', 'CountButtonFiveST', 'STCountButtonFiveWS', 'CycleReadyButton', 'CountButtonFive', 'ClientDAReadyButton']) {
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
  if (state.restartEntryTimers) {
    const armory = scripts.runtime.find('ArmButtonClock');
    if (armory) scripts.runtime.stop(armory);
    scripts.startBinding('ArmButtonClock', null);
    if (!state.host) scripts.startBinding('ClientDAReadyButton', null);
  }
  return true;
}
