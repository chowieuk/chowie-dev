/// <reference lib="webworker" />
import Prando from "prando";
import {
  BYTES_PER_PARTICLE,
  OFFSET_X,
  OFFSET_Y,
  OFFSET_R,
  OFFSET_G,
  OFFSET_B,
  type Color,
  type SimulationConfig,
} from "./dla.shared";

import { calculateCircularBounds } from "./shared";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

export type WorkerMessage =
  | { type: "BATCH"; buffer: ArrayBuffer; count: number }
  | { type: "DONE"; buffer: ArrayBuffer; count: number };

ctx.onmessage = (evt: MessageEvent<SimulationConfig>) => {
  const { width: w, height: h, seedX, seedY, seedColor, cacheId } = evt.data;

  const rng = new Prando(cacheId);

  // --- Data Structures ---
  // Uint8ClampedArray for neighbor color calculations (RGBA)
  const pixels = new Uint8ClampedArray(w * h * 4);
  // Uint8Array for fast 0/1 collision lookup
  const collisionGrid = new Uint8Array(w * h);

  // --- Helpers ---

  function paintPixel(x: number, y: number, c: Color) {
    const idx = y * w + x;
    collisionGrid[idx] = 1; // Mark occupied

    const pIdx = idx * 4;
    pixels[pIdx] = c.r;
    pixels[pIdx + 1] = c.g;
    pixels[pIdx + 2] = c.b;
    pixels[pIdx + 3] = 255;
  }

  function getNeighborColors(x: number, y: number): Color[] {
    const colors: Color[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        // Rectangular check is sufficient here as we only care if neighbors exist
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const idx = ny * w + nx;
          if (collisionGrid[idx]) {
            const pIdx = idx * 4;
            colors.push({
              r: pixels[pIdx],
              g: pixels[pIdx + 1],
              b: pixels[pIdx + 2],
            });
          }
        }
      }
    }
    return colors;
  }

  function generateColor(neighbors: Color[]): Color {
    if (neighbors.length === 0) {
      return {
        r: rng.next() * 255,
        g: rng.next() * 255,
        b: rng.next() * 255,
      };
    }

    let r = 0,
      g = 0,
      b = 0;
    for (const n of neighbors) {
      r += n.r;
      g += n.g;
      b += n.b;
    }
    r /= neighbors.length;
    g /= neighbors.length;
    b /= neighbors.length;

    const useSimilar = neighbors.length >= 3 || rng.next() < 0.98;
    const variation = useSimilar ? 3 : 20;
    const factor =
      neighbors.length >= 2 ? 1 / Math.pow(neighbors.length, 0.17) : 1;

    return {
      r:
        Math.min(255, Math.max(0, r + (rng.next() - 0.5) * variation * 2)) *
        factor,
      g:
        Math.min(255, Math.max(0, g + (rng.next() - 0.5) * variation * 2)) *
        factor,
      b:
        Math.min(255, Math.max(0, b + (rng.next() - 0.5) * variation * 2)) *
        factor,
    };
  }

  // --- Initialization & Bounds Setup ---

  // 1. Use the shared library to calculate geometric constants
  const bounds = calculateCircularBounds(w, h, seedX, seedY);

  // 2. Extract primitives for INLINING (Optimization)
  // We avoid calling bounds.isInBounds() inside the loop to save stack calls
  // and avoid the redundant Math.round() it performs.
  const { centerX, centerY, radiusSq, radius } = bounds;
  const cX = Math.floor(centerX);
  const cY = Math.floor(centerY);

  const MAX_PARTICLES = Math.floor(Math.PI * radiusSq) || 100;

  // Master buffer
  const masterBuffer = new ArrayBuffer(MAX_PARTICLES * BYTES_PER_PARTICLE);
  const masterView = new DataView(masterBuffer);
  let particleCount = 0;

  // Helper to check bounds (Inlined logic wrapper)
  // We check Rectangular bounds first (safety) then Circular (logic)
  const isSafeAndInBounds = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const dx = x - cX;
    const dy = y - cY;
    return dx * dx + dy * dy <= radiusSq;
  };

  // Seed
  if (isSafeAndInBounds(seedX, seedY)) {
    paintPixel(seedX, seedY, seedColor);

    const offset = 0;
    masterView.setUint16(offset + OFFSET_X, seedX);
    masterView.setUint16(offset + OFFSET_Y, seedY);
    masterView.setUint8(offset + OFFSET_R, seedColor.r);
    masterView.setUint8(offset + OFFSET_G, seedColor.g);
    masterView.setUint8(offset + OFFSET_B, seedColor.b);

    particleCount++;
  }

  let minX = seedX,
    maxX = seedX,
    minY = seedY,
    maxY = seedY;
  let fillPhaseActive = false;
  let batchStartIndex = 0;

  // --- Main Step Loop ---

  function step() {
    const startTime = performance.now();
    // Time budget ~16ms (60fps)
    const TIME_BUDGET = 16;

    while (
      particleCount < MAX_PARTICLES &&
      performance.now() - startTime < TIME_BUDGET
    ) {
      let walkerX = 0;
      let walkerY = 0;
      let spawned = false;

      // 1. Spawning Phase
      for (let i = 0; i < 20; i++) {
        if (!fillPhaseActive) {
          const rX = Math.max(Math.abs(seedX - minX), Math.abs(seedX - maxX));
          const rY = Math.max(Math.abs(seedY - minY), Math.abs(seedY - maxY));
          const aggRadius = Math.sqrt(rX * rX + rY * rY);

          if (aggRadius + 15 >= radius) {
            fillPhaseActive = true;
          } else {
            const angle = rng.next() * 2 * Math.PI;
            const dist = aggRadius + 15;
            walkerX = Math.floor((minX + maxX) / 2 + dist * Math.cos(angle));
            walkerY = Math.floor((minY + maxY) / 2 + dist * Math.sin(angle));
          }
        }

        if (fillPhaseActive) {
          const angle = rng.next() * 2 * Math.PI;
          const rad = radius * Math.sqrt(rng.next());
          walkerX = Math.floor(cX + rad * Math.cos(angle));
          walkerY = Math.floor(cY + rad * Math.sin(angle));
        }

        // Optimized Inline Check
        if (isSafeAndInBounds(walkerX, walkerY)) {
          const idx = walkerY * w + walkerX;
          if (collisionGrid[idx] === 0) {
            spawned = true;
            break;
          }
        }
      }

      if (!spawned) continue;

      // 2. Walking Phase
      let walked = 0;
      const MAX_STEPS = 3000;

      while (walked < MAX_STEPS) {
        // --- STEP 1: CHECK ADJACENCY (The Logic Fix) ---
        // We check the 3x3 grid around the CURRENT position (walkerX, walkerY)
        // strictly before we try to move.
        let isAdjacent = false;

        // Optimization: Only check collision grid if we are inside the
        // bounding box of the aggregate (plus a small margin)
        // This saves us doing 8 array lookups when the particle is far away.
        if (
          walkerX >= minX - 1 &&
          walkerX <= maxX + 1 &&
          walkerY >= minY - 1 &&
          walkerY <= maxY + 1
        ) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = walkerX + dx;
              const ny = walkerY + dy;
              // Bounds check + Collision check
              if (
                nx >= 0 &&
                nx < w &&
                ny >= 0 &&
                ny < h &&
                collisionGrid[ny * w + nx] === 1
              ) {
                isAdjacent = true;
                break;
              }
            }
            if (isAdjacent) break;
          }
        }

        // --- STEP 2: STICK OR MOVE ---

        if (isAdjacent) {
          // 1. Calculate Color based on neighbors
          const neighbors = getNeighborColors(walkerX, walkerY);
          const color = generateColor(neighbors);

          // 2. Paint to buffers
          paintPixel(walkerX, walkerY, color);
          const offset = particleCount * BYTES_PER_PARTICLE;
          masterView.setUint16(offset + OFFSET_X, walkerX);
          masterView.setUint16(offset + OFFSET_Y, walkerY);
          masterView.setUint8(offset + OFFSET_R, color.r);
          masterView.setUint8(offset + OFFSET_G, color.g);
          masterView.setUint8(offset + OFFSET_B, color.b);

          // 3. Update Bounds
          minX = Math.min(minX, walkerX);
          maxX = Math.max(maxX, walkerX);
          minY = Math.min(minY, walkerY);
          maxY = Math.max(maxY, walkerY);

          particleCount++;
          break; // Stop this particle
        }

        // --- STEP 3: MOVE (Only if not stuck) ---
        const dx = Math.floor(rng.next() * 3) - 1;
        const dy = Math.floor(rng.next() * 3) - 1;

        if (dx === 0 && dy === 0) {
          walked++;
          continue;
        }

        const nextX = walkerX + dx;
        const nextY = walkerY + dy;

        // Check bounds for the move
        if (isSafeAndInBounds(nextX, nextY)) {
          walkerX = nextX;
          walkerY = nextY;
        }

        walked++;
      }
    }

    // 3. Batch Flush
    const particlesInBatch = particleCount - batchStartIndex;
    if (particlesInBatch > 0) {
      const batchSlice = masterBuffer.slice(
        batchStartIndex * BYTES_PER_PARTICLE,
        particleCount * BYTES_PER_PARTICLE,
      );

      const msg: WorkerMessage = {
        type: "BATCH",
        buffer: batchSlice,
        count: particlesInBatch,
      };
      ctx.postMessage(msg, [batchSlice]);
      batchStartIndex = particleCount;
    }

    // 4. Reschedule
    if (particleCount < MAX_PARTICLES) {
      setTimeout(step, 0);
    } else {
      const finalBuffer = masterBuffer.slice(
        0,
        particleCount * BYTES_PER_PARTICLE,
      );
      const msg: WorkerMessage = {
        type: "DONE",
        buffer: finalBuffer,
        count: particleCount,
      };
      ctx.postMessage(msg, [finalBuffer]);
    }
  }

  step();
};
