import { parseRdr, rdrGet, readZarMembers, readZdbMember, Zar, type AssetSource, type RdrNode } from '@s2u/archive';
import { parseCharacterTable, teamCharacter, type CharacterTable } from '@s2u/scene';
import { TAUNT_SLOTS } from './taunts';
export interface VocalTaunt { sound: string; text: string; character: string; label?: string }
export interface TauntData {
  holdSeconds: number; rowHeight: number; width: number; textOffset: number[]; textScale: number; speed: number;
  scroll: string; select: string; complete: string;
  defaults: string[]; captions: Record<string, string>;
  vocals: { seal: (VocalTaunt | null)[][]; terrorist: (VocalTaunt | null)[][] };
  messages?: string[];
  tactical?: TauntData['vocals'];
  /** Automatic multiplayer command 0x26, separate from selectable taunts. Research 304. */
  grenadeWarnings?: TauntData['vocals'];
}
const rows = (v: RdrNode | undefined): RdrNode[][] => Array.isArray(v) ? v.filter(Array.isArray) as RdrNode[][] : [];
export function tauntCaptions(root: RdrNode): Record<string, string> {
  const captions: Record<string, string> = {};
  for (const row of rows((root as RdrNode[])[0])) {
    const id = rdrGet(row, 'ID'), key = rdrGet(row, 'MSG_ID'), text = rdrGet(row, 'LOCALIZED');
    if (typeof text === 'string') { if (typeof id === 'string') captions[id] = text; if (typeof key === 'string') captions[key] = text; }
  }
  return captions;
}
export async function readTauntDefaults(source: AssetSource): Promise<string[]> {
  const bytes = (await readZarMembers(source, 'RUN/READERC.ZAR', ['HudCLOC.rdr'])).get('HudCLOC.rdr');
  if (!bytes) throw Error('RUN/READERC.ZAR :: HudCLOC.rdr missing');
  const captions = tauntCaptions(parseRdr(bytes));
  return Array.from({ length: TAUNT_SLOTS }, (_, i) => { const text = captions[String(60762 + i)]; if (!text) throw Error(`HudCLOC ${60762 + i} missing`); return text; });
}
export async function readMessageDefaults(source: AssetSource): Promise<string[]> {
  const bytes=(await readZarMembers(source,'RUN/READERC.ZAR',['HudCLOC.rdr'])).get('HudCLOC.rdr');
  if(!bytes)throw Error('RUN/READERC.ZAR :: HudCLOC.rdr missing');
  const captions=tauntCaptions(parseRdr(bytes));
  // dlgNetLogin.rdr initializes MPLOCALSOP before Setup Messaging. The latter's older UIMn references are unresolved.
  return Array.from({length:5},(_,i)=>{const text=captions[String(60757+i)];if(!text)throw Error(`HudCLOC ${60757+i} missing`);return text;});
}
export const TACTICAL_KEYS = ['CMD_HOLDFIRE','CMD_FIREATWILL','CMD_CLEARAREA','CMD_MP_COVER_ME','CMD_MP_DEFUSE','CMD_MP_PROTECT','CMD_MP_POINT'] as const;
export function tauntVocals(table: CharacterTable, chartype: RdrNode, orders: RdrNode, caption: (key: string) => string,
  keys: readonly string[] = Array.from({length:7},(_,i)=>`CMD_MP_TAUNT${i+1}`)): TauntData['vocals'] {
  const side = (team: 'navyseals' | 'terrorists'): (VocalTaunt | null)[][] => Array.from({ length: 4 }, (_, i) => {
    const character = teamCharacter(chartype, team, i);
    const own = character ? rdrGet(table.get(character, 'sounds') ?? [], 'multiplayer') : undefined;
    const entries = rows(own ?? rdrGet(orders, 'multiplayer'));
    return keys.map(key => {
      const row = entries.find(r => r[0] === key);
      return character && typeof row?.[1] === 'string' && typeof row[2] === 'string'
        ? { character, sound: row[1], text: caption(row[2]), ...(typeof row[3] === 'string' ? {label:caption(row[3])}: {}) } : null;
    });
  });
  return { seal: side('navyseals'), terrorist: side('terrorists') };
}
/** All strings and character audio mappings are read from the visitor's disc, never an asset baked into the build. */
export async function readTauntData(source: AssetSource, mapPath: string): Promise<TauntData> {
  const members = await readZarMembers(source, 'RUN/READERC.ZAR', ['orders.rdr', 'HudCLOC.rdr', 'character.rdr']);
  const read = (name: string): RdrNode => { const b = members.get(name); if (!b) throw Error(`RUN/READERC.ZAR :: ${name} missing`); return parseRdr(b); };
  const orders = read('orders.rdr'), captions = tauntCaptions(read('HudCLOC.rdr'));
  const z = Zar.parse(await readZdbMember(source, mapPath, 'READERM.ZAR'));
  const key = z.root.children.find(k => k.name.toLowerCase() === 'chartype.rdr');
  if (!key) throw Error(`${mapPath} :: READERM.ZAR/chartype.rdr missing`);
  const numeric = (k: string): number => { const v = Number(rdrGet(orders, k)); if (!Number.isFinite(v)) throw Error(`orders.rdr ${k} missing`); return v; };
  const sound = (k: string): string => { const v = rdrGet(orders, k); if (typeof v !== 'string') throw Error(`orders.rdr ${k} missing`); return v; };
  return {
    holdSeconds: numeric('PTT_circle_down_time'), rowHeight: numeric('height'), width: numeric('width'),
    textOffset: (rdrGet(orders, 'text_offset') as string[]).map(Number), textScale: numeric('text_size'), speed: numeric('order_speed'),
    scroll: sound('scroll_sound'), select: sound('select_sound'), complete: sound('complete_sound'), captions,
    defaults: Array.from({ length: TAUNT_SLOTS }, (_, i) => { const text = captions[String(60762 + i)]; if (!text) throw Error(`HudCLOC ${60762 + i} missing`); return text; }),
    vocals: tauntVocals(parseCharacterTable(read('character.rdr')), parseRdr(z.data(key)), orders, k => captions[k] ?? k),
    messages: await readMessageDefaults(source),
    tactical: tauntVocals(parseCharacterTable(read('character.rdr')), parseRdr(z.data(key)), orders, k => captions[k] ?? k, TACTICAL_KEYS),
    grenadeWarnings: tauntVocals(parseCharacterTable(read('character.rdr')), parseRdr(z.data(key)), orders, k => captions[k] ?? k, ['CMD_MP_GRENADE_THROWN']),
  };
}
