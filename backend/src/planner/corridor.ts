import type { Machine } from '../types';
import type { MachineStore, MachineHit } from '../catalog/machineStore';
import { machineLngLat } from '../catalog/machineStore';
import { haversineMeters, type LngLat } from '../geo/geo';
import type { RoutingProvider } from '../routing/types';
import {
  machineAddress,
  type CandidateMachine,
  type PlanRequest,
  type PlanResult,
  type PlannedStop,
} from './types';

const DEFAULTS = {
  maxStops: 5,
  corridorMeters: 3000,
  addedPerStopMultiplier: 4,
  /** Cap on candidates returned to the UI, to bound payload size. */
  maxCandidatesReturned: 250,
  /** Bounds for a corridor derived from a time budget. */
  minBudgetCorridorMeters: 500,
  maxBudgetCorridorMeters: 50000,
  /** Used only if the base route has zero straight-line length (origin == dest). */
  fallbackSecondsPerStraightMeter: 0.08,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

interface Insertion {
  hit: MachineHit;
  /** Index in `ordered` after which the machine is inserted. */
  position: number;
  addedMeters: number;
}

interface ChosenStop {
  machine: Machine;
  offRouteMeters: number;
  addedMeters: number;
}

/** Extra distance from routing `a → m → b` instead of `a → b`. */
function detourMeters(a: LngLat, m: LngLat, b: LngLat): number {
  return haversineMeters(a, m) + haversineMeters(m, b) - haversineMeters(a, b);
}

/** Find the cheapest place to insert a machine into the current ordered path. */
function bestInsertion(ordered: LngLat[], hit: MachineHit): Insertion {
  const m = machineLngLat(hit.machine);
  let best: Insertion = { hit, position: 0, addedMeters: Infinity };
  for (let i = 0; i < ordered.length - 1; i++) {
    const added = detourMeters(ordered[i], m, ordered[i + 1]);
    if (added < best.addedMeters) best = { hit, position: i, addedMeters: added };
  }
  return best;
}

/**
 * Plan a route from origin to destination that passes vending machines within a
 * detour corridor.
 *
 * Algorithm:
 *  1. Get the base origin→destination route from the routing provider.
 *  2. Select machines whose distance to that route is within `corridorMeters`.
 *  3. Greedily insert the cheapest-to-reach candidate (minimal added distance)
 *     one at a time, re-evaluating insertion points as the path grows, until we
 *     hit `maxStops` or run out of candidates under the per-stop budget.
 *  4. Re-route through the chosen waypoints for real distance/time and geometry.
 */
export async function planCorridorRoute(
  provider: RoutingProvider,
  store: MachineStore,
  req: PlanRequest,
): Promise<PlanResult> {
  const maxStops = req.maxStops ?? DEFAULTS.maxStops;

  const origin: LngLat = [req.origin.lng, req.origin.lat];
  const destination: LngLat = [req.destination.lng, req.destination.lat];

  const base = await provider.route([origin, destination]);

  // Map a *straight-line* detour distance directly to realistic added *road*
  // seconds: dividing the base's real road duration by the base's straight-line
  // length bakes in this trip's road winding and average speed, so applying it
  // to a haversine detour yields an honest time estimate.
  const straightMeters = haversineMeters(origin, destination);
  const secondsPerStraightMeter =
    straightMeters > 0
      ? base.durationSeconds / straightMeters
      : DEFAULTS.fallbackSecondsPerStraightMeter;

  const budgetSeconds =
    typeof req.maxAddedDurationSeconds === 'number' && req.maxAddedDurationSeconds > 0
      ? req.maxAddedDurationSeconds
      : null;

  // The qualifying corridor: an explicit value wins; otherwise derive it from
  // the time budget (a machine `d` off-route adds ~`2d` straight meters, so it
  // can only ever fit when `d ≤ budget / (2 · secondsPerStraightMeter)`); else
  // fall back to the static default.
  let corridorMeters: number;
  if (typeof req.corridorMeters === 'number') {
    corridorMeters = req.corridorMeters;
  } else if (budgetSeconds != null) {
    corridorMeters = clamp(
      budgetSeconds / (2 * secondsPerStraightMeter),
      DEFAULTS.minBudgetCorridorMeters,
      DEFAULTS.maxBudgetCorridorMeters,
    );
  } else {
    corridorMeters = DEFAULTS.corridorMeters;
  }

  // Per-stop distance cap: when budgeting by time, a single stop may use the
  // whole budget; the cumulative check below enforces the real limit.
  const maxAddedPerStop =
    req.maxAddedMetersPerStop ??
    (budgetSeconds != null
      ? budgetSeconds / secondsPerStraightMeter
      : corridorMeters * DEFAULTS.addedPerStopMultiplier);

  let candidates = store.withinCorridor(base.coordinates, corridorMeters);
  if (req.retailers && req.retailers.length > 0) {
    const wanted = new Set(req.retailers);
    candidates = candidates.filter((h) => wanted.has(h.machine.retailer));
  }
  const candidateCount = candidates.length;

  const candidateList: CandidateMachine[] = candidates
    .slice(0, DEFAULTS.maxCandidatesReturned)
    .map((h) => ({
      id: h.machine.id,
      name: h.machine.name,
      retailer: h.machine.retailer,
      address: machineAddress(h.machine),
      lat: h.machine.lat,
      lng: h.machine.lng,
      offRouteMeters: Math.round(h.distanceMeters),
    }));

  // Parallel arrays: `ordered` drives geometry/routing; `nodeStops` records which
  // ordered positions are machine stops (endpoints are null), so we can read the
  // final stop order directly instead of matching coordinates back by value.
  const ordered: LngLat[] = [origin, destination];
  const nodeStops: Array<ChosenStop | null> = [null, null];
  const remaining = new Map<string, MachineHit>(candidates.map((h) => [h.machine.id, h]));

  let stopCount = 0;
  let cumulativeAddedMeters = 0;
  while (stopCount < maxStops && remaining.size > 0) {
    let pick: Insertion | null = null;
    for (const hit of remaining.values()) {
      const ins = bestInsertion(ordered, hit);
      if (!pick || ins.addedMeters < pick.addedMeters) pick = ins;
    }
    if (!pick || pick.addedMeters > maxAddedPerStop) break;
    // We always take the globally cheapest remaining insertion, so once it would
    // bust the time budget, no other candidate can fit either — stop here.
    if (
      budgetSeconds != null &&
      (cumulativeAddedMeters + pick.addedMeters) * secondsPerStraightMeter > budgetSeconds
    ) {
      break;
    }

    ordered.splice(pick.position + 1, 0, machineLngLat(pick.hit.machine));
    nodeStops.splice(pick.position + 1, 0, {
      machine: pick.hit.machine,
      offRouteMeters: pick.hit.distanceMeters,
      addedMeters: pick.addedMeters,
    });
    remaining.delete(pick.hit.machine.id);
    cumulativeAddedMeters += pick.addedMeters;
    stopCount++;
  }

  const estimatedAddedDurationSeconds = Math.round(cumulativeAddedMeters * secondsPerStraightMeter);

  const planned = stopCount > 0 ? await provider.route(ordered) : base;

  const stops: PlannedStop[] = nodeStops
    .filter((n): n is ChosenStop => n !== null)
    .map((c, idx) => ({
      id: c.machine.id,
      name: c.machine.name,
      retailer: c.machine.retailer,
      address: machineAddress(c.machine),
      lat: c.machine.lat,
      lng: c.machine.lng,
      order: idx + 1,
      offRouteMeters: Math.round(c.offRouteMeters),
      addedDetourMeters: Math.round(c.addedMeters),
    }));

  return {
    origin: req.origin,
    destination: req.destination,
    base: {
      distanceMeters: Math.round(base.distanceMeters),
      durationSeconds: Math.round(base.durationSeconds),
    },
    planned: {
      distanceMeters: Math.round(planned.distanceMeters),
      durationSeconds: Math.round(planned.durationSeconds),
      addedDistanceMeters: Math.round(planned.distanceMeters - base.distanceMeters),
      addedDurationSeconds: Math.round(planned.durationSeconds - base.durationSeconds),
    },
    stops,
    candidateCount,
    candidates: candidateList,
    routeGeometry: planned.coordinates,
    routing: { provider: provider.name, isRoadRouting: provider.isRoadRouting },
    budget: {
      maxStops,
      corridorMeters: Math.round(corridorMeters),
      maxAddedDurationSeconds: budgetSeconds,
      estimatedAddedDurationSeconds,
    },
  };
}
