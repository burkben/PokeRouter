import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LngLat } from '../geo/geo';
import type { RoutingProvider, RouteResult } from './types';
import { FallbackRoutingProvider } from './fallbackProvider';

const result = (tag: number): RouteResult => ({
  coordinates: [
    [0, 0],
    [1, 1],
  ],
  distanceMeters: tag,
  durationSeconds: tag,
});

class StubProvider implements RoutingProvider {
  calls = 0;
  constructor(
    readonly name: string,
    readonly isRoadRouting: boolean,
    private readonly behavior: 'ok' | 'throw',
    private readonly tag = 1,
  ) {}
  async route(_waypoints: LngLat[]): Promise<RouteResult> {
    this.calls++;
    if (this.behavior === 'throw') throw new Error(`${this.name} boom`);
    return result(this.tag);
  }
}

const waypoints: LngLat[] = [
  [0, 0],
  [1, 1],
];

test('advertises the primary provider name and road-routing flag', () => {
  const primary = new StubProvider('openrouteservice', true, 'ok');
  const fallback = new StubProvider('haversine-stub', false, 'ok');
  const provider = new FallbackRoutingProvider(primary, fallback);
  assert.equal(provider.name, 'openrouteservice');
  assert.equal(provider.isRoadRouting, true);
});

test('uses the primary result when the primary succeeds', async () => {
  const primary = new StubProvider('openrouteservice', true, 'ok', 100);
  const fallback = new StubProvider('haversine-stub', false, 'ok', 200);
  const provider = new FallbackRoutingProvider(primary, fallback);

  const res = await provider.route(waypoints);

  assert.equal(res.distanceMeters, 100);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0);
});

test('falls back to the secondary provider when the primary throws', async () => {
  const primary = new StubProvider('openrouteservice', true, 'throw');
  const fallback = new StubProvider('haversine-stub', false, 'ok', 200);
  const provider = new FallbackRoutingProvider(primary, fallback);

  const res = await provider.route(waypoints);

  assert.equal(res.distanceMeters, 200);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
});
