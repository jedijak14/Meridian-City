import * as THREE from 'three';
import type { Game, Marker } from './Game';
import type { Ped } from './peds';
import type { Vehicle } from './vehicle';
import { N, S, DIRX, DIRZ, nodePos, cornerSpot } from './world';
import { makeAI } from './traffic';
import { pick, rand, clamp } from './util';

export interface MissionRun {
  title: string;
  objective: string;
  timer?: number;
  update(dt: number): void;
  cleanup(): void;
  onKill?(p: Ped): void;
  blips?(): { x: number; z: number; color: string }[];
}
export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: number;
  hex: string;
  story?: boolean;
  start(g: Game): MissionRun | null;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function nodeSpot(g: Game, minD: number, maxD: number) {
  for (let k = 0; k < 60; k++) {
    const i = 1 + Math.floor(Math.random() * (N - 1)), j = 1 + Math.floor(Math.random() * (N - 1));
    const p = nodePos(i, j);
    const d = Math.hypot(p.x - g.player.x, p.z - g.player.z);
    if (d >= minD && d <= maxD) return { x: p.x, z: p.z, i, j };
  }
  const p = nodePos(3, 3);
  return { x: p.x, z: p.z, i: 3, j: 3 };
}
function cornerFar(g: Game, minD: number, maxD: number) {
  for (let k = 0; k < 60; k++) {
    const i = 1 + Math.floor(Math.random() * (N - 2)), j = 1 + Math.floor(Math.random() * (N - 2));
    const p = cornerSpot(i, j);
    const d = Math.hypot(p.x - g.player.x, p.z - g.player.z);
    if (d >= minD && d <= maxD) return p;
  }
  return cornerSpot(4, 4);
}

function ensureVehicle(g: Game, key: string): Vehicle | null {
  if (g.player.veh) return null;
  const rp = g.roadPoint(g.player.x, g.player.z);
  const v = g.spawnVehicle(key, rp.x, rp.z, rp.yaw, { keep: true });
  return v;
}

// ---------------------------------------------------------------- STORY
function storyHeist(g: Game): MissionRun | null {
  let stage = 0;
  let bank: Marker | null = null;
  let safe: Marker | null = null;
  let bankPos = { x: 0, z: 0 };
  let safePos = { x: 0, z: 0 };
  let t = 0;
  let car: Vehicle | null = null;
  const first = !g.completed.has('story');
  const p = g.player;
  const run: MissionRun = {
    title: 'The Meridian Job',
    objective: '...',
    update(dt) {
      t += dt;
      if (stage === 1) {
        if (bank && g.near(bankPos.x, bankPos.z, 9)) {
          stage = -1;
          g.startCutscene(
            [
              { dur: 3.2, from: () => V(bankPos.x + 26, 12, bankPos.z + 26), to: () => V(bankPos.x + 14, 7, bankPos.z + 14), look: () => V(bankPos.x, 8, bankPos.z), who: 'You', text: 'Nobody move! Hands where I can see them!' },
              { dur: 3.2, from: () => V(p.x + 3, 2, p.z + 3.5), to: () => V(p.x + 2, 1.7, p.z + 2.5), look: () => V(p.x, 1.4, p.z), who: 'Vic (radio)', text: "Got the cash? Alarm just tripped — cops are inbound. Get out of there, NOW!" },
            ],
            () => {
              g.addMoney(4000);
              g.toast('Cash grabbed: $4,000');
              g.setHeat(135);
              g.removeMarker(bank);
              bank = null;
              stage = 2;
              run.objective = 'Lose the cops';
            }
          );
        }
      } else if (stage === 2) {
        if (g.stars === 0 && !p.dead) {
          stage = 3;
          const s = nodeSpot(g, 250, 450);
          safePos = { x: s.x, z: s.z };
          safe = g.addMarker({ x: s.x, z: s.z, color: 0xffd400, radius: 8, label: 'SAFEHOUSE', kind: 'objective', auto: false, icon: '★' });
          run.objective = 'Get to the safehouse';
          g.say('Vic (radio)', "You lost 'em! Meet me at the safehouse. Take it easy.", 4);
        }
      } else if (stage === 3) {
        if (safe && g.near(safePos.x, safePos.z, 8)) {
          stage = -1;
          g.startCutscene(
            [
              { dur: 3.4, from: () => V(safePos.x + 18, 6, safePos.z - 16), to: () => V(safePos.x + 10, 4, safePos.z - 9), look: () => V(p.x, 1.4, p.z), who: 'Vic', text: "Ha! Look at that — clean getaway. You've still got it." },
              { dur: 3.6, from: () => V(p.x - 2, 1.6, p.z + 3), to: () => V(p.x - 1, 1.7, p.z + 2), look: () => V(p.x, 1.5, p.z), who: 'Vic', text: "There's plenty more where that came from. Check the job markers across the city." },
            ],
            () => {
              g.removeMarker(safe);
              safe = null;
              g.completeMission(first ? 7500 : 2500, 'JOB COMPLETE');
            }
          );
        }
      }
    },
    cleanup() {
      g.removeMarker(bank);
      g.removeMarker(safe);
    },
    blips() {
      const b: { x: number; z: number; color: string }[] = [];
      if (stage === 1) b.push({ ...bankPos, color: '#ffd400' });
      if (stage === 3) b.push({ ...safePos, color: '#ffd400' });
      return b;
    },
  };
  const B = nodeSpot(g, 300, 480);
  bankPos = { x: B.x, z: B.z };
  car = ensureVehicle(g, 'sports');
  void car;
  g.startCutscene(
    [
      { dur: 4, from: () => V(p.x + 14, 3, p.z + 14), to: () => V(p.x + 6, 2, p.z + 7), look: () => V(p.x, 1.5, p.z), who: 'Vic', text: first ? "Listen up. Meridian Bank. Three minutes, in and out. I've got the van — you've got the nerve." : "Same bank, new day. Don't get sloppy." },
      { dur: 4, from: () => V(bankPos.x + 60, 70, bankPos.z + 60), to: () => V(bankPos.x + 30, 38, bankPos.z + 30), look: () => V(bankPos.x, 6, bankPos.z), who: 'Vic', text: "That's the place. Marked on your map. Grab the cash and expect company." },
      { dur: 3, from: () => V(p.x - 4, 1.7, p.z + 4), to: () => V(p.x - 2, 1.6, p.z + 2.5), look: () => V(p.x, 1.5, p.z), who: 'You', text: "Let's make some noise." },
    ],
    () => {
      stage = 1;
      bank = g.addMarker({ x: bankPos.x, z: bankPos.z, color: 0xffd400, radius: 8, label: 'MERIDIAN BANK', kind: 'objective', auto: false, icon: '$' });
      run.objective = 'Drive to Meridian Bank';
    }
  );
  return run;
}

// ---------------------------------------------------------------- TAXI
function taxiJob(g: Game): MissionRun | null {
  let stage = 0;
  let pickup: Marker | null = null;
  let drop: Marker | null = null;
  let pu = { x: 0, z: 0 };
  let dp = { x: 0, z: 0 };
  let ped: Ped | null = null;
  let abandon = 0;
  let total = 0;
  const run: MissionRun = {
    title: 'Taxi Fare',
    objective: 'Get in a car',
    update(dt) {
      const pl = g.player;
      if (stage === 0) {
        if (pl.veh && !pl.veh.isPolice) {
          stage = 1;
          const s = nodeSpot(g, 140, 320);
          pu = { x: s.x, z: s.z };
          pickup = g.addMarker({ x: s.x, z: s.z, color: 0xffcc00, radius: 7, label: 'FARE', kind: 'objective', auto: false, icon: 'T' });
          ped = g.spawnPed('civ', s.x + 11, s.z + 11, { mission: true });
          if (ped) { ped.state = 'idle'; ped.stateT = 9999; }
          run.objective = 'Pick up your passenger';
        }
      } else if (stage === 1) {
        if (pl.veh && g.near(pu.x, pu.z, 7) && pl.veh.speed < 9) {
          stage = 2;
          g.removeMarker(pickup);
          if (ped) g.removePed(ped);
          const s = nodeSpot(g, 260, 520);
          dp = { x: s.x, z: s.z };
          total = Math.hypot(dp.x - pu.x, dp.z - pu.z);
          run.timer = total / 8.5 + 30;
          drop = g.addMarker({ x: s.x, z: s.z, color: 0x33ff88, radius: 8, label: 'DROP-OFF', kind: 'objective', auto: false, icon: '▼' });
          run.objective = 'Take the passenger to their destination';
          g.say('Passenger', pick(['Downtown, and step on it! I\'m late.', 'Just drive. Don\'t talk to me.', 'Wow, is this thing street legal?', 'Fast as you can, I\'ll tip well.']), 4);
        } else if (!pl.veh) {
          abandon += dt;
          if (abandon > 25) g.failMission('You abandoned your fare.');
        } else abandon = 0;
      } else if (stage === 2) {
        run.timer = Math.max(0, (run.timer || 0) - dt);
        if (!pl.veh) {
          abandon += dt;
          run.objective = 'Get back in the car!';
          if (abandon > 12) g.failMission('You abandoned your passenger.');
        } else {
          abandon = 0;
          run.objective = 'Take the passenger to their destination';
        }
        if (pl.veh && g.near(dp.x, dp.z, 8) && pl.veh.speed < 10) {
          g.completeMission(Math.round(180 + total * 0.6 + (run.timer || 0) * 3), 'FARE DELIVERED');
        } else if ((run.timer || 0) <= 0) g.failMission('Too slow — the passenger bailed.');
      }
    },
    cleanup() {
      g.removeMarker(pickup);
      g.removeMarker(drop);
      if (ped) g.removePed(ped);
    },
    blips: () => (stage === 1 ? [{ ...pu, color: '#ffcc00' }] : stage === 2 ? [{ ...dp, color: '#33ff88' }] : []),
  };
  ensureVehicle(g, 'taxi');
  if (!g.player.veh) run.objective = 'Get in the taxi';
  return run;
}

// ---------------------------------------------------------------- HIT
function hitJob(g: Game): MissionRun | null {
  const s = cornerFar(g, 260, 460);
  const target = g.spawnPed('target', s.x, s.z, { mission: true });
  const guards: Ped[] = [];
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const gp = g.spawnPed('guard', s.x + rand(-4, 4), s.z + rand(-4, 4), { mission: true });
    if (gp) guards.push(gp);
  }
  if (!target) return null;
  const mk = g.addMarker({ x: s.x, z: s.z, color: 0xff2244, radius: 3, label: 'TARGET', kind: 'objective', auto: false, icon: '☠' });
  const run: MissionRun = {
    title: 'Contract: Eliminate',
    objective: 'Find and eliminate the target',
    update() {
      if (mk && !target.dead) { mk.x = target.x; mk.z = target.z; mk.group.position.set(target.x, 0, target.z); }
      for (const gd of guards) if (!gd.dead && !gd.provoked && Math.hypot(gd.x - g.player.x, gd.z - g.player.z) < 36) gd.provoked = true;
      if (target.hp < 140 && !target.provoked) for (const gd of guards) gd.provoked = true;
      if (target.dead) g.completeMission(3500, 'TARGET ELIMINATED');
    },
    cleanup() {
      g.removeMarker(mk);
      for (const gd of guards) gd.mission = false;
      target.mission = false;
    },
    blips: () => (target.dead ? [] : [{ x: target.x, z: target.z, color: '#ff2244' }]),
  };
  g.say('Fixer', 'Target is a suit with armed escorts. Marked on your map. Make it quick.', 5);
  return run;
}

// ---------------------------------------------------------------- RACE
function raceJob(g: Game): MissionRun | null {
  const pl = g.player;
  const si = clamp(Math.round(pl.x / S + N / 2), 1, N - 1), sj = clamp(Math.round(pl.z / S + N / 2), 1, N - 1);
  const route: { i: number; j: number }[] = [{ i: si, j: sj }];
  let dir = Math.floor(Math.random() * 4);
  const seen = new Set<string>([`${si},${sj}`]);
  for (let k = 0; k < 24; k++) {
    const cur = route[route.length - 1];
    const opts = [dir, dir, (dir + 1) % 4, (dir + 3) % 4];
    let moved = false;
    for (let tries = 0; tries < 8 && !moved; tries++) {
      const nd = pick(opts);
      const ni = cur.i + DIRX[nd], nj = cur.j + DIRZ[nd];
      if (ni < 1 || nj < 1 || ni > N - 1 || nj > N - 1 || seen.has(`${ni},${nj}`)) continue;
      route.push({ i: ni, j: nj });
      seen.add(`${ni},${nj}`);
      dir = nd;
      moved = true;
    }
    if (!moved) break;
  }
  const pts = route.map((r) => nodePos(r.i, r.j));
  const cps: number[] = [];
  for (let k = 2; k < pts.length; k += 2) cps.push(k);
  if (cps[cps.length - 1] !== pts.length - 1) cps.push(pts.length - 1);
  let cpIdx = 0;
  let stage = 0; // 0 need car, 1 countdown, 2 racing
  let count = 4;
  let marker: Marker | null = null;
  const rivals: Vehicle[] = [];
  let len = 0;
  for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  const makeMarker = () => {
    g.removeMarker(marker);
    const q = pts[cps[cpIdx]];
    marker = g.addMarker({ x: q.x, z: q.z, color: 0x33aaff, radius: 11, label: cpIdx === cps.length - 1 ? 'FINISH' : `CP ${cpIdx + 1}/${cps.length}`, kind: 'objective', auto: false, icon: '⚑' });
  };
  const RXs = [-1, 0, 1, 0], RZs = [0, 1, 0, -1];
  const spawnRivals = () => {
    const d0 = ((): number => {
      for (let d = 0; d < 4; d++) if (route[1].i - route[0].i === DIRX[d] && route[1].j - route[0].j === DIRZ[d]) return d;
      return 0;
    })();
    const yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    ['muscle', 'sports'].forEach((k, n) => {
      const lane = 3 + n * 3.4;
      const x = pts[0].x + RXs[d0] * lane - DIRX[d0] * (10 + n * 7), z = pts[0].z + RZs[d0] * lane - DIRZ[d0] * (10 + n * 7);
      const v = g.spawnVehicle(k, x, z, yaws[d0], { keep: true });
      if (!v) return;
      v.ai = makeAI('path', 0, 0, d0, lane, 31 + n * 4);
      v.ai.frozen = true;
      v.hasDriver = true;
      for (let m = 1; m < pts.length; m++) {
        const a = pts[m - 1], b = pts[m];
        let dd = 0;
        for (let d = 0; d < 4; d++) if (Math.sign(b.x - a.x) === DIRX[d] && Math.sign(b.z - a.z) === DIRZ[d]) dd = d;
        v.ai.wps.push({ x: b.x + RXs[dd] * lane, z: b.z + RZs[dd] * lane });
      }
      rivals.push(v);
    });
  };
  const run: MissionRun = {
    title: 'Street Race',
    objective: 'Get in the race car',
    timer: len / 24 + 25,
    update(dt) {
      if (stage === 0) {
        if (pl.veh && !pl.veh.isPolice) {
          stage = 1;
          count = 4;
          spawnRivals();
          run.objective = 'Get ready...';
          g.toast('Race starts in 3...');
        }
      } else if (stage === 1) {
        count -= dt;
        const c = Math.ceil(count - 1);
        if (c <= 0) {
          stage = 2;
          g.toast('GO!');
          g.audio.success();
          for (const r of rivals) if (r.ai) r.ai.frozen = false;
          makeMarker();
          run.objective = `Checkpoint 1 / ${cps.length}`;
        } else if (Math.ceil(count - 1) !== Math.ceil(count - 1 + dt)) g.toast(`${c}...`);
        if (pl.veh) { pl.veh.brake = 1; pl.veh.hand = 1; pl.veh.throttle = 0; }
        else if (stage === 1) { /* allow leaving */ }
      } else {
        run.timer = Math.max(0, (run.timer || 0) - dt);
        const q = pts[cps[cpIdx]];
        if (g.near(q.x, q.z, 12)) {
          cpIdx++;
          g.audio.ui();
          if (cpIdx >= cps.length) {
            const bonus = Math.round((run.timer || 0) * 20);
            g.completeMission(4500 + bonus, 'RACE WON');
            return;
          }
          makeMarker();
          run.objective = `Checkpoint ${cpIdx + 1} / ${cps.length}`;
        }
        const fin = pts[pts.length - 1];
        for (const r of rivals) {
          if (r.ai && Math.hypot(r.x - fin.x, r.z - fin.z) < 16) { g.failMission('A rival crossed the line first.'); return; }
        }
        if ((run.timer || 0) <= 0) g.failMission('Out of time.');
        if (!pl.veh) run.objective = 'Get back in your car!';
      }
    },
    cleanup() {
      g.removeMarker(marker);
      for (const r of rivals) { r.keep = false; if (r.ai) { r.ai.mode = 'traffic'; r.ai.frozen = false; r.ai.wps = []; } }
    },
    blips: () => (stage === 2 ? [{ ...pts[cps[cpIdx]], color: '#33aaff' }] : []),
  };
  const v = ensureVehicle(g, 'sports');
  if (v) run.objective = 'Get in the race car';
  return run;
}

// ---------------------------------------------------------------- THEFT
function theftJob(g: Game): MissionRun | null {
  const s = nodeSpot(g, 220, 420);
  const rp = g.roadPoint(s.x, s.z);
  const car = g.spawnVehicle('super', rp.x, rp.z, rp.yaw, { keep: true });
  if (!car) return null;
  car.ai = makeAI('idle', 0, 0, 0, 0, 0);
  const mk = g.addMarker({ x: car.x, z: car.z, color: 0xcc44ff, radius: 4, label: 'CHEETAH', kind: 'objective', auto: false, icon: '🚗' });
  let stage = 0;
  let garage: Marker | null = null;
  let gp = { x: 0, z: 0 };
  const run: MissionRun = {
    title: 'Grand Theft Cheetah',
    objective: 'Steal the marked Cheetah Super',
    update(dt) {
      if (stage === 0) {
        if (mk) { mk.x = car.x; mk.z = car.z; mk.group.position.set(car.x, 0, car.z); }
        if (g.player.veh === car) {
          stage = 1;
          g.removeMarker(mk);
          g.addHeat(32, 'stolen');
          const q = nodeSpot(g, 260, 500);
          gp = { x: q.x, z: q.z };
          garage = g.addMarker({ x: q.x, z: q.z, color: 0xcc44ff, radius: 9, label: 'CHOP SHOP', kind: 'objective', auto: false, icon: '▼' });
          run.objective = 'Deliver the car to the chop shop';
          run.timer = Math.hypot(q.x - car.x, q.z - car.z) / 9 + 45;
        }
      } else {
        run.timer = Math.max(0, (run.timer || 0) - dt);
        if (g.player.veh !== car) run.objective = 'Get back in the Cheetah!';
        else run.objective = 'Deliver the car to the chop shop';
        if (car.exploded || car.hp <= 0) g.failMission('The car was destroyed.');
        else if (g.player.veh === car && g.near(gp.x, gp.z, 9)) {
          g.completeMission(Math.round(3000 * (0.45 + 0.55 * clamp(car.hp / car.t.hp, 0, 1))), 'CAR DELIVERED');
        } else if ((run.timer || 0) <= 0) g.failMission('Too slow.');
      }
      if (stage === 0 && (car.exploded || car.hp <= 0)) g.failMission('The car was destroyed.');
    },
    cleanup() {
      g.removeMarker(mk);
      g.removeMarker(garage);
      car.keep = false;
    },
    blips: () => (stage === 0 ? [{ x: car.x, z: car.z, color: '#cc44ff' }] : [{ ...gp, color: '#cc44ff' }]),
  };
  g.say('Dealer', 'A Cheetah Super is parked uptown. Bring it to the chop shop in one piece.', 5);
  return run;
}

// ---------------------------------------------------------------- RAMPAGE
function rampageJob(g: Game): MissionRun | null {
  const goal = 15;
  let kills = 0;
  g.player.give('smg', 150);
  g.player.select('smg', g);
  g.toast('Weapon supplied: Micro SMG');
  const run: MissionRun = {
    title: 'Rampage',
    objective: `Kill ${goal} people — 0 / ${goal}`,
    timer: 90,
    update(dt) {
      run.timer = Math.max(0, (run.timer || 0) - dt);
      run.objective = `Kill ${goal} people — ${kills} / ${goal}`;
      if (kills >= goal) g.completeMission(2800, 'RAMPAGE COMPLETE');
      else if ((run.timer || 0) <= 0) g.failMission('Time is up.');
    },
    onKill(p) {
      if (p.killedByPlayer) kills++;
    },
    cleanup() {},
  };
  return run;
}

export const JOBS: Record<string, MissionDef> = {
  story: { id: 'story', name: 'The Meridian Job', desc: 'Story — Rob the Meridian Bank', icon: '★', color: 0xffd400, hex: '#ffd400', story: true, start: storyHeist },
  taxi: { id: 'taxi', name: 'Taxi Fare', desc: 'Pick up and deliver passengers', icon: 'T', color: 0xffaa00, hex: '#ffaa00', start: taxiJob },
  hit: { id: 'hit', name: 'Contract', desc: 'Eliminate a high-value target', icon: '☠', color: 0xff3355, hex: '#ff3355', start: hitJob },
  race: { id: 'race', name: 'Street Race', desc: 'Beat rivals through the city', icon: '⚑', color: 0x33aaff, hex: '#33aaff', start: raceJob },
  theft: { id: 'theft', name: 'Car Theft', desc: 'Steal a supercar and deliver it', icon: '🚗', color: 0xcc44ff, hex: '#cc44ff', start: theftJob },
  rampage: { id: 'rampage', name: 'Rampage', desc: 'Cause chaos against the clock', icon: '☢', color: 0xff7722, hex: '#ff7722', start: rampageJob },
};

export const JOB_SPOTS: { id: string; i: number; j: number }[] = [
  { id: 'story', i: 9, j: 9 },
  { id: 'taxi', i: 7, j: 7 },
  { id: 'hit', i: 10, j: 6 },
  { id: 'race', i: 6, j: 10 },
  { id: 'theft', i: 11, j: 10 },
  { id: 'rampage', i: 5, j: 6 },
  { id: 'taxi', i: 12, j: 4 },
  { id: 'hit', i: 3, j: 10 },
  { id: 'race', i: 13, j: 13 },
  { id: 'rampage', i: 13, j: 3 },
  { id: 'theft', i: 3, j: 3 },
  { id: 'taxi', i: 2, j: 13 },
];

export const SERVICE_SPOTS: { id: 'ammu' | 'spray' | 'safe'; i: number; j: number; label: string; color: number; icon: string }[] = [
  { id: 'ammu', i: 7, j: 9, label: 'AMMU-NATION', color: 0xff5533, icon: '🔫' },
  { id: 'spray', i: 9, j: 7, label: "PAY 'N' SPRAY", color: 0xff66cc, icon: '🎨' },
  { id: 'safe', i: 8, j: 7, label: 'SAFEHOUSE', color: 0x44ddaa, icon: '🏠' },
  { id: 'ammu', i: 12, j: 12, label: 'AMMU-NATION', color: 0xff5533, icon: '🔫' },
  { id: 'spray', i: 4, j: 12, label: "PAY 'N' SPRAY", color: 0xff66cc, icon: '🎨' },
  { id: 'safe', i: 4, j: 4, label: 'SAFEHOUSE', color: 0x44ddaa, icon: '🏠' },
  { id: 'ammu', i: 3, j: 7, label: 'AMMU-NATION', color: 0xff5533, icon: '🔫' },
];

export function introShots(g: Game) {
  const p = g.player;
  return [
    { dur: 5, from: () => V(-260, 190, -300), to: () => V(-90, 110, -140), look: () => V(0, 45, 0), who: 'Narrator', text: 'Meridian City. Where everybody has a plan and nobody has a conscience.' },
    { dur: 4.5, from: () => V(120, 60, 120), to: () => V(40, 32, 44), look: () => V(0, 6, 0), who: 'You', text: 'Five years inside. The skyline changed. The people... not so much.' },
    { dur: 4, from: () => V(p.x + 4, 1.7, p.z + 5), to: () => V(p.x + 2.4, 1.6, p.z + 3), look: () => V(p.x, 1.5, p.z), who: 'Vic (phone)', text: "Hey. You're out. Good. I've got work — if you've still got the nerve." },
    { dur: 4.5, from: () => V(p.x + 40, 25, p.z + 40), to: () => V(p.x + 30, 14, p.z + 28), look: () => V(92, 6, 92), who: 'Vic (phone)', text: 'See the gold star? Walk into it and press E. Jobs are marked all over town. Try not to die.' },
  ];
}
