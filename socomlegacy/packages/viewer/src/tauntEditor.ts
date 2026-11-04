import type { AssetSource } from '@s2u/archive';
import { readSoftKeyboards, usbKeyHandled, type UsbKey, type PadButtonName } from '@s2u/ui';
import type { PadButton } from './gamepad';
import { FrontEndSession, readFrontEndDisc } from './frontEnd';
import { pageUiTextures } from './frontEndAssets';
import { GameAudio, WebAudioOut } from './audio';
import { pageUiSounds } from './uiSoundHost';
import { HID_BY_CODE, readUiParams } from './softKeyboardKeys';
import { TAUNT_VARS } from './tauntSettings';

/**
 * `/testroom`'s development-only SETUP TAUNTS (`?devmode`, never in a release build: `./matchTaunts`
 * `mountTauntDevEditor`; web research 301 §6): the disc's own dialog (`dlgSetTaunts.rdr`) and soft keyboard in a front-end
 * session of their own, over the page's card. The player's way in is ONLINE > OPTIONS > SETUP TAUNTS, whose RETURN saves
 * through `save_and_leave`; this adapter, which has no ONLINE OPTIONS around it, writes the card itself when its RETURN
 * closes it (`PersonaCard.save`, the same `CUIVarManager` module). Its temporary return target only closes this
 * adapter, never changes the running match. A playtest instrument, a browser adaptation.
 */
export class TauntEditor {
  session: FrontEndSession | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private down = new Set<PadButtonName>();
  private detach: (() => void) | null = null;
  private audio: GameAudio | null = null;
  private output: WebAudioOut | null = null;
  private generation = 0;
  private keys: UsbKey[] = [];
  private opened = false;
  status = '';
  isOpen(): boolean { return this.opened; }
  taking(): boolean { const shell = this.session?.machine.shell(); return !!shell && shell.switchState < 0 && shell.inputTimer <= 0; }
  audioStats(): ReturnType<GameAudio['stats']> | null { return this.audio?.stats() ?? null; }
  async open(source: AssetSource, defaults: readonly string[]): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    const generation = ++this.generation;
    this.status = 'Reading SETUP TAUNTS from your ISO';
    // Preserve the trusted Setup-button gesture before any disc read yields. Gamepad polling is not activation.
    const output = this.output ??= new WebAudioOut(); output.unlock();
    const audio = this.audio ??= new GameAudio(output);
    try {
      const disc = await readFrontEndDisc(source);
      if (generation !== this.generation) return;
      const textures = pageUiTextures(source, ['UIMP', 'UISK']);
      const sounds = await pageUiSounds(source, {
        setData: data => { if (generation === this.generation) audio.setData(data); },
        play: (...args) => generation === this.generation && audio.play(...args),
        stopMusic: () => { if (generation === this.generation) audio.stopMusic(); },
        unlockOn: () => {}, // Output was unlocked synchronously above; UI has no ambience/reverb startup queue.
      }, new EventTarget());
      const missing = await textures.ready;
      if (generation !== this.generation) return;
      this.audio = audio;
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 448;
      canvas.dataset.tauntEditor = 'true';
      canvas.className = 'is-taunt-editor';
      document.body.append(canvas); this.canvas = canvas;
      const session = this.session = new FrontEndSession({ disc, textures: textures.textures, sounds: sounds.cues ?? undefined, loader: false,
        // The card's five are restored by the session itself; the rest take the disc's defaults, at 3 as `dlgNetLogin` adds them.
        startDialog: 'dlgSetTaunts.rdr', initializeVars: vars => { TAUNT_VARS.forEach((name, i) => vars.add(name, { type: 'string', value: defaults[i] ?? '' }, 3)); },
      });
      session.machine.queue.pushHistory('browser-taunt-editor-return');
      session.input.source = { read: () => ({ down: this.down, stickX: 0, stickY: 0 }) };
      const params = await readUiParams(source);
      if (generation !== this.generation) return;
      session.keyboard.load(readSoftKeyboards(params));
      session.keyboard.usbKey = () => this.keys.shift() ?? null;
      this.status = [...missing, ...sounds.missing].join('; ');
    } catch (e) { if (generation === this.generation) { this.status = `SETUP TAUNTS unavailable: ${String(e)}`; this.close(); } }
  }
  /** Only text entry uses the physical keyboard; the controller operates the surrounding dialog. */
  key(e: KeyboardEvent): void {
    if (!this.session?.keyboard.keyboard.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const hid = HID_BY_CODE[e.code];
    if (hid !== undefined && usbKeyHandled(hid)) this.keys.push({ hid, shift: e.shiftKey, capsLamp: e.getModifierState('CapsLock') });
  }
  frame(now: number, held: ReadonlySet<PadButton>): boolean {
    if (!this.opened) return false;
    this.audio?.pump();
    this.down = new Set([...held].filter(n => n !== 'L3' && n !== 'R3').map(n => (/^[LR][12]$/.test(n) ? `TRIGGER_${n}` : n.toUpperCase()) as PadButtonName));
    const s = this.session;
    if (s) {
      const ctx = this.canvas?.getContext('2d');
      if (s.advance(now) > 0 && ctx) s.render(ctx);
      if (s.machine.shell()?.currentName === 'browser-taunt-editor-return') { this.save(); this.close(); }
    }
    return true;
  }
  /** The card written as the session holds it: its personas and its `CUIVarManager` module (`./personaHost` `contents`). */
  private save(): void {
    const persona = this.session?.persona;
    if (!persona?.card) return;
    persona.config.contents();
    const result = persona.card.save();
    if (result < 0) this.status = `SETUP TAUNTS: the card would not save (${result})`;
    this.saved?.();
  }
  /** Told after each save (`/testroom` re-reads the card's five). */
  saved: (() => void) | null = null;
  close(): void {
    this.opened = false; this.generation++; this.down.clear(); this.detach?.(); this.detach = null;
    this.keys.length = 0;
    this.session?.close(); this.session = null; this.canvas?.remove(); this.canvas = null;
    this.audio?.setData(null);
  }
}
