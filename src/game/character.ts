import * as THREE from 'three';
import { World, HALF } from './world';
import { pick, rand } from './util';

export const P = { head: 0, neck: 1, lSh: 2, rSh: 3, pel: 4, lHip: 5, rHip: 6, lElb: 7, rElb: 8, lHand: 9, rHand: 10, lKnee: 11, rKnee: 12, lFoot: 13, rFoot: 14 };
export const NP = 15;
export const POINT_R = [0.16, 0.12, 0.14, 0.14, 0.22, 0.13, 0.13, 0.08, 0.08, 0.07, 0.07, 0.1, 0.1, 0.1, 0.1];

export interface Look { skin: string; shirt: string; pants: string; shoe: string; hair: string; scale: number }

const SKINS = ['#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#f5d5b8', '#a9744f'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ecf0f1', '#e67e22', '#16a085', '#34495e', '#fd79a8', '#636e72'];
const PANTS = ['#2d3436', '#34495e', '#6c5ce7', '#535c68', '#1e272e', '#7f8c8d', '#3b3b98', '#8e6e4a'];
const HAIRS = ['#1b1b1b', '#3b2a1a', '#6b4423', '#c9a24b', '#8a8a8a', '#a52a2a'];

export const randomLook = (kind: 'civ' | 'cop' | 'gang' | 'target' | 'guard' | 'player'): Look => {
  const skin = pick(SKINS);
  const scale = rand(0.93, 1.07);
  switch (kind) {
    case 'cop': return { skin, shirt: '#1c3a8a', pants: '#0f1f4a', shoe: '#111', hair: '#101010', scale };
    case 'gang': return { skin, shirt: pick(['#b71c1c', '#6a1b9a', '#d84315']), pants: '#1b1b1f', shoe: '#eee', hair: pick(HAIRS), scale };
    case 'target': return { skin, shirt: '#f4f4f4', pants: '#111', shoe: '#000', hair: '#d8d8d8', scale: 1.05 };
    case 'guard': return { skin, shirt: '#111', pants: '#111', shoe: '#000', hair: '#222', scale: 1.08 };
    case 'player': return { skin: '#d9a47a', shirt: '#e8a317', pants: '#23262e', shoe: '#f2f2f2', hair: '#1a1210', scale: 1.0 };
    default: return { skin, shirt: pick(SHIRTS), pants: pick(PANTS), shoe: pick(['#222', '#eee', '#6d4c41']), hair: pick(HAIRS), scale };
  }
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string) => {
  let m = matCache.get(c);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.02 });
    matCache.set(c, m);
  }
  return m;
};
const cylG = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphG = new THREE.SphereGeometry(1, 12, 9);
const boxG = new THREE.BoxGeometry(1, 1, 1);

export interface PoseOpts {
  phase: number;
  amp: number;
  aim: number | null;
  swing: number;
  air: boolean;
  holding: boolean;
  twoHand: boolean;
}
const defaultPose: PoseOpts = { phase: 0, amp: 0, aim: null, swing: -1, air: false, holding: false, twoHand: true };

function fk(o: Float32Array, p: PoseOpts) {
  const bob = Math.abs(Math.sin(p.phase)) * 0.045 * p.amp;
  const pY = 1.0 - bob - (p.air ? 0.05 : 0);
  const lean = 0.18 * p.amp;
  const set = (i: number, x: number, y: number, z: number) => { o[i * 3] = x; o[i * 3 + 1] = y; o[i * 3 + 2] = z; };
  set(P.pel, 0, pY, 0);
  set(P.neck, 0, pY + 0.5, lean * 0.35);
  set(P.head, 0, pY + 0.72, lean * 0.5);
  set(P.lSh, 0.22, pY + 0.45, lean * 0.3);
  set(P.rSh, -0.22, pY + 0.45, lean * 0.3);
  set(P.lHip, 0.11, pY, 0);
  set(P.rHip, -0.11, pY, 0);
  for (const s of [1, -1]) {
    const ph = p.phase + (s > 0 ? 0 : Math.PI);
    let sw = Math.sin(ph) * 0.75 * p.amp;
    let kb = Math.max(0, Math.sin(ph + 1.3)) * 1.0 * p.amp;
    if (p.air) { sw = s > 0 ? 0.5 : -0.3; kb = s > 0 ? 1.0 : 0.4; }
    const hx = s * 0.11;
    const kx = hx, ky = pY - 0.46 * Math.cos(sw), kz = 0.46 * Math.sin(sw);
    const sh = sw - kb;
    const fx = kx, fy = ky - 0.46 * Math.cos(sh), fz = kz + 0.46 * Math.sin(sh);
    set(s > 0 ? P.lKnee : P.rKnee, kx, ky, kz);
    set(s > 0 ? P.lFoot : P.rFoot, fx, Math.max(0.04, fy), fz);
    // arms
    let a = -Math.sin(ph) * 0.8 * p.amp;
    let a2 = a + 0.4 + 0.5 * p.amp;
    const shI = s > 0 ? P.lSh : P.rSh;
    const sx = o[shI * 3], sy = o[shI * 3 + 1], sz = o[shI * 3 + 2];
    if (s < 0 && p.swing >= 0) { a = -2.5 + 3.8 * p.swing; a2 = a * 0.25; }
    else if (s < 0 && p.aim !== null) { a = 1.45; a2 = 1.45; }
    else if (s < 0 && p.holding) { a = 0.75; a2 = 1.25; }
    else if (s > 0 && p.holding && p.twoHand) { a = 0.5; a2 = 1.1; }
    const ex = sx + s * 0.04, ey = sy - 0.3 * Math.cos(a), ez = sz + 0.3 * Math.sin(a);
    const hx2 = ex, hy2 = ey - 0.28 * Math.cos(a2), hz2 = ez + 0.28 * Math.sin(a2);
    set(s > 0 ? P.lElb : P.rElb, ex, ey, ez);
    set(s > 0 ? P.lHand : P.rHand, hx2, hy2, hz2);
  }
  if (p.aim !== null) {
    const dy = Math.sin(p.aim), dz = Math.cos(p.aim);
    const sy = o[P.rSh * 3 + 1], sz = o[P.rSh * 3 + 2];
    set(P.rElb, -0.18, sy + dy * 0.26 - 0.02, sz + dz * 0.26);
    set(P.rHand, -0.1, sy + dy * 0.55, sz + dz * 0.55);
    if (p.twoHand) {
      const hy = o[P.rHand * 3 + 1] - dy * 0.22 - 0.02, hz = o[P.rHand * 3 + 2] - dz * 0.22;
      set(P.lHand, 0.0, hy, hz);
      set(P.lElb, 0.2, (o[P.lSh * 3 + 1] + hy) / 2 - 0.1, (o[P.lSh * 3 + 2] + hz) / 2);
    }
  }
}

const CONS: [number, number, number][] = [];
const REST: number[] = [];
(() => {
  const add = (a: number, b: number, s = 1) => CONS.push([a, b, s]);
  add(P.head, P.neck); add(P.neck, P.lSh); add(P.neck, P.rSh); add(P.lSh, P.rSh); add(P.neck, P.pel);
  add(P.lSh, P.pel); add(P.rSh, P.pel); add(P.pel, P.lHip); add(P.pel, P.rHip); add(P.lHip, P.rHip);
  add(P.lSh, P.lHip); add(P.rSh, P.rHip); add(P.lSh, P.rHip, 0.8); add(P.rSh, P.lHip, 0.8);
  add(P.lSh, P.lElb); add(P.lElb, P.lHand); add(P.rSh, P.rElb); add(P.rElb, P.rHand);
  add(P.lHip, P.lKnee); add(P.lKnee, P.lFoot); add(P.rHip, P.rKnee); add(P.rKnee, P.rFoot);
  add(P.head, P.pel, 0.3);
  const tmp = new Float32Array(NP * 3);
  fk(tmp, defaultPose);
  for (const [a, b] of CONS) {
    REST.push(Math.hypot(tmp[a * 3] - tmp[b * 3], tmp[a * 3 + 1] - tmp[b * 3 + 1], tmp[a * 3 + 2] - tmp[b * 3 + 2]));
  }
})();

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

export class Character {
  group = new THREE.Group();
  pos = new Float32Array(NP * 3);
  prev = new Float32Array(NP * 3);
  rag = false;
  sleep = 0;
  dtPrev = 1 / 60;
  x = 0; y = 0; z = 0; yaw = 0;
  pose: PoseOpts = { ...defaultPose };
  weapon: THREE.Object3D | null = null;
  weaponId: string | null = null;
  weaponDir = new THREE.Vector3(0, 0, 1);
  burn = 0;
  charred = false;
  limbs: { m: THREE.Mesh; a: number; b: number; r: number }[] = [];
  torso: THREE.Mesh;
  head: THREE.Mesh;
  hair: THREE.Mesh;
  feet: THREE.Mesh[] = [];
  look: Look;
  scale: number;
  private local = new Float32Array(NP * 3);

  constructor(look: Look) {
    this.look = look;
    this.scale = look.scale;
    const mk = (g: THREE.BufferGeometry, c: string) => {
      const m = new THREE.Mesh(g, mat(c));
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    const L = (a: number, b: number, r: number, c: string) => this.limbs.push({ m: mk(cylG, c), a, b, r: r * look.scale });
    L(P.lHip, P.lKnee, 0.08, look.pants); L(P.lKnee, P.lFoot, 0.063, look.pants);
    L(P.rHip, P.rKnee, 0.08, look.pants); L(P.rKnee, P.rFoot, 0.063, look.pants);
    L(P.lSh, P.lElb, 0.057, look.shirt); L(P.lElb, P.lHand, 0.047, look.skin);
    L(P.rSh, P.rElb, 0.057, look.shirt); L(P.rElb, P.rHand, 0.047, look.skin);
    this.torso = mk(boxG, look.shirt);
    this.head = mk(sphG, look.skin);
    this.hair = mk(sphG, look.hair);
    this.feet.push(mk(boxG, look.shoe), mk(boxG, look.shoe));
    this.group.frustumCulled = false;
  }

  setColors(shirt: string) {
    this.torso.material = mat(shirt);
    this.limbs[4].m.material = mat(shirt);
    this.limbs[6].m.material = mat(shirt);
  }

  setWeapon(id: string | null, obj: THREE.Object3D | null) {
    if (this.weapon) this.group.remove(this.weapon);
    this.weapon = obj;
    this.weaponId = id;
    if (obj) {
      obj.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
      this.group.add(obj);
    }
  }

  /** compute FK pose into world points */
  applyPose() {
    const p = this.pose;
    fk(this.local, p);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), sc = this.scale;
    for (let i = 0; i < NP; i++) {
      const lx = this.local[i * 3] * sc, ly = this.local[i * 3 + 1] * sc, lz = this.local[i * 3 + 2] * sc;
      this.pos[i * 3] = this.x + lx * c + lz * s;
      this.pos[i * 3 + 1] = this.y + ly;
      this.pos[i * 3 + 2] = this.z - lx * s + lz * c;
    }
    // weapon direction
    if (p.aim !== null) this.weaponDir.set(Math.sin(this.yaw) * Math.cos(p.aim), Math.sin(p.aim), Math.cos(this.yaw) * Math.cos(p.aim));
    else if (p.swing >= 0) {
      const e = P.rElb * 3, h = P.rHand * 3;
      this.weaponDir.set(this.pos[h] - this.pos[e], this.pos[h + 1] - this.pos[e + 1], this.pos[h + 2] - this.pos[e + 2]).normalize();
    } else this.weaponDir.set(Math.sin(this.yaw) * 0.95, -0.3, Math.cos(this.yaw) * 0.95).normalize();
  }

  centerX() { return this.rag ? this.pos[P.pel * 3] : this.x; }
  centerZ() { return this.rag ? this.pos[P.pel * 3 + 2] : this.z; }

  startRagdoll(vx: number, vy: number, vz: number) {
    if (!this.rag) this.applyPose();
    this.rag = true;
    this.sleep = 0;
    this.dtPrev = 1 / 60;
    for (let i = 0; i < NP; i++) {
      this.prev[i * 3] = this.pos[i * 3] - vx / 60;
      this.prev[i * 3 + 1] = this.pos[i * 3 + 1] - vy / 60;
      this.prev[i * 3 + 2] = this.pos[i * 3 + 2] - vz / 60;
    }
    // slight random tumble
    for (let i = 0; i < NP; i++) {
      this.prev[i * 3] -= (Math.random() - 0.5) * 0.02;
      this.prev[i * 3 + 2] -= (Math.random() - 0.5) * 0.02;
    }
    if (this.weapon) this.weapon.visible = false;
  }
  stopRagdoll() {
    this.x = this.pos[P.pel * 3];
    this.z = this.pos[P.pel * 3 + 2];
    this.y = 0;
    this.rag = false;
    if (this.weapon) this.weapon.visible = true;
  }
  impulse(idx: number, ix: number, iy: number, iz: number) {
    this.sleep = 0;
    this.prev[idx * 3] -= ix / 60;
    this.prev[idx * 3 + 1] -= iy / 60;
    this.prev[idx * 3 + 2] -= iz / 60;
  }
  impulseAll(ix: number, iy: number, iz: number) {
    this.sleep = 0;
    for (let i = 0; i < NP; i++) this.impulse(i, ix, iy, iz);
  }

  stepRagdoll(dt: number, world: World) {
    if (this.sleep > 1.2) return;
    dt = Math.min(dt, 1 / 30);
    if (dt < 1e-5) return;
    const k = (dt / this.dtPrev) * 0.993;
    this.dtPrev = dt;
    const g = -24 * dt * dt;
    const p = this.pos, q = this.prev;
    let moved = 0;
    for (let i = 0; i < NP; i++) {
      const i3 = i * 3;
      const vx = (p[i3] - q[i3]) * k, vy = (p[i3 + 1] - q[i3 + 1]) * k, vz = (p[i3 + 2] - q[i3 + 2]) * k;
      q[i3] = p[i3]; q[i3 + 1] = p[i3 + 1]; q[i3 + 2] = p[i3 + 2];
      p[i3] += vx; p[i3 + 1] += vy + g; p[i3 + 2] += vz;
      moved += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (let it = 0; it < 7; it++) {
      for (let c = 0; c < CONS.length; c++) {
        const [a, b, st] = CONS[c];
        const a3 = a * 3, b3 = b * 3;
        const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - REST[c] * this.scale) / d) * 0.5 * st;
        p[a3] += dx * diff; p[a3 + 1] += dy * diff; p[a3 + 2] += dz * diff;
        p[b3] -= dx * diff; p[b3 + 1] -= dy * diff; p[b3 + 2] -= dz * diff;
      }
      // min-distance: keep legs/arms from collapsing completely
      for (const [a, b, m] of [[P.lHip, P.lFoot, 0.42], [P.rHip, P.rFoot, 0.42], [P.lSh, P.lHand, 0.2], [P.rSh, P.rHand, 0.2], [P.lFoot, P.rFoot, 0.15]]) {
        const a3 = a * 3, b3 = b * 3;
        const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d < m) {
          const diff = ((d - m) / d) * 0.5;
          p[a3] += dx * diff; p[a3 + 1] += dy * diff; p[a3 + 2] += dz * diff;
          p[b3] -= dx * diff; p[b3 + 1] -= dy * diff; p[b3 + 2] -= dz * diff;
        }
      }
      // collisions
      for (let i = 0; i < NP; i++) {
        const i3 = i * 3;
        const r = i === 0 ? 0.12 : 0.07;
        if (p[i3 + 1] < r) {
          p[i3 + 1] = r;
          q[i3] += (p[i3] - q[i3]) * 0.22;
          q[i3 + 2] += (p[i3 + 2] - q[i3 + 2]) * 0.22;
          if (q[i3 + 1] < p[i3 + 1]) q[i3 + 1] = p[i3 + 1] + (p[i3 + 1] - q[i3 + 1]) * 0.2;
        }
        const cell = world.cellAt(p[i3], p[i3 + 2]);
        if (cell && p[i3 + 1] < 60) {
          for (const b of cell.boxes) {
            if (p[i3 + 1] < b.h && p[i3] > b.x0 - 0.05 && p[i3] < b.x1 + 0.05 && p[i3 + 2] > b.z0 - 0.05 && p[i3 + 2] < b.z1 + 0.05) {
              const l = p[i3] - b.x0, rg = b.x1 - p[i3], t = p[i3 + 2] - b.z0, bt = b.z1 - p[i3 + 2];
              const m = Math.min(l, rg, t, bt);
              if (m === l) p[i3] = b.x0 - 0.05; else if (m === rg) p[i3] = b.x1 + 0.05; else if (m === t) p[i3 + 2] = b.z0 - 0.05; else p[i3 + 2] = b.z1 + 0.05;
            }
          }
        }
        const B = HALF + 14;
        if (p[i3] > B) p[i3] = B; if (p[i3] < -B) p[i3] = -B;
        if (p[i3 + 2] > B) p[i3 + 2] = B; if (p[i3 + 2] < -B) p[i3 + 2] = -B;
      }
    }
    if (moved < 0.02 && p[P.pel * 3 + 1] < 0.3) this.sleep += dt;
    else this.sleep = 0;
  }

  /** push ragdoll points out of a vertical circle (vehicle) */
  pushFromCircle(cx: number, cz: number, r: number, vx: number, vz: number) {
    const p = this.pos;
    for (let i = 0; i < NP; i++) {
      const i3 = i * 3;
      if (p[i3 + 1] > 1.8) continue;
      const dx = p[i3] - cx, dz = p[i3 + 2] - cz;
      const d = Math.hypot(dx, dz);
      if (d < r + 0.1) {
        this.sleep = 0;
        const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
        p[i3] = cx + nx * (r + 0.1);
        p[i3 + 2] = cz + nz * (r + 0.1);
        this.prev[i3] = p[i3] - vx / 60 * 0.9;
        this.prev[i3 + 2] = p[i3 + 2] - vz / 60 * 0.9;
        this.prev[i3 + 1] = p[i3 + 1] + 0.05;
      }
    }
  }

  sync() {
    const p = this.pos;
    const get = (i: number, v: THREE.Vector3) => v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    for (const l of this.limbs) {
      get(l.a, _a); get(l.b, _b);
      const m = l.m;
      m.position.copy(_a).add(_b).multiplyScalar(0.5);
      _x.copy(_b).sub(_a);
      const len = _x.length();
      _x.multiplyScalar(1 / (len || 1));
      m.quaternion.setFromUnitVectors(UP, _x);
      m.scale.set(l.r, len + 0.05, l.r);
    }
    // torso basis
    get(P.neck, _a); get(P.pel, _b);
    _y.copy(_a).sub(_b);
    const tl = _y.length();
    _y.normalize();
    get(P.lSh, _x); get(P.rSh, _z);
    _x.sub(_z).normalize();
    _x.addScaledVector(_y, -_x.dot(_y)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m);
    const sc = this.scale;
    this.torso.quaternion.copy(_q);
    this.torso.position.copy(_a).add(_b).multiplyScalar(0.5).addScaledVector(_y, 0.01);
    this.torso.scale.set(0.46 * sc, (tl + 0.1) * sc, 0.25 * sc);
    get(P.head, _a);
    this.head.position.copy(_a);
    this.head.scale.setScalar(0.125 * sc);
    this.head.quaternion.copy(_q);
    this.hair.position.copy(_a).addScaledVector(_y, 0.03 * sc).addScaledVector(_z, -0.015 * sc);
    this.hair.quaternion.copy(_q);
    this.hair.scale.set(0.133 * sc, 0.11 * sc, 0.135 * sc);
    for (let f = 0; f < 2; f++) {
      const idx = f === 0 ? P.lFoot : P.rFoot;
      get(idx, _a);
      this.feet[f].position.copy(_a).addScaledVector(_y, 0.0);
      this.feet[f].position.y = Math.max(0.045, _a.y);
      this.feet[f].quaternion.copy(_q);
      this.feet[f].scale.set(0.11 * sc, 0.08 * sc, 0.27 * sc);
      if (!this.rag) {
        _q.setFromAxisAngle(UP, this.yaw);
        this.feet[f].quaternion.copy(_q);
        this.feet[f].position.addScaledVector(_z.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.07 * sc);
      }
    }
    if (this.weapon && !this.rag) {
      get(P.rHand, _a);
      this.weapon.position.copy(_a);
      _b.copy(_a).add(this.weaponDir);
      this.weapon.lookAt(_b);
    }
  }

  char() {
    if (this.charred) return;
    this.charred = true;
    const dark = mat('#161616');
    for (const l of this.limbs) l.m.material = dark;
    this.torso.material = dark;
    this.head.material = dark;
    this.hair.material = dark;
  }
  dispose() {
    /* geometries and materials are shared */
  }
}
