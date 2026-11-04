import * as THREE from 'three';
import type { Game } from './Game';
import type { Ped } from './peds';
import type { Vehicle } from './vehicle';
import { POINT_R, P } from './character';
import type { WDef } from './weapons';
import { clamp, rand } from './util';

export interface Hit {
  t: number;
  kind: 'none' | 'world' | 'ground' | 'ped' | 'veh' | 'heli';
  ped?: Ped;
  veh?: Vehicle;
  part: number;
  x: number; y: number; z: number;
}

export function castRay(g: Game, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number): Hit {
  const hit: Hit = { t: range, kind: 'none', part: 0, x: 0, y: 0, z: 0 };
  const tw = g.world.ray(ox, oy, oz, dx, dy, dz, range);
  if (tw < Infinity) { hit.t = tw; hit.kind = g.world.hitType === 1 ? 'ground' : 'world'; }
  for (const p of g.peds) {
    const cx = p.x - ox, cy = 1 - oy, cz = p.z - oz;
    const t0 = cx * dx + cy * dy + cz * dz;
    if (t0 < -2 || t0 > hit.t + 2) continue;
    if (cx * cx + cy * cy + cz * cz - t0 * t0 > 4) continue;
    const pos = p.ch.pos;
    for (let i = 0; i < 16; i++) {
      let px: number, py: number, pz: number, r: number;
      if (i < 15) {
        px = pos[i * 3] - ox; py = pos[i * 3 + 1] - oy; pz = pos[i * 3 + 2] - oz; r = POINT_R[i] * 1.3;
      } else {
        px = (pos[P.neck * 3] + pos[P.pel * 3]) / 2 - ox; py = (pos[P.neck * 3 + 1] + pos[P.pel * 3 + 1]) / 2 - oy; pz = (pos[P.neck * 3 + 2] + pos[P.pel * 3 + 2]) / 2 - oz; r = 0.3;
      }
      const t = px * dx + py * dy + pz * dz;
      if (t < 0) continue;
      const d2 = px * px + py * py + pz * pz - t * t;
      if (d2 > r * r) continue;
      const th = t - Math.sqrt(r * r - d2);
      if (th < hit.t && th >= 0) { hit.t = Math.max(0, th); hit.kind = 'ped'; hit.ped = p; hit.part = i === 15 ? 1 : i; hit.veh = undefined; }
    }
  }
  const axz = dx * dx + dz * dz;
  if (axz > 1e-6) {
    for (const v of g.vehicles) {
      const vx = v.x - ox, vz = v.z - oz;
      if (vx * vx + vz * vz > (range + 8) * (range + 8)) continue;
      const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
      for (const c of v.circles) {
        const ccx = v.x + sn * c.z, ccz = v.z + cs * c.z;
        const ocx = ox - ccx, ocz = oz - ccz;
        const b = ocx * dx + ocz * dz;
        const cc = ocx * ocx + ocz * ocz - c.r * c.r;
        const disc = b * b - axz * cc;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / axz;
        if (t < 0 || t >= hit.t) continue;
        const y = oy + dy * t;
        if (y < 0.15 || y > 2.0) continue;
        hit.t = t; hit.kind = 'veh'; hit.veh = v; hit.ped = undefined;
      }
    }
  }
  const h = g.heli;
  if (h) {
    const px = h.x - ox, py = h.y - oy, pz = h.z - oz;
    const t = px * dx + py * dy + pz * dz;
    const d2 = px * px + py * py + pz * pz - t * t;
    if (t > 0 && d2 < 9 && t < hit.t) { hit.t = t; hit.kind = 'heli'; }
  }
  hit.x = ox + dx * hit.t; hit.y = oy + dy * hit.t; hit.z = oz + dz * hit.t;
  return hit;
}

export function tracer(g: Game, from: THREE.Vector3, to: THREE.Vector3) {
  const len = from.distanceTo(to);
  if (len < 1.5) return;
  const tr = g.tracers[g.tracerIdx++ % g.tracers.length];
  tr.mesh.position.copy(from).add(to).multiplyScalar(0.5);
  tr.mesh.lookAt(to);
  tr.mesh.scale.set(1, 1, len);
  tr.mesh.visible = true;
  tr.life = 0.07;
}

export function muzzleFlash(g: Game, pos: THREE.Vector3, scale: number) {
  for (let i = 0; i < 4; i++) g.fx.emit(pos.x, pos.y, pos.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.55 * scale, 0.3, 1, 0.85, 0.4, 0.07, 1, 0, 4);
  g.flashLight.position.copy(pos);
  g.flashLight.intensity = Math.max(g.flashLight.intensity, 25 * scale);
  g.flashT = 0.05;
}

export function applyHit(g: Game, hit: Hit, dmg: number, dir: THREE.Vector3, owner: 'player' | 'npc', muzzle: THREE.Vector3, wid: string) {
  const to = new THREE.Vector3(hit.x, hit.y, hit.z);
  tracer(g, muzzle, to);
  const byPlayer = owner === 'player';
  switch (hit.kind) {
    case 'world':
    case 'ground':
      g.spark(hit.x, hit.y, hit.z, 5);
      g.smoke.emit(hit.x, hit.y, hit.z, 0, 0.5, 0, 0.5, 1.5, 0.6, 0.6, 0.6, 0.6, 0.4, -0.3, 1);
      break;
    case 'ped': {
      const p = hit.ped!;
      const mul = hit.part === 0 ? 3.2 : hit.part >= 7 ? 0.7 : 1;
      const wasDead = p.dead;
      const force = 3 + dmg * 0.13;
      g.blood(hit.x, hit.y, hit.z, dir.x, dir.z, hit.part === 0 ? 14 : 8);
      p.hurt(g, dmg * mul, dir.x, dir.z, hit.part, byPlayer, force);
      if (byPlayer) {
        g.hitMarker = 1;
        g.audio.hit(1);
        if (!wasDead) {
          if (p.kind === 'civ') g.addHeat(2.2, 'assault', true);
          else if (p.kind === 'cop') g.addHeat(8, 'assault cop', false);
          if (p.dead && hit.part === 0 && (wid === 'sniper' || wid === 'magnum' || Math.random() < 0.25)) g.slowmo(0.9, 0.22);
        }
      }
      break;
    }
    case 'veh': {
      const v = hit.veh!;
      v.damage(dmg * 0.2);
      g.spark(hit.x, hit.y, hit.z, 6);
      g.audio.hit(0.6);
      if (v.ai && v.hasDriver) { v.ai.panic = 5; v.ai.ignoreT = 5; }
      if (byPlayer && !v.playerIn) g.addHeat(v.isPolice ? 6 : 0.5, 'vehicle', true);
      if (v.hp <= 0 && !v.burning && !v.exploded) {
        v.burning = true; v.burnT = 0;
        g.lastFireByPlayer = byPlayer;
      }
      break;
    }
    case 'heli':
      if (g.heli) { g.heli.hp -= dmg; g.spark(hit.x, hit.y, hit.z, 6); g.hitMarker = 1; }
      break;
  }
}

export interface Projectile {
  kind: 'rocket' | 'grenade';
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  owner: 'player' | 'npc';
}

const rocketG = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8);
rocketG.rotateX(Math.PI / 2);
const rocketNose = new THREE.ConeGeometry(0.07, 0.2, 8);
rocketNose.rotateX(Math.PI / 2);
rocketNose.translate(0, 0, 0.45);
const gren = new THREE.SphereGeometry(0.09, 10, 8);

export function spawnProjectile(g: Game, kind: 'rocket' | 'grenade', pos: THREE.Vector3, vel: THREE.Vector3, fuse: number) {
  let mesh: THREE.Object3D;
  if (kind === 'rocket') {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(rocketG, new THREE.MeshStandardMaterial({ color: 0x777f6a, metalness: 0.5, roughness: 0.4 })));
    grp.add(new THREE.Mesh(rocketNose, new THREE.MeshStandardMaterial({ color: 0xaa3322 })));
    mesh = grp;
  } else mesh = new THREE.Mesh(gren, new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 0.6 }));
  mesh.position.copy(pos);
  g.scene.add(mesh);
  g.projectiles.push({ kind, mesh, pos: pos.clone(), vel: vel.clone(), fuse, owner: 'player' });
}

export function updateProjectiles(g: Game, dt: number) {
  for (let k = g.projectiles.length - 1; k >= 0; k--) {
    const p = g.projectiles[k];
    let boom = false;
    p.fuse -= dt;
    const prev = p.pos.clone();
    if (p.kind === 'rocket') {
      p.pos.addScaledVector(p.vel, dt);
      g.smoke.emit(p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0.6, 2.4, 0.7, 0.7, 0.7, 1.0, 0.5, 0, 1);
      g.fx.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.7, -0.3, 1, 0.6, 0.2, 0.14, 1, 0, 0);
      const len = p.vel.length() * dt;
      const d = p.vel.clone().normalize();
      if (g.world.ray(prev.x, prev.y, prev.z, d.x, d.y, d.z, len + 0.6) < Infinity) boom = true;
      if (p.pos.y < 0.15) boom = true;
      for (const pd of g.peds) {
        if (Math.abs(pd.x - p.pos.x) < 1 && Math.abs(pd.z - p.pos.z) < 1 && p.pos.y < 2.2) { boom = true; break; }
      }
      if (!boom) for (const v of g.vehicles) {
        if (Math.abs(v.x - p.pos.x) > 7 || Math.abs(v.z - p.pos.z) > 7) continue;
        const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
        for (const c of v.circles) {
          if (Math.hypot(p.pos.x - (v.x + sn * c.z), p.pos.z - (v.z + cs * c.z)) < c.r + 0.3 && p.pos.y < 2.4) boom = true;
        }
      }
      if (!boom && g.heli && p.pos.distanceTo(new THREE.Vector3(g.heli.x, g.heli.y, g.heli.z)) < 3.5) boom = true;
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(d));
      if (p.fuse <= 0) boom = true;
      if (boom) explode(g, p.pos.x, Math.max(0.5, p.pos.y), p.pos.z, 11, 150, true);
    } else {
      p.vel.y -= 22 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.1) {
        p.pos.y = 0.1;
        if (Math.abs(p.vel.y) > 1.5) p.vel.y *= -0.35; else p.vel.y = 0;
        p.vel.x *= Math.pow(0.04, dt * 2); p.vel.z *= Math.pow(0.04, dt * 2);
      }
      const cell = g.world.cellAt(p.pos.x, p.pos.z);
      if (cell) {
        for (const b of cell.boxes) {
          if (p.pos.y < b.h && p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1) {
            p.pos.copy(prev);
            p.vel.x *= -0.35; p.vel.z *= -0.35;
          }
        }
      }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 8;
      if (p.fuse <= 0) { boom = true; explode(g, p.pos.x, Math.max(0.4, p.pos.y), p.pos.z, 9, 120, true); }
    }
    if (boom) {
      g.scene.remove(p.mesh);
      g.projectiles.splice(k, 1);
    }
  }
}

export function explode(g: Game, x: number, y: number, z: number, r: number, dmg: number, byPlayer: boolean) {
  const sc = r / 9;
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), b = rand(-0.4, 1), sp = rand(2, r * 1.8);
    g.fx.emit(x, y + 0.4, z, Math.cos(a) * sp * (1 - b * 0.4), b * sp + 2, Math.sin(a) * sp * (1 - b * 0.4), rand(2.5, 5.5) * sc, rand(3, 6) * sc, 1, rand(0.35, 0.75), 0.1, rand(0.35, 0.85), 1, 0, 2.4);
  }
  for (let i = 0; i < 30; i++) {
    g.smoke.emit(x + rand(-1, 1), y + 1, z + rand(-1, 1), rand(-1, 1) * r * 0.3, rand(1, 4), rand(-1, 1) * r * 0.3, rand(3, 6) * sc, 9, 0.12, 0.12, 0.12, rand(2, 3.8), 0.75, -1.2, 0.9);
  }
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(6, 18);
    g.fx.emit(x, y + 0.5, z, Math.cos(a) * sp, rand(5, 14), Math.sin(a) * sp, 0.3, 0, 1, 0.8, 0.4, rand(0.9, 1.9), 1, 16, 0.15);
  }
  g.flashLight.position.set(x, y + 3, z);
  g.flashLight.intensity = 900 * sc;
  g.flashT = 0.35;
  g.addShock(x, y, z, r);
  const pl = g.player;
  const pd = Math.hypot(pl.x - x, pl.z - z);
  g.shake = Math.max(g.shake, clamp((26 * sc) / (pd * 0.1 + 1), 0, 1.6));
  g.audio.explosion(g.vol(x, z) * 1.2);
  g.noise(x, z, 90, byPlayer);
  if (byPlayer) g.addHeat(16, 'explosion', true);
  if (pd < 22 && !pl.dead && g.slowCool <= 0) { g.slowmo(0.85, 0.25); g.slowCool = 6; }
  g.lastFireByPlayer = byPlayer;
  for (const p of g.peds) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r * 1.5) continue;
    const f = 1 - d / (r * 1.5);
    const dx = (p.x - x) / (d || 1), dz = (p.z - z) / (d || 1);
    const force = 8 + 22 * f;
    if (p.dead) { p.ch.impulseAll(dx * force, 6 + 10 * f, dz * force); continue; }
    p.hurt(g, dmg * f * 1.5, dx, dz, 4, byPlayer, force);
    if (p.dead) p.ch.impulseAll(dx * force * 0.6, 6 + 10 * f, dz * force * 0.6);
    else if (f > 0.25) p.burn = 3;
  }
  for (const v of g.vehicles) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d > r * 1.8) continue;
    const f = 1 - d / (r * 1.8);
    const dx = (v.x - x) / (d || 1), dz = (v.z - z) / (d || 1);
    v.damage(dmg * f * 1.8);
    const m = 1300 / v.t.mass;
    v.vx += dx * f * 12 * m; v.vz += dz * f * 12 * m;
    if (f > 0.35 && v.y <= 0.01 && !v.playerIn) {
      v.vy = (4 + f * 7) * Math.sqrt(m);
      v.spinX = rand(-3, 3) * f * 2; v.spinZ = rand(-3, 3) * f * 2;
    }
    v.crash(x, z, dx, dz, f * 16);
    if (v.hp <= 0 && !v.burning && !v.exploded) { v.burning = true; v.burnT = 1.5; }
    if (v.ai && v.hasDriver) v.ai.panic = 5;
  }
  if (!pl.dead) {
    const f = 1 - pd / (r * 1.4);
    if (f > 0) {
      const dx = (pl.x - x) / (pd || 1), dz = (pl.z - z) / (pd || 1);
      if (pl.veh) {
        g.damagePlayer(dmg * f * 0.3, x, z);
        pl.veh.vx += dx * f * 8; pl.veh.vz += dz * f * 8;
      } else {
        g.damagePlayer(dmg * f * 0.7, x, z);
        pl.knock(dx * (8 + 20 * f), 6 + 8 * f, dz * (8 + 20 * f), 2.2);
      }
    }
  }
  if (g.heli && Math.hypot(g.heli.x - x, g.heli.z - z) < r * 1.2) g.heli.hp -= dmg * 0.6;
}

export function flame(g: Game, pos: THREE.Vector3, dir: THREE.Vector3, owner: 'player' | 'npc') {
  for (let i = 0; i < 3; i++) {
    const s = rand(11, 17);
    g.fx.emit(pos.x, pos.y, pos.z, dir.x * s + rand(-1.2, 1.2), dir.y * s + rand(-0.5, 1.2), dir.z * s + rand(-1.2, 1.2), rand(0.5, 0.9), rand(1.6, 2.6), 1, rand(0.4, 0.8), 0.1, rand(0.35, 0.6), 0.9, -1, 1.2);
  }
  if (Math.random() < 0.5) g.smoke.emit(pos.x + dir.x * 5, pos.y + dir.y * 5 + 0.5, pos.z + dir.z * 5, rand(-1, 1), 1.5, rand(-1, 1), 1, 3, 0.15, 0.15, 0.15, 1.2, 0.4, -1, 1);
  const byP = owner === 'player';
  g.lastFireByPlayer = byP;
  for (const p of g.peds) {
    const dx = p.x - pos.x, dz = p.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 11 || d < 0.1) continue;
    if ((dx * dir.x + dz * dir.z) / d < 0.82) continue;
    if (!p.dead) { p.burn = 5; p.hurt(g, 1.4, dir.x, dir.z, 4, byP, 0.5); }
    else p.burn = 5;
  }
  for (const v of g.vehicles) {
    const dx = v.x - pos.x, dz = v.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 12 || d < 0.1) continue;
    if ((dx * dir.x + dz * dir.z) / d < 0.8) continue;
    v.damage(1.0);
    if (v.hp <= 0 && !v.burning && !v.exploded) { v.burning = true; v.burnT = 0; }
  }
}

export function meleeHit(g: Game, w: WDef) {
  const pl = g.player;
  const fx = Math.sin(pl.ch.yaw), fz = Math.cos(pl.ch.yaw);
  let any = false;
  for (const p of g.peds) {
    const dx = p.x - pl.x, dz = p.z - pl.z;
    const d = Math.hypot(dx, dz);
    if (d > w.range + 0.5 || d < 0.01) continue;
    if ((dx * fx + dz * fz) / d < 0.25) continue;
    const wasDead = p.dead;
    const force = w.id === 'bat' ? 11 : 6;
    p.hurt(g, w.dmg, fx, fz, 1, true, force);
    if (p.dead) p.ch.impulse(0, fx * force * 1.5, 3, fz * force * 1.5);
    g.blood(p.x, 1.3, p.z, fx, fz, 6);
    g.audio.hit(1);
    g.hitMarker = 1;
    any = true;
    if (!wasDead) {
      if (p.kind === 'civ') g.addHeat(2.5, 'assault', true);
      if (p.kind === 'cop') g.addHeat(8, 'assault cop', false);
    }
  }
  for (const v of g.vehicles) {
    if (v.playerIn) continue;
    const dx = v.x - pl.x, dz = v.z - pl.z;
    const d = Math.hypot(dx, dz);
    if (d > w.range + 2 || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
    v.damage(w.dmg * 0.15);
    v.crash(pl.x + fx, pl.z + fz, -fx * 0 + dx / (d || 1), dz / (d || 1), 3);
    g.spark(pl.x + fx * 1.5, 1.1, pl.z + fz * 1.5, 4);
    any = true;
  }
  if (any) g.shake = Math.max(g.shake, 0.12);
}

export function npcShoot(g: Game, ped: Ped, dmg: number, chance: number) {
  const ch = ped.ch;
  const hand = new THREE.Vector3(ch.pos[P.rHand * 3], ch.pos[P.rHand * 3 + 1], ch.pos[P.rHand * 3 + 2]);
  const muzzle = hand.addScaledVector(ch.weaponDir, 0.35);
  const pl = g.player;
  const hitIt = Math.random() < chance;
  const ty = pl.veh ? 1.2 : 1.1 + pl.y;
  const to = new THREE.Vector3(pl.x + (hitIt ? 0 : rand(-2, 2)), hitIt ? ty : rand(0, 1.5), pl.z + (hitIt ? 0 : rand(-2, 2)));
  tracer(g, muzzle, to);
  muzzleFlash(g, muzzle, 0.8);
  const w = ped.weapon;
  g.audio.gun(w === 'ak' ? 'rifle' : w === 'smg' ? 'smg' : 'pistol', g.vol(ped.x, ped.z) * 0.85);
  if (hitIt) {
    g.damagePlayer(dmg, ped.x, ped.z);
    g.blood(to.x, to.y, to.z, pl.x - ped.x, pl.z - ped.z, 5);
  } else g.spark(to.x, to.y, to.z, 3);
  // frighten nearby civilians
  g.noise(ped.x, ped.z, 28, false);
}
