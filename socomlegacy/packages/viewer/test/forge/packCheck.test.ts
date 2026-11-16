import { describe, expect, it } from 'vitest';
import { DECLARED_CODES, PACK_TARGET_US, type DeclaredPack, type PackKind, type PackManifest, type PackRef, type PackSide } from '@s2u/creator-contracts';
import { joinPackRefusal, PACK_CHECK_CODES, type HeldPack } from '../../src/forge/lobby/packCheck';

/**
 * CMV-7 (the community-mods plan, `docs/plans/2026-11-12-community-mods-validation.md`, row CMV-7; CMV.R14; the main
 * controller's call 1 of 2026-11-13, STRICT R14; product track, a browser adaptation with no original): **a joiner missing
 * a pack the lobby's layout needs is stopped before any seat is asked, each pack named**, and a pack the page holds whose
 * server's declaration differs from the manifest held here refuses the join with `declared.MANIFEST_MISMATCH`. Every need
 * the joiner does not hold refuses, whatever side the host claims for it: a declared side or kind is acted on only for a
 * pack the page holds, after `checkDeclaredAgainstManifest`. Pack ids and hashes invented.
 */

const ALPHA: PackRef = { id: 'alpha.props', version: '1.2.0', hash: 'a'.repeat(64) };
const ZULU: PackRef = { id: 'zulu.rules', version: '0.3.1', hash: 'b'.repeat(64) };

/** A declaration of `ref` (the host's claim). */
const declared = (ref: PackRef, sides: PackSide = 'client', kinds: PackKind[] = ['content']): DeclaredPack =>
  ({ id: ref.id, version: ref.version, hash: ref.hash, sides, kinds });

/** The manifest the page holds for `ref` (its `ref.hash` stands for `packDigest(manifest)`, as the store keeps it). */
const manifest = (ref: PackRef, sides: PackSide = 'client', kinds: PackKind[] = ['content']): PackManifest => ({
  format: 's2u-pack', formatVersion: 2, id: ref.id, version: ref.version, name: 'Fixture', target: PACK_TARGET_US, contract: '>=0.2.0',
  kinds, sides, dependencies: [], files: [], intents: [],
});
const held = (ref: PackRef, sides: PackSide = 'client', kinds: PackKind[] = ['content']): HeldPack => ({ ref: { ...ref }, manifest: manifest(ref, sides, kinds) });

/** Freezes `v` and everything under it. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]); Object.freeze(v); }
  return v;
}

describe('CMV-7: joinPackRefusal -- a lobby\'s packs checked before any seat is asked', () => {
  it('a pack-free lobby: null, whatever the declaration (nothing changes)', () => {
    expect(joinPackRefusal({ needs: [], declared: undefined, held: [] })).toBeNull();
    expect(joinPackRefusal({ needs: [], declared: 'not a list', held: [] })).toBeNull();
    expect(joinPackRefusal({ needs: [], declared: [declared(ALPHA, 'server')], held: [held(ZULU)] })).toBeNull();
  });

  it('every need held, the declaration its manifests\': null (the join goes on)', () => {
    expect(joinPackRefusal({ needs: [ALPHA, ZULU], declared: [declared(ALPHA), declared(ZULU, 'both', ['rules'])], held: [held(ALPHA), held(ZULU, 'both', ['rules'])] })).toBeNull();
  });

  it('one missing: refused, its code, the pack, the line naming it by id and version', () => {
    const out = joinPackRefusal({ needs: [ALPHA], declared: [declared(ALPHA)], held: [] });
    expect(out).not.toBeNull();
    expect(out!.code).toBe(PACK_CHECK_CODES.missing);
    expect(out!.packs).toEqual([ALPHA]);
    expect(out!.line).toContain('alpha.props 1.2.0');
    expect(out!.line).toMatch(/^Needs 1 pack not here/);
  });

  it('two missing: both named, in the needs\' order', () => {
    const out = joinPackRefusal({ needs: [ALPHA, ZULU], declared: [declared(ALPHA), declared(ZULU)], held: [] });
    expect(out!.code).toBe(PACK_CHECK_CODES.missing);
    expect(out!.packs).toEqual([ALPHA, ZULU]);
    expect(out!.line).toContain('alpha.props 1.2.0');
    expect(out!.line).toContain('zulu.rules 0.3.1');
    expect(out!.line).toMatch(/^Needs 2 packs not here/);
  });

  it('a held pack at another hash is missing (exact identity, never a near one)', () => {
    const other = { ...ALPHA, hash: 'c'.repeat(64) };
    const out = joinPackRefusal({ needs: [ALPHA], declared: [declared(ALPHA)], held: [held(other)] });
    expect(out!.code).toBe(PACK_CHECK_CODES.missing);
    expect(out!.packs).toEqual([ALPHA]);
  });

  it('a held pack whose declared sides are not its manifest\'s: declared.MANIFEST_MISMATCH, that pack, named', () => {
    const out = joinPackRefusal({ needs: [ALPHA], declared: [declared(ALPHA, 'server')], held: [held(ALPHA, 'client')] });
    expect(out!.code).toBe(DECLARED_CODES.manifestMismatch);
    expect(out!.packs).toEqual([ALPHA]);
    expect(out!.line).toContain('alpha.props 1.2.0');
  });

  it('a held pack whose declared kinds are not its manifest\'s: declared.MANIFEST_MISMATCH', () => {
    const out = joinPackRefusal({ needs: [ZULU], declared: [declared(ZULU, 'both', ['content'])], held: [held(ZULU, 'both', ['rules'])] });
    expect(out!.code).toBe(DECLARED_CODES.manifestMismatch);
    expect(out!.packs).toEqual([ZULU]);
    expect(out!.line).toContain('zulu.rules 0.3.1');
  });

  it('the mismatch comes before the missing: one held pack misdescribed, another not held', () => {
    const out = joinPackRefusal({ needs: [ALPHA, ZULU], declared: [declared(ALPHA, 'server'), declared(ZULU)], held: [held(ALPHA, 'client')] });
    expect(out!.code).toBe(DECLARED_CODES.manifestMismatch);
    expect(out!.packs).toEqual([ALPHA]);
  });

  it('strict R14: a pack the host declares server-side that the joiner does not hold is STILL refused as missing (the claimed side is not used)', () => {
    for (const sides of ['server', 'both', 'client'] as const) {
      const out = joinPackRefusal({ needs: [ZULU], declared: [declared(ZULU, sides, ['rules'])], held: [] });
      expect(out?.code, sides).toBe(PACK_CHECK_CODES.missing);
      expect(out?.packs, sides).toEqual([ZULU]);
    }
  });

  it('a lobby with needs and no declaration: refused declared.LIST_INVALID; a declaration that does not read: refused by its own code', () => {
    for (const absent of [undefined, null, 'packs', { id: 'alpha.props' }]) {
      const out = joinPackRefusal({ needs: [ALPHA], declared: absent, held: [held(ALPHA)] });
      expect(out?.code, JSON.stringify(absent)).toBe(DECLARED_CODES.listInvalid);
      expect(out?.packs).toEqual([]);
      expect(out?.line).toMatch(/\S/);
    }
    const bad = joinPackRefusal({ needs: [ALPHA], declared: [{ id: 'alpha.props' }], held: [held(ALPHA)] });
    expect(bad?.code).toBe(DECLARED_CODES.entryInvalid);
  });

  it('the review\'s note: a host declaring x@2 for a lobby needing x@1 is refused, the joiner holding x@1 (identity only, CMV.R14)', () => {
    const X1: PackRef = { id: 'x.pack', version: '1.0.0', hash: 'd'.repeat(64) };
    const X2: PackRef = { id: 'x.pack', version: '2.0.0', hash: 'e'.repeat(64) };
    const out = joinPackRefusal({ needs: [X1], declared: [declared(X2)], held: [held(X1)] });
    expect(out?.code).toBe(DECLARED_CODES.versionMismatch);
    expect(out?.packs).toEqual([X1]);
    expect(out?.line).toContain('x.pack 1.0.0');
    // another hash at the same version, and no pack of that id: each its own code
    expect(joinPackRefusal({ needs: [X1], declared: [declared({ ...X1, hash: 'f'.repeat(64) })], held: [held(X1)] })?.code).toBe(DECLARED_CODES.hashMismatch);
    expect(joinPackRefusal({ needs: [X1], declared: [declared(ALPHA)], held: [held(X1)] })?.code).toBe(DECLARED_CODES.packMissing);
  });

  it('frozen input: never mutated, never thrown on, a fresh answer', () => {
    const input = deepFreeze({ needs: [ALPHA, ZULU], declared: [declared(ALPHA, 'server'), declared(ZULU)], held: [held(ALPHA, 'client')] });
    const before = JSON.stringify(input);
    const out = joinPackRefusal(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(out!.packs[0]).not.toBe(input.needs[0]);
    const missing = joinPackRefusal(deepFreeze({ needs: [ZULU], declared: [declared(ZULU)], held: [] }));
    expect(missing!.code).toBe(PACK_CHECK_CODES.missing);
  });

  it('the missing code is packCheck\'s own (no pack.MISSING in PACK_CODES), its table frozen', () => {
    expect(PACK_CHECK_CODES.missing).toBe('packCheck.MISSING');
    expect(Object.isFrozen(PACK_CHECK_CODES)).toBe(true);
  });
});
