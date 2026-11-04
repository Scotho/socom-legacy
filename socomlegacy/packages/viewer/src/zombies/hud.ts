/**
 * Round counter, countdown and health for the test-room zombies (`TEST_ROOM_ZOMBIES_ADAPTATION`).
 * A missing round cue is silent. This HUD does not invent a tone.
 */
export function waveTallies(wave: number): string {
  if (wave > 20) return `<b>${wave}</b>`;
  return Array.from({ length: Math.ceil(wave / 5) }, (_, g) => `<span class="tally">${Array.from({ length: Math.min(5, wave - g * 5) }, (_, i) => `<i class="${i === 4 ? 'slash' : ''}"></i>`).join('')}</span>`).join('');
}

export class ZombieHud {
  private root = document.createElement('div');
  private round: HTMLElement;
  private healthEl: HTMLElement;
  private killsEl: HTMLElement;
  private delta: HTMLElement;
  private banner: HTMLElement;
  private health = 100;
  private kills = 0;
  private flash = 0;
  private bannerTime = 0;
  private cues: string[] = [];
  private playCue: ((name: string) => void) | null = null;

  constructor() {
    if (!document.getElementById('zombies-hud-style')) {
      const style = document.createElement('style');
      style.id = 'zombies-hud-style';
      style.textContent = `#zombies-hud{pointer-events:none;position:fixed;inset:0;z-index:24;color:#eee;text-shadow:0 2px 5px #000;font-family:system-ui}#zombies-hud[hidden]{display:none}.z-round{position:absolute;top:30px;left:50%;transform:translateX(-50%);display:flex;gap:12px;color:#b32e24;align-items:center}.tally{position:relative;display:flex;gap:7px;padding:0 5px}.tally i{display:block;background:#b32e24;width:5px;height:42px;transform:rotate(8deg);box-shadow:1px 1px 3px #000;clip-path:polygon(15% 0,100% 3%,80% 100%,0 94%)}.tally .slash{position:absolute;left:20px;top:-2px;height:48px;transform:rotate(64deg);width:6px}.z-round b{font-size:46px}.z-status{position:absolute;left:28px;bottom:24vh;border-left:4px solid #9f3025;background:linear-gradient(90deg,#100e0ee8,transparent);padding:8px 48px 8px 16px}.z-status small{display:block;color:#bcb6aa;font-size:11px;letter-spacing:.16em}.z-status strong,.z-status .z-kills{font-size:34px;font-variant-numeric:tabular-nums}.z-status em{color:#edc678;font-size:22px;margin-left:18px;font-style:normal}.z-banner small{display:block;font-size:16px;line-height:1.8;letter-spacing:.08em;color:#f1d79e}.z-banner{position:absolute;top:22%;width:100%;text-align:center;font-size:28px;letter-spacing:.2em;color:#d9c7ae}body.zombie-match #panel,body.zombie-match nav{display:none!important}.z-countdown{position:absolute;top:35%;width:100%;text-align:center;letter-spacing:.12em;font-size:20px;line-height:1.4}.z-countdown strong{display:block;font-size:84px;line-height:1.1;margin-top:12px;color:#e9d9bc}.z-countdown[hidden]{display:none}`;
      document.head.append(style);
    }
    this.root.id = 'zombies-hud';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="z-countdown" role="status" aria-live="polite" hidden></div><div class="z-round"></div><div class="z-banner"></div><div class="z-status"><small>HEALTH</small><strong>100</strong><em></em><small>KILLS</small><b class="z-kills">0</b></div>';
    document.body.append(this.root);
    this.round = this.root.querySelector('.z-round')!;
    this.healthEl = this.root.querySelector('strong')!;
    this.delta = this.root.querySelector('em')!;
    this.killsEl = this.root.querySelector('.z-kills')!;
    this.banner = this.root.querySelector('.z-banner')!;
  }

  /** Plays a cue the pack provided. A missing cue stays silent. */
  setCues(play: (name: string) => void): void { this.playCue = play; }

  countdown(seconds: number | null): void {
    this.root.hidden = false;
    const el = this.root.querySelector('.z-countdown') as HTMLElement;
    el.hidden = seconds === null;
    el.innerHTML = seconds === null ? '' : seconds < 0 ? 'PREPARING CROSSROADS…' : `SURVIVE CROSSROADS<strong>${Math.ceil(seconds)}</strong>`;
  }

  restock(wave: number, seconds: number): void {
    const text = `ROUND ${wave} SURVIVED<br><small>NEXT ROUND IN ${Math.ceil(seconds)}s</small>`;
    if (this.banner.innerHTML !== text) this.banner.innerHTML = text;
    this.bannerTime = 2;
  }

  notice(title: string, detail: string): void {
    this.root.hidden = false;
    this.banner.replaceChildren();
    this.banner.append(document.createTextNode(title));
    const small = document.createElement('small');
    small.textContent = detail;
    this.banner.append(small);
    this.bannerTime = 4;
  }

  roundCue(wave: number, end = false): void {
    this.root.hidden = false;
    this.round.innerHTML = waveTallies(wave);
    this.round.setAttribute('aria-label', `Wave ${wave}`);
    this.banner.textContent = end ? `ROUND ${wave} SURVIVED` : `ROUND ${wave}`;
    this.bannerTime = 3;
    const cue = end ? 'round-end' : 'round-start';
    this.cues.push(cue);
    if (this.cues.length > 30) this.cues.shift();
    this.playCue?.(cue);
  }

  frame(health: number, kills: number, dt: number): void {
    if (health !== this.health) {
      const d = health - this.health;
      this.delta.textContent = (d > 0 ? '+' : '') + d;
      this.flash = 1.2;
      this.health = health;
    }
    this.healthEl.textContent = String(Math.round(health));
    this.kills = kills;
    this.killsEl.textContent = String(kills);
    this.flash = Math.max(0, this.flash - dt);
    this.delta.style.opacity = String(Math.min(1, this.flash * 2));
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.banner.style.opacity = String(Math.min(1, this.bannerTime));
  }

  reset(): void {
    this.countdown(null);
    this.root.hidden = true;
    this.round.innerHTML = '';
    this.health = 100;
    this.kills = 0;
    this.flash = this.bannerTime = 0;
    this.delta.textContent = '';
    this.healthEl.textContent = '100';
    this.killsEl.textContent = '0';
    this.banner.textContent = '';
    this.cues = [];
  }

  stats(): { visible: boolean; health: number; kills: number; cues: string[] } {
    return { visible: !this.root.hidden, health: this.health, kills: this.kills, cues: [...this.cues] };
  }
}
