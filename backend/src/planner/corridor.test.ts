import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Machine } from '../types';
import { MachineStore } from '../catalog/machineStore';
import { HaversineRoutingProvider } from '../routing/haversineProvider';
import { planCorridorRoute } from './corridor';
import type { PlanRequest } from './types';

const machine = (id: string, lat: number, lng: number): Machine => ({
  id,
  name: id,
  retailer: 'TestMart',
  street: '1 Test St',
  city: 'Testville',
  stateProvince: 'TS',
  zipPostalCode: '00000',
  country: 'US',
  lat,
  lng,
});

// Route runs west→east along latitude 40 from lng -100 to -99 (~85 km).
//   A  on the line              → ~0 m off, adds ~0 m
//   B  0.02° north, mid-corridor → ~2.2 km off, qualifies
//   C  0.1° north                → ~11 km off, outside the 3 km corridor
//   D  a full degree north       → way outside
const fixture = () =>
  MachineStore.fromMachines([
    machine('A', 40.0, -99.5),
    machine('B', 40.02, -99.7),
    machine('C', 40.1, -99.3),
    machine('D', 41.0, -99.5),
  ]);

const baseReq: PlanRequest = {
  origin: { lat: 40, lng: -100 },
  destination: { lat: 40, lng: -99 },
};

const provider = new HaversineRoutingProvider();

test('plan selects only in-corridor machines, in travel order', async () => {
  const res = await planCorridorRoute(provider, fixture(), baseReq);

  assert.equal(res.candidateCount, 2, 'only A and B are within 3 km');
  assert.equal(res.stops.length, 2);
  assert.deepEqual(
    res.stops.map((s) => s.id),
    ['B', 'A'],
    'heading east, B (-99.7) comes before A (-99.5)',
  );
  for (const s of res.stops) assert.ok(s.offRouteMeters <= 3000);
  assert.ok(res.planned.addedDistanceMeters >= 0);
  assert.equal(res.routing.provider, 'haversine-stub');
  assert.equal(res.routing.isRoadRouting, false);
});

test('maxStops caps the number of inserted stops to the cheapest detour', async () => {
  const res = await planCorridorRoute(provider, fixture(), { ...baseReq, maxStops: 1 });
  assert.equal(res.stops.length, 1);
  assert.equal(res.stops[0].id, 'A', 'A is on the line, so its detour is ~0');
});

test('a tight corridor excludes the off-route machine', async () => {
  const res = await planCorridorRoute(provider, fixture(), {
    ...baseReq,
    corridorMeters: 500,
  });
  assert.equal(res.candidateCount, 1);
  assert.deepEqual(
    res.stops.map((s) => s.id),
    ['A'],
  );
});

test('no candidates yields a stopless plan equal to the base route', async () => {
  const store = MachineStore.fromMachines([machine('D', 41.0, -99.5)]);
  const res = await planCorridorRoute(provider, store, baseReq);
  assert.equal(res.candidateCount, 0);
  assert.equal(res.stops.length, 0);
  assert.equal(res.planned.addedDistanceMeters, 0);
  assert.equal(res.planned.distanceMeters, res.base.distanceMeters);
});

test('a time budget with no explicit corridor derives a tight corridor', async () => {
  const res = await planCorridorRoute(provider, fixture(), {
    ...baseReq,
    maxAddedDurationSeconds: 1,
  });
  assert.equal(res.candidateCount, 1, 'derived corridor (min 500 m) admits only the on-route machine');
  assert.deepEqual(
    res.stops.map((s) => s.id),
    ['A'],
  );
  assert.equal(res.budget.corridorMeters, 500, 'clamped to the minimum corridor');
  assert.equal(res.budget.maxAddedDurationSeconds, 1);
  assert.ok(res.budget.estimatedAddedDurationSeconds <= 1);
});

test('a time budget caps inserted stops to the added-minutes allowance', async () => {
  // Hold the corridor fixed so both machines qualify, and let the budget decide.
  const ample = await planCorridorRoute(provider, fixture(), {
    ...baseReq,
    corridorMeters: 3000,
    maxAddedDurationSeconds: 600,
  });
  assert.equal(ample.stops.length, 2, 'a generous budget admits both stops');
  assert.ok(ample.budget.estimatedAddedDurationSeconds <= 600);

  const tight = await planCorridorRoute(provider, fixture(), {
    ...baseReq,
    corridorMeters: 3000,
    maxAddedDurationSeconds: 1,
  });
  assert.equal(tight.candidateCount, 2, 'both machines still qualify for the fixed corridor');
  assert.deepEqual(
    tight.stops.map((s) => s.id),
    ['A'],
    'only the ~free on-route stop fits a 1s budget; the off-route detour is dropped',
  );
  assert.ok(tight.budget.estimatedAddedDurationSeconds <= 1);
});

test('omitting the time budget keeps the legacy distance-based behavior', async () => {
  const res = await planCorridorRoute(provider, fixture(), baseReq);
  assert.equal(res.budget.maxAddedDurationSeconds, null);
  assert.equal(res.budget.corridorMeters, 3000, 'falls back to the default corridor');
  assert.equal(res.stops.length, 2);
});

test('store.near returns machines within the radius, nearest first', () => {
  const hits = fixture().near({ lat: 40, lng: -99.5 }, 20_000);
  assert.deepEqual(
    hits.map((h) => h.machine.id),
    ['A', 'B'],
    'A is at the query point, B ~17 km away; C/D are farther out',
  );
});
