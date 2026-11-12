import { describe, expect, it } from 'vitest';
import { menuFramesPrivates } from '../e2e/uiGpuMenuFramesPage';

/**
 * GM-31 review F2: the private fields `e2e/uiGpuMenuFramesPage.ts` reads off the front end's session, each refused by its
 * name when missing, so a rename cannot leave the scorer's frame built without faces or captions. A test instrument
 * (product track). Evidence kind: unit test.
 */

const lookup = (): null => null, face = (): null => null, textures = (): null => null;
const session = (o: unknown, t: unknown = textures): unknown => ({ machine: { o }, textures: t });

describe('GM-31 review F2: menuFramesPrivates', () => {
  it('returns the lookup, the face, the captions (null allowed) and the textures', () => {
    const got = menuFramesPrivates(session({ dialog: lookup, build: { face, captions: null } }));
    expect(got.lookup).toBe(lookup);
    expect(got.face).toBe(face);
    expect(got.captions).toBeNull();
    expect(got.textures).toBe(textures);
  });

  it('refuses each missing field by its name', () => {
    expect(() => menuFramesPrivates(null)).toThrow(/session\.machine\.o /);
    expect(() => menuFramesPrivates({ machine: {} })).toThrow(/session\.machine\.o /);
    expect(() => menuFramesPrivates(session({ build: { face, captions: null } }))).toThrow(/session\.machine\.o\.dialog/);
    expect(() => menuFramesPrivates(session({ dialog: lookup }))).toThrow(/session\.machine\.o\.build /);
    expect(() => menuFramesPrivates(session({ dialog: lookup, build: { captions: null } }))).toThrow(/session\.machine\.o\.build\.face/);
    expect(() => menuFramesPrivates(session({ dialog: lookup, build: { face } }))).toThrow(/session\.machine\.o\.build\.captions/);
    expect(() => menuFramesPrivates(session({ dialog: lookup, build: { face, captions: null } }, null))).toThrow(/session\.textures/);
  });
});
