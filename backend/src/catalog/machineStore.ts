import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Machine } from '../types';
import {
  boundsOf,
  expandBounds,
  haversineMeters,
  inBounds,
  pointToPolylineMeters,
  type LngLat,
} from '../geo/geo';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_PATH = process.env.HARVEST_OUT ?? resolve(HERE, '../../data/machines.json');
const SEED_PATH = process.env.SEED_PATH ?? resolve(HERE, '../../data/seed/machines.json');

export const machineLngLat = (m: Machine): LngLat => [m.lng, m.lat];

/** A machine paired with its distance (meters) from a query reference. */
export interface MachineHit {
  machine: Machine;
  distanceMeters: number;
}

/**
 * In-memory catalog of vending machines with the spatial queries the corridor
 * planner needs. A linear scan over ~2k points is sub-millisecond, so this
 * intentionally avoids a DB dependency; the PostGIS loader remains available for
 * when the dataset or query volume grows.
 */
export class MachineStore {
  private constructor(readonly machines: Machine[]) {}

  get size(): number {
    return this.machines.length;
  }

  /** Load from the live harvest snapshot, falling back to the committed seed. */
  static async load(): Promise<MachineStore> {
    const path = existsSync(LIVE_PATH) ? LIVE_PATH : SEED_PATH;
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { machines?: Machine[] };
    return new MachineStore(parsed.machines ?? []);
  }

  /** Build a store from an explicit list (used in tests). */
  static fromMachines(machines: Machine[]): MachineStore {
    return new MachineStore(machines);
  }

  /** Machines within `radiusMeters` of a point, nearest first. */
  near(center: { lat: number; lng: number }, radiusMeters: number, limit = 50): MachineHit[] {
    const c: LngLat = [center.lng, center.lat];
    const hits: MachineHit[] = [];
    for (const machine of this.machines) {
      const distanceMeters = haversineMeters(c, machineLngLat(machine));
      if (distanceMeters <= radiusMeters) hits.push({ machine, distanceMeters });
    }
    hits.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return hits.slice(0, limit);
  }

  /**
   * Machines whose distance to the route polyline is within `widthMeters`.
   * A bounding-box prefilter keeps the precise point-to-polyline test off the
   * vast majority of points.
   */
  withinCorridor(line: readonly LngLat[], widthMeters: number): MachineHit[] {
    if (line.length === 0) return [];
    const box = expandBounds(boundsOf(line), widthMeters);
    const hits: MachineHit[] = [];
    for (const machine of this.machines) {
      const p = machineLngLat(machine);
      if (!inBounds(p, box)) continue;
      const distanceMeters = pointToPolylineMeters(p, line);
      if (distanceMeters <= widthMeters) hits.push({ machine, distanceMeters });
    }
    hits.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return hits;
  }
}
