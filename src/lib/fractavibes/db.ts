import Dexie, { type Table } from "dexie";

export interface Color {
  r: number;
  g: number;
  b: number;
}

export interface ParticleStep {
  x: number;
  y: number;
  color: Color;
}

export interface SimulationCache {
  id: string;
  steps: ParticleStep[];
  timestamp: number;
}

class DLADatabase extends Dexie {
  simulations!: Table<SimulationCache>;

  constructor() {
    super("DLADatabase");
    this.version(1).stores({
      simulations: "id", // Primary key
    });
  }
}

export const db = new DLADatabase();
