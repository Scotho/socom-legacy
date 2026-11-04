import { describe, expect, it } from 'vitest';
import { checkSchema, fieldSet, FROSTFIRE_BOX, SchemaRefusal, type FieldDef, RECOMP_ADDRESSES, RECOMP_OFFSETS, recompOffset } from '../harness/schema';

function copy(): FieldDef[] {
  return FROSTFIRE_BOX.map((f) => ({ ...f, tolerance: { ...f.tolerance } }));
}

describe('frostfire-box schema (plan section 2.2, pending the PH-2 source re-read)', () => {
  it('passes the production check', () => {
    expect(() => checkSchema(FROSTFIRE_BOX)).not.toThrow();
    expect(fieldSet('frostfire-box')).toBe(FROSTFIRE_BOX);
  });

  it('refuses a field with no evidence', () => {
    const fields = copy();
    fields[0] = { ...fields[0]!, evidence: '   ' };
    expect(() => checkSchema(fields)).toThrow(SchemaRefusal);
    expect(() => checkSchema(fields)).toThrow(/has no evidence/);
  });

  it('refuses a field with no tolerance', () => {
    const fields = copy();
    fields[1] = { ...fields[1]!, tolerance: { kind: '' as 'exact' } };
    expect(() => checkSchema(fields)).toThrow(/has no tolerance/);
  });

  it('refuses a duplicate name', () => {
    const fields = copy();
    fields.push({ ...fields[0]! });
    expect(() => checkSchema(fields)).toThrow(/duplicate field/);
  });

  it('refuses an unknown field set', () => {
    expect(() => fieldSet('no-such-set')).toThrow(SchemaRefusal);
  });

  it('leaves matrix.y unscored, and says the offset is unread', () => {
    const matrix = FROSTFIRE_BOX.find((f) => f.name === 'matrix.y');
    expect(matrix?.scored).toBe(false);
    expect(matrix?.tolerance.kind).toBe('masked');
    expect(matrix?.evidence).toMatch(/unread|U6|\+0x404/);
  });

  it('gives every field evidence and a tolerance', () => {
    for (const f of FROSTFIRE_BOX) {
      expect(f.evidence.trim().length, f.name).toBeGreaterThan(0);
      expect(f.tolerance.kind, f.name).toBeTruthy();
      expect(f.recomp.trim().length, f.name).toBeGreaterThan(0);
      expect(f.port.trim().length, f.name).toBeGreaterThan(0);
    }
  });
});

/**
 * PH-2's re-read at the decompilation (2026-10-26, research 366 section 2; reading, pending review): every recomp read
 * cites its source, U6 is settled, and a field with no decisive site is recorded, never scored.
 */
describe('PH-2: the field set re-read at the source', () => {
  it('no row still waits on the re-read; every scored recomp read cites a FUN_ and a D:L line', () => {
    for (const f of FROSTFIRE_BOX) expect(f.evidence, f.name).not.toMatch(/Pending the PH-2 re-read/);
    const cited = FROSTFIRE_BOX.filter((f) => f.scored && !f.name.startsWith('pad.') && f.name !== 't_guest');
    for (const f of cited) expect(`${f.recomp} ${f.evidence}`, f.name).toMatch(/FUN_[0-9a-f]{8}.*D:L\d+|D:L\d+.*FUN_[0-9a-f]{8}/);
  });

  it('U6 settled: matrix.y reads the body node\'s translation, and +0x404 is the floor hit\'s y', () => {
    const matrix = FROSTFIRE_BOX.find((f) => f.name === 'matrix.y')!;
    expect(matrix.recomp).toContain('*(*(actor+0x28)+0x34)');
    expect(matrix.evidence).toMatch(/floor hit/);
    expect(FROSTFIRE_BOX.find((f) => f.name === 'floor.y')!.recomp).toContain('actor+0x404');
  });

  it('a field with no decisive site, or no port reading of the source\'s meaning, is recorded and masked, not scored', () => {
    for (const name of ['vel.world.x', 'vel.world.y', 'vel.world.z', 'play.phase', 'play.steer', 'flags.e1bit4']) {
      const f = FROSTFIRE_BOX.find((x) => x.name === name)!;
      expect([f.scored, f.tolerance.kind], name).toEqual([false, 'masked']);
    }
  });

  it('the reads the source corrected: the claymore timer is the charge object\'s, the depth an index plus one, root.y absolute', () => {
    const by = (n: string) => FROSTFIRE_BOX.find((f) => f.name === n)!;
    expect(by('claymore.timer').recomp).toMatch(/claymore object\)\+0x87c/);
    expect(by('action.depth').recomp).toMatch(/actor\+0x1c8 \+ 1/);
    expect(by('root.y').recomp).toMatch(/^actor\+0x20 \+ /);
    expect(by('flags.0x200').recomp).toContain('D:L475305');
    expect(by('feetY.climb').evidence).toContain('D:L466784');
  });
});

/**
 * PH-2's per-revision offsets (2026-10-26), in the desktop's `guest_addresses.py` shape -- name -> revision -> value --
 * at desktop@be557831:tools_py/parity/guest_addresses.py:57-62 (PROBE_ADDRESSES) and :376-380 (PROBE_OFFSETS). An r0004
 * value the desktop has not established is null, never r0001's number carried over.
 */
describe('PH-2: the recomp reads per revision', () => {
  it('carries the desktop\'s established numbers and nothing else for r0004', () => {
    expect(RECOMP_ADDRESSES.player_actor).toEqual({ r0001: 0x00408c58, r0004: 0x00435618 });
    expect(RECOMP_ADDRESSES.guest_clock).toEqual({ r0001: 0x004365c0, r0004: 0x00442fd0 });
    expect(recompOffset('pos.x', 'r0004')).toBe(0x1c);
    expect(recompOffset('moveScale', 'r0001')).toBe(0x1368);
    expect(recompOffset('moveScale', 'r0004')).toBe(0x136c);
    expect(recompOffset('root.y', 'r0004')).toBe(0x2e8);
    // health and alive: no r0004 value established (guest_addresses.py:443-447); the rest are absent from its table
    for (const name of ['health', 'alive', 'action.current', 'vel.local.x', 'stance.wished']) expect(recompOffset(name, 'r0004'), name).toBeNull();
  });

  it('refuses an unknown field or revision rather than answer another column', () => {
    expect(() => recompOffset('no.such.field', 'r0001')).toThrow(SchemaRefusal);
    expect(() => recompOffset('pos.x', 'r0002' as never)).toThrow(SchemaRefusal);
  });

  it('each r0001 offset is the one its row\'s recomp read names, and every keyed field is in the set', () => {
    for (const [name, col] of Object.entries(RECOMP_OFFSETS)) {
      const f = FROSTFIRE_BOX.find((x) => x.name === name);
      expect(f, name).toBeDefined();
      expect(f!.recomp.toLowerCase(), name).toContain(`+0x${col.r0001.toString(16)}`);
    }
  });
});
