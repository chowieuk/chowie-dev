// https://github.com/chrisloy/fractavibes
import { calculateCircularBounds } from "./shared.js";

export function runDLA(
  ctx,
  canvasWidth,
  canvasHeight,
  seedX,
  seedY,
  seedColor,
) {
  const w = canvasWidth;
  const h = canvasHeight;
  ctx.clearRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const visited = new Set(); // Stores "y * w + x" for aggregated particles for O(1) lookups

  const {
    centerX: circleCenterX,
    centerY: circleCenterY,
    radius: circleRadius,
    isInBounds,
  } = calculateCircularBounds(canvasWidth, canvasHeight, seedX, seedY);

  let aggregatedParticlesCount = 0;
  const MAX_PARTICLES = Math.floor(Math.PI * circleRadius * circleRadius);

  // --- PERFORMANCE TUNING PARAMETERS ---
  const PARTICLES_PER_FRAME = 250;
  // Increased steps for walkers that might start far from the aggregate in phase 2
  const MAX_WALKER_STEPS = 5000;
  const DRAW_INTERVAL = 50;

  // This flag will switch our spawning strategy once the aggregate hits the boundary.
  let fillPhaseActive = false;

  const DLA_SIMILARITY_PERCENT = 0.98;
  const DLA_SIMILAR_VARIATION = 3;
  const DLA_DISSIMILAR_VARIATION = 20;

  let particlesSinceLastDraw = 0;
  let animationFrameId = null;

  let minX = seedX,
    maxX = seedX,
    minY = seedY,
    maxY = seedY;

  function getDlaNeighborColors(x, y) {
    const colors = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx,
          ny = y + dy;
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

  function generateDlaInfluencedColor(neighborColors) {
    if (neighborColors.length === 0) {
      return {
        r: Math.random() * 255,
        g: Math.random() * 255,
        b: Math.random() * 255,
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
      neighborColors.length >= 3 || Math.random() < DLA_SIMILARITY_PERCENT;
    const variation = useSimilar
      ? DLA_SIMILAR_VARIATION
      : DLA_DISSIMILAR_VARIATION;
    const factor =
      neighborColors.length >= 2
        ? 1 / Math.pow(neighborColors.length, 0.17)
        : 1;
    return {
      r:
        Math.min(
          255,
          Math.max(0, avg.r + (Math.random() - 0.5) * variation * 2),
        ) * factor,
      g:
        Math.min(
          255,
          Math.max(0, avg.g + (Math.random() - 0.5) * variation * 2),
        ) * factor,
      b:
        Math.min(
          255,
          Math.max(0, avg.b + (Math.random() - 0.5) * variation * 2),
        ) * factor,
    };
  }

  function paintPixel(x, y, color) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    img.data[idx] = color.r;
    img.data[idx + 1] = color.g;
    img.data[idx + 2] = color.b;
    img.data[idx + 3] = 255;
  }

  if (seedX < 0 || seedX >= w || seedY < 0 || seedY >= h) {
    console.error("DLA seed is out of bounds.");
    return null;
  }

  if (!seedColor) seedColor = generateDlaInfluencedColor([]);
  paintPixel(seedX, seedY, seedColor);
  visited.add(seedY * w + seedX);
  aggregatedParticlesCount++;
  ctx.putImageData(img, 0, 0);

  function animationStep() {
    if (aggregatedParticlesCount >= MAX_PARTICLES) {
      ctx.putImageData(img, 0, 0);
      animationFrameId = null;
      return;
    }

    const particlesAddedThisFrame = aggregatedParticlesCount;

    for (let i = 0; i < PARTICLES_PER_FRAME; i++) {
      if (aggregatedParticlesCount >= MAX_PARTICLES) break;

      let walkerX, walkerY;
      let spawnedSuccessfully = false;
      const MAX_SPAWN_ATTEMPTS = 100;

      for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
        // --- FINAL RECTIFICATION: TWO-PHASE SPAWNING LOGIC ---

        if (!fillPhaseActive) {
          // PHASE 1: Growth Phase. Spawn in a ring around the aggregate.
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

          // Check if the spawn ring would go outside our main circle boundary.
          if (aggregateRadius + 15 >= circleRadius) {
            fillPhaseActive = true;
            // Fall through to the 'fillPhaseActive' block below
          } else {
            const spawnRadius = aggregateRadius + 15;
            const angle = Math.random() * 2 * Math.PI;
            walkerX = Math.floor(
              aggregateCenterX + spawnRadius * Math.cos(angle),
            );
            walkerY = Math.floor(
              aggregateCenterY + spawnRadius * Math.sin(angle),
            );
          }
        }

        if (fillPhaseActive) {
          // PHASE 2: Fill Phase. Spawn randomly ANYWHERE inside the circle.
          // This is the robust method that ensures gaps are filled.
          const angle = Math.random() * 2 * Math.PI;
          // Use Math.sqrt() on the random number to ensure uniform distribution
          const radius = circleRadius * Math.sqrt(Math.random());
          walkerX = Math.floor(circleCenterX + radius * Math.cos(angle));
          walkerY = Math.floor(circleCenterY + radius * Math.sin(angle));
        }

        // Check if the randomly chosen spot is already occupied. If so, retry.
        if (!visited.has(walkerY * w + walkerX)) {
          spawnedSuccessfully = true;
          break; // Exit spawn attempt loop
        }
      }

      if (!spawnedSuccessfully) {
        continue; // Failed to spawn a particle, move to the next one in the frame.
      }

      let currentWalkerSteps = 0;
      while (currentWalkerSteps < MAX_WALKER_STEPS) {
        currentWalkerSteps++;
        let isAdjacentToAggregate = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = walkerX + dx,
              ny = walkerY + dy;
            if (isInBounds(nx, ny) && visited.has(ny * w + nx)) {
              isAdjacentToAggregate = true;
              break;
            }
          }
          if (isAdjacentToAggregate) break;
        }

        if (isAdjacentToAggregate) {
          const newColor = generateDlaInfluencedColor(
            getDlaNeighborColors(walkerX, walkerY),
          );
          paintPixel(walkerX, walkerY, newColor);
          visited.add(walkerY * w + walkerX);
          minX = Math.min(minX, walkerX);
          maxX = Math.max(maxX, walkerX);
          minY = Math.min(minY, walkerY);
          maxY = Math.max(maxY, walkerY);
          aggregatedParticlesCount++;
          particlesSinceLastDraw++;
          break;
        }

        const moveDx = Math.floor(Math.random() * 3) - 1;
        const moveDy = Math.floor(Math.random() * 3) - 1;
        const nextX = walkerX + moveDx,
          nextY = walkerY + moveDy;

        if (!isInBounds(nextX, nextY)) continue;
        if (visited.has(nextY * w + nextX)) continue;
        walkerX = nextX;
        walkerY = nextY;
      }
    }

    if (particlesSinceLastDraw >= DRAW_INTERVAL) {
      ctx.putImageData(img, 0, 0);
      particlesSinceLastDraw = 0;
    }

    if (aggregatedParticlesCount < MAX_PARTICLES) {
      animationFrameId = requestAnimationFrame(animationStep);
    } else {
      ctx.putImageData(img, 0, 0);
      animationFrameId = null;
    }
  }

  animationFrameId = requestAnimationFrame(animationStep);

  return {
    cancel: () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    },
  };
}
