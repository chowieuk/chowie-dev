export interface Color {
  r: number;
  g: number;
  b: number;
}

export interface SimulationConfig {
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  seedColor: Color;
  cacheId: string;
}

// --- Binary Format Constants ---
// Layout: [X(2 bytes), Y(2 bytes), R(1), G(1), B(1)]
export const BYTES_PER_PARTICLE = 7;
export const OFFSET_X = 0;
export const OFFSET_Y = 2;
export const OFFSET_R = 4;
export const OFFSET_G = 5;
export const OFFSET_B = 6;
