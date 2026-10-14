# The Apex

The Apex (working folder and package name: hover-racer) is a futuristic 2D top-down hovercraft drift racer for the browser (TypeScript + Vite + Canvas 2D). It is a standalone project and unrelated to the Elysium MOBA in `C:\Users\AbeBo\code\celtic-moba`.

Project brief (vision, visual reference, art prompts, roadmap): https://claude.ai/code/artifact/aa070345-1401-4a8b-8651-8a145accf77f

## Decisions so far
- Controls: the mouse steers (the craft turns toward the cursor), W accelerates, and D / S / Space brake. Gears are automatic: 5 gears, shifting up near each gear's top speed and down when the craft slows.
- Walls sit at the track edge; you scrape along them, losing the speed going into the wall plus some friction, with sparks. There is no runoff.
- Drift: heading and velocity are separate, so the craft slides. There is no drift boost (removed on purpose).
- Acceleration is deliberately slow: about 5 s to reach 5th gear and about 10 s to top speed, with a 0.4 s thrust cut on each upshift.
- The 2.5D look is faked: one rotated sprite plus an offset shadow and hover bob for now, with sprite stacking later.
- Visual reference: the mobile drift racer Hot Slide (stylized, bright, readable from above), reimagined with neon and hovercraft.

## Layout
- `src/craft.ts` holds the physics and pure game logic, with no DOM access.
- `src/input.ts` handles the mouse (with pointer lock) and the keyboard.
- `src/track.ts` holds the circuits in `TRACKS` (each a Catmull-Rom spline through control points, with a color theme), walls and lap/sector timing. Four tracks: Apex Grand Prix (balanced), Velocity Ring (fast oval), Neon Streets (tight street circuit) and Summit Pass (mountain sweepers). Keep corner radii above about 170 px and separate parts of a track at least about 330 px apart, or the walls misbehave.
- `src/ai.ts` holds the AI driver: look-ahead steering with an inside-line bias and corner-speed braking. `CORNER_K` and `skill` set its pace (skill 0.75 is about 30.5 s a lap).
- `src/render.ts` does all canvas drawing (track, kerbs, minimap, HUD, arrow cursor); it only reads game state.
- `src/menu.ts` holds the DOM overlays: start screen (car and track select), pause menu and the results screen.
- `src/audio.ts` synthesizes all sound with Web Audio (engine, upshift whoosh, wall scrape and thuds, countdown beeps, lap chimes); M mutes. No sound files.
- `src/main.ts` runs the fixed 60 Hz loop, the camera, particles and the race flow (menu → countdown → race → results). In dev, `window.game` has `advance(seconds)` to step the game while the tab is hidden and `autodrive()` to let the AI drive your car.

Run with `npm run dev`. Done so far: one circuit with kerbs, runoff, walls, 10 sector checkpoints and lap timing; and a 3-lap, 6-car race: the player's red 01 against 5 AI cars (cyan 02, green 3, orange 4, purple 5, blue 6), each with a random skill from 0.7 to 0.9, starting from a shuffled grid, with a countdown, positions, car-to-car contact and a finish banner. Car art lives in `public/sprites/` and is trimmed to its visible pixels at load time.
