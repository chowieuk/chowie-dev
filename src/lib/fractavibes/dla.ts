import { db, type Color } from "./db";
import {
  BYTES_PER_PARTICLE,
  OFFSET_X,
  OFFSET_Y,
  OFFSET_R,
  OFFSET_G,
  OFFSET_B,
} from "./dla.shared";

// Import worker using Vite/Webpack syntax
import DLAWorker from "./dla.worker?worker";
import type { WorkerMessage } from "./dla.worker";

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
  const cacheId = `dla_v3_${w}_${h}_${seedX}_${seedY}_${safeSeedColor.r}-${safeSeedColor.g}-${safeSeedColor.b}`;

  let animationFrameId: number | null = null;
  let worker: Worker | null = null;
  let isCancelled = false;

  ctx.clearRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);

  // --- Canvas Helpers ---
  function paintPixel(x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    img.data[idx] = r;
    img.data[idx + 1] = g;
    img.data[idx + 2] = b;
    img.data[idx + 3] = 255;
  }

  function clearPixel(x: number, y: number) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = (y * w + x) * 4;
    img.data[idx + 3] = 0;
  }

  function flush() {
    ctx.putImageData(img, 0, 0);
  }

  // --- DataView Renderer (Draws from Binary) ---
  // This is used by both the Worker-Stream and the Boomerang
  function drawBatchFromBuffer(buffer: ArrayBuffer, count: number) {
    const view = new DataView(buffer);
    for (let i = 0; i < count; i++) {
      const offset = i * BYTES_PER_PARTICLE;
      const x = view.getUint16(offset + OFFSET_X);
      const y = view.getUint16(offset + OFFSET_Y);
      const r = view.getUint8(offset + OFFSET_R);
      const g = view.getUint8(offset + OFFSET_G);
      const b = view.getUint8(offset + OFFSET_B);
      paintPixel(x, y, r, g, b);
    }
    flush();
  }

  // --- Mode 1: Worker Computation ---
  function startWorker() {
    worker = new DLAWorker();

    // Configure Worker
    worker.postMessage({
      width: w,
      height: h,
      seedX,
      seedY,
      seedColor: safeSeedColor,
      cacheId,
    });

    // Listen for updates
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (isCancelled) return;
      const { type, buffer, count } = e.data;

      if (type === "BATCH") {
        // Draw the realtime progress
        drawBatchFromBuffer(buffer, count);
      } else if (type === "DONE") {
        // 1. Draw final bits just in case
        drawBatchFromBuffer(buffer, count);

        // 2. Save Binary to DB
        db.simulations
          .add({
            id: cacheId,
            buffer: buffer, // This is the full ArrayBuffer
            count: count,
            timestamp: Date.now(),
          })
          .catch((err) => console.error("DB Save failed", err));

        // 3. Switch to Boomerang Mode
        runBoomerangMode(buffer, count);

        // 4. Cleanup
        worker?.terminate();
        worker = null;
      }
    };
  }

  // --- Mode 2: Boomerang (Binary Playback) ---
  function runBoomerangMode(buffer: ArrayBuffer, totalCount: number) {
    const view = new DataView(buffer);
    let currentIndex = 0;
    let direction = 1; // 1 = build, -1 = erase
    const SPEED = 500; // particles per frame

    function frame() {
      if (isCancelled) return;

      for (let k = 0; k < SPEED; k++) {
        if (direction === 1) {
          if (currentIndex >= totalCount) {
            direction = -1;
            currentIndex = totalCount - 1;
          } else {
            const offset = currentIndex * BYTES_PER_PARTICLE;
            const x = view.getUint16(offset + OFFSET_X);
            const y = view.getUint16(offset + OFFSET_Y);
            const r = view.getUint8(offset + OFFSET_R);
            const g = view.getUint8(offset + OFFSET_G);
            const b = view.getUint8(offset + OFFSET_B);
            paintPixel(x, y, r, g, b);
            currentIndex++;
          }
        } else {
          if (currentIndex < 0) {
            direction = 1;
            currentIndex = 0;
          } else {
            const offset = currentIndex * BYTES_PER_PARTICLE;
            const x = view.getUint16(offset + OFFSET_X);
            const y = view.getUint16(offset + OFFSET_Y);
            clearPixel(x, y);
            currentIndex--;
          }
        }
      }

      flush();
      animationFrameId = requestAnimationFrame(frame);
    }

    animationFrameId = requestAnimationFrame(frame);
  }

  // --- Initialization ---
  (async () => {
    try {
      const cached = await db.simulations.get(cacheId);

      if (isCancelled) return;

      if (cached) {
        // Cache Hit: Zero calculation, instant binary playback
        console.log("DLA Cache Hit (Binary)");
        runBoomerangMode(cached.buffer, cached.count);
      } else {
        // Cache Miss: Offload to Worker
        console.log("DLA Cache Miss - Starting Worker");
        startWorker();
      }
    } catch (e) {
      console.error("Error loading DLA", e);
      startWorker(); // Fallback
    }
  })();

  return {
    cancel: () => {
      isCancelled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (worker) worker.terminate();
    },
  };
}
