import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World } from './world';
import { clamp, damp } from './util';

export interface VType {
  key: string; name: string; L: number; W: number; H1: number; H2: number; cabL: number; cabZ: number; wr: number;
  mass: number; maxSpeed: number; accel: number; grip: number; hp: number; colors: string[];
}

export const VTYPES: Record<string, VType> = {
  sedan: { key: 'sedan', name: 'Cavalier Sedan', L: 4.6, W: 1.85, H1: 0.75, H2: 0.62, cabL: 2.5, cabZ: -0.25, wr: 0.34, mass: 1300, maxSpeed: 40, accel: 17, grip: 7, hp: 100, colors: ['#b0b7c0', '#2c3e50', '#8e2b2b', '#e8e8e8', '#3a5f8a', '#222', '#6b7a58'] },
  hatch: { key: 'hatch', name: 'Kuro Hatch', L: 3.9, W: 1.72, H1: 0.7, H2: 0.66, cabL: 2.3, cabZ: -0.2, wr: 0.32, mass: 1000, maxSpeed: 38, accel: 18, grip: 7.5, hp: 90, colors: ['#e67e22', '#f1c40f', '#1abc9c', '#e84393', '#dfe6e9', '#0984e3'] },
  taxi: { key: 'taxi', name: 'Downtown Taxi', L: 4.7, W: 1.85, H1: 0.75, H2: 0.64, cabL: 2.5, cabZ: -0.25, wr: 0.34, mass: 1350, maxSpeed: 40, accel: 17, grip: 7, hp: 110, colors: ['#f6c40f'] },
  sports: { key: 'sports', name: 'Stallion GT', L: 4.4, W: 1.9, H1: 0.58, H2: 0.5, cabL: 1.9, cabZ: -0.3, wr: 0.34, mass: 1250, maxSpeed: 58, accel: 27, grip: 8.5, hp: 100, colors: ['#c0392b', '#2980b9', '#f39c12', '#16a085', '#111'] },
  muscle: { key: 'muscle', name: 'Bruiser V8', L: 4.9, W: 1.95, H1: 0.66, H2: 0.54, cabL: 2.1, cabZ: -0.45, wr: 0.36, mass: 1650, maxSpeed: 55, accel: 25, grip: 7, hp: 120, colors: ['#1c1c1c', '#7d1d1d', '#1f4e79', '#d35400'] },
  super: { key: 'super', name: 'Cheetah Super', L: 4.5, W: 2.02, H1: 0.5, H2: 0.46, cabL: 1.8, cabZ: -0.1, wr: 0.35, mass: 1400, maxSpeed: 74, accel: 36, grip: 9.5, hp: 90, colors: ['#ff2d55', '#ffd60a', '#32d7ff', '#9dff00'] },
  suv: { key: 'suv', name: 'Titan SUV', L: 4.9, W: 2.0, H1: 1.0, H2: 0.8, cabL: 3.0, cabZ: -0.4, wr: 0.43, mass: 2100, maxSpeed: 38, accel: 15, grip: 6.5, hp: 150, colors: ['#222', '#444', '#7f8c8d', '#2c3e50', '#6d4c41'] },
  van: { key: 'van', name: 'Haul Van', L: 5.3, W: 2.0, H1: 1.25, H2: 0.9, cabL: 4.2, cabZ: -0.2, wr: 0.4, mass: 2400, maxSpeed: 33, accel: 12, grip: 6, hp: 140, colors: ['#ecf0f1', '#bdc3c7', '#2980b9', '#c0392b'] },
  bus: { key: 'bus', name: 'City Bus', L: 10, W: 2.5, H1: 1.5, H2: 1.2, cabL: 9.4, cabZ: 0, wr: 0.5, mass: 9000, maxSpeed: 26, accel: 7, grip: 5, hp: 300, colors: ['#2e86de', '#27ae60', '#e17055'] },
  police: { key: 'police', name: 'Metro PD Cruiser', L: 4.7, W: 1.9, H1: 0.75, H2: 0.62, cabL: 2.5, cabZ: -0.25, wr: 0.35, mass: 1500, maxSpeed: 56, accel: 26, grip: 8, hp: 130, colors: ['#f2f2f2'] },
};
export const CIV_TYPES = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'taxi', 'sports', 'muscle', 'suv', 'suv', 'van', 'bus'];

const CLEAR = 0.3;

export class SoftBody {
  geo: THREE.BufferGeometry;
  rest: Float32Array;
  nodeOf: Uint32Array;
  n = 0;
  np: Float32Array;
  off: Float32Array;
  vel: Float32Array;
  dent: Float32Array;
  adjStart: Uint32Array;
  adj: Uint32Array;
  active = false;
  constructor(geo: THREE.BufferGeometry) {
    this.geo = geo;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.rest = new Float32Array(pos.array as Float32Array);
    const map = new Map<string, number>();
    this.nodeOf = new Uint32Array(pos.count);
    const pts: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * 400)},${Math.round(pos.getY(i) * 400)},${Math.round(pos.getZ(i) * 400)}`;
      let id = map.get(k);
      if (id === undefined) {
        id = pts.length / 3;
        map.set(k, id);
        pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
      this.nodeOf[i] = id;
    }
    this.n = pts.length / 3;
    this.np = new Float32Array(pts);
    this.off = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.dent = new Float32Array(this.n * 3);
    const sets: Set<number>[] = Array.from({ length: this.n }, () => new Set());
    const idx = geo.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = this.nodeOf[idx.getX(i)], b = this.nodeOf[idx.getX(i + 1)], c = this.nodeOf[idx.getX(i + 2)];
      sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b);
    }
    this.adjStart = new Uint32Array(this.n + 1);
    const flat: number[] = [];
    for (let i = 0; i < this.n; i++) {
      this.adjStart[i] = flat.length;
      sets[i].forEach((v) => flat.push(v));
    }
    this.adjStart[this.n] = flat.length;
    this.adj = new Uint32Array(flat);
  }
  impact(lx: number, ly: number, lz: number, dx: number, dy: number, dz: number, strength: number) {
    const R = clamp(0.9 + strength * 0.05, 0.9, 2.4);
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(this.np[i * 3] - lx, this.np[i * 3 + 1] - ly, this.np[i * 3 + 2] - lz);
      if (d > R) continue;
      const w = (1 - d / R) * (1 - d / R);
      const push = Math.min(0.5, strength * w * 0.04);
      const i3 = i * 3;
      this.dent[i3] += dx * push; this.dent[i3 + 1] += dy * push * 0.5; this.dent[i3 + 2] += dz * push;
      const dl2 = Math.hypot(this.dent[i3], this.dent[i3 + 1], this.dent[i3 + 2]);
      if (dl2 > 0.6) {
        const s = 0.6 / dl2;
        this.dent[i3] *= s; this.dent[i3 + 1] *= s; this.dent[i3 + 2] *= s;
      }
      const v = strength * w * 1.4;
      this.vel[i3] += dx * v; this.vel[i3 + 1] += dy * v; this.vel[i3 + 2] += dz * v;
    }
    this.active = true;
  }
  update(dt: number) {
    if (!this.active) return;
    const steps = Math.ceil(dt / (1 / 90));
    const h = dt / steps;
    const K = 110, C = 6.5, KN = 55;
    let energy = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < this.n; i++) {
        const i3 = i * 3;
        let ax = 0, ay = 0, az = 0;
        const a0 = this.adjStart[i], a1 = this.adjStart[i + 1];
        const cnt = a1 - a0 || 1;
        for (let k = a0; k < a1; k++) {
          const j = this.adj[k] * 3;
          ax += this.off[j]; ay += this.off[j + 1]; az += this.off[j + 2];
        }
        ax = ax / cnt - this.off[i3]; ay = ay / cnt - this.off[i3 + 1]; az = az / cnt - this.off[i3 + 2];
        const fx = -K * (this.off[i3] - this.dent[i3]) - C * this.vel[i3] + KN * ax;
        const fy = -K * (this.off[i3 + 1] - this.dent[i3 + 1]) - C * this.vel[i3 + 1] + KN * ay;
        const fz = -K * (this.off[i3 + 2] - this.dent[i3 + 2]) - C * this.vel[i3 + 2] + KN * az;
        this.vel[i3] += fx * h; this.vel[i3 + 1] += fy * h; this.vel[i3 + 2] += fz * h;
        this.off[i3] += this.vel[i3] * h; this.off[i3 + 1] += this.vel[i3 + 1] * h; this.off[i3 + 2] += this.vel[i3 + 2] * h;
        energy += Math.abs(this.vel[i3]) + Math.abs(this.vel[i3 + 1]) + Math.abs(this.vel[i3 + 2]);
      }
    }
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let v = 0; v < pos.count; v++) {
      const n = this.nodeOf[v] * 3;
      arr[v * 3] = this.rest[v * 3] + this.off[n];
      arr[v * 3 + 1] = this.rest[v * 3 + 1] + this.off[n + 1];
      arr[v * 3 + 2] = this.rest[v * 3 + 2] + this.off[n + 2];
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    if (energy / this.n < 0.002) this.active = false;
  }
  dentLevel() {
    let s = 0;
    for (let i = 0; i < this.dent.length; i++) s += Math.abs(this.dent[i]);
    return s / this.n;
  }
}

const mats = {
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.8 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xff1010, emissiveIntensity: 0.5 }),
  tailOn: new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2.5 }),
  redOn: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 4 }),
  redOff: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x330000, emissiveIntensity: 0.3 }),
  blueOn: new THREE.MeshStandardMaterial({ color: 0x1144ff, emissive: 0x2255ff, emissiveIntensity: 4 }),
  blueOff: new THREE.MeshStandardMaterial({ color: 0x001155, emissive: 0x000833, emissiveIntensity: 0.3 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 }),
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45 }),
  sign: new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffee88, emissiveIntensity: 0.9 }),
};
const wheelG = new THREE.CylinderGeometry(1, 1, 1, 14);
wheelG.rotateZ(Math.PI / 2);

export interface Impact { px: number; pz: number; nx: number; nz: number; speed: number }

export class Vehicle {
  t: VType;
  group = new THREE.Group();
  chassis = new THREE.Group();
  body: THREE.Mesh;
  soft: SoftBody;
  wheels: { pivot: THREE.Group; mesh: THREE.Mesh; front: boolean }[] = [];
  tailMeshes: THREE.Mesh[] = [];
  bar: THREE.Mesh[] = [];
  x = 0; z = 0; y = 0; vy = 0; yaw = 0; vx = 0; vz = 0; w = 0;
  steer = 0; throttle = 0; brake = 0; hand = 0;
  hp: number;
  burning = false; burnT = 0; exploded = false; wreckT = 0;
  pitch = 0; roll = 0; airX = 0; airZ = 0; spinX = 0; spinZ = 0;
  prevVf = 0;
  spin = 0;
  hasDriver = false;
  playerIn = false;
  ai: any = null;
  keep = false;
  siren = false;
  isPolice = false;
  color = '#fff';
  circles: { z: number; r: number }[] = [];
  impact: Impact | null = null;
  lastDrift = 0;
  engineOn = true;
  ghost = 0;
  smokeT = 0;
  id = Math.random();
  colorAttr: THREE.BufferAttribute;
  baseColors: Float32Array;

  constructor(key: string, color?: string) {
    const t = VTYPES[key] || VTYPES.sedan;
    this.t = t;
    this.hp = t.hp;
    this.isPolice = key === 'police';
    const col = new THREE.Color(color || t.colors[Math.floor(Math.random() * t.colors.length)]);
    this.color = '#' + col.getHexString();

    const lower = new THREE.BoxGeometry(t.W, t.H1, t.L, 4, this.isPolice ? 4 : 2, Math.max(8, Math.round(t.L * 2)));
    lower.translate(0, CLEAR + t.H1 / 2, 0);
    const cab = new THREE.BoxGeometry(t.W * 0.92, t.H2, t.cabL, 3, 2, Math.max(3, Math.round(t.cabL * 1.2)));
    const cp = cab.attributes.position as THREE.BufferAttribute;
    const isBoxy = key === 'van' || key === 'bus' || key === 'suv';
    const glass = new THREE.Color(this.isPolice ? '#0d1218' : '#14202c');
    const cabCol = new Float32Array(cp.count * 3);
    const cn = cab.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const top = cp.getY(i) > 0;
      if (top) {
        const sz = isBoxy ? 0.96 : 0.72;
        cp.setX(i, cp.getX(i) * (isBoxy ? 0.96 : 0.86));
        cp.setZ(i, cp.getZ(i) * sz);
      }
      const roof = cn.getY(i) > 0.5;
      const c = roof ? col : glass;
      cabCol[i * 3] = c.r; cabCol[i * 3 + 1] = c.g; cabCol[i * 3 + 2] = c.b;
    }
    cab.setAttribute('color', new THREE.BufferAttribute(cabCol, 3));
    cab.translate(0, CLEAR + t.H1 + t.H2 / 2 - 0.02, t.cabZ);
    cab.computeVertexNormals();
    const lp = lower.attributes.position as THREE.BufferAttribute;
    const lcol = new Float32Array(lp.count * 3);
    const ln = lower.attributes.normal as THREE.BufferAttribute;
    const dark = new THREE.Color('#0c0c0e');
    const white = new THREE.Color('#f4f4f4');
    const black = new THREE.Color('#141416');
    for (let i = 0; i < lp.count; i++) {
      let c = col;
      const yy = lp.getY(i) - CLEAR;
      if (ln.getY(i) < -0.5) c = dark;
      else if (this.isPolice) c = yy > t.H1 * 0.55 ? white : yy > t.H1 * 0.3 ? white : black;
      else if (yy < 0.12 && Math.abs(ln.getZ(i)) > 0.5) c = dark;
      lcol[i * 3] = c.r; lcol[i * 3 + 1] = c.g; lcol[i * 3 + 2] = c.b;
    }
    lower.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    const merged = mergeGeometries([lower, cab], false)!;
    lower.dispose(); cab.dispose();
    merged.deleteAttribute('uv');
    this.body = new THREE.Mesh(merged, mats.body);
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    this.soft = new SoftBody(merged);
    this.colorAttr = merged.attributes.color as THREE.BufferAttribute;
    this.baseColors = new Float32Array(this.colorAttr.array as Float32Array);
    this.chassis.add(this.body);
    this.group.add(this.chassis);

    const box = (w: number, h: number, l: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
      mesh.position.set(x, y, z);
      this.chassis.add(mesh);
      return mesh;
    };
    const ly = CLEAR + t.H1 * 0.62;
    box(0.4, 0.14, 0.06, t.W / 2 - 0.35, ly, t.L / 2 + 0.01, mats.head);
    box(0.4, 0.14, 0.06, -t.W / 2 + 0.35, ly, t.L / 2 + 0.01, mats.head);
    this.tailMeshes.push(box(0.45, 0.14, 0.06, t.W / 2 - 0.35, ly, -t.L / 2 - 0.01, mats.tail), box(0.45, 0.14, 0.06, -t.W / 2 + 0.35, ly, -t.L / 2 - 0.01, mats.tail));
    if (this.isPolice) {
      this.bar.push(box(0.5, 0.12, 0.28, 0.3, CLEAR + t.H1 + t.H2 + 0.05, t.cabZ, mats.redOff), box(0.5, 0.12, 0.28, -0.3, CLEAR + t.H1 + t.H2 + 0.05, t.cabZ, mats.blueOff));
    }
    if (key === 'taxi') box(0.6, 0.18, 0.25, 0, CLEAR + t.H1 + t.H2 + 0.08, t.cabZ, mats.sign);

    const wz = t.L * 0.32;
    const wx = t.W / 2 - 0.12;
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wx, t.wr, sz * wz * (key === 'bus' ? 1.25 : 1));
      const tire = new THREE.Mesh(wheelG, mats.tire);
      tire.scale.set(0.15 * (t.W / 1.85 + 0.5), t.wr, t.wr);
      tire.castShadow = true;
      const rim = new THREE.Mesh(wheelG, mats.rim);
      rim.scale.set(0.16 * (t.W / 1.85 + 0.5), t.wr * 0.62, t.wr * 0.62);
      tire.add(rim);
      rim.scale.set(1.12, 0.62, 0.62);
      pivot.add(tire);
      this.chassis.add(pivot);
      this.wheels.push({ pivot, mesh: tire, front: sz > 0 });
    }
    // collision circles
    const r = Math.max(0.95, t.W * 0.52);
    const cnt = Math.max(3, Math.ceil(t.L / 2.1));
    const span = t.L / 2 - r;
    for (let i = 0; i < cnt; i++) this.circles.push({ z: -span + (2 * span * i) / (cnt - 1), r });
    this.group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
  }

  get vf() { return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw); }
  get speed() { return Math.hypot(this.vx, this.vz); }

  setSiren(on: boolean, t: number) {
    if (!this.bar.length) return;
    const ph = Math.floor(t * 7) % 2;
    this.bar[0].material = on && ph === 0 ? mats.redOn : mats.redOff;
    this.bar[1].material = on && ph === 1 ? mats.blueOn : mats.blueOff;
  }

  place(x: number, z: number, yaw: number) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.syncMesh(0);
  }

  localDir(nx: number, nz: number) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { x: nx * c - nz * s, z: nx * s + nz * c };
  }

  crash(px: number, pz: number, nx: number, nz: number, speed: number) {
    // nx,nz points from obstacle toward this car
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const dx = px - this.x, dz = pz - this.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const dirx = nx * c - nz * s, dirz = nx * s + nz * c;
    this.soft.impact(lx, 0.6 + CLEAR, lz, dirx, 0, dirz, speed);
    const dmg = Math.max(0, speed - 5) * 2.4 * Math.sqrt(1300 / this.t.mass);
    this.hp -= dmg;
    if (!this.impact || this.impact.speed < speed) this.impact = { px, pz, nx, nz, speed };
  }

  damage(d: number) {
    this.hp -= d;
  }

  wreck() {
    for (let i = 0; i < this.colorAttr.count * 3; i++) (this.colorAttr.array as Float32Array)[i] = this.baseColors[i] * 0.12;
    this.colorAttr.needsUpdate = true;
  }
  repair(color?: string) {
    this.hp = this.t.hp;
    this.burning = false; this.burnT = 0; this.exploded = false;
    this.soft.dent.fill(0);
    this.soft.active = true;
    if (color) {
      const c = new THREE.Color(color);
      const arr = this.colorAttr.array as Float32Array;
      const orig = this.baseColors;
      const oc = new THREE.Color(this.color);
      for (let i = 0; i < arr.length; i += 3) {
        if (Math.abs(orig[i] - oc.r) < 0.01 && Math.abs(orig[i + 1] - oc.g) < 0.01 && Math.abs(orig[i + 2] - oc.b) < 0.01) {
          orig[i] = c.r; orig[i + 1] = c.g; orig[i + 2] = c.b;
        }
      }
      this.color = color;
    }
    (this.colorAttr.array as Float32Array).set(this.baseColors);
    this.colorAttr.needsUpdate = true;
  }

  step(dt: number, world: World) {
    const t = this.t;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    let vf = this.vx * sn + this.vz * cs;
    let vl = this.vx * cs - this.vz * sn;
    const dead = this.exploded || this.hp <= 0;
    const thr = dead || !this.engineOn ? 0 : this.throttle;
    const brk = dead ? 0.05 : this.brake;
    let acc = 0;
    if (thr > 0) acc = thr * t.accel * (1 - clamp(vf / t.maxSpeed, 0, 1) * clamp(vf / t.maxSpeed, 0, 1));
    else if (thr < 0) {
      if (vf > 1) vf -= Math.min(vf, 28 * -thr * dt);
      else acc = thr * t.accel * 0.6 * (1 - clamp(-vf / 14, 0, 1));
    }
    vf += acc * dt;
    if (brk > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 34 * brk * dt);
    if (this.hand > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);
    if (thr === 0 && brk === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.2 + vf * vf * 0.004) * dt);
    vf *= 1 - 0.02 * dt;
    const grip = this.hand > 0 ? 1.1 : t.grip * (this.ghost > 0 ? 1 : 1);
    vl *= Math.exp(-grip * dt);
    this.vx = sn * vf + cs * vl;
    this.vz = cs * vf - sn * vl;
    const maxSt = 0.62 / (1 + Math.abs(vf) * 0.06);
    const stAng = this.steer * maxSt;
    const wBase = (vf * Math.tan(stAng)) / (t.L * 0.62);
    const wTarget = (this.hand > 0 ? wBase * 1.45 : wBase) * (dead ? 0.2 : 1);
    this.w += (wTarget - this.w) * Math.min(1, (this.hand > 0 ? 4 : 7) * dt);
    this.yaw += this.w * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.lastDrift = Math.abs(vl);
    // airborne
    if (this.y > 0 || this.vy > 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      this.airX += this.spinX * dt;
      this.airZ += this.spinZ * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        this.spinX = this.spinZ = 0;
        this.airX *= 0.3; this.airZ *= 0.3;
        this.soft.impact(0, 0.6, 0, 0, -1, 0, 6);
      }
    } else {
      this.airX = damp(this.airX, 0, 6, dt);
      this.airZ = damp(this.airZ, 0, 6, dt);
    }
    // world collision
    this.collideWorld(world);
    // visuals
    const af = (vf - this.prevVf) / Math.max(dt, 0.001);
    this.prevVf = vf;
    this.pitch = damp(this.pitch, clamp(-af * 0.004, -0.06, 0.06), 6, dt);
    this.roll = damp(this.roll, clamp(vf * this.w * 0.0045, -0.09, 0.09), 6, dt);
    this.spin += (vf / t.wr) * dt;
    this.soft.update(dt);
  }

  collideWorld(world: World) {
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    for (const c of this.circles) {
      const cx = this.x + sn * c.z, cz = this.z + cs * c.z;
      const r = world.resolveCircle(cx, cz, c.r);
      if (r.hit) {
        this.x += r.x - cx;
        this.z += r.z - cz;
        const nx = r.nx, nz = r.nz;
        const rx = cx - nx * c.r - this.x, rz = cz - nz * c.r - this.z;
        const vcx = this.vx + this.w * rz, vcz = this.vz - this.w * rx;
        const vn = vcx * nx + vcz * nz;
        if (vn < 0) {
          const j = -(1 + 0.22) * vn;
          this.vx += nx * j * 0.8;
          this.vz += nz * j * 0.8;
          this.w += (j * (rz * nx - rx * nz)) / 2.4;
          this.w = clamp(this.w, -3.5, 3.5);
          // tangential friction
          const tx = -nz, tz = nx;
          const vt = this.vx * tx + this.vz * tz;
          this.vx -= tx * vt * 0.06;
          this.vz -= tz * vt * 0.06;
          if (-vn > 1.5) this.crash(cx - nx * c.r, cz - nz * c.r, nx, nz, -vn);
        }
      }
    }
  }

  syncMesh(dt: number) {
    void dt;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    this.chassis.rotation.set(this.pitch + this.airX, 0, this.roll + this.airZ);
    for (const w of this.wheels) {
      w.mesh.rotation.x = this.spin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.45;
    }
    const braking = this.brake > 0.1 || this.hand > 0 || (this.throttle < 0 && this.vf > 1);
    const tm = braking ? mats.tailOn : mats.tail;
    for (const m of this.tailMeshes) if (m.material !== tm) m.material = tm;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry !== wheelG && o !== this.body) (o as THREE.Mesh).geometry.dispose();
    });
  }
}

/** circle-circle collision between two vehicles, with impulse response */
export function collideVehicles(a: Vehicle, b: Vehicle) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const far = (a.t.L + b.t.L) / 2 + 2;
  if (dx * dx + dz * dz > far * far) return;
  const sa = Math.sin(a.yaw), ca = Math.cos(a.yaw), sb = Math.sin(b.yaw), cb = Math.cos(b.yaw);
  const ma = a.t.mass * (a.exploded ? 1.5 : 1), mb = b.t.mass * (b.exploded ? 1.5 : 1);
  const Ia = ma * 2.4, Ib = mb * 2.4;
  for (const ca1 of a.circles) {
    for (const cb1 of b.circles) {
      const ax = a.x + sa * ca1.z, az = a.z + ca * ca1.z;
      const bx = b.x + sb * cb1.z, bz = b.z + cb * cb1.z;
      let nx = bx - ax, nz = bz - az;
      const d = Math.hypot(nx, nz);
      const rr = ca1.r + cb1.r;
      if (d >= rr) continue;
      if (d < 1e-4) { nx = 1; nz = 0; } else { nx /= d; nz /= d; }
      const pen = rr - d;
      const fa = mb / (ma + mb), fb = ma / (ma + mb);
      a.x -= nx * pen * fa; a.z -= nz * pen * fa;
      b.x += nx * pen * fb; b.z += nz * pen * fb;
      const cx = ax + nx * ca1.r, cz = az + nz * ca1.r;
      const rax = cx - a.x, raz = cz - a.z, rbx = cx - b.x, rbz = cz - b.z;
      const vax = a.vx + a.w * raz, vaz = a.vz - a.w * rax;
      const vbx = b.vx + b.w * rbz, vbz = b.vz - b.w * rbx;
      const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
      if (vn >= 0) continue;
      const cA = raz * nx - rax * nz, cB = rbz * nx - rbx * nz;
      const j = (-(1 + 0.3) * vn) / (1 / ma + 1 / mb + (cA * cA) / Ia + (cB * cB) / Ib);
      a.vx -= (j * nx) / ma; a.vz -= (j * nz) / ma;
      b.vx += (j * nx) / mb; b.vz += (j * nz) / mb;
      a.w = clamp(a.w - (j * cA) / Ia, -3.5, 3.5);
      b.w = clamp(b.w + (j * cB) / Ib, -3.5, 3.5);
      const sp = -vn;
      if (sp > 1.5) {
        a.crash(cx, cz, -nx, -nz, sp * Math.sqrt(mb / ma) * 0.8);
        b.crash(cx, cz, nx, nz, sp * Math.sqrt(ma / mb) * 0.8);
      }
    }
  }
}
