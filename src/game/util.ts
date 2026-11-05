export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SettingsT {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  sens: number;
  fov: number;
  volume: number;
  music: boolean;
  /** 'auto' shows touch controls on touch devices; 'on'/'off' force them. */
  touch: 'auto' | 'on' | 'off';
}
const defaults: SettingsT = { quality: 'high', sens: 1, fov: 70, volume: 0.7, music: true, touch: 'auto' };

export const isCoarsePointer = () =>
  typeof window !== 'undefined' &&
  (!!window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0);

/** Should the on-screen touch controls be shown? URL ?touch=1 / ?touch=0 overrides settings. */
export function touchEnabled() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('touch');
  if (q === '1' || q === 'on') return true;
  if (q === '0' || q === 'off') return false;
  if (settings.touch === 'on') return true;
  if (settings.touch === 'off') return false;
  return isCoarsePointer();
}

export const settings: SettingsT = (() => {
  try {
    const s = localStorage.getItem('meridian_settings');
    if (s) return { ...defaults, ...JSON.parse(s) };
  } catch {
    /* ignore */
  }
  // Phones/tablets start on the lightest preset for a playable frame rate.
  return { ...defaults, quality: isCoarsePointer() ? 'low' : defaults.quality };
})();
export const saveSettings = () => {
  try {
    localStorage.setItem('meridian_settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('meridian:settings'));
};

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mdx = 0;
  mdy = 0;
  wheel = 0;
  mouse = [false, false, false];
  mousePressed = [false, false, false];
  locked = false;
  noLock = false;
  enabled = false;
  /** True when the on-screen touch controls are driving input instead of a mouse/keyboard. */
  touchMode = false;
  /** Analog axes from the virtual stick: x = strafe, y = forward, both -1..1. */
  moveX = 0;
  moveY = 0;
  private cleanup: (() => void)[] = [];

  get moveFwd() {
    const digital = (this.k('KeyW') ? 1 : 0) - (this.k('KeyS') ? 1 : 0);
    return clamp((this.moveY || 0) + digital, -1, 1);
  }
  get moveStr() {
    const digital = (this.k('KeyA') ? 1 : 0) - (this.k('KeyD') ? 1 : 0);
    return clamp((this.moveX || 0) + digital, -1, 1);
  }

  setTouchMode(on: boolean) {
    this.touchMode = on;
    if (on) {
      // Touch devices can't use pointer lock; noLock also lets camera drags work
      // and prevents the "pointer lock lost" auto-pause.
      this.noLock = true;
      this.unlock();
    }
  }
  setMove(x: number, y: number) {
    this.moveX = clamp(x, -1, 1);
    this.moveY = clamp(y, -1, 1);
  }
  addLook(dx: number, dy: number) {
    this.mdx += dx;
    this.mdy += dy;
  }
  /** Press a virtual key (adds both held + just-pressed state for one frame). */
  pressKey(code: string) {
    this.down.add(code);
    this.pressed.add(code);
  }
  releaseKey(code: string) {
    this.down.delete(code);
  }
  /** One-shot key press (does not stay held down). */
  tapKey(code: string) {
    this.pressed.add(code);
  }
  pressMouse(button: number) {
    this.mouse[button] = true;
    this.mousePressed[button] = true;
  }
  releaseMouse(button: number) {
    this.mouse[button] = false;
  }

  constructor(public el: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: any = window) => {
      target.addEventListener(t, f as any);
      this.cleanup.push(() => target.removeEventListener(t, f as any));
    };
    on('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    on('keyup', (e) => {
      this.down.delete(e.code);
    });
    on('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.noLock) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
    });
    on('mousedown', (e) => {
      if (!this.enabled) return;
      // Compatibility mouse events fired by a tap on an on-screen button must not
      // also count as "fire" / "aim" in the game.
      if ((e.target as HTMLElement | null)?.closest?.('[data-touch-ui]')) return;
      this.mouse[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    on('mouseup', (e) => {
      this.mouse[e.button] = false;
    });
    on('wheel', (e) => {
      if (!this.enabled) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-touch-ui]')) return;
      this.wheel += Math.sign(e.deltaY);
    });
    on('contextmenu', (e) => e.preventDefault());
    on('blur', () => {
      this.down.clear();
      this.mouse = [false, false, false];
    });
    on(
      'pointerlockchange' as any,
      () => {
        this.locked = document.pointerLockElement === this.el;
      },
      document
    );
    on(
      'pointerlockerror' as any,
      () => {
        this.noLock = true;
      },
      document
    );
  }
  lock() {
    if (this.touchMode) {
      this.noLock = true;
      return;
    }
    try {
      const p: any = (this.el as any).requestPointerLock?.();
      if (p && p.catch) p.catch(() => (this.noLock = true));
    } catch {
      this.noLock = true;
    }
  }
  unlock() {
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.();
  }
  k(code: string) {
    return this.down.has(code);
  }
  p(code: string) {
    return this.pressed.has(code);
  }
  endFrame() {
    this.pressed.clear();
    this.mdx = 0;
    this.mdy = 0;
    this.wheel = 0;
    this.mousePressed = [false, false, false];
    // Holding the on-screen fire button should repeat-fire semi-automatic weapons,
    // just like rapid tapping would on a mouse.
    if (this.touchMode && this.mouse[0]) this.mousePressed[0] = true;
  }
  dispose() {
    this.cleanup.forEach((f) => f());
  }
}
