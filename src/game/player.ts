import * as THREE from 'three';
import type { Game } from './Game';
import { Character, P, randomLook } from './character';
import { Vehicle } from './vehicle';
import { WMAP, WEAPONS, makeWeaponMesh } from './weapons';
import { angDiff, clamp, damp, rand } from './util';
import { makeAI } from './traffic';

export class Player {
  ch = new Character(randomLook('player'));
  x = 0; y = 0; z = 0; vy = 0; vx = 0; vz = 0;
  hp = 100; armor = 0;
  dead = false; deadT = 0;
  veh: Vehicle | null = null;
  weapons: Record<string, { mag: number; reserve: number }> = {};
  owned: string[] = ['fist'];
  cur = 'fist';
  fireCd = 0; reloadT = 0;
  swingT = -1; swingHit = false;
  aiming = false;
  ragT = 0;
  lastShot = 99;
  kick = 0;
  speed = 0;
  phase = 0;
  grounded = true;
  enterCd = 0;
  burnT = 0;
  wasFlame = false;

  constructor() {
    this.give('pistol', 60);
    this.cur = 'pistol';
    this.equipMesh();
  }

  give(id: string, ammo: number) {
    const w = WMAP[id];
    if (!w) return;
    if (!this.owned.includes(id)) {
      this.owned.push(id);
      this.owned.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
      this.weapons[id] = { mag: w.mag, reserve: 0 };
      if (w.mag === 0) this.weapons[id] = { mag: 0, reserve: 0 };
    }
    if (this.weapons[id]) this.weapons[id].reserve += ammo;
    if (w.mag && this.weapons[id].mag === 0 && this.weapons[id].reserve > 0) {
      const take = Math.min(w.mag, this.weapons[id].reserve);
      this.weapons[id].mag = take;
      this.weapons[id].reserve -= take;
    }
  }

  equipMesh() {
    const w = WMAP[this.cur];
    this.ch.setWeapon(this.cur, w.id === 'fist' ? null : makeWeaponMesh(w.id));
  }

  select(id: string, g?: Game) {
    if (!this.owned.includes(id) || this.cur === id) return;
    this.cur = id;
    this.reloadT = 0;
    this.fireCd = 0.25;
    this.equipMesh();
    g?.audio.ui();
  }
  cycle(dir: number, g: Game) {
    const i = this.owned.indexOf(this.cur);
    const n = (i + dir + this.owned.length) % this.owned.length;
    this.select(this.owned[n], g);
  }

  reload(g: Game) {
    const w = WMAP[this.cur];
    const a = this.weapons[this.cur];
    if (!a || !w.mag || this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return;
    this.reloadT = w.reload;
    g.audio.gun('reload');
  }

  update(g: Game, dt: number, dtReal: number) {
    const inp = g.input;
    const ch = this.ch;
    this.enterCd -= dt;
    this.fireCd -= dt;
    this.lastShot += dt;
    this.kick = damp(this.kick, 0, 12, dt);
    if (this.dead) {
      this.deadT += dtReal;
      if (this.ch.rag) {
        ch.stepRagdoll(dt, g.world);
        this.x = ch.centerX(); this.z = ch.centerZ();
      }
      return;
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      g.damagePlayer(7 * dt, this.x, this.z, true);
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WMAP[this.cur], a = this.weapons[this.cur];
        if (a) {
          const take = Math.min(w.mag - a.mag, a.reserve);
          a.mag += take; a.reserve -= take;
        }
      }
    }
    if (this.veh) { this.updateVehicle(g, dt); return; }
    ch.group.visible = !g.firstPerson;
    // ragdoll knockdown
    if (this.ragT > 0) {
      this.ragT -= dt;
      ch.stepRagdoll(dt, g.world);
      this.x = ch.centerX(); this.z = ch.centerZ(); this.y = 0;
      if (this.ragT <= 0 && ch.sleep > 0.3 || this.ragT < -2) {
        this.ragT = 0;
        ch.stopRagdoll();
      }
      if (this.ragT <= 0) { ch.stopRagdoll(); }
      return;
    }
    // weapon switching
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
    keys.forEach((k, i) => { if (inp.p(k) && this.owned[i]) this.select(this.owned[i], g); });
    if (inp.wheel) this.cycle(inp.wheel > 0 ? 1 : -1, g);
    if (inp.p('KeyR')) this.reload(g);

    const w = WMAP[this.cur];
    const ranged = w.kind !== 'melee';
    this.aiming = inp.mouse[2] && !g.cutscene;
    const cy = g.camYaw;
    const live = g.cutscene ? 0 : 1;
    const fwd = ((inp.k('KeyW') ? 1 : 0) - (inp.k('KeyS') ? 1 : 0)) * live;
    const str = ((inp.k('KeyA') ? 1 : 0) - (inp.k('KeyD') ? 1 : 0)) * live;
    let wx = Math.sin(cy) * fwd + Math.cos(cy) * str;
    let wz = Math.cos(cy) * fwd - Math.sin(cy) * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const sprint = inp.k('ShiftLeft') && !this.aiming && wl > 0;
    const maxSp = this.aiming ? 2.8 : sprint ? 7.8 : 4.4;
    this.vx = damp(this.vx, wx * maxSp, 11, dt);
    this.vz = damp(this.vz, wz * maxSp, 11, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // jump
    if (inp.p('Space') && this.grounded && !g.cutscene) { this.vy = 7.4; this.grounded = false; }
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    // collisions
    let r = g.world.resolveCircle(this.x, this.z, 0.4);
    this.x = r.x; this.z = r.z;
    for (const v of g.vehicles) {
      const dx = this.x - v.x, dz = this.z - v.z;
      if (dx * dx + dz * dz > (v.t.L / 2 + 1) * (v.t.L / 2 + 1)) continue;
      const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
      for (const c of v.circles) {
        const cx = v.x + sn * c.z, cz = v.z + cs * c.z;
        const ddx = this.x - cx, ddz = this.z - cz;
        const d = Math.hypot(ddx, ddz);
        if (d < c.r + 0.4 && this.y < 1.4) {
          this.x = cx + (ddx / (d || 1)) * (c.r + 0.4);
          this.z = cz + (ddz / (d || 1)) * (c.r + 0.4);
        }
      }
    }
    this.speed = Math.hypot(this.vx, this.vz);
    // facing
    const shooting = this.lastShot < 0.7;
    let face = -999;
    if (this.aiming || shooting || g.firstPerson) face = cy;
    else if (this.speed > 0.4) face = Math.atan2(this.vx, this.vz);
    if (face !== -999) ch.yaw += angDiff(ch.yaw, face) * Math.min(1, 14 * dt);
    ch.x = this.x; ch.z = this.z; ch.y = this.y;
    const p = ch.pose;
    p.phase += dt * (3.2 + this.speed * 1.7) * (this.speed > 0.25 ? 1 : 0);
    p.amp = this.speed < 0.2 ? damp(p.amp, 0, 8, dt) : clamp(0.4 + this.speed * 0.11, 0, 1.05);
    p.air = !this.grounded;
    p.holding = ranged;
    p.twoHand = w.twoHand;
    p.aim = ranged && (this.aiming || shooting || g.firstPerson) ? clamp(g.camPitch, -1.2, 1.2) : null;
    if (this.swingT >= 0) {
      this.swingT += dt / 0.32;
      p.swing = Math.min(1, this.swingT);
      if (this.swingT > 0.45 && !this.swingHit) { this.swingHit = true; g.meleeHit(this, w); }
      if (this.swingT >= 1.15) { this.swingT = -1; p.swing = -1; }
    } else p.swing = -1;
    // interact
    if (inp.p('KeyE') && this.enterCd <= 0 && !g.cutscene) g.interact();
    // fire
    const fireHeld = w.auto ? inp.mouse[0] : inp.mousePressed[0];
    if (!g.cutscene && (inp.mouse[0] || inp.mousePressed[0]) && g.state === 'playing') {
      if (fireHeld) this.fire(g, dt);
    }
    if (!inp.mouse[0] && this.wasFlame) this.wasFlame = false;
    ch.applyPose();
  }

  fire(g: Game, dt: number) {
    const w = WMAP[this.cur];
    if (this.fireCd > 0 || this.reloadT > 0) return;
    if (w.kind === 'melee') {
      if (this.swingT >= 0) return;
      this.swingT = 0; this.swingHit = false;
      this.fireCd = 1 / w.rate;
      g.audio.gun('melee');
      return;
    }
    const a = this.weapons[this.cur];
    if (!a) return;
    if (a.mag <= 0) {
      if (a.reserve > 0) this.reload(g);
      else if (g.input.mousePressed[0]) g.audio.gun('empty');
      this.fireCd = 0.2;
      return;
    }
    this.fireCd = 1 / w.rate;
    a.mag--;
    this.lastShot = 0;
    const cam = g.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const start = cam.position.clone().addScaledVector(dir, g.firstPerson ? 0.3 : g.camDist + 0.4);
    const muzzle = g.muzzlePos();
    if (w.kind === 'hitscan') {
      const quiet = !!w.silenced;
      g.audio.gun(w.snd, quiet ? 0.4 : 1);
      const spreadMul = (this.aiming ? 0.45 : 1) * (this.speed > 3 ? 1.5 : 1) * (this.grounded ? 1 : 1.8);
      let hitOne = false;
      for (let i = 0; i < w.pellets; i++) {
        const d = dir.clone();
        const s = w.spread * spreadMul;
        d.x += (Math.random() - 0.5) * 2 * s; d.y += (Math.random() - 0.5) * 2 * s; d.z += (Math.random() - 0.5) * 2 * s;
        d.normalize();
        const hit = g.castRay(start.x, start.y, start.z, d.x, d.y, d.z, w.range, 'player');
        g.applyHit(hit, w.dmg, d, 'player', muzzle, w.id);
        hitOne = hitOne || hit.kind === 'ped';
      }
      void hitOne;
      g.muzzleFlash(muzzle, quiet ? 0.3 : w.id === 'shotgun' || w.id === 'sniper' ? 1.6 : 1);
      g.noise(this.x, this.z, quiet ? 14 : 55, true);
      if (!quiet) g.addHeat(0.28, 'gunfire', true); else g.addHeat(0.03, 'suppressed shot', true);
      this.kick += w.recoil * 6;
      g.camPitch += w.recoil * (0.5 + Math.random() * 0.5);
      g.camYaw += (Math.random() - 0.5) * w.recoil * 0.6;
      g.shake = Math.max(g.shake, w.recoil * 5);
    } else if (w.kind === 'rocket') {
      g.audio.gun('rocket');
      const hit = g.castRay(start.x, start.y, start.z, dir.x, dir.y, dir.z, 200, 'player');
      const tgt = start.clone().addScaledVector(dir, Math.min(hit.t, 200));
      const d = tgt.sub(muzzle).normalize();
      g.spawnProjectile('rocket', muzzle, d.multiplyScalar(48), 8);
      g.muzzleFlash(muzzle, 2);
      g.noise(this.x, this.z, 60, true);
      this.kick += 0.6;
      g.shake = Math.max(g.shake, 0.4);
      g.camPitch += 0.03;
    } else if (w.kind === 'grenade') {
      g.audio.gun('melee');
      const d = dir.clone();
      d.y += 0.22;
      d.normalize();
      g.spawnProjectile('grenade', muzzle.clone(), d.multiplyScalar(16), 2.6);
      this.swingT = 0; this.swingHit = true;
      if (a.mag <= 0 && a.reserve > 0) { a.mag = 1; a.reserve--; }
      if (a.mag <= 0 && a.reserve <= 0) {
        this.owned = this.owned.filter((x) => x !== 'grenade');
        this.cur = 'pistol';
        this.equipMesh();
      }
    } else if (w.kind === 'flame') {
      g.audio.gun('flame');
      g.flame(muzzle, dir, 'player');
      g.noise(this.x, this.z, 30, true);
      g.addHeat(0.25, 'fire', true);
    }
    void dt;
  }

  knock(vx: number, vy: number, vz: number, dur: number) {
    if (this.veh || this.dead) return;
    this.ragT = dur;
    this.ch.group.visible = true;
    this.ch.startRagdoll(vx, vy, vz);
  }

  die(g: Game, dx: number, dz: number) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.hp = 0;
    if (this.veh) this.exit(g, true);
    this.ch.group.visible = true;
    this.ragT = 0;
    this.ch.startRagdoll(dx * 3, 5, dz * 3);
    g.onPlayerDeath();
  }

  enter(g: Game, v: Vehicle) {
    if (this.veh || v.exploded || v.hp <= 0) return;
    if (v.hasDriver) g.carjack(v);
    else if (!v.keep && !v.isPolice) g.addHeat(0.5, 'theft', true);
    if (v.isPolice) g.addHeat(12, 'copcar', true);
    v.hasDriver = false;
    v.playerIn = true;
    v.ai = null;
    v.siren = false;
    v.engineOn = true;
    v.ghost = 0;
    this.veh = v;
    this.ch.group.visible = false;
    this.enterCd = 0.4;
    g.onEnterVehicle(v);
  }

  exit(g: Game, force = false) {
    const v = this.veh;
    if (!v) return;
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const sides = [1, -1, 0];
    let px = v.x, pz = v.z;
    for (const s of sides) {
      const ox = v.x + cs * s * (v.t.W / 2 + 0.9), oz = v.z - sn * s * (v.t.W / 2 + 0.9);
      const r = g.world.resolveCircle(ox, oz, 0.45);
      if (!r.hit || s === 0) { px = ox; pz = oz; break; }
    }
    this.x = px; this.z = pz; this.y = 0; this.vy = 0;
    v.playerIn = false;
    v.throttle = 0; v.brake = 0.3; v.steer = 0; v.hand = 0;
    v.ai = makeAI('idle', 0, 0, 0, 0, 0);
    this.veh = null;
    this.ch.x = px; this.ch.z = pz;
    this.ch.yaw = v.yaw;
    this.ch.group.visible = true;
    this.enterCd = 0.4;
    this.vx = v.vx * 0.3; this.vz = v.vz * 0.3;
    if (!force && v.speed > 13) this.knock(v.vx * 0.5, 3, v.vz * 0.5, 1.8);
    g.onExitVehicle(v);
  }

  updateVehicle(g: Game, dt: number) {
    const v = this.veh!;
    const inp = g.input;
    this.x = v.x; this.z = v.z; this.y = 0;
    this.ch.group.visible = false;
    if (g.cutscene) { v.throttle = 0; v.brake = 0.5; return; }
    v.throttle = (inp.k('KeyW') ? 1 : 0) - (inp.k('KeyS') ? 1 : 0);
    v.brake = inp.k('KeyW') && inp.k('KeyS') ? 1 : 0;
    const target = (inp.k('KeyA') ? 1 : 0) - (inp.k('KeyD') ? 1 : 0);
    v.steer = damp(v.steer, target, target === 0 ? 9 : 6, dt);
    v.hand = inp.k('Space') ? 1 : 0;
    if (inp.p('KeyH')) g.honk(v, true);
    if (inp.p('KeyE') && this.enterCd <= 0) this.exit(g);
    if (inp.p('KeyF')) g.interact();
    // engine fire damage
    if (v.burning) g.damagePlayer(rand(2, 5) * dt, v.x, v.z, true);
    this.ch.x = v.x; this.ch.z = v.z;
    void P;
  }
}

const ids = WEAPONS.map((w) => w.id);
