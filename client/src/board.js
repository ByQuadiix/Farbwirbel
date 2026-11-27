// 3D-Spielfeld: Handkarten, Gegnerfächer, Stapel, Richtungsring.
// Arbeitet "diff-basiert": jeder Server-Stand wird mit den vorhandenen Meshes abgeglichen,
// Karten fliegen weich (exponentielle Glättung) zu ihren Zielpositionen.
import * as THREE from 'three';
import { createCardMesh, setCardFace, disposeCardMesh, sortHand, backTexture, shade, CARD_W, CARD_H } from './cards.js';
import { COLOR_HEX } from '../../shared/rules.js';
import { ChaosFX } from './particles.js';

const CHAOS_GLOW = new THREE.Color('#9b30ff');
const DOOM_GLOW = new THREE.Color('#ff2200');

/** Halluzinationen: Gummienten, Pizza, Bananen, Fische – hüpfend statt Karten. */
function makeSillyStuff() {
  const g = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...extra });
  const makers = [
    () => { // Gummiente
      const d = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), mat(0xffd21a));
      body.scale.set(1.25, 0.85, 1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(0xffd21a));
      head.position.set(0.28, 0.32, 0);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), mat(0xff7a1a));
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.52, 0.3, 0);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0x111111));
      eye.position.set(0.4, 0.4, 0.12);
      const eye2 = eye.clone();
      eye2.position.z = -0.12;
      d.add(body, head, beak, eye, eye2);
      return d;
    },
    () => { // Pizzastück
      const d = new THREE.Group();
      const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 3, 1, false, 0, Math.PI / 3), mat(0xf2b25a));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 3, 1, false, 0.03, Math.PI / 3 - 0.06), mat(0xff8a2a));
      top.position.y = 0.045;
      d.add(slice, top);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), mat(0xc4261c));
        const a = 0.25 + i * 0.25;
        p.position.set(Math.sin(a) * (0.2 + i * 0.1), 0.06, Math.cos(a) * (0.2 + i * 0.1));
        d.add(p);
      }
      d.rotation.x = -0.9;
      return d;
    },
    () => { // Banane
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 10, 20, Math.PI * 0.75), mat(0xffe14a));
      b.rotation.z = 0.6;
      return b;
    },
    () => { // Fisch
      const d = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(0x3aa0ff, { metalness: 0.3 }));
      body.scale.set(1.5, 0.75, 0.45);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4), mat(0x2a70d0));
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.55;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x111111));
      eye.position.set(0.28, 0.07, 0.12);
      d.add(body, tail, eye);
      return d;
    },
    () => { // Donut
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.12, 12, 24), mat(0xd99a5a)));
      const glaze = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 12, 24, Math.PI * 2), mat(0xff6ab0));
      glaze.position.z = 0.03;
      d.add(glaze);
      d.rotation.x = -1.1;
      return d;
    },
  ];
  const n = 2 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const o = makers[Math.floor(Math.random() * makers.length)]();
    const homeX = (i - (n - 1) / 2) * 0.75;
    o.position.set(homeX, 0.4, 0);
    o.userData = { baseY: 0.35, homeX, hop: 2.5 + Math.random() * 3, phase: Math.random() * 6, spin: (Math.random() - 0.5) * 6 };
    o.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    g.add(o);
  }
  return g;
}

const PILE_POS = new THREE.Vector3(-3.1, 0, -1.5);
const PILE_YAW = 0.22;
const MAX_FAN = 18;
const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

const SEAT_CARD_Q = (() => {
  const o = new THREE.Object3D();
  const a = 0.5;
  o.lookAt(new THREE.Vector3(0, -Math.sin(a), -Math.cos(a)));
  return o.quaternion.clone();
})();
const SEAT_CARD_Y = (CARD_H / 2) * Math.cos(0.5) + 0.03;

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Board {
  constructor(stage, handlers = {}) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.handlers = handlers;

    this.cards = new Set();
    this.hand = new Map();
    this.handOrder = [];
    this.discard = new Map();
    this.seats = new Map();
    this.round = -1;
    this.hovered = null;
    this.playable = new Set();
    this.myTurn = false;
    this.canDraw = false;
    this.pulse = 0;
    this.dir = 1;
    this.selectMode = false;

    this.handGroup = new THREE.Group();
    this.camera.add(this.handGroup);
    this.fx = new ChaosFX(this.scene);
    this.buildPile();
    this.buildCenter();

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    const el = stage.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.handPointer = null; this.setHover(null); } });
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    stage.updaters.push((dt, t) => this.update(dt, t));
    stage.resizers.push(() => { if (this.view) { this.layoutSeats(); this.layoutHand(); } });
  }

  // ---------- Aufbau ----------

  buildPile() {
    this.pile = new THREE.Group();
    this.pile.position.copy(PILE_POS);
    this.pile.rotation.y = PILE_YAW;
    this.pileBox = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_W * 0.97, 1, CARD_H * 0.97),
      new THREE.MeshStandardMaterial({ color: 0xf3ecdf, roughness: 0.85 }),
    );
    this.pileBox.castShadow = true;
    this.pileBox.receiveShadow = true;
    this.pileTop = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshStandardMaterial({ map: backTexture(), alphaTest: 0.5, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
    );
    this.pileTop.rotation.x = -Math.PI / 2;
    this.pile.add(this.pileBox, this.pileTop);
    this.pile.visible = false;
    this.scene.add(this.pile);
    this.setPileCount(60);
  }

  setPileCount(n) {
    this.pileHeight = Math.max(0.01, n * 0.006);
    this.pileBox.scale.y = this.pileHeight;
    this.pileBox.position.y = this.pileHeight / 2;
    this.pileTop.position.y = this.pileHeight + 0.003;
    this.pileBox.visible = n > 0;
    this.pileTop.visible = n > 0;
  }

  pileTopWorld() {
    const pos = PILE_POS.clone();
    pos.y = this.pileHeight + 0.02;
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, PILE_YAW, Math.PI, 'YXZ'));
    return { pos, quat };
  }

  buildCenter() {
    this.center = new THREE.Group();
    this.center.visible = false;
    this.scene.add(this.center);
    this.glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), this.glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.01;
    this.center.add(this.glow);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    this.ringSpin = new THREE.Group();
    this.ringSpin.position.y = 0.02;
    this.ringMirror = new THREE.Group();
    this.ringMirror.rotation.x = -Math.PI / 2;
    this.ringSpin.add(this.ringMirror);
    const R = 2.05;
    for (let k = 0; k < 2; k++) {
      const start = k * Math.PI;
      const len = Math.PI * 0.7;
      this.ringMirror.add(new THREE.Mesh(new THREE.RingGeometry(R - 0.1, R + 0.1, 64, 1, start, len), this.ringMat));
      const a = start + len;
      const cx = Math.cos(a) * R, cy = Math.sin(a) * R;
      const tx = -Math.sin(a), ty = Math.cos(a);
      const nx = Math.cos(a), ny = Math.sin(a);
      const shape = new THREE.Shape();
      shape.moveTo(cx + tx * 0.5, cy + ty * 0.5);
      shape.lineTo(cx + nx * 0.32, cy + ny * 0.32);
      shape.lineTo(cx - nx * 0.32, cy - ny * 0.32);
      shape.closePath();
      this.ringMirror.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), this.ringMat));
    }
    this.center.add(this.ringSpin);

    // Markierung unter dem aktiven Gegner
    this.markerMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), this.markerMat);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.012;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  setColor(color) {
    const hex = COLOR_HEX[color] ?? '#ffffff';
    this.ringMat.color.set(shade(hex, 0.25));
    this.glowMat.color.set(hex);
    this.markerMat.color.set(shade(hex, 0.3));
  }

  // ---------- Hilfen ----------

  spawn(card, pos, quat, parent) {
    const m = createCardMesh(card);
    m.position.copy(pos);
    m.quaternion.copy(quat);
    this.scene.add(m);
    m.updateMatrixWorld(true);
    if (parent && parent !== this.scene) parent.attach(m);
    m.userData.tp.copy(m.position);
    m.userData.tq.copy(m.quaternion);
    this.cards.add(m);
    return m;
  }

  flyAway(m, target = new THREE.Vector3(0, 1.2, 0)) {
    m.userData.orbit = null;
    this.scene.attach(m);
    m.userData.tp.copy(target);
    m.userData.ts = 0.5;
    m.userData.speed = 6;
    m.userData.dieAt = performance.now() / 1000 + 0.55;
  }

  clearAll() {
    for (const m of this.cards) disposeCardMesh(m);
    this.cards.clear();
    this.hand.clear();
    this.discard.clear();
    this.handOrder = [];
    for (const s of this.seats.values()) s.meshes = [];
  }

  seatRadii() {
    const dist = this.camera.position.length();
    const { w } = this.stage.visibleWidthAt(dist);
    const rx = Math.max(2.6, Math.min(6.4, w / 2 - 3.4));
    const rz = this.stage.aspect < 1 ? 4.6 : 3.9;
    return { rx, rz };
  }

  // ---------- Abgleich mit Serverstand ----------

  sync(view, events = []) {
    this.view = view;
    this.scene.updateMatrixWorld(true);
    const g = view.game;
    if (view.phase === 'lobby' || !g) {
      this.clearAll();
      this.center.visible = false;
      this.pile.visible = false;
      this.marker.visible = false;
      this.round = -1;
      return;
    }
    this.center.visible = true;
    this.pile.visible = true;
    // Echtes Austeilen (Rundenstart) animieren; nach Neuladen/Wiederverbinden Karten sofort hinlegen
    const realDeal = events.some((e) => e.type === 'deal');
    const resync = !realDeal && this.round !== g.round;
    const dealt = realDeal || resync;
    if (dealt) { this.clearAll(); this.round = g.round; }
    // Zeitabstand zwischen Karten so wählen, dass die ganze Animation höchstens `total` Sekunden dauert
    const step = (count, maxStep, total) => Math.min(maxStep, total / Math.max(1, count));
    const dealCards = Math.max(view.hand.length, ...view.players.filter((p) => p.id !== view.me).map((p) => Math.min(p.count, this.fanMax())));
    const dealStep = step(dealCards * (view.players.length || 1), 0.07, 1.4);
    this.layoutSeats();
    this.setPileCount(g.drawCount);
    this.setColor(g.color);
    if (g.dir !== this.dir) { this.dir = g.dir; }
    this.ringMirror.scale.x = g.dir === 1 ? -1 : 1;

    const now = performance.now() / 1000;
    const others = this.otherPlayers();
    const seatOrder = new Map(others.map((p, i) => [p.id, i + 1]));
    const nSeats = others.length + 1;

    // --- Ablagestapel ---
    const plays = new Map(events.filter((e) => e.type === 'play').map((e) => [e.card.id, e.player]));
    // Säure: mit abgeworfene Karten kommen kaskadenartig aus der Hand des Spielers
    const acidOrder = new Map();
    for (const e of events) {
      if (e.type !== 'acid') continue;
      e.cards.forEach((c, i) => { plays.set(c.id, e.player); acidOrder.set(c.id, i); });
      if (e.cards.length) setTimeout(() => this.fx.acidSplash(new THREE.Vector3(0, 0.15, 0), COLOR_HEX[e.color], 1), 350);
    }
    const wantIds = new Set(g.discard.map((c) => c.id));
    const shuffled = events.some((e) => e.type === 'shuffle');
    for (const [id, m] of this.discard) {
      if (wantIds.has(id)) continue;
      this.discard.delete(id);
      if (shuffled) {
        m.userData.tp.copy(this.pileTopWorld().pos);
        m.userData.dieAt = now + 0.5;
      } else {
        this.cards.delete(m);
        disposeCardMesh(m);
      }
    }
    g.discard.forEach((c, i) => {
      let m = this.discard.get(c.id);
      if (!m) {
        m = this.hand.get(c.id);
        if (m) {
          this.hand.delete(c.id);
          this.scene.attach(m);
        } else {
          const seat = this.seats.get(plays.get(c.id));
          if (seat && seat.meshes.length) {
            m = seat.meshes.splice(Math.floor(seat.meshes.length / 2), 1)[0];
            this.scene.attach(m);
          } else {
            const p = this.pileTopWorld();
            m = this.spawn(c, p.pos, p.quat, this.scene);
          }
        }
        setCardFace(m, c);
        m.userData.orbit = null;
        m.userData.speed = 7.5;
        m.userData.dim = 1;
        m.userData.delay = acidOrder.has(c.id) ? acidOrder.get(c.id) * step(acidOrder.size, 0.08, 0.8) : 0;
        m.userData.snap = resync;
        m.userData.dieAt = 0;
        this.discard.set(c.id, m);
        if (plays.has(c.id)) this.pulse = 1;
      }
      const r1 = hash(c.id), r2 = hash(c.id + 0.37);
      m.userData.tp.set((r1 - 0.5) * 0.55, 0.04 + i * 0.01, (r2 - 0.5) * 0.45);
      m.userData.tq.setFromEuler(new THREE.Euler(-Math.PI / 2, (r1 - 0.5) * 1.3, 0, 'YXZ'));
      m.userData.ts = 1.18;
    });

    // --- Chaos-Karten: fliegen groß in die Mitte und lösen sich auf ---
    const chaosFly = (m, card) => {
      const kind = card.kind === 'doom' ? 'doom' : 'chaos';
      setCardFace(m, card);
      this.scene.attach(m);
      const u = m.userData;
      u.orbit = null;
      u.tp.set(0, 2.8, 0.8);
      u.tq.setFromEuler(new THREE.Euler(-0.85, 0, 0));
      u.ts = 2.3;
      u.speed = 5;
      u.dim = 1;
      u.delay = 0;
      u.dieAt = now + (kind === 'doom' ? 1.9 : 1.4);
      if (kind === 'doom') u.ts = 2.8;
      m.visible = true;
      this.setChaosMark(m, kind);
      u.burstPending = false;
      this.fx.burst(m.getWorldPosition(new THREE.Vector3()), 1, kind);
      this.pulse = 1;
    };
    // DOOM-Effekte öffnen das Höllenportal in der Tischmitte
    const doomEv = events.find((e) => e.type === 'doom');
    if (doomEv) this.openPortal(doomEv.effect === 'hallu' ? 2.5 : 6);
    const fromPortal = !!doomEv && (doomEv.effect === 'plus100' || doomEv.effect === 'tornado');
    for (const e of events) {
      if (e.type !== 'play' || !e.chaos) continue;
      if (e.player === view.me) {
        const m = this.hand.get(e.card.id);
        if (m) { this.hand.delete(e.card.id); chaosFly(m, e.card); }
      } else {
        const seat = this.seats.get(e.player);
        if (seat?.meshes.length) chaosFly(seat.meshes.pop(), e.card); // die markierten Karten liegen hinten
      }
    }
    // Bei Handtausch & Co. kommen neue Karten aus der Tischmitte statt vom Stapel
    const reshuffled = events.some((e) => e.type === 'swap' || e.type === 'rotate'
      || (e.type === 'chaos' && ['shuffleHands', 'swapHand', 'gift'].includes(e.effect)));
    const source = () => (fromPortal
      ? this.portalPose()
      : reshuffled
        ? { pos: new THREE.Vector3(0, 1.6, 0), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI, 'YXZ')) }
        : this.pileTopWorld());

    const tornadoEv = events.find((e) => (e.type === 'chaos' || e.type === 'doom') && e.effect === 'tornado');
    if (tornadoEv) this.startTornado(view, others, now, tornadoEv.type === 'doom');
    else {
    // --- eigene Hand ---
    const handIds = new Set(view.hand.map((c) => c.id));
    const swap = events.find((e) => e.type === 'swap' || e.type === 'rotate');
    for (const c of view.hand) {
      const m = this.hand.get(c.id);
      if (m && m.userData.card && m.userData.card.color !== c.color) setCardFace(m, c); // Farbrotation
    }
    for (const [id, m] of this.hand) {
      if (handIds.has(id)) continue;
      this.hand.delete(id);
      const partner = swap?.type === 'swap' ? (swap.a === view.me ? swap.b : swap.a) : null;
      const seat = this.seats.get(partner);
      this.flyAway(m, seat ? seat.group.position.clone().setY(1) : undefined);
    }
    const sorted = sortHand(view.hand);
    const newCount = sorted.filter((c) => !this.hand.has(c.id)).length;
    const drawStep = step(newCount, 0.1, 0.8); // alle neuen Karten in max. ~0,8 s auf den Weg
    let j = 0;
    for (const c of sorted) {
      if (this.hand.has(c.id)) continue;
      const p = source();
      const m = this.spawn(c, p.pos, p.quat, this.handGroup);
      m.userData.speed = fromPortal ? 7 : 9;
      m.userData.delay = resync ? 0 : realDeal ? j * nSeats * dealStep : fromPortal ? 0.6 + j * step(newCount, 0.03, 1.2) : j * drawStep;
      m.userData.snap = resync;
      this.hand.set(c.id, m);
      j++;
    }
    this.handOrder = sorted.map((c) => c.id);

    // --- Gegner ---
    for (const p of others) {
      const seat = this.seats.get(p.id);
      const want = Math.min(p.count, this.fanMax());
      let k = 0;
      const grew = p.count > (seat.lastCount ?? 0);
      const oppStep = step(want - seat.meshes.length, 0.1, 0.7);
      while (seat.meshes.length < want) {
        let m;
        if (grew || dealt) {
          const pp = source();
          m = this.spawn(null, pp.pos, pp.quat, seat.group);
          m.userData.delay = resync ? 0 : realDeal ? (k * nSeats + seatOrder.get(p.id)) * dealStep : fromPortal ? 0.6 + k * oppStep : k * oppStep;
        } else {
          m = this.spawn(null, seat.group.position.clone().setY(0.5), seat.group.quaternion, seat.group);
        }
        m.userData.speed = 9;
        m.userData.snap = resync;
        seat.meshes.push(m);
        k++;
      }
      while (seat.meshes.length > want) this.flyAway(seat.meshes.pop(), swap ? undefined : seat.group.position.clone().setY(0.8));
      seat.lastCount = p.count;
      this.layoutSeat(seat);
    }
    } // Ende: normaler Abgleich (kein Tornado)

    // --- Markierungen: jeder sieht, wer Chaos- (lila) und DOOM-Karten (rot) hält ---
    for (const m of this.hand.values()) {
      const k = m.userData.card?.kind;
      this.setChaosMark(m, k === 'doom' ? 'doom' : k === 'chaos' ? 'chaos' : null);
    }
    for (const p of others) {
      const seat = this.seats.get(p.id);
      const len = seat.meshes.length;
      const d = Math.min(p.doom ?? 0, len);
      const c = Math.min(p.chaos ?? 0, len - d);
      seat.meshes.forEach((m, i) => this.setChaosMark(m, i >= len - d ? 'doom' : i >= len - d - c ? 'chaos' : null));
    }

    // --- Halluzinationen ---
    const me = view.players.find((p) => p.id === view.me);
    this.applyHallu(view.phase === 'playing' && (me?.hallu ?? 0) > 0);

    // aktiver Spieler
    const actor = g.actorId;
    const aSeat = this.seats.get(actor);
    this.marker.visible = view.phase === 'playing' && !!aSeat;
    if (aSeat) this.marker.position.set(aSeat.group.position.x, 0.012, aSeat.group.position.z);
    this.markerSc = aSeat?.sc ?? 1;

    this.layoutHand();
  }

  // ---------- Tornado ----------

  /** Alle Handkarten (eigene + Gegner) wirbeln um die Mitte und landen dann bei den neuen Besitzern. */
  startTornado(view, others, now, doom = false) {
    this.tornadoKind = doom ? 'doom' : 'chaos';
    const pool = [...this.hand.values()];
    for (const p of others) {
      const seat = this.seats.get(p.id);
      pool.push(...seat.meshes);
      seat.meshes = [];
    }
    this.hand.clear();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const end = now + 2.4;
    this.tornadoUntil = end;
    for (const m of pool) this.toOrbit(m, now, end);
    let fromHell = 0;
    const take = () => {
      const m = pool.pop();
      if (m) return m;
      // Fehlende Karten: beim Höllen-Tornado steigen sie aus dem Portal in den Wirbel
      const p = doom ? this.portalPose() : this.pileTopWorld();
      const nm = this.spawn(null, p.pos, p.quat, this.scene);
      this.toOrbit(nm, now + (doom ? 0.4 + Math.min(fromHell++ * 0.03, 1.2) : 0), end);
      return nm;
    };
    let i = 0;
    const sorted = sortHand(view.hand);
    // Karten landen nacheinander, aber insgesamt in höchstens ~1 s
    const landing = sorted.length + others.reduce((s, p) => s + Math.min(p.count, this.fanMax()), 0);
    const rel = Math.min(0.035, 1.0 / Math.max(1, landing));
    for (const c of sorted) {
      const m = take();
      setCardFace(m, c);
      m.visible = true; // kann vorher eine (bei Halluzination unsichtbare) Gegnerkarte gewesen sein
      m.userData.dest = this.handGroup;
      m.userData.orbit.until = end + i * rel;
      this.hand.set(c.id, m);
      i++;
    }
    this.handOrder = sorted.map((c) => c.id);
    for (const p of others) {
      const seat = this.seats.get(p.id);
      const want = Math.min(p.count, this.fanMax());
      for (let k = 0; k < want; k++) {
        const m = take();
        setCardFace(m, null);
        m.visible = !this.halluOn; // Halluzinierende sehen statt Gegnerkarten die Früchte im Wirbel
        m.userData.dest = seat.group;
        m.userData.orbit.until = end + i * rel;
        seat.meshes.push(m);
        i++;
      }
      seat.lastCount = p.count;
      this.layoutSeat(seat);
    }
    // Überzählige Karten lösen sich im Wirbel auf
    for (const m of pool) {
      m.userData.dest = null;
      m.userData.tp.set(0, 5, 0);
      m.userData.ts = 0.2;
      m.userData.dieAt = end + 0.4;
    }
    // Halluzination: Enten, Pizza & Co. fliegen mit in den Tornado
    if (this.halluOn) this.sillyTornado(now, end);
  }

  sillyTornado(now, end) {
    this.flyingSilly ??= [];
    for (const seat of this.seats.values()) {
      if (!seat.hallu) continue;
      for (const o of [...seat.hallu.children]) {
        o.userData.homeParent = seat.hallu;
        o.userData.returning = false;
        this.toOrbit(o, now, end + Math.random() * 0.5);
        this.flyingSilly.push(o);
      }
    }
  }

  updateFlyingSilly(now) {
    if (!this.flyingSilly?.length) return;
    this.flyingSilly = this.flyingSilly.filter((o) => {
      const u = o.userData;
      if (now < u.orbit.until) { this.updateOrbit(o, u, now); return true; }
      // Tornado vorbei: zurück zum Sitz und dort weiterhüpfen
      u.orbit = null;
      const home = u.homeParent;
      if (home?.parent) {
        home.attach(o);
        u.returning = true;
      } else {
        o.removeFromParent();
      }
      return false;
    });
  }

  toOrbit(m, now, end) {
    this.scene.attach(m);
    const u = m.userData;
    u.delay = 0;
    u.dieAt = 0;
    u.orbit = {
      start: now, until: end,
      p0: m.position.clone(), q0: m.quaternion.clone(),
      a0: Math.random() * Math.PI * 2, h: Math.random(),
      speed: 3.5 + Math.random() * 2.5, spin: 2 + Math.random() * 4,
    };
  }

  updateOrbit(m, u, now) {
    const o = u.orbit;
    const tt = Math.max(0, now - o.start);
    const a = o.a0 + tt * o.speed + tt * tt * 0.8;
    const lift = Math.min(1, tt / 0.8);
    const y = 0.3 + o.h * 3.8 * lift + Math.sin(tt * 2.5 + o.h * 6) * 0.25;
    const r = 0.7 + y * 0.75;
    const target = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tt * o.spin * 0.6, -a + Math.PI / 2, Math.sin(tt * 3 + o.h) * 0.6));
    const b = Math.min(1, tt / 0.5);
    const e = b * b * (3 - 2 * b); // weich aus der Hand in den Wirbel
    m.position.copy(o.p0).lerp(target, e);
    m.quaternion.copy(o.q0).slerp(q, e);
    m.scale.setScalar(1);
  }

  /** kind: null | 'chaos' | 'doom' (true = 'chaos') */
  setChaosMark(m, kind) {
    if (kind === true) kind = 'chaos';
    kind = kind || null;
    const u = m.userData;
    if ((u.chaosMark ?? null) === kind) return;
    u.chaosMark = kind;
    u.burstPending = !!kind; // Explosion, sobald die Karte angekommen ist
    for (const mat of [u.front.material, u.back.material]) {
      mat.emissive.copy(kind === 'doom' ? DOOM_GLOW : kind ? CHAOS_GLOW : new THREE.Color(0));
      mat.emissiveIntensity = 0;
    }
  }

  // ---------- Höllenportal ----------

  buildPortal() {
    const g = (this.portal = new THREE.Group());
    g.visible = false;
    g.position.y = 0.03;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, '#000000');
    grd.addColorStop(0.35, '#2a0000');
    grd.addColorStop(0.7, '#a81200');
    grd.addColorStop(0.92, '#ff7a1a');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    // Spiralarme
    ctx.translate(256, 256);
    for (let arm = 0; arm < 5; arm++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      for (let t = 0; t < 1; t += 0.02) {
        const r = 30 + t * 220;
        const a = t * 4.2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.strokeStyle = 'rgba(255,90,20,0.55)';
      ctx.lineWidth = 14;
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.portalDisc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.portalDisc.rotation.x = -Math.PI / 2;
    this.portalDisc.position.y = 0.06;
    g.add(this.portalDisc);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a0a05, emissive: 0xff3a00, emissiveIntensity: 1.6, roughness: 0.5, flatShading: true });
    this.portalRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.13, 10, 48), ringMat);
    this.portalRing.rotation.x = -Math.PI / 2;
    this.portalRing.position.y = 0.08;
    g.add(this.portalRing);
    // Zacken rund um den Rand
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x1a0503, emissive: 0x8a1000, emissiveIntensity: 0.8, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55 + (i % 3) * 0.15, 5), spikeMat);
      s.position.set(Math.cos(a) * 1.75, 0.25, Math.sin(a) * 1.75);
      s.rotation.z = Math.cos(a) * 0.35;
      s.rotation.x = -Math.sin(a) * 0.35;
      g.add(s);
    }
    this.portalLight = new THREE.PointLight(0xff3a00, 0, 9, 1.6);
    this.portalLight.position.y = 0.8;
    g.add(this.portalLight);
    this.scene.add(g);
    this.portalOpen = 0;
    this.portalUntil = 0;
  }

  openPortal(seconds) {
    if (!this.portal) this.buildPortal();
    this.portalUntil = Math.max(this.portalUntil, performance.now() / 1000 + seconds);
    this.portal.visible = true;
  }

  /** Startpose für Karten, die aus dem Portal steigen (unter der Tischoberfläche). */
  portalPose() {
    if (!this.portal) this.buildPortal();
    const pos = new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.4, (Math.random() - 0.5) * 0.8);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.random() * Math.PI * 2, 0, 'YXZ'));
    return { pos, quat };
  }

  updatePortal(dt, t, now) {
    if (!this.portal) return;
    const want = now < this.portalUntil ? 1 : 0;
    this.portalOpen += (want - this.portalOpen) * Math.min(1, dt * (want ? 4 : 2.5));
    if (this.portalOpen < 0.01 && !want) { this.portal.visible = false; this.portalOpen = 0; return; }
    const s = this.portalOpen;
    this.portal.scale.setScalar(Math.max(0.001, s));
    this.portalDisc.rotation.z -= dt * 2.2;
    this.portalRing.material.emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.4;
    this.portalLight.intensity = 6 * s + Math.sin(t * 13) * 1.2 * s;
    if (want) this.fx.portalFire(dt, 1.4 * s, 1);
  }

  // ---------- Halluzinationen ----------

  applyHallu(on) {
    this.halluOn = on;
    for (const seat of this.seats.values()) {
      for (const m of seat.meshes) m.visible = !on;
      if (on && !seat.hallu) {
        seat.hallu = makeSillyStuff();
        seat.group.add(seat.hallu);
      } else if (!on && seat.hallu) {
        seat.hallu.removeFromParent();
        seat.hallu.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        seat.hallu = null;
      }
    }
    // Halluzination vorbei, während Früchte noch im Tornado sind → weg damit
    if (!on && this.flyingSilly?.length) {
      for (const o of this.flyingSilly) {
        o.removeFromParent();
        o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose?.(); });
      }
      this.flyingSilly = [];
    }
  }

  updateHallu(t) {
    if (!this.halluOn) return;
    for (const seat of this.seats.values()) {
      if (!seat.hallu) continue;
      for (const o of seat.hallu.children) {
        const d = o.userData;
        const hopY = d.baseY + Math.abs(Math.sin(t * d.hop + d.phase)) * 0.55;
        if (d.returning) {
          // weich zurück an den Platz im Fächer schweben
          o.position.x += (d.homeX - o.position.x) * 0.08;
          o.position.z += (0 - o.position.z) * 0.08;
          o.position.y += (hopY - o.position.y) * 0.08;
          o.rotation.x *= 0.9;
          if (Math.abs(o.position.x - d.homeX) < 0.03 && Math.abs(o.position.z) < 0.03) d.returning = false;
          continue;
        }
        o.position.y = hopY;
        o.rotation.y += d.spin * 0.016;
        o.rotation.z = Math.sin(t * 2 + d.phase) * 0.3;
      }
    }
  }

  otherPlayers() {
    const v = this.view;
    const n = v.players.length;
    const meIdx = Math.max(0, v.players.findIndex((p) => p.id === v.me));
    const out = [];
    for (let i = 1; i < n; i++) out.push(v.players[(meIdx + i) % n]);
    return out;
  }

  layoutSeats() {
    if (!this.view) return;
    const others = this.otherPlayers();
    const ids = new Set(others.map((p) => p.id));
    for (const [id, seat] of this.seats) {
      if (ids.has(id)) continue;
      for (const m of seat.meshes) { this.cards.delete(m); disposeCardMesh(m); }
      seat.group.removeFromParent();
      this.seats.delete(id);
    }
    const { rx, rz } = this.seatRadii();
    const k = others.length;
    // Viele Gegner: größerer Bogen, kleinere Plätze (bis zu 19 Gegner bei 20 Spielern)
    const ext = k > 6 ? Math.min(14, (k - 6) * 1.5) : 0;
    const sc = k <= 6 ? 1 : Math.max(0.5, 7 / (k + 1));
    const perSeat = (Math.PI * (rx + rz)) / 2 / Math.max(1, k); // Bogenlänge pro Platz (Welt)
    others.forEach((p, i) => {
      const deg = k === 1 ? 270 : 180 - ext + (i * (180 + 2 * ext)) / (k - 1);
      const th = THREE.MathUtils.degToRad(deg);
      const pos = new THREE.Vector3(Math.cos(th) * rx, 0, Math.sin(th) * rz);
      const side = k > 1 && (i === 0 || i === k - 1);
      if (side) pos.z -= 0.9;
      let seat = this.seats.get(p.id);
      if (!seat) {
        seat = { group: new THREE.Group(), meshes: [], lastCount: 0 };
        this.scene.add(seat.group);
        this.seats.set(p.id, seat);
      }
      seat.side = side;
      seat.sc = sc;
      seat.fanW = Math.max(0.4, Math.min(side ? 3.0 : 3.8, (perSeat * 0.9) / sc - CARD_W));
      seat.group.position.copy(pos);
      seat.group.scale.setScalar(sc);
      seat.group.lookAt(0, 0, side ? -0.6 : 0);
      seat.group.updateMatrixWorld(true);
      // Label hinter dem Kartenfächer (von der Tischmitte aus gesehen)
      const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th) * 0.8).normalize();
      seat.anchor = pos.clone().add(out.multiplyScalar((side ? 2.3 : 2.2) * Math.max(sc, 0.7))).setY(0.4);
      this.layoutSeat(seat);
    });
  }

  /** Wie viele Kartenrücken pro Gegner höchstens gezeigt werden (bei vielen Spielern weniger). */
  fanMax() {
    const k = (this.view?.players.length ?? 1) - 1;
    return k > 8 ? 10 : k > 6 ? 14 : MAX_FAN;
  }

  layoutSeat(seat) {
    const m = seat.meshes.length;
    const maxW = seat.fanW ?? (seat.side ? 3.0 : 3.8);
    const spacing = m > 1 ? Math.min(0.34, maxW / (m - 1)) : 0;
    seat.meshes.forEach((mesh, i) => {
      const x = (i - (m - 1) / 2) * spacing;
      mesh.userData.tp.set(x, SEAT_CARD_Y, -Math.abs(x) * 0.12 + i * 0.012);
      mesh.userData.tq.copy(SEAT_CARD_Q);
      mesh.userData.ts = 1;
    });
  }

  // ---------- Eigene Hand: Layout ----------
  //
  // Große Hände: Bei vielen Karten (eigener Zug, > 12 Karten) kommen die spielbaren Karten in eine
  // eigene vordere Reihe, der Rest kompakt in eine Reihe dahinter. Jede Reihe nutzt eine Fischaugen-
  // Verzerrung (Sarkar-Brown) um den Mauszeiger: Karten nahe am Zeiger rücken auseinander, so dass
  // die ausgewählte Karte und ihre Nachbarn gut sichtbar sind. Der Zeiger ist Fixpunkt der Verzerrung,
  // deshalb bleibt die Karte unter dem Zeiger stabil (kein Hin- und Herspringen).

  layoutHand() {
    const d = 7;
    const { w, h } = this.stage.visibleWidthAt(d);
    const scale = Math.min(0.82, w / 7);
    this.handGroup.scale.setScalar(scale);
    this.handGroup.position.set(0, -h / 2 + CARD_H * 0.5 * scale + 0.1, -d);
    const n = this.handOrder.length;
    const maxW = (w * 0.7) / scale - CARD_W; // rechts Platz für die Aktions-Buttons
    const highlight = this.myTurn || this.playable.size > 0;
    const split = highlight && n > 12 && this.playable.size > 0 && this.playable.size < n;
    const front = split ? this.handOrder.filter((id) => this.playable.has(id)) : this.handOrder;
    const back = split ? this.handOrder.filter((id) => !this.playable.has(id)) : [];
    this.handRows = [this.layoutRow(front, 0, maxW, { y: 0, z: 0, rs: 1, highlight, lift: !split })];
    if (back.length) this.handRows.push(this.layoutRow(back, 1, maxW, { y: CARD_H * 0.6, z: -0.9, rs: 0.82, highlight, lift: false }));
  }

  layoutRow(ids, rowIdx, maxW, { y, z, rs, highlight, lift }) {
    const n = ids.length;
    const W = CARD_W * rs;
    const s = n > 1 ? Math.min(0.8 * rs, maxW / (n - 1)) : 0; // gleichmäßiger Abstand ohne Lupe
    const A = -((n - 1) * s + W) / 2; // linke Kante der ersten Karte
    const B = A + n * s; // Ende des Verzerrungsbereichs
    // Fixpunkt der Lupe: Mauszeiger in dieser Reihe, sonst die per Tastatur gewählte Karte
    const hi = ids.indexOf(this.hovered);
    let p = null;
    if (this.handPointer?.row === rowIdx) p = Math.max(A, Math.min(B, this.handPointer.x));
    else if (hi >= 0) p = A + hi * s + s / 2;
    // Stärke so, dass die Karte am Zeiger fast ganz sichtbar ist
    const dist = p != null && s > 0 && s < 0.9 * W ? Math.min(60, (0.95 * W) / s - 1) : 0;
    const F = (x) => {
      if (!dist) return x;
      if (x >= p) {
        const R = B - p;
        if (R < 1e-6) return x;
        const t = (x - p) / R;
        return p + (R * (dist + 1) * t) / (dist * t + 1);
      }
      const L = p - A;
      if (L < 1e-6) return x;
      const t = (p - x) / L;
      return p - (L * (dist + 1) * t) / (dist * t + 1);
    };
    ids.forEach((id, i) => {
      const m = this.hand.get(id);
      if (!m) return;
      const x = F(A + i * s) + W / 2;
      const playable = this.playable.has(id);
      const hov = this.hovered === id;
      let yy = y - x * x * 0.018 * rs;
      let zz = z + i * 0.006;
      if (lift && highlight && playable) yy += 0.16;
      if (highlight && !playable) yy -= 0.08;
      if (hov) { yy += 0.32 * rs; zz = 1.4; } // ausgewählte Karte ganz nach vorn
      m.userData.tp.set(x, yy, zz);
      m.userData.tq.setFromEuler(new THREE.Euler(0, 0, -x * 0.035));
      m.userData.ts = rs * (hov ? 1.1 : 1);
      m.userData.dim = highlight && !playable ? 0.32 : 1;
    });
    return { ids, A, s, W, y, rs, n };
  }

  /** Mauszeiger → Punkt in der Ebene der eigenen Hand (lokale Koordinaten der handGroup). */
  handLocalPoint(e) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.handGroup.updateWorldMatrix(true, false);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.handGroup.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(this.handGroup.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? this.handGroup.worldToLocal(hit) : null;
  }

  /**
   * Welche Handkarte liegt unter dem Zeiger? Bestimmt über die Position entlang der Reihe (nicht über
   * die oberste Karte). Weil der Zeiger Fixpunkt der Lupe ist, entspricht das genau der sichtbaren Karte.
   */
  pickHand(e) {
    if (!this.handRows?.length || !this.hand.size) return null;
    const pt = this.handLocalPoint(e);
    if (!pt) return null;
    const [front, back] = this.handRows;
    const frontTop = back ? CARD_H / 2 + 0.03 : CARD_H / 2 + 0.45;
    let row = null;
    let rowIdx = 0;
    if (pt.y >= -CARD_H / 2 - 0.15 && pt.y <= frontTop) row = front;
    else if (back && pt.y > frontTop && pt.y <= back.y + (CARD_H * back.rs) / 2 + 0.4) { row = back; rowIdx = 1; }
    if (!row || !row.n) return null;
    const { A, s, W, n } = row;
    if (pt.x < A - 0.05 || pt.x > A + (n - 1) * s + W + 0.05) return null;
    let i = s > 0 ? Math.floor((pt.x - A) / s) : 0;
    i = Math.max(0, Math.min(n - 1, i));
    return { id: row.ids[i], row: rowIdx, x: pt.x };
  }

  /** Auswahl per Tastatur/Mausrad verschieben (dir = ±1). */
  moveHover(dir) {
    const rows = this.handRows ?? [];
    let r = rows.findIndex((row) => row.ids.includes(this.hovered));
    if (r < 0) r = 0;
    const ids = rows[r]?.ids ?? [];
    if (!ids.length) return;
    const cur = ids.indexOf(this.hovered);
    const next = cur < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, cur + dir));
    this.handPointer = null;
    this.setHover(ids[next]);
  }

  /** Zwischen vorderer (spielbar) und hinterer Reihe wechseln (dir: -1 = vorne, +1 = hinten). */
  moveHoverRow(dir) {
    const rows = this.handRows ?? [];
    if (rows.length < 2) return;
    const target = rows[dir > 0 ? 1 : 0];
    if (!target.ids.length || target.ids.includes(this.hovered)) return;
    this.handPointer = null;
    this.setHover(target.ids[Math.floor(target.ids.length / 2)]);
  }

  hoveredCard() {
    return this.hovered != null ? this.hand.get(this.hovered)?.userData.card ?? null : null;
  }

  /** Wird vom UI gesetzt. */
  setInteraction({ playable = [], myTurn = false, canDraw = false }) {
    this.playable = new Set(playable);
    this.myTurn = myTurn;
    this.canDraw = canDraw;
    this.layoutHand();
  }

  seatScreen(playerId) {
    const seat = this.seats.get(playerId);
    if (!seat?.anchor) return null;
    return this.stage.toScreen(seat.anchor);
  }

  shake(cardId) {
    const m = this.hand.get(cardId);
    if (m) m.userData.shake = 0.4;
  }

  // ---------- Eingabe ----------

  /** Ziehstapel per Raycast. */
  pickPile(e) {
    if (!this.pile.visible) return false;
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObjects([this.pileTop, this.pileBox], false).length > 0;
  }

  pick(e) {
    const h = this.pickHand(e);
    if (h) return { card: this.hand.get(h.id)?.userData.card, hand: h };
    return this.pickPile(e) ? { pile: true } : null;
  }

  setHover(id) {
    const changed = this.hovered !== id;
    this.hovered = id;
    this.layoutHand(); // auch ohne Wechsel: Lupe folgt dem Zeiger
    if (changed) this.handlers.onHover?.(id != null ? this.hand.get(id)?.userData.card ?? null : null);
  }

  onPointerMove(e) {
    const hit = this.pick(e);
    this.handPointer = hit?.hand ? { row: hit.hand.row, x: hit.hand.x } : null;
    this.setHover(hit?.hand?.id ?? null);
    this.pileHover = !!hit?.pile;
    this.stage.renderer.domElement.style.cursor = hit && (hit.pile ? this.canDraw : true) ? 'pointer' : 'default';
  }

  onPointerDown(e) {
    this.downAt = { x: e.clientX, y: e.clientY };
    this.hoverBeforeDown = this.hovered;
    if (e.pointerType === 'mouse') this.onPointerMove(e);
  }

  onPointerUp(e) {
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 12) return;
    const hit = this.pick(e);
    if (!hit) {
      if (e.pointerType !== 'mouse') this.setHover(null);
      return;
    }
    if (hit.pile) { this.handlers.onPileClick?.(); return; }
    // Touch: erster Tipp wählt aus (Karte hebt sich), zweiter Tipp auf dieselbe Karte spielt sie
    if (e.pointerType !== 'mouse' && this.hoverBeforeDown !== hit.hand.id) {
      this.handPointer = { row: hit.hand.row, x: hit.hand.x };
      this.setHover(hit.hand.id);
      return;
    }
    if (hit.card) this.handlers.onCardClick?.(hit.card);
    if (e.pointerType !== 'mouse') { this.handPointer = null; this.setHover(null); }
  }

  onWheel(e) {
    if (!this.handPointer && this.hovered == null) return;
    if (!this.pickHand(e)) return;
    e.preventDefault();
    this.moveHover(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
  }

  // ---------- Animation ----------

  update(dt, t) {
    const now = performance.now() / 1000;
    for (const m of this.cards) {
      const u = m.userData;
      if (u.dieAt && now > u.dieAt) {
        this.cards.delete(m);
        disposeCardMesh(m);
        continue;
      }
      if (u.orbit) {
        if (now < u.orbit.until) { this.updateOrbit(m, u, now); continue; }
        u.orbit = null;
        if (u.dest) { u.dest.attach(m); u.dest = null; }
        u.speed = 6;
      }
      if (u.delay > 0) { u.delay -= dt; continue; }
      if (u.snap) {
        // Nach Neuladen: direkt an den Platz, ohne Flug
        u.snap = false;
        m.position.copy(u.tp);
        m.quaternion.copy(u.tq);
        m.scale.setScalar(u.ts);
      }
      // Selbstheilung, falls ein Wert ungültig wurde
      if (Number.isNaN(m.position.x) || Number.isNaN(m.position.y)) m.position.copy(u.tp);
      if (Number.isNaN(m.quaternion.x)) m.quaternion.copy(u.tq);
      const k = 1 - Math.exp(-dt * u.speed);
      m.position.lerp(u.tp, k);
      m.quaternion.slerp(u.tq, k);
      const s = m.scale.x + (u.ts - m.scale.x) * k;
      m.scale.setScalar(s);
      if (u.shake > 0) {
        u.shake -= dt;
        m.position.x += Math.sin(t * 60) * 0.03 * (u.shake / 0.4);
      }
      if (Math.abs(u.curDim - u.dim) > 0.001) {
        u.curDim += (u.dim - u.curDim) * Math.min(1, dt * 10);
        u.front.material.color.setScalar(u.curDim);
      }
      if (u.chaosMark && m.visible) {
        const kind = u.chaosMark;
        const inHand = m.parent === this.handGroup;
        const s = inHand ? 0.5 : 1;
        const doom = kind === 'doom';
        const pulse = doom ? 0.55 + Math.sin(t * 7 + m.id) * 0.35 : 0.3 + Math.sin(t * 4 + m.id) * 0.2;
        u.front.material.emissiveIntensity = inHand ? pulse * 0.5 : pulse;
        u.back.material.emissiveIntensity = pulse;
        this.fx.trail(m, dt, CARD_W, CARD_H, s, kind);
        if (u.burstPending && m.position.distanceTo(u.tp) < 0.2) {
          u.burstPending = false;
          this.fx.burst(m.getWorldPosition(new THREE.Vector3()), s, kind);
        }
      }
    }
    if (this.tornadoUntil > now) this.fx.tornadoDust(dt, 1, this.tornadoKind);
    this.updatePortal(dt, t, now);
    this.updateFlyingSilly(now);
    this.updateHallu(t);
    this.fx.update(dt, this.stage.renderer, this.camera);
    this.ringSpin.rotation.y += (this.dir === 1 ? -1 : 1) * dt * 0.55;
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    const gs = 1 + this.pulse * 0.35 + Math.sin(t * 2) * 0.03;
    this.glow.scale.setScalar(gs);
    this.glowMat.opacity = 0.75 + this.pulse * 0.25;
    this.marker.scale.setScalar((1 + Math.sin(t * 3) * 0.06) * (this.markerSc ?? 1));
    const pileGlow = this.canDraw ? 0.12 + Math.sin(t * 4) * 0.08 + (this.pileHover ? 0.15 : 0) : 0;
    this.pileTop.material.emissiveIntensity = pileGlow;
  }
}
