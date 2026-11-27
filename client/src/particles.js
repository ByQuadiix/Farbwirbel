// Leichtgewichtiges GPU-Partikelsystem (Ringpuffer) für lila Chaos-Rauch und Funken.
import * as THREE from 'three';

const VS = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FS = /* glsl */ `
  uniform float uSoft;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(uSoft, 1.0, d)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class Particles {
  constructor(scene, max, { additive = false, soft = 0.0 } = {}) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.rise = new Float32Array(max);
    this.drag = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 }, uSoft: { value: soft } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
    this.alive = 0;
  }

  /** p: {x,y,z, vx,vy,vz, life, s0, s1, a, color:THREE.Color, rise, drag} */
  emit(p) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.col[i3] = p.color.r; this.col[i3 + 1] = p.color.g; this.col[i3 + 2] = p.color.b;
    this.life[i] = this.maxLife[i] = p.life;
    this.s0[i] = p.s0; this.s1[i] = p.s1; this.a0[i] = p.a;
    this.rise[i] = p.rise ?? 0;
    this.drag[i] = p.drag ?? 1;
    this.size[i] = p.s0;
    this.alpha[i] = 0;
  }

  update(dt, renderer, camera) {
    const h = renderer.domElement.height;
    this.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const i3 = i * 3;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.rise[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      // weich ein- und ausblenden
      this.alpha[i] = this.a0[i] * Math.min(1, t * 5) * (1 - t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aColor.needsUpdate = true;
  }
}

const SMOKE_COLS = ['#8a3dff', '#b25cff', '#6a22d9', '#d070ff', '#ff5ce8', '#3b0f7a'].map((c) => new THREE.Color(c));
const GLOW_COLS = ['#b44dff', '#ff4fe6', '#7d5cff'].map((c) => new THREE.Color(c));
const SPARK_COLS_DEFAULT = ['#f0b3ff', '#ff8af7', '#ffffff', '#c890ff', '#8ff0ff'].map((c) => new THREE.Color(c));
const SPARK_COLS = ['#f0b3ff', '#ff8af7', '#ffffff', '#c890ff', '#8ff0ff'].map((c) => new THREE.Color(c));
const DOOM_SMOKE = ['#1a0000', '#3a0500', '#5c0a00', '#8a1200', '#b31a00', '#2a0a05'].map((c) => new THREE.Color(c));
const EMBERS = ['#ffdd55', '#ffa21a', '#ff5a1a', '#ff2a00', '#fff2b0'].map((c) => new THREE.Color(c));
const DOOM_GLOW = ['#ff2a00', '#ff6a1a', '#c40a00'].map((c) => new THREE.Color(c));

const MIRROR_COLS = ['#ffffff', '#d8f3ff', '#9fe8ff', '#c9d6ff', '#fff6c8'].map((c) => new THREE.Color(c));
const FROST_COLS = ['#ffffff', '#e6f7ff', '#b8e8ff', '#8fd6ff'].map((c) => new THREE.Color(c));

const PAL = {
  mirror: { smoke: MIRROR_COLS, spark: MIRROR_COLS, glow: [new THREE.Color('#9fe8ff'), new THREE.Color('#ffffff')], rate: 0.03, lift: 1, smokeSize: 0.8, smokeA: [0.3, 0.5], sparkVy: [0.8, 2], sparkSize: 1.2, glowChance: 0.6, glowA: 0.5, flash: new THREE.Color('#bff2ff') },
  frost: { smoke: FROST_COLS, spark: FROST_COLS, glow: [new THREE.Color('#bfeaff')], rate: 0.04, lift: 0.6, smokeSize: 0.9, smokeA: [0.3, 0.5], sparkVy: [0.2, 0.8], sparkSize: 1, glowChance: 0.4, glowA: 0.35, flash: new THREE.Color('#d9f4ff') },
  chaos: { smoke: SMOKE_COLS, spark: SPARK_COLS, glow: GLOW_COLS, rate: 0.035, lift: 1, smokeSize: 1, smokeA: [0.55, 0.8], sparkVy: [0.5, 1.3], sparkSize: 1, glowChance: 0.5, glowA: 0.4, flash: new THREE.Color('#c04dff') },
  doom: { smoke: DOOM_SMOKE, spark: EMBERS, glow: DOOM_GLOW, rate: 0.02, lift: 1.4, smokeSize: 1.3, smokeA: [0.65, 0.9], sparkVy: [1.2, 2.8], sparkSize: 1.3, glowChance: 0.7, glowA: 0.55, flash: new THREE.Color('#ff2a00') },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

/** Lila Chaos-Effekt: Rauch (normal geblendet) + Funken (additiv). */
export class ChaosFX {
  constructor(scene) {
    this.smoke = new Particles(scene, 2400, { soft: 0.0 });
    this.glow = new Particles(scene, 1000, { additive: true, soft: 0.0 });
    this.sparks = new Particles(scene, 2000, { additive: true, soft: 0.55 });
    this.tmp = new THREE.Vector3();
  }

  /** Zufälliger Punkt auf/um eine Karte (lokale Koordinaten → Welt). */
  pointOn(mesh, w, h, spread = 1.15) {
    return mesh.localToWorld(this.tmp.set(rnd(-0.5, 0.5) * w * spread, rnd(-0.5, 0.5) * h * spread, 0.03)).clone();
  }

  /**
   * Dauerhaftes Rauchen einer Sonderkarte. `scale` ≈ Weltgröße der Karte (Hand nah an der Kamera).
   * kind: 'chaos' (lila) oder 'doom' (roter Rauch + Glutfunken, dichter).
   */
  trail(mesh, dt, w, h, scale = 1, kind = 'chaos') {
    const P = PAL[kind] ?? PAL.chaos;
    const u = mesh.userData;
    u.emitAcc = (u.emitAcc ?? 0) + dt;
    u.emitAcc = Math.min(u.emitAcc, 0.3); // Tab im Hintergrund: nicht alles auf einmal nachholen
    while (u.emitAcc > P.rate) {
      u.emitAcc -= P.rate;
      const p = this.pointOn(mesh, w, h);
      this.smoke.emit({
        x: p.x, y: p.y, z: p.z, vx: rnd(-0.18, 0.18) * scale, vy: rnd(0.3, 0.7) * scale * P.lift, vz: rnd(-0.18, 0.18) * scale,
        life: rnd(1.2, 2.2), s0: 0.35 * scale, s1: rnd(1.2, 1.9) * scale * P.smokeSize, a: rnd(...P.smokeA), color: pick(P.smoke), rise: 0.15 * scale, drag: 0.985,
      });
      const q = this.pointOn(mesh, w, h, 1.0);
      this.sparks.emit({
        x: q.x, y: q.y, z: q.z, vx: rnd(-0.35, 0.35) * scale, vy: rnd(...P.sparkVy) * scale, vz: rnd(-0.35, 0.35) * scale,
        life: rnd(0.7, 1.3), s0: rnd(0.08, 0.15) * scale * P.sparkSize, s1: 0.02 * scale, a: 1, color: pick(P.spark), drag: 0.98,
      });
      if (Math.random() < P.glowChance) {
        const r = this.pointOn(mesh, w, h, 0.8);
        this.glow.emit({
          x: r.x, y: r.y, z: r.z, vx: 0, vy: 0.2 * scale, vz: 0,
          life: rnd(0.7, 1.1), s0: 0.9 * scale, s1: 2.0 * scale, a: P.glowA, color: pick(P.glow), drag: 1,
        });
      }
    }
  }

  /** Explosion beim Ziehen/Spielen einer Sonderkarte. */
  burst(pos, scale = 1, kind = 'chaos') {
    const P = PAL[kind] ?? PAL.chaos;
    const big = kind === 'doom' ? 2 : 1;
    for (let i = 0; i < 70 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rnd(-0.3, 1.2);
      const s = rnd(1.2, 3.6) * scale * (kind === 'doom' ? 1.4 : 1);
      this.sparks.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 0.5 * scale, vz: Math.sin(a) * Math.cos(e) * s,
        life: rnd(0.7, 1.4), s0: rnd(0.08, 0.16) * scale * P.sparkSize, s1: 0.01, a: 1, color: pick(P.spark), rise: -1.5 * scale, drag: 0.94,
      });
    }
    for (let i = 0; i < 40 * big; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.4, 1.4) * scale;
      this.smoke.emit({
        x: pos.x + rnd(-0.3, 0.3) * scale, y: pos.y + rnd(-0.2, 0.3) * scale, z: pos.z + rnd(-0.3, 0.3) * scale,
        vx: Math.cos(a) * s, vy: rnd(0.3, 1.0) * scale, vz: Math.sin(a) * s,
        life: rnd(1.4, 2.6), s0: 0.5 * scale, s1: rnd(1.6, 2.6) * scale * P.smokeSize, a: rnd(...P.smokeA), color: pick(P.smoke), rise: 0.2 * scale, drag: 0.95,
      });
    }
    this.glow.emit({ x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 0, vz: 0, life: 0.7 * big, s0: 1.5 * scale, s1: 4 * scale * big, a: 0.7, color: P.flash, drag: 1 });
  }

  /** Regen über dem Tisch (pro Frame aufrufen). */
  rain(dt, strength = 1) {
    const n = Math.ceil(dt * 140 * strength);
    const col = [new THREE.Color('#bfe6ff'), new THREE.Color('#e8f6ff'), new THREE.Color('#8fc8ff')];
    for (let i = 0; i < n; i++) {
      this.sparks.emit({
        x: rnd(-9, 9), y: rnd(7, 10), z: rnd(-6, 5),
        vx: -0.6, vy: -rnd(11, 15), vz: 0.3,
        life: rnd(0.55, 0.75), s0: rnd(0.05, 0.09), s1: 0.04, a: 0.8, color: pick(col), drag: 1,
      });
    }
  }

  /** Feuerschweif eines Meteors an Position `pos`. */
  meteorTrail(pos, dt) {
    const n = Math.ceil(dt * 120);
    for (let i = 0; i < n; i++) {
      this.sparks.emit({
        x: pos.x + rnd(-0.2, 0.2), y: pos.y + rnd(-0.2, 0.2), z: pos.z + rnd(-0.2, 0.2),
        vx: rnd(-0.5, 0.5), vy: rnd(0, 1.5), vz: rnd(-0.5, 0.5),
        life: rnd(0.3, 0.7), s0: rnd(0.15, 0.3), s1: 0.03, a: 1, color: pick(PAL.doom.spark), drag: 0.95,
      });
      if (Math.random() < 0.5) {
        this.smoke.emit({
          x: pos.x, y: pos.y, z: pos.z, vx: rnd(-0.3, 0.3), vy: rnd(0.2, 0.8), vz: rnd(-0.3, 0.3),
          life: rnd(0.8, 1.4), s0: 0.4, s1: rnd(1.2, 2), a: rnd(0.45, 0.7), color: pick(PAL.doom.smoke), rise: 0.2, drag: 0.97,
        });
      }
    }
  }

  /** Feuer aus dem Höllenportal (pro Frame aufrufen, solange es offen ist). */
  portalFire(dt, radius, strength = 1) {
    const n = Math.ceil(dt * 90 * strength);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.sparks.emit({
        x, y: 0.1, z, vx: rnd(-0.3, 0.3), vy: rnd(1.5, 4), vz: rnd(-0.3, 0.3),
        life: rnd(0.5, 1.2), s0: rnd(0.1, 0.22), s1: 0.02, a: 1, color: pick(PAL.doom.spark), drag: 0.97,
      });
      if (Math.random() < 0.5) {
        this.smoke.emit({
          x, y: 0.2, z, vx: rnd(-0.2, 0.2), vy: rnd(0.8, 1.8), vz: rnd(-0.2, 0.2),
          life: rnd(1.0, 2.0), s0: 0.5, s1: rnd(1.5, 2.5), a: rnd(0.5, 0.75), color: pick(PAL.doom.smoke), rise: 0.3, drag: 0.98,
        });
      }
      if (Math.random() < 0.2) {
        this.glow.emit({ x, y: 0.15, z, vx: 0, vy: 0.6, vz: 0, life: rnd(0.4, 0.8), s0: 1, s1: 2.2, a: 0.5, color: pick(PAL.doom.glow), drag: 1 });
      }
    }
  }

  /** Säure-Spritzer: blubbernde Blasen in Kartenfarbe + giftgrüner Dampf. */
  acidSplash(pos, hex, scale = 1) {
    const base = new THREE.Color(hex);
    const lime = new THREE.Color('#c8ff4d');
    const cols = [base, base.clone().lerp(new THREE.Color('#ffffff'), 0.4), lime, new THREE.Color('#7dff6a')];
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.8, 2.8) * scale;
      this.sparks.emit({
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * s, vy: rnd(1.5, 3.5) * scale, vz: Math.sin(a) * s,
        life: rnd(0.6, 1.2), s0: rnd(0.1, 0.2) * scale, s1: 0.03, a: 1, color: pick(cols), rise: -6 * scale, drag: 0.97,
      });
    }
    for (let i = 0; i < 26; i++) {
      this.glow.emit({
        x: pos.x + rnd(-0.6, 0.6) * scale, y: pos.y + rnd(0, 0.3), z: pos.z + rnd(-0.5, 0.5) * scale,
        vx: rnd(-0.1, 0.1), vy: rnd(0.4, 1.2) * scale, vz: rnd(-0.1, 0.1),
        life: rnd(0.8, 1.6), s0: rnd(0.15, 0.3) * scale, s1: rnd(0.4, 0.7) * scale, a: 0.8, color: pick(cols), drag: 0.99,
      });
    }
    for (let i = 0; i < 24; i++) {
      this.smoke.emit({
        x: pos.x + rnd(-0.5, 0.5) * scale, y: pos.y + 0.1, z: pos.z + rnd(-0.4, 0.4) * scale,
        vx: rnd(-0.3, 0.3) * scale, vy: rnd(0.5, 1.2) * scale, vz: rnd(-0.3, 0.3) * scale,
        life: rnd(1.4, 2.4), s0: 0.4 * scale, s1: rnd(1.5, 2.4) * scale, a: rnd(0.35, 0.55), color: pick([lime, new THREE.Color('#5fbf3a'), base]), rise: 0.2, drag: 0.97,
      });
    }
  }

  /** Wirbelnder Staub entlang eines Trichters um die Tischmitte. */
  tornadoDust(dt, strength = 1, kind = 'chaos') {
    const n = Math.ceil(dt * 160 * strength);
    const white = kind === 'doom' ? DOOM_SMOKE : [new THREE.Color('#ffffff'), new THREE.Color('#dfe6ff'), new THREE.Color('#c9b8ff')];
    const SPARK_COLS = kind === 'doom' ? EMBERS : SPARK_COLS_DEFAULT;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = rnd(0, 4.5);
      const r = 0.6 + y * 0.75;
      const tx = -Math.sin(a), tz = Math.cos(a);
      const sp = rnd(4, 7);
      this.smoke.emit({
        x: Math.cos(a) * r, y, z: Math.sin(a) * r,
        vx: tx * sp, vy: rnd(0.3, 1.2), vz: tz * sp,
        life: rnd(0.35, 0.7), s0: 0.4, s1: rnd(0.9, 1.4), a: rnd(0.25, 0.45), color: pick(white), drag: 0.96,
      });
      if (Math.random() < 0.4) {
        this.sparks.emit({
          x: Math.cos(a) * r, y, z: Math.sin(a) * r,
          vx: tx * sp * 1.3, vy: rnd(0.5, 2), vz: tz * sp * 1.3,
          life: rnd(0.3, 0.6), s0: rnd(0.06, 0.12), s1: 0.02, a: 1, color: pick(SPARK_COLS), drag: 0.97,
        });
      }
    }
  }

  update(dt, renderer, camera) {
    this.smoke.update(dt, renderer, camera);
    this.glow.update(dt, renderer, camera);
    this.sparks.update(dt, renderer, camera);
  }
}
