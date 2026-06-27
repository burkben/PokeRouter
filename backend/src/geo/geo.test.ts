import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMeters,
  pointToPolylineMeters,
  pointToSegmentMeters,
  polylineLengthMeters,
  type LngLat,
} from './geo';

// One degree of latitude is ~111.2 km everywhere.
test('haversineMeters: one degree of latitude', () => {
  const d = haversineMeters([0, 0], [0, 1]);
  assert.ok(Math.abs(d - 111_195) < 50, `expected ~111195, got ${d}`);
});

test('haversineMeters: identical points are zero', () => {
  assert.equal(haversineMeters([-122.33, 47.6], [-122.33, 47.6]), 0);
});

test('pointToSegmentMeters: perpendicular offset from a horizontal segment', () => {
  // Point sits 0.01° north of the midpoint of a segment along the equator.
  const d = pointToSegmentMeters([0.5, 0.01], [0, 0], [1, 0]);
  assert.ok(Math.abs(d - 1113) < 30, `expected ~1113, got ${d}`);
});

test('pointToSegmentMeters: clamps past the segment end', () => {
  // Point is one degree of longitude beyond the far endpoint.
  const d = pointToSegmentMeters([2, 0], [0, 0], [1, 0]);
  assert.ok(Math.abs(d - 111_320) < 300, `expected ~111320, got ${d}`);
});

test('pointToPolylineMeters: nearest of several segments wins', () => {
  const line: LngLat[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];
  // Closest to the second (vertical) segment, ~0.005° east of it.
  const d = pointToPolylineMeters([1.005, 0.5], line);
  assert.ok(Math.abs(d - 557) < 30, `expected ~557, got ${d}`);
});

test('polylineLengthMeters: sums leg lengths', () => {
  const d = polylineLengthMeters([
    [0, 0],
    [0, 1],
    [0, 2],
  ]);
  assert.ok(Math.abs(d - 222_390) < 100, `expected ~222390, got ${d}`);
});
