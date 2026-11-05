/**
 * Headless smoke test for the pure game logic (no WebGL / DOM required).
 * Bundles the TypeScript modules with esbuild, then exercises the career system
 * and validates the mission registry. Run with `npm test`.
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const dir = await mkdtemp(join(tmpdir(), 'meridian-smoke-'));
const out = join(dir, 'bundle.mjs');

await build({
  stdin: {
    contents: `
      export { Career, RANKS, ACHIEVEMENTS, PROPERTIES, INCOME_PERIOD } from './src/game/career.ts';
      export { JOBS, JOB_SPOTS, SERVICE_SPOTS } from './src/game/missions.ts';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'silent',
});

const { Career, RANKS, ACHIEVEMENTS, PROPERTIES, INCOME_PERIOD, JOBS, JOB_SPOTS, SERVICE_SPOTS } =
  await import(pathToFileURL(out).href);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

// ---------------------------------------------------------------- mission registry
check('all 9 job types are registered', () => {
  assert.equal(Object.keys(JOBS).length, 9);
  for (const id of ['story', 'taxi', 'hit', 'race', 'theft', 'rampage', 'courier', 'vigilante', 'demolition']) {
    assert.ok(JOBS[id], `missing job ${id}`);
    assert.equal(typeof JOBS[id].start, 'function');
  }
});
check('every job marker points at a real job', () => {
  assert.ok(JOB_SPOTS.length >= 12);
  for (const s of JOB_SPOTS) assert.ok(JOBS[s.id], `marker references unknown job ${s.id}`);
});
check('every service marker has a label and icon', () => {
  for (const s of SERVICE_SPOTS) {
    assert.ok(s.label && s.icon);
    assert.ok(['ammu', 'spray', 'safe'].includes(s.id));
  }
});

// ---------------------------------------------------------------- fake game host
const toasts = [];
let career;
const g = {
  money: 1000,
  stars: 0,
  player: { x: 0, z: 0, veh: null, owned: ['fist', 'pistol'] },
  toast: (t) => toasts.push(t),
  say: () => {},
  audio: { success() {}, fail() {}, ui() {} },
  save: () => {},
  addMoney(n) { this.money += n; career.onCash(this, n); },
};

career = new Career();
career.reset(g);

check('new career starts at rank 0 with no unlocks', () => {
  assert.equal(career.rank.name, 'Street Rat');
  assert.equal(career.rankIndex, 0);
  assert.equal(career.unlocked.size, 0);
  assert.equal(career.incomeRate, 0);
});

check('rank-ups unlock perks and a promo banner', () => {
  career.addXp(g, RANKS[1].xp);
  assert.equal(career.rankIndex, 1);
  assert.ok(career.promo > 0);
  assert.equal(career.price(100), 95);
  assert.equal(career.reward(1000), 1100);
  assert.ok(toasts.some((t) => t.includes('RANK UP')));
});

check('a locked property cannot be bought', () => {
  g.money = 100000;
  assert.equal(career.buyProperty(g, 'casino'), false);
  assert.equal(career.owned.size, 0);
});

check('buying a property charges cash and starts passive income', () => {
  const before = g.money;
  assert.equal(career.buyProperty(g, 'garage'), true);
  assert.ok(g.money < before);
  assert.ok(career.owned.has('garage'));
  assert.equal(career.incomeRate, Math.round(PROPERTIES[0].income * career.perks.income));
  const payday = g.money;
  career.tick(g, INCOME_PERIOD + 0.1);
  assert.equal(g.money, payday + career.incomeRate);
  assert.ok(toasts.some((t) => t.includes('Business income')));
});

check('jobs, kills and escapes feed stats + XP', () => {
  const xp = career.xp;
  career.onJob(g, 2000);
  career.onKill(g, true);
  career.onWantedClear(g, 3);
  assert.equal(career.stats.jobs, 1);
  assert.equal(career.stats.kills, 1);
  assert.equal(career.stats.escapes, 1);
  assert.equal(career.stats.bestJob, 2000);
  assert.ok(career.xp > xp);
});

check('achievements unlock once and pay out', () => {
  g.player.owned = ['fist', 'pistol', 'bat', 'smg', 'shotgun', 'ak', 'sniper', 'magnum'];
  career.tick(g, 1);
  assert.ok(career.unlocked.has('arsenal'));
  const xp = career.xp;
  career.tick(g, 1);
  assert.equal(career.xp, xp, 'achievement must not pay twice');
  assert.equal(career.view().achievements.length, ACHIEVEMENTS.length);
});

check('save data round-trips', () => {
  const data = JSON.parse(JSON.stringify(career.serialize()));
  const copy = new Career();
  copy.load(data, g);
  assert.equal(copy.xp, career.xp);
  assert.deepEqual(copy.owned, career.owned);
  assert.deepEqual(copy.unlocked, career.unlocked);
  assert.equal(copy.stats.jobs, career.stats.jobs);
  assert.equal(copy.incomeRate, career.incomeRate);
});

check('the HUD view is complete and bounded', () => {
  const v = career.view();
  assert.ok(v.progress >= 0 && v.progress <= 1);
  assert.equal(v.properties.length, PROPERTIES.length);
  assert.equal(v.achievements.length, ACHIEVEMENTS.length);
  assert.ok(v.rank && v.perks.maxHp >= 100);
  assert.equal(v.nextRank, RANKS[v.rankIndex + 1]?.name ?? null);
});

await rm(dir, { recursive: true, force: true });
console.log(`\n${passed} checks passed.`);
