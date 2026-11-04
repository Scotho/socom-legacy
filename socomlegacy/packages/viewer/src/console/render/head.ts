import { esc, ico, type IconName } from '../icons';

/**
 * A pushed page's head. Browser adaptation: the parent link uses the quiet eyebrow treatment; Circle remains in the
 * bottom legend.
 *
 * LR-1 (the launcher redesign plan, LR.R8): drawn as the artifact's panel head (`S2-Launcher-v2.dc.html`: the
 * breadcrumb, the title, the description). The crumb's first step is LP.R14's one return control -- the chevron, the
 * parent's icon and its name -- and the page's own name follows after a slash (drawn, not read: the h1 says it). A top
 * page keeps its eyebrow as its crumb. `level` (default 1, the page's h1) is 2 for a panel's head beside the page's own h1
 * (Home's check panel, review-lr-2 F4). `desc`, the page's one line of explanation, is drawn under the title when given.
 */
export function screenHead(eyebrowHtml: string, title: string, back: string | null, tail = '', desc = '', level: 1 | 2 = 1): string {
  const context: IconName | null = back === 'Settings' || back === 'Controller' ? 'cog' : back === 'Profile' || back === 'Profiles' || back === 'Persona' ? 'user' : back?.includes('loadout') || back === 'Loadouts' ? 'armory' : back === 'Play online' || back === 'Browse rooms' || back === 'Briefing room' ? 'globe' : null;
  const parent = back === null ? `<div class="cx-eyebrow">${eyebrowHtml}</div>`
    : `<button type="button" class="cx-back" data-act="press" data-b="circle" data-fk="back" aria-label="${esc(`Back to ${back}`)}">${ico('left', 'cx-back__chevron')}${context ? ico(context) : ''}<span class="cx-back__label">${esc(back)}</span></button><span class="cx-crumb__here" aria-hidden="true"> / ${esc(title)}</span>`;
  const about = desc ? `<p class="cx-screenhead__desc">${esc(desc)}</p>` : '';
  return `<div class="cx-screenhead"><div class="cx-screenhead__id"><div class="cx-screenhead__text"><div class="cx-crumb">${parent}</div><h${level} class="cx-title">${esc(title)}</h${level}>${about}</div></div>${tail}</div>`;
}
