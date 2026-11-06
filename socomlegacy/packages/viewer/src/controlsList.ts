/**
 * The Controls popover's two lists (owner, 2026-09-29: two tabs, Controller and Mouse & Keyboard, only what a player
 * needs): each row the button or key and what it does, grouped, for the mode you are in. Player-facing words only --
 * the sources, the readings and the debug keys live in the developer sections of `socomlegacy/README.md` ("Controls", "Build"), and the pad's full
 * table with its citations stays `./gamepad`'s `PAD_LAYOUT`.
 *
 * The keys are the ones the page binds: `WASD` and the fly keys (`./camera`), `G`, `C`, `Space` (`./walk`), `R`
 * (`./fire`), `B` (`./main`), `X`, `Q`, `E` (`./traversalPage`), `1` to `4` (`./main`, `./kit`), `Tab`, `M`, `F` and the
 * backtick (`./ui`, `./main`), `I` and the keys inside WEAPON EXCHANGE (`./weaponExchange`) and the ARMORY (`./armory`), and the front end's menus (`./menuInput`); the mouse's click fires and the right click steps the zoom (`./main`, `./fire`). The pad
 * rows follow `PAD_LAYOUT`, with reload on R3 (the motion workstream's binding, 2026-09-29).
 *
 * F2 (`./devPanel` `DEV_PANEL_KEY`) opens the test room's developer panel on a development build with the tools
 * switch. It is not a row: this list is what a player needs, and a release build has no panel.
 */

/** `menu`: the front end's menus (`?frontend`, PLAT-11) -- only the Menus group, in either tab. */
export type ControlMode = 'walk' | 'fly' | 'menu';

/** The PlayStation face-button glyphs the design system draws (`.s2u-hint__glyph--*`). */
export type FaceGlyph = 'cross' | 'circle' | 'square' | 'triangle';

/** One line: the key, mouse action or pad button, and what it does; a face button carries its glyph. */
export interface ControlRow { keys: string; does: string; glyph?: FaceGlyph }
export interface ControlGroup { name: string; rows: ControlRow[] }

/** The group names, in the order the popover lists them (`./gamepad`'s `padGroup` uses them too). */
export const GROUP_MOVE = 'Move';
export const GROUP_COMBAT = 'Combat';
export const GROUP_STANCE = 'Stance & action';
export const GROUP_WEAPONS = 'Weapons';
/**
 * WEAPON EXCHANGE, the dead player's weapon select (web sprint 4, M8; research 94 §B3): the keys and buttons inside it.
 * The PC key `I`, the touch button and the keys inside are the viewer's choice (the game has only its pad):
 * `WEAPON_SELECT_KEY_READING`, `WEAPON_SELECT_TOUCH_READING`, `WEAPON_SELECT_MENU_KEYS_READING` (`./weaponSelect`), for
 * the owner (O-S4-3) -- the lists say only what a player needs.
 */
export const GROUP_WEAPON_SELECT = 'Weapon select';
/**
 * The pre-round ARMORY (web sprint 5 S3; research 95): the keys and buttons inside it, and when it opens -- on taking a
 * seat only (`ARMORY_SEAT_READING`), the one place the character type changes until the lobby (ONL-16/17): in a match no
 * key or button opens it (the owner's ruling of 2026-10-02; the between-rounds Inventory button is retired). The PC keys
 * and the touch mapping are the viewer's choice (the game has only its pad): `ARMORY_MENU_KEYS_READING`,
 * `ARMORY_TOUCH_READING` (`./armory`), for the owner.
 */
export const GROUP_ARMORY = 'Armory';
export const GROUP_GENERAL = 'General';
/**
 * The front end's menus (web sprint 9, PLAT-11; research 116 §12): the keys are the viewer's choice (the game's menus
 * have only the pad), `MENU_KEYS_READING`, and a tap is `MENU_TOUCH_READING` (`./menuInput`, `@s2u/ui`), for the owner.
 */
export const GROUP_MENUS = 'Menus';

/** The Menus group on the keyboard (`MENU_KEYS_READING`, the ARMORY's keys and one for each button they leave out). */
export const MENU_KEY_ROWS: readonly ControlRow[] = [
  { keys: 'W A S D or arrows', does: 'move' },
  { keys: 'Enter / X / Space', does: 'choose (Cross)' },
  { keys: 'Backspace', does: 'back (Triangle)' },
  { keys: 'R', does: 'Circle' },
  { keys: 'V', does: 'Square' },
  { keys: 'P', does: 'Start' },
  { keys: 'O', does: 'Select' },
  { keys: 'Page Up / Page Down', does: 'L1 / L2' },
  { keys: 'T / Y', does: 'R1 / R2' },
  { keys: 'Tap / click', does: 'a button: go to it and choose' },
  { keys: 'Esc', does: 'release the mouse' },
];

/** The Menus group on the controller (the game's own pad). */
export const MENU_PAD_ROWS: readonly ControlRow[] = [
  { keys: 'D-pad / left stick', does: 'move' },
  { keys: 'Cross', does: 'choose' },
  { keys: 'Triangle', does: 'back' },
];

/**
 * The keyboard and mouse for a mode. `toggle` is whether `G` switches walk and fly: only in Play, and only with the
 * developer's `?devmode` (owner, 2026-09-29: the fly camera is not a player's in Play; `./flyAccess`). Without it
 * neither list names `G`. `multiplayer` false (a build with it off, `./multiplayer`) adds `MULTIPLAYER_OFF_ROW` to General.
 */
export function controlGroups(mode: ControlMode, toggle: boolean, multiplayer = true): ControlGroup[] {
  return withMultiplayerNote(keyGroups(mode, toggle), multiplayer);
}

/**
 * The row a build with multiplayer off (`./multiplayer`, `VITE_S2U_MULTIPLAYER=off`) adds to both lists' General group:
 * no key or button joins a match there, and the list says so rather than leave a player looking for one.
 */
export const MULTIPLAYER_OFF_ROW: ControlRow = { keys: 'Multiplayer', does: 'off in this build' };

function withMultiplayerNote(groups: ControlGroup[], multiplayer: boolean): ControlGroup[] {
  if (multiplayer) return groups;
  const general = groups.find((g) => g.name === GROUP_GENERAL);
  if (general) general.rows.push(MULTIPLAYER_OFF_ROW);
  else groups.push({ name: GROUP_GENERAL, rows: [MULTIPLAYER_OFF_ROW] });
  return groups;
}

function keyGroups(mode: ControlMode, toggle: boolean): ControlGroup[] {
  if (mode === 'menu') return [{ name: GROUP_MENUS, rows: [...MENU_KEY_ROWS] }];
  if (mode === 'fly') {
    return [
      {
        name: GROUP_MOVE,
        rows: [
          { keys: 'W A S D', does: 'fly' },
          { keys: 'Mouse / arrows', does: 'look' },
          { keys: 'Space / Shift', does: 'up / down' },
          { keys: 'Double-tap W', does: 'boost (hold)' },
          { keys: 'Wheel', does: 'fly speed' },
        ],
      },
      {
        name: GROUP_GENERAL,
        rows: [
          ...(toggle ? [{ keys: 'G', does: 'walk' }] : []),
          { keys: 'Esc', does: 'release the mouse' },
          { keys: 'F', does: 'fullscreen' },
          { keys: '`', does: 'hide the interface' },
        ],
      },
    ];
  }
  return [
    {
      name: GROUP_MOVE,
      rows: [
        { keys: 'W A S D', does: 'move' },
        { keys: 'Mouse', does: 'look' },
        { keys: 'Space', does: 'jump' },
      ],
    },
    {
      name: GROUP_COMBAT,
      rows: [
        { keys: 'Left click', does: 'fire' },
        { keys: 'Right click', does: 'zoom (first person, binoculars, scope)' },
        { keys: 'R', does: 'reload' },
        { keys: 'B', does: 'fire mode' },
      ],
    },
    {
      name: GROUP_STANCE,
      rows: [
        { keys: 'C', does: 'crouch (tap), prone (hold)' },
        { keys: 'X', does: 'action: doors, climb, ladders' },
        { keys: 'Q / E', does: 'peek left / right (hold)' },
      ],
    },
    {
      name: GROUP_WEAPONS,
      rows: [
        { keys: '1', does: 'main weapon' },
        { keys: '2', does: 'sidearm' },
        { keys: '3 / 4 / 5', does: 'grenades and equipment' },   // the three equipment slots in kit order (W4.R5)
        { keys: 'I (when dead)', does: 'weapon select: the next round\'s kit' },
      ],
    },
    {
      name: GROUP_WEAPON_SELECT,
      rows: [
        { keys: 'W / S or Up / Down', does: 'slot, item' },
        { keys: 'A / D or Left / Right', does: 'category' },
        { keys: 'X / Enter', does: 'choose' },
        { keys: 'Backspace', does: 'back' },
        { keys: 'I', does: 'close' },
        { keys: 'INV (touch)', does: 'open, close; tap a row or a card' },
      ],
    },
    {
      name: GROUP_ARMORY,
      rows: [
        { keys: 'A / D or Left / Right', does: 'character, weapon' },
        { keys: 'W / S or Up / Down', does: 'slot, done' },
        { keys: 'Enter / X / Space', does: 'choose' },
        { keys: 'V', does: 'store loadout' },
        { keys: 'R', does: 'default weapons' },
        { keys: 'Backspace', does: 'back' },
        { keys: 'Taking a seat', does: 'opens it: the only way to change character' },
        { keys: 'Tap / click', does: 'a character, an arrow, a slot' },
      ],
    },
    {
      name: GROUP_GENERAL,
      rows: [
        { keys: 'Tab (hold)', does: 'scoreboard' },
        { keys: 'M', does: 'map' },
        { keys: 'Esc', does: 'release the mouse' },
        ...(toggle ? [{ keys: 'G', does: 'fly camera' }] : []),
        { keys: 'F', does: 'fullscreen' },
      ],
    },
  ];
}

/**
 * The controller for a mode, by the PS2 pad's names (the Gamepad API's standard layout, by position); Start as `G`.
 * `multiplayer` false (a build with it off) adds `MULTIPLAYER_OFF_ROW`, as `controlGroups` does.
 */
export function padControlGroups(mode: ControlMode, toggle: boolean, multiplayer = true): ControlGroup[] {
  return withMultiplayerNote(padGroups(mode, toggle), multiplayer);
}

function padGroups(mode: ControlMode, toggle: boolean): ControlGroup[] {
  if (mode === 'menu') return [{ name: GROUP_MENUS, rows: [...MENU_PAD_ROWS] }];
  if (mode === 'fly') {
    return [
      {
        name: GROUP_MOVE,
        rows: [
          { keys: 'Left stick', does: 'fly' },
          { keys: 'Right stick', does: 'look' },
          { keys: 'Square', does: 'up', glyph: 'square' },
          { keys: 'Triangle', does: 'down', glyph: 'triangle' },
          { keys: 'Circle', does: 'boost (hold)', glyph: 'circle' },
        ],
      },
      ...(toggle ? [{ name: GROUP_GENERAL, rows: [{ keys: 'Start', does: 'walk' }] }] : []),
    ];
  }
  return [
    {
      name: GROUP_MOVE,
      rows: [
        { keys: 'Left stick', does: 'move' },
        { keys: 'Right stick', does: 'look' },
        { keys: 'Square', does: 'jump', glyph: 'square' },
      ],
    },
    {
      name: GROUP_COMBAT,
      rows: [
        { keys: 'R1', does: 'fire' },
        { keys: 'D-pad Up / Down', does: 'zoom in / out' },
        { keys: 'R3', does: 'reload' },
        { keys: 'L3', does: 'fire mode' },
      ],
    },
    {
      name: GROUP_STANCE,
      rows: [
        { keys: 'Triangle', does: 'crouch (tap), prone (hold)', glyph: 'triangle' },
        { keys: 'Crouch / Prone (Button mapping)', does: 'crouch / prone, once bound' },
        { keys: 'Cross', does: 'action: doors, climb, ladders', glyph: 'cross' },
        { keys: 'D-pad Left / Right', does: 'peek left / right (hold)' },
      ],
    },
    {
      name: GROUP_WEAPONS,
      rows: [
        { keys: 'L1', does: 'main weapon (or the item set on L1)' },
        { keys: 'L2', does: 'sidearm (or the item set on L2)' },
        // The original's CWeaponSel (`./inventoryMenu`; the owner, 2026-10-04: the original is the controls' source).
        { keys: 'R2', does: 'item menu: D-pad Up / Down choose, Cross or R2 take, L1 / L2 set, Triangle close' },
        { keys: 'R2 (when dead)', does: 'weapon select: the next round\'s kit' },
      ],
    },
    {
      name: GROUP_WEAPON_SELECT,
      rows: [
        { keys: 'D-pad Up / Down', does: 'slot, item' },
        { keys: 'D-pad Left / Right', does: 'category' },
        { keys: 'Cross', does: 'choose' },
        { keys: 'Triangle', does: 'back' },
        { keys: 'Circle', does: 'close' },                     // OT.R106: the owner's adaptation (the original's Circle is no cancel)
        { keys: 'R2', does: 'close' },
      ],
    },
    {
      name: GROUP_ARMORY,
      rows: [
        { keys: 'D-pad Left / Right', does: 'character, weapon' },
        { keys: 'D-pad Up / Down', does: 'slot, done' },
        { keys: 'Cross', does: 'choose' },
        { keys: 'Square', does: 'store loadout' },
        { keys: 'Circle', does: 'default weapons' },
        { keys: 'Triangle', does: 'back' },
        { keys: 'Taking a seat', does: 'opens it: the only way to change character' },
      ],
    },
    {
      name: GROUP_GENERAL,
      rows: [
        { keys: 'Select (hold)', does: 'scoreboard' },
        ...(toggle ? [{ keys: 'Start', does: 'fly camera' }] : []),
      ],
    },
  ];
}

/** The popover's two tabs: the controller's list and the keyboard and mouse's. */
export type ControlsTab = 'pad' | 'keys';

/** Where the chosen tab is remembered (`localStorage`, best-effort). */
export const CONTROLS_TAB_KEY = 's2u.viewer.controlsTab';

/** The tab to show: the one the player chose, else the Controller tab when a pad is connected, else Mouse & Keyboard. */
export function chooseTab(stored: string | null, padConnected: boolean): ControlsTab {
  if (stored === 'pad' || stored === 'keys') return stored;
  return padConnected ? 'pad' : 'keys';
}
