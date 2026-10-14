# Hover Racer

A futuristic 2D top-down hovercraft drift racer for the browser (TypeScript + Vite + Canvas 2D). It is a standalone project and unrelated to the Elysium MOBA in `C:\Users\AbeBo\code\celtic-moba`.

Project brief (vision, visual reference, art prompts, roadmap): https://claude.ai/code/artifact/aa070345-1401-4a8b-8651-8a145accf77f

## Decisions so far
- Controls: the mouse steers (the craft turns toward the cursor), W accelerates, and D / S / Space brake. Gears are automatic: 5 gears, shifting up near each gear's top speed and down when the craft slows.
- Drift: heading and velocity are separate; a held slide charges a boost that pays out when the slide ends.
- The 2.5D look is faked: one rotated sprite plus an offset shadow and hover bob for now, with sprite stacking later.
- Visual reference: the mobile drift racer Hot Slide (stylized, bright, readable from above), reimagined with neon and hovercraft.

## Layout
- `src/craft.ts` holds the physics and pure game logic, with no DOM access.
- `src/input.ts` handles the mouse (with pointer lock) and the keyboard.
- `src/world.ts` has the test arena, pylons and collisions.
- `src/render.ts` does all canvas drawing; it only reads game state.
- `src/main.ts` runs the fixed 60 Hz loop, the camera and particles.

Run with `npm run dev`. The current milestone is a drivable craft in an arena; the next one is a real track with checkpoints, laps and a lap timer.
