import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WeaponRecord } from '@s2u/scene';
import { Accuracy, perturb, tangentPerPixel, type Cone } from '../src/accuracy';
import { aheadOf, coneSlackPx, headPoint, ShotCone, type AimMover } from '../src/net/shotCone';
import { Button, type Command } from '../src/net/protocol';

/**
 * SHOTGUN-PELLET-CONE (LATER 934; reading, pending review): a shotgun's pull is `NumProjectilesFired` rays at one
 * command, and the original blooms the kit between them -- `FUN_005be9a0`'s pellet loop (D:L475580-475677) draws each
 * pellet's ray from the controller's cone (its `+0x74`, D:L475596 or D:L475601) and then calls `FUN_005c5340` (D:L475604),
 * which ends in the bloom `FUN_005c3360` (D:L479542) -- so pellet k leaves by the cone bloomed by pellets 1..k-1. The
 * page does the same (`fire.ts`'s pellet loop through `matchFirearm.ts`'s gun: `perturb` by `Accuracy.cone`, then
 * `Accuracy.round`). The room judged every pellet against the command's cone before the volley, so an honest page's
 * pellets 2-4 could fall outside it (46 JACKHAMMER and 10 870 pellets refused on 2026-11-11, never the first).
 *
 * Here the page's own `Accuracy` and the room's `ShotCone` side by side, as `shotCone.test.ts`'s honest first-person
 * test stages them: a still SEAL looking through the lens (the cone is the knock and the bloom alone), each command run
 * on both, a volley's rays at every corner and the centre of the page's cone at that ray, judged after the command
 * after it (the room's `due`) and each bloomed on both before the next -- from rest, and mid-burst with the trigger held.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const JACKHAMMER = PIN.records['83']!, R870 = PIN.records['84']!;
type V3 = [number, number, number];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return [a[0]! / l, a[1]! / l, a[2]! / l]; };

const still: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 0 };
const rest = { stance: 'stand' as const, velocity: [0, 0, 0] as V3, airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };
const cmd = (seq: number, buttons: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 0, weapon: 0 });
const body = { feet: [0, 0, 0] as V3, yaw: 0, pitch: 0, posture: 'stand' as const, moveRoot: null, peek: 0 };
const eye = headPoint(body), look = aheadOf(0, 0);
const CORNERS = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]] as const;
/** A ray off the look at the cone's offset plus `k` of its radius on each axis (k = +-1: the square's corner). */
const corner = (c: Cone, kx: number, ky: number, grow = 1): V3 =>
  unit(perturb(look, { offsetX: c.offsetX + c.radius * grow * kx, offsetY: c.offsetY + c.radius * grow * ky, radius: 0 }));

/**
 * `volleys` pulls of `rec`'s pellets, `gap` commands apart, after `warm` commands at rest; `held`: the trigger held
 * through (mid-burst: each volley's cone carries the volleys before it), else pressed for the volley's command alone
 * (each from rest). Every ray of every volley at the five points of the page's cone at that ray: the room's verdicts.
 */
function volleys(rec: WeaponRecord, opts: { volleys: number; gap: number; held: boolean; warm?: number }) {
  const room = new ShotCone(rec), page = new Accuracy(rec);
  const pellets = rec.pellets ?? 1;
  const refused: string[] = [];
  let checked = 0, seq = 0, trigger = false;
  const run = (buttons: number): void => {
    seq++;
    room.tick(cmd(seq, Button.Aim | buttons), still, seq);
    const t = (buttons & Button.Trigger) !== 0;
    if (t !== trigger) { trigger = t; page.trigger(); }
    page.update(1 / 60, rest);
  };
  for (let i = 0; i < (opts.warm ?? 60); i++) run(0);
  for (let v = 0; v < opts.volleys; v++) {
    for (let i = 0; i < opts.gap - 1; i++) run(opts.held && v > 0 ? Button.Trigger : 0);
    run(Button.Trigger);                                         // the volley's command
    const at = seq;
    // The page's rays, each drawn from the cone as it stands, then bloomed (`fire.ts` pellet loop, `matchFirearm.ts`).
    const drawn: Cone[] = [];
    for (let k = 0; k < pellets; k++) { drawn.push(page.cone(0, 1)); page.round(0, 'stand'); }
    run(opts.held ? Button.Trigger : 0);                         // the room decides once the command after has run
    for (let k = 0; k < pellets; k++) {
      for (const [kx, ky] of CORNERS) {
        const aim = corner(drawn[k]!, kx, ky);
        const verdict = room.check(at, { eye, aim, from: eye, dir: aim }, k > 0);   // `fireAt`'s `ofVolley`
        checked++;
        if (verdict !== null) refused.push(`${rec.name} volley ${v} pellet ${k + 1} (${kx}, ${ky}): ${verdict}`);
      }
      room.round(at);                                            // the ray taken: the room blooms it, as the page did
    }
  }
  return { refused, checked, room, page };
}

describe('SHOTGUN-PELLET-CONE (LATER 934): every ray of an honest volley inside the cone bloomed by the rays before it', () => {
  it.each([['JACKHAMMER', JACKHAMMER], ['870', R870]] as const)('%s from rest: every pellet at every corner of the page\'s cone is taken, the later ones too', (_name, rec) => {
    expect(rec.pellets).toBe(4);
    const { refused, checked } = volleys(rec, { volleys: 6, gap: 90, held: false });
    expect(checked).toBe(6 * 4 * CORNERS.length);
    expect(refused.length, refused.slice(0, 6).join(' | ')).toBe(0);
  });

  it.each([['JACKHAMMER', JACKHAMMER, 15], ['870', R870, 46]] as const)('%s mid-burst (the trigger held, a volley every %s commands): every pellet taken', (_name, rec, gap) => {
    const { refused, checked } = volleys(rec, { volleys: 8, gap: gap as number, held: true });
    expect(checked).toBe(8 * 4 * CORNERS.length);
    expect(refused.length, refused.slice(0, 6).join(' | ')).toBe(0);
  });

  it("the room's kit after the volleys is the page's: the four blooms each counted once", () => {
    const { room, page } = volleys(JACKHAMMER, { volleys: 3, gap: 15, held: true });
    const r = room.state(), p = page.state();
    expect(r.burst).toBe(p.burst);
    expect(r.size).toBeCloseTo(p.size, 9);
    expect(r.offset[1]).toBeCloseTo(p.offset[1], 9);
  });

  it('the first ray is still judged before any bloom, a round not of the pull takes none, and a later ray beyond its own bloomed cone is still refused', () => {
    const rec = JACKHAMMER;
    const room = new ShotCone(rec), page = new Accuracy(rec);
    for (let s = 1; s <= 60; s++) { room.tick(cmd(s, Button.Aim | (s === 60 ? Button.Trigger : 0)), still, s); page.update(1 / 60, rest); }
    page.trigger();
    const before = page.cone(0, 1);
    page.round(0, 'stand');
    const after = page.cone(0, 1);
    room.tick(cmd(61, Button.Aim), still, 61);
    // Ray 1 at the far corner of the cone ONE bloom on (the knock's side): outside the volley's opening cone and its slack.
    const t = tangentPerPixel(), slack = coneSlackPx(rec.stances.stand) * Math.max(t.x, t.y);
    const ky = after.offsetY < 0 ? -1 : 1;
    expect(Math.abs(after.offsetY + ky * after.radius - (before.offsetY + ky * before.radius))).toBeGreaterThan(slack);
    const early = corner(after, 1, ky);
    expect(room.check(60, { eye, aim: early, from: eye, dir: early }), 'ray 1 at the bloomed cone').toBe('cone');
    const first = corner(before, 1, ky);
    expect(room.check(60, { eye, aim: first, from: eye, dir: first }), 'ray 1 at its own cone').toBeNull();
    room.round(60);
    expect(room.check(60, { eye, aim: early, from: eye, dir: early }, true), 'ray 2 at the cone ray 1 bloomed').toBeNull();
    expect(room.check(60, { eye, aim: early, from: eye, dir: early }), 'a round not of the pull: no bloom granted').toBe('cone');
    const far = corner(after, 1, ky, 2);
    expect(room.check(60, { eye, aim: far, from: eye, dir: far }, true), 'ray 2 at twice its radius').toBe('cone');
  });
});
