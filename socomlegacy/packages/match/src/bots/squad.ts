import type { Team } from '../../../viewer/src/net/protocol';
import type { Point } from './navigation';
import type { CoverPosition } from './positions';

/** Authored input coordination. Geometry/perception and all combat results remain supplied by the host. */
export interface SquadMember {
  id: number; team: Team; alive: boolean; at: Point; hasContact: boolean; contact: number | null; target: number | null;
  rounds: number; reloading: boolean; pressure: boolean; laneClear: boolean; ready: boolean;
  cover: CoverPosition | null; coverValid: boolean; pathValid: boolean; atCover: boolean;
}
export interface SquadStatus {
  role: 'independent' | 'mover' | 'supporter'; partner: number | null; reason: string;
  reservation: CoverPosition | null; until: number | null;
}
interface Lease { mover: number; supporter: number; contact: number; until: number }
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. Controller preferences, independently authored; no recovered SOCOM/F.E.A.R. values. */
const SQUAD_ADAPTATION = { members: 16, spacing: 24, floorSeparation: 12, radius: 260, leaseTicks: 180 };
const copy = (c: CoverPosition): CoverPosition => ({ ...c, hide: [...c.hide], peek: [...c.peek], threat: [...c.threat] });
const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const same = (a: CoverPosition, b: CoverPosition): boolean => distance(a.hide, b.hide) < 0.01 && distance(a.peek, b.peek) < 0.01;

/** A seat owns at most one cover slot and one role. No waiting dependency can form a cycle. */
export class SquadCoordinator {
  private round: string | null = null;
  private members = new Map<number, SquadMember>();
  private readonly reservations = new Map<number, CoverPosition>();
  private readonly leases = new Map<number, Lease>();
  private readonly reasons = new Map<number, string>();

  private lease(id: number): Lease | undefined {
    return [...this.leases.values()].find((l) => l.mover === id || l.supporter === id);
  }
  private stop(lease: Lease, reason: string): void {
    this.leases.delete(lease.mover);
    this.reasons.set(lease.mover, reason); this.reasons.set(lease.supporter, reason);
  }
  cancelSupport(id: number, reason: string): void { const lease = this.lease(id); if (lease) this.stop(lease, reason); }
  release(id: number, reason: string): void {
    this.cancelSupport(id, reason); this.reservations.delete(id); this.reasons.set(id, reason);
  }
  reset(reason = 'round-reset'): void {
    for (const id of this.members.keys()) this.reasons.set(id, reason);
    this.reservations.clear(); this.leases.clear();
  }
  private supportFailure(member: SquadMember, contact: number): string | null {
    if (!member.alive) return 'dead';
    if (member.target !== contact) return 'lost-sight';
    if (member.rounds <= 0) return 'empty-magazine';
    if (member.reloading) return 'reloading';
    if (member.pressure) return 'pressure';
    if (!member.laneClear) return 'lane-blocked';
    if (!member.ready) return 'not-ready';
    return null;
  }
  sync(round: string, tick: number, units: readonly SquadMember[]): void {
    if (round !== this.round) { this.reset(); this.round = round; }
    const next = new Map(units.slice(0, SQUAD_ADAPTATION.members).map((u) => [u.id, u]));
    for (const id of this.members.keys()) if (!next.has(id)) this.release(id, 'disconnected');
    this.members = next;
    for (const [id, reserved] of this.reservations) {
      const u = this.members.get(id);
      const reason = !u ? 'disconnected' : !u.alive ? 'dead' : !u.hasContact ? 'contact-lost'
        : !u.cover ? 'cover-finished' : !same(u.cover, reserved) || !u.coverValid ? 'cover-invalid'
          : !u.pathValid ? 'path-invalid' : null;
      if (reason) this.release(id, reason);
    }
    for (const lease of this.leases.values()) {
      const mover = this.members.get(lease.mover), supporter = this.members.get(lease.supporter);
      const reserved = this.reservations.get(lease.mover);
      const reason = !mover || !supporter ? 'disconnected' : !mover.alive ? 'dead'
        : mover.team !== supporter.team ? 'team-changed'
          : mover.contact !== lease.contact || supporter.contact !== lease.contact ? 'contact-lost'
          : this.supportFailure(supporter, lease.contact)
            ?? (!reserved ? 'cover-finished' : mover.atCover ? 'arrived'
              : tick >= lease.until ? 'expired' : null);
      if (reason) this.stop(lease, reason);
    }
  }
  reservedPoints(except?: number): Point[] {
    const team = except === undefined ? undefined : this.members.get(except)?.team;
    return [...this.reservations].filter(([id]) => id !== except && (team === undefined || this.members.get(id)?.team === team))
      .flatMap(([, c]) => [[...c.hide] as Point, [...c.peek] as Point]);
  }
  reserve(id: number, candidate: CoverPosition): boolean {
    const unit = this.members.get(id), role = this.lease(id);
    if (!unit?.alive || !unit.hasContact || !unit.coverValid || !unit.pathValid || (role && role.supporter === id)) return false;
    if (![candidate.hide, candidate.peek, candidate.threat].every((p) => p.every(Number.isFinite))) return false;
    const conflict = this.reservedPoints(id).some((p) => [candidate.hide, candidate.peek].some((q) =>
      Math.abs(p[1] - q[1]) < SQUAD_ADAPTATION.floorSeparation && Math.hypot(p[0] - q[0], p[2] - q[2]) < SQUAD_ADAPTATION.spacing));
    if (conflict) { this.reasons.set(id, 'cover-conflict'); return false; }
    const old = this.reservations.get(id);
    if (old && !same(old, candidate)) this.cancelSupport(id, 'cover-changed');
    this.reservations.set(id, copy(candidate));
    if (!old) this.reasons.set(id, 'reserved');
    return true;
  }
  requestSupport(id: number, tick: number): number | null {
    const mover = this.members.get(id), reserved = this.reservations.get(id), existing = this.lease(id);
    if (existing) return existing.mover === id ? existing.supporter : null;
    if (!mover?.alive || !mover.coverValid || !mover.pathValid || mover.target === null || mover.target !== mover.contact || !reserved
      || mover.atCover) return null;
    const supporter = [...this.members.values()].sort((a, b) => a.id - b.id).find((u) => u.id !== id
      && u.team === mover.team && u.contact === mover.contact && !this.lease(u.id)
      && !this.supportFailure(u, mover.target!) && distance(u.at, mover.at) < SQUAD_ADAPTATION.radius);
    if (!supporter) { this.reasons.set(id, 'no-supporter'); return null; }
    this.leases.set(id, { mover: id, supporter: supporter.id, contact: mover.target, until: tick + SQUAD_ADAPTATION.leaseTicks });
    this.reasons.set(id, 'advance-covered'); this.reasons.set(supporter.id, 'cover-partner');
    return supporter.id;
  }
  status(id: number): SquadStatus {
    const lease = this.lease(id), reservation = this.reservations.get(id);
    return { role: !lease ? 'independent' : lease.mover === id ? 'mover' : 'supporter',
      partner: !lease ? null : lease.mover === id ? lease.supporter : lease.mover,
      reason: this.reasons.get(id) ?? 'unassigned', reservation: reservation ? copy(reservation) : null, until: lease?.until ?? null };
  }
}
