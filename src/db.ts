import Dexie, { Table } from 'dexie';
import { SimulationResult } from './sim/types';

export interface SavedSimulation {
  id: string;
  name: string;
  created_at: string;
  data: SimulationResult;
}

class CasinoSimDB extends Dexie {
  simulations!: Table<SavedSimulation, string>;

  constructor() {
    super('casino-sim');
    this.version(1).stores({
      simulations: 'id, name, created_at',
    });
  }
}

export const db = new CasinoSimDB();
