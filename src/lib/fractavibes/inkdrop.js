// https://github.com/chrisloy/fractavibes

export function runInkDrop(ctx, canvasWidth, canvasHeight, seedX, seedY) {
  const w = canvasWidth;
  const h = canvasHeight;

  ctx.clearRect(0, 0, w, h);

  const circleCenterX = seedX;
  const circleCenterY = seedY;
  const circleRadius =
    Math.min(seedX, canvasWidth - seedX, seedY, canvasHeight - seedY) *
    0.618033;
  const circleRadiusSq = circleRadius * circleRadius;

  // Set circle background to white
  ctx.beginPath();
  ctx.arc(circleCenterX, circleCenterY, circleRadius, 0, 2 * Math.PI);
  ctx.fillStyle = "white";
  ctx.fill();

  const img = ctx.getImageData(0, 0, w, h);

  function isInBounds(x, y) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const dx = rx - circleCenterX;
    const dy = ry - circleCenterY;
    return dx * dx + dy * dy <= circleRadiusSq;
  }

  // Algorithm parameters
  const MAX_ITERATIONS = 50000;
  const NUMBER_OF_DROPS = Math.floor(Math.random() * 96) + 5; // 5-100 drops
  const COLOR_RANDOMNESS = Math.random() * 0.9 + 0.1; // Color randomness 0.1-0.9
  const DECAY_FACTOR = Math.random() * 0.001 + 0.999; // 0.999-0.9999999 exponential decay
  const SPREAD_PROBABILITY = Math.random() * 0.4 + 0.3; // 0.3-0.7 base spread chance
  const WEIGHT_INFLUENCE = Math.random() * 0.3 + 0.1; // 0.1-0.4 neighbor weight influence
  const SMOOTHING_RADIUS = Math.floor(Math.random() * 3) + 2; // 2-4 pixel smoothing radius
  const COLOR_NOISE = Math.random() * 0.05 + 0.01; // 0.01-0.06 subtle color noise
  const BASE_COLOUR = {
    r: Math.floor(Math.random() * 255 * 0.8),
    g: Math.floor(Math.random() * 255 * 0.8),
    b: Math.floor(Math.random() * 255 * 0.8),
  };

  // Create ink drops data and pixel ownership tracking
  const inkDrops = [];
  const pixelOwnership = Array(h)
    .fill(null)
    .map(() => Array(w).fill(-1)); // -1 = unowned, dropId = owned by that drop

  for (let i = 0; i < NUMBER_OF_DROPS; i++) {
    // MODIFIED: Spawn drops randomly within the circle, not the rectangle
    const angle = Math.random() * 2 * Math.PI;
    const radius = circleRadius * Math.sqrt(Math.random()); // sqrt for uniform distribution
    const dropX = Math.floor(circleCenterX + radius * Math.cos(angle));
    const dropY = Math.floor(circleCenterY + radius * Math.sin(angle));

    const drop = {
      id: i,
      x: dropX,
      y: dropY,
      radius: Math.floor(Math.random() * 10) + 1, // 1-10 pixels
      color: {
        r: Math.max(
          0,
          Math.min(
            255,
            BASE_COLOUR.r + (Math.random() - 0.5) * COLOR_RANDOMNESS * 255,
          ),
        ),
        g: Math.max(
          0,
          Math.min(
            255,
            BASE_COLOUR.g + (Math.random() - 0.5) * COLOR_RANDOMNESS * 255,
          ),
        ),
        b: Math.max(
          0,
          Math.min(
            255,
            BASE_COLOUR.b + (Math.random() - 0.5) * COLOR_RANDOMNESS * 255,
          ),
        ),
      },
      currentSaturationMultiplier: 1.0, // For exponential decay
      frontier: new Map(), // key = y * w + x, value = [x, y]
      frontierWeights: new Map(), // key = y * w + x, value = weight
      isInitialized: false, // Track if center pixel has been painted
      splatType: Math.floor(Math.random() * 5), // 0-4 different splat types
      splatSize: Math.floor(Math.random() * 10) + 2, // 2-12 pixel splat size
    };
    inkDrops.push(drop);
  }

  // Helper function to get pixel color
  function getPixelColor(x, y) {
    // MODIFIED: Use circular bounds check
    if (x < 0 || x >= w || y < 0 || y >= h || !isInBounds(x, y)) {
      return { r: 255, g: 255, b: 255 }; // white for out of bounds
    }
    const idx = (y * w + x) * 4;
    return {
      r: img.data[idx],
      g: img.data[idx + 1],
      b: img.data[idx + 2],
    };
  }

  // Helper function to set pixel color with cross-drop blending
  function setPixelColor(x, y, color, dropId) {
    // MODIFIED: Use circular bounds check first
    if (x < 0 || x >= w || y < 0 || y >= h || !isInBounds(x, y)) return false;

    const idx = (y * w + x) * 4;
    const currentOwner = pixelOwnership[y][x];

    if (currentOwner === -1) {
      img.data[idx] = Math.round(color.r);
      img.data[idx + 1] = Math.round(color.g);
      img.data[idx + 2] = Math.round(color.b);
      img.data[idx + 3] = 255;
      pixelOwnership[y][x] = dropId;
      return true;
    }

    if (currentOwner === dropId) {
      img.data[idx] = Math.round(color.r);
      img.data[idx + 1] = Math.round(color.g);
      img.data[idx + 2] = Math.round(color.b);
      img.data[idx + 3] = 255;
      return true;
    }

    const existingColor = {
      r: img.data[idx],
      g: img.data[idx + 1],
      b: img.data[idx + 2],
    };

    const blendFactor = 0.3;
    const blendedColor = {
      r: existingColor.r * (1 - blendFactor) + color.r * blendFactor,
      g: existingColor.g * (1 - blendFactor) + color.g * blendFactor,
      b: existingColor.b * (1 - blendFactor) + color.b * blendFactor,
    };

    img.data[idx] = Math.round(blendedColor.r);
    img.data[idx + 1] = Math.round(blendedColor.g);
    img.data[idx + 2] = Math.round(blendedColor.b);
    img.data[idx + 3] = 255;

    return true;
  }

  // Helper function to count colored neighbors for weight calculation
  function countColoredNeighbors(x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        // MODIFIED: Use circular bounds check
        if (isInBounds(nx, ny)) {
          const neighborColor = getPixelColor(nx, ny);
          if (
            neighborColor.r < 255 ||
            neighborColor.g < 255 ||
            neighborColor.b < 255
          ) {
            count++;
          }
        }
      }
    }
    return count;
  }

  // Helper function to get cross-drop color blend from area around pixel
  function getCrossDropAreaColor(x, y, radius = SMOOTHING_RADIUS) {
    const colorsByDrop = new Map();
    const weights = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // MODIFIED: Use circular bounds check
        if (dist <= radius && isInBounds(nx, ny)) {
          const color = getPixelColor(nx, ny);
          if (color.r < 255 || color.g < 255 || color.b < 255) {
            const dropId = pixelOwnership[ny][nx];

            if (!colorsByDrop.has(dropId)) {
              colorsByDrop.set(dropId, { colors: [], weights: [] });
            }

            const dropData = colorsByDrop.get(dropId);
            dropData.colors.push(color);
            const weight = 1 / (dist + 1);
            dropData.weights.push(weight);
            weights.push(weight);
          }
        }
      }
    }

    if (colorsByDrop.size === 0) return { r: 255, g: 255, b: 255 };

    if (colorsByDrop.size === 1) {
      const dropData = Array.from(colorsByDrop.values())[0];
      const totalWeight = dropData.weights.reduce((a, b) => a + b, 0);
      const blended = dropData.colors.reduce(
        (acc, color, i) => ({
          r: acc.r + color.r * dropData.weights[i],
          g: acc.g + color.g * dropData.weights[i],
          b: acc.b + color.b * dropData.weights[i],
        }),
        { r: 0, g: 0, b: 0 },
      );

      return {
        r: blended.r / totalWeight,
        g: blended.g / totalWeight,
        b: blended.b / totalWeight,
      };
    }

    const dropAverages = [];
    const dropWeights = [];

    for (const [dropId, dropData] of colorsByDrop.entries()) {
      const dropTotalWeight = dropData.weights.reduce((a, b) => a + b, 0);
      const dropAverage = dropData.colors.reduce(
        (acc, color, i) => ({
          r: acc.r + color.r * dropData.weights[i],
          g: acc.g + color.g * dropData.weights[i],
          b: acc.b + color.b * dropData.weights[i],
        }),
        { r: 0, g: 0, b: 0 },
      );

      dropAverages.push({
        r: dropAverage.r / dropTotalWeight,
        g: dropAverage.g / dropTotalWeight,
        b: dropAverage.b / dropTotalWeight,
      });

      dropWeights.push(dropTotalWeight);
    }

    const totalDropWeight = dropWeights.reduce((a, b) => a + b, 0);
    const finalBlend = dropAverages.reduce(
      (acc, color, i) => ({
        r: acc.r + color.r * dropWeights[i],
        g: acc.g + color.g * dropWeights[i],
        b: acc.b + color.b * dropWeights[i],
      }),
      { r: 0, g: 0, b: 0 },
    );

    return {
      r: finalBlend.r / totalDropWeight,
      g: finalBlend.g / totalDropWeight,
      b: finalBlend.b / totalDropWeight,
    };
  }

  // Helper function to blend colors with anti-aliasing (no change needed)
  function blendColors(colors) {
    if (colors.length === 0) return { r: 255, g: 255, b: 255 };

    const total = colors.reduce(
      (acc, color) => ({
        r: acc.r + color.r,
        g: acc.g + color.g,
        b: acc.b + color.b,
      }),
      { r: 0, g: 0, b: 0 },
    );

    return {
      r: total.r / colors.length,
      g: total.g / colors.length,
      b: total.b / colors.length,
    };
  }

  // Helper function to add subtle color noise (no change needed)
  function addColorNoise(color) {
    const noise = COLOR_NOISE * 255;
    return {
      r: Math.max(0, Math.min(255, color.r + (Math.random() - 0.5) * noise)),
      g: Math.max(0, Math.min(255, color.g + (Math.random() - 0.5) * noise)),
      b: Math.max(0, Math.min(255, color.b + (Math.random() - 0.5) * noise)),
    };
  }

  // Helper function to generate splat patterns
  function generateSplatPixels(drop) {
    const pixels = [];
    const centerX = drop.x;
    const centerY = drop.y;
    const size = drop.splatSize;

    // Helper to add pixel with bounds checking
    function addPixelIfValid(x, y) {
      // MODIFIED: Use circular bounds check
      if (isInBounds(x, y)) {
        pixels.push([x, y]);
      }
    }

    // (The switch statement logic remains the same, but calls the modified addPixelIfValid)
    switch (drop.splatType) {
      case 0:
        for (let dy = -size; dy <= size; dy++) {
          for (let dx = -size; dx <= size; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= size && Math.random() < 0.7) {
              addPixelIfValid(centerX + dx, centerY + dy);
            }
          }
        }
        break;
      case 1:
        const arcLength = size * 2 + 3;
        const startAngle = Math.random() * Math.PI * 2;
        const arcSpan = Math.PI / 3 + (Math.random() * Math.PI) / 3;
        for (let i = 0; i < arcLength; i++) {
          const angle = startAngle + (arcSpan * i) / arcLength;
          const radius = size * 0.8 + Math.random() * size * 0.4;
          const x = Math.round(centerX + Math.cos(angle) * radius);
          const y = Math.round(centerY + Math.sin(angle) * radius);
          addPixelIfValid(x, y);
          if (Math.random() < 0.4) {
            addPixelIfValid(x + (Math.random() < 0.5 ? 1 : -1), y);
            addPixelIfValid(x, y + (Math.random() < 0.5 ? 1 : -1));
          }
        }
        break;
      case 2:
        addPixelIfValid(centerX, centerY);
        const blobPixels = size * size;
        for (let i = 0; i < blobPixels; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * size * 1.2;
          const x = Math.round(centerX + Math.cos(angle) * radius);
          const y = Math.round(centerY + Math.sin(angle) * radius);
          addPixelIfValid(x, y);
        }
        break;
      case 3:
        const numCircles = 2 + Math.floor(Math.random() * 3);
        for (let c = 0; c < numCircles; c++) {
          const offsetX =
            (Math.random() - 0.5) * size * (Math.random() * 20) + 2;
          const offsetY =
            (Math.random() - 0.5) * size * (Math.random() * 20) + 2;
          const circleX = Math.round(centerX + offsetX);
          const circleY = Math.round(centerY + offsetY);
          const circleSize = 1 + Math.floor(Math.random() * 5);
          for (let dy = -circleSize; dy <= circleSize; dy++) {
            for (let dx = -circleSize; dx <= circleSize; dx++) {
              if (dx * dx + dy * dy <= circleSize * circleSize) {
                addPixelIfValid(circleX + dx, circleY + dy);
              }
            }
          }
        }
        break;
      case 4:
        const streakLength = size * (Math.random() * 20) + 2;
        const direction = Math.random() * Math.PI * 2;
        const dx = Math.cos(direction);
        const dy = Math.sin(direction);
        for (let i = 0; i < streakLength; i++) {
          const x = Math.round(centerX + dx * i);
          const y = Math.round(centerY + dy * i);
          addPixelIfValid(x, y);
          if (Math.random() < 0.5) {
            const perpX = -dy;
            const perpY = dx;
            const scatterDist = (Math.random() - 0.5) * 2;
            addPixelIfValid(
              Math.round(x + perpX * scatterDist),
              Math.round(y + perpY * scatterDist),
            );
          }
        }
        break;
    }
    return pixels;
  }

  // Helper function to apply exponential decay (no change needed)
  function applyExponentialDecay(color, saturationMultiplier) {
    const decayedR = 255 - (255 - color.r) * saturationMultiplier;
    const decayedG = 255 - (255 - color.g) * saturationMultiplier;
    const decayedB = 255 - (255 - color.b) * saturationMultiplier;
    return {
      r: Math.max(0, Math.min(255, decayedR)),
      g: Math.max(0, Math.min(255, decayedG)),
      b: Math.max(0, Math.min(255, decayedB)),
    };
  }

  // Helper function to add a pixel to a drop's frontier
  function addToFrontier(drop, x, y) {
    x = Math.round(x);
    y = Math.round(y);
    const key = y * w + x;
    // MODIFIED: Use circular bounds check
    if (
      isInBounds(x, y) &&
      pixelOwnership[y][x] === -1 &&
      !drop.frontier.has(key)
    ) {
      drop.frontier.set(key, [x, y]);
      drop.frontierWeights.set(key, computeFrontierWeight(drop, x, y));
    }
  }

  // The rest of the functions (computeFrontierWeight, pickFrontierPixel, step)
  // do not need changes as they rely on the helpers we've already modified.
  // ... (rest of the code is unchanged) ...

  function computeFrontierWeight(drop, x, y) {
    const neighborCount = countColoredNeighbors(x, y);
    const distFromCenter = Math.hypot(x - drop.x, y - drop.y);
    return Math.pow(neighborCount + 1, 2) / Math.pow(distFromCenter + 1, 0.5);
  }

  function pickFrontierPixel(drop) {
    if (!drop.frontier || !drop.frontierWeights) return null;
    const entries = Array.from(drop.frontier.values());
    if (entries.length === 0) return null;
    const weights = entries.map(([fx, fy]) => {
      fx = Math.round(fx);
      fy = Math.round(fy);
      const key = fy * w + fx;
      return drop.frontierWeights.get(key) || 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) return entries[Math.floor(Math.random() * entries.length)];
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= weights[i];
      if (r <= 0) return entries[i];
    }
    return entries[entries.length - 1];
  }

  let iteration = 0;
  let animationFrameId = null;

  function step() {
    if (iteration >= MAX_ITERATIONS) {
      return;
    }

    inkDrops.forEach((drop) => {
      drop.currentSaturationMultiplier *= DECAY_FACTOR;
    });

    inkDrops.forEach((drop) => {
      if (!drop.isInitialized) {
        const splatPixels = generateSplatPixels(drop);
        for (const [x, y] of splatPixels) {
          let splatColor = applyExponentialDecay(
            drop.color,
            drop.currentSaturationMultiplier,
          );
          splatColor = addColorNoise(splatColor);
          if (setPixelColor(x, y, splatColor, drop.id)) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                addToFrontier(drop, x + dx, y + dy);
              }
            }
          }
        }
        drop.isInitialized = true;
        return;
      }

      const pixelsToProcess = Math.min(3, drop.frontier.size);
      for (let i = 0; i < pixelsToProcess; i++) {
        const frontierPixel = pickFrontierPixel(drop);
        if (!frontierPixel) break;
        let [x, y] = frontierPixel;
        x = Math.round(x);
        y = Math.round(y);
        const key = y * w + x;
        const neighborCount = countColoredNeighbors(x, y);
        const weightBonus = neighborCount * WEIGHT_INFLUENCE;
        const spreadChance = SPREAD_PROBABILITY + weightBonus;

        if (Math.random() <= spreadChance) {
          const areaColor = getCrossDropAreaColor(x, y);
          let finalColor;
          if (areaColor.r < 255 || areaColor.g < 255 || areaColor.b < 255) {
            const blended = blendColors([drop.color, areaColor, areaColor]);
            finalColor = applyExponentialDecay(
              blended,
              drop.currentSaturationMultiplier,
            );
          } else {
            finalColor = applyExponentialDecay(
              drop.color,
              drop.currentSaturationMultiplier,
            );
          }
          finalColor = addColorNoise(finalColor);
          if (setPixelColor(x, y, finalColor, drop.id)) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                addToFrontier(drop, x + dx, y + dy);
              }
            }
          }
        }
        drop.frontier.delete(key);
        drop.frontierWeights.delete(key);
      }
      if (iteration % 10 === 0 && drop.frontier && drop.frontier.size > 0) {
        for (const [key, coords] of drop.frontier.entries()) {
          let [fx, fy] = coords;
          fx = Math.round(fx);
          fy = Math.round(fy);
          drop.frontierWeights.set(key, computeFrontierWeight(drop, fx, fy));
        }
      }
    });

    if (iteration % 3 === 0) {
      ctx.putImageData(img, 0, 0);
    }
    iteration++;
    if (iteration < MAX_ITERATIONS) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      ctx.putImageData(img, 0, 0);
      animationFrameId = null;
    }
  }

  animationFrameId = requestAnimationFrame(step);

  return {
    cancel: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
  };
}
