# The Apex

The Apex (working folder and package name: hover-racer) is a futuristic 2D top-down hovercraft drift racer for the browser (TypeScript + Vite + Canvas 2D). It is a standalone project and unrelated to the Elysium MOBA in `C:\Users\AbeBo\code\celtic-moba`.

Project brief (vision, visual reference, art prompts, roadmap): https://claude.ai/code/artifact/aa070345-1401-4a8b-8651-8a145accf77f

## Decisions so far
- Controls: the mouse steers (the craft turns toward the cursor). The throttle is always on. Left click (or D / S / Space) brakes, and the gearbox shifts down as speed drops. Right click (or Shift / E) deploys ERS. The context menu is suppressed over the canvas. Gears are automatic: 5 gears, shifting up near each gear's top speed and down when the craft slows.
- Walls sit at the track edge; you scrape along them, losing the speed going into the wall plus some friction, with sparks. There is no runoff.
- Slipstream: tucking into a car's wake gives up to +5% pace. It's drawn as flowing dashed draft lines from the follower's nose to the leader's tail.
- ERS: drifting charges a battery. A slide past about 23° of slip at speed charges it, faster the deeper and faster the drift: a hard 1 s drift from 180 km/h gives about 0.25. Harvest is capped at one full battery per lap (`HARVEST_PER_LAP`, reset when a lap completes). Braking does not charge it. Right click (or Shift / E) deploys it: 1.55x pull and +9% top speed, draining 0.25/s. Each race starts at 50%. The AI deploys on straights when attacking or defending, or when the battery is over 60%.
- DRS: zones are found automatically on straights at least about 650 px long (`Track.drsZones`). From lap 2, entering a zone within 1.0 s of the car directly ahead opens the wing (+7% top speed) until the zone ends or the car brakes. Gaps come from per-sample pass times (`RaceState.gapBehind`), the same way F1 timing works, and the HUD shows the gap to the car ahead and behind.
- Catch-up: +1% pace (top speed and pull) for each place behind the leader, for every car, the player included (`CATCH_UP_PER_PLACE`). The HUD shows the player's bonus.
- Turbo start (clutch-style): hold the brake through the countdown and release it between 0.3 s before and 0.15 s after GO for a 1.4 s launch at 1.9x pull. Releasing earlier is a jump start and stalls for 0.8 s; never holding the brake is a normal start. The AI roll their own starts (`Driver.rollLaunch`).
- Heat: only walls add heat; car-to-car contact doesn't. At 200 km/h a 10° hit adds about 0.26, a 30° hit about 0.72, and a 60° hit or worse maxes the bar. Grinding along a wall adds 0.55/s. Above 0.5 heat the car loses up to 10% top speed; at 1.0 it overheats (-25%) until it cools below 0.35. It cools at 0.05/s (0.35/s on the cooling lane). Wall hits also cost speed straight away: up to 30% extra on a hard hit (`WALL_HIT_LOSS`), plus grinding friction. The shift points scale with the speed multiplier, so a hot car can't get stuck in a gear.
- AI racecraft (`src/ai.ts`): commits to a passing side (the inside of a coming corner if there's room) for 1.6 s, covers the inside when someone is within about 150 px behind into a corner, and makes occasional mistakes (late braking or running wide; the rate scales with 1 - skill).
- Drift: heading and velocity are separate, so the craft slides. There is no drift boost (removed on purpose).
- Acceleration builds gradually: about 3.7 s to reach 5th gear. Each upshift is a light 0.12 s dip to 65% thrust (a felt shift, not a stall).
- Turning does not brake for you. Grip redirects sideways momentum forward (`GRIP_KEEP` 0.9) instead of deleting it, and grip fades with speed (2.6 at a standstill down to 0.95 at top speed; braking loosens it further). A 90° turn at 200 km/h slides about 1,070 px wide, so drivers must brake before corners. The AI brakes on its own and steers against its slide (`slipCorrect` 0.5, `CORNER_K` 40, skill 0.82 to 0.97).
- The 2.5D look is faked: one rotated sprite plus an offset shadow and hover bob for now, with sprite stacking later.
- Visual reference: the mobile drift racer Hot Slide (stylized, bright, readable from above), reimagined with neon and hovercraft.

- Music (`src/music.ts`) is synthesized live and scheduled on a 16th-note grid. The menu and results screen play chill house (118 BPM, A minor); racing plays deep / nu-disco house (122 BPM, F# minor). The pause menu muffles the race music. Effects and music use separate buses in `src/audio.ts`, so menus silence the engine without stopping the music. Music starts on the first click or key press, since browsers block autoplay.

## Layout
- `src/craft.ts` holds the physics and pure game logic, with no DOM access.
- `src/input.ts` handles the mouse (with pointer lock) and the keyboard.
- `src/track.ts` holds the circuits in `TRACKS` (each a Catmull-Rom spline through control points, with a color theme), walls and lap/sector timing. Four tracks: Apex Grand Prix (balanced), Velocity Ring (fast oval), Neon Streets (tight street circuit) and Summit Pass (mountain sweepers). Keep corner radii above about 170 px and separate parts of a track at least about 330 px apart, or the walls misbehave.
- `src/ai.ts` holds the AI driver: look-ahead steering with an inside-line bias and corner-speed braking. `CORNER_K` and `skill` set its pace (skill 0.75 is about 30.5 s a lap).
- `src/render.ts` does all canvas drawing (track, kerbs, minimap, HUD, arrow cursor); it only reads game state.
- `src/menu.ts` holds the DOM overlays: start screen (car, track, mode, laps and season length), pause menu and the results screen (with season standings).
- Race setup: single race or a season of 2, 3, 4, 6 or 8 races, and 1, 3, 5 or 10 laps. A season starts on the chosen track and rotates through the others; points go 10/8/6/4/2/1 for 1st-6th, ties broken by the latest race. Season logic lives in `main.ts` (`Season`, `scoreRound`, `resultsView`).
- `src/audio.ts` synthesizes all sound with Web Audio (engine, upshift whoosh, wall scrape and thuds, countdown beeps, lap chimes); M mutes. No sound files.
- `src/main.ts` runs the fixed 60 Hz loop, the camera, particles and the race flow (menu → countdown → race → results). In dev, `window.game` has `advance(seconds)` to step the game while the tab is hidden and `autodrive()` to let the AI drive your car.

Run with `npm run dev`. Done so far: one circuit with kerbs, runoff, walls, 10 sector checkpoints and lap timing; and a 3-lap, 6-car race: the player's red 01 against 5 AI cars (cyan 02, green 3, orange 4, purple 5, blue 6), each with a random skill from 0.7 to 0.9, starting from a shuffled grid, with a countdown, positions, car-to-car contact and a finish banner. Car art lives in `public/sprites/` and is trimmed to its visible pixels at load time.
