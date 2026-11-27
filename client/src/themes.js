// Prozedurale Tisch-Themes: Neon-Arena, Winter-Eisfläche, Garten-Holztisch.
import * as THREE from 'three';

export const TABLE_RX = 7.8;
export const TABLE_RZ = 5.0;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 8;
  return t;
}

function ellipseDisc(material, y = 0) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 128), material);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(TABLE_RX, TABLE_RZ, 1);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function ellipseTube(radius, color, y, opts = {}) {
  const pts = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * (TABLE_RX + (opts.grow ?? 0)), y, Math.sin(a) * (TABLE_RZ + (opts.grow ?? 0))));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const mat = opts.basic
    ? new THREE.MeshBasicMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive })
    : new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.8 });
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, radius, 10, true), mat);
  m.castShadow = !opts.basic;
  m.receiveShadow = true;
  return m;
}

function dotSprite() {
  return tex(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function particles(count, area, color, size, rand, additive = true) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * area.x;
    pos[i * 3 + 1] = rand() * area.y;
    pos[i * 3 + 2] = area.z0 + rand() * area.z;
    speed[i] = 0.4 + rand() * 0.8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, map: dotSprite(), transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.speed = speed;
  return pts;
}

// ---------------------------------------------------------------------------

function neon(rand) {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.02;
  shadow.receiveShadow = true;
  group.add(shadow);

  const tableTex = tex(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#ff9b52');
    g.addColorStop(0.35, '#e0457b');
    g.addColorStop(0.75, '#6a1d9a');
    g.addColorStop(1, '#2a0a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Kaleidoskop-Dreiecke
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 36; i++) {
      ctx.rotate((Math.PI * 2) / 36);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w * 0.6, -w * 0.03);
      ctx.lineTo(w * 0.6, w * 0.05);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
      ctx.fill();
    }
  });
  const table = ellipseDisc(new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.3, metalness: 0.15, emissive: 0x2a0838, emissiveIntensity: 0.6 }));
  group.add(table);
  group.add(ellipseTube(0.05, 0xffc27a, 0.03, { basic: true }));
  group.add(ellipseTube(0.22, 0xff7a4a, 0.03, { basic: true, opacity: 0.25, additive: true }));
  group.add(ellipseTube(0.08, 0xc86bff, 0.02, { basic: true, opacity: 0.7, grow: 0.6 }));

  // Schwebende Kristalle
  const crystals = new THREE.Group();
  const cMat = new THREE.MeshStandardMaterial({ color: 0xff8fd0, emissive: 0xb02a8a, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + rand() * 0.45), cMat);
    const a = rand() * Math.PI * 2;
    const r = 11 + rand() * 6;
    m.position.set(Math.cos(a) * r * 1.3, 1 + rand() * 5, Math.sin(a) * r - 3);
    if (m.position.z > 4 && Math.abs(m.position.x) < 10) m.position.z -= 12;
    m.userData.spin = (rand() - 0.5) * 1.5;
    m.userData.bob = rand() * 6;
    crystals.add(m);
  }
  group.add(crystals);
  const pts = particles(260, { x: 40, y: 12, z0: -20, z: 30 }, 0xffc58a, 0.18, rand);
  group.add(pts);

  return {
    group,
    hemiSky: 0xffe2f4, hemiGround: 0x4b1a6a, hemiIntensity: 1.25, sunColor: 0xfff0e0, sunIntensity: 1.4, exposure: 1.05,
    update(dt, t) {
      for (const c of crystals.children) {
        c.rotation.y += c.userData.spin * dt;
        c.rotation.x += c.userData.spin * 0.5 * dt;
        c.position.y += Math.sin(t + c.userData.bob) * 0.003;
      }
      const p = pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + pts.userData.speed[i] * dt * 0.5;
        if (y > 12) y = 0;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------

function tree(rand, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.6 * s, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 }));
  trunk.position.y = 0.3 * s;
  g.add(trunk);
  const green = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.38 + rand() * 0.05, 0.35, 0.3), roughness: 0.9, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const r = (0.95 - i * 0.25) * s;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.95 * s, 7), green);
    cone.position.y = (0.75 + i * 0.55) * s;
    cone.castShadow = true;
    g.add(cone);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 0.42 * s, 7), snow);
    cap.position.y = cone.position.y + 0.3 * s;
    g.add(cap);
  }
  g.rotation.y = rand() * Math.PI;
  return g;
}

function winter(rand) {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  group.add(ground);

  const iceTex = tex(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#d9fbff');
    g.addColorStop(0.45, '#7fd3f2');
    g.addColorStop(0.85, '#3d9fd6');
    g.addColorStop(1, '#2a7fb8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      let x = rand() * w, y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 120; y += (rand() - 0.5) * 120; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // Schneeflocken
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const x = rand() * w, y = rand() * h, r = 20 + rand() * 26;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
      }
    }
  });
  const ice = ellipseDisc(new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.08, metalness: 0.2, emissive: 0x1a4a66, emissiveIntensity: 0.25 }), 0.0);
  group.add(ice);
  group.add(ellipseTube(0.4, 0xffffff, 0.05, { grow: 0.35, roughness: 0.95 }));

  const occupied = (x, z) => (Math.abs(x) < 10.5 && z > 3.5) || (x * x) / 100 + (z * z) / 49 < 1;
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * 16;
    const x = Math.cos(a) * r * 1.4;
    const z = Math.sin(a) * r - 2;
    if (occupied(x, z)) continue;
    const t = tree(rand, 1.2 + rand() * 1.3);
    t.position.set(x, 0, z);
    group.add(t);
  }
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.15 + rand() * 0.6;
    const x = Math.cos(a) * TABLE_RX * r;
    const z = Math.sin(a) * TABLE_RZ * r;
    if (Math.abs(x) < 8 && z > 3) continue;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.2 + rand() * 0.9, 16, 12), snowMat);
    s.position.set(x, 0, z);
    s.castShadow = true;
    group.add(s);
  }
  // Schneemann
  const man = new THREE.Group();
  [[0.75, 0.6], [0.55, 1.6], [0.4, 2.4]].forEach(([r, y]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), snowMat);
    b.position.y = y; b.castShadow = true; man.add(b);
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xff8a1f }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.42, 0.48); man.add(nose);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x3a56c8, roughness: 0.7 });
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.7, 14), hatMat);
  hat.position.y = 2.95; hat.rotation.z = 0.2; man.add(hat);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), snowMat);
  pom.position.set(-0.13, 3.3, 0); man.add(pom);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (const x of [-0.13, 0.13]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat); e.position.set(x, 2.55, 0.36); man.add(e); }
  man.position.set(8.6, 0, 3.4);
  man.rotation.y = -0.7;
  group.add(man);

  const snow = particles(700, { x: 50, y: 16, z0: -25, z: 35 }, 0xffffff, 0.14, rand, false);
  group.add(snow);
  return {
    group,
    hemiSky: 0xeaf6ff, hemiGround: 0x9bb8d0, hemiIntensity: 1.3, sunColor: 0xffffff, sunIntensity: 1.5, exposure: 1.0,
    update(dt, t) {
      const p = snow.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - snow.userData.speed[i] * dt * 0.8;
        if (y < 0) y = 16;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.15);
      }
      p.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------

function garden(rand) {
  const group = new THREE.Group();
  const grassTex = tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5aa83a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `hsl(${95 + rand() * 25}, ${45 + rand() * 20}%, ${30 + rand() * 25}%)`;
      ctx.fillRect(rand() * w, rand() * h, 2, 5 + rand() * 6);
    }
  }, { repeat: 18 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -1.4;
  grass.receiveShadow = true;
  group.add(grass);

  const woodTex = tex(1024, 640, (ctx, w, h) => {
    const planks = 7;
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const l = 58 + rand() * 10;
      ctx.fillStyle = `hsl(32, 48%, ${l}%)`;
      ctx.fillRect(0, i * ph, w, ph);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(120,70,30,${0.05 + rand() * 0.12})`;
        ctx.lineWidth = 1 + rand() * 2;
        const y = i * ph + rand() * ph;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 14, w * 0.6, y + (rand() - 0.5) * 14, w, y + (rand() - 0.5) * 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,30,10,0.55)';
      ctx.fillRect(0, i * ph, w, 4);
    }
  });
  const table = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 12), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 }));
  table.position.set(0, -0.25, -0.6);
  table.receiveShadow = true;
  group.add(table);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
  for (const [x, z] of [[-8.6, -6], [8.6, -6], [-8.6, 4.8], [8.6, 4.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), legMat);
    leg.position.set(x, -0.9, z);
    group.add(leg);
  }

  const checkTex = tex(256, 256, (ctx, w, h) => {
    const n = 8;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#f6f1ea' : '#d8323c';
      ctx.fillRect((x * w) / n, (y * h) / n, w / n, h / n);
    }
    ctx.globalAlpha = 0.25;
    for (let y = 0; y < n; y++) { ctx.fillStyle = y % 2 ? '#d8323c' : '#fff'; ctx.fillRect(0, (y * h) / n + h / n / 3, w, h / n / 3); }
  });
  const blanket = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.95 }));
  blanket.rotation.x = -Math.PI / 2;
  blanket.rotation.z = 0.35;
  blanket.position.set(-8.4, 0.004, -4.4);
  blanket.receiveShadow = true;
  group.add(blanket);

  const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const addPlate = (x, z, fruits) => {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 0.1, 32), plateMat);
    plate.position.set(x, 0.05, z);
    plate.castShadow = true; plate.receiveShadow = true;
    group.add(plate);
    fruits.forEach((col, i) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }));
      const a = (i / fruits.length) * Math.PI * 2;
      f.position.set(x + Math.cos(a) * 0.45, 0.38, z + Math.sin(a) * 0.45);
      f.castShadow = true;
      group.add(f);
    });
  };
  addPlate(-8.3, -4.4, [0xff8a1f, 0xe8364a, 0xffd23a, 0x7ac943]);
  addPlate(8.6, -4.6, [0xe8364a, 0xe8364a, 0x7ac943]);

  const addCup = (x, z, juice) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.9, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.05, side: THREE.DoubleSide }));
    cup.position.set(x, 0.45, z);
    group.add(cup);
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.65, 24), new THREE.MeshStandardMaterial({ color: juice, roughness: 0.3 }));
    j.position.set(x, 0.33, z);
    j.castShadow = true;
    group.add(j);
  };
  addCup(-6.6, -5.4, 0xffa21f);
  addCup(9.4, 2.2, 0xff5a7a);

  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.95, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8323c, roughness: 0.35, side: THREE.DoubleSide }));
  bowl.position.set(8.4, 0.9, 4.0);
  bowl.castShadow = true;
  group.add(bowl);
  const chipMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(new THREE.TetrahedronGeometry(0.22), chipMat);
    const a = rand() * Math.PI * 2, r = rand() * 0.6;
    c.position.set(8.4 + Math.cos(a) * r, 0.75 + rand() * 0.2, 4.0 + Math.sin(a) * r);
    c.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    group.add(c);
  }

  // Büsche im Hintergrund
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f8a2e, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rand() * 1.6, 0), bushMat);
    const x = (rand() - 0.5) * 60;
    b.position.set(x, -0.6, -14 - rand() * 10);
    group.add(b);
  }
  const flowers = particles(160, { x: 50, y: 0.2, z0: -25, z: 15 }, 0xfff1a8, 0.3, rand, false);
  flowers.position.y = -1.3;
  group.add(flowers);

  return {
    group,
    hemiSky: 0xfff8e8, hemiGround: 0x5a7a3a, hemiIntensity: 1.2, sunColor: 0xfff1d6, sunIntensity: 1.9, exposure: 1.0,
    update() {},
  };
}

export function buildTheme(name, stage) {
  const rand = rng(1337);
  const t = name === 'winter' ? winter(rand) : name === 'garden' ? garden(rand) : neon(rand);
  t.group.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = false; });
  return t;
}
