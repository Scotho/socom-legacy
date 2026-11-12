import { describe, expect, it } from 'vitest';
import { MESSAGE_COLOUR_NAMES, MESSAGE_COLOURS, postScriptMessage } from '../src/matchMessages';
import { MESSAGE_SCALE } from '../src/hud';

/** FORGE_MESSAGE_COLOUR_ADAPTATION (the owner, 2026-11-10): a Forge switch's message in one of the window's six colours. */
describe("a script's message colour", () => {
  it("no colour: the window's own post, as before; a colour: a line in that one of the six, at the window's scale", () => {
    const posts: unknown[] = [];
    const hud = { postMessage: (lines: unknown) => { posts.push(lines); } };
    postScriptMessage(hud, 'PLAIN');
    postScriptMessage(hud, 'RED', 5);
    expect(posts).toEqual(['PLAIN', [{ text: 'RED', scale: MESSAGE_SCALE, rgb: [1, 0.5, 0.5] }]]);
  });

  it('names each of the six', () => {
    expect(MESSAGE_COLOUR_NAMES).toHaveLength(MESSAGE_COLOURS.length);
  });
});
