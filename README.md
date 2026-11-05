# MERIDIAN — Streets of Neon

A browser-based open-world crime sandbox built with **React + TypeScript + Three.js**.
Drive a procedurally generated neon city, take jobs, collect weapons, outrun the
police, build a criminal career and buy the town.

Everything is rendered in real time with custom vehicle soft-body damage, ragdoll
physics, procedural WebAudio, a day/night cycle, traffic AI, pedestrian AI, cop
pursuits, a helicopter, cutscenes and a minimap.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production bundle (`vite-plugin-singlefile` emits one self-contained `dist/index.html`) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Headless smoke tests for career logic + mission registry |

The dev server binds `0.0.0.0` and allows proxied preview hosts, so it works in
hosted/remote preview environments as well as locally. A WebGL-capable browser,
keyboard and mouse are required.

---

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move / drive |
| Mouse | Look |
| Left click | Fire / punch |
| Right click | Aim (scope with the sniper) |
| `Shift` / `Space` | Sprint / jump (handbrake in a car) |
| `R` | Reload |
| `1`–`0`, mouse wheel | Select weapon (wheel for slots beyond 10) |
| `E` | Enter/exit vehicle, start a job, interact |
| `F` | Interact while driving |
| `H` | Horn |
| `V` | First / third person |
| `T` | Bullet time |
| `M` | Minimap zoom |
| `N` | Radio |
| `P` / `Esc` | Pause → **Career & Empire** |

### Touch / mobile controls

On phones and tablets the game automatically switches to an on-screen control
scheme (no pointer lock, compact HUD, and a lighter default graphics preset):

- **Left stick** — walk / drive with analog steering and throttle
- **Drag anywhere else** — look around / aim the camera (multi-touch: you can
  drag and hold buttons at the same time)
- **Fire** (hold) — shoot; holding repeats semi-automatic weapons
- **Aim**, **Jump / handbrake**, **Run**, **E** (enter vehicle / start job / exit
  vehicle) and **F** (interact while driving) action buttons
- Small utility buttons for reload, weapon cycling, horn, camera, bullet time,
  map zoom and pause
- Cutscenes have a **Skip** button

Touch controls can be forced on/off in **Settings → Touch controls**, or with
`?touch=1` / `?touch=0` in the URL — useful for trying the mobile layout on a
desktop. `npm test` includes headless checks for the virtual input layer.

---

## What's in the game

- **9 job types** at markers across the city: the story heist, taxi fares,
  contracts, street races, car theft, rampages, plus three new ones —
  *Package Run* (a timed four-stop courier route with an ambush), *Night Watch*
  (borrow a cruiser and clear waves of armed suspects) and *Insurance Job*
  (scrap a marked convoy with an RPG).
- **13 weapons**, including the **Whisper .45** — a suppressed pistol that makes
  far less noise and attracts almost no police heat.
- **Wanted system**: witnesses, patrol cars, cops on foot, a helicopter at high
  wanted levels, Pay 'n' Spray to respray and lose heat.
- **Shops and services**: Ammu-Nation (weapons, ammo, armor, medkits),
  safehouses (heal + save), Pay 'n' Spray.

### Career Update (v1.1)

- **8 ranks** from *Street Rat* to *Meridian Royalty*. XP comes from jobs,
  takedowns, escapes, awards and property purchases. Each rank improves job
  payouts, shop discounts, maximum health and business income; promotions get a
  radio call and an on-screen banner.
- **14 achievements** with XP and cash rewards.
- **Real estate**: four businesses (garage, club, warehouse, casino), some
  rank-gated, that pay passive income every minute of play.
- **Career screen** (`Esc` → *Career & Empire*): rank ladder, live perks, lifetime
  statistics (jobs, kills, distance, time played, escapes, cash earned…),
  achievement list and the property portfolio.
- Career progress, stats, achievements, businesses and health are saved
  alongside the existing save game at a safehouse.
- An always-visible **rank/XP bar** and passive-income readout in the HUD.

---

## Project layout

```
index.html
vite.config.ts
src/
  main.tsx, App.tsx, index.css        React shell + styling
  ui/
    Menu.tsx                         main menu, controls, settings
    Hud.tsx                          HUD, pause menu, shop
    Career.tsx                       career/empire/awards UI
    Touch.tsx                        virtual stick, look surface, action buttons
  game/
    Game.ts                          engine, main loop, save, HUD state
    career.ts                        ranks, perks, achievements, properties
    world.ts                         procedural city generation + day/night
    vehicle.ts, traffic.ts           vehicles, soft-body damage, traffic AI
    peds.ts, character.ts            pedestrians, ragdolls
    player.ts, weapons.ts, combat.ts player, arsenal, shooting & explosions
    missions.ts                      all job definitions + intro cutscene
    particles.ts, audio.ts, util.ts  FX, procedural audio, input/settings
scripts/smoke.mjs                    headless logic tests
```

The source files were originally uploaded flat while the imports expected
`src/game` and `src/ui`; they have been restored to that structure so the project
builds and runs.

---

## License

MIT — see [LICENSE](LICENSE).
