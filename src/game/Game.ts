import * as THREE from 'three';
import { World, N, S, HALF, nodePos, cornerSpot } from './world';
import { Particles } from './particles';
import { Input, settings, clamp, damp, rand, pick, angDiff, smooth, TAU } from './util';
import { GameAudio } from './audio';
import { Player } from './player';
import { Vehicle, CIV_TYPES, collideVehicles } from './vehicle';
import { Ped, PedKind } from './peds';
import { P } from './character';
import { makeAI, driveAI, roadSpawn, snapAI } from './traffic';
import { WMAP, WEAPONS, makeWeaponMesh, WDef } from './weapons';
import * as C from './combat';
import { JOBS, JOB_SPOTS, SERVICE_SPOTS, MissionRun, introShots } from './missions';
import { Career, type CareerView } from './career';

export interface Marker {
  id: number; x: number; z: number; color: number; radius: number; label?: string;
  kind: 'job' | 'service' | 'objective'; auto: boolean; icon: string;
  group: THREE.Group; jobId?: string; serviceId?: string; cool: number; ring: THREE.Mesh; beam: THREE.Mesh; sprite: THREE.Sprite;
}
interface Pickup { mesh: THREE.Object3D; type: 'cash' | 'weapon' | 'health' | 'armor'; x: number; z: number; value: number; wid?: string; respawn: number; active: boolean; t: number }
interface Shot { dur: number; from: () => THREE.Vector3; to?: () => THREE.Vector3; look: () => THREE.Vector3; lookTo?: () => THREE.Vector3; fov?: number; who?: string; text?: string }
interface CutRun { shots: Shot[]; i: number; t: number; onEnd?: () => void }
interface Heli { group: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D; x: number; y: number; z: number; vx: number; vz: number; hp: number; fireCd: number; ang: number; light: THREE.SpotLight; yaw: number; burst: number }

export interface Hud {
  state: string; money: number; hp: number; armor: number; stars: number; evading: boolean;
  weapon: string; wid: string; mag: number; reserve: number; melee: boolean; reloading: boolean;
  speed: number; inVehicle: boolean; vehName: string; hp2: number; clock: string;
  mission: { title: string; objective: string; timer?: number } | null;
  prompt: string; subtitle: { who: string; text: string } | null; toasts: { id: number; text: string }[];
  wasted: boolean; slow: number; bullet: number; bulletOn: boolean; cutscene: boolean; scope: boolean; dmg: number;
  crosshair: boolean; firstPerson: boolean; hit: number; kills: number; mapZoom: number; fps: number;
  shop: { id: string; name: string; desc: string; price: number; owned: boolean; ammoPrice: number; ammo: number }[] | null;
  weaponsOwned: { id: string; name: string; cur: boolean }[]; radio: boolean; wantedLevelName: string;
  career: CareerView;
}

const QUAL = {
  low: { pr: 0.6, sh: false, size: 1024, veh: 12, peds: 20 },
  medium: { pr: 0.85, sh: true, size: 1024, veh: 20, peds: 34 },
  high: { pr: 1.25, sh: true, size: 2048, veh: 28, peds: 46 },
  ultra: { pr: 2, sh: true, size: 4096, veh: 36, peds: 60 },
};

const labelCache = new Map<string, THREE.CanvasTexture>();
function labelTexture(icon: string, label: string, color: number) {
  const key = icon + label + color;
  let t = labelCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  const col = '#' + new THREE.Color(color).getHexString();
  g.fillStyle = 'rgba(8,10,16,0.82)';
  g.beginPath(); g.arc(128, 46, 38, 0, TAU); g.fill();
  g.lineWidth = 5; g.strokeStyle = col; g.stroke();
  g.fillStyle = col;
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(icon, 128, 48);
  if (label) {
    g.font = 'bold 20px system-ui, sans-serif';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(label, 128, 108);
    g.fillStyle = '#fff';
    g.fillText(label, 128, 108);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, t);
  return t;
}

export class Game {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  input: Input;
  audio = new GameAudio();
  career = new Career();
  smoke: Particles;
  fx: Particles;
  player = new Player();
  vehicles: Vehicle[] = [];
  peds: Ped[] = [];
  projectiles: C.Projectile[] = [];
  pickups: Pickup[] = [];
  markers: Marker[] = [];
  tracers: { mesh: THREE.Mesh; life: number }[] = [];
  tracerIdx = 0;
  shocks: { mesh: THREE.Mesh; t: number; r: number }[] = [];
  flashLight: THREE.PointLight;
  flashT = 0;
  heli: Heli | null = null;
  state: 'menu' | 'playing' | 'paused' | 'shop' = 'menu';
  time = 0;
  frame = 0;
  timeScale = 1;
  slowT = 0; slowScale = 1; slowCool = 0;
  bullet = false; bulletEnergy = 100;
  money = 500; heat = 0; stars = 0; evadeT = 0;
  hitMarker = 0; shake = 0; dmgFlash = 0;
  camYaw = 0; camPitch = -0.15; camDist = 4.2; firstPerson = false; lookIdle = 0;
  cutscene: CutRun | null = null;
  subtitle: { who: string; text: string; t: number } | null = null;
  mission: MissionRun | null = null;
  missionId = '';
  completed = new Set<string>();
  toasts: { id: number; text: string; t: number }[] = [];
  toastId = 0;
  wasted = false; wastedT = 0;
  prompt = '';
  promptTarget: { type: 'marker'; m: Marker } | { type: 'vehicle'; v: Vehicle } | null = null;
  lastFireByPlayer = false;
  kills = 0;
  menuAngle = 0;
  mapZoom = 0;
  minimap?: HTMLCanvasElement;
  radio = true;
  fps = 60;
  maxVeh = 28; maxPeds = 46;
  private raf = 0;
  private last = 0;
  private spawnT = 0; private pedT = 0; private copT = 0;
  private markerId = 1;
  private wasLocked = false;
  private vm: THREE.Group | null = null;
  private vmId = '';
  private focus = { x: 0, z: 0 };
  private hitCool = 0;
  private fpsAcc = 0; private fpsN = 0;
  private resizeFn: () => void;
  private disposed = false;
  private camPos = new THREE.Vector3();
  private fovCur = 70;


  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const cv = this.renderer.domElement;
    cv.style.cssText = 'display:block;width:100%;height:100%;';
    container.appendChild(cv);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = new World(this.scene);
    this.smoke = new Particles(this.scene, 1800, false);
    this.fx = new Particles(this.scene, 2400, true);
    this.input = new Input(cv);
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 90, 2);
    this.scene.add(this.flashLight);
    this.scene.add(this.player.ch.group);
    const tg = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, fog: false }));
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    const rg = new THREE.RingGeometry(0.8, 1, 48);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      this.shocks.push({ mesh: m, t: 1, r: 10 });
    }
    this.resizeFn = () => this.resize();
    window.addEventListener('resize', this.resizeFn);
    this.applyQuality();
    this.buildStatics();
    this.populate();
    this.resetPlayer();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ setup
  applyQuality() {
    const q = QUAL[settings.quality];
    this.renderer.setPixelRatio(Math.min(q.pr, window.devicePixelRatio * (settings.quality === 'ultra' ? 1.5 : 1)));
    this.renderer.shadowMap.enabled = q.sh;
    this.world.setShadows(q.sh, q.size);
    this.maxVeh = q.veh;
    this.maxPeds = q.peds;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.resize();
    this.audio.setVolume(settings.volume);
  }
  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildStatics() {
    for (const j of JOB_SPOTS) {
      const d = JOBS[j.id];
      const p = cornerSpot(j.i, j.j);
      const m = this.addMarker({ x: p.x, z: p.z, color: d.color, radius: 3.6, label: d.name.toUpperCase(), kind: 'job', auto: false, icon: d.icon });
      m.jobId = j.id;
    }
    for (const s of SERVICE_SPOTS) {
      const p = cornerSpot(s.i, s.j);
      const m = this.addMarker({ x: p.x + (s.id === 'safe' ? 0 : 0), z: p.z, color: s.color, radius: s.id === 'spray' ? 5 : 3.6, label: s.label, kind: 'service', auto: s.id === 'spray', icon: s.icon });
      m.serviceId = s.id;
    }
    const pk: [number, number, Pickup['type'], string?][] = [
      [7, 8, 'weapon', 'bat'], [9, 8, 'weapon', 'smg'], [6, 7, 'weapon', 'shotgun'], [10, 10, 'weapon', 'magnum'], [8, 10, 'weapon', 'grenade'],
      [11, 6, 'weapon', 'ak'], [5, 9, 'health'], [9, 6, 'armor'], [8, 6, 'health'], [11, 11, 'armor'], [6, 6, 'weapon', 'sniper'],
      [12, 8, 'weapon', 'rpg'], [4, 8, 'weapon', 'flame'], [13, 10, 'weapon', 'minigun'], [10, 3, 'health'], [3, 12, 'armor'], [7, 12, 'weapon', 'shotgun'],
      [12, 14, 'weapon', 'ak'], [2, 5, 'weapon', 'smg'], [14, 5, 'health'], [10, 12, 'weapon', 'silenced'], [5, 3, 'weapon', 'silenced'],
    ];
    for (const [i, j, t, w] of pk) {
      const p = cornerSpot(i, j);
      this.createPickup(t, p.x + 2.5, p.z + 2.5, { wid: w, respawn: 90 });
    }
  }

  populate() {
    const fx = this.focus.x, fz = this.focus.z;
    for (let k = 0; k < this.maxVeh * 3 && this.vehicles.filter((v) => !v.keep).length < this.maxVeh; k++) this.spawnTraffic(fx, fz, 25, 260);
    for (let k = 0; k < this.maxPeds * 3 && this.peds.filter((p) => !p.mission).length < this.maxPeds; k++) this.spawnAmbientPed(fx, fz, 15, 150);
  }

  clearWorld() {
    this.mission?.cleanup();
    this.mission = null;
    for (const v of [...this.vehicles]) this.removeVehicle(v);
    for (const p of [...this.peds]) this.removePed(p);
    for (const m of [...this.markers]) this.removeMarker(m);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    if (this.heli) this.removeHeli();
  }

  resetPlayer() {
    const p = this.player;
    p.hp = 100; p.armor = 0; p.dead = false; p.veh = null; p.weapons = {}; p.owned = ['fist'];
    p.give('pistol', 60);
    p.cur = 'pistol';
    p.equipMesh();
    p.ragT = 0;
    if (p.ch.rag) p.ch.stopRagdoll();
    const s = cornerSpot(8, 8);
    p.x = s.x; p.z = s.z; p.y = 0; p.vx = 0; p.vz = 0; p.ch.x = s.x; p.ch.z = s.z; p.ch.yaw = Math.PI * 0.75;
    p.ch.group.visible = true;
    p.ch.applyPose();
    p.ch.sync();
    this.camYaw = Math.PI * 0.75;
    this.camPitch = -0.15;
  }

  // ------------------------------------------------------------ lifecycle
  startNewGame() {
    this.audio.init();
    this.clearWorld();
    this.heat = 0; this.stars = 0; this.money = 500; this.kills = 0;
    this.completed.clear();
    this.world.setTime(17.3);
    this.resetPlayer();
    this.career.reset(this);
    this.buildStatics();
    this.focus = { x: this.player.x, z: this.player.z };
    this.populate();
    const rp = { x: -7, z: 24 };
    const car = this.spawnVehicle('sports', rp.x, rp.z, 0, { color: '#c0392b' });
    if (car) car.ai = makeAI('idle', 0, 0, 0, 0, 0);
    this.beginPlay();
    this.startCutscene(introShots(this), () => this.toast('Walk to the gold ★ marker and press E'));
  }
  continueGame() {
    this.startNewGame();
    try {
      const s = JSON.parse(localStorage.getItem('meridian_save') || '{}');
      this.money = s.money ?? this.money;
      if (s.owned) {
        this.player.owned = s.owned;
        this.player.weapons = s.weapons || {};
        this.player.cur = s.cur && s.owned.includes(s.cur) ? s.cur : 'pistol';
        this.player.equipMesh();
      }
      this.completed = new Set(s.completed || []);
      this.player.armor = s.armor || 0;
      if (s.time !== undefined) this.world.setTime(s.time);
      this.kills = s.kills || 0;
      this.career.load(s.career, this);
      this.player.hp = Math.min(this.career.perks.maxHp, Math.max(1, s.hp ?? this.career.perks.maxHp));
    } catch { /* ignore */ }
    this.cutscene = null;
    this.subtitle = null;
    this.toast('Game loaded');
  }
  static hasSave() {
    try { return !!localStorage.getItem('meridian_save'); } catch { return false; }
  }
  save() {
    try {
      localStorage.setItem('meridian_save', JSON.stringify({
        money: this.money, owned: this.player.owned, weapons: this.player.weapons, cur: this.player.cur,
        completed: [...this.completed], time: this.world.time, armor: this.player.armor, kills: this.kills,
        hp: this.player.hp, career: this.career.serialize(),
      }));
    } catch { /* ignore */ }
  }
  beginPlay() {
    this.state = 'playing';
    this.input.enabled = true;
    this.input.lock();
    this.audio.init();
    if (settings.music) { this.audio.stopMusic(); this.audio.startMusic(104); }
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.input.mouse = [false, false, false];
  }
  resume() {
    if (this.state !== 'paused' && this.state !== 'shop') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.input.lock();
  }
  toMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.audio.stopMusic();
    this.audio.init();
    if (settings.music) this.audio.startMusic(92);
    this.cutscene = null;
    this.subtitle = null;
    this.bullet = false;
    this.player.veh = null;
  }
  menuMusic() {
    this.audio.init();
    if (settings.music && !this.audio.radioOn) this.audio.startMusic(92);
  }
  toggleRadio() {
    this.radio = !this.radio;
    if (this.radio) this.audio.startMusic(104); else this.audio.stopMusic();
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeFn);
    this.input.dispose();
    this.audio.stopMusic();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------ spawning helpers
  spawnVehicle(key: string, x: number, z: number, yaw: number, opts: { color?: string; keep?: boolean; driver?: boolean } = {}) {
    const v = new Vehicle(key, opts.color);
    v.place(x, z, yaw);
    v.keep = !!opts.keep;
    v.hasDriver = !!opts.driver;
    if (!opts.driver) v.ai = makeAI('idle', 0, 0, 0, 0, 0);
    this.scene.add(v.group);
    this.vehicles.push(v);
    return v;
  }
  removeVehicle(v: Vehicle) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    v.dispose(this.scene);
  }
  spawnPed(kind: PedKind, x: number, z: number, opts: { mission?: boolean } = {}) {
    const p = new Ped(kind, x, z);
    p.mission = !!opts.mission;
    this.scene.add(p.ch.group);
    this.peds.push(p);
    return p;
  }
  removePed(p: Ped) {
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
    this.scene.remove(p.ch.group);
  }
  roadPoint(x: number, z: number) {
    const i = clamp(Math.round(x / S + N / 2), 0, N), j = clamp(Math.round(z / S + N / 2), 0, N);
    const c = nodePos(i, j);
    if (Math.abs(x - c.x) <= Math.abs(z - c.z)) return { x: c.x - 7, z: clamp(z + 9, c.z - 32, c.z + 32), yaw: 0 };
    return { x: clamp(x + 9, c.x - 32, c.x + 32), z: c.z + 7, yaw: Math.PI / 2 };
  }
  spawnTraffic(fx: number, fz: number, minD: number, maxD: number) {
    const s = roadSpawn(fx, fz, minD, maxD);
    if (!s) return;
    for (const o of this.vehicles) if (Math.hypot(o.x - s.x, o.z - s.z) < 9) return;
    if (Math.hypot(this.player.x - s.x, this.player.z - s.z) < 25) return;
    const type = Math.random() < 0.06 && this.stars === 0 ? 'police' : pick(CIV_TYPES);
    const v = this.spawnVehicle(type, s.x, s.z, s.yaw, { driver: true });
    v.ai = makeAI('traffic', s.i, s.j, s.dir, s.lane, rand(10, 17) * (type === 'bus' ? 0.8 : 1));
    v.ai.wps = [];
  }
  spawnAmbientPed(fx: number, fz: number, minD: number, maxD: number) {
    const a = rand(0, TAU), r = rand(minD, maxD);
    const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
    const cell = this.world.cellAt(x, z);
    if (!cell || cell.park) return;
    const side = Math.floor(Math.random() * 4);
    const t = rand(-26, 26);
    const px = side < 2 ? cell.cx + (side === 0 ? 27.5 : -27.5) : cell.cx + t;
    const pz = side < 2 ? cell.cz + t : cell.cz + (side === 2 ? 27.5 : -27.5);
    if (Math.hypot(px - this.player.x, pz - this.player.z) < 12) return;
    const kind: PedKind = Math.random() < 0.07 ? 'gang' : 'civ';
    this.spawnPed(kind, px, pz);
  }

  // ------------------------------------------------------------ markers / pickups
  addMarker(o: { x: number; z: number; color: number; radius?: number; label?: string; kind: Marker['kind']; auto?: boolean; icon?: string }): Marker {
    const radius = o.radius ?? 4;
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    beam.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.82, radius, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.y = 0.12;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(o.icon || '●', o.label || '', o.color), transparent: true, depthWrite: false, fog: false }));
    sprite.position.y = 7;
    sprite.scale.set(8, 4, 1);
    group.add(beam, ring, sprite);
    group.position.set(o.x, 0, o.z);
    this.scene.add(group);
    const m: Marker = { id: this.markerId++, x: o.x, z: o.z, color: o.color, radius, label: o.label, kind: o.kind, auto: !!o.auto, icon: o.icon || '●', group, cool: 0, ring, beam, sprite };
    this.markers.push(m);
    return m;
  }
  removeMarker(m: Marker | null) {
    if (!m) return;
    const i = this.markers.indexOf(m);
    if (i >= 0) this.markers.splice(i, 1);
    this.scene.remove(m.group);
    m.ring.geometry.dispose();
    m.beam.geometry.dispose();
  }
  createPickup(type: Pickup['type'], x: number, z: number, o: { wid?: string; value?: number; respawn?: number } = {}) {
    let mesh: THREE.Object3D;
    const glow = (c: number) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      r.position.y = -0.55;
      return r;
    };
    if (type === 'cash') {
      mesh = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.28), new THREE.MeshStandardMaterial({ color: 0x3fbf5f, emissive: 0x1f7f3f, emissiveIntensity: 0.8 }));
      mesh.add(b, glow(0x44ff77));
    } else if (type === 'weapon') {
      const g = new THREE.Group();
      const wm = makeWeaponMesh(o.wid || 'pistol');
      if (wm) { wm.scale.setScalar(1.7); wm.rotation.y = Math.PI / 2; g.add(wm); }
      g.add(glow(0x55aaff));
      mesh = g;
    } else {
      const g = new THREE.Group();
      const col = type === 'health' ? 0xff3355 : 0x3388ff;
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.38), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9 })), glow(col));
      mesh = g;
    }
    mesh.position.set(x, 1.0, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, type, x, z, value: o.value ?? 0, wid: o.wid, respawn: o.respawn ?? -1, active: true, t: Math.random() * 6 });
  }
  private updatePickups(dt: number) {
    const pl = this.player;
    const px = pl.veh ? pl.veh.x : pl.x, pz = pl.veh ? pl.veh.z : pl.z;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p.active) {
        p.respawn -= dt;
        if (p.respawn <= 0 && p.respawn > -500) { p.active = true; p.mesh.visible = true; }
        continue;
      }
      p.t += dt;
      const d = Math.hypot(p.x - px, p.z - pz);
      p.mesh.visible = d < 260;
      if (!p.mesh.visible) continue;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.0 + Math.sin(p.t * 2.5) * 0.12;
      if (d < (pl.veh ? 3.2 : 1.7) && !pl.dead) {
        let ok = true;
        if (p.type === 'cash') { this.addMoney(p.value); this.toast(`+$${p.value}`); this.audio.ui(); }
        else if (p.type === 'health') {
          const cap = this.career.perks.maxHp;
          if (pl.hp >= cap) ok = false; else { pl.hp = Math.min(cap, pl.hp + 50); this.toast('Health +50'); this.audio.ui(); }
        }
        else if (p.type === 'armor') { if (pl.armor >= 100) ok = false; else { pl.armor = 100; this.toast('Body armor'); this.audio.ui(); } }
        else if (p.type === 'weapon') {
          const w = WMAP[p.wid!];
          pl.give(w.id, w.kind === 'melee' ? 0 : w.buy);
          this.toast(`Picked up ${w.name}`);
          this.audio.ui();
        }
        if (ok) {
          if (p.respawn > 0) { p.active = false; p.mesh.visible = false; p.respawn = 90; }
          else { this.scene.remove(p.mesh); this.pickups.splice(i, 1); }
        }
      }
    }
  }

  // ------------------------------------------------------------ messaging
  toast(text: string) {
    this.toasts.push({ id: this.toastId++, text, t: 3.2 });
    if (this.toasts.length > 5) this.toasts.shift();
  }
  say(who: string, text: string, dur = 4) {
    this.subtitle = { who, text, t: dur };
  }
  addMoney(n: number) { this.money += n; this.career.onCash(this, n); }
  vol(x: number, z: number) {
    const d = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
    return Math.pow(clamp(1 - d / 170, 0, 1), 1.6);
  }
  near(x: number, z: number, r: number) {
    const pl = this.player;
    const px = pl.veh ? pl.veh.x : pl.x, pz = pl.veh ? pl.veh.z : pl.z;
    return Math.hypot(px - x, pz - z) < r;
  }

  // ------------------------------------------------------------ cutscenes
  startCutscene(shots: Shot[], onEnd?: () => void) {
    this.cutscene = { shots, i: 0, t: 0, onEnd };
    this.input.mouse = [false, false, false];
    this.bullet = false;
  }
  private updateCutscene(dtReal: number) {
    const c = this.cutscene!;
    const s = c.shots[c.i];
    c.t += dtReal;
    if (this.input.p('Enter') || this.input.p('Space') || this.input.p('Escape')) { c.i = c.shots.length; }
    else {
      const u = smooth(c.t / s.dur);
      const a = s.from(), b = s.to ? s.to() : a;
      this.camera.position.lerpVectors(a, b, u);
      const la = s.look(), lb = s.lookTo ? s.lookTo() : la;
      const l = new THREE.Vector3().lerpVectors(la, lb, u);
      this.camera.lookAt(l);
      this.camera.fov = damp(this.camera.fov, s.fov ?? 55, 4, dtReal);
      this.camera.updateProjectionMatrix();
      if (s.text) this.subtitle = { who: s.who || '', text: s.text, t: 0.3 };
      if (c.t >= s.dur) { c.i++; c.t = 0; }
    }
    if (c.i >= c.shots.length) {
      this.cutscene = null;
      this.subtitle = null;
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
      c.onEnd?.();
    }
  }

  // ------------------------------------------------------------ missions
  startJob(id: string) {
    if (this.mission) { this.toast('Finish or abandon your current job first.'); return; }
    const def = JOBS[id];
    const run = def.start(this);
    if (run) {
      this.mission = run;
      this.missionId = id;
      this.audio.ui();
      this.toast(`Job started: ${def.name}`);
    }
  }
  abandonMission() {
    if (this.mission) this.failMission('Job abandoned.');
  }
  completeMission(reward: number, msg: string) {
    if (!this.mission) return;
    const pay = this.career.reward(reward);
    this.addMoney(pay);
    this.toast(`${msg}  +$${pay.toLocaleString()}`);
    this.audio.success();
    this.completed.add(this.missionId);
    this.mission.cleanup();
    this.mission = null;
    this.career.onJob(this, pay);
    this.save();
  }
  failMission(reason: string) {
    if (!this.mission) return;
    this.toast(`JOB FAILED — ${reason}`);
    this.audio.fail();
    this.mission.cleanup();
    this.mission = null;
  }

  // ------------------------------------------------------------ shop / interact
  openShop() {
    this.state = 'shop';
    this.input.unlock();
  }
  closeShop() { this.resume(); }
  buy(id: string) {
    const pl = this.player;
    const armorPrice = this.career.price(300), healthPrice = this.career.price(100);
    if (id === 'armor') { if (this.money >= armorPrice) { this.money -= armorPrice; pl.armor = 100; this.audio.ui(); } return; }
    if (id === 'health') { if (this.money >= healthPrice) { this.money -= healthPrice; pl.hp = this.career.perks.maxHp; this.audio.ui(); } return; }
    const w = WMAP[id];
    if (!w) return;
    const price = this.career.price(w.price);
    if (!pl.owned.includes(id)) {
      if (this.money >= price) { this.money -= price; pl.give(id, w.buy); this.audio.ui(); pl.select(id); }
    } else if (w.kind !== 'melee') {
      const ap = this.ammoPrice(w);
      if (this.money >= ap) { this.money -= ap; pl.give(id, w.buy); this.audio.ui(); }
    }
  }
  ammoPrice(w: WDef) { return this.career.price(Math.max(40, Math.round((w.price * 0.1) / 10) * 10)); }
  buyProperty(id: string) { return this.career.buyProperty(this, id); }
  shopItems() {
    const pl = this.player;
    const items = WEAPONS.filter((w) => w.price > 0).map((w) => ({
      id: w.id, name: w.name, desc: w.desc, price: this.career.price(w.price), owned: pl.owned.includes(w.id), ammoPrice: this.ammoPrice(w),
      ammo: pl.weapons[w.id] ? pl.weapons[w.id].mag + pl.weapons[w.id].reserve : 0,
    }));
    items.push({ id: 'armor', name: 'Body Armor', desc: 'Absorbs bullets.', price: this.career.price(300), owned: false, ammoPrice: 0, ammo: 0 });
    items.push({ id: 'health', name: 'Medkit', desc: 'Restore to full health.', price: this.career.price(100), owned: false, ammoPrice: 0, ammo: 0 });
    return items;
  }
  activateMarker(m: Marker) {
    if (m.cool > 0) return;
    if (m.kind === 'job') this.startJob(m.jobId!);
    else if (m.serviceId === 'ammu') this.openShop();
    else if (m.serviceId === 'safe') {
      this.player.hp = this.career.perks.maxHp;
      this.save();
      this.toast('Game saved. Health restored.');
      this.audio.success();
      m.cool = 3;
    } else if (m.serviceId === 'spray') {
      const v = this.player.veh;
      if (!v) { this.toast("Drive a vehicle into the Pay 'n' Spray."); m.cool = 2; return; }
      if (this.money < 500) { this.toast('Not enough cash ($500).'); m.cool = 3; return; }
      this.money -= 500;
      v.repair(pick(['#c0392b', '#2980b9', '#f1c40f', '#8e44ad', '#16a085', '#111', '#eee', '#e67e22']));
      this.clearWanted();
      this.toast("Fresh paint! Wanted level cleared.");
      this.audio.success();
      m.cool = 6;
    }
  }
  interact() {
    const t = this.promptTarget;
    if (!t) return;
    if (t.type === 'marker') this.activateMarker(t.m);
    else this.player.enter(this, t.v);
  }
  private computePrompt() {
    this.prompt = '';
    this.promptTarget = null;
    const pl = this.player;
    if (this.cutscene || pl.dead || this.state !== 'playing') return;
    const px = pl.veh ? pl.veh.x : pl.x, pz = pl.veh ? pl.veh.z : pl.z;
    const key = pl.veh ? 'F' : 'E';
    for (const m of this.markers) {
      if (m.kind === 'objective') continue;
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d < m.radius + 1.2) {
        if (m.auto && pl.veh && pl.veh.speed < 12) { this.activateMarker(m); continue; }
        this.promptTarget = { type: 'marker', m };
        const name = m.kind === 'job' ? `Start job: ${JOBS[m.jobId!].name}` : m.serviceId === 'ammu' ? 'Enter Ammu-Nation' : m.serviceId === 'safe' ? 'Rest & save game' : "Pay 'n' Spray — $500 (drive in)";
        this.prompt = `${key}  ${name}`;
        return;
      }
    }
    if (!pl.veh) {
      let best: Vehicle | null = null, bd = 4.2;
      for (const v of this.vehicles) {
        if (v.exploded || v.hp <= 0) continue;
        const d = Math.hypot(v.x - pl.x, v.z - pl.z) - v.t.L * 0.2;
        if (d < bd) { bd = d; best = v; }
      }
      if (best) {
        this.promptTarget = { type: 'vehicle', v: best };
        this.prompt = `E  ${best.hasDriver ? 'Carjack' : 'Enter'} ${best.t.name}`;
      }
    }
  }

  // ------------------------------------------------------------ wanted / damage
  starsFromHeat(h: number) {
    const th = [6, 28, 65, 120, 200];
    let s = 0;
    for (const t of th) if (h >= t) s++;
    return s;
  }
  addHeat(n: number, _why: string, needsWitness = false) {
    void _why;
    if (this.player.dead || this.cutscene) return;
    if (needsWitness) {
      let seen = false;
      const pl = this.player;
      for (const p of this.peds) if (!p.dead && Math.hypot(p.x - pl.x, p.z - pl.z) < 38) { seen = true; break; }
      if (!seen) for (const v of this.vehicles) if (v.hasDriver && Math.hypot(v.x - pl.x, v.z - pl.z) < 30) { seen = true; break; }
      if (!seen) n *= 0.1;
    }
    this.heat = clamp(this.heat + n, 0, 320);
    this.evadeT = 0;
    this.stars = this.starsFromHeat(this.heat);
  }
  setHeat(n: number) {
    this.heat = n;
    this.stars = this.starsFromHeat(n);
    this.evadeT = 0;
  }
  clearWanted() {
    if (this.stars > 0) this.career.onWantedClear(this, this.stars);
    this.heat = 0;
    this.stars = 0;
    this.evadeT = 0;
    this.convertCops();
  }
  private convertCops() {
    for (const v of this.vehicles) {
      if (v.isPolice && v.ai && v.ai.mode === 'pursuit') { v.ai.mode = 'traffic'; v.siren = false; v.ai.direct = false; snapAI(v); v.ai.cruise = 13; }
    }
  }
  private updateWanted(dt: number) {
    if (this.stars > 0 || this.heat > 0) {
      const pl = this.player;
      let seen = false;
      for (const v of this.vehicles) if (v.isPolice && v.siren && Math.hypot(v.x - pl.x, v.z - pl.z) < 75) { seen = true; break; }
      if (!seen) for (const p of this.peds) if (p.kind === 'cop' && !p.dead && Math.hypot(p.x - pl.x, p.z - pl.z) < 60) { seen = true; break; }
      if (this.heli && Math.hypot(this.heli.x - pl.x, this.heli.z - pl.z) < 90) seen = true;
      if (seen) this.evadeT = 0; else this.evadeT += dt;
      if (this.stars > 0) {
        if (this.evadeT > 7) this.heat -= 7 * dt;
      } else this.heat -= 1.2 * dt;
      this.heat = Math.max(0, this.heat);
      const ns = this.starsFromHeat(this.heat);
      if (ns < this.stars && ns === 0) { this.toast('Wanted level lost'); this.career.onWantedClear(this, this.stars); this.convertCops(); }
      this.stars = ns;
    }
  }
  damagePlayer(d: number, sx: number, sz: number, silent = false) {
    const pl = this.player;
    if (pl.dead || this.cutscene) return;
    if (pl.armor > 0) {
      const ab = Math.min(pl.armor, d * 0.65);
      pl.armor -= ab;
      d -= ab;
    }
    pl.hp -= d;
    if (!silent) this.dmgFlash = Math.min(1, this.dmgFlash + d * 0.04);
    if (pl.hp <= 0) {
      const dx = pl.x - sx, dz = pl.z - sz;
      const l = Math.hypot(dx, dz) || 1;
      pl.die(this, dx / l, dz / l);
    }
  }
  onPlayerDeath() {
    this.wasted = true;
    this.wastedT = 0;
    this.career.onDeath(this);
    this.bullet = false;
    this.slowmo(4, 0.25);
    this.audio.fail();
    if (this.mission) this.failMission('You died.');
  }
  private respawn() {
    const pl = this.player;
    this.wasted = false;
    pl.dead = false;
    pl.hp = this.career.perks.maxHp;
    pl.armor = 0;
    pl.ragT = 0;
    if (pl.ch.rag) pl.ch.stopRagdoll();
    const s = cornerSpot(8, 8);
    pl.x = s.x; pl.z = s.z; pl.y = 0; pl.vx = pl.vz = 0;
    pl.ch.x = s.x; pl.ch.z = s.z;
    pl.ch.group.visible = true;
    const fee = Math.min(500, Math.floor(this.money * 0.1));
    this.money -= fee;
    this.toast(`Hospital fees: -$${fee}`);
    this.clearWanted();
    this.timeScale = 1;
    this.slowT = 0;
  }
  onPedDeath(p: Ped, byPlayer: boolean) {
    if (byPlayer || p.killedByPlayer) {
      this.kills++;
      this.career.onKill(this, true);
      if (p.kind === 'civ') this.addHeat(9, 'murder', true);
      else if (p.kind === 'cop') this.addHeat(24, 'cop killer', false);
      else if (p.kind === 'gang') this.addHeat(1, 'gang', true);
      this.mission?.onKill?.(p);
    }
    const cash = p.kind === 'cop' ? Math.round(rand(60, 180)) : p.kind === 'gang' ? Math.round(rand(80, 300)) : p.kind === 'civ' ? Math.round(rand(10, 90)) : 0;
    if (cash) this.createPickup('cash', p.x, p.z, { value: cash, respawn: -1 });
    if (byPlayer && p.kind !== 'civ' && Math.random() < 0.2 && this.slowCool <= 0) { this.slowmo(0.6, 0.3); this.slowCool = 5; }
  }
  carjack(v: Vehicle) {
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const p = this.spawnPed('civ', v.x + cs * 2.1, v.z - sn * 2.1);
    p.panic(this.player.x, this.player.z, 12);
    p.vx = cs * 3; p.vz = -sn * 3;
    this.addHeat(9, 'carjack', true);
    this.toast('Carjacked!');
  }
  onEnterVehicle(v: Vehicle) {
    this.camDist = 7 + v.t.L * 0.4;
    this.lookIdle = 5;
    if (this.mapZoom < 0) this.mapZoom = 0;
  }
  onExitVehicle(_v: Vehicle) {
    void _v;
    this.camDist = 4.2;
    this.camPitch = -0.12;
  }
  honk(v: Vehicle, byPlayer = false) {
    this.audio.horn(byPlayer ? 0.8 : this.vol(v.x, v.z) * 0.7);
  }
  noise(x: number, z: number, r: number, fromPlayer: boolean) {
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r) {
        if (p.kind === 'civ' || p.kind === 'target') { if (p.state !== 'flee' || p.stateT < 2) p.panic(x, z, 6 + (r - d) * 0.1); }
        else if (p.kind === 'gang' && fromPlayer && d < r * 0.5) p.provoked = true;
      }
    }
    if (fromPlayer) for (const v of this.vehicles) {
      if (v.ai && v.hasDriver && !v.isPolice && Math.hypot(v.x - x, v.z - z) < r * 0.6) v.ai.panic = Math.max(v.ai.panic, 3);
    }
  }
  slowmo(dur: number, scale: number) {
    this.slowT = Math.max(this.slowT, dur);
    this.slowScale = this.slowT > dur ? Math.min(this.slowScale, scale) : scale;
  }

  // ------------------------------------------------------------ combat wrappers
  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, _o: string) {
    void _o;
    return C.castRay(this, ox, oy, oz, dx, dy, dz, range);
  }
  applyHit(hit: C.Hit, dmg: number, dir: THREE.Vector3, owner: 'player' | 'npc', muzzle: THREE.Vector3, wid: string) { C.applyHit(this, hit, dmg, dir, owner, muzzle, wid); }
  muzzleFlash(pos: THREE.Vector3, s: number) { C.muzzleFlash(this, pos, s); }
  spawnProjectile(kind: 'rocket' | 'grenade', pos: THREE.Vector3, vel: THREE.Vector3, fuse: number) { C.spawnProjectile(this, kind, pos, vel, fuse); }
  flame(pos: THREE.Vector3, dir: THREE.Vector3, owner: 'player' | 'npc') { C.flame(this, pos, dir, owner); }
  meleeHit(_p: Player, w: WDef) { C.meleeHit(this, w); }
  npcShoot(ped: Ped, dmg: number, chance: number) { C.npcShoot(this, ped, dmg, chance); }
  addShock(x: number, y: number, z: number, r: number) {
    const s = this.shocks.reduce((a, b) => (a.t > b.t ? a : b));
    s.t = 0; s.r = r * 1.6;
    s.mesh.position.set(x, Math.max(0.3, y * 0.3), z);
    s.mesh.visible = true;
  }
  spark(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) this.fx.emit(x, y, z, rand(-4, 4), rand(0, 5), rand(-4, 4), 0.14, 0, 1, rand(0.7, 0.95), 0.4, rand(0.15, 0.4), 1, 14, 0.5);
  }
  blood(x: number, y: number, z: number, dx: number, dz: number, n: number) {
    const l = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < n; i++) this.smoke.emit(x, y, z, (dx / l) * rand(1, 4) + rand(-1.5, 1.5), rand(0, 3), (dz / l) * rand(1, 4) + rand(-1.5, 1.5), rand(0.18, 0.35), 0.1, 0.65, 0.02, 0.03, rand(0.4, 0.8), 0.9, 12, 0.6);
  }
  muzzlePos(): THREE.Vector3 {
    const pl = this.player;
    if (this.firstPerson && !pl.veh) {
      const d = new THREE.Vector3();
      this.camera.getWorldDirection(d);
      const r = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
      return this.camera.position.clone().addScaledVector(d, 0.9).addScaledVector(r, 0.2).add(new THREE.Vector3(0, -0.13, 0));
    }
    const ch = pl.ch;
    const h = new THREE.Vector3(ch.pos[P.rHand * 3], ch.pos[P.rHand * 3 + 1], ch.pos[P.rHand * 3 + 2]);
    const len = (ch.weapon?.userData.len as number) || 0.4;
    return h.addScaledVector(ch.weaponDir, len);
  }

  // ------------------------------------------------------------ explosions & vehicles
  private explodeVehicle(v: Vehicle) {
    if (v.exploded) return;
    const byPlayer = this.lastFireByPlayer;
    if (v.playerIn) {
      const pl = this.player;
      pl.exit(this, true);
      this.damagePlayer(35, v.x, v.z);
      pl.knock(rand(-5, 5), 8, rand(-5, 5), 2.5);
    }
    v.burning = false;
    v.exploded = true;
    v.ai = null;
    v.hasDriver = false;
    v.siren = false;
    v.engineOn = false;
    C.explode(this, v.x, 1, v.z, 8.5, 85, byPlayer);
    v.exploded = true;
    v.wreck();
    v.vy = 7 + rand(0, 3);
    v.spinX = rand(-4, 4);
    v.spinZ = rand(-4, 4);
    v.wreckT = 0;
  }
  private handleImpact(v: Vehicle) {
    const im = v.impact!;
    const vol = this.vol(v.x, v.z);
    if (im.speed > 3) this.audio.crash(vol * clamp(im.speed / 14, 0.25, 1));
    this.spark(im.px, 0.8, im.pz, clamp(Math.round(im.speed), 2, 12));
    if (v.playerIn) {
      this.shake = Math.max(this.shake, im.speed * 0.035);
      if (im.speed > 13) this.damagePlayer((im.speed - 13) * 1.4, v.x - im.nx, v.z - im.nz);
      if (im.speed > 24 && this.slowCool <= 0) { this.slowmo(0.7, 0.3); this.slowCool = 5; }
      if (im.speed > 6) this.addHeat(1.3, 'collision', true);
      this.hitCool = 0;
    } else if (v.ai && v.hasDriver && im.speed > 4) v.ai.panic = Math.max(v.ai.panic, 2);
    if (v.hp <= 0 && !v.burning && !v.exploded) { v.burning = true; v.burnT = 0; this.lastFireByPlayer = v.playerIn; }
  }
  private vehicleFx(v: Vehicle, dt: number) {
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const hx = v.x + sn * v.t.L * 0.3, hz = v.z + cs * v.t.L * 0.3;
    if (!v.exploded && v.hp < 45 && Math.random() < dt * 14) this.smoke.emit(hx, 1.1, hz, rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3), 0.7, 2.5, 0.25, 0.25, 0.25, 1.4, 0.55, -0.5, 0.8);
    if (v.burning && !v.exploded) {
      v.burnT += dt;
      for (let i = 0; i < 2; i++) this.fx.emit(hx + rand(-0.5, 0.5), 1.0, hz + rand(-0.5, 0.5), rand(-0.4, 0.4), rand(2, 4), rand(-0.4, 0.4), rand(0.8, 1.4), 1, 1, rand(0.4, 0.7), 0.1, 0.45, 0.9, -2, 1);
      if (Math.random() < dt * 20) this.smoke.emit(hx, 1.3, hz, rand(-0.3, 0.3), rand(2, 3.5), rand(-0.3, 0.3), 1, 3, 0.08, 0.08, 0.08, 1.8, 0.7, -0.5, 0.8);
      if (v.burnT > 4.6) this.explodeVehicle(v);
    }
    if (v.exploded) {
      v.wreckT += dt;
      if (v.wreckT < 35 && Math.random() < dt * 18) {
        this.fx.emit(v.x + rand(-1, 1), 0.7, v.z + rand(-1.5, 1.5), 0, rand(1.5, 3), 0, rand(0.7, 1.2), 1, 1, rand(0.3, 0.6), 0.1, 0.5, 0.8, -2, 1);
        if (Math.random() < 0.4) this.smoke.emit(v.x, 1.5, v.z, rand(-0.4, 0.4), rand(2, 3), rand(-0.4, 0.4), 1.2, 4, 0.06, 0.06, 0.06, 2.2, 0.6, -0.5, 0.8);
      }
    }
    if (v.lastDrift > 4.5 && v.speed > 6 && v.y < 0.05 && !v.exploded) {
      const dx = v.x - this.camera.position.x, dz = v.z - this.camera.position.z;
      if (dx * dx + dz * dz < 6400) {
        for (const s of [-1, 1]) {
          this.smoke.emit(v.x - sn * v.t.L * 0.3 + cs * s * v.t.W * 0.4, 0.2, v.z - cs * v.t.L * 0.3 - sn * s * v.t.W * 0.4, rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), 0.8, 2.5, 0.75, 0.75, 0.75, 0.9, 0.35, -0.2, 1.2);
        }
        if (v.playerIn) this.shake = Math.max(this.shake, 0.04);
      }
    }
  }

  private updateVehicles(dt: number, fx: number, fz: number) {
    const vs = this.vehicles;
    for (const v of vs) {
      const dist = Math.hypot(v.x - fx, v.z - fz);
      v.group.visible = dist < 430;
      if (dist > 380 && !v.playerIn && !v.keep) continue;
      if (!v.playerIn) {
        if (v.ai) driveAI(this, v, dt);
        else { v.throttle = 0; v.brake = 0.2; v.steer = 0; v.hand = 0; }
      }
      v.impact = null;
      v.step(dt, this.world);
      if (v.wreckT > 0 || v.exploded) { /* wreck */ }
    }
    for (let a = 0; a < vs.length; a++) {
      const A = vs[a];
      if (Math.abs(A.x - fx) > 330 || Math.abs(A.z - fz) > 330) continue;
      for (let b = a + 1; b < vs.length; b++) {
        const B = vs[b];
        if (Math.abs(A.x - B.x) > 12 || Math.abs(A.z - B.z) > 12) continue;
        collideVehicles(A, B);
      }
    }
    let sirenVol = 0;
    for (const v of vs) {
      if (v.impact) this.handleImpact(v);
      if (!v.group.visible) continue;
      this.vehicleFx(v, dt);
      v.syncMesh(dt);
      if (v.isPolice) {
        v.setSiren(v.siren && !v.exploded, this.time);
        if (v.siren) sirenVol = Math.max(sirenVol, this.vol(v.x, v.z));
      }
    }
    this.audio.siren(sirenVol, this.time);
    // vehicle vs peds
    for (const v of vs) {
      const sp = v.speed;
      if (sp < 2 || !v.group.visible) continue;
      const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
      const reach = v.t.L / 2 + 2;
      for (const p of this.peds) {
        if (Math.abs(p.x - v.x) > reach || Math.abs(p.z - v.z) > reach) continue;
        if (p.dead) {
          for (const c of v.circles) p.ch.pushFromCircle(v.x + sn * c.z, v.z + cs * c.z, c.r, v.vx, v.vz);
          continue;
        }
        for (const c of v.circles) {
          if (Math.hypot(p.x - (v.x + sn * c.z), p.z - (v.z + cs * c.z)) < c.r + 0.35) {
            const dx = v.vx / sp, dz = v.vz / sp;
            p.hurt(this, sp * 10, dx + cs * rand(-0.3, 0.3), dz - sn * rand(-0.3, 0.3), 4, v.playerIn, sp * 0.9);
            if (v.playerIn) this.addHeat(3, 'hit and run', true);
            this.audio.thud(this.vol(p.x, p.z));
            this.blood(p.x, 1, p.z, dx, dz, 8);
            if (v.playerIn && sp > 20 && this.slowCool <= 0) { this.slowmo(0.7, 0.3); this.slowCool = 4; }
            if (!v.playerIn && v.ai && v.ai.mode === 'pursuit') v.ai.ignoreT = 1;
            break;
          }
        }
      }
      const pl = this.player;
      if (!pl.veh && !pl.dead && pl.ragT <= 0 && this.hitCool > 1 && sp > 5 && !v.playerIn) {
        for (const c of v.circles) {
          if (Math.hypot(pl.x - (v.x + sn * c.z), pl.z - (v.z + cs * c.z)) < c.r + 0.55) {
            this.damagePlayer(sp * 1.3, v.x, v.z);
            pl.knock(v.vx * 0.8, 4, v.vz * 0.8, 2.4);
            this.audio.thud(1);
            this.shake = Math.max(this.shake, 0.5);
            this.hitCool = 0;
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ managers
  private manageTraffic(dt: number) {
    const fx = this.focus.x, fz = this.focus.z;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.3;
      const n = this.vehicles.filter((v) => !v.keep && !v.playerIn).length;
      if (n < this.maxVeh) this.spawnTraffic(fx, fz, 130, 280);
    }
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.keep || v.playerIn) continue;
      const d = Math.hypot(v.x - fx, v.z - fz);
      if (d > 350 || (v.exploded && v.wreckT > 55 && d > 40)) this.removeVehicle(v);
    }
  }
  private manageCops(dt: number) {
    const pl = this.player;
    const cars = this.vehicles.filter((v) => v.isPolice && v.ai && v.ai.mode === 'pursuit');

    const want = [0, 1, 2, 4, 5, 7][this.stars];
    this.copT -= dt;
    if (this.stars > 0 && !pl.dead && cars.length < want && this.copT <= 0) {
      this.copT = 2.2;
      const px = pl.veh ? pl.veh.x : pl.x, pz = pl.veh ? pl.veh.z : pl.z;
      const s = roadSpawn(px, pz, 110, 200);
      if (s && !this.vehicles.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 9)) {
        const v = this.spawnVehicle('police', s.x, s.z, s.yaw, { driver: true });
        v.ai = makeAI('pursuit', s.i, s.j, s.dir, 4.9, 30 + this.stars * 4);
        v.siren = true;
      }
    }
    // reuse far-away patrol cars as pursuers when wanted
    if (this.stars > 0) {
      for (const v of this.vehicles) {
        if (v.isPolice && v.ai && v.ai.mode === 'traffic' && v.hasDriver && Math.hypot(v.x - pl.x, v.z - pl.z) < 160) {
          v.ai.mode = 'pursuit'; v.ai.cruise = 30 + this.stars * 4; v.siren = true; v.ai.lane = 4.9;
        }
      }
    }
    const copPeds = this.peds.filter((p) => p.kind === 'cop' && !p.dead).length;
    for (const car of cars) {
      if (!car.ai || car.ai.exitT > 0) continue;
      const d = Math.hypot(car.x - pl.x, car.z - pl.z);
      const stopped = pl.veh ? pl.veh.speed < 4 && d < 16 : d < 26;
      if (stopped && car.speed < 12 && copPeds < 10) {
        car.ai.exitT = 1;
        const w = this.stars >= 4 ? 'ak' : this.stars >= 3 ? 'smg' : 'pistol';
        const sn = Math.sin(car.yaw), cs = Math.cos(car.yaw);
        for (const s of [1, -1]) {
          const p = this.spawnPed('cop', car.x + cs * s * 2.2, car.z - sn * s * 2.2);
          p.setWeapon(w);
        }
        car.ai.mode = 'idle';
        car.siren = true;
      }
    }
    // heli
    if (this.stars >= 4 && !this.heli && !pl.dead) this.createHeli();
    if (this.stars === 0 && this.heli) this.removeHeli();
  }
  private managePeds(dt: number) {
    const fx = this.focus.x, fz = this.focus.z;
    this.pedT -= dt;
    if (this.pedT <= 0) {
      this.pedT = 0.25;
      const n = this.peds.filter((p) => !p.mission && !p.dead && p.kind !== 'cop').length;
      if (n < this.maxPeds) this.spawnAmbientPed(fx, fz, 45, 150);
    }
    let deadN = 0;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.dead) deadN++;
      if (p.mission) continue;
      const d = Math.hypot(p.x - fx, p.z - fz);
      if (d > 210 || (p.dead && p.deadT > 28) || (p.kind === 'cop' && this.stars === 0 && d > 90)) this.removePed(p);
    }
    if (deadN > 26) {
      const old = this.peds.filter((p) => p.dead && !p.mission).sort((a, b) => b.deadT - a.deadT)[0];
      if (old) this.removePed(old);
    }
  }

  // ------------------------------------------------------------ helicopter
  private createHeli() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.5, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dark);
    body.scale.set(1.5, 1.3, 3.2);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.9, roughness: 0.1 }));
    glass.scale.set(1.2, 0.9, 1.4);
    glass.position.set(0, 0.35, 1.7);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.5), dark);
    boom.position.set(0, 0.3, -4);
    const rotor = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x333 }));
      b.rotation.y = (i * Math.PI) / 2;
      rotor.add(b);
    }
    rotor.position.y = 1.5;
    const tail = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0x333 }));
    tail.add(tb);
    tail.position.set(0.3, 0.6, -6.2);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    blink.position.set(0, 1.5, 0);
    g.add(body, glass, boom, rotor, tail, blink);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
    const light = new THREE.SpotLight(0xffffff, 1800, 160, 0.16, 0.5, 1.4);
    light.position.set(0, -0.5, 1);
    g.add(light);
    this.scene.add(light.target);
    const pl = this.player;
    const a = rand(0, TAU);
    this.heli = { group: g, rotor, tail, x: pl.x + Math.cos(a) * 220, y: 40, z: pl.z + Math.sin(a) * 220, vx: 0, vz: 0, hp: 450, fireCd: 2, ang: a, light, yaw: 0, burst: 0 };
    this.scene.add(g);
    this.toast('Police helicopter inbound!');
  }
  private removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli.group);
    this.scene.remove(this.heli.light.target);
    this.heli = null;
  }
  private updateHeli(dt: number) {
    const h = this.heli;
    if (!h) return;
    const pl = this.player;
    h.ang += dt * 0.22;
    const gx = pl.x + Math.cos(h.ang) * 38, gz = pl.z + Math.sin(h.ang) * 38;
    h.vx = damp(h.vx, clamp((gx - h.x) * 0.6, -30, 30), 1.4, dt);
    h.vz = damp(h.vz, clamp((gz - h.z) * 0.6, -30, 30), 1.4, dt);
    h.x += h.vx * dt; h.z += h.vz * dt;
    h.y = damp(h.y, 36 + Math.sin(this.time) * 2, 1, dt);
    const ty = Math.atan2(pl.x - h.x, pl.z - h.z);
    h.yaw += angDiff(h.yaw, ty) * Math.min(1, 2 * dt);
    h.group.position.set(h.x, h.y, h.z);
    h.group.rotation.set(clamp(Math.hypot(h.vx, h.vz) * 0.008, 0, 0.3), h.yaw, 0, 'YXZ');
    h.rotor.rotation.y += dt * 45;
    h.tail.rotation.x += dt * 50;
    h.light.target.position.set(pl.x, 0, pl.z);
    const d = Math.hypot(pl.x - h.x, pl.z - h.z);
    h.fireCd -= dt;
    if (d < 85 && !pl.dead) {
      if (h.burst > 0 && h.fireCd <= 0) {
        h.burst--;
        h.fireCd = 0.11;
        const from = new THREE.Vector3(h.x, h.y - 1, h.z);
        const hit = Math.random() < 0.17;
        const to = new THREE.Vector3(pl.x + (hit ? 0 : rand(-3, 3)), hit ? 1.1 : 0, pl.z + (hit ? 0 : rand(-3, 3)));
        C.tracer(this, from, to);
        this.audio.gun('rifle', this.vol(h.x, h.z) * 0.6);
        if (hit) this.damagePlayer(5, h.x, h.z);
        else this.spark(to.x, 0.2, to.z, 3);
      } else if (h.burst <= 0 && h.fireCd <= 0) { h.burst = Math.floor(rand(5, 10)); h.fireCd = rand(1.6, 3); }
    }
    if (h.hp <= 0) {
      C.explode(this, h.x, h.y, h.z, 10, 130, true);
      this.addHeat(30, 'heli', false);
      this.removeHeli();
    }
  }

  // ------------------------------------------------------------ camera
  private updateCamera(dtReal: number) {
    const cam = this.camera;
    const inp = this.input;
    const pl = this.player;
    if (this.state === 'menu') {
      this.menuAngle += dtReal * 0.045;
      const cx = 0, cz = 0;
      const R = 150 + Math.sin(this.menuAngle * 0.7) * 30;
      cam.position.set(cx + Math.cos(this.menuAngle) * R, 55 + Math.sin(this.menuAngle * 1.3) * 12, cz + Math.sin(this.menuAngle) * R);
      cam.lookAt(cx, 35, cz);
      this.fovCur = damp(this.fovCur, 55, 3, dtReal);
      cam.fov = this.fovCur;
      cam.updateProjectionMatrix();
      this.focus.x = cx; this.focus.z = cz;
      return;
    }
    const w = WMAP[pl.cur];
    if (this.input.locked || this.input.noLock) {
      const sens = 0.0022 * settings.sens * (pl.aiming && !pl.veh ? 0.6 / Math.sqrt(w.zoom) : 1);
      if (inp.mdx || inp.mdy) this.lookIdle = 0;
      this.camYaw -= inp.mdx * sens;
      this.camPitch -= inp.mdy * sens;
    }
    this.lookIdle += dtReal;
    this.camPitch = clamp(this.camPitch, pl.veh ? -0.9 : -1.2, pl.veh ? 0.7 : 1.3);
    if (inp.p('KeyV')) { this.firstPerson = !this.firstPerson; this.audio.ui(); }
    if (inp.p('KeyM')) this.mapZoom = (this.mapZoom + 1) % 3;
    if (inp.p('KeyT') && !this.cutscene) { if (this.bullet) this.bullet = false; else if (this.bulletEnergy > 12) this.bullet = true; this.audio.ui(); }
    if (inp.p('KeyN')) this.toggleRadio();
    const v = pl.veh;
    if (v && this.lookIdle > 1.4) {
      const heading = v.vf < -2 ? v.yaw + Math.PI : Math.atan2(v.vx, v.vz);
      const target = v.speed > 3 ? heading : v.yaw;
      this.camYaw += angDiff(this.camYaw, target) * Math.min(1, dtReal * (v.speed > 3 ? 2.6 : 1.2));
      this.camPitch = damp(this.camPitch, this.firstPerson ? -0.02 : -0.2, 2, dtReal);
    }
    let tx: number, ty: number, tz: number;
    if (v) { tx = v.x; ty = 1.3; tz = v.z; }
    else if (pl.dead || pl.ragT > 0) { tx = pl.x; ty = 1.0; tz = pl.z; }
    else { tx = pl.x; ty = pl.y + 1.55; tz = pl.z; }
    const cp = Math.cos(this.camPitch);
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    let fov = settings.fov;
    const zoom = pl.aiming && !v ? w.zoom : 1;
    if (this.firstPerson && !pl.dead) {
      if (v) {
        const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
        this.camPos.set(v.x + cs * 0.4 + sn * 0.3, 1.2, v.z - sn * 0.4 + cs * 0.3);
      } else this.camPos.set(pl.x, pl.y + 1.62, pl.z).addScaledVector(dir, 0.15);
      this.camDist = 0;
    } else {
      const want = v ? 6.8 + v.t.L * 0.45 + v.speed * 0.045 : pl.aiming ? 2.3 : 4.0;
      this.camDist = damp(this.camDist || want, want, 6, dtReal);
      const off = v ? 0 : pl.aiming ? 0.85 : 0.55;
      const base = new THREE.Vector3(tx, ty, tz);
      const desired = base.clone().addScaledVector(dir, -this.camDist).addScaledVector(right, off).add(new THREE.Vector3(0, v ? 0.9 : 0.15, 0));
      const dv = desired.clone().sub(base);
      const dl = dv.length();
      dv.multiplyScalar(1 / dl);
      const hit = this.world.ray(base.x, base.y, base.z, dv.x, dv.y, dv.z, dl);
      const dd = hit < dl ? Math.max(0.6, hit - 0.35) : dl;
      this.camPos.copy(base).addScaledVector(dv, dd);
      if (this.camPos.y < 0.4) this.camPos.y = 0.4;
    }
    if (v) fov += clamp(v.speed * 0.28, 0, 22);
    fov /= zoom;
    if (this.timeScale < 0.6) fov -= (0.6 - this.timeScale) * 14;
    this.fovCur = damp(this.fovCur, fov, 7, dtReal);
    cam.fov = this.fovCur;
    cam.updateProjectionMatrix();
    cam.position.copy(this.camPos);
    if (this.shake > 0.001) {
      cam.position.x += rand(-1, 1) * this.shake * 0.25;
      cam.position.y += rand(-1, 1) * this.shake * 0.25;
      cam.position.z += rand(-1, 1) * this.shake * 0.25;
      this.shake = damp(this.shake, 0, 6, dtReal);
    }
    cam.rotation.set(this.camPitch, this.camYaw + Math.PI, 0, 'YXZ');
    this.focus.x = v ? v.x : pl.x;
    this.focus.z = v ? v.z : pl.z;
  }

  private updateViewModel() {
    const pl = this.player;
    const w = WMAP[pl.cur];
    const show = this.firstPerson && !pl.veh && !pl.dead && w.id !== 'fist' && !this.cutscene && !(pl.aiming && w.id === 'sniper') && this.state !== 'menu';
    if (!show) { if (this.vm) this.vm.visible = false; return; }
    if (this.vmId !== pl.cur) {
      if (this.vm) this.camera.remove(this.vm);
      this.vm = makeWeaponMesh(pl.cur);
      this.vmId = pl.cur;
      if (this.vm) { this.vm.rotation.y = Math.PI; this.camera.add(this.vm); this.vm.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : 0)); }
    }
    if (this.vm) {
      this.vm.visible = true;
      const aim = pl.aiming ? 1 : 0;
      const bob = Math.sin(pl.phase * 1) * 0.004 * pl.speed;
      this.vm.position.set(0.22 * (1 - aim * 0.9), -0.2 + aim * 0.06 + bob, -0.5 + pl.kick * 0.12 - (w.kind === 'melee' ? 0 : 0));
      this.vm.rotation.x = pl.kick * 0.3;
    }
    pl.phase += 0;
  }

  // ------------------------------------------------------------ main loop
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dtReal = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (dtReal <= 0) return;
    this.fpsAcc += dtReal; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.tick(dtReal);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private tick(dtReal: number) {
    this.frame++;
    const inp = this.input;
    const menu = this.state === 'menu';
    // pause handling
    if (this.state === 'playing') {
      if (this.wasLocked && !inp.locked && !inp.noLock && !this.cutscene) this.pause();
      if ((inp.noLock && inp.p('Escape')) || inp.p('KeyP')) this.pause();
    } else if (this.state === 'paused' && inp.p('KeyP')) this.resume();
    this.wasLocked = inp.locked;
    if (this.state === 'playing' && !inp.locked && !inp.noLock && inp.mousePressed[0] && !this.cutscene && !this.wasted) inp.lock();

    // time scale
    let target = 1;
    if (this.slowT > 0) { this.slowT -= dtReal; target = this.slowScale; if (this.slowT <= 0) this.slowScale = 1; }
    if (this.bullet) {
      this.bulletEnergy -= 16 * dtReal;
      target = Math.min(target, 0.28);
      if (this.bulletEnergy <= 0) { this.bullet = false; this.bulletEnergy = 0; }
    } else this.bulletEnergy = Math.min(100, this.bulletEnergy + 4 * dtReal);
    this.timeScale = damp(this.timeScale, target, 9, dtReal);
    this.slowCool -= dtReal;
    const paused = this.state === 'paused' || this.state === 'shop';
    const dt = paused ? 0 : dtReal * this.timeScale;
    this.time += dt;
    this.hitCool += dtReal;
    this.hitMarker = Math.max(0, this.hitMarker - dtReal * 5);
    this.dmgFlash = Math.max(0, this.dmgFlash - dtReal * 1.2);
    if (this.subtitle && !this.cutscene) { this.subtitle.t -= dtReal; if (this.subtitle.t <= 0) this.subtitle = null; }
    for (const t of this.toasts) t.t -= dtReal;
    this.toasts = this.toasts.filter((t) => t.t > 0);

    if (!paused) {
      const pl = this.player;
      if (!menu) {
        const pdt = this.bullet ? dt * 2.6 : dt;
        pl.update(this, pdt, dtReal);
        if (pl.dead && this.wasted) {
          this.wastedT += dtReal;
          if (this.wastedT > 5) this.respawn();
        }
      }
      this.world.update(dt, this.focus.x, this.focus.z, this.camera.position, this.frame);
      this.updateVehicles(dt, this.focus.x, this.focus.z);
      // peds
      const fx = this.focus.x, fz = this.focus.z;
      for (const p of this.peds) {
        const d = Math.hypot(p.x - fx, p.z - fz);
        if (d > 230) { p.ch.group.visible = false; continue; }
        p.update(this, dt);
        const vis = d < 150;
        p.ch.group.visible = vis;
        if (vis) p.ch.sync();
        if (p.burn > 0 && vis) {
          this.fx.emit(p.x + rand(-0.2, 0.2), 0.6 + rand(0, 1), p.z + rand(-0.2, 0.2), 0, rand(1, 2.5), 0, rand(0.5, 0.9), 0.5, 1, rand(0.4, 0.7), 0.1, 0.4, 0.8, -1, 1);
          if (p.dead && p.deadT > 2) p.ch.char();
        }
      }
      if (pl.ch.group.visible) {
        if (pl.ch.rag || pl.dead) { /* ragdoll */ }
        pl.ch.sync();
      }
      this.updateViewModel();
      C.updateProjectiles(this, dt);
      this.updatePickups(dt);
      this.manageTraffic(dt);
      this.managePeds(dt);
      if (!menu) {
        this.manageCops(dt);
        this.updateWanted(dt);
        this.updateHeli(dt);
        if (this.mission) this.mission.update(dt);
        if (!this.cutscene && !this.wasted) this.career.tick(this, dt);
        this.computePrompt();
        for (const m of this.markers) {
          m.cool -= dt;
        }
        if (this.audio.ctx) {
          const v = pl.veh;
          if (v && !v.exploded) {
            const sr = clamp(Math.abs(v.vf) / v.t.maxSpeed, 0, 1);
            const gear = (sr * 5) % 1;
            this.audio.engine(0.2 + sr * 0.35 + gear * 0.45, Math.abs(v.throttle), 1);
          } else this.audio.engine(0, 0, 0);
        }
      }
      this.updateFx(dt, dtReal);
    }
    this.updateMarkers(dtReal);
    if (this.cutscene) this.updateCutscene(dtReal);
    else this.updateCamera(dtReal);
    this.scene.updateMatrixWorld();
    const hgt = this.renderer.domElement.height;
    const scale = (hgt * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.smoke.update(paused ? 0 : dt, scale);
    this.fx.update(paused ? 0 : dt, scale);
    if (!menu && this.minimap) this.drawMinimap();
  }

  private updateFx(dt: number, dtReal: number) {
    this.flashT -= dtReal;
    this.flashLight.intensity = this.flashT > 0 ? this.flashLight.intensity * Math.pow(0.002, dtReal) : 0;
    if (this.flashLight.intensity < 0.5) this.flashLight.intensity = 0;
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dtReal;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const s of this.shocks) {
      if (s.t < 1) {
        s.t += dtReal * 2.2;
        const k = Math.min(1, s.t);
        s.mesh.scale.setScalar(1 + s.r * k);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
        if (s.t >= 1) s.mesh.visible = false;
      }
    }
    void dt;
  }

  private updateMarkers(dtReal: number) {
    const t = performance.now() / 1000;
    const c = this.camera.position;
    for (const m of this.markers) {
      const d = Math.hypot(m.x - c.x, m.z - c.z);
      m.group.visible = d < 700 && !this.cutscene;
      if (!m.group.visible) continue;
      const pulse = 1 + Math.sin(t * 3 + m.id) * 0.06;
      m.ring.scale.setScalar(pulse);
      (m.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 2 + m.id) * 0.05;
      const s = clamp(d * 0.028, 5, 40);
      m.sprite.scale.set(s * 2, s, 1);
      m.sprite.position.y = 6 + s * 0.4;
      m.beam.rotation.y += dtReal * 0.5;
      m.sprite.visible = d > 12 || m.kind !== 'objective';
    }
  }

  // ------------------------------------------------------------ minimap & hud
  attachMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c || undefined;
  }
  private drawMinimap() {
    const cv = this.minimap!;
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const pl = this.player;
    const px = pl.veh ? pl.veh.x : pl.x, pz = pl.veh ? pl.veh.z : pl.z;
    const s = [1.15, 0.6, 0.28][this.mapZoom];
    const rot = this.camYaw - Math.PI;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-px, -pz);
    const ext = N * S + 100;
    ctx.drawImage(this.world.mapCanvas, -(HALF + 50), -(HALF + 50), ext, ext);
    ctx.restore();
    const R = W / 2 - 9;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const blip = (x: number, z: number, color: string, r: number, ring = false) => {
      const dx = x - px, dz = z - pz;
      let sx = (dx * cr - dz * sr) * s, sy = (dx * sr + dz * cr) * s;
      const d = Math.hypot(sx, sy);
      let cl = false;
      if (d > R) { sx *= R / d; sy *= R / d; cl = true; }
      ctx.beginPath();
      ctx.arc(W / 2 + sx, H / 2 + sy, cl ? r * 0.75 : r, 0, TAU);
      if (ring) { ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    };
    for (const m of this.markers) if (m.kind !== 'objective') blip(m.x, m.z, '#' + new THREE.Color(m.color).getHexString(), 4.5);
    if (this.mission?.blips) for (const b of this.mission.blips()) blip(b.x, b.z, b.color, 6.5, true);
    const flash = Math.floor(this.time * 5) % 2 === 0;
    if (this.stars > 0) {
      for (const v of this.vehicles) if (v.isPolice && v.siren) blip(v.x, v.z, flash ? '#ff3344' : '#3377ff', 4);
      for (const p of this.peds) if (p.kind === 'cop' && !p.dead) blip(p.x, p.z, flash ? '#ff3344' : '#3377ff', 3);
      if (this.heli) blip(this.heli.x, this.heli.z, '#fff', 4);
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const facing = pl.veh ? pl.veh.yaw : pl.ch.yaw;
    ctx.rotate(this.camYaw - facing);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  getHud(): Hud {
    const pl = this.player;
    const w = WMAP[pl.cur];
    const a = pl.weapons[pl.cur];
    const hh = Math.floor(this.world.time), mm = Math.floor((this.world.time % 1) * 60);
    const names = ['', 'Suspicious', 'Wanted', 'Dangerous', 'Armed & Dangerous', 'Most Wanted'];
    return {
      state: this.state, money: this.money, hp: Math.max(0, (pl.hp / this.career.perks.maxHp) * 100), armor: pl.armor, stars: this.stars, evading: this.stars > 0 && this.evadeT > 0.5,
      weapon: w.name, wid: w.id, mag: a?.mag ?? 0, reserve: a?.reserve ?? 0, melee: w.kind === 'melee', reloading: pl.reloadT > 0,
      speed: pl.veh ? Math.round(pl.veh.speed * 3.6) : 0, inVehicle: !!pl.veh, vehName: pl.veh?.t.name || '', hp2: pl.veh ? clamp(pl.veh.hp / pl.veh.t.hp, 0, 1) : 0,
      clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      mission: this.mission ? { title: this.mission.title, objective: this.mission.objective, timer: this.mission.timer } : null,
      prompt: this.prompt, subtitle: this.subtitle ? { who: this.subtitle.who, text: this.subtitle.text } : null,
      toasts: this.toasts.map((t) => ({ id: t.id, text: t.text })), wasted: this.wasted, slow: clamp(1 - this.timeScale, 0, 1),
      bullet: this.bulletEnergy, bulletOn: this.bullet, cutscene: !!this.cutscene,
      scope: pl.aiming && w.id === 'sniper' && !pl.veh && !pl.dead, dmg: this.dmgFlash,
      crosshair: !pl.veh && !pl.dead && !this.cutscene && !(w.id === 'fist' && !pl.aiming) && w.kind !== 'melee', firstPerson: this.firstPerson,
      hit: this.hitMarker, kills: this.kills, mapZoom: this.mapZoom, fps: this.fps,
      shop: this.state === 'shop' ? this.shopItems() : null,
      weaponsOwned: pl.owned.map((id) => ({ id, name: WMAP[id].name, cur: id === pl.cur })), radio: this.audio.radioOn,
      wantedLevelName: names[this.stars],
      career: this.career.view(),
    };
  }
}
