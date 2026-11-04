import { DIALOG_BUTTONS, DIALOG_BUTTON_STATES, DIALOG_EVENTS, type DialogBinding, type DialogDesign, type DialogRecord } from '../dialog';
import { uiCommandFold, type UiBindingGate } from '../uiCommands';
import { NODE_OP_BASE } from '../widgets/host';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { DialogParts } from './dialogParts';
import { GAME_LOBBY, LOBBY_BOT_CAPTION_VARS, type BotSetting, type GameLobbyCommands, type LobbySide } from './gameLobbyCommands';

/**
 * FBA-2, browser adaptation: team bot targets beside the native GAME LOBBY's SEALS and TERRORISTS headings.
 * This is authored multiplayer support, not an original SOCOM II menu or campaign-AI parity claim. Each selector is
 * a native BUTTON copied from READY, using the existing font, textures, focus ring and hit testing. Its own compact
 * size and placement occupy the header's vacant right side; the original records remain intact.
 */
export const LOBBY_BOTS_ADAPTATION = 'host-controlled OFF/FILL/1..8 targets in native BUTTONs beside each team heading' as const;
export const LOBBY_BOT_BUTTONS = { seal: 'SealBotsButton', terrorist: 'TerroristBotsButton' } as const;
export const LOBBY_BOT_CHOICES: readonly BotSetting[] = ['off', 'fill', 1, 2, 3, 4, 5, 6, 7, 8];
const DESCRIBE = 's2u_lobby_bots_describe', NEXT = 's2u_lobby_bots_next';
const RIGHT = 's2u_lobby_bots_right', LEFT = 's2u_lobby_bots_left', SIDEBAR_FOCUS = 's2u_lobby_bots_sidebar_focus';

function sidebarButton(d: DialogDesign, name: string): boolean {
  const edge = d.objects.find((record) => record.name === 'DescFieldSeal')?.x;
  return edge !== undefined && d.controls.some((record) => record.name === name && record.widget.type === 'BUTTON' && record.childOf === null && record.x < edge);
}

function bindings(team: LobbySide): DialogBinding[] {
  return [
    { kind: 'event', name: 'ONACTIVATE', code: DIALOG_EVENTS.ONACTIVATE!, state: DIALOG_BUTTON_STATES.FALLING!, animation: DESCRIBE, argument: team },
    ...(['CROSS', 'RIGHT', 'LEFT'] as const).map((name): DialogBinding => ({
      kind: 'button', name, code: DIALOG_BUTTONS[name]!, state: DIALOG_BUTTON_STATES.FALLING!,
      animation: name === 'CROSS' ? NEXT : name === 'RIGHT' ? RIGHT : LEFT, argument: team,
    })),
  ];
}

/** The original dialog lookup with the two adaptation controls; disabled feature and other dialogs are unchanged. */
export function withLobbyBots(lookup: (name: string) => DialogDesign | null, enabled: () => boolean): (name: string) => DialogDesign | null {
  return (name) => {
    const d = lookup(name);
    if (!d || uiCommandFold(name) !== uiCommandFold(GAME_LOBBY) || !enabled()) return d;
    const ready = d.controls.find((c) => c.name === 'PlayerReady');
    if (!ready || ready.widget.type !== 'BUTTON') return d;
    const button = ready.widget.button;
    const added: DialogRecord[] = [];
    for (const [team, header] of [['seal', 'DescFieldSeal'], ['terrorist', 'DescFieldTerr']] as const) {
      if (d.controls.some((c) => c.name === LOBBY_BOT_BUTTONS[team])) continue;
      const heading = d.objects.find((c) => c.name === header);
      if (!heading || heading.widget.type !== 'IMAGE') continue;
      added.push({
        ...ready, name: LOBBY_BOT_BUTTONS[team], x: heading.x + heading.widget.image.size[0] - 92, y: heading.y,
        widget: {
          type: 'BUTTON', uivar: { name: LOBBY_BOT_CAPTION_VARS[team], value: 'BOTS: --', longevity: 2 },
          button: {
            ...button, size: [92, 22], offset: [6, 20], scale: 0.65, caption: 'BOTS: --',
            normal: { ...button.normal, scale: 0.65 }, active: { ...button.active, scale: 0.65 },
            pressed: { ...button.pressed, scale: 0.65 }, disabled: { ...button.disabled, scale: 0.65 },
            bindings: bindings(team),
          },
        },
      });
    }
    if (added.length === 0 && !d.controls.some((record) => record.name === LOBBY_BOT_BUTTONS.seal)) return d;
    const controls = [...d.controls, ...added].map((record): DialogRecord => {
      if (record.widget.type !== 'BUTTON' || !sidebarButton(d, record.name) || record.widget.button.bindings.some((b) => b.animation === SIDEBAR_FOCUS)) return record;
      // Observe sidebar focus beside its original help-line binding. RIGHT is the adaptation's spatial route, while
      // its CROSS and the original UP/DOWN control-list navigation remain the native screen's own.
      return { ...record, widget: { ...record.widget, button: { ...record.widget.button, bindings: [
        ...record.widget.button.bindings,
        { kind: 'event', name: 'ONACTIVATE', code: DIALOG_EVENTS.ONACTIVATE!, state: DIALOG_BUTTON_STATES.FALLING!, animation: SIDEBAR_FOCUS, argument: record.name },
        { kind: 'button', name: 'RIGHT', code: DIALOG_BUTTONS.RIGHT!, state: DIALOG_BUTTON_STATES.FALLING!, animation: RIGHT, argument: record.name },
      ] } } };
    });
    return { ...d, controls };
  };
}

/** Native disabled styling and focus-ring eligibility follow the same host/capability/countdown guard as requests. */
export function syncLobbyBots(commands: Pick<GameLobbyCommands, 'canConfigureBots' | 'setBotLabelColor'>, parts: DialogParts | null): void {
  if (!parts) return;
  const widgets = parts.widgets;
  if (!Object.values(LOBBY_BOT_BUTTONS).some((name) => widgets.specOf(name))) return;
  const enabled = commands.canConfigureBots();
  for (const [team, header] of [['seal', 'Category2Text'], ['terrorist', 'Category3Text']] as const) {
    const heading = parts.dialog.design.objects.find((record) => record.name === header);
    if (heading?.widget.type === 'TEXT') commands.setBotLabelColor(team, heading.widget.text.color);
    const spec = parts.widgets.specOf(LOBBY_BOT_BUTTONS[team]);
    if (spec) parts.widgets.setEnabled(spec, enabled);
  }
}

/**
 * CROSS alone advances counts. LEFT/RIGHT routes spatial focus through MenuInput.activate, remembering the last
 * sidebar stop (ARMORY by default). Every choice comes from the authoritative echo; original command rows stay intact.
 */
export function lobbyBotsGate(o: {
  commands: Pick<GameLobbyCommands, 'canConfigureBots' | 'botSetting' | 'requestBots'>;
  node: (cmd: ZAnimUiCommand) => unknown;
  /** The page's MenuInput.activate with its native enabled check; false when that control is unavailable. */
  focus: (name: string) => boolean;
}): UiBindingGate {
  let lastSidebar = 'weaponselect';
  return (b) => {
    if (uiCommandFold(b.dialog) !== uiCommandFold(GAME_LOBBY) || ![DESCRIBE, NEXT, RIGHT, LEFT, SIDEBAR_FOCUS].includes(b.animation)) return false;
    if (b.animation === SIDEBAR_FOCUS) {
      if (b.argument !== null && sidebarButton(b.design, b.argument)) lastSidebar = b.argument;
      return true;
    }
    if (b.animation === RIGHT && b.argument !== null && sidebarButton(b.design, b.argument)) {
      lastSidebar = b.argument;
      if (o.commands.canConfigureBots()) o.focus(LOBBY_BOT_BUTTONS.seal);
      return true;
    }
    const team = b.argument;
    if (team !== 'seal' && team !== 'terrorist') return true;
    if (b.animation === DESCRIBE) {
      o.node({
        anim: DESCRIBE, sequence: DESCRIBE, nodeIndex: 1, node: 'DescriptionText', opcodeByte: NODE_OP_BASE + 1,
        fn: 'Caption', arg: `X changes ${team === 'seal' ? 'SEALS' : 'TERRORISTS'} bots. LEFT/RIGHT moves focus.`, loc: 0, bytes: new Uint8Array(0x10),
      });
      return true;
    }
    if (!o.commands.canConfigureBots()) return true;
    if (b.animation === RIGHT || b.animation === LEFT) {
      if (b.animation === RIGHT && team === 'seal') o.focus(LOBBY_BOT_BUTTONS.terrorist);
      else if (b.animation === LEFT && team === 'terrorist') o.focus(LOBBY_BOT_BUTTONS.seal);
      else if (b.animation === LEFT && !o.focus(lastSidebar)) o.focus('weaponselect');
      return true;
    }
    const current = o.commands.botSetting(team);
    if (current === null) return true;
    const at = LOBBY_BOT_CHOICES.indexOf(current);
    if (at < 0) return true;
    const next = (at + 1) % LOBBY_BOT_CHOICES.length;
    o.commands.requestBots(team, LOBBY_BOT_CHOICES[next]!);
    return true;
  };
}
