/**
 * The overrun overlay (`TEST_ROOM_ZOMBIES_ADAPTATION`). The collapse is Phoenix's camera move.
 * From the test room the walk camera stays in charge (`bodyCamera`); this class does not call the game's death camera.
 */
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

export interface ZombieDeathResult {
  wave: number;
  kills: number;
  survived: number;
  seconds: number;
}

export class ZombieDeath {
  onRestart: (() => void) | null = null;
  private elapsed = -1;
  private origin = new Vector3();
  private facing = new Quaternion();
  private floor = 0;
  private near = 4;
  private bodyCamera = false;
  private overlay: HTMLDivElement;

  constructor(private camera: PerspectiveCamera) {
    if (!document.getElementById('zombies-death-style')) {
      const style = document.createElement('style');
      style.id = 'zombies-death-style';
      style.textContent = `#zombies-death{position:fixed;inset:0;z-index:10000;pointer-events:none;display:grid;place-items:center;background:radial-gradient(ellipse,transparent 15%,rgba(65,0,0,.7) 100%);color:#eee;text-align:center;font-family:system-ui,sans-serif}#zombies-death[hidden]{display:none}#zombies-death h1{font-size:clamp(36px,5vw,64px);letter-spacing:.16em;color:#a42d23;margin:0 0 20px;text-shadow:0 3px 18px #000}#zombies-death p{font-size:20px;text-shadow:0 2px 8px #000}#zombies-death small{color:#ccc;font-size:16px}#zombies-death .z-results{background:#111315dd;border:1px solid #645044;padding:32px;border-radius:8px;max-width:640px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;pointer-events:auto}#zombies-death dl{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;text-align:left}#zombies-death dt{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#bcb6aa}#zombies-death dd{margin:4px 0;font-size:28px}#zombies-death button{pointer-events:auto;cursor:pointer;background:#a42d23;border:1px solid #d36c52;color:white;padding:14px 32px;font:700 18px system-ui;border-radius:4px}`;
      document.head.append(style);
    }
    this.overlay = document.createElement('div');
    this.overlay.id = 'zombies-death';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'status');
    document.body.append(this.overlay);
  }

  get active(): boolean { return this.elapsed >= 0; }

  start(feet: readonly number[], result: ZombieDeathResult, bodyCamera = false): void {
    if (this.active) return;
    this.elapsed = 0;
    this.bodyCamera = bodyCamera;
    this.near = this.camera.near;
    this.floor = feet[1] ?? 0;
    this.origin.set(feet[0] ?? 0, this.floor + 17, feet[2] ?? 0);
    this.facing.copy(this.camera.quaternion);
    const seconds = Math.floor(result.seconds), time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const survived = result.survived;
    this.overlay.innerHTML = `<div class="z-results"><h1>YOU DIED</h1><p>Crossroads · Reached round ${result.wave}</p><dl><div><dt>Rounds survived</dt><dd>${survived}</dd></div><div><dt>Kills</dt><dd>${result.kills}</dd></div><div><dt>Time survived</dt><dd>${time}</dd></div></dl><button id="zombies-restart" disabled>Play again</button><p><small>F6 to restart · F7 to return to training</small></p></div>`;
    const restart = this.overlay.querySelector('button')!;
    restart.addEventListener('click', () => { restart.disabled = true; this.onRestart?.(); });
    this.overlay.hidden = false;
    this.frame(0);
  }

  frame(dt: number): void {
    if (!this.active) return;
    this.elapsed += Math.max(0, Math.min(dt, .1));
    const t = Math.min(1, this.elapsed / 1.65), fall = t * t * (3 - 2 * t);
    if (!this.bodyCamera) {
      this.camera.position.copy(this.origin);
      this.camera.position.y = this.origin.y + (this.floor + 2.8 - this.origin.y) * fall;
      this.camera.quaternion.copy(this.facing);
      this.camera.rotateX(-.22 * fall + Math.sin(t * Math.PI * 4) * .055 * (1 - t));
      this.camera.rotateZ(-1.15 * fall);
      this.camera.near = .45;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
    }
    const restart = this.overlay.querySelector('button');
    if (restart) restart.disabled = this.elapsed < 3;
    this.overlay.style.backdropFilter = `grayscale(${fall}) brightness(${1 - .42 * fall})`;
    this.overlay.style.opacity = String(Math.min(1, .45 + this.elapsed));
    const card = this.overlay.firstElementChild as HTMLElement | null;
    if (card) card.style.opacity = String(Math.max(0, Math.min(1, (this.elapsed - (this.bodyCamera ? 3 : 1.35)) / .55)));
  }

  reset(): void {
    if (this.active) { this.camera.near = this.near; this.camera.updateProjectionMatrix(); }
    this.elapsed = -1;
    this.overlay.hidden = true;
  }

  stats(): { active: boolean; elapsed: number; settled: boolean; height: number } {
    return { active: this.active, elapsed: this.elapsed, settled: this.elapsed >= 1.65, height: this.camera.position.y - this.floor };
  }
}
