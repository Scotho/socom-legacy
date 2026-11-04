// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { parseCharacterTable, readKitTable } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  applyFall, applyHit, bulletDamage, DAMAGE_SCALE, FALL_DEATH_SPEED, FALL_HURT_SPEED, fragmentDamage, freshHealth, isDead,
  MP_ARMOUR, MP_HEALTH, overall, PART,
} from '../src/net/damage';
import { DAMAGE_BONES } from '../src/net/hitVolumes';

/**
 * TA-ROUND (the test-architecture wave): the round's damage model, pinned to research 91 sections 1-5
 * (socomlegacy/docs/research/91-the-round.md) with no game data. The disc's rows the rules read -- the MP characters' part
 * health and armour (`character.rdr`), the weapons of section 1.2 and the thrown charges of section 5 (`zweapon.rdr`) --
 * are a golden pin (TA.R3: test/golden/round-damage.json); the unit tests drive `net/damage.ts` from the pin, and the
 * fixture test at the end re-derives the pin whole from the disc's files through the repository's readers, so it
 * cannot rot. Registry: socomlegacy/docs/parity/registry/round.json.
 */

interface WeaponRow {
  id: number; name: string; displayName: string; ammo: string; impactDamage: number; damageModifier: number; piercing: number;
  effectiveRange: number; maximumRange: number; pellets: number;
}
interface ThrowableRow { id: number; name: string; explosionDamage: number; explosionRadius: number; piercing: number }
interface Golden {
  _source: string;
  parts: string[];
  characters: Record<'mp_seal' | 'mp_terror', { health: number[]; armour: number[] }>;
  weapons: WeaponRow[];
  throwables: ThrowableRow[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(readFileSync(resolve(HERE, 'golden/round-damage.json'), 'utf8')) as Golden;
const weapon = (id: number): WeaponRow => GOLDEN.weapons.find((w) => w.id === id)!;

/**
 * Research 91 section 1.2's table, as the note prints it: damage a round within `Effective_Range` (x14), and the shots
 * to kill on the head (8/0) and the body (50/25), and to zero one limb (30/25), every shot on the same part.
 */
const NOTE_1_2: Record<number, { dmg: number; head: number; body: number; limb: number }> = {
  54: { dmg: 36.4, head: 1, body: 3, limb: 2 }, 62: { dmg: 34.3, head: 1, body: 3, limb: 2 }, 15: { dmg: 42.0, head: 1, body: 2, limb: 2 },
  6: { dmg: 21.0, head: 1, body: 6, limb: 5 }, 12: { dmg: 21.0, head: 1, body: 6, limb: 5 }, 5: { dmg: 21.0, head: 1, body: 6, limb: 5 },
  14: { dmg: 21.0, head: 1, body: 6, limb: 5 }, 4: { dmg: 19.6, head: 1, body: 6, limb: 5 }, 7: { dmg: 89.6, head: 1, body: 1, limb: 1 },
  13: { dmg: 30.8, head: 1, body: 2, limb: 2 }, 31: { dmg: 21.0, head: 1, body: 6, limb: 5 }, 38: { dmg: 21.0, head: 1, body: 6, limb: 5 },
  34: { dmg: 19.6, head: 1, body: 6, limb: 5 }, 68: { dmg: 32.2, head: 1, body: 3, limb: 2 }, 57: { dmg: 32.2, head: 1, body: 3, limb: 2 },
  67: { dmg: 29.4, head: 1, body: 4, limb: 3 }, 58: { dmg: 32.2, head: 1, body: 3, limb: 2 }, 65: { dmg: 37.8, head: 1, body: 3, limb: 2 },
  64: { dmg: 32.2, head: 1, body: 3, limb: 2 }, 66: { dmg: 28.0, head: 1, body: 3, limb: 2 }, 92: { dmg: 26.6, head: 1, body: 4, limb: 3 },
  106: { dmg: 37.8, head: 1, body: 2, limb: 1 }, 101: { dmg: 126.0, head: 1, body: 1, limb: 1 }, 84: { dmg: 35.0, head: 1, body: 2, limb: 2 },
  81: { dmg: 35.0, head: 1, body: 2, limb: 2 },
};

function shotsToKill(w: WeaponRow, part: number): number {
  const h = freshHealth(), dmg = bulletDamage(w, 0)!;
  for (let n = 1; n <= 50; n++) if (applyHit(h, part, dmg, w.piercing)) return n;
  return Infinity;
}
function shotsToZeroLimb(w: WeaponRow, part: number): number {
  const h = freshHealth(), dmg = bulletDamage(w, 0)!;
  for (let n = 1; n <= 50; n++) { applyHit(h, part, dmg, w.piercing); if (h.hp[part]! <= 0) return n; }
  return Infinity;
}

describe('health and armour (research 91 section 2: character.rdr; FUN_0053ddb0 L406804, L406826-406833)', () => {
  it('the MP part health and armour are mp_seal\'s and mp_terror\'s rows, part order head, rarm, larm, body, rleg, lleg', () => {
    expect(GOLDEN.parts).toEqual(['head', 'rarm', 'larm', 'body', 'rleg', 'lleg']);
    expect([PART.HEAD, PART.RARM, PART.LARM, PART.BODY, PART.RLEG, PART.LLEG]).toEqual([0, 1, 2, 3, 4, 5]);
    for (const c of [GOLDEN.characters.mp_seal, GOLDEN.characters.mp_terror]) {
      expect([...MP_HEALTH]).toEqual(c.health);
      expect([...MP_ARMOUR]).toEqual(c.armour);
    }
    expect(freshHealth()).toEqual({ hp: GOLDEN.characters.mp_seal.health, armour: GOLDEN.characters.mp_seal.armour });
  });

  it('the HUD bar weights the head three times: (3 head + the rest) / (3 head max + the rest) (FUN_005a56d0 L461416-461437)', () => {
    const h = freshHealth();
    expect(overall(h)).toBe(1);
    h.hp[PART.HEAD] = 4;
    expect(overall(h)).toBeCloseTo((3 * 4 + 170) / (3 * 8 + 170), 12);
    h.hp[PART.HEAD] = 8; h.hp[PART.RLEG] = 0;
    expect(overall(h)).toBeCloseTo((24 + 140) / 194, 12);
  });
});

describe('bullet damage (research 91 section 1.1-1.2: FUN_003c7600 L318738-318767)', () => {
  it('every weapon of section 1.2 does (ImpactDamage + Damage_Modifier) x 14 a round within Effective_Range: the note\'s column', () => {
    expect(DAMAGE_SCALE).toBe(14);
    expect(Object.keys(NOTE_1_2).map(Number).sort((a, b) => a - b)).toEqual(GOLDEN.weapons.map((w) => w.id).sort((a, b) => a - b));
    for (const w of GOLDEN.weapons) {
      expect(bulletDamage(w, 0), w.name).toBeCloseTo(NOTE_1_2[w.id]!.dmg, 9);
      expect(bulletDamage(w, w.effectiveRange * 10), w.name).toBeCloseTo(NOTE_1_2[w.id]!.dmg, 9);
    }
  });

  it('every weapon kills in the note\'s shots: one to the head, the body and a limb as section 1.2 counts them', () => {
    for (const w of GOLDEN.weapons) {
      const n = NOTE_1_2[w.id]!;
      expect(shotsToKill(w, PART.HEAD), w.name).toBe(n.head);
      expect(shotsToKill(w, PART.BODY), w.name).toBe(n.body);
      for (const limb of [PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) expect(shotsToZeroLimb(w, limb), w.name).toBe(n.limb);
    }
  });

  it('falls off linearly from Effective_Range x 10 to nothing at Maximum_Range x 10, and a round past it is ignored (L318752-318760; FUN_003c8920 L319410)', () => {
    for (const w of GOLDEN.weapons) {
      const e = w.effectiveRange * 10, m = w.maximumRange * 10, full = NOTE_1_2[w.id]!.dmg;
      expect(bulletDamage(w, (e + m) / 2), w.name).toBeCloseTo(full / 2, 9);
      expect(bulletDamage(w, e + (m - e) * 0.75), w.name).toBeCloseTo(full / 4, 9);
      expect(bulletDamage(w, m), w.name).toBeCloseTo(0, 9);
      expect(bulletDamage(w, m + 0.01), w.name).toBeNull();
    }
  });
});

describe('the armour step and the part bookkeeping (research 91 sections 1.4, 3: FUN_003c7400, FUN_005a5830, FUN_005a54d0)', () => {
  it('eff = max(0, dmg - A (10 - P) / 10); the armour loses a quarter of what it took; the part loses eff (L318568-318590)', () => {
    const m4 = weapon(54), dmg = bulletDamage(m4, 0)!;              // 36.4 at piercing 3 on the body's 25
    const h = freshHealth();
    applyHit(h, PART.BODY, dmg, m4.piercing);
    expect(h.armour[PART.BODY]).toBeCloseTo(25 - (25 * 0.7) / 4, 12);   // 20.625
    expect(h.hp[PART.BODY]).toBeCloseTo(50 - (36.4 - 17.5), 12);        // 31.1
    // A round under what the armour stops: no health lost, the armour a quarter of the round down.
    const g = freshHealth();
    expect(applyHit(g, PART.BODY, 10, 0)).toBe(false);
    expect(g.hp[PART.BODY]).toBe(50);
    expect(g.armour[PART.BODY]).toBeCloseTo(25 - 10 / 4, 12);
    // Piercing 10: the armour takes nothing and keeps all of itself.
    const k = freshHealth();
    applyHit(k, PART.RARM, 12, 10);
    expect(k.hp[PART.RARM]).toBe(18);
    expect(k.armour[PART.RARM]).toBe(25);
  });

  it('a body hit caps each limb at limb max x body / body max, never the head (L461492-461526)', () => {
    const h = freshHealth();
    applyHit(h, PART.BODY, 36.4, 3);
    const share = 31.1 / 50;
    for (const limb of [PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) expect(h.hp[limb]).toBeCloseTo(30 * share, 9);
    expect(h.hp[PART.HEAD]).toBe(8);
  });

  it('death is the head or the body at 0; four limbs at 0 kill no one (L461376-461380)', () => {
    const h = freshHealth();
    for (const limb of [PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) {
      while (h.hp[limb]! > 0) expect(applyHit(h, limb, 30, 10)).toBe(false);
    }
    expect(isDead(h)).toBe(false);
    expect(h.hp[PART.HEAD]).toBe(8);
    expect(h.hp[PART.BODY]).toBe(50);
    const head = freshHealth();
    expect(applyHit(head, PART.HEAD, 8, 0)).toBe(true);           // the head has no armour (0)
    expect(isDead({ hp: [8, 30, 30, 0, 30, 30], armour: [...MP_ARMOUR] })).toBe(true);
  });
});

describe('falls (research 91 section 5: FUN_005ac1f0 L464864-464960, FUN_0059ba80 L456671-456682, dynamics.rdr)', () => {
  it('the speeds are sqrt(2 g h) at g 235 for FALLING_DAMAGE_LIGHT 62 and _DEATH 120 units: 170.7 and 237.5 u/s', () => {
    expect(FALL_HURT_SPEED).toBeCloseTo(Math.sqrt(2 * 235 * 62), 1);
    expect(FALL_DEATH_SPEED).toBeCloseTo(Math.sqrt(2 * 235 * 120), 1);
  });

  it('every part loses max x f, f = (v - 170.7) / (237.5 - 170.7) clamped: nothing at 170.7, half at the middle, dead at 237.5', () => {
    const none = freshHealth();
    expect(applyFall(none, FALL_HURT_SPEED)).toBe(false);
    expect(none.hp).toEqual([...MP_HEALTH]);
    const half = freshHealth();
    expect(applyFall(half, (FALL_HURT_SPEED + FALL_DEATH_SPEED) / 2)).toBe(false);
    MP_HEALTH.forEach((max, i) => expect(half.hp[i]).toBeCloseTo(max / 2, 9));
    expect(half.armour).toEqual([...MP_ARMOUR]);                  // the fall goes round the armour
    const dead = freshHealth();
    expect(applyFall(dead, FALL_DEATH_SPEED)).toBe(true);
    expect(dead.hp).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('the thrown charges\' fragments (research 91 section 5: FUN_005a0e70 L459235-459256; zweapon.rdr)', () => {
  /** Section 5's numbers: a fragment's damage, full to half the radius, nothing at it. */
  const NOTE_5: Record<string, { full: number; to: number; zeroAt: number }> = {
    M67: { full: 140, to: 75, zeroAt: 150 }, HE: { full: 154, to: 50, zeroAt: 100 }, Claymore: { full: 224, to: 125, zeroAt: 250 },
    C4: { full: 252, to: 25, zeroAt: 50 }, 'PMN Mine': { full: 91, to: 20, zeroAt: 40 }, Satchel: { full: 280, to: 140, zeroAt: 280 },
  };
  it('Explosion_Damage x 14 to half the radius, linear to nothing at it: M67 140 to 75, 0 at 150; HE 154 to 50, 0 at 100 ...', () => {
    for (const t of GOLDEN.throwables) {
      const n = NOTE_5[t.name]!;
      expect(n, t.name).toBeDefined();
      expect(t.explosionRadius, t.name).toBe(n.zeroAt);
      expect(fragmentDamage(t.explosionDamage, t.explosionRadius, 0), t.name).toBeCloseTo(n.full, 9);
      expect(fragmentDamage(t.explosionDamage, t.explosionRadius, n.to), t.name).toBeCloseTo(n.full, 9);
      expect(fragmentDamage(t.explosionDamage, t.explosionRadius, n.to * 1.5), t.name).toBeCloseTo(n.full / 2, 9);
      expect(fragmentDamage(t.explosionDamage, t.explosionRadius, n.zeroAt), t.name).toBe(0);
    }
    expect(GOLDEN.throwables.find((t) => t.name === 'M67')!.piercing).toBe(4);
    expect(GOLDEN.throwables.find((t) => t.name === 'HE')!.piercing).toBe(1);
  });
});

describe('the hit location (research 91 section 1.3: FUN_005abbc0 L464672-464803)', () => {
  it('head and neck HEAD; hips, spinelo, spinehi BODY; biceps and forearms the arms; thighs and calves the legs; hands, feet and scapulas nothing', () => {
    // The node offsets' parts are read (FUN_005abbc0); the names head, neck and hips for +0x308, +0x30c and +0x304 are
    // inferred from research 78's skeleton, not read (HEAD_NODE_NAMES_PLACEHOLDER, open: research 91 L99, L102, §16).
    const map = Object.fromEntries(DAMAGE_BONES.map((b) => [b.bone, b.part]));
    expect(map).toEqual({
      neck: PART.HEAD, head: PART.HEAD, hips: PART.BODY, spinelo: PART.BODY, spinehi: PART.BODY,
      rbicep: PART.RARM, rforearm: PART.RARM, lbicep: PART.LARM, lforearm: PART.LARM,
      rthigh: PART.RLEG, rcalf: PART.RLEG, lthigh: PART.LLEG, lcalf: PART.LLEG,
    });
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR'), READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(!ZWEAPON || !READERC)(`the golden pin re-derived from the disc${ZWEAPON && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('round-damage.json is ZWEAPON.ZAR\'s and READERC.ZAR\'s rows through readKitTable and parseCharacterTable, whole', () => {
    const kt = readKitTable(ZWEAPON!);
    const rc = Zar.parse(READERC!);
    const key = rc.root.children.find((k) => k.name.toLowerCase() === 'character.rdr')!;
    const table = parseCharacterTable(parseRdr(rc.data(key)));
    const value = (node: unknown, k: string): number => {
      const list = node as unknown[], v = list[list.indexOf(k) + 1];
      return Number(Array.isArray(v) ? v[0] : v);
    };
    const character = (name: string) => ({
      health: GOLDEN.parts.map((p) => value(table.get(name, 'health'), p)),
      armour: GOLDEN.parts.map((p) => value(table.get(name, 'armor'), p)),
    });
    const derived: Omit<Golden, '_source'> = {
      parts: GOLDEN.parts,
      characters: { mp_seal: character('mp_seal'), mp_terror: character('mp_terror') },
      weapons: GOLDEN.weapons.map(({ id }) => {
        const r = kt.records.get(id)!;
        return {
          id, name: r.name, displayName: kt.arsenal.items.get(id)!.displayName, ammo: r.ammo, impactDamage: r.impactDamage ?? 0,
          damageModifier: r.damageModifier ?? 0, piercing: r.piercing, effectiveRange: r.effectiveRange, maximumRange: r.maximumRange,
          pellets: r.pellets ?? 1,
        };
      }),
      throwables: GOLDEN.throwables.map(({ id }) => {
        const t = kt.throwables!.get(id)!;
        return { id, name: t.record.name, explosionDamage: t.record.explosionDamage, explosionRadius: t.record.explosionRadius, piercing: t.piercing };
      }),
    };
    const { _source, ...pinned } = GOLDEN;
    expect(_source).toMatch(/ZWEAPON\.ZAR.*READERC\.ZAR/);
    expect(derived).toEqual(pinned);
  });
});
