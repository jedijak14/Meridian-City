import type { Game } from './Game';
import { Vehicle } from './vehicle';
import { N, S, DIRX, DIRZ, YAWS, nodePos } from './world';
import { angDiff, clamp, rand } from './util';

const RX = [-1, 0, 1, 0];
const RZ = [0, 1, 0, -1];

export interface WP { x: number; z: number; turn?: boolean }
export interface AI {
  mode: 'traffic' | 'pursuit' | 'path' | 'idle';
  wps: WP[];
  i: number; j: number; dir: number;
  lane: number;
  cruise: number;
  stuckT: number; revT: number; ignoreT: number;
  direct: boolean;
  honkT: number;
  panic: number;
  frozen: boolean;
  exitT: number;
}

export function makeAI(mode: AI['mode'], i: number, j: number, dir: number, lane: number, cruise: number): AI {
  return { mode, wps: [], i, j, dir, lane, cruise, stuckT: 0, revT: 0, ignoreT: 0, direct: false, honkT: rand(2, 8), panic: 0, frozen: false, exitT: 0 };
}

/** random point on a road lane away from player. returns spawn info */
export function roadSpawn(px: number, pz: number, minD: number, maxD: number) {
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1));
    const dir = Math.floor(Math.random() * 4);
    const ni = i + DIRX[dir], nj = j + DIRZ[dir];
    if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
    const c = nodePos(i, j);
    const lane = Math.random() < 0.5 ? 2.8 : 7;
    const off = rand(14, 60);
    const x = c.x + DIRX[dir] * off + RX[dir] * lane;
    const z = c.z + DIRZ[dir] * off + RZ[dir] * lane;
    const d = Math.hypot(x - px, z - pz);
    if (d < minD || d > maxD) continue;
    return { x, z, yaw: YAWS[dir], i: ni, j: nj, dir, lane };
  }
  return null;
}

export function snapAI(v: Vehicle) {
  const ai = v.ai as AI;
  const q = Math.round(v.yaw / (Math.PI / 2));
  const dir = ((q % 4) + 4) % 4;
  const gi = v.x / S + N / 2, gj = v.z / S + N / 2;
  let i = Math.round(gi), j = Math.round(gj);
  if (dir === 0) j = Math.ceil(gj); else if (dir === 2) j = Math.floor(gj);
  else if (dir === 1) i = Math.ceil(gi); else i = Math.floor(gi);
  ai.i = clamp(i, 0, N); ai.j = clamp(j, 0, N); ai.dir = dir; ai.wps = [];
}

function planNext(g: Game, v: Vehicle) {
  const ai = v.ai as AI;
  const d = ai.dir;
  const c = nodePos(ai.i, ai.j);
  const cands = [d, (d + 1) % 4, (d + 3) % 4].filter((nd) => {
    const ni = ai.i + DIRX[nd], nj = ai.j + DIRZ[nd];
    return ni >= 0 && nj >= 0 && ni <= N && nj <= N;
  });
  let nd: number;
  if (!cands.length) nd = (d + 2) % 4;
  else if (ai.mode === 'pursuit') {
    const tx = g.player.veh ? g.player.veh.x : g.player.x, tz = g.player.veh ? g.player.veh.z : g.player.z;
    let best = 1e9;
    nd = cands[0];
    for (const o of cands) {
      const p = nodePos(ai.i + DIRX[o], ai.j + DIRZ[o]);
      const sc = Math.hypot(p.x - tx, p.z - tz) + rand(0, 40);
      if (sc < best) { best = sc; nd = o; }
    }
  } else {
    const r = Math.random();
    nd = r < 0.6 && cands.includes(d) ? d : cands[Math.floor(Math.random() * cands.length)];
  }
  const L1 = ai.lane;
  const L2 = ai.mode === 'pursuit' ? 4.9 : nd === d ? L1 : nd === (d + 3) % 4 ? 7 : 2.8;
  if (nd !== d) {
    const cx = c.x + RX[d] * L1 + RX[nd] * L2, cz = c.z + RZ[d] * L1 + RZ[nd] * L2;
    ai.wps.push({ x: cx, z: cz, turn: true });
  }
  ai.wps.push({ x: c.x + DIRX[nd] * 14 + RX[nd] * L2, z: c.z + DIRZ[nd] * 14 + RZ[nd] * L2 });
  ai.i += DIRX[nd]; ai.j += DIRZ[nd]; ai.dir = nd; ai.lane = L2;
}

function obstacleAhead(g: Game, v: Vehicle, look: number, ignoreCars: boolean) {
  const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
  let best = Infinity;
  const hw = v.t.W / 2 + 0.5;
  if (!ignoreCars) {
    for (const o of g.vehicles) {
      if (o === v || o.exploded && false) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      if (dx * dx + dz * dz > look * look + 100) continue;
      const f = dx * sn + dz * cs, l = dx * cs - dz * sn;
      if (f < 0.5 || f > look + o.t.L / 2) continue;
      if (Math.abs(l) < hw + o.t.W / 2 - 0.2) best = Math.min(best, f - v.t.L / 2 - o.t.L / 2);
    }
  }
  const check = (x: number, z: number, r: number) => {
    const dx = x - v.x, dz = z - v.z;
    if (dx * dx + dz * dz > look * look) return;
    const f = dx * sn + dz * cs, l = dx * cs - dz * sn;
    if (f < 0.5 || f > look) return;
    if (Math.abs(l) < hw + r) best = Math.min(best, f - v.t.L / 2);
  };
  for (const p of g.peds) if (!p.dead) check(p.x, p.z, 0.5);
  if (!g.player.veh && !g.player.dead) check(g.player.x, g.player.z, 0.5);
  return best;
}

function blocked(g: Game, x: number, z: number) {
  return g.world.resolveCircle(x, z, 1.4).hit;
}

export function driveAI(g: Game, v: Vehicle, dt: number) {
  const ai = v.ai as AI;
  v.throttle = 0; v.brake = 0; v.hand = 0; v.steer = 0;
  if (v.exploded || v.hp <= 0) return;
  if (ai.mode === 'idle' || ai.frozen) { v.brake = 1; v.hand = 1; return; }
  if (ai.panic > 0) ai.panic -= dt;
  const pl = g.player;
  const tx = pl.veh ? pl.veh.x : pl.x, tz = pl.veh ? pl.veh.z : pl.z;
  const vf = v.vf;
  let wp: WP | undefined;
  let cruise = ai.cruise;
  if (ai.mode === 'pursuit') {
    const d = Math.hypot(tx - v.x, tz - v.z);
    if (d < 46 && !ai.direct) { ai.direct = true; }
    else if (d > 70 && ai.direct) { ai.direct = false; snapAI(v); }
    if (ai.direct) {
      // aim slightly ahead of moving player
      const lead = pl.veh ? 0.4 : 0;
      wp = { x: tx + (pl.veh ? pl.veh.vx * lead : 0), z: tz + (pl.veh ? pl.veh.vz * lead : 0) };
    }
  }
  if (!wp) {
    if (ai.mode !== 'path') while (ai.wps.length < 2) planNext(g, v);
    wp = ai.wps[0];
    if (!wp) { v.brake = 1; return; }
    const dd = Math.hypot(wp.x - v.x, wp.z - v.z);
    if (dd < (wp.turn ? 5 : ai.mode === 'path' ? 14 : 6)) {
      ai.wps.shift();
      wp = ai.wps[0] || wp;
    }
    if (wp.turn && dd < 40) cruise = Math.min(cruise, 9);
    const nx = ai.wps[1];
    if (nx && nx.turn && dd < 30) cruise = Math.min(cruise, 11);
    if (ai.mode === 'path' && ai.wps[1]) {
      const a1 = Math.atan2(wp.x - v.x, wp.z - v.z), a2 = Math.atan2(ai.wps[1].x - wp.x, ai.wps[1].z - wp.z);
      if (Math.abs(angDiff(a1, a2)) > 0.6 && dd < 45) cruise = Math.min(cruise, 15);
    }
  }
  const dx = wp.x - v.x, dz = wp.z - v.z;
  const desired = Math.atan2(dx, dz);
  let err = angDiff(v.yaw, desired);
  // building feelers for direct pursuit
  if (ai.direct || ai.mode === 'path') {
    const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw);
    const ahead = 6 + Math.abs(vf) * 0.55;
    const fx = v.x + sn * ahead, fz = v.z + cs * ahead;
    const lx = v.x + Math.sin(v.yaw + 0.55) * ahead, lz = v.z + Math.cos(v.yaw + 0.55) * ahead;
    const rx = v.x + Math.sin(v.yaw - 0.55) * ahead, rz = v.z + Math.cos(v.yaw - 0.55) * ahead;
    if (blocked(g, fx, fz)) {
      const bl = blocked(g, lx, lz), br = blocked(g, rx, rz);
      err = br && !bl ? 1.2 : bl && !br ? -1.2 : err > 0 ? 1.2 : -1.2;
      cruise = Math.min(cruise, 12);
    } else if (blocked(g, lx, lz)) { err -= 0.6; }
    else if (blocked(g, rx, rz)) { err += 0.6; }
  }
  v.steer = clamp(err * 1.9, -1, 1);
  let target = cruise;
  if (Math.abs(err) > 0.7) target = Math.min(target, 7);
  if (ai.panic > 0) target = Math.max(target, 22);
  const look = 7 + Math.abs(vf) * 1.0;
  const ob = ai.ignoreT > 0 ? Infinity : obstacleAhead(g, v, look, ai.mode === 'pursuit' && ai.direct);
  if (ob < Infinity) {
    if (ob < 3) target = 0;
    else target = Math.min(target, Math.max(0, (ob - 3) * 1.2));
  }
  if (ai.ignoreT > 0) ai.ignoreT -= dt;
  if (target < vf - 1.5) {
    v.brake = clamp((vf - target) * 0.12, 0, 1);
  } else {
    v.throttle = clamp((target - vf) * 0.35, -0.2, 1);
  }
  if (ob < 4 && ai.mode === 'traffic') {
    ai.honkT -= dt;
    if (ai.honkT < 0) { ai.honkT = rand(2.5, 6); g.honk(v); }
  }
  // stuck recovery
  if (ai.revT > 0) {
    ai.revT -= dt;
    v.throttle = -1; v.brake = 0;
    v.steer = -v.steer;
    if (ai.revT <= 0) ai.ignoreT = 3;
    return;
  }
  if (Math.abs(vf) < 1.2 && target > 2.5 && ob > 5) {
    ai.stuckT += dt;
    if (ai.stuckT > 1.6) { ai.revT = 1.3; ai.stuckT = 0; }
  } else if (Math.abs(vf) < 0.8 && ob < 6) {
    ai.stuckT += dt * 0.6;
    if (ai.stuckT > 5) { ai.ignoreT = 2.5; ai.stuckT = 0; }
  } else ai.stuckT = Math.max(0, ai.stuckT - dt);
}
