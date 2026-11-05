import { useEffect, useRef, useState } from 'react';
import type { Game, Hud } from '../game/Game';
import { settings } from '../game/util';

/**
 * On-screen controls for phones/tablets. Pointer events are used throughout so
 * the same UI also works with a mouse (handy for testing with ?touch=1 on a
 * desktop). Multi-touch works because every control captures its own pointer.
 *
 * Input flows into the existing `Input` instance, so no game logic needed to
 * change: the virtual stick feeds analog axes, the look surface feeds mouse
 * deltas, and buttons synthesise the same key / mouse presses the game reads.
 */

const LOOK_GAIN = 1.5;
const STICK_R = 46;

interface BtnProps {
  label: string;
  sub?: string;
  className?: string;
  active?: boolean;
  onDown: () => void;
  onUp?: () => void;
}

function TouchButton({ label, sub, className = '', active, onDown, onUp }: BtnProps) {
  const [held, setHeld] = useState(false);
  const pid = useRef<number | null>(null);
  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pid.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setHeld(true);
    onDown();
  };
  const up = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pid.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    pid.current = null;
    setHeld(false);
    onUp?.();
  };
  return (
    <button
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex touch-none select-none flex-col items-center justify-center rounded-2xl border font-black uppercase leading-none tracking-wider transition-transform active:scale-95 ${
        held || active
          ? 'border-amber-300/80 bg-amber-300/30 text-amber-100'
          : 'border-white/25 bg-black/50 text-white/85 backdrop-blur-sm'
      } ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <span>{label}</span>
      {sub && <span className="mt-0.5 text-[9px] font-bold tracking-normal text-white/60">{sub}</span>}
    </button>
  );
}

function MiniBar({ v, color }: { v: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-black/50 bg-black/60">
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
    </div>
  );
}

export function TouchControls({ game, h }: { game: Game; h: Hud }) {
  const input = game.input;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  // Release everything when the overlay unmounts or the game enters a cutscene /
  // death state, so a held button never sticks.
  useEffect(() => {
    const release = () => {
      input.setMove(0, 0);
      input.releaseMouse(0);
      input.releaseMouse(2);
      input.releaseKey('Space');
      input.releaseKey('ShiftLeft');
      stick.current = null;
      look.current = null;
      setKnob({ x: 0, y: 0 });
    };
    if (h.cutscene || h.wasted) release();
    return release;
  }, [game, input, h.state, h.cutscene, h.wasted]);

  const stickMove = (clientX: number, clientY: number) => {
    const s = stick.current;
    if (!s) return;
    let dx = clientX - s.cx, dy = clientY - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
    setKnob({ x: dx, y: dy });
    const dead = 0.12;
    const nx = Math.abs(dx) / STICK_R < dead ? 0 : dx / STICK_R;
    const ny = Math.abs(dy) / STICK_R < dead ? 0 : -dy / STICK_R;
    input.setMove(nx, ny);
  };
  const stickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    stickMove(e.clientX, e.clientY);
  };
  const stickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    stick.current = null;
    setKnob({ x: 0, y: 0 });
    input.setMove(0, 0);
  };

  const lookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (look.current) return;
    e.preventDefault();
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const lookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    e.preventDefault();
    const dx = (e.clientX - l.x) * LOOK_GAIN * settings.sens;
    const dy = (e.clientY - l.y) * LOOK_GAIN * settings.sens;
    l.x = e.clientX; l.y = e.clientY;
    if (dx || dy) input.addLook(dx, dy);
  };
  const lookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (look.current?.id !== e.pointerId) return;
    e.preventDefault();
    look.current = null;
  };

  if (h.wasted) return null;

  if (h.cutscene) {
    return (
      <div data-touch-ui className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-24">
        <TouchButton
          label="Skip ⏭"
          sub="Tap to continue"
          className="h-14 w-40 text-sm"
          onDown={() => input.tapKey('Enter')}
        />
      </div>
    );
  }

  const tap = (code: string) => input.tapKey(code);
  const hold = (code: string, on: boolean) => (on ? input.pressKey(code) : input.releaseKey(code));

  return (
    <div data-touch-ui className="pointer-events-none absolute inset-0 z-20 select-none" style={{ touchAction: 'none' }}>
      {/* full-screen drag surface for camera look (buttons sit above it) */}
      <div
        className="pointer-events-auto absolute inset-0"
        style={{ touchAction: 'none' }}
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
        onLostPointerCapture={lookUp}
      />

      {/* health / armor under the compact minimap */}
      <div className="absolute left-3 top-[124px] flex w-[112px] flex-col gap-1">
        <MiniBar v={h.hp} color="linear-gradient(90deg,#ff3b57,#ff7a5c)" />
        {h.armor > 0 && <MiniBar v={h.armor} color="linear-gradient(90deg,#2d8cff,#6fc3ff)" />}
      </div>

      {/* virtual stick */}
      <div
        onPointerDown={stickDown}
        onPointerMove={(e) => { if (stick.current?.id === e.pointerId) { e.preventDefault(); e.stopPropagation(); stickMove(e.clientX, e.clientY); } }}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
        onLostPointerCapture={stickUp}
        className="pointer-events-auto absolute bottom-8 left-5 h-[132px] w-[132px] touch-none rounded-full border-2 border-white/35 bg-black/35 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">Move</div>
        <div
          className="absolute left-1/2 top-1/2 h-[58px] w-[58px] rounded-full border-2 border-amber-300/70 bg-amber-300/25 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* action buttons */}
      <div className="absolute bottom-4 right-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <TouchButton label="II" sub="Pause" className="h-11 w-11 text-xs" onDown={() => game.pause()} />
          <TouchButton label="V" sub="Camera" className="h-11 w-11 text-xs" onDown={() => tap('KeyV')} />
          <TouchButton label="T" sub="Slow-mo" className="h-11 w-11 text-xs" onDown={() => tap('KeyT')} />
          <TouchButton label="M" sub="Map" className="h-11 w-11 text-xs" onDown={() => tap('KeyM')} />
        </div>
        <div className="flex gap-2">
          <TouchButton label="◀" sub="Weapon" className="h-11 w-11 text-xs" onDown={() => { if (!h.inVehicle) game.player.cycle(-1, game); }} />
          <TouchButton label="▶" sub="Weapon" className="h-11 w-11 text-xs" onDown={() => { if (!h.inVehicle) game.player.cycle(1, game); }} />
          <TouchButton label="R" sub="Reload" className="h-11 w-11 text-xs" onDown={() => tap('KeyR')} />
          {h.inVehicle ? (
            <TouchButton label="F" sub="Interact" className="h-11 w-11 text-xs" onDown={() => tap('KeyF')} />
          ) : (
            <TouchButton label="H" sub="Horn" className="h-11 w-11 text-xs" onDown={() => tap('KeyH')} />
          )}
        </div>
        <div className="flex items-end gap-2">
          <TouchButton
            label="Aim"
            sub="Hold"
            className="h-14 w-14 text-[11px]"
            onDown={() => input.pressMouse(2)}
            onUp={() => input.releaseMouse(2)}
          />
          <TouchButton
            label="Jump"
            sub={h.inVehicle ? 'Brake' : 'Sprint off'}
            className="h-14 w-14 text-[11px]"
            onDown={() => hold('Space', true)}
            onUp={() => hold('Space', false)}
          />
          <TouchButton
            label="Run"
            sub="Sprint"
            className="h-14 w-14 text-[11px]"
            onDown={() => hold('ShiftLeft', true)}
            onUp={() => hold('ShiftLeft', false)}
          />
          <TouchButton
            label={h.inVehicle ? 'Exit' : 'E'}
            sub={h.inVehicle ? 'Leave car' : 'Enter / job'}
            className="h-14 w-14 text-[11px]"
            onDown={() => tap('KeyE')}
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="pointer-events-none rounded-xl border border-white/15 bg-black/55 px-3 py-2 text-right backdrop-blur-sm">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">{h.inVehicle ? h.vehName : h.weapon}</div>
            <div className="text-xl font-black leading-tight text-white">
              {h.inVehicle ? `${h.speed} km/h` : h.melee ? 'MELEE' : h.reloading ? '···' : `${h.mag} / ${h.reserve}`}
            </div>
          </div>
          <TouchButton
            label="Fire"
            sub={h.inVehicle ? 'On foot only' : 'Hold to shoot'}
            className="h-[92px] w-[92px] rounded-full text-base"
            onDown={() => input.pressMouse(0)}
            onUp={() => input.releaseMouse(0)}
          />
        </div>
      </div>
    </div>
  );
}
