import * as THREE from 'three';

export type WKind = 'melee' | 'hitscan' | 'rocket' | 'grenade' | 'flame';
export interface WDef {
  id: string;
  name: string;
  kind: WKind;
  dmg: number;
  rate: number; // shots per second
  mag: number;
  buy: number; // ammo per purchase
  spread: number;
  pellets: number;
  range: number;
  auto: boolean;
  recoil: number;
  reload: number;
  price: number;
  snd: string;
  zoom: number;
  twoHand: boolean;
  desc: string;
  /** Suppressed weapons are quieter and raise far less heat when fired. */
  silenced?: boolean;
}

export const WEAPONS: WDef[] = [
  { id: 'fist', name: 'Fists', kind: 'melee', dmg: 14, rate: 2.6, mag: 0, buy: 0, spread: 0, pellets: 1, range: 2.1, auto: true, recoil: 0, reload: 0, price: 0, snd: 'melee', zoom: 1, twoHand: false, desc: 'Bare knuckles.' },
  { id: 'bat', name: 'Baseball Bat', kind: 'melee', dmg: 38, rate: 1.5, mag: 0, buy: 0, spread: 0, pellets: 1, range: 2.8, auto: true, recoil: 0, reload: 0, price: 150, snd: 'melee', zoom: 1, twoHand: false, desc: 'Home run for your enemies.' },
  { id: 'pistol', name: 'M9 Pistol', kind: 'hitscan', dmg: 26, rate: 4.5, mag: 12, buy: 36, spread: 0.012, pellets: 1, range: 120, auto: false, recoil: 0.015, reload: 1.1, price: 0, snd: 'pistol', zoom: 1.2, twoHand: false, desc: 'Reliable sidearm.' },
  { id: 'magnum', name: '.357 Magnum', kind: 'hitscan', dmg: 70, rate: 1.7, mag: 6, buy: 24, spread: 0.008, pellets: 1, range: 140, auto: false, recoil: 0.05, reload: 1.8, price: 900, snd: 'magnum', zoom: 1.25, twoHand: false, desc: 'Hand cannon. One shot, one drop.' },
  { id: 'smg', name: 'Micro SMG', kind: 'hitscan', dmg: 15, rate: 14, mag: 30, buy: 90, spread: 0.035, pellets: 1, range: 90, auto: true, recoil: 0.01, reload: 1.5, price: 1500, snd: 'smg', zoom: 1.2, twoHand: true, desc: 'Spray and pray.' },
  { id: 'shotgun', name: 'Pump Shotgun', kind: 'hitscan', dmg: 13, rate: 1.15, mag: 6, buy: 24, spread: 0.065, pellets: 9, range: 60, auto: false, recoil: 0.07, reload: 2.2, price: 1800, snd: 'shotgun', zoom: 1.2, twoHand: true, desc: 'Close range devastation.' },
  { id: 'ak', name: 'AK-47', kind: 'hitscan', dmg: 24, rate: 9, mag: 30, buy: 90, spread: 0.022, pellets: 1, range: 160, auto: true, recoil: 0.02, reload: 1.9, price: 3200, snd: 'rifle', zoom: 1.35, twoHand: true, desc: 'Reliable full-auto rifle.' },
  { id: 'sniper', name: 'Sniper Rifle', kind: 'hitscan', dmg: 160, rate: 0.75, mag: 5, buy: 15, spread: 0.0015, pellets: 1, range: 400, auto: false, recoil: 0.06, reload: 2.4, price: 4500, snd: 'sniper', zoom: 4.5, twoHand: true, desc: 'Long range precision. Hold RMB to scope.' },
  { id: 'minigun', name: 'Minigun', kind: 'hitscan', dmg: 14, rate: 30, mag: 200, buy: 400, spread: 0.05, pellets: 1, range: 120, auto: true, recoil: 0.008, reload: 4, price: 9000, snd: 'smg', zoom: 1.15, twoHand: true, desc: 'Rain of lead.' },
  { id: 'grenade', name: 'Grenades', kind: 'grenade', dmg: 0, rate: 1, mag: 1, buy: 5, spread: 0, pellets: 1, range: 30, auto: false, recoil: 0, reload: 0.4, price: 700, snd: 'melee', zoom: 1, twoHand: false, desc: 'Pull pin. Throw.' },
  { id: 'rpg', name: 'Rocket Launcher', kind: 'rocket', dmg: 0, rate: 0.6, mag: 1, buy: 4, spread: 0, pellets: 1, range: 300, auto: false, recoil: 0.1, reload: 2.2, price: 6000, snd: 'rocket', zoom: 1.2, twoHand: true, desc: 'Boom. Everything goes boom.' },
  { id: 'flame', name: 'Flamethrower', kind: 'flame', dmg: 0, rate: 30, mag: 150, buy: 300, spread: 0.1, pellets: 1, range: 11, auto: true, recoil: 0, reload: 3, price: 5000, snd: 'flame', zoom: 1.15, twoHand: true, desc: 'Burn it all.' },
  { id: 'silenced', name: 'Whisper .45', kind: 'hitscan', dmg: 32, rate: 3.6, mag: 15, buy: 60, spread: 0.009, pellets: 1, range: 150, auto: false, recoil: 0.012, reload: 1.4, price: 2400, snd: 'pistol', zoom: 1.3, twoHand: false, desc: 'Suppressed. Quiet kills, almost no police heat.', silenced: true },
];
export const WMAP: Record<string, WDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

const mats = new Map<string, THREE.MeshStandardMaterial>();
const m = (c: string, metal = 0.6, r = 0.45) => {
  const k = c + metal + r;
  let x = mats.get(k);
  if (!x) mats.set(k, (x = new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: r })));
  return x;
};

export function makeWeaponMesh(id: string): THREE.Group | null {
  const g = new THREE.Group();
  const part = (w: number, h: number, l: number, x: number, y: number, z: number, c: string, metal = 0.6, r = 0.45) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m(c, metal, r));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const cyl = (rad: number, l: number, x: number, y: number, z: number, c: string, metal = 0.6) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, l, 10), m(c, metal));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  let len = 0.3;
  switch (id) {
    case 'bat':
      part(0.06, 0.06, 0.9, 0, 0, 0.3, '#b98a4e', 0, 0.8);
      part(0.09, 0.09, 0.35, 0, 0, 0.62, '#c99a5e', 0, 0.8);
      len = 0.8;
      break;
    case 'pistol':
      part(0.04, 0.05, 0.2, 0, 0.03, 0.09, '#2b2b30');
      part(0.04, 0.1, 0.05, 0, -0.04, 0.0, '#1b1b1d', 0.2, 0.8);
      len = 0.2;
      break;
    case 'magnum':
      part(0.045, 0.055, 0.28, 0, 0.03, 0.12, '#bfc3c9', 0.9, 0.25);
      part(0.05, 0.07, 0.07, 0, 0.02, 0.02, '#a0a4aa', 0.9, 0.25);
      part(0.04, 0.11, 0.05, 0, -0.05, -0.02, '#5a3b22', 0, 0.8);
      len = 0.3;
      break;
    case 'smg':
      part(0.05, 0.08, 0.3, 0, 0.0, 0.12, '#2a2a2e');
      part(0.03, 0.15, 0.045, 0, -0.1, 0.1, '#1a1a1c');
      part(0.04, 0.09, 0.05, 0, -0.06, -0.01, '#1a1a1c', 0.2, 0.8);
      len = 0.3;
      break;
    case 'shotgun':
      cyl(0.022, 0.75, 0, 0.02, 0.3, '#2a2a2e');
      part(0.045, 0.05, 0.28, 0, -0.02, 0.28, '#6b4423', 0.1, 0.8);
      part(0.05, 0.09, 0.3, 0, -0.01, -0.18, '#6b4423', 0.1, 0.8);
      len = 0.7;
      break;
    case 'ak':
      part(0.05, 0.09, 0.5, 0, 0.0, 0.18, '#25252a');
      part(0.045, 0.06, 0.25, 0, -0.01, 0.5, '#7a4a25', 0.1, 0.8);
      part(0.05, 0.09, 0.28, 0, -0.01, -0.2, '#7a4a25', 0.1, 0.8);
      part(0.03, 0.17, 0.05, 0, -0.12, 0.2, '#15151a').rotation.x = 0.25;
      cyl(0.015, 0.2, 0, 0.03, 0.78, '#222');
      len = 0.9;
      break;
    case 'sniper':
      part(0.045, 0.08, 0.6, 0, 0.0, 0.1, '#33382f', 0.3, 0.6);
      cyl(0.02, 0.6, 0, 0.02, 0.6, '#222');
      cyl(0.03, 0.25, 0, 0.09, 0.2, '#111');
      part(0.05, 0.1, 0.3, 0, -0.01, -0.3, '#33382f', 0.3, 0.6);
      len = 1.0;
      break;
    case 'minigun':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(0.012, 0.6, Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.4, '#555');
      }
      part(0.14, 0.14, 0.3, 0, 0, 0.0, '#2c2f33');
      part(0.04, 0.12, 0.05, 0, -0.1, -0.02, '#111');
      len = 0.75;
      break;
    case 'grenade': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m('#3f5a2a', 0.2, 0.7));
      s.position.set(0, 0, 0.05);
      g.add(s);
      len = 0.1;
      break;
    }
    case 'rpg':
      cyl(0.055, 0.9, 0, 0.04, 0.2, '#4b5a35', 0.3);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), m('#7a3b2b', 0.3, 0.6));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0.04, 0.75);
      g.add(cone);
      part(0.04, 0.1, 0.05, 0, -0.06, 0.05, '#111');
      len = 0.9;
      break;
    case 'silenced':
      part(0.045, 0.055, 0.22, 0, 0.03, 0.1, '#1c1e24');
      cyl(0.031, 0.3, 0, 0.045, 0.35, '#0e0f12', 0.3);
      part(0.04, 0.1, 0.05, 0, -0.05, 0.0, '#0e0f12', 0.2, 0.8);
      part(0.02, 0.012, 0.03, 0, 0.065, 0.2, '#5a6270', 0.9, 0.3);
      len = 0.45;
      break;
    case 'flame':
      cyl(0.03, 0.55, 0, 0.02, 0.28, '#444');
      cyl(0.07, 0.35, 0, -0.08, -0.05, '#b03a2e', 0.2);
      part(0.04, 0.1, 0.05, 0, -0.06, 0.1, '#111');
      len = 0.6;
      break;
    default:
      return null;
  }
  g.userData.len = len;
  return g;
}
