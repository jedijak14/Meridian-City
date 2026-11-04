import type { Game } from './Game';
import { Character, Look, P, randomLook } from './character';
import { N, S, HALF, blockCenter } from './world';
import { angDiff, clamp, damp, rand } from './util';
import { makeWeaponMesh } from './weapons';

export type PedKind = 'civ' | 'cop' | 'gang' | 'target' | 'guard';
interface Node { i: number; j: number; sx: number; sz: number }
const SW = 27.5;

export class Ped {
  ch: Character;
  kind: PedKind;
  hp = 100;
  dead = false;
  deadT = 0;
  x = 0; z = 0; vx = 0; vz = 0;
  state: 'walk' | 'idle' | 'flee' | 'chase' | 'shoot' = 'walk';
  stateT = 0;
  node: Node = { i: 0, j: 0, sx: 1, sz: 1 };
  prevNode: Node | null = null;
  tx = 0; tz = 0;
  lat = 0;
  walkSpeed = 1.5;
  weapon: string | null = null;
  fireCd = 1;
  fleeX = 1; fleeZ = 0;
  provoked = false;
  burn = 0;
  losT = 0;
  los = false;
  mission = false;
  dmgMul = 1;
  stuckT = 0;
  id = Math.random();
  killedByPlayer = false;

  constructor(kind: PedKind, x: number, z: number, look?: Look) {
    this.kind = kind;
    this.ch = new Character(look || randomLook(kind));
    this.x = x; this.z = z;
    this.ch.x = x; this.ch.z = z;
    this.walkSpeed = rand(1.2, 1.8);
    this.lat = rand(-0.6, 0.6);
    if (kind === 'cop') { this.weapon = 'pistol'; this.hp = 120; }
    if (kind === 'gang') { this.weapon = Math.random() < 0.5 ? 'pistol' : 'smg'; this.hp = 100; }
    if (kind === 'guard') { this.weapon = 'smg'; this.hp = 160; }
    if (kind === 'target') { this.weapon = 'pistol'; this.hp = 140; }
    if (this.weapon) this.setWeapon(this.weapon);
    this.snapNode();
    this.ch.applyPose();
    this.ch.sync();
  }

  setWeapon(id: string | null) {
    this.weapon = id;
    this.ch.setWeapon(id, id ? makeWeaponMesh(id) : null);
  }

  cornerPos(n: Node) {
    const b = blockCenter(n.i, n.j);
    return { x: b.x + n.sx * SW + this.lat * n.sx * 0.4, z: b.z + n.sz * SW + this.lat * n.sz * 0.4 };
  }

  snapNode() {
    const i = clamp(Math.floor((this.x + HALF) / S), 0, N - 1), j = clamp(Math.floor((this.z + HALF) / S), 0, N - 1);
    const b = blockCenter(i, j);
    this.node = { i, j, sx: this.x >= b.x ? 1 : -1, sz: this.z >= b.z ? 1 : -1 };
    this.prevNode = null;
    const c = this.cornerPos(this.node);
    this.tx = c.x; this.tz = c.z;
  }

  pickNext() {
    const cur = this.node;
    const opts: { n: Node; w: number }[] = [];
    opts.push({ n: { i: cur.i, j: cur.j, sx: -cur.sx, sz: cur.sz }, w: 1 }, { n: { i: cur.i, j: cur.j, sx: cur.sx, sz: -cur.sz }, w: 1 });
    const ci = cur.i + cur.sx, cj = cur.j + cur.sz;
    if (ci >= 0 && ci < N) opts.push({ n: { i: ci, j: cur.j, sx: -cur.sx, sz: cur.sz }, w: 0.55 });
    if (cj >= 0 && cj < N) opts.push({ n: { i: cur.i, j: cj, sx: cur.sx, sz: -cur.sz }, w: 0.55 });
    const pv = this.prevNode;
    let list = opts.filter((o) => !(pv && o.n.i === pv.i && o.n.j === pv.j && o.n.sx === pv.sx && o.n.sz === pv.sz));
    if (!list.length) list = opts;
    let tot = 0;
    for (const o of list) tot += o.w;
    let r = Math.random() * tot;
    let ch = list[0];
    for (const o of list) { r -= o.w; if (r <= 0) { ch = o; break; } }
    this.prevNode = cur;
    this.node = ch.n;
    const c = this.cornerPos(ch.n);
    this.tx = c.x; this.tz = c.z;
  }

  panic(x: number, z: number, dur = 7) {
    if (this.dead || this.kind === 'cop' || this.kind === 'guard') return;
    if (this.kind === 'gang') { this.provoked = true; return; }
    this.state = 'flee';
    let dx = this.x - x, dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    this.fleeX = dx + rand(-0.4, 0.4); this.fleeZ = dz + rand(-0.4, 0.4);
    const l = Math.hypot(this.fleeX, this.fleeZ) || 1;
    this.fleeX /= l; this.fleeZ /= l;
    this.stateT = dur + rand(0, 4);
  }

  hurt(g: Game, dmg: number, dx: number, dz: number, part: number, byPlayer: boolean, force: number) {
    if (this.dead) {
      this.ch.impulse(part, dx * force, force * 0.25, dz * force);
      return;
    }
    this.hp -= dmg;
    if (byPlayer) this.killedByPlayer = true;
    if (this.hp <= 0) {
      this.die(g, dx, dz, force, part, byPlayer);
      return;
    }
    if (this.kind === 'civ') this.panic(g.player.x, g.player.z, 9);
    else if (byPlayer) this.provoked = true;
    this.vx += dx * 0.5; this.vz += dz * 0.5;
  }

  die(g: Game, dx: number, dz: number, force: number, part = 4, byPlayer = false) {
    if (this.dead) return;
    this.dead = true;
    if (byPlayer) this.killedByPlayer = true;
    this.ch.startRagdoll(dx * force * 0.6 + this.vx * 0.8, 1.5 + force * 0.14, dz * force * 0.6 + this.vz * 0.8);
    this.ch.impulse(part, dx * force * 1.4, force * 0.35, dz * force * 1.4);
    g.onPedDeath(this, byPlayer);
  }

  update(g: Game, dt: number) {
    const ch = this.ch;
    if (this.dead) {
      this.deadT += dt;
      ch.stepRagdoll(dt, g.world);
      this.x = ch.centerX(); this.z = ch.centerZ();
      if (this.burn > 0) this.burn -= dt;
      return;
    }
    const pl = g.player;
    const dxp = pl.x - this.x, dzp = pl.z - this.z;
    const dp = Math.hypot(dxp, dzp);
    this.stateT -= dt;
    this.fireCd -= dt;
    this.losT -= dt;
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 20 * dt;
      if (this.state !== 'flee' || this.stateT < 0) {
        this.state = 'flee';
        const a = rand(0, Math.PI * 2);
        this.fleeX = Math.cos(a); this.fleeZ = Math.sin(a);
        this.stateT = 0.7;
      }
      if (this.hp <= 0) { this.die(g, this.fleeX, this.fleeZ, 3, 4, g.lastFireByPlayer); return; }
    }
    const hostile = this.kind === 'cop' ? g.stars > 0 : (this.kind === 'gang' || this.kind === 'guard') && this.provoked && !pl.dead;
    if (hostile && pl.dead) { this.state = 'walk'; }
    let wx = 0, wz = 0, sp = 0;
    let face = -999;
    if (hostile && !pl.dead && this.burn <= 0) {
      if (this.losT <= 0) {
        this.losT = 0.3;
        const t = g.world.ray(this.x, 1.4, this.z, dxp / (dp || 1), 0, dzp / (dp || 1), dp);
        this.los = t === Infinity;
      }
      const keep = this.kind === 'cop' ? 13 : 12;
      if (this.kind !== 'cop' && dp > 55) this.provoked = false;
      if (dp > keep || !this.los) {
        this.state = 'chase';
        wx = dxp / (dp || 1); wz = dzp / (dp || 1);
        sp = this.kind === 'cop' ? 6.3 : 5.5;
      } else {
        this.state = 'shoot';
        face = Math.atan2(dxp, dzp);
        // strafe
        const s = Math.sin(g.time * 0.8 + this.id * 10);
        wx = (dzp / (dp || 1)) * s; wz = (-dxp / (dp || 1)) * s;
        sp = 1.2;
        if (this.fireCd <= 0) {
          const stars = g.stars;
          const w = this.weapon || 'pistol';
          const rate = w === 'smg' ? 0.12 : w === 'ak' ? 0.16 : 0.7;
          this.fireCd = rate * rand(0.8, 1.6) + (w === 'pistol' ? 0.3 : 0);
          const dmg = w === 'ak' ? 7 : w === 'smg' ? 4 : 6;
          g.npcShoot(this, dmg * (0.8 + stars * 0.07), clamp(0.5 - dp * 0.012, 0.1, 0.5));
        }
      }
    } else if (this.kind === 'target' && (dp < 32 || this.provoked) && !pl.dead) {
      this.state = 'flee';
      this.fleeX = -dxp / (dp || 1); this.fleeZ = -dzp / (dp || 1);
      this.stateT = 1;
      wx = this.fleeX; wz = this.fleeZ; sp = 5.6;
    } else {
      if (this.state === 'chase' || this.state === 'shoot') { this.state = 'walk'; this.snapNode(); }
      if (this.kind === 'guard' && !this.provoked) {
        this.state = 'idle';
      }
      if (this.state === 'flee') {
        wx = this.fleeX; wz = this.fleeZ; sp = 5.6;
        if (this.stateT <= 0) { this.state = 'walk'; this.snapNode(); }
      } else if (this.state === 'idle') {
        if (this.kind !== 'guard' && this.stateT <= 0) this.state = 'walk';
      } else {
        const dx = this.tx - this.x, dz = this.tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.0) {
          if (Math.random() < 0.12) { this.state = 'idle'; this.stateT = rand(2, 6); }
          this.pickNext();
        } else { wx = dx / d; wz = dz / d; sp = this.walkSpeed; }
      }
      // avoid traffic
      if (this.state === 'walk' || this.state === 'idle') {
        for (const v of g.vehicles) {
          if (v.speed < 4) continue;
          const dx = this.x - v.x, dz = this.z - v.z;
          if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue;
          const d = Math.hypot(dx, dz);
          if (d < 12) {
            const fwd = (dx * v.vx + dz * v.vz) / (v.speed * d);
            if (fwd > 0.6) { this.panic(v.x, v.z, 3); break; }
          }
        }
      }
    }
    // move
    this.vx = damp(this.vx, wx * sp, 9, dt);
    this.vz = damp(this.vz, wz * sp, 9, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const r = g.world.resolveCircle(this.x, this.z, 0.35);
    if (r.hit) {
      this.x = r.x; this.z = r.z;
      if (this.state === 'flee') { this.fleeX = r.nx + rand(-0.3, 0.3); this.fleeZ = r.nz + rand(-0.3, 0.3); }
    }
    const spd = Math.hypot(this.vx, this.vz);
    if (face === -999 && spd > 0.3) face = Math.atan2(this.vx, this.vz);
    if (face !== -999) ch.yaw += angDiff(ch.yaw, face) * Math.min(1, 12 * dt);
    ch.x = this.x; ch.z = this.z; ch.y = 0;
    const p = ch.pose;
    p.phase += dt * (3.2 + spd * 1.7) * (spd > 0.25 ? 1 : 0);
    p.amp = spd < 0.2 ? damp(p.amp, 0, 8, dt) : clamp(0.4 + spd * 0.11, 0, 1.05);
    p.holding = !!this.weapon;
    p.twoHand = this.weapon === 'smg' || this.weapon === 'ak';
    if (this.state === 'shoot' || (this.weapon && this.state === 'chase')) {
      p.aim = this.state === 'shoot' ? Math.atan2(1.2 - 1.0, dp) : null;
    } else p.aim = null;
    ch.applyPose();
  }
}

export { P };
