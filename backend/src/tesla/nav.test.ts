import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navUrlFor, resolveTarget, resolveWaypoints } from './nav';

const STOPS = [
  { lat: 47.5, lng: -122.4, name: 'A' },
  { lat: 47.3, lng: -122.5, name: 'B' },
];
const DEST = { lat: 45.5, lng: -122.6, name: 'Home' };

test('resolveWaypoints orders stops then destination', () => {
  const wps = resolveWaypoints({ destination: DEST, stops: STOPS });
  assert.deepEqual(
    wps.map((w) => w.name),
    ['A', 'B', 'Home'],
  );
});

test('resolveTarget defaults to the first stop, not the final destination', () => {
  const leg = resolveTarget({ destination: DEST, stops: STOPS });
  assert.equal(leg.index, 0);
  assert.equal(leg.point.name, 'A');
  assert.equal(leg.count, 3);
  assert.equal(leg.isFinal, false);
});

test('resolveTarget honors an explicit index', () => {
  const leg = resolveTarget({ destination: DEST, stops: STOPS, targetIndex: 1 });
  assert.equal(leg.point.name, 'B');
  assert.equal(leg.isFinal, false);
});

test('resolveTarget marks the last waypoint as final', () => {
  const leg = resolveTarget({ destination: DEST, stops: STOPS, targetIndex: 2 });
  assert.equal(leg.point.name, 'Home');
  assert.equal(leg.isFinal, true);
});

test('resolveTarget clamps an out-of-range index into the itinerary', () => {
  const leg = resolveTarget({ destination: DEST, stops: STOPS, targetIndex: 99 });
  assert.equal(leg.index, 2);
  assert.equal(leg.point.name, 'Home');
  assert.equal(leg.isFinal, true);
});

test('resolveTarget with no stops resolves to the destination', () => {
  const leg = resolveTarget({ destination: DEST });
  assert.equal(leg.index, 0);
  assert.equal(leg.count, 1);
  assert.equal(leg.isFinal, true);
  assert.equal(leg.point.name, 'Home');
});

test('navUrlFor builds a single-destination search URL for the chosen leg', () => {
  const url = new URL(navUrlFor({ destination: DEST, stops: STOPS, targetIndex: 1 }));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/search/');
  assert.equal(url.searchParams.get('query'), '47.3,-122.5');
});
