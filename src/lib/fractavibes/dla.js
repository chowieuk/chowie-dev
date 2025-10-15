// https://github.com/chrisloy/fractavibes

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

  let aggregatedParticlesCount = 0;
  const MAX_PARTICLES = w * h; // Stop when canvas is full

  // --- PERFORMANCE TUNING PARAMETERS ---
  // Increased to process more walkers per frame, trading smoothness for speed.
  const PARTICLES_PER_FRAME = 250;
  // Reduced, as smart spawning and kill radius make long walks less necessary.
  const MAX_WALKER_STEPS = 2000;
  // Increased to reduce expensive ctx.putImageData calls.
  const DRAW_INTERVAL = 50;
  // --- END OF TUNING PARAMETERS ---

  const DLA_SIMILARITY_PERCENT = 0.98;
  const DLA_SIMILAR_VARIATION = 3;
  const DLA_DISSIMILAR_VARIATION = 20;

  let particlesSinceLastDraw = 0;
  let animationFrameId = null;

  // Bounding box for the aggregate, used for optimized spawning.
  let minX = seedX,
    maxX = seedX,
    minY = seedY,
    maxY = seedY;

  function getDlaNeighborColors(x, y) {
    const colors = [];
    // Check all 8 neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx,
          ny = y + dy;
        if (
          nx >= 0 &&
          nx < w &&
          ny >= 0 &&
          ny < h &&
          visited.has(ny * w + nx)
        ) {
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

    // Optimization: Sum first, then divide once.
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

  // Initial seed placement
  if (!seedColor) {
    seedColor = generateDlaInfluencedColor([]);
  }
  paintPixel(seedX, seedY, seedColor);
  visited.add(seedY * w + seedX);
  aggregatedParticlesCount++;
  ctx.putImageData(img, 0, 0); // Draw initial seed

  function animationStep() {
    if (aggregatedParticlesCount >= MAX_PARTICLES) {
      // console.log("DLA finished: Max particles reached.");
      ctx.putImageData(img, 0, 0);
      animationFrameId = null;
      return;
    }

    for (let i = 0; i < PARTICLES_PER_FRAME; i++) {
      if (aggregatedParticlesCount >= MAX_PARTICLES) break;

      // --- OPTIMIZATION 1: Spawn walkers on a radius around the aggregate ---
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radiusX = Math.max(centerX - minX, maxX - centerX);
      const radiusY = Math.max(centerY - minY, maxY - centerY);
      const spawnRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY) + 15; // +15 pixel margin

      const angle = Math.random() * 2 * Math.PI;
      let walkerX = Math.floor(centerX + spawnRadius * Math.cos(angle));
      let walkerY = Math.floor(centerY + spawnRadius * Math.sin(angle));

      // Clamp to canvas bounds
      walkerX = Math.max(0, Math.min(w - 1, walkerX));
      walkerY = Math.max(0, Math.min(h - 1, walkerY));

      // If we spawn on an existing particle by chance, just skip this walker.
      if (visited.has(walkerY * w + walkerX)) {
        continue;
      }

      // --- OPTIMIZATION 2: Define a "kill radius" to terminate lost walkers ---
      const killRadius = spawnRadius * 2;
      const killRadiusSq = killRadius * killRadius;

      let currentWalkerSteps = 0;
      while (currentWalkerSteps < MAX_WALKER_STEPS) {
        currentWalkerSteps++;

        let isAdjacentToAggregate = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = walkerX + dx;
            const ny = walkerY + dy;
            if (
              nx >= 0 &&
              nx < w &&
              ny >= 0 &&
              ny < h &&
              visited.has(ny * w + nx)
            ) {
              isAdjacentToAggregate = true;
              break;
            }
          }
          if (isAdjacentToAggregate) break;
        }

        if (isAdjacentToAggregate) {
          const neighborColors = getDlaNeighborColors(walkerX, walkerY);
          const newColor = generateDlaInfluencedColor(neighborColors);
          paintPixel(walkerX, walkerY, newColor);
          visited.add(walkerY * w + walkerX);

          // Update the bounding box for the next spawn
          minX = Math.min(minX, walkerX);
          maxX = Math.max(maxX, walkerX);
          minY = Math.min(minY, walkerY);
          maxY = Math.max(maxY, walkerY);

          aggregatedParticlesCount++;
          particlesSinceLastDraw++;
          break; // Walker has stuck, exit its while loop
        }

        const moveDx = Math.floor(Math.random() * 3) - 1;
        const moveDy = Math.floor(Math.random() * 3) - 1;

        const nextX = walkerX + moveDx;
        const nextY = walkerY + moveDy;

        // Check if walker has wandered too far (kill radius)
        const distSq = (nextX - centerX) ** 2 + (nextY - centerY) ** 2;
        if (distSq > killRadiusSq) {
          break; // Walker is lost, terminate its path
        }

        // Check canvas boundaries
        if (nextX < 0 || nextX >= w || nextY < 0 || nextY >= h) {
          // You could also 'break' here to terminate walkers that hit the edge
          continue;
        }

        // Check collision with other aggregated particles (this would be rare)
        if (visited.has(nextY * w + nextX)) {
          continue;
        }

        walkerX = nextX;
        walkerY = nextY;
      }
    }

    if (particlesSinceLastDraw >= DRAW_INTERVAL) {
      ctx.putImageData(img, 0, 0);
      particlesSinceLastDraw = 0;
    }

    // Schedule the next animation frame
    if (aggregatedParticlesCount < MAX_PARTICLES) {
      animationFrameId = requestAnimationFrame(animationStep);
    } else {
      ctx.putImageData(img, 0, 0); // Final draw
      animationFrameId = null;
      // console.log("DLA finished: Max particles reached (final check).");
    }
  }

  animationFrameId = requestAnimationFrame(animationStep); // Start the loop

  return {
    cancel: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
  };
}
