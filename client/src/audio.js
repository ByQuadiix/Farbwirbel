// Synthetische Soundeffekte per WebAudio (keine Audiodateien nötig).
import { store } from './net.js';

let ctx = null;
let master = null;
let muted = store.get('fw.muted') === '1';

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Audio nach erster Interaktion freischalten
window.addEventListener('pointerdown', () => ac(), { once: true });

export const isMuted = () => muted;
export function setMuted(v) { muted = v; store.set('fw.muted', v ? '1' : '0'); }

function noise(dur, { freq = 2000, q = 1, gain = 0.4, type = 'bandpass', at = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function tone(freq, dur, { type = 'sine', gain = 0.25, at = 0, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SFX = {
  card() { noise(0.12, { freq: 3200, q: 0.8, gain: 0.5 }); tone(180, 0.08, { type: 'triangle', gain: 0.15, at: 0.05 }); },
  draw() { noise(0.18, { freq: 1800, q: 0.6, gain: 0.3, type: 'highpass' }); },
  turn() { tone(660, 0.18, { gain: 0.18 }); tone(990, 0.25, { gain: 0.16, at: 0.1 }); },
  error() { tone(200, 0.18, { type: 'square', gain: 0.08 }); tone(150, 0.2, { type: 'square', gain: 0.08, at: 0.08 }); },
  skip() { tone(500, 0.25, { type: 'sawtooth', gain: 0.08, slide: 0.5 }); },
  reverse() { tone(400, 0.15, { type: 'triangle', gain: 0.15, slide: 1.8 }); tone(720, 0.15, { type: 'triangle', gain: 0.15, at: 0.13, slide: 0.55 }); },
  plus() { [0, 0.07, 0.14].forEach((at, i) => tone(300 + i * 120, 0.14, { type: 'square', gain: 0.07, at })); },
  wild() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.12, at: i * 0.06 })); },
  call() { tone(880, 0.12, { type: 'square', gain: 0.08 }); tone(1320, 0.3, { type: 'square', gain: 0.08, at: 0.1 }); },
  caught() { tone(300, 0.35, { type: 'sawtooth', gain: 0.1, slide: 0.4 }); noise(0.2, { freq: 600, gain: 0.3 }); },
  shuffle() { for (let i = 0; i < 6; i++) noise(0.06, { freq: 2500, gain: 0.25, at: i * 0.05 }); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.15, at: i * 0.1 })); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.12, at: i * 0.14 })); },
  chaos() {
    for (let i = 0; i < 7; i++) tone(200 + Math.random() * 900, 0.09, { type: i % 2 ? 'square' : 'sawtooth', gain: 0.07, at: i * 0.05, slide: Math.random() < 0.5 ? 0.4 : 2.2 });
    tone(110, 0.6, { type: 'sawtooth', gain: 0.1, at: 0.3, slide: 0.5 });
    noise(0.4, { freq: 900, q: 3, gain: 0.25, at: 0.3 });
  },
  acid() {
    noise(0.9, { freq: 4500, q: 0.5, gain: 0.35, type: 'highpass' }); // Zischen
    for (let i = 0; i < 9; i++) tone(300 + Math.random() * 500, 0.07, { type: 'sine', gain: 0.12, at: 0.05 + i * 0.07, slide: 1.8 }); // Blubbern
  },
  tornado() {
    for (let i = 0; i < 4; i++) noise(0.8, { freq: 300 + i * 250, q: 2, gain: 0.3, at: i * 0.45 });
    tone(90, 2.2, { type: 'sawtooth', gain: 0.06, slide: 2.5 });
    tone(140, 2.2, { type: 'triangle', gain: 0.06, at: 0.2, slide: 0.6 });
  },
  doomDraw() {
    tone(55, 2.2, { type: 'sawtooth', gain: 0.22, slide: 0.5 });           // tiefes Grollen
    tone(58, 2.2, { type: 'sawtooth', gain: 0.16, slide: 0.48 });
    noise(1.6, { freq: 180, q: 0.8, gain: 0.5, type: 'lowpass' });           // Donner
    [311, 330, 466].forEach((f, i) => tone(f, 1.6, { type: 'triangle', gain: 0.06, at: 0.3 + i * 0.12, slide: 0.94 })); // schiefer Chor
    tone(880, 0.6, { type: 'square', gain: 0.05, at: 0.05, slide: 0.25 });
  },
  doomPlay() {
    noise(0.9, { freq: 120, q: 0.6, gain: 0.8, type: 'lowpass' });            // Explosion
    tone(70, 1.4, { type: 'sawtooth', gain: 0.25, slide: 0.35 });
    noise(1.8, { freq: 900, q: 1.5, gain: 0.25, at: 0.2 });                   // Fauchen des Portals
    [220, 233, 330].forEach((f, i) => tone(f, 1.2, { type: 'sawtooth', gain: 0.05, at: 0.25 + i * 0.08 }));
  },
  dice() { for (let i = 0; i < 4; i++) noise(0.04, { freq: 3500, q: 2, gain: 0.25, at: i * 0.06 }); },
  shimmer() {
    [880, 1175, 1480, 1760, 2350].forEach((f, i) => tone(f, 0.4, { type: 'sine', gain: 0.06, at: i * 0.045 }));
    noise(0.6, { freq: 6000, q: 0.7, gain: 0.12, type: 'highpass' });
    tone(140, 0.5, { type: 'triangle', gain: 0.1, slide: 0.6 });
  },
  click() { tone(900, 0.05, { type: 'triangle', gain: 0.08 }); },
  pop() { tone(600, 0.08, { gain: 0.15, slide: 1.6 }); },
};

export function sfx(name) {
  if (muted) return;
  try { SFX[name]?.(); } catch {}
}
