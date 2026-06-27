import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGpx } from './gpx';

const origin = { lat: 47.6062, lng: -122.3321, name: 'Home' };
const destination = { lat: 45.5152, lng: -122.6784, name: 'Office' };
const stops = [{ lat: 47.25, lng: -122.44, name: "Pikachu's GameStop" }];

test('buildGpx emits a valid GPX 1.1 document with named waypoints', () => {
  const gpx = buildGpx({ origin, destination, stops });
  assert.match(gpx, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(gpx, /<gpx version="1\.1" creator="PokeRouter"/);
  assert.match(gpx, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
  // Waypoints carry their names and types.
  assert.match(gpx, /<wpt lat="47\.606200" lon="-122\.332100">/);
  assert.match(gpx, /<name>Home<\/name>\s*<type>origin<\/type>/);
  assert.match(gpx, /<type>stop<\/type>/);
  assert.match(gpx, /<type>destination<\/type>/);
  assert.ok(gpx.trim().endsWith('</gpx>'));
});

test('buildGpx escapes XML-special characters in names', () => {
  const gpx = buildGpx({
    origin: { lat: 1, lng: 2, name: 'A & B <test>' },
    destination,
  });
  assert.match(gpx, /A &amp; B &lt;test&gt;/);
  assert.doesNotMatch(gpx, /A & B <test>/);
});

test('buildGpx includes a <trk> only when track geometry is provided', () => {
  const without = buildGpx({ origin, destination });
  assert.doesNotMatch(without, /<trk>/);

  const withTrack = buildGpx({
    origin,
    destination,
    track: [
      [-122.3321, 47.6062],
      [-122.6784, 45.5152],
    ],
  });
  assert.match(withTrack, /<trk>/);
  assert.match(withTrack, /<trkpt lat="47\.606200" lon="-122\.332100" \/>/);
  assert.match(withTrack, /<trkpt lat="45\.515200" lon="-122\.678400" \/>/);
});

test('buildGpx orders route points origin -> stops -> destination', () => {
  const gpx = buildGpx({ origin, destination, stops });
  const rteptOrder = [...gpx.matchAll(/<rtept[^>]*>\s*<name>([^<]+)<\/name>/g)].map((m) => m[1]);
  assert.deepEqual(rteptOrder, ['Home', 'Pikachu&apos;s GameStop', 'Office']);
});
