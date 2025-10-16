export const GOLDEN_RATIO_CONJUGATE = 0.618033;

/**
 * Calculates the parameters for a centered circular boundary.
 *
 * This function determines the largest possible circle that can be centered
 * at the seed point without touching the canvas edges, and then scales it
 * by the golden ratio for aesthetic spacing.
 *
 * It returns not only the dimensions but also a convenient `isInBounds`
 * closure that captures these dimensions, simplifying its use in algorithms.
 *
 * @param {number} canvasWidth The width of the canvas.
 * @param {number} canvasHeight The height of the canvas.
 * @param {number} seedX The X coordinate of the circle's center.
 * @param {number} seedY The Y coordinate of the circle's center.
 * @returns {{
 *   centerX: number,
 *   centerY: number,
 *   radius: number,
 *   radiusSq: number,
 *   isInBounds: (x: number, y: number) => boolean
 * }} An object containing the circle's properties and a bounds-checking function.
 */
export function calculateCircularBounds(
  canvasWidth,
  canvasHeight,
  seedX,
  seedY,
) {
  const centerX = seedX;
  const centerY = seedY;

  const radius =
    Math.min(seedX, canvasWidth - seedX, seedY, canvasHeight - seedY) *
    GOLDEN_RATIO_CONJUGATE;

  const radiusSq = radius * radius;

  /**
   * Checks if a point is within the calculated circular boundary.
   * Coordinates are rounded to ensure consistent grid-based checking.
   */
  function isInBounds(x, y) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const dx = rx - centerX;
    const dy = ry - centerY;
    return dx * dx + dy * dy <= radiusSq;
  }

  return { centerX, centerY, radius, radiusSq, isInBounds };
}
