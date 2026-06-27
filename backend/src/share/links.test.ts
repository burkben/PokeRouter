import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appleMapsLink, geoUri, googleMapsLink, wazeLink } from './links';

const origin = { lat: 47.6062, lng: -122.3321 };
const stops = [
  { lat: 47.5, lng: -122.4 },
  { lat: 47.2, lng: -122.6 },
];
const destination = { lat: 45.5152, lng: -122.6784 };

test('googleMapsLink encodes origin, destination, and pipe-joined waypoints', () => {
  const url = googleMapsLink(origin, stops, destination);
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(parsed.searchParams.get('origin'), '47.6062,-122.3321');
  assert.equal(parsed.searchParams.get('destination'), '45.5152,-122.6784');
  assert.equal(parsed.searchParams.get('travelmode'), 'driving');
  assert.equal(parsed.searchParams.get('waypoints'), '47.5,-122.4|47.2,-122.6');
});

test('googleMapsLink omits waypoints when there are no stops', () => {
  const url = googleMapsLink(origin, [], destination);
  assert.equal(new URL(url).searchParams.has('waypoints'), false);
});

test('appleMapsLink chains stops with +to: separators ending at the destination', () => {
  const url = appleMapsLink(origin, stops, destination);
  assert.match(url, /^https:\/\/maps\.apple\.com\/\?/);
  const daddr = new URL(url).searchParams.get('daddr');
  assert.equal(daddr, '47.5,-122.4+to:47.2,-122.6+to:45.5152,-122.6784');
  assert.equal(new URL(url).searchParams.get('saddr'), '47.6062,-122.3321');
});

test('wazeLink and geoUri target the destination only', () => {
  assert.equal(wazeLink(destination), 'https://waze.com/ul?ll=45.5152,-122.6784&navigate=yes');
  assert.equal(geoUri(destination), 'geo:45.5152,-122.6784');
});
