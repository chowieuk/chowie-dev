import { calculateCircularBounds } from "./shared";

// --- Types ---
interface MazeStep {
  x: number;
  y: number;
}

interface GeneratorContext {
  grid: Uint8Array;
  gridCols: number;
  gridRows: number;
  steps: MazeStep[];
  safeStartX: number;
  safeStartY: number;
  isValidInCircle: (x: number, y: number) => boolean;
  getIndex: (x: number, y: number) => number;
  getNeighbor: (
    x: number,
    y: number,
    dir: number,
  ) => { nx: number; ny: number; wx: number; wy: number };
}

type MazeAlgorithm = (ctx: GeneratorContext) => void;

// --- Algorithms ---

const generateRecursiveBacktracker: MazeAlgorithm = ({
  grid,
  steps,
  safeStartX,
  safeStartY,
  isValidInCircle,
  getIndex,
  getNeighbor,
}) => {
  const stack = [{ x: safeStartX, y: safeStartY }];
  grid[getIndex(safeStartX, safeStartY)] = 0;
  steps.push({ x: safeStartX, y: safeStartY });

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    let found = false;

    for (const dir of dirs) {
      const { nx, ny, wx, wy } = getNeighbor(current.x, current.y, dir);
      const idx = getIndex(nx, ny);

      if (idx !== -1 && grid[idx] === 1 && isValidInCircle(nx, ny)) {
        grid[idx] = 0;
        grid[getIndex(wx, wy)] = 0;
        steps.push({ x: wx, y: wy });
        steps.push({ x: nx, y: ny });
        stack.push({ x: nx, y: ny });
        found = true;
        break;
      }
    }
    if (!found) stack.pop();
  }
};

const generateWilsons: MazeAlgorithm = ({
  grid,
  gridCols,
  gridRows,
  steps,
  safeStartX,
  safeStartY,
  isValidInCircle,
  getIndex,
  getNeighbor,
}) => {
  // 1. Gather valid unvisited coordinates
  const validCells: { x: number; y: number }[] = [];
  for (let y = 1; y < gridRows; y += 2) {
    for (let x = 1; x < gridCols; x += 2) {
      if (isValidInCircle(x, y)) validCells.push({ x, y });
    }
  }
  validCells.sort(() => Math.random() - 0.5); // Shuffle
  if (!validCells.length) return;

  // 2. Seed the maze
  grid[getIndex(safeStartX, safeStartY)] = 0;
  steps.push({ x: safeStartX, y: safeStartY });

  const walkDir = new Int8Array(gridCols * gridRows).fill(-1);

  // 3. Process cells
  for (const startCell of validCells) {
    let idx = getIndex(startCell.x, startCell.y);
    if (grid[idx] === 0) continue;

    // Loop-Erased Random Walk
    let cx = startCell.x;
    let cy = startCell.y;

    while (true) {
      const cIdx = getIndex(cx, cy);
      const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      let moved = false;

      for (const dir of dirs) {
        const { nx, ny } = getNeighbor(cx, cy, dir);
        if (getIndex(nx, ny) !== -1 && isValidInCircle(nx, ny)) {
          walkDir[cIdx] = dir;
          cx = nx;
          cy = ny;
          moved = true;
          break;
        }
      }
      if (grid[getIndex(cx, cy)] === 0) break; // Hit maze
      if (!moved) break;
    }

    // Carve path
    cx = startCell.x;
    cy = startCell.y;
    while (grid[getIndex(cx, cy)] === 1) {
      const cIdx = getIndex(cx, cy);
      const dir = walkDir[cIdx];
      if (dir === -1) break;

      const { nx, ny, wx, wy } = getNeighbor(cx, cy, dir);
      grid[cIdx] = 0;
      grid[getIndex(wx, wy)] = 0;
      steps.push({ x: cx, y: cy });
      steps.push({ x: wx, y: wy });
      cx = nx;
      cy = ny;
    }
  }
};

const generatePrims: MazeAlgorithm = ({
  grid,
  steps,
  safeStartX,
  safeStartY,
  isValidInCircle,
  getIndex,
  getNeighbor,
}) => {
  // Frontier: Set of coordinates (x,y) that are WALLS but adjacent to PATH
  const frontier: { x: number; y: number }[] = [];

  // Helper to add valid neighbors to frontier
  const addNeighbors = (x: number, y: number) => {
    for (let dir = 0; dir < 4; dir++) {
      const { nx, ny } = getNeighbor(x, y, dir);
      const idx = getIndex(nx, ny);
      // If valid, inside circle, is a Wall, and not already in frontier (optimization optional but good)
      if (idx !== -1 && grid[idx] === 1 && isValidInCircle(nx, ny)) {
        // We cheat a bit on duplicate checks for performance;
        // we'll just check grid state when popping.
        frontier.push({ x: nx, y: ny });
      }
    }
  };

  // Initialize
  grid[getIndex(safeStartX, safeStartY)] = 0;
  steps.push({ x: safeStartX, y: safeStartY });
  addNeighbors(safeStartX, safeStartY);

  while (frontier.length > 0) {
    // Pick random cell from frontier
    const randIdx = Math.floor(Math.random() * frontier.length);
    const { x, y } = frontier[randIdx];

    // Efficient remove (swap with end and pop)
    frontier[randIdx] = frontier[frontier.length - 1];
    frontier.pop();

    const currentIdx = getIndex(x, y);

    // If it was already carved by another neighbor, skip
    if (grid[currentIdx] === 0) continue;

    // Find neighbors that are part of the Maze
    const inMazeNeighbors: number[] = []; // Store directions
    for (let dir = 0; dir < 4; dir++) {
      const { nx, ny } = getNeighbor(x, y, dir);
      const nIdx = getIndex(nx, ny);
      if (nIdx !== -1 && grid[nIdx] === 0) {
        inMazeNeighbors.push(dir);
      }
    }

    if (inMazeNeighbors.length > 0) {
      // Connect to a random existing neighbor
      const dir =
        inMazeNeighbors[Math.floor(Math.random() * inMazeNeighbors.length)];
      const { wx, wy } = getNeighbor(x, y, dir);

      grid[currentIdx] = 0;
      grid[getIndex(wx, wy)] = 0;

      steps.push({ x: wx, y: wy });
      steps.push({ x, y });

      addNeighbors(x, y);
    }
  }
};

const generateHuntAndKill: MazeAlgorithm = ({
  grid,
  gridCols,
  gridRows,
  steps,
  safeStartX,
  safeStartY,
  isValidInCircle,
  getIndex,
  getNeighbor,
}) => {
  let current = { x: safeStartX, y: safeStartY };
  grid[getIndex(current.x, current.y)] = 0;
  steps.push({ x: current.x, y: current.y });

  while (current) {
    // 1. Walk Phase (Same as Backtracker but without stack history)
    const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    let foundMove = false;

    for (const dir of dirs) {
      const { nx, ny, wx, wy } = getNeighbor(current.x, current.y, dir);
      const idx = getIndex(nx, ny);
      if (idx !== -1 && grid[idx] === 1 && isValidInCircle(nx, ny)) {
        grid[idx] = 0;
        grid[getIndex(wx, wy)] = 0;
        steps.push({ x: wx, y: wy });
        steps.push({ x: nx, y: ny });
        current = { x: nx, y: ny };
        foundMove = true;
        break;
      }
    }

    if (foundMove) continue;

    // 2. Hunt Phase
    // Scan grid for a cell that is a Wall (1) but adjacent to a Path (0)
    let hunted = false;

    // We scan top-left to bottom-right (creates the distinct "texture" of H&K)
    // You can randomize the scan order for a different look, but standard is linear.
    for (let y = 1; y < gridRows; y += 2) {
      for (let x = 1; x < gridCols; x += 2) {
        const idx = getIndex(x, y);

        // If unvisited and valid
        if (grid[idx] === 1 && isValidInCircle(x, y)) {
          // Check if it has a visited neighbor
          const neighbors = [0, 1, 2, 3];
          // Optional: shuffle neighbors to avoid directional bias in connection
          neighbors.sort(() => Math.random() - 0.5);

          for (const dir of neighbors) {
            const { nx, ny, wx, wy } = getNeighbor(x, y, dir);
            const nIdx = getIndex(nx, ny);

            if (nIdx !== -1 && grid[nIdx] === 0) {
              // Found a connection point!
              grid[idx] = 0;
              grid[getIndex(wx, wy)] = 0;

              // Note: Hunt & Kill "teleports".
              // Visually, we just start drawing at the new spot.
              steps.push({ x: wx, y: wy });
              steps.push({ x, y });

              current = { x, y };
              hunted = true;
              break;
            }
          }
        }
        if (hunted) break;
      }
      if (hunted) break;
    }

    // If we scanned the whole grid and found nothing, we are done.
    if (!hunted) break;
  }
};

// --- Main Function ---

export function runMaze(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
) {
  // --- Config ---
  const CELL_SIZE = 12;
  const FORWARD_SPEED = 1;
  const REVERSE_SPEED = 2;
  const WALL_COLOR = "rgba(20, 20, 20, 0.95)";
  const PATH_COLOR = "rgba(255, 255, 255, 0.9)";

  // --- Rotation ---
  const ALGORITHMS = [
    generateRecursiveBacktracker,
    generatePrims,
    generateWilsons,
    generateHuntAndKill,
  ];
  let currentAlgoIndex = 0;

  // --- Grid Setup ---
  let gridCols = Math.floor(canvasWidth / CELL_SIZE);
  let gridRows = Math.floor(canvasHeight / CELL_SIZE);
  if (gridCols % 2 === 0) gridCols--;
  if (gridRows % 2 === 0) gridRows--;

  const startX = Math.floor(gridCols / 2);
  const startY = Math.floor(gridRows / 2);
  const safeStartX = startX % 2 === 0 ? startX + 1 : startX;
  const safeStartY = startY % 2 === 0 ? startY + 1 : startY;

  const grid = new Uint8Array(gridCols * gridRows);

  // --- Helpers ---
  const { isInBounds, radius: mazeRadius } = calculateCircularBounds(
    canvasWidth,
    canvasHeight,
    canvasWidth / 2,
    canvasHeight / 2,
  );

  const getIndex = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= gridCols || y >= gridRows) return -1;
    return y * gridCols + x;
  };

  const isValidInCircle = (gx: number, gy: number) => {
    const px = gx * CELL_SIZE + CELL_SIZE / 2;
    const py = gy * CELL_SIZE + CELL_SIZE / 2;
    return isInBounds(px, py);
  };

  const getNeighbor = (x: number, y: number, dir: number) => {
    let nx = x,
      ny = y,
      wx = x,
      wy = y;
    if (dir === 0) {
      ny -= 2;
      wy -= 1;
    } // Up
    if (dir === 1) {
      nx += 2;
      wx += 1;
    } // Right
    if (dir === 2) {
      ny += 2;
      wy += 1;
    } // Down
    if (dir === 3) {
      nx -= 2;
      wx -= 1;
    } // Left
    return { nx, ny, wx, wy };
  };

  // --- State ---
  const steps: MazeStep[] = [];
  let animationFrameId: number | null = null;
  let isCancelled = false;
  let currentIndex = 0;
  let direction = 1;

  // --- Computation ---
  function computeMaze() {
    grid.fill(1);
    steps.length = 0;

    const generator = ALGORITHMS[currentAlgoIndex];

    generator({
      grid,
      gridCols,
      gridRows,
      steps,
      safeStartX,
      safeStartY,
      isValidInCircle,
      getIndex,
      getNeighbor,
    });

    currentAlgoIndex = (currentAlgoIndex + 1) % ALGORITHMS.length;
  }

  // --- Drawing ---
  function drawStep(step: MazeStep, isReversing: boolean) {
    const { x, y } = step;
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;

    if (isReversing) {
      ctx.clearRect(px, py, CELL_SIZE, CELL_SIZE);
      ctx.fillStyle = WALL_COLOR;
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
    } else {
      ctx.fillStyle = PATH_COLOR;
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
    }
  }

  function initBaseLayer() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = WALL_COLOR;
    ctx.beginPath();
    // We use the radius derived from GOLDEN_RATIO_CONJUGATE.
    // Adding +2 ensures the smooth matte background fully encapsulates
    // the jagged corners of the theoretical grid boundary.
    ctx.arc(canvasWidth / 2, canvasHeight / 2, mazeRadius + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Loop ---
  function startNewCycle() {
    initBaseLayer();
    computeMaze();
    currentIndex = 0;
    direction = 1;
  }

  function loop() {
    if (isCancelled) return;

    const currentSpeed = direction === 1 ? FORWARD_SPEED : REVERSE_SPEED;

    for (let i = 0; i < currentSpeed; i++) {
      if (direction === 1) {
        if (currentIndex < steps.length) {
          drawStep(steps[currentIndex], false);
          currentIndex++;
        } else {
          direction = -1;
          currentIndex = steps.length - 1;
        }
      } else {
        if (currentIndex >= 0) {
          drawStep(steps[currentIndex], true);
          currentIndex--;
        } else {
          startNewCycle();
          break;
        }
      }
    }
    animationFrameId = requestAnimationFrame(loop);
  }

  // --- Init ---
  startNewCycle();
  animationFrameId = requestAnimationFrame(loop);

  return {
    cancel: () => {
      isCancelled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    },
  };
}
