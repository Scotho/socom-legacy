/**
 * Shot tests and the hit markers (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's combat feedback, drawn with code.
 */
import { BufferAttribute, BufferGeometry, Points, PointsMaterial, type Scene } from 'three';

export type CombatPoint = readonly [number, number, number];

function sphereEntry(from: CombatPoint, to: CombatPoint, center: CombatPoint, radius: number): number | null {
  const d: CombatPoint = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const m: CombatPoint = [from[0] - center[0], from[1] - center[1], from[2] - center[2]];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (a < 1e-9) return null;
  const b = m[0] * d[0] + m[1] * d[1] + m[2] * d[2];
  const c = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

export function zombieShotHit(from: CombatPoint, to: CombatPoint, feet: CombatPoint, head: CombatPoint): { t: number; headshot: boolean; point: [number, number, number] } | null {
  const h = sphereEntry(from, to, head, 2.3);
  const body = [5, 10, 14].map((y) => sphereEntry(from, to, [feet[0], feet[1] + y, feet[2]], 3.5)).filter((t): t is number => t !== null);
  const b = body.length ? Math.min(...body) : null;
  if (h === null && b === null) return null;
  const headshot = h !== null && (b === null || h <= b);
  const t = headshot ? h! : b!;
  return { t, headshot, point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t] };
}

/** Screen bearing: 0 in front, +90 to the right, 180 behind, -90 to the left. */
export function damageBearing(player: CombatPoint, source: CombatPoint, yaw: number): number {
  const facing = Math.atan2(-(source[0] - player[0]), -(source[2] - player[2])) * 180 / Math.PI;
  return ((yaw - facing + 540) % 360) - 180;
}

/** A bounded blood spray and the hit marker. No textures and no per-hit GPU allocation. */
export class ZombieCombatFeedback {
  private root = document.createElement('div');
  private hit = document.createElement('div');
  private arrows: HTMLElement[] = [];
  private hits = 0;
  private heads = 0;
  private hitTime = 0;
  private hitKind = '';
  private damage: Array<{ source: CombatPoint; life: number }> = [];
  private positions = new Float32Array(192 * 3);
  private velocities = new Float32Array(192 * 3);
  private lives = new Float32Array(192);
  private cursor = 0;
  private geometry = new BufferGeometry();
  private material = new PointsMaterial({ color: 0xa81616, size: .85, sizeAttenuation: true, depthWrite: false });
  private blood: Points;

  constructor(scene: Scene) {
    this.positions.fill(1e8);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.blood = new Points(this.geometry, this.material);
    this.blood.frustumCulled = false;
    this.blood.visible = false;
    scene.add(this.blood);
    if (!document.getElementById('zombies-combat-style')) {
      const style = document.createElement('style');
      style.id = 'zombies-combat-style';
      style.textContent = `#zombies-combat{position:fixed;inset:0;pointer-events:none;z-index:35}.z-hit{position:absolute;left:50%;top:50%;width:34px;height:34px;transform:translate(-50%,-50%);color:white;opacity:0}.z-hit i{position:absolute;left:15px;top:0;width:3px;height:9px;background:currentColor;transform-origin:1.5px 17px}.z-hit span{position:absolute;top:44px;left:50%;transform:translateX(-50%);font:700 13px system-ui;letter-spacing:.12em;white-space:nowrap;text-shadow:0 2px 4px black}.z-damage{position:absolute;left:50%;top:50%;width:260px;height:260px;margin:-130px;border-radius:50%;border:7px solid transparent;border-top-color:#ed3737;box-sizing:border-box;clip-path:polygon(20% 0,80% 0,50% 50%);filter:drop-shadow(0 0 5px #600);opacity:0}`;
      document.head.append(style);
    }
    this.root.id = 'zombies-combat';
    this.hit.className = 'z-hit';
    this.hit.innerHTML = [45, 135, 225, 315].map((n) => `<i style="transform:rotate(${n}deg)"></i>`).join('') + '<span></span>';
    this.root.append(this.hit);
    for (let i = 0; i < 4; i++) {
      const a = document.createElement('div');
      a.className = 'z-damage';
      this.root.append(a);
      this.arrows.push(a);
    }
    document.body.append(this.root);
  }

  impact(point: CombatPoint, direction: CombatPoint, headshot: boolean, killed: boolean): void {
    this.hits++;
    if (headshot) this.heads++;
    this.hitTime = headshot ? .5 : .25;
    this.hitKind = headshot ? 'HEADSHOT' : killed ? 'ELIMINATED' : '';
    this.hit.style.color = headshot ? '#ffd780' : killed ? '#f05a4b' : '#fff';
    this.hit.querySelector('span')!.textContent = this.hitKind;
    const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    for (let j = 0; j < (headshot ? 22 : 13); j++) {
      const i = this.cursor++ % 192;
      this.lives[i] = .35 + Math.random() * .3;
      for (let k = 0; k < 3; k++) {
        this.positions[i * 3 + k] = point[k]!;
        this.velocities[i * 3 + k] = direction[k]! / length * 10 + (Math.random() - .5) * 14 + (k === 1 ? 5 : 0);
      }
    }
    this.blood.visible = true;
  }

  hurt(source: CombatPoint): void {
    this.damage.push({ source: [source[0], source[1], source[2]], life: 1.1 });
    this.damage = this.damage.slice(-4);
  }

  frame(dt: number, player: CombatPoint, yaw: number): void {
    this.hitTime = Math.max(0, this.hitTime - dt);
    this.hit.style.opacity = String(Math.min(1, this.hitTime * 8));
    this.damage = this.damage.map((d) => ({ ...d, life: d.life - dt })).filter((d) => d.life > 0);
    this.arrows.forEach((a, i) => {
      const d = this.damage[i];
      a.style.opacity = d ? String(Math.min(1, d.life * 2)) : '0';
      if (d) a.style.transform = `rotate(${damageBearing(player, d.source, yaw)}deg)`;
    });
    let count = 0;
    for (let i = 0; i < 192; i++) {
      if (this.lives[i]! <= 0) continue;
      this.lives[i] = this.lives[i]! - dt;
      if (this.lives[i]! <= 0) { this.positions.fill(1e8, i * 3, i * 3 + 3); continue; }
      count++;
      this.velocities[i * 3 + 1] = this.velocities[i * 3 + 1]! - 35 * dt;
      for (let k = 0; k < 3; k++) this.positions[i * 3 + k] = this.positions[i * 3 + k]! + this.velocities[i * 3 + k]! * dt;
    }
    const position = this.geometry.getAttribute('position');
    position.needsUpdate = true;
    this.blood.visible = count > 0;
  }

  reset(): void {
    this.hitTime = this.hits = this.heads = 0;
    this.hitKind = '';
    this.damage = [];
    this.lives.fill(0);
    this.positions.fill(1e8);
    this.blood.visible = false;
    this.hit.style.opacity = '0';
    this.arrows.forEach((a) => { a.style.opacity = '0'; });
  }

  stats(): { hits: number; headshots: number; hitKind: string; hitVisible: boolean; blood: number; damage: Array<{ source: CombatPoint; life: number }> } {
    return {
      hits: this.hits, headshots: this.heads, hitKind: this.hitKind, hitVisible: this.hitTime > 0,
      blood: this.lives.filter((n) => n > 0).length, damage: this.damage.map((d) => ({ ...d })),
    };
  }
}
