import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, Hud } from './game/Game';
import { MainMenu } from './ui/Menu';
import { HudView, PauseMenu, Shop } from './ui/Hud';

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let g: Game | null = null;
    let iv: any = null;
    const t = setTimeout(() => {
      if (cancelled || !mount.current) return;
      try {
        g = new Game(mount.current);
        gameRef.current = g;
        (window as any).__game = g;
        setGame(g);
        iv = setInterval(() => g && setHud(g.getHud()), 80);
      } catch (e: any) {
        console.error(e);
        setError(String(e?.message || e));
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(iv);
      g?.dispose();
      gameRef.current = null;
      setGame(null);
    };
  }, []);

  const minimapRef = useCallback((c: HTMLCanvasElement | null) => {
    gameRef.current?.attachMinimap(c);
  }, []);

  const state = hud?.state ?? 'menu';
  const filter = hud?.wasted ? 'grayscale(1) contrast(1.15)' : hud && hud.slow > 0.2 ? `saturate(${1 - hud.slow * 0.35}) contrast(${1 + hud.slow * 0.12})` : undefined;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" style={{ fontFamily: "'Rajdhani','Segoe UI',system-ui,sans-serif" }}>
      <div ref={mount} className="absolute inset-0" style={{ filter, transition: 'filter 0.4s' }} />
      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black p-8 text-center text-white">
          <div>
            <h1 className="mb-2 text-2xl font-black">Couldn't start the game</h1>
            <p className="text-white/60">WebGL may be unavailable. {error}</p>
          </div>
        </div>
      )}
      {game && hud && state !== 'menu' && <HudView h={hud} minimapRef={minimapRef} />}
      {state === 'menu' && (
        <MainMenu
          game={game}
          ready={!!game}
          hasSave={Game.hasSave()}
          onNew={() => game?.startNewGame()}
          onContinue={() => game?.continueGame()}
        />
      )}
      {game && hud && state === 'paused' && <PauseMenu game={game} h={hud} />}
      {game && hud && state === 'shop' && <Shop game={game} h={hud} />}
      {!game && !error && state === 'menu' && null}
    </div>
  );
}
