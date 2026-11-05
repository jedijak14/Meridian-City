import { useState } from 'react';
import type { Game, Hud } from '../game/Game';
import { ControlsPanel, SettingsPanel } from './Menu';
import { CareerPanel, RankReadout, RankUpBanner } from './Career';

function Stars({ n, flash }: { n: number; flash: boolean }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${i < n ? (flash ? 'gta-flash' : '') : ''}`}>
          <path
            d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z"
            fill={i < n ? '#ffd23f' : 'rgba(255,255,255,0.08)'}
            stroke={i < n ? '#a67c00' : 'rgba(255,255,255,0.25)'}
            strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  );
}

function Bar({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-[10px] font-bold tracking-widest text-white/70">{label}</span>
      <div className="h-2.5 w-44 overflow-hidden rounded-full border border-black/50 bg-black/55">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
      </div>
    </div>
  );
}

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function HudView({ h, minimapRef }: { h: Hud; minimapRef: (c: HTMLCanvasElement | null) => void }) {
  const show = h.state !== 'menu';
  if (!show) return null;
  const cut = h.cutscene;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden text-white" style={{ fontFamily: "'Rajdhani','Segoe UI',system-ui,sans-serif" }}>
      {/* effect overlays */}
      <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: h.slow * 1.2, background: 'radial-gradient(ellipse at center, rgba(60,140,255,0) 35%, rgba(30,90,255,0.45) 100%)' }} />
      <div className="absolute inset-0" style={{ opacity: Math.min(1, h.dmg), background: 'radial-gradient(ellipse at center, rgba(255,0,0,0) 40%, rgba(220,0,0,0.65) 100%)' }} />
      {h.scope && (
        <div className="absolute inset-0 bg-black" style={{ WebkitMaskImage: 'radial-gradient(circle at center, transparent 0, transparent 30vh, black 30.3vh)', maskImage: 'radial-gradient(circle at center, transparent 0, transparent 30vh, black 30.3vh)' }}>
          <div className="absolute left-1/2 top-0 h-full w-px bg-black/80" />
        </div>
      )}
      {h.scope && (
        <>
          <div className="absolute left-1/2 top-1/2 h-[60vh] w-px -translate-x-1/2 -translate-y-1/2 bg-black/70" />
          <div className="absolute left-1/2 top-1/2 h-px w-[60vh] -translate-x-1/2 -translate-y-1/2 bg-black/70" />
        </>
      )}

      {/* letterbox */}
      <div className="absolute inset-x-0 top-0 bg-black transition-all duration-700 ease-out" style={{ height: cut ? '12vh' : 0 }} />
      <div className="absolute inset-x-0 bottom-0 bg-black transition-all duration-700 ease-out" style={{ height: cut ? '12vh' : 0 }} />
      {cut && <div className="absolute right-6 top-[13vh] text-xs uppercase tracking-[0.3em] text-white/60">Enter — skip</div>}
      {!cut && !h.wasted && <RankUpBanner h={h} />}

      {/* subtitles */}
      {h.subtitle && (
        <div className="absolute inset-x-0 flex justify-center px-6" style={{ bottom: cut ? '14vh' : '17%' }}>
          <div className="gta-sub max-w-3xl rounded-lg bg-black/55 px-5 py-2.5 text-center text-xl leading-snug backdrop-blur-sm">
            {h.subtitle.who && <span className="mr-2 font-black uppercase tracking-wider text-amber-300">{h.subtitle.who}:</span>}
            <span className="text-white">{h.subtitle.text}</span>
          </div>
        </div>
      )}

      {!cut && !h.wasted && (
        <>
          {/* top right */}
          <div className="absolute right-6 top-5 flex flex-col items-end gap-1">
            <div className="text-sm font-bold tracking-[0.25em] text-white/80 drop-shadow">{h.clock}</div>
            <div className="text-[42px] font-black leading-none tracking-wide text-emerald-300 drop-shadow-[0_3px_0_rgba(0,0,0,0.6)]">${h.money.toLocaleString()}</div>
            <Stars n={h.stars} flash={h.evading} />
            {h.stars > 0 && <div className={`text-[11px] font-bold uppercase tracking-[0.3em] ${h.evading ? 'gta-flash text-sky-300' : 'text-amber-200'}`}>{h.evading ? 'Evading police…' : h.wantedLevelName}</div>}
            <RankReadout h={h} />
          </div>

          {/* mission */}
          {h.mission && (
            <div className="absolute left-6 top-5 w-[min(420px,60vw)] rounded-xl border-l-4 border-amber-300 bg-black/55 px-4 py-3 backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">{h.mission.title}</div>
              <div className="mt-0.5 text-lg font-semibold leading-tight">{h.mission.objective}</div>
              {h.mission.timer !== undefined && (
                <div className={`mt-1 font-mono text-2xl font-bold ${h.mission.timer < 15 ? 'gta-flash text-red-400' : 'text-white'}`}>{fmtTime(h.mission.timer)}</div>
              )}
            </div>
          )}

          {/* toasts */}
          <div className="absolute left-6 flex flex-col gap-1.5" style={{ top: h.mission ? 150 : 24 }}>
            {h.toasts.map((t) => (
              <div key={t.id} className="gta-toast rounded-md bg-black/60 px-3 py-1.5 text-base font-semibold tracking-wide backdrop-blur-sm">{t.text}</div>
            ))}
          </div>

          {/* minimap */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2">
            <div className="relative h-[220px] w-[220px] overflow-hidden rounded-full border-[3px] border-white/70 bg-[#0e1a2b] shadow-[0_0_0_3px_rgba(0,0,0,0.5),0_8px_30px_rgba(0,0,0,0.6)]">
              <canvas ref={minimapRef} width={220} height={220} className="h-full w-full" />
              <div className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-black text-white/70">N</div>
            </div>
            <div className="ml-2 flex flex-col gap-1">
              <Bar v={h.hp} color="linear-gradient(90deg,#ff3b57,#ff7a5c)" label="HP" />
              {h.armor > 0 && <Bar v={h.armor} color="linear-gradient(90deg,#2d8cff,#6fc3ff)" label="AR" />}
              {(h.bullet < 100 || h.bulletOn) && <Bar v={h.bullet} color={h.bulletOn ? 'linear-gradient(90deg,#a855f7,#38bdf8)' : 'linear-gradient(90deg,#64748b,#94a3b8)'} label="SLO" />}
            </div>
          </div>

          {/* weapon / speed */}
          <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3">
            {h.inVehicle && (
              <div className="flex flex-col items-end">
                <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">{h.vehName}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black leading-none drop-shadow-[0_3px_0_rgba(0,0,0,0.6)]">{h.speed}</span>
                  <span className="text-sm font-bold tracking-widest text-white/70">KM/H</span>
                </div>
                <div className="mt-1 h-1.5 w-40 overflow-hidden rounded bg-black/50">
                  <div className="h-full transition-[width] duration-200" style={{ width: `${h.hp2 * 100}%`, background: h.hp2 > 0.4 ? '#4ade80' : '#f87171' }} />
                </div>
              </div>
            )}
            {!h.inVehicle && (
              <div className="flex flex-col items-end rounded-xl bg-black/50 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">{h.weapon}</div>
                {!h.melee ? (
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-black ${h.mag === 0 ? 'text-red-400' : ''}`}>{h.reloading ? '···' : h.mag}</span>
                    <span className="text-xl font-bold text-white/55">/ {h.reserve}</span>
                  </div>
                ) : (
                  <div className="text-2xl font-black text-white/70">MELEE</div>
                )}
              </div>
            )}
            {!h.inVehicle && (
              <div className="flex max-w-[420px] flex-wrap justify-end gap-1">
                {h.weaponsOwned.map((w, i) => (
                  <div key={w.id} className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${w.cur ? 'bg-amber-300 text-black' : 'bg-black/50 text-white/60'}`}>
                    {i < 10 ? (i + 1) % 10 : '↻'} · {w.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* prompt */}
          {h.prompt && (
            <div className="absolute inset-x-0 flex justify-center" style={{ bottom: '27%' }}>
              <div className="gta-toast rounded-lg border border-amber-300/50 bg-black/65 px-5 py-2 text-lg font-bold tracking-wide backdrop-blur-sm">
                {h.prompt.split('  ').map((s, i) => (i === 0 ? <kbd key={i} className="mr-3 rounded border border-white/40 bg-white/15 px-2 py-0.5 text-amber-200">{s}</kbd> : <span key={i}>{s}</span>))}
              </div>
            </div>
          )}

          {/* crosshair */}
          {h.crosshair && !h.scope && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-8 w-8">
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.9)]" />
                <div className="absolute left-0 top-1/2 h-px w-2.5 bg-white/80" />
                <div className="absolute right-0 top-1/2 h-px w-2.5 bg-white/80" />
                <div className="absolute left-1/2 top-0 h-2.5 w-px bg-white/80" />
                <div className="absolute bottom-0 left-1/2 h-2.5 w-px bg-white/80" />
                {h.hit > 0.05 && (
                  <div className="absolute inset-[-6px]" style={{ opacity: h.hit }}>
                    <div className="absolute left-1/2 top-1/2 h-[2px] w-9 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500" />
                    <div className="absolute left-1/2 top-1/2 h-[2px] w-9 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500" />
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] tracking-widest text-white/30">{h.fps} FPS · V camera · T bullet time</div>
        </>
      )}

      {h.wasted && (
        <div className="gta-wasted absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="text-[clamp(60px,14vw,200px)] font-black uppercase tracking-[0.08em] text-red-600 drop-shadow-[0_8px_30px_rgba(0,0,0,0.9)]">Wasted</div>
        </div>
      )}
    </div>
  );
}

export function PauseMenu({ game, h }: { game: Game; h: Hud }) {
  const [view, setView] = useState<'main' | 'controls' | 'settings' | 'career'>('main');
  if (view === 'career') return <CareerPanel game={game} h={h} onBack={() => setView('main')} />;
  return (
    <div className="gta-menu absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-md">
      {view === 'main' && (
        <div className="gta-panel w-[min(420px,90vw)] rounded-2xl border border-white/15 bg-black/60 p-7 text-white shadow-2xl">
          <h2 className="mb-1 text-3xl font-black uppercase tracking-[0.25em]">Paused</h2>
          <div className="mb-5 text-xs uppercase tracking-[0.3em] text-white/45">
            Cash ${h.money.toLocaleString()} · {h.career.rank} · {h.career.xp.toLocaleString()} XP
          </div>
          <div className="flex flex-col gap-2.5">
            {[
              ['Resume', () => game.resume()],
              ['Career & Empire', () => setView('career')],
              ['Controls', () => setView('controls')],
              ['Settings', () => setView('settings')],
              ...(h.mission ? ([['Abandon job', () => { game.abandonMission(); game.resume(); }]] as [string, () => void][]) : []),
              ['Save game', () => { game.save(); game.toast('Game saved'); }],
              ['Quit to menu', () => game.toMenu()],
            ].map(([label, fn]) => (
              <button
                key={label as string}
                onClick={fn as () => void}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-left text-lg font-bold uppercase tracking-[0.2em] transition hover:translate-x-1.5 hover:border-amber-300/70 hover:bg-white/10 hover:text-amber-100"
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>
      )}
      {view === 'controls' && <ControlsPanel onBack={() => setView('main')} />}
      {view === 'settings' && <SettingsPanel game={game} onBack={() => setView('main')} />}
    </div>
  );
}

export function Shop({ game, h }: { game: Game; h: Hud }) {
  if (!h.shop) return null;
  return (
    <div className="gta-menu absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <div className="gta-panel flex max-h-[92vh] w-[min(980px,96vw)] flex-col rounded-2xl border border-white/15 bg-[#0d0d14]/90 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.4em] text-red-400">Gun shop</div>
            <h2 className="text-3xl font-black uppercase tracking-[0.18em]">Ammu-Nation</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black text-emerald-300">${h.money.toLocaleString()}</div>
            <button onClick={() => game.closeShop()} className="rounded-lg border border-white/25 px-4 py-2 text-sm font-bold uppercase tracking-widest transition hover:border-amber-300 hover:text-amber-200">Close</button>
          </div>
        </div>
        <div className="grid grow grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {h.shop.map((it) => {
            const special = it.id === 'armor' || it.id === 'health';
            const canBuy = h.money >= (it.owned && !special ? it.ammoPrice : it.price);
            return (
              <div key={it.id} className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-black uppercase tracking-wider">{it.name}</div>
                    {it.owned && !special && <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Owned</span>}
                  </div>
                  <div className="mt-1 text-sm text-white/55">{it.desc}</div>
                  {it.owned && !special && it.ammoPrice > 0 && it.id !== 'bat' && <div className="mt-2 text-xs text-white/40">Ammo: {it.ammo}</div>}
                </div>
                <button
                  disabled={!canBuy || (it.owned && it.id === 'bat')}
                  onClick={() => game.buy(it.id)}
                  className="mt-3 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2 text-sm font-black uppercase tracking-widest text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-white/35"
                >
                  {it.owned && !special ? (it.id === 'bat' ? 'Owned' : `Buy ammo — $${it.ammoPrice}`) : `Buy — $${it.price.toLocaleString()}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
