import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Machine, SweepResult } from '../../types';

/**
 * Seed source: reads the committed dataset snapshot at `data/seed/machines.json`.
 * This is the offline / resilience fallback — if the bulk mirror and the official
 * API are both unreachable, the project still ships with a known-good dataset.
 * Makes zero network requests.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.SEED_PATH ?? resolve(HERE, '../../../data/seed/machines.json');

export async function harvestSeed(): Promise<SweepResult> {
  const parsed = JSON.parse(await readFile(SEED_PATH, 'utf8')) as { machines?: Machine[] };
  const machines = parsed.machines ?? [];
  if (machines.length === 0) throw new Error(`Seed snapshot at ${SEED_PATH} has 0 machines`);
  return {
    machines,
    requestCount: 0,
    failedTiles: 0,
    source: `seed:${SEED_PATH}`,
  };
}
