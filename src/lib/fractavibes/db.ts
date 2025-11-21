import Dexie, { type Table } from "dexie";

export interface Color {
  r: number;
  g: number;
  b: number;
}

export interface SimulationCache {
  id: string;
  buffer: ArrayBuffer; // Storing raw binary data
  count: number; // Number of particles
  timestamp: number;
}

class DLADatabase extends Dexie {
  simulations!: Table<SimulationCache>;

  constructor() {
    super("DLADatabase");
    // Version 2: buffer storage
    this.version(2).stores({
      simulations: "id",
    });
  }
}

export const db = new DLADatabase();
