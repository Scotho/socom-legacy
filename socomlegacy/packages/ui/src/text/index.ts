/**
 * UI text (PLAT-13; web research 111): the faces of `fonts.rdr` as the engine loads them, a caption's codes, a text
 * laid out into glyph quads, the colour states and TEXT_GLOW, WRAPPEDTEXT and TELETYPE -- as data a compositor draws
 * (W7.R3). No clock is read here: every tick takes its `dt`.
 */
export * from './f32';
export * from './face';
export * from './codes';
export * from './layout';
export * from './states';
export * from './wrapped';
export * from './teletype';
export * from './captions';
