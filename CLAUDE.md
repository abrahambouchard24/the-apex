# The Apex

The Apex (working folder and package name: hover-racer) is a futuristic 2D top-down hovercraft drift racer for the browser (TypeScript + Vite + Canvas 2D). It is a standalone project and unrelated to the Elysium MOBA in `C:\Users\AbeBo\code\celtic-moba`.

Project brief (vision, visual reference, art prompts, roadmap): https://claude.ai/code/artifact/aa070345-1401-4a8b-8651-8a145accf77f

## Decisions so far
- Controls: the mouse steers (the craft turns toward the cursor), W accelerates, and D / S / Space brake. Gears are automatic: 5 gears, shifting up near each gear's top speed and down when the craft slows.
- Walls sit at the track edge; you scrape along them, losing the speed going into the wall plus some friction, with sparks. There is no runoff.
- Slipstream: tucking into a car's wake gives up to +5% pace. It's drawn as flowing dashed draft lines from the follower's nose to the leader's tail.
- Catch-up: +1% pace (top speed and pull) for each place behind the leader, for every car, the player included (`CATCH_UP_PER_PLACE`). The HUD shows the player's bonus.
- Turbo start: pressing W within 0.3 s before to 0.15 s after GO gives a 1.4 s launch at 1.9x pull. Holding W from earlier is a jump start and stalls for 0.8 s. The AI roll their own starts (`Driver.rollLaunch`).
- Heat: wall hits, grinding along walls and car contact add heat (one 600 px/s head-on hit is about 0.55). Above 0.6 the car loses up to 6% top speed; at 1.0 it overheats (-15%) until it cools below 0.35. It cools at 0.07/s. The shift points scale with the speed multiplier, so a hot car can't get stuck in a gear.
- AI racecraft (`src/ai.ts`): commits to a passing side (the inside of a coming corner if there's room) for 1.6 s, covers the inside when someone is within about 150 px behind into a corner, and makes occasional mistakes (late braking or running wide; the rate scales with 1 - skill).
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
