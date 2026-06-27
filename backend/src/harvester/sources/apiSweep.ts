import type { ApiMachine, Bbox, Machine, SweepResult } from '../../types';
import { bboxSpanDeg, PAGE_CAP, SEED_REGIONS, splitBbox } from '../grid';
import { fetchMachines } from '../vendingClient';

const CONCURRENCY = Number(process.env.HARVEST_CONCURRENCY ?? 2);
const MIN_SPAN_DEG = Number(process.env.HARVEST_MIN_SPAN ?? 0.02); // ~2km floor
const MAX_DEPTH = Number(process.env.HARVEST_MAX_DEPTH ?? 16);
const REQUEST_DELAY_MS = Number(process.env.HARVEST_REQUEST_DELAY_MS ?? 300);
const SOURCE_URL = 'https://api.vending.prod.pokemon.com/v1/machines';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Task {
  bbox: Bbox;
  depth: number;
  region: string;
}

function normalize(m: ApiMachine): Machine {
  return {
    id: m.id,
    name: m.name,
    retailer: m.retailer,
    street: m.street,
    city: m.city,
    stateProvince: m.stateProvince,
    zipPostalCode: m.zipPostalCode,
    country: m.country,
    lat: m.lat,
    lng: m.lng,
  };
}

/**
 * Adaptive quadtree sweep of the official locator API. Because the API caps
 * each response at PAGE_CAP and sorts by distance from the box center, a
 * saturated box is subdivided into four quadrants and re-queried until every
 * leaf returns fewer than PAGE_CAP (i.e. all of its machines), guaranteeing
 * completeness without blanketing empty regions in tiny tiles.
 *
 * Note: the official endpoint is behind an Imperva/Incapsula WAF that
 * rate-limits sustained automated traffic. Prefer the bulk source for routine
 * refreshes; this path exists as a canonical fallback / verification source and
 * runs slowly on purpose.
 */
export async function harvestOfficialApi(): Promise<SweepResult> {
  const found = new Map<string, Machine>();
  const queue: Task[] = SEED_REGIONS.map((r) => ({ bbox: r.bbox, depth: 0, region: r.name }));
  let requests = 0;
  let failures = 0;
  let active = 0;
  let processed = 0;

  async function processTile(task: Task): Promise<void> {
    if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS + Math.random() * REQUEST_DELAY_MS);
    let machines: ApiMachine[];
    try {
      machines = await fetchMachines(task.bbox);
      requests++;
    } catch (err) {
      failures++;
      console.warn(`  ! tile failed (${task.region} d${task.depth}): ${(err as Error).message}`);
      return;
    }

    const saturated = machines.length >= PAGE_CAP;
    const canSplit = task.depth < MAX_DEPTH && bboxSpanDeg(task.bbox) > MIN_SPAN_DEG;
    if (saturated && canSplit) {
      for (const child of splitBbox(task.bbox)) {
        queue.push({ bbox: child, depth: task.depth + 1, region: task.region });
      }
    } else {
      for (const m of machines) found.set(m.id, normalize(m));
    }

    processed++;
    if (processed % 50 === 0) {
      console.log(`  …${requests} reqs · ${found.size} machines · queue ${queue.length}`);
    }
  }

  await new Promise<void>((resolveAll, rejectAll) => {
    const pump = () => {
      if (queue.length === 0 && active === 0) {
        resolveAll();
        return;
      }
      while (active < CONCURRENCY && queue.length > 0) {
        const task = queue.shift()!;
        active++;
        processTile(task)
          .then(() => {
            active--;
            pump();
          })
          .catch(rejectAll);
      }
    };
    pump();
  });

  return {
    machines: [...found.values()],
    requestCount: requests,
    failedTiles: failures,
    source: SOURCE_URL,
  };
}
