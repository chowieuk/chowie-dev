// https://github.com/chrisloy/fractavibes
import { calculateCircularBounds } from "./shared";

export function runSpiral(ctx, canvasWidth, canvasHeight, seedX, seedY) {
  const w = canvasWidth;
  const h = canvasHeight;
  ctx.clearRect(0, 0, w, h);

  const { radius: circleRadius } = calculateCircularBounds(
    canvasWidth,
    canvasHeight,
    seedX,
    seedY,
  );

  const img = ctx.getImageData(0, 0, w, h);

  const paintedMask = Array(h)
    .fill(null)
    .map(() => Array(w).fill(false)); // Tracks algorithm-painted pixels

  const PIXELS_PER_ANIMATION_FRAME = 300; // Number of pixels to paint per screen refresh
  const MAX_HUE_RANDOM_STEP = 90; // Max change in hue (degrees) from one pixel to the next
  const MAX_SATURATION_RANDOM_STEP = 0.3; // Max change in saturation (0-1)
  const MAX_LIGHTNESS_RANDOM_STEP = 0.3; // Max change in lightness (0-1)

  const MIN_NEIGHBOR_INFLUENCE_WEIGHT = 0.1;
  const MAX_NEIGHBOR_INFLUENCE_WEIGHT = 0.9; // Max influence from neighbors
  const MIN_INFLUENCE_WEIGHT_DRIFT_RATE = 0.002; // Min for how much influence weight changes per pixel
  const MAX_INFLUENCE_WEIGHT_DRIFT_RATE = 0.02; // Max for how much influence weight changes per pixel
  const RATE_OSCILLATION_PER_PIXEL = 0.00005; // How much the drift rate itself changes per pixel

  let pixelsToPaintOrder = [];
  let currentPixelIndex = 0;

  let currentPaintHue = Math.random() * 360; // Initial hue
  let currentPaintSaturation = 0.7 + Math.random() * 0.2; // Initial saturation (0.7-0.9)
  let currentPaintLightness = 0.5 + Math.random() * 0.2; // Initial lightness (0.5-0.7)
  let currentNeighborInfluenceWeight =
    (MIN_NEIGHBOR_INFLUENCE_WEIGHT + MAX_NEIGHBOR_INFLUENCE_WEIGHT) / 2;
  let currentInfluenceWeightDriftRate =
    (MIN_INFLUENCE_WEIGHT_DRIFT_RATE + MAX_INFLUENCE_WEIGHT_DRIFT_RATE) / 2;

  // 1. Pre-calculate pixel order
  const allPixels = [];
  if (seedX >= 0 && seedX < w && seedY >= 0 && seedY < h) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - seedX;
        const dy = y - seedY;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius > circleRadius) continue;
        // Normalize angle to [0, 2*PI) for consistent sorting
        let angle = Math.atan2(dy, dx);
        if (angle < 0) {
          angle += 2 * Math.PI;
        }
        allPixels.push({ x, y, radius, angle });
      }
    }

    // Sort pixels: primarily by radius, secondarily by angle
    allPixels.sort((a, b) => {
      if (a.radius < b.radius) return -1;
      if (a.radius > b.radius) return 1;
      // If radii are equal (or very close for float precision), sort by angle
      if (a.angle < b.angle) return -1;
      if (a.angle > b.angle) return 1;
      return 0;
    });

    pixelsToPaintOrder = allPixels.map((p) => [p.x, p.y]);
  } else {
    console.error("Spiral seed is out of bounds. Cannot generate pixel order.");
    return null; // Cannot proceed
  }

  const totalPixelsToPaint = pixelsToPaintOrder.length;

  let animationFrameId = null;

  function hslToRgb(h_deg, s, l) {
    // h_deg is 0-360, s and l are 0-1
    const h_norm = h_deg / 360; // Normalize h to 0-1 for the formula
    let r, g, b;
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hueToRgbInternal = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hueToRgbInternal(p, q, h_norm + 1 / 3);
      g = hueToRgbInternal(p, q, h_norm);
      b = hueToRgbInternal(p, q, h_norm - 1 / 3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  function rgbToHsl(r_byte, g_byte, b_byte) {
    const r = r_byte / 255,
      g = g_byte / 255,
      b = b_byte / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;
    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: h * 360, s: s, l: l };
  }

  function paintPixelToBuffer(px, py, color) {
    const idx = (py * w + px) * 4;
    img.data[idx] = color.r;
    img.data[idx + 1] = color.g;
    img.data[idx + 2] = color.b;
    img.data[idx + 3] = 255; // Alpha
    paintedMask[py][px] = true; // Mark this pixel as painted by the algorithm
  }

  function animationStep() {
    let paintedThisFrameCount = 0;
    for (
      let i = 0;
      i < PIXELS_PER_ANIMATION_FRAME && currentPixelIndex < totalPixelsToPaint;
      i++
    ) {
      const [px, py] = pixelsToPaintOrder[currentPixelIndex];

      // Update the drift rate for the influence weight
      const rateOscillation =
        (Math.random() - 0.5) * RATE_OSCILLATION_PER_PIXEL * 2;
      currentInfluenceWeightDriftRate += rateOscillation;
      currentInfluenceWeightDriftRate = Math.max(
        MIN_INFLUENCE_WEIGHT_DRIFT_RATE,
        Math.min(
          MAX_INFLUENCE_WEIGHT_DRIFT_RATE,
          currentInfluenceWeightDriftRate,
        ),
      );

      // Update neighbor influence weight using the current (drifting) drift rate
      const weightDrift =
        (Math.random() - 0.5) * currentInfluenceWeightDriftRate * 2;
      currentNeighborInfluenceWeight += weightDrift;
      currentNeighborInfluenceWeight = Math.max(
        MIN_NEIGHBOR_INFLUENCE_WEIGHT,
        Math.min(MAX_NEIGHBOR_INFLUENCE_WEIGHT, currentNeighborInfluenceWeight),
      );

      // 1. Candidate color from Random Walk (based on previous pixel's final color)
      let candidateH = currentPaintHue;
      let candidateS = currentPaintSaturation;
      let candidateL = currentPaintLightness;

      if (currentPixelIndex > 0 || totalPixelsToPaint === 1) {
        // Apply random step if not the very first pixel of all, or if it's the only pixel
        const hueStep = (Math.random() - 0.5) * MAX_HUE_RANDOM_STEP;
        candidateH = currentPaintHue + hueStep;

        const saturationStep =
          (Math.random() - 0.5) * MAX_SATURATION_RANDOM_STEP;
        candidateS = currentPaintSaturation + saturationStep;
        candidateS = Math.max(0, Math.min(1, candidateS));

        const lightnessStep = (Math.random() - 0.5) * MAX_LIGHTNESS_RANDOM_STEP;
        candidateL = currentPaintLightness + lightnessStep;
        candidateL = Math.max(0, Math.min(1, candidateL));
      }
      candidateH = ((candidateH % 360) + 360) % 360;

      // 2. Get Average HSL of Painted Neighbors
      const neighborColorsHSL = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            // Use paintedMask to check if neighbor was painted by the algorithm
            if (paintedMask[ny][nx]) {
              const nIdx = (ny * w + nx) * 4;
              neighborColorsHSL.push(
                rgbToHsl(
                  img.data[nIdx],
                  img.data[nIdx + 1],
                  img.data[nIdx + 2],
                ),
              );
            }
          }
        }
      }

      let finalH = candidateH;
      let finalS = candidateS;
      let finalL = candidateL;

      if (neighborColorsHSL.length > 0 && currentNeighborInfluenceWeight > 0) {
        let sumS = 0,
          sumL = 0,
          sumVecX = 0,
          sumVecY = 0;
        neighborColorsHSL.forEach((c) => {
          sumS += c.s;
          sumL += c.l;
          const angleRad = (c.h * Math.PI) / 180;
          sumVecX += Math.cos(angleRad);
          sumVecY += Math.sin(angleRad);
        });
        const avgNeighborS = sumS / neighborColorsHSL.length;
        const avgNeighborL = sumL / neighborColorsHSL.length;
        const avgNeighborH =
          ((Math.atan2(sumVecY, sumVecX) * 180) / Math.PI + 360) % 360;

        // Blend Hue (circularly aware)
        let h1 = candidateH;
        let h2 = avgNeighborH;
        let diff = h2 - h1;
        if (diff > 180) h2 -= 360;
        else if (diff < -180) h2 += 360;
        finalH =
          h1 * (1 - currentNeighborInfluenceWeight) +
          h2 * currentNeighborInfluenceWeight;
        finalH = ((finalH % 360) + 360) % 360;

        finalS =
          candidateS * (1 - currentNeighborInfluenceWeight) +
          avgNeighborS * currentNeighborInfluenceWeight;
        finalL =
          candidateL * (1 - currentNeighborInfluenceWeight) +
          avgNeighborL * currentNeighborInfluenceWeight;

        finalS = Math.max(0, Math.min(1, finalS));
        finalL = Math.max(0, Math.min(1, finalL));
      }

      // Update currentPaint* for the next iteration's random walk base
      currentPaintHue = finalH;
      currentPaintSaturation = finalS;
      currentPaintLightness = finalL;

      paintPixelToBuffer(px, py, hslToRgb(finalH, finalS, finalL));
      currentPixelIndex++;
      paintedThisFrameCount++;
    }

    ctx.putImageData(img, 0, 0);

    if (currentPixelIndex < totalPixelsToPaint) {
      animationFrameId = requestAnimationFrame(animationStep);
    } else {
      // console.log("Spiral finished.");
      animationFrameId = null; // stop
    }
  }

  animationStep();
  return {
    cancel: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
  };
}
