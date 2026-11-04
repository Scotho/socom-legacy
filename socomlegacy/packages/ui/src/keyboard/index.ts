/**
 * The soft keyboard (PLAT-17; web research 119): `UiParams.rdr`'s 12 layouts, `GetTextInput`'s arguments, the keyboard
 * as a state machine driven by the menus' pad (PLAT-11) and the USB keys, drawn as PLAT-14 draw-list items, and its
 * connection to the front end (`SoftKeyboardFrontEnd`). The page's physical keys enter through
 * `packages/viewer/src/softKeyboardKeys.ts`.
 */
export * from './params';
export * from './text';
export * from './textInput';
export * from './usb';
export * from './softKeyboard';
export * from './frontEnd';
