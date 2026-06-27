import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Machine, SweepResult } from '../types';
import { harvestOfficialApi } from './sources/apiSweep';
import { harvestBulk } from './sources/bulk';
import { harvestSeed } from './sources/seed';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = process.env.HARVEST_OUT ?? resolve(HERE, '../../data/machines.json');

type SourceName = 'bulk' | 'api' | 'seed';

const SOURCES: Record<SourceName, () => Promise<SweepResult>> = {
  bulk: harvestBulk,
  api: harvestOfficialApi,
  seed: harvestSeed,
};

function selectedSource(): SourceName {
  const arg = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];
  const name = (arg ?? process.env.HARVEST_SOURCE ?? 'bulk').toLowerCase();
  if (name === 'bulk' || name === 'api' || name === 'seed') return name;
  throw new Error(`Unknown source "${name}". Use --source=bulk, --source=api, or --source=seed.`);
}

function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort(
    (a, b) =>
      a.stateProvince.localeCompare(b.stateProvince) ||
      a.city.localeCompare(b.city) ||
      a.name.localeCompare(b.name),
  );
}

async function main(): Promise<void> {
  const source = selectedSource();
  const startedAt = Date.now();
  console.log(`Harvesting machines via "${source}" source…`);

  const result = await SOURCES[source]();
  const machines = sortMachines(result.machines);

  const byState = new Map<string, number>();
  for (const m of machines) byState.set(m.stateProvince, (byState.get(m.stateProvince) ?? 0) + 1);

  const output = {
    generatedAt: new Date().toISOString(),
    source: result.source,
    machineCount: machines.length,
    requestCount: result.requestCount,
    failedTiles: result.failedTiles,
    machines,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(output, null, 2));

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n✓ Harvested ${machines.length} machines in ${result.requestCount} request(s) ` +
      `(${result.failedTiles} failed) in ${secs}s`,
  );
  console.log(`  source: ${result.source}`);
  console.log(`  → ${OUT_PATH}`);
  console.log(`  ${byState.size} states/provinces:`);
  for (const [st, n] of [...byState.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${(st || '??').padEnd(4)} ${n}`);
  }
}

main().catch((err) => {
  console.error('Harvest failed:', err);
  process.exit(1);
});
