import './panelTips.css';

/**
 * The test room's settings tooltips (TRS-CONDENSE, the owner 2026-11-01: "Seriously reduce the amount of text bloat in
 * settings for the test room. Put it behind tooltips."). A browser adaptation of the page's settings panel with no
 * original; it changes nothing the game does. An explanation is a hidden note beside an info button: the button's
 * `title` is the mouse's tooltip, and the note is the toggle-tip for the rest -- shown while the button holds the focus
 * (the keyboard, or a pad driving the focus), pinned by a click or a tap until a second one, in every build. Escape
 * unpins it in a development build only (OT.R29: no key listener outside `import.meta.env.DEV` but the gate's lists,
 * `test/keyboardGate.test.ts`). The note keeps its id, so a control it describes (`aria-describedby`) is still described
 * by it.
 */
export const INFO_CLASS = 'panel-info';

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The info button's markup, for a panel built as markup: it controls the note `tipId`. */
export function infoButtonMarkup(id: string, tipId: string, about: string, text: string): string {
  return `<button type="button" class="${INFO_CLASS}" id="${id}" aria-label="About ${escape(about)}" aria-expanded="false" aria-controls="${tipId}" title="${escape(text)}">?</button>`;
}

/** The hidden note an info button reveals. */
export function tipMarkup(tipId: string, text: string): string {
  return `<p class="s2u-field__note ${INFO_CLASS}__tip" id="${tipId}" role="note" hidden>${text}</p>`;
}

/**
 * The same, built as elements for a section made in code: `heading` gets a row with its info button, and `note` becomes
 * the hidden tip (its id kept, or `tipId` given). Returns the row, to stand where the heading stood.
 */
export function foldIntoTip(doc: Document, heading: HTMLElement, note: HTMLElement, tipId: string, about: string): HTMLElement {
  if (!note.id) note.id = tipId;
  note.classList.add(`${INFO_CLASS}__tip`);
  note.setAttribute('role', 'note');
  note.hidden = true;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = INFO_CLASS;
  button.id = `${note.id}-info`;
  button.textContent = '?';
  button.title = note.textContent ?? '';
  button.setAttribute('aria-label', `About ${about}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', note.id);
  const row = doc.createElement('div');
  row.className = 'panel-info-row';
  row.append(heading, button);
  return row;
}

const pinned = new WeakSet<HTMLButtonElement>();
const wired = new WeakSet<HTMLElement>();

function tipOf(button: HTMLButtonElement): HTMLElement | null {
  const id = button.getAttribute('aria-controls');
  return id ? button.ownerDocument.getElementById(id) : null;
}
function show(button: HTMLButtonElement, on: boolean): void {
  const tip = tipOf(button);
  if (tip) tip.hidden = !on;
  button.setAttribute('aria-expanded', on ? 'true' : 'false');
}
const infoIn = (target: EventTarget | null): HTMLButtonElement | null => {
  const el = target instanceof Element ? target.closest(`button.${INFO_CLASS}`) : null;
  return el instanceof HTMLButtonElement ? el : null;
};

/**
 * Wires every info button under `root` by delegation (one set of listeners, a button added later included). Twice on
 * one root is once.
 */
export function wirePanelTips(root: HTMLElement): void {
  if (wired.has(root)) return;
  wired.add(root);
  root.addEventListener('click', (e) => {
    const b = infoIn(e.target);
    if (!b) return;
    e.preventDefault();                                   // inside a <label> or a <summary>: never toggles what holds it
    if (pinned.has(b)) { pinned.delete(b); show(b, false); } else { pinned.add(b); show(b, true); }
  });
  root.addEventListener('focusin', (e) => { const b = infoIn(e.target); if (b) show(b, true); });
  root.addEventListener('focusout', (e) => { const b = infoIn(e.target); if (b && !pinned.has(b)) show(b, false); });
  // OT.R29: Escape unpins in a development build only; every build closes a pinned tip by a second click or tap.
  if (import.meta.env.DEV) {
    root.addEventListener('keydown', (e) => {
      const b = infoIn(e.target);
      if (!b || e.key !== 'Escape') return;
      pinned.delete(b);
      show(b, false);
    });
  }
}
