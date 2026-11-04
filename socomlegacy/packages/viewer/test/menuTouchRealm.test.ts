import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { mountMenuTouch } from '../src/menuTouch';

/**
 * Browser adaptation (the menus' touch pad, `./menuTouch`): the window it is handed may be of another realm than the
 * module's globals -- here a jsdom window under Node, whose `addEventListener` refuses Node's own `AbortSignal`, and
 * which has no `requestAnimationFrame` unless it pretends to be visual (`experimentalMenu.test.ts` mounts the front end
 * so). The pad's listeners, observers and frames are the handed window's, so it mounts, reads a press and disposes.
 * Runs under the node environment on purpose: `menuTouch.test.ts` (jsdom) shares one realm with its window.
 */
let dom: JSDOM | null = null;
afterEach(() => { dom?.window.close(); dom = null; });

function pointer(win: JSDOM['window'], button: Element, type: string): void {
  const event = new win.MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  button.dispatchEvent(event);
}

for (const pretendToBeVisual of [false, true]) {
  it(`mounts, reads a press and disposes on a window of another realm (pretendToBeVisual ${pretendToBeVisual})`, async () => {
    dom = new JSDOM('<body></body>', { url: 'http://localhost/', pretendToBeVisual });
    const doc = dom.window.document;
    const canvas = doc.createElement('canvas'); doc.body.append(canvas);
    const touch = mountMenuTouch(canvas, dom.window as unknown as Window);
    const root = doc.getElementById('menu-touch')!;
    expect(root).not.toBeNull();
    expect(root.hidden).toBe(true);   // no coarse pointer under Node: hidden until a first touch
    dom.window.dispatchEvent(new dom.window.Event('touchstart'));
    // A jsdom document not pretending to be visual is hidden (`document.hidden`): the pad stays hidden there, as for a
    // tab in the background; a visual one shows it on the first touch.
    expect(doc.hidden).toBe(!pretendToBeVisual);
    expect(root.hidden).toBe(doc.hidden);
    const cross = root.querySelector('#tw-cross')!;
    pointer(dom.window, cross, 'pointerdown'); pointer(dom.window, cross, 'pointerup');
    expect(touch.read().buttons[0]!.pressed).toBe(!doc.hidden);   // a hidden pad presses nothing
    expect(touch.read().buttons[0]!.pressed).toBe(false);
    pointer(dom.window, cross, 'pointerdown');
    dom.window.dispatchEvent(new dom.window.Event('blur'));
    expect(touch.read().buttons[0]!.pressed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));   // a queued layout frame runs on the handed window
    touch.dispose();
    expect(doc.getElementById('menu-touch')).toBeNull();
    pointer(dom.window, cross, 'pointerdown');   // taken off at dispose: the detached button presses nothing
    expect(touch.read().buttons[0]!.pressed).toBe(false);
  });
}
