import { useState } from 'react';
import type { Game } from '../game/Game';
import { settings, saveSettings } from '../game/util';

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move / drive'],
  ['Mouse', 'Look around'],
  ['Left Click', 'Shoot / punch'],
  ['Right Click', 'Aim down sights (scope for sniper)'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump  •  Handbrake in vehicles'],
  ['R', 'Reload'],
  ['1 – 0  /  Wheel', 'Select weapon'],
  ['E', 'Enter / exit vehicle, start job, interact'],
  ['F', 'Interact while inside a vehicle'],
  ['H', 'Horn'],
  ['V', 'Toggle first / third person'],
  ['T', 'Bullet time (slow-mo meter)'],
  ['M', 'Cycle minimap zoom'],
  ['N', 'Radio on / off'],
  ['P / Esc', 'Pause'],
];

export function ControlsPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="Controls" onBack={onBack}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {CONTROLS.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 py-1">
            <kbd className="min-w-[96px] rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-center text-xs font-bold tracking-wider text-amber-200 shadow-[0_2px_0_rgba(255,255,255,0.15)]">{k}</kbd>
            <span className="text-sm text-white/80">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-white/50">
        Tip: Hit <b className="text-white/80">T</b> for bullet time. Explosions, headshots and big crashes trigger automatic slow-motion. Cops respond to your crimes — lose them
        by breaking line of sight, or visit a Pay 'n' Spray. Pause with <b className="text-white/80">Esc</b> to open <b className="text-white/80">Career &amp; Empire</b>:
        ranks, achievements and businesses that pay you while you play.
      </p>
    </Panel>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="py-2">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="font-mono text-amber-200">{fmt(value)}</span>
      </div>
      <input type="range" className="gta-range w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function SettingsPanel({ game, onBack }: { game: Game | null; onBack: () => void }) {
  const [, force] = useState(0);
  const upd = () => {
    saveSettings();
    force((n) => n + 1);
  };
  return (
    <Panel title="Settings" onBack={onBack}>
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-white/50">Graphics quality</div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
          <button
            key={q}
            onClick={() => {
              settings.quality = q;
              upd();
              game?.applyQuality();
            }}
            className={`rounded-lg border px-2 py-2.5 text-sm font-bold uppercase tracking-wider transition ${
              settings.quality === q ? 'border-amber-300 bg-amber-300/20 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.35)]' : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-white/45">Lower quality reduces resolution, shadows, traffic and pedestrian density. If the game runs slowly, try Low or Medium.</p>
      <Slider label="Field of view" value={settings.fov} min={55} max={100} step={1} fmt={(v) => `${v}°`} onChange={(v) => { settings.fov = v; upd(); }} />
      <Slider label="Mouse sensitivity" value={settings.sens} min={0.3} max={2.5} step={0.05} fmt={(v) => `${v.toFixed(2)}x`} onChange={(v) => { settings.sens = v; upd(); }} />
      <Slider label="Master volume" value={settings.volume} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => { settings.volume = v; upd(); game?.audio.setVolume(v); }} />
      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
        <span className="text-white/80">Radio / music</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-amber-400"
          checked={settings.music}
          onChange={(e) => {
            settings.music = e.target.checked;
            upd();
            if (game) {
              if (settings.music) game.audio.startMusic(92); else game.audio.stopMusic();
            }
          }}
        />
      </label>
    </Panel>
  );
}

export function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="gta-panel pointer-events-auto w-[min(640px,92vw)] rounded-2xl border border-white/15 bg-black/55 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-[0.18em] text-white">{title}</h2>
        <button onClick={onBack} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white/80 transition hover:border-amber-300 hover:text-amber-200">
          ← Back
        </button>
      </div>
      {children}
    </div>
  );
}

function MenuButton({ i, label, sub, onClick, disabled }: { i: number; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: `${0.15 + i * 0.07}s` }}
      className="gta-item group relative flex w-full items-center gap-4 overflow-hidden rounded-xl border border-white/10 bg-black/35 px-5 py-4 text-left backdrop-blur-md transition-all duration-300 hover:translate-x-3 hover:border-amber-300/60 hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 to-pink-500 opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="font-mono text-xs text-white/35 transition group-hover:text-amber-200">0{i + 1}</span>
      <span className="flex-1">
        <span className="block text-xl font-black uppercase tracking-[0.2em] text-white transition group-hover:text-amber-100">{label}</span>
        <span className="block text-xs tracking-wide text-white/45">{sub}</span>
      </span>
      <span className="text-white/30 transition group-hover:translate-x-1 group-hover:text-amber-200">▶</span>
    </button>
  );
}

export function MainMenu({ game, hasSave, onNew, onContinue, ready }: { game: Game | null; hasSave: boolean; onNew: () => void; onContinue: () => void; ready: boolean }) {
  const [view, setView] = useState<'splash' | 'main' | 'controls' | 'settings'>('splash');
  return (
    <div className="gta-menu absolute inset-0 z-30 flex select-none overflow-hidden text-white" onClick={() => { if (view === 'splash' && ready) { game?.menuMusic(); setView('main'); } }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(10,6,30,0.78),rgba(10,6,30,0.2)_60%,rgba(10,6,30,0.55))]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a0b2e]/80 via-transparent to-[#0b0620]/60" />
      <div className="gta-scan pointer-events-none absolute inset-0 opacity-[0.07]" />

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-6 sm:p-12">
        <div className="gta-fade">
          <div className="mb-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.5em] text-pink-300/80">
            <span className="h-px w-10 bg-pink-300/60" /> An open-world crime sandbox
          </div>
          <h1 className="gta-title text-[clamp(56px,11vw,150px)] font-black uppercase leading-[0.85] tracking-tight">Meridian</h1>
          <div className="mt-1 text-[clamp(14px,2.2vw,28px)] font-black uppercase tracking-[0.6em] text-white/85">Streets of Neon</div>
        </div>

        <div className="flex flex-1 items-center py-6">
          {view === 'splash' && (
            <div className="gta-fade mt-10 flex flex-col gap-3">
              <div className="gta-pulse text-lg font-bold uppercase tracking-[0.4em] text-amber-200">{ready ? 'Click anywhere to start' : 'Generating city…'}</div>
              <div className="h-1 w-64 overflow-hidden rounded bg-white/10">
                <div className={`h-full bg-gradient-to-r from-amber-300 to-pink-500 transition-all duration-700 ${ready ? 'w-full' : 'w-1/3 animate-pulse'}`} />
              </div>
              <div className="text-xs text-white/45">Best experienced fullscreen with a mouse and keyboard • Sound on</div>
            </div>
          )}
          {view === 'main' && (
            <div className="flex w-[min(460px,92vw)] flex-col gap-3">
              <MenuButton i={0} label="New Game" sub="Start a fresh story in Meridian City" onClick={onNew} />
              <MenuButton i={1} label="Continue" sub={hasSave ? 'Load your last save from a safehouse' : 'No save found — save at a safehouse'} onClick={onContinue} disabled={!hasSave} />
              <MenuButton i={2} label="Controls" sub="Keyboard & mouse layout" onClick={() => setView('controls')} />
              <MenuButton i={3} label="Settings" sub="Graphics quality, FOV, audio" onClick={() => setView('settings')} />
            </div>
          )}
          {view === 'controls' && <ControlsPanel onBack={() => setView('main')} />}
          {view === 'settings' && <SettingsPanel game={game} onBack={() => setView('main')} />}
        </div>

        <div className="gta-fade flex flex-wrap items-end justify-between gap-4 text-[11px] uppercase tracking-[0.3em] text-white/45">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>◆ 13 weapons</span><span>◆ 9 job types</span><span>◆ Career ranks</span><span>◆ Achievements</span><span>◆ Real estate</span><span>◆ Bullet time</span>
          </div>
          <div>Career Update • v1.1</div>
        </div>
      </div>
    </div>
  );
}
