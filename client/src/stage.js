import * as THREE from 'three';
import { buildTheme } from './themes.js';

export class Stage {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 1.6));
    sun.position.set(4, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.themeGroup = new THREE.Group();
    this.scene.add(this.themeGroup);
    this.themeName = null;
    this.themeUpdate = null;

    this.updaters = [];
    this.resizers = [];
    this.clock = new THREE.Clock();
    this.time = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get aspect() { return this.camera.aspect; }

  resize() {
    // Unsichtbares Fenster (Hintergrund-Tab) kann 0×0 melden → alte Größe behalten
    const w = this.container.clientWidth || window.innerWidth || this.width || 1280;
    const h = this.container.clientHeight || window.innerHeight || this.height || 720;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Hochformat: Kamera höher/weiter weg und breiteres Sichtfeld
    if (aspect < 1) {
      this.camera.fov = 60;
      this.camera.position.set(0, 16.5, 11.5);
    } else if (aspect < 1.45) {
      this.camera.fov = 46;
      this.camera.position.set(0, 14, 11);
    } else {
      this.camera.fov = 40;
      this.camera.position.set(0, 13.5, 10.6);
    }
    this.camera.lookAt(0, 0, 0.9);
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
    for (const fn of this.resizers) fn();
  }

  /** Sichtbare Breite (Welt-Einheiten) auf Höhe der Tischebene in Kameranähe. */
  visibleWidthAt(distance) {
    const h = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return { w: h * this.camera.aspect, h };
  }

  setTheme(name) {
    if (name === this.themeName) return;
    this.themeName = name;
    for (const child of [...this.themeGroup.children]) {
      child.removeFromParent();
      child.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { m.map?.dispose(); m.dispose(); }
      });
    }
    document.body.classList.remove('theme-neon', 'theme-winter', 'theme-garden');
    document.body.classList.add(`theme-${name}`);
    const t = buildTheme(name, this);
    this.themeGroup.add(t.group);
    this.themeUpdate = t.update;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.sun.color.set(t.sunColor);
    this.sun.intensity = t.sunIntensity;
    this.renderer.toneMappingExposure = t.exposure ?? 1.05;
  }

  /** Welt-Position → CSS-Pixel. */
  toScreen(v3) {
    const v = v3.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, behind: v.z > 1 };
  }

  loop() {
    requestAnimationFrame(this.loop);
    // Kartenbewegung darf große Schritte machen (Tab im Hintergrund), Partikel nicht.
    const raw = Math.min(this.clock.getDelta(), 0.5);
    const dt = Math.min(raw, 0.05);
    this.time += dt;
    this.themeUpdate?.(dt, this.time);
    for (const fn of this.updaters) fn(raw, this.time);
    this.renderer.render(this.scene, this.camera);
  }
}
