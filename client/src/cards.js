// Kartengrafiken werden zur Laufzeit per Canvas gezeichnet (eigenes Design).
import * as THREE from 'three';
import { COLOR_HEX, CHAOS, DOOM } from '../../shared/rules.js';

export const CARD_W = 1;
export const CARD_H = 1.5;
const TW = 320;
const TH = 480;
const FONT = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';
const OUTLINE = '#1a1433';

const faceCache = new Map();
let backTex = null;
let maxAniso = 4;

export function initCards(renderer) {
  maxAniso = renderer.capabilities.getMaxAnisotropy();
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  return c;
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function cardBase(ctx, base) {
  ctx.clearRect(0, 0, TW, TH);
  rr(ctx, 2, 2, TW - 4, TH - 4, 30);
  ctx.fillStyle = '#fdf8ee';
  ctx.fill();
  rr(ctx, 16, 16, TW - 32, TH - 32, 20);
  const g = ctx.createLinearGradient(0, 0, TW, TH);
  g.addColorStop(0, shade(base, 0.22));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.28));
  ctx.fillStyle = g;
  ctx.fill();
  // feine Diagonalstreifen
  ctx.save();
  rr(ctx, 16, 16, TW - 32, TH - 32, 20);
  ctx.clip();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  for (let i = -TH; i < TW + TH; i += 38) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - TH * 0.6, TH);
    ctx.stroke();
  }
  ctx.restore();
}

function quadrants(ctx, r) {
  const cols = [COLOR_HEX.r, COLOR_HEX.b, COLOR_HEX.y, COLOR_HEX.g];
  cols.forEach((c, i) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 2, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  });
}

function diamond(ctx, size, fill) {
  ctx.save();
  ctx.translate(TW / 2, TH / 2);
  ctx.rotate(Math.PI / 4);
  rr(ctx, -size / 2, -size / 2, size, size, size * 0.2);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  if (fill === 'wild') {
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.rotate(-Math.PI / 4);
    quadrants(ctx, size);
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}

function outlinedText(ctx, text, x, y, size, fill, stroke = OUTLINE) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function strokeShape(ctx, draw, width, fill, stroke = OUTLINE) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width * 1.7;
  draw();
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  draw();
  ctx.stroke();
}

function arrow(ctx, x1, y1, x2, y2, head) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.moveTo(x2 - head * Math.cos(a - 0.6), y2 - head * Math.sin(a - 0.6));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a + 0.6), y2 - head * Math.sin(a + 0.6));
}

/** Zeichnet das Kartensymbol zentriert bei (x,y). */
function symbol(ctx, card, x, y, s, fill) {
  const k = card.kind;
  if (k.length === 1) {
    outlinedText(ctx, k, x, y + s * 0.04, s, fill);
    if (k === '6' || k === '9') {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - s * 0.2, y + s * 0.42, s * 0.4, s * 0.09);
    }
  } else if (k === 'draw2') {
    outlinedText(ctx, '+2', x, y + s * 0.04, s * 0.78, fill);
  } else if (k === 'wild4') {
    outlinedText(ctx, '+4', x, y + s * 0.04, s * 0.78, fill);
  } else if (k === 'skip') {
    const r = s * 0.32;
    const w = s * 0.12;
    strokeShape(ctx, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.moveTo(x - r * 0.7, y + r * 0.7);
      ctx.lineTo(x + r * 0.7, y - r * 0.7);
    }, w, fill);
  } else if (k === 'rev') {
    const d = s * 0.3;
    const w = s * 0.11;
    strokeShape(ctx, () => {
      arrow(ctx, x - d, y - d * 0.15, x + d * 0.7, y - d * 0.95, s * 0.2);
      arrow(ctx, x + d, y + d * 0.15, x - d * 0.7, y + d * 0.95, s * 0.2);
    }, w, fill);
  } else if (k === 'lottery') {
    // Würfel (zeigt die 5)
    const d = s * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.2);
    rr(ctx, -d / 2, -d / 2, d, d, d * 0.2);
    ctx.lineWidth = s * 0.08;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [px, py] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(px * d * 0.25, py * d * 0.25, d * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (k === 'acid') {
    const drop = (dx, dy, ds) => {
      ctx.beginPath();
      ctx.moveTo(dx, dy - ds * 0.55);
      ctx.bezierCurveTo(dx + ds * 0.5, dy - ds * 0.02, dx + ds * 0.42, dy + ds * 0.45, dx, dy + ds * 0.45);
      ctx.bezierCurveTo(dx - ds * 0.42, dy + ds * 0.45, dx - ds * 0.5, dy - ds * 0.02, dx, dy - ds * 0.55);
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    for (const [dx, dy, ds] of [[x - s * 0.08, y + s * 0.02, s * 0.62], [x + s * 0.26, y - s * 0.2, s * 0.26], [x + s * 0.28, y + s * 0.22, s * 0.18]]) {
      drop(dx, dy, ds);
      ctx.lineWidth = s * 0.08;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = fill;
      ctx.fill();
      // Glanzpunkt
      ctx.beginPath();
      ctx.ellipse(dx - ds * 0.14, dy + ds * 0.05, ds * 0.07, ds * 0.13, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }
  } else if (k === 'wild') {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2);
    ctx.lineWidth = s * 0.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.clip();
    quadrants(ctx, s * 0.32);
    ctx.restore();
  }
}

const EMOJI = /\p{Extended_Pictographic}/u;

function drawChaosFace(card) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const fx = CHAOS[card.effect] ?? { name: '?', icon: '?' };
  ctx.clearRect(0, 0, TW, TH);
  rr(ctx, 2, 2, TW - 4, TH - 4, 30);
  ctx.fillStyle = '#fdf8ee';
  ctx.fill();
  rr(ctx, 16, 16, TW - 32, TH - 32, 20);
  const g = ctx.createLinearGradient(0, 0, TW, TH);
  g.addColorStop(0, '#5b1a8f');
  g.addColorStop(0.5, '#2a0b4d');
  g.addColorStop(1, '#0c0320');
  ctx.fillStyle = g;
  ctx.fill();
  // Glitch-Streifen (pro Effekt gleich)
  ctx.save();
  rr(ctx, 16, 16, TW - 32, TH - 32, 20);
  ctx.clip();
  let seed = [...card.effect].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
  const cols = [COLOR_HEX.r, COLOR_HEX.y, COLOR_HEX.g, COLOR_HEX.b, '#ff3df2', '#3dfff0'];
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.35;
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(rnd() * TW - 40, rnd() * TH, 40 + rnd() * 200, 4 + rnd() * 12);
  }
  ctx.restore();

  // Mittel-Raute mit Neonrand
  ctx.save();
  ctx.translate(TW / 2, TH / 2 + 8);
  ctx.rotate(Math.PI / 4);
  rr(ctx, -78, -78, 156, 156, 30);
  ctx.fillStyle = '#16062e';
  ctx.shadowColor = '#ff3df2';
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 7;
  const sg = ctx.createLinearGradient(-78, -78, 78, 78);
  sg.addColorStop(0, COLOR_HEX.r); sg.addColorStop(0.33, COLOR_HEX.y); sg.addColorStop(0.66, COLOR_HEX.g); sg.addColorStop(1, COLOR_HEX.b);
  ctx.strokeStyle = sg;
  ctx.stroke();
  ctx.restore();

  const icon = fx.icon;
  if (EMOJI.test(icon)) {
    ctx.font = `100px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, TW / 2, TH / 2 + 14);
  } else {
    outlinedText(ctx, icon, TW / 2, TH / 2 + 12, icon.length > 2 ? 84 : 110, '#fff');
  }
  outlinedText(ctx, 'CHAOS', TW / 2, 64, 50, '#ffd447');
  const name = fx.name;
  outlinedText(ctx, name, TW / 2, TH - 66, name.length > 10 ? 34 : 42, '#fff');
  return c;
}

function drawDoomFace(card) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const fx = DOOM[card.effect] ?? { name: '?', icon: '?' };
  ctx.clearRect(0, 0, TW, TH);
  rr(ctx, 2, 2, TW - 4, TH - 4, 30);
  ctx.fillStyle = '#1a0503';
  ctx.fill();
  rr(ctx, 12, 12, TW - 24, TH - 24, 22);
  const g = ctx.createRadialGradient(TW / 2, TH * 0.55, 10, TW / 2, TH * 0.55, TH * 0.65);
  g.addColorStop(0, '#7a0d05');
  g.addColorStop(0.5, '#3a0402');
  g.addColorStop(1, '#0a0000');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  rr(ctx, 12, 12, TW - 24, TH - 24, 22);
  ctx.clip();
  // Flammen von unten
  for (let layer = 0; layer < 3; layer++) {
    const fg = ctx.createLinearGradient(0, TH, 0, TH * 0.55);
    fg.addColorStop(0, ['#ffdd55', '#ff7a1a', '#c41a0a'][layer]);
    fg.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85 - layer * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, TH);
    for (let x = 0; x <= TW; x += 20) {
      const h = 60 + layer * 35 + Math.sin(x * 0.07 + layer * 2 + card.effect.length) * 30 + (x % 40 ? 25 : 0);
      ctx.lineTo(x, TH - h);
    }
    ctx.lineTo(TW, TH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // glühende Risse
  ctx.strokeStyle = '#ff5a1a';
  ctx.shadowColor = '#ff3a00';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  let seed = [...card.effect].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 3);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
  for (let i = 0; i < 6; i++) {
    let x = rnd() * TW, y = rnd() * TH * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 70; y += rnd() * 45; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();

  // Mittel-Raute: schwarz mit Feuerrand
  ctx.save();
  ctx.translate(TW / 2, TH / 2 + 6);
  ctx.rotate(Math.PI / 4);
  rr(ctx, -80, -80, 160, 160, 26);
  ctx.fillStyle = '#0a0000';
  ctx.shadowColor = '#ff2a00';
  ctx.shadowBlur = 34;
  ctx.fill();
  ctx.shadowBlur = 0;
  const sg = ctx.createLinearGradient(-80, -80, 80, 80);
  sg.addColorStop(0, '#ffdd55'); sg.addColorStop(0.5, '#ff5a1a'); sg.addColorStop(1, '#a00a00');
  ctx.strokeStyle = sg;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  const icon = fx.icon;
  if (EMOJI.test(icon)) {
    ctx.font = `100px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, TW / 2, TH / 2 + 12);
  } else {
    outlinedText(ctx, icon, TW / 2, TH / 2 + 10, icon.length > 3 ? 68 : 90, '#ffcf4a', '#3a0000');
  }
  ctx.save();
  ctx.shadowColor = '#ff2a00';
  ctx.shadowBlur = 22;
  outlinedText(ctx, 'DOOM', TW / 2, 66, 64, '#ff3a1a', '#120000');
  ctx.restore();
  outlinedText(ctx, fx.name, TW / 2, TH - 64, fx.name.length > 12 ? 30 : 38, '#fff', '#2a0000');
  return c;
}

function drawFace(card) {
  if (card.kind === 'chaos') return drawChaosFace(card);
  if (card.kind === 'doom') return drawDoomFace(card);
  const c = canvas();
  const ctx = c.getContext('2d');
  const wild = card.color === 'w';
  const base = COLOR_HEX[card.color];
  cardBase(ctx, base);

  if (wild) {
    diamond(ctx, 170, 'wild');
    if (card.kind === 'wild4') symbol(ctx, card, TW / 2, TH / 2, 150, '#fff');
    else {
      // kleiner Stern in der Mitte
      ctx.save();
      ctx.translate(TW / 2, TH / 2);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 18 : 42;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 8;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  } else if (card.kind === 'acid') {
    // Säure tropft vom oberen Rand
    ctx.save();
    rr(ctx, 16, 16, TW - 32, TH - 32, 20);
    ctx.clip();
    ctx.fillStyle = 'rgba(190,255,90,0.9)';
    ctx.fillRect(16, 16, TW - 32, 18);
    for (const [dx, len, w] of [[60, 70, 22], [112, 40, 16], [170, 95, 26], [228, 55, 18], [268, 80, 20]]) {
      ctx.beginPath();
      ctx.moveTo(dx - w / 2, 20);
      ctx.lineTo(dx - w / 2, 20 + len);
      ctx.arc(dx, 20 + len, w / 2, Math.PI, 0, true);
      ctx.lineTo(dx + w / 2, 20);
      ctx.fill();
    }
    ctx.restore();
    diamond(ctx, 170, 'rgba(255,255,255,0.96)');
    symbol(ctx, card, TW / 2, TH / 2, 168, base);
    outlinedText(ctx, 'SÄURE', TW / 2, TH - 92, 40, '#d8ff7a');
  } else if (card.kind === 'lottery') {
    // Konfetti-Glitzer im Hintergrund
    ctx.save();
    rr(ctx, 16, 16, TW - 32, TH - 32, 20);
    ctx.clip();
    let seed = card.color.charCodeAt(0) * 97;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = ['#ffffff', '#ffe066', '#ff8af7', '#8ff0ff'][i % 4];
      ctx.globalAlpha = 0.35 + rnd() * 0.3;
      ctx.beginPath();
      ctx.arc(20 + rnd() * (TW - 40), 20 + rnd() * (TH - 40), 3 + rnd() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    diamond(ctx, 170, 'rgba(255,255,255,0.96)');
    symbol(ctx, card, TW / 2, TH / 2, 168, base);
    outlinedText(ctx, 'LOTTERIE', TW / 2, TH - 92, 34, '#ffe066');
  } else {
    diamond(ctx, 170, 'rgba(255,255,255,0.96)');
    symbol(ctx, card, TW / 2, TH / 2, 168, base);
  }

  // Ecken
  const cornerCard = card.kind === 'wild4' ? { kind: 'draw4c' } : card;
  const drawCorner = () => {
    if (cornerCard.kind === 'draw4c') outlinedText(ctx, '+4', 0, 0, 52, '#fff');
    else symbol(ctx, card, 0, 0, 66, '#fff');
  };
  ctx.save();
  ctx.translate(58, 70);
  drawCorner();
  ctx.restore();
  ctx.save();
  ctx.translate(TW - 58, TH - 70);
  ctx.rotate(Math.PI);
  drawCorner();
  ctx.restore();
  return c;
}

function drawBack() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, TW, TH);
  rr(ctx, 2, 2, TW - 4, TH - 4, 30);
  ctx.fillStyle = '#fdf8ee';
  ctx.fill();
  rr(ctx, 16, 16, TW - 32, TH - 32, 20);
  const g = ctx.createRadialGradient(TW / 2, TH / 2, 10, TW / 2, TH / 2, TH * 0.6);
  g.addColorStop(0, '#4b2a9e');
  g.addColorStop(1, '#140b33');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Strahlen
  ctx.translate(TW / 2, TH / 2);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    if (i % 2) continue;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(TH, -40);
    ctx.lineTo(TH, 40);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
  }
  // Farbwirbel-Ring
  const cols = [COLOR_HEX.r, COLOR_HEX.y, COLOR_HEX.g, COLOR_HEX.b];
  ctx.lineCap = 'round';
  cols.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(0, 0, 92, i * (Math.PI / 2) + 0.18, (i + 1) * (Math.PI / 2) - 0.18);
    ctx.lineWidth = 30;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 20;
    ctx.strokeStyle = col;
    ctx.stroke();
  });
  ctx.restore();
  ctx.save();
  ctx.translate(TW / 2, TH / 2);
  ctx.rotate(-0.22);
  outlinedText(ctx, 'FARB', 0, -24, 62, '#fff');
  outlinedText(ctx, 'WIRBEL', 0, 34, 50, '#ffd447');
  ctx.restore();
  return c;
}

const faceKey = (card) => card.color + card.kind + (card.effect ?? '');

export function faceTexture(card) {
  const key = faceKey(card);
  let t = faceCache.get(key);
  if (!t) {
    t = toTexture(drawFace(card));
    faceCache.set(key, t);
  }
  return t;
}

export function backTexture() {
  if (!backTex) backTex = toTexture(drawBack());
  return backTex;
}

/** Für das UI (z. B. Endabrechnung) als Bild-URL. */
const urlCache = new Map();
export function faceDataUrl(card) {
  const key = faceKey(card);
  if (!urlCache.has(key)) urlCache.set(key, drawFace(card).toDataURL('image/png'));
  return urlCache.get(key);
}

const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);

export function createCardMesh(card = null) {
  const group = new THREE.Group();
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: card ? faceTexture(card) : backTexture(), alphaTest: 0.5, roughness: 0.42, metalness: 0.0,
  }));
  const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: backTexture(), alphaTest: 0.5, roughness: 0.5, metalness: 0.0,
  }));
  back.rotation.y = Math.PI;
  back.position.z = -0.003;
  front.castShadow = true;
  back.castShadow = true;
  front.userData.cardGroup = group;
  back.userData.cardGroup = group;
  group.add(front, back);
  group.userData = {
    card, front, back,
    tp: new THREE.Vector3(), tq: new THREE.Quaternion(), ts: 1,
    speed: 9, delay: 0, dieAt: 0, dim: 1, curDim: 1,
  };
  return group;
}

export function setCardFace(mesh, card) {
  mesh.userData.card = card;
  mesh.userData.front.material.map = card ? faceTexture(card) : backTexture();
  mesh.userData.front.material.needsUpdate = true;
}

export function disposeCardMesh(mesh) {
  mesh.removeFromParent();
  mesh.userData.front.material.dispose();
  mesh.userData.back.material.dispose();
}

const ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4, x: 5, d: 6 };
const KORDER = { skip: 10, rev: 11, draw2: 12, acid: 13, lottery: 13.5, wild: 14, wild4: 15, chaos: 16, doom: 17 };
export function sortHand(hand) {
  return [...hand].sort((a, b) => ORDER[a.color] - ORDER[b.color]
    || (KORDER[a.kind] ?? Number(a.kind)) - (KORDER[b.kind] ?? Number(b.kind)) || a.id - b.id);
}
