import { describe, expect, it } from 'vitest';
import { SquadCoordinator, type SquadMember } from '../src/bots/squad';
import type { CoverPosition } from '../src/bots/positions';

const cover = (x = 0): CoverPosition => ({ hide: [x, 0, 0], peek: [x, 0, 30], crouch: false, threat: [100, 0, 0] });
const member = (id: number, patch: Partial<SquadMember> = {}): SquadMember => ({
  id, team: 'seal', alive: true, at: [id * 40, 0, 60], hasContact: true, contact: 90, target: 90,
  rounds: 30, reloading: false, pressure: false, laneClear: true, ready: true,
  cover: null, coverValid: true, pathValid: true, atCover: false, ...patch,
});

describe('authored squad reservation and support leases', () => {
  it('reserves distinct hide/peek space, rejects overlap and copies caller-owned points', () => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2)]);
    const first = cover();
    expect(squad.reserve(1, first)).toBe(true);
    first.hide[0] = 999;
    expect(squad.status(1).reservation?.hide).toEqual([0, 0, 0]);
    expect(squad.reserve(2, cover(10))).toBe(false);
    expect(squad.reserve(2, cover(60))).toBe(true);
    expect(squad.reservedPoints(2)).toEqual([[0, 0, 0], [0, 0, 30]]);
  });
  it('assigns a deterministic available supporter, prevents cycles and releases on arrival without blocking solo movement', () => {
    const squad = new SquadCoordinator(), units = [member(3), member(2), member(1)];
    squad.sync('round1', 0, units);
    squad.reserve(1, cover());
    expect(squad.requestSupport(1, 0)).toBe(2);
    expect(squad.status(1)).toMatchObject({ role: 'mover', partner: 2 });
    expect(squad.status(2)).toMatchObject({ role: 'supporter', partner: 1 });
    expect(squad.reserve(2, cover(60))).toBe(false);
    expect(squad.requestSupport(2, 0)).toBeNull();
    squad.sync('round1', 1, [member(1, { at: [0, 0, 0], atCover: true, cover: cover() }), member(2), member(3)]);
    expect(squad.status(2)).toMatchObject({ role: 'independent', partner: null, reason: 'arrived' });
    expect(squad.status(1).reservation).not.toBeNull();
    squad.release(1, 'cover-finished');
    squad.sync('round1', 2, [member(1)]);
    squad.reserve(1, cover());
    expect(squad.requestSupport(1, 2)).toBeNull();
    expect(squad.status(1)).toMatchObject({ role: 'independent', reason: 'no-supporter' });
  });
  it.each([
    [{ alive: false }, 'dead'], [{ target: null }, 'lost-sight'], [{ rounds: 0 }, 'empty-magazine'],
    [{ reloading: true }, 'reloading'], [{ pressure: true }, 'pressure'], [{ laneClear: false }, 'lane-blocked'],
  ] as const)('cancels support when eligibility changes: %s', (patch, reason) => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2)]);
    squad.reserve(1, cover()); squad.requestSupport(1, 0);
    squad.sync('round1', 1, [member(1, { cover: cover() }), member(2, patch)]);
    expect(squad.status(1)).toMatchObject({ role: 'independent', partner: null, reason });
    expect(squad.status(2)).toMatchObject({ role: 'independent', partner: null, reason });
  });
  it.each([
    [{ alive: false }, 'dead'], [{ contact: null, hasContact: false }, 'contact-lost'], [{ coverValid: false }, 'cover-invalid'],
    [{ pathValid: false }, 'path-invalid'], [{ cover: null }, 'cover-finished'],
  ] as const)('releases invalid mover reservations and both roles: %s', (patch, reason) => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2)]);
    squad.reserve(1, cover()); squad.requestSupport(1, 0);
    squad.sync('round1', 1, [member(1, { cover: cover(), ...patch }), member(2)]);
    expect(squad.status(1)).toMatchObject({ role: 'independent', partner: null, reservation: null, reason });
    expect(squad.status(2).partner).toBeNull();
  });
  it('drops disconnected/round-old owners and never assigns an unobserved or hostile target', () => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2, { target: null }), member(3, { team: 'terrorist' })]);
    squad.reserve(1, cover());
    expect(squad.requestSupport(1, 0)).toBeNull();
    squad.sync('round1', 1, [member(1, { cover: cover() }), member(2)]);
    expect(squad.requestSupport(1, 1)).toBe(2);
    squad.sync('round1', 2, [member(2)]);
    expect(squad.status(1).reservation).toBeNull();
    expect(squad.status(2)).toMatchObject({ partner: null, reason: 'disconnected' });
    squad.reserve(2, cover(60));
    squad.sync('round2', 3, [member(2)]);
    expect(squad.status(2)).toMatchObject({ partner: null, reservation: null, reason: 'round-reset' });
  });
  it('does not expose hostile reservations as team map knowledge and cancels a changed-team lease', () => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2), member(3, { team: 'terrorist' })]);
    expect(squad.reserve(3, cover())).toBe(true);
    expect(squad.reservedPoints(1)).toEqual([]);
    expect(squad.reserve(1, cover())).toBe(true);
    expect(squad.requestSupport(1, 0)).toBe(2);
    squad.sync('round1', 1, [member(1, { cover: cover() }), member(2, { team: 'terrorist' })]);
    expect(squad.status(1)).toMatchObject({ role: 'independent', reason: 'team-changed' });
  });
  it('expires stalled support and rejects already invalid cover/path observations', () => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1), member(2), member(3, { pathValid: false })]);
    expect(squad.reserve(3, cover(90))).toBe(false);
    squad.reserve(1, cover()); squad.requestSupport(1, 0);
    const until = squad.status(1).until!;
    squad.sync('round1', until, [member(1, { cover: cover() }), member(2)]);
    expect(squad.status(1)).toMatchObject({ role: 'independent', reason: 'expired' });
    expect(squad.status(2).partner).toBeNull();
  });
  it('preserves individual cover for a sensed origin without inventing an identified shared target', () => {
    const squad = new SquadCoordinator();
    squad.sync('round1', 0, [member(1, { contact: null, target: null }), member(2)]);
    expect(squad.reserve(1, cover())).toBe(true);
    expect(squad.requestSupport(1, 0)).toBeNull();
    expect(squad.status(1).reservation).not.toBeNull();
  });
});
