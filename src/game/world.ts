import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, seeded, smooth } from './util';

export const N = 16; // blocks per side
export const S = 80; // cell size
export const HALF = (N * S) / 2;
export const DIRX = [0, 1, 0, -1];
export const DIRZ = [1, 0, -1, 0];
export const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export interface Box { x0: number; x1: number; z0: number; z1: number; h: number }
export interface Circ { x: number; z: number; r: number }
export interface Cell { i: number; j: number; cx: number; cz: number; boxes: Box[]; circs: Circ[]; park: boolean; mesh?: THREE.Mesh }

export const nodePos = (i: number, j: number) => ({ x: (i - N / 2) * S, z: (j - N / 2) * S });
export const blockCenter = (i: number, j: number) => ({ x: (i + 0.5 - N / 2) * S, z: (j + 0.5 - N / 2) * S });
export const cornerSpot = (i: number, j: number) => {
  const n = nodePos(i, j);
  return { x: n.x + 12, z: n.z + 12 };
};

const WALLS = ['#b8b2a7', '#9fa5ad', '#c9b79c', '#8c6e5f', '#7f8a94', '#a38f7d', '#6f7c8a', '#d1cdc4', '#5c6b7a', '#7b5e57', '#c2a98a', '#8e949b'];
const GLASS = ['#6a8ca8', '#4f7690', '#7aa0b8', '#587a99', '#3f5f7a'];

function makeWindowTextures() {
  const D = document.createElement('canvas');
  const E = document.createElement('canvas');
  D.width = D.height = E.width = E.height = 512;
  const d = D.getContext('2d')!;
  const e = E.getContext('2d')!;
  d.fillStyle = '#dcdcdc';
  d.fillRect(0, 0, 512, 512);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 512, 512);
  for (let cx = 0; cx < 4; cx++)
    for (let cy = 0; cy < 4; cy++) {
      const x0 = cx * 128, y0 = cy * 128;
      d.fillStyle = '#bcbcc2';
      d.fillRect(x0, y0 + 114, 128, 14);
      d.fillStyle = '#c9c9ce';
      d.fillRect(x0, y0, 128, 3);
      const lit = Math.random() < 0.42;
      const g = d.createLinearGradient(0, y0 + 22, 0, y0 + 100);
      if (lit) {
        g.addColorStop(0, '#ffeab0');
        g.addColorStop(1, '#f2c36b');
      } else {
        g.addColorStop(0, '#7b9bbd');
        g.addColorStop(0.5, '#34506e');
        g.addColorStop(1, '#1b2735');
      }
      d.fillStyle = g;
      d.fillRect(x0 + 18, y0 + 22, 92, 80);
      d.fillStyle = '#4a4c52';
      d.fillRect(x0 + 62, y0 + 22, 4, 80);
      d.fillRect(x0 + 18, y0 + 60, 92, 3);
      if (lit) {
        const warm = ['#ffcf7a', '#ffe2a0', '#ffb55a', '#bfe3ff'][Math.floor(Math.random() * 4)];
        e.fillStyle = warm;
        e.fillRect(x0 + 18, y0 + 22, 92, 80);
        e.fillStyle = '#000';
        e.fillRect(x0 + 62, y0 + 22, 4, 80);
      }
    }
  const dt = new THREE.CanvasTexture(D);
  const et = new THREE.CanvasTexture(E);
  for (const t of [dt, et]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }
  return { dt, et };
}

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const P = 12.8;
  g.fillStyle = '#34363c';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // tire wear strips
  g.fillStyle = 'rgba(20,20,24,0.22)';
  for (const m of [2.8, 7.0]) {
    g.fillRect(m * P - 14, 128, 10, 768);
    g.fillRect(1024 - m * P + 4, 128, 10, 768);
    g.fillRect(128, m * P - 14, 768, 10);
    g.fillRect(128, 1024 - m * P + 4, 768, 10);
  }
  // sidewalk
  g.fillStyle = '#a4a6aa';
  g.fillRect(128, 128, 768, 768);
  g.strokeStyle = 'rgba(90,92,96,0.55)';
  g.lineWidth = 1;
  for (let k = 128; k <= 896; k += 25.6) {
    g.beginPath(); g.moveTo(k, 128); g.lineTo(k, 896); g.stroke();
    g.beginPath(); g.moveTo(128, k); g.lineTo(896, k); g.stroke();
  }
  g.fillStyle = '#6f7174';
  g.fillRect(192, 192, 640, 640);
  g.strokeStyle = '#cfd1d4';
  g.lineWidth = 4;
  g.strokeRect(128, 128, 768, 768);
  // road markings (arms only)
  g.fillStyle = '#e6b800';
  g.fillRect(3, 128, 3, 768);
  g.fillRect(1018, 128, 3, 768);
  g.fillRect(128, 3, 768, 3);
  g.fillRect(128, 1018, 768, 3);
  g.fillStyle = '#eeeeee';
  g.fillRect(113, 128, 3, 768);
  g.fillRect(908, 128, 3, 768);
  g.fillRect(128, 113, 768, 3);
  g.fillRect(128, 908, 768, 3);
  for (let k = 140; k < 880; k += 52) {
    g.fillRect(62, k, 3, 26);
    g.fillRect(959, k + 26, 3, 26);
    g.fillRect(k, 62, 26, 3);
    g.fillRect(k + 26, 959, 26, 3);
  }
  // crosswalks
  g.fillStyle = 'rgba(240,240,240,0.92)';
  for (let x = 6; x < 124; x += 12.8)
    for (const y of [137, 841]) {
      g.fillRect(x, y, 6.4, 46);
      g.fillRect(x + 896, y, 6.4, 46);
    }
  for (let y = 6; y < 124; y += 12.8)
    for (const x of [137, 841]) {
      g.fillRect(x, y, 46, 6.4);
      g.fillRect(x, y + 896, 46, 6.4);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3f7a38';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(80,140,60,0.5)' : 'rgba(40,90,40,0.5)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 4);
  }
  g.strokeStyle = '#c4b48a';
  g.lineWidth = 16;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(512, 512); g.moveTo(512, 0); g.lineTo(0, 512); g.stroke();
  g.fillStyle = '#c4b48a';
  g.beginPath(); g.arc(256, 256, 44, 0, 7); g.fill();
  g.fillStyle = '#3c78b0';
  g.beginPath(); g.arc(256, 256, 30, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function box(
  w: number, h: number, d: number, x: number, y0: number, z: number,
  color: THREE.Color, win: boolean, offU: number, offV: number, roofMul = 0.7
) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y0 + h / 2, z);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const idx = f * 4 + k;
      const side = f < 2 || f > 3;
      if (side && win) {
        const width = f < 2 ? d : w;
        uv.setXY(idx, uv.getX(idx) * (width / 12) + offU, uv.getY(idx) * (h / 12) + offV);
      } else {
        uv.setXY(idx, 0.004, 0.004);
      }
      const m = f === 2 ? roofMul : f === 3 ? 0.4 : 1;
      col[idx * 3] = color.r * m;
      col[idx * 3 + 1] = color.g * m;
      col[idx * 3 + 2] = color.b * m;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class World {
  scene: THREE.Scene;
  cells: Cell[] = [];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  wallMat: THREE.MeshStandardMaterial;
  lampMat: THREE.MeshStandardMaterial;
  time = 17.3;
  day = 1;
  mapCanvas: HTMLCanvasElement;
  res = { x: 0, z: 0, hit: false, nx: 0, nz: 0, pen: 0 };
  hitType = 0;
  private fogColor = new THREE.Color();
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();
  private shadowOn = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.fog = new THREE.Fog(0x9bb8d8, 90, 620);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4036, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const { dt, et } = makeWindowTextures();
    this.wallMat = new THREE.MeshStandardMaterial({
      map: dt, emissiveMap: et, emissive: new THREE.Color(1, 0.88, 0.65), emissiveIntensity: 0,
      vertexColors: true, roughness: 0.7, metalness: 0.12,
    });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: new THREE.Color(1, 0.8, 0.5), emissiveIntensity: 0 });

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, night: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 top,bottom,sunDir,sunColor; uniform float night;
      void main(){ vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0); vec3 col=mix(bottom,top,pow(h,0.55));
      col=mix(col,bottom*0.9,smoothstep(0.0,-0.3,d.y));
      float s=max(dot(d,normalize(sunDir)),0.0); col+=sunColor*(pow(s,900.0)*4.0+pow(s,12.0)*0.35);
      vec3 p=floor(d*220.0); float hs=fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);
      col+=vec3(step(0.9972,hs))*night*smoothstep(0.05,0.35,d.y);
      gl_FragColor=vec4(col,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.buildGround();
    this.buildCity();
    this.mapCanvas = this.buildMap();
    this.setTime(this.time);
  }

  setShadows(on: boolean, size: number) {
    this.shadowOn = on;
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
  }

  private buildGround() {
    const tex = makeGroundTexture();
    tex.repeat.set(N, N);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(N * S, N * S),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(N * S + 100, N * S + 100),
      new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.95 })
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = -0.04;
    slab.receiveShadow = true;
    this.scene.add(slab);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: 0x0b4468, roughness: 0.25, metalness: 0.3 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2.5;
    this.scene.add(sea);
    // sea wall
    const wallM = new THREE.MeshStandardMaterial({ color: 0x5b5f66, roughness: 1 });
    const ext = HALF + 50;
    for (const [w, d, x, z] of [[2 * ext, 3, 0, ext], [2 * ext, 3, 0, -ext], [3, 2 * ext, ext, 0], [3, 2 * ext, -ext, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), wallM);
      m.position.set(x, -1, z);
      this.scene.add(m);
    }
  }

  private buildCity() {
    const grassTex = makeGrassTexture();
    const treePos: number[][] = [];
    const lampPos: number[][] = [];
    const parks: { x: number; z: number }[] = [];
    const tmpC = new THREE.Color();
    const sub = (x: number, z: number) => `${x},${z}`;
    void sub;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const bc = blockCenter(i, j);
        const R = seeded(i * 7919 + j * 104729 + 13);
        const dn = Math.hypot(bc.x, bc.z) / HALF;
        const cell: Cell = { i, j, cx: bc.x, cz: bc.z, boxes: [], circs: [], park: false };
        this.cells.push(cell);
        const park = dn > 0.12 && R() < 0.09;
        cell.park = park;
        if (park) {
          parks.push(bc);
          for (let k = 0; k < 18; k++) {
            const tx = bc.x + (R() * 2 - 1) * 22, tz = bc.z + (R() * 2 - 1) * 22;
            if (Math.hypot(tx - bc.x, tz - bc.z) < 6) continue;
            treePos.push([tx, tz, 0.9 + R() * 0.7]);
            cell.circs.push({ x: tx, z: tz, r: 0.6 });
          }
        } else {
          const lots: number[][] = [];
          const t = R();
          if (t < 0.2) lots.push([-25, -25, 25, 25]);
          else if (t < 0.55) {
            const s = (R() * 2 - 1) * 10;
            if (R() < 0.5) lots.push([-25, -25, s, 25], [s, -25, 25, 25]);
            else lots.push([-25, -25, 25, s], [-25, s, 25, 25]);
          } else {
            const sx = (R() * 2 - 1) * 9, sz = (R() * 2 - 1) * 9;
            lots.push([-25, -25, sx, sz], [sx, -25, 25, sz], [-25, sz, sx, 25], [sx, sz, 25, 25]);
          }
          const geos: THREE.BufferGeometry[] = [];
          for (const l of lots) {
            const x0 = l[0] + 0.4, z0 = l[1] + 0.4, x1 = l[2] - 0.4, z1 = l[3] - 0.4;
            const w = x1 - x0, d = z1 - z0;
            if (w < 6 || d < 6) continue;
            const cxl = bc.x + (x0 + x1) / 2, czl = bc.z + (z0 + z1) / 2;
            let h = dn < 0.28 ? 50 + R() * 120 : dn < 0.6 ? 18 + R() * 55 : 8 + R() * 24;
            if (w * d < 500) h *= 0.65;
            if (R() < 0.12) h *= 0.5;
            const glass = h > 55 && R() < 0.5;
            tmpC.set(glass ? GLASS[Math.floor(R() * GLASS.length)] : WALLS[Math.floor(R() * WALLS.length)]);
            const color = tmpC.clone();
            const oU = Math.floor(R() * 4) / 4, oV = Math.floor(R() * 4) / 4;
            geos.push(box(w, h, d, cxl, 0, czl, color, true, oU, oV));
            cell.boxes.push({ x0: bc.x + x0, x1: bc.x + x1, z0: bc.z + z0, z1: bc.z + z1, h });
            let top = h;
            if (h > 45 && w > 14 && d > 14) {
              const th = h * (0.12 + R() * 0.15);
              geos.push(box(w * 0.68, th, d * 0.68, cxl, h, czl, color, true, oU, oV));
              top = h + th;
            }
            const props = 1 + Math.floor(R() * 3);
            for (let p = 0; p < props; p++) {
              const pw = 1.5 + R() * 2.5, ph = 1 + R() * 1.4, pd = 1.5 + R() * 2.5;
              geos.push(box(pw, ph, pd, cxl + (R() - 0.5) * (w - 6) * 0.6, top, czl + (R() - 0.5) * (d - 6) * 0.6, new THREE.Color('#7d8187'), false, 0, 0, 1));
            }
            if (h > 85) geos.push(box(0.5, 18 + R() * 20, 0.5, cxl, top, czl, new THREE.Color('#555'), false, 0, 0, 1));
          }
          if (geos.length) {
            const merged = mergeGeometries(geos, false)!;
            geos.forEach((g) => g.dispose());
            const mesh = new THREE.Mesh(merged, this.wallMat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            cell.mesh = mesh;
          }
        }
        // street trees and lamps
        for (let side = 0; side < 4; side++) {
          for (const t of [-16, 0, 16]) {
            if (R() < 0.45) continue;
            const tt = t + (R() - 0.5) * 4;
            const sgn = side % 2 === 0 ? 1 : -1;
            const px = side < 2 ? bc.x + sgn * 29.3 : bc.x + tt;
            const pz = side < 2 ? bc.z + tt : bc.z + sgn * 29.3;
            treePos.push([px, pz, 0.8 + R() * 0.4]);
            cell.circs.push({ x: px, z: pz, r: 0.45 });
          }
          for (const t of [-9, 9]) {
            const sgn = side % 2 === 0 ? 1 : -1;
            const px = side < 2 ? bc.x + sgn * 28.2 : bc.x + t;
            const pz = side < 2 ? bc.z + t : bc.z + sgn * 28.2;
            lampPos.push([px, pz, side < 2 ? (sgn > 0 ? -1 : 1) : 0, side < 2 ? 0 : sgn > 0 ? -1 : 1]);
          }
        }
      }
    // parks
    if (parks.length) {
      const pg = new THREE.PlaneGeometry(50, 50);
      pg.rotateX(-Math.PI / 2);
      const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), parks.length);
      const m4 = new THREE.Matrix4();
      parks.forEach((p, i) => {
        m4.makeTranslation(p.x, 0.05, p.z);
        pm.setMatrixAt(i, m4);
      });
      pm.receiveShadow = true;
      this.scene.add(pm);
    }
    // trees
    const trunkG = new THREE.CylinderGeometry(0.2, 0.3, 2.6, 6);
    trunkG.translate(0, 1.3, 0);
    const leafG = new THREE.IcosahedronGeometry(1.9, 1);
    leafG.scale(1, 1.15, 1);
    leafG.translate(0, 4.2, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 }), treePos.length);
    const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), treePos.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    treePos.forEach((t, i) => {
      e.set(0, (t[0] * 7.3) % 6, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(t[0], 0, t[1]), q, new THREE.Vector3(t[2], t[2], t[2]));
      trunks.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      tmpC.setHSL(0.27 + ((t[0] * 13.1) % 1 + 1) % 1 * 0.08, 0.5, 0.28 + ((t[1] * 3.7) % 1 + 1) % 1 * 0.1);
      leaves.setColorAt(i, tmpC);
    });
    trunks.castShadow = leaves.castShadow = true;
    trunks.frustumCulled = leaves.frustumCulled = false;
    this.scene.add(trunks, leaves);
    // lamps
    const poleG = new THREE.CylinderGeometry(0.07, 0.1, 7, 6);
    poleG.translate(0, 3.5, 0);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.6, metalness: 0.5 }), lampPos.length);
    const headG = new THREE.BoxGeometry(0.5, 0.15, 1.1);
    headG.translate(0, 7.1, 0.45);
    const heads = new THREE.InstancedMesh(headG, this.lampMat, lampPos.length);
    lampPos.forEach((l, i) => {
      e.set(0, Math.atan2(l[2], l[3]), 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(l[0], 0, l[1]), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
    });
    poles.frustumCulled = heads.frustumCulled = false;
    this.scene.add(poles, heads);
  }

  private buildMap() {
    const sz = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = sz;
    const g = c.getContext('2d')!;
    const k = sz / (N * S + 100);
    g.fillStyle = '#0e1a2b';
    g.fillRect(0, 0, sz, sz);
    g.fillStyle = '#7c8594';
    g.fillRect(50 * k, 50 * k, N * S * k, N * S * k);
    for (const cell of this.cells) {
      const x = (cell.cx - 30 + HALF + 50) * k, z = (cell.cz - 30 + HALF + 50) * k;
      g.fillStyle = cell.park ? '#3a7d4a' : '#2c3342';
      g.fillRect(x, z, 60 * k, 60 * k);
    }
    return c;
  }
  mapXY(x: number, z: number) {
    const k = 1024 / (N * S + 100);
    return { x: (x + HALF + 50) * k, y: (z + HALF + 50) * k, k };
  }

  cellAt(x: number, z: number): Cell | null {
    const i = Math.floor((x + HALF) / S), j = Math.floor((z + HALF) / S);
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return this.cells[i * N + j];
  }

  resolveCircle(x: number, z: number, r: number) {
    const res = this.res;
    res.x = x; res.z = z; res.hit = false; res.nx = 0; res.nz = 0; res.pen = 0;
    const cell = this.cellAt(x, z);
    if (cell) {
      for (const b of cell.boxes) {
        const cx = clamp(res.x, b.x0, b.x1), cz = clamp(res.z, b.z0, b.z1);
        const dx = res.x - cx, dz = res.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          let nx: number, nz: number, pen: number;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = dx / d; nz = dz / d; pen = r - d;
          } else {
            const l = res.x - b.x0, rg = b.x1 - res.x, t = res.z - b.z0, bt = b.z1 - res.z;
            const m = Math.min(l, rg, t, bt);
            nx = 0; nz = 0;
            if (m === l) nx = -1; else if (m === rg) nx = 1; else if (m === t) nz = -1; else nz = 1;
            pen = m + r;
          }
          res.x += nx * pen; res.z += nz * pen;
          res.hit = true; res.nx = nx; res.nz = nz; res.pen = Math.max(res.pen, pen);
        }
      }
      for (const ci of cell.circs) {
        const dx = res.x - ci.x, dz = res.z - ci.z;
        const rr = r + ci.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          const pen = rr - d;
          const nx = dx / d, nz = dz / d;
          res.x += nx * pen; res.z += nz * pen;
          res.hit = true; res.nx = nx; res.nz = nz; res.pen = Math.max(res.pen, pen);
        }
      }
    }
    const B = HALF + 14;
    if (res.x > B) { res.x = B; res.hit = true; res.nx = -1; res.nz = 0; res.pen = 0.5; }
    if (res.x < -B) { res.x = -B; res.hit = true; res.nx = 1; res.nz = 0; res.pen = 0.5; }
    if (res.z > B) { res.z = B; res.hit = true; res.nz = -1; res.nx = 0; res.pen = 0.5; }
    if (res.z < -B) { res.z = -B; res.hit = true; res.nz = 1; res.nx = 0; res.pen = 0.5; }
    return res;
  }

  /** Marches a ray against static geometry. Returns distance or Infinity. hitType: 1 ground, 2 object */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number) {
    this.hitType = 0;
    let lim = maxD;
    let ground = false;
    if (dy < -1e-5) {
      const tg = -oy / dy;
      if (tg >= 0 && tg <= maxD) { lim = tg; ground = true; }
    }
    let last: Cell | null = null;
    for (let t = 0.6; t <= lim; t += 0.7) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const cell = this.cellAt(x, z);
      if (!cell) continue;
      last = cell;
      for (const b of cell.boxes) {
        if (y < b.h && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) { this.hitType = 2; return t; }
      }
      for (const c of cell.circs) {
        if (y < 5 && (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) { this.hitType = 2; return t; }
      }
    }
    void last;
    if (ground) { this.hitType = 1; return lim; }
    return Infinity;
  }

  setTime(h: number) {
    this.time = ((h % 24) + 24) % 24;
    const ang = ((this.time - 6) / 12) * Math.PI;
    const el = Math.sin(ang);
    const day = smooth((el + 0.1) / 0.4);
    this.day = day;
    const dusk = clamp(1 - Math.abs(el) / 0.45, 0, 1) * (el > -0.25 ? 1 : 0);
    const sunDir = new THREE.Vector3(Math.cos(ang), el, 0.35).normalize();
    const lightDir = el > 0.02 ? sunDir : sunDir.clone().multiplyScalar(-1);
    const top = this.tmpA.setRGB(0.012, 0.022, 0.065).lerp(this.tmpB.setRGB(0.18, 0.42, 0.85), day).lerp(this.tmpB.setRGB(0.22, 0.26, 0.52), dusk * 0.7);
    const hor = this.fogColor.setRGB(0.04, 0.06, 0.13).lerp(this.tmpB.setRGB(0.66, 0.8, 0.95), day).lerp(this.tmpB.setRGB(1, 0.52, 0.28), dusk * 0.85);
    (this.skyMat.uniforms.top.value as THREE.Color).copy(top);
    (this.skyMat.uniforms.bottom.value as THREE.Color).copy(hor);
    this.skyMat.uniforms.sunDir.value.copy(el > -0.05 ? sunDir : new THREE.Vector3(0, -1, 0));
    (this.skyMat.uniforms.sunColor.value as THREE.Color).setRGB(1, 0.85 - dusk * 0.3, 0.6 - dusk * 0.3).multiplyScalar(day);
    this.skyMat.uniforms.night.value = 1 - day;
    (this.scene.fog as THREE.Fog).color.copy(hor);
    this.sunDir = lightDir;
    const warm = this.tmpB.setRGB(1, 0.96, 0.9).lerp(this.tmpA.setRGB(1, 0.58, 0.3), dusk);
    if (el > 0.02) {
      this.sun.color.copy(warm);
      this.sun.intensity = 3.1 * smooth(el / 0.35);
    } else {
      this.sun.color.setRGB(0.5, 0.6, 1);
      this.sun.intensity = 0.55 * smooth(-el / 0.3);
    }
    this.hemi.color.copy(top).lerp(this.tmpB.setRGB(0.8, 0.9, 1), 0.4);
    this.hemi.groundColor.setRGB(0.3, 0.26, 0.22).multiplyScalar(0.3 + day * 0.7);
    this.hemi.intensity = 0.3 + day * 0.8;
    const night = 1 - day;
    this.wallMat.emissiveIntensity = night * 1.6;
    this.lampMat.emissiveIntensity = night * 3;
  }
  sunDir = new THREE.Vector3(0, 1, 0);

  update(dt: number, fx: number, fz: number, camPos: THREE.Vector3, frame: number) {
    this.setTime(this.time + dt * 0.03);
    this.sky.position.copy(camPos);
    const sd = this.sunDir;
    // snap shadow focus to reduce shimmering
    const sx = Math.round(fx / 4) * 4, sz = Math.round(fz / 4) * 4;
    this.sun.position.set(sx + sd.x * 200, sd.y * 200 + 10, sz + sd.z * 200);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();
    void this.shadowOn;
    if (frame % 20 === 0) {
      for (const c of this.cells) if (c.mesh) c.mesh.visible = Math.hypot(c.cx - camPos.x, c.cz - camPos.z) < 640;
    }
  }
}
