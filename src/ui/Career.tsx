import { useState } from 'react';
import type { Game, Hud } from '../game/Game';
import { INCOME_PERIOD, RANKS } from '../game/career';

export const fmtMinutes = (s: number) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** Compact rank + XP readout that lives under the wanted stars in the HUD. */
export function RankReadout({ h }: { h: Hud }) {
  const c = h.career;
  const toGo = Math.max(0, c.xpNeed - c.xpInto);
  return (
    <div className="mt-2 flex w-56 flex-col items-end gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300/80">Rank {c.rankIndex + 1}</span>
        <span className="text-sm font-black uppercase tracking-wider text-white/90">{c.rank}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-white/15 bg-black/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 transition-[width] duration-300"
          style={{ width: `${Math.round(c.progress * 100)}%` }}
        />
      </div>
      <div className="text-[10px] font-semibold tracking-wider text-white/55">
        {c.nextRank ? `${c.xp.toLocaleString()} XP · ${toGo} to ${c.nextRank}` : `${c.xp.toLocaleString()} XP · MAX RANK`}
      </div>
      {c.incomeRate > 0 && (
        <div className="text-[10px] font-bold tracking-wider text-emerald-300/80">
          ▲ ${c.incomeRate.toLocaleString()}/min · next in {c.incomeIn}s
        </div>
      )}
    </div>
  );
}

/** Big celebration banner shown for a few seconds after a promotion. */
export function RankUpBanner({ h }: { h: Hud }) {
  if (h.career.promo <= 0) return null;
  return (
    <div className="gta-toast absolute left-1/2 top-[18%] -translate-x-1/2 rounded-2xl border border-amber-300/50 bg-black/70 px-10 py-4 text-center shadow-[0_0_40px_rgba(255,170,60,0.35)] backdrop-blur-md">
      <div className="text-[11px] font-black uppercase tracking-[0.5em] text-amber-200">Promotion</div>
      <div className="bg-gradient-to-r from-amber-200 via-orange-300 to-pink-400 bg-clip-text text-4xl font-black uppercase tracking-[0.12em] text-transparent">
        {h.career.rank}
      </div>
      <div className="text-xs tracking-wide text-white/70">{h.career.blurb}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className="text-lg font-black text-white">{value}</div>
    </div>
  );
}

/**
 * Career screen: rank ladder, lifetime stats, achievements and the real-estate
 * portfolio. Opened from the pause menu.
 */
export function CareerPanel({ game, h, onBack }: { game: Game; h: Hud; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'empire' | 'awards'>('overview');
  const c = h.career;
  const unlocks = c.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="gta-menu absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md">
      <div className="gta-panel flex max-h-[92vh] w-[min(900px,96vw)] flex-col rounded-2xl border border-white/15 bg-[#0c0d18]/90 p-5 text-white shadow-2xl sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.4em] text-amber-300/80">Criminal record</div>
            <h2 className="text-3xl font-black uppercase tracking-[0.15em]">
              {c.rank} <span className="text-lg text-white/40">· Rank {c.rankIndex + 1}/{RANKS.length}</span>
            </h2>
            <div className="mt-0.5 text-xs text-white/55">{c.blurb}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Total XP</div>
              <div className="text-2xl font-black text-amber-200">{c.xp.toLocaleString()}</div>
            </div>
            <button onClick={onBack} className="rounded-lg border border-white/25 px-4 py-2 text-sm font-bold uppercase tracking-widest transition hover:border-amber-300 hover:text-amber-200">
              ← Back
            </button>
          </div>
        </div>

        {/* rank progress */}
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-1.5 flex justify-between text-[11px] font-bold uppercase tracking-widest text-white/60">
            <span>{c.nextRank ? `Next: ${c.nextRank}` : 'Highest rank reached'}</span>
            <span className="text-amber-200">{c.nextRank ? `${c.xpInto} / ${c.xpNeed} XP` : `${c.xp.toLocaleString()} XP`}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-pink-500 transition-[width] duration-300" style={{ width: `${Math.round(c.progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/55">
            <span>Job payouts <b className="text-emerald-300">×{c.perks.payout.toFixed(2)}</b></span>
            <span>Shop discount <b className="text-emerald-300">{Math.round(c.perks.discount * 100)}%</b></span>
            <span>Max HP <b className="text-emerald-300">{c.perks.maxHp}</b></span>
            <span>Business income <b className="text-emerald-300">×{c.perks.income.toFixed(2)}</b></span>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          {([['overview', 'Statistics'], ['empire', 'Real Estate'], ['awards', `Awards ${unlocks}/${c.achievements.length}`]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-black uppercase tracking-widest transition ${tab === id ? 'border-amber-300 bg-amber-300/20 text-amber-200' : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grow overflow-y-auto pr-1">
          {tab === 'overview' && (
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Jobs completed" value={String(c.stats.jobs)} />
                <Stat label="Takedowns" value={String(c.stats.kills)} />
                <Stat label="Deaths" value={String(c.stats.deaths)} />
                <Stat label="Cash earned" value={`$${Math.round(c.stats.cashEarned).toLocaleString()}`} />
                <Stat label="Best single job" value={`$${c.stats.bestJob.toLocaleString()}`} />
                <Stat label="Distance" value={fmtDistance(c.stats.distance)} />
                <Stat label="Time played" value={fmtMinutes(c.stats.playTime)} />
                <Stat label="Wanted peak" value={'★'.repeat(c.stats.maxStars) || '—'} />
                <Stat label="Escapes" value={String(c.stats.escapes)} />
                <Stat label="Wallet" value={`$${h.money.toLocaleString()}`} />
                <Stat label="Businesses" value={String(c.properties.filter((p) => p.owned).length)} />
                <Stat label="Awards" value={`${unlocks} / ${c.achievements.length}`} />
              </div>
              <div className="mt-3 text-[11px] leading-relaxed text-white/45">
                Earn XP by completing jobs, taking down targets, escaping the police and unlocking awards.
                Higher ranks pay better jobs, cheaper guns, more health and faster business income.
              </div>
            </div>
          )}

          {tab === 'empire' && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">Passive income</div>
                  <div className="text-2xl font-black text-emerald-300">${c.incomeRate.toLocaleString()} <span className="text-sm text-white/60">/ {INCOME_PERIOD}s of play</span></div>
                </div>
                <div className="text-right text-xs text-white/55">
                  {c.incomeRate > 0 ? `Next payout in ${c.incomeIn}s` : 'Buy a business to start earning'}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.properties.map((p) => {
                  const afford = h.money >= p.price;
                  return (
                    <div key={p.id} className={`flex flex-col justify-between rounded-xl border p-4 transition ${p.owned ? 'border-emerald-300/40 bg-emerald-300/5' : 'border-white/10 bg-white/5'}`}>
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-lg font-black uppercase tracking-wide"><span className="mr-2">{p.icon}</span>{p.name}</div>
                          {p.owned && <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Owned</span>}
                        </div>
                        <div className="mt-1 text-sm text-white/55">{p.desc}</div>
                        <div className="mt-2 text-xs font-bold tracking-wider text-emerald-300/90">+${p.income.toLocaleString()} / {INCOME_PERIOD}s</div>
                      </div>
                      <button
                        disabled={p.owned || p.locked || !afford}
                        onClick={() => game.buyProperty(p.id)}
                        className="mt-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2 text-sm font-black uppercase tracking-widest text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-white/35"
                      >
                        {p.owned ? 'Generating income' : p.locked ? `Locked · ${RANKS[p.unlockRank].name}` : `Buy — $${p.price.toLocaleString()}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'awards' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {c.achievements.map((a) => (
                <div key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${a.unlocked ? 'border-amber-300/40 bg-amber-300/5' : 'border-white/10 bg-white/5 opacity-65'}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${a.unlocked ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/40'}`}>
                    {a.unlocked ? '★' : '☆'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black uppercase tracking-wide">{a.name}</div>
                    <div className="text-xs text-white/55">{a.desc}</div>
                  </div>
                  <div className="shrink-0 text-right text-[10px] font-bold tracking-wider text-amber-200/80">
                    +{a.xp} XP<br />+${a.cash}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
