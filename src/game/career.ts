import type { Game } from './Game';

/**
 * Persistent career layer: ranks, perks, achievements, statistics and a small
 * real-estate empire that pays out while you play. Everything is serialised
 * alongside the existing save game (see Game.save / Game.continueGame).
 */

export interface Perks {
  /** Multiplier applied to job payouts. */
  payout: number;
  /** Fraction knocked off Ammu-Nation prices (0..1). */
  discount: number;
  /** Maximum health the player can be healed to. */
  maxHp: number;
  /** Multiplier applied to passive property income. */
  income: number;
}

export interface RankDef {
  name: string;
  xp: number;
  perks: Perks;
  blurb: string;
}

export const RANKS: RankDef[] = [
  { name: 'Street Rat', xp: 0, perks: { payout: 1, discount: 0, maxHp: 100, income: 1 }, blurb: 'Fresh out. Nobody knows your name yet.' },
  { name: 'Hustler', xp: 300, perks: { payout: 1.1, discount: 0.05, maxHp: 100, income: 1 }, blurb: '+10% job payouts · 5% shop discount' },
  { name: 'Enforcer', xp: 800, perks: { payout: 1.15, discount: 0.1, maxHp: 110, income: 1 }, blurb: '+15% job payouts · 10% discount · +10 max HP' },
  { name: 'Wheelman', xp: 1600, perks: { payout: 1.2, discount: 0.1, maxHp: 115, income: 1.25 }, blurb: '+20% payouts · +25% business income' },
  { name: 'Shot Caller', xp: 2800, perks: { payout: 1.3, discount: 0.15, maxHp: 120, income: 1.5 }, blurb: '+30% payouts · 15% discount · +20 max HP' },
  { name: 'Kingpin', xp: 4500, perks: { payout: 1.4, discount: 0.2, maxHp: 130, income: 2 }, blurb: '+40% payouts · double business income' },
  { name: 'Legend', xp: 7000, perks: { payout: 1.55, discount: 0.25, maxHp: 140, income: 2.5 }, blurb: '+55% payouts · 25% discount · +40 max HP' },
  { name: 'Meridian Royalty', xp: 10500, perks: { payout: 1.75, discount: 0.3, maxHp: 150, income: 3 }, blurb: '+75% payouts · 30% discount · triple income' },
];

export interface PropertyDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** Cash paid out every INCOME_PERIOD seconds of play, before rank multipliers. */
  income: number;
  rank: number;
  icon: string;
}

export const INCOME_PERIOD = 60;

export const PROPERTIES: PropertyDef[] = [
  { id: 'garage', name: 'Downtown Garage', desc: 'Valet parking, hot parts and no questions asked.', price: 6000, income: 180, rank: 0, icon: '🔧' },
  { id: 'club', name: 'Neon Nights Club', desc: 'The city drinks here. The city pays here.', price: 16000, income: 420, rank: 2, icon: '🎶' },
  { id: 'docks', name: 'Harbor Warehouse', desc: 'Containers arrive full and leave fuller.', price: 32000, income: 780, rank: 4, icon: '⚓' },
  { id: 'casino', name: 'Meridian Grand Casino', desc: 'The house always wins. The house is you.', price: 65000, income: 1500, rank: 6, icon: '🎲' },
];

export interface CareerStats {
  jobs: number;
  kills: number;
  deaths: number;
  cashEarned: number;
  distance: number;
  playTime: number;
  maxStars: number;
  escapes: number;
  bestJob: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  xp: number;
  cash: number;
  test: (c: Career, g: Game) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBlood', name: 'First Blood', desc: 'Take down your first target.', xp: 40, cash: 100, test: (c) => c.stats.kills >= 1 },
  { id: 'firstJob', name: 'Getting Paid', desc: 'Complete your first job.', xp: 60, cash: 150, test: (c) => c.stats.jobs >= 1 },
  { id: 'fiveJobs', name: 'Reliable', desc: 'Complete 5 jobs.', xp: 150, cash: 400, test: (c) => c.stats.jobs >= 5 },
  { id: 'tenJobs', name: 'Career Criminal', desc: 'Complete 10 jobs.', xp: 300, cash: 900, test: (c) => c.stats.jobs >= 10 },
  { id: 'bigEarner', name: 'Blood Money', desc: 'Earn $25,000 in total.', xp: 250, cash: 500, test: (c) => c.stats.cashEarned >= 25000 },
  { id: 'fiveStar', name: 'Public Enemy', desc: 'Reach a five-star wanted level.', xp: 200, cash: 300, test: (c) => c.stats.maxStars >= 5 },
  { id: 'ghost', name: 'Ghost', desc: 'Lose the cops 3 times.', xp: 180, cash: 300, test: (c) => c.stats.escapes >= 3 },
  { id: 'roadWarrior', name: 'Road Warrior', desc: 'Travel 10 kilometres.', xp: 220, cash: 400, test: (c) => c.stats.distance >= 10000 },
  { id: 'nightOwl', name: 'Night Shift', desc: 'Play for 10 minutes.', xp: 200, cash: 250, test: (c) => c.stats.playTime >= 600 },
  { id: 'landlord', name: 'Landlord', desc: 'Own 3 businesses.', xp: 350, cash: 1000, test: (c) => c.owned.size >= 3 },
  { id: 'arsenal', name: 'Walking Arsenal', desc: 'Own 8 weapons.', xp: 180, cash: 250, test: (_c, g) => g.player.owned.length >= 8 },
  { id: 'madeMan', name: 'Made Man', desc: 'Reach the rank of Shot Caller.', xp: 400, cash: 1000, test: (c) => c.rankIndex >= 4 },
  { id: 'untouchable', name: 'Untouchable', desc: 'Complete 5 jobs without dying.', xp: 400, cash: 1200, test: (c) => c.stats.jobs >= 5 && c.stats.deaths === 0 },
  { id: 'royalty', name: 'City Icon', desc: 'Reach the highest rank.', xp: 800, cash: 2500, test: (c) => c.rankIndex >= RANKS.length - 1 },
];

export interface CareerView {
  rank: string;
  rankIndex: number;
  blurb: string;
  xp: number;
  xpInto: number;
  xpNeed: number;
  progress: number;
  nextRank: string | null;
  perks: Perks;
  stats: CareerStats;
  achievements: { id: string; name: string; desc: string; xp: number; cash: number; unlocked: boolean }[];
  properties: { id: string; name: string; desc: string; icon: string; price: number; income: number; owned: boolean; locked: boolean; unlockRank: number }[];
  incomeRate: number;
  incomeIn: number;
  promo: number;
}

const freshStats = (): CareerStats => ({
  jobs: 0, kills: 0, deaths: 0, cashEarned: 0, distance: 0, playTime: 0, maxStars: 0, escapes: 0, bestJob: 0,
});

export class Career {
  xp = 0;
  stats: CareerStats = freshStats();
  unlocked = new Set<string>();
  owned = new Set<string>();
  /** Countdown to the next property payout. */
  incomeT = INCOME_PERIOD;
  /** Remaining time of the "RANK UP" banner, in seconds. */
  promo = 0;
  private checkT = 0;
  private lastX = 0;
  private lastZ = 0;

  get rankIndex() {
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) if (this.xp >= RANKS[k].xp) i = k;
    return i;
  }
  get rank() { return RANKS[this.rankIndex]; }
  get perks(): Perks { return this.rank.perks; }
  get incomeRate() {
    let base = 0;
    for (const p of PROPERTIES) if (this.owned.has(p.id)) base += p.income;
    return Math.round(base * this.perks.income);
  }

  reset(g: Game) {
    this.xp = 0;
    this.stats = freshStats();
    this.unlocked.clear();
    this.owned.clear();
    this.incomeT = INCOME_PERIOD;
    this.promo = 0;
    this.checkT = 0;
    this.lastX = g.player.x;
    this.lastZ = g.player.z;
  }

  serialize() {
    return {
      xp: this.xp, stats: this.stats, unlocked: [...this.unlocked], owned: [...this.owned], incomeT: this.incomeT,
    };
  }

  load(data: any, g: Game) {
    if (!data || typeof data !== 'object') return;
    this.reset(g);
    this.xp = Number(data.xp) || 0;
    if (data.stats && typeof data.stats === 'object') this.stats = { ...freshStats(), ...data.stats };
    if (Array.isArray(data.unlocked)) this.unlocked = new Set(data.unlocked.filter((x: unknown) => typeof x === 'string'));
    if (Array.isArray(data.owned)) this.owned = new Set(data.owned.filter((x: unknown) => typeof x === 'string' && PROPERTIES.some((p) => p.id === x)));
    this.incomeT = Number.isFinite(data.incomeT) ? data.incomeT : INCOME_PERIOD;
  }

  /** Cash entering the player's wallet (jobs, pickups, income, achievement bonuses). */
  onCash(g: Game, amount: number) {
    if (amount > 0) this.stats.cashEarned += amount;
    void g;
  }

  /** XP with a rank-up celebration. Small gains can be silent to avoid toast spam. */
  addXp(g: Game, amount: number, reason?: string, silent = false) {
    if (amount <= 0) return;
    const before = this.rankIndex;
    this.xp += amount;
    const after = this.rankIndex;
    if (!silent) g.toast(`+${amount} XP${reason ? ` · ${reason}` : ''}`);
    if (after > before) {
      this.promo = 5;
      g.toast(`RANK UP — ${RANKS[after].name.toUpperCase()}! ${RANKS[after].blurb}`);
      g.say('Vic (radio)', `Word's getting around town. You're a ${RANKS[after].name} now. ${RANKS[after].blurb}.`, 5);
      g.audio.success();
      g.save();
    }
  }

  onJob(g: Game, reward: number) {
    this.stats.jobs++;
    this.stats.bestJob = Math.max(this.stats.bestJob, reward);
    this.addXp(g, 90 + Math.round(reward / 40), 'job complete');
  }

  onKill(g: Game, byPlayer: boolean) {
    if (!byPlayer) return;
    this.stats.kills++;
    this.addXp(g, 12, 'takedown', true);
  }

  onDeath(g: Game) {
    this.stats.deaths++;
    void g;
  }

  onWantedClear(g: Game, previousStars: number) {
    if (previousStars <= 0) return;
    this.stats.escapes++;
    this.addXp(g, Math.round(20 + previousStars * 12), 'clean getaway');
  }

  /** Discount-adjusted price used by both the shop UI and the purchase logic. */
  price(base: number) { return Math.max(1, Math.round(base * (1 - this.perks.discount))); }
  /** Rank-adjusted job reward. */
  reward(base: number) { return Math.round(base * this.perks.payout); }

  buyProperty(g: Game, id: string): boolean {
    const def = PROPERTIES.find((p) => p.id === id);
    if (!def || this.owned.has(id)) return false;
    if (this.rankIndex < def.rank) {
      g.toast(`Requires rank: ${RANKS[def.rank].name}`);
      g.audio.fail();
      return false;
    }
    if (g.money < def.price) {
      g.toast(`Not enough cash — need $${def.price.toLocaleString()}`);
      g.audio.fail();
      return false;
    }
    g.money -= def.price;
    this.owned.add(id);
    g.audio.success();
    g.toast(`Bought ${def.name} · +$${Math.round(def.income * this.perks.income)}/min`);
    this.addXp(g, 120, 'new property');
    g.save();
    return true;
  }

  tick(g: Game, dt: number) {
    if (dt <= 0) return;
    this.stats.playTime += dt;
    this.stats.maxStars = Math.max(this.stats.maxStars, g.stars);
    this.promo = Math.max(0, this.promo - dt);

    const px = g.player.veh ? g.player.veh.x : g.player.x;
    const pz = g.player.veh ? g.player.veh.z : g.player.z;
    const d = Math.hypot(px - this.lastX, pz - this.lastZ);
    // Ignore teleports (respawns, mission restarts).
    if (d < 40) this.stats.distance += d;
    this.lastX = px; this.lastZ = pz;

    if (this.incomeRate > 0) {
      this.incomeT -= dt;
      if (this.incomeT <= 0) {
        this.incomeT += INCOME_PERIOD;
        const payout = this.incomeRate;
        g.addMoney(payout);
        g.toast(`Business income: +$${payout.toLocaleString()}`);
        g.audio.ui();
      }
    } else this.incomeT = INCOME_PERIOD;

    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.75;
      this.checkAchievements(g);
    }
  }

  private checkAchievements(g: Game) {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked.has(a.id)) continue;
      let ok = false;
      try { ok = a.test(this, g); } catch { ok = false; }
      if (!ok) continue;
      this.unlocked.add(a.id);
      g.toast(`★ ACHIEVEMENT — ${a.name}  (+$${a.cash})`);
      g.addMoney(a.cash);
      this.addXp(g, a.xp, a.name);
      g.save();
    }
  }

  view(): CareerView {
    const i = this.rankIndex;
    const cur = RANKS[i].xp;
    const next = RANKS[i + 1]?.xp ?? cur;
    const need = Math.max(1, next - cur);
    const into = Math.max(0, this.xp - cur);
    return {
      rank: RANKS[i].name,
      rankIndex: i,
      blurb: RANKS[i].blurb,
      xp: this.xp,
      xpInto: into,
      xpNeed: need,
      progress: i >= RANKS.length - 1 ? 1 : Math.min(1, into / need),
      nextRank: RANKS[i + 1]?.name ?? null,
      perks: this.perks,
      stats: this.stats,
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, xp: a.xp, cash: a.cash, unlocked: this.unlocked.has(a.id) })),
      properties: PROPERTIES.map((p) => ({
        id: p.id, name: p.name, desc: p.desc, icon: p.icon, price: p.price, income: Math.round(p.income * this.perks.income),
        owned: this.owned.has(p.id), locked: i < p.rank, unlockRank: p.rank,
      })),
      incomeRate: this.incomeRate,
      incomeIn: Math.max(0, Math.ceil(this.incomeT)),
      promo: this.promo,
    };
  }
}
