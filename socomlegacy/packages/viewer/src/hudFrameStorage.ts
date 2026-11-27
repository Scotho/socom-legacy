import type { HudElement, HudQuad } from './hud';

/**
 * Browser draw-storage adaptation: one HUD owns its reusable records. The 2048
 * record limit bounds retained cache storage, never the number of quads drawn.
 * Larger frames use ordinary temporary records. Results are borrowed until reset;
 * the public layout helpers without this storage still return independent values.
 */
export class HudFrameStorage {
  private readonly records: HudQuad[] = [];
  private used = 0;
  readonly scratchColour: HudQuad['rgba'] = [0, 0, 0, 0];

  constructor(private readonly capacity = 2048) {
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError('Invalid HUD storage capacity');
  }

  reset(): void { this.used = 0; }
  clear(): void { this.records.length = 0; this.used = 0; }

  write(element: HudElement, texture: string, x: number, y: number, w: number, h: number,
    rgba: HudQuad['rgba'], turn: number, u0: number, v0: number, u1: number, v1: number, layer: number): HudQuad {
    const index = this.used++;
    let q = this.records[index];
    if (!q) {
      q = { element, texture, x, y, w, h, turn, u0, v0, u1, v1, rgba: [0, 0, 0, 0] };
      if (index < this.capacity) this.records.push(q);
    }
    q.element = element; q.texture = texture; q.x = x; q.y = y; q.w = w; q.h = h;
    q.turn = turn; q.u0 = u0; q.v0 = v0; q.u1 = u1; q.v1 = v1;
    q.rgba[0] = rgba[0]; q.rgba[1] = rgba[1]; q.rgba[2] = rgba[2]; q.rgba[3] = rgba[3];
    if (layer) q.layer = layer; else delete q.layer;
    delete q.alphaRight;
    return q;
  }
}
