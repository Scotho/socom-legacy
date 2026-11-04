import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../src/net/protocol';
import type { VoiceDown } from '../../src/net/voiceWire';
import type { Headset } from '../../src/voice/headset';
import type { MatchVoice, MatchVoiceDeps, VoiceState } from '../../src/voice/voiceClient';
import { ForgeLobbyVoice, type ForgeVoiceLink } from '../../src/forge/lobby/lobbyVoice';

/**
 * FORGE (FG-27; FG.R22, a browser adaptation with no original): the lobby popup's voice -- the room's lobby channel
 * through `mountVoice` over the lobby's `NetClient`, as `GameLobbyVoice` mounts it (the pattern, not the class): the
 * talk input's lobby phase fed by the pointer's hold button and the pad's Circle, the floor kept for the talker bar, the
 * ARMORY's RADIO OFF and back.
 */

function link(id = 7): ForgeVoiceLink & { sent: unknown[]; emit(ev: ServerEvent): void; voice(d: VoiceDown): void; listeners(): number } {
  const ls = new Set<(ev: ServerEvent) => void>(), vs = new Set<(d: VoiceDown) => void>();
  const sent: unknown[] = [];
  return {
    id, state: 'open', sent,
    send: (ev) => { sent.push(ev); },
    sendVoice: () => undefined,
    on: (l) => { ls.add(l); return () => ls.delete(l); },
    onVoice: (l) => { vs.add(l); return () => vs.delete(l); },
    emit: (ev) => { for (const l of ls) l(ev); },
    voice: (d) => { for (const l of vs) l(d); },
    listeners: () => ls.size + vs.size,
  };
}

function fakeVoice(): { mount(d: MatchVoiceDeps): MatchVoice; pads: boolean[]; floors: unknown[]; frames: unknown[]; mounted: MatchVoiceDeps[]; disposed: number; state: Partial<VoiceState> } {
  const out = {
    pads: [] as boolean[], floors: [] as unknown[], frames: [] as unknown[], mounted: [] as MatchVoiceDeps[], disposed: 0, state: {} as Partial<VoiceState>,
    mount: (d: MatchVoiceDeps): MatchVoice => {
      out.mounted.push(d);
      return {
        netDeps: () => ({ voiceFloor: (ev) => { out.floors.push(ev); }, voiceFrame: (f) => { out.frames.push(f); } }),
        pad: (t) => { out.pads.push(t); },
        state: () => ({ sent: 0, heard: 0, speaker: null, holder: null, toneLevel: 0, headset: true, channel: null, talking: false, ...out.state }),
        mute: () => undefined, muted: () => false, radio: () => undefined,
        dispose: () => { out.disposed++; },
      } as MatchVoice;
    },
  };
  return out;
}

function fakeHeadset(): Headset & { key: boolean; disposed: number } {
  const h = {
    key: false, disposed: 0,
    microphone: async () => null, noHeadset: () => undefined, throttled: () => undefined,
    frame: () => ({ padPresent: true, focused: true }),
    modulate: (b: Float32Array) => b, setVoiceMask: () => undefined,
    keys: () => (h.key ? new Set(['Circle'] as const) : new Set()),
    dispose: () => { h.disposed++; },
  };
  return h as unknown as Headset & { key: boolean; disposed: number };
}

function make(o: { typing?: boolean; inArmory?: boolean } = {}) {
  let l: ReturnType<typeof link> | null = link();
  let t = 0;
  const v = fakeVoice(), h = fakeHeadset(), lines: string[] = [];
  const state = { typing: o.typing ?? false, inArmory: o.inArmory ?? false };
  const voice = new ForgeLobbyVoice({
    link: () => l, line: (text) => { lines.push(text); }, typing: () => state.typing, inArmory: () => state.inArmory,
    deps: { mount: v.mount, headset: () => h, seconds: () => t, tuners: () => ({ headset: 1 }) },
  });
  return { voice, v, h, lines, state, link: () => l!, setLink: (x: ReturnType<typeof link> | null) => { l = x; }, at: (s: number) => { t = s; } };
}

describe('FORGE lobby: the voice', () => {
  it('mounts the voice client at the first frame with a client, over that client', () => {
    const m = make();
    expect(m.v.mounted).toHaveLength(0);
    m.voice.frame();
    expect(m.v.mounted).toHaveLength(1);
    expect(m.v.mounted[0]!.net()?.client).toBe(m.link());
    expect(m.v.pads).toEqual([false]);
  });

  it('the hold button and the pad\'s Circle talk (the talk input\'s lobby phase), let go they stop', () => {
    const m = make();
    m.voice.frame();
    m.voice.talk('pointer', true); m.at(0.1); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    m.voice.talk('pointer', false); m.at(0.2); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(false);
    m.voice.talk('pad', true); m.at(0.3); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    // The pointer let go while the pad still holds: still talking (either source holds Circle).
    m.voice.talk('pointer', false); m.at(0.4); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    m.voice.talk('pad', false); m.at(0.5); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(false);
  });

  it('the talk is cut at the original\'s 10 s cap and waits before the next (VOICE_TALK_CAP_READING, the talk input\'s)', () => {
    const m = make();
    m.voice.frame();
    m.voice.talk('pad', true); m.at(1); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    m.at(11.5); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(false);
  });

  it('the DEV key (the headset\'s, gated there) talks, but not while the chat is typed into nor over the ARMORY', () => {
    const m = make();
    m.voice.frame();
    m.h.key = true; m.at(0.1); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    m.h.key = false; m.at(0.2); m.voice.frame();
    m.state.typing = true; m.h.key = true; m.at(0.3); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(false);
  });

  it('the floor: the room\'s voiceFloor kept for the bar and handed on; the room\'s frames handed on', () => {
    const m = make();
    m.voice.frame();
    m.link().emit({ type: 'voiceFloor', channel: 0, holder: 3 });
    expect(m.v.floors).toEqual([{ type: 'voiceFloor', channel: 0, holder: 3 }]);
    expect(m.voice.holder()).toBe(3);
    const frame = { speaker: 3, seq: 1, payload: new Uint8Array(1) } as unknown as VoiceDown;
    m.link().voice(frame);
    expect(m.v.frames).toEqual([frame]);
    m.link().emit({ type: 'voiceFloor', channel: 0, holder: 7 });          // the seat's own: no talker for the bar
    expect(m.voice.holder()).toBe(7);
    expect(m.voice.bar(() => 'Me')).toBe(' ');
    m.link().emit({ type: 'voiceFloor', channel: 0, holder: 3 });
    expect(m.voice.bar((id) => (id === 3 ? 'Guest-1' : null))).toBe('Guest-1');
    m.v.state.suspended = true;
    expect(m.voice.bar(() => 'Guest-1')).toBe('VOICE PAUSED');
  });

  it('the ARMORY: the talk flag cleared, RADIO OFF once at the entry and ON once at the return, on the client it went on', () => {
    const m = make();
    m.voice.frame();
    m.voice.talk('pad', true); m.at(0.1); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(true);
    m.state.inArmory = true; m.at(0.2); m.voice.frame(); m.voice.frame();
    expect(m.v.pads.at(-1)).toBe(false);
    expect(m.link().sent).toEqual([{ type: 'voiceRadio', on: false }]);
    m.state.inArmory = false; m.voice.talk('pad', false); m.at(0.3); m.voice.frame(); m.voice.frame();
    expect(m.link().sent).toEqual([{ type: 'voiceRadio', on: false }, { type: 'voiceRadio', on: true }]);
  });

  it('a new client is listened to in place of the old; no client, the voice let go; release lets everything go', () => {
    const m = make();
    m.voice.frame();
    const first = m.link();
    expect(first.listeners()).toBe(2);
    const second = link(9);
    m.setLink(second); m.voice.frame();
    expect([first.listeners(), second.listeners()]).toEqual([0, 2]);
    m.setLink(null); m.voice.frame();
    expect(second.listeners()).toBe(0);
    expect(m.v.disposed).toBe(1);
    expect(m.h.disposed).toBe(1);
    m.setLink(second); m.voice.frame();
    expect(m.v.mounted).toHaveLength(2);
    m.voice.release();
    expect([second.listeners(), m.v.disposed, m.h.disposed]).toEqual([0, 2, 2]);
    expect(m.voice.state()).toBeNull();
  });
});
