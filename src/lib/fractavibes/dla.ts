import Prando from "prando";
import { calculateCircularBounds } from "./shared";
import { db, type ParticleStep, type Color } from "./db";

export function runDLA(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  seedX: number,
  seedY: number,
  seedColor?: Color,
) {
  const w = canvasWidth;
  const h = canvasHeight;

  const safeSeedColor: Color = seedColor || { r: 255, g: 255, b: 255 };

  // Cache ID includes dimensions and seed details for uniqueness
  const cacheId = `dla_v2_${w}_${h}_${seedX}_${seedY}_${safeSeedColor.r}-${safeSeedColor.g}-${safeSeedColor.b}`;

  let animationFrameId: number | null = null;
  let isCancelled = false;

  // Initialize deterministic RNG
  const rng = new Prando(cacheId);

  ctx.clearRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);

  // --- Shared Buffer Operations ---

  function paintPixelBuffer(x: number, y: number, color: Color) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    img.data[idx] = color.r;
    img.data[idx + 1] = color.g;
    img.data[idx + 2] = color.b;
    img.data[idx + 3] = 255;
  }

  function clearPixelBuffer(x: number, y: number) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    img.data[idx + 3] = 0; // Set alpha to 0
  }

  // --- Initialization ---

  (async () => {
    try {
      const cachedSim = await db.simulations.get(cacheId);

      if (isCancelled) return;

      if (cachedSim) {
        // Cache hit: Play the boomerang animation immediately
        runBoomerangMode(cachedSim.steps);
      } else {
        // Cache miss: Run simulation
        runComputeMode();
      }
    } catch (e) {
      console.error("DLA Cache Error, falling back to compute", e);
      runComputeMode();
    }
  })();

  // --- Mode 1: Boomerang (Playback) ---

  function runBoomerangMode(steps: ParticleStep[]) {
    let currentStepIndex = 0;
    let direction = 1; // 1 = Forward (Build), -1 = Reverse (Erase)

    // Speed multiplier for playback
    const STEPS_PER_FRAME = 400;

    function frame() {
      if (isCancelled) return;

      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        if (direction === 1) {
          // Forward: Draw particles
          if (currentStepIndex >= steps.length) {
            direction = -1;
            currentStepIndex = steps.length - 1;
          } else {
            const s = steps[currentStepIndex];
            paintPixelBuffer(s.x, s.y, s.color);
            currentStepIndex++;
          }
        } else {
          // Reverse: Erase particles
          if (currentStepIndex < 0) {
            direction = 1;
            currentStepIndex = 0;
          } else {
            const s = steps[currentStepIndex];
            clearPixelBuffer(s.x, s.y);
            currentStepIndex--;
          }
        }
      }

      ctx.putImageData(img, 0, 0);
      animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
  }

  // --- Mode 2: Compute (Simulation) ---

  function runComputeMode() {
    const visited = new Set<number>();
    const recordedSteps: ParticleStep[] = [];

    const {
      centerX: circleCenterX,
      centerY: circleCenterY,
      radius: circleRadius,
      isInBounds,
    } = calculateCircularBounds(w, h, seedX, seedY);

    // Seed initialization
    if (isInBounds(seedX, seedY)) {
      paintPixelBuffer(seedX, seedY, safeSeedColor);
      visited.add(seedY * w + seedX);
      recordedSteps.push({ x: seedX, y: seedY, color: safeSeedColor });
    }
    ctx.putImageData(img, 0, 0);

    let aggregatedParticlesCount = 1;
    const MAX_PARTICLES =
      Math.floor(Math.PI * circleRadius * circleRadius) || 10;

    // Performance Tuning
    const PARTICLES_PER_FRAME = 250;
    const MAX_WALKER_STEPS = 5000;
    const DRAW_INTERVAL = 50;

    // Spawning Phase State
    let fillPhaseActive = false;
    let particlesSinceLastDraw = 0;

    // Bounding box of the aggregate
    let minX = seedX,
      maxX = seedX,
      minY = seedY,
      maxY = seedY;

    // Simulation Parameters
    const DLA_SIMILARITY_PERCENT = 0.98;
    const DLA_SIMILAR_VARIATION = 3;
    const DLA_DISSIMILAR_VARIATION = 20;

    // --- Helper: Neighbor Colors ---
    function getDlaNeighborColors(x: number, y: number): Color[] {
      const colors: Color[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx,
            ny = y + dy;
          // Using shared visited set and isInBounds closure
          if (isInBounds(nx, ny) && visited.has(ny * w + nx)) {
            const idx = (ny * w + nx) * 4;
            colors.push({
              r: img.data[idx],
              g: img.data[idx + 1],
              b: img.data[idx + 2],
            });
          }
        }
      }
      return colors;
    }

    // --- Helper: Color Generation ---
    function generateDlaInfluencedColor(neighborColors: Color[]): Color {
      if (neighborColors.length === 0) {
        // Replaced Math.random() with rng.next()
        return {
          r: rng.next() * 255,
          g: rng.next() * 255,
          b: rng.next() * 255,
        };
      }

      const sum = neighborColors.reduce(
        (acc, col) => ({
          r: acc.r + col.r,
          g: acc.g + col.g,
          b: acc.b + col.b,
        }),
        { r: 0, g: 0, b: 0 },
      );

      const avg = {
        r: sum.r / neighborColors.length,
        g: sum.g / neighborColors.length,
        b: sum.b / neighborColors.length,
      };

      const useSimilar =
        neighborColors.length >= 3 || rng.next() < DLA_SIMILARITY_PERCENT;

      const variation = useSimilar
        ? DLA_SIMILAR_VARIATION
        : DLA_DISSIMILAR_VARIATION;

      // Dimming factor based on density
      const factor =
        neighborColors.length >= 2
          ? 1 / Math.pow(neighborColors.length, 0.17)
          : 1;

      return {
        r:
          Math.min(
            255,
            Math.max(0, avg.r + (rng.next() - 0.5) * variation * 2),
          ) * factor,
        g:
          Math.min(
            255,
            Math.max(0, avg.g + (rng.next() - 0.5) * variation * 2),
          ) * factor,
        b:
          Math.min(
            255,
            Math.max(0, avg.b + (rng.next() - 0.5) * variation * 2),
          ) * factor,
      };
    }

    // --- Main Compute Step ---
    function step() {
      if (isCancelled) return;

      // Check completion
      if (aggregatedParticlesCount >= MAX_PARTICLES) {
        ctx.putImageData(img, 0, 0);
        animationFrameId = null;

        // Save to DB
        db.simulations
          .add({
            id: cacheId,
            steps: recordedSteps,
            timestamp: Date.now(),
          })
          .then(() => {
            // Switch to Boomerang mode seamlessly after saving
            if (!isCancelled) runBoomerangMode(recordedSteps);
          })
          .catch((e) => console.error("Failed to save DLA", e));

        return;
      }

      // Process batch of particles
      for (let i = 0; i < PARTICLES_PER_FRAME; i++) {
        if (aggregatedParticlesCount >= MAX_PARTICLES) break;

        let walkerX = 0;
        let walkerY = 0;
        let spawnedSuccessfully = false;
        const MAX_SPAWN_ATTEMPTS = 100;

        // --- Spawning Logic ---
        for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
          if (!fillPhaseActive) {
            // PHASE 1: Growth Phase (Ring around aggregate)
            const aggregateCenterX = (minX + maxX) / 2;
            const aggregateCenterY = (minY + maxY) / 2;
            const radiusX = Math.max(
              aggregateCenterX - minX,
              maxX - aggregateCenterX,
            );
            const radiusY = Math.max(
              aggregateCenterY - minY,
              maxY - aggregateCenterY,
            );
            const aggregateRadius = Math.sqrt(
              radiusX * radiusX + radiusY * radiusY,
            );

            // Check boundaries
            if (aggregateRadius + 15 >= circleRadius) {
              fillPhaseActive = true;
            } else {
              const spawnRadius = aggregateRadius + 15;
              const angle = rng.next() * 2 * Math.PI;
              walkerX = Math.floor(
                aggregateCenterX + spawnRadius * Math.cos(angle),
              );
              walkerY = Math.floor(
                aggregateCenterY + spawnRadius * Math.sin(angle),
              );
            }
          }

          if (fillPhaseActive) {
            // PHASE 2: Fill Phase (Random inside circle)
            const angle = rng.next() * 2 * Math.PI;
            // Use sqrt for uniform distribution in a circle
            const radius = circleRadius * Math.sqrt(rng.next());
            walkerX = Math.floor(circleCenterX + radius * Math.cos(angle));
            walkerY = Math.floor(circleCenterY + radius * Math.sin(angle));
          }

          // Ensure spawn point is valid and not occupied
          if (
            isInBounds(walkerX, walkerY) &&
            !visited.has(walkerY * w + walkerX)
          ) {
            spawnedSuccessfully = true;
            break;
          }
        }

        if (!spawnedSuccessfully) continue;

        // --- Walking Logic ---
        let currentWalkerSteps = 0;
        while (currentWalkerSteps < MAX_WALKER_STEPS) {
          currentWalkerSteps++;
          let isAdjacentToAggregate = false;

          // Check for neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = walkerX + dx;
              const ny = walkerY + dy;
              if (isInBounds(nx, ny) && visited.has(ny * w + nx)) {
                isAdjacentToAggregate = true;
                break;
              }
            }
            if (isAdjacentToAggregate) break;
          }

          if (isAdjacentToAggregate) {
            // Aggregate the particle
            const neighbors = getDlaNeighborColors(walkerX, walkerY);
            const newColor = generateDlaInfluencedColor(neighbors);

            paintPixelBuffer(walkerX, walkerY, newColor);
            visited.add(walkerY * w + walkerX);
            recordedSteps.push({ x: walkerX, y: walkerY, color: newColor });

            // Update bounding box
            minX = Math.min(minX, walkerX);
            maxX = Math.max(maxX, walkerX);
            minY = Math.min(minY, walkerY);
            maxY = Math.max(maxY, walkerY);

            aggregatedParticlesCount++;
            particlesSinceLastDraw++;
            break; // Stop walking this particle
          }

          // Move Randomly
          const moveDx = Math.floor(rng.next() * 3) - 1;
          const moveDy = Math.floor(rng.next() * 3) - 1;
          const nextX = walkerX + moveDx;
          const nextY = walkerY + moveDy;

          if (!isInBounds(nextX, nextY)) continue;
          if (visited.has(nextY * w + nextX)) continue;

          walkerX = nextX;
          walkerY = nextY;
        }
      }

      // Update Canvas
      if (particlesSinceLastDraw >= DRAW_INTERVAL) {
        ctx.putImageData(img, 0, 0);
        particlesSinceLastDraw = 0;
      }

      animationFrameId = requestAnimationFrame(step);
    }

    animationFrameId = requestAnimationFrame(step);
  }

  return {
    cancel: () => {
      isCancelled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    },
  };
}
