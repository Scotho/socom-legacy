import { drawWeaponSelect, type WeaponSelectItem, type Rgb } from './weaponSelect';
import { ROOT_HELP, ROOTS, type TauntMenu } from './tauntMenu';
import { plainBotText, sliceBotText } from './botPresentation';
/** ISO ELF 230870/231310/3ff490: native 640x448 geometry. Research301.
 * Column-opening interpolation is still unmeasured; this draws the verified fully open positions. */
export function tauntLayout(state: ReturnType<TauntMenu['state']>, custom: readonly string[], now: number): WeaponSelectItem[] {
  if (!state.open) return [];
  const items: WeaponSelectItem[] = [];
  const normal: Rgb = [128, 128, 128];
  const helpColour: Rgb = [160, 250, 250];
  const triangle = 1 - Math.abs((now * 8) % 2 - 1);
  const active: Rgb = [80 + 85 * triangle, 120 + 130 * triangle, 120 + 130 * triangle];
  const panel = (x: number, y: number, w: number, h: number, rgb: Rgb, help = false): void => {
    items.push({ kind: 'sprite', part: 'chatPanel', texture: 'tcm.tif', x, y, w: w * .6, h, turn: 0, flipU: false, flipV: false, rgb, alpha: 100, src: help ? [.7, 0, .3, 1] : [1, 0, 0, 1] });
    items.push({ kind: 'sprite', part: 'chatPanel', texture: 'tcm.tif', x: x + w * .6, y, w: w * .4, h, turn: 0, flipU: false, flipV: false, rgb, alpha: 100, alphaRight: 0, src: [.7, 0, .3, 1] });
  };
  const text = (value: string, x: number, y: number, scale: number): void => { items.push({ kind: 'text', part: 'chatText', text: value, x, y, scale, align: 'left', rgb: [128, 128, 128], alpha: 80 }); };
  const row = (label: string, column: number, index: number, selected: boolean, arrow = false): void => {
    const x = 20 + 184 * column, y = 55 + 20 * index;
    panel(x, y, 164, 22, selected ? active : normal); text(label, x + 10, y + 17, .9);
    if (arrow) items.push({ kind: 'sprite', part: 'chatArrow', texture: 'tcmarrow.tif', x: x + 168, y: y + 4, w: 8, h: 14,
      turn: 0, flipU: false, flipV: false, rgb: normal, alpha: 100 });
  };
  // Literal captions in the ISO's game ELF (00232bc0), not screenshot artwork; the drawn roots only, in the tree's order
  // (SVC-23f: SPECTATORS while a spectator is present, a disabled node not drawn, `FUN_00230870` D:L82151).
  state.roots.forEach((id, i) => row(ROOTS[id]!, 0, i, state.root === id, true));
  if (state.depth && state.root===1) ['CHARACTER TAUNT', ...custom.map(t => t.length >= 32 ? `${t.slice(0, 30)}-` : t)].forEach((label, i) => row(label, 1, i, state.row === i));
  if(state.depth && state.root!==1) state.columns.forEach((c,j)=>c.rows.forEach((r,i)=>row(plainBotText(r.label).length>=32?`${sliceBotText(r.label,30)}-`:r.label,j+1,i,c.selected===i,r.arrow)));
  panel(20, 20, 600, 27, helpColour, true);
  const help = state.depth ? state.root!==1 ? state.columns.at(-1)?.rows[state.row]?.help??'' : state.row === 0 ? 'Your character will taunt the enemies' : 'Send a custom taunt to your enemies'
    : ROOT_HELP[state.root]!;
  text(help, 30, 41, 1);
  return items;
}
export function drawTaunts(frame: { width: number; height: number }, state: ReturnType<TauntMenu['state']>, custom: readonly string[], now: number,
  sizes: Record<string, { width: number; height: number }>): ReturnType<typeof drawWeaponSelect> {
  const drawn = drawWeaponSelect(frame, { items: tauntLayout(state, custom, now) }, sizes);
  for (const q of drawn.quads) q.element = 'chatMenu';
  return drawn;
}
